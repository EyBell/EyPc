'use strict'

/**
 * Whether a Desktop waiting flag (`waitingOnUserInput` / `waitingOnApproval`)
 * is still live evidence, or has already been cleared by a later observation.
 *
 * `waitingState` carries two independent clear-sequence watermarks (one per
 * flag) plus a set of individually-resolved request sequences. A flag or a
 * specific observed sequence is visible only if it postdates its watermark
 * and was not itself marked resolved.
 *
 * Pure computation over its arguments — no host contact, no module state.
 *
 * `Map` is injected on the node-runtime precedent: the source is identical,
 * but `waitingState.resolvedRequestSequences` is constructed inside the vm
 * sandbox under test, so an `instanceof Map` against this module's own
 * (real-Node-realm) `Map` never matches a sandboxed instance. Same class of
 * bug as `process`/`processMock` -- the code is unchanged, the realm is not.
 */

const CODEX_WAITING_EVIDENCE_REVISION = 'codex-waiting-evidence-v1'

function createCodexWaitingEvidence(dependencies = {}) {
  const MapCtor = dependencies.Map || Map

  function codexWaitingFlagClearSequence(waitingState, flag) {
    if (!waitingState) return 0
    return flag === 'waitingOnApproval'
      ? Number.isInteger(waitingState.approvalClearSequence) ? waitingState.approvalClearSequence : 0
      : flag === 'waitingOnUserInput'
        ? Number.isInteger(waitingState.inputClearSequence) ? waitingState.inputClearSequence : 0
        : 0
  }

  function codexWaitingEvidenceVisible(waitingState, flag, observedSequence) {
    const clearSequence = codexWaitingFlagClearSequence(waitingState, flag)
    if (!Number.isInteger(observedSequence)) return clearSequence === 0
    if (observedSequence <= clearSequence) return false
    return waitingState?.resolvedRequestSequences instanceof MapCtor
      ? !waitingState.resolvedRequestSequences.has(observedSequence)
      : true
  }

  return {
    revision: CODEX_WAITING_EVIDENCE_REVISION,
    codexWaitingFlagClearSequence,
    codexWaitingEvidenceVisible
  }
}

module.exports = {
  CODEX_WAITING_EVIDENCE_REVISION,
  createCodexWaitingEvidence
}
