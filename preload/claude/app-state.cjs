'use strict'

/**
 * Version-gated, privacy-bounded Claude App Code state.
 *
 * Claude Desktop does not expose a supported external state subscription, but
 * its main-process log emits a small set of fixed lifecycle messages carrying
 * the App-local Code session id. This reader accepts only those exact message
 * grammars. Raw lines, tool arguments and conversation text are discarded in
 * this module and can never reach the bridge or Renderer.
 */

const { claudeAppDataRoot } = require('./app-paths.cjs')
const { LOCAL_SESSION_PATTERN } = require('./code-sessions.cjs')

const CLAUDE_APP_STATE_REVISION = 'claude-app-log-state-v1'
const CLAUDE_APP_STATE_VERSION = 2
const SUPPORTED_APP_VERSIONS = new Set(['1.26832.0'])
const LOG_FILE_NAMES = ['main1.log', 'main.log']
const LOG_TAIL_MAX_BYTES = 16 * 1024 * 1024
const LOG_WATCH_COALESCE_MS = 50
const LOG_RECOVERY_POLL_MS = 1000
const MAX_SEEN_EVENTS = 4096
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
    source: 'app-log'
  }
}

/** Ordered, idempotent fold. Permission responses recover their owner in-memory. */
function foldAppStateEvents(events, previous, previousRequests) {
  const state = new Map(previous instanceof Map ? previous : [])
  const requests = new Map(previousRequests instanceof Map ? previousRequests : [])
  let changed = false
  for (const event of Array.isArray(events) ? events : []) {
    let sessionId = event.sessionId
    if (event.kind === 'permission-response') sessionId = requests.get(event.requestId) || ''
    if (!sessionId) continue
    const known = state.get(sessionId) || emptyEntry(sessionId)
    if (known.lastEventAt > event.at) continue
    if (event.requestId && event.kind !== 'permission-response') requests.set(event.requestId, sessionId)
    if (event.kind === 'permission-response' && event.requestId) requests.delete(event.requestId)
    const next = { ...known, lastEventAt: event.at, phaseUpdatedAt: event.at }
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
    } else if (event.kind === 'session-end') {
      next.lastSessionEndAt = event.at
      // Claude emits a generic teardown row after both successful and
      // interrupted sessions. Preserve a completion from the current Turn;
      // only a teardown without current-Turn completion is a real stop.
      next.phase = known.lastStopAt > 0 && known.lastStopAt >= known.turnStartedAt
        ? 'completed'
        : 'stopped'
    } else if (event.kind === 'stopped') {
      next.phase = 'stopped'
      next.lastSessionEndAt = event.at
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
  const setTimer = dependencies.setTimeout || setTimeout
  const clearTimer = dependencies.clearTimeout || clearTimeout
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  let watcher = null
  let watchTimer = null
  let recoveryTimer = null
  let lastSignature = ''
  let watchSignature = ''
  let state = new Map()
  let requests = new Map()
  let seenOrder = []
  let seen = new Set()
  let generation = 0
  let initialized = false
  let lastAppVersion = ''
  let cachedAppVersion = ''
  let cachedAppVersionSignature = ''

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
    const version = appVersion()
    return { version, status: SUPPORTED_APP_VERSIONS.has(version) ? 'compatible' : 'unsupported' }
  }

  function signature() {
    const parts = []
    for (const name of LOG_FILE_NAMES) {
      try {
        const stat = fs.statSync(path.join(logDirectory(), name))
        parts.push(`${name}:${Number(stat.size) || 0}:${Math.round(Number(stat.mtimeMs) || 0)}:${Number(stat.ino) || 0}`)
      } catch { parts.push(`${name}:missing`) }
    }
    return parts.join('|')
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

  function rebuild() {
    const gate = compatibility()
    const before = JSON.stringify([...state.entries()])
    if (gate.status !== 'compatible') {
      state = new Map()
      requests = new Map()
      seen = new Set()
      seenOrder = []
      if (before !== '[]') generation += 1
      initialized = true
      lastAppVersion = gate.version
      lastSignature = signature()
      return gate
    }
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
        events.push({ ...event, occurrence })
      }
    }
    events.sort((left, right) => left.at - right.at)
    state = new Map()
    requests = new Map()
    seen = new Set()
    seenOrder = []
    const unique = events.filter(remember)
    const folded = foldAppStateEvents(unique, state, requests)
    state = folded.state
    requests = folded.requests
    if (JSON.stringify([...state.entries()]) !== before) generation += 1
    initialized = true
    lastAppVersion = gate.version
    lastSignature = signature()
    return gate
  }

  function read() {
    const nextSignature = signature()
    const nextVersion = appVersion()
    const gate = initialized && nextSignature === lastSignature && nextVersion === lastAppVersion
      ? { version: nextVersion, status: SUPPORTED_APP_VERSIONS.has(nextVersion) ? 'compatible' : 'unsupported' }
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
    if (watchTimer) clearTimer(watchTimer)
    watchTimer = null
    if (recoveryTimer) clearIntervalFn(recoveryTimer)
    recoveryTimer = null
    if (watcher) { try { watcher.close() } catch {} }
    watcher = null
  }

  function watch(listener) {
    stopWatching()
    if (typeof listener !== 'function') return () => {}
    let disposed = false
    watchSignature = signature()
    const fire = () => {
      watchTimer = null
      watchSignature = signature()
      if (!disposed) { try { listener() } catch {} }
    }
    const schedule = (_event, filename) => {
      if (disposed || watchTimer) return
      if (filename && !LOG_FILE_NAMES.includes(String(filename))) return
      watchTimer = setTimer(fire, LOG_WATCH_COALESCE_MS)
    }
    try { watcher = fs.watch(logDirectory(), { persistent: false }, schedule) } catch { watcher = null }
    recoveryTimer = setIntervalFn(() => {
      const next = signature()
      if (next === watchSignature) return
      watchSignature = next
      schedule('change', null)
    }, LOG_RECOVERY_POLL_MS)
    if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
    return () => { disposed = true; stopWatching() }
  }

  return { revision: CLAUDE_APP_STATE_REVISION, read, watch, close: stopWatching, compatibility, hasArchiveEvidence }
}

module.exports = {
  CLAUDE_APP_STATE_REVISION,
  CLAUDE_APP_STATE_VERSION,
  SUPPORTED_APP_VERSIONS,
  LOG_TAIL_MAX_BYTES,
  LOG_RECOVERY_POLL_MS,
  parseAppStateLine,
  parseAppArchiveLine,
  foldAppStateEvents,
  createAppStateReader
}
