'use strict'

/**
 * Claude App Code-mode inventory.
 *
 * Only `claude-code-sessions/<org>/<user>/local_<uuid>.json` is admitted. The
 * raw metadata also contains permission settings and other App internals; this
 * module emits the identity/title/timing whitelist below and nothing else.
 */

const { claudeAppDataRoot } = require('./app-paths.cjs')

const CLAUDE_CODE_READER_REVISION = 'claude-code-sessions-v2'
const DEFAULT_CODE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const CODE_METADATA_MAX_BYTES = 1024 * 1024
const CODE_MAX_SESSIONS = 400
const CODE_WATCH_COALESCE_MS = 50
const CODE_RECOVERY_POLL_MS = 1000
const METADATA_FILE_PATTERN = /^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i
const LOCAL_SESSION_PATTERN = /^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLI_SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const METADATA_PULSE_WINDOW_MS = 90 * 1000

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function numberOf(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function nonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

function normalizedProjectRoot(dependencies, value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const pathApi = (dependencies.platform || process.platform) === 'win32' ? dependencies.path.win32 : dependencies.path
  if (!pathApi.isAbsolute(value)) return ''
  let normalized = pathApi.normalize(value)
  try {
    if (dependencies.fs.existsSync(normalized)) normalized = dependencies.fs.realpathSync(normalized)
  } catch {}
  normalized = pathApi.normalize(normalized).replace(/[\\/]+$/, '') || pathApi.parse(normalized).root
  return (dependencies.platform || process.platform) === 'win32' ? normalized.toLowerCase() : normalized
}

function projectKeyForMetadata(dependencies, metadata) {
  const root = normalizedProjectRoot(dependencies, metadata.originCwd || metadata.cwd)
  if (!root) return ''
  const crypto = dependencies.crypto || require('node:crypto')
  try { return crypto.createHash('sha256').update(`codex-project\u0000${root}`).digest('hex').slice(0, 32) } catch { return '' }
}

function scanUserDirectories(fs, path, root) {
  let orgEntries
  try { orgEntries = fs.readdirSync(root, { withFileTypes: true }) } catch {
    return { directories: [], available: false }
  }
  const directories = []
  let available = true
  for (const org of orgEntries) {
    if (!org.isDirectory() || org.name.startsWith('.')) continue
    const orgPath = path.join(root, org.name)
    let userEntries
    try { userEntries = fs.readdirSync(orgPath, { withFileTypes: true }) } catch {
      available = false
      continue
    }
    for (const user of userEntries) {
      if (user.isDirectory() && !user.name.startsWith('.')) directories.push(path.join(orgPath, user.name))
    }
  }
  return { directories, available }
}

function safeStat(fs, filePath) {
  try { return fs.statSync(filePath) } catch { return null }
}

function normalizeMetadata(parsed, stat, expectedSessionId) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const sessionId = textOf(parsed.sessionId).trim().toLowerCase()
  const cliSessionId = textOf(parsed.cliSessionId).trim().toLowerCase()
  if (!LOCAL_SESSION_PATTERN.test(sessionId) || !CLI_SESSION_PATTERN.test(cliSessionId)) return null
  const expected = textOf(expectedSessionId).trim().toLowerCase()
  if (expected && sessionId !== expected) return null
  return {
    sessionId,
    cliSessionId,
    title: textOf(parsed.title),
    cwd: textOf(parsed.cwd),
    originCwd: textOf(parsed.originCwd),
    createdAt: numberOf(parsed.createdAt),
    lastActivityAt: numberOf(parsed.lastActivityAt),
    lastFocusedAt: numberOf(parsed.lastFocusedAt),
    model: textOf(parsed.model),
    isArchived: parsed.isArchived === true,
    // Durable App metadata. It proves at least one historical turn completed;
    // it never outranks a newer live App-log/Hook event.
    completedTurns: nonNegativeInteger(parsed.completedTurns),
    metadataUpdatedAt: Math.round(Number(stat && stat.mtimeMs) || 0)
  }
}

function metadataPulseAt(current, previous) {
  if (!previous) return 0
  const candidates = []
  if (current.metadataUpdatedAt > previous.metadataUpdatedAt) candidates.push(current.metadataUpdatedAt)
  if (current.lastActivityAt > previous.lastActivityAt) candidates.push(current.lastActivityAt)
  if (current.lastFocusedAt > previous.lastFocusedAt) candidates.push(current.lastFocusedAt)
  return candidates.length ? Math.max(...candidates) : 0
}

