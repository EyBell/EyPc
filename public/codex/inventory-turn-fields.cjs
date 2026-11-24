'use strict'

const { alignCodexCompletedTurn, compareCodexTurnOrder } = require('../companion/branch-causality.cjs')

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
  function turnOrderShape(value) {
    const id = typeof value?.lastTurnId === 'string' ? value.lastTurnId
      : typeof value?.id === 'string' ? value.id : ''
    return {
      causalDomain: id ? 'codex-turn' : '',
      causalKey: id,
      turnPredecessorKey: value?.turnPredecessorId || value?.predecessorId,
      turnStartedAt: timestampMs(value?.lastTurnStartedAt || value?.startedAt)
    }
  }

  function compareInventoryTurns(previous, incoming) {
    return compareCodexTurnOrder(turnOrderShape(previous), turnOrderShape(incoming))
  }

  function codexOrderedTurnPair(previous, incoming, page) {
    const previousId = turnOrderShape(previous).causalKey
    const incomingId = turnOrderShape(incoming).causalKey
    const rows = record(page).data
    if (!previousId || !incomingId || previousId === incomingId || !Array.isArray(rows) || rows.length !== 2) return null
    const latest = sanitizeCodexTurnStatus(rows[0])
    const predecessor = sanitizeCodexTurnStatus(rows[1])
    if (latest?.id === previousId && predecessor?.id === incomingId) return { order: 'older' }
    if (latest?.id !== incomingId || predecessor?.id !== previousId) return null
    return { order: 'newer', turn: { ...latest, predecessorId: previousId } }
  }

  function codexExactEmptyTurnPage(value) {
    const page = record(value)
    return Array.isArray(page.data) && page.data.length === 0 && page.nextCursor == null && page.backwardsCursor == null
  }

  function codexAlignCompletedTurnStart(known, turn) {
    if (turn?.status !== 'completed' || (known?.lastTurnStatus || known?.status) !== 'inProgress') return turn
    const incoming = { ...turnOrderShape(turn), terminalAt: timestampMs(turn.completedAt) }
    const aligned = alignCodexCompletedTurn(turnOrderShape(known), incoming)
    if (aligned === incoming) return turn
    return {
      ...turn,
      startedAt: aligned.turnStartedAt,
      ...(aligned.terminalAt ? { completedAt: aligned.terminalAt } : {})
    }
  }

  function codexTerminalTurnTransition(known, value, predecessorId) {
    if (!['completed', 'interrupted', 'failed'].includes(value?.status) || !timestampMs(value.startedAt)) return null
    const candidate = predecessorId && value.id ? { ...value, predecessorId } : value
    const turn = codexAlignCompletedTurnStart(known, candidate)
    const order = compareInventoryTurns(known, turn)
    const previous = turnOrderShape(known)
    const incoming = turnOrderShape(turn)
    if (order === 'older' || order === 'unknown' && previous.causalKey && incoming.causalKey
      && previous.causalKey !== incoming.causalKey
      || order !== 'newer' && incoming.turnStartedAt < previous.turnStartedAt) return null
    return { turn, order }
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
      ...(projection.lastTurnId ? { lastTurnId: projection.lastTurnId } : {}),
      ...(projection.turnPredecessorId ? { turnPredecessorId: projection.turnPredecessorId } : {}),
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
      ...(previousActivity.lastTurnId ? { lastTurnId: previousActivity.lastTurnId } : {}),
      ...(previousActivity.turnPredecessorId ? { turnPredecessorId: previousActivity.turnPredecessorId } : {}),
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
    const order = compareInventoryTurns(previousActivity, projection)
    if (order === 'older') return previous
    if (order === 'unknown' && previous.lastTurnId && next.lastTurnId && previous.lastTurnId !== next.lastTurnId) return previous
    if (order !== 'newer' && ((previousDirectLive && !nextExactTerminal) || regressedRevision || regressedCompletedOutcome)) return previous

    if (order === 'same' && !next.turnPredecessorId && previous.turnPredecessorId) {
      next.turnPredecessorId = previous.turnPredecessorId
    }
    const sameOutcome = order !== 'newer' && previousStartedAt === next.lastTurnStartedAt
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

  function codexCompletedTurnUpdate(known, candidate, requireFresh = false) {
    if (candidate?.status !== 'completed') return null
    const transition = codexTerminalTurnTransition(known, candidate)
    if (!transition) return null
    const { turn, order } = transition
    const baselineStartedAt = timestampMs(known.lastTurnStartedAt)
    const fresh = order === 'newer' || turn.startedAt > baselineStartedAt
      || turn.startedAt === baselineStartedAt && known.lastTurnStatus !== 'completed'
      || turn.startedAt === baselineStartedAt && known.lastTurnStatus === 'completed'
        && turn.completedAt > timestampMs(known.lastTurnCompletedAt)
    if (requireFresh && !fresh) return null
    const fields = { lastTurnStatus: 'completed', lastTurnStartedAt: turn.startedAt }
    const remove = []
    if (turn.id) fields.lastTurnId = turn.id
    else if (turn.startedAt !== baselineStartedAt) remove.push('lastTurnId')
    if (turn.predecessorId) fields.turnPredecessorId = turn.predecessorId
    else if (order === 'newer') remove.push('turnPredecessorId')
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
    const interruptedAt = status === 'interrupted' && id && startedAt ? timestampMs(turn.completedAt) : 0
    return {
      status,
      ...(id ? { id } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(interruptedAt > 0 && interruptedAt >= startedAt ? { interruptedAt } : {})
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
    compareInventoryTurns,
    codexOrderedTurnPair,
    codexExactEmptyTurnPage,
    codexAlignCompletedTurnStart,
    codexTerminalTurnTransition,
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
