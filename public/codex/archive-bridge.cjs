'use strict'

/**
 * Owns the Codex archive transaction: the multi-stage preflight/provider-write/
 * dual-verification/native-ack/kernel-commit sequence for archiving one
 * thread (`archiveCodexThread`), the batch wrapper that drives it across a
 * project's completed threads (`archiveCodexProject`), and the private
 * native-ack waiter registry the transaction blocks on.
 *
 * This is a route-3 (RAW-169) closure rewrite, not a route-1 delegate-stub
 * extraction. Unlike the Float domain (which had two clean host-lifecycle
 * signal boundaries), this domain is reached by two OTHER domains for a
 * genuine reason: Desktop Bridge and the App Server message router both
 * need to know whether a native "thread archived" broadcast is the
 * confirmation of an archive transaction already in flight here, or a
 * foreign event they must reconcile themselves. `observeCodexArchiveNativeAck`
 * was always the sole formal entry point for that question -- it never
 * touched by those callers reaching into `codexArchiveNativeAckWaiters`
 * directly -- so closure-ing this domain only turns that free function into
 * the bridge's public `observeNativeAck` method; the two call sites in the
 * entry are unchanged in shape, just retargeted.
 *
 * Several pieces of state this transaction reads/writes are NOT migrated,
 * because they are genuinely owned by, or shared with, other domains:
 * `codexThreadActions`/`codexProjectActions` (action-alias registries used
 * across the codebase), `codexActivityInventory` and
 * `codexArchivedActivityKey` (inventory/activity domain's own "purge a
 * thread's local evidence" primitive -- also called directly by Desktop
 * Bridge and the App Server router, so it stays exactly where it is and is
 * injected by reference rather than migrated), and
 * `codexLocalArchiveRecoverySuppressions` (touched by four functions across
 * session-lifecycle, inventory-reconciliation, this transaction, and
 * companion-host-reconciliation -- injected by reference, both sides mutate
 * the same Set instance, same discipline as `desktop-activity-aggregation.cjs`
 * leaving `codexDesktopOpenedReadAcknowledgements` in the entry).
 * `codexActivityInventory` is injected as a getter (`activityInventory()`),
 * not a direct Map reference, because the entry periodically reassigns it to
 * a freshly rebuilt Map during inventory rescans (`let`, not `const`) -- a
 * captured reference would go stale after the first rescan.
 *
 * `utools` is injected rather than read from `globalThis.utools`: this
 * module is loaded via a real `require()`, a different JS realm than the
 * entry's `vm` sandbox in tests, so `globalThis` inside it is not the
 * sandbox's `globalThis` -- the same class of bug recorded in
 * `preload-module-instanceof-crosses-vm-sandbox-realm` and the
 * `process`-injection lesson from `node-runtime.cjs`, just for `utools`.
 *
 * `companionTaskKernel` is a genuine bidirectional dependency: the kernel's
 * own construction references this bridge's `archiveCodexThread` as its
 * `adapters.codex.archive` capability, and `commitVerifiedCodexArchive` here
 * calls back into `companionTaskKernel.commitArchived`. The entry resolves
 * this by constructing the kernel first (with a stable wrapper that reads
 * the not-yet-created bridge variable), then constructing this bridge
 * immediately after with the already-built kernel instance injected --
 * see `preload/index.js` around the `companionTaskKernel = ...` assignment.
 */

