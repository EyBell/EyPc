'use strict'

/**
 * Three independent aggregations that answer "what does this parent thread's
 * status look like given its own evidence and its Side Chats' evidence."
 * They never call each other and share no state -- grouped in one module
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

  function codexAppServerActiveDominates(known, shadows) {
    if (known?.appServerLiveActive !== true) return false
    const appServerSequence = Number(known.appServerLiveSequence) || 0
    const desktopSequence = Math.max(0, ...(Array.isArray(shadows) ? shadows : [])
      .filter((shadow) => shadow?.activityEvidence === 'activity-event')
      .map((shadow) => Number(shadow.activityEventSequence) || 0))
    return appServerSequence > 0 && appServerSequence >= desktopSequence
  }

  function codexResolveParentActivity(own, childActivities, options = {}) {
    const activities = [own, ...childActivities].filter(Boolean)
    const activeFlags = [...new Set(activities.flatMap((activity) => activity.activeFlags || []))]
    const hasInput = activeFlags.includes('waitingOnUserInput')
    const hasApproval = activeFlags.includes('waitingOnApproval')
    const hasActive = activities.some((activity) => activity.status === 'active')
    const hasSystemError = activities.some((activity) => activity.status === 'systemError')
    const appServerActive = options.appServerActive === true && !hasInput && !hasApproval
    const status = hasInput || hasApproval || hasActive || appServerActive
      ? 'active'
      : hasSystemError ? 'systemError' : own.status
    const waitingActivities = activities.filter((activity) => (activity.activeFlags || [])
      .some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))
    const planImplementationOnly = status === 'active'
      && waitingActivities.length > 0
      && waitingActivities.every((activity) => activity.planImplementationOnly === true)
    const desktopActiveSince = status === 'active'
      ? Math.max(0, ...activities
        .filter((activity) => activity.status === 'active')
        .map((activity) => timestampMs(activity.desktopActiveSince)))
      : 0
    const waitingSince = status === 'active' && (hasInput || hasApproval)
      ? Math.max(0, ...waitingActivities.map((activity) => timestampMs(activity.waitingSince)))
        || timestampMs(options.connectorWaitingSince)
      : 0
    return {
      status,
      activeFlags: status === 'active'
        ? (appServerActive ? [...(options.connectorActiveFlags || [])] : activeFlags)
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
    codexResolveParentActivity,
    codexDesktopAggregateUnread
  }
}

module.exports = {
  CODEX_DESKTOP_ACTIVITY_AGGREGATION_REVISION,
  createCodexDesktopActivityAggregation
}
