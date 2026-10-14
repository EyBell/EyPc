'use strict'

/**
 * Resolves a Desktop session shadow into an activity verdict, and the
 * smaller judgments built on top of it: whether a terminal turn result is
 * corroborated enough to trust, whether hydrating a branch as "active"
 * should be deferred to a fresher Desktop observation, and whether an
 * in-progress inventory snapshot is still live evidence.
 *
 * `codexDesktopShadowActivity` merges the shadow's runtime flags and
 * pending requests through `codexReduceWaitingEdge` -- the one reducer that
 * owns both edges of the actionable-wait lifecycle -- filtering each
 * candidate flag through waiting-evidence visibility so a flag the caller
 * has already resolved does not resurrect a stale "active" verdict.
 *
 * The resolution functions are pure over their arguments; no module state. The
 * collaborators are injected as function references: `timestampMs` and
 * `validThreadId` are shared by dozens of call sites elsewhere in the
 * entry, and `waitingEvidenceVisible`/`desktopRequestFlag`/
 * `desktopIsPlanImplementationRequest` are already the entry's delegate
 * stubs for other extracted modules -- composing them here, not
 * reimplementing them, keeps a load failure from reaching what they guard.
 */

const CODEX_DESKTOP_ACTIVITY_RESOLUTION_REVISION = 'codex-desktop-activity-resolution-v1'

