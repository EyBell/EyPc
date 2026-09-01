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
  if (typeof timestampMs !== 'function') {
    throw new TypeError('codex inventory turn fields requires timestampMs')
  }

  function codexMergedInventoryTurnFields(projection, previousActivity) {
    if (!projection?.lastTurnStatus || !timestampMs(projection.lastTurnStartedAt)) return {}
    const next = {
      lastTurnStatus: projection.lastTurnStatus,
      lastTurnStartedAt: timestampMs(projection.lastTurnStartedAt),
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
    const regressedRevision = previousStartedAt > next.lastTurnStartedAt
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

  return {
    revision: CODEX_INVENTORY_TURN_FIELDS_REVISION,
    codexMergedInventoryTurnFields
  }
}

module.exports = {
  CODEX_INVENTORY_TURN_FIELDS_REVISION,
  createCodexInventoryTurnFields
}
