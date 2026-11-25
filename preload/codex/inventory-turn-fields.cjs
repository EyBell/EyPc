'use strict'

const { alignCodexCompletedTurn, compareCodexTurnOrder } = require('../companion/branch-causality.cjs')

function codexExplicitTimestampPrecision(value) {
  const precision = Number(value)
  return precision === 1 || precision === 1000 ? precision : 0
}

function codexEpochMilliseconds(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > Number.MAX_SAFE_INTEGER) return 0
  return Math.trunc(parsed)
}

function codexAuxiliaryTurnFields(source) {
  const fields = {}
  const startedPrecision = codexExplicitTimestampPrecision(source?.turnStartedAtPrecisionMs)
  const terminalPrecision = codexExplicitTimestampPrecision(source?.terminalAtPrecisionMs)
  const requestedAt = codexEpochMilliseconds(source?.statusRequestedAt)
  const receivedAt = codexEpochMilliseconds(source?.statusReceivedAt)
  if (startedPrecision) fields.turnStartedAtPrecisionMs = startedPrecision
  if (terminalPrecision) fields.terminalAtPrecisionMs = terminalPrecision
  if (requestedAt) fields.statusRequestedAt = requestedAt
  if (receivedAt) fields.statusReceivedAt = receivedAt
  return fields
}

