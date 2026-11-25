'use strict'

/**
 * Provider-neutral causal core for a single evidence line.
 *
 * This module answers exactly two questions, and knows nothing about which
 * Provider asked, how many branches exist, or which extra lanes a Provider
 * carries:
 *
 *   1. May an incoming observation replace the retained phase?
 *   2. How do independent evidence lanes merge without erasing each other?
 *
 * It was extracted from the Codex branch store because both answers are
 * generic while that store's other job — fork topology aggregation and
 * cross-branch attention ordering — is Codex-specific. Keeping them fused made
 * the causal rules reachable by one Provider only, so every other Provider had
 * to re-derive them as scattered conditionals.
 *
 * An "evidence line" is any sequence of observations about one conversation:
 * a Codex branch, a Claude session, or anything a later Provider introduces.
 */

function finiteInteger(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback
}

function explicitTimestampPrecision(value) {
  const precision = Number(value)
  return precision === 1 || precision === 1000 ? precision : 0
}

// Absent precision stays a point, matching unlabeled millisecond history.
// Explicit 1000 is the half-open source second. Overlap is not an order.
function codexBoundedOrder(previousAt, previousPrecision, incomingAt, incomingPrecision) {
  const previousValue = finiteInteger(previousAt)
  const incomingValue = finiteInteger(incomingAt)
  if (previousValue <= 0 || incomingValue <= 0) return 'missing'
  if (previousValue === incomingValue) return 'equal'
  const previousWidth = explicitTimestampPrecision(previousPrecision)
  const incomingWidth = explicitTimestampPrecision(incomingPrecision)
  if (!previousWidth && !incomingWidth) return incomingValue > previousValue ? 'newer' : 'older'
  const left = previousWidth || 1
  const right = incomingWidth || 1
  if (incomingValue + right <= previousValue) return 'older'
  if (previousValue + left <= incomingValue) return 'newer'
  return 'overlap'
}

/** Providers without an attention concept rank every observation equally. */
function noAttentionRank() {
  return 0
}

function sameTurnEvidenceDecision(previous, incoming) {
  if (!previous || !incoming
    || previous.authority === 'goal' || previous.authority === 'goal-verifying'
    || incoming.authority === 'goal' || incoming.authority === 'goal-verifying') return null
  if (!(previous.liveCurrent === true || previous.exactTerminal === true)
    || !(incoming.liveCurrent === true || incoming.exactTerminal === true)) return null
  const previousDomain = typeof previous.causalDomain === 'string' ? previous.causalDomain : ''
  const incomingDomain = typeof incoming.causalDomain === 'string' ? incoming.causalDomain : ''
  if (!previousDomain && !incomingDomain) return null
  if (!previousDomain || !incomingDomain || previousDomain !== incomingDomain) {
    return { accepted: false, reason: 'domain-incomparable' }
  }
  if (typeof previous.causalKey !== 'string' || !previous.causalKey
    || typeof incoming.causalKey !== 'string' || !incoming.causalKey) {
    return { accepted: false, reason: 'identity-incomparable' }
  }
  if (previous.causalKey !== incoming.causalKey) {
    const order = compareCodexTurnOrder(previous, incoming)
    if (order === 'newer') return { accepted: true, reason: 'predecessor-turn' }
    if (order === 'older') return { accepted: false, reason: 'older-turn' }
    const previousStartedAt = finiteInteger(previous.turnStartedAt)
    const incomingStartedAt = finiteInteger(incoming.turnStartedAt)
    if (previousStartedAt > 0 && incomingStartedAt > 0 && previousStartedAt !== incomingStartedAt) {
      return { accepted: false, reason: 'time-unorderable' }
    }
    return { accepted: false, reason: 'identity-incomparable' }
  }
  if (previous.liveCurrent === true && incoming.exactTerminal === true && incoming.kind === 'turn-completed') {
    const aligned = alignCodexCompletedTurn(previous, incoming)
    if (aligned.turnStartedAt > 0 && aligned.turnStartedAt < previous.turnStartedAt) {
      return { accepted: false, reason: 'older-turn-start' }
    }
  }
  const previousSequence = Object.prototype.hasOwnProperty.call(previous, 'causalSequence') ? previous.causalSequence
    : previous.liveCurrent === true ? previous.activeEvidenceSequence
    : previous.exactTerminal === true ? previous.terminalEvidenceSequence : 0
  const incomingSequence = Object.prototype.hasOwnProperty.call(incoming, 'causalSequence') ? incoming.causalSequence
    : incoming.liveCurrent === true ? incoming.activeEvidenceSequence
    : incoming.exactTerminal === true ? incoming.terminalEvidenceSequence : 0
  if (!Number.isSafeInteger(previousSequence) || previousSequence <= 0
    || !Number.isSafeInteger(incomingSequence) || incomingSequence <= 0) {
    return { accepted: false, reason: 'sequence-incomparable' }
  }
  return {
    accepted: incomingSequence > previousSequence,
    reason: incomingSequence > previousSequence ? 'accepted' : 'same-turn-stale'
  }
}

