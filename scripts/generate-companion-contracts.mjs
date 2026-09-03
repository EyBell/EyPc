import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = path.join(root, 'contracts', 'companion-v7.schema.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))

function constants(properties) {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, value.const]))
}

function tuple(value) {
  return value.prefixItems.map((item) => item.const)
}

const revisions = constants(schema.properties.revisions.properties)
const evidenceChannels = tuple(schema.properties.evidenceChannels)
const activityKinds = tuple(schema.properties.activity.properties.kinds)
const activityAuthorities = tuple(schema.properties.activity.properties.authorities)
const interactionKinds = tuple(schema.properties.interaction.properties.kinds)
const interactionStates = tuple(schema.properties.interaction.properties.states)
const interactionAuthorities = tuple(schema.properties.interaction.properties.authorities)
const planArtifactStates = tuple(schema.properties.planArtifact.properties.states)
const planArtifactReasons = tuple(schema.properties.planArtifact.properties.reasons)
const childSurfaces = tuple(schema.properties.childEnvelope.properties.surfaces)
const childAckStages = tuple(schema.properties.childEnvelope.properties.ackStages)

const banner = '// Generated from contracts/companion-v7.schema.json. Do not edit by hand.\n'
const ts = `${banner}
export const COMPANION_V7_REVISIONS = ${JSON.stringify(revisions, null, 2)} as const
export const COMPANION_EVIDENCE_CHANNELS_V7 = ${JSON.stringify(evidenceChannels)} as const
export const COMPANION_ACTIVITY_KINDS_V7 = ${JSON.stringify(activityKinds)} as const
export const COMPANION_ACTIVITY_AUTHORITIES_V7 = ${JSON.stringify(activityAuthorities)} as const
export const COMPANION_INTERACTION_KINDS_V1 = ${JSON.stringify(interactionKinds)} as const
export const COMPANION_INTERACTION_STATES_V1 = ${JSON.stringify(interactionStates)} as const
export const COMPANION_INTERACTION_AUTHORITIES_V1 = ${JSON.stringify(interactionAuthorities)} as const
export const COMPANION_PLAN_ARTIFACT_STATES_V1 = ${JSON.stringify(planArtifactStates)} as const
export const COMPANION_PLAN_ARTIFACT_REASONS_V1 = ${JSON.stringify(planArtifactReasons)} as const
export const CHILD_SURFACES_V7 = ${JSON.stringify(childSurfaces)} as const
export const CHILD_ACK_STAGES_V7 = ${JSON.stringify(childAckStages)} as const

export type CompanionEvidenceChannelV7 = typeof COMPANION_EVIDENCE_CHANNELS_V7[number]
export type CompanionActivityKindV7 = typeof COMPANION_ACTIVITY_KINDS_V7[number]
export type CompanionActivityAuthorityV7 = typeof COMPANION_ACTIVITY_AUTHORITIES_V7[number]
export type CompanionInteractionKindV1 = typeof COMPANION_INTERACTION_KINDS_V1[number]
export type CompanionInteractionStateV1 = typeof COMPANION_INTERACTION_STATES_V1[number]
export type CompanionInteractionAuthorityV1 = typeof COMPANION_INTERACTION_AUTHORITIES_V1[number]
export type CompanionPlanArtifactStateV1 = typeof COMPANION_PLAN_ARTIFACT_STATES_V1[number]
export type CompanionPlanArtifactReasonV1 = typeof COMPANION_PLAN_ARTIFACT_REASONS_V1[number]
export type ChildSurfaceIdV7 = typeof CHILD_SURFACES_V7[number]
export type ChildAckStageV7 = typeof CHILD_ACK_STAGES_V7[number]

export interface ChildEnvelopeV7<TPayload = Record<string, unknown>> {
  revision: typeof COMPANION_V7_REVISIONS.childEnvelope
  runtimeIdentity: string
  surfaceId: ChildSurfaceIdV7
  channel: string
  payloadRevision: number
  requestId?: string
  interactionId?: string
  ack?: ChildAckStageV7
  heartbeat?: number
  logCursor?: number
  payload: TPayload
}

export interface CompanionInteractionEvidenceV1 {
  revision: typeof COMPANION_V7_REVISIONS.interaction
  provider: 'codex' | 'claude' | 'cursor'
  taskKey: string
  branchRef: string
  interactionRef: string
  kind: CompanionInteractionKindV1
  state: CompanionInteractionStateV1
  sequence: number
  turnEpoch: number
  requestSetRevision: number
  authority: CompanionInteractionAuthorityV1
  exact: boolean
}

export interface CompanionInteractionSetEvidenceV1 {
  revision: typeof COMPANION_V7_REVISIONS.interaction
  provider: 'codex' | 'claude' | 'cursor'
  taskKey: string
  requestSetRevision: number
  complete: boolean
}

export interface CompanionPlanArtifactEvidenceV1 {
  revision: typeof COMPANION_V7_REVISIONS.planArtifact
  state: CompanionPlanArtifactStateV1
  sequence: number
  actionable: boolean
  reason: CompanionPlanArtifactReasonV1
}
`

