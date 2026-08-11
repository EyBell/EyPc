'use strict'

const { createCompanionNavigation } = require('./navigation.cjs')
const { createCompanionTaskActions } = require('./task-actions.cjs')

const COMPANION_TASK_KERNEL_REVISION = 'companion-task-kernel-v3'
const COMPANION_TASK_PACKAGE_REVISION = 'companion-task-package-v3'
const COMPANION_TASK_DRAFT_REVISION = 'companion-task-draft-v3'
const PREFLIGHT_PROGRESS_MS = 600
const PREFLIGHT_TIMEOUT_MS = 5_000
const UNKNOWN_GRACE_MS = 250
const PROVIDERS = ['codex', 'claude']
const PHASES = ['running', 'waiting-input', 'waiting-approval', 'completed', 'stopped', 'unknown']
const TIERS = ['attention', 'plan-implementation', 'active', 'fallback', 'none']
const GROUPS = ['input', 'active', 'stopped', 'unread', 'completed', 'none']
const DRAFT_PRODUCERS = ['renderer', 'host-preflight', 'host-evidence']
const SOURCE_LANES = ['membership', 'phase', 'unread']

/**
 * The only Codex phase reducer. Provider adapters supply causal evidence;
 * callers may preserve a prior stable phase while an interrupted/failed edge
 * is being verified, but must not reinterpret the result.
 */
function reduceCodexTaskEvidenceV3(value = {}) {
  const flags = Array.isArray(value.activeFlags) ? value.activeFlags : []
  const waitingApproval = flags.includes('waitingOnApproval')
  const waitingInput = flags.includes('waitingOnUserInput')
  const liveActive = value.status === 'active' && (
    value.statusAuthority === 'desktop-live'
    || value.statusAuthority === 'app-server-live'
    || value.statusAuthority === 'persisted-decision'
    || value.planImplementationOnly === true
  )
  const exactTerminal = ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(value.lastTurnEvidence)
  const activeSequence = finiteInteger(value.activeEvidenceSequence)
  const terminalSequence = finiteInteger(value.terminalEvidenceSequence)
  const terminalCurrent = exactTerminal && (!activeSequence || !terminalSequence || terminalSequence >= activeSequence)
  const activeCurrent = liveActive && (!terminalCurrent || activeSequence > terminalSequence)
  const waitingCurrent = liveActive && (waitingApproval || waitingInput)
    && (!activeSequence || !terminalSequence || activeSequence >= terminalSequence)
  const prior = PHASES.includes(value.previousPhase) ? value.previousPhase : 'running'
  const details = {
    providerStatus: value.status,
    statusAuthority: value.statusAuthority,
    lastTurnStatus: value.lastTurnStatus,
    lastTurnEvidence: value.lastTurnEvidence,
    activeFlags: flags,
    liveActive,
    exactTerminal,
    activeEvidenceSequence: activeSequence,
    terminalEvidenceSequence: terminalSequence,
    terminalCurrent,
    activeCurrent,
    waitingCurrent,
    planImplementationOnly: value.planImplementationOnly === true,
    hasUnreadTurn: value.hasUnreadTurn === true,
    activityRevision: finiteInteger(value.activityRevision),
    waitingSince: finiteInteger(value.waitingSince),
    lastTurnStartedAt: finiteInteger(value.lastTurnStartedAt),
    lastTurnCompletedAt: finiteInteger(value.lastTurnCompletedAt),
    updatedAt: finiteInteger(value.updatedAt)
  }
  const decide = (phase, reason, freshness = 'fresh') => ({ phase, reason, freshness, details })

  if (waitingCurrent && waitingApproval) return decide('waiting-approval', 'causal-waiting-approval')
  if (waitingCurrent && waitingInput) return decide('waiting-input', 'causal-waiting-input')
  if (activeCurrent || (value.lastTurnStatus === 'inProgress' && !terminalCurrent)) return decide('running', 'causal-active')
  if (value.lastTurnStatus === 'completed' && (!liveActive || terminalCurrent)) return decide('completed', terminalCurrent ? 'exact-completed' : 'completed-inventory')
  if (value.lastTurnStatus === 'interrupted' && terminalCurrent) return decide('stopped', 'exact-interrupted')
  if ((value.lastTurnStatus === 'interrupted' || value.lastTurnStatus === 'failed')
    && value.statusAuthority === 'desktop-live' && value.status === 'idle') return decide('stopped', 'desktop-idle-terminal')
  if (value.lastTurnStatus === 'interrupted' || value.lastTurnStatus === 'failed' || value.status === 'systemError') {
    return decide(prior, 'terminal-verifying', 'verifying')
  }
  return decide(prior === 'unknown' ? 'unknown' : prior, 'insufficient-evidence', 'verifying')
}

