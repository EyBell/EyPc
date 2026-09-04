'use strict'

/**
 * Claude companion bridge facade.
 *
 * This module composes the Claude provider and is the only surface the main
 * preload mounts. It is deliberately independent of the Codex bridge: a failure
 * here degrades Claude alone and can never disturb Codex inventory, quota or
 * the floating window.
 *
 * Direct write scope is registration plus one version-gated, uniquely indexed
 * App-local `isArchived` transaction. The sidebar star (`isStarred`) is
 * inbound-only. No path crosses this facade, and no LevelDB, transcript or
 * non-target session is written.
 */

const CLAUDE_BRIDGE_REVISION = 'claude-code-companion-v7'
const CLAUDE_HOT_UNREAD_MAX_IDS = 500

const { createEventQueue } = require('./events.cjs')
const { createEnvironmentProbe } = require('./environment.cjs')
const { createOpener } = require('./open.cjs')
const { createQuotaFallback } = require('./quota.cjs')
const { createCodeSessionReader, correlateCodeSessions, LOCAL_SESSION_PATTERN } = require('./code-sessions.cjs')
const { createUnreadReader } = require('./unread.cjs')
const { createPlanUsageReader } = require('./plan-usage.cjs')
const { createAppStateReader } = require('./app-state.cjs')
const { createArchiveAdapter } = require('./archive.cjs')
const {
  HOOK_SCRIPT_NAME,
  STATUSLINE_SCRIPT_NAME,
  QUOTA_FILE_NAME,
  hookScript,
  statuslineScript,
  settingsCommandLine,
  parseQuotaCache
} = require('./scripts.cjs')
const {
  EYPC_MARKER,
  withEypcHooks,
  withoutEypcHooks,
  withEypcStatusline,
  withoutEypcStatusline,
  chainedStatusLineCommand
} = require('./settings.cjs')

const EYPC_MARKER_TOKEN = EYPC_MARKER

