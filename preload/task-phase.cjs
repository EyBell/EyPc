'use strict'

/**
 * Single task-phase vocabulary for the companion runtime.
 *
 * A phase is a product term, not a string: which values exist, and which of
 * them mean "still going", "finished", "waiting on the user" or "quiet enough
 * to start something new". Each of those questions was previously answered by
 * an inline array literal at every call site — the vocabulary itself written
 * out three times, "live" twice more, "settled" twice — so adding a phase, or
 * moving one between groups, meant finding every copy. A missed copy is
 * invisible: the phase simply falls into someone's else-branch.
 *
 * The predicates read the vocabulary rather than restating it, so a value added
 * to `TASK_PHASES` cannot be silently unknown to one consumer and known to
 * another.
 *
 * Kept at the preload top level, alongside timing-policy.cjs, because both
 * module groups and the entry consume it; it belongs to no single group.
 */

/**
 * Every phase a companion task may hold. `unknown` is a real member, not an
 * error value: it is what an observation means before evidence arrives.
 */
const TASK_PHASES = Object.freeze(['running', 'waiting-input', 'waiting-approval', 'completed', 'stopped', 'unknown'])

/**
 * The phases a user may hand-set on a task whose phase is `unknown`.
 *
 * Derived from the vocabulary instead of restated, so a phase added to
 * `TASK_PHASES` becomes selectable without a second edit. `unknown` is the one
 * exclusion: the override exists to answer it, so offering it as a target would
 * only write back the very state being resolved.
 */
const MANUAL_TASK_PHASES = Object.freeze(TASK_PHASES.filter((phase) => phase !== 'unknown'))

function isKnownTaskPhase(phase) {
  return TASK_PHASES.includes(phase)
}

function isManualTaskPhase(phase) {
  return MANUAL_TASK_PHASES.includes(phase)
}

/** The task is still going — something may yet change without new input. */
function isLiveTaskPhase(phase) {
  return phase === 'running' || phase === 'waiting-input' || phase === 'waiting-approval'
}

/** The task is over. `unknown` is not terminal — absence of evidence is not evidence of an ending. */
function isTerminalTaskPhase(phase) {
  return phase === 'completed' || phase === 'stopped'
}

/** The task is blocked on the user. This is the set that earns attention ranking. */
function isAttentionTaskPhase(phase) {
  return phase === 'waiting-input' || phase === 'waiting-approval'
}

/** Worth keeping in the package across a refresh. */
function isRetainableTaskPhase(phase) {
  return isLiveTaskPhase(phase) || phase === 'stopped'
}

/**
 * The task is quiet enough that starting new work against it is coherent.
 *
 * Deliberately not `!isLiveTaskPhase`: `running` and `waiting-approval` are
 * both excluded, but so is `unknown` — an unobserved task is not a settled one.
 */
function isSettledTaskPhase(phase) {
  return phase === 'waiting-input' || phase === 'stopped' || phase === 'completed'
}

module.exports = {
  TASK_PHASES,
  MANUAL_TASK_PHASES,
  isKnownTaskPhase,
  isManualTaskPhase,
  isLiveTaskPhase,
  isTerminalTaskPhase,
  isAttentionTaskPhase,
  isRetainableTaskPhase,
  isSettledTaskPhase
}