function providerSet(value) {
  if (Array.isArray(value)) return new Set(value.filter((provider) => PROVIDERS.includes(provider)))
  if (!value || typeof value !== 'object') return new Set()
  return new Set(PROVIDERS.filter((provider) => value[provider] === true))
}

function providerShape(value) {
  const providers = providerSet(value)
  return { codex: providers.has('codex'), claude: providers.has('claude') }
}

function sameProviders(left, right) {
  return PROVIDERS.every((provider) => left[provider] === right[provider])
}

function finiteInteger(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback
}

function draftProducer(value) {
  return DRAFT_PRODUCERS.includes(value) ? value : 'renderer'
}

function emptySourceLaneGenerations() {
  return {
    codex: { membership: 0, phase: 0, unread: 0 },
    claude: { membership: 0, phase: 0, unread: 0 }
  }
}

function normalizeSourceLaneGenerations(value, aggregate = {}) {
  const result = emptySourceLaneGenerations()
  for (const provider of PROVIDERS) {
    const fallback = finiteInteger(aggregate?.[provider])
    for (const lane of SOURCE_LANES) result[provider][lane] = finiteInteger(value?.[provider]?.[lane], fallback)
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
  const evidence = value.evidence === 'completed' || value.evidence === 'stopped' ? value.evidence : ''
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
  const kind = value.kind === 'claude-session' || value.kind === 'codex-thread' || value.kind === 'local-pin' ? value.kind : ''
  const phase = PHASES.includes(value.phase) ? value.phase : 'unknown'
  const cycleTier = TIERS.includes(value.cycleTier) ? value.cycleTier : 'none'
  const dynamicGroup = GROUPS.includes(value.dynamicGroup) ? value.dynamicGroup : 'none'
  const actionAlias = typeof value.actionAlias === 'string' ? value.actionAlias : ''
  const revisionAt = finiteInteger(value.revisionAt)
  if (!provider || !enabledProviders.has(provider) || !key || key.length > 256 || !kind || !revisionAt) return null
  const capabilities = value.capabilities && typeof value.capabilities === 'object' ? value.capabilities : {}
  const archiveRequest = normalizeArchiveRequest(value.archiveRequest)
  return {
    key,
    provider,
    kind,
    phase,
    cycleTier,
    dynamicGroup,
    actionAlias: actionAlias.slice(0, 256),
    revisionAt,
    semanticRevision: finiteInteger(value.semanticRevision, 1),
    observationGeneration: finiteInteger(value.observationGeneration),
    membershipRevision: finiteInteger(value.membershipRevision, revisionAt),
    phaseRevision: finiteInteger(value.phaseRevision, finiteInteger(value.statusEnteredAt, revisionAt)),
    unreadRevision: finiteInteger(value.unreadRevision, revisionAt),
    visibilityRevision: finiteInteger(value.visibilityRevision, revisionAt),
    statusEnteredAt: finiteInteger(value.statusEnteredAt, revisionAt),
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
    localPin: value.localPin === true,
    dynamicEligible: value.dynamicEligible === true,
    capabilities: {
      open: capabilities.open === true && Boolean(actionAlias),
      archive: capabilities.archive === true
    },
    ...(typeof value.displayName === 'string' ? { displayName: value.displayName.slice(0, 240) } : {}),
    ...(typeof value.projectKey === 'string' ? { projectKey: value.projectKey.slice(0, 256) } : {}),
    ...(typeof value.projectName === 'string' ? { projectName: value.projectName.slice(0, 240) } : {}),
    ...(value.projectKind === 'project' || value.projectKind === 'chats' ? { projectKind: value.projectKind } : {}),
    ...(archiveRequest ? { archiveRequest } : {})
  }
}

function targetFromTask(task) {
  return {
    key: task.key,
    provider: task.provider,
    actionAlias: task.actionAlias,
    revisionAt: task.revisionAt,
    phase: task.phase,
    canArchive: task.capabilities.archive,
    ...(task.archiveRequest ? { archiveRequest: task.archiveRequest } : {})
  }
}

function emptyViews() {
  return {
    groups: { input: [], active: [], stopped: [], unread: [], completed: [] },
    counts: { input: 0, active: 0, unread: 0 },
    cycleKeys: [],
    attentionKeys: { input: [], completedUnread: [], archive: [] }
  }
}

function emptyPackage(providers = { codex: true, claude: false }) {
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: 0,
    sourceTaskStateRevision: 'legacy',
    publishedAt: 0,
    enabled: false,
    providers: { ...providers },
    complete: false,
    freshness: 'verifying',
    focusedKey: '',
    sourceGenerations: { codex: 0, claude: 0 },
    sourceLaneGenerations: emptySourceLaneGenerations(),
    tasks: [],
    views: emptyViews()
  }
}

