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
// Retained as a public compatibility constant. The first semantic change is
// now drained synchronously from the native file callback; semantic equality,
// rather than a throttleable timer, collapses duplicate tail events.
const { WATCHER_RECOVERY_INTERVAL_MS, DEFAULT_COALESCE_MS } = require('../timing-policy.cjs')
const DEFAULT_RECOVERY_POLL_MS = WATCHER_RECOVERY_INTERVAL_MS

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
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  const watchFileFn = dependencies.watchFile
    || (typeof fs.watchFile === 'function' ? fs.watchFile.bind(fs) : null)
  const unwatchFileFn = dependencies.unwatchFile
    || (typeof fs.unwatchFile === 'function' ? fs.unwatchFile.bind(fs) : null)
  let offset = 0
  let sessionState = new Map()
  let watcher = null
  let recoveryFileWatch = false
  let recoveryFileListener = null
  let recoveryTimer = null
  let lastQueueSignature = ''

  function reset() {
    offset = 0
    sessionState = new Map()
  }

  function stopWatching() {
    if (watcher) {
      try { watcher.close() } catch { /* already gone */ }
      watcher = null
    }
    if (recoveryFileWatch) {
      if (unwatchFileFn) {
        try { unwatchFileFn(queuePath, recoveryFileListener || undefined) } catch { /* already gone */ }
      }
      recoveryFileWatch = false
      recoveryFileListener = null
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
   * Drains and calls `listener` from the first native append callback. Hidden
   * uTools WebContents throttle JavaScript timers, so a semantic transition
   * must never wait behind setTimeout/setInterval. Duplicate or content-free
   * tails are collapsed by comparing the reduced state itself.
   *
   * Three deliberate choices:
   *
   *  - The *directory* is watched, not the file. The queue does not exist until
   *    the user registers the hooks, and rotation truncates it; watching a path
   *    that may not exist yet or may be replaced underneath us is how watchers
   *    silently stop working.
   *  - `persistent: false`, so a watcher can never be the reason a process
   *    refuses to exit.
   *  - `fs.watchFile` supplies the bounded native recovery lane. Its libuv
   *    StatWatcher remains live while the WebContents is background-hidden;
   *    JavaScript `setInterval` exists only as a constrained-runtime fallback.
   */
  function watch(listener, options) {
    const settings = options || {}
    if (typeof listener !== 'function') return () => {}
    const recoveryPollMs = Number.isFinite(settings.recoveryPollMs)
      ? Math.max(100, settings.recoveryPollMs)
      : DEFAULT_RECOVERY_POLL_MS
    stopWatching()
    try { fs.mkdirSync(directory, { recursive: true }) } catch { /* the watch below reports it */ }
    let disposed = false
    lastQueueSignature = queueSignature()
    const stateFingerprint = () => JSON.stringify([...sessionState.entries()])
    const drainAndNotify = () => {
      if (disposed) return
      const before = stateFingerprint()
      drain()
      lastQueueSignature = queueSignature()
      if (stateFingerprint() === before) return
      // A throwing consumer must not take the watcher down with it: the next
      // append still has to be delivered.
      try { listener() } catch { /* consumer's problem */ }
    }
    const onChange = (_event, filename) => {
      if (disposed) return
      // Some platforms report a null filename; treat that as "might be ours".
      if (filename && String(filename) !== QUEUE_FILE_NAME) return
      drainAndNotify()
    }
    try {
      watcher = fs.watch(directory, { persistent: false }, onChange)
      if (watcher && typeof watcher.on === 'function') {
        // Preserve the independent native recovery watcher if the directory
        // accelerator fails.
        watcher.on('error', () => {
          try { watcher?.close() } catch {}
          watcher = null
        })
      }
    } catch {
      watcher = null
    }
    // `fs.watch` is only the fast path. Prefer Node's native StatWatcher for
    // dropped notifications so recovery is not hostage to hidden-page timer
    // throttling. Keep a timer fallback only for runtimes without watchFile.
    if (watchFileFn) {
      try {
        recoveryFileListener = () => {
          const next = queueSignature()
          if (next === lastQueueSignature) return
          drainAndNotify()
        }
        watchFileFn(queuePath, { persistent: false, interval: recoveryPollMs }, recoveryFileListener)
        recoveryFileWatch = true
      } catch {
        recoveryFileWatch = false
        recoveryFileListener = null
      }
    }
    if (!recoveryFileWatch) {
      recoveryTimer = setIntervalFn(() => {
        const next = queueSignature()
        if (next === lastQueueSignature) return
        drainAndNotify()
      }, recoveryPollMs)
      if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
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
      // The native callback may run between the append syscall and its final
      // newline becoming observable. Consume only complete JSONL records and
      // leave a partial tail for the next file event/recovery tick.
      const lastNewline = buffer.lastIndexOf(0x0a)
      if (lastNewline < 0) return []
      offset += lastNewline + 1
      const entries = parseQueueText(buffer.subarray(0, lastNewline + 1).toString('utf8'))
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
