// Generated from contracts/companion-v7.schema.json. Do not edit by hand.
'use strict'

const COMPANION_V7_REVISIONS = Object.freeze({
  "taskState": "task-state-v12",
  "draft": "companion-task-evidence-draft-v7",
  "providerEvidenceBatch": "companion-provider-evidence-batch-v3",
  "kernel": "companion-task-kernel-v7",
  "snapshot": "companion-task-snapshot-v7",
  "interaction": "companion-interaction-evidence-v1",
  "interactionStore": "companion-interaction-tombstones-v1",
  "planArtifact": "companion-plan-artifact-v1",
  "rolloutEvidence": "codex-rollout-evidence-v2",
  "desktopRequestProjection": "codex-desktop-request-projection-v2",
  "desktopShadow": "codex-desktop-shadow-v2",
  "childEnvelope": "child-envelope-v7"
})
const COMPANION_EVIDENCE_CHANNELS_V7 = Object.freeze(["membership","activity","interaction","unread","planArtifact","metadata","topology"])
const COMPANION_ACTIVITY_KINDS_V7 = Object.freeze(["turn-running","turn-completed","turn-interrupted","turn-failed","unknown"])
const COMPANION_ACTIVITY_AUTHORITIES_V7 = Object.freeze(["goal-verifying","goal","live-turn","terminal","inventory","unknown"])
const COMPANION_INTERACTION_KINDS_V1 = Object.freeze(["user-input","approval","plan-choice","plan-implementation"])
const COMPANION_INTERACTION_STATES_V1 = Object.freeze(["opened","resolved","cancelled","execution-started"])
const COMPANION_INTERACTION_AUTHORITIES_V1 = Object.freeze(["provider-live","provider-snapshot","host-command","rollout"])
const COMPANION_PLAN_ARTIFACT_STATES_V1 = Object.freeze(["unknown","available","executing","consumed","cancelled","removed"])
const COMPANION_PLAN_ARTIFACT_REASONS_V1 = Object.freeze(["","cancel","execution-start","archive","removal"])
const CHILD_SURFACES_V7 = Object.freeze(["main","float","action","quick-favorites"])
const CHILD_ACK_STAGES_V7 = Object.freeze(["accepted","dispatched","native-confirmed","read-confirmed","applied","rejected"])
const PROVIDERS = new Set(['codex', 'claude', 'cursor'])

function finiteSequence(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function validRef(value, maximum = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\r\n]/.test(value)
}

function normalizeCompanionActivityCandidateV7(value) {
  if (!value || typeof value !== 'object'
    || !COMPANION_ACTIVITY_KINDS_V7.includes(value.kind)
    || value.authority !== undefined && !COMPANION_ACTIVITY_AUTHORITIES_V7.includes(value.authority)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0
    || value.causalKey !== undefined && value.causalKey !== '' && !validRef(value.causalKey, 160)) return null
  return {
    kind: value.kind,
    authority: COMPANION_ACTIVITY_AUTHORITIES_V7.includes(value.authority) ? value.authority : 'unknown',
    causalKey: typeof value.causalKey === 'string' ? value.causalKey : '',
    sequence: value.sequence,
    exact: value.exact === true,
    observedAt: finiteSequence(value.observedAt),
    statusEnteredAt: finiteSequence(value.statusEnteredAt),
    turnStartedAt: finiteSequence(value.turnStartedAt),
    terminalAt: finiteSequence(value.terminalAt)
  }
}