function createCodexDesktopActivityResolution(dependencies = {}) {
  const timestampMs = dependencies.timestampMs
  const validThreadId = dependencies.validThreadId
  const isConfirmedTurnEvidence = dependencies.isConfirmedTurnEvidence
  const waitingEvidenceVisible = dependencies.waitingEvidenceVisible
  const desktopRequestFlag = dependencies.desktopRequestFlag
  const desktopIsPlanImplementationRequest = dependencies.desktopIsPlanImplementationRequest
  if (typeof timestampMs !== 'function' || typeof validThreadId !== 'function' || typeof isConfirmedTurnEvidence !== 'function'
    || typeof waitingEvidenceVisible !== 'function' || typeof desktopRequestFlag !== 'function' || typeof desktopIsPlanImplementationRequest !== 'function') {
    throw new TypeError('codex desktop activity resolution requires timestampMs, validThreadId, isConfirmedTurnEvidence, waitingEvidenceVisible, desktopRequestFlag and desktopIsPlanImplementationRequest')
  }

  /**
   * One private reducer owns both edges of the actionable-wait lifecycle.
   * Callers provide only finite waiting flags and timestamps; request identity,
   * method payloads and rollout correlations never cross the preload boundary.
   */
  function codexReduceWaitingEdge(input = {}) {
    const active = input.active !== false
    const flags = active
      ? [...new Set((Array.isArray(input.flags) ? input.flags : [])
        .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))]
      : []
    const previousFlags = [...new Set((Array.isArray(input.previousFlags) ? input.previousFlags : [])
      .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))]
    const signature = flags.slice().sort().join('|')
    const previousSignature = previousFlags.slice().sort().join('|')
    const waiting = flags.length > 0
    const previousWaitingSince = timestampMs(input.previousWaitingSince)
    const evidenceAt = timestampMs(input.evidenceAt)
    const waitingSince = waiting
      ? signature === previousSignature && previousWaitingSince
        ? previousWaitingSince
        : evidenceAt || previousWaitingSince || 0
      : 0
    return {
      flags,
      waiting,
      waitingSince,
      changed: signature !== previousSignature
    }
  }

  function codexDesktopShadowActivity(shadow) {
    if (!shadow?.runtime) return null
    const waitingState = shadow.waitingState || null
    const activeFlags = new Set()
    const visibleRuntimeFlags = []
    for (const flag of shadow.runtime.activeFlags || []) {
      if (!waitingEvidenceVisible(waitingState, flag, shadow.runtimeWaitingSequences?.[flag])) continue
      activeFlags.add(flag)
      visibleRuntimeFlags.push(flag)
    }
    let hasPlanImplementationRequest = false
    let hasOtherWaitingRequest = false
    let requestWaitingSince = 0
    for (const request of shadow.requests || []) {
      const flag = desktopRequestFlag(request)
      const visible = flag && waitingEvidenceVisible(waitingState, flag, request.observedSequence)
      if (visible) activeFlags.add(flag)
      if (visible) requestWaitingSince = Math.max(
        requestWaitingSince,
        timestampMs(request.startedAt) || timestampMs(request.observedAt)
      )
      if (visible && desktopIsPlanImplementationRequest(request)) hasPlanImplementationRequest = true
      else if (visible) hasOtherWaitingRequest = true
    }
    // Desktop keeps unresolved requests in conversationState.requests. A plan
    // implementation request is created only after the Plan turn is complete,
    // so it is authoritative user-waiting evidence even if runtime status has
    // already moved to idle in the same patch batch.
    const waitingEdge = codexReduceWaitingEdge({
      flags: [...activeFlags],
      previousFlags: visibleRuntimeFlags,
      previousWaitingSince: requestWaitingSince ? 0 : shadow.runtimeWaitingSince,
      evidenceAt: requestWaitingSince
    })
    const status = waitingEdge.waiting
      ? 'active'
      : shadow.suppressUncorroboratedActive === true && (shadow.runtime.type === 'active' || shadow.liveTurnRunning === true)
        ? 'notLoaded'
        : shadow.liveTurnRunning === true ? 'active' : shadow.runtime.type
    const desktopActiveSince = status === 'active' ? timestampMs(shadow.desktopActiveSince) : 0
    const waitingSince = status === 'active' && waitingEdge.waiting
      ? waitingEdge.waitingSince || desktopActiveSince
      : 0
    const planImplementationOnly = status === 'active'
      && hasPlanImplementationRequest
      && !hasOtherWaitingRequest
      && !activeFlags.has('waitingOnApproval')
    return {
      status,
      activeFlags: status === 'active' ? waitingEdge.flags : [],
      ...(planImplementationOnly ? { planImplementationOnly: true } : {}),
      ...(waitingSince ? { waitingSince } : {}),
      ...(desktopActiveSince ? { desktopActiveSince } : {})
    }
  }

  function canonicalTurnAlreadyCompleted(shadow, known, knownTurnRef) {
    const turn = shadow?.currentCanonicalTurn
    return known?.lastTurnStatus === 'completed'
      && (turn?.turnRef === knownTurnRef
        || turn?.startedAt > 0 && turn.startedAt <= timestampMs(known.lastTurnStartedAt))
  }

  function codexDesktopCanonicalRunningWitness(shadow, known, progressObserved, knownTurnRef) {
    const turn = shadow?.currentCanonicalTurn
    const completedSameTurn = canonicalTurnAlreadyCompleted(shadow, known, knownTurnRef)
    return progressObserved === true && turn?.status === 'inProgress'
      && shadow.runtime?.type === 'active' && !completedSameTurn
      && (shadow.suppressUncorroboratedActive === true
        || shadow.activityEvidence !== 'activity-event'
        || known?.lastTurnStatus !== 'inProgress')
  }

  function codexDesktopHasResolvedCanonicalRun(shadow, sequence, activity, known, knownTurnRef) {
    return sequence > 0 && !canonicalTurnAlreadyCompleted(shadow, known, knownTurnRef)
      && shadow?.currentCanonicalTurn?.status === 'inProgress'
      && activity?.status === 'active' && !activity.activeFlags.length
  }

  function codexDesktopHasStickyPendingRequest(shadow) {
    const activity = codexDesktopShadowActivity(shadow)
    return activity?.status === 'active'
      && activity.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
  }

  function codexHasConfirmedTerminalEvidence(known) {
    return Boolean(known)
      && ['completed', 'interrupted', 'failed'].includes(known.lastTurnStatus)
      && isConfirmedTurnEvidence(known.lastTurnEvidence)
  }

  function codexLiveEvidenceSequence(known, shadows, inventorySequence, branchThreadId = '', parentThreadId = '') {
    return Math.max(
      known?.appServerLiveActive === true && Number.isInteger(known.appServerLiveSequence)
        && (!branchThreadId || (known.appServerLiveBranchThreadId || parentThreadId) === branchThreadId)
        ? known.appServerLiveSequence : 0,
      Number(inventorySequence) || 0,
      ...shadows.map((shadow) => codexDesktopShadowActivity(shadow)?.status === 'active'
        && shadow.activityEvidence === 'activity-event' && Number.isInteger(shadow.activityEventSequence)
        ? shadow.activityEventSequence : 0)
    )
  }

  function codexSnapshotTerminalReady(turn, baselineStartedAt, baselineStatus, finalAttempt, settledSide) {
    return turn.startedAt >= baselineStartedAt && (baselineStartedAt === 0
      ? settledSide || finalAttempt
      : turn.startedAt > baselineStartedAt || baselineStatus === 'inProgress' || settledSide || finalAttempt)
  }

  function codexShouldDeferHydrationActive(bridge, known, parentThreadId, branchThreadId, activity) {
    if (!codexHasConfirmedTerminalEvidence(known) || activity?.status !== 'active' || activity.activeFlags?.length) return false
    if (known.appServerLiveActive === true
      && (!validThreadId(known.appServerLiveBranchThreadId) || known.appServerLiveBranchThreadId === branchThreadId)) return false
    const shadow = branchThreadId === parentThreadId
      ? bridge?.shadows?.get(branchThreadId)
      : bridge?.sideShadows?.get(branchThreadId) || bridge?.shadows?.get(branchThreadId)
    const desktopActivity = codexDesktopShadowActivity(shadow)
    const desktopSequence = Number(shadow?.activityEventSequence) || 0
    const terminalSequence = Number(known.terminalEvidenceSequence) || 0
    return !(desktopActivity?.status === 'active'
      && shadow?.activityEvidence === 'activity-event'
      && desktopSequence > terminalSequence)
  }

  function codexInventorySnapshotLiveSequence(parentThreadId, branchThreadId, known, shadow) {
    if (branchThreadId !== parentThreadId || !known || !shadow) return 0
    const activity = codexDesktopShadowActivity(shadow)
    if (shadow.activityEvidence !== 'initial-snapshot'
      || activity?.status !== 'active'
      || activity.activeFlags.length > 0
      || known.lastTurnStatus !== 'inProgress') return 0
    const sequence = Number(known.inventoryTurnEvidenceSequence) || 0
    const startedAt = timestampMs(known.inventoryTurnStartedAt)
    return sequence > 0
      && startedAt > 0
      && startedAt === timestampMs(known.lastTurnStartedAt)
      ? sequence
      : 0
  }

  function codexDesktopOrphanedPendingSuperseded(shadow, known) {
    if (!shadow?.ownerDisconnectedAt || !known) return false
    const baselineTurnStartedAt = timestampMs(shadow.inventoryBaselineTurnStartedAt)
    const currentTurnStartedAt = timestampMs(known.connectorLastTurnStartedAt)
    if (baselineTurnStartedAt && currentTurnStartedAt > baselineTurnStartedAt) return true
    if (baselineTurnStartedAt
      && currentTurnStartedAt === baselineTurnStartedAt
      && shadow.inventoryBaselineTurnStatus
      && known.connectorLastTurnStatus
      && shadow.inventoryBaselineTurnStatus !== known.connectorLastTurnStatus) return true
    const baselineUpdatedAt = timestampMs(shadow.inventoryBaselineUpdatedAt)
    const currentUpdatedAt = timestampMs(known.connectorUpdatedAt)
    return Boolean(baselineUpdatedAt && currentUpdatedAt > baselineUpdatedAt)
  }

  function codexDesktopActivitySupersedesAppServer(known, shadows) {
    if (known?.appServerLiveActive !== true || !Number.isInteger(known.appServerLiveSequence)) return false
    const latestDesktopSequence = Math.max(0, ...shadows
      .filter(Boolean)
      .map((shadow) => Number.isInteger(shadow.activityEventSequence) ? shadow.activityEventSequence : 0))
    return latestDesktopSequence > known.appServerLiveSequence
  }

  function codexHasOtherActiveBranch(parentThreadId, branchThreadId, known, shadows, sideShadows) {
    if (!validThreadId(parentThreadId) || !validThreadId(branchThreadId)) return false
    const appServerBranchThreadId = validThreadId(known?.appServerLiveBranchThreadId)
      ? known.appServerLiveBranchThreadId : parentThreadId
    if (known?.appServerLiveActive === true && appServerBranchThreadId !== branchThreadId) return true
    return [
      [parentThreadId, shadows.get(parentThreadId)],
      ...[...sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    ].some(([threadId, shadow]) => threadId !== branchThreadId && shadow
      && codexDesktopShadowActivity(shadow)?.status === 'active')
  }

  function codexCanRetireMissingDesktopSide(parentThreadId, refresh, input = {}) {
    const threadId = refresh?.queryThreadId
    const { known, shadow, parentTerminal } = input
    if (!validThreadId(parentThreadId) || !validThreadId(threadId) || threadId === parentThreadId
      || input.desktopRelation !== parentThreadId || input.inventoryRelation
      || input.completeInventoryKnown !== true || input.completeInventoryContains === true) return false
    if (!shadow || shadow.parentThreadId !== parentThreadId
      || shadow.activityRevision !== refresh.snapshotActivityRevision) return false
    const activity = codexDesktopShadowActivity(shadow)
    if (activity?.status !== 'active' || activity.activeFlags.length > 0
      || activity.planImplementationOnly === true || !parentTerminal) return false
    return !(known?.appServerLiveActive === true && known.appServerLiveBranchThreadId === threadId)
  }

  function codexDesktopCanonicalTerminalDecision(shadow, options = {}) {
    const turn = shadow?.currentCanonicalTurn
    const startedAt = timestampMs(turn?.startedAt)
    if (typeof shadow.ownerClientId !== 'string' || !shadow.ownerClientId || shadow.ownerDisconnectedAt
      || !Number.isInteger(shadow.revision) || shadow.revision < 0) return { reason: 'owner-unavailable' }
    if (shadow.runtime?.type !== 'idle' || shadow.runtime.activeFlags?.length
      || shadow.liveTurnRunning === true) return { reason: 'runtime-not-idle' }
    if (shadow.canonicalLatestComplete !== true || !turn?.turnRef || !Number.isFinite(startedAt) || startedAt <= 0
      || !['completed', 'interrupted', 'failed'].includes(turn.status)) return { reason: 'canonical-not-terminal' }
    if (shadow.requests?.length || shadow.nativeTurnSubmissions?.some((terminal) => terminal !== true)) return { reason: 'pending-work' }
    const overlays = shadow.asyncTurns || []
    if (overlays.some((overlay) => overlay.status === 'inProgress'
      || timestampMs(overlay.startedAt) > startedAt
      || overlay.turnRef !== turn.turnRef && timestampMs(overlay.startedAt) >= startedAt
      || !timestampMs(overlay.startedAt) && overlay.turnRef !== turn.turnRef)) return { reason: 'unsettled-overlay' }
    const previous = options.previousShadow
    const previousTurn = previous?.currentCanonicalTurn
    const previousStartedAt = timestampMs(previousTurn?.startedAt)
    if (previousStartedAt > startedAt
      || previousStartedAt === startedAt && previousTurn?.turnRef && previousTurn.turnRef !== turn.turnRef
      || (previous?.asyncTurns || []).some((overlay) => timestampMs(overlay.startedAt) > startedAt)) return { reason: 'newer-previous-turn' }
    const sameOwner = previous?.ownerClientId === shadow.ownerClientId
    if (sameOwner && (shadow.revision < previous.revision
      || shadow.revision === previous.revision && previousTurn?.turnRef === turn.turnRef && previousTurn.status !== turn.status)) return { reason: 'stale-revision' }
    const previousLive = previous?.liveTurnRunning === true || previous?.runtime?.type === 'active'
    const previousLiveStartedAt = Math.max(previousStartedAt,
      ...(previous?.asyncTurns || []).filter((overlay) => overlay.status === 'inProgress').map((overlay) => timestampMs(overlay.startedAt)))
    if (previous?.ownerClientId && !sameOwner && previousLive
      && (!previousLiveStartedAt || previousLiveStartedAt >= startedAt)) return { reason: 'previous-owner-live' }
    const terminal = options.terminal
    const terminalStartedAt = timestampMs(terminal?.turnStartedAt)
    const branchStartedAt = timestampMs(options.branchTurnStartedAt)
    if (terminalStartedAt > startedAt || branchStartedAt > startedAt) return { reason: 'newer-branch-turn' }
    if (options.branchLiveExact === true && (!branchStartedAt || branchStartedAt >= startedAt)) return { reason: 'exact-branch-live' }
    const duplicate = terminal?.lastTurnStatus === turn.status && terminalStartedAt === startedAt
    const liveSequence = Math.max(Number(options.branchLiveSequence) || 0,
      shadow.activityEvidence === 'activity-event' ? Number(shadow.activityEventSequence) || 0 : 0)
    if (duplicate && liveSequence > (Number(terminal.terminalEvidenceSequence) || 0)) return { reason: 'newer-active-evidence' }
    return { turn: { status: turn.status, startedAt }, duplicate, reason: duplicate ? 'existing-terminal' : 'owner-canonical-terminal' }
  }

  function codexDesktopSideTerminalDecision(shadow, options = {}) {
    if (shadow?.sideConversation !== true || shadow.ephemeral !== true) return { reason: 'not-ephemeral-side' }
    return codexDesktopCanonicalTerminalDecision(shadow, options)
  }

  // A separate App Server reconstructs an unfinished persisted Turn as
  // interrupted even while its Desktop owner is running it. Its inventory or
  // targeted read is not a new stop event for that same owner Turn.
  function codexDesktopTerminalConflictsWithOwner(turn, shadow, turnRef = '') {
    const owner = shadow?.currentCanonicalTurn
    if (!shadow?.ownerClientId || shadow.ownerDisconnectedAt || !owner?.turnRef
      || shadow.canonicalLatestComplete !== true || !timestampMs(owner.startedAt)
      || !['completed', 'interrupted', 'failed'].includes(turn?.status)) return false
    const startedAt = timestampMs(turn.startedAt)
    if (turnRef && turnRef === owner.turnRef) return turn.status !== owner.status
    if (timestampMs(owner.startedAt) > startedAt) return true
    return timestampMs(owner.startedAt) === startedAt
      && (Boolean(turnRef && turnRef !== owner.turnRef) || turn.status !== owner.status)
  }

  function codexDesktopBranchInventoryTurn(shadow, inventory, known, main, turnRef = '') {
    const candidate = inventory?.lastTurnStatus
      ? { status: inventory.lastTurnStatus, startedAt: inventory.turnStartedAt }
      : main && known?.connectorLastTurnStatus
        ? { status: known.connectorLastTurnStatus, startedAt: known.connectorLastTurnStartedAt }
        : main ? { status: known?.lastTurnStatus, startedAt: known?.lastTurnStartedAt } : null
    if (!candidate?.status || codexDesktopTerminalConflictsWithOwner(candidate, shadow, turnRef)) return {}
    // Status and epoch always travel together. Never relabel an old connector
    // interruption with the current canonical/overlay Turn's start time.
    return { lastTurnStatus: candidate.status, lastTurnEvidence: 'inventory',
      turnStartedAt: timestampMs(candidate.startedAt), terminalEvidenceSequence: 0, idleConfirmed: false }
  }

  function codexDesktopInventoryTurnCandidate(turn, shadow, known, turnRef = '') {
    if (!codexDesktopTerminalConflictsWithOwner(turn, shadow, turnRef)) return turn
    const previous = { id: known?.lastTurnId, status: known?.lastTurnStatus,
      startedAt: timestampMs(known?.lastTurnStartedAt), completedAt: timestampMs(known?.lastTurnCompletedAt) }
    // An actual completion notification remains authoritative even while its
    // Desktop projection catches up. A rejected read cannot erase it.
    if (previous.status && previous.startedAt && (known.lastTurnEvidence === 'turn-completed'
      || !codexDesktopTerminalConflictsWithOwner(previous, shadow))) {
      return { ...previous, evidence: known.lastTurnEvidence || 'inventory' }
    }
    return {}
  }

  function codexDesktopMainTerminalFallback(known, activeSequence) {
    return {
      lastTurnStatus: known.lastTurnStatus,
      lastTurnEvidence: known.lastTurnEvidence,
      terminalEvidenceSequence: Number(known.terminalEvidenceSequence) || 0,
      activeEvidenceSequence: activeSequence,
      idleConfirmed: known.idleConfirmed === true,
      turnStartedAt: Number(known.lastTurnStartedAt) || 0,
      terminalAt: Number(known.lastTurnCompletedAt) || Number(known.lastTurnStartedAt) || 0,
      observedAt: Number(known.terminalEvidenceSequence) || 0
    }
  }

  function codexDesktopBranchTurnFields(row, known, options = {}) {
    const { live, terminalStrictlyNewer, activeSequence, idleConfirmed, main, turnRef } = options
    let terminal = options.terminal
    if (terminal?.lastTurnEvidence === 'targeted-after-exit' && codexDesktopTerminalConflictsWithOwner({
      status: terminal.lastTurnStatus, startedAt: terminal.turnStartedAt
    }, row.shadow)) terminal = null
    const baseline = codexDesktopBranchInventoryTurn(row.shadow, row.inventoryEvidence, known, main, turnRef)
    const fields = live && (!terminal || !terminalStrictlyNewer)
      ? { lastTurnStatus: 'inProgress', lastTurnEvidence: 'turn-started',
          activeEvidenceSequence: activeSequence || Number(known.activeEvidenceSequence) || 0, idleConfirmed: false }
      : terminal
        ? { lastTurnStatus: terminal.lastTurnStatus, lastTurnEvidence: terminal.lastTurnEvidence,
            terminalEvidenceSequence: Number(terminal.terminalEvidenceSequence) || 0,
            activeEvidenceSequence: Number(terminal.activeEvidenceSequence) || activeSequence, idleConfirmed }
        : { ...baseline, activeEvidenceSequence: activeSequence }
    const shadowStart = timestampMs(row.shadow?.asyncTurns?.at(-1)?.startedAt)
      || timestampMs(row.shadow?.currentCanonicalTurn?.startedAt)
    return { ...fields,
      turnStartedAt: timestampMs(terminal?.turnStartedAt)
        || (!live ? timestampMs(baseline.turnStartedAt) : 0)
        || shadowStart || timestampMs(row.inventoryEvidence?.turnStartedAt)
        || (main ? timestampMs(known.lastTurnStartedAt) : 0),
      terminalAt: timestampMs(terminal?.terminalAt)
        || (terminal?.lastTurnStatus === 'completed' ? timestampMs(known.lastTurnCompletedAt) : timestampMs(terminal?.turnStartedAt))
    }
  }

  function codexDesktopSnapshotRefreshOptions(threadId, shadow, input = {}) {
    if (!validThreadId(threadId) || !shadow) return null
    const { known, parentThreadId } = input
    const activity = codexDesktopShadowActivity(shadow)
    const knownTurn = ['inProgress', 'completed', 'failed', 'interrupted'].includes(known?.lastTurnStatus)
    if (!known || !validThreadId(parentThreadId) || !knownTurn || !known.lastTurnStartedAt) return null
    if (known.connectorPlanImplementationOnly === true && threadId === parentThreadId) return null
    const detachedDesktopSide = shadow.sideConversation === true
      && threadId !== parentThreadId
      && input.desktopRelation === parentThreadId
      && !input.inventoryRelation
      && input.completeInventoryKnown === true
      && input.completeInventoryContains !== true
      && Boolean(input.parentTerminal)
      && !(known.appServerLiveActive === true && known.appServerLiveBranchThreadId === threadId)
    const settledSide = shadow.sideConversation === true && ['idle', 'notLoaded'].includes(activity?.status)
      && !input.branchTerminal
    if (shadow.activityEvidence !== 'initial-snapshot' && !detachedDesktopSide && !settledSide) return null
    if (!detachedDesktopSide && !settledSide && input.parentLiveSequence > 0) return null
    if ((!settledSide && activity?.status !== 'active') || activity?.activeFlags.length > 0) return null
    return {
      verifyStaleActive: true,
      settleSnapshotTerminal: true,
      queryThreadId: threadId,
      snapshotThreadId: threadId,
      snapshotActivityRevision: shadow.activityRevision,
      forceQuery: detachedDesktopSide || settledSide
    }
  }

  return {
    revision: CODEX_DESKTOP_ACTIVITY_RESOLUTION_REVISION,
    codexReduceWaitingEdge,
    codexDesktopShadowActivity,
    codexDesktopCanonicalRunningWitness,
    codexDesktopHasResolvedCanonicalRun,
    codexDesktopHasStickyPendingRequest,
    codexHasConfirmedTerminalEvidence,
    codexLiveEvidenceSequence,
    codexSnapshotTerminalReady,
    codexShouldDeferHydrationActive,
    codexInventorySnapshotLiveSequence,
    codexDesktopOrphanedPendingSuperseded,
    codexDesktopActivitySupersedesAppServer,
    codexHasOtherActiveBranch,
    codexCanRetireMissingDesktopSide,
    codexDesktopCanonicalTerminalDecision,
    codexDesktopSideTerminalDecision,
    codexDesktopTerminalConflictsWithOwner,
    codexDesktopBranchInventoryTurn,
    codexDesktopInventoryTurnCandidate,
    codexDesktopMainTerminalFallback,
    codexDesktopBranchTurnFields,
    codexDesktopSnapshotRefreshOptions
  }
}

module.exports = {
  CODEX_DESKTOP_ACTIVITY_RESOLUTION_REVISION,
  createCodexDesktopActivityResolution
}
