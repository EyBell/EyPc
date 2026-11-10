'use strict'

/**
 * Merges a freshly read inventory turn projection with the previously known
 * activity for the same thread, so a lower-fidelity inventory snapshot never
 * regresses evidence that a live source already established.
 *
 * The guards fire in a fixed order: a still-live directly-observed turn wins
 * unless the new projection is an exact terminal for a CodexHost extra
 * process (`snapshot-corroborated`, `targeted-after-exit`, `turn-completed`
 * on a row carrying a Harness id). That exception is scoped to those ids on
 * purpose — RAW-190 makes the Host CLI the exact terminal authority for
 * extra processes only, and letting an inventory-derived terminal outrank a
 * live turn on a native Codex thread would resurrect the rebuild-overwrites-
 * live-evidence bug. A projection whose `startedAt`
 * is older than what is already known is a regression and is discarded; a
 * same-instant flip away from `completed` is treated the same way (an
 * inventory re-read racing a Turn boundary, not a new outcome). Only past
 * those does the merge keep the new projection, carrying forward the
 * previous evidence tag and `completedAt` when the outcome did not actually
 * change.
 *
 * Pure computation over its two arguments — no host contact, no module
 * state. `timestampMs` is injected on the rollout-evidence precedent: it is
 * among the hottest helpers in the entry, so it stays there.
 */

const CODEX_INVENTORY_TURN_FIELDS_REVISION = 'codex-inventory-turn-fields-v1'

function createCodexInventoryTurnFields(dependencies = {}) {
  const timestampMs = dependencies.timestampMs
  const record = dependencies.record || ((value) => value && typeof value === 'object' ? value : {})
  if (typeof timestampMs !== 'function') {
    throw new TypeError('codex inventory turn fields requires timestampMs')
  }

  function codexMergedInventoryTurnFields(projection, previousActivity) {
    if (!projection?.lastTurnStatus) return {}
    const next = {
      lastTurnStatus: projection.lastTurnStatus,
      ...(timestampMs(projection.lastTurnStartedAt)
        ? { lastTurnStartedAt: timestampMs(projection.lastTurnStartedAt) } : {}),
      ...(projection.lastTurnStatus === 'completed' && timestampMs(projection.lastTurnCompletedAt)
        ? { lastTurnCompletedAt: timestampMs(projection.lastTurnCompletedAt) }
        : {}),
      lastTurnEvidence: projection.lastTurnEvidence || 'inventory'
    }
    const previousStartedAt = timestampMs(previousActivity?.lastTurnStartedAt)
    if (!previousActivity?.lastTurnStatus || !previousStartedAt) return next

    const previous = {
      lastTurnStatus: previousActivity.lastTurnStatus,
      lastTurnStartedAt: previousStartedAt,
      ...(previousActivity.lastTurnStatus === 'completed' && timestampMs(previousActivity.lastTurnCompletedAt)
        ? { lastTurnCompletedAt: timestampMs(previousActivity.lastTurnCompletedAt) }
        : {}),
      ...(previousActivity.lastTurnEvidence ? { lastTurnEvidence: previousActivity.lastTurnEvidence } : {})
    }
    const previousDirectLive = previousActivity.status === 'active'
      && (previousActivity.statusAuthority === 'desktop-live' || previousActivity.statusAuthority === 'app-server-live')
      && previousActivity.lastTurnStatus === 'inProgress'
      && (previousActivity.lastTurnEvidence === 'turn-started' || previousActivity.activityEvidence === 'activity-event')
    // Only a Host-managed extra process carries a Harness id; a native Codex
    // row never reaches the exception, whatever evidence tag it arrives with.
    const nextExactTerminal = typeof projection.codexhostHarnessId === 'string'
      && ['completed', 'interrupted', 'failed'].includes(next.lastTurnStatus)
      && ['snapshot-corroborated', 'targeted-after-exit', 'turn-completed'].includes(next.lastTurnEvidence)
    const nextRevisionAt = next.lastTurnStartedAt || next.lastTurnCompletedAt || 0
    const regressedRevision = !nextRevisionAt || previousStartedAt > nextRevisionAt
    const regressedCompletedOutcome = previousStartedAt === next.lastTurnStartedAt
      && previousActivity.lastTurnStatus === 'completed'
      && next.lastTurnStatus !== 'completed'
    if ((previousDirectLive && !nextExactTerminal) || regressedRevision || regressedCompletedOutcome) return previous

    const sameOutcome = previousStartedAt === next.lastTurnStartedAt
      && previousActivity.lastTurnStatus === next.lastTurnStatus
    if (sameOutcome && previousActivity.lastTurnEvidence && previousActivity.lastTurnEvidence !== 'inventory') {
      next.lastTurnEvidence = previousActivity.lastTurnEvidence
      if (next.lastTurnStatus === 'completed') {
        const completedAt = Math.max(
          timestampMs(next.lastTurnCompletedAt),
          timestampMs(previousActivity.lastTurnCompletedAt)
        )
        if (completedAt) next.lastTurnCompletedAt = completedAt
      }
    }
    return next
  }

  function codexCompletedTurnUpdate(known, turn, requireFresh = false) {
    if (turn?.status !== 'completed' || !timestampMs(turn.startedAt)) return null
    const baselineStartedAt = timestampMs(known.lastTurnStartedAt)
    const fresh = turn.startedAt > baselineStartedAt
      || turn.startedAt === baselineStartedAt && known.lastTurnStatus !== 'completed'
      || turn.startedAt === baselineStartedAt && known.lastTurnStatus === 'completed'
        && turn.completedAt > timestampMs(known.lastTurnCompletedAt)
    if (requireFresh && !fresh) return null
    const fields = { lastTurnStatus: 'completed', lastTurnStartedAt: turn.startedAt }
    const remove = []
    if (turn.id) fields.lastTurnId = turn.id
    else if (turn.startedAt !== baselineStartedAt) remove.push('lastTurnId')
    if (turn.completedAt) fields.lastTurnCompletedAt = turn.completedAt
    else remove.push('lastTurnCompletedAt')
    return { fields, remove, turn: { ...turn } }
  }

  function sanitizeCodexTurnStatus(value) {
    const turn = record(value)
    const status = ['completed', 'interrupted', 'failed', 'inProgress'].includes(turn.status) ? turn.status : ''
    if (!status) return null
    const id = typeof turn.id === 'string' && turn.id.length > 0 && turn.id.length <= 200 ? turn.id : ''
    const completedAt = status === 'completed' ? timestampMs(turn.completedAt) : 0
    const startedAt = timestampMs(turn.startedAt)
    return {
      status,
      ...(id ? { id } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {})
    }
  }

  function sanitizeCodexTurnStatusPage(value) {
    const source = record(value)
    const turns = Array.isArray(source.data) ? source.data : []
    return sanitizeCodexTurnStatus(turns[0])
  }

  function codexNativeConnectorLiveTurn(thread) {
    const row = record(thread)
    if (row.codexhostExternal === true || record(row.status).type !== 'active') return null
    const startedAt = timestampMs(row.recencyAt) || timestampMs(row.updatedAt)
    return startedAt ? { status: 'inProgress', startedAt } : null
  }

  return {
    revision: CODEX_INVENTORY_TURN_FIELDS_REVISION,
    codexMergedInventoryTurnFields,
    codexCompletedTurnUpdate,
    sanitizeCodexTurnStatus,
    sanitizeCodexTurnStatusPage,
    codexNativeConnectorLiveTurn
  }
}

module.exports = {
  CODEX_INVENTORY_TURN_FIELDS_REVISION,
  createCodexInventoryTurnFields
}
