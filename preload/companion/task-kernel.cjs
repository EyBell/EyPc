'use strict'

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
const { finiteInteger, phaseEvidenceSupersedes, mergeEvidenceLanes } = require('./branch-causality.cjs')
const {
  TASK_PHASES,
  isKnownTaskPhase,
  isLiveTaskPhase,
  isTerminalTaskPhase,
  isAttentionTaskPhase,
  isRetainableTaskPhase,
  isSettledTaskPhase
} = require('../task-phase.cjs')

const COMPANION_TASK_KERNEL_REVISION = providerRegistry.kernelRevision
const COMPANION_TASK_PACKAGE_REVISION = providerRegistry.snapshotRevision
const COMPANION_TASK_DRAFT_REVISION = 'companion-task-evidence-draft-v6'
const COMPANION_TASK_COMMAND_REVISION = providerRegistry.commandRevision
const COMPANION_TASK_SUBSCRIBE_REVISION = providerRegistry.subscribeRevision
const COMPANION_TASK_ACK_REVISION = providerRegistry.ackRevision
const COMPANION_PROVIDER_EVIDENCE_BATCH_REVISION = 'companion-provider-evidence-batch-v2'
const PREFLIGHT_PROGRESS_MS = 600
const PREFLIGHT_TIMEOUT_MS = 5_000
const UNKNOWN_GRACE_MS = 250
const MAX_TIMER_DELAY_MS = 2_147_483_647
const TIERS = ['attention', 'plan', 'active', 'fallback', 'none']
const GROUPS = ['input', 'active', 'stopped', 'unread', 'completed', 'none']
const DRAFT_PRODUCERS = ['renderer', 'host-preflight', 'host-evidence']
const SOURCE_LANES = ['membership', 'phase', 'unread', 'metadata', 'topology']
const ACTIVITY_EVIDENCE_PHASE = Object.freeze({
  'turn-running': 'running',
  'waiting-input': 'waiting-input',
  'waiting-approval': 'waiting-approval',
  'turn-completed': 'completed',
  'turn-interrupted': 'stopped',
  'turn-failed': 'stopped',
  unknown: 'unknown'
})
const PLAN_LIFECYCLE_STATES = new Set(['unknown', 'ready', 'cleared'])
const PLAN_CLEAR_REASONS = new Set(['cancel', 'execution-start', 'archive', 'removal'])
const AGGREGATE_LIVE_PHASE_PRIORITY = Object.freeze({
  'waiting-approval': 3,
  'waiting-input': 2,
  running: 1
})

/**
 * The only Codex phase reducer. Provider adapters supply causal evidence;
 * callers may preserve a prior stable phase while an interrupted/failed edge
 * is being verified, but must not reinterpret the result.
 */
