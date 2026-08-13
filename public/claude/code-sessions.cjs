'use strict'

/**
 * Claude App Code-mode inventory.
 *
 * Only `claude-code-sessions/<org>/<user>/local_<uuid>.json` is admitted. The
 * raw metadata also contains permission settings and other App internals; this
 * module emits the identity/title/timing whitelist below and nothing else.
 */

const { claudeAppDataRoot } = require('./app-paths.cjs')

const CLAUDE_CODE_READER_REVISION = 'claude-code-sessions-v3'
const DEFAULT_CODE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const CODE_METADATA_MAX_BYTES = 1024 * 1024
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
    .filter((entry) => entry
      && LOCAL_SESSION_PATTERN.test(String(entry.sessionId || ''))
      && !(entry.evidenceProvenance === 'cold-replay' && entry.phase === 'unknown'))
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

function stateEvidenceAt(entry) {
  if (!entry) return 0
  return Math.max(
    Number(entry.lastEventAt) || 0,
    Number(entry.phaseUpdatedAt) || 0,
    Number(entry.turnStartedAt) || 0,
    Number(entry.lastStopAt) || 0,
    Number(entry.lastSessionEndAt) || 0
  )
}

function terminalEvidenceAt(entry) {
  if (!entry || !['completed', 'stopped'].includes(entry.phase)) return 0
  return Math.max(
    Number(entry.lastStopAt) || 0,
    Number(entry.lastSessionEndAt) || 0,
    Number(entry.phaseUpdatedAt) || 0,
    Number(entry.lastEventAt) || 0
  )
}

/**
 * Chooses the state authority without allowing same-Turn Hook tail activity to
 * overwrite an exact App terminal. A Hook can reactivate only by proving a
 * strictly newer parent Turn start.
 */
function selectProjectedStateSource(exactApp, hook, correlation, historyAt) {
  const appAt = stateEvidenceAt(exactApp)
  const hookAt = stateEvidenceAt(hook)
  const livePhase = (entry) => Boolean(entry && ['running', 'waiting-approval', 'waiting-input'].includes(entry.phase))
  // Metadata activity time is a proxy for "a turn completed", not proof of one.
  // It may retire a phase we only replayed or inferred, but a live App append —
  // an outstanding permission request in particular — is a directly observed
  // current fact, and `lastActivityAt` churn of that same open turn must not
  // retire it. Cold-replayed live phases are already neutralized upstream.
  const liveObserved = (entry) => entry?.evidenceProvenance === 'live-append'
  const appSupersededByHistory = livePhase(exactApp) && !liveObserved(exactApp) && historyAt > appAt
  const hookSupersededByHistory = livePhase(hook) && historyAt > hookAt

  if (exactApp && !appSupersededByHistory) {
    const appTerminalAt = terminalEvidenceAt(exactApp)
    if (appTerminalAt) {
      const hookStartsNewTurn = hook
        && !hookSupersededByHistory
        && (Number(hook.turnStartedAt) || 0) > appTerminalAt
      return hookStartsNewTurn ? 'hook' : 'app'
    }
    if (!hook || correlation === 'ambiguous' || hookSupersededByHistory) return 'app'
    return hookAt > appAt ? 'hook' : 'app'
  }
  if (hook && !hookSupersededByHistory) return 'hook'
  if (correlation === 'ambiguous') return 'ambiguous'
  if (historyAt > 0) return 'history'
  return 'none'
}

