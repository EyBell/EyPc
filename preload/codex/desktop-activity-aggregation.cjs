'use strict'

/**
 * Activity and unread aggregations that answer "what does this parent thread's
 * status look like given its own evidence and its Side Chats' evidence."
 * They share no state; member withdrawal reuses the same activity reducer.
 * Grouped in one module
 * because they are the same shape of problem (merge N observations into one
 * parent-level verdict), not because they cooperate.
 *
 * `codexAppServerActiveDominates` decides whether App Server live evidence
 * outranks Desktop activity-event evidence by sequence. `codexResolveParentActivity`
 * merges a parent's own activity with its children's into one status,
 * waiting flags and timestamps. `codexDesktopAggregateUnread` merges unread
 * observations the same way. `timestampMs` is injected on the rollout-evidence
 * precedent. `unreadObservation` is injected because it is itself reached
 * from several other call sites in the entry and touches the entry's
 * `codexDesktopOpenedReadAcknowledgements` map -- a high-share binding this
 * module must never take on, only call through.
 */

const CODEX_DESKTOP_ACTIVITY_AGGREGATION_REVISION = 'codex-desktop-activity-aggregation-v1'

function createCodexDesktopActivityAggregation(dependencies = {}) {
  const timestampMs = dependencies.timestampMs
  const unreadObservation = dependencies.unreadObservation
  if (typeof timestampMs !== 'function' || typeof unreadObservation !== 'function') {
    throw new TypeError('codex desktop activity aggregation requires timestampMs and unreadObservation')
  }

  function codexDesktopAsyncQuestionOverridesRunning(known, shadows) {
    // A repeated running observation cannot answer a current async question.
    return (shadows || []).some((shadow) => ['inProgress', 'completed'].includes(shadow?.currentCanonicalTurn?.status)
      && timestampMs(shadow.currentCanonicalTurn.startedAt) >= timestampMs(known.lastTurnStartedAt)
      && shadow.requests?.some((request) => request.asyncQuestion === true
        && dependencies.waitingEvidenceVisible?.(shadow.waitingState, 'waitingOnUserInput', request.observedSequence)))
  }

  function codexDesktopRepeatedStartPreservesQuestion(known, turn, shadows, turnRef) {
    return known?.lastTurnStatus === 'inProgress'
      && turn.startedAt === timestampMs(known.lastTurnStartedAt)
      && (!turnRef || shadows.some((shadow) => shadow?.currentCanonicalTurn?.turnRef === turnRef))
      && codexDesktopAsyncQuestionOverridesRunning(known, shadows)
  }

  function codexAppServerActiveDominates(known, shadows) {
    if (known?.appServerLiveActive !== true || codexDesktopAsyncQuestionOverridesRunning(known, shadows)) return false
    const appServerSequence = Number(known.appServerLiveSequence) || 0
    const desktopSequence = Math.max(0, ...(Array.isArray(shadows) ? shadows : [])
      .filter((shadow) => shadow?.activityEvidence === 'activity-event')
      .map((shadow) => Number(shadow.activityEventSequence) || 0))
    return appServerSequence > 0 && appServerSequence >= desktopSequence
  }

  function codexResolveParentActivity(own, childActivities, options = {}) {
    const activities = [own, ...childActivities].filter(Boolean)
    const connectorActivity = options.connectorActivity || options
    // The caller has already compared App Server and Desktop causal sequences.
    // Once App Server wins, a refollowed Desktop snapshot belongs to the older
    // waiting epoch and must not donate its flags to the new running Turn.
    const appServerActive = options.appServerActive === true
    const activeFlags = [...new Set((appServerActive
      ? connectorActivity.connectorActiveFlags || []
      : activities.flatMap((activity) => activity.activeFlags || [])))]
    const hasInput = activeFlags.includes('waitingOnUserInput')
    const hasApproval = activeFlags.includes('waitingOnApproval')
    const hasActive = activities.some((activity) => activity.status === 'active')
    const hasSystemError = activities.some((activity) => activity.status === 'systemError')
    const status = hasInput || hasApproval || hasActive || appServerActive
      ? 'active'
      : hasSystemError ? 'systemError' : own.status
    const waitingActivities = appServerActive
      ? (hasInput || hasApproval
          ? [{
              activeFlags,
              waitingSince: connectorActivity.connectorWaitingSince,
              planImplementationOnly: connectorActivity.connectorPlanImplementationOnly === true
            }]
          : [])
      : activities.filter((activity) => (activity.activeFlags || [])
        .some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))
    const planImplementationOnly = status === 'active'
      && waitingActivities.length > 0
      && waitingActivities.every((activity) => activity.planImplementationOnly === true)
    const desktopActiveSince = status === 'active' && !appServerActive
      ? Math.max(0, ...activities
        .filter((activity) => activity.status === 'active')
        .map((activity) => timestampMs(activity.desktopActiveSince)))
      : 0
    const waitingSince = status === 'active' && (hasInput || hasApproval)
      ? Math.max(0, ...waitingActivities.map((activity) => timestampMs(activity.waitingSince)))
        || timestampMs(connectorActivity.connectorWaitingSince)
      : 0
    return {
      status,
      activeFlags: status === 'active'
        ? (appServerActive ? [...(connectorActivity.connectorActiveFlags || [])] : activeFlags)
        : [],
      planImplementationOnly,
      hasInput,
      hasApproval,
      hasActive,
      hasSystemError,
      appServerActive,
      waitingSince,
      desktopActiveSince
    }
  }

  /** Rebuild derived activity after membership withdrawal from remaining raw evidence. */
  function codexParentActivityAfterMemberRemoval(branches, known = {}) {
    const rows = Array.isArray(branches) ? branches : []
    const own = rows.find((branch) => branch.branchKind === 'main')
    const projected = codexResolveParentActivity(own || { status: 'notLoaded', activeFlags: [] },
      rows.filter((branch) => branch !== own))
    const activity = {
      status: projected.status, activeFlags: projected.activeFlags,
      waitingSince: projected.waitingSince, desktopActiveSince: projected.desktopActiveSince,
      planImplementationOnly: projected.planImplementationOnly
    }
    if (projected.status === 'active') return activity
    const exactTerminal = own && ['completed', 'interrupted', 'failed'].includes(own.lastTurnStatus)
      && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(own.lastTurnEvidence)
      && Number(own.terminalEvidenceSequence) > 0
    // The public lastTurn fields may still describe the removed member. Only
    // the exact private main terminal or untouched connector baseline survives.
    const terminalStatus = exactTerminal ? own.lastTurnStatus
      : ['completed', 'interrupted', 'failed', 'inProgress'].includes(known.connectorLastTurnStatus)
        ? known.connectorLastTurnStatus : ''
    return { ...activity, lastTurnStatus: terminalStatus,
      lastTurnEvidence: exactTerminal ? own.lastTurnEvidence : terminalStatus ? 'inventory' : '',
      lastTurnStartedAt: timestampMs(exactTerminal ? own.turnStartedAt : known.connectorLastTurnStartedAt),
      lastTurnCompletedAt: terminalStatus === 'completed'
        ? timestampMs(exactTerminal ? own.terminalAt : known.connectorLastTurnCompletedAt) : 0,
      terminalEvidenceSequence: exactTerminal ? Number(own.terminalEvidenceSequence) : 0,
      idleConfirmed: Boolean(exactTerminal) && own.idleConfirmed === true
    }
  }

  function codexDesktopAggregateUnread(bridge, known, parentThreadId, ownShadow, childEntries, persistedUnreadIds) {
    const observations = [
      unreadObservation(bridge, known, parentThreadId, ownShadow, persistedUnreadIds),
      ...childEntries.map(([threadId, shadow]) => {
        return unreadObservation(bridge, known, threadId, shadow, persistedUnreadIds)
      })
    ]
    const positive = observations.filter((observation) => observation.hasUnreadTurn)
    const authorityPool = positive.length ? positive : observations
    const unreadAuthority = authorityPool.some((observation) => observation.unreadAuthority === 'desktop-live')
      ? 'desktop-live'
      : authorityPool.some((observation) => observation.unreadAuthority === 'desktop-persisted')
        ? 'desktop-persisted'
        : 'unavailable'
    return {
      hasUnreadTurn: positive.length > 0,
      unreadAuthority
    }
  }

  return {
    revision: CODEX_DESKTOP_ACTIVITY_AGGREGATION_REVISION,
    codexAppServerActiveDominates,
    codexDesktopAsyncQuestionOverridesRunning,
    codexDesktopRepeatedStartPreservesQuestion,
    codexResolveParentActivity,
    codexParentActivityAfterMemberRemoval,
    codexDesktopAggregateUnread
  }
}

module.exports = {
  CODEX_DESKTOP_ACTIVITY_AGGREGATION_REVISION,
  createCodexDesktopActivityAggregation
}