function codexTurnReadIsCurrent(turn, liveObservedAt) {
  const requestedAt = codexEpochMilliseconds(turn?.statusRequestedAt)
  const receivedAt = codexEpochMilliseconds(turn?.statusReceivedAt)
  if (!requestedAt || !receivedAt || receivedAt < requestedAt) return false
  const live = codexEpochMilliseconds(liveObservedAt)
  if (!live) return true
  return requestedAt >= live
}

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
      turnStartedAt: normalizedStamp(value, value?.lastTurnStartedAt || value?.startedAt, 'turnStartedAtPrecisionMs'),
      ...codexAuxiliaryTurnFields(value)
    }
  }

  function alreadyMilliseconds(raw) {
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
  }

  function normalizedStamp(source, raw, precisionField) {
    if (codexExplicitTimestampPrecision(source?.[precisionField])) return alreadyMilliseconds(raw)
    const parsed = Number(timestampMs(raw))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }

  function sourcePrecision(raw) {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) return 0
    const converted = Number(timestampMs(raw))
    if (!Number.isFinite(converted) || converted <= 0) return 0
    if (converted === parsed) return 1
    if (parsed < 10_000_000_000 && converted === parsed * 1000) return 1000
    return 0
  }

  function selectedPrecision(field, turn, observation, derived) {
    for (const source of [observation, turn]) {
      if (source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, field)) {
        return codexExplicitTimestampPrecision(source[field])
      }
    }
    return codexExplicitTimestampPrecision(derived)
  }

  function compareInventoryTurns(previous, incoming) {
    return compareCodexTurnOrder(turnOrderShape(previous), turnOrderShape(incoming))
  }

  function codexOrderedTurnPair(previous, incoming, page, observation) {
    const previousId = turnOrderShape(previous).causalKey
    const incomingId = turnOrderShape(incoming).causalKey
    const rows = record(page).data
    if (!previousId || !incomingId || previousId === incomingId || !Array.isArray(rows) || rows.length !== 2) return null
    const latest = sanitizeCodexTurnStatus(rows[0], observation)
    const predecessor = sanitizeCodexTurnStatus(rows[1], observation)
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
    const incoming = { ...turnOrderShape(turn), terminalAt: normalizedStamp(turn, turn.completedAt, 'terminalAtPrecisionMs') }
    const aligned = alignCodexCompletedTurn(turnOrderShape(known), incoming)
    if (aligned === incoming) return turn
    const next = {
      ...turn,
      startedAt: aligned.turnStartedAt,
      ...(aligned.terminalAt ? { completedAt: aligned.terminalAt } : {})
    }
    if (codexExplicitTimestampPrecision(aligned.turnStartedAtPrecisionMs)) {
      next.turnStartedAtPrecisionMs = aligned.turnStartedAtPrecisionMs
    } else delete next.turnStartedAtPrecisionMs
    if (codexExplicitTimestampPrecision(aligned.terminalAtPrecisionMs)) {
      next.terminalAtPrecisionMs = aligned.terminalAtPrecisionMs
    } else delete next.terminalAtPrecisionMs
    return next
  }

  function codexTerminalTurnTransition(known, value, predecessorId) {
    if (!['completed', 'interrupted', 'failed'].includes(value?.status)
      || !normalizedStamp(value, value.startedAt, 'turnStartedAtPrecisionMs')) return null
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
      ...(normalizedStamp(projection, projection.lastTurnStartedAt, 'turnStartedAtPrecisionMs')
        ? { lastTurnStartedAt: normalizedStamp(projection, projection.lastTurnStartedAt, 'turnStartedAtPrecisionMs') } : {}),
      ...(projection.lastTurnStatus === 'completed' && normalizedStamp(projection, projection.lastTurnCompletedAt, 'terminalAtPrecisionMs')
        ? { lastTurnCompletedAt: normalizedStamp(projection, projection.lastTurnCompletedAt, 'terminalAtPrecisionMs') }
        : {}),
      ...(projection.lastTurnId ? { lastTurnId: projection.lastTurnId } : {}),
      ...(projection.turnPredecessorId ? { turnPredecessorId: projection.turnPredecessorId } : {}),
      lastTurnEvidence: projection.lastTurnEvidence || 'inventory',
      ...codexAuxiliaryTurnFields(projection)
    }
    const previousStartedAt = normalizedStamp(previousActivity, previousActivity?.lastTurnStartedAt, 'turnStartedAtPrecisionMs')
    if (!previousActivity?.lastTurnStatus || !previousStartedAt) return next

    const previous = {
      lastTurnStatus: previousActivity.lastTurnStatus,
      lastTurnStartedAt: previousStartedAt,
      ...(previousActivity.lastTurnStatus === 'completed' && normalizedStamp(previousActivity, previousActivity.lastTurnCompletedAt, 'terminalAtPrecisionMs')
        ? { lastTurnCompletedAt: normalizedStamp(previousActivity, previousActivity.lastTurnCompletedAt, 'terminalAtPrecisionMs') }
        : {}),
      ...(previousActivity.lastTurnId ? { lastTurnId: previousActivity.lastTurnId } : {}),
      ...(previousActivity.turnPredecessorId ? { turnPredecessorId: previousActivity.turnPredecessorId } : {}),
      ...(previousActivity.lastTurnEvidence ? { lastTurnEvidence: previousActivity.lastTurnEvidence } : {}),
      ...codexAuxiliaryTurnFields(previousActivity)
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
        const incomingCompletedAt = normalizedStamp(next, next.lastTurnCompletedAt, 'terminalAtPrecisionMs')
        const previousCompletedAt = normalizedStamp(previousActivity, previousActivity.lastTurnCompletedAt, 'terminalAtPrecisionMs')
        const completedAt = Math.max(incomingCompletedAt, previousCompletedAt)
        if (completedAt) {
          next.lastTurnCompletedAt = completedAt
          const incomingPrecision = codexExplicitTimestampPrecision(projection.terminalAtPrecisionMs)
          const previousPrecision = codexExplicitTimestampPrecision(previousActivity.terminalAtPrecisionMs)
          const chosen = completedAt === previousCompletedAt && completedAt !== incomingCompletedAt
            ? previousPrecision
            : completedAt === incomingCompletedAt && completedAt !== previousCompletedAt
              ? incomingPrecision
              : incomingPrecision && incomingPrecision === previousPrecision ? incomingPrecision : 0
          if (chosen) next.terminalAtPrecisionMs = chosen
          else delete next.terminalAtPrecisionMs
        }
      }
    }
    return next
  }

  function codexCompletedTurnUpdate(known, candidate, requireFresh = false) {
    if (candidate?.status !== 'completed') return null
    const transition = codexTerminalTurnTransition(known, candidate)
    if (!transition) return null
    const { turn, order } = transition
    const baselineStartedAt = normalizedStamp(known, known.lastTurnStartedAt, 'turnStartedAtPrecisionMs')
    const fresh = order === 'newer' || turn.startedAt > baselineStartedAt
      || turn.startedAt === baselineStartedAt && known.lastTurnStatus !== 'completed'
      || turn.startedAt === baselineStartedAt && known.lastTurnStatus === 'completed'
        && turn.completedAt > normalizedStamp(known, known.lastTurnCompletedAt, 'terminalAtPrecisionMs')
    if (requireFresh && !fresh) return null
    const fields = { lastTurnStatus: 'completed', lastTurnStartedAt: turn.startedAt }
    const remove = []
    if (turn.id) fields.lastTurnId = turn.id
    else if (turn.startedAt !== baselineStartedAt) remove.push('lastTurnId')
    if (turn.predecessorId) fields.turnPredecessorId = turn.predecessorId
    else if (order === 'newer') remove.push('turnPredecessorId')
    if (turn.completedAt) fields.lastTurnCompletedAt = turn.completedAt
    else remove.push('lastTurnCompletedAt')
    const startedPrecision = codexExplicitTimestampPrecision(turn.turnStartedAtPrecisionMs)
    if (startedPrecision) fields.turnStartedAtPrecisionMs = startedPrecision
    else remove.push('turnStartedAtPrecisionMs')
    const terminalPrecision = codexExplicitTimestampPrecision(turn.terminalAtPrecisionMs)
    if (turn.completedAt && terminalPrecision) fields.terminalAtPrecisionMs = terminalPrecision
    else remove.push('terminalAtPrecisionMs')
    const requestedAt = codexEpochMilliseconds(turn.statusRequestedAt)
    const receivedAt = codexEpochMilliseconds(turn.statusReceivedAt)
    if (requestedAt) fields.statusRequestedAt = requestedAt
    if (receivedAt) fields.statusReceivedAt = receivedAt
    return { fields, remove, turn: { ...turn } }
  }

  function sanitizeCodexTurnStatus(value, observation) {
    const turn = record(value)
    const status = ['completed', 'interrupted', 'failed', 'inProgress'].includes(turn.status) ? turn.status : ''
    if (!status) return null
    const id = typeof turn.id === 'string' && turn.id.length > 0 && turn.id.length <= 200 ? turn.id : ''
    const predecessorId = typeof turn.predecessorId === 'string' && turn.predecessorId
      ? turn.predecessorId
      : typeof turn.turnPredecessorId === 'string' && turn.turnPredecessorId ? turn.turnPredecessorId : ''
    const storedStartPrecision = codexExplicitTimestampPrecision(turn.turnStartedAtPrecisionMs)
    const storedTerminalPrecision = codexExplicitTimestampPrecision(turn.terminalAtPrecisionMs)
    const startedAt = storedStartPrecision ? alreadyMilliseconds(turn.startedAt) : timestampMs(turn.startedAt)
    const completedSource = storedTerminalPrecision ? alreadyMilliseconds(turn.completedAt) : timestampMs(turn.completedAt)
    const completedAt = status === 'completed' ? completedSource : 0
    let interruptedAt = 0
    if (status === 'interrupted' && id && startedAt) {
      if (Object.prototype.hasOwnProperty.call(turn, 'completedAt')) {
        interruptedAt = completedSource >= startedAt ? completedSource : 0
      } else {
        const retained = alreadyMilliseconds(turn.interruptedAt)
        interruptedAt = retained >= startedAt ? retained : 0
      }
    }
    const hasTerminal = Boolean(completedAt || interruptedAt)
    const startedPrecision = startedAt
      ? selectedPrecision('turnStartedAtPrecisionMs', turn, observation, sourcePrecision(turn.startedAt))
      : 0
    const terminalPrecision = hasTerminal
      ? selectedPrecision('terminalAtPrecisionMs', turn, observation, sourcePrecision(turn.completedAt))
      : 0
    const timed = observation && typeof observation === 'object'
    const requestedAt = codexEpochMilliseconds(timed ? observation.statusRequestedAt : turn.statusRequestedAt)
    const receivedAt = codexEpochMilliseconds(timed ? observation.statusReceivedAt : turn.statusReceivedAt)
    return {
      status,
      ...(id ? { id } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(interruptedAt > 0 && interruptedAt >= startedAt ? { interruptedAt } : {}),
      ...(predecessorId ? { predecessorId } : {}),
      ...(startedPrecision ? { turnStartedAtPrecisionMs: startedPrecision } : {}),
      ...(terminalPrecision ? { terminalAtPrecisionMs: terminalPrecision } : {}),
      ...(requestedAt ? { statusRequestedAt: requestedAt } : {}),
      ...(receivedAt ? { statusReceivedAt: receivedAt } : {})
    }
  }

  function sanitizeCodexTurnStatusPage(value, observation) {
    const source = record(value)
    const turns = Array.isArray(source.data) ? source.data : []
    return sanitizeCodexTurnStatus(turns[0], observation)
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
    codexNativeConnectorLiveTurn,
    codexTurnReadIsCurrent
  }
}

module.exports = {
  CODEX_INVENTORY_TURN_FIELDS_REVISION,
  createCodexInventoryTurnFields,
  codexTurnReadIsCurrent
}
