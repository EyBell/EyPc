'use strict'

const { alignCodexCompletedTurn, compareCodexTurnOrder, sameTurnEvidenceDecision } = require('../companion/branch-causality.cjs')

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
    const planRequests = dependencies.desktopOpenPlanItemRequests?.(shadow) || []
    for (const request of [...(shadow.requests || []), ...planRequests]) {
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

  // A full owner snapshot is weaker than observed progress: require a dated,
  // latest canonical Turn and compare only this conversation's boundaries.
  function codexDesktopSnapshotRunningWitness(shadow, previous, input = {}) {
    const { known, knownTurnRef, branchTerminal, threadId, parentThreadId } = input
    const turn = shadow?.currentCanonicalTurn
    const startedAt = timestampMs(turn?.startedAt)
    if (!validThreadId(threadId) || !shadow?.ownerClientId || shadow.ownerDisconnectedAt
      || !Number.isInteger(shadow.revision) || shadow.revision < 0
      || shadow.canonicalLatestComplete !== true || !turn?.turnRef
      || turn.status !== 'inProgress' || shadow.runtime?.type !== 'active'
      || !Number.isFinite(startedAt) || startedAt <= 0) return false
    const terminal = (status) => ['completed', 'interrupted', 'failed'].includes(status)
    // Independent server reads can report interrupted/failed while the owner
    // is still executing that exact Turn. They are not owner terminal events.
    // A complete fresh owner snapshot may correct only an identity+start match;
    // completed, event-confirmed and owner-canonical terminals remain barriers.
    const independentStop = (source) => ['interrupted', 'failed'].includes(source?.lastTurnStatus)
      && ['inventory', 'targeted-after-exit'].includes(source?.lastTurnEvidence)
    const correctsKnownStop = independentStop(known) && turn.turnRef === knownTurnRef
      && startedAt === timestampMs(known?.lastTurnStartedAt)
    // The caller passes the exact thread inventory, never the parent's row.
    const knownStart = timestampMs(known?.lastTurnStartedAt)
    if (knownStart > startedAt) return false
    if (terminal(known?.lastTurnStatus) && !correctsKnownStop
      && (turn.turnRef === knownTurnRef || !knownStart
        || startedAt <= Math.max(knownStart, timestampMs(known.lastTurnCompletedAt)))) return false
    if (branchTerminal?.branchThreadId === threadId && branchTerminal.parentThreadId === parentThreadId
      && terminal(branchTerminal.lastTurnStatus)) {
      const boundary = Math.max(timestampMs(branchTerminal.turnStartedAt), timestampMs(branchTerminal.terminalAt))
      const correctsBranchStop = independentStop(branchTerminal)
        && startedAt === timestampMs(branchTerminal.turnStartedAt)
      if (!correctsBranchStop && (!boundary || startedAt <= boundary)) return false
    }
    const priorTurn = previous?.currentCanonicalTurn
    const priorStart = timestampMs(priorTurn?.startedAt)
    if (priorStart > startedAt || terminal(priorTurn?.status)
      && (priorTurn.turnRef === turn.turnRef || !priorStart || startedAt <= priorStart)) return false
    // Re-follow is not a new activity event. The snapshot caller has already
    // retained the previous sequence when the live semantics are unchanged.
    if (previous?.ownerClientId === shadow.ownerClientId
      && priorTurn?.turnRef === turn.turnRef && priorStart === startedAt
      && shadow.activityEvidence === 'activity-event' && shadow.activityEventSequence > 0) return false
    if (previous?.ownerClientId === shadow.ownerClientId && shadow.revision <= previous.revision) return false
    return true
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
        && (!branchThreadId || parentThreadId === branchThreadId)
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
    if (known.appServerLiveActive === true && branchThreadId === parentThreadId) return false
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
    if (known?.appServerLiveActive === true && parentThreadId !== branchThreadId) return true
    return [
      [parentThreadId, shadows.get(parentThreadId)],
      ...[...sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    ].some(([threadId, shadow]) => threadId !== branchThreadId && shadow
      && codexDesktopShadowActivity(shadow)?.status === 'active')
  }

  function codexCanRetireMissingDesktopSide(parentThreadId, refresh, input = {}) {
    const threadId = refresh?.queryThreadId
    const { shadow, parentTerminal } = input
    if (!validThreadId(parentThreadId) || !validThreadId(threadId) || threadId === parentThreadId
      || input.desktopRelation !== parentThreadId || input.inventoryRelation
      || input.completeInventoryKnown !== true || input.completeInventoryContains === true) return false
    if (!shadow || shadow.parentThreadId !== parentThreadId
      || shadow.activityRevision !== refresh.snapshotActivityRevision) return false
    const activity = codexDesktopShadowActivity(shadow)
    if (activity?.status !== 'active' || activity.activeFlags.length > 0
      || activity.planImplementationOnly === true || !parentTerminal) return false
    return input.appServerSideActive !== true
  }

  function codexDesktopCanonicalTerminalDecision(shadow, options = {}) {
    const turn = shadow?.currentCanonicalTurn
    const startedAt = timestampMs(turn?.startedAt)
    if (typeof shadow?.ownerClientId !== 'string' || !shadow.ownerClientId || shadow.ownerDisconnectedAt
      || !Number.isInteger(shadow.revision) || shadow.revision < 0) return { reason: 'owner-unavailable' }
    if (shadow.runtime?.type !== 'idle' || shadow.runtime.activeFlags?.length
      || shadow.liveTurnRunning === true) return { reason: 'runtime-not-idle' }
    if (shadow.canonicalLatestComplete !== true || !turn?.turnRef || !Number.isFinite(startedAt) || startedAt <= 0
      || !['completed', 'interrupted', 'failed'].includes(turn.status)) return { reason: 'canonical-not-terminal' }
    if (shadow.requests?.length || shadow.nativeTurnSubmissions?.some((terminal) => terminal !== true)) return { reason: 'pending-work' }
    const overlays = shadow.asyncTurns || []
    if (overlays.some((overlay) => overlay.status === 'inProgress'
      || overlay.turnRef !== turn.turnRef && timestampMs(overlay.startedAt) > startedAt
      || overlay.turnRef !== turn.turnRef && timestampMs(overlay.startedAt) >= startedAt
      || !timestampMs(overlay.startedAt) && overlay.turnRef !== turn.turnRef)) return { reason: 'unsettled-overlay' }
    const previous = options.previousShadow
    const previousTurn = previous?.currentCanonicalTurn
    const previousStartedAt = timestampMs(previousTurn?.startedAt)
    if (previousTurn?.turnRef !== turn.turnRef && previousStartedAt > startedAt
      || previousStartedAt === startedAt && previousTurn?.turnRef && previousTurn.turnRef !== turn.turnRef
      || (previous?.asyncTurns || []).some((overlay) => overlay.turnRef !== turn.turnRef && timestampMs(overlay.startedAt) > startedAt)) return { reason: 'newer-previous-turn' }
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
    if (terminal?.turnRef !== turn.turnRef && terminalStartedAt > startedAt
      || options.branchTurnRef !== turn.turnRef && branchStartedAt > startedAt) return { reason: 'newer-branch-turn' }
    if (options.branchLiveExact === true && (!branchStartedAt || branchStartedAt >= startedAt)) return { reason: 'exact-branch-live' }
    const duplicate = terminal?.lastTurnStatus === turn.status && terminal?.turnRef === turn.turnRef
    const liveSequence = Math.max(Number(options.branchLiveSequence) || 0,
      shadow.activityEvidence === 'activity-event' ? Number(shadow.activityEventSequence) || 0 : 0)
    if (duplicate && liveSequence > (Number(terminal.terminalEvidenceSequence) || 0)) return { reason: 'newer-active-evidence' }
    return { turn: { turnRef: turn.turnRef, status: turn.status, startedAt }, duplicate, reason: duplicate ? 'existing-terminal' : 'owner-canonical-terminal' }
  }

  function codexDesktopTerminalDiagnostic(shadow, previousShadow, input = {}) {
    const reason = input.decision?.reason || 'unavailable'
    const terminal = input.terminal
    const signature = JSON.stringify([reason, shadow.currentCanonicalTurn?.turnRef, shadow.currentCanonicalTurn?.status,
      shadow.currentCanonicalTurn?.startedAt, terminal?.turnRef, terminal?.terminalEvidenceSequence,
      input.branchStartedAt, input.exactLive, input.goal?.goalStatus, input.goal?.goalFreshness])
    if ((shadow.terminalDecisionSignature || previousShadow?.terminalDecisionSignature) === signature) return null
    shadow.terminalDecisionSignature = signature
    const details = {
      reason, source: 'owner-canonical', terminalStatus: input.decision?.turn?.status || 'unknown',
      memberRef: input.memberRef, goalStatus: input.goal?.goalStatus, goalFreshness: input.goal?.goalFreshness,
      canonicalStartedAt: timestampMs(shadow.currentCanonicalTurn?.startedAt),
      terminalStartedAt: timestampMs(terminal?.turnStartedAt), branchStartedAt: input.branchStartedAt,
      branchLiveExact: input.exactLive === true,
      turnRef: shadow.currentCanonicalTurn?.turnRef || '',
      sameTerminalIdentity: Boolean(terminal?.turnRef && terminal.turnRef === shadow.currentCanonicalTurn?.turnRef),
      terminalSequence: Number(terminal?.terminalEvidenceSequence) || 0,
      terminalEvidence: ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(terminal?.lastTurnEvidence)
        ? terminal.lastTurnEvidence : 'unknown',
      ...(shadow.sideConversation === true ? {
        ephemeralKnown: typeof shadow.ephemeral === 'boolean', ephemeral: shadow.ephemeral === true,
        runtimeType: ['active', 'idle', 'notLoaded', 'systemError'].includes(shadow.runtime?.type) ? shadow.runtime.type : 'unknown',
        canonicalStatus: ['inProgress', 'completed', 'interrupted', 'failed'].includes(shadow.currentCanonicalTurn?.status)
          ? shadow.currentCanonicalTurn.status : 'unknown'
      } : {})
    }
    return {
      level: 'info', scope: 'task-topology', event: shadow.sideConversation === true ? 'desktop-side-terminal' : 'desktop-main-terminal',
      outcome: input.decision?.turn ? 'corroborated' : 'abstained', provider: 'codex', taskRef: input.taskRef || '', details
    }
  }

  function codexDesktopStartedBranchBaseline(known, sideTurn, sideInventory, side) {
    return side ? {
      lastTurnId: sideTurn?.id || sideInventory?.turnId,
      lastTurnStatus: sideTurn?.status || sideInventory?.lastTurnStatus,
      lastTurnStartedAt: sideTurn?.startedAt || sideInventory?.turnStartedAt,
      turnStartedAtPrecisionMs: sideTurn?.turnStartedAtPrecisionMs || sideInventory?.turnStartedAtPrecisionMs
    } : known
  }

  function codexDesktopSideTerminalDecision(shadow, options = {}) {
    const ordinaryTerminal = shadow?.ephemeral === false
      && ['completed', 'interrupted', 'failed'].includes(shadow.currentCanonicalTurn?.status)
    if (shadow?.sideConversation !== true || (shadow.ephemeral !== true && !ordinaryTerminal)) {
      return { reason: 'not-ephemeral-side' }
    }
    return codexDesktopCanonicalTerminalDecision(shadow, options)
  }

  function codexDesktopUnloadedSideMetadata(thread, threadId, parentId, attachedParentId = parentId) {
    return thread?.id === threadId && thread.threadSource === 'user'
      && (thread.attachedToThreadId
        ? validThreadId(attachedParentId) && thread.attachedToThreadId === attachedParentId
        : thread.forkedFromId === parentId && (!thread.parentThreadId || thread.parentThreadId === parentId))
      && ['idle', 'notLoaded'].includes(thread.status?.type)
      && !thread.status.activeFlags?.length
  }

  function codexVerifiedInventoryTerminal(turn, { status, live, shadow, pending, turnRef, expectedStatus }) {
    const start = timestampMs(turn?.startedAt)
    const interruptedAt = timestampMs(turn?.interruptedAt)
    const timedInterruption = interruptedAt > 0
      && interruptedAt + (codexExplicitTurnPrecision(turn.terminalAtPrecisionMs) || 1) - 1 >= start
    return Boolean(turn?.id && turn.status === expectedStatus && (['idle', 'notLoaded'].includes(status)
      || status === 'systemError' && expectedStatus === 'failed')
      && !live && !pending && !shadow?.requests?.length && !shadow?.nativeTurnSubmissions?.some(settled => settled !== true)
      && (!shadow?.currentCanonicalTurn?.turnRef || shadow.ownerDisconnectedAt
        || shadow.currentCanonicalTurn.turnRef === turnRef && shadow.currentCanonicalTurn.status === expectedStatus)
      && (expectedStatus !== 'interrupted' || timedInterruption))
  }

  function codexExplicitTurnPrecision(value) {
    const precision = Number(value)
    return precision === 1 || precision === 1000 ? precision : 0
  }

  function codexSameSourceSecond(left, right) {
    return left > 0 && right > 0 && Math.floor(left / 1000) === Math.floor(right / 1000)
  }

  function codexCrossTurnOrder(turn, runtime) {
    const domain = 'codex-turn'
    const turnStart = timestampMs(turn?.startedAt)
    const runtimeStart = timestampMs(runtime?.startedAt)
    const previous = {
      causalDomain: domain,
      causalKey: turn?.id || '',
      turnPredecessorKey: turn?.predecessorId,
      turnStartedAt: turnStart,
      turnStartedAtPrecisionMs: codexExplicitTurnPrecision(turn?.turnStartedAtPrecisionMs)
    }
    const incoming = {
      causalDomain: domain,
      causalKey: runtime?.turnId || '',
      turnStartedAt: runtimeStart,
      turnStartedAtPrecisionMs: codexExplicitTurnPrecision(runtime?.turnStartedAtPrecisionMs)
    }
    const order = compareCodexTurnOrder(previous, incoming)
    if ((order === 'newer' || order === 'older') && previous.turnPredecessorKey !== incoming.causalKey
      && codexSameSourceSecond(turnStart, runtimeStart)
      && !(previous.turnStartedAtPrecisionMs && incoming.turnStartedAtPrecisionMs)) return 'unknown'
    return order
  }

  function codexAbortTerminal(runtime, turn, sameTurn) {
    const startedAt = timestampMs(turn?.startedAt)
    const abortedStart = timestampMs(runtime?.startedAt)
    const matchingStart = !sameTurn || !startedAt || startedAt === abortedStart
      || (Math.floor(startedAt / 1000) === Math.floor(abortedStart / 1000)
        && (startedAt % 1000 === 0 || abortedStart % 1000 === 0))
    const interruptedAt = matchingStart
      ? Math.max(timestampMs(runtime.interruptedAt), sameTurn ? timestampMs(turn?.interruptedAt) : 0) : 0
    return {
      id: runtime.turnId,
      status: 'interrupted',
      startedAt: abortedStart,
      ...(interruptedAt >= Math.max(abortedStart, sameTurn ? startedAt : 0) ? { interruptedAt } : {})
    }
  }

  function codexDesktopUnloadedSideTerminal(turn, runtime) {
    if (!turn && runtime?.turnOrderUnclear) return null
    const startedAt = timestampMs(turn?.startedAt)
    const abortedAt = timestampMs(runtime?.edgeAt)
    const abortedStart = timestampMs(runtime?.startedAt)
    if (runtime?.edge === 'turn-aborted' && runtime.turnId && abortedStart > 0 && abortedAt >= abortedStart) {
      const sameTurn = Boolean(turn?.id) && runtime.turnId === turn.id
      if (!turn || (sameTurn && turn.status === 'interrupted')) return codexAbortTerminal(runtime, turn, sameTurn)
      if (sameTurn || !turn.id) return null
      const order = codexCrossTurnOrder(turn, runtime)
      if (order === 'newer' && turn.status !== 'inProgress' && startedAt > 0) {
        return codexAbortTerminal(runtime, turn, false)
      }
      if (order !== 'older') return null
      if (turn.status === 'interrupted' && startedAt > 0
        && timestampMs(turn.interruptedAt) >= startedAt) return turn
    }
    if (turn?.id && runtime?.phase === 'active' && runtime.turnId && runtime.turnId !== turn.id
      && codexCrossTurnOrder(turn, runtime) !== 'older') {
      return null
    }
    if (turn?.id && runtime?.turnId === turn.id && turn.status === 'completed'
      && runtime.edge === 'task-complete' && startedAt > 0 && timestampMs(runtime.edgeAt) >= startedAt) {
      return turn.completedAt || !runtime.terminalAtPrecisionMs
        ? turn : { ...turn, completedAt: timestampMs(runtime.edgeAt), terminalAtPrecisionMs: runtime.terminalAtPrecisionMs }
    }
    if (turn?.id && runtime?.turnId && runtime.turnId !== turn.id && runtime.edge === 'task-complete'
      && abortedStart > 0 && timestampMs(runtime.edgeAt) >= abortedStart) {
      const order = codexCrossTurnOrder(turn, runtime)
      if (order === 'newer' && runtime.terminalAtPrecisionMs) {
        if (turn.status === 'inProgress') return null
        return {
          id: runtime.turnId,
          status: 'completed',
          startedAt: abortedStart,
          completedAt: timestampMs(runtime.edgeAt),
          turnStartedAtPrecisionMs: runtime.turnStartedAtPrecisionMs,
          terminalAtPrecisionMs: runtime.terminalAtPrecisionMs
        }
      }
      if (order !== 'older') return null
    }
    if (!turn?.id || startedAt <= 0) return null
    if (turn.status === 'failed') return turn
    return turn.status === 'completed' && timestampMs(turn.completedAt) >= startedAt ? turn : null
  }

  function codexDesktopSideNeedsPersistedTerminal(shadow) {
    return shadow?.sideConversation === true && shadow.ephemeral !== true && !shadow.ownerDisconnectedAt
      && ['idle', 'notLoaded'].includes(codexDesktopShadowActivity(shadow)?.status)
      && !shadow.currentCanonicalTurn?.turnRef && shadow.liveTurnRunning !== true
      && !shadow.requests?.length && !shadow.asyncTurns?.some((turn) => turn.status === 'inProgress')
      && !shadow.nativeTurnSubmissions?.some((terminal) => terminal !== true)
  }

  // Only a current owner-confirmed successful ephemeral terminal can stop
  // future recovery. Keep the live member/terminal; persist no phase as a hint.
  function codexDesktopSideNeedsRecoveryHint(shadow, terminal, goal) {
    if (shadow?.ephemeral !== true || goal?.goalFreshness !== 'fresh'
      || !['none', 'complete'].includes(goal.goalStatus)) return true
    const decision = codexDesktopSideTerminalDecision(shadow, { terminal })
    return decision.turn?.status !== 'completed'
      || terminal?.lastTurnStatus !== 'completed'
      || timestampMs(terminal.turnStartedAt) !== decision.turn.startedAt
      || !isConfirmedTurnEvidence(terminal.lastTurnEvidence)
      || !(terminal.terminalEvidenceSequence > 0)
  }

  // A separate App Server reconstructs an unfinished persisted Turn as
  // interrupted even while its Desktop owner is running it. Its inventory or
  // targeted read is not a new stop event for that same owner Turn.
  function codexDesktopTerminalConflictsWithOwner(turn, shadow, turnRef = '', predecessorRef = '') {
    const owner = shadow?.currentCanonicalTurn
    if (!shadow?.ownerClientId || shadow.ownerDisconnectedAt || !owner?.turnRef
      || shadow.canonicalLatestComplete !== true || !timestampMs(owner.startedAt)
      || !['completed', 'interrupted', 'failed'].includes(turn?.status)) return false
    const startedAt = timestampMs(turn.startedAt)
    if (turnRef && turnRef === owner.turnRef) return turn.status !== owner.status
    if (turnRef) {
      const causalDomain = 'codex-owner-turn'
      return compareCodexTurnOrder(
        { causalDomain, causalKey: owner.turnRef, turnStartedAt: owner.startedAt, turnStartedAtPrecisionMs: 1 },
        { causalDomain, causalKey: turnRef, turnPredecessorKey: predecessorRef, turnStartedAt: startedAt,
          turnStartedAtPrecisionMs: turn.turnStartedAtPrecisionMs }
      ) !== 'newer'
    }
    if (timestampMs(owner.startedAt) > startedAt) return true
    return timestampMs(owner.startedAt) === startedAt
      && (Boolean(turnRef && turnRef !== owner.turnRef) || turn.status !== owner.status)
  }

  function codexDesktopBranchInventoryTurn(shadow, inventory, known, main, turnRef = '') {
    const sideTurn = inventory?.latestTurn?.id && inventory.latestTurn.id === inventory.turnId
      && inventory.latestTurn.status === inventory.lastTurnStatus ? inventory.latestTurn : null
    const currentMainTurn = main && known?.lastTurnId && (!known.connectorLastTurnStatus
      || known.connectorLastTurnId === known.lastTurnId && known.connectorLastTurnStatus === known.lastTurnStatus)
    const candidate = inventory?.lastTurnStatus
      ? { status: inventory.lastTurnStatus, startedAt: inventory.turnStartedAt,
          turnStartedAtPrecisionMs: inventory.turnStartedAtPrecisionMs, terminalAt: sideTurn?.completedAt || sideTurn?.interruptedAt,
          terminalAtPrecisionMs: sideTurn?.terminalAtPrecisionMs }
      : main && known?.connectorLastTurnStatus
        ? { status: known.connectorLastTurnStatus, startedAt: known.connectorLastTurnStartedAt,
            turnStartedAtPrecisionMs: known.connectorLastTurnStartedAtPrecisionMs,
            terminalAt: currentMainTurn ? known.lastTurnCompletedAt : 0, terminalAtPrecisionMs: known.terminalAtPrecisionMs }
        : main ? { status: known?.lastTurnStatus, startedAt: known?.lastTurnStartedAt,
            turnStartedAtPrecisionMs: known?.turnStartedAtPrecisionMs,
            terminalAt: currentMainTurn ? known.lastTurnCompletedAt : 0, terminalAtPrecisionMs: known?.terminalAtPrecisionMs } : null
    if (!candidate?.status || codexDesktopTerminalConflictsWithOwner(candidate, shadow, turnRef)) return {}
    // Status and epoch always travel together. Never relabel an old connector
    // interruption with the current canonical/overlay Turn's start time.
    return { lastTurnStatus: candidate.status, lastTurnEvidence: 'inventory',
      turnStartedAt: timestampMs(candidate.startedAt), turnStartedAtPrecisionMs: candidate.turnStartedAtPrecisionMs,
      terminalAt: timestampMs(candidate.terminalAt),
      terminalAtPrecisionMs: candidate.terminalAt ? candidate.terminalAtPrecisionMs : undefined,
      terminalEvidenceSequence: 0, idleConfirmed: false }
  }

  function codexDesktopInventoryTurnCandidate(turn, shadow, known, turnRef = '') {
    if (!codexDesktopTerminalConflictsWithOwner(turn, shadow, turnRef)) return turn
    const previous = { id: known?.lastTurnId, status: known?.lastTurnStatus,
      startedAt: timestampMs(known?.lastTurnStartedAt), completedAt: timestampMs(known?.lastTurnCompletedAt),
      turnStartedAtPrecisionMs: known?.turnStartedAtPrecisionMs, terminalAtPrecisionMs: known?.terminalAtPrecisionMs }
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
      terminalAt: Number(known.lastTurnCompletedAt) || 0,
      turnStartedAtPrecisionMs: known.turnStartedAtPrecisionMs,
      terminalAtPrecisionMs: known.lastTurnCompletedAt ? known.terminalAtPrecisionMs : undefined,
      observedAt: Number(known.terminalEvidenceSequence) || 0
    }
  }

  function codexDesktopBranchTurnFields(row, known, options = {}) {
    const { live, activeSequence, idleConfirmed, main, turnRef } = options
    let terminal = options.terminal
    if (terminal?.lastTurnEvidence === 'targeted-after-exit' && codexDesktopTerminalConflictsWithOwner({
      status: terminal.lastTurnStatus, startedAt: terminal.turnStartedAt, turnStartedAtPrecisionMs: terminal.turnStartedAtPrecisionMs
    }, row.shadow, terminal.turnRef, terminal.turnPredecessorRef)) terminal = null
    const inventoryTurnRef = row.lane === 'app-server' && !main
      ? options.inventoryTurnRef || '' : turnRef || ''
    const baseline = codexDesktopBranchInventoryTurn(row.shadow, row.inventoryEvidence, known, main, inventoryTurnRef)
    const waiting = row.activity?.activeFlags?.length > 0
    const shadowTurn = row.shadow?.asyncTurns?.at(-1) || row.shadow?.currentCanonicalTurn
    const hasRunningTurn = row.appServerActivity?.turn?.status === 'inProgress' || shadowTurn?.status === 'inProgress'
      || baseline.lastTurnStatus === 'inProgress'
    const liveTurnRef = row.lane === 'app-server' ? turnRef || '' : shadowTurn?.turnRef || turnRef || ''
    const predecessorFor = ref => ref && ref === options.latestTurnRef ? options.latestTurnPredecessorRef || '' : ''
    const liveTurn = live && (!waiting || hasRunningTurn) ? {
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: activeSequence || Number(known.activeEvidenceSequence) || 0,
      terminalEvidenceSequence: 0,
      idleConfirmed: false,
      turnRef: liveTurnRef,
      turnPredecessorRef: predecessorFor(liveTurnRef),
      turnStartedAtSource: row.lane === 'app-server' ? 'app-server'
        : row.shadow?.asyncTurns?.at(-1) ? 'desktop-overlay' : shadowTurn ? 'desktop-canonical' : 'inventory',
      turnStartedAt: row.lane === 'app-server'
        ? timestampMs(options.liveTurnStartedAt)
        : shadowTurn ? timestampMs(shadowTurn.startedAt) : timestampMs(baseline.turnStartedAt),
      turnStartedAtPrecisionMs: row.lane === 'app-server' ? options.liveTurnStartedAtPrecisionMs
        : shadowTurn?.startedAt ? 1 : baseline.turnStartedAtPrecisionMs,
      terminalAt: 0
    } : null
    let terminalTurn = terminal ? {
      lastTurnStatus: terminal.lastTurnStatus,
      lastTurnEvidence: terminal.lastTurnEvidence,
      terminalEvidenceSequence: Number(terminal.terminalEvidenceSequence) || 0,
      activeEvidenceSequence: Number(terminal.activeEvidenceSequence) || activeSequence,
      idleConfirmed,
      turnRef: terminal.turnRef || '',
      turnPredecessorRef: terminal.turnPredecessorRef || predecessorFor(terminal.turnRef),
      turnStartedAtSource: 'terminal',
      turnStartedAt: timestampMs(terminal.turnStartedAt),
      turnStartedAtPrecisionMs: terminal.turnStartedAtPrecisionMs,
      terminalAtPrecisionMs: terminal.terminalAtPrecisionMs,
      terminalAt: timestampMs(terminal.terminalAt)
    } : null
    if (liveTurn?.turnRef && terminalTurn?.turnRef) {
      const causalDomain = options.causalDomain || terminal.causalDomain || 'codex-member'
      const previous = { ...liveTurn, causalDomain, causalKey: liveTurn.turnRef,
        turnPredecessorKey: liveTurn.turnPredecessorRef, liveCurrent: true }
      const candidate = { ...terminalTurn, causalDomain: terminal.causalDomain || causalDomain,
        causalKey: terminalTurn.turnRef, turnPredecessorKey: terminalTurn.turnPredecessorRef, exactTerminal: true,
        kind: terminalTurn.lastTurnStatus === 'completed' ? 'turn-completed' : '' }
      const aligned = terminalTurn.lastTurnStatus === 'completed' ? alignCodexCompletedTurn(previous, candidate) : candidate
      terminalTurn = { ...terminalTurn, turnStartedAt: aligned.turnStartedAt, terminalAt: aligned.terminalAt,
        turnStartedAtPrecisionMs: aligned.turnStartedAtPrecisionMs, terminalAtPrecisionMs: aligned.terminalAtPrecisionMs }
      const accepted = sameTurnEvidenceDecision(previous, aligned)?.accepted
      const useTerminal = accepted ?? (terminalTurn.terminalEvidenceSequence > liveTurn.activeEvidenceSequence)
      return { ...(useTerminal ? terminalTurn : liveTurn), competingTurn: useTerminal ? liveTurn : terminalTurn }
    }
    if (terminalTurn && (!liveTurn || terminalTurn.terminalEvidenceSequence > liveTurn.activeEvidenceSequence)) return terminalTurn
    if (liveTurn) return liveTurn
    return { ...baseline, activeEvidenceSequence: activeSequence, turnRef: inventoryTurnRef,
      turnPredecessorRef: predecessorFor(inventoryTurnRef), turnStartedAtSource: 'inventory',
      turnStartedAt: timestampMs(baseline.turnStartedAt), terminalAt: baseline.terminalAt || 0 }
  }

  function codexDesktopActivityRebase(branch, previous, causalDomain) {
    if (!branch.causalKey || branch.causalDomain !== causalDomain
      || !Number.isSafeInteger(branch.terminalSnapshotRevision) || branch.terminalSnapshotRevision <= 0
      || !['completed', 'interrupted', 'failed'].includes(branch.lastTurnStatus)) return undefined
    if (!previous || previous.phase !== 'running' || !Number.isSafeInteger(previous.phaseRevision)
      || previous.phaseRevision <= 0 || branch.terminalEvidenceSequence <= previous.phaseRevision) return undefined
    return {
      expectedCausalKey: previous.causalKey,
      expectedPhaseRevision: previous.phaseRevision,
      causalDomain: branch.causalDomain,
      snapshotRevision: branch.terminalSnapshotRevision
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
      && input.appServerSideActive !== true
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
    codexDesktopSnapshotRunningWitness,
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
    codexDesktopUnloadedSideMetadata,
    codexVerifiedInventoryTerminal,
    codexDesktopUnloadedSideTerminal,
    codexDesktopSideNeedsPersistedTerminal,
    codexDesktopSideNeedsRecoveryHint,
    codexDesktopTerminalConflictsWithOwner,
    codexDesktopBranchInventoryTurn,
    codexDesktopInventoryTurnCandidate,
    codexDesktopMainTerminalFallback,
    codexDesktopBranchTurnFields,
    codexDesktopActivityRebase,
    codexDesktopSnapshotRefreshOptions,
    codexDesktopTerminalDiagnostic,
    codexDesktopStartedBranchBaseline
  }
}

module.exports = {
  CODEX_DESKTOP_ACTIVITY_RESOLUTION_REVISION,
  createCodexDesktopActivityResolution
}