function createCodexArchiveBridge(dependencies = {}) {
  const utools = dependencies.utools
  const record = dependencies.record
  const timestampMs = dependencies.timestampMs
  const error = dependencies.error
  const threadKey = dependencies.threadKey
  const validThreadId = dependencies.validThreadId
  const crypto = dependencies.crypto
  const runtimeDiagnostics = dependencies.runtimeDiagnostics
  const requestCodexRpc = dependencies.requestCodexRpc
  const readCodexNativeRegistry = dependencies.readCodexNativeRegistry
  const codexDesktopIsRunning = dependencies.codexDesktopIsRunning
  const sanitizeCodexTurnStatusPage = dependencies.sanitizeCodexTurnStatusPage
  const codexIsConfirmedTurnEvidence = dependencies.codexIsConfirmedTurnEvidence
  const codexThreadNativeProject = dependencies.codexThreadNativeProject
  const codexNormalizeNativeRoot = dependencies.codexNormalizeNativeRoot
  const codexThreadAlias = dependencies.codexThreadAlias
  const listAllCodexThreads = dependencies.listAllCodexThreads
  const codexEnsureDesktopBridge = dependencies.codexEnsureDesktopBridge
  const desktopBridgeClientId = dependencies.desktopBridgeClientId
  const companionDiagnosticTaskRef = dependencies.companionDiagnosticTaskRef
  const emitCodexActivityDelta = dependencies.emitCodexActivityDelta
  const threadTurnStatusTimeoutMs = dependencies.threadTurnStatusTimeoutMs
  const threadActions = dependencies.threadActions
  const projectActions = dependencies.projectActions
  const getActivityInventory = dependencies.activityInventory
  const localArchiveRecoverySuppressions = dependencies.localArchiveRecoverySuppressions
  const activityKeyForArchivedThread = dependencies.activityKeyForArchivedThread
  const companionTaskKernel = dependencies.companionTaskKernel || null
  // Which rows are CodexHost extra processes, and the Host CLI verbs for them.
  // Optional: an entry without the discovery lane keeps the official path only.
  const codexhostLane = typeof dependencies.codexhostDiscovery === 'function'
    ? dependencies.codexhostDiscovery
    : () => null

  if (typeof record !== 'function' || typeof timestampMs !== 'function' || typeof error !== 'function'
    || typeof threadKey !== 'function' || typeof validThreadId !== 'function' || !crypto
    || !runtimeDiagnostics || typeof runtimeDiagnostics.record !== 'function'
    || typeof requestCodexRpc !== 'function' || typeof readCodexNativeRegistry !== 'function'
    || typeof codexDesktopIsRunning !== 'function' || typeof sanitizeCodexTurnStatusPage !== 'function'
    || typeof codexIsConfirmedTurnEvidence !== 'function' || typeof codexThreadNativeProject !== 'function'
    || typeof codexNormalizeNativeRoot !== 'function' || typeof codexThreadAlias !== 'function'
    || typeof listAllCodexThreads !== 'function' || typeof codexEnsureDesktopBridge !== 'function'
    || typeof desktopBridgeClientId !== 'function'
    || typeof companionDiagnosticTaskRef !== 'function' || typeof emitCodexActivityDelta !== 'function'
    || !Number.isFinite(threadTurnStatusTimeoutMs) || !threadActions || !projectActions || typeof getActivityInventory !== 'function'
    || !localArchiveRecoverySuppressions || typeof activityKeyForArchivedThread !== 'function') {
    throw new TypeError('codex archive bridge is missing one or more required dependencies')
  }

  const CODEX_ARCHIVE_NATIVE_ACK_TIMEOUT_MS = 2_000
  const CODEX_ARCHIVE_VERIFY_DELAY_MS = 300

  const codexArchiveNativeAckWaiters = new Map()

  function codexArchiveOperationId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(value)
      ? value
      : `archive-${crypto.randomUUID()}`
  }

  function codexArchiveShortOperationId(operationId) {
    return String(operationId || '').slice(-8)
  }

  function recordCodexArchiveStage(event, outcome, context = {}, extra = {}) {
    const abnormal = outcome === 'failed' || outcome === 'indeterminate' || event === 'archive-local-retained'
    runtimeDiagnostics.record({
      level: abnormal ? 'error' : event === 'archive-preflight' || event === 'archive-reconciliation' && outcome === 'started' ? 'debug' : 'info',
      scope: 'archive-transaction',
      event,
      outcome,
      operationId: context.operationId,
      source: context.source,
      provider: 'codex',
      taskRef: companionDiagnosticTaskRef('codex', context.threadId),
      beforePhase: context.beforePhase,
      afterPhase: context.currentPhase,
      terminalAt: context.terminalEpoch,
      semanticRevision: context.currentRevision,
      durationMs: Date.now() - (context.startedAt || Date.now()),
      code: extra.errorCode,
      details: {
        terminalEpoch: Number(context.terminalEpoch) || 0,
        requestedRevision: Number(context.requestedRevision) || 0,
        currentRevision: Number(context.currentRevision) || 0,
        beforePhase: context.beforePhase || '',
        currentPhase: context.currentPhase || '',
        archiveCapability: context.archiveCapability || '',
        providerWriteOutcome: context.providerWriteOutcome || '',
        unarchivedPresent: context.unarchivedPresent,
        archivedPresent: context.archivedPresent,
        desktopBridgeState: context.desktopBridgeState || '',
        desktopSyncOutcome: context.desktopSyncOutcome || '',
        nativeAckOutcome: context.nativeAckOutcome || '',
        verificationAttempt: Number(context.verificationAttempt) || 0,
        finalOutcome: context.finalOutcome || outcome,
        ...extra.details
      }
    })
  }

  function observeNativeAck(threadId, source, sourceClientId = '') {
    const pending = codexArchiveNativeAckWaiters.get(threadId)
    if (!pending) return false
    if (source === 'desktop' && sourceClientId && sourceClientId === desktopBridgeClientId()) return true
    if (!pending.ack) pending.ack = { source, observedAt: Date.now() }
    for (const resolve of pending.listeners.splice(0)) resolve(pending.ack)
    return true
  }

  function waitForCodexArchiveNativeAck(threadId, timeoutMs = CODEX_ARCHIVE_NATIVE_ACK_TIMEOUT_MS) {
    const pending = codexArchiveNativeAckWaiters.get(threadId)
    if (!pending) return Promise.resolve(null)
    if (pending.ack) return Promise.resolve(pending.ack)
    return new Promise((resolve) => {
      const finish = (value) => {
        clearTimeout(timer)
        const index = pending.listeners.indexOf(finish)
        if (index >= 0) pending.listeners.splice(index, 1)
        resolve(value)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)
      timer.unref?.()
      pending.listeners.push(finish)
    })
  }

  function beginCodexArchiveNativeAck(threadId, operationId) {
    localArchiveRecoverySuppressions.add(threadId)
    codexArchiveNativeAckWaiters.set(threadId, { operationId, ack: null, listeners: [] })
  }

  function endCodexArchiveNativeAck(threadId, operationId) {
    const pending = codexArchiveNativeAckWaiters.get(threadId)
    if (!pending || pending.operationId !== operationId) return
    for (const resolve of pending.listeners.splice(0)) resolve(null)
    codexArchiveNativeAckWaiters.delete(threadId)
  }

  async function verifyCodexArchivePersistence(threadId) {
    const [unarchivedRows, archivedRows] = await Promise.all([
      listAllCodexThreads(false),
      listAllCodexThreads(true)
    ])
    return {
      unarchivedPresent: unarchivedRows.some((row) => row.id === threadId),
      archivedPresent: archivedRows.some((row) => row.id === threadId)
    }
  }

  function waitCodexArchiveVerificationDelay() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, CODEX_ARCHIVE_VERIFY_DELAY_MS)
      timer.unref?.()
    })
  }

  function retainCodexArchiveTask(context, outcome, errorCode, message) {
    context.finalOutcome = outcome
    if (context.lastStage) recordCodexArchiveStage(context.lastStage, outcome, context, { errorCode })
    recordCodexArchiveStage('archive-local-retained', outcome, context, { errorCode })
    try {
      utools?.showNotification?.(`${message}（操作 ${codexArchiveShortOperationId(context.operationId)}）`)
    } catch {}
    recordCodexArchiveStage('archive-reconciliation', 'retained', context, { details: { directedVerificationCompleted: context.verificationAttempt > 0 } })
    return { outcome, operationId: context.operationId, errorCode, message: `${message}（操作 ${codexArchiveShortOperationId(context.operationId)}）` }
  }

  async function commitVerifiedCodexArchive(context) {
    const known = getActivityInventory().get(context.threadId)
    const archivedKey = typeof known?.key === 'string' ? known.key : ''
    if (!archivedKey) throw error('archive-commit-missing', 'Codex archive commit target is missing')
    const committed = companionTaskKernel?.commitArchived?.({
      provider: 'codex',
      key: archivedKey,
      operationId: context.operationId,
      terminalEpoch: context.terminalEpoch,
      membershipRevision: Math.max(Number(context.currentRevision) || 0, Date.now()),
      verified: true
    })
    if (committed?.outcome !== 'archived') throw error('archive-kernel-commit-failed', 'Codex archive kernel commit failed')
    const removedKey = activityKeyForArchivedThread(context.threadId)
    if (removedKey !== archivedKey) throw error('archive-local-cleanup-failed', 'Codex archive local cleanup failed')
    localArchiveRecoverySuppressions.delete(context.threadId)
    emitCodexActivityDelta([], true, 'urgent', [archivedKey])
    recordCodexArchiveStage('archive-kernel-commit', 'archived', context)
    recordCodexArchiveStage('archive-ui-removal', 'archived', context)
    recordCodexArchiveStage('archive-reconciliation', 'verified', context, { details: { directedVerificationCompleted: true } })
    return archivedKey
  }

  async function archiveCodexThread(actionAlias, request) {
    const input = record(request)
    const operationId = codexArchiveOperationId(input.operationId)
    const hintedEntry = typeof actionAlias === 'string' ? threadActions.get(actionAlias) : null
    const context = {
      operationId,
      source: typeof input.source === 'string' ? input.source : 'archive-button',
      threadId: validThreadId(hintedEntry?.threadId) ? hintedEntry.threadId : '',
      startedAt: Date.now(),
      requestedRevision: Number(input.requestedRevisionAt || input.expectedRevisionAt) || 0,
      currentRevision: 0,
      terminalEpoch: Number(input.expectedLastTurnStartedAt) || 0,
      beforePhase: input.evidence === 'stopped' ? 'stopped' : 'completed',
      currentPhase: input.evidence === 'stopped' ? 'stopped' : 'completed',
      archiveCapability: 'requested',
      providerWriteOutcome: 'not-started',
      desktopBridgeState: 'not-checked',
      desktopSyncOutcome: 'not-started',
      nativeAckOutcome: 'not-started',
      verificationAttempt: 0,
      lastStage: 'archive-preflight'
    }
    if (input.intentRecorded !== true) recordCodexArchiveStage('archive-intent', 'started', context)
    if (input.confirmationRecorded !== true) recordCodexArchiveStage('archive-confirmation-confirmed', 'confirmed', context)
    const expectedUpdatedAt = Number.isFinite(input.expectedUpdatedAt) && input.expectedUpdatedAt > 0 ? input.expectedUpdatedAt : 0
    const expectedRevisionAt = Number.isFinite(input.expectedRevisionAt) && input.expectedRevisionAt > 0 ? input.expectedRevisionAt : 0
    const expectedCompletionAt = Number.isFinite(input.expectedCompletionAt) && input.expectedCompletionAt > 0 ? input.expectedCompletionAt : 0
    const expectedLastTurnStartedAt = Number.isFinite(input.expectedLastTurnStartedAt) && input.expectedLastTurnStartedAt > 0 ? input.expectedLastTurnStartedAt : 0
    const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint) ? input.expectedSourceFingerprint : ''
    const evidence = input.evidence === 'completed' || input.evidence === 'stopped' ? input.evidence : ''
    const requestIsValid = typeof actionAlias === 'string'
      && /^ct_[A-Za-z0-9_-]{16,80}$/.test(actionAlias)
      && expectedUpdatedAt > 0
      && expectedRevisionAt > 0
      && expectedLastTurnStartedAt > 0
      && Boolean(expectedSourceFingerprint)
      && Boolean(evidence)
      && (evidence !== 'stopped' || expectedCompletionAt === 0)
      && expectedRevisionAt === (expectedCompletionAt || expectedLastTurnStartedAt)
    if (!requestIsValid) {
      return retainCodexArchiveTask(context, 'failed', 'invalid-request', '归档请求已失效，任务已保留')
    }
    const entry = threadActions.get(actionAlias)
    if (!entry || entry.expiresAt <= Date.now() || !validThreadId(entry.threadId)) {
      threadActions.delete(actionAlias)
      return retainCodexArchiveTask(context, 'failed', 'expired-alias', '任务动作已过期，任务已保留')
    }
    context.threadId = entry.threadId
    context.lastStage = 'archive-preflight'
    try {
      const registry = readCodexNativeRegistry()
      if (registry.fingerprint !== expectedSourceFingerprint || entry.sourceFingerprint !== expectedSourceFingerprint) {
        return retainCodexArchiveTask(context, 'failed', 'source-changed', 'Codex 项目状态已更新，未执行归档')
      }
      // A CodexHost extra process never existed in the official app-server;
      // thread/read there fails as protocol-error and the transaction used to
      // die at this line six times a day. The Host CLI is its archive surface.
      const hostLane = codexhostLane()
      if (hostLane?.isExternalThreadId?.(entry.threadId) === true) {
        return await archiveCodexhostThread(context, entry, evidence, hostLane, operationId)
      }
      const [threadResult, turnPage] = await Promise.all([
        requestCodexRpc('thread/read', { threadId: entry.threadId, includeTurns: false }),
        requestCodexRpc('thread/turns/list', { threadId: entry.threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }, threadTurnStatusTimeoutMs)
      ])
      const response = record(threadResult)
      const thread = record(response.thread)
      const status = record(thread.status).type
      const recencyAt = timestampMs(thread.recencyAt) || timestampMs(thread.updatedAt) || 0
      const turnPageSource = record(turnPage)
      const turnRows = Array.isArray(turnPageSource.data) ? turnPageSource.data : null
      const turn = sanitizeCodexTurnStatusPage(turnPage)
      const native = codexThreadNativeProject(thread, registry)
      const validStatus = ['active', 'idle', 'notLoaded', 'systemError'].includes(status)
      const validTurnShape = turnRows !== null && (turnRows.length === 0 || Boolean(turn))
      context.currentRevision = Math.max(recencyAt, Number(turn?.completedAt) || 0, Number(turn?.startedAt) || 0)
      context.terminalEpoch = Number(turn?.startedAt) || context.terminalEpoch
      context.desktopBridgeState = codexEnsureDesktopBridge().state
      recordCodexArchiveStage('archive-preflight', 'observed', context, {
        details: { providerStatus: status, turnStatus: turn?.status || '', projectMatched: native?.project.key === entry.projectKey }
      })
      if (thread.id !== entry.threadId || !validStatus || recencyAt <= 0 || recencyAt !== expectedUpdatedAt || !validTurnShape || !native || native.project.key !== entry.projectKey) {
        return retainCodexArchiveTask(context, 'failed', 'state-changed', '任务状态已更新，未执行归档')
      }
      if (!turn || turn.startedAt !== expectedLastTurnStartedAt) {
        return retainCodexArchiveTask(context, 'failed', 'turn-changed', '任务最新提问已更新，未执行归档')
      }
      const desktopBridge = codexEnsureDesktopBridge()
      const desktopActivity = desktopBridge.activityForThread(entry.threadId)
      const currentActivity = getActivityInventory().get(entry.threadId)
      const exactInterruptedTerminal = evidence === 'stopped'
        && turn?.status === 'interrupted'
        && currentActivity?.lastTurnStatus === 'interrupted'
        && currentActivity.lastTurnStartedAt === turn.startedAt
        && codexIsConfirmedTurnEvidence(currentActivity.lastTurnEvidence)
        && (!currentActivity.activeEvidenceSequence
          || !currentActivity.terminalEvidenceSequence
          || currentActivity.terminalEvidenceSequence >= currentActivity.activeEvidenceSequence)
        && !currentActivity.activeFlags?.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
      if (!exactInterruptedTerminal
        && (desktopActivity?.status === 'active' || status === 'active' || turn?.status === 'inProgress')) {
        return evidence === 'stopped'
          ? retainCodexArchiveTask(context, 'failed', 'state-changed', '任务已恢复进行中，未执行归档')
          : retainCodexArchiveTask(context, 'failed', 'active-task', '任务已恢复进行中，未执行归档')
      }
      if (evidence === 'completed') {
        if (turn.status !== 'completed' || (turn.completedAt || turn.startedAt) !== expectedRevisionAt || (expectedCompletionAt > 0 && turn.completedAt !== expectedCompletionAt)) {
          return retainCodexArchiveTask(context, 'failed', 'completion-changed', '任务完成版本已更新，未执行归档')
        }
      } else {
        const stoppedBoundary = exactInterruptedTerminal
          || (turn.status === 'failed' || turn.status === 'interrupted')
            && (desktopActivity?.status === 'idle' || desktopBridge.state === 'not-running')
        if (!stoppedBoundary || turn.startedAt !== expectedRevisionAt) {
          return retainCodexArchiveTask(context, 'failed', 'state-changed', '任务已不再满足待继续归档边界，未执行归档')
        }
      }
      context.archiveCapability = 'verified'
      recordCodexArchiveStage('archive-preflight', 'verified', context)
      beginCodexArchiveNativeAck(entry.threadId, operationId)
      context.lastStage = 'archive-provider-write'
      await requestCodexRpc('thread/archive', { threadId: entry.threadId })
      context.providerWriteOutcome = 'completed'
      recordCodexArchiveStage('archive-provider-write', 'completed', context)

      context.lastStage = 'archive-server-verify-1'
      context.verificationAttempt = 1
      const verify1 = await verifyCodexArchivePersistence(entry.threadId)
      Object.assign(context, verify1)
      if (verify1.unarchivedPresent || !verify1.archivedPresent) {
        return retainCodexArchiveTask(context, 'indeterminate', 'archive-verify-1-failed', 'Codex 第一次持久化核验未通过，任务已保留')
      }
      recordCodexArchiveStage('archive-server-verify-1', 'verified', context)

      context.lastStage = 'archive-desktop-sync'
      const desktopRunning = desktopBridge.state === 'connected'
        ? true
        : desktopBridge.state === 'not-running' ? false : await codexDesktopIsRunning()
      context.desktopBridgeState = desktopRunning ? desktopBridge.state : 'not-running'
      if (context.desktopBridgeState === 'connected') {
        context.desktopSyncOutcome = await desktopBridge.notifyThreadArchived(
          entry.threadId,
          typeof thread.cwd === 'string' ? thread.cwd : ''
        )
        if (context.desktopSyncOutcome !== 'dispatched') {
          return retainCodexArchiveTask(context, 'indeterminate', 'archive-desktop-sync-failed', 'Codex 桌面同步未确认，任务已保留')
        }
        recordCodexArchiveStage('archive-desktop-sync', 'dispatched', context)
        context.lastStage = 'archive-native-ack'
        const nativeAck = await waitForCodexArchiveNativeAck(entry.threadId)
        context.nativeAckOutcome = nativeAck ? `acknowledged:${nativeAck.source}` : 'timeout'
        if (!nativeAck) {
          return retainCodexArchiveTask(context, 'indeterminate', 'archive-native-ack-timeout', 'Codex 原生归档确认超时，任务已保留')
        }
        recordCodexArchiveStage('archive-native-ack', 'acknowledged', context)
      } else if (context.desktopBridgeState === 'not-running') {
        context.desktopSyncOutcome = 'not-running'
        context.nativeAckOutcome = 'not-required'
        recordCodexArchiveStage('archive-desktop-sync', 'not-required', context)
      } else {
        context.desktopSyncOutcome = desktopBridge.state || 'failed'
        return retainCodexArchiveTask(context, 'indeterminate', 'archive-desktop-state-indeterminate', 'Codex 桌面连接状态无法确认，任务已保留')
      }

      await waitCodexArchiveVerificationDelay()
      context.lastStage = 'archive-server-verify-2'
      context.verificationAttempt = 2
      const verify2 = await verifyCodexArchivePersistence(entry.threadId)
      Object.assign(context, verify2)
      if (verify2.unarchivedPresent || !verify2.archivedPresent) {
        return retainCodexArchiveTask(context, 'indeterminate', 'archive-verify-2-failed', 'Codex 第二次持久化核验未通过，任务已保留')
      }
      recordCodexArchiveStage('archive-server-verify-2', 'verified', context)

      context.lastStage = 'archive-kernel-commit'
      await commitVerifiedCodexArchive(context)
      context.finalOutcome = 'archived'
      return {
        outcome: 'archived',
        operationId,
        desktopSync: context.desktopSyncOutcome,
        nativeAck: context.nativeAckOutcome,
        message: `已确认原生归档（操作 ${codexArchiveShortOperationId(operationId)}）`
      }
    } catch (thrown) {
      const source = record(thrown)
      return retainCodexArchiveTask(
        context,
        context.providerWriteOutcome === 'completed' ? 'indeterminate' : 'failed',
        typeof source.code === 'string' ? source.code : 'archive-failed',
        'Codex 任务归档失败，任务已保留'
      )
    } finally {
      if (context.threadId) {
        endCodexArchiveNativeAck(context.threadId, operationId)
        // The recovery suppression only protects an archive write whose native
        // result may already be persisted. Once the Provider write never
        // completed, or an authoritative verification still sees the thread in
        // the unarchived inventory, a later real Desktop archive must be allowed
        // through the external-membership recovery lane.
        if (context.providerWriteOutcome !== 'completed' || context.unarchivedPresent === true) {
          localArchiveRecoverySuppressions.delete(context.threadId)
        }
      }
    }
  }

  function codexhostErrorCode(code) {
    return typeof code === 'string' && code
      ? `codexhost-${code.toLowerCase().replace(/_/g, '-')}`
      : 'codexhost-failed'
  }

  /**
   * Archive of one CodexHost extra process. Same stage ladder and same retain
   * rules as the official lane, with the Host CLI in every seat the official
   * app-server held: `thread read` is the preflight, `thread archive` the
   * provider write, and the live/archived `thread list` pair the two
   * persistence verifications. There is no Desktop leg — the Host broadcasts
   * `thread/archived` to Desktop itself, the same frame a sidebar archive
   * produces — so the transaction never waits for a native ACK.
   */
  async function archiveCodexhostThread(context, entry, evidence, hostLane, operationId) {
    const lane = { lane: 'codexhost' }
    context.desktopBridgeState = 'host-owned'
    const read = await hostLane.codexhostReadThread(entry.threadId)
    if (!read.ok) {
      return retainCodexArchiveTask(context, 'failed', codexhostErrorCode(read.code), 'CodexHost 未能读取该额外进程，任务已保留')
    }
    recordCodexArchiveStage('archive-preflight', 'observed', context, {
      details: { ...lane, providerStatus: read.status, turnStatus: read.turnStatus }
    })
    if (read.status === 'running' || read.status === 'creating') {
      return retainCodexArchiveTask(context, 'failed', 'active-task', '任务已恢复进行中，未执行归档')
    }
    const terminalMatches = evidence === 'completed'
      ? read.status === 'completed'
      : read.status === 'failed' || read.status === 'interrupted'
    if (!terminalMatches) {
      return retainCodexArchiveTask(context, 'failed', 'state-changed', '任务状态已更新，未执行归档')
    }
    context.archiveCapability = 'verified'
    recordCodexArchiveStage('archive-preflight', 'verified', context, { details: lane })
    localArchiveRecoverySuppressions.add(entry.threadId)
    context.lastStage = 'archive-provider-write'
    const written = await hostLane.codexhostArchiveThread(entry.threadId, true)
    if (!written.ok) {
      return retainCodexArchiveTask(
        context,
        'failed',
        written.code === 'THREAD_BUSY' ? 'active-task' : codexhostErrorCode(written.code),
        written.code === 'THREAD_BUSY' ? '任务已恢复进行中，未执行归档' : 'CodexHost 归档写入失败，任务已保留'
      )
    }
    context.providerWriteOutcome = 'completed'
    recordCodexArchiveStage('archive-provider-write', 'completed', context, { details: lane })

    context.lastStage = 'archive-server-verify-1'
    context.verificationAttempt = 1
    const verify1 = await hostLane.codexhostArchiveState(entry.threadId)
    if (!verify1.ok) {
      return retainCodexArchiveTask(context, 'indeterminate', codexhostErrorCode(verify1.code), 'CodexHost 归档核验不可达，任务已保留')
    }
    Object.assign(context, { unarchivedPresent: verify1.unarchivedPresent, archivedPresent: verify1.archivedPresent })
    if (verify1.unarchivedPresent || !verify1.archivedPresent) {
      return retainCodexArchiveTask(context, 'indeterminate', 'archive-verify-1-failed', 'CodexHost 第一次归档核验未通过，任务已保留')
    }
    recordCodexArchiveStage('archive-server-verify-1', 'verified', context, { details: lane })

    context.lastStage = 'archive-desktop-sync'
    context.desktopSyncOutcome = 'host-broadcast'
    context.nativeAckOutcome = 'not-required'
    recordCodexArchiveStage('archive-desktop-sync', 'not-required', context, { details: lane })

    await waitCodexArchiveVerificationDelay()
    context.lastStage = 'archive-server-verify-2'
    context.verificationAttempt = 2
    const verify2 = await hostLane.codexhostArchiveState(entry.threadId)
    if (!verify2.ok) {
      return retainCodexArchiveTask(context, 'indeterminate', codexhostErrorCode(verify2.code), 'CodexHost 归档核验不可达，任务已保留')
    }
    Object.assign(context, { unarchivedPresent: verify2.unarchivedPresent, archivedPresent: verify2.archivedPresent })
    if (verify2.unarchivedPresent || !verify2.archivedPresent) {
      return retainCodexArchiveTask(context, 'indeterminate', 'archive-verify-2-failed', 'CodexHost 第二次归档核验未通过，任务已保留')
    }
    recordCodexArchiveStage('archive-server-verify-2', 'verified', context, { details: lane })

    context.lastStage = 'archive-kernel-commit'
    await commitVerifiedCodexArchive(context)
    if (typeof hostLane.codexhostForgetThread === 'function') hostLane.codexhostForgetThread(entry.threadId)
    context.finalOutcome = 'archived'
    return {
      outcome: 'archived',
      operationId,
      desktopSync: 'host-broadcast',
      nativeAck: 'not-required',
      message: `已确认 CodexHost 归档（操作 ${codexArchiveShortOperationId(operationId)}）`
    }
  }

  async function archiveCodexProject(actionAlias, request) {
    const input = record(request)
    const operationId = codexArchiveOperationId(input.operationId)
    const projectArchiveSource = typeof input.source === 'string' ? input.source : 'project-archive'
    if (input.intentRecorded !== true) {
      runtimeDiagnostics.record({
        level: 'info',
        scope: 'archive-transaction',
        event: 'archive-intent',
        outcome: 'started',
        operationId,
        source: projectArchiveSource,
        provider: 'codex',
        details: { mode: 'project' }
      })
    }
    if (input.confirmationRecorded !== true) {
      runtimeDiagnostics.record({
        level: 'info',
        scope: 'archive-transaction',
        event: 'archive-confirmation-confirmed',
        outcome: 'confirmed',
        operationId,
        source: projectArchiveSource,
        provider: 'codex',
        details: { mode: 'project', owner: 'provider-boundary' }
      })
    }
    const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint) ? input.expectedSourceFingerprint : ''
    const emptyResult = (errorCode, message) => ({
      outcome: 'failed',
      archivedKeys: [],
      skippedActiveKeys: [],
      failed: [],
      desktopSyncedKeys: [],
      desktopSyncFailedKeys: [],
      errorCode,
      message
    })
    if (typeof actionAlias !== 'string' || !/^cp_[A-Za-z0-9_-]{16,80}$/.test(actionAlias) || !expectedSourceFingerprint) {
      return emptyResult('invalid-request', '项目归档请求已失效，请刷新后重试')
    }
    const action = projectActions.get(actionAlias)
    if (!action || action.expiresAt <= Date.now()) {
      projectActions.delete(actionAlias)
      return emptyResult('expired-alias', '项目动作已过期，请刷新后重试')
    }
    try {
      const registry = readCodexNativeRegistry()
      if (registry.fingerprint !== expectedSourceFingerprint || action.sourceFingerprint !== expectedSourceFingerprint) {
        return emptyResult('source-changed', 'Codex 项目状态已更新，未执行批量归档')
      }
      const unarchivedRows = await listAllCodexThreads(false)
      const candidates = []
      for (const thread of unarchivedRows) {
        const native = codexThreadNativeProject(thread, registry)
        if (native?.project.key === action.projectKey) candidates.push(thread)
      }
      const archivedKeys = []
      const skippedActiveKeys = []
      const failed = []
      const desktopSyncedKeys = []
      const desktopSyncFailedKeys = []
      for (let batchStart = 0; batchStart < candidates.length; batchStart += 20) {
        if (readCodexNativeRegistry().fingerprint !== expectedSourceFingerprint) {
          for (const thread of candidates.slice(batchStart)) failed.push({ key: threadKey(thread.id), errorCode: 'source-changed' })
          break
        }
        const batch = candidates.slice(batchStart, batchStart + 20)
        const queue = [...batch]
        const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
          for (;;) {
            const listedThread = queue.shift()
            if (!listedThread) return
            const key = threadKey(listedThread.id)
            try {
              const [threadResult, turnPage] = await Promise.all([
                requestCodexRpc('thread/read', { threadId: listedThread.id, includeTurns: false }),
                requestCodexRpc('thread/turns/list', { threadId: listedThread.id, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }, threadTurnStatusTimeoutMs)
              ])
              const thread = record(record(threadResult).thread)
              const turnSource = record(turnPage)
              if (!Array.isArray(turnSource.data)) throw error('protocol-error', 'Codex latest Turn response is invalid')
              const turn = turnSource.data.length ? sanitizeCodexTurnStatusPage(turnPage) : null
              if (turnSource.data.length && (!turn || !turn.startedAt)) throw error('protocol-error', 'Codex latest Turn is missing startedAt')
              const status = record(thread.status).type
              const native = codexThreadNativeProject(thread, registry)
              const listedRecency = timestampMs(listedThread.recencyAt) || timestampMs(listedThread.updatedAt) || 0
              const currentRecency = timestampMs(thread.recencyAt) || timestampMs(thread.updatedAt) || 0
              if (thread.id !== listedThread.id || !native || native.project.key !== action.projectKey || !listedRecency || currentRecency !== listedRecency) {
                failed.push({ key, errorCode: 'state-changed' })
                continue
              }
              const desktopActivity = codexEnsureDesktopBridge().activityForThread(listedThread.id)
              if (desktopActivity?.status === 'active' || status === 'active' || turn?.status !== 'completed') {
                skippedActiveKeys.push(key)
                continue
              }
              const alias = codexThreadAlias(listedThread.id, Date.now(), {
                projectKey: action.projectKey,
                sourceFingerprint: expectedSourceFingerprint,
                cwd: codexNormalizeNativeRoot(thread.cwd)
              })
              const result = await archiveCodexThread(alias.alias, {
                expectedUpdatedAt: currentRecency,
                expectedRevisionAt: turn.completedAt || turn.startedAt,
                ...(turn.completedAt ? { expectedCompletionAt: turn.completedAt } : {}),
                expectedLastTurnStartedAt: turn.startedAt,
                expectedSourceFingerprint,
                evidence: 'completed',
                operationId: `${operationId}:${key.slice(0, 12)}`,
                source: 'project-archive'
              })
              if (result.outcome === 'archived') {
                archivedKeys.push(key)
                if (result.desktopSync === 'dispatched' || result.desktopSync === 'not-running') desktopSyncedKeys.push(key)
              } else {
                failed.push({ key, errorCode: result.errorCode || 'archive-not-verified' })
                desktopSyncFailedKeys.push(key)
              }
            } catch (thrown) {
              failed.push({ key, errorCode: typeof record(thrown).code === 'string' ? record(thrown).code : 'archive-failed' })
            }
          }
        })
        await Promise.all(workers)
      }
      const outcome = failed.length ? archivedKeys.length || skippedActiveKeys.length ? 'partial' : 'failed' : 'complete'
      return { outcome, archivedKeys, skippedActiveKeys, failed, desktopSyncedKeys, desktopSyncFailedKeys }
    } catch (thrown) {
      return emptyResult(typeof record(thrown).code === 'string' ? record(thrown).code : 'archive-failed', '项目批量归档失败，请刷新后重试')
    }
  }

  return {
    archiveCodexThread,
    archiveCodexProject,
    observeNativeAck
  }
}

module.exports = {
  createCodexArchiveBridge
}
