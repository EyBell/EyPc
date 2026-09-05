'use strict'

/**
 * Privacy-bounded Claude App Code state.
 *
 * Claude Desktop does not expose a supported external state subscription, but
 * its main-process log emits a small set of fixed lifecycle messages carrying
 * the App-local Code session id. This reader accepts only those exact message
 * grammars on any installed App version. App version is diagnostic metadata
 * and never an admission whitelist. Unmatched lines fail closed one at a time.
 * Raw lines, tool arguments and conversation text are discarded in this module
 * and can never reach the bridge or Renderer.
 */

const { claudeAppDataRoot } = require('./app-paths.cjs')
const { LOCAL_SESSION_PATTERN } = require('./code-sessions.cjs')

const CLAUDE_APP_STATE_REVISION = 'claude-app-log-state-v2'
const CLAUDE_APP_STATE_VERSION = 2
const LOG_FILE_NAMES = ['main1.log', 'main.log']
const LOG_TAIL_MAX_BYTES = 16 * 1024 * 1024
const { WATCHER_RECOVERY_INTERVAL_MS } = require('../timing-policy.cjs')
const { isLiveTaskPhase } = require('../task-phase.cjs')
const LOG_RECOVERY_POLL_MS = WATCHER_RECOVERY_INTERVAL_MS
const MAX_SEEN_EVENTS = 4096
const MAX_HOT_UNREAD_HINTS = 500
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function safeTime(value) {
  const parsed = Date.parse(String(value || '').replace(' ', 'T'))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

function normalizeLocalId(value) {
  const id = textOf(value).trim().toLowerCase()
  return LOCAL_SESSION_PATTERN.test(id) ? id : ''
}

function normalizeRequestId(value) {
  const id = textOf(value).trim().toLowerCase()
  return REQUEST_ID_PATTERN.test(id) ? id : ''
}

/** Fixed log grammar -> content-free state event. */
function parseAppStateLine(line) {
  const value = textOf(line)
  const warning = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[warn\] (.+)$/.exec(value)
  if (warning) {
    const at = safeTime(warning[1])
    if (!at) return null
    // Claude 1.37937.0 reports a model/plan exhaustion after the preceding
    // successful query hook. It is an explicit current-Turn interruption, not
    // a generic session teardown and not proof of task completion. Admit only
    // the fixed content-free CycleHealth grammar and discard the model label.
    const match = /^\[CCD CycleHealth\] (local_[0-9a-f-]+) api_error \(success\): You've reached your [A-Za-z0-9][A-Za-z0-9 ._-]{0,79} limit\. Switch to another model, or manage usage credits at claude\.ai\/settings\/usage\?from=cc_cli_limit_message, to continue\.$/.exec(warning[2])
    if (!match) return null
    const sessionId = normalizeLocalId(match[1])
    return sessionId ? { kind: 'stopped', sessionId, requestId: '', at } : null
  }
  const prefix = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[info\] (.+)$/.exec(value)
  if (!prefix) return null
  const at = safeTime(prefix[1])
  if (!at) return null
  const message = prefix[2]
  let match = /^Sending message to session (local_[0-9a-f-]+)$/.exec(message)
  if (match) {
    const sessionId = normalizeLocalId(match[1])
    return sessionId ? { kind: 'running', sessionId, requestId: '', at } : null
  }
  match = /^Emitted tool permission request ([0-9a-f-]+) for ([A-Za-z0-9_.-]{1,80}) in session (local_[0-9a-f-]+)$/.exec(message)
  if (match) {
    const requestId = normalizeRequestId(match[1])
    const sessionId = normalizeLocalId(match[3])
    if (!requestId || !sessionId) return null
    return {
      kind: match[2] === 'AskUserQuestion' ? 'waiting-input' : 'waiting-approval',
      sessionId,
      requestId,
      at
    }
  }
  match = /^Received permission response for ([0-9a-f-]+): [A-Za-z0-9_.-]+ \(tool: [A-Za-z0-9_.-]{1,80}\)$/.exec(message)
  if (match) {
    const requestId = normalizeRequestId(match[1])
    return requestId ? { kind: 'permission-response', sessionId: '', requestId, at } : null
  }
  match = /^\[Stop hook\] Query completed for session (local_[0-9a-f-]+)$/.exec(message)
    || /^\[Result\] Turn succeeded for session (local_[0-9a-f-]+)$/.exec(message)
  if (match) {
    const sessionId = normalizeLocalId(match[1])
    return sessionId ? { kind: 'completed', sessionId, requestId: '', at } : null
  }
  match = /^Stopping session (local_[0-9a-f-]+)$/.exec(message)
  if (match) {
    const sessionId = normalizeLocalId(match[1])
    return sessionId ? { kind: 'session-end', sessionId, requestId: '', at } : null
  }
  match = /^\[(?:Result|Stop hook)\] (?:Turn|Query) (?:failed|interrupted) for session (local_[0-9a-f-]+)$/.exec(message)
  if (match) {
    const sessionId = normalizeLocalId(match[1])
    return sessionId ? { kind: 'stopped', sessionId, requestId: '', at } : null
  }
  match = /^\[CCD\] LocalSessions\.setFocusedSession: sessionId=(null|local_[0-9a-f-]+)$/.exec(message)
  if (match) {
    const sessionId = match[1] === 'null' ? '' : normalizeLocalId(match[1])
    return match[1] === 'null' || sessionId
      ? { kind: 'focus-changed', sessionId, requestId: '', at }
      : null
  }
  return null
}

/** Fixed native archive log grammar retained as optional diagnostic evidence. */
function parseAppArchiveLine(line) {
  const value = textOf(line)
  const match = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[info\] LocalSessions\.archive: sessionId=(local_[0-9a-f-]+)$/.exec(value)
  if (!match) return null
  const at = safeTime(match[1])
  const sessionId = normalizeLocalId(match[2])
  return at && sessionId ? { sessionId, at } : null
}

function emptyEntry(sessionId) {
  return {
    sessionId,
    phase: 'unknown',
    phaseUpdatedAt: 0,
    turnStartedAt: 0,
    hookActivityAt: 0,
    waitingApprovalAt: 0,
    waitingInputAt: 0,
    lastStopAt: 0,
    lastSessionEndAt: 0,
    lastEventAt: 0,
    evidenceProvenance: 'cold-replay',
    source: 'app-log'
  }
}

/** Ordered, idempotent fold. Permission responses recover their owner in-memory. */
function foldAppStateEvents(events, previous, previousRequests) {
  const state = new Map(previous instanceof Map ? previous : [])
  const requests = new Map(previousRequests instanceof Map ? previousRequests : [])
  let changed = false
  for (const event of Array.isArray(events) ? events : []) {
    // Focus owns only the hot-unread lane. Folding it into phase used to renew
    // phaseUpdatedAt/evidenceProvenance without any Turn transition, allowing a
    // navigation event to masquerade as fresher activity evidence.
    if (event.kind === 'focus-changed') continue
    let sessionId = event.sessionId
    if (event.kind === 'permission-response') sessionId = requests.get(event.requestId) || ''
    if (!sessionId) continue
    const known = state.get(sessionId) || emptyEntry(sessionId)
    if (known.lastEventAt > event.at) continue
    if (event.requestId && event.kind !== 'permission-response') requests.set(event.requestId, sessionId)
    if (event.kind === 'permission-response' && event.requestId) requests.delete(event.requestId)
    const eventProvenance = event.evidenceProvenance === 'cold-replay' ? 'cold-replay' : 'live-append'
    const next = {
      ...known,
      lastEventAt: event.at,
      phaseUpdatedAt: event.at,
      evidenceProvenance: eventProvenance
    }
    if (event.kind === 'running') {
      next.phase = 'running'
      next.turnStartedAt = event.at
      next.hookActivityAt = event.at
    } else if (event.kind === 'waiting-approval') {
      next.phase = 'waiting-approval'
      next.waitingApprovalAt = event.at
    } else if (event.kind === 'waiting-input') {
      next.phase = 'waiting-input'
      next.waitingInputAt = event.at
    } else if (event.kind === 'permission-response') {
      next.phase = 'running'
      next.hookActivityAt = event.at
    } else if (event.kind === 'completed') {
      next.phase = 'completed'
      next.lastStopAt = event.at
      next.evidenceProvenance = 'exact-terminal'
    } else if (event.kind === 'session-end') {
      next.lastSessionEndAt = event.at
      // Claude also emits generic teardown rows during a lifecycle sweep. A
      // teardown closes a currently observed Turn, but cannot invent stopped
      // from an empty/cold state or overwrite an already settled phase.
      if (isLiveTaskPhase(known.phase)) {
        next.phase = 'stopped'
        next.evidenceProvenance = 'exact-terminal'
      } else {
        next.phaseUpdatedAt = known.phaseUpdatedAt
        next.evidenceProvenance = known.evidenceProvenance
      }
    } else if (event.kind === 'stopped') {
      next.phase = 'stopped'
      next.lastSessionEndAt = event.at
      next.evidenceProvenance = 'exact-terminal'
    }
    if (JSON.stringify(next) !== JSON.stringify(known)) {
      state.set(sessionId, next)
      changed = true
    }
  }
  return { state, requests, changed }
}

function createAppStateReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  const watchFileFn = dependencies.watchFile
    || (typeof fs.watchFile === 'function' ? fs.watchFile.bind(fs) : null)
  const unwatchFileFn = dependencies.unwatchFile
    || (typeof fs.unwatchFile === 'function' ? fs.unwatchFile.bind(fs) : null)
  let watcher = null
  const recoveryFileWatches = new Map()
  let recoveryTimer = null
  let lastSignature = ''
  let state = new Map()
  let requests = new Map()
  let seenOrder = []
  let seen = new Set()
  let generation = 0
  let initialized = false
  let lastAppVersion = ''
  let lastFileState = null
  let cachedAppVersion = ''
  let cachedAppVersionSignature = ''
  let focusedSessionId = ''
  let focusUpdatedAt = 0
  let hotUnreadHints = new Map()
  let hotUnreadGeneration = 0
  let hotUnreadWatermark = 0
  let hotSeenOrder = []
  let hotSeen = new Set()

  function logDirectory() {
    const override = textOf(dependencies.claudeLogDirectory).trim()
    if (override) return override
    if ((dependencies.platform || process.platform) === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Logs', 'Claude')
    }
    return path.join(claudeAppDataRoot(dependencies), 'logs')
  }

  function appVersion() {
    const override = textOf(dependencies.claudeAppVersion).trim()
    if (override) return override
    if ((dependencies.platform || process.platform) !== 'darwin' || typeof dependencies.execFileSync !== 'function') return ''
    const infoPath = textOf(dependencies.claudeAppInfoPath).trim()
      || '/Applications/Claude.app/Contents/Info.plist'
    let infoSignature = ''
    try {
      const stat = fs.statSync(infoPath)
      infoSignature = `${Number(stat.size) || 0}:${Math.round(Number(stat.mtimeMs) || 0)}:${Number(stat.ino) || 0}`
    } catch {
      cachedAppVersion = ''
      cachedAppVersionSignature = 'missing'
      return ''
    }
    if (infoSignature === cachedAppVersionSignature) return cachedAppVersion
    try {
      cachedAppVersion = String(dependencies.execFileSync('/usr/libexec/PlistBuddy', [
        '-c', 'Print :CFBundleShortVersionString', infoPath
      ], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }) || '').trim()
    } catch {
      cachedAppVersion = ''
    }
    cachedAppVersionSignature = infoSignature
    return cachedAppVersion
  }

  function compatibility() {
    return { version: appVersion(), status: 'compatible' }
  }

  function fileState() {
    const value = {}
    for (const name of LOG_FILE_NAMES) {
      try {
        const stat = fs.statSync(path.join(logDirectory(), name))
        value[name] = {
          size: Number(stat.size) || 0,
          mtimeMs: Math.round(Number(stat.mtimeMs) || 0),
          ino: Number(stat.ino) || 0
        }
      } catch { value[name] = null }
    }
    return value
  }

  function signature(value = fileState()) {
    return LOG_FILE_NAMES.map((name) => {
      const state = value[name]
      return state ? `${name}:${state.size}:${state.mtimeMs}:${state.ino}` : `${name}:missing`
    }).join('|')
  }

  function appendOnly(previous, next) {
    if (!previous || !next) return false
    let grew = false
    for (const name of LOG_FILE_NAMES) {
      const before = previous[name]
      const after = next[name]
      if (!before && !after) continue
      if (!before || !after || before.ino !== after.ino || after.size < before.size) return false
      if (after.size > before.size) grew = true
      else if (after.mtimeMs !== before.mtimeMs) return false
    }
    return grew
  }

  function tailText(filePath) {
    let handle = null
    try {
      const stat = fs.statSync(filePath)
      const size = Number(stat.size) || 0
      if (!size) return ''
      const length = Math.min(size, LOG_TAIL_MAX_BYTES)
      const buffer = Buffer.alloc(length)
      handle = fs.openSync(filePath, 'r')
      fs.readSync(handle, buffer, 0, length, size - length)
      const text = buffer.toString('utf8')
      return size > length ? text.slice(Math.max(0, text.indexOf('\n') + 1)) : text
    } catch {
      return ''
    } finally {
      if (handle !== null) { try { fs.closeSync(handle) } catch {} }
    }
  }

  function remember(event) {
    // Rotation can leave the same prefix in main1.log and main.log. Count the
    // Nth identical semantic row per file and dedupe that occurrence across
    // files. Two legitimate identical rows in one second remain occurrence 1
    // and 2 instead of collapsing into one state transition.
    const key = `${event.at}:${event.kind}:${event.sessionId}:${event.requestId}:${event.occurrence || 1}`
    if (seen.has(key)) return false
    seen.add(key)
    seenOrder.push(key)
    while (seenOrder.length > MAX_SEEN_EVENTS) seen.delete(seenOrder.shift())
    return true
  }

  function rememberHotEvent(event) {
    const key = `${event.at}:${event.kind}:${event.sessionId}:${event.requestId}:${event.occurrence || 1}`
    if (hotSeen.has(key)) return false
    hotSeen.add(key)
    hotSeenOrder.push(key)
    while (hotSeenOrder.length > MAX_SEEN_EVENTS) hotSeen.delete(hotSeenOrder.shift())
    return true
  }

  function setHotUnreadHint(sessionId, unread, at, reason) {
    if (!sessionId || !Number.isFinite(at) || at <= 0) return false
    const previous = hotUnreadHints.get(sessionId)
    if (previous && previous.updatedAt > at) return false
    if (previous
      && previous.unread === (unread === true)
      && previous.updatedAt === at
      && previous.reason === reason) return false
    hotUnreadGeneration += 1
    hotUnreadHints.delete(sessionId)
    hotUnreadHints.set(sessionId, {
      sessionId,
      unread: unread === true,
      updatedAt: at,
      reason,
      revision: hotUnreadGeneration
    })
    while (hotUnreadHints.size > MAX_HOT_UNREAD_HINTS) hotUnreadHints.delete(hotUnreadHints.keys().next().value)
    return true
  }

  function applyHotUnreadEvents(events, allowHints) {
    for (const event of events) {
      if (!rememberHotEvent(event) || event.at < hotUnreadWatermark) continue
      hotUnreadWatermark = Math.max(hotUnreadWatermark, event.at)
      if (event.kind === 'focus-changed') {
        if (event.at >= focusUpdatedAt) {
          const changed = focusedSessionId !== event.sessionId || focusUpdatedAt !== event.at
          focusedSessionId = event.sessionId
          focusUpdatedAt = event.at
          if (changed) hotUnreadGeneration += 1
        }
        if (allowHints && event.sessionId) setHotUnreadHint(event.sessionId, false, event.at, 'focused')
        continue
      }
      if (!allowHints || !event.sessionId) continue
      if (event.kind === 'running') {
        setHotUnreadHint(event.sessionId, false, event.at, 'turn-started')
      } else if (event.kind === 'completed') {
        const focused = focusedSessionId === event.sessionId
        setHotUnreadHint(event.sessionId, !focused, event.at, focused ? 'completed-focused' : 'completed-unfocused')
      }
    }
  }

  function rebuild() {
    const gate = compatibility()
    const before = JSON.stringify([...state.entries()])
    const beforeHotGeneration = hotUnreadGeneration
    const nextFileState = fileState()
    const liveAppend = initialized && gate.version === lastAppVersion && appendOnly(lastFileState, nextFileState)
    // Only a verified append may create a realtime unread edge. Rotation,
    // truncation and App upgrades still recover phase/focus state,
    // but their cold tail must never fabricate a new completion/read event.
    const allowHotHints = liveAppend
    const events = []
    for (const name of LOG_FILE_NAMES) {
      const text = tailText(path.join(logDirectory(), name))
      const occurrences = new Map()
      for (const line of text.split('\n')) {
        const event = parseAppStateLine(line)
        if (!event) continue
        const semantic = `${event.at}:${event.kind}:${event.sessionId}:${event.requestId}`
        const occurrence = (occurrences.get(semantic) || 0) + 1
        occurrences.set(semantic, occurrence)
        events.push({ ...event, occurrence, evidenceProvenance: liveAppend ? 'live-append' : 'cold-replay' })
      }
    }
    events.sort((left, right) => left.at - right.at)
    if (!liveAppend) {
      state = new Map()
      requests = new Map()
      seen = new Set()
      seenOrder = []
    }
    const unique = events.filter(remember)
    applyHotUnreadEvents(unique, allowHotHints)
    const folded = foldAppStateEvents(unique, state, requests)
    state = folded.state
    requests = folded.requests
    if (!liveAppend) {
      for (const [sessionId, entry] of state) {
        if (!isLiveTaskPhase(entry.phase)) continue
        state.set(sessionId, {
          ...entry,
          phase: 'unknown',
          evidenceProvenance: 'cold-replay'
        })
      }
    }
    if (JSON.stringify([...state.entries()]) !== before || beforeHotGeneration !== hotUnreadGeneration) generation += 1
    initialized = true
    lastAppVersion = gate.version
    lastFileState = nextFileState
    lastSignature = signature(nextFileState)
    return gate
  }

  function read() {
    const nextSignature = signature()
    const nextVersion = appVersion()
    const gate = initialized && nextSignature === lastSignature && nextVersion === lastAppVersion
      ? { version: nextVersion, status: 'compatible' }
      : rebuild()
    return {
      version: CLAUDE_APP_STATE_VERSION,
      revision: CLAUDE_APP_STATE_REVISION,
      compatibility: gate.status,
      appVersion: gate.version,
      generation,
      entries: gate.status === 'compatible' ? [...state.values()].map((entry) => ({ ...entry })) : [],
      readAt: Date.now()
    }
  }

  function readHotUnread() {
    const gate = compatibility()
    return {
      revision: `${CLAUDE_APP_STATE_REVISION}:hot-unread-v1`,
      compatibility: gate.status,
      generation: hotUnreadGeneration,
      focusedSessionId: gate.status === 'compatible' ? focusedSessionId : '',
      focusUpdatedAt: gate.status === 'compatible' ? focusUpdatedAt : 0,
      hints: gate.status === 'compatible'
        ? [...hotUnreadHints.values()].map((hint) => ({ ...hint })).sort((left, right) => left.sessionId.localeCompare(right.sessionId))
        : []
    }
  }

  function hasArchiveEvidence(sessionId, since = 0) {
    const expected = normalizeLocalId(sessionId)
    if (!expected || compatibility().status !== 'compatible') return false
    const earliest = Math.max(0, Number(since) || 0) - 1_000
    for (const name of LOG_FILE_NAMES) {
      const text = tailText(path.join(logDirectory(), name))
      for (const line of text.split('\n')) {
        const event = parseAppArchiveLine(line)
        if (event?.sessionId === expected && event.at >= earliest) return true
      }
    }
    return false
  }

  function stopWatching() {
    if (recoveryTimer) clearIntervalFn(recoveryTimer)
    recoveryTimer = null
    if (unwatchFileFn) {
      for (const [filePath, callback] of recoveryFileWatches) {
        try { unwatchFileFn(filePath, callback) } catch {}
      }
    }
    recoveryFileWatches.clear()
    if (watcher) { try { watcher.close() } catch {} }
    watcher = null
  }

  function watch(listener) {
    stopWatching()
    if (typeof listener !== 'function') return () => {}
    let disposed = false
    const observationFingerprint = (snapshot) => JSON.stringify({
      compatibility: snapshot.compatibility,
      appVersion: snapshot.appVersion,
      generation: snapshot.generation,
      entries: snapshot.entries,
      hotUnreadGeneration
    })
    let deliveredFingerprint = observationFingerprint(read())
    const readAndNotify = () => {
      if (disposed) return
      const snapshot = read()
      const nextFingerprint = observationFingerprint(snapshot)
      if (nextFingerprint === deliveredFingerprint) return
      deliveredFingerprint = nextFingerprint
      try { listener() } catch {}
    }
    const onChange = (_event, filename) => {
      if (disposed) return
      if (filename && !LOG_FILE_NAMES.includes(String(filename))) return
      // The first native append callback owns the read. Never put a real state
      // transition behind a hidden-WebContents timer.
      readAndNotify()
    }
    try {
      watcher = fs.watch(logDirectory(), { persistent: false }, onChange)
      if (watcher && typeof watcher.on === 'function') {
        watcher.on('error', () => {
          try { watcher?.close() } catch {}
          watcher = null
        })
      }
    } catch { watcher = null }

    // Node StatWatchers are process-lifetime/native event sources and remain
    // eligible while uTools hides the main WebContents. They are the recovery
    // authority for a dropped directory callback; setInterval is only a
    // compatibility fallback for constrained runtimes without watchFile.
    if (watchFileFn) {
      for (const name of LOG_FILE_NAMES) {
        const filePath = path.join(logDirectory(), name)
        try {
          const callback = () => readAndNotify()
          watchFileFn(filePath, { persistent: false, interval: LOG_RECOVERY_POLL_MS }, callback)
          recoveryFileWatches.set(filePath, callback)
        } catch {}
      }
    }
    if (recoveryFileWatches.size !== LOG_FILE_NAMES.length) {
      if (unwatchFileFn) {
        for (const [filePath, callback] of recoveryFileWatches) {
          try { unwatchFileFn(filePath, callback) } catch {}
        }
      }
      recoveryFileWatches.clear()
      let fallbackSignature = signature()
      recoveryTimer = setIntervalFn(() => {
        const next = signature()
        if (next === fallbackSignature) return
        fallbackSignature = next
        readAndNotify()
      }, LOG_RECOVERY_POLL_MS)
      if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
    }
    return () => { disposed = true; stopWatching() }
  }

  return { revision: CLAUDE_APP_STATE_REVISION, read, readHotUnread, watch, close: stopWatching, compatibility, hasArchiveEvidence }
}

module.exports = {
  CLAUDE_APP_STATE_REVISION,
  CLAUDE_APP_STATE_VERSION,
  LOG_TAIL_MAX_BYTES,
  LOG_RECOVERY_POLL_MS,
  parseAppStateLine,
  parseAppArchiveLine,
  foldAppStateEvents,
  createAppStateReader
}