function compareByLatestQuestion(left, right) {
  return right.lastQuestionAt - left.lastQuestionAt
    || right.createdAt - left.createdAt
    || left.key.localeCompare(right.key)
}

function derivedCycleTier(task) {
  if (task.hidden) return 'none'
  if (task.phase === 'waiting-input' || task.phase === 'waiting-approval') {
    return task.planImplementation ? 'plan-implementation' : 'attention'
  }
  if (task.phase === 'running') return 'active'
  if (task.phase === 'unknown' && task.provider === 'codex') return 'active'
  if (task.localPin && task.phase !== 'stopped') return 'fallback'
  return 'none'
}

function derivedDynamicGroup(task) {
  if (task.hidden || !task.dynamicEligible) return 'none'
  if (task.phase === 'waiting-input' || task.phase === 'waiting-approval') return 'input'
  if (task.phase === 'running') return 'active'
  if (task.phase === 'unknown') return task.provider === 'claude' ? 'stopped' : 'active'
  if (task.phase === 'stopped') return 'stopped'
  if (task.phase === 'completed') return task.unread ? 'unread' : 'completed'
  return 'none'
}

function finalizeTask(task) {
  const revisionAt = finiteInteger(task.revisionAt)
  const next = { ...task, revisionAt }
  next.cycleTier = derivedCycleTier(next)
  next.dynamicGroup = derivedDynamicGroup(next)
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
    actionAlias: task.actionAlias,
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
    localPin: task.localPin,
    dynamicEligible: task.dynamicEligible,
    capabilityToken: task.capabilityToken,
    capabilities: task.capabilities,
    archiveRequest: task.archiveRequest,
    displayName: task.displayName,
    projectKey: task.projectKey,
    projectName: task.projectName,
    projectKind: task.projectKind
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
  const visible = tasks.filter((task) => !task.hidden)
  const display = [...visible].sort(compareByLatestQuestion)
  for (const task of display) {
    if (task.dynamicEligible && task.dynamicGroup !== 'none') views.groups[task.dynamicGroup].push(task.key)
  }
  views.counts.input = tasks.filter((task) => task.phase === 'waiting-input' || task.phase === 'waiting-approval').length
  views.counts.active = views.groups.active.length
  views.counts.unread = tasks.filter((task) => task.phase === 'completed' && task.unread).length

  const cycleCandidates = [...visible]
    .filter((task) => task.capabilities.open && task.cycleTier !== 'none')
    .sort(compareByLatestQuestion)
  for (const tier of ['attention', 'plan-implementation', 'active', 'fallback']) {
    const keys = cycleCandidates.filter((task) => task.cycleTier === tier).map((task) => task.key)
    if (keys.length) {
      views.cycleKeys = keys
      break
    }
  }

  const attention = [...visible].sort(compareByLatestQuestion)
  views.attentionKeys.input = attention
    .filter((task) => task.capabilities.open && (task.phase === 'waiting-input' || task.phase === 'waiting-approval'))
    .map((task) => task.key)
  views.attentionKeys.completedUnread = attention
    .filter((task) => task.capabilities.open && task.phase === 'completed' && task.unread)
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
    focusedKey: packageValue.focusedKey,
    tasks: packageValue.tasks.map(semanticTask),
    views: packageValue.views
  })
}