function validateCompanionEvidenceNodeV3(value, expectedProvider = '') {
  if (!value || typeof value !== 'object'
    || !PROVIDERS.has(value.provider)
    || expectedProvider && value.provider !== expectedProvider
    || !validRef(value.key)
    || !validRef(value.family)
    || value.role !== 'root' && value.role !== 'child'
    || value.membership !== 'present'
    || !value.activity || typeof value.activity !== 'object'
    || !normalizeCompanionActivityCandidateV7(value.activity)
    || value.activity.candidates !== undefined && (!Array.isArray(value.activity.candidates)
      || value.activity.candidates.length === 0
      || !value.activity.candidates.every((candidate) => normalizeCompanionActivityCandidateV7(candidate)))
    || !value.unread || typeof value.unread !== 'object'
    || typeof value.unread.known !== 'boolean'
    || typeof value.unread.value !== 'boolean'
    || !Number.isSafeInteger(value.unread.sequence) || value.unread.sequence < 0
    || !normalizeCompanionPlanArtifactEvidenceV1(value.planArtifact)
    || !value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata)
    || !Array.isArray(value.capabilities)
    || typeof value.standaloneEligible !== 'boolean'
    || typeof value.error !== 'boolean') return false
  return value.capabilities.every((name) => typeof name === 'string' && validRef(name, 80))
}

function normalizeChildEnvelopeV7(value, expected = {}) {
  if (!value || typeof value !== 'object'
    || value.revision !== COMPANION_V7_REVISIONS.childEnvelope
    || !validRef(value.runtimeIdentity, 160)
    || !CHILD_SURFACES_V7.includes(value.surfaceId)
    || !validRef(value.channel, 160)
    || !Number.isSafeInteger(value.payloadRevision) || value.payloadRevision < 0
    || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
    || expected.surfaceId && value.surfaceId !== expected.surfaceId
    || expected.channel && value.channel !== expected.channel
    || value.requestId !== undefined && !validRef(value.requestId, 160)
    || value.interactionId !== undefined && !validRef(value.interactionId, 160)
    || value.ack !== undefined && !CHILD_ACK_STAGES_V7.includes(value.ack)
    || value.heartbeat !== undefined && (!Number.isSafeInteger(value.heartbeat) || value.heartbeat < 0)
    || value.logCursor !== undefined && (!Number.isSafeInteger(value.logCursor) || value.logCursor < 0)) return null
  return {
    revision: COMPANION_V7_REVISIONS.childEnvelope,
    runtimeIdentity: value.runtimeIdentity,
    surfaceId: value.surfaceId,
    channel: value.channel,
    payloadRevision: value.payloadRevision,
    ...(value.requestId ? { requestId: value.requestId } : {}),
    ...(value.interactionId ? { interactionId: value.interactionId } : {}),
    ...(value.ack ? { ack: value.ack } : {}),
    ...(Number.isSafeInteger(value.heartbeat) ? { heartbeat: value.heartbeat } : {}),
    ...(Number.isSafeInteger(value.logCursor) ? { logCursor: value.logCursor } : {}),
    payload: { ...value.payload }
  }
}

function createChildEnvelopeV7(input) {
  return normalizeChildEnvelopeV7({
    revision: COMPANION_V7_REVISIONS.childEnvelope,
    runtimeIdentity: input?.runtimeIdentity,
    surfaceId: input?.surfaceId,
    channel: input?.channel,
    payloadRevision: Number.isSafeInteger(input?.payloadRevision) ? input.payloadRevision : 0,
    requestId: input?.requestId,
    interactionId: input?.interactionId,
    ack: input?.ack,
    heartbeat: input?.heartbeat,
    logCursor: input?.logCursor,
    payload: input?.payload
  })
}

function normalizeCompanionInteractionEvidenceV1(value, expectedProvider = '') {
  if (!value || typeof value !== 'object' || value.revision !== COMPANION_V7_REVISIONS.interaction) return null
  const provider = PROVIDERS.has(value.provider) ? value.provider : ''
  if (!provider || expectedProvider && provider !== expectedProvider
    || !validRef(value.taskKey)
    || !validRef(value.branchRef, 128)
    || !/^[a-f0-9]{16,64}$/i.test(value.interactionRef || '')
    || !COMPANION_INTERACTION_KINDS_V1.includes(value.kind)
    || !COMPANION_INTERACTION_STATES_V1.includes(value.state)
    || !COMPANION_INTERACTION_AUTHORITIES_V1.includes(value.authority)
    || !Number.isSafeInteger(value.sequence) || value.sequence <= 0
    || !Number.isSafeInteger(value.requestSetRevision) || value.requestSetRevision <= 0) return null
  return {
    revision: COMPANION_V7_REVISIONS.interaction,
    provider,
    taskKey: value.taskKey,
    branchRef: value.branchRef,
    interactionRef: value.interactionRef.toLowerCase(),
    kind: value.kind,
    state: value.state,
    sequence: value.sequence,
    turnEpoch: finiteSequence(value.turnEpoch),
    requestSetRevision: finiteSequence(value.requestSetRevision),
    authority: value.authority,
    exact: value.exact === true
  }
}