function compareCodexTurnOrder(previous, incoming) {
  const previousDomain = typeof previous?.causalDomain === 'string' ? previous.causalDomain : ''
  const incomingDomain = typeof incoming?.causalDomain === 'string' ? incoming.causalDomain : ''
  if (!previousDomain || previousDomain !== incomingDomain) return 'unknown'
  const previousKey = typeof previous?.causalKey === 'string' ? previous.causalKey : ''
  const incomingKey = typeof incoming?.causalKey === 'string' ? incoming.causalKey : ''
  if (previousKey && previousKey === incomingKey) return 'same'
  const incomingPredecessor = typeof incoming?.turnPredecessorKey === 'string' ? incoming.turnPredecessorKey : ''
  const previousPredecessor = typeof previous?.turnPredecessorKey === 'string' ? previous.turnPredecessorKey : ''
  if (previousKey && incomingPredecessor === previousKey) return 'newer'
  if (incomingKey && previousPredecessor === incomingKey) return 'older'
  const started = codexBoundedOrder(
    previous?.turnStartedAt, previous?.turnStartedAtPrecisionMs,
    incoming?.turnStartedAt, incoming?.turnStartedAtPrecisionMs
  )
  return started === 'newer' || started === 'older' ? started : 'unknown'
}

function alignCodexCompletedTurn(previous, incoming) {
  if (compareCodexTurnOrder(previous, incoming) !== 'same') return incoming
  const retainedStart = finiteInteger(previous.turnStartedAt)
  const incomingStart = finiteInteger(incoming.turnStartedAt)
  const terminalAt = finiteInteger(incoming.terminalAt)
  if (!incomingStart || incomingStart >= retainedStart
    || terminalAt && terminalAt < retainedStart && terminalAt !== incomingStart) return incoming
  const incomingPrecision = explicitTimestampPrecision(incoming.turnStartedAtPrecisionMs)
  const retainedPrecision = explicitTimestampPrecision(previous.turnStartedAtPrecisionMs)
  // A millisecond that merely lands on a second boundary is not coarse.
  const sameSourceSecond = incomingPrecision === 1000
    ? retainedStart < incomingStart + incomingPrecision
    : !incomingPrecision && incomingStart === Math.floor(retainedStart / 1000) * 1000
  if (!sameSourceSecond) return incoming
  const next = {
    ...incoming,
    turnStartedAt: retainedStart,
    terminalAt: terminalAt === incomingStart ? retainedStart : terminalAt
  }
  if (incomingPrecision === 1000) {
    if (retainedPrecision) next.turnStartedAtPrecisionMs = retainedPrecision
    else delete next.turnStartedAtPrecisionMs
    if (terminalAt === incomingStart) {
      if (retainedPrecision) next.terminalAtPrecisionMs = retainedPrecision
      else delete next.terminalAtPrecisionMs
    }
  }
  return next
}

/**
 * Bidirectional phase admission. Ordering is decided by comparable Turn epoch
 * first, then real event sequence, then a Provider-supplied attention rank —
 * never by arrival order. Both directions are gated: a stale terminal cannot
 * close a newer live edge, and a late-arriving live observation cannot reopen
 * a newer terminal. A genuinely newer Turn always wins immediately, so nothing
 * here introduces a waiting window.
 */
