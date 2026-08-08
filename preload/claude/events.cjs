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
const DEFAULT_RECOVERY_POLL_MS = 1000

/** Raw `hook_event_name` → companion event class. */
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
  // App project metadata comes from the Code inventory, never from hook input.
  return {
    sessionId,
    event,
    at: at || 0,
    pid: safeInteger(value.p),
    reason: value.r === 'ask-user-question'
      ? 'ask-user-question'
      : value.r === 'idle-prompt'
        ? 'idle-prompt'
        : ''
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

function emptyHookState() {
  return {
    phase: 'unknown',
    lastEvent: '',
    lastEventAt: 0,
    turnStartedAt: 0,
    turnOpen: false,
    lastActivityAt: 0,
    waitingApprovalAt: 0,
    waitingInputAt: 0,
    lastStopAt: 0,
    lastStopFailureAt: 0,
    lastSessionEndAt: 0,
    pid: 0
  }
}

/**
 * Reduces one ordered Hook event without inventing a parent Turn.
 *
 * `UserPromptSubmit` is the only event that opens a Turn. Tool events may move
 * an already-open parent Turn back to running, while subagent events only move
 * the activity waterline. Once Stop/StopFailure/SessionEnd closes the Turn,
 * tail events cannot revive it; only the next prompt can.
 */
function reduceQueueEntry(previous, entry) {
  const known = previous && typeof previous === 'object' ? previous : emptyHookState()
  // The file order resolves equal timestamps. A genuinely older record is a
  // replay/out-of-order append and cannot roll the phase backwards.
  if (known.lastEventAt && entry.at && entry.at < known.lastEventAt) return known
  const at = entry.at || known.lastEventAt || 0
  const next = {
    ...known,
    turnOpen: known.turnOpen === true,
    lastEvent: entry.event,
    lastEventAt: at,
    pid: entry.pid || known.pid || 0
  }

  if (entry.event === 'prompt-submit') {
    next.turnStartedAt = at
    next.turnOpen = true
    next.lastActivityAt = at
    next.waitingApprovalAt = 0
    next.waitingInputAt = 0
    next.phase = 'running'
    return next
  }
  if (entry.event === 'stop') {
    next.lastStopAt = at
    next.turnOpen = false
    next.phase = 'completed'
    return next
  }
  if (entry.event === 'stop-failure') {
    next.lastStopFailureAt = at
    next.turnOpen = false
    next.phase = 'stopped'
    return next
  }
  if (entry.event === 'session-end') {
    next.lastSessionEndAt = at
    next.turnOpen = false
    next.phase = next.lastStopAt > 0 && next.lastStopAt >= next.turnStartedAt
      ? 'completed'
      : 'stopped'
    return next
  }
  if (entry.event === 'subagent-start' || entry.event === 'subagent-stop') {
    next.lastActivityAt = at
    return next
  }
  if (entry.event === 'pre-tool' && entry.reason === 'ask-user-question') {
    if (next.turnOpen) {
      next.waitingInputAt = at
      next.phase = 'waiting-input'
    }
    return next
  }
  if (entry.event === 'permission-request') {
    if (next.turnOpen) {
      next.waitingApprovalAt = at
      next.phase = 'waiting-approval'
    }
    return next
  }
  if (entry.event === 'pre-tool' || entry.event === 'post-tool') {
    next.lastActivityAt = at
    if (next.turnOpen) next.phase = 'running'
    return next
  }
  // SessionStart and Notification are wake-up/lifecycle hints only.
  return next
}

/** Folds a batch into independent monotonic waterlines plus parent phase. */
function foldQueueEntries(entries, previous) {
  const state = new Map(previous instanceof Map ? previous : [])
  for (const entry of Array.isArray(entries) ? entries : []) {
    const known = state.get(entry.sessionId) || emptyHookState()
    state.set(entry.sessionId, reduceQueueEntry(known, entry))
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
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  let offset = 0
  let sessionState = new Map()
  let watcher = null
  let watchTimer = null
  let recoveryTimer = null
  let lastQueueSignature = ''

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
    if (recoveryTimer) {
      clearIntervalFn(recoveryTimer)
      recoveryTimer = null
    }
  }

  function queueSignature() {
    try {
      const stat = fs.statSync(queuePath)
      return `${Number(stat.size) || 0}:${Math.round(Number(stat.mtimeMs) || 0)}`
    } catch {
      return 'missing'
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
    const recoveryPollMs = Number.isFinite(settings.recoveryPollMs)
      ? Math.max(100, settings.recoveryPollMs)
      : DEFAULT_RECOVERY_POLL_MS
    stopWatching()
    try { fs.mkdirSync(directory, { recursive: true }) } catch { /* the watch below reports it */ }
    let disposed = false
    lastQueueSignature = queueSignature()
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
    }
    // `fs.watch` is only the fast path. A bounded signature poll catches a
    // dropped notification without publishing when nothing changed.
    recoveryTimer = setIntervalFn(() => {
      const next = queueSignature()
      if (next === lastQueueSignature) return
      lastQueueSignature = next
      onChange('change', QUEUE_FILE_NAME)
    }, recoveryPollMs)
    if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
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
  DEFAULT_RECOVERY_POLL_MS,
  HOOK_EVENT_CLASSES,
  normalizeEventClass,
  normalizeQueueEntry,
  parseQueueText,
  reduceQueueEntry,
  foldQueueEntries,
  createEventQueue
}