function projectedState(session, hookState, byCli, previousBySession, appSnapshot, appByLocal) {
  const exactApp = (appByLocal instanceof Map ? appByLocal : appStateMap(appSnapshot)).get(session.sessionId) || null
  const hookResult = hookForSession(session, hookState, byCli, previousBySession)
  const hook = hookResult.hook
  const historyAt = completedEvidenceAt(session, previousBySession)
  const selected = selectProjectedStateSource(exactApp, hook, hookResult.correlation, historyAt)

  if (selected === 'app') {
    const appAt = stateEvidenceAt(exactApp)
    return {
      statusCorrelation: 'direct-local',
      stateSource: 'app-log',
      stateCompatibility: 'compatible',
      stateGeneration: Number(appSnapshot && appSnapshot.generation) || 0,
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
  if (selected === 'hook') {
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
  if (selected === 'ambiguous') {
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
  if (selected === 'history' && session.completedTurns > 0) {
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
  const crypto = dependencies.crypto || require('node:crypto')
  const setIntervalFn = dependencies.setInterval || setInterval
  const clearIntervalFn = dependencies.clearInterval || clearInterval
  const watchFileFn = dependencies.watchFile
    || (typeof fs.watchFile === 'function' ? fs.watchFile.bind(fs) : null)
  const unwatchFileFn = dependencies.unwatchFile
    || (typeof fs.unwatchFile === 'function' ? fs.unwatchFile.bind(fs) : null)
  let watchers = []
  const recoveryFileWatches = new Map()
  let recoveryTimer = null
  let watchListener = null
  let scheduleWatchedPath = null
  let watchDisposed = true
  let watchedDirectories = new Set()
  let indexReady = false
  let mutationGeneration = 0
  let pathRecords = new Map()
  let sessionIndex = new Map()
  let inventoryDirectories = new Set()

  function codeRoot() {
    const override = textOf(dependencies.claudeCodeRoot).trim()
    return override || path.join(claudeAppDataRoot(dependencies), 'claude-code-sessions')
  }

  function hashBytes(bytes) {
    try { return crypto.createHash('sha256').update(bytes).digest('hex') } catch { return '' }
  }

  function fileFingerprint(stat, bytes) {
    return {
      dev: Number(stat.dev) || 0,
      ino: Number(stat.ino) || 0,
      mode: Number(stat.mode) || 0,
      size: Number(stat.size) || 0,
      mtimeMs: Math.round(Number(stat.mtimeMs) || 0),
      hash: hashBytes(bytes)
    }
  }

  function sameFingerprint(left, right) {
    return Boolean(left && right
      && left.dev === right.dev
      && left.ino === right.ino
      && left.mode === right.mode
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs
      && left.hash === right.hash)
  }

  function readFileRecord(filePath) {
    const stat = safeStat(fs, filePath)
    if (!stat || !stat.isFile() || stat.size > CODE_METADATA_MAX_BYTES) return null
    try {
      const bytes = fs.readFileSync(filePath)
      return {
        filePath,
        bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes)),
        fingerprint: fileFingerprint(stat, bytes)
      }
    } catch { return null }
  }

  function parseMetadataRecord(raw) {
    if (!raw) return null
    const expectedSessionId = path.basename(raw.filePath, '.json').toLowerCase()
    try {
      const bytes = raw.bytes
      const parsed = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes))
      const metadata = normalizeMetadata(parsed, { mtimeMs: raw.fingerprint.mtimeMs }, expectedSessionId)
      if (!metadata) return null
      return {
        ...raw,
        parsed,
        metadata: { ...metadata, projectKey: projectKeyForMetadata(dependencies, metadata) }
      }
    } catch { return null }
  }

  function readMetadataRecord(filePath) {
    return parseMetadataRecord(readFileRecord(filePath))
  }

  function rebuildSessionIndex() {
    const grouped = new Map()
    for (const record of pathRecords.values()) {
      const rows = grouped.get(record.metadata.sessionId) || []
      rows.push(record)
      grouped.set(record.metadata.sessionId, rows)
    }
    sessionIndex = new Map([...grouped].map(([sessionId, rows]) => [sessionId, rows.length === 1
      ? { status: 'unique', record: rows[0] }
      : { status: 'ambiguous' }]))
  }

  function replaceIndex(records) {
    pathRecords = new Map(records.map((record) => [record.filePath, record]))
    rebuildSessionIndex()
    indexReady = true
  }

  function activeSessionIds() {
    return new Set([...sessionIndex]
      .filter(([, entry]) => entry.status === 'unique' && entry.record.metadata.isArchived !== true)
      .map(([sessionId]) => sessionId))
  }

  function hasActiveSession(sessionId) {
    return activeSessionIds().has(textOf(sessionId).trim().toLowerCase())
  }

  function emitMutations(mutations) {
    if (!mutations.length || typeof watchListener !== 'function') return
    const acceptedAt = Date.now()
    const payload = {
      version: 1,
      revision: 'claude-task-mutation-delta-v1',
      provider: 'claude',
      generation: ++mutationGeneration,
      acceptedAt,
      mutations: mutations.map((mutation) => ({ ...mutation, acceptedAt }))
    }
    try { watchListener(payload) } catch {}
  }

  function applyExactPathChange(filePath) {
    const previous = pathRecords.get(filePath) || null
    const beforeActive = activeSessionIds()
    const next = readMetadataRecord(filePath)
    // A native file callback may arrive while a non-atomic writer still has a
    // partial JSON body on disk. That is not evidence that the task vanished:
    // retain the last verified record and let the next callback/StatWatcher
    // retry. A genuinely missing path is still an exact remove candidate.
    const currentStat = safeStat(fs, filePath)
    if (!next && currentStat?.isFile()) return []
    if (next) pathRecords.set(filePath, next)
    else pathRecords.delete(filePath)
    rebuildSessionIndex()
    const afterActive = activeSessionIds()
    const affected = new Set([
      previous?.metadata.sessionId,
      next?.metadata.sessionId
    ].filter(Boolean))
    const mutations = []
    for (const sessionId of affected) {
      if (beforeActive.has(sessionId) && !afterActive.has(sessionId)) {
        mutations.push({ key: `claude:${sessionId}`, mutation: 'remove' })
      } else if (afterActive.has(sessionId)
        && (!beforeActive.has(sessionId) || !sameFingerprint(previous?.fingerprint, next?.fingerprint))) {
        mutations.push({ key: `claude:${sessionId}`, mutation: 'upsert' })
      }
    }
    emitMutations(mutations)
    reconcileRecoveryFileWatches()
    return mutations
  }

  function recoverIndexedPaths() {
    if (watchDisposed) return
    // Recovery remains bounded to files already admitted by the private
    // inventory index; it never scans organizations, users or session roots.
    for (const record of [...pathRecords.values()]) {
      const next = readMetadataRecord(record.filePath)
      if (!next || !sameFingerprint(record.fingerprint, next.fingerprint)) {
        applyExactPathChange(record.filePath)
      }
    }
  }

  function reconcileRecoveryFileWatches() {
    if (watchDisposed || !watchListener) return
    const targets = new Set(pathRecords.keys())
    for (const [filePath, callback] of recoveryFileWatches) {
      if (targets.has(filePath)) continue
      if (unwatchFileFn) { try { unwatchFileFn(filePath, callback) } catch {} }
      recoveryFileWatches.delete(filePath)
    }
    if (watchFileFn) {
      for (const filePath of targets) {
        if (recoveryFileWatches.has(filePath)) continue
        try {
          const callback = () => {
            const previous = pathRecords.get(filePath)
            if (!previous) return
            const next = readMetadataRecord(filePath)
            if (!next || !sameFingerprint(previous.fingerprint, next.fingerprint)) {
              applyExactPathChange(filePath)
            }
          }
          watchFileFn(filePath, { persistent: false, interval: CODE_RECOVERY_POLL_MS }, callback)
          recoveryFileWatches.set(filePath, callback)
        } catch {}
      }
    }
    const needsFallback = recoveryFileWatches.size !== targets.size
    if (needsFallback && !recoveryTimer) {
      recoveryTimer = setIntervalFn(recoverIndexedPaths, CODE_RECOVERY_POLL_MS)
      if (recoveryTimer && typeof recoveryTimer.unref === 'function') recoveryTimer.unref()
    } else if (!needsFallback && recoveryTimer) {
      clearIntervalFn(recoveryTimer)
      recoveryTimer = null
    }
  }

  function reconcileWatchDirectories() {
    if (watchDisposed || !watchListener || typeof scheduleWatchedPath !== 'function') return
    const targets = new Set([
      ...inventoryDirectories,
      ...[...pathRecords.values()].map((record) => path.dirname(record.filePath))
    ])
    for (const directory of targets) {
      if (watchedDirectories.has(directory)) continue
      try {
        const watcher = fs.watch(directory, { persistent: false }, (_event, filename) => scheduleWatchedPath(directory, filename))
        watchers.push(watcher)
        watchedDirectories.add(directory)
      } catch {}
    }
    reconcileRecoveryFileWatches()
  }

  function readInventory(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    const windowMs = Number.isFinite(settings.windowMs) ? settings.windowMs : DEFAULT_CODE_WINDOW_MS
    const sessions = []
    const records = []
    const discovered = scanUserDirectories(fs, path, codeRoot())
    inventoryDirectories = new Set(discovered.directories)
    let available = discovered.available
    for (const userDirectory of discovered.directories) {
      let names = []
      try { names = fs.readdirSync(userDirectory) } catch { available = false; continue }
      for (const name of names) {
        if (!METADATA_FILE_PATTERN.test(name)) continue
        const record = readMetadataRecord(path.join(userDirectory, name))
        if (!record) continue
        records.push(record)
        const session = record.metadata
        // Archived rows remain readable through the exact private state probe
        // below, but they are no longer part of the active Companion inventory.
        if (session.isArchived) continue
        const freshness = Math.max(session.lastActivityAt, session.lastFocusedAt, session.metadataUpdatedAt)
        if (freshness > 0 && now - freshness > windowMs) continue
        sessions.push(session)
      }
    }
    replaceIndex(records)
    // Host authority subscribes before the first cold inventory read. Install
    // directory watchers as soon as that read admits the exact directories so
    // newly-created local_*.json sessions do not wait for another full scan.
    reconcileWatchDirectories()
    sessions.sort((left, right) => Math.max(right.lastActivityAt, right.lastFocusedAt)
      - Math.max(left.lastActivityAt, left.lastFocusedAt))
    return {
      version: 2,
      revision: CLAUDE_CODE_READER_REVISION,
      sessions,
      available,
      truncated: false,
      readAt: now
    }
  }

  /** Exact, privacy-bounded state for post-action verification. */
  function readSessionState(sessionId) {
    const expected = textOf(sessionId).trim().toLowerCase()
    if (!LOCAL_SESSION_PATTERN.test(expected)) return { status: 'invalid' }
    if (!indexReady) return { status: 'unavailable' }
    const entry = sessionIndex.get(expected)
    if (!entry) return { status: 'missing' }
    if (entry.status !== 'unique') return { status: 'ambiguous' }
    const latest = readMetadataRecord(entry.record.filePath)
    if (!latest) {
      pathRecords.delete(entry.record.filePath)
      rebuildSessionIndex()
      return { status: 'missing' }
    }
    pathRecords.set(latest.filePath, latest)
    rebuildSessionIndex()
    const refreshed = sessionIndex.get(expected)
    if (!refreshed || refreshed.status !== 'unique') return refreshed ? { status: 'ambiguous' } : { status: 'missing' }
    const session = refreshed.record.metadata
    return {
      status: 'found',
      sessionId: session.sessionId,
      isArchived: session.isArchived,
      lastFocusedAt: session.lastFocusedAt,
      metadataUpdatedAt: session.metadataUpdatedAt
    }
  }

  function readIndexedSession(sessionId) {
    const state = readSessionState(sessionId)
    if (state.status !== 'found') return state
    const entry = sessionIndex.get(String(sessionId).toLowerCase())
    return entry?.status === 'unique'
      ? { status: 'found', session: { ...entry.record.metadata } }
      : { status: 'ambiguous' }
  }

  function semanticWithoutArchive(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    const clone = { ...value }
    delete clone.isArchived
    try { return JSON.stringify(clone) } catch { return '' }
  }

  function tempPathFor(filePath, label) {
    const token = typeof crypto.randomBytes === 'function'
      ? crypto.randomBytes(8).toString('hex')
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    return path.join(path.dirname(filePath), `.${path.basename(filePath)}.eypc-${label}-${token}.tmp`)
  }

  function removeTemp(filePath) {
    try { fs.unlinkSync(filePath) } catch {}
  }

  function atomicReplace(filePath, expectedFingerprint, bytes, mode, label) {
    const before = readFileRecord(filePath)
    if (!before || !sameFingerprint(before.fingerprint, expectedFingerprint)) return { status: 'state-changed' }
    const tempPath = tempPathFor(filePath, label)
    let descriptor = null
    try {
      descriptor = fs.openSync(tempPath, 'wx', mode & 0o777)
      fs.writeFileSync(descriptor, bytes)
      if (typeof fs.fsyncSync === 'function') fs.fsyncSync(descriptor)
      fs.closeSync(descriptor)
      descriptor = null
      const beforeRename = readFileRecord(filePath)
      if (!beforeRename || !sameFingerprint(beforeRename.fingerprint, expectedFingerprint)) {
        removeTemp(tempPath)
        return { status: 'state-changed' }
      }
      fs.renameSync(tempPath, filePath)
      const written = readFileRecord(filePath)
      return written
        ? { status: 'written', raw: written, record: parseMetadataRecord(written) }
        : { status: 'unreadable' }
    } catch {
      if (descriptor !== null) { try { fs.closeSync(descriptor) } catch {} }
      removeTemp(tempPath)
      return { status: 'failed' }
    }
  }

  function archiveSessionMetadata(sessionId) {
    const expected = textOf(sessionId).trim().toLowerCase()
    if (!LOCAL_SESSION_PATTERN.test(expected)) return { outcome: 'failed', errorCode: 'invalid-target' }
    if (!indexReady) return { outcome: 'indeterminate', errorCode: 'index-unavailable' }
    const entry = sessionIndex.get(expected)
    if (!entry) return { outcome: 'failed', errorCode: 'state-changed' }
    if (entry.status !== 'unique') return { outcome: 'failed', errorCode: 'ambiguous-target' }
    const original = readMetadataRecord(entry.record.filePath)
    if (!original) return { outcome: 'indeterminate', errorCode: 'source-changed' }
    // Claude may update title/focus/activity metadata between the inventory
    // snapshot and the archive click. Rebase onto that exact, still-unique
    // canonical file instead of treating benign metadata churn as a conflict.
    if (!sameFingerprint(original.fingerprint, entry.record.fingerprint)) {
      pathRecords.set(original.filePath, original)
      rebuildSessionIndex()
      const refreshed = sessionIndex.get(expected)
      if (!refreshed) return { outcome: 'failed', errorCode: 'state-changed' }
      if (refreshed.status !== 'unique' || refreshed.record.filePath !== original.filePath) {
        return { outcome: 'failed', errorCode: 'ambiguous-target' }
      }
    }
    if (original.metadata.isArchived === true) {
      pathRecords.set(original.filePath, original)
      rebuildSessionIndex()
      emitMutations([{ key: `claude:${expected}`, mutation: 'remove' }])
      return { outcome: 'archived', alreadyArchived: true }
    }
    if (!original.parsed || typeof original.parsed !== 'object' || Array.isArray(original.parsed)) {
      return { outcome: 'failed', errorCode: 'invalid-metadata' }
    }
    const nextParsed = { ...original.parsed, isArchived: true }
    const nextBytes = Buffer.from(JSON.stringify(nextParsed))
    const written = atomicReplace(
      original.filePath,
      original.fingerprint,
      nextBytes,
      original.fingerprint.mode,
      'archive'
    )
    if (written.status !== 'written') {
      return {
        outcome: written.status === 'state-changed' ? 'indeterminate' : 'failed',
        errorCode: written.status === 'state-changed' ? 'source-changed' : 'write-failed'
      }
    }
    try { dependencies.afterClaudeArchiveRename?.(original.filePath) } catch {}
    const verified = readMetadataRecord(original.filePath)
    const semanticMatch = verified?.metadata.isArchived === true
      && semanticWithoutArchive(verified.parsed) === semanticWithoutArchive(original.parsed)
      && dependencies.validateClaudeArchiveWrite?.(verified.parsed) !== false
    if (semanticMatch) {
      pathRecords.set(verified.filePath, verified)
      rebuildSessionIndex()
      emitMutations([{ key: `claude:${expected}`, mutation: 'remove' }])
      return { outcome: 'archived', alreadyArchived: false }
    }
    const current = readFileRecord(original.filePath)
    if (!current || !sameFingerprint(current.fingerprint, written.raw.fingerprint)) {
      return { outcome: 'indeterminate', errorCode: 'concurrent-write' }
    }
    const rollback = atomicReplace(
      original.filePath,
      current.fingerprint,
      original.bytes,
      original.fingerprint.mode,
      'rollback'
    )
    if (rollback.status !== 'written'
      || rollback.raw.fingerprint.hash !== original.fingerprint.hash
      || !rollback.record) {
      return { outcome: 'indeterminate', errorCode: 'rollback-unconfirmed' }
    }
    pathRecords.set(rollback.record.filePath, rollback.record)
    rebuildSessionIndex()
    return { outcome: 'failed', errorCode: 'verification-failed' }
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
    for (const watcher of watchers) { try { watcher.close() } catch {} }
    watchers = []
    watchedDirectories = new Set()
    scheduleWatchedPath = null
    watchDisposed = true
  }

  function watch(listener) {
    stopWatching()
    if (typeof listener !== 'function') return () => {}
    watchDisposed = false
    watchListener = listener
    scheduleWatchedPath = (directory, filename) => {
      if (watchDisposed) return
      const name = Buffer.isBuffer(filename) ? filename.toString('utf8') : textOf(filename)
      if (!METADATA_FILE_PATTERN.test(name)) return
      const filePath = path.join(directory, name)
      // Do not put the first exact membership change behind a timer that a
      // background-hidden WebContents can throttle. Invalid partial JSON is
      // retained above and retried by the native recovery watcher.
      applyExactPathChange(filePath)
    }
    reconcileWatchDirectories()
    return () => {
      watchDisposed = true
      if (watchListener === listener) watchListener = null
      stopWatching()
    }
  }

  function close() {
    stopWatching()
    watchListener = null
    indexReady = false
    pathRecords = new Map()
    sessionIndex = new Map()
    inventoryDirectories = new Set()
  }

  return {
    revision: CLAUDE_CODE_READER_REVISION,
    codeRoot,
    readInventory,
    readSessionState,
    readIndexedSession,
    hasActiveSession,
    archiveSessionMetadata,
    watch,
    close
  }
}

module.exports = {
  CLAUDE_CODE_READER_REVISION,
  DEFAULT_CODE_WINDOW_MS,
  CODE_RECOVERY_POLL_MS,
  LOCAL_SESSION_PATTERN,
  CLI_SESSION_PATTERN,
  normalizeMetadata,
  normalizedProjectRoot,
  projectKeyForMetadata,
  scanUserDirectories,
  completedEvidenceAt,
  selectProjectedStateSource,
  projectedState,
  correlateCodeSessions,
  createCodeSessionReader
}