function phaseEvidenceSupersedes(previous, incoming, attentionRank = noAttentionRank) {
  if (!previous) return true
  const sameTurnDecision = sameTurnEvidenceDecision(previous, incoming)
  if (sameTurnDecision) return sameTurnDecision.accepted
  const previousLive = previous.liveCurrent === true
  const incomingLive = incoming?.liveCurrent === true
  const previousTerminal = previous.exactTerminal === true
  const incomingTerminal = incoming?.exactTerminal === true
  const previousTurnStartedAt = finiteInteger(previous.turnStartedAt)
  const incomingTurnStartedAt = finiteInteger(incoming?.turnStartedAt)

  if (previousLive && incomingLive) {
    const started = codexBoundedOrder(
      previousTurnStartedAt, previous.turnStartedAtPrecisionMs,
      incomingTurnStartedAt, incoming?.turnStartedAtPrecisionMs
    )
    if (started === 'newer') return true
    if (started === 'older' || started === 'overlap') return false
    const previousSequence = finiteInteger(previous.activeEvidenceSequence)
    const incomingSequence = finiteInteger(incoming.activeEvidenceSequence)
    if (previousSequence > 0 && incomingSequence > 0 && previousSequence !== incomingSequence) {
      return incomingSequence > previousSequence
    }
    const previousAttention = attentionRank(previous)
    const incomingAttention = attentionRank(incoming)
    if (previousAttention !== incomingAttention) return incomingAttention > previousAttention
    return true
  }

  if (previousLive && incomingTerminal) {
    const terminalAt = finiteInteger(incoming.terminalAt)
    const previousSequence = finiteInteger(previous.activeEvidenceSequence)
    const incomingSequence = finiteInteger(incoming.terminalEvidenceSequence)
    const started = codexBoundedOrder(
      previousTurnStartedAt, previous.turnStartedAtPrecisionMs,
      incomingTurnStartedAt, incoming.turnStartedAtPrecisionMs
    )
    if (started === 'newer') return true
    if (started === 'older' || started === 'overlap') return false
    if (previousSequence > 0 && incomingSequence > 0 && previousSequence !== incomingSequence) {
      return incomingSequence > previousSequence
    }
    return previousTurnStartedAt > 0
      && incomingTurnStartedAt >= previousTurnStartedAt
      && terminalAt >= incomingTurnStartedAt
  }

  if (previousTerminal && incomingLive) {
    const started = codexBoundedOrder(
      previousTurnStartedAt, previous.turnStartedAtPrecisionMs,
      incomingTurnStartedAt, incoming.turnStartedAtPrecisionMs
    )
    if (started === 'newer') return true
    if (started === 'older' || started === 'overlap') return false
    const previousSequence = finiteInteger(previous.terminalEvidenceSequence)
    const incomingSequence = finiteInteger(incoming.activeEvidenceSequence)
    if (previousSequence > 0 && incomingSequence > 0 && previousSequence !== incomingSequence) {
      return incomingSequence > previousSequence
    }
    const previousTerminalAt = finiteInteger(previous.terminalAt)
    return codexBoundedOrder(
      previousTerminalAt, previous.terminalAtPrecisionMs,
      incomingTurnStartedAt, incoming.turnStartedAtPrecisionMs
    ) === 'newer'
  }

  if (previousTerminal && incomingTerminal) {
    const started = codexBoundedOrder(
      previousTurnStartedAt, previous.turnStartedAtPrecisionMs,
      incomingTurnStartedAt, incoming.turnStartedAtPrecisionMs
    )
    if (started === 'newer') return true
    if (started === 'older' || started === 'overlap') return false
    const previousTerminalAt = finiteInteger(previous.terminalAt)
    const incomingTerminalAt = finiteInteger(incoming.terminalAt)
    const ended = codexBoundedOrder(
      previousTerminalAt, previous.terminalAtPrecisionMs,
      incomingTerminalAt, incoming.terminalAtPrecisionMs
    )
    if (ended === 'newer') return true
    if (ended === 'older' || ended === 'overlap') return false
    const previousSequence = finiteInteger(previous.terminalEvidenceSequence)
    const incomingSequence = finiteInteger(incoming.terminalEvidenceSequence)
    return !previousSequence || !incomingSequence || incomingSequence >= previousSequence
  }

  if (incomingLive || incomingTerminal) return true
  if (previousLive || previousTerminal) return false
  return true
}

/**
 * Merges the phase and unread lanes independently. An observation that carries
 * no unread evidence must not zero a retained one, and an unread-only
 * observation must not rewrite phase — whole-object replacement would make
 * either an implicit denial. Providers with further lanes (Codex carries Goal)
 * merge them onto the returned object and then normalize it themselves.
 */
function mergeEvidenceLanes(previous, incoming, options = {}) {
  if (!previous) return incoming
  const attentionRank = typeof options.attentionRank === 'function' ? options.attentionRank : noAttentionRank
  const phaseSource = phaseEvidenceSupersedes(previous, incoming, attentionRank) ? incoming : previous
  const retained = {
    ...phaseSource,
    observedAt: Math.max(finiteInteger(previous.observedAt), finiteInteger(incoming.observedAt))
  }
  const unreadSource = incoming.unreadObserved
    ? incoming
    : previous.unreadObserved ? previous : null
  if (unreadSource) {
    retained.unreadObserved = unreadSource.unreadObserved
    retained.unreadKnown = unreadSource.unreadKnown
    retained.hasUnreadTurn = unreadSource.hasUnreadTurn
  } else {
    retained.unreadObserved = false
    retained.unreadKnown = false
    retained.hasUnreadTurn = false
  }
  return retained
}

module.exports = {
  finiteInteger,
  noAttentionRank,
  compareCodexTurnOrder,
  alignCodexCompletedTurn,
  sameTurnEvidenceDecision,
  phaseEvidenceSupersedes,
  mergeEvidenceLanes
}
