"use strict"
const { trace: freezeTrace } = require('../freeze-trace.cjs')
const { createShortcutReadReceipts, hasCompletedUnread, isShortcutSource } = require('./shortcut-read.cjs')

const { createCompanionNavigation } = require('./navigation.cjs')
const { createCompanionTaskActions } = require('./task-actions.cjs')
const {
  registry: providerRegistry,
  PROVIDERS,
  providerShape: registryProviderShape,
  providerSet: registryProviderSet,
  createCompanionHostRegistry
} = require('./provider-registry.cjs')
const {
  COMPANION_TASK_TOPOLOGY_REVISION,
  buildCompanionTaskTopology,
  normalizeRelation
} = require('./task-topology.cjs')
const { finiteInteger, phaseEvidenceSupersedes, sameTurnEvidenceDecision } = require('./branch-causality.cjs')
const {
  TASK_PHASES,
  isKnownTaskPhase,
  isLiveTaskPhase,
  isTerminalTaskPhase,
  isAttentionTaskPhase,
  isSettledTaskPhase,
  isManualTaskPhase
} = require('../task-phase.cjs')
const {
  COMPANION_V7_REVISIONS,
  COMPANION_EVIDENCE_CHANNELS_V7,
  COMPANION_ACTIVITY_KINDS_V7,
  COMPANION_ACTIVITY_AUTHORITIES_V7,
  COMPANION_PLAN_ARTIFACT_STATES_V1,
  normalizeCompanionInteractionEvidenceV1,
  normalizeCompanionInteractionSetEvidenceV1,
  normalizeCompanionPlanArtifactEvidenceV1,
  normalizeCodexStateV7,
  validateCompanionEvidenceBatchV3
} = require('./contracts-v7.cjs')

const COMPANION_TASK_KERNEL_REVISION = providerRegistry.kernelRevision
const COMPANION_TASK_PACKAGE_REVISION = providerRegistry.snapshotRevision
const COMPANION_TASK_DRAFT_REVISION = COMPANION_V7_REVISIONS.draft
const COMPANION_TASK_COMMAND_REVISION = providerRegistry.commandRevision
const COMPANION_TASK_SUBSCRIBE_REVISION = providerRegistry.subscribeRevision
const COMPANION_TASK_ACK_REVISION = providerRegistry.ackRevision
const COMPANION_PROVIDER_EVIDENCE_BATCH_REVISION = COMPANION_V7_REVISIONS.providerEvidenceBatch
const PREFLIGHT_PROGRESS_MS = 600
const PREFLIGHT_TIMEOUT_MS = 5_000
const MAX_TIMER_DELAY_MS = 2_147_483_647
/**
 * RAW222: only the highest non-empty tier enters the generic cycle. Badges and
 * dedicated attention entries keep their independent state-based membership.
 */
const CYCLE_TIER_ORDER = ['active', 'attention', 'unread', 'fallback']
/**
 * Dynamic list groups in display order. `none` is not a group — it is the
 * absence of one — so it stays out of the view shape rather than becoming a
 * bucket nothing may read.
 */
const DYNAMIC_GROUPS = ['pinned', 'input', 'active', 'unknown', 'stopped', 'unread', 'completed']
const PROVIDER_PIN_AUTHORITIES = new Set(['app-server', 'codexhost', 'claude-metadata', 'cursor-workspace', 'orca-tab'])
const TASK_KINDS = new Set([
  ...PROVIDERS.map((id) => providerRegistry.providers[id].taskKind),
  'topology-child',
  'local-pin'
])
const GROUPS = [...DYNAMIC_GROUPS, 'none']
const DRAFT_PRODUCERS = ['renderer', 'host-preflight', 'host-evidence']
const SOURCE_LANES = [...COMPANION_EVIDENCE_CHANNELS_V7]
const ACTIVITY_EVIDENCE_PHASE = Object.freeze({
  'turn-running': 'running',
  'turn-completed': 'completed',
  'turn-interrupted': 'stopped',
  'turn-failed': 'stopped',
  unknown: 'unknown'
})
const PLAN_LIFECYCLE_STATES = new Set(['unknown', 'ready', 'cleared'])
const PLAN_CLEAR_REASONS = new Set(['cancel', 'execution-start', 'archive', 'removal'])
const CODEX_STOPPED_GOALS = new Set(['paused', 'blocked', 'usageLimited', 'budgetLimited'])
const AGGREGATE_LIVE_PHASE_PRIORITY = Object.freeze({
  'waiting-approval': 3,
  'waiting-input': 2,
  running: 1
})

function providerSet(value) {
  if (Array.isArray(value)) return new Set(value.filter((provider) => PROVIDERS.includes(provider)))
  return registryProviderSet(value)
}

function providerShape(value) {
  return registryProviderShape(value)
}

function sameProviders(left, right) {
  return PROVIDERS.every((provider) => left[provider] === right[provider])
}

/**
 * Declared per-Provider traits.
 *
 * What survived the causal-core extraction are genuine capability differences,
 * not leftover patches: Codex owns Plan lifecycle, while Claude
 * revalidates its archive target at dispatch instead of against a verified
 * inventory. Those differences are real, but scattering them as `provider ===`
 * conditionals through the reducer means adding a Provider is a search rather
 * than a row. The reducer therefore reads traits and stays Provider-neutral.
 */
const PROVIDER_TRAITS = Object.freeze(Object.fromEntries(PROVIDERS.map((id) => {
  const taskKind = providerRegistry.providers[id].taskKind
  if (id === 'codex') {
    return [id, Object.freeze({
      taskKind,
      planLifecycle: true,
      rootInputPriority: true,
      archiveNeedsVerifiedInventory: true,
      // Codex read state is Provider-owned (preload acknowledgement map, Desktop
      // read events, CodexHost thread memory); the Kernel only projects it.
      readAcknowledgements: false,
      keyPrefixActionAlias: false
    })]
  }
  return [id, Object.freeze({
    taskKind,
    planLifecycle: false,
    rootInputPriority: false,
    archiveNeedsVerifiedInventory: false,
    readAcknowledgements: id === 'claude',
    keyPrefixActionAlias: true
  })]
})))

function providerTraits(provider) {
  const traits = PROVIDER_TRAITS[provider]
  if (!traits) throw new Error(`companion-provider-traits-missing:${provider}`)
  return traits
}

/**
 * Projects a canonical task onto the shared evidence-line shape. The task layer
 * keeps no separate active/terminal sequences, so `statusEnteredAt` is the only
 * causal quantity available and is reported on whichever side the phase sits;
 * the opposite side reads zero, which the core treats as "no such observation".
 */
function taskPhaseObservation(task) {
  const phase = task.activityPhase || task.phase
  const live = isLiveTaskPhase(phase)
  const terminal = isTerminalTaskPhase(phase)
  const sequence = finiteInteger(task.phaseRevision, finiteInteger(task.statusEnteredAt))
  return {
    causalKey: task.causalKey,
    causalDomain: task.causalDomain,
    causalSequence: task.causalSequence,
    authority: task.causalAuthority,
    liveCurrent: live,
    exactTerminal: terminal,
    turnStartedAt: finiteInteger(task.turnStartedAt),
    terminalAt: terminal ? finiteInteger(task.terminalAt) || finiteInteger(task.statusEnteredAt) : 0,
    activeEvidenceSequence: live ? sequence : 0,
    terminalEvidenceSequence: terminal ? sequence : 0
  }
}

function draftProducer(value) {
  return DRAFT_PRODUCERS.includes(value) ? value : 'renderer'
}

function emptySourceLaneGenerations() {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider, Object.fromEntries(
    SOURCE_LANES.map((lane) => [lane, 0])
  )]))
}

// All seven lanes are independent. The aggregate is diagnostic only and never
// seeds a missing lane; doing so previously made unrelated evidence appear
// newer. `phase` remains a one-release read-only alias for `activity`.
function normalizeSourceLaneGenerations(value) {
  const result = emptySourceLaneGenerations()
  for (const provider of PROVIDERS) {
    for (const lane of SOURCE_LANES) {
      const legacyPhase = lane === 'activity' ? value?.[provider]?.phase : undefined
      result[provider][lane] = finiteInteger(value?.[provider]?.[lane], finiteInteger(legacyPhase))
    }
  }
  return result
}

function laneIsNewer(incomingGeneration, currentGeneration, incomingRevision, currentRevision) {
  if (incomingGeneration > currentGeneration) return true
  if (incomingGeneration < currentGeneration) return false
  return incomingRevision >= currentRevision
}

function normalizeArchiveRequest(value) {
  if (!value || typeof value !== 'object') return undefined
  const evidence = isTerminalTaskPhase(value.evidence) ? value.evidence : ''
  const expectedRevisionAt = finiteInteger(value.expectedRevisionAt)
  const expectedUpdatedAt = finiteInteger(value.expectedUpdatedAt)
  const expectedLastTurnStartedAt = finiteInteger(value.expectedLastTurnStartedAt)
  const expectedSourceFingerprint = typeof value.expectedSourceFingerprint === 'string'
    ? value.expectedSourceFingerprint.slice(0, 80)
    : ''
  if (!evidence || !expectedRevisionAt || !expectedUpdatedAt || !expectedLastTurnStartedAt || !expectedSourceFingerprint) return undefined
  return {
    expectedUpdatedAt,
    expectedRevisionAt,
    ...(finiteInteger(value.expectedCompletionAt) ? { expectedCompletionAt: finiteInteger(value.expectedCompletionAt) } : {}),
    expectedLastTurnStartedAt,
    expectedSourceFingerprint,
    evidence
  }
}

function normalizeTask(value, enabledProviders) {
  if (!value || typeof value !== 'object') return null
  const provider = PROVIDERS.includes(value.provider) ? value.provider : ''
  const key = typeof value.key === 'string' ? value.key : ''
  const kind = TASK_KINDS.has(value.kind) ? value.kind : ''
  const phase = isKnownTaskPhase(value.phase) ? value.phase : 'unknown'
  const actionAlias = typeof value.actionAlias === 'string' ? value.actionAlias : ''
  const revisionAt = finiteInteger(value.revisionAt)
  if (!provider || !enabledProviders.has(provider) || !key || key.length > 256 || !kind || !revisionAt) return null
  const capabilities = value.capabilities && typeof value.capabilities === 'object' ? value.capabilities : {}
  const archiveRequest = normalizeArchiveRequest(value.archiveRequest)
  const planArtifactState = COMPANION_PLAN_ARTIFACT_STATES_V1.includes(value.planArtifactState)
    ? value.planArtifactState
    : value.planReady === true || value.planImplementation === true
      ? 'available'
      : value.planLifecycleState === 'cleared'
        ? value.planClearReason === 'cancel' ? 'cancelled'
          : value.planClearReason === 'archive' || value.planClearReason === 'removal' ? 'removed'
            : value.planClearReason === 'execution-start' ? 'executing' : 'consumed'
        : 'unknown'
  return {
    key,
    provider,
    kind,
    phase,
    activityPhase: phase,
    // Provider/Renderer values are intentionally ignored. Only finalizeTask()
    // may derive these canonical selectors.
    cycleTier: 'none',
    dynamicGroup: 'none',
    actionAlias: actionAlias.slice(0, 256),
    revisionAt,
    semanticRevision: finiteInteger(value.semanticRevision, 1),
    observationGeneration: finiteInteger(value.observationGeneration),
    membershipRevision: finiteInteger(value.membershipRevision, revisionAt),
    phaseRevision: finiteInteger(value.phaseRevision, finiteInteger(value.statusEnteredAt, revisionAt)),
    unreadRevision: finiteInteger(value.unreadRevision, revisionAt),
    visibilityRevision: finiteInteger(value.visibilityRevision, revisionAt),
    // Status time is causal evidence, not the time an inventory row happened
    // to be observed. Keep it empty when the provider cannot supply one.
    statusEnteredAt: finiteInteger(value.statusEnteredAt),
    turnStartedAt: finiteInteger(value.turnStartedAt),
    terminalAt: finiteInteger(value.terminalAt),
    metadataRevision: finiteInteger(value.metadataRevision, revisionAt),
    capabilityToken: typeof value.capabilityToken === 'string'
      ? value.capabilityToken.slice(0, 256)
      : actionAlias.slice(0, 256),
    freshness: value.freshness === 'verifying' ? 'verifying' : 'fresh',
    lastQuestionAt: finiteInteger(value.lastQuestionAt),
    createdAt: finiteInteger(value.createdAt),
    displayOrder: finiteInteger(value.displayOrder),
    cycleOrder: finiteInteger(value.cycleOrder),
    attentionOrder: finiteInteger(value.attentionOrder),
    hidden: value.hidden === true,
    unreadKnown: value.unreadKnown !== false,
    unread: value.unread === true,
    planImplementation: value.planImplementation === true,
    planReady: value.planReady === true || value.planImplementation === true,
    planLifecycleRevision: finiteInteger(value.planLifecycleRevision),
    planLifecycleState: PLAN_LIFECYCLE_STATES.has(value.planLifecycleState)
      ? value.planLifecycleState
      : value.planReady === true || value.planImplementation === true ? 'ready' : 'unknown',
    planClearReason: PLAN_CLEAR_REASONS.has(value.planClearReason) ? value.planClearReason : '',
    planArtifactState,
    planArtifactActionable: planArtifactState === 'available' && value.planArtifactActionable !== false,
    paused: value.paused === true,
    turnMode: value.turnMode === 'plan' || value.turnMode === 'default' ? value.turnMode : 'unknown',
    idleConfirmed: value.idleConfirmed === true,
    localPin: value.localPin === true,
    // Provider-side pin (Codex Pinned section, CodexHost `pinned`, Claude
    // `isStarred`, Cursor `pinnedComposers`). `null` means the provider has no
    // pin lane for this row, which is not the same as "unpinned".
    providerPin: value.providerPin === true ? true : value.providerPin === false ? false : null,
    providerPinOrder: finiteInteger(value.providerPinOrder),
    providerPinAuthority: PROVIDER_PIN_AUTHORITIES.has(value.providerPinAuthority) ? value.providerPinAuthority : '',
    manualPhase: isManualTaskPhase(value.manualPhase) ? value.manualPhase : '',
    manualPhaseSetAt: finiteInteger(value.manualPhaseSetAt),
    dynamicEligible: value.dynamicEligible === true,
    capabilities: {
      // The anonymous key is the durable identity. Alias expiry must not make
      // a still-visible task unopenable; Host resolves/renews the hint.
      open: capabilities.open === true,
      archive: capabilities.archive === true,
      pause: capabilities.pause === true,
      resume: capabilities.resume === true,
      executePlan: capabilities.executePlan === true,
      ...(typeof capabilities.continueTask === 'boolean' ? { continueTask: capabilities.continueTask } : {}),
      pin: capabilities.pin === true
    },
    providerCapabilities: {
      open: capabilities.open === true,
      archive: capabilities.archive === true,
      pause: capabilities.pause === true,
      resume: capabilities.resume === true,
      executePlan: capabilities.executePlan === true,
      ...(typeof capabilities.continueTask === 'boolean' ? { continueTask: capabilities.continueTask } : {}),
      pin: capabilities.pin === true
    },
    family: typeof value.family === 'string' && value.family
      ? value.family.slice(0, 256)
      : `${provider}:${key}`,
    role: value.role === 'child' ? 'child' : 'root',
    standaloneEligible: value.standaloneEligible !== false,
    error: value.error === true,
    metadataPartial: value.metadataPartial === true,
    activityObserved: value.activityObserved !== false,
    causalKey: typeof value.causalKey === 'string' ? value.causalKey.slice(0, 256) : '',
    causalDomain: typeof value.causalDomain === 'string' && value.causalDomain.length <= 256 ? value.causalDomain : '',
    causalSequence: Number.isSafeInteger(value.causalSequence) && value.causalSequence > 0 ? value.causalSequence : 0,
    causalAuthority: COMPANION_ACTIVITY_AUTHORITIES_V7.includes(value.causalAuthority) ? value.causalAuthority : 'unknown',
    causalReliable: value.causalReliable === true,
    causalObserved: Object.prototype.hasOwnProperty.call(value, 'causalKey')
      || Object.prototype.hasOwnProperty.call(value, 'causalDomain')
      || Object.prototype.hasOwnProperty.call(value, 'causalReliable'),
    ...(value.topology && typeof value.topology === 'object' ? {
      topology: {
        mode: value.topology.mode === 'aggregate' ? 'aggregate' : 'independent',
        memberCount: Math.max(1, finiteInteger(value.topology.memberCount, 1)),
        liveCount: finiteInteger(value.topology.liveCount),
        attentionCount: finiteInteger(value.topology.attentionCount),
        errorCount: finiteInteger(value.topology.errorCount)
      }
    } : {}),
    ...(typeof value.displayName === 'string' ? { displayName: value.displayName.slice(0, 240) } : {}),
    ...(typeof value.originalTitle === 'string' ? { originalTitle: value.originalTitle.slice(0, 240) } : {}),
    alias: typeof value.alias === 'string' ? value.alias.slice(0, 120) : '',
    ...(typeof value.projectKey === 'string' ? { projectKey: value.projectKey.slice(0, 256) } : {}),
    ...(typeof value.projectName === 'string' ? { projectName: value.projectName.slice(0, 240) } : {}),
    ...(value.projectKind === 'project' || value.projectKind === 'chats' ? { projectKind: value.projectKind } : {}),
    ...(archiveRequest ? { archiveRequest } : {})
  }
}

function normalizeActivityCandidateV7(value = {}) {
  const kind = COMPANION_ACTIVITY_KINDS_V7.includes(value.kind) ? value.kind : 'unknown'
  const causalSequence = Object.prototype.hasOwnProperty.call(value, 'causalSequence')
    ? value.causalSequence : value.sequence
  return {
    kind,
    authority: COMPANION_ACTIVITY_AUTHORITIES_V7.includes(value.authority) ? value.authority : 'unknown',
    causalKey: typeof value.causalKey === 'string' ? value.causalKey : '',
    causalDomain: typeof value.causalDomain === 'string' && value.causalDomain.length <= 256 ? value.causalDomain : '',
    causalSequence: Number.isSafeInteger(causalSequence) && causalSequence > 0 ? causalSequence : 0,
    sequence: finiteInteger(value.sequence),
    exact: value.exact === true,
    observedAt: finiteInteger(value.observedAt),
    statusEnteredAt: finiteInteger(value.statusEnteredAt),
    turnStartedAt: finiteInteger(value.turnStartedAt),
    terminalAt: finiteInteger(value.terminalAt),
    inventoryRootCompletion: kind === 'turn-completed' && value.authority === 'inventory' && value.inventoryRootCompletion === true,
    ordinarySideInterruptedAt: kind === 'turn-interrupted' ? finiteInteger(value.ordinarySideInterruptedAt) : 0
  }
}

function activityCandidateCausalObservationV7(candidate) {
  const phase = ACTIVITY_EVIDENCE_PHASE[candidate.kind] || 'unknown'
  const liveCurrent = phase === 'running'
  const exactTerminal = candidate.exact === true && isTerminalTaskPhase(phase)
  return {
    causalKey: candidate.causalKey,
    causalDomain: candidate.causalDomain,
    causalSequence: candidate.causalSequence,
    authority: candidate.authority,
    liveCurrent,
    exactTerminal,
    turnStartedAt: candidate.turnStartedAt,
    activeEvidenceSequence: liveCurrent ? candidate.sequence : 0,
    terminalEvidenceSequence: exactTerminal ? candidate.sequence : 0,
    terminalAt: candidate.terminalAt
  }
}

/** Multiple raw Provider candidates are reduced once, inside the Kernel. */
function reduceActivityCandidatesV7(activity, requireConfirmedInterruption) {
  const candidates = (Array.isArray(activity.candidates) && activity.candidates.length
    ? activity.candidates
    : [activity]).map(normalizeActivityCandidateV7)
  let selected = null
  const authorityPriority = {
    'goal-verifying': 5,
    goal: 4,
    'live-turn': 3,
    terminal: 3,
    inventory: 1,
    unknown: 0
  }
  for (const observed of candidates) {
    const unverifiedInterruption = requireConfirmedInterruption && observed.kind === 'turn-interrupted'
      && observed.authority === 'inventory' && !observed.exact
    const candidate = unverifiedInterruption
      ? { ...observed, kind: 'unknown', authority: 'unknown', causalSequence: 0, terminalAt: 0 }
      : observed
    if (!selected) {
      selected = candidate
      continue
    }
    const sameTurnDecision = sameTurnEvidenceDecision(
      activityCandidateCausalObservationV7(selected),
      activityCandidateCausalObservationV7(candidate)
    )
    if (sameTurnDecision) {
      if (sameTurnDecision.accepted) selected = candidate
      continue
    }
    const selectedPriority = authorityPriority[selected.authority] || 0
    const candidatePriority = authorityPriority[candidate.authority] || 0
    if (candidatePriority > selectedPriority) {
      selected = candidate
      continue
    }
    if (candidatePriority < selectedPriority) continue
    if (candidate.kind === 'unknown' && selected.kind !== 'unknown') continue
    if (selected.kind === 'unknown' && candidate.kind !== 'unknown') {
      selected = candidate
      continue
    }
    if (phaseEvidenceSupersedes(
      activityCandidateCausalObservationV7(selected),
      activityCandidateCausalObservationV7(candidate)
    )) selected = candidate
  }
  return selected || normalizeActivityCandidateV7(activity)
}