function createClaudeBridge(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const dataDirectory = dependencies.dataDirectory

  const environment = createEnvironmentProbe(dependencies)
  const queue = createEventQueue({ ...dependencies, fs, path, directory: dataDirectory })
  const opener = createOpener(dependencies)
  const quotaFallback = createQuotaFallback(dependencies)
  const codeSessions = createCodeSessionReader(dependencies)
  const unread = createUnreadReader(dependencies)
  const planUsage = createPlanUsageReader(dependencies)
  const appState = createAppStateReader(dependencies)

  const hookCommandPath = path.join(dataDirectory, HOOK_SCRIPT_NAME)
  const statuslineCommandPath = path.join(dataDirectory, STATUSLINE_SCRIPT_NAME)
  const quotaPath = path.join(dataDirectory, QUOTA_FILE_NAME)

  // Filesystem paths are what we write; shell-quoted command lines are what we
  // register. Registration and the install-state comparison must use the exact
  // same string, otherwise a correctly installed hook reads back as `outdated`
  // forever and the settings page keeps asking the user to register again.
  const hookCommandLine = settingsCommandLine(hookCommandPath, dependencies.platform)
  const statuslineCommandLine = settingsCommandLine(statuslineCommandPath, dependencies.platform)

  let eventWatchDispose = null
  let appStateWatchDispose = null
  let codeWatchDispose = null
  let unreadWatchDispose = null
  const eventWatchListeners = new Set()
  const codeWatchListeners = new Set()
  const unreadWatchListeners = new Set()
  let previousCodeMetadata = new Map()
  let lastCodeInventory = null
  let codeStateGeneration = 0
  let lastCodeStateFingerprint = ''
  let lastPersistedUnreadSnapshot = null
  let mergedUnreadGeneration = 0
  let lastMergedUnreadFingerprint = ''
  const acknowledgedHotUnreadHints = new Map()

  function broadcastEventWatchers() {
    for (const subscriber of eventWatchListeners) {
      try { subscriber() } catch {}
    }
  }

  function broadcastUnreadWatchers() {
    for (const subscriber of unreadWatchListeners) {
      try { subscriber() } catch {}
    }
  }

  function ensureAppStateWatcher() {
    if (appStateWatchDispose || (!eventWatchListeners.size && !unreadWatchListeners.size)) return
    appStateWatchDispose = appState.watch(() => {
      broadcastEventWatchers()
      broadcastUnreadWatchers()
    })
  }

  function releaseAppStateWatcherIfUnused() {
    if (eventWatchListeners.size || unreadWatchListeners.size || !appStateWatchDispose) return
    appStateWatchDispose()
    appStateWatchDispose = null
  }

  function readCurrentSessionObservation(sessionId) {
    queue.rotateIfNeeded()
    queue.drain()
    const indexed = codeSessions.readIndexedSession(sessionId)
    if (indexed.status !== 'found') return { status: indexed.status }
    const appSnapshot = appState.read()
    const correlated = correlateCodeSessions([indexed.session], queue.state(), previousCodeMetadata, appSnapshot)
    previousCodeMetadata = correlated.nextMetadata
    const session = correlated.sessions[0]
    if (!session) return { status: 'missing' }
    return { status: 'found', session }
  }

  function readCurrentSessionPhase(sessionId) {
    const current = readCurrentSessionObservation(sessionId)
    if (current.status !== 'found') return current
    const session = current.session
    return {
      status: 'found',
      phase: session.phase,
      phaseUpdatedAt: session.phaseUpdatedAt,
      compatibility: session.stateCompatibility,
      source: session.stateSource
    }
  }

  const archive = createArchiveAdapter({
    ...dependencies,
    codeSessions,
    appState,
    readCurrentSessionPhase
  })

  // An Esc interrupt fires no hook at all, so hook-folded phases keep an
  // interrupted CLI turn "running" until the next prompt. The transcript tail
  // is the one durable witness; a failed probe load degrades to the hook-only
  // baseline.
  let interruptProbe = null
  try {
    const { createClaudeInterruptProbe } = require('./interrupt-probe.cjs')
    interruptProbe = createClaudeInterruptProbe({
      fs,
      path,
      projectsRoot: path.join(dependencies.os.homedir(), '.claude', 'projects')
    })
  } catch { interruptProbe = null }

  function withTranscriptInterrupts(sessions) {
    if (!interruptProbe || !Array.isArray(sessions)) return sessions
    return sessions.map((session) => {
      const phase = session?.phase
      if (phase !== 'running' && phase !== 'waiting-input' && phase !== 'waiting-approval') return session
      const startedAt = Number(session.turnStartedAt) || 0
      if (!startedAt) return session
      const at = interruptProbe.claudeInterruptedAt(session.sessionId, startedAt)
      if (!at) return session
      return { ...session, phase: 'stopped', phaseUpdatedAt: at, waitingApprovalAt: 0, waitingInputAt: 0 }
    })
  }

  function stateEnvelope(sessions, appSnapshot, readAt) {
    const stateRows = sessions.map((session) => ({
      sessionId: session.sessionId,
      source: session.stateSource,
      compatibility: session.stateCompatibility,
      phase: session.phase,
      phaseUpdatedAt: session.phaseUpdatedAt,
      turnStartedAt: session.turnStartedAt,
      waitingApprovalAt: session.waitingApprovalAt,
      waitingInputAt: session.waitingInputAt,
      lastStopAt: session.lastStopAt,
      lastSessionEndAt: session.lastSessionEndAt,
      // Topology belongs to the state lane, not metadata delivery. Keep the
      // fingerprint private but make a child-only transition advance the state
      // generation so it cannot wait for an unrelated metadata write.
      subagents: (Array.isArray(session.subagents) ? session.subagents : [])
        .map((child) => ({
          agentId: String(child?.agentId || ''),
          active: child?.active === true,
          startedAt: Number(child?.startedAt) || 0,
          stoppedAt: Number(child?.stoppedAt) || 0,
          lastActivityAt: Number(child?.lastActivityAt) || 0
        }))
        .sort((left, right) => left.agentId.localeCompare(right.agentId))
    }))
    const fingerprint = JSON.stringify(stateRows)
    if (fingerprint !== lastCodeStateFingerprint) {
      lastCodeStateFingerprint = fingerprint
      codeStateGeneration += 1
    }
    const sources = new Set(stateRows.map((row) => row.source).filter((source) => source && source !== 'none'))
    const source = sources.size > 1 ? 'mixed' : sources.values().next().value || 'none'
    const compatibility = stateRows.some((row) => row.compatibility === 'compatible')
      ? 'compatible'
      : stateRows.some((row) => row.compatibility === 'fallback')
        ? 'fallback'
        : appSnapshot.compatibility || 'unsupported'
    const newestEvidenceAt = stateRows.reduce((latest, row) => Math.max(
      latest,
      Number(row.phaseUpdatedAt) || 0,
      Number(row.turnStartedAt) || 0,
      Number(row.waitingApprovalAt) || 0,
      Number(row.waitingInputAt) || 0,
      Number(row.lastStopAt) || 0,
      Number(row.lastSessionEndAt) || 0
    ), 0)
    return {
      generation: codeStateGeneration,
      source,
      freshness: { readAt, newestEvidenceAt },
      compatibility,
      // Compatibility fields for a Renderer that predates the named V2 delta.
      stateGeneration: codeStateGeneration,
      stateCompatibility: compatibility
    }
  }

  function inspect() {
    return environment.inspect({
      hookCommand: hookCommandLine,
      statuslineCommand: statuslineCommandLine,
      cliVersionHint: ''
    })
  }

  function writeExecutable(filePath, contents) {
    fs.mkdirSync(dataDirectory, { recursive: true })
    fs.writeFileSync(filePath, contents, { mode: 0o755 })
    try { fs.chmodSync(filePath, 0o755) } catch { /* filesystem without exec bits */ }
  }

  /**
   * Replaces the settings file atomically, keeping a one-generation backup of
   * whatever was there before. The caller must already have proven the current
   * contents were understood — see `readableSettings()`.
   */
  function writeSettings(next, previousRaw) {
    const settingsPath = environment.settingsPath()
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    if (typeof previousRaw === 'string' && previousRaw) {
      try { fs.writeFileSync(`${settingsPath}.eypc-bak`, previousRaw) } catch { /* backup is best effort */ }
    }
    const serialized = `${JSON.stringify(next, null, 2)}\n`
    const temporary = `${settingsPath}.eypc-tmp`
    fs.writeFileSync(temporary, serialized)
    fs.renameSync(temporary, settingsPath)
  }

  /**
   * Returns the current settings only when they were fully understood. An
   * unparseable or unreadable file is a hard stop: writing over it would
   * destroy configuration the user still owns.
   */
  function readableSettings() {
    const result = environment.inspectSettingsFile()
    if (result.state === 'unparseable' || result.state === 'unreadable') {
      return { ok: false, message: result.reason || '无法安全读取 settings.json' }
    }
    return { ok: true, value: result.value, raw: result.raw }
  }

  /**
   * Registers the companion. This is the bridge's only write into the user's
   * Claude installation and the caller must have obtained an explicit
   * confirmation before invoking it.
   */
  function install(options) {
    const settings = options || {}
    const current = readableSettings()
    if (!current.ok) return { ok: false, message: current.message }
    try {
      queue.ensureQueueFile()
      writeExecutable(hookCommandPath, hookScript({ queuePath: queue.queuePath }))
      let next = withEypcHooks(current.value, { command: hookCommandLine })
      if (settings.statusline !== false) {
        // Only a status line that is not ours may be chained to. Matching on the
        // marker rather than on a file name is what stops a re-install from
        // wiring the wrapper into itself, which would recurse on every render.
        const chained = chainedStatusLineCommand(next) || (() => {
          const command = next.statusLine && typeof next.statusLine.command === 'string' ? next.statusLine.command : ''
          return command && !command.includes(EYPC_MARKER_TOKEN) ? command : ''
        })()
        writeExecutable(statuslineCommandPath, statuslineScript({ quotaPath, chainedCommand: chained }))
        next = withEypcStatusline(next, { command: statuslineCommandLine })
      }
      writeSettings(next, current.raw)
      return { ok: true, hooks: 'installed', statusline: settings.statusline === false ? 'missing' : 'installed' }
    } catch (error) {
      return { ok: false, message: error && error.message ? String(error.message) : '注册失败' }
    }
  }

  /**
   * Removes every entry the companion added to the user's settings and restores
   * any status line it replaced. The generated scripts and EyPc's own queue and
   * quota cache stay in EyPc's data directory; nothing outside that directory is
   * left behind.
   */
  function uninstall() {
    const current = readableSettings()
    if (!current.ok) return { ok: false, message: current.message }
    try {
      writeSettings(withoutEypcStatusline(withoutEypcHooks(current.value)), current.raw)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error && error.message ? String(error.message) : '注销失败' }
    }
  }

  function readQuota() {
    try {
      return parseQuotaCache(fs.readFileSync(quotaPath, 'utf8'))
    } catch {
      return null
    }
  }

  /**
   * Optional fallback read. Separated from `readSnapshot` because it is
   * asynchronous and opt-in: the synchronous snapshot must never block on a
   * network call.
   */
  async function readQuotaFallback(options) {
    const settings = options || {}
    const cached = readQuota()
    return quotaFallback.read({
      enabled: settings.enabled === true,
      coldStart: settings.coldStart === true,
      supplement: settings.supplement === true,
      now: settings.now,
      minStaleMs: settings.minStaleMs,
      refreshIntervalMs: settings.refreshIntervalMs,
      force: settings.force === true,
      primaryUpdatedAt: cached ? cached.updatedAt : 0,
      claudeHome: environment.claudeHome()
    })
  }

  function readSnapshot(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    const quota = readQuota()
    return {
      version: 1,
      revision: CLAUDE_BRIDGE_REVISION,
      // V1 compatibility only. Production inventory is `readCodeSnapshot`.
      sessions: [],
      truncated: false,
      quota: quota ? { rateLimits: quota.rateLimits, updatedAt: quota.updatedAt } : null,
      readAt: now
    }
  }

  function readCodeSnapshot(options) {
    queue.rotateIfNeeded()
    queue.drain()
    const inventory = codeSessions.readInventory(options)
    const appSnapshot = appState.read()
    if (inventory.available === false) {
      const readAt = Number(inventory.readAt) || Date.now()
      return {
        ...inventory,
        sessions: [],
        ...stateEnvelope([], appSnapshot, readAt)
      }
    }
    const correlated = correlateCodeSessions(inventory.sessions, queue.state(), previousCodeMetadata, appSnapshot)
    previousCodeMetadata = correlated.nextMetadata
    lastCodeInventory = inventory
    const readAt = Number(inventory.readAt) || Date.now()
    const sessions = withTranscriptInterrupts(correlated.sessions)
    return {
      ...inventory,
      sessions,
      topologyComplete: correlated.topologyComplete,
      ...stateEnvelope(sessions, appSnapshot, readAt)
    }
  }

  /**
   * State-only hot read. It reuses the last admitted Code inventory, drains the
   * two lifecycle sources and never touches unread, quota or App metadata.
   */
  function readCodeStateSnapshot(options) {
    queue.rotateIfNeeded()
    queue.drain()
    if (!lastCodeInventory) {
      const inventory = codeSessions.readInventory(options)
      if (inventory.available === false) {
        const appSnapshot = appState.read()
        const readAt = Date.now()
        return {
          version: 2,
          revision: `${CLAUDE_BRIDGE_REVISION}:state-v2`,
          sessions: [],
          available: false,
          truncated: false,
          readAt,
          ...stateEnvelope([], appSnapshot, readAt)
        }
      }
      lastCodeInventory = inventory
    }
    const appSnapshot = appState.read()
    const correlated = correlateCodeSessions(lastCodeInventory.sessions, queue.state(), previousCodeMetadata, appSnapshot)
    previousCodeMetadata = correlated.nextMetadata
    const readAt = Date.now()
    const sessions = withTranscriptInterrupts(correlated.sessions)
    return {
      version: 2,
      revision: `${CLAUDE_BRIDGE_REVISION}:state-v2`,
      sessions,
      topologyComplete: correlated.topologyComplete,
      truncated: lastCodeInventory.truncated === true,
      readAt,
      ...stateEnvelope(sessions, appSnapshot, readAt)
    }
  }

  // Only the App-owned local id is accepted. No CLI import route exists.
  function openTask(sessionId) {
    const current = codeSessions.readSessionState(String(sessionId || ''))
    if (current.status !== 'found' || current.isArchived === true) {
      return Promise.resolve({
        outcome: 'unavailable',
        confirmsRead: false,
        errorCode: 'state-changed',
        message: current.isArchived === true
          ? 'Claude 任务已归档，未重新打开'
          : 'Claude 任务身份已变化，请刷新后重试'
      })
    }
    return opener.openTask(String(sessionId || ''), { platform: dependencies.platform })
  }

  function archiveCodeSession(sessionId) {
    return archive.archiveCodeSession(String(sessionId || ''))
  }

  function readAppPresence() {
    return opener.readPresence()
  }

  /**
   * Multiplexes one underlying hook/App-state watcher to every current owner.
   * Host authority and a mounted Renderer may coexist; replacing one callback
   * with the other would silently drop state transitions for one consumer.
   */
  function watchEvents(listener, options) {
    if (typeof listener !== 'function') return () => {}
    eventWatchListeners.add(listener)
    if (!eventWatchDispose) {
      eventWatchDispose = queue.watch(broadcastEventWatchers, options)
    }
    ensureAppStateWatcher()
    return () => {
      eventWatchListeners.delete(listener)
      if (!eventWatchListeners.size && eventWatchDispose) {
        eventWatchDispose()
        eventWatchDispose = null
      }
      releaseAppStateWatcherIfUnused()
    }
  }

  function watchCodeSessions(listener) {
    if (typeof listener !== 'function') return () => {}
    codeWatchListeners.add(listener)
    if (!codeWatchDispose) {
      codeWatchDispose = codeSessions.watch((delta) => {
        const source = delta && typeof delta === 'object' ? delta : null
        if (!source || !Array.isArray(source.mutations)) {
          for (const subscriber of codeWatchListeners) {
            try { subscriber() } catch {}
          }
          return
        }
        const hookSessions = queue.state()
        const mutations = source.mutations.map((mutation) => {
          if (mutation?.mutation !== 'upsert') return mutation
          const prefix = 'claude:'
          const sessionId = typeof mutation.key === 'string' && mutation.key.startsWith(prefix)
            ? mutation.key.slice(prefix.length).toLowerCase()
            : ''
          if (!LOCAL_SESSION_PATTERN.test(sessionId)) return mutation
          // A membership callback owns only exact indexed metadata. State,
          // interaction and topology are read and published by their separate
          // Host lane after this delta has already been delivered. The Host
          // link is identity metadata and rides along so a metadata upsert can
          // be deferred to the CodexHost lane like the state rows are.
          const current = codeSessions.readIndexedSession(sessionId)
          if (current.status !== 'found') return mutation
          const hook = hookSessions instanceof Map
            ? hookSessions.get(sessionId) || hookSessions.get(current.session?.cliSessionId)
            : null
          const hostThreadId = typeof hook?.hostThreadId === 'string' ? hook.hostThreadId : ''
          return {
            ...mutation,
            session: hostThreadId ? { ...current.session, codexhostThreadId: hostThreadId } : current.session
          }
        })
        if (lastCodeInventory) {
          const nextBySession = new Map(lastCodeInventory.sessions.map((session) => [session.sessionId, session]))
          for (const mutation of mutations) {
            if (mutation?.mutation === 'remove' || mutation?.mutation === 'archived') {
              for (const sessionId of nextBySession.keys()) {
                if (`claude:${sessionId}` === mutation.key) nextBySession.delete(sessionId)
              }
            } else if (mutation?.mutation === 'upsert' && mutation.session) {
              nextBySession.set(mutation.session.sessionId, mutation.session)
            }
          }
          lastCodeInventory = {
            ...lastCodeInventory,
            sessions: [...nextBySession.values()],
            readAt: Number(source.acceptedAt) || Date.now()
          }
        }
        for (const subscriber of codeWatchListeners) {
          try { subscriber({ ...source, mutations }) } catch {}
        }
      })
    }
    return () => {
      codeWatchListeners.delete(listener)
      if (codeWatchListeners.size || !codeWatchDispose) return
      codeWatchDispose()
      codeWatchDispose = null
    }
  }

  // New name documents that this watcher owns phase only. `watchEvents` stays
  // as a compatibility alias for a long-lived Renderer/preload pair.
  function watchCodeState(listener, options) {
    return watchEvents(listener, options)
  }

  function watchCodeUnread(listener) {
    if (typeof listener !== 'function') return () => {}
    unreadWatchListeners.add(listener)
    if (!unreadWatchDispose) {
      unreadWatchDispose = unread.watch(broadcastUnreadWatchers)
    }
    ensureAppStateWatcher()
    return () => {
      unreadWatchListeners.delete(listener)
      if (!unreadWatchListeners.size && unreadWatchDispose) {
        unreadWatchDispose()
        unreadWatchDispose = null
      }
      releaseAppStateWatcherIfUnused()
    }
  }

  /**
   * Latest quota sample the desktop app itself recorded. Credential-free and
   * independent of whether Claude Code has rendered a status line recently, so
   * it is the lane that keeps the reading moving at the app's own cadence.
   */
  function readPlanUsage() {
    return planUsage.read()
  }

  /**
   * The App's own unread set. `null` means the reading failed, which is
   * deliberately distinct from an empty set — see the reader for why that
   * distinction is load-bearing.
   */
  async function readCodeUnread() {
    const previousPersisted = lastPersistedUnreadSnapshot
    const persisted = await unread.read()
    if (persisted && Array.isArray(persisted.ids)) lastPersistedUnreadSnapshot = persisted
    const baseline = persisted || lastPersistedUnreadSnapshot
    if (!baseline || !Array.isArray(baseline.ids)) return null

    // Re-read the append-only App log after the async LevelDB snapshot so a
    // completion/focus edge that arrived during the copy cannot be published
    // one cycle late. The exact grammar remains private to app-state.cjs.
    appState.read()
    const hot = appState.readHotUnread()
    const ids = new Set(baseline.ids.filter((id) => LOCAL_SESSION_PATTERN.test(id)))
    if (hot?.compatibility === 'compatible') {
      const hints = Array.isArray(hot.hints) ? hot.hints.slice(0, CLAUDE_HOT_UNREAD_MAX_IDS) : []
      const currentHintIds = new Set(hints.map((hint) => hint?.sessionId).filter((id) => LOCAL_SESSION_PATTERN.test(id)))
      for (const sessionId of acknowledgedHotUnreadHints.keys()) {
        if (!currentHintIds.has(sessionId)) acknowledgedHotUnreadHints.delete(sessionId)
      }
      for (const hint of hints) {
        if (!LOCAL_SESSION_PATTERN.test(hint?.sessionId) || !Number.isFinite(hint?.updatedAt)) continue
        const hintRevision = Number(hint.revision) || Number(hint.updatedAt) || 0
        let hintState = acknowledgedHotUnreadHints.get(hint.sessionId)
        if (!hintState || Number(hintState.revision) !== hintRevision) {
          const initial = previousPersisted || baseline
          const initialIds = new Set(Array.isArray(initial?.ids) ? initial.ids : [])
          const initialUnread = initialIds.has(hint.sessionId)
          hintState = {
            revision: hintRevision,
            baselineGeneration: Number(initial?.generation) || 0,
            baselineFingerprint: String(initial?.sourceFingerprint || ''),
            sawOpposite: initialUnread !== (hint.unread === true),
            acknowledged: false
          }
          acknowledgedHotUnreadHints.set(hint.sessionId, hintState)
        }
        if (hintState.acknowledged === true) continue
        const persistedMatches = ids.has(hint.sessionId) === (hint.unread === true)
        const persistedAdvanced = persisted && (
          Number(persisted.generation) > Number(hintState.baselineGeneration)
          || String(persisted.sourceFingerprint || '') !== String(hintState.baselineFingerprint || '')
        )
        const persistedAfterHint = persistedAdvanced
          && Number(persisted.readAt) >= Number(hint.updatedAt)
        if (persistedAfterHint && !persistedMatches) hintState.sawOpposite = true
        // Equality alone is insufficient: the LevelDB set may already contain
        // the same value from the previous completion epoch. Release the hot
        // edge only after this session has crossed the opposite persisted
        // state and a post-event snapshot catches up again.
        if (persistedAfterHint && persistedMatches && hintState.sawOpposite === true) {
          hintState.acknowledged = true
          continue
        }
        if (hint.unread === true) ids.add(hint.sessionId)
        else ids.delete(hint.sessionId)
      }
    }
    const mergedIds = [...ids].sort()
    const crypto = dependencies.crypto || require('node:crypto')
    const semantic = JSON.stringify(mergedIds)
    if (semantic !== lastMergedUnreadFingerprint) {
      lastMergedUnreadFingerprint = semantic
      mergedUnreadGeneration += 1
    }
    let sourceFingerprint = ''
    try {
      sourceFingerprint = crypto.createHash('sha256')
        .update(`${baseline.sourceFingerprint || ''}\0${Number(hot?.generation) || 0}\0${semantic}`)
        .digest('hex')
        .slice(0, 32)
    } catch {
      sourceFingerprint = String(baseline.sourceFingerprint || '').slice(0, 32)
    }
    return {
      version: 2,
      revision: `${CLAUDE_BRIDGE_REVISION}:unread-hot-v1`,
      ids: mergedIds,
      readAt: Date.now(),
      generation: mergedUnreadGeneration,
      sourceFingerprint
    }
  }

  /** Safe diagnostics only; raw status text, identities and credentials stay private. */
  function diagnostics() {
    const quota = quotaFallback.diagnostics()
    const failure = String(quota.lastFailure || '')
    const status = !quota.lastAttemptAt
      ? 'idle'
      : !failure
        ? 'ok'
        : failure === 'credential-unavailable' || failure === 'http-401' || failure === 'http-403'
          ? 'credential-unavailable'
          : failure === 'http-429'
            ? 'rate-limited'
            : 'failed'
    return {
      quotaAccess: {
        status,
        lastAttemptAt: Number(quota.lastAttemptAt) || 0,
        retryAt: Number.isFinite(quota.nextAllowedAt) && quota.nextAllowedAt < Number.MAX_SAFE_INTEGER
          ? Math.max(0, Number(quota.nextAllowedAt))
          : 0,
        // Bounded failure code and schedule reason for diagnostics only; never
        // status text, identities or credentials.
        reason: failure.slice(0, 40),
        blockedBy: String(quota.nextAllowedReason || '').slice(0, 20)
      }
    }
  }

  function close() {
    if (eventWatchDispose) {
      eventWatchDispose()
      eventWatchDispose = null
    }
    if (appStateWatchDispose) {
      appStateWatchDispose()
      appStateWatchDispose = null
    }
    queue.reset()
    quotaFallback.reset()
    if (codeWatchDispose) codeWatchDispose()
    if (unreadWatchDispose) unreadWatchDispose()
    codeWatchDispose = null
    unreadWatchDispose = null
    eventWatchListeners.clear()
    codeWatchListeners.clear()
    unreadWatchListeners.clear()
    previousCodeMetadata = new Map()
    lastCodeInventory = null
    codeStateGeneration = 0
    lastCodeStateFingerprint = ''
    lastPersistedUnreadSnapshot = null
    mergedUnreadGeneration = 0
    lastMergedUnreadFingerprint = ''
    acknowledgedHotUnreadHints.clear()
    codeSessions.close()
    unread.close()
    appState.close()
  }

  // The generated hook body evolves with the companion while the registered
  // command line (a path into EyPc's own data directory) stays fixed, so an
  // already-installed hook is refreshed in place on start. This never touches
  // `~/.claude` and never installs a hook that was not explicitly registered.
  try {
    if (fs.existsSync(hookCommandPath)) {
      const desired = hookScript({ queuePath: queue.queuePath })
      if (fs.readFileSync(hookCommandPath, 'utf8') !== desired) {
        writeExecutable(hookCommandPath, desired)
      }
    }
  } catch { /* fail open: the installed script keeps working as-is */ }

  return {
    revision: CLAUDE_BRIDGE_REVISION,
    hookCommandPath,
    statuslineCommandPath,
    hookCommandLine,
    statuslineCommandLine,
    quotaPath,
    queuePath: queue.queuePath,
    inspect,
    install,
    uninstall,
    readSnapshot,
    readCodeSnapshot,
    readCodeStateSnapshot,
    readQuota,
    readQuotaFallback,
    readCodeUnread,
    readPlanUsage,
    watchCodeSessions,
    watchCodeState,
    watchCodeUnread,
    watchEvents,
    readAppPresence,
    openTask,
    archiveCodeSession,
    diagnostics,
    close
  }
}

module.exports = {
  CLAUDE_BRIDGE_REVISION,
  createClaudeBridge
}
