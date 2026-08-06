'use strict'

/**
 * Claude Code hook event queue.
 *
 * The installed hook script appends one compact JSON line per event to a queue
 * file inside EyPc's own data directory — never inside `~/.claude`. This module
 * owns the queue format, the bounded reader and the rotation policy.
 *
 * A queue line carries session identity, the event class and a timestamp. It
 * never carries prompt text, tool arguments, file paths from tool input, or the
 * assistant's reply.
 */

const QUEUE_FILE_NAME = 'eypc-claude-events.jsonl'
const MAX_QUEUE_BYTES = 512 * 1024
const MAX_EVENTS_PER_READ = 2000
/**
 * How long to wait after the first append before notifying.
 *
 * One turn produces a burst — PreToolUse, PostToolUse, Stop and so on land
 * within milliseconds of each other — and the consumer only needs to know that
 * something changed, not how many times. Matches the Codex event lane's window
 * so both providers feel the same.
 */
const DEFAULT_COALESCE_MS = 50

/** Raw `hook_event_name` → companion event class. Mirrors src/domain/claude.ts. */
const HOOK_EVENT_CLASSES = Object.freeze({
  SessionStart: 'session-start',
  UserPromptSubmit: 'prompt-submit',
  PreToolUse: 'pre-tool',
  PostToolUse: 'post-tool',
  PostToolUseFailure: 'post-tool',
  PostToolBatch: 'post-tool',
  PermissionRequest: 'permission-request',
  Notification: 'notification',
  Stop: 'stop',
  StopFailure: 'stop-failure',
  SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-stop',
  SessionEnd: 'session-end'
})

function normalizeEventClass(value) {
  if (typeof value !== 'string' || !value) return ''
  if (Object.prototype.hasOwnProperty.call(HOOK_EVENT_CLASSES, value)) return HOOK_EVENT_CLASSES[value]
  const known = Object.values(HOOK_EVENT_CLASSES)
  return known.includes(value) ? value : ''
}

function safeInteger(value) {
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

/**
 * Validates and reduces one raw queue line. Any field the companion does not
 * explicitly need is dropped here, so a future hook payload change cannot leak
 * content into the renderer.
 */
function normalizeQueueEntry(value) {
  if (!value || typeof value !== 'object') return null
  const sessionId = typeof value.s === 'string' ? value.s.trim() : ''
  const event = normalizeEventClass(value.e)
  if (!sessionId || !event) return null
  const at = safeInteger(value.t)
  // Deliberately narrow: identity, event class, timing and the owning process.
  // Working directory and parent session come from the transcript, which cannot
  // be confused with a tool's own arguments.
  return {
    sessionId,
    event,
    at: at || 0,
    pid: safeInteger(value.p)
  }
}

function parseQueueText(text) {
  const lines = String(text || '').split('\n')
  const entries = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed
    try { parsed = JSON.parse(trimmed) } catch { continue }
    const entry = normalizeQueueEntry(parsed)
    if (entry) entries.push(entry)
  }
  return entries.length > MAX_EVENTS_PER_READ ? entries.slice(-MAX_EVENTS_PER_READ) : entries
}

/**
 * Folds a batch of queue entries into per-session latest state. Later entries
 * win, which is what makes the queue order-preserving but replay-safe: reading
 * the same batch twice produces the same state.
 */
function foldQueueEntries(entries, previous) {
  const state = new Map(previous instanceof Map ? previous : [])
  for (const entry of Array.isArray(entries) ? entries : []) {
    const known = state.get(entry.sessionId) || {}
    if (known.hookEventAt && entry.at && entry.at < known.hookEventAt) continue
    state.set(entry.sessionId, {
      hookEvent: entry.event,
      hookEventAt: entry.at || known.hookEventAt || 0,
      pid: entry.pid || known.pid || 0
    })
  }
  return state
}