function normalizeEvidenceNode(value, provider, enabledProviders, observationGeneration = 0, hostEvidence = false) {
  if (!value || typeof value !== 'object' || value.provider !== provider) return null
  const activity = value.activity && typeof value.activity === 'object' ? value.activity : {}
  const unread = value.unread && typeof value.unread === 'object' ? value.unread : {}
  const planArtifact = normalizeCompanionPlanArtifactEvidenceV1(value.planArtifact)
    || (value.plan && typeof value.plan === 'object'
      ? {
          state: value.plan.state === 'ready' ? 'available' : value.plan.state === 'cleared' ? 'consumed' : 'unknown',
          sequence: finiteInteger(value.plan.sequence),
          actionable: value.plan.state === 'ready',
          reason: PLAN_CLEAR_REASONS.has(value.plan.reason) ? value.plan.reason : ''
        }
      : { state: 'unknown', sequence: 0, actionable: false, reason: '' })
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {}
  const activityCandidate = reduceActivityCandidatesV7(activity, hostEvidence && provider === 'codex' && value.role !== 'child')
  const activityKind = activityCandidate.kind
  const phase = ACTIVITY_EVIDENCE_PHASE[activityKind]
  const capabilityNames = new Set((Array.isArray(value.capabilities) ? value.capabilities : [])
    .filter((name) => typeof name === 'string'))
  const sequence = finiteInteger(activityCandidate.sequence)
  const planArtifactState = planArtifact.state
  const planState = planArtifactState === 'available' ? 'ready'
    : planArtifactState === 'unknown' ? 'unknown' : 'cleared'
  const planSequence = finiteInteger(planArtifact.sequence)
  const planClearReason = PLAN_CLEAR_REASONS.has(planArtifact.reason) ? planArtifact.reason : ''
  const node = normalizeTask({
    ...metadata,
    key: value.key,
    provider,
    family: value.family,
    role: value.role,
    standaloneEligible: value.standaloneEligible !== false,
    error: value.error === true,
    metadataPartial: metadata.partial === true,
    activityObserved: activityCandidate.kind !== 'unknown' || activityCandidate.exact === true
      || sequence > 0 || activityCandidate.statusEnteredAt > 0
      || activityCandidate.turnStartedAt > 0 || activityCandidate.terminalAt > 0,
    phase,
    freshness: activityCandidate.exact === true && phase !== 'unknown' ? 'fresh' : 'verifying',
    observationGeneration: finiteInteger(observationGeneration),
    phaseRevision: sequence || finiteInteger(activityCandidate.statusEnteredAt),
    statusEnteredAt: finiteInteger(activityCandidate.statusEnteredAt),
    turnStartedAt: finiteInteger(activityCandidate.turnStartedAt),
    terminalAt: finiteInteger(activityCandidate.terminalAt),
    causalKey: typeof activityCandidate.causalKey === 'string' ? activityCandidate.causalKey : '',
    causalDomain: activityCandidate.causalDomain,
    causalSequence: activityCandidate.causalSequence,
    causalAuthority: activityCandidate.authority,
    causalReliable: activityCandidate.exact === true && Boolean(activityCandidate.causalKey),
    unreadKnown: unread.known === true,
    unread: unread.known === true && unread.value === true,
    unreadRevision: finiteInteger(unread.sequence),
    planReady: planState === 'ready',
    planLifecycleState: planState,
    planLifecycleRevision: planSequence,
    planClearReason,
    planArtifactState,
    planArtifactActionable: planArtifact.actionable === true,
    capabilities: {
      open: capabilityNames.has('open'),
      archive: capabilityNames.has('archive'),
      pause: capabilityNames.has('pause'),
      resume: capabilityNames.has('resume'),
      executePlan: capabilityNames.has('execute-plan') || capabilityNames.has('executePlan'),
      ...(capabilityNames.has('continue-task') || capabilityNames.has('continueTask') ? { continueTask: true } : {}),
      pin: capabilityNames.has('pin')
    }
  }, enabledProviders)
  if (node && provider === 'codex') {
    node.turnKind = activityKind
    if (hostEvidence) node.codexState = normalizeCodexStateV7(activity.codexState)
  }
  if (node && hostEvidence && provider === 'codex' && node.causalKey && node.causalDomain) {
    const exactTerminal = node.causalAuthority === 'terminal' && node.causalReliable && node.causalSequence > 0
    if (node.role === 'root' && activityKind === 'turn-completed' && node.turnStartedAt > 0
      && (exactTerminal || activityCandidate.inventoryRootCompletion)) {
      node.rootCompletionForSideOrder = true
    }
    if (activityKind === 'turn-interrupted' && exactTerminal && node.role === 'child') {
        node.ordinarySideInterruptedAt = node.turnStartedAt > 0 && activityCandidate.ordinarySideInterruptedAt >= node.turnStartedAt
          ? activityCandidate.ordinarySideInterruptedAt : 0
    }
  }
  return node
}

function normalizeEvidenceBatch(value, provider, draft, producer) {
  const source = value && typeof value === 'object' ? value : {}
  const explicit = validateCompanionEvidenceBatchV3(source, provider)
  const channelSource = source.channels && typeof source.channels === 'object' ? source.channels : {}
  const defaultSnapshot = producer === 'host-preflight'
  const normalizeChannel = (channel) => {
    const lane = channelSource[channel] && typeof channelSource[channel] === 'object'
      ? channelSource[channel]
      : {}
    const snapshot = lane.mode === 'snapshot' || (!explicit && defaultSnapshot)
    return {
      mode: snapshot ? 'snapshot' : 'delta',
      complete: snapshot && (lane.complete === true || (!explicit && defaultSnapshot)),
      generation: finiteInteger(lane.generation),
      removedKeys: [...new Set((Array.isArray(lane.removedKeys) ? lane.removedKeys : [])
        .filter((key) => typeof key === 'string' && key.length > 0 && key.length <= 256))]
    }
  }
  return {
    valid: explicit,
    revision: COMPANION_PROVIDER_EVIDENCE_BATCH_REVISION,
    provider,
    channels: Object.fromEntries(SOURCE_LANES.map((channel) => [channel, normalizeChannel(channel)])),
    nodes: explicit && Array.isArray(source.nodes) ? source.nodes : [],
    interactions: explicit
      ? source.interactions.map((interaction) => normalizeCompanionInteractionEvidenceV1(interaction, provider)).filter(Boolean)
      : [],
    interactionSets: explicit
      ? source.interactionSets.map((set) => normalizeCompanionInteractionSetEvidenceV1(set, provider)).filter(Boolean)
      : [],
    relations: explicit && Array.isArray(source.relations) ? source.relations : [],
    relationMode: source.relationMode === 'snapshot' || (!explicit && defaultSnapshot) ? 'snapshot' : 'delta',
    relationsComplete: source.relationsComplete === true || (!explicit && defaultSnapshot && Array.isArray(draft.relations)),
    removedRelationChildKeys: [...new Set((Array.isArray(source.removedRelationChildKeys) ? source.removedRelationChildKeys : [])
      .filter((key) => typeof key === 'string' && key.length > 0 && key.length <= 256))]
  }
}

function relationStoreKey(relation) {
  return `${relation.provider}\0${relation.childKey}\0${relation.authority}\0${relation.relation}`
}

function publicRootTask(task) {
  const {
    family: _family,
    role: _role,
    standaloneEligible: _standaloneEligible,
    error: _error,
    metadataPartial: _metadataPartial,
    activityObserved: _activityObserved,
    codexLaneGenerations: _codexLaneGenerations,
    closedMachineRun: _closedMachineRun,
    machineRunCoverageCurrent: _machineRunCoverageCurrent,
    relationOnly: _relationOnly,
    ordinarySideInterruptedAt: _ordinarySideInterruptedAt,
    turnKind: _turnKind,
    codexState: _codexState,
    memberStatus: _memberStatus,
    stateWriteBlocked: _stateWriteBlocked,
    goalVerificationRunning: _goalVerificationRunning,
    rootCompletionForSideOrder: _rootCompletionForSideOrder,
    providerCapabilities: _providerCapabilities,
    causalKey: _causalKey,
    causalDomain: _causalDomain,
    causalSequence: _causalSequence,
    causalAuthority: _causalAuthority,
    activityRebase: _activityRebase,
    causalReliable: _causalReliable,
    causalObserved: _causalObserved,
    activityPhase: _activityPhase,
    actionAlias: _actionAlias,
    capabilityToken: _capabilityToken,
    archiveRequest: _archiveRequest,
    membershipRevision: _membershipRevision,
    phaseRevision: _phaseRevision,
    unreadRevision: _unreadRevision,
    visibilityRevision: _visibilityRevision,
    metadataRevision: _metadataRevision,
    observationGeneration: _observationGeneration,
    planClearReason: _planClearReason,
    ...publicTask
  } = task
  return publicTask
}

function targetFromTask(task) {
  return {
    key: task.key,
    provider: task.provider,
    actionAlias: task.actionAlias,
    revisionAt: task.revisionAt,
    phase: task.phase,
    planReady: task.planReady,
    planLifecycleRevision: task.planLifecycleRevision,
    paused: task.paused,
    canArchive: task.capabilities.archive,
    canPause: task.capabilities.pause,
    canResume: task.capabilities.resume,
    canExecutePlan: task.capabilities.executePlan,
    canContinueTask: task.capabilities.continueTask === true,
    ...(task.archiveRequest ? { archiveRequest: task.archiveRequest } : {})
  }
}

function emptyViews() {
  return {
    groups: Object.fromEntries(DYNAMIC_GROUPS.map((group) => [group, []])),
    counts: { input: 0, active: 0, unread: 0 },
    cycleKeys: [],
    attentionKeys: { input: [], completedUnread: [], archive: [] },
    pausedKeys: []
  }
}

function emptyProviderHealth(providers) {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider, {
    status: providers?.[provider] === true ? 'unavailable' : 'disabled',
    generation: 0,
    errorCode: ''
  }]))
}

function emptyPackage(providers = providerShape({})) {
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    registryRevision: providerRegistry.revision,
    topologySchemaRevision: COMPANION_TASK_TOPOLOGY_REVISION,
    commandRevision: COMPANION_TASK_COMMAND_REVISION,
    packageRevision: 0,
    topologyRevision: 0,
    sourceTaskStateRevision: 'legacy',
    publishedAt: 0,
    enabled: false,
    providers: { ...providers },
    complete: false,
    freshness: 'verifying',
    focusedKey: '',
    sourceGenerations: Object.fromEntries(PROVIDERS.map((provider) => [provider, 0])),
    sourceLaneGenerations: emptySourceLaneGenerations(),
    providerHealth: emptyProviderHealth(providers),
    tasks: [],
    views: emptyViews()
  }
}

function compareByLatestQuestion(left, right) {
  return right.lastQuestionAt - left.lastQuestionAt
    || right.createdAt - left.createdAt
    || left.key.localeCompare(right.key)
}

/**
 * 置顶谓词：localPin 或 providerPin 任一为真。活着的状态组仍按相位显示，
 * 图钉只作行标记；已完成已读与 unknown 才停在置顶分组。
 */
function taskPinned(task) {
  return task.localPin === true || task.providerPin === true
}

/** EyPc-ordered local pins first, then provider pins in the provider's order. */
function compareByPinnedOrder(left, right) {
  const leftLocal = left.localPin === true ? 0 : 1
  const rightLocal = right.localPin === true ? 0 : 1
  if (leftLocal !== rightLocal) return leftLocal - rightLocal
  const leftOrder = leftLocal === 0 ? finiteInteger(left.displayOrder) : finiteInteger(left.providerPinOrder)
  const rightOrder = rightLocal === 0 ? finiteInteger(right.displayOrder) : finiteInteger(right.providerPinOrder)
  return leftOrder - rightOrder
    || compareByLatestQuestion(left, right)
}

function visibilityAnchor(task) {
  return Math.max(
    finiteInteger(task.lastQuestionAt),
    finiteInteger(task.turnStartedAt),
    finiteInteger(task.terminalAt),
    finiteInteger(task.statusEnteredAt),
    finiteInteger(task.createdAt)
  )
}

/**
 * The state-earned reachability of a task, independent of where the list
 * displays it. A pin is a row marker. Live, attention and unread rows stay in
 * their status groups; only completed-read and unknown pins park in the pin
 * group. Counts, attention walks and the ring still resolve through this
 * phase reading, not through the display group.
 */
function derivedAttentionState(task) {
  if (task.hidden || task.paused) return 'none'
  if (isAttentionTaskPhase(task.phase)) return 'input'
  if (task.phase === 'completed' && task.unread) return 'unread'
  if (task.phase === 'running') return 'active'
  return 'none'
}

function derivedCycleTier(task) {
  if (task.hidden || task.paused) return 'none'
  const attention = derivedAttentionState(task)
  if (task.phase === 'running' && (task.dynamicEligible || taskPinned(task))) return 'active'
  if (attention === 'input') return 'attention'
  // Completed-unread keeps its existing activity-window exemption. Continuable
  // tasks join this cycle tier without changing their phase or display group.
  if (hasCompletedUnread(task)) return 'unread'
  if (task.phase === 'stopped') return 'unread'
  if (task.phase === 'completed' && taskPinned(task)) return 'fallback'
  return 'none'
}

/** 显示分组：活着的状态组压过置顶泊位；图钉只留在行上。 */
function derivedDynamicGroup(task) {
  if (task.hidden || task.paused) return 'none'
  const pinned = taskPinned(task)
  // Attention, live work and unread completions keep their status groups even
  // when pinned. The pin is a row marker; the parking-lot group is only for
  // completed-read and unknown pins that have no status group of their own.
  if (isAttentionTaskPhase(task.phase)) return 'input'
  if (task.phase === 'completed' && task.unread) return 'unread'
  if (task.phase === 'running' && (pinned || task.dynamicEligible)) return 'active'
  if (task.phase === 'stopped') return 'stopped'
  if (pinned) return 'pinned'
  // The activity window retires only unpinned work.
  if (!task.dynamicEligible) return 'none'
  if (task.phase === 'unknown') return task.provider === 'codex' && task.capabilities.open ? 'unknown' : 'none'
  if (task.phase === 'completed') return 'completed'
  return 'none'
}

/** 公开相位、分组、快捷键环都从这里算出；先拍 canonicalPhase，再决定显示组。 */
function finalizeTask(task, pauseStorageReady = true) {
  const revisionAt = finiteInteger(task.revisionAt)
  const next = { ...task, revisionAt }
  // The hand-set phase stands in only while the canonical phase is `unknown`,
  // and it is applied here — the one point every task passes through — so
  // groups, cycle tier, counts and capabilities all read a single phase rather
  // than an icon that disagrees with the group it sits in.
  //
  // Retirement is the episode test rather than a comparison against `phase`.
  // This function re-runs on every local commit, and by then `phase` already
  // carries the applied override; reading that back as genuine evidence would
  // drop the entry on the next pin toggle.
  //
  // `statusEnteredAt <= manualPhaseSetAt` instead asks whether this is still the
  // one `unknown` stretch that was already running when the user chose. Leaving
  // `unknown` starts a later stretch, so the entry stops applying by itself and
  // a task that drifts back to `unknown` never resurrects a stale answer — with
  // no write on the hot path and nothing to prune.
  //
  // `canonicalPhase` keeps what the evidence actually said. Every judgement
  // ABOUT evidence — the unknown grace window above all — must read it, because
  // `phase` may now be a user's answer, and letting a preference decide whether
  // the task "was previously unknown" would put evidence reasoning in the hands
  // of the UI.
  next.canonicalPhase = next.phase
  if (next.manualPhase && next.phase === 'unknown' && finiteInteger(next.statusEnteredAt) <= next.manualPhaseSetAt) {
    next.phase = next.manualPhase
  }
  if (next.planReady && !next.planLifecycleRevision) {
    next.planLifecycleRevision = Math.max(1, next.statusEnteredAt, next.turnStartedAt, next.revisionAt)
  }
  if (!next.planReady) {
    if (next.planLifecycleState === 'unknown') next.planLifecycleRevision = 0
    next.paused = false
  }
  if (next.planReady) {
    next.planArtifactState = 'available'
    next.planArtifactActionable = next.planArtifactActionable !== false
  } else {
    if (!COMPANION_PLAN_ARTIFACT_STATES_V1.includes(next.planArtifactState)) next.planArtifactState = 'unknown'
    next.planArtifactActionable = false
  }
  // A completed Plan remains user-actionable even when Codex does not expose
  // the dedicated Implement Plan request. `planImplementation` controls cycle
  // priority only; it must not disable the row/menu controls. The Host still
  // performs an exact latest-Turn/activity/request preflight before execution.
  const planActionable = providerTraits(next.provider).planLifecycle
    && next.planReady && next.planArtifactActionable && next.stateWriteBlocked !== true
    && (isSettledTaskPhase(next.phase) || isAttentionTaskPhase(next.phase))
  const providerCapabilities = next.providerCapabilities || next.capabilities
  next.providerCapabilities = { ...providerCapabilities }
  next.capabilities = {
    ...next.capabilities,
    pause: pauseStorageReady && planActionable && !next.paused,
    resume: pauseStorageReady && planActionable && next.paused,
    executePlan: planActionable && providerCapabilities.executePlan === true,
    ...(typeof providerCapabilities.continueTask === 'boolean' ? { continueTask: providerCapabilities.continueTask
      && next.provider === 'codex' && next.role !== 'child' && next.phase === 'stopped' && !next.planReady } : {})
  }
  // Order matters: a pin's ring tier is decided by the group the list will show
  // it in, so the group has to exist first.
  next.dynamicGroup = derivedDynamicGroup(next)
  next.cycleTier = derivedCycleTier(next)
  return next
}

function semanticTask(task) {
  return {
    key: task.key,
    provider: task.provider,
    kind: task.kind,
    phase: task.phase,
    freshness: task.freshness,
    cycleTier: task.cycleTier,
    dynamicGroup: task.dynamicGroup,
    revisionAt: task.revisionAt,
    statusEnteredAt: task.statusEnteredAt,
    turnStartedAt: task.turnStartedAt,
    terminalAt: task.terminalAt,
    lastQuestionAt: task.lastQuestionAt,
    createdAt: task.createdAt,
    displayOrder: task.displayOrder,
    cycleOrder: task.cycleOrder,
    attentionOrder: task.attentionOrder,
    hidden: task.hidden,
    unreadKnown: task.unreadKnown,
    unread: task.unread,
    planImplementation: task.planImplementation,
    planReady: task.planReady,
    planLifecycleRevision: task.planLifecycleRevision,
    planLifecycleState: task.planLifecycleState || (task.planReady ? 'ready' : 'unknown'),
    planArtifactState: task.planArtifactState || (task.planReady ? 'available' : 'unknown'),
    planArtifactActionable: task.planArtifactActionable === true,
    paused: task.paused,
    turnMode: task.turnMode,
    idleConfirmed: task.idleConfirmed,
    localPin: task.localPin,
    providerPin: task.providerPin,
    providerPinOrder: task.providerPinOrder,
    providerPinAuthority: task.providerPinAuthority,
    manualPhase: task.manualPhase,
    manualPhaseSetAt: task.manualPhaseSetAt,
    dynamicEligible: task.dynamicEligible,
    capabilities: task.capabilities,
    displayName: task.displayName,
    originalTitle: task.originalTitle,
    alias: task.alias,
    projectKey: task.projectKey,
    projectName: task.projectName,
    projectKind: task.projectKind,
    topology: task.topology,
    completedUnread: task.completedUnread,
    codexStatus: task.codexStatus
  }
}

function assignSemanticRevision(previous, next) {
  const changed = !previous || JSON.stringify(semanticTask(previous)) !== JSON.stringify(semanticTask(next))
  next.semanticRevision = previous
    ? changed ? finiteInteger(previous.semanticRevision, 1) + 1 : finiteInteger(previous.semanticRevision, 1)
    : Math.max(1, finiteInteger(next.semanticRevision, 1))
  return { task: next, changed }
}

function buildViews(tasks) {
  const views = emptyViews()
  const visible = tasks.filter((task) => !task.hidden && !task.paused)
  views.pausedKeys = tasks.filter((task) => task.paused).sort(compareByLatestQuestion).map((task) => task.key)
  for (const group of Object.keys(views.groups)) {
    views.groups[group] = visible
      .filter((task) => task.dynamicGroup === group)
      .sort(group === 'pinned' ? compareByPinnedOrder : compareByLatestQuestion)
      .map((task) => task.key)
  }
  // Badges count openable tasks in each state, including lower tiers currently
  // suppressed by the generic cycle. Dedicated entries remain available.
  const countable = visible.filter((task) => task.capabilities.open)
  views.counts.input = countable.filter((task) => derivedAttentionState(task) === 'input').length
  views.counts.active = countable.filter((task) => (
    task.phase === 'running' && (task.dynamicEligible || taskPinned(task))
  )).length
  views.counts.unread = countable.filter(hasCompletedUnread).length

  const cycleCandidates = [...visible]
    .filter((task) => task.capabilities.open && task.cycleTier !== 'none')
    .sort(compareByLatestQuestion)
  views.cycleKeys = CYCLE_TIER_ORDER.map((tier) => cycleCandidates
    .filter((task) => task.cycleTier === tier)
    .map((task) => task.key)).find((keys) => keys.length > 0) || []

  const attention = [...visible].sort(compareByLatestQuestion)
  const inputAttention = attention
    .filter((task) => task.capabilities.open && derivedAttentionState(task) === 'input')
    .map((task) => task.key)
  // Direct attention actions are exact: "待输入" must never fall through to
  // an unrelated pinned/completed task. Membership is state-earned, so a
  // pinned waiting-input task is in the input group and this entry.
  views.attentionKeys.input = inputAttention
  // The dedicated unread entry retains RAW188: real unread completions first,
  // then parked pins (including unknown pins). It does not inherit the generic
  // cycle's RAW222 tiers or its continuable-task membership.
  const unreadAttention = attention
    .filter((task) => task.capabilities.open && hasCompletedUnread(task))
  const pinnedOrder = new Map(views.groups.pinned.map((key, index) => [key, index]))
  const pinnedAttention = attention
    .filter((task) => task.capabilities.open && taskPinned(task) && task.dynamicGroup === 'pinned')
    .sort((left, right) => (pinnedOrder.get(left.key) ?? 0) - (pinnedOrder.get(right.key) ?? 0))
  views.attentionKeys.completedUnread = (unreadAttention.length > 0 ? unreadAttention : pinnedAttention)
    .map((task) => task.key)
  views.attentionKeys.archive = attention
    .filter((task) => task.capabilities.archive)
    .map((task) => task.key)
  return views
}

function semanticPackage(packageValue) {
  return JSON.stringify({
    enabled: packageValue.enabled,
    providers: packageValue.providers,
    complete: packageValue.complete,
    freshness: packageValue.freshness,
    topologyRevision: packageValue.topologyRevision,
    // Health generations order evidence internally; advancing them without a
    // status/error transition must not fan out a new global snapshot revision.
    providerHealth: Object.fromEntries(PROVIDERS.map((provider) => [provider, {
      status: packageValue.providerHealth?.[provider]?.status || 'unavailable',
      errorCode: packageValue.providerHealth?.[provider]?.errorCode || ''
    }])),
    tasks: packageValue.tasks.map(semanticTask),
    views: packageValue.views,
    focusedKey: packageValue.focusedKey || ''
  })
}