function createCompanionTaskKernel(dependencies = {}) {
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : setTimeout
  const clearTimer = typeof dependencies.clearTimeout === 'function' ? dependencies.clearTimeout : clearTimeout
  const notify = typeof dependencies.notify === 'function' ? dependencies.notify : () => {}
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const preflight = typeof dependencies.preflight === 'function' ? dependencies.preflight : null
  const initial = dependencies.initialConfiguration && typeof dependencies.initialConfiguration === 'object'
    ? dependencies.initialConfiguration
    : {}
  let enabled = initial.enabled === true
  let providers = providerShape(initial.providers || { codex: true, claude: false })
  let activeLease = 0
  let leaseSequence = 0
  let packageSequence = 0
  let currentPackage = emptyPackage(providers)
  let lastDraft = null
  const lastDraftRevisionByProducer = new Map()
  let lastSemantic = semanticPackage(currentPackage)
  let disposed = false
  let preflightInFlight = null
  let unknownTimer = null
  const unknownEvidence = new Map()
  const archiveTombstones = new Map()
  const packageListeners = new Set()

  const actions = createCompanionTaskActions({
    adapters: dependencies.adapters,
    notify,
    now,
    record
  })
  const navigation = createCompanionNavigation({
    coalesceMs: dependencies.coalesceMs,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    queueMicrotask: dependencies.queueMicrotask,
    record,
    openCodex: (target, request) => actions.open({ key: target.key, target, source: request?.source || 'task-cycle', operationId: request?.operationId }),
    openClaude: (target, request) => actions.open({ key: target.key, target, source: request?.source || 'task-cycle', operationId: request?.operationId })
  })
  let navigationLease = 0

  function beginNavigation() {
    const receipt = navigation.begin({ enabled, providers })
    navigationLease = receipt.lease
  }

  beginNavigation()

  function clearUnknownTimer() {
    if (unknownTimer) clearTimer(unknownTimer)
    unknownTimer = null
  }

  function emitPackage(packageValue) {
    for (const listener of packageListeners) {
      try { listener(packageValue) } catch {}
    }
  }

  function invalidate(reason) {
    clearUnknownTimer()
    unknownEvidence.clear()
    lastDraftRevisionByProducer.clear()
    lastDraft = null
    const next = emptyPackage(providers)
    next.enabled = enabled
    next.publishedAt = now()
    next.packageRevision = ++packageSequence
    currentPackage = next
    lastSemantic = semanticPackage(next)
    actions.sync({ enabled, ready: false, providers, targets: [] })
    navigation.sync({ lease: navigationLease, enabled, providers, ready: false, targets: [], cycleKeys: [] })
    emitPackage(currentPackage)
    return reason
  }

  function configure(input = {}) {
    const nextEnabled = input.enabled === true
    const nextProviders = providerShape(input.providers || providers)
    const changed = enabled !== nextEnabled || !sameProviders(providers, nextProviders)
    enabled = nextEnabled
    providers = nextProviders
    if (changed) {
      beginNavigation()
      invalidate(enabled ? 'provider-configuration-changed' : 'disabled')
    }
    return changed
  }

  function reconcileTask(previous, incoming, draft, forceUnknown, incomingLanes, currentLanes) {
    if (!previous) {
      if (incoming.phase !== 'unknown') unknownEvidence.delete(incoming.key)
      const next = finalizeTask(incoming)
      if (incoming.phase === 'unknown') next.freshness = 'verifying'
      return { ...assignSemanticRevision(null, next), verifying: next.freshness === 'verifying' }
    }

    const provider = incoming.provider
    const membershipAdvanced = incomingLanes[provider].membership > currentLanes[provider].membership
    const phaseAdvanced = incomingLanes[provider].phase > currentLanes[provider].phase
    const unreadAdvanced = incomingLanes[provider].unread > currentLanes[provider].unread
    const acceptMembership = laneIsNewer(
      incomingLanes[provider].membership,
      currentLanes[provider].membership,
      Math.max(incoming.membershipRevision, incoming.visibilityRevision),
      Math.max(previous.membershipRevision, previous.visibilityRevision)
    )
    let acceptPhase = forceUnknown || laneIsNewer(
      incomingLanes[provider].phase,
      currentLanes[provider].phase,
      incoming.phaseRevision,
      previous.phaseRevision
    )
    let acceptUnread = laneIsNewer(
      incomingLanes[provider].unread,
      currentLanes[provider].unread,
      incoming.unreadRevision,
      previous.unreadRevision
    )

    if (acceptPhase && !phaseAdvanced
      && (previous.phase === 'completed' || previous.phase === 'stopped')
      && incoming.phase === 'running'
      && incoming.phaseRevision === previous.phaseRevision
      && incoming.statusEnteredAt <= previous.statusEnteredAt) acceptPhase = false
    if (acceptPhase && !phaseAdvanced
      && (previous.phase === 'waiting-input' || previous.phase === 'waiting-approval')
      && (incoming.phase === 'completed' || incoming.phase === 'stopped')
      && incoming.phaseRevision === previous.phaseRevision
      && incoming.statusEnteredAt <= previous.statusEnteredAt) acceptPhase = false

    // Renderer drafts carry display metadata only once process-owned Provider
    // evidence exists. They can never reinterpret an accepted phase/unread lane.
    if (draftProducer(draft.producer) === 'renderer') {
      acceptPhase = false
      acceptUnread = false
    }

    let verifying = false
    if (acceptPhase && incoming.phase !== 'unknown') {
      unknownEvidence.delete(incoming.key)
    } else if (acceptPhase && previous.phase !== 'unknown') {
      const observation = unknownEvidence.get(incoming.key)
      const next = observation
        ? { firstSeenAt: observation.firstSeenAt, count: observation.count + 1 }
        : { firstSeenAt: now(), count: 1 }
      unknownEvidence.set(incoming.key, next)
      // Unknown/unconfirmed terminal evidence never destroys a stable group.
      // The 250 ms timer is only a verification deadline, not permission to
      // fabricate a new semantic state after it expires.
      acceptPhase = false
      verifying = true
    }

    const next = { ...previous }
    if (acceptMembership) {
      Object.assign(next, {
        kind: incoming.kind,
        actionAlias: incoming.actionAlias,
        capabilityToken: incoming.capabilityToken,
        membershipRevision: incoming.membershipRevision,
        visibilityRevision: incoming.visibilityRevision,
        metadataRevision: incoming.metadataRevision,
        displayOrder: incoming.displayOrder,
        cycleOrder: incoming.cycleOrder,
        attentionOrder: incoming.attentionOrder,
        lastQuestionAt: incoming.lastQuestionAt,
        createdAt: incoming.createdAt,
        hidden: incoming.hidden,
        localPin: incoming.localPin,
        dynamicEligible: incoming.dynamicEligible,
        capabilities: incoming.capabilities,
        archiveRequest: incoming.archiveRequest,
        displayName: incoming.displayName,
        projectKey: incoming.projectKey,
        projectName: incoming.projectName,
        projectKind: incoming.projectKind
      })
    }
    if (acceptPhase) {
      Object.assign(next, {
        phase: incoming.phase,
        phaseRevision: incoming.phaseRevision,
        statusEnteredAt: incoming.statusEnteredAt,
        planImplementation: incoming.planImplementation,
        turnStartedAt: incoming.turnStartedAt,
        terminalAt: incoming.terminalAt,
        freshness: incoming.phase === 'unknown' ? 'verifying' : 'fresh'
      })
      const terminal = incoming.phase === 'completed' || incoming.phase === 'stopped'
      if (incoming.provider === 'claude') {
        // Claude archive revalidates the exact native phase and unique metadata
        // target at dispatch time, so its terminal capability can follow the
        // independent phase lane without waiting for another full inventory.
        next.capabilities = { ...next.capabilities, archive: terminal && incoming.capabilities.archive }
        if (!next.capabilities.archive) delete next.archiveRequest
      } else if (!terminal) {
        // Codex needs its verified inventory fingerprint before archive can be
        // enabled, but a newer non-terminal phase may always revoke stale rights.
        next.capabilities = { ...next.capabilities, archive: false }
        delete next.archiveRequest
      }
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
    if (membershipAdvanced || phaseAdvanced || unreadAdvanced) {
      next.observationGeneration = Math.max(next.observationGeneration, incoming.observationGeneration)
    }
    if (verifying) next.freshness = 'verifying'
    const finalized = finalizeTask(next)
    return { ...assignSemanticRevision(previous, finalized), verifying }
  }

  function scheduleUnknownCommit(draft) {
    clearUnknownTimer()
    let dueAt = 0
    for (const value of unknownEvidence.values()) {
      const candidate = value.firstSeenAt + UNKNOWN_GRACE_MS
      if (!dueAt || candidate < dueAt) dueAt = candidate
    }
    if (!dueAt) return
    unknownTimer = setTimer(() => {
      unknownTimer = null
      if (!disposed && lastDraft === draft) commitDraft(draft, true)
    }, Math.max(0, dueAt - now()))
  }

  function commitDraft(draft, forceUnknown = false) {
    if (disposed || !draft || draft.schema !== COMPANION_TASK_DRAFT_REVISION) return null
    const producer = draftProducer(draft.producer)
    const draftRevision = finiteInteger(draft.draftRevision)
    if (!draftRevision) return null
    const lastProducerRevision = lastDraftRevisionByProducer.get(producer) || 0
    if (!forceUnknown && draftRevision <= lastProducerRevision) return currentPackage
    configure({ enabled: draft.enabled, providers: draft.providers })
    if (!forceUnknown) lastDraftRevisionByProducer.set(producer, draftRevision)
    if (!enabled) return currentPackage
    const draftProviders = providerShape(draft.providers)
    if (!sameProviders(providers, draftProviders)) return null
    if (currentPackage.complete && draft.complete !== true) return currentPackage
    const enabledProviders = providerSet(providers)
    const incomingLaneGenerations = normalizeSourceLaneGenerations(draft.sourceLaneGenerations, draft.sourceGenerations)
    const currentLaneGenerations = normalizeSourceLaneGenerations(currentPackage.sourceLaneGenerations, currentPackage.sourceGenerations)
    const staleMembershipProviders = new Set(PROVIDERS.filter((provider) => {
      if (!enabledProviders.has(provider)) return false
      const incomingGeneration = incomingLaneGenerations[provider].membership
      const currentGeneration = currentLaneGenerations[provider].membership
      return incomingGeneration > 0 && currentGeneration > 0 && incomingGeneration < currentGeneration
    }))
    const previousByKey = new Map(currentPackage.tasks.map((task) => [task.key, task]))
    const nextTasks = []
    const seen = new Set()
    let freshness = 'fresh'
    for (const value of Array.isArray(draft.tasks) ? draft.tasks : []) {
      const incoming = normalizeTask(value, enabledProviders)
      if (!incoming || seen.has(incoming.key)) continue
      const tombstoneKey = `${incoming.provider}:${incoming.key}`
      const tombstone = archiveTombstones.get(tombstoneKey)
      if (tombstone) {
        const membershipRevision = Math.max(incoming.membershipRevision, incoming.visibilityRevision)
        if (membershipRevision <= tombstone.membershipRevision) continue
        archiveTombstones.delete(tombstoneKey)
      }
      const previous = previousByKey.get(incoming.key)
      if (!previous && staleMembershipProviders.has(incoming.provider)) continue
      seen.add(incoming.key)
      const reconciled = reconcileTask(
        previous,
        incoming,
        draft,
        forceUnknown,
        incomingLaneGenerations,
        currentLaneGenerations
      )
      if (reconciled.verifying || reconciled.task.freshness === 'verifying') freshness = 'verifying'
      nextTasks.push(reconciled.task)
    }
    for (const task of currentPackage.tasks) {
      if (!staleMembershipProviders.has(task.provider) || seen.has(task.key)) continue
      seen.add(task.key)
      nextTasks.push(task)
    }
    nextTasks.sort(compareByLatestQuestion)
    lastDraft = draft
    if (!forceUnknown) scheduleUnknownCommit(draft)
    const focusedKey = typeof draft.focusedKey === 'string' && nextTasks.some((task) => task.key === draft.focusedKey)
      ? draft.focusedKey
      : ''
    const next = {
      schema: COMPANION_TASK_PACKAGE_REVISION,
      kernelRevision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: currentPackage.packageRevision,
      sourceTaskStateRevision: typeof draft.sourceTaskStateRevision === 'string' ? draft.sourceTaskStateRevision : 'legacy',
      publishedAt: finiteInteger(draft.acceptedAt, now()),
      enabled,
      providers: { ...providers },
      complete: draft.complete === true,
      freshness,
      focusedKey,
      sourceGenerations: {
        codex: Math.max(currentPackage.sourceGenerations.codex, finiteInteger(draft.sourceGenerations?.codex)),
        claude: Math.max(currentPackage.sourceGenerations.claude, finiteInteger(draft.sourceGenerations?.claude))
      },
      sourceLaneGenerations: {
        codex: {
          membership: Math.max(currentLaneGenerations.codex.membership, incomingLaneGenerations.codex.membership),
          phase: Math.max(currentLaneGenerations.codex.phase, incomingLaneGenerations.codex.phase),
          unread: Math.max(currentLaneGenerations.codex.unread, incomingLaneGenerations.codex.unread)
        },
        claude: {
          membership: Math.max(currentLaneGenerations.claude.membership, incomingLaneGenerations.claude.membership),
          phase: Math.max(currentLaneGenerations.claude.phase, incomingLaneGenerations.claude.phase),
          unread: Math.max(currentLaneGenerations.claude.unread, incomingLaneGenerations.claude.unread)
        }
      },
      tasks: nextTasks,
      views: buildViews(nextTasks)
    }
    const semantic = semanticPackage(next)
    if (semantic === lastSemantic) {
      // Observation/lane watermarks are process-internal ordering data. Advance
      // them without publishing a new semantic package or touching consumers.
      currentPackage = {
        ...next,
        packageRevision: currentPackage.packageRevision,
        publishedAt: currentPackage.publishedAt
      }
      record({
        level: 'debug',
        scope: 'task-kernel',
        event: 'same-state-no-op',
        outcome: 'ignored',
        packageRevision: currentPackage.packageRevision,
        count: nextTasks.length
      })
      return currentPackage
    }
    next.packageRevision = ++packageSequence
    currentPackage = next
    lastSemantic = semantic
    const targets = nextTasks.filter((task) => task.capabilities.open).map(targetFromTask)
    actions.sync({
      enabled,
      providers,
      ready: next.complete,
      targets,
      focusedKey,
      attentionKeys: next.views.attentionKeys.archive
    })
    navigation.sync({
      lease: navigationLease,
      enabled,
      providers,
      ready: next.complete,
      targets,
      cycleKeys: next.views.cycleKeys
    })
    emitPackage(currentPackage)
    return currentPackage
  }

  function attach(input = {}) {
    if (disposed) return { revision: COMPANION_TASK_KERNEL_REVISION, lease: 0, retained: false, ready: false, package: currentPackage }
    configure(input)
    activeLease = ++leaseSequence
    return {
      revision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: COMPANION_TASK_PACKAGE_REVISION,
      lease: activeLease,
      retained: currentPackage.complete,
      ready: currentPackage.complete,
      package: currentPackage
    }
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

  function publishEvidence(draft) {
    const startedAt = now()
    const beforeRevision = currentPackage.packageRevision
    const result = commitDraft(draft)
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

  function commitArchived(input = {}) {
    const startedAt = now()
    const provider = PROVIDERS.includes(input.provider) ? input.provider : ''
    const keys = [...new Set((Array.isArray(input.keys) ? input.keys : [input.key])
      .filter((key) => typeof key === 'string' && key))]
    if (input.verified !== true || !provider || !keys.length) return { outcome: 'failed', errorCode: 'invalid-archive-commit' }
    const requested = new Set(keys)
    const removed = []
    const retained = []
    for (const task of currentPackage.tasks) {
      if (task.provider === provider && requested.has(task.key)) {
        removed.push(task)
        continue
      }
      retained.push(task)
    }
    const terminalEpoch = finiteInteger(input.terminalEpoch)
    for (const key of keys) {
      const task = removed.find((candidate) => candidate.key === key)
      archiveTombstones.set(`${provider}:${key}`, {
        membershipRevision: Math.max(
          finiteInteger(input.membershipRevision),
          terminalEpoch,
          finiteInteger(task?.membershipRevision),
          finiteInteger(task?.visibilityRevision),
          finiteInteger(task?.revisionAt)
        ),
        operationId: typeof input.operationId === 'string' ? input.operationId : ''
      })
    }
    if (!removed.length) {
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
    const next = {
      ...currentPackage,
      packageRevision: ++packageSequence,
      publishedAt: now(),
      tasks: retained,
      focusedKey: requested.has(currentPackage.focusedKey) ? '' : currentPackage.focusedKey,
      views: buildViews(retained)
    }
    currentPackage = next
    lastSemantic = semanticPackage(next)
    const targets = retained.filter((task) => task.capabilities.open).map(targetFromTask)
    actions.sync({
      enabled,
      providers,
      ready: next.complete,
      targets,
      focusedKey: next.focusedKey,
      attentionKeys: next.views.attentionKeys.archive
    })
    navigation.sync({
      lease: navigationLease,
      enabled,
      providers,
      ready: next.complete,
      targets,
      cycleKeys: next.views.cycleKeys
    })
    emitPackage(next)
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

  async function ensureReady() {
    if (currentPackage.complete && currentPackage.freshness === 'fresh') return currentPackage
    if (!enabled) throw new Error('disabled')
    if (!preflight) throw new Error('preflight-unavailable')
    if (preflightInFlight) return preflightInFlight
    const progressTimer = setTimer(() => notify('正在读取最新任务状态…'), PREFLIGHT_PROGRESS_MS)
    let timeoutTimer = null
    const timeout = new Promise((_resolve, reject) => {
      timeoutTimer = setTimer(() => reject(new Error('preflight-timeout')), PREFLIGHT_TIMEOUT_MS)
    })
    const operation = Promise.race([
      Promise.resolve().then(() => preflight({ providers: { ...providers } })),
      timeout
    ]).then((draft) => {
      const accepted = commitDraft(draft)
      if (!accepted?.complete) throw new Error('preflight-incomplete')
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
    return currentPackage.tasks.find((task) => task.key === key) || null
  }

  async function dispatch(input = {}) {
    if (disposed || !enabled) return { outcome: 'unavailable', errorCode: 'disabled', message: '任务功能未启用' }
    try {
      await ensureReady()
    } catch {
      notify('任务状态预检失败，未使用不完整缓存')
      return { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '任务状态预检失败，请重试' }
    }
    if (input.action === 'cycle') return navigation.cycle(input.direction === -1 ? -1 : 1, {
      operationId: input.operationId,
      source: input.source || 'task-cycle'
    })
    if (input.action === 'open-attention') {
      const keys = input.kind === 'completed-unread'
        ? currentPackage.views.attentionKeys.completedUnread
        : currentPackage.views.attentionKeys.input
      const key = keys[0]
      const task = taskForKey(key)
      if (!task) return { outcome: 'unavailable', errorCode: 'no-task', message: '当前没有符合条件的任务' }
      return navigation.open({ key, target: targetFromTask(task), source: input.source || 'attention-shortcut', operationId: input.operationId })
    }
    if (input.action === 'open') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.open) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      return navigation.open({ key: task.key, target: targetFromTask(task), source: input.source || 'manual-row-open', operationId: input.operationId })
    }
    if (input.action === 'archive') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.archive) return { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已变化，当前不能归档' }
      return actions.archive({
        key: task.key,
        revisionAt: finiteInteger(input.revisionAt),
        phase: typeof input.phase === 'string' ? input.phase : task.phase,
        source: typeof input.source === 'string' ? input.source : 'archive-button',
        operationId: input.operationId,
        confirmationRecorded: input.confirmationRecorded === true,
        target: targetFromTask(task)
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
    void dispatch(intent).then((result) => {
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched' || result?.errorCode === 'superseded') return
      notify(result?.message || '任务切换失败，请重试')
    }).catch(() => notify('任务切换失败，请重试'))
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
      preflightInFlight: Boolean(preflightInFlight),
      freshness: currentPackage.freshness,
      navigation: navigation.diagnostics(),
      actions: actions.diagnostics()
    }
  }

  function close() {
    if (disposed) return
    disposed = true
    clearUnknownTimer()
    packageListeners.clear()
    actions.close()
    navigation.dispose()
  }

  return {
    revision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: COMPANION_TASK_PACKAGE_REVISION,
    attach,
    syncPackage,
    /** Host-only provider evidence path; never exposed as a Renderer authority. */
    publishEvidence,
    /** Only a verified Provider archive transaction may call this commit gate. */
    commitArchived,
    detach,
    dispatch,
    handleEnter,
    getPackage: () => currentPackage,
    onPackage,
    onResult: navigation.onResult,
    takeResults,
    diagnostics,
    close
  }
}

module.exports = {
  COMPANION_TASK_KERNEL_REVISION,
  COMPANION_TASK_PACKAGE_REVISION,
  PREFLIGHT_PROGRESS_MS,
  PREFLIGHT_TIMEOUT_MS,
  UNKNOWN_GRACE_MS,
  reduceCodexTaskEvidenceV3,
  createCompanionTaskKernel
}