function hookForSession(session, hookState, byCli, previousBySession) {
  if (!(hookState instanceof Map)) return { hook: null, correlation: 'none' }
  const direct = hookState.get(session.sessionId)
  if (direct) return { hook: direct, correlation: 'direct-local' }
  const hook = hookState.get(session.cliSessionId)
  if (!hook) return { hook: null, correlation: 'none' }
  const siblings = byCli.get(session.cliSessionId) || []
  if (siblings.length === 1) return { hook, correlation: 'unique-cli' }
  const eventAt = Number(hook.lastEventAt) || 0
  const pulsed = siblings.filter((candidate) => {
    const pulseAt = metadataPulseAt(candidate, previousBySession && previousBySession.get(candidate.sessionId))
    return pulseAt > 0 && eventAt > 0
      && pulseAt >= eventAt - 2000
      && pulseAt - eventAt <= METADATA_PULSE_WINDOW_MS
  })
  return pulsed.length === 1 && pulsed[0].sessionId === session.sessionId
    ? { hook, correlation: 'metadata-pulse' }
    : { hook: null, correlation: 'ambiguous' }
}

/**
 * Attaches one ordered Hook state only when identity is exact. Duplicate App
 * wrappers are kept; ambiguity never fans one CLI update out to every wrapper.
 */
function appStateMap(snapshot) {
  if (!snapshot || snapshot.compatibility !== 'compatible' || !Array.isArray(snapshot.entries)) return new Map()
  return new Map(snapshot.entries
    .filter((entry) => entry && LOCAL_SESSION_PATTERN.test(String(entry.sessionId || '')))
    .map((entry) => [String(entry.sessionId).toLowerCase(), entry]))
}

/**
 * Durable completion evidence must move only when the completed-turn count
 * moves. A metadata file mtime also changes for title/project/archive edits;
 * using that mtime directly would let a harmless title patch retire a newer
 * live App event. `completedEvidenceAt` is kept only in the reader's private
 * previous-metadata map and never crosses the bridge.
 */
function completedEvidenceAt(session, previousBySession) {
  const completedTurns = nonNegativeInteger(session.completedTurns)
  if (completedTurns <= 0) return 0
  const previous = previousBySession instanceof Map
    ? previousBySession.get(session.sessionId)
    : null
  if (!previous) {
    return session.lastActivityAt || session.metadataUpdatedAt || session.lastFocusedAt
  }
  const previousTurns = nonNegativeInteger(previous.completedTurns)
  if (completedTurns > previousTurns) {
    return Math.max(session.lastActivityAt, session.metadataUpdatedAt)
  }
  const retained = numberOf(previous.completedEvidenceAt)
  if (retained) return retained
  return previousTurns > 0
    ? previous.lastActivityAt || previous.metadataUpdatedAt || previous.lastFocusedAt
    : session.lastActivityAt || session.metadataUpdatedAt || session.lastFocusedAt
}