function normalizeCompanionInteractionSetEvidenceV1(value, expectedProvider = '') {
  if (!value || typeof value !== 'object' || value.revision !== COMPANION_V7_REVISIONS.interaction) return null
  const provider = PROVIDERS.has(value.provider) ? value.provider : ''
  if (!provider || expectedProvider && provider !== expectedProvider
    || !validRef(value.taskKey)
    || !Number.isSafeInteger(value.requestSetRevision) || value.requestSetRevision <= 0
    || value.complete !== true) return null
  return {
    revision: COMPANION_V7_REVISIONS.interaction,
    provider,
    taskKey: value.taskKey,
    requestSetRevision: value.requestSetRevision,
    complete: true
  }
}

function normalizeCompanionPlanArtifactEvidenceV1(value) {
  if (!value || typeof value !== 'object'
    || value.revision !== COMPANION_V7_REVISIONS.planArtifact
    || !COMPANION_PLAN_ARTIFACT_STATES_V1.includes(value.state)
    || !COMPANION_PLAN_ARTIFACT_REASONS_V1.includes(value.reason)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return null
  return {
    revision: COMPANION_V7_REVISIONS.planArtifact,
    state: value.state,
    sequence: value.sequence,
    actionable: value.actionable === true,
    reason: value.reason
  }
}

function validateCompanionEvidenceBatchV3(value, expectedProvider = '') {
  if (!value || typeof value !== 'object'
    || value.revision !== COMPANION_V7_REVISIONS.providerEvidenceBatch
    || !PROVIDERS.has(value.provider)
    || expectedProvider && value.provider !== expectedProvider
    || !value.channels || typeof value.channels !== 'object'
    || !Array.isArray(value.nodes)
    || !Array.isArray(value.interactions)
    || !Array.isArray(value.interactionSets)
    || !Array.isArray(value.relations)) return false
  return COMPANION_EVIDENCE_CHANNELS_V7.every((channel) => {
    const lane = value.channels[channel]
    return lane && (lane.mode === 'snapshot' || lane.mode === 'delta')
      && typeof lane.complete === 'boolean'
      && Number.isSafeInteger(lane.generation) && lane.generation >= 0
      && Array.isArray(lane.removedKeys)
  })
    && value.nodes.every((node) => validateCompanionEvidenceNodeV3(node, value.provider))
    && value.interactionSets.every((set) => normalizeCompanionInteractionSetEvidenceV1(set, value.provider))
    && value.interactions.every((interaction) => normalizeCompanionInteractionEvidenceV1(interaction, value.provider))
}

module.exports = {
  COMPANION_V7_REVISIONS,
  COMPANION_EVIDENCE_CHANNELS_V7,
  COMPANION_ACTIVITY_KINDS_V7,
  COMPANION_ACTIVITY_AUTHORITIES_V7,
  COMPANION_INTERACTION_KINDS_V1,
  COMPANION_INTERACTION_STATES_V1,
  COMPANION_INTERACTION_AUTHORITIES_V1,
  COMPANION_PLAN_ARTIFACT_STATES_V1,
  COMPANION_PLAN_ARTIFACT_REASONS_V1,
  CHILD_SURFACES_V7,
  CHILD_ACK_STAGES_V7,
  normalizeChildEnvelopeV7,
  createChildEnvelopeV7,
  normalizeCompanionInteractionEvidenceV1,
  normalizeCompanionInteractionSetEvidenceV1,
  normalizeCompanionPlanArtifactEvidenceV1,
  normalizeCompanionActivityCandidateV7,
  validateCompanionEvidenceNodeV3,
  validateCompanionEvidenceBatchV3
}
