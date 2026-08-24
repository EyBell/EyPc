'use strict'

const COMPANION_OPEN_HANDOFF_REVISION = 'companion-open-handoff-v1'
const HANDOFF_ID_PATTERN = /^coh_[A-Za-z0-9_-]{12,80}$/
const HANDOFF_STAGES = new Set(['requested', 'dispatched', 'native-confirmed', 'applied', 'failed'])
const SOURCE_RELEASE_STATES = new Set(['confirmed', 'unknown', 'not-required'])
const CONTROL_OWNERS = new Set(['source', 'target-native', 'unknown'])

function normalizeCompanionOpenHandoff(value, requestedOutcome) {
  const source = value && typeof value === 'object' ? value : null
  if (!source
    || source.revision !== COMPANION_OPEN_HANDOFF_REVISION
    || typeof source.handoffId !== 'string'
    || !HANDOFF_ID_PATTERN.test(source.handoffId)
    || !HANDOFF_STAGES.has(source.stage)
    || !SOURCE_RELEASE_STATES.has(source.sourceRelease)
    || !CONTROL_OWNERS.has(source.controlOwner)) return null

  const nativeVisible = source.nativeVisible === true
  const confirmedStage = source.stage === 'native-confirmed' || source.stage === 'applied'
  if (requestedOutcome === 'opened' && (!confirmedStage || !nativeVisible || source.controlOwner !== 'target-native')) return null
  if (requestedOutcome === 'dispatched' && source.stage !== 'requested' && source.stage !== 'dispatched') return null
  if ((requestedOutcome === 'failed' || requestedOutcome === 'unavailable') && source.stage !== 'failed') return null

  return {
    revision: COMPANION_OPEN_HANDOFF_REVISION,
    handoffId: source.handoffId,
    stage: source.stage,
    sourceRelease: source.sourceRelease,
    nativeVisible,
    controlOwner: source.controlOwner,
    confirmsRead: source.confirmsRead === true && confirmedStage && nativeVisible && source.controlOwner === 'target-native'
  }
}

function normalizeCompanionOpenReceipt(value) {
  const source = value && typeof value === 'object' ? value : {}
  const requestedOutcome = ['opened', 'dispatched', 'unavailable', 'failed'].includes(source.outcome)
    ? source.outcome
    : 'failed'
  const handoff = normalizeCompanionOpenHandoff(source.handoff, requestedOutcome)
  const downgraded = requestedOutcome === 'opened' && !handoff
  return {
    outcome: downgraded ? 'dispatched' : requestedOutcome,
    confirmsRead: !downgraded && requestedOutcome === 'opened' && handoff?.confirmsRead === true,
    handoff,
    downgraded
  }
}

module.exports = {
  COMPANION_OPEN_HANDOFF_REVISION,
  normalizeCompanionOpenHandoff,
  normalizeCompanionOpenReceipt
}