function projectedState(session, hookState, byCli, previousBySession, appSnapshot, appByLocal) {
  const exactApp = (appByLocal instanceof Map ? appByLocal : appStateMap(appSnapshot)).get(session.sessionId) || null
  const hookResult = hookForSession(session, hookState, byCli, previousBySession)
  const hook = hookResult.hook
  const appAt = Number(exactApp && exactApp.lastEventAt) || 0
  const hookAt = Number(hook && hook.lastEventAt) || 0
  const historyAt = completedEvidenceAt(session, previousBySession)
  const livePhase = (entry) => Boolean(entry && ['running', 'waiting-approval', 'waiting-input'].includes(entry.phase))
  const appSupersededByHistory = livePhase(exactApp) && historyAt > appAt
  const hookSupersededByHistory = livePhase(hook) && historyAt > hookAt

  // Latest exact App-local evidence wins ties. A newer uniquely correlated
  // Hook may still advance the row when the App log has not flushed yet.
  if (exactApp && !appSupersededByHistory && (appAt >= hookAt || hookResult.correlation === 'ambiguous' || !hook)) {
    return {
      statusCorrelation: 'direct-local',
      stateSource: 'app-log',
      stateCompatibility: 'compatible',
      stateGeneration: Number(appSnapshot.generation) || 0,
      phase: exactApp.phase,
      phaseUpdatedAt: Number(exactApp.phaseUpdatedAt) || appAt,
      turnStartedAt: Number(exactApp.turnStartedAt) || 0,
      hookActivityAt: Number(exactApp.hookActivityAt) || 0,
      waitingApprovalAt: Number(exactApp.waitingApprovalAt) || 0,
      waitingInputAt: Number(exactApp.waitingInputAt) || 0,
      lastStopAt: Number(exactApp.lastStopAt) || 0,
      lastSessionEndAt: Number(exactApp.lastSessionEndAt) || 0
    }
  }
  if (hook && !hookSupersededByHistory) {
    return {
      statusCorrelation: hookResult.correlation,
      stateSource: 'hook',
      stateCompatibility: appSnapshot && appSnapshot.compatibility === 'unsupported' ? 'fallback' : 'compatible',
      stateGeneration: 0,
      phase: hook.phase,
      phaseUpdatedAt: Number(hook.lastEventAt) || 0,
      turnStartedAt: Number(hook.turnStartedAt) || 0,
      hookActivityAt: Number(hook.lastActivityAt) || 0,
      waitingApprovalAt: Number(hook.waitingApprovalAt) || 0,
      waitingInputAt: Number(hook.waitingInputAt) || 0,
      lastStopAt: Number(hook.lastStopAt) || 0,
      lastSessionEndAt: Number(hook.lastSessionEndAt) || 0
    }
  }
  // An ambiguous current Hook is evidence that some sibling is live, but not
  // which one. Never turn every duplicate wrapper into a completed history.
  if (hookResult.correlation === 'ambiguous') {
    return {
      statusCorrelation: 'ambiguous',
      stateSource: 'none',
      stateCompatibility: appSnapshot && appSnapshot.compatibility === 'unsupported' ? 'unsupported' : 'fallback',
      stateGeneration: 0,
      phase: 'unknown',
      phaseUpdatedAt: 0,
      turnStartedAt: 0,
      hookActivityAt: 0,
      waitingApprovalAt: 0,
      waitingInputAt: 0,
      lastStopAt: 0,
      lastSessionEndAt: 0
    }
  }
  if (session.completedTurns > 0) {
    const completedAt = historyAt
    return {
      statusCorrelation: 'none',
      stateSource: 'metadata-history',
      stateCompatibility: appSnapshot && appSnapshot.compatibility === 'unsupported' ? 'fallback' : 'compatible',
      stateGeneration: 0,
      phase: 'completed',
      phaseUpdatedAt: completedAt,
      turnStartedAt: 0,
      hookActivityAt: 0,
      waitingApprovalAt: 0,
      waitingInputAt: 0,
      lastStopAt: completedAt,
      lastSessionEndAt: 0
    }
  }
  return {
    statusCorrelation: 'none',
    stateSource: 'none',
    stateCompatibility: appSnapshot && appSnapshot.compatibility === 'unsupported' ? 'unsupported' : 'fallback',
    stateGeneration: 0,
    phase: 'unknown',
    phaseUpdatedAt: 0,
    turnStartedAt: 0,
    hookActivityAt: 0,
    waitingApprovalAt: 0,
    waitingInputAt: 0,
    lastStopAt: 0,
    lastSessionEndAt: 0
  }
}

function correlateCodeSessions(sessions, hookState, previousBySession, appSnapshot) {
  const byCli = new Map()
  for (const session of sessions) {
    const rows = byCli.get(session.cliSessionId) || []
    rows.push(session)
    byCli.set(session.cliSessionId, rows)
  }
  const appByLocal = appStateMap(appSnapshot)
  const projected = sessions.map((session) => {
    const state = projectedState(session, hookState, byCli, previousBySession, appSnapshot, appByLocal)
    return {
      ...session,
      ...state
    }
  })
  return {
    sessions: projected,
    nextMetadata: new Map(sessions.map((session) => [session.sessionId, {
      ...session,
      completedEvidenceAt: completedEvidenceAt(session, previousBySession)
    }]))
  }
}

function createCodeSessionReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const setTimer = dependencies.setTimeout || setTimeout
  const clearTimer = dependencies.clearTimeout || clearTimeout
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  let watchers = []
  let notifyTimer = null
  let recoveryTimer = null
  let lastFingerprint = ''

  function codeRoot() {
    const override = textOf(dependencies.claudeCodeRoot).trim()
    return override || path.join(claudeAppDataRoot(dependencies), 'claude-code-sessions')
  }

  function userDirectories() {
    return scanUserDirectories(fs, path, codeRoot()).directories
  }

  function readMetadataFile(filePath) {
    const stat = safeStat(fs, filePath)
    if (!stat || !stat.isFile() || stat.size > CODE_METADATA_MAX_BYTES) return null
    const expectedSessionId = path.basename(filePath, '.json').toLowerCase()
    try {
      const metadata = normalizeMetadata(JSON.parse(fs.readFileSync(filePath, 'utf8')), stat, expectedSessionId)
      return metadata ? { ...metadata, projectKey: projectKeyForMetadata(dependencies, metadata) } : null
    } catch { return null }
  }

  function readInventory(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    const windowMs = Number.isFinite(settings.windowMs) ? settings.windowMs : DEFAULT_CODE_WINDOW_MS
    const sessions = []
    const discovered = scanUserDirectories(fs, path, codeRoot())
    let available = discovered.available
    for (const userDirectory of discovered.directories) {
      let names = []
      try { names = fs.readdirSync(userDirectory) } catch { available = false; continue }
      for (const name of names) {
        if (!METADATA_FILE_PATTERN.test(name)) continue
        const session = readMetadataFile(path.join(userDirectory, name))
        if (!session) continue
        const freshness = Math.max(session.lastActivityAt, session.lastFocusedAt, session.metadataUpdatedAt)
        if (freshness > 0 && now - freshness > windowMs) continue
        sessions.push(session)
      }
    }
    sessions.sort((left, right) => Math.max(right.lastActivityAt, right.lastFocusedAt)
      - Math.max(left.lastActivityAt, left.lastFocusedAt))
    const limited = sessions.slice(0, CODE_MAX_SESSIONS)
    return {
      version: 2,
      revision: CLAUDE_CODE_READER_REVISION,
      sessions: limited,
      available,
      truncated: sessions.length > limited.length,
      readAt: now
    }
  }

  function fingerprint() {
    let count = 0
    let newest = 0
    let bytes = 0
    for (const directory of userDirectories()) {
      let names = []
      try { names = fs.readdirSync(directory) } catch { continue }
      for (const name of names) {
        if (!METADATA_FILE_PATTERN.test(name)) continue
        const stat = safeStat(fs, path.join(directory, name))
        if (!stat || !stat.isFile()) continue
        count += 1
        newest = Math.max(newest, Math.round(stat.mtimeMs || 0))
        bytes += Number(stat.size) || 0
      }
    }
    return `${count}:${newest}:${bytes}`
  }

  function stopWatching() {
    if (notifyTimer) clearTimer(notifyTimer)
    notifyTimer = null
    if (recoveryTimer) clearIntervalFn(recoveryTimer)
    recoveryTimer = null
    for (const watcher of watchers) { try { watcher.close() } catch {} }
    watchers = []
  }

  function watch(listener) {
    stopWatching()
    if (typeof listener !== 'function') return () => {}
    let disposed = false
    lastFingerprint = fingerprint()
    const fire = () => {
      notifyTimer = null
      if (!disposed) { try { listener() } catch {} }
    }
    const schedule = () => {
      if (disposed || notifyTimer) return
      notifyTimer = setTimer(fire, CODE_WATCH_COALESCE_MS)
    }
    const targets = [codeRoot(), ...userDirectories()]
    for (const directory of targets) {
      try { watchers.push(fs.watch(directory, { persistent: false }, schedule)) } catch {}
    }
    recoveryTimer = setIntervalFn(() => {
      const next = fingerprint()
      if (next === lastFingerprint) return
      lastFingerprint = next
      schedule()
    }, CODE_RECOVERY_POLL_MS)
    if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
    return () => {
      disposed = true
      stopWatching()
    }
  }

  return { revision: CLAUDE_CODE_READER_REVISION, codeRoot, readInventory, watch, close: stopWatching }
}

module.exports = {
  CLAUDE_CODE_READER_REVISION,
  DEFAULT_CODE_WINDOW_MS,
  CODE_MAX_SESSIONS,
  CODE_RECOVERY_POLL_MS,
  LOCAL_SESSION_PATTERN,
  CLI_SESSION_PATTERN,
  normalizeMetadata,
  normalizedProjectRoot,
  projectKeyForMetadata,
  scanUserDirectories,
  completedEvidenceAt,
  projectedState,
  correlateCodeSessions,
  createCodeSessionReader
}
