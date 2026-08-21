'use strict'

/**
 * Cursor Agent hook event queue.
 *
 * The installed script appends one compact JSON line per event to a private
 * queue in EyPc's data directory. Join to `composerId` is unverified: the
 * queue key is `conversation_id` / `session_id` when it looks like a UUID.
 */

const QUEUE_FILE_NAME = 'eypc-cursor-events.jsonl'
const MAX_QUEUE_BYTES = 512 * 1024
const MAX_EVENTS_PER_READ = 2000
const { WATCHER_RECOVERY_INTERVAL_MS, DEFAULT_COALESCE_MS } = require('../timing-policy.cjs')
const DEFAULT_RECOVERY_POLL_MS = WATCHER_RECOVERY_INTERVAL_MS

const HOOK_EVENT_CLASSES = Object.freeze({
  sessionStart: 'session-start',
  sessionEnd: 'session-end',
  beforeSubmitPrompt: 'prompt-submit',
  preToolUse: 'pre-tool',
  postToolUse: 'post-tool',
  postToolUseFailure: 'post-tool',
  subagentStart: 'subagent-start',
  subagentStop: 'subagent-stop',
  stop: 'stop',
  afterAgentResponse: 'post-tool',
  afterAgentThought: 'post-tool'
})

const COMPOSER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function normalizeQueueEntry(value) {
  if (!value || typeof value !== 'object') return null
  const sessionId = typeof value.s === 'string' ? value.s.trim() : ''
  const event = normalizeEventClass(value.e)
  const mode = typeof value.m === 'string' ? value.m.trim() : ''
  if (!sessionId || !COMPOSER_ID.test(sessionId) || !event) return null
  if (mode === 'ask' || mode === 'edit') return null
  const reason = typeof value.r === 'string' ? value.r.trim() : ''
  const stopStatus = reason === 'completed' || reason === 'aborted' || reason === 'error' ? reason : ''
  return {
    sessionId,
    event,
    at: safeInteger(value.t) || 0,
    pid: safeInteger(value.p),
    mode: mode === 'agent' ? 'agent' : '',
    stopStatus,
    reason: stopStatus ? '' : reason.slice(0, 40)
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
    lastStopAt: 0,
    lastSessionEndAt: 0,
    turnCloseKind: '',
    pid: 0
  }
}

function turnCloseKindOf(state) {
  return typeof state.turnCloseKind === 'string' ? state.turnCloseKind : ''
}

/**
 * Hot-path reducer. `beforeSubmitPrompt` opens a Turn. Disk status never
 * enters this function. `waiting-approval` is never invented.
 */
function reduceQueueEntry(previous, entry) {
  const known = previous && typeof previous === 'object' ? previous : emptyHookState()
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
    next.turnCloseKind = ''
    next.lastActivityAt = at
    next.phase = 'running'
    return next
  }
  if (entry.event === 'stop') {
    if (entry.stopStatus === 'completed') {
      next.lastStopAt = at
      next.turnOpen = false
      next.turnCloseKind = 'stop'
      next.phase = 'completed'
      return next
    }
    if (entry.stopStatus === 'aborted' || entry.stopStatus === 'error') {
      const closed = turnCloseKindOf(next)
      if (closed === 'stop' || closed === 'session-end') return next
      if (!next.turnStartedAt) return next
      next.turnOpen = false
      next.turnCloseKind = 'stop-failure'
      next.phase = 'stopped'
      return next
    }
    return next
  }
  if (entry.event === 'session-end') {
    const closesObservedTurn = next.turnOpen === true
    next.lastSessionEndAt = at
    next.turnOpen = false
    if (closesObservedTurn) {
      const completed = next.lastStopAt > 0 && next.lastStopAt >= next.turnStartedAt
      next.phase = completed ? 'completed' : 'stopped'
      next.turnCloseKind = completed ? 'stop' : 'session-end'
    }
    return next
  }
  if (entry.event === 'pre-tool' || entry.event === 'post-tool'
    || entry.event === 'subagent-start' || entry.event === 'subagent-stop') {
    next.lastActivityAt = at
    if (next.turnOpen) next.phase = 'running'
    return next
  }
  return next
}

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
  let fileWatcher = null
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
    if (fileWatcher) {
      try { fileWatcher.close() } catch { /* already gone */ }
      fileWatcher = null
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

  function watch(listener, options) {
    const settings = options || {}
    if (typeof listener !== 'function') return () => {}
    const recoveryPollMs = Number.isFinite(settings.recoveryPollMs)
      ? Math.max(100, settings.recoveryPollMs)
      : DEFAULT_RECOVERY_POLL_MS
    stopWatching()
    try { fs.mkdirSync(directory, { recursive: true }) } catch { /* the watch below reports it */ }
    try { fs.writeFileSync(queuePath, '', { flag: 'a' }) } catch { /* file watch can attach later */ }
    let disposed = false
    lastQueueSignature = queueSignature()
    const stateFingerprint = () => JSON.stringify([...sessionState.entries()])
    const drainAndNotify = () => {
      if (disposed) return
      const before = stateFingerprint()
      drain()
      lastQueueSignature = queueSignature()
      if (stateFingerprint() === before) return
      try { listener() } catch { /* consumer's problem */ }
    }
    const onChange = (_event, filename) => {
      if (disposed) return
      if (filename && String(filename) !== QUEUE_FILE_NAME) return
      drainAndNotify()
    }
    try {
      watcher = fs.watch(directory, { persistent: false }, onChange)
      if (watcher && typeof watcher.on === 'function') {
        watcher.on('error', () => {
          try { watcher?.close() } catch {}
          watcher = null
        })
      }
    } catch {
      watcher = null
    }
    try {
      fileWatcher = fs.watch(queuePath, { persistent: false }, () => {
        if (!disposed) drainAndNotify()
      })
      if (fileWatcher && typeof fileWatcher.on === 'function') {
        fileWatcher.on('error', () => {
          try { fileWatcher?.close() } catch {}
          fileWatcher = null
        })
      }
    } catch {
      fileWatcher = null
    }
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

  function drain() {
    let handle = null
    try {
      const stat = fs.statSync(queuePath)
      const size = Number(stat.size) || 0
      if (size < offset) offset = 0
      if (size === offset) return []
      const length = size - offset
      handle = fs.openSync(queuePath, 'r')
      const buffer = Buffer.alloc(length)
      fs.readSync(handle, buffer, 0, length, offset)
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
  normalizeQueueEntry,
  reduceQueueEntry,
  foldQueueEntries,
  emptyHookState,
  createEventQueue
}