function reduceCodexTaskEvidenceV4(value = {}) {
  const flags = Array.isArray(value.activeFlags) ? value.activeFlags : []
  const waitingApproval = flags.includes('waitingOnApproval')
  const waitingInput = flags.includes('waitingOnUserInput')
  const activityEventIsCurrent = value.activityEvidence === 'activity-event'
    && (value.lastTurnStatus !== 'completed' || value.lastTurnEvidence === 'turn-started')
  const realtimeActive = (value.statusAuthority === 'desktop-live' || value.statusAuthority === 'app-server-live')
    && (activityEventIsCurrent
      || finiteInteger(value.activeEvidenceSequence) > 0
      || waitingApproval
      || waitingInput)
  const persistedWaiting = value.statusAuthority === 'persisted-decision'
    && (waitingApproval || waitingInput)
  const liveActive = value.status === 'active' && (
    realtimeActive
    || persistedWaiting
    || value.planImplementationOnly === true
  )
  const exactTerminal = ['completed', 'interrupted', 'failed'].includes(value.lastTurnStatus)
    && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(value.lastTurnEvidence)
  const activeSequence = finiteInteger(value.activeEvidenceSequence)
  const terminalSequence = finiteInteger(value.terminalEvidenceSequence)
  const terminalStrictlyNewer = exactTerminal && terminalSequence > 0 && activeSequence > 0
    && terminalSequence > activeSequence
  const idleConfirmedTerminal = exactTerminal && value.idleConfirmed === true && !liveActive
    && (!activeSequence || !terminalSequence || terminalSequence >= activeSequence)
  const terminalCurrent = exactTerminal && (
    idleConfirmedTerminal
    || (!liveActive && (terminalStrictlyNewer || !activeSequence || !terminalSequence))
  )
  const activeCurrent = liveActive && !terminalStrictlyNewer
  const waitingCurrent = liveActive && (waitingApproval || waitingInput)
    && (!activeSequence || !terminalSequence || activeSequence >= terminalSequence)
  const prior = isKnownTaskPhase(value.previousPhase) ? value.previousPhase : 'unknown'
  const details = {
    providerStatus: value.status,
    statusAuthority: value.statusAuthority,
    activityEvidence: value.activityEvidence,
    lastTurnStatus: value.lastTurnStatus,
    lastTurnEvidence: value.lastTurnEvidence,
    activeFlags: flags,
    liveActive,
    exactTerminal,
    activeEvidenceSequence: activeSequence,
    terminalEvidenceSequence: terminalSequence,
    terminalCurrent,
    terminalStrictlyNewer,
    idleConfirmedTerminal,
    activeCurrent,
    waitingCurrent,
    planImplementationOnly: value.planImplementationOnly === true,
    planReady: value.planReady === true || value.planImplementationOnly === true,
    idleConfirmed: value.idleConfirmed === true,
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
  if (activeCurrent) {
    return decide('running', exactTerminal ? 'active-terminal-conflict' : 'causal-active', exactTerminal ? 'verifying' : 'fresh')
  }
  if (value.lastTurnStatus === 'completed' && (!liveActive || terminalCurrent)) return decide('completed', terminalCurrent ? 'exact-completed' : 'completed-inventory')
  if ((value.lastTurnStatus === 'interrupted' || value.lastTurnStatus === 'failed')
    && terminalCurrent && value.idleConfirmed === true) {
    return decide('stopped', value.planReady === true || value.planImplementationOnly === true
      ? 'plan-interrupted-idle-confirmed'
      : 'ordinary-interrupted-idle-confirmed')
  }
  if (value.lastTurnStatus === 'interrupted' || value.lastTurnStatus === 'failed' || value.status === 'systemError') {
    return decide(prior, 'terminal-verifying', 'verifying')
  }
  return decide(prior === 'unknown' ? 'unknown' : prior, 'insufficient-evidence', 'verifying')
}

function normalizeCodexBranchEvidenceV4(value = {}) {
  if (!value || typeof value !== 'object') return null
  const ref = typeof value.ref === 'string' && value.ref.length > 0 && value.ref.length <= 128 ? value.ref : ''
  if (!ref) return null
  const branchKind = value.branchKind === 'main' || value.branchKind === 'side' ? value.branchKind : ''
  // Normalized branches are passed through this function again during parent
  // reduction. Preserve an explicit abstention instead of turning the emitted
  // `unreadKnown: false` storage field into a newly observed negative value.
  const unreadObserved = value.unreadObserved === true || value.unreadKnown === true
  const unreadKnown = unreadObserved
  const hasUnreadTurn = unreadKnown && value.hasUnreadTurn === true
  const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(value.status) ? value.status : 'notLoaded'
  const statusAuthority = ['desktop-live', 'app-server-live', 'persisted-decision', 'connector', 'unavailable'].includes(value.statusAuthority)
    ? value.statusAuthority
    : 'unavailable'
  const activeFlags = Array.isArray(value.activeFlags)
    ? [...new Set(value.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
    : []
  const lastTurnStatus = ['completed', 'interrupted', 'failed', 'inProgress'].includes(value.lastTurnStatus)
    ? value.lastTurnStatus
    : ''
  const lastTurnEvidence = ['turn-started', 'turn-completed', 'targeted-after-exit', 'snapshot-corroborated', 'inventory'].includes(value.lastTurnEvidence)
    ? value.lastTurnEvidence
    : ''
  const activeEvidenceSequence = finiteInteger(value.activeEvidenceSequence)
  const terminalEvidenceSequence = finiteInteger(value.terminalEvidenceSequence)
  const turnStartedAt = finiteInteger(value.turnStartedAt)
  const goalStatus = ['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete', 'none', 'unknown'].includes(value.goalStatus)
    ? value.goalStatus
    : 'none'
  const goalFreshness = value.goalFreshness === 'verifying' || goalStatus === 'unknown'
    ? 'verifying'
    : 'fresh'
  const goalEvidenceSequence = finiteInteger(value.goalEvidenceSequence)
  const goalUpdatedAt = finiteInteger(value.goalUpdatedAt)
  const nonActiveGoal = ['paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'].includes(goalStatus)
  // A non-active Goal belongs to the execution epoch in which it was
  // observed. A strictly newer Turn may start another epoch before the App
  // Server publishes the replacement Goal; the old state must not lock the
  // thread forever. `updatedAt` is authoritative for RPC re-reads, while the
  // process sequence covers notification-only observations.
  const goalSupersededByActive = goalFreshness === 'fresh' && nonActiveGoal && activeEvidenceSequence > 0 && (
    (goalUpdatedAt > 0 && turnStartedAt > goalUpdatedAt)
    || (goalUpdatedAt > 0
      && turnStartedAt === goalUpdatedAt
      && goalEvidenceSequence > 0
      && activeEvidenceSequence > goalEvidenceSequence)
    || (goalUpdatedAt === 0 && goalEvidenceSequence > 0 && activeEvidenceSequence > goalEvidenceSequence)
  )
  const goalCurrent = goalFreshness === 'fresh'
    && goalStatus !== 'none'
    && goalStatus !== 'unknown'
    && !goalSupersededByActive
  const goalSuppressesLive = goalCurrent && nonActiveGoal
  const exactTerminal = ['completed', 'interrupted', 'failed'].includes(lastTurnStatus)
    && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(lastTurnEvidence)
  const terminalStrictlyNewer = exactTerminal && terminalEvidenceSequence > 0 && activeEvidenceSequence > 0
    && terminalEvidenceSequence > activeEvidenceSequence
  const activityEventIsCurrent = value.activityEvidence === 'activity-event'
    && (lastTurnStatus !== 'completed' || lastTurnEvidence === 'turn-started')
  const realtimeActive = (statusAuthority === 'desktop-live' || statusAuthority === 'app-server-live')
    && (activityEventIsCurrent
      || activeEvidenceSequence > 0
      || activeFlags.length > 0)
  const persistedWaiting = statusAuthority === 'persisted-decision' && activeFlags.length > 0
  const liveStatus = status === 'active' && (
    realtimeActive
    || persistedWaiting
    || value.planImplementationOnly === true
  )
  // `inProgress` from an inventory replay is not live evidence by itself.
  // A branch becomes live only through a real-time authority (Turn start,
  // Desktop activity delta, App Server delta or the persisted Plan lane).
  const liveCurrent = liveStatus && !terminalStrictlyNewer && !goalSuppressesLive
  const idleConfirmed = exactTerminal && value.idleConfirmed === true && !liveCurrent
    && (!activeEvidenceSequence || !terminalEvidenceSequence || terminalEvidenceSequence >= activeEvidenceSequence)
  return {
    ref,
    branchKind,
    topologyExact: value.topologyExact === true,
    unreadObserved,
    unreadKnown,
    hasUnreadTurn,
    status,
    statusAuthority,
    activityEvidence: value.activityEvidence === 'activity-event' ? 'activity-event' : 'initial-snapshot',
    activeFlags: liveCurrent ? activeFlags : [],
    lastTurnStatus,
    lastTurnEvidence,
    activeEvidenceSequence,
    terminalEvidenceSequence,
    waitingSince: finiteInteger(value.waitingSince),
    turnStartedAt,
    terminalAt: finiteInteger(value.terminalAt),
    transitionAt: finiteInteger(value.transitionAt),
    observedAt: finiteInteger(value.observedAt),
    planImplementationOnly: value.planImplementationOnly === true,
    planReady: value.planReady === true || value.planImplementationOnly === true,
    goalStatus,
    goalFreshness,
    goalEvidenceSequence,
    goalUpdatedAt,
    goalCurrent,
    goalSupersededByActive,
    exactTerminal,
    terminalStrictlyNewer,
    liveCurrent,
    idleConfirmed
  }
}

function codexLiveAttentionRankV4(branch) {
  if (branch?.activeFlags?.includes('waitingOnApproval')) return 2
  if (branch?.activeFlags?.includes('waitingOnUserInput')) return 1
  return 0
}

// Codex ranks a waiting branch above a plain running one when nothing else
// separates two live observations. The shared core takes this as an injected
// comparator so it never has to know Codex's activeFlags vocabulary.
function codexBranchPhaseEvidenceSupersedesV4(previous, incoming) {
  return phaseEvidenceSupersedes(previous, incoming, codexLiveAttentionRankV4)
}

function mergeCodexBranchEvidenceV4(previous, incoming) {
  if (!previous) return incoming
  // Phase and unread merge in the shared core. Goal is a Codex-only lane, so it
  // is applied on top of that result rather than pushed down into the core.
  const retained = mergeEvidenceLanes(previous, incoming, { attentionRank: codexLiveAttentionRankV4 })
  const incomingGoalSequence = finiteInteger(incoming.goalEvidenceSequence)
  const previousGoalSequence = finiteInteger(previous.goalEvidenceSequence)
  const incomingGoalUpdatedAt = finiteInteger(incoming.goalUpdatedAt)
  const previousGoalUpdatedAt = finiteInteger(previous.goalUpdatedAt)
  const incomingGoalSupersedes = incomingGoalSequence > previousGoalSequence
    || (incomingGoalSequence === previousGoalSequence && incomingGoalUpdatedAt > previousGoalUpdatedAt)
    || (incomingGoalSequence === 0
      && previousGoalSequence === 0
      && previous.goalFreshness === 'verifying'
      && incoming.goalFreshness === 'fresh'
      && incoming.goalStatus === 'none')
  const goalSource = incomingGoalSupersedes ? incoming : previous
  retained.goalStatus = goalSource.goalStatus
  retained.goalFreshness = goalSource.goalFreshness
  retained.goalEvidenceSequence = goalSource.goalEvidenceSequence
  retained.goalUpdatedAt = goalSource.goalUpdatedAt
  return normalizeCodexBranchEvidenceV4(retained)
}

/**
 * Private parent reducer. Branch references are already anonymized by Host and
 * never enter the public task package, diagnostics, logs or persistence.
 */
function reduceCodexParentBranchEvidenceV4(value = {}) {
  const branches = (Array.isArray(value.branches) ? value.branches : [])
    .map(normalizeCodexBranchEvidenceV4)
    .filter(Boolean)
  // The parent row is a projection of every bead in the conversation tree.
  // A Side Chat must therefore participate even while the main branch is
  // completed-unread or still nonterminal. Presentation priority is resolved
  // below (live/waiting > unread completion > read completion), never by a
  // main-branch admission gate.
  const selectedBranches = branches
  const priorCandidate = isKnownTaskPhase(value.previousNonterminalPhase)
    ? value.previousNonterminalPhase
    : isKnownTaskPhase(value.previousPhase) ? value.previousPhase : 'unknown'
  const previousNonterminalPhase = isRetainableTaskPhase(priorCandidate)
    ? priorCandidate
    : ''
  const details = {
    aggregationPolicy: 'all-branches',
    branchCount: branches.length,
    selectedBranchCount: selectedBranches.length,
    runningCount: selectedBranches.filter((branch) => branch.liveCurrent && branch.activeFlags.length === 0).length,
    approvalCount: selectedBranches.filter((branch) => branch.liveCurrent && branch.activeFlags.includes('waitingOnApproval')).length,
    inputCount: selectedBranches.filter((branch) => branch.liveCurrent && branch.activeFlags.includes('waitingOnUserInput')).length,
    unreadCount: selectedBranches.filter((branch) => branch.unreadObserved
      && branch.unreadKnown
      && branch.hasUnreadTurn).length,
    terminalCount: selectedBranches.filter((branch) => branch.exactTerminal).length,
    idleTerminalCount: selectedBranches.filter((branch) => branch.idleConfirmed).length,
    goalActiveCount: selectedBranches.filter((branch) => branch.goalCurrent && branch.goalStatus === 'active').length,
    goalStoppedCount: selectedBranches.filter((branch) => branch.goalCurrent
      && ['paused', 'blocked', 'usageLimited', 'budgetLimited'].includes(branch.goalStatus)).length,
    goalCompleteCount: selectedBranches.filter((branch) => branch.goalCurrent && branch.goalStatus === 'complete').length,
    goalVerifyingCount: selectedBranches.filter((branch) => branch.goalFreshness === 'verifying').length
  }
  const positiveUnread = selectedBranches.some((branch) => branch.unreadObserved
    && branch.unreadKnown
    && branch.hasUnreadTurn)
  const completeUnreadObservation = selectedBranches.length > 0
    && selectedBranches.every((branch) => branch.unreadObserved)
  const unreadOutcome = positiveUnread || completeUnreadObservation ? 'decided' : 'abstain'
  const unreadKnown = positiveUnread
    || (completeUnreadObservation && selectedBranches.every((branch) => branch.unreadKnown))
  const unread = unreadKnown && positiveUnread
  const transitionAtFor = (selected) => Math.max(
    0,
    ...selected.map((branch) => Math.max(
      finiteInteger(branch.transitionAt),
      finiteInteger(branch.waitingSince),
      finiteInteger(branch.turnStartedAt),
      finiteInteger(branch.terminalAt),
      finiteInteger(branch.goalUpdatedAt)
    ))
  )
  const decide = (phase, reason, freshness = 'fresh', idleConfirmed = false, selected = selectedBranches) => ({
    outcome: 'decided',
    phase,
    reason,
    freshness,
    idleConfirmed,
    unreadOutcome,
    unreadKnown,
    unread,
    transitionAt: transitionAtFor(selected),
    details
  })
  const abstain = (reason) => ({
    outcome: 'abstain',
    phase: null,
    reason,
    freshness: 'unchanged',
    idleConfirmed: false,
    unreadOutcome,
    unreadKnown,
    unread,
    transitionAt: 0,
    details
  })
  if (!selectedBranches.length) return abstain('branch-evidence-missing')
  const approvals = selectedBranches.filter((branch) => branch.liveCurrent && branch.activeFlags.includes('waitingOnApproval'))
  if (approvals.length) {
    return decide('waiting-approval', 'branch-waiting-approval', 'fresh', false, approvals)
  }
  const inputs = selectedBranches.filter((branch) => branch.liveCurrent && branch.activeFlags.includes('waitingOnUserInput'))
  if (inputs.length) {
    return decide('waiting-input', 'branch-waiting-input', 'fresh', false, inputs)
  }
  const running = selectedBranches.filter((branch) => branch.liveCurrent && branch.activeFlags.length === 0)
  if (running.length) {
    return decide('running', 'branch-running', 'fresh', false, running)
  }
  const activeGoals = selectedBranches.filter((branch) => branch.goalCurrent && branch.goalStatus === 'active')
  if (activeGoals.length) {
    return decide('running', 'goal-active', 'fresh', false, activeGoals)
  }
  const verifyingGoals = selectedBranches.filter((branch) => branch.goalFreshness === 'verifying')
  if (verifyingGoals.length) {
    const retainedActiveGoal = verifyingGoals.filter((branch) => branch.goalStatus === 'active')
    if (retainedActiveGoal.length && !previousNonterminalPhase) {
      return decide('running', 'goal-active-verifying', 'verifying', false, retainedActiveGoal)
    }
    return previousNonterminalPhase
      ? decide(previousNonterminalPhase, 'goal-evidence-verifying', 'verifying', false, verifyingGoals)
      : decide('unknown', 'goal-evidence-verifying', 'verifying', false, verifyingGoals)
  }
  const stoppedGoals = selectedBranches.filter((branch) => branch.goalCurrent
    && ['paused', 'blocked', 'usageLimited', 'budgetLimited'].includes(branch.goalStatus))
  if (stoppedGoals.length) {
    return decide('stopped', `goal-${stoppedGoals[0].goalStatus}`, 'fresh', true, stoppedGoals)
  }
  const completedGoals = selectedBranches.filter((branch) => branch.goalCurrent && branch.goalStatus === 'complete')
  if (completedGoals.length) {
    return decide('completed', 'goal-complete', 'fresh', false, completedGoals)
  }
  if (selectedBranches.every((branch) => branch.exactTerminal && branch.lastTurnStatus === 'completed')) {
    return decide('completed', 'all-branches-completed')
  }
  const terminalRows = selectedBranches.filter((branch) => ['completed', 'interrupted', 'failed'].includes(branch.lastTurnStatus))
  if (terminalRows.length === selectedBranches.length
    && terminalRows.every((branch) => branch.lastTurnStatus === 'completed')
    && terminalRows.some((branch) => branch.exactTerminal)) {
    return decide('completed', 'all-branches-completed')
  }
  if (selectedBranches.every((branch) => branch.exactTerminal && branch.idleConfirmed)) {
    return decide('stopped', 'all-branches-idle-terminal', 'fresh', true)
  }
  return previousNonterminalPhase
    ? decide(previousNonterminalPhase, 'branch-terminal-verifying', 'verifying')
    : abstain('branch-evidence-insufficient')
}

/** @deprecated Source compatibility; V4 is the sole implementation. */
const reduceCodexTaskEvidenceV3 = reduceCodexTaskEvidenceV4

/** Provider-neutral Claude phase reducer. Adapters supply native phase and
 * unread evidence; Host and Renderer consumers must not recreate this rule. */
function reduceClaudeTaskEvidenceV4(value = {}) {
  const sourcePhase = isKnownTaskPhase(value.phase) ? value.phase : 'unknown'
  if (isLiveTaskPhase(sourcePhase)) {
    return {
      phase: sourcePhase,
      freshness: 'fresh',
      reason: 'provider-live',
      details: { sourcePhase, unread: value.unread === true }
    }
  }
  if (value.unread === true) {
    return {
      phase: 'completed',
      freshness: 'fresh',
      reason: 'native-unread-completion',
      details: { sourcePhase, unread: true }
    }
  }
  return {
    phase: sourcePhase,
    freshness: sourcePhase === 'unknown' ? 'verifying' : 'fresh',
    reason: isTerminalTaskPhase(sourcePhase) ? 'provider-terminal' : 'unknown-evidence',
    details: { sourcePhase, unread: false }
  }
}

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
 * not leftover patches: Codex owns Plan lifecycle and fork topology, Claude
 * revalidates its archive target at dispatch instead of against a verified
 * inventory. Those differences are real, but scattering them as `provider ===`
 * conditionals through the reducer means adding a Provider is a search rather
 * than a row. The reducer therefore reads traits and stays Provider-neutral.
 */
const PROVIDER_TRAITS = Object.freeze({
  codex: Object.freeze({
    taskKind: 'codex-thread',
    planLifecycle: true,
    branchTopology: true,
    archiveNeedsVerifiedInventory: true,
    readAcknowledgements: false,
    keyPrefixActionAlias: false
  }),
  claude: Object.freeze({
    taskKind: 'claude-session',
    planLifecycle: false,
    branchTopology: false,
    archiveNeedsVerifiedInventory: false,
    readAcknowledgements: true,
    keyPrefixActionAlias: true
  }),
  cursor: Object.freeze({
    taskKind: 'cursor-session',
    planLifecycle: false,
    branchTopology: false,
    archiveNeedsVerifiedInventory: false,
    readAcknowledgements: false,
    keyPrefixActionAlias: true
  })
})

function providerTraits(provider) {
  return PROVIDER_TRAITS[provider] || PROVIDER_TRAITS.codex
}

/**
 * Projects a canonical task onto the shared evidence-line shape. The task layer
 * keeps no separate active/terminal sequences, so `statusEnteredAt` is the only
 * causal quantity available and is reported on whichever side the phase sits;
 * the opposite side reads zero, which the core treats as "no such observation".
 */
function taskPhaseObservation(task) {
  const live = isLiveTaskPhase(task.phase)
  const terminal = isTerminalTaskPhase(task.phase)
  const enteredAt = finiteInteger(task.statusEnteredAt)
  return {
    liveCurrent: live,
    exactTerminal: terminal,
    turnStartedAt: live ? enteredAt : 0,
    terminalAt: terminal ? enteredAt : 0,
    activeEvidenceSequence: live ? enteredAt : 0,
    terminalEvidenceSequence: terminal ? enteredAt : 0
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

// `phase`/`unread` are monotonic provider counters and may fall back to the
// counter aggregate. `membership` is an observation timestamp compared only
// against itself, so it must never inherit a counter — and the aggregate must
// never inherit a timestamp. A lane holding the wrong unit can never be
// overtaken again and silently rejects every later generation as stale.
function normalizeSourceLaneGenerations(value, aggregate = {}) {
  const result = emptySourceLaneGenerations()
  for (const provider of PROVIDERS) {
    const fallback = finiteInteger(aggregate?.[provider])
    for (const lane of SOURCE_LANES) {
      result[provider][lane] = lane === 'phase' || lane === 'unread'
        ? finiteInteger(value?.[provider]?.[lane], fallback)
        : finiteInteger(value?.[provider]?.[lane])
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
  const kind = value.kind === 'claude-session' || value.kind === 'codex-thread'
    || value.kind === 'cursor-session' || value.kind === 'topology-child'
    || value.kind === 'local-pin' ? value.kind : ''
  const phase = isKnownTaskPhase(value.phase) ? value.phase : 'unknown'
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
    paused: value.paused === true,
    turnMode: value.turnMode === 'plan' || value.turnMode === 'default' ? value.turnMode : 'unknown',
    idleConfirmed: value.idleConfirmed === true,
    localPin: value.localPin === true,
    dynamicEligible: value.dynamicEligible === true,
    capabilities: {
      // The anonymous key is the durable identity. Alias expiry must not make
      // a still-visible task unopenable; Host resolves/renews the hint.
      open: capabilities.open === true,
      archive: capabilities.archive === true,
      pause: capabilities.pause === true,
      resume: capabilities.resume === true,
      executePlan: capabilities.executePlan === true
    },
    family: typeof value.family === 'string' && value.family
      ? value.family.slice(0, 256)
      : `${provider}:${key}`,
    role: value.role === 'child' ? 'child' : 'root',
    standaloneEligible: value.standaloneEligible !== false,
    error: value.error === true,
    metadataPartial: value.metadataPartial === true,
    causalKey: typeof value.causalKey === 'string' ? value.causalKey.slice(0, 256) : '',
    causalReliable: value.causalReliable === true,
    causalObserved: Object.prototype.hasOwnProperty.call(value, 'causalKey')
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

function normalizeEvidenceNode(value, provider, enabledProviders) {
  if (!value || typeof value !== 'object' || value.provider !== provider) return null
  const activity = value.activity && typeof value.activity === 'object' ? value.activity : {}
  const unread = value.unread && typeof value.unread === 'object' ? value.unread : {}
  const plan = value.plan && typeof value.plan === 'object' ? value.plan : {}
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {}
  const activityKind = Object.prototype.hasOwnProperty.call(ACTIVITY_EVIDENCE_PHASE, activity.kind)
    ? activity.kind
    : 'unknown'
  const phase = ACTIVITY_EVIDENCE_PHASE[activityKind]
  const capabilityNames = new Set((Array.isArray(value.capabilities) ? value.capabilities : [])
    .filter((name) => typeof name === 'string'))
  const sequence = finiteInteger(activity.sequence)
  const planState = PLAN_LIFECYCLE_STATES.has(plan.state) ? plan.state : 'unknown'
  const planSequence = finiteInteger(plan.sequence)
  const planClearReason = PLAN_CLEAR_REASONS.has(plan.reason) ? plan.reason : ''
  return normalizeTask({
    ...metadata,
    key: value.key,
    provider,
    family: value.family,
    role: value.role,
    standaloneEligible: value.standaloneEligible !== false,
    error: value.error === true,
    metadataPartial: metadata.partial === true,
    phase,
    freshness: activity.exact === true && phase !== 'unknown' ? 'fresh' : 'verifying',
    observationGeneration: sequence,
    phaseRevision: sequence || finiteInteger(activity.statusEnteredAt),
    statusEnteredAt: finiteInteger(activity.statusEnteredAt),
    turnStartedAt: finiteInteger(activity.turnStartedAt),
    terminalAt: finiteInteger(activity.terminalAt),
    causalKey: typeof activity.causalKey === 'string' ? activity.causalKey : '',
    causalReliable: activity.exact === true && Boolean(activity.causalKey),
    unreadKnown: unread.known === true,
    unread: unread.known === true && unread.value === true,
    unreadRevision: finiteInteger(unread.sequence),
    planReady: planState === 'ready',
    planLifecycleState: planState,
    planLifecycleRevision: planSequence,
    planClearReason,
    capabilities: {
      open: capabilityNames.has('open'),
      archive: capabilityNames.has('archive'),
      pause: capabilityNames.has('pause'),
      resume: capabilityNames.has('resume'),
      executePlan: capabilityNames.has('execute-plan') || capabilityNames.has('executePlan')
    }
  }, enabledProviders)
}

function normalizeEvidenceBatch(value, provider, draft, producer) {
  const source = value && typeof value === 'object' ? value : {}
  const explicit = source.revision === COMPANION_PROVIDER_EVIDENCE_BATCH_REVISION
    && source.provider === provider
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
    revision: COMPANION_PROVIDER_EVIDENCE_BATCH_REVISION,
    provider,
    channels: Object.fromEntries(SOURCE_LANES.map((channel) => [channel, normalizeChannel(channel)])),
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
    relations: Array.isArray(source.relations) ? source.relations : [],
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
    causalKey: _causalKey,
    causalReliable: _causalReliable,
    causalObserved: _causalObserved,
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
    ...(task.archiveRequest ? { archiveRequest: task.archiveRequest } : {})
  }
}

function emptyViews() {
  return {
    groups: { input: [], active: [], stopped: [], unread: [], completed: [] },
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

function visibilityAnchor(task) {
  return Math.max(
    finiteInteger(task.lastQuestionAt),
    finiteInteger(task.turnStartedAt),
    finiteInteger(task.terminalAt),
    finiteInteger(task.statusEnteredAt),
    finiteInteger(task.createdAt)
  )
}

function derivedCycleTier(task) {
  if (task.hidden || task.paused) return 'none'
  if (isAttentionTaskPhase(task.phase)) {
    return task.planImplementation ? 'plan' : 'attention'
  }
  if (task.phase === 'stopped' && task.planReady) return 'plan'
  if (task.phase === 'running' && task.dynamicEligible) return 'active'
  if (task.localPin) return 'fallback'
  return 'none'
}

function derivedDynamicGroup(task) {
  if (task.hidden || task.paused) return 'none'
  // Attention survives the ordinary activity window. A long-waiting prompt or
  // unread completion must remain reachable until the user handles it.
  if (isAttentionTaskPhase(task.phase)) return 'input'
  if (task.phase === 'completed' && task.unread) return 'unread'
  if (!task.dynamicEligible && !(task.phase === 'stopped' && task.planReady)) return 'none'
  if (task.phase === 'running') return 'active'
  if (task.phase === 'unknown') return 'none'
  if (task.phase === 'stopped') return 'stopped'
  if (task.phase === 'completed') return 'completed'
  return 'none'
}

function finalizeTask(task) {
  const revisionAt = finiteInteger(task.revisionAt)
  const next = { ...task, revisionAt }
  if (next.planReady && !next.planLifecycleRevision) {
    next.planLifecycleRevision = Math.max(1, next.statusEnteredAt, next.turnStartedAt, next.revisionAt)
  }
  if (!next.planReady) {
    if (next.planLifecycleState !== 'cleared') next.planLifecycleRevision = 0
    next.paused = false
  }
  // A completed Plan remains user-actionable even when Codex does not expose
  // the dedicated Implement Plan request. `planImplementation` controls cycle
  // priority only; it must not disable the row/menu controls. The Host still
  // performs an exact latest-Turn/activity/request preflight before execution.
  const planActionable = providerTraits(next.provider).planLifecycle
    && next.planReady
    && (isSettledTaskPhase(next.phase) || isAttentionTaskPhase(next.phase))
  next.capabilities = {
    ...next.capabilities,
    pause: planActionable && !next.paused,
    resume: planActionable && next.paused,
    executePlan: planActionable && next.capabilities.executePlan === true
  }
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
    paused: task.paused,
    turnMode: task.turnMode,
    idleConfirmed: task.idleConfirmed,
    localPin: task.localPin,
    dynamicEligible: task.dynamicEligible,
    capabilities: task.capabilities,
    displayName: task.displayName,
    originalTitle: task.originalTitle,
    alias: task.alias,
    projectKey: task.projectKey,
    projectName: task.projectName,
    projectKind: task.projectKind,
    topology: task.topology
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
  const display = [...visible].sort(compareByLatestQuestion)
  for (const task of display) {
    if (task.dynamicGroup !== 'none') views.groups[task.dynamicGroup].push(task.key)
  }
  views.counts.input = visible.filter((task) => isAttentionTaskPhase(task.phase)).length
  views.counts.active = views.groups.active.length
  views.counts.unread = visible.filter((task) => task.phase === 'completed' && task.unread).length

  const cycleCandidates = [...visible]
    .filter((task) => task.capabilities.open && task.cycleTier !== 'none')
    .sort(compareByLatestQuestion)
  for (const tier of ['attention', 'plan', 'active', 'fallback']) {
    const keys = cycleCandidates.filter((task) => task.cycleTier === tier).map((task) => task.key)
    if (keys.length) {
      views.cycleKeys = keys
      break
    }
  }

  const attention = [...visible].sort(compareByLatestQuestion)
  const inputAttention = attention
    .filter((task) => task.capabilities.open && isAttentionTaskPhase(task.phase))
    .map((task) => task.key)
  // Direct attention actions are exact: "待输入" must never fall through to
  // an unrelated pinned/completed task. Local pins remain the final tier of the
  // ordinary previous/next cycle only.
  views.attentionKeys.input = inputAttention
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
    topologyRevision: packageValue.topologyRevision,
    // Health generations order evidence internally; advancing them without a
    // status/error transition must not fan out a new global snapshot revision.
    providerHealth: Object.fromEntries(PROVIDERS.map((provider) => [provider, {
      status: packageValue.providerHealth?.[provider]?.status || 'unavailable',
      errorCode: packageValue.providerHealth?.[provider]?.errorCode || ''
    }])),
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
  const persistPlanPause = typeof dependencies.persistPlanPause === 'function' ? dependencies.persistPlanPause : () => true
  const migrateHiddenPlan = typeof dependencies.migrateHiddenPlan === 'function' ? dependencies.migrateHiddenPlan : () => true
  const applyPreference = typeof dependencies.applyPreference === 'function' ? dependencies.applyPreference : null
  const initial = dependencies.initialConfiguration && typeof dependencies.initialConfiguration === 'object'
    ? dependencies.initialConfiguration
    : {}
  let enabled = initial.enabled === true
  let providers = providerShape(initial.providers || {})
  let dynamicWindowMs = Math.max(1, Math.min(24 * 30, finiteInteger(initial.dynamicTaskWindowHours, 48))) * 60 * 60 * 1_000
  let activeLease = 0
  let leaseSequence = 0
  let packageSequence = 0
  let topologySequence = 0
  let topologyFingerprint = ''
  let currentPackage = emptyPackage(providers)
  let lastDraft = null
  const lastDraftRevisionByProducer = new Map()
  let lastSemantic = semanticPackage(currentPackage)
  let disposed = false
  let preflightInFlight = null
  let unknownTimer = null
  let visibilityTimer = null
  let nextVisibilityTransitionAt = 0
  const unknownEvidence = new Map()
  const archiveTombstones = new Map()
  // Dynamic Provider observations stay process-private. Public snapshots are
  // rebuilt from this retained graph and expose roots plus aggregate counts
  // only; child/family/relation identities never cross the bridge.
  const nodeStore = new Map()
  const relationStore = new Map()
  const waitingClearBarriers = new Map()
  const codexBranchEvidence = new Map()
  const packageListeners = new Set()
  const pauseReceipts = new Map()
  const attentionSeen = {
    input: new Set(),
    completedUnread: new Set()
  }
  const claudeReadAcknowledgements = new Map()
  const consumerAcknowledgements = new Map()
  const commandResults = new Map()
  const commandQueues = new Map()
  const attentionQueues = {
    input: Promise.resolve(),
    completedUnread: Promise.resolve()
  }
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
    openTarget: (target, request) => actions.open({
      key: target.key,
      target,
      trustedResolvedTarget: request?.trustedResolvedTarget === true,
      source: request?.source || 'task-cycle',
      operationId: request?.operationId
    })
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

  function clearVisibilityTimer() {
    if (visibilityTimer) clearTimer(visibilityTimer)
    visibilityTimer = null
    nextVisibilityTransitionAt = 0
  }

  function attentionInstance(kind, task) {
    if (!task) return ''
    const enteredAt = Math.max(
      finiteInteger(task.statusEnteredAt),
      finiteInteger(task.terminalAt),
      finiteInteger(task.turnStartedAt),
      finiteInteger(task.revisionAt)
    )
    return enteredAt > 0 ? `${kind}:${task.key}:${enteredAt}` : ''
  }

  function pruneAttentionProgress(packageValue = currentPackage) {
    for (const kind of ['input', 'completedUnread']) {
      const valid = new Set((packageValue.views.attentionKeys[kind] || []).map((key) => (
        attentionInstance(kind, packageValue.tasks.find((task) => task.key === key))
      )).filter(Boolean))
      for (const instance of attentionSeen[kind]) if (!valid.has(instance)) attentionSeen[kind].delete(instance)
    }
  }

  function markAttentionOpened(task) {
    if (!task) return
    for (const kind of ['input', 'completedUnread']) {
      if (!currentPackage.views.attentionKeys[kind].includes(task.key)) continue
      const instance = attentionInstance(kind, task)
      if (instance) attentionSeen[kind].add(instance)
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

  function acknowledgeOpenedTask(task, result) {
    markAttentionOpened(task)
    if (result?.confirmsRead !== true) return
    if (task?.provider !== 'claude' || task.phase !== 'completed' || task.unread !== true) return
    const epoch = taskTerminalEpoch(task)
    if (!epoch) return
    claudeReadAcknowledgements.set(task.key, epoch)
    commitLocalTaskState(task, { unread: false, unreadKnown: true }, 'claude-open-read-hint')
  }

  function finalizeCanonicalTask(task) {
    const anchor = visibilityAnchor(task)
    const next = { ...task }
    if (providerTraits(next.provider).readAcknowledgements && next.unread === true) {
      const acknowledgedEpoch = finiteInteger(claudeReadAcknowledgements.get(next.key))
      const terminalEpoch = taskTerminalEpoch(next)
      if (acknowledgedEpoch && terminalEpoch <= acknowledgedEpoch) next.unread = false
      else if (terminalEpoch > acknowledgedEpoch) claudeReadAcknowledgements.delete(next.key)
    }
    return finalizeTask({
      ...next,
      dynamicEligible: anchor > 0 && anchor + dynamicWindowMs > now()
    })
  }

  function codexBranchDecisionForTask(task) {
    if (task?.provider !== 'codex') return null
    const evidence = codexBranchEvidence.get(task.key)
    // Parent observationGeneration orders package transport only. A later
    // public draft cannot invalidate still-current per-branch live evidence;
    // the branch merge owns causal replacement through Turn epochs and real
    // event sequences. Re-applying a second timestamp-only guard here would
    // split that authority and reject valid providers that omit Turn time.
    if (!evidence) return null
    return evidence
  }

  function applyCodexBranchDecision(task) {
    const evidence = codexBranchDecisionForTask(task)
    if (!evidence) return task
    const decision = evidence.decision
    const unreadEvidenceCurrent = evidence.generation >= finiteInteger(task.observationGeneration)
    const next = {
      ...task,
      observationGeneration: Math.max(finiteInteger(task.observationGeneration), evidence.generation),
      ...(decision.unreadOutcome === 'decided' && unreadEvidenceCurrent
        ? {
            unreadKnown: decision.unreadKnown === true,
            unread: decision.unreadKnown === true && decision.unread === true,
            unreadRevision: Math.max(finiteInteger(task.unreadRevision), evidence.generation)
          }
        : {})
    }
    if (decision.outcome === 'abstain' || !isKnownTaskPhase(decision.phase)) {
      return next
    }
    const phaseChanged = decision.phase !== task.phase
    const terminal = isTerminalTaskPhase(decision.phase)
    const nonterminal = isLiveTaskPhase(decision.phase)
    return {
      ...next,
      phase: decision.phase,
      freshness: decision.freshness,
      idleConfirmed: decision.idleConfirmed === true,
      phaseRevision: Math.max(finiteInteger(task.phaseRevision), evidence.generation),
      statusEnteredAt: phaseChanged
        ? finiteInteger(decision.transitionAt)
          || finiteInteger(task.statusEnteredAt)
          || finiteInteger(task.phaseRevision)
        : task.statusEnteredAt,
      terminalAt: terminal
        ? finiteInteger(decision.transitionAt)
          || finiteInteger(task.terminalAt)
          || finiteInteger(task.statusEnteredAt)
        : nonterminal ? 0 : task.terminalAt,
      capabilities: nonterminal
        ? { ...task.capabilities, archive: false }
        : task.capabilities
    }
  }

  function scheduleVisibilityTransition() {
    clearVisibilityTimer()
    if (disposed || !enabled || !currentPackage.complete) return
    const currentTime = now()
    let dueAt = 0
    for (const task of currentPackage.tasks) {
      if (!task.dynamicEligible || task.hidden || task.paused || (task.phase === 'stopped' && task.planReady)) continue
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
    for (const listener of packageListeners) {
      try { listener(packageValue) } catch {}
    }
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

  function preparePlanLifecycle(previous, state, evidence, acceptPhase) {
    const next = { ...state }
    if (!previous) {
      if (next.planLifecycleState === 'cleared' && PLAN_CLEAR_REASONS.has(next.planClearReason)) {
        next.planReady = false
        next.paused = false
      } else if (next.planLifecycleState === 'ready') {
        next.planReady = true
        next.planLifecycleRevision = Math.max(1, finiteInteger(next.planLifecycleRevision))
      } else {
        next.planReady = false
        next.planLifecycleRevision = 0
      }
      return applyPauseReceipt(next)
    }
    next.planReady = previous.planReady === true
    next.planLifecycleRevision = finiteInteger(previous.planLifecycleRevision)
    next.planLifecycleState = previous.planLifecycleState || (previous.planReady ? 'ready' : 'unknown')
    next.planClearReason = previous.planClearReason || ''
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
      next.paused = false
      pauseReceipts.delete(evidence.key)
      try { persistPlanPause({ key: evidence.key, planLifecycleRevision: previousRevision, paused: false, updatedAt: now() }) } catch {}
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
      if (revision < previousRevision) return next
      const replaced = revision !== previousRevision
      next.planReady = true
      next.planLifecycleRevision = revision
      next.planLifecycleState = 'ready'
      next.planClearReason = ''
      if (replaced) {
        next.paused = false
        if (pauseReceipts.has(evidence.key)) {
          pauseReceipts.delete(evidence.key)
          try {
            persistPlanPause({
              key: evidence.key,
              planLifecycleRevision: finiteInteger(previous.planLifecycleRevision),
              paused: false,
              updatedAt: now()
            })
          } catch {}
        }
      }
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
    clearUnknownTimer()
    clearVisibilityTimer()
    unknownEvidence.clear()
    nodeStore.clear()
    relationStore.clear()
    waitingClearBarriers.clear()
    codexBranchEvidence.clear()
    attentionSeen.input.clear()
    attentionSeen.completedUnread.clear()
    claudeReadAcknowledgements.clear()
    lastDraftRevisionByProducer.clear()
    lastDraft = null
    const next = emptyPackage(providers)
    next.enabled = enabled
    next.publishedAt = now()
    next.packageRevision = ++packageSequence
    next.topologyRevision = ++topologySequence
    topologyFingerprint = ''
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
    const requestedWindowHours = Number.isFinite(Number(input.dynamicTaskWindowHours))
      ? Math.max(1, Math.min(24 * 30, Math.trunc(Number(input.dynamicTaskWindowHours))))
      : dynamicWindowMs / (60 * 60 * 1_000)
    const nextDynamicWindowMs = requestedWindowHours * 60 * 60 * 1_000
    const windowChanged = dynamicWindowMs !== nextDynamicWindowMs
    const changed = enabled !== nextEnabled || !sameProviders(providers, nextProviders)
    enabled = nextEnabled
    providers = nextProviders
    dynamicWindowMs = nextDynamicWindowMs
    if (changed) {
      beginNavigation()
      invalidate(enabled ? 'provider-configuration-changed' : 'disabled')
    } else if (windowChanged && currentPackage.tasks.length) {
      refreshCanonicalTasks('dynamic-window-changed')
    }
    return changed || windowChanged
  }

  function syncConsumers(packageValue) {
    pruneAttentionProgress(packageValue)
    const retainedKeys = new Set(packageValue.tasks.map((task) => task.key))
    for (const key of claudeReadAcknowledgements.keys()) if (!retainedKeys.has(key)) claudeReadAcknowledgements.delete(key)
    const actionTargets = packageValue.tasks.map(actionTargetForTask)
    actions.sync({
      enabled,
      providers,
      ready: packageValue.complete,
      targets: actionTargets,
      focusedKey: packageValue.focusedKey,
      attentionKeys: packageValue.views.attentionKeys.archive
    })
    navigation.sync({
      lease: navigationLease,
      enabled,
      providers,
      ready: packageValue.complete,
      // Direct row open remains available from the hidden/paused page; only
      // selector-owned cycleKeys and attentionKeys exclude those tasks.
      targets: actionTargets,
      cycleKeys: packageValue.views.cycleKeys
    })
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

  /** The Kernel is the sole owner of root state aggregation. Topology supplies
   * membership only; it never interprets phase, unread, Plan or capabilities. */
  function aggregateKernelRoot(root, members) {
    const activityPhase = aggregateMemberPhase(members)
    const unread = aggregateMemberUnread(members)
    const liveCount = members.filter((node) => isLiveTaskPhase(node.phase)).length
    const attentionCount = members.filter((node) => isAttentionTaskPhase(node.phase)).length
    const errorCount = members.filter((node) => node.error === true).length
    const planReady = root.planReady === true
    // A completed unread Plan first appears as completed-unread. Once the
    // exact unread lane says it was read, the still-present Plan card is the
    // next required user action and therefore becomes waiting-input. A new
    // running/waiting member always wins immediately while Plan readiness is
    // retained as an independent lifecycle.
    const phase = planReady && isTerminalTaskPhase(activityPhase) && unread.known && !unread.value
      ? 'waiting-input'
      : activityPhase
    const statusEnteredAt = phase === 'waiting-input' && phase !== activityPhase
      ? Math.max(finiteInteger(root.planLifecycleRevision), finiteInteger(root.statusEnteredAt), finiteInteger(root.terminalAt))
      : Math.max(...members.filter((node) => node.phase === activityPhase).map((node) => finiteInteger(node.statusEnteredAt)), 0)
    const capabilities = { ...(root.capabilities || {}) }
    if (liveCount > 0 || isLiveTaskPhase(phase)) capabilities.archive = false
    return {
      ...root,
      phase,
      unreadKnown: unread.known,
      unread: unread.value,
      revisionAt: Math.max(...members.map((node) => finiteInteger(node.revisionAt)), finiteInteger(root.revisionAt)),
      statusEnteredAt,
      turnStartedAt: Math.max(...members.map((node) => finiteInteger(node.turnStartedAt)), 0),
      terminalAt: isLiveTaskPhase(phase) ? 0 : Math.max(...members.map((node) => finiteInteger(node.terminalAt)), 0),
      capabilities,
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
    const currentLanes = normalizeSourceLaneGenerations(
      currentPackage.sourceLaneGenerations,
      currentPackage.sourceGenerations
    )
    const topology = buildCompanionTaskTopology({
      nodes: [...nodeStore.values()],
      relations: [...relationStore.values()],
      generationFloor: Object.fromEntries(PROVIDERS.map((provider) => [provider, currentLanes[provider].topology]))
    })
    const tasks = topology.rootGroups.map(({ root, members }) => {
      const finalized = publicRootTask(finalizeCanonicalTask(aggregateKernelRoot(root, members)))
      return assignSemanticRevision(previousPublicByKey.get(finalized.key), finalized).task
    }).sort(compareByLatestQuestion)
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
    const semantic = semanticPackage(next)
    if (semantic === lastSemantic) return currentPackage
    next.packageRevision = ++packageSequence
    next.publishedAt = now()
    currentPackage = next
    lastSemantic = semantic
    syncConsumers(next)
    emitPackage(next)
    scheduleVisibilityTransition()
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'private-graph-commit',
      outcome: reason,
      packageRevision: next.packageRevision,
      count: next.tasks.length
    })
    return next
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
    const semantic = semanticPackage(next)
    if (semantic === lastSemantic) {
      scheduleVisibilityTransition()
      return currentPackage
    }
    next.packageRevision = ++packageSequence
    next.publishedAt = now()
    currentPackage = next
    lastSemantic = semantic
    syncConsumers(next)
    emitPackage(next)
    scheduleVisibilityTransition()
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'local-state-commit',
      outcome: reason,
      packageRevision: next.packageRevision,
      count: next.tasks.length
    })
    return next
  }

  function refreshCanonicalTasks(reason) {
    if (!nodeStore.size) return publishLocalTasks(currentPackage.tasks.map(finalizeCanonicalTask), reason)
    for (const [key, task] of nodeStore) nodeStore.set(key, finalizeCanonicalTask(task))
    return publishPrivateTopology(reason)
  }

  function codexBranchPhase(branch) {
    if (branch.liveCurrent) {
      if (branch.activeFlags.includes('waitingOnApproval')) return 'waiting-approval'
      if (branch.activeFlags.includes('waitingOnUserInput')) return 'waiting-input'
      return 'running'
    }
    if (branch.goalCurrent && branch.goalStatus === 'active') return 'running'
    if (branch.exactTerminal && branch.idleConfirmed) {
      return branch.lastTurnStatus === 'completed' ? 'completed' : 'stopped'
    }
    return 'unknown'
  }

  function syncCodexBranchGraph(key, branches, complete, generation) {
    const root = nodeStore.get(key)
    if (!root) return
    const family = root.family || `codex:${key}`
    const retainedChildren = new Set()
    for (const branch of branches) {
      if (branch.branchKind !== 'side') continue
      const childKey = `codex-child:${branch.ref}`
      retainedChildren.add(childKey)
      const revisionAt = Math.max(
        1,
        finiteInteger(branch.transitionAt),
        finiteInteger(branch.observedAt),
        finiteInteger(branch.turnStartedAt),
        generation
      )
      nodeStore.set(childKey, {
          ...root,
          key: childKey,
          kind: 'topology-child',
          role: 'child',
          family,
          standaloneEligible: false,
          phase: codexBranchPhase(branch),
          actionAlias: '',
          capabilityToken: '',
          revisionAt,
          observationGeneration: generation,
          membershipRevision: generation,
          phaseRevision: Math.max(finiteInteger(branch.observedAt), finiteInteger(branch.transitionAt), generation),
          unreadRevision: Math.max(finiteInteger(branch.observedAt), generation),
          visibilityRevision: generation,
          statusEnteredAt: finiteInteger(branch.transitionAt),
          turnStartedAt: finiteInteger(branch.turnStartedAt),
          terminalAt: finiteInteger(branch.terminalAt),
          metadataRevision: generation,
          freshness: codexBranchPhase(branch) === 'unknown' ? 'verifying' : 'fresh',
          lastQuestionAt: finiteInteger(branch.turnStartedAt),
          createdAt: 0,
          hidden: false,
          unreadKnown: branch.unreadKnown === true,
          unread: branch.unreadKnown === true && branch.hasUnreadTurn === true,
          planImplementation: false,
          planReady: false,
          planLifecycleRevision: 0,
          paused: false,
          turnMode: 'unknown',
          idleConfirmed: branch.idleConfirmed === true,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: false, archive: false, pause: false, resume: false, executePlan: false },
          causalKey: branch.turnStartedAt
            ? `${branch.ref}:${finiteInteger(branch.turnStartedAt)}`
            : '',
          causalReliable: finiteInteger(branch.turnStartedAt) > 0,
          displayName: undefined,
          projectKey: undefined,
          projectName: undefined,
          projectKind: undefined,
          archiveRequest: undefined,
          topology: undefined
      })
      const relation = normalizeRelation({
          childKey,
          parentKey: key,
          provider: 'codex',
          family,
          relation: 'side-thread',
          authority: 'codex-app-server-inventory',
          exact: branch.topologyExact === true,
          generation
      })
      if (relation) relationStore.set(relationStoreKey(relation), relation)
    }
    if (complete) {
      for (const [childKey, node] of nodeStore) {
        if (node.provider !== 'codex' || node.role !== 'child' || node.family !== family || retainedChildren.has(childKey)) continue
        nodeStore.delete(childKey)
        for (const [relationKey, relation] of relationStore) {
          if (relation.childKey === childKey) relationStore.delete(relationKey)
        }
      }
    }
  }

  function refreshCodexBranchGraphs() {
    for (const [key, evidence] of codexBranchEvidence) {
      if (!nodeStore.has(key)) continue
      nodeStore.set(key, finalizeCanonicalTask(applyCodexBranchDecision(nodeStore.get(key))))
      syncCodexBranchGraph(key, evidence.branches, true, evidence.generation)
    }
  }

  function publishCodexBranchEvidence(input = {}) {
    if (disposed) return currentPackage
    const generation = finiteInteger(input.generation)
    if (!generation) return currentPackage
    const currentByKey = new Map(currentPackage.tasks.map((task) => [task.key, task]))
    let accepted = false
    for (const value of Array.isArray(input.parents) ? input.parents : []) {
      if (!value || typeof value !== 'object') continue
      const key = typeof value.key === 'string' && value.key.length > 0 && value.key.length <= 256 ? value.key : ''
      if (!key) continue
      const previous = codexBranchEvidence.get(key)
      if (previous && generation < previous.generation) continue
      const incomingBranches = (Array.isArray(value.branches) ? value.branches : [])
        .map(normalizeCodexBranchEvidenceV4)
        .filter(Boolean)
      if (!incomingBranches.length) continue
      const previousBranches = new Map((previous?.branches || []).map((branch) => [branch.ref, branch]))
      const branches = value.complete === false && previous
        ? new Map(previousBranches)
        : new Map()
      for (const branch of incomingBranches) {
        branches.set(branch.ref, mergeCodexBranchEvidenceV4(previousBranches.get(branch.ref), branch))
      }
      const task = nodeStore.get(key) || currentByKey.get(key)
      const goalAuthorityCleared = previous?.previousNonterminalAuthority === 'goal'
        && [...branches.values()].every((branch) => branch.goalStatus === 'none' && branch.goalFreshness === 'fresh')
      const currentNonterminal = goalAuthorityCleared
        ? ''
        : isRetainableTaskPhase(task?.phase)
          ? task.phase
          : previous?.previousNonterminalPhase
      const decision = reduceCodexParentBranchEvidenceV4({
        previousPhase: goalAuthorityCleared ? 'unknown' : task?.phase,
        previousNonterminalPhase: currentNonterminal,
        branches: [...branches.values()]
      })
      const previousNonterminalPhase = isRetainableTaskPhase(decision.phase)
        ? decision.phase
        : goalAuthorityCleared ? '' : currentNonterminal || previous?.previousNonterminalPhase || ''
      const previousNonterminalAuthority = decision.reason === 'goal-active'
        || decision.reason === 'goal-active-verifying'
        || decision.reason.startsWith('goal-paused')
        || decision.reason.startsWith('goal-blocked')
        || decision.reason.startsWith('goal-usageLimited')
        || decision.reason.startsWith('goal-budgetLimited')
        ? 'goal'
        : decision.reason === 'branch-running'
          || decision.reason === 'branch-waiting-input'
          || decision.reason === 'branch-waiting-approval'
          ? 'turn'
          : goalAuthorityCleared
            ? ''
            : previous?.previousNonterminalAuthority || ''
      const diagnosticSignature = JSON.stringify({
        outcome: decision.outcome,
        phase: decision.phase,
        reason: decision.reason,
        freshness: decision.freshness,
        unreadOutcome: decision.unreadOutcome,
        unreadKnown: decision.unreadKnown,
        unread: decision.unread,
        details: decision.details
      })
      if (diagnosticSignature !== previous?.diagnosticSignature) {
        record({
          level: 'info',
          scope: 'task-kernel',
          event: 'parent-state-decision',
          outcome: decision.outcome,
          provider: 'codex',
          taskRef: key,
          phase: decision.phase || 'unknown',
          reason: decision.reason,
          beforePhase: task?.phase || 'unknown',
          afterPhase: decision.phase || 'unknown',
          beforeUnread: task?.unread === true,
          afterUnread: decision.unread === true,
          observationGeneration: generation,
          details: { ...decision.details }
        })
      }
      codexBranchEvidence.set(key, {
        generation,
        branches: [...branches.values()],
        decision,
        diagnosticSignature,
        previousNonterminalPhase,
        previousNonterminalAuthority,
        observedAt: Math.max(0, ...[...branches.values()].map((branch) => finiteInteger(branch.observedAt)))
      })
      if (nodeStore.has(key)) {
        nodeStore.set(key, finalizeCanonicalTask(applyCodexBranchDecision(nodeStore.get(key))))
        syncCodexBranchGraph(key, [...branches.values()], value.complete !== false, generation)
      }
      accepted = true
    }
    if (!accepted || !currentPackage.tasks.length || input.deferPublish === true) return currentPackage
    return publishPrivateTopology('codex-provider-evidence', {
      sourceGenerations: {
        ...currentPackage.sourceGenerations,
        codex: Math.max(finiteInteger(currentPackage.sourceGenerations.codex), generation)
      },
      sourceLaneGenerations: {
        ...currentPackage.sourceLaneGenerations,
        codex: {
          ...currentPackage.sourceLaneGenerations.codex,
          phase: Math.max(finiteInteger(currentPackage.sourceLaneGenerations.codex.phase), generation),
          unread: Math.max(finiteInteger(currentPackage.sourceLaneGenerations.codex.unread), generation),
          topology: Math.max(finiteInteger(currentPackage.sourceLaneGenerations.codex.topology), generation)
        }
      }
    })
  }

  function waitingPhaseBlocked(incoming) {
    if (!isAttentionTaskPhase(incoming.phase)) return false
    const barrier = waitingClearBarriers.get(incoming.key)
    if (!barrier) return false
    if (incoming.causalReliable && incoming.causalKey && barrier.causalReliable
      && incoming.causalKey === barrier.causalKey) return true
    if (incoming.causalReliable && incoming.causalKey && barrier.causalReliable
      && incoming.causalKey !== barrier.causalKey) return false
    return incoming.phaseRevision <= barrier.phaseRevision
  }

  function recordWaitingClearBarrier(previous, incoming, incomingLanes, currentLanes) {
    if (!previous || !isAttentionTaskPhase(previous.phase) || isAttentionTaskPhase(incoming.phase)) return
    const provider = incoming.provider
    const phaseAdvanced = incomingLanes[provider].phase > currentLanes[provider].phase
      || incoming.phaseRevision > previous.phaseRevision
      || incoming.turnStartedAt > previous.turnStartedAt
    if (!phaseAdvanced) return
    const causalKey = previous.causalKey || ''
    waitingClearBarriers.set(previous.key, {
      causalKey,
      causalReliable: previous.causalReliable === true && Boolean(causalKey),
      phaseRevision: Math.max(previous.phaseRevision, incoming.phaseRevision),
      generation: Math.max(incomingLanes[provider].phase, currentLanes[provider].phase)
    })
  }

  function reconcileTask(previous, incoming, draft, forceUnknown, incomingLanes, currentLanes) {
    if (!previous) {
      if (waitingPhaseBlocked(incoming)) {
        incoming.phase = 'unknown'
        incoming.freshness = 'verifying'
      }
      if (incoming.phase !== 'unknown') unknownEvidence.delete(incoming.key)
      let next = preparePlanLifecycle(null, incoming, incoming, true)
      next = migrateLegacyHiddenPlan(next)
      next = applyCodexBranchDecision(next)
      next = finalizeCanonicalTask(next)
      if (incoming.phase === 'unknown') next.freshness = 'verifying'
      return { ...assignSemanticRevision(null, next), verifying: next.freshness === 'verifying' }
    }

    const provider = incoming.provider
    const membershipAdvanced = incomingLanes[provider].membership > currentLanes[provider].membership
    const phaseAdvanced = incomingLanes[provider].phase > currentLanes[provider].phase
    const unreadAdvanced = incomingLanes[provider].unread > currentLanes[provider].unread
    const acceptMembership = incoming.metadataPartial !== true && laneIsNewer(
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

    // Same-revision conflicts are the one case the lane counters cannot order,
    // and they used to be settled by two hardcoded direction pairs: terminal→
    // running, and waiting→terminal. Those are two of the four quadrants the
    // shared causal core already decides, so the tie-break now delegates to it.
    // Both Providers get one rule, and the two directions that were never
    // written by hand — live↔live and terminal↔terminal — are covered too, which
    // is what a single-branch Provider like Claude was missing entirely.
    if (acceptPhase && !phaseAdvanced
      && incoming.phaseRevision === previous.phaseRevision
      && !phaseEvidenceSupersedes(taskPhaseObservation(previous), taskPhaseObservation(incoming))) {
      acceptPhase = false
    }
    if (acceptPhase && waitingPhaseBlocked(incoming)) acceptPhase = false

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

    let next = { ...previous }
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
        family: incoming.family,
        role: incoming.role,
        standaloneEligible: incoming.standaloneEligible,
        error: incoming.error,
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
      recordWaitingClearBarrier(previous, incoming, incomingLanes, currentLanes)
      Object.assign(next, {
        phase: incoming.phase,
        phaseRevision: incoming.phaseRevision,
        statusEnteredAt: incoming.statusEnteredAt,
        planImplementation: incoming.planImplementation,
        turnMode: incoming.turnMode,
        idleConfirmed: incoming.idleConfirmed,
        turnStartedAt: incoming.turnStartedAt,
        terminalAt: incoming.terminalAt,
        causalKey: incoming.causalObserved ? incoming.causalKey : previous.causalKey,
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
    }
    next = preparePlanLifecycle(previous, next, incoming, acceptPhase)
    next.planImplementation = next.planReady === true
      && isAttentionTaskPhase(next.phase)
      && incoming.planImplementation === true
    next = migrateLegacyHiddenPlan(next)
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
    next = applyCodexBranchDecision(next)
    const finalized = finalizeCanonicalTask(next)
    return { ...assignSemanticRevision(previous, finalized), verifying: verifying || finalized.freshness === 'verifying' }
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
    // A draft that carries no membership observation — an App Server event, a
    // phase-only push — asserts nothing about the inventory. Reading its absent
    // lane as zero would make it look strictly older than every real read and
    // silently reshape membership, so an unstated lane means "unchanged".
    for (const provider of PROVIDERS) {
      if (incomingLaneGenerations[provider].membership === 0) {
        incomingLaneGenerations[provider].membership = currentLaneGenerations[provider].membership
      }
    }
    const staleMembershipProviders = new Set(PROVIDERS.filter((provider) => {
      if (!enabledProviders.has(provider)) return false
      const incomingGeneration = incomingLaneGenerations[provider].membership
      const currentGeneration = currentLaneGenerations[provider].membership
      return incomingGeneration > 0 && currentGeneration > 0 && incomingGeneration < currentGeneration
    }))
    const batches = Object.fromEntries(PROVIDERS.map((provider) => [provider, normalizeEvidenceBatch(
      draft.evidenceBatches?.[provider],
      provider,
      draft,
      producer
    )]))
    const previousPrivateByKey = new Map(nodeStore)
    const previousPublicByKey = new Map(currentPackage.tasks.map((task) => [task.key, task]))
    const incomingNodes = []
    const incomingKeys = new Set()
    for (const provider of PROVIDERS) {
      for (const value of batches[provider].nodes) {
        const incoming = normalizeEvidenceNode(value, provider, enabledProviders)
        if (!incoming || incomingKeys.has(incoming.key)) continue
        const existing = previousPrivateByKey.get(incoming.key)
        if (existing && existing.provider !== incoming.provider) continue
        incomingKeys.add(incoming.key)
        incomingNodes.push(incoming)
      }
    }
    const nextNodeStore = new Map(nodeStore)
    for (const provider of PROVIDERS) {
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
          if (task?.provider === provider) nextNodeStore.delete(key)
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
      const previous = previousPrivateByKey.get(incoming.key)
      if (!previous && staleMembershipProviders.has(incoming.provider)) continue
      const reconciled = reconcileTask(
        previous,
        incoming,
        draft,
        forceUnknown,
        incomingLaneGenerations,
        currentLaneGenerations
      )
      nextNodeStore.set(incoming.key, reconciled.task)
    }
    const retainedKeys = new Set(nextNodeStore.keys())
    for (const task of previousPrivateByKey.values()) {
      if (retainedKeys.has(task.key) || !enabledProviders.has(task.provider)) continue
      if (providerTraits(task.provider).branchTopology) codexBranchEvidence.delete(task.key)
      if (!pauseReceipts.has(task.key)) continue
      pauseReceipts.delete(task.key)
      try {
        persistPlanPause({
          key: task.key,
          planLifecycleRevision: task.planLifecycleRevision,
          paused: false,
          updatedAt: now()
        })
      } catch {}
    }

    const nextRelationStore = new Map(relationStore)
    const incomingRelations = PROVIDERS.flatMap((provider) => batches[provider].relations)
      .map(normalizeRelation)
      .filter(Boolean)
    for (const provider of PROVIDERS) {
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
      for (const childKey of batch.removedRelationChildKeys) {
        for (const [key, relation] of nextRelationStore) {
          if (relation.provider === provider && relation.childKey === childKey) nextRelationStore.delete(key)
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
    refreshCodexBranchGraphs()

    const materialized = materializePrivateTopology(previousPublicByKey)
    const nextTasks = materialized.tasks
    const freshness = materialized.freshness
    const nextTopologyRevision = materialized.topologyRevision
    lastDraft = draft
    if (!forceUnknown) scheduleUnknownCommit(draft)
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
      complete: draft.complete === true,
      freshness,
      focusedKey,
      sourceGenerations: Object.fromEntries(PROVIDERS.map((provider) => [
        provider,
        Math.max(finiteInteger(currentPackage.sourceGenerations?.[provider]), finiteInteger(draft.sourceGenerations?.[provider]))
      ])),
      sourceLaneGenerations: Object.fromEntries(PROVIDERS.map((provider) => [provider, Object.fromEntries(
        SOURCE_LANES.map((lane) => [lane, Math.max(
          currentLaneGenerations[provider][lane],
          incomingLaneGenerations[provider][lane]
        )])
      )])),
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
      scheduleVisibilityTransition()
      return currentPackage
    }
    next.packageRevision = ++packageSequence
    currentPackage = next
    lastSemantic = semantic
    syncConsumers(next)
    emitPackage(currentPackage)
    scheduleVisibilityTransition()
    return currentPackage
  }

  function attach(input = {}) {
    if (disposed) return { revision: COMPANION_TASK_KERNEL_REVISION, lease: 0, retained: false, ready: false, package: currentPackage }
    configure(input)
    activeLease = ++leaseSequence
    if (enabled && !currentPackage.complete) void ensureReady().catch(() => undefined)
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
    if (enabled && !currentPackage.complete) void ensureReady().catch(() => undefined)
    return currentPackage
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
    const removed = currentPackage.tasks.filter((task) => task.provider === provider && requested.has(task.key))
    if (removed.some((task) => finiteInteger(task.topology?.liveCount) > 0)) {
      return { outcome: 'failed', errorCode: 'active-members', message: '仍有活动子任务，不能归档根任务' }
    }
    const topology = buildCompanionTaskTopology({
      nodes: [...nodeStore.values()],
      relations: [...relationStore.values()],
      generationFloor: Object.fromEntries(PROVIDERS.map((candidate) => [
        candidate,
        finiteInteger(currentPackage.sourceLaneGenerations?.[candidate]?.topology)
      ]))
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
      if (providerTraits(provider).branchTopology) codexBranchEvidence.delete(key)
      waitingClearBarriers.delete(key)
      if ((publicTask || privateTask) && pauseReceipts.has(key)) {
        pauseReceipts.delete(key)
        try {
          persistPlanPause({
            key,
            planLifecycleRevision: finiteInteger(publicTask?.planLifecycleRevision || privateTask?.planLifecycleRevision),
            paused: false,
            updatedAt: now()
          })
        } catch {}
      }
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

  /**
   * Readiness for one Kernel action.
   *
   * `complete` means every enabled Provider lane has settled — the only
   * membership guarantee previous/next and the attention entries need: hot and
   * trusted dispatches directly, and only cold start, reconnect or an explicit
   * membership gap waits for the tasks-only inventory. `verifying` is a
   * per-task phase qualifier (an interrupted edge or an unknown Claude session
   * still under confirmation), not a membership gap. Open-only selectors
   * therefore dispatch from the complete process package even while a phase is
   * verifying. Treating whole-package `verifying` as stale used to force the
   * full cold read under the 5-second timeout, so one unknown Claude session
   * turned every global shortcut into a slow or silently failing preflight.
   * Mutations (archive/pause/resume/execute) keep the exact-target freshness
   * requirement because they act on the phase itself.
   */
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
    if (!preflight) throw new Error('preflight-unavailable')
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
    const operation = Promise.race([
      Promise.resolve().then(() => preflight({ providers: { ...providers } })),
      timeout
    ]).then((draft) => {
      const accepted = commitDraft(draft)
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
    return currentPackage.tasks.find((task) => task.key === key) || null
  }

  function ephemeralOpenTarget(key, actionAlias = '') {
    if (typeof key !== 'string' || !key || key.length > 256) return null
    const enabledProviders = providerSet(providers)
    const inferred = key.startsWith('claude:')
      ? 'claude'
      : /^[a-f0-9]{32}$/i.test(key) || /^ct_/i.test(actionAlias)
        ? 'codex'
        : enabledProviders.size === 1 ? [...enabledProviders][0] : ''
    if (!inferred || !enabledProviders.has(inferred)) return null
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
    const run = attentionQueues[kind].catch(() => undefined).then(async () => {
      pruneAttentionProgress()
      const keys = currentPackage.views.attentionKeys[kind]
      const candidates = keys.map(taskForKey).filter(Boolean)
      if (!candidates.length) {
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
      let task = candidates.find((candidate) => {
        const instance = attentionInstance(kind, candidate)
        return instance && !attentionSeen[kind].has(instance)
      })
      if (!task) {
        attentionSeen[kind].clear()
        task = candidates[0]
      }
      const result = await navigation.open({
        key: task.key,
        target: actionTargetForTask(task),
        source: input.source || 'attention-shortcut',
        operationId: input.operationId
      })
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched') acknowledgeOpenedTask(task, result)
      return result
    })
    attentionQueues[kind] = run.then(() => undefined, () => undefined)
    return run
  }

  async function dispatchLegacyIntent(input = {}) {
    if (disposed || !enabled) return { outcome: 'unavailable', errorCode: 'disabled', message: '任务功能未启用' }
    const dispatchStartedAt = now()
    try {
      const targetKey = ['open', 'archive', 'pause', 'resume', 'execute-plan'].includes(input.action)
        && typeof input.key === 'string'
        ? input.key
        : ''
      // Navigation commands consume one already-published immutable snapshot.
      // A previous/next/open operation must never trigger a Provider refresh
      // that also changes phase, unread or topology as a side effect.
      if (['archive', 'pause', 'resume', 'execute-plan', 'archive-focused'].includes(input.action)) {
        await ensureReady(targetKey, {
          action: input.action
        })
      } else if (!currentPackage.complete) {
        return { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '任务缓存尚未就绪，请稍后重试' }
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
    if (input.action === 'open') {
      const task = taskForKey(input.key)
      const target = task
        ? actionTargetForTask(task)
        : ephemeralOpenTarget(input.key)
      if (!target) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      const result = await navigation.open({
        key: target.key,
        target,
        trustedResolvedTarget: !task,
        source: input.source || 'manual-row-open',
        operationId: input.operationId
      })
      if (task && (result?.outcome === 'opened' || result?.outcome === 'dispatched')) acknowledgeOpenedTask(task, result)
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
        message: pausing ? 'Plan 已暂停并移入已隐藏区' : 'Plan 已恢复到待继续列表'
      }
    }
    if (input.action === 'execute-plan') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.executePlan || finiteInteger(input.planLifecycleRevision) !== task.planLifecycleRevision) {
        return { outcome: 'failed', errorCode: 'state-changed', message: 'Plan 状态已变化，当前不能执行' }
      }
      const result = await actions.executePlan({
        key: task.key,
        planLifecycleRevision: task.planLifecycleRevision,
        source: input.source || 'execute-plan-button',
        operationId: input.operationId,
        target: actionTargetForTask(task)
      })
      if (result?.outcome === 'executed') {
        if (task.paused) writePauseReceipt(task, false)
        commitLocalTaskState(task, {
          phase: 'running',
          freshness: 'fresh',
          statusEnteredAt: now(),
          terminalAt: 0,
          idleConfirmed: false,
          planReady: false,
          planImplementation: false,
          planLifecycleState: 'cleared',
          planClearReason: 'execution-start',
          planLifecycleRevision: Math.max(task.planLifecycleRevision + 1, now()),
          paused: false
        }, 'execute-started')
      }
      return result
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
      return { outcome: 'updated', key }
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
    const previous = commandQueues.get(key) || Promise.resolve()
    const operation = previous.catch(() => undefined).then(() => executeCommand(command))
    commandQueues.set(key, operation)
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
    // The feature code is the only way a log reader can tell which silent
    // uTools entry was pressed; it is a fixed plugin identifier, never content.
    record({
      level: 'info',
      scope: 'task-kernel',
      event: 'shortcut-enter',
      outcome: intent.action,
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
      code: errorCode,
      source: intent.source,
      packageRevision: currentPackage.packageRevision,
      details: { featureCode: code, action: intent.action }
    })
    void dispatch(intent).then((result) => {
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched' || result?.errorCode === 'superseded') return
      reportFailure(typeof result?.errorCode === 'string' && result.errorCode ? result.errorCode : 'failed')
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
      consumerAcknowledgements: Object.fromEntries(consumerAcknowledgements),
      preflightInFlight: Boolean(preflightInFlight),
      codexBranchParentCount: codexBranchEvidence.size,
      codexBranchCount: [...codexBranchEvidence.values()].reduce((total, value) => total + value.branches.length, 0),
      nextVisibilityTransitionAt,
      freshness: currentPackage.freshness,
      navigation: navigation.diagnostics(),
      actions: actions.diagnostics()
    }
  }

  function close() {
    if (disposed) return
    disposed = true
    clearUnknownTimer()
    clearVisibilityTimer()
    packageListeners.clear()
    commandResults.clear()
    commandQueues.clear()
    consumerAcknowledgements.clear()
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
    /** Host-only private branch evidence; branch refs never cross Renderer APIs. */
    publishCodexBranchEvidence,
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
  COMPANION_TASK_KERNEL_REVISION,
  TASK_PHASES,
  isKnownTaskPhase,
  isSettledTaskPhase,
  COMPANION_TASK_PACKAGE_REVISION,
  COMPANION_TASK_COMMAND_REVISION,
  COMPANION_TASK_SUBSCRIBE_REVISION,
  COMPANION_TASK_ACK_REVISION,
  PREFLIGHT_PROGRESS_MS,
  PREFLIGHT_TIMEOUT_MS,
  UNKNOWN_GRACE_MS,
  reduceCodexTaskEvidenceV4,
  reduceCodexTaskEvidenceV3,
  reduceCodexParentBranchEvidenceV4,
  reduceClaudeTaskEvidenceV4,
  createCompanionHostRegistry,
  createCompanionTaskKernel
}