const cjs = `${banner}'use strict'\n
const COMPANION_V7_REVISIONS = Object.freeze(${JSON.stringify(revisions, null, 2)})
const COMPANION_EVIDENCE_CHANNELS_V7 = Object.freeze(${JSON.stringify(evidenceChannels)})
const COMPANION_ACTIVITY_KINDS_V7 = Object.freeze(${JSON.stringify(activityKinds)})
const COMPANION_ACTIVITY_AUTHORITIES_V7 = Object.freeze(${JSON.stringify(activityAuthorities)})
const COMPANION_INTERACTION_KINDS_V1 = Object.freeze(${JSON.stringify(interactionKinds)})
const COMPANION_INTERACTION_STATES_V1 = Object.freeze(${JSON.stringify(interactionStates)})
const COMPANION_INTERACTION_AUTHORITIES_V1 = Object.freeze(${JSON.stringify(interactionAuthorities)})
const COMPANION_PLAN_ARTIFACT_STATES_V1 = Object.freeze(${JSON.stringify(planArtifactStates)})
const COMPANION_PLAN_ARTIFACT_REASONS_V1 = Object.freeze(${JSON.stringify(planArtifactReasons)})
const CHILD_SURFACES_V7 = Object.freeze(${JSON.stringify(childSurfaces)})
const CHILD_ACK_STAGES_V7 = Object.freeze(${JSON.stringify(childAckStages)})
const PROVIDERS = new Set(['codex', 'claude', 'cursor'])

function finiteSequence(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function validRef(value, maximum = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\\r\\n]/.test(value)
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
`

// Claude quota window vocabulary: one JSON source, one CJS mirror for the
// preload normalizer and one TS mirror for the domain describer, so a new
// upstream alias or label is added exactly once.
const vocabularyPath = path.join(root, 'contracts', 'claude-quota-vocabulary.json')
const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))
const vocabularyBanner = '// Generated from contracts/claude-quota-vocabulary.json. Do not edit by hand.\n'
const vocabularyBody = `const CLAUDE_QUOTA_VOCABULARY_REVISION = ${JSON.stringify(vocabulary.revision)}
const CLAUDE_QUOTA_BASE_KEYS = ${JSON.stringify(vocabulary.baseKeys, null, 2)}
const CLAUDE_QUOTA_KEY_ALIASES = ${JSON.stringify(vocabulary.aliases, null, 2)}
const CLAUDE_QUOTA_UPSTREAM_TYPES = ${JSON.stringify(vocabulary.upstreamTypes, null, 2)}
const CLAUDE_QUOTA_WINDOW_MINUTES = ${JSON.stringify(vocabulary.windowMinutes, null, 2)}
const CLAUDE_QUOTA_WINDOW_LABELS = ${JSON.stringify(vocabulary.labels, null, 2)}
/** \`five_hour\`, \`seven_day\` or a scoped \`five_hour_<scope>\` / \`seven_day-<scope>\` key. */
const CLAUDE_QUOTA_KEY_PATTERN = /^(five_hour|seven_day)(?:[_-](.+))?$/
`
const vocabularyTs = `${vocabularyBanner}
${vocabularyBody.replace(/(^|\n)const /g, '$1export const ')}
export type ClaudeQuotaWindowFamily = keyof typeof CLAUDE_QUOTA_BASE_KEYS
`
const vocabularyCjs = `'use strict'
${vocabularyBanner}
${vocabularyBody}
module.exports = {
  CLAUDE_QUOTA_VOCABULARY_REVISION,
  CLAUDE_QUOTA_BASE_KEYS,
  CLAUDE_QUOTA_KEY_ALIASES,
  CLAUDE_QUOTA_UPSTREAM_TYPES,
  CLAUDE_QUOTA_WINDOW_MINUTES,
  CLAUDE_QUOTA_WINDOW_LABELS,
  CLAUDE_QUOTA_KEY_PATTERN
}
`

const outputs = [
  [path.join(root, 'src', 'domain', 'generated', 'companionContractsV7.ts'), ts],
  [path.join(root, 'preload', 'companion', 'contracts-v7.cjs'), cjs],
  [path.join(root, 'src', 'domain', 'generated', 'claudeQuotaVocabulary.ts'), vocabularyTs],
  [path.join(root, 'preload', 'claude', 'quota-vocabulary.cjs'), vocabularyCjs]
]

if (process.argv.includes('--check')) {
  const stale = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content)
  if (stale.length) {
    process.stderr.write(`Generated companion contracts are stale: ${stale.map(([file]) => path.relative(root, file)).join(', ')}\n`)
    process.exitCode = 1
  }
} else {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
}
