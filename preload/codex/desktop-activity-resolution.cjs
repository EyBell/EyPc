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
 * All six functions are pure over their arguments; no module state. The
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
      : shadow.suppressUncorroboratedActive === true && shadow.runtime.type === 'active'
        ? 'notLoaded'
        : shadow.runtime.type
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

  return {
    revision: CODEX_DESKTOP_ACTIVITY_RESOLUTION_REVISION,
    codexReduceWaitingEdge,
    codexDesktopShadowActivity,
    codexDesktopHasStickyPendingRequest,
    codexHasConfirmedTerminalEvidence,
    codexShouldDeferHydrationActive,
    codexInventorySnapshotLiveSequence
  }
}

module.exports = {
  CODEX_DESKTOP_ACTIVITY_RESOLUTION_REVISION,
  createCodexDesktopActivityResolution
}
