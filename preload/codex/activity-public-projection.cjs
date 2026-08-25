'use strict'

/**
 * Projects an internal activity record into the shape the renderer is
 * allowed to see: every enum field is allowlisted against its known values
 * (an unrecognized value degrades to `undefined`/`'unavailable'`, never
 * passed through), every optional field is included only when it validates,
 * and the full membership/status payload is suppressed entirely when the
 * caller only wants `readStateOnly`.
 *
 * Pure computation over its `value` argument -- no module state. `record`
 * and `timestampMs` are injected because `codexRecord`/`codexTimestampMs`
 * are shared by dozens of call sites elsewhere in the entry.
 */

const CODEX_ACTIVITY_PUBLIC_PROJECTION_REVISION = 'codex-activity-public-projection-v1'

function createCodexActivityPublicProjection(dependencies = {}) {
  const record = dependencies.record
  const timestampMs = dependencies.timestampMs
  if (typeof record !== 'function' || typeof timestampMs !== 'function') {
    throw new TypeError('codex activity public projection requires record and timestampMs')
  }

  function codexActivityPublicEntry(value) {
    const source = record(value)
    const minimalMembership = source.minimalMembership === true
    const readStateOnly = source.readStateOnly === true
    const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(source.status) ? source.status : undefined
    const activeFlags = status === 'active' && Array.isArray(source.activeFlags)
      ? [...new Set(source.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
      : []
    const statusAuthority = ['desktop-live', 'app-server-live', 'persisted-decision', 'connector', 'unavailable'].includes(source.statusAuthority)
      ? source.statusAuthority
      : 'unavailable'
    const activityEvidence = ['connector', 'initial-snapshot', 'activity-event'].includes(source.activityEvidence)
      ? source.activityEvidence
      : undefined
    const activityRevision = Number.isInteger(source.activityRevision) && source.activityRevision >= 0
      ? source.activityRevision
      : undefined
    const unreadAuthority = ['desktop-live', 'desktop-persisted', 'unavailable'].includes(source.unreadAuthority)
      ? source.unreadAuthority
      : 'unavailable'
    const lastTurnStatus = ['completed', 'interrupted', 'failed', 'inProgress'].includes(source.lastTurnStatus)
      ? source.lastTurnStatus
      : undefined
    const lastTurnStartedAt = timestampMs(source.lastTurnStartedAt)
    const lastTurnCompletedAt = lastTurnStatus === 'completed' ? timestampMs(source.lastTurnCompletedAt) : 0
    const desktopActiveSince = status === 'active' && statusAuthority === 'desktop-live'
      ? timestampMs(source.desktopActiveSince)
      : 0
    const waitingSince = status === 'active'
      && activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
      ? timestampMs(source.waitingSince)
      : 0
    const lastTurnEvidence = ['inventory', 'turn-started', 'turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(source.lastTurnEvidence)
      ? source.lastTurnEvidence
      : undefined
    const activeEvidenceSequence = Number.isInteger(source.activeEvidenceSequence) && source.activeEvidenceSequence > 0
      ? source.activeEvidenceSequence
      : undefined
    const terminalEvidenceSequence = Number.isInteger(source.terminalEvidenceSequence) && source.terminalEvidenceSequence > 0
      ? source.terminalEvidenceSequence
      : undefined
    const planLifecycleState = source.planLifecycleState === 'ready' || source.planLifecycleState === 'cleared'
      ? source.planLifecycleState
      : source.planReady === true || source.planImplementationOnly === true ? 'ready' : 'unknown'
    const planClearReason = planLifecycleState === 'cleared'
      && ['cancel', 'execution-start', 'archive', 'removal'].includes(source.planClearReason)
      ? source.planClearReason
      : ''
    return {
      key: typeof source.key === 'string' ? source.key : '',
      ...(minimalMembership && typeof source.actionAlias === 'string' ? { actionAlias: source.actionAlias } : {}),
      ...(minimalMembership && typeof source.displayName === 'string' ? { displayName: source.displayName } : {}),
      ...(minimalMembership && timestampMs(source.updatedAt) ? { updatedAt: timestampMs(source.updatedAt) } : {}),
      ...(minimalMembership && typeof source.projectKey === 'string' ? { projectKey: source.projectKey } : {}),
      ...(minimalMembership && typeof source.projectName === 'string' ? { projectName: source.projectName } : {}),
      ...(minimalMembership && (source.projectKind === 'project' || source.projectKind === 'chats') ? { projectKind: source.projectKind } : {}),
      ...(readStateOnly
        ? { readStateOnly: true }
        : {
            ...(status ? { status } : {}),
            activeFlags,
            planImplementationOnly: source.planImplementationOnly === true,
            planReady: source.planReady === true || source.planImplementationOnly === true,
            planLifecycleState,
            ...(planClearReason ? { planClearReason } : {}),
            ...(Number.isFinite(source.planLifecycleRevision) && source.planLifecycleRevision > 0
              ? { planLifecycleRevision: Math.trunc(source.planLifecycleRevision) }
              : {}),
            ...(source.turnMode === 'plan' || source.turnMode === 'default' ? { turnMode: source.turnMode } : {}),
            ...(source.idleConfirmed === true ? { idleConfirmed: true } : {}),
            statusAuthority,
            ...(activityEvidence ? { activityEvidence } : {}),
            ...(activityRevision !== undefined ? { activityRevision } : {}),
            ...(waitingSince ? { waitingSince } : {}),
            ...(desktopActiveSince ? { desktopActiveSince } : {}),
            ...(lastTurnStatus ? { lastTurnStatus } : {}),
            ...(lastTurnStartedAt ? { lastTurnStartedAt } : {}),
            ...(lastTurnCompletedAt ? { lastTurnCompletedAt } : {}),
            ...(lastTurnEvidence ? { lastTurnEvidence } : {}),
            ...(activeEvidenceSequence !== undefined ? { activeEvidenceSequence } : {}),
            ...(terminalEvidenceSequence !== undefined ? { terminalEvidenceSequence } : {})
          }),
      ...(typeof source.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: source.hasUnreadTurn } : {}),
      unreadAuthority
    }
  }

  return {
    revision: CODEX_ACTIVITY_PUBLIC_PROJECTION_REVISION,
    codexActivityPublicEntry
  }
}

module.exports = {
  CODEX_ACTIVITY_PUBLIC_PROJECTION_REVISION,
  createCodexActivityPublicProjection
}
