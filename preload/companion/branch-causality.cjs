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
    const previousStartedAt = finiteInteger(previous.turnStartedAt)
    const incomingStartedAt = finiteInteger(incoming.turnStartedAt)
    return previousStartedAt > 0 && incomingStartedAt > 0 && previousStartedAt !== incomingStartedAt
      ? null : { accepted: false, reason: 'identity-incomparable' }
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
    if (previousTurnStartedAt > 0 && incomingTurnStartedAt > 0
      && previousTurnStartedAt !== incomingTurnStartedAt) {
      return incomingTurnStartedAt > previousTurnStartedAt
    }
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
    if (previousTurnStartedAt > 0 && incomingTurnStartedAt > 0
      && previousTurnStartedAt !== incomingTurnStartedAt) {
      return incomingTurnStartedAt > previousTurnStartedAt
    }
    if (previousSequence > 0 && incomingSequence > 0 && previousSequence !== incomingSequence) {
      return incomingSequence > previousSequence
    }
    return previousTurnStartedAt > 0
      && incomingTurnStartedAt >= previousTurnStartedAt
      && terminalAt >= incomingTurnStartedAt
  }

  if (previousTerminal && incomingLive) {
    if (previousTurnStartedAt > 0 && incomingTurnStartedAt > 0
      && previousTurnStartedAt !== incomingTurnStartedAt) {
      return incomingTurnStartedAt > previousTurnStartedAt
    }
    const previousSequence = finiteInteger(previous.terminalEvidenceSequence)
    const incomingSequence = finiteInteger(incoming.activeEvidenceSequence)
    if (previousSequence > 0 && incomingSequence > 0 && previousSequence !== incomingSequence) {
      return incomingSequence > previousSequence
    }
    const previousTerminalAt = finiteInteger(previous.terminalAt)
    return incomingTurnStartedAt > 0 && previousTerminalAt > 0
      && incomingTurnStartedAt > previousTerminalAt
  }

  if (previousTerminal && incomingTerminal) {
    if (previousTurnStartedAt > 0 && incomingTurnStartedAt > 0
      && previousTurnStartedAt !== incomingTurnStartedAt) {
      return incomingTurnStartedAt > previousTurnStartedAt
    }
    const previousTerminalAt = finiteInteger(previous.terminalAt)
    const incomingTerminalAt = finiteInteger(incoming.terminalAt)
    if (previousTerminalAt > 0 && incomingTerminalAt > 0 && previousTerminalAt !== incomingTerminalAt) {
      return incomingTerminalAt > previousTerminalAt
    }
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
  sameTurnEvidenceDecision,
  phaseEvidenceSupersedes,
  mergeEvidenceLanes
}