function createEventQueue(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const directory = dependencies.directory
  const maxBytes = Number.isFinite(dependencies.maxBytes) ? dependencies.maxBytes : MAX_QUEUE_BYTES
  const queuePath = path.join(directory, QUEUE_FILE_NAME)
  const setTimer = dependencies.setTimeout || setTimeout
  const clearTimer = dependencies.clearTimeout || clearTimeout
  let offset = 0
  let sessionState = new Map()
  let watcher = null
  let watchTimer = null

  function reset() {
    offset = 0
    sessionState = new Map()
  }

  function stopWatching() {
    if (watchTimer) {
      clearTimer(watchTimer)
      watchTimer = null
    }
    if (watcher) {
      try { watcher.close() } catch { /* already gone */ }
      watcher = null
    }
  }

  /**
   * Calls `listener` once per burst of appends, so the consumer can react to a
   * hook event immediately instead of waiting for its next poll.
   *
   * Three deliberate choices:
   *
   *  - The *directory* is watched, not the file. The queue does not exist until
   *    the user registers the hooks, and rotation truncates it; watching a path
   *    that may not exist yet or may be replaced underneath us is how watchers
   *    silently stop working.
   *  - `persistent: false`, so a watcher can never be the reason a process
   *    refuses to exit.
   *  - This is an accelerator, never a replacement for the caller's interval.
   *    `fs.watch` misses events on some filesystems and network volumes and
   *    reports no error when it does, so the poll has to stay.
   */
  function watch(listener, options) {
    const settings = options || {}
    if (typeof listener !== 'function') return () => {}
    const coalesceMs = Number.isFinite(settings.coalesceMs)
      ? Math.max(0, settings.coalesceMs)
      : DEFAULT_COALESCE_MS
    stopWatching()
    try { fs.mkdirSync(directory, { recursive: true }) } catch { /* the watch below reports it */ }
    let disposed = false
    const fire = () => {
      watchTimer = null
      if (disposed) return
      // A throwing consumer must not take the watcher down with it: the next
      // append still has to be delivered.
      try { listener() } catch { /* consumer's problem */ }
    }
    const onChange = (_event, filename) => {
      if (disposed) return
      // Some platforms report a null filename; treat that as "might be ours".
      if (filename && String(filename) !== QUEUE_FILE_NAME) return
      if (watchTimer) return
      watchTimer = setTimer(fire, coalesceMs)
    }
    try {
      watcher = fs.watch(directory, { persistent: false }, onChange)
      if (watcher && typeof watcher.on === 'function') {
        // A watcher error is not fatal — it means this machine falls back to
        // polling, which is exactly the pre-existing behavior.
        watcher.on('error', () => stopWatching())
      }
    } catch {
      watcher = null
      return () => {}
    }
    return () => {
      disposed = true
      stopWatching()
    }
  }

  /** Reads everything appended since the previous call. */
  function drain() {
    let handle = null
    try {
      const stat = fs.statSync(queuePath)
      const size = Number(stat.size) || 0
      if (size < offset) offset = 0 // the queue was rotated underneath us
      if (size === offset) return []
      const length = size - offset
      handle = fs.openSync(queuePath, 'r')
      const buffer = Buffer.alloc(length)
      fs.readSync(handle, buffer, 0, length, offset)
      offset = size
      const entries = parseQueueText(buffer.toString('utf8'))
      sessionState = foldQueueEntries(entries, sessionState)
      return entries
    } catch {
      return []
    } finally {
      if (handle !== null) { try { fs.closeSync(handle) } catch { /* already closed */ } }
    }
  }

  /** Truncates the queue once it grows past the cap. */
  function rotateIfNeeded() {
    try {
      const stat = fs.statSync(queuePath)
      if ((Number(stat.size) || 0) <= maxBytes) return false
      fs.writeFileSync(queuePath, '')
      offset = 0
      return true
    } catch {
      return false
    }
  }

  function ensureQueueFile() {
    try {
      fs.mkdirSync(directory, { recursive: true })
      if (!fs.existsSync(queuePath)) fs.writeFileSync(queuePath, '')
      return true
    } catch {
      return false
    }
  }

  return {
    queuePath,
    ensureQueueFile,
    drain,
    rotateIfNeeded,
    reset,
    watch,
    stopWatching,
    state: () => new Map(sessionState)
  }
}

module.exports = {
  QUEUE_FILE_NAME,
  MAX_QUEUE_BYTES,
  DEFAULT_COALESCE_MS,
  HOOK_EVENT_CLASSES,
  normalizeEventClass,
  normalizeQueueEntry,
  parseQueueText,
  foldQueueEntries,
  createEventQueue
}