/** Kernel 工厂：私有图只在这里；对外只发根任务 Snapshot。 */
function createCompanionTaskKernel(dependencies = {}) {
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : setTimeout
  const clearTimer = typeof dependencies.clearTimeout === 'function' ? dependencies.clearTimeout : clearTimeout
  const notify = typeof dependencies.notify === 'function' ? dependencies.notify : () => {}
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const diagnosticTaskRef = typeof dependencies.diagnosticTaskRef === 'function' ? dependencies.diagnosticTaskRef : () => ''
  const diagnosticMemberSignatures = new Map()
  const diagnosticStateSignatures = new Map()
  const diagnosticActivitySignatures = new Map()
  const preflight = typeof dependencies.preflight === 'function' ? dependencies.preflight : null
  const refreshProviders = typeof dependencies.refreshProviders === 'function' ? dependencies.refreshProviders : null
  const persistPlanPause = typeof dependencies.persistPlanPause === 'function' ? dependencies.persistPlanPause : () => true
  const persistInteractionTombstones = typeof dependencies.persistInteractionTombstones === 'function'
    ? dependencies.persistInteractionTombstones
    : () => true
  const migrateHiddenPlan = typeof dependencies.migrateHiddenPlan === 'function' ? dependencies.migrateHiddenPlan : () => true
  const applyPreference = typeof dependencies.applyPreference === 'function' ? dependencies.applyPreference : null
  const initial = dependencies.initialConfiguration && typeof dependencies.initialConfiguration === 'object'
    ? dependencies.initialConfiguration
    : {}
  let enabled = initial.enabled === true
  let providers = providerShape(initial.providers || {})
  let dynamicWindowMs = Math.max(1, Math.min(24 * 30, finiteInteger(initial.dynamicTaskWindowHours, 168))) * 60 * 60 * 1_000
  let activeLease = 0
  let leaseSequence = 0
  let packageSequence = 0
  let topologySequence = 0
  let topologyFingerprint = ''
  let currentPackage = emptyPackage(providers)
  const providerEpochs = Object.fromEntries(PROVIDERS.map((provider) => [provider, 0]))
  const providerCacheStates = new Map()
  const taskIncarnations = new Map()
  let tasksByKey = new Map()
  const lastDraftRevisionByProducer = new Map()
  let lastSemantic = semanticPackage(currentPackage)
  let disposed = false
  let preflightInFlight = null
  let visibilityTimer = null
  let nextVisibilityTransitionAt = 0
  const archiveTombstones = new Map()
  // Dynamic Provider observations stay process-private. Public snapshots are
  // rebuilt from this retained graph and expose roots plus aggregate counts
  // only; child/family/relation identities never cross the bridge.
  const nodeStore = new Map()
  const relationStore = new Map()
  const interactionStore = new Map()
  const completeCodexRequestSets = new Map()
  const interactionTombstones = new Map()
  let interactionTombstonesChanged = false
  const packageListeners = new Set()
  const pauseReceipts = new Map()
  let pauseRecoveryPending = Array.isArray(dependencies.initialBlockedPauseKeys)
  let unavailablePauseKeys = new Set(dependencies.initialBlockedPauseKeys || [])
  const protectedPauseGroupKeys = new Set()
  function refreshPauseProtection() {
    if (!pauseRecoveryPending) return
    const state = dependencies.refreshPauseStorage()
    unavailablePauseKeys = state.ready || Array.isArray(state.blockedKeys) ? new Set(state.blockedKeys) : null
    if (!state.ready) return
    pauseRecoveryPending = false
    pauseReceipts.clear()
    for (const receipt of state.receipts) pauseReceipts.set(receipt.key, receipt)
    for (const task of nodeStore.values()) applyPauseReceipt(task)
  }
  const attentionSeen = {
    input: new Set(),
    completedUnread: new Set()
  }
  const attentionWalks = {
    input: [],
    completedUnread: []
  }
  const attentionRounds = {
    input: 0,
    completedUnread: 0
  }
  const inputAttentionStates = new Map()
  let unreadFallback = false
  const readAcknowledgements = new Map()
  const shortcutReads = createShortcutReadReceipts()
  let shortcutReadInputs = new Map()
  const consumerAcknowledgements = new Map()
  const commandResults = new Map()
  const commandQueues = new Map()
  const pendingAttention = new Set()
  for (const value of Array.isArray(dependencies.initialPauseReceipts) ? dependencies.initialPauseReceipts : []) {
    if (!value || typeof value !== 'object' || typeof value.key !== 'string') continue
    const revision = finiteInteger(value.planLifecycleRevision)
    if (!revision || value.paused !== true) continue
    pauseReceipts.set(value.key, { planLifecycleRevision: revision, paused: true, updatedAt: finiteInteger(value.updatedAt) })
  }

  const actions = createCompanionTaskActions({
    adapters: dependencies.hostRegistry?.registryRevision === providerRegistry.revision
      ? dependencies.hostRegistry.adapters
      : createCompanionHostRegistry(dependencies.adapters).adapters,
    notify,
    now,
    record,
    onProviderFailure: (provider, errorCode) => markProviderDegraded(provider, errorCode)
  })
  const navigation = createCompanionNavigation({
    coalesceMs: dependencies.coalesceMs,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    queueMicrotask: dependencies.queueMicrotask,
    record,
    captureTarget: (target) => {
      const task = taskForKey(target.key)
      return {
        epoch: providerEpochs[target.provider],
        incarnation: taskIncarnations.get(target.key),
        lifecycle: openLifecycle(task),
        attention: Object.fromEntries(Object.keys(attentionRounds).map((kind) => [kind, captureAttention(kind, task)]))
      }
    },
    isSameTarget: sameOpenTarget,
    canOpenTarget: (request) => {
      if (disposed || !enabled || providers[request.target.provider] !== true || !sameOpenTarget(request)) return false
      const task = taskForKey(request.target.key)
      if (!task) return request.trustedResolvedTarget === true && currentPackage.complete
      if (!task.capabilities.open) return false
      if (request.cycle && (task.hidden || task.paused)) return false
      if ((request.cycle || request.cacheOnly) && openLifecycle(task) !== request.context.lifecycle) return false
      if (request.attention) {
        return currentAttention(request.attention, task) && !attentionSeen[request.attention.kind].has(request.attention.instance)
      }
      return true
    },
    openTarget: async (target, request) => {
      const before = shortcutReadInputs.get(target.key)
      const source = request?.source || 'task-cycle'
      const token = shortcutReads.capture(before?.task, before?.members, source)
      const result = await actions.open({
        key: target.key,
        target,
        trustedResolvedTarget: request?.trustedResolvedTarget === true,
        cacheOnly: request.cycle === true || request.cacheOnly === true || Boolean(request.attention),
        isCurrent: request.isCurrent,
        source,
        operationId: request.operationId
      })
      if (disposed || !sameOpenTarget(request)) return result
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched') {
        markAttentionOpened(taskForKey(target.key), request.context.attention,
          ['card-click', 'manual-row-open', 'manual-quick-jump', 'global-shortcut', 'local-shortcut', 'task-cycle'].includes(source))
      }
      const current = shortcutReadInputs.get(target.key)
      if (shortcutReads.accept(token, current?.task, current?.members, result?.outcome, result?.confirmsRead === true)) {
        publishPrivateTopology('shortcut-open-local-read')
        record({ level: 'info', scope: 'task-kernel', event: 'shortcut-local-read',
          outcome: 'applied', provider: target.provider, taskRef: target.key,
          source: request?.source, operationId: request?.operationId,
          packageRevision: currentPackage.packageRevision })
      } else if (!isShortcutSource(source)) {
        acknowledgeOpenedTask(before?.task, result)
      }
      return result
    }
  })
  let navigationLease = 0

  function beginNavigation() {
    const receipt = navigation.begin({ enabled, providers, retainSources: Boolean(refreshProviders) })
    navigationLease = receipt.lease
  }

  beginNavigation()
  navigation.onResult((event) => {
    if (event.outcome !== 'opened' && event.outcome !== 'dispatched') return
    const key = typeof event.key === 'string' ? event.key : ''
    const task = taskForKey(key)
    if (!task) return
    if (currentPackage.focusedKey === key) return
    currentPackage = { ...currentPackage, focusedKey: key }
    const semantic = semanticPackage(currentPackage)
    if (semantic === lastSemantic) return
    currentPackage.packageRevision = ++packageSequence
    currentPackage.publishedAt = now()
    lastSemantic = semantic
    emitPackage(currentPackage)
  })

  function sameOpenTarget({ target, context }) {
    return context && context.epoch === providerEpochs[target.provider]
      && context.incarnation === taskIncarnations.get(target.key)
  }

  function openLifecycle(task) {
    return task && JSON.stringify([task.phase, task.turnStartedAt, task.terminalAt, task.statusEnteredAt])
  }

  function interactionStoreKey(interaction) {
    return `${interaction.provider}\0${interaction.taskKey}\0${interaction.branchRef}\0${interaction.interactionRef}`
  }

  function terminalInteractionState(state) {
    return state === 'resolved' || state === 'cancelled' || state === 'execution-started'
  }

  function interactionSupersedes(previous, incoming) {
    if (!previous) return true
    if (incoming.sequence !== previous.sequence) return incoming.sequence > previous.sequence
    if (terminalInteractionState(incoming.state) !== terminalInteractionState(previous.state)) {
      return terminalInteractionState(incoming.state)
    }
    if (incoming.exact !== previous.exact) return incoming.exact === true
    return false
  }

  function recordInteractionTombstone(key, interaction) {
    const previous = interactionTombstones.get(key)
    if (!interactionSupersedes(previous, interaction)) return false
    interactionTombstones.delete(key)
    interactionTombstones.set(key, interaction)
    while (interactionTombstones.size > 20_000) {
      const oldest = interactionTombstones.keys().next().value
      if (!oldest) break
      interactionTombstones.delete(oldest)
    }
    interactionTombstonesChanged = true
    return true
  }

  for (const value of Array.isArray(dependencies.initialInteractionTombstones)
    ? dependencies.initialInteractionTombstones
    : []) {
    const interaction = normalizeCompanionInteractionEvidenceV1(value)
    if (!interaction || !terminalInteractionState(interaction.state)) continue
    const key = interactionStoreKey(interaction)
    const previous = interactionTombstones.get(key)
    if (interactionSupersedes(previous, interaction)) interactionTombstones.set(key, interaction)
  }

  /** 按 activity sequence 关旧提问并写入墓碑，避免已清掉的 waiting 复活。 */
  function reconcileInteractions(batches, incomingLanes, currentLanes, enabledProviders, activities) {
    for (const [provider, batch] of Object.entries(batches)) {
      if (!enabledProviders.has(provider)) continue
      const channel = batch.channels.interaction
      const generation = finiteInteger(incomingLanes[provider].interaction)
      const currentGeneration = finiteInteger(currentLanes[provider].interaction)
      for (const requestSet of batch.interactionSets) {
        if (requestSet.complete !== true) continue
        if (provider === 'codex') {
          const latest = completeCodexRequestSets.get(requestSet.taskKey) || 0
          if (requestSet.requestSetRevision < latest) continue
          completeCodexRequestSets.set(requestSet.taskKey, requestSet.requestSetRevision)
        }
        const present = new Set(batch.interactions
          .filter((interaction) => interaction.taskKey === requestSet.taskKey
            && interaction.requestSetRevision === requestSet.requestSetRevision)
          .map(interactionStoreKey))
        for (const [key, interaction] of interactionStore) {
          if (interaction.provider !== provider
            || interaction.taskKey !== requestSet.taskKey
            || finiteInteger(interaction.requestSetRevision) > requestSet.requestSetRevision
            || present.has(key)) continue
          interactionStore.delete(key)
          recordInteractionTombstone(key, {
            ...interaction,
            state: 'resolved',
            sequence: Math.max(interaction.sequence, requestSet.requestSetRevision),
            requestSetRevision: requestSet.requestSetRevision,
            authority: 'provider-snapshot',
            exact: true
          })
        }
      }
      if (channel.mode === 'snapshot' && channel.complete && generation >= currentGeneration) {
        const present = new Set(batch.interactions.map(interactionStoreKey))
        for (const [key, interaction] of interactionStore) {
          if (interaction.provider !== provider || present.has(key) || interaction.sequence > generation) continue
          interactionStore.delete(key)
          recordInteractionTombstone(key, {
            ...interaction,
            state: 'resolved',
            sequence: Math.max(interaction.sequence, generation),
            authority: 'provider-snapshot',
            exact: true
          })
        }
      }
      const removed = new Set(channel.removedKeys)
      if (removed.size) {
        for (const [key, interaction] of interactionStore) {
          if (interaction.provider !== provider
            || !removed.has(interaction.interactionRef) && !removed.has(interaction.taskKey)) continue
          interactionStore.delete(key)
          recordInteractionTombstone(key, {
            ...interaction,
            state: 'resolved',
            sequence: Math.max(interaction.sequence, generation),
            authority: 'provider-live',
            exact: true
          })
        }
      }
      for (const interaction of batch.interactions) {
        const key = interactionStoreKey(interaction)
        if (terminalInteractionState(interaction.state)) {
          if (provider === 'codex' && !interactionSupersedes(interactionStore.get(key), interaction)) continue
          interactionStore.delete(key)
          recordInteractionTombstone(key, interaction)
          continue
        }
        // A resolved instance can never be reopened. Providers must emit a new
        // anonymous interactionRef for a genuinely new request instance.
        if (interactionTombstones.has(key) || provider === 'codex'
          && interaction.requestSetRevision < (completeCodexRequestSets.get(interaction.taskKey) || 0)) continue
        const previous = interactionStore.get(key)
        if (interactionSupersedes(previous, interaction)) interactionStore.set(key, interaction)
      }
      const opened = batch.interactions.filter(request => request.state === 'opened')
      const openedKeys = new Set(opened.map(interactionStoreKey))
      const openedTaskKeys = new Set(opened.map(request => request.taskKey))
      for (const activity of activities) {
        const { key: taskKey, phaseRevision: sequence } = activity
        if (activity.provider !== provider || !sequence || activity.phase === 'unknown'
          || provider !== 'codex' && openedTaskKeys.has(taskKey)) continue
        for (const [key, interaction] of interactionStore) {
          if (interaction.provider !== provider || interaction.taskKey !== taskKey || interaction.sequence > sequence || openedKeys.has(key)) continue
          if (provider === 'codex' && interaction.exact && !(activity.phase === 'running'
            && activity.freshness === 'fresh' && interaction.turnEpoch > 0 && activity.turnStartedAt > interaction.turnEpoch)) continue
          interactionStore.delete(key)
          recordInteractionTombstone(key, {
            ...interaction,
            state: 'resolved',
            sequence,
            authority: 'provider-live',
            exact: activity.freshness === 'fresh'
          })
        }
      }
    }
  }

  function taskOpenInteractions(task) {
    return [...interactionStore.values()].filter((interaction) => (
      interaction.provider === task.provider
      && interaction.taskKey === task.key
      && interaction.state === 'opened'
    ))
  }

  function codexGoalForTurn(task) {
    const goal = task.codexState?.goal
    // Retain the last active Goal while its completion is being checked.
    if (goal?.status === 'active') return 'active'
    if (goal?.freshness !== 'fresh' || goal.status === 'unknown' || goal.status === 'none') return ''
    if (task.activityPhase === 'running') return ''
    if (goal.updatedAt && task.turnStartedAt > goal.updatedAt) return ''
    if ((!goal.updatedAt || task.turnStartedAt === goal.updatedAt)
      && goal.sequence > 0 && task.causalSequence > goal.sequence) return ''
    return goal.status
  }

  // A supplementary Turn does not consume a Plan. Its old revision can
  // remain in the artifact lane without providing controls for the new Turn.
  function hasCurrentPlanArtifact(task) {
    return task?.planReady === true && (task.provider !== 'codex'
      || (finiteInteger(task.turnStartedAt) || finiteInteger(task.terminalAt)) <= task.planLifecycleRevision)
  }

  /** RAW-207: an open interaction may coexist with the underlying Turn. */
  function applyInteractionProjection(task) {
    const turnPhase = isKnownTaskPhase(task.activityPhase) ? task.activityPhase : task.phase
    const interactions = taskOpenInteractions(task)
    const goal = codexGoalForTurn(task)
    const goalStopped = CODEX_STOPPED_GOALS.has(goal)
    const planReady = hasCurrentPlanArtifact(task)
    const artifactWaiting = task.provider === 'codex' && task.role === 'child' && planReady
      && turnPhase === 'completed'
      && goal !== 'active' && !goalStopped
    const verifiesGoal = task.codexState?.goal?.observed === true && task.codexState.goal.freshness === 'verifying'
    const basePhase = goal === 'active' || task.goalVerificationRunning ? 'running' : goalStopped ? 'stopped'
      : verifiesGoal && isTerminalTaskPhase(turnPhase) ? 'unknown' : artifactWaiting ? 'waiting-input' : turnPhase
    const approval = interactions.some((interaction) => interaction.kind === 'approval')
    const phase = approval ? 'waiting-approval' : interactions.length ? 'waiting-input' : basePhase
    const planImplementation = interactions.length > 0 && !approval
      && interactions.every((interaction) => interaction.kind === 'plan-choice' || interaction.kind === 'plan-implementation')
    // Before its first Turn, a Side can be known without having an activity phase.
    const noTurn = task.role === 'child' && phase === 'unknown' && task.turnKind === 'unknown'
      && !task.causalKey && !task.turnStartedAt && !task.terminalAt
      && task.codexState?.emptyTurnHistory === true && !task.codexState.submissionPending
      && ['idle', 'notLoaded'].includes(task.codexState.threadStatus)
      && task.codexState.goal.status === 'none' && task.codexState.goal.freshness === 'fresh' && !planReady
      && !(task.unreadKnown && task.unread)
    const memberStatus = task.provider === 'codex' ? {
      phase,
      turn: noTurn ? 'not-started' : task.turnKind || 'unknown',
      goal,
      threadStatus: task.codexState?.threadStatus || 'unknown',
      verifying: !noTurn && (task.freshness === 'verifying' || verifiesGoal),
      pending: [...new Set(interactions.map((interaction) => interaction.kind))],
      planReady,
      submissionPending: task.codexState?.submissionPending === true
    } : undefined
    // Exact current input/approval owns presentation even while the Turn is
    // still running (Codex Questions, Cursor AskQuestion). A newer running
    // epoch without this instance clears the store first, so this cannot
    // resurrect stale waiting. Completed-unread stays a settled backlog
    // state, never a transition frame between running and waiting.
    if (interactions.length) {
      const selectedSequence = Math.max(...interactions.map((interaction) => interaction.sequence))
      const selectedTurnEpoch = Math.max(...interactions.map((interaction) => interaction.turnEpoch), 0)
      if (task.phase === phase
        && task.planImplementation === planImplementation
        && finiteInteger(task.phaseRevision) >= selectedSequence) return { ...task, memberStatus }
      return finalizeCanonicalTask({
        ...task,
        phase,
        memberStatus,
        phaseRevision: Math.max(finiteInteger(task.phaseRevision), selectedSequence),
        statusEnteredAt: selectedTurnEpoch || finiteInteger(task.statusEnteredAt),
        planImplementation
      })
    }
    if (task.phase === basePhase && task.planImplementation !== true) return memberStatus ? { ...task, memberStatus } : task
    return finalizeCanonicalTask({
      ...task,
      phase: basePhase,
      memberStatus,
      planImplementation: false
    })
  }

  function refreshInteractionProjections() {
    for (const [key, task] of nodeStore) nodeStore.set(key, applyInteractionProjection(task))
  }

  function clearVisibilityTimer() {
    if (visibilityTimer) clearTimer(visibilityTimer)
    visibilityTimer = null
    nextVisibilityTransitionAt = 0
  }

  /**
   * Identity of "the thing the user has already visited" for one attention queue.
   *
   * An aggregate root recomputes `revisionAt`, `statusEnteredAt`, `turnStartedAt`
   * and `terminalAt` as max-over-members, so ordinary subtask churn moved all
   * four on a task that had not itself changed. That invalidated its recorded
   * visit, the walk jumped back to it, and the tail of the queue was never
   * reached — read by the user as the pinned order being scrambled.
   *
   * A parked pin is the extreme case: it is exactly the pin group — finished and
   * already read, or `unknown` — and it has no new instance to revisit at all,
   * so its identity is fixed until it leaves the queue. Reading the group rather
   * than restating its phases is what keeps that true: this test used to spell
   * out `completed && !unread`, so when the queue grew to serve `unknown` pins
   * they fell through to the lifecycle anchor and subtask churn revived them.
   * Everything else keeps a lifecycle anchor, but `revisionAt` — a pure
   * "something changed" counter carrying no instance meaning — drops to a last
   * resort so the key can never be empty.
   */
  function inputAttentionSignals(key) {
    const inputs = shortcutReadInputs.get(key)
    const members = inputs?.members
    const nodes = Array.isArray(members) ? members : []
    const requests = new Set()
    const waiting = new Map()
    for (const node of nodes) {
      if (!isAttentionTaskPhase(node.phase)) continue
      const interactions = taskOpenInteractions(node)
      waiting.set(node.key, {
        anchor: Math.max(finiteInteger(node.statusEnteredAt), finiteInteger(node.turnStartedAt)),
        exact: interactions.length > 0
      })
      for (const interaction of interactions) {
        requests.add(JSON.stringify([interactionStoreKey(interaction), finiteInteger(interaction.turnEpoch)]))
      }
    }
    const root = nodes.find((node) => node.key === key)
    const planRevision = hasCurrentPlanArtifact(root) && (!waiting.size || root.planImplementation === true)
      ? finiteInteger(root.planLifecycleRevision)
      : 0
    return { requests, waiting, planRevision }
  }

  function syncInputAttentionStates(packageValue = currentPackage) {
    const keys = new Set(packageValue.views?.attentionKeys?.input || [])
    for (const key of inputAttentionStates.keys()) if (!keys.has(key)) inputAttentionStates.delete(key)
    for (const key of keys) {
      const signals = inputAttentionSignals(key)
      const previous = inputAttentionStates.get(key)
      if (!previous) {
        inputAttentionStates.set(key, { generation: 1, ...signals })
        continue
      }
      const addedRequest = [...signals.requests].some((signal) => !previous.requests.has(signal))
      const addedPlan = signals.planRevision > 0 && signals.planRevision !== previous.planRevision
      const addedWaiting = [...signals.waiting].some(([memberKey, waiting]) => (
        !waiting.exact && (!previous.waiting.has(memberKey) || waiting.anchor > previous.waiting.get(memberKey).anchor)
      ))
      const generation = previous.generation + (addedRequest || addedPlan || addedWaiting ? 1 : 0)
      inputAttentionStates.set(key, { generation, ...signals })
    }
  }

  function attentionInstance(kind, task) {
    if (!task) return ''
    if (kind === 'input') {
      const state = inputAttentionStates.get(task.key)
      return state ? `input:${task.key}:${state.generation}` : ''
    }
    if (!hasCompletedUnread(task)) return `${kind}:${task.key}:pinned`
    if (task.provider === 'codex') {
      const members = shortcutReadInputs.get(task.key)?.members || []
      const unreadMembers = members
        .filter((member) => member.unreadKnown === true && member.unread === true && member.activityPhase === 'completed')
        .map((member) => JSON.stringify(member.causalKey
          ? [member.key, member.causalDomain, member.causalKey]
          : [member.key, member.turnStartedAt, member.terminalAt, member.statusEnteredAt]))
        .sort()
      if (unreadMembers.length) return `${kind}:${task.key}:${unreadMembers.join(',')}`
    }
    const lifecycleAt = Math.max(
      finiteInteger(task.statusEnteredAt),
      finiteInteger(task.terminalAt),
      finiteInteger(task.turnStartedAt)
    )
    const anchor = lifecycleAt > 0 ? lifecycleAt : finiteInteger(task.revisionAt)
    return anchor > 0 ? `${kind}:${task.key}:${anchor}` : ''
  }

  function attentionEntries(kind, packageValue = currentPackage) {
    const taskByKey = new Map(packageValue.tasks.map((task) => [task.key, task]))
    const entries = []
    const instances = new Set()
    for (const key of packageValue.views.attentionKeys[kind] || []) {
      const task = taskByKey.get(key)
      const instance = attentionInstance(kind, task)
      if (!instance || instances.has(instance)) continue
      instances.add(instance)
      entries.push({ key, instance })
    }
    return entries
  }

  function resetAttentionWalk(kind, packageValue = currentPackage) {
    attentionWalks[kind] = attentionEntries(kind, packageValue)
    return attentionWalks[kind]
  }

  function reconcileAttentionProgress(packageValue = currentPackage, reorder = false) {
    syncInputAttentionStates(packageValue)
    for (const kind of ['input', 'completedUnread']) {
      const current = attentionEntries(kind, packageValue)
      if (kind === 'completedUnread') {
        const fallback = current.length > 0 && !hasCompletedUnread(taskForKey(current[0].key))
        if (fallback !== unreadFallback) {
          unreadFallback = fallback
          attentionRounds.completedUnread += 1
          attentionSeen.completedUnread.clear()
        }
      }
      const currentByInstance = new Map(current.map((entry) => [entry.instance, entry]))
      const valid = new Set(currentByInstance.keys())
      for (const instance of attentionSeen[kind]) if (!valid.has(instance)) attentionSeen[kind].delete(instance)

      const retained = attentionWalks[kind]
        .filter((entry) => currentByInstance.has(entry.instance))
        .map((entry) => currentByInstance.get(entry.instance))
      const retainedInstances = new Set(retained.map((entry) => entry.instance))
      const added = current.filter((entry) => !retainedInstances.has(entry.instance))
      if (kind === 'input' && added.length) {
        attentionSeen.input.clear()
        attentionWalks.input = current
        attentionRounds.input += 1
        continue
      }
      attentionWalks[kind] = reorder ? current : [...added, ...retained]
    }
  }

  function captureAttention(kind, task) {
    if (!task || !currentPackage.views.attentionKeys[kind].includes(task.key)) return null
    const instance = attentionInstance(kind, task)
    return instance ? { kind, round: attentionRounds[kind], instance, key: task.key } : null
  }

  function currentAttention(receipt, task) {
    return receipt && task?.key === receipt.key && receipt.round === attentionRounds[receipt.kind]
      && currentPackage.views.attentionKeys[receipt.kind].includes(task.key)
      && attentionInstance(receipt.kind, task) === receipt.instance
  }

  function markAttentionOpened(task, receipts, rotate) {
    if (!task) return
    for (const kind of ['input', 'completedUnread']) {
      const receipt = receipts[kind]
      if (!currentAttention(receipt, task)) continue
      const instance = receipt.instance
      attentionSeen[kind].add(instance)
      if (!rotate) continue
      const walk = attentionWalks[kind]
      const index = walk.findIndex((entry) => entry.key === task.key && entry.instance === instance)
      if (index < 0) continue
      attentionWalks[kind] = [...walk.slice(index + 1), ...walk.slice(0, index), walk[index]]
    }
  }

  function taskTerminalEpoch(task) {
    return Math.max(
      finiteInteger(task?.terminalAt),
      finiteInteger(task?.statusEnteredAt),
      finiteInteger(task?.phaseRevision),
      finiteInteger(task?.revisionAt)
    )
  }

  /** 只有收据 confirmsRead===true 才清 completed-unread；Deep Link 成功不等于已读。 */
  function acknowledgeOpenedTask(task, result) {
    if (result?.confirmsRead !== true) return
    if (!task || !providerTraits(task.provider).readAcknowledgements || task.phase !== 'completed' || task.unread !== true) return
    const current = taskForKey(task.key)
    const epoch = taskTerminalEpoch(task)
    if (!epoch || current?.phase !== 'completed' || taskTerminalEpoch(current) !== epoch) return
    readAcknowledgements.set(task.key, epoch)
    commitLocalTaskState(task, { unread: false, unreadKnown: true }, 'provider-open-read-hint')
  }

  function finalizeCanonicalTask(task) {
    const anchor = visibilityAnchor(task)
    const next = { ...task }
    if (providerTraits(next.provider).readAcknowledgements && next.unread === true) {
      const acknowledgedEpoch = finiteInteger(readAcknowledgements.get(next.key))
      const terminalEpoch = taskTerminalEpoch(next)
      if (acknowledgedEpoch && terminalEpoch <= acknowledgedEpoch) next.unread = false
      else if (terminalEpoch > acknowledgedEpoch) readAcknowledgements.delete(next.key)
    }
    return finalizeTask({
      ...next,
      dynamicEligible: anchor > 0 && anchor + dynamicWindowMs > now()
    })
  }

  function scheduleVisibilityTransition() {
    clearVisibilityTimer()
    if (disposed || !enabled || !currentPackage.tasks.length) return
    const currentTime = now()
    let dueAt = 0
    for (const task of currentPackage.tasks) {
      // A pin is exempt from the window, so the moment it would have expired is
      // no longer a visibility transition worth waking up for.
      if (!task.dynamicEligible || task.hidden || task.paused || taskPinned(task) || (task.planReady && (task.phase === 'stopped' || isAttentionTaskPhase(task.phase)))) continue
      const candidate = visibilityAnchor(task) + dynamicWindowMs
      if (candidate <= currentTime || (dueAt && candidate >= dueAt)) continue
      dueAt = candidate
    }
    if (!dueAt) return
    nextVisibilityTransitionAt = dueAt
    visibilityTimer = setTimer(() => {
      visibilityTimer = null
      nextVisibilityTransitionAt = 0
      if (disposed) return
      refreshCanonicalTasks('visibility-transition')
    }, Math.min(MAX_TIMER_DELAY_MS, Math.max(1, dueAt - currentTime + 1)))
    visibilityTimer?.unref?.()
  }

  function emitPackage(packageValue) {
    const freezeSpan = freezeTrace.begin('companion.emit-package')
    try {
    for (const listener of packageListeners) {
      try { listener(packageValue) } catch {}
    }

    } finally { freezeTrace.end(freezeSpan) }
  }

  function applyPauseReceipt(task) {
    if (!task.planReady || !task.planLifecycleRevision) {
      task.paused = false
      return task
    }
    const receipt = pauseReceipts.get(task.key)
    task.paused = Boolean(receipt?.paused && receipt.planLifecycleRevision === task.planLifecycleRevision)
    return task
  }

  function writePauseReceipt(task, paused) {
    if (!task?.planReady || !task.planLifecycleRevision) return false
    if (pauseRecoveryPending) return false
    const receipt = {
      key: task.key,
      planLifecycleRevision: task.planLifecycleRevision,
      paused: paused === true,
      updatedAt: now()
    }
    try {
      if (persistPlanPause(receipt) === false) return false
    } catch {
      return false
    }
    if (paused) pauseReceipts.set(task.key, receipt)
    else pauseReceipts.delete(task.key)
    return true
  }

  function retirePauseReceipt(key, revision) {
    if (pauseRecoveryPending || pauseReceipts.get(key)?.planLifecycleRevision !== revision) return
    try {
      if (persistPlanPause({ key, planLifecycleRevision: revision, paused: false, updatedAt: now() }) !== false) {
        pauseReceipts.delete(key)
      }
    } catch {}
  }

  function preparePlanLifecycle(previous, state, evidence, acceptPhase) {
    const next = { ...state }
    if (!previous) {
      if (next.planLifecycleState === 'cleared' && PLAN_CLEAR_REASONS.has(next.planClearReason)) {
        next.planReady = false
        next.planArtifactActionable = false
        next.paused = false
      } else if (next.planLifecycleState === 'ready') {
        next.planReady = true
        next.planArtifactState = 'available'
        next.planArtifactActionable = evidence.planArtifactActionable !== false
        next.planLifecycleRevision = Math.max(1, finiteInteger(next.planLifecycleRevision))
      } else {
        next.planReady = false
        next.planArtifactState = COMPANION_PLAN_ARTIFACT_STATES_V1.includes(next.planArtifactState)
          ? next.planArtifactState
          : 'unknown'
        next.planArtifactActionable = false
        next.planLifecycleRevision = 0
      }
      return applyPauseReceipt(next)
    }
    next.planReady = previous.planReady === true
    next.planLifecycleRevision = finiteInteger(previous.planLifecycleRevision)
    next.planLifecycleState = previous.planLifecycleState || (previous.planReady ? 'ready' : 'unknown')
    next.planClearReason = previous.planClearReason || ''
    next.planArtifactState = previous.planArtifactState || (previous.planReady ? 'available' : 'unknown')
    next.planArtifactActionable = previous.planArtifactActionable === true
    next.paused = previous.paused === true
    if (!acceptPhase) return next
    const evidenceRevision = finiteInteger(evidence.planLifecycleRevision)
    const previousRevision = finiteInteger(previous.planLifecycleRevision)
    const exactClear = evidence.planLifecycleState === 'cleared'
      && PLAN_CLEAR_REASONS.has(evidence.planClearReason)
      && evidenceRevision > previousRevision
    if (exactClear) {
      next.planReady = false
      next.planLifecycleRevision = evidenceRevision
      next.planLifecycleState = 'cleared'
      next.planClearReason = evidence.planClearReason
      next.planArtifactState = COMPANION_PLAN_ARTIFACT_STATES_V1.includes(evidence.planArtifactState)
        ? evidence.planArtifactState
        : evidence.planClearReason === 'cancel' ? 'cancelled'
          : evidence.planClearReason === 'archive' || evidence.planClearReason === 'removal' ? 'removed'
            : evidence.planClearReason === 'execution-start' ? 'executing' : 'consumed'
      next.planArtifactActionable = false
      next.paused = false
      return next
    }
    if (evidence.planLifecycleState === 'ready' || evidence.planReady === true || evidence.planImplementation === true) {
      const explicitRevision = evidenceRevision
      // Provider lifecycle identity outranks generic metadata timestamps. If a
      // compatibility input omits it, retain the established Plan identity and
      // use causal times only for first establishment.
      const revision = explicitRevision || previousRevision || Math.max(
        1,
        finiteInteger(evidence.turnStartedAt),
        finiteInteger(evidence.statusEnteredAt),
        finiteInteger(evidence.revisionAt)
      )
      if (revision < previousRevision || previous.planLifecycleState === 'cleared' && revision === previousRevision) return next
      const replaced = revision !== previousRevision
      next.planReady = true
      next.planLifecycleRevision = revision
      next.planLifecycleState = 'ready'
      next.planClearReason = ''
      next.planArtifactState = 'available'
      next.planArtifactActionable = evidence.planArtifactActionable !== false
      if (replaced) next.paused = false
      applyPauseReceipt(next)
    }
    // `unknown` deliberately retains the last exact Plan lifecycle. A generic
    // request resolution, a metadata refresh, or a supplementary Turn must not
    // erase a ready Plan card.
    return next
  }

  function migrateLegacyHiddenPlan(task) {
    if (!task?.hidden || !task.planReady || !task.planLifecycleRevision) return task
    const migrated = { ...task, hidden: false, paused: true }
    if (!writePauseReceipt(migrated, true)) return task
    let hiddenCleared = false
    try {
      hiddenCleared = migrateHiddenPlan({
        key: migrated.key,
        planLifecycleRevision: migrated.planLifecycleRevision
      }) !== false
    } catch {}
    if (hiddenCleared) return migrated
    writePauseReceipt(migrated, false)
    return task
  }

  function invalidate(reason) {
    clearVisibilityTimer()
    diagnosticActivitySignatures.clear()
    nodeStore.clear()
    relationStore.clear()
    interactionStore.clear()
    completeCodexRequestSets.clear()
    // V7 tombstones are deliberately retained across reducer invalidation and
    // process restart. A configuration/preflight reset is not evidence that a
    // previously resolved native request became current again.
    attentionSeen.input.clear()
    attentionSeen.completedUnread.clear()
    attentionWalks.input = []
    attentionWalks.completedUnread = []
    attentionRounds.input += 1
    attentionRounds.completedUnread += 1
    unreadFallback = false
    inputAttentionStates.clear()
    pendingAttention.clear()
    for (const provider of PROVIDERS) providerEpochs[provider] += 1
    providerCacheStates.clear()
    taskIncarnations.clear()
    tasksByKey.clear()
    readAcknowledgements.clear()
    shortcutReads.clear()
    shortcutReadInputs.clear()
    lastDraftRevisionByProducer.clear()
    const next = emptyPackage(providers)
    next.enabled = enabled
    next.publishedAt = now()
    next.packageRevision = ++packageSequence
    next.topologyRevision = ++topologySequence
    topologyFingerprint = ''
    currentPackage = next
    lastSemantic = semanticPackage(next)
    actions.sync({ enabled, ready: false, providers, targets: [], authoritative: true })
    navigation.sync({ lease: navigationLease, enabled, providers, ready: false, targets: [], cycleKeys: [] })
    emitPackage(currentPackage)
    return reason
  }

  function clearProviderCache(provider) {
    providerEpochs[provider] += 1
    providerCacheStates.delete(provider)
    for (const [key, task] of nodeStore) {
      if (task.provider !== provider) continue
      nodeStore.delete(key)
      readAcknowledgements.delete(key)
    }
    for (const [key, relation] of relationStore) if (relation.provider === provider) relationStore.delete(key)
    for (const [key, interaction] of interactionStore) if (interaction.provider === provider) interactionStore.delete(key)
    if (provider === 'codex') completeCodexRequestSets.clear()
  }

  function cacheComplete() {
    return PROVIDERS.every((provider) => !providers[provider] || providerCacheStates.has(provider))
  }

  function isProviderCached(provider) {
    const state = providerCacheStates.get(provider)
    return state === 'cached' || !state && currentPackage.complete && providers[provider] === true
  }

  function publishCacheReset(changedProviders) {
    const sourceGenerations = { ...currentPackage.sourceGenerations }
    const sourceLaneGenerations = { ...currentPackage.sourceLaneGenerations }
    const providerHealth = { ...currentPackage.providerHealth }
    const emptyHealth = emptyProviderHealth(providers)
    const emptyLanes = emptySourceLaneGenerations()
    for (const provider of changedProviders) {
      clearProviderCache(provider)
      sourceGenerations[provider] = 0
      sourceLaneGenerations[provider] = emptyLanes[provider]
      providerHealth[provider] = emptyHealth[provider]
    }
    return publishPrivateTopology('provider-cache-reset', {
      enabled, providers: { ...providers }, complete: cacheComplete(),
      sourceGenerations, sourceLaneGenerations, providerHealth
    })
  }

  function invalidateProvider(provider) {
    if (disposed || !enabled || providers[provider] !== true) return false
    publishCacheReset([provider])
    return true
  }

  function configure(input = {}) {
    const nextEnabled = input.enabled === true
    const nextProviders = providerShape(input.providers || providers)
    const requestedWindowHours = Number.isFinite(Number(input.dynamicTaskWindowHours))
      ? Math.max(1, Math.min(24 * 30, Math.trunc(Number(input.dynamicTaskWindowHours))))
      : dynamicWindowMs / (60 * 60 * 1_000)
    const nextDynamicWindowMs = requestedWindowHours * 60 * 60 * 1_000
    const windowChanged = dynamicWindowMs !== nextDynamicWindowMs
    const changed = enabled !== nextEnabled || !sameProviders(providers, nextProviders)
    const changedProviders = PROVIDERS.filter((provider) => providers[provider] !== nextProviders[provider])
    enabled = nextEnabled
    providers = nextProviders
    dynamicWindowMs = nextDynamicWindowMs
    if (changed) {
      beginNavigation()
      if (refreshProviders && enabled && currentPackage.enabled) {
        publishCacheReset(changedProviders)
        if (windowChanged) refreshCanonicalTasks('dynamic-window-changed')
      } else {
        invalidate(enabled ? 'provider-configuration-changed' : 'disabled')
      }
      if (enabled && refreshProviders) warmPendingProviders()
    } else if (windowChanged && currentPackage.tasks.length) {
      refreshCanonicalTasks('dynamic-window-changed')
    }
    return changed || windowChanged
  }

  function syncConsumers(packageValue, reorder = false) {
    const freezeSpan = freezeTrace.begin('companion.sync-consumers')
    try {
    const retainedKeys = new Set(packageValue.tasks.map((task) => task.key))
    tasksByKey = new Map(packageValue.tasks.map((task) => [task.key, task]))
    for (const key of taskIncarnations.keys()) if (!retainedKeys.has(key)) taskIncarnations.delete(key)
    for (const key of retainedKeys) if (!taskIncarnations.has(key)) taskIncarnations.set(key, {})
    reconcileAttentionProgress(packageValue, reorder)
    for (const key of readAcknowledgements.keys()) if (!retainedKeys.has(key)) readAcknowledgements.delete(key)
    const actionTargets = packageValue.tasks.map(actionTargetForTask)
    const openReady = packageValue.complete || actionTargets.length > 0
    actions.sync({
      enabled,
      providers,
      ready: packageValue.complete,
      openReady,
      authoritative: true,
      targets: actionTargets,
      focusedKey: packageValue.focusedKey,
      attentionKeys: packageValue.views.attentionKeys.archive
    })
    navigation.sync({
      lease: navigationLease,
      enabled,
      providers,
      ready: openReady,
      reorder,
      // Direct row open remains available from the hidden/paused page; only
      // selector-owned cycleKeys and attentionKeys exclude those tasks.
      targets: actionTargets,
      cycleKeys: packageValue.views.cycleKeys,
      groups: packageValue.views.groups
    })

    } finally { freezeTrace.end(freezeSpan) }
  }

  function actionTargetForTask(task) {
    const privateTask = nodeStore.get(task.key)
    return targetFromTask(privateTask ? {
      ...privateTask,
      phase: task.phase,
      revisionAt: task.revisionAt,
      planReady: task.planReady,
      planLifecycleRevision: task.planLifecycleRevision,
      paused: task.paused,
      capabilities: task.capabilities
    } : task)
  }

  function aggregateMemberPhase(members) {
    const live = members.reduce((selected, node) => (
      (AGGREGATE_LIVE_PHASE_PRIORITY[node.phase] || 0) > (AGGREGATE_LIVE_PHASE_PRIORITY[selected] || 0)
        ? node.phase
        : selected
    ), 'unknown')
    if (isLiveTaskPhase(live)) return live
    if (members.length && members.every((node) => node.phase === 'completed')) return 'completed'
    if (members.some((node) => node.phase === 'stopped')
      && members.every((node) => isTerminalTaskPhase(node.phase))) return 'stopped'
    return 'unknown'
  }

  function aggregateMemberUnread(members) {
    if (members.some((node) => node.unreadKnown === true && node.unread === true)) return { known: true, value: true }
    if (members.length && members.every((node) => node.unreadKnown === true && node.unread !== true)) return { known: true, value: false }
    return { known: false, value: false }
  }

  /** 根任务聚合：Topology 只给成员图，相位/未读/Plan 只在这里归约。
   * The Kernel is the sole owner of root state aggregation. Topology supplies
   * membership only; it never interprets phase, unread, Plan or capabilities. */
  function aggregateKernelRoot(root, members, relationsByChild) {
    // Current input on the Codex main remains actionable even while a side
    // works. Otherwise aggregate all members: a historical side terminal must
    // never erase the main's newer running/Goal evidence.
    const preserveRootInput = providerTraits(root.provider).rootInputPriority
      && members.length > 1 && isAttentionTaskPhase(root.phase)
    const planReady = hasCurrentPlanArtifact(root)
    const codexRoot = root.provider === 'codex'
    const completedCodexRoot = codexRoot && root.phase === 'completed'
    const phaseMembers = preserveRootInput ? [root] : !codexRoot ? members : members.filter((member) => {
      const relation = relationsByChild.get(member.key)
      if (member.memberStatus?.turn === 'not-started' && relation?.exact === true
        && relation.relation === 'side-thread' && relation.parentKey === root.key) return false
      if (!completedCodexRoot || planReady) return true
      if (member.phase !== 'stopped' || member.causalAuthority === 'goal' || taskOpenInteractions(member).length) return true
      if (CODEX_STOPPED_GOALS.has(member.memberStatus?.goal) || member.memberStatus?.submissionPending) return true
      if (member.closedMachineRun === true) return false
      const interruptedAt = member.ordinarySideInterruptedAt
      const latestEnd = interruptedAt % 1000 === 0 ? interruptedAt + 999 : interruptedAt
      const earlierOrdinaryInterruption = interruptedAt > 0 && latestEnd < root.turnStartedAt
        && root.activityPhase === 'completed' && root.rootCompletionForSideOrder === true
        && (root.causalAuthority === 'inventory' || root.freshness === 'fresh')
        && member.freshness === 'fresh' && !member.memberStatus?.planReady
        && root.causalDomain && member.causalDomain === root.causalDomain
        && relation?.relation === 'side-thread' && relation.parentKey === root.key
      return !earlierOrdinaryInterruption
    })
    const memberCoverageKnown = (member) => {
      const relation = relationsByChild.get(member.key)
      if (member.memberStatus?.turn === 'not-started' && relation?.exact === true
        && relation.relation === 'side-thread' && relation.parentKey === root.key) return true
      const goal = member.codexState?.goal
      return member.freshness === 'fresh' && completeCodexRequestSets.has(member.key)
        && !taskOpenInteractions(member).length && !member.memberStatus?.submissionPending
        && goal?.observed === true && goal.freshness === 'fresh' && ['none', 'complete'].includes(goal.status)
        && member.planArtifactState !== 'unknown' && !hasCurrentPlanArtifact(member)
    }
    const rootTurnSettled = completedCodexRoot && root.activityPhase === 'completed'
      && root.freshness === 'fresh' && root.causalAuthority === 'terminal' && root.causalReliable === true
      && root.idleConfirmed === true && root.codexState?.threadStatus === 'idle'
      && root.causalDomain && root.causalKey && root.turnStartedAt > 0
      && members.every(memberCoverageKnown)
    const historicalMachineMembers = rootTurnSettled ? phaseMembers.filter((member) => {
      const relation = relationsByChild.get(member.key)
      const latestEnd = member.terminalAt % 1000 === 0 ? member.terminalAt + 999 : member.terminalAt
      return member.closedMachineRun === false && member.machineRunCoverageCurrent === true
        && member.phase === 'stopped' && member.turnKind === 'turn-interrupted'
        && member.causalAuthority === 'terminal' && member.causalReliable === true
        && member.causalDomain === root.causalDomain && member.terminalAt > member.turnStartedAt
        && latestEnd < root.turnStartedAt
        && relation?.exact === true && relation.relation === 'side-thread' && relation.parentKey === root.key
    }) : []
    const machineFilteredMembers = historicalMachineMembers.length
      ? phaseMembers.filter((member) => !historicalMachineMembers.includes(member))
      : phaseMembers
    const groupActivity = root.codexState?.groupActivityConfirmed === true
    const memberPhase = aggregateMemberPhase(machineFilteredMembers)
    const activityPhase = groupActivity && !isAttentionTaskPhase(memberPhase) ? 'running' : memberPhase
    const main = root.memberStatus
    const confirmedMainStop = codexRoot && root.phase === 'stopped' && activityPhase === 'unknown'
      && (root.causalAuthority === 'terminal' && root.causalReliable && root.freshness === 'fresh'
        || CODEX_STOPPED_GOALS.has(main?.goal) && root.codexState?.goal?.freshness === 'fresh')
    const unread = aggregateMemberUnread(members)
    const liveCount = members.filter((node) => isLiveTaskPhase(node.phase)).length
    const attentionCount = members.filter((node) => isAttentionTaskPhase(node.phase)).length
    const errorCount = members.filter((node) => node.error === true).length
    const currentInteractionWaiting = phaseMembers.some((node) => taskOpenInteractions(node).length > 0)
    const planInteractionWaiting = phaseMembers.some((node) => (
      isAttentionTaskPhase(node.phase) && node.planImplementation === true
    ))
    // An available Plan on a completed family asks for the next decision without
    // fabricating an interaction. Running, exact input/approval and a genuine
    // interrupted member retain their activity phase. Unread remains independent.
    const artifactWaiting = codexRoot && planReady && activityPhase === 'completed'
    const phase = artifactWaiting ? 'waiting-input'
      : confirmedMainStop ? 'stopped'
      : !codexRoot && unread.value && isAttentionTaskPhase(activityPhase) && !currentInteractionWaiting
        ? 'completed' : activityPhase
    const statusEnteredAt = artifactWaiting ? Math.max(root.planLifecycleRevision, root.statusEnteredAt)
      : confirmedMainStop ? root.statusEnteredAt
      : Math.max(0, ...machineFilteredMembers.filter((node) => node.phase === activityPhase)
        .map((node) => finiteInteger(node.statusEnteredAt)))
    const blocked = phaseMembers.some((member) => member.memberStatus?.submissionPending
      || member.memberStatus?.threadStatus === 'systemError')
    const stateWriteBlocked = blocked || activityPhase === 'unknown'
      || phaseMembers.some((member) => member.codexState?.goal?.observed && member.codexState.goal.freshness === 'verifying')
    const goalLimited = ['usageLimited', 'budgetLimited'].includes(main?.goal)
    const capabilities = { ...(root.capabilities || {}) }
    if (liveCount > 0 || isLiveTaskPhase(phase) || stateWriteBlocked) capabilities.archive = false
    const canContinue = root.role === 'root' && root.phase === 'stopped' && phase === 'stopped'
      && !planReady && !currentInteractionWaiting && liveCount === 0 && !stateWriteBlocked && !goalLimited
      && (!root.codexState || ['turn-interrupted', 'turn-failed'].includes(main?.turn)
        || ['paused', 'blocked'].includes(main?.goal) && main?.turn === 'turn-completed')
    if (typeof capabilities.continueTask === 'boolean') capabilities.continueTask &&= canContinue
    // finalizeTask must not restore the provider declaration after aggregation.
    const providerCapabilities = { ...(root.providerCapabilities || root.capabilities) }
    if (stateWriteBlocked) providerCapabilities.archive = false
    if (typeof providerCapabilities.continueTask === 'boolean') providerCapabilities.continueTask &&= canContinue
    return {
      ...root,
      phase,
      planReady,
      ...(activityPhase === 'unknown' || blocked || main?.verifying ? { freshness: 'verifying' } : {}),
      ...(main ? {
        completedUnread: !isLiveTaskPhase(phase)
          && members.some((member) => member.activityPhase === 'completed' && member.unreadKnown && member.unread),
        codexStatus: {
          main,
          groupActivity,
          sides: members.filter((member) => member.key !== root.key && member.memberStatus)
            .sort((left, right) => (AGGREGATE_LIVE_PHASE_PRIORITY[right.phase] || 0)
              - (AGGREGATE_LIVE_PHASE_PRIORITY[left.phase] || 0))
            .slice(0, 8).map((member) => member.memberStatus)
        }
      } : {}),
      stateWriteBlocked,
      planImplementation: isAttentionTaskPhase(phase) && planInteractionWaiting,
      idleConfirmed: !isLiveTaskPhase(phase) && root.idleConfirmed,
      unreadKnown: unread.known,
      unread: unread.value,
      revisionAt: Math.max(...members.map((node) => finiteInteger(node.revisionAt)), finiteInteger(root.revisionAt)),
      statusEnteredAt,
      turnStartedAt: root.provider === 'codex' ? root.turnStartedAt : Math.max(...members.map((node) => finiteInteger(node.turnStartedAt)), 0),
      terminalAt: isLiveTaskPhase(phase) ? 0
        : Math.max(...machineFilteredMembers.map((node) => finiteInteger(node.terminalAt)), 0),
      capabilities,
      providerCapabilities,
      topology: {
        mode: members.length > 1 ? 'aggregate' : 'independent',
        memberCount: members.length,
        liveCount,
        attentionCount,
        errorCount
      }
    }
  }

  function materializePrivateTopology(previousPublicByKey = new Map(currentPackage.tasks.map((task) => [task.key, task]))) {
    // relationStore already applies generation admission on insert/removal.
    // A newer partial topology lane does not revoke older admitted relations
    // in other families. Only explicit current removal or complete replacement
    // may retire those edges.
    const topology = buildCompanionTaskTopology({
      nodes: [...nodeStore.values()],
      relations: [...relationStore.values()]
    })
    const nextShortcutInputs = new Map()
    const admittedRelationsByChild = new Map(topology.acceptedRelations.map((relation) => [relation.childKey, relation]))
    protectedPauseGroupKeys.clear()
    const eligibleGroups = pauseRecoveryPending ? topology.rootGroups.filter(({ root, members }) => {
      if (unavailablePauseKeys && !unavailablePauseKeys.has(root.key)
        && members.every(member => !unavailablePauseKeys.has(member.key))) return true
      protectedPauseGroupKeys.add(root.key)
      for (const member of members) protectedPauseGroupKeys.add(member.key)
      return false
    }) : topology.rootGroups
    const tasks = eligibleGroups.map(({ root, members }) => {
      const canonical = finalizeCanonicalTask(aggregateKernelRoot(root, members, admittedRelationsByChild))
      nextShortcutInputs.set(root.key, { task: canonical, members })
      const finalized = publicRootTask(finalizeTask(shortcutReads.project(canonical, members), !pauseRecoveryPending))
      const previous = previousPublicByKey.get(finalized.key)
      // Diagnose the actual admitted topology, not discovery candidates. Never
      // send private keys to the sink; the host supplies its salted ref mapper.
      const memberSignature = JSON.stringify(members.map((member) => {
        const relation = admittedRelationsByChild.get(member.key)
        return [member.key, member.phase, member.memberStatus?.turn, member.phaseRevision, member.unreadKnown, member.unread, member.closedMachineRun,
          relation?.parentKey, relation?.generation]
      }))
      const membersChanged = diagnosticMemberSignatures.get(root.key) !== memberSignature
      diagnosticMemberSignatures.set(root.key, memberSignature)
      if (members.length > 1 && membersChanged) {
        record({ level: 'info', scope: 'task-evidence', event: 'root-member-resolution',
          provider: root.provider, taskRef: diagnosticTaskRef(root.provider, root.key), outcome: finalized.phase,
          details: { rootPhase: root.phase, memberCount: members.length, omittedCount: Math.max(0, members.length - 32),
            members: members.slice(0, 32).map((member) => {
              const relation = admittedRelationsByChild.get(member.key)
              return { ref: diagnosticTaskRef(member.provider, member.key), phase: member.phase,
                root: member.key === root.key, phaseRevision: finiteInteger(member.phaseRevision),
                emptyTurnHistory: member.memberStatus?.turn === 'not-started',
                closedMachineRun: member.closedMachineRun === true,
                unreadKnown: member.unreadKnown === true, unread: member.unread === true,
                turnStartedAt: finiteInteger(member.turnStartedAt), terminalAt: finiteInteger(member.terminalAt),
                parentRef: relation ? diagnosticTaskRef(member.provider, relation.parentKey) : '',
                relation: relation?.relation || '', exact: relation?.exact === true,
                relationGeneration: finiteInteger(relation?.generation) }
            }) } })
      }
      const visibility = {
        dynamicWindowHours: dynamicWindowMs / (60 * 60 * 1_000),
        hidden: finalized.hidden === true, paused: finalized.paused === true,
        localPin: finalized.localPin === true, providerPin: finalized.providerPin ?? null,
        visibilityAnchor: visibilityAnchor(finalized),
        dynamicEligible: finalized.dynamicEligible === true, dynamicGroup: finalized.dynamicGroup
      }
      const stateSignature = JSON.stringify([
        ...['phase', 'unread', 'unreadKnown', 'planReady', 'planLifecycleRevision'].map((field) => finalized[field]),
        visibility
      ])
      if (diagnosticStateSignatures.get(root.key) !== stateSignature) {
        diagnosticStateSignatures.set(root.key, stateSignature)
        record({ level: 'info', scope: 'task-evidence', event: 'root-state-resolution',
          provider: root.provider, taskRef: diagnosticTaskRef(root.provider, root.key), outcome: finalized.phase,
          details: { ...visibility, previousPhase: previous?.phase || 'unknown', rootPhase: root.phase,
            phase: finalized.phase, unreadKnown: finalized.unreadKnown === true, unread: finalized.unread === true,
            planReady: root.planReady === true, planLifecycleRevision: finiteInteger(root.planLifecycleRevision),
            planState: root.planArtifactState || 'unknown', turnStartedAt: finiteInteger(root.turnStartedAt),
            terminalAt: finiteInteger(root.terminalAt), memberCount: members.length,
            runningMembers: members.filter((member) => member.phase === 'running').length,
            interactionCount: members.reduce((count, member) => count + taskOpenInteractions(member).length, 0) } })
      }
      return assignSemanticRevision(previous, finalized).task
    }).sort(compareByLatestQuestion)
    shortcutReadInputs = nextShortcutInputs
    for (const key of diagnosticMemberSignatures.keys()) if (!nextShortcutInputs.has(key)) diagnosticMemberSignatures.delete(key)
    for (const key of diagnosticStateSignatures.keys()) if (!nextShortcutInputs.has(key)) diagnosticStateSignatures.delete(key)
    shortcutReads.retain(new Set(nextShortcutInputs.keys()))
    let topologyRevision = currentPackage.topologyRevision
    const firstTopology = currentPackage.topologyRevision === 0
    if (firstTopology || topology.fingerprint !== topologyFingerprint) {
      topologyFingerprint = topology.fingerprint
      topologyRevision = ++topologySequence
    }
    return {
      topology,
      tasks,
      topologyRevision,
      freshness: tasks.some((task) => task.freshness === 'verifying') ? 'verifying' : 'fresh'
    }
  }

  function publishPrivateTopology(reason, patch = {}) {
    const materialized = materializePrivateTopology()
    const next = {
      ...currentPackage,
      ...patch,
      topologyRevision: materialized.topologyRevision,
      tasks: materialized.tasks,
      freshness: materialized.freshness,
      focusedKey: materialized.tasks.some((task) => task.key === currentPackage.focusedKey)
        ? currentPackage.focusedKey
        : '',
      views: buildViews(materialized.tasks)
    }
    return publishTaskPackage(next, { onChanged: () => record({
      level: 'info',
      scope: 'task-kernel',
      event: 'private-graph-commit',
      outcome: reason,
      packageRevision: next.packageRevision,
      count: next.tasks.length
    }) })
  }

  function markProviderDegraded(provider, errorCode) {
    if (!PROVIDERS.includes(provider) || providers[provider] !== true || disposed) return currentPackage
    const previous = currentPackage.providerHealth?.[provider] || { status: 'unavailable', generation: 0, errorCode: '' }
    const nextErrorCode = typeof errorCode === 'string' ? errorCode.slice(0, 80) : 'provider-command-failed'
    if (previous.status === 'degraded' && previous.errorCode === nextErrorCode) return currentPackage
    return publishPrivateTopology('provider-command-degraded', {
      providerHealth: {
        ...currentPackage.providerHealth,
        [provider]: {
          status: 'degraded',
          generation: Math.max(finiteInteger(previous.generation), now()),
          errorCode: nextErrorCode
        }
      }
    })
  }

  function publishLocalTasks(tasks, reason) {
    const next = {
      ...currentPackage,
      tasks: [...tasks].sort(compareByLatestQuestion),
      freshness: tasks.some((task) => task.freshness === 'verifying') ? 'verifying' : 'fresh',
      focusedKey: tasks.some((task) => task.key === currentPackage.focusedKey) ? currentPackage.focusedKey : '',
      views: buildViews(tasks)
    }
    return publishTaskPackage(next, { rescheduleNoop: true, onChanged: () => record({
      level: 'info',
      scope: 'task-kernel',
      event: 'local-state-commit',
      outcome: reason,
      packageRevision: next.packageRevision,
      count: next.tasks.length
    }) })
  }

  function publishTaskPackage(next, { evidenceDraft, rescheduleNoop = false, reorder = false, onChanged } = {}) {
    const semantic = semanticPackage(next)
    const previous = currentPackage
    if (semantic === lastSemantic) {
      // Evidence watermarks advance even when there is no visible change.
      if (evidenceDraft) {
        currentPackage = { ...next, packageRevision: previous.packageRevision, publishedAt: previous.publishedAt }
        record({
          level: 'debug', scope: 'task-kernel', event: 'same-state-no-op', outcome: 'ignored',
          packageRevision: previous.packageRevision, count: next.tasks.length
        })
      }
      if (reorder) syncConsumers(currentPackage, true)
      if (evidenceDraft || rescheduleNoop) scheduleVisibilityTransition()
      return currentPackage
    }
    next.packageRevision = ++packageSequence
    if (!evidenceDraft) next.publishedAt = now()
    currentPackage = next
    lastSemantic = semantic
    if (evidenceDraft) {
      recordPhaseTransitionsOnChange(previous.tasks, next.tasks, evidenceDraft)
      recordGroupCountsOnChange(next)
    }
    syncConsumers(next, reorder)
    emitPackage(next)
    scheduleVisibilityTransition()
    onChanged?.()
    return next
  }

  function refreshCanonicalTasks(reason) {
    if (!nodeStore.size) return publishLocalTasks(currentPackage.tasks.map(finalizeCanonicalTask), reason)
    for (const [key, task] of nodeStore) nodeStore.set(key, finalizeCanonicalTask(task))
    return publishPrivateTopology(reason)
  }

  function recordActivityDecision(previous, incoming, accepted, reason) {
    if (incoming.provider !== 'codex') return
    const details = {
      reason,
      previousPhase: previous?.activityPhase || previous?.phase || 'unknown',
      incomingPhase: incoming.phase,
      previousRevision: finiteInteger(previous?.phaseRevision),
      incomingRevision: finiteInteger(incoming.phaseRevision),
      previousSequence: finiteInteger(previous?.causalSequence),
      incomingSequence: finiteInteger(incoming.causalSequence),
      sameIdentity: Boolean(previous?.causalKey && previous.causalKey === incoming.causalKey),
      sameDomain: Boolean(previous?.causalDomain && previous.causalDomain === incoming.causalDomain),
      causalRef: incoming.causalKey ? diagnosticTaskRef(incoming.provider, `turn:${incoming.causalKey}`) : '',
      domainRef: incoming.causalDomain ? diagnosticTaskRef(incoming.provider, `domain:${incoming.causalDomain}`) : ''
    }
    const signature = JSON.stringify([accepted, details])
    if (diagnosticActivitySignatures.get(incoming.key) === signature) return
    diagnosticActivitySignatures.set(incoming.key, signature)
    record({ level: 'info', scope: 'task-evidence', event: 'state-decision',
      provider: incoming.provider, taskRef: diagnosticTaskRef(incoming.provider, incoming.key),
      outcome: accepted ? 'accepted' : 'retained', details })
  }

  function canRebaseActivity(previous, incoming, proof) {
    if (!proof || incoming.provider !== 'codex' || previous.provider !== 'codex'
      || previous.activityPhase !== 'running'
      || previous.causalAuthority === 'goal' || previous.causalAuthority === 'goal-verifying'
      || incoming.causalAuthority === 'goal' || incoming.causalAuthority === 'goal-verifying'
      || !isTerminalTaskPhase(incoming.phase) || incoming.freshness !== 'fresh'
      || incoming.causalReliable !== true || !incoming.causalKey || !incoming.causalDomain
      || typeof proof.expectedCausalKey !== 'string' || !proof.expectedCausalKey
      || proof.expectedCausalKey !== previous.causalKey
      || !Number.isSafeInteger(proof.expectedPhaseRevision) || proof.expectedPhaseRevision <= 0
      || proof.expectedPhaseRevision !== previous.phaseRevision
      || proof.causalDomain !== incoming.causalDomain
      || !Number.isSafeInteger(proof.snapshotRevision) || proof.snapshotRevision <= 0
      || !Number.isSafeInteger(incoming.causalSequence)
      || incoming.causalSequence <= previous.phaseRevision) return false
    return true
  }

  function reconcileTask(previous, incoming, draft, incomingLanes, currentLanes, activityRebase) {
    if (!previous) {
      let next = preparePlanLifecycle(null, incoming, incoming, true)
      next = finalizeCanonicalTask(next)
      if (incoming.phase === 'unknown') next.freshness = 'verifying'
      recordActivityDecision(null, incoming, incoming.phase !== 'unknown', incoming.phase === 'unknown' ? 'unknown' : 'accepted')
      return { ...assignSemanticRevision(null, next), activityAccepted: incoming.phase !== 'unknown' }
    }

    const provider = incoming.provider
    const activityUnobserved = provider === 'codex' && incoming.metadataPartial === true
      && incoming.activityObserved === false
    const unreadOnly = activityUnobserved && incoming.planLifecycleState === 'unknown'
      && incoming.planLifecycleRevision === 0
    const membershipAdvanced = incomingLanes[provider].membership > currentLanes[provider].membership
    const phaseAdvanced = incomingLanes[provider].activity > currentLanes[provider].activity
    const unreadAdvanced = incomingLanes[provider].unread > currentLanes[provider].unread
    const planArtifactAdvanced = incomingLanes[provider].planArtifact > currentLanes[provider].planArtifact
    const metadataAdvanced = incomingLanes[provider].metadata > currentLanes[provider].metadata
    const acceptMembership = incoming.metadataPartial !== true && laneIsNewer(
      incomingLanes[provider].membership,
      currentLanes[provider].membership,
      Math.max(incoming.membershipRevision, incoming.visibilityRevision),
      Math.max(previous.membershipRevision, previous.visibilityRevision)
    )
    const acceptMetadata = incoming.metadataPartial !== true && laneIsNewer(
      incomingLanes[provider].metadata,
      currentLanes[provider].metadata,
      incoming.metadataRevision,
      previous.metadataRevision
    )
    let acceptPhase = !activityUnobserved && laneIsNewer(
      incomingLanes[provider].activity,
      currentLanes[provider].activity,
      incoming.phaseRevision,
      previous.phaseRevision
    )
    let activityDecisionReason = activityUnobserved ? 'activity-unobserved' : acceptPhase ? 'accepted' : 'stale-lane'
    let acceptUnread = laneIsNewer(
      incomingLanes[provider].unread,
      currentLanes[provider].unread,
      incoming.unreadRevision,
      previous.unreadRevision
    )
    const acceptPlanArtifact = laneIsNewer(
      incomingLanes[provider].planArtifact,
      currentLanes[provider].planArtifact,
      incoming.planLifecycleRevision,
      previous.planLifecycleRevision
    )

    // Transport generation orders delivery, not Turn causality. Whenever both
    // observations carry exact causal identities, the shared causal core must
    // arbitrate even if the later-delivered batch has a higher lane generation.
    // For evidence without exact identities, retain the same-revision tie-break
    // so a delivery counter still cannot settle a conflicting fact by arrival.
    const causalComparable = Boolean(previous.causalDomain || incoming.causalDomain)
      || previous.causalReliable === true && incoming.causalReliable === true
    const laneTie = !phaseAdvanced && incoming.phaseRevision === previous.phaseRevision
    const previousObservation = taskPhaseObservation(previous)
    const incomingObservation = taskPhaseObservation(incoming)
    const causalDecision = sameTurnEvidenceDecision(previousObservation, incomingObservation)
    const authoritativeStart = incoming.codexState?.orderedTurnStart === true && incoming.phase === 'running'
      && incoming.turnStartedAt > 0 && (incoming.turnStartedAt > previous.turnStartedAt
        || incoming.turnStartedAt === previous.turnStartedAt && incoming.causalKey && previous.causalKey
          && incoming.causalKey !== previous.causalKey && incoming.causalDomain
          && incoming.causalDomain === previous.causalDomain && incoming.causalSequence > previous.causalSequence)
    if (acceptPhase && (causalDecision || causalComparable || laneTie)
      && !authoritativeStart && !phaseEvidenceSupersedes(previousObservation, incomingObservation)) {
      if (provider === 'codex' && causalDecision?.reason === 'sequence-incomparable'
        && previous.causalAuthority === 'inventory' && previous.causalSequence === 0
        && (previous.activityPhase || previous.phase) === incoming.phase && isTerminalTaskPhase(incoming.phase)
        && incoming.causalAuthority === 'terminal' && incoming.causalReliable === true
        && incoming.causalSequence > 0 && incoming.freshness === 'fresh') {
        activityDecisionReason = 'same-turn-terminal-confirmed'
      } else if (causalDecision?.reason === 'domain-incomparable' && incoming.codexState
        && !previous.causalKey && !previous.causalDomain && incoming.causalKey && incoming.causalDomain
        && incoming.turnKind === previous.turnKind
        && (!previous.turnStartedAt || previous.turnStartedAt === incoming.turnStartedAt)) {
        // Bind the first scoped Host observation to the retained, unscoped verdict.
        activityDecisionReason = 'turn-identity-established'
      } else if (draftProducer(draft.producer) !== 'renderer' && canRebaseActivity(previous, incoming, activityRebase)) {
        activityDecisionReason = 'activity-rebase'
      } else {
        acceptPhase = false
        activityDecisionReason = causalDecision?.reason
          || (incoming.turnStartedAt > 0 && previous.turnStartedAt > incoming.turnStartedAt ? 'older-turn' : 'stale-evidence')
      }
    }

    // Renderer drafts carry display metadata only once process-owned Provider
    // evidence exists. They can never reinterpret an accepted phase/unread lane.
    if (draftProducer(draft.producer) === 'renderer') {
      acceptPhase = false
      acceptUnread = false
      activityDecisionReason = 'renderer'
    }

    let verifying = false
    if (acceptPhase && incoming.phase === 'unknown' && (previous.canonicalPhase || previous.phase) !== 'unknown') {
      // Only a later observation can settle an unknown phase.
      acceptPhase = false
      verifying = true
      activityDecisionReason = 'unknown'
    }

    recordActivityDecision(previous, incoming, acceptPhase, activityDecisionReason)

    let next = { ...previous }
    if ((phaseAdvanced || acceptPhase) && typeof incoming.machineRunCoverageCurrent === 'boolean') {
      next.machineRunCoverageCurrent = incoming.machineRunCoverageCurrent
    }
    if (acceptMembership) {
      Object.assign(next, {
        kind: incoming.kind,
        membershipRevision: incoming.membershipRevision,
        family: incoming.family,
        role: incoming.role,
        standaloneEligible: incoming.standaloneEligible,
        ...(typeof incoming.closedMachineRun === 'boolean' ? { closedMachineRun: incoming.closedMachineRun } : {}),
        ...(typeof incoming.relationOnly === 'boolean' ? { relationOnly: incoming.relationOnly } : {}),
        error: incoming.error
      })
    }
    if (acceptMetadata) {
      Object.assign(next, {
        actionAlias: incoming.actionAlias,
        capabilityToken: incoming.capabilityToken,
        visibilityRevision: incoming.visibilityRevision,
        metadataRevision: incoming.metadataRevision,
        displayOrder: incoming.displayOrder,
        cycleOrder: incoming.cycleOrder,
        attentionOrder: incoming.attentionOrder,
        lastQuestionAt: finiteInteger(incoming.lastQuestionAt) || finiteInteger(previous.lastQuestionAt),
        createdAt: incoming.createdAt,
        hidden: incoming.hidden,
        localPin: incoming.localPin,
        providerPin: incoming.providerPin,
        providerPinOrder: incoming.providerPinOrder,
        providerPinAuthority: incoming.providerPinAuthority,
        manualPhase: incoming.manualPhase,
        manualPhaseSetAt: incoming.manualPhaseSetAt,
        dynamicEligible: incoming.dynamicEligible,
        capabilities: incoming.capabilities,
        providerCapabilities: incoming.providerCapabilities,
        archiveRequest: incoming.archiveRequest,
        topology: incoming.topology,
        displayName: incoming.displayName,
        originalTitle: incoming.originalTitle,
        alias: incoming.alias,
        projectKey: incoming.projectKey,
        projectName: incoming.projectName,
        projectKind: incoming.projectKind
      })
    }
    if (acceptPhase) {
      Object.assign(next, {
        phase: incoming.phase,
        activityPhase: incoming.phase,
        phaseRevision: incoming.phaseRevision,
        statusEnteredAt: incoming.statusEnteredAt,
        planImplementation: incoming.planImplementation,
        turnMode: incoming.turnMode,
        idleConfirmed: incoming.idleConfirmed,
        turnStartedAt: incoming.turnStartedAt,
        terminalAt: incoming.terminalAt,
        ordinarySideInterruptedAt: incoming.ordinarySideInterruptedAt,
        turnKind: incoming.turnKind,
        rootCompletionForSideOrder: incoming.rootCompletionForSideOrder,
        causalKey: incoming.causalObserved ? incoming.causalKey : previous.causalKey,
        causalDomain: incoming.causalObserved ? incoming.causalDomain : previous.causalDomain,
        causalSequence: incoming.causalObserved ? incoming.causalSequence : previous.causalSequence,
        causalAuthority: incoming.causalObserved ? incoming.causalAuthority : previous.causalAuthority,
        causalReliable: incoming.causalObserved ? incoming.causalReliable : previous.causalReliable,
        freshness: incoming.phase === 'unknown' ? 'verifying' : 'fresh'
      })
      const terminal = isTerminalTaskPhase(incoming.phase)
      if (!providerTraits(incoming.provider).archiveNeedsVerifiedInventory) {
        // Providers that revalidate the exact native target at dispatch time can
        // let terminal capability follow the independent phase lane without
        // waiting for another full inventory read.
        next.capabilities = { ...next.capabilities, archive: terminal && incoming.capabilities.archive }
        if (!next.capabilities.archive) delete next.archiveRequest
      } else if (!terminal) {
        // The others need their verified inventory fingerprint before archive
        // can be enabled, but a newer non-terminal phase always revokes stale
        // rights regardless.
        next.capabilities = { ...next.capabilities, archive: false }
        delete next.archiveRequest
      }
    } else if (activityDecisionReason === 'same-turn-stale' && previous.ordinarySideInterruptedAt !== undefined
      && incoming.ordinarySideInterruptedAt !== undefined && incoming.causalSequence === previous.causalSequence
      && incoming.turnStartedAt === previous.turnStartedAt) {
      next.ordinarySideInterruptedAt = incoming.ordinarySideInterruptedAt
        ? Math.max(previous.ordinarySideInterruptedAt, incoming.ordinarySideInterruptedAt) : 0
    } else if (provider === 'codex' && previous.role === 'root' && previous.activityPhase === 'completed'
      && !activityUnobserved && !['renderer', 'stale-lane'].includes(activityDecisionReason)) {
      const sameTurn = previous.causalKey && incoming.causalKey === previous.causalKey
        && previous.causalDomain && incoming.causalDomain === previous.causalDomain
      if (['goal', 'goal-verifying'].includes(incoming.causalAuthority)
        || (sameTurn && (incoming.phase !== 'completed' || incoming.causalAuthority === 'live-turn')
          && (incoming.causalSequence > previous.causalSequence || previous.causalAuthority === 'inventory'))) {
        next.rootCompletionForSideOrder = false
      } else if (sameTurn && incoming.turnStartedAt === previous.turnStartedAt
        && previous.causalAuthority === 'inventory' && incoming.causalAuthority === 'inventory'
        && previous.causalSequence === 0 && incoming.causalSequence === 0
        && previous.rootCompletionForSideOrder !== false && incoming.rootCompletionForSideOrder) {
        next.rootCompletionForSideOrder = true
      }
    }
    if (incoming.codexState && !activityUnobserved && (phaseAdvanced || acceptPhase)
      && draftProducer(draft.producer) !== 'renderer') {
      // A repeated verdict for the current Turn may change Thread status or
      // submission state. A rejected observation from a different Turn cannot.
      const sameTurn = incoming.causalKey && incoming.causalKey === previous.causalKey
        && incoming.causalDomain && incoming.causalDomain === previous.causalDomain
        && incoming.turnStartedAt === previous.turnStartedAt
      const sameVerdict = sameTurn && incoming.turnKind === previous.turnKind
        && incoming.causalSequence === previous.causalSequence
      // The proof can arrive or be withdrawn while the member still has no Turn identity.
      const emptyHistoryChanged = phaseAdvanced && incoming.role === 'child' && previous.turnKind === 'unknown'
        && !previous.causalKey && !previous.turnStartedAt
        && incoming.codexState.emptyTurnHistory !== previous.codexState?.emptyTurnHistory
      const acceptState = acceptPhase || sameVerdict || emptyHistoryChanged
      const state = acceptState ? incoming.codexState : previous.codexState
      const previousGoal = previous.codexState?.goal
      const incomingGoal = incoming.codexState.goal
      const acceptGoal = (acceptState && incomingGoal.sequence >= (previousGoal?.sequence || 0))
        || incomingGoal.observed && incomingGoal.sequence > (previousGoal?.sequence || 0)
      if (state || acceptGoal) {
        const goal = acceptGoal ? incomingGoal : previousGoal
        next.codexState = { ...state, goal }
        next.goalVerificationRunning = goal.observed && goal.freshness === 'verifying'
          && (previous.activityPhase === 'running' || previous.phase === 'running' || previous.goalVerificationRunning === true)
      }
    }
    next = preparePlanLifecycle(previous, next, incoming, acceptPlanArtifact)
    if (!unreadOnly) {
      next.planImplementation = next.planReady === true
        && isAttentionTaskPhase(next.phase)
        && incoming.planImplementation === true
    }
    if (acceptUnread && incoming.unreadKnown) {
      next.unread = incoming.unread
      next.unreadKnown = true
      next.unreadRevision = incoming.unreadRevision
    } else if (acceptUnread && !incoming.unreadKnown && next.unreadKnown !== true) {
      next.unreadKnown = false
    }
    // A newer independent lane is authoritative even when its provider
    // timestamp is numerically lower than another lane's timestamp.
    if (membershipAdvanced || phaseAdvanced || unreadAdvanced || planArtifactAdvanced || metadataAdvanced) {
      next.observationGeneration = Math.max(next.observationGeneration, incoming.observationGeneration)
    }
    if (verifying) next.freshness = 'verifying'
    const finalized = finalizeCanonicalTask(next)
    return { ...assignSemanticRevision(previous, finalized), activityAccepted: acceptPhase }
  }

  function reduceEvidenceBatches(draft, batches, incomingLaneGenerations, currentLaneGenerations, hostEvidence, enabledProviders, observedKeys, admission) {
    const producer = draftProducer(draft.producer)
    const observedProviders = Object.keys(batches)
    // A draft that carries no membership observation — an App Server event, a
    // phase-only push — asserts nothing about the inventory. Reading its absent
    // lane as zero would make it look strictly older than every real read and
    // silently reshape membership, so an unstated lane means "unchanged".
    for (const provider of observedProviders) {
      if (incomingLaneGenerations[provider].membership === 0) {
        incomingLaneGenerations[provider].membership = currentLaneGenerations[provider].membership
      }
    }
    const staleMembershipProviders = new Set(observedProviders.filter((provider) => {
      if (!enabledProviders.has(provider)) return false
      const incomingGeneration = incomingLaneGenerations[provider].membership
      const currentGeneration = currentLaneGenerations[provider].membership
      return incomingGeneration > 0 && currentGeneration > 0 && incomingGeneration < currentGeneration
    }))
    const incomingNodes = []
    const activities = []
    const incomingKeys = new Set()
    const activityRebases = new Map()
    for (const provider of observedProviders) {
      for (const value of batches[provider].nodes) {
        const seed = value.metadata?.partial && !nodeStore.has(value.key) && admission?.get(value.key)
        const member = seed ? { ...value, metadata: { ...seed.metadata, partial: true }, capabilities: seed.capabilities,
          standaloneEligible: seed.standaloneEligible } : value
        const incoming = normalizeEvidenceNode(
          member,
          provider,
          enabledProviders,
          incomingLaneGenerations[provider].activity,
          hostEvidence && ['host-evidence', 'host-preflight'].includes(producer)
        )
        if (!incoming || incomingKeys.has(incoming.key)) continue
        const existing = nodeStore.get(incoming.key)
        if (existing && existing.provider !== incoming.provider) continue
        if (hostEvidence && ['host-evidence', 'host-preflight'].includes(producer) && provider === 'codex' && incoming.role === 'child') {
          if (typeof value.metadata?.closedMachineRun === 'boolean') incoming.closedMachineRun = value.metadata.closedMachineRun
          if (typeof value.metadata?.machineRunCoverageCurrent === 'boolean') {
            incoming.machineRunCoverageCurrent = value.metadata.machineRunCoverageCurrent
          }
          if (typeof value.metadata?.relationOnly === 'boolean') incoming.relationOnly = value.metadata.relationOnly
        }
        incomingKeys.add(incoming.key)
        incomingNodes.push(incoming)
        if (hostEvidence && producer === 'host-evidence' && provider === 'codex'
          && value.activityRebase && typeof value.activityRebase === 'object') {
          activityRebases.set(incoming.key, value.activityRebase)
        }
      }
    }
    const nextNodeStore = new Map(nodeStore)
    for (const provider of observedProviders) {
      const batch = batches[provider]
      const membershipGeneration = incomingLaneGenerations[provider].membership
      const membershipCurrent = currentLaneGenerations[provider].membership
      const replaceMembership = enabledProviders.has(provider)
        && batch.channels.membership.mode === 'snapshot'
        && batch.channels.membership.complete
        && !staleMembershipProviders.has(provider)
        && (membershipGeneration > 0 || membershipCurrent === 0)
      if (replaceMembership) {
        for (const [key, task] of nextNodeStore) if (task.provider === provider) nextNodeStore.delete(key)
      }
      if (!staleMembershipProviders.has(provider)) {
        for (const key of batch.channels.membership.removedKeys) {
          const task = nextNodeStore.get(key)
          if (task?.provider !== provider) continue
          const removedFamily = task.role === 'root' ? task.family : ''
          nextNodeStore.delete(key)
          if (removedFamily) {
            for (const [candidateKey, candidate] of nextNodeStore) {
              if (candidate.provider === provider && candidate.family === removedFamily) nextNodeStore.delete(candidateKey)
            }
          }
        }
      }
    }
    for (const incoming of incomingNodes) {
      const tombstoneKey = `${incoming.provider}:${incoming.key}`
      const tombstone = archiveTombstones.get(tombstoneKey)
      if (tombstone) {
        const membershipRevision = Math.max(incoming.membershipRevision, incoming.visibilityRevision)
        if (membershipRevision <= tombstone.membershipRevision) continue
        archiveTombstones.delete(tombstoneKey)
      }
      const previous = nodeStore.get(incoming.key)
      // A partial lane observation may update an existing task, but it cannot
      // establish membership or public metadata on its own.
      if (!previous && incoming.metadataPartial === true && !admission?.has(incoming.key)) continue
      if (!previous && staleMembershipProviders.has(incoming.provider)) continue
      const reconciled = reconcileTask(
        previous,
        incoming,
        draft,
        incomingLaneGenerations,
        previous?.codexLaneGenerations
          ? { ...currentLaneGenerations, codex: { ...currentLaneGenerations.codex, ...previous.codexLaneGenerations } }
          : currentLaneGenerations,
        activityRebases.get(incoming.key)
      )
      if (hostEvidence && incoming.provider === 'codex') {
        const seen = previous?.codexLaneGenerations
        const lanes = incomingLaneGenerations.codex
        reconciled.task.codexLaneGenerations = {
          activity: Math.max(seen?.activity || 0, incoming.activityObserved ? lanes.activity : 0),
          unread: Math.max(seen?.unread || 0, incoming.unreadKnown ? lanes.unread : 0),
          planArtifact: Math.max(seen?.planArtifact || 0, incoming.planLifecycleState !== 'unknown' ? lanes.planArtifact : 0)
        }
      }
      nextNodeStore.set(incoming.key, reconciled.task)
      if (reconciled.activityAccepted || incoming.provider !== 'codex') activities.push(incoming)
      if (!incoming.metadataPartial) observedKeys.add(incoming.key)
    }
    const familySnapshots = new Map()
    for (const provider of observedProviders) {
      if (!enabledProviders.has(provider) || staleMembershipProviders.has(provider)) continue
      for (const value of batches[provider].nodes) {
        if (value?.role !== 'root' || value?.metadata?.topologyComplete !== true) continue
        const family = typeof value.family === 'string' && value.family
          ? value.family
          : `${value.provider}:${value.key}`
        familySnapshots.set(`${provider}:${family}`, new Set())
      }
    }
    for (const incoming of incomingNodes) {
      const present = familySnapshots.get(`${incoming.provider}:${incoming.family}`)
      if (present) present.add(incoming.key)
    }
    for (const [key, task] of nextNodeStore) {
      const present = familySnapshots.get(`${task.provider}:${task.family}`)
      if (!present || present.has(key)) continue
      nextNodeStore.delete(key)
    }
    const nextRelationStore = new Map(relationStore)
    const incomingRelations = observedProviders.flatMap((provider) => batches[provider].relations)
      .map(normalizeRelation)
      .filter(Boolean)
    for (const provider of observedProviders) {
      const batch = batches[provider]
      const topologyGeneration = incomingLaneGenerations[provider].topology
      const topologyCurrent = currentLaneGenerations[provider].topology
      const replaceRelations = enabledProviders.has(provider)
        && batch.relationMode === 'snapshot'
        && batch.relationsComplete
        && topologyGeneration >= topologyCurrent
      if (replaceRelations) {
        for (const [key, relation] of nextRelationStore) {
          if (relation.provider === provider) nextRelationStore.delete(key)
        }
      }
      if (enabledProviders.has(provider) && topologyGeneration >= topologyCurrent) {
        for (const childKey of batch.removedRelationChildKeys) {
          for (const [key, relation] of nextRelationStore) {
            if (relation.provider === provider && relation.childKey === childKey) nextRelationStore.delete(key)
          }
        }
      }
    }
    for (const relation of incomingRelations) {
      if (!enabledProviders.has(relation.provider)
        || relation.generation < currentLaneGenerations[relation.provider].topology) continue
      nextRelationStore.set(relationStoreKey(relation), relation)
    }
    for (const [key, relation] of nextRelationStore) {
      if (!nextNodeStore.has(relation.childKey) || !nextNodeStore.has(relation.parentKey)) {
        nextRelationStore.delete(key)
      }
    }
    nodeStore.clear()
    for (const [key, task] of nextNodeStore) nodeStore.set(key, task)
    relationStore.clear()
    for (const [key, relation] of nextRelationStore) relationStore.set(key, relation)
    reconcileInteractions(batches, incomingLaneGenerations, currentLaneGenerations, enabledProviders, activities)
    for (const provider of observedProviders) {
      for (const lane of SOURCE_LANES) {
        currentLaneGenerations[provider][lane] = Math.max(currentLaneGenerations[provider][lane], incomingLaneGenerations[provider][lane])
      }
    }
  }

  /** 吃证据的唯一入口：schema/revision 失败则整批丢掉，且不消耗 producer revision。 */
  function commitDraft(draft, hostEvidence = false, cacheProvider = '') {
    const freezeSpan = freezeTrace.begin('companion.commit-draft')
    try {
    if (disposed || !draft || draft.schema !== COMPANION_TASK_DRAFT_REVISION) return null
    const producer = draftProducer(draft.producer)
    const draftRevision = finiteInteger(draft.draftRevision)
    if (!draftRevision) return null
    const lastProducerRevision = lastDraftRevisionByProducer.get(producer) || 0
    if (draftRevision <= lastProducerRevision) return currentPackage
    const draftProviders = providerShape(draft.providers)
    const draftEnabled = draft.enabled === true
    const enabledProviders = providerSet(draftProviders)
    const batches = Object.fromEntries(PROVIDERS.map((provider) => [provider, normalizeEvidenceBatch(
      draft.evidenceBatches?.[provider],
      provider,
      draft,
      producer
    )]))
    // Validate the complete cross-Provider transaction before consuming its
    // producer revision or applying configuration. A corrected retry with the
    // same revision must remain admissible after an invalid batch.
    if (draftEnabled && PROVIDERS.some((provider) => enabledProviders.has(provider) && batches[provider].valid !== true)) {
      record({
        level: 'error',
        scope: 'task-kernel',
        event: 'provider-evidence-batch',
        outcome: 'rejected',
        code: 'invalid-batch',
        details: { producer }
      })
      return null
    }
    const pending = hostEvidence ? dependencies.preparePendingEvidence?.(draft) : null
    if (pending === false || hostEvidence && (!sameProviders(providers, draftProviders) || draftEnabled !== enabled)) return null
    const normalizePending = batch => normalizeEvidenceBatch(batch, 'codex', draft, 'host-evidence')
    const before = (pending?.before || []).map(normalizePending)
    const after = (pending?.after || []).map(normalizePending)
    if ([...before, ...after].some(batch => !batch.valid)) return null
    if (hostEvidence && producer === 'host-preflight') refreshPauseProtection()
    configure({ enabled: draft.enabled, providers: draftProviders })
    if (!enabled) return currentPackage
    if (!sameProviders(providers, draftProviders)) return null
    if (currentPackage.complete && draft.complete !== true && !cacheProvider) return currentPackage

    const lanes = normalizeSourceLaneGenerations(currentPackage.sourceLaneGenerations)
    const observedKeys = new Set()
    const previousPauseKeys = new Set([...pauseReceipts.keys()].filter(key => nodeStore.has(key)))
    const admission = before.length ? new Map(batches.codex.nodes.map(node => [node.key, node])) : null
    const reducePending = (batch, seed) => {
      const generations = Object.fromEntries(SOURCE_LANES.map(lane => [lane, batch.channels[lane].generation]))
      reduceEvidenceBatches({ producer: 'host-evidence' }, { codex: batch }, { codex: generations }, lanes,
        true, enabledProviders, observedKeys, seed)
    }
    for (const batch of before) reducePending(batch, admission)
    reduceEvidenceBatches(draft, batches, normalizeSourceLaneGenerations(draft.sourceLaneGenerations),
      lanes, hostEvidence, enabledProviders, observedKeys)
    for (const batch of after) reducePending(batch)

    for (const [key, receipt] of pauseReceipts) {
      const task = nodeStore.get(key)
      if (task ? task.planLifecycleRevision > receipt.planLifecycleRevision : previousPauseKeys.has(key)) {
        retirePauseReceipt(key, receipt.planLifecycleRevision)
      }
    }
    for (const key of observedKeys) {
      const task = nodeStore.get(key)
      if (task?.hidden && hasCurrentPlanArtifact(task)) nodeStore.set(key, migrateLegacyHiddenPlan(task))
    }
    for (const key of diagnosticActivitySignatures.keys()) if (!nodeStore.has(key)) diagnosticActivitySignatures.delete(key)
    for (const key of completeCodexRequestSets.keys()) if (!nodeStore.has(key)) completeCodexRequestSets.delete(key)
    for (const [key, request] of interactionStore) {
      if (request.provider === 'codex' && !nodeStore.has(request.taskKey)) interactionStore.delete(key)
    }
    if (interactionTombstonesChanged) {
      try { persistInteractionTombstones([...interactionTombstones.values()].slice(-2_000)) } catch {}
      interactionTombstonesChanged = false
    }
    refreshInteractionProjections()
    const materialized = materializePrivateTopology()
    let reorder = false
    if (cacheProvider) {
      const wasCached = providerCacheStates.get(cacheProvider) === 'cached'
      const cached = batches[cacheProvider].channels.membership.complete === true
      const recovering = currentPackage.providerHealth[cacheProvider]?.status !== 'ready'
        && draft.providerHealth?.[cacheProvider]?.status === 'ready'
      providerCacheStates.set(cacheProvider, wasCached || cached ? 'cached' : 'unavailable')
      reorder = cached && (!wasCached || recovering) || !currentPackage.complete && cacheComplete()
    }
    const nextTasks = materialized.tasks
    const freshness = materialized.freshness
    const nextTopologyRevision = materialized.topologyRevision
    const focusedKey = typeof draft.focusedKey === 'string' && nextTasks.some((task) => task.key === draft.focusedKey)
      ? draft.focusedKey
      : ''
    const next = {
      schema: COMPANION_TASK_PACKAGE_REVISION,
      kernelRevision: COMPANION_TASK_KERNEL_REVISION,
      registryRevision: providerRegistry.revision,
      topologySchemaRevision: COMPANION_TASK_TOPOLOGY_REVISION,
      commandRevision: COMPANION_TASK_COMMAND_REVISION,
      packageRevision: currentPackage.packageRevision,
      topologyRevision: nextTopologyRevision,
      sourceTaskStateRevision: typeof draft.sourceTaskStateRevision === 'string' ? draft.sourceTaskStateRevision : 'legacy',
      publishedAt: finiteInteger(draft.acceptedAt, now()),
      enabled,
      providers: { ...providers },
      complete: cacheProvider ? cacheComplete() : draft.complete === true,
      freshness,
      focusedKey,
      sourceGenerations: Object.fromEntries(PROVIDERS.map((provider) => [
        provider,
        Math.max(finiteInteger(currentPackage.sourceGenerations?.[provider]), finiteInteger(draft.sourceGenerations?.[provider]))
      ])),
      sourceLaneGenerations: lanes,
      providerHealth: Object.fromEntries(PROVIDERS.map((provider) => {
        const incoming = draft.providerHealth?.[provider]
        const previous = currentPackage.providerHealth?.[provider]
        const status = providers[provider] !== true
          ? 'disabled'
          : ['ready', 'unavailable', 'degraded'].includes(incoming?.status)
            ? incoming.status
            : previous?.status === 'ready' || previous?.status === 'degraded' || previous?.status === 'unavailable'
              ? previous.status
              : 'unavailable'
        return [provider, {
          status,
          generation: Math.max(finiteInteger(previous?.generation), finiteInteger(incoming?.generation)),
          errorCode: typeof incoming?.errorCode === 'string'
            ? incoming.errorCode.slice(0, 80)
            : typeof previous?.errorCode === 'string' ? previous.errorCode : ''
        }]
      })),
      tasks: nextTasks,
      views: buildViews(nextTasks)
    }
    lastDraftRevisionByProducer.set(producer, draftRevision)
    pending?.acknowledge()
    return publishTaskPackage(next, { evidenceDraft: draft, reorder })

    } finally {
      freezeTrace.end(freezeSpan)
    }
  }

  /** Group counts name the flood; per-task phase flips name the culprit. A
   * task oscillating running↔completed surfaces here as paired transitions
   * carrying its key and provider, which no aggregate counter can attribute. */
  function recordPhaseTransitionsOnChange(previousTasks, nextTasks, draft) {
    if (!Array.isArray(previousTasks)) return
    const previousByKey = new Map(previousTasks.map((task) => [task.key, task]))
    const batchNodes = Object.fromEntries(PROVIDERS.map((provider) => [
      provider,
      Array.isArray(draft?.evidenceBatches?.[provider]?.nodes) ? draft.evidenceBatches[provider].nodes.length : 0
    ]))
    let overflow = 0
    let logged = 0
    for (const task of nextTasks) {
      const before = previousByKey.get(task.key)
      if (task.provider === 'codex' && (!before || before.phase !== task.phase
        || before.unread !== task.unread || before.dynamicGroup !== task.dynamicGroup)) {
        dependencies.diagnosticTaskPublish?.(task, currentPackage.packageRevision)
      }
      if (!before || before.phase === task.phase) continue
      if (logged >= 8) { overflow += 1; continue }
      logged += 1
      record({
        level: 'info',
        scope: 'task-kernel',
        event: 'phase-transition',
        outcome: task.phase,
        provider: task.provider,
        taskRef: task.key,
        packageRevision: currentPackage.packageRevision,
        details: {
          from: before.phase,
          provider: task.provider,
          unread: task.unread === true,
          freshness: task.freshness,
          phaseRevision: task.phaseRevision,
          prevPhaseRevision: before.phaseRevision,
          forced: false,
          producer: draftProducer(draft?.producer),
          batchNodes
        }
      })
    }
    if (overflow) {
      record({
        level: 'info',
        scope: 'task-kernel',
        event: 'phase-transition',
        outcome: 'overflow',
        count: overflow,
        packageRevision: currentPackage.packageRevision
      })
    }
  }

  /** Publishes are frequent; the visible group sizes are not. Logging only
   * their transitions gives an oscillating badge (e.g. completed-unread
   * jumping 1↔5↔25) a correlated timeline without flooding the file. */
  let lastGroupCountsLine = ''
  function recordGroupCountsOnChange(packageValue) {
    const groups = packageValue.views.groups
    const line = JSON.stringify({
      pinned: groups.pinned.length,
      input: groups.input.length,
      active: groups.active.length,
      stopped: groups.stopped.length,
      unread: groups.unread.length,
      completed: groups.completed.length,
      counts: packageValue.views.counts
    })
    if (line === lastGroupCountsLine) return
    lastGroupCountsLine = line
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'group-counts-changed',
      outcome: 'published',
      packageRevision: packageValue.packageRevision,
      count: groups.unread.length,
      details: JSON.parse(line)
    })
  }

  function attach(input = {}) {
    if (disposed) return { revision: COMPANION_TASK_KERNEL_REVISION, lease: 0, retained: false, ready: false, package: currentPackage }
    configure(input)
    activeLease = ++leaseSequence
    if (enabled && !currentPackage.complete) warmPendingProviders()
    return {
      revision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: COMPANION_TASK_PACKAGE_REVISION,
      registryRevision: providerRegistry.revision,
      topologyRevision: COMPANION_TASK_TOPOLOGY_REVISION,
      commandRevision: COMPANION_TASK_COMMAND_REVISION,
      subscribeRevision: COMPANION_TASK_SUBSCRIBE_REVISION,
      ackRevision: COMPANION_TASK_ACK_REVISION,
      lease: activeLease,
      retained: currentPackage.complete,
      ready: currentPackage.complete,
      package: currentPackage
    }
  }

  function configureConsumer(input = {}) {
    const freezeSpan = freezeTrace.begin('companion.configure-consumer')
    try {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease || disposed) return null
    configure(input)
    const focusedKey = typeof input.focusedKey === 'string'
      && currentPackage.tasks.some((task) => task.key === input.focusedKey)
      ? input.focusedKey
      : ''
    if (focusedKey !== currentPackage.focusedKey) {
      const next = {
        ...currentPackage,
        focusedKey
      }
      currentPackage = next
      // Focus is process-owned action context, not task classification. The
      // originating surface already owns its visual focus, so echoing it as a
      // new public task package creates a render/focus loop and alias races.
      // Keep it in the latest retained package for remounts and update Actions
      // synchronously, but do not advance revision or notify renderers.
      syncConsumers(next)
    }
    if (enabled && !currentPackage.complete) warmPendingProviders()
    return currentPackage

    } finally { freezeTrace.end(freezeSpan) }
  }

  /**
   * Ordinary hide/restore is EyPc-owned visibility, not a Provider mutation.
   * It therefore commits locally and immediately, exactly like the Plan pause
   * lane, instead of waiting for a verified live inventory read: gating it
   * behind `ensureReady`/cold preflight made every hide a silent no-op while
   * the Provider was not running, because only the cold preflight could turn
   * the persisted receipt into a canonical `hidden` value. The Renderer still
   * owns persistence, and the cold preflight recomputes the same flag from
   * that same receipt, so this never becomes a second source of truth.
   */
  function localStateTarget(input) {
    if (disposed || !Number.isInteger(input.lease) || input.lease !== activeLease) return null
    const task = taskForKey(typeof input.key === 'string' ? input.key : '')
    if (!task) return null
    const expectedRevision = finiteInteger(input.revisionAt)
    return expectedRevision && expectedRevision !== task.revisionAt ? null : task
  }

  function commitLocalTaskState(task, patch, reason) {
    const privateTask = nodeStore.get(task.key)
    if (privateTask) {
      nodeStore.set(task.key, finalizeCanonicalTask({ ...privateTask, ...patch }))
      return publishPrivateTopology(reason)
    }
    return publishLocalTasks(currentPackage.tasks.map((candidate) => candidate.key === task.key
      ? finalizeCanonicalTask({ ...candidate, ...patch })
      : candidate), reason)
  }

  function setVisibility(input = {}) {
    const task = localStateTarget(input)
    // A completed Plan owns the pause lane; its row control is pause/resume.
    if (!task || task.planReady) return null
    const hidden = input.hidden === true
    if (task.hidden === hidden) return currentPackage
    return commitLocalTaskState(task, { hidden }, hidden ? 'hidden' : 'restored')
  }

  /**
   * Local pin carries no Plan exclusion: a completed Plan row stays pinnable.
   * It only reorders EyPc rows and feeds the fallback cycle tier, so it uses
   * the same local commit rather than waiting for a Provider inventory read.
   */
  function setLocalPin(input = {}) {
    const task = localStateTarget(input)
    if (!task) return null
    const localPin = input.localPin === true
    if (task.localPin === localPin) return currentPackage
    return commitLocalTaskState(task, {
      localPin,
      kind: localPin ? 'local-pin' : providerTraits(task.provider).taskKind
    }, localPin ? 'pinned' : 'unpinned')
  }

  function syncPackage(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return null
    const startedAt = now()
    const beforeRevision = currentPackage.packageRevision
    const result = commitDraft(input.draft)
    const published = Boolean(result && currentPackage.packageRevision > beforeRevision)
    record({
      level: published ? 'info' : 'debug',
      scope: 'task-kernel',
      event: 'renderer-commit',
      outcome: !result ? 'rejected' : published ? 'published' : 'no-op',
      durationMs: now() - startedAt,
      slowMs: 50,
      count: result?.tasks?.length || 0,
      packageRevision: result?.packageRevision || currentPackage.packageRevision
    })
    return result
  }

  /** Host 证据提交；语义无变化则 packageRevision 不涨。 */
  function publishEvidence(draft, cache = {}) {
    const provider = cache.provider || ''
    if (provider && (providers[provider] !== true || cache.epoch !== providerEpochs[provider])) return null
    const startedAt = now()
    const beforeRevision = currentPackage.packageRevision
    const result = commitDraft(draft, true, provider)
    const published = Boolean(result && currentPackage.packageRevision > beforeRevision)
    record({
      level: published ? 'info' : 'debug',
      scope: 'task-kernel',
      event: 'host-commit',
      outcome: !result ? 'rejected' : published ? 'published' : 'no-op',
      durationMs: now() - startedAt,
      slowMs: 50,
      count: result?.tasks?.length || 0,
      packageRevision: result?.packageRevision || currentPackage.packageRevision
    })
    return result
  }

  function getActivityCheckpoint(key) {
    if (disposed || typeof key !== 'string') return null
    const task = nodeStore.get(key)
    if (!task || task.provider !== 'codex' || archiveTombstones.has(`codex:${key}`)) return null
    return {
      causalKey: task.causalKey,
      phaseRevision: task.phaseRevision,
      phase: task.activityPhase || task.phase,
      causalDomain: task.causalDomain
    }
  }

  function commitArchived(input = {}) {
    const startedAt = now()
    const provider = PROVIDERS.includes(input.provider) ? input.provider : ''
    const keys = [...new Set((Array.isArray(input.keys) ? input.keys : [input.key])
      .filter((key) => typeof key === 'string' && key))]
    if (input.verified !== true || !provider || !keys.length) return { outcome: 'failed', errorCode: 'invalid-archive-commit' }
    const requested = new Set(keys)
    const removed = currentPackage.tasks.filter((task) => task.provider === provider && requested.has(task.key))
    if (removed.some((task) => finiteInteger(task.topology?.liveCount) > 0)) {
      return { outcome: 'failed', errorCode: 'active-members', message: '仍有活动子任务，不能归档根任务' }
    }
    const topology = buildCompanionTaskTopology({
      nodes: [...nodeStore.values()],
      relations: [...relationStore.values()]
    })
    const privateRemovalKeys = new Set()
    for (const [key, task] of nodeStore) {
      const rootKey = topology.rootByKey[key] || key
      if (task.provider === provider && requested.has(rootKey)) privateRemovalKeys.add(key)
    }
    const terminalEpoch = finiteInteger(input.terminalEpoch)
    const tombstoneKeys = new Set([...keys, ...privateRemovalKeys])
    for (const key of tombstoneKeys) {
      const publicTask = removed.find((candidate) => candidate.key === key)
      const privateTask = nodeStore.get(key)
      for (const [interactionKey, interaction] of interactionStore) {
        if (interaction.provider === provider && interaction.taskKey === key) interactionStore.delete(interactionKey)
      }
      if (publicTask || privateTask) retirePauseReceipt(key, finiteInteger(publicTask?.planLifecycleRevision || privateTask?.planLifecycleRevision))
      archiveTombstones.set(`${provider}:${key}`, {
        membershipRevision: Math.max(
          finiteInteger(input.membershipRevision),
          terminalEpoch,
          finiteInteger(publicTask?.membershipRevision || privateTask?.membershipRevision),
          finiteInteger(publicTask?.visibilityRevision || privateTask?.visibilityRevision),
          finiteInteger(publicTask?.revisionAt || privateTask?.revisionAt)
        ),
        operationId: typeof input.operationId === 'string' ? input.operationId : ''
      })
    }
    if (!removed.length && !privateRemovalKeys.size) {
      record({
        level: 'debug',
        scope: 'task-kernel',
        event: 'archive-kernel-commit',
        outcome: 'no-op',
        provider,
        operationId: typeof input.operationId === 'string' ? input.operationId : undefined,
        count: 0,
        durationMs: now() - startedAt,
        packageRevision: currentPackage.packageRevision
      })
      return { outcome: 'archived', removedKeys: [], package: currentPackage }
    }
    for (const key of privateRemovalKeys) nodeStore.delete(key)
    for (const [key, relation] of relationStore) {
      if (privateRemovalKeys.has(relation.childKey) || privateRemovalKeys.has(relation.parentKey)) relationStore.delete(key)
    }
    const next = publishPrivateTopology('archive-kernel-commit')
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'archive-kernel-commit',
      outcome: 'archived',
      provider,
      operationId: typeof input.operationId === 'string' ? input.operationId : undefined,
      count: removed.length,
      durationMs: now() - startedAt,
      packageRevision: next.packageRevision,
      terminalAt: terminalEpoch
    })
    return { outcome: 'archived', removedKeys: removed.map((task) => task.key), package: next }
  }

  function detach(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return false
    activeLease = 0
    return true
  }

  function verifyingTaskCount(packageValue = currentPackage) {
    return packageValue.tasks.reduce((total, task) => total + (task.freshness === 'verifying' ? 1 : 0), 0)
  }

  function warmPendingProviders() {
    if (disposed || !enabled) return
    if (refreshProviders) {
      queueMicrotask(() => {
        if (disposed || !enabled) return
        const pending = PROVIDERS.filter((provider) => providers[provider]
          && !providerCacheStates.has(provider) && !isProviderCached(provider))
        if (!pending.length) return
        if (!currentPackage.enabled) {
          currentPackage = { ...currentPackage, enabled: true }
          lastSemantic = semanticPackage(currentPackage)
        }
        void refreshProviders(pending)
      })
    } else {
      void ensureReady().catch(() => undefined)
    }
  }

  async function ensureReady(targetKey = '', options = {}) {
    const startedAt = now()
    const action = typeof options.action === 'string' ? options.action : ''
    const exactTarget = targetKey ? taskForKey(targetKey) : null
    const exactReady = exactTarget?.freshness === 'fresh'
      && exactTarget.capabilities?.open === true
    if (targetKey && currentPackage.complete && exactReady) return currentPackage
    if (!targetKey && currentPackage.complete
      && (currentPackage.freshness === 'fresh' || options.allowVerifying === true)) return currentPackage
    if (!enabled) throw new Error('disabled')
    if (!preflight && !refreshProviders) throw new Error('preflight-unavailable')
    if (preflightInFlight) return preflightInFlight
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'ready-preflight',
      outcome: 'started',
      packageRevision: currentPackage.packageRevision,
      details: {
        action,
        exactTarget: Boolean(targetKey),
        reason: !currentPackage.complete ? 'incomplete' : targetKey ? 'exact-target-stale' : 'verifying',
        freshness: currentPackage.freshness,
        verifyingCount: verifyingTaskCount(),
        taskCount: currentPackage.tasks.length
      }
    })
    const progressTimer = setTimer(() => notify('正在读取最新任务状态…'), PREFLIGHT_PROGRESS_MS)
    let timeoutTimer = null
    const timeout = new Promise((_resolve, reject) => {
      timeoutTimer = setTimer(() => reject(new Error('preflight-timeout')), PREFLIGHT_TIMEOUT_MS)
    })
    const requestedProviders = currentPackage.complete && exactTarget
      ? [exactTarget.provider]
      : PROVIDERS.filter((provider) => providers[provider])
    const refresh = Promise.resolve().then(() => refreshProviders
      ? refreshProviders(requestedProviders)
      : preflight({ providers: { ...providers } }))
    const operation = Promise.race([refresh, timeout]).then((draft) => {
      const accepted = refreshProviders ? currentPackage : commitDraft(draft, true)
      if (!accepted?.complete) throw new Error('preflight-incomplete')
      record({
        level: 'info',
        scope: 'task-kernel',
        event: 'ready-preflight',
        outcome: 'accepted',
        durationMs: now() - startedAt,
        slowMs: PREFLIGHT_PROGRESS_MS,
        count: accepted.tasks.length,
        packageRevision: accepted.packageRevision,
        details: { action, freshness: accepted.freshness, verifyingCount: verifyingTaskCount(accepted) }
      })
      return accepted
    }).finally(() => {
      clearTimer(progressTimer)
      if (timeoutTimer) clearTimer(timeoutTimer)
      if (preflightInFlight === operation) preflightInFlight = null
    })
    preflightInFlight = operation
    return operation
  }

  function taskForKey(key) {
    return tasksByKey.get(key) || null
  }

  function ephemeralOpenTarget(key, actionAlias = '') {
    if (typeof key !== 'string' || !key || key.length > 256) return null
    if (pauseRecoveryPending && (!unavailablePauseKeys || unavailablePauseKeys.has(key) || protectedPauseGroupKeys.has(key))) return null
    const enabledProviders = providerSet(providers)
    const namespaced = PROVIDERS.find((id) => id !== 'codex' && key.startsWith(`${id}:`)) || ''
    const inferred = namespaced
      || (/^[a-f0-9]{32}$/i.test(key) || /^ct_/i.test(actionAlias) ? 'codex' : '')
      || (enabledProviders.size === 1 ? [...enabledProviders][0] : '')
    if (!inferred || !enabledProviders.has(inferred) || archiveTombstones.has(`${inferred}:${key}`)) return null
    return {
      key,
      provider: inferred,
      actionAlias: providerTraits(inferred).keyPrefixActionAlias && !actionAlias && key.startsWith(`${inferred}:`)
        ? key.slice(`${inferred}:`.length)
        : typeof actionAlias === 'string' ? actionAlias.slice(0, 256) : '',
      revisionAt: 1,
      phase: 'unknown',
      planReady: false,
      planLifecycleRevision: 0,
      paused: false,
      canArchive: false,
      canPause: false,
      canResume: false,
      canExecutePlan: false
    }
  }

  function dispatchAttention(kind, input) {
    if (!attentionWalks[kind].length) {
      record({
        level: 'info',
        scope: 'task-kernel',
        event: 'open-attention',
        outcome: 'no-task',
        operationId: typeof input.operationId === 'string' ? input.operationId : undefined,
        source: input.source || 'attention-shortcut',
        packageRevision: currentPackage.packageRevision,
        details: {
          kind,
          complete: currentPackage.complete,
          freshness: currentPackage.freshness,
          inputCount: currentPackage.views.attentionKeys.input.length,
          completedUnreadCount: currentPackage.views.attentionKeys.completedUnread.length,
          taskCount: currentPackage.tasks.length
        }
      })
      return { outcome: 'unavailable', errorCode: 'no-task', message: '当前没有符合条件的任务' }
    }
    let unseen = attentionWalks[kind].filter(({ instance }) => !attentionSeen[kind].has(instance))
    if (!unseen.length) {
      attentionSeen[kind].clear()
      attentionRounds[kind] += 1
      unseen = resetAttentionWalk(kind)
    }
    const pending = new Set([...pendingAttention].filter((receipt) => (
      receipt.kind === kind && receipt.round === attentionRounds[kind]
    )).map((receipt) => receipt.instance))
    const selected = unseen.find(({ instance }) => !pending.has(instance)) || unseen[0]
    const task = taskForKey(selected.key)
    const attention = captureAttention(kind, task)
    if (!attention) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务已变化，请重试' }
    pendingAttention.add(attention)
    return navigation.open({
      key: task.key,
      target: actionTargetForTask(task),
      attention,
      source: input.source || 'attention-shortcut',
      operationId: input.operationId
    }).finally(() => pendingAttention.delete(attention))
  }

  async function dispatchLegacyIntent(input = {}) {
    if (disposed || !enabled) return { outcome: 'unavailable', errorCode: 'disabled', message: '任务功能未启用' }
    const dispatchStartedAt = now()
    try {
      const targetKey = ['open', 'archive', 'pause', 'resume', 'execute-plan', 'continue-task'].includes(input.action)
        && typeof input.key === 'string'
        ? input.key
        : ''
      // Navigation commands consume one already-published immutable snapshot.
      // A previous/next/open operation must never trigger a Provider refresh
      // that also changes phase, unread or topology as a side effect.
      if (['archive', 'pause', 'resume', 'execute-plan', 'continue-task', 'archive-focused'].includes(input.action)) {
        await ensureReady(targetKey, {
          action: input.action
        })
      } else if (!currentPackage.complete && !currentPackage.tasks.length) {
        return { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '当前没有可用的缓存任务' }
      }
    } catch (error) {
      // This exit used to be invisible: the press was consumed, the shortcut
      // did nothing, and the diagnostics file carried no trace of why.
      const code = error instanceof Error && /^[a-z0-9-]{1,80}$/i.test(error.message) ? error.message : 'preflight-failed'
      record({
        level: 'error',
        scope: 'task-kernel',
        event: 'ready-preflight',
        outcome: 'failed',
        code,
        operationId: typeof input.operationId === 'string' ? input.operationId : undefined,
        source: typeof input.source === 'string' ? input.source : undefined,
        durationMs: now() - dispatchStartedAt,
        packageRevision: currentPackage.packageRevision,
        details: {
          action: typeof input.action === 'string' ? input.action : '',
          complete: currentPackage.complete,
          freshness: currentPackage.freshness,
          verifyingCount: verifyingTaskCount(),
          taskCount: currentPackage.tasks.length
        }
      })
      notify('任务状态预检失败，未使用不完整缓存')
      return { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '任务状态预检失败，请重试' }
    }
    if (input.action === 'cycle') return navigation.cycle(input.direction === -1 ? -1 : 1, {
      operationId: input.operationId,
      source: input.source || 'task-cycle'
    })
    if (input.action === 'open-attention') {
      return dispatchAttention(input.kind === 'completed-unread' ? 'completedUnread' : 'input', input)
    }
    // 打开：用当前 Snapshot 身份走 navigation.open，避免与 cycle 抢 Adapter。
    if (input.action === 'open') {
      const task = taskForKey(input.key)
      const cacheOnly = isShortcutSource(input.source)
      const target = task?.capabilities.open ? actionTargetForTask(task)
        : !task && !cacheOnly ? ephemeralOpenTarget(input.key) : null
      if (!target) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      const result = await navigation.open({
        key: target.key,
        target,
        trustedResolvedTarget: !task,
        cacheOnly,
        source: input.source || 'manual-row-open',
        operationId: input.operationId
      })
      return result
    }
    if (input.action === 'archive') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.archive) return { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已变化，当前不能归档' }
      const result = await actions.archive({
        key: task.key,
        revisionAt: finiteInteger(input.revisionAt),
        phase: typeof input.phase === 'string' ? input.phase : task.phase,
        source: typeof input.source === 'string' ? input.source : 'archive-button',
        operationId: input.operationId,
        confirmationRecorded: input.confirmationRecorded === true,
        target: actionTargetForTask(task)
      })
      if (result?.outcome === 'archived') {
        // Every Provider crosses the same verified commit gate. This removes
        // the root, all private members and every consumer selector in one
        // snapshot revision instead of leaving a Renderer-only shadow.
        const privateTask = nodeStore.get(task.key) || task
        commitArchived({
          provider: task.provider,
          key: task.key,
          verified: true,
          membershipRevision: Math.max(finiteInteger(privateTask.membershipRevision), task.revisionAt),
          terminalEpoch: Math.max(task.terminalAt, finiteInteger(privateTask.phaseRevision), task.revisionAt),
          operationId: result.operationId || input.operationId
        })
      }
      return result
    }
    if (input.action === 'pause' || input.action === 'resume') {
      const task = taskForKey(input.key)
      const expectedRevision = finiteInteger(input.planLifecycleRevision)
      const pausing = input.action === 'pause'
      const allowed = pausing ? task?.capabilities.pause : task?.capabilities.resume
      if (!task || !allowed || expectedRevision !== task.planLifecycleRevision) {
        return { outcome: 'failed', errorCode: 'state-changed', message: 'Plan 状态已变化，请刷新后重试' }
      }
      if (!writePauseReceipt(task, pausing)) {
        return { outcome: 'failed', errorCode: 'pause-persist-failed', message: 'Plan 暂停状态保存失败' }
      }
      commitLocalTaskState(task, { hidden: false, paused: pausing }, pausing ? 'paused' : 'resumed')
      return {
        outcome: pausing ? 'paused' : 'resumed',
        provider: task.provider,
        key: task.key,
        message: pausing ? 'Plan 已暂停并移入已隐藏区' : 'Plan 已恢复到待输入列表'
      }
    }
    if (input.action === 'continue-task') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.continueTask || task.phase !== 'stopped' || task.planReady
        || finiteInteger(input.revisionAt) !== task.revisionAt) {
        return { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已变化，当前不能继续' }
      }
      return actions.continueTask({
        key: task.key, revisionAt: task.revisionAt, source: input.source || 'continue-task-button',
        operationId: input.operationId, target: actionTargetForTask(task)
      })
    }
    if (input.action === 'execute-plan') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.executePlan || finiteInteger(input.planLifecycleRevision) !== task.planLifecycleRevision) {
        return { outcome: 'failed', errorCode: 'state-changed', message: 'Plan 状态已变化，当前不能执行' }
      }
      return actions.executePlan({
        key: task.key,
        planLifecycleRevision: task.planLifecycleRevision,
        source: input.source || 'execute-plan-button',
        operationId: input.operationId,
        target: actionTargetForTask(task)
      })
    }
    if (input.action === 'archive-focused') {
      const accepted = actions.shortcutArchive()
      return accepted
        ? { outcome: 'dispatched', message: '任务归档意图已处理' }
        : { outcome: 'unavailable', errorCode: 'no-task', message: '当前没有可归档的任务' }
    }
    return { outcome: 'unavailable', errorCode: 'unsupported', message: '未知任务操作' }
  }

  function commandOperationId(value) {
    return typeof value === 'string' && /^[a-z0-9:_-]{6,160}$/i.test(value) ? value : ''
  }

  function commandKey(command) {
    const key = typeof command?.selector?.key === 'string' ? command.selector.key : ''
    return key || (command?.command === 'cycle' ? '@cycle' : `@${command?.command || 'unknown'}`)
  }

  function commandIntent(command) {
    const selector = command.selector && typeof command.selector === 'object' ? command.selector : {}
    const payload = command.payload && typeof command.payload === 'object' ? command.payload : {}
    if (command.command === 'cycle') return {
      action: 'cycle',
      direction: selector.direction === -1 ? -1 : 1,
      source: command.source,
      operationId: command.operationId
    }
    if (command.command === 'open-attention') return {
      action: 'open-attention',
      kind: selector.attention === 'completed-unread' ? 'completed-unread' : 'input',
      source: command.source,
      operationId: command.operationId
    }
    if (command.command === 'open') return {
      action: 'open',
      key: selector.key,
      source: command.source,
      operationId: command.operationId
    }
    if (command.command === 'archive') return {
      action: 'archive',
      key: selector.key,
      revisionAt: finiteInteger(payload.revisionAt),
      phase: typeof payload.phase === 'string' ? payload.phase : '',
      source: command.source,
      operationId: command.operationId,
      confirmationRecorded: payload.confirmationRecorded === true
    }
    if (command.command === 'pause' || command.command === 'resume') return {
      action: command.command,
      key: selector.key,
      planLifecycleRevision: finiteInteger(payload.planLifecycleRevision),
      source: command.source,
      operationId: command.operationId
    }
    if (command.command === 'continue-task') return {
      action: 'continue-task', key: selector.key, revisionAt: finiteInteger(payload.revisionAt),
      source: command.source, operationId: command.operationId
    }
    if (command.command === 'execute-plan') return {
      action: 'execute-plan',
      key: selector.key,
      planLifecycleRevision: finiteInteger(payload.planLifecycleRevision),
      source: command.source,
      operationId: command.operationId
    }
    return null
  }

  async function executeCommand(command) {
    const expected = command.expectedRevision && typeof command.expectedRevision === 'object'
      ? command.expectedRevision
      : {}
    const expectedSnapshot = finiteInteger(expected.snapshot)
    const expectedTopology = finiteInteger(expected.topology)
    if (expectedSnapshot > currentPackage.packageRevision || expectedTopology > currentPackage.topologyRevision) {
      return { outcome: 'failed', errorCode: 'future-revision', message: '任务快照版本无效，请刷新后重试' }
    }
    const key = typeof command.selector?.key === 'string' ? command.selector.key : ''
    if (key && expectedTopology !== currentPackage.topologyRevision && !taskForKey(key)) {
      return { outcome: 'failed', errorCode: 'stale-target', message: '任务拓扑已变化，原任务不再存在' }
    }
    if (command.command === 'focus') {
      if (key && !taskForKey(key)) return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
      if (currentPackage.focusedKey !== key) {
        currentPackage = { ...currentPackage, focusedKey: key }
        syncConsumers(currentPackage)
      }
      return { outcome: 'focused', key }
    }
    if (command.command === 'set-visibility' || command.command === 'set-pin') {
      const task = taskForKey(key)
      if (!task) return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
      const value = command.command === 'set-visibility'
        ? command.payload?.hidden === true
        : command.payload?.pinned === true
      const patch = command.command === 'set-visibility'
        ? { hidden: value }
        : { localPin: value, kind: value ? 'local-pin' : providerTraits(task.provider).taskKind }
      commitLocalTaskState(task, patch, command.command)
      if (command.command === 'set-pin') {
        // A pin that "flashes and reverts" needs this acceptance mark to be
        // separable from a later evidence rebuild overwriting the value.
        record({
          level: 'info',
          scope: 'task-kernel',
          event: 'set-pin',
          outcome: value ? 'pinned' : 'unpinned',
          taskRef: key,
          source: command.source,
          packageRevision: currentPackage.packageRevision
        })
      }
      return { outcome: 'updated', key }
    }
    /**
     * Provider pin write. Codex / CodexHost still write and verify; Claude App
     * and Cursor do not grant `pin`, so this command returns unsupported and
     * EyPc keeps a local pin. Only a verified result patches `providerPin`.
     */
    if (command.command === 'set-provider-pin') {
      const task = taskForKey(key)
      if (!task) return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
      if (!task.capabilities.pin) return { outcome: 'failed', errorCode: 'unsupported', message: '该任务的来源不支持同步置顶' }
      const pinned = command.payload?.pinned === true
      if (task.providerPin === pinned) return { outcome: 'unchanged', key, providerPin: pinned }
      const result = await actions.setPin({
        key: task.key,
        pinned,
        source: command.source,
        operationId: command.operationId,
        target: actionTargetForTask(task)
      })
      if (result?.outcome === 'completed') {
        commitLocalTaskState(task, { providerPin: pinned }, 'set-provider-pin')
      }
      record({
        level: result?.outcome === 'completed' ? 'info' : 'warn',
        scope: 'task-kernel',
        event: 'set-provider-pin',
        outcome: result?.outcome === 'completed' ? (pinned ? 'pinned' : 'unpinned') : result?.outcome || 'failed',
        taskRef: key,
        source: command.source,
        ...(result?.errorCode ? { code: result.errorCode } : {}),
        packageRevision: currentPackage.packageRevision
      })
      return result?.outcome === 'completed'
        ? { outcome: 'updated', key, providerPin: pinned, ...(result.method ? { method: result.method } : {}) }
        : { outcome: result?.outcome || 'failed', key, ...(result?.errorCode ? { errorCode: result.errorCode } : {}), ...(result?.message ? { message: result.message } : {}) }
    }
    /**
     * The hand-set phase is a local preference that also participates in
     * derivation, so it persists first and only then patches the live task: a
     * rejected write must not leave a stand-in the next restart cannot restore.
     */
    if (command.command === 'set-manual-phase') {
      const task = taskForKey(key)
      if (!task) return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
      if (!applyPreference) return { outcome: 'failed', errorCode: 'preference-unavailable', message: '本地偏好能力不可用' }
      // Only an `unknown` row has a gap to fill; anything else already has real
      // evidence, and letting the user overwrite that would forge a status.
      if (task.phase !== 'unknown') {
        return { outcome: 'failed', errorCode: 'phase-known', message: '该任务已有真实状态，无需手动指定' }
      }
      const manualPhase = isManualTaskPhase(command.payload?.phase) ? command.payload.phase : ''
      try {
        const accepted = await applyPreference({
          command: command.command,
          key,
          payload: { phase: manualPhase },
          operationId: command.operationId
        })
        if (accepted === false) return { outcome: 'failed', errorCode: 'preference-rejected', message: '本地偏好未保存' }
        commitLocalTaskState(task, {
          manualPhase,
          manualPhaseSetAt: manualPhase ? now() : 0
        }, command.command)
        return { outcome: 'updated', key }
      } catch {
        return { outcome: 'failed', errorCode: 'preference-failed', message: '本地偏好保存失败' }
      }
    }
    if (command.command === 'set-alias' || command.command === 'set-collapse') {
      const task = taskForKey(key)
      if (!task) return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
      if (!applyPreference) return { outcome: 'failed', errorCode: 'preference-unavailable', message: '本地偏好能力不可用' }
      try {
        const accepted = await applyPreference({
          command: command.command,
          key,
          payload: command.payload || {},
          operationId: command.operationId
        })
        if (accepted === false) return { outcome: 'failed', errorCode: 'preference-rejected', message: '本地偏好未保存' }
        if (command.command === 'set-alias') {
          const privateTask = nodeStore.get(key)
          if (privateTask) {
            const alias = typeof command.payload?.alias === 'string' ? command.payload.alias.trim().slice(0, 120) : ''
            const originalTitle = privateTask.originalTitle
              || (privateTask.alias ? '' : privateTask.displayName)
              || task.originalTitle
              || task.displayName
              || ''
            nodeStore.set(key, finalizeCanonicalTask({
              ...privateTask,
              alias,
              originalTitle,
              displayName: alias || originalTitle
            }))
            publishPrivateTopology('set-alias')
          }
        }
        return { outcome: 'updated', key }
      } catch {
        return { outcome: 'failed', errorCode: 'preference-failed', message: '本地偏好保存失败' }
      }
    }
    if (command.command === 'archive' && command.payload?.focused === true) {
      return dispatchLegacyIntent({
        action: 'archive-focused',
        source: command.source,
        operationId: command.operationId
      })
    }
    const intent = commandIntent(command)
    return intent
      ? dispatchLegacyIntent(intent)
      : { outcome: 'unavailable', errorCode: 'unsupported', message: '未知任务命令' }
  }

  /** 点开一条任务的命令闸门：revision 必须匹配，同 key 串行，operationId 去重。 */
  function dispatchCommand(input = {}) {
    if (!input || input.revision !== COMPANION_TASK_COMMAND_REVISION) {
      return Promise.resolve({ outcome: 'unavailable', errorCode: 'reload-required', message: '任务命令版本不兼容，需要重新接入或重载' })
    }
    const operationId = commandOperationId(input.operationId)
    if (!operationId) return Promise.resolve({ outcome: 'failed', errorCode: 'invalid-operation-id', message: '任务操作身份无效' })
    if (commandResults.has(operationId)) return commandResults.get(operationId)
    const command = {
      revision: COMPANION_TASK_COMMAND_REVISION,
      operationId,
      command: typeof input.command === 'string' ? input.command : '',
      selector: input.selector && typeof input.selector === 'object' ? { ...input.selector } : {},
      source: typeof input.source === 'string' ? input.source.slice(0, 80) : 'unknown',
      expectedRevision: input.expectedRevision && typeof input.expectedRevision === 'object'
        ? { ...input.expectedRevision }
        : { snapshot: currentPackage.packageRevision, topology: currentPackage.topologyRevision },
      payload: input.payload && typeof input.payload === 'object' ? { ...input.payload } : {}
    }
    const key = commandKey(command)
    // Navigation owns cycle selection/coalescing as well as the single open
    // lane. Queuing cycle commands here until each open finishes would turn
    // a burst into one native open per press before Navigation can merge it.
    const serialize = command.command !== 'cycle' && command.command !== 'open-attention'
      && !(command.command === 'open' && isShortcutSource(command.source))
    const previous = (serialize && commandQueues.get(key)) || Promise.resolve()
    const operation = serialize ? previous.catch(() => undefined).then(() => executeCommand(command)) : executeCommand(command)
    if (serialize) commandQueues.set(key, operation)
    commandResults.set(operationId, operation)
    if (commandResults.size > 500) commandResults.delete(commandResults.keys().next().value)
    void operation.finally(() => {
      if (commandQueues.get(key) === operation) commandQueues.delete(key)
    }).catch(() => undefined)
    return operation
  }

  function dispatch(input = {}) {
    const action = typeof input.action === 'string' ? input.action : ''
    const command = action === 'archive-focused' ? 'archive' : action
    const selector = action === 'cycle'
      ? { direction: input.direction === -1 ? -1 : 1 }
      : action === 'open-attention'
        ? { attention: input.kind === 'completed-unread' ? 'completed-unread' : 'input' }
        : { key: typeof input.key === 'string' ? input.key : '' }
    return dispatchCommand({
      revision: COMPANION_TASK_COMMAND_REVISION,
      operationId: commandOperationId(input.operationId) || `legacy_${now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      command,
      selector,
      source: input.source || 'legacy-bridge',
      expectedRevision: { snapshot: currentPackage.packageRevision, topology: currentPackage.topologyRevision },
      payload: { ...input, ...(action === 'archive-focused' ? { focused: true } : {}) }
    })
  }

  function handleEnter(action) {
    const code = action && typeof action.code === 'string' ? action.code : ''
    if (!enabled || ![
      'eypc-codex-task-previous',
      'eypc-codex-task-next',
      'eypc-codex-input',
      'eypc-codex-completed-unread',
      'eypc-companion-archive'
    ].includes(code)) return false
    const intent = code === 'eypc-codex-task-previous'
      ? { action: 'cycle', direction: -1, source: 'global-shortcut' }
      : code === 'eypc-codex-task-next'
        ? { action: 'cycle', direction: 1, source: 'global-shortcut' }
        : code === 'eypc-codex-completed-unread'
          ? { action: 'open-attention', kind: 'completed-unread', source: 'global-shortcut' }
          : code === 'eypc-companion-archive'
            ? { action: 'archive-focused', source: 'archive-shortcut' }
            : { action: 'open-attention', kind: 'input', source: 'global-shortcut' }
    intent.operationId = `shortcut_${now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    // The feature code is the only way a log reader can tell which silent
    // uTools entry was pressed; it is a fixed plugin identifier, never content.
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'shortcut-enter',
      outcome: intent.action,
      operationId: intent.operationId,
      source: intent.source,
      packageRevision: currentPackage.packageRevision,
      details: {
        featureCode: code,
        complete: currentPackage.complete,
        freshness: currentPackage.freshness,
        cycleCount: currentPackage.views.cycleKeys.length,
        inputCount: currentPackage.views.attentionKeys.input.length,
        completedUnreadCount: currentPackage.views.attentionKeys.completedUnread.length
      }
    })
    const reportFailure = (errorCode) => record({
      level: errorCode === 'no-task' ? 'info' : 'error',
      scope: 'task-kernel',
      event: 'shortcut-enter',
      outcome: 'failed',
      operationId: intent.operationId,
      code: errorCode,
      source: intent.source,
      packageRevision: currentPackage.packageRevision,
      details: { featureCode: code, action: intent.action }
    })
    void dispatch(intent).then((result) => {
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched' || result?.errorCode === 'superseded') return
      reportFailure(typeof result?.errorCode === 'string' && result.errorCode ? result.errorCode : 'failed')
      if (result?.errorCode === 'inventory-not-ready' && intent.action !== 'archive-focused') return
      notify(result?.message || '任务切换失败，请重试')
    }).catch(() => {
      reportFailure('exception')
      notify('任务切换失败，请重试')
    })
    return true
  }

  function subscribe(afterRevision, listener) {
    if (typeof listener !== 'function') return () => {}
    let cursor = finiteInteger(afterRevision)
    const wrapped = (value) => {
      if (value.packageRevision <= cursor) return
      cursor = value.packageRevision
      listener(value)
    }
    packageListeners.add(wrapped)
    wrapped(currentPackage)
    return () => packageListeners.delete(wrapped)
  }

  function acknowledge(input = {}) {
    const consumer = typeof input.consumer === 'string' && /^[a-z0-9:_-]{2,80}$/i.test(input.consumer)
      ? input.consumer
      : ''
    const revision = finiteInteger(input.revision)
    if (!consumer || !revision || revision > currentPackage.packageRevision) return false
    const previous = finiteInteger(consumerAcknowledgements.get(consumer))
    if (revision < previous) return false
    consumerAcknowledgements.set(consumer, revision)
    return true
  }

  function onPackage(listener) {
    if (typeof listener !== 'function') return () => {}
    packageListeners.add(listener)
    listener(currentPackage)
    return () => packageListeners.delete(listener)
  }

  function takeResults(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return []
    return navigation.takeResults({ lease: navigationLease })
  }

  function diagnostics() {
    return {
      revision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: COMPANION_TASK_PACKAGE_REVISION,
      enabled,
      ready: currentPackage.complete,
      packageGeneration: currentPackage.packageRevision,
      taskCount: currentPackage.tasks.length,
      cycleCount: currentPackage.views.cycleKeys.length,
      topologyRevision: currentPackage.topologyRevision,
      providerHealth: currentPackage.providerHealth,
      providerCache: Object.fromEntries(PROVIDERS.map((provider) => [provider, !enabled || !providers[provider]
        ? 'disabled'
        : providerCacheStates.get(provider) || 'warming'])),
      consumerAcknowledgements: Object.fromEntries(consumerAcknowledgements),
      preflightInFlight: Boolean(preflightInFlight),
      openInteractionCount: interactionStore.size,
      interactionTombstoneCount: interactionTombstones.size,
      nextVisibilityTransitionAt,
      freshness: currentPackage.freshness,
      navigation: navigation.diagnostics(),
      actions: actions.diagnostics()
    }
  }

  function close() {
    if (disposed) return
    disposed = true
    shortcutReads.clear()
    shortcutReadInputs.clear()
    clearVisibilityTimer()
    packageListeners.clear()
    diagnosticActivitySignatures.clear()
    commandResults.clear()
    commandQueues.clear()
    consumerAcknowledgements.clear()
    try { persistInteractionTombstones([...interactionTombstones.values()].slice(-2_000), { flush: true }) } catch {}
    actions.close()
    navigation.dispose()
  }

  return {
    revision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: COMPANION_TASK_PACKAGE_REVISION,
    registryRevision: providerRegistry.revision,
    topologyRevision: COMPANION_TASK_TOPOLOGY_REVISION,
    commandRevision: COMPANION_TASK_COMMAND_REVISION,
    subscribeRevision: COMPANION_TASK_SUBSCRIBE_REVISION,
    ackRevision: COMPANION_TASK_ACK_REVISION,
    attach,
    configure: configureConsumer,
    /** Renderer-owned local visibility/pin; neither reaches the Provider. */
    setVisibility,
    setLocalPin,
    syncPackage,
    /** Host-only provider evidence path; never exposed as a Renderer authority. */
    publishEvidence,
    warmPendingProviders,
    invalidateProvider,
    providerEpoch: (provider) => disposed ? undefined : providerEpochs[provider],
    isProviderCached,
    getActivityCheckpoint,
    /** Only a verified Provider archive transaction may call this commit gate. */
    commitArchived,
    detach,
    dispatchCommand,
    dispatch,
    handleEnter,
    getLatest: () => currentPackage,
    subscribe,
    acknowledge,
    /** @deprecated V3 compatibility aliases. */
    getPackage: () => currentPackage,
    onPackage,
    onResult: navigation.onResult,
    takeResults,
    diagnostics,
    close
  }
}

module.exports = {
  COMPANION_V7_REVISIONS,
  COMPANION_EVIDENCE_CHANNELS_V7,
  COMPANION_TASK_KERNEL_REVISION,
  TASK_PHASES,
  isKnownTaskPhase,
  isManualTaskPhase,
  isSettledTaskPhase,
  COMPANION_TASK_PACKAGE_REVISION,
  COMPANION_TASK_COMMAND_REVISION,
  COMPANION_TASK_SUBSCRIBE_REVISION,
  COMPANION_TASK_ACK_REVISION,
  PREFLIGHT_PROGRESS_MS,
  PREFLIGHT_TIMEOUT_MS,
  PROVIDERS,
  TASK_KINDS: [...TASK_KINDS],
  PROVIDER_TRAITS,
  createCompanionHostRegistry,
  createCompanionTaskKernel
}
