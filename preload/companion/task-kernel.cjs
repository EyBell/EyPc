'use strict'

const { createCompanionNavigation } = require('./navigation.cjs')
const { createCompanionTaskActions } = require('./task-actions.cjs')
const { finiteInteger, phaseEvidenceSupersedes, mergeEvidenceLanes } = require('./branch-causality.cjs')

const COMPANION_TASK_KERNEL_REVISION = 'companion-task-kernel-v4'
const COMPANION_TASK_PACKAGE_REVISION = 'companion-task-package-v4'
const COMPANION_TASK_DRAFT_REVISION = 'companion-task-draft-v4'
const PREFLIGHT_PROGRESS_MS = 600
const PREFLIGHT_TIMEOUT_MS = 5_000
const UNKNOWN_GRACE_MS = 250
const MAX_TIMER_DELAY_MS = 2_147_483_647
const PROVIDERS = ['codex', 'claude']
const PHASES = ['running', 'waiting-input', 'waiting-approval', 'completed', 'stopped', 'unknown']
const TIERS = ['attention', 'plan', 'active', 'fallback', 'none']
const GROUPS = ['input', 'active', 'stopped', 'unread', 'completed', 'none']
const DRAFT_PRODUCERS = ['renderer', 'host-preflight', 'host-evidence']
const SOURCE_LANES = ['membership', 'phase', 'unread']

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
  const prior = PHASES.includes(value.previousPhase) ? value.previousPhase : 'unknown'
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
  const priorCandidate = PHASES.includes(value.previousNonterminalPhase)
    ? value.previousNonterminalPhase
    : PHASES.includes(value.previousPhase) ? value.previousPhase : 'unknown'
  const previousNonterminalPhase = ['running', 'waiting-input', 'waiting-approval', 'stopped'].includes(priorCandidate)
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
  const sourcePhase = PHASES.includes(value.phase) ? value.phase : 'unknown'
  if (sourcePhase === 'running' || sourcePhase === 'waiting-input' || sourcePhase === 'waiting-approval') {
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
    reason: sourcePhase === 'completed' || sourcePhase === 'stopped' ? 'provider-terminal' : 'unknown-evidence',
    details: { sourcePhase, unread: false }
  }
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

function isLiveTaskPhase(phase) {
  return phase === 'running' || phase === 'waiting-input' || phase === 'waiting-approval'
}

function isTerminalTaskPhase(phase) {
  return phase === 'completed' || phase === 'stopped'
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
  return {
    codex: { membership: 0, phase: 0, unread: 0 },
    claude: { membership: 0, phase: 0, unread: 0 }
  }
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
      result[provider][lane] = lane === 'membership'
        ? finiteInteger(value?.[provider]?.[lane])
        : finiteInteger(value?.[provider]?.[lane], fallback)
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
  if (task.phase === 'waiting-input' || task.phase === 'waiting-approval') {
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
  if (task.phase === 'waiting-input' || task.phase === 'waiting-approval') return 'input'
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
    next.planLifecycleRevision = 0
    next.paused = false
  }
  // A completed Plan remains user-actionable even when Codex does not expose
  // the dedicated Implement Plan request. `planImplementation` controls cycle
  // priority only; it must not disable the row/menu controls. The Host still
  // performs an exact latest-Turn/activity/request preflight before execution.
  const planActionable = next.provider === 'codex'
    && next.planReady
    && ['waiting-input', 'stopped', 'completed'].includes(next.phase)
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
    planReady: task.planReady,
    planLifecycleRevision: task.planLifecycleRevision,
    paused: task.paused,
    turnMode: task.turnMode,
    idleConfirmed: task.idleConfirmed,
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
  const visible = tasks.filter((task) => !task.hidden && !task.paused)
  views.pausedKeys = tasks.filter((task) => task.paused).sort(compareByLatestQuestion).map((task) => task.key)
  const display = [...visible].sort(compareByLatestQuestion)
  for (const task of display) {
    if (task.dynamicGroup !== 'none') views.groups[task.dynamicGroup].push(task.key)
  }
  views.counts.input = visible.filter((task) => task.phase === 'waiting-input' || task.phase === 'waiting-approval').length
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
    .filter((task) => task.capabilities.open && (task.phase === 'waiting-input' || task.phase === 'waiting-approval'))
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
  const initial = dependencies.initialConfiguration && typeof dependencies.initialConfiguration === 'object'
    ? dependencies.initialConfiguration
    : {}
  let enabled = initial.enabled === true
  let providers = providerShape(initial.providers || { codex: true, claude: false })
  let dynamicWindowMs = Math.max(1, Math.min(24 * 30, finiteInteger(initial.dynamicTaskWindowHours, 48))) * 60 * 60 * 1_000
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
  let visibilityTimer = null
  let nextVisibilityTransitionAt = 0
  const unknownEvidence = new Map()
  const archiveTombstones = new Map()
  const codexBranchEvidence = new Map()
  const packageListeners = new Set()
  const pauseReceipts = new Map()
  const attentionSeen = {
    input: new Set(),
    completedUnread: new Set()
  }
  const claudeReadAcknowledgements = new Map()
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
    openCodex: (target, request) => actions.open({
      key: target.key,
      target,
      trustedResolvedTarget: request?.trustedResolvedTarget === true,
      source: request?.source || 'task-cycle',
      operationId: request?.operationId
    }),
    openClaude: (target, request) => actions.open({
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

  function acknowledgeOpenedTask(task) {
    markAttentionOpened(task)
    if (task?.provider !== 'claude' || task.phase !== 'completed' || task.unread !== true) return
    const epoch = taskTerminalEpoch(task)
    if (!epoch) return
    claudeReadAcknowledgements.set(task.key, epoch)
    publishLocalTasks(currentPackage.tasks.map((candidate) => candidate.key === task.key
      ? finalizeCanonicalTask({ ...candidate, unread: false, unreadKnown: true })
      : candidate), 'claude-open-read-hint')
  }

  function finalizeCanonicalTask(task) {
    const anchor = visibilityAnchor(task)
    const next = { ...task }
    if (next.provider === 'claude' && next.unread === true) {
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
    if (decision.outcome === 'abstain' || !PHASES.includes(decision.phase)) {
      return next
    }
    const phaseChanged = decision.phase !== task.phase
    const terminal = decision.phase === 'completed' || decision.phase === 'stopped'
    const nonterminal = decision.phase === 'running'
      || decision.phase === 'waiting-input'
      || decision.phase === 'waiting-approval'
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
      publishLocalTasks(currentPackage.tasks.map(finalizeCanonicalTask), 'visibility-transition')
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
      if (next.turnMode === 'default' && next.turnStartedAt > 0) {
        next.planReady = false
        next.planLifecycleRevision = 0
      }
      return applyPauseReceipt(next)
    }
    next.planReady = previous.planReady === true
    next.planLifecycleRevision = finiteInteger(previous.planLifecycleRevision)
    next.paused = previous.paused === true
    if (!acceptPhase) return next
    const exactDefaultExecution = evidence.provider === 'codex'
      && evidence.turnMode === 'default'
      && evidence.turnStartedAt > 0
    if (exactDefaultExecution) {
      next.planReady = false
      next.planLifecycleRevision = 0
      next.paused = false
      pauseReceipts.delete(evidence.key)
      try { persistPlanPause({ key: evidence.key, planLifecycleRevision: finiteInteger(previous.planLifecycleRevision), paused: false, updatedAt: now() }) } catch {}
      return next
    }
    if (evidence.planReady === true || evidence.planImplementation === true) {
      const explicitRevision = finiteInteger(evidence.planLifecycleRevision)
      // Provider lifecycle identity outranks generic metadata timestamps. If a
      // compatibility input omits it, retain the established Plan identity and
      // use causal times only for first establishment.
      const revision = explicitRevision || finiteInteger(previous.planLifecycleRevision) || Math.max(
        1,
        finiteInteger(evidence.turnStartedAt),
        finiteInteger(evidence.statusEnteredAt),
        finiteInteger(evidence.revisionAt)
      )
      const replaced = revision !== finiteInteger(previous.planLifecycleRevision)
      next.planReady = true
      next.planLifecycleRevision = revision
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
      publishLocalTasks(currentPackage.tasks.map(finalizeCanonicalTask), 'dynamic-window-changed')
    }
    return changed || windowChanged
  }

  function syncConsumers(packageValue) {
    pruneAttentionProgress(packageValue)
    const retainedKeys = new Set(packageValue.tasks.map((task) => task.key))
    for (const key of claudeReadAcknowledgements.keys()) if (!retainedKeys.has(key)) claudeReadAcknowledgements.delete(key)
    const actionTargets = packageValue.tasks.map(targetFromTask)
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
      const task = currentByKey.get(key)
      const goalAuthorityCleared = previous?.previousNonterminalAuthority === 'goal'
        && [...branches.values()].every((branch) => branch.goalStatus === 'none' && branch.goalFreshness === 'fresh')
      const currentNonterminal = goalAuthorityCleared
        ? ''
        : ['running', 'waiting-input', 'waiting-approval', 'stopped'].includes(task?.phase)
          ? task.phase
          : previous?.previousNonterminalPhase
      const decision = reduceCodexParentBranchEvidenceV4({
        previousPhase: goalAuthorityCleared ? 'unknown' : task?.phase,
        previousNonterminalPhase: currentNonterminal,
        branches: [...branches.values()]
      })
      const previousNonterminalPhase = ['running', 'waiting-input', 'waiting-approval', 'stopped'].includes(decision.phase)
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
      accepted = true
    }
    if (!accepted || !currentPackage.tasks.length || input.deferPublish === true) return currentPackage
    const tasks = currentPackage.tasks.map((previous) => {
      const next = finalizeCanonicalTask(applyCodexBranchDecision(previous))
      return assignSemanticRevision(previous, next).task
    })
    return publishLocalTasks(tasks, 'codex-branch-evidence')
  }

  function reconcileTask(previous, incoming, draft, forceUnknown, incomingLanes, currentLanes) {
    if (!previous) {
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
        turnMode: incoming.turnMode,
        idleConfirmed: incoming.idleConfirmed,
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
    next = preparePlanLifecycle(previous, next, incoming, acceptPhase)
    next.planImplementation = next.planReady === true
      && (next.phase === 'waiting-input' || next.phase === 'waiting-approval')
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
    const retainedKeys = new Set(nextTasks.map((task) => task.key))
    for (const task of currentPackage.tasks) {
      if (retainedKeys.has(task.key) || !enabledProviders.has(task.provider)
        || incomingLaneGenerations[task.provider].membership <= currentLaneGenerations[task.provider].membership) continue
      if (task.provider === 'codex') codexBranchEvidence.delete(task.key)
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
      kind: localPin ? 'local-pin' : task.provider === 'claude' ? 'claude-session' : 'codex-thread'
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
      if (provider === 'codex') codexBranchEvidence.delete(key)
      if (task && pauseReceipts.has(key)) {
        pauseReceipts.delete(key)
        try {
          persistPlanPause({
            key,
            planLifecycleRevision: task.planLifecycleRevision,
            paused: false,
            updatedAt: now()
          })
        } catch {}
      }
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
    syncConsumers(next)
    emitPackage(next)
    scheduleVisibilityTransition()
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

  async function ensureReady(targetKey = '') {
    // A verifying branch must not globally block an unrelated exact target
    // whose own evidence and capability are fresh. Selector actions still
    // require a fresh whole package because they choose among many targets.
    const exactTarget = targetKey ? taskForKey(targetKey) : null
    const exactReady = exactTarget?.freshness === 'fresh'
      && exactTarget.capabilities?.open === true
    if (targetKey && currentPackage.complete && exactReady) return currentPackage
    if (!targetKey && currentPackage.complete && currentPackage.freshness === 'fresh') return currentPackage
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
      actionAlias: inferred === 'claude' && !actionAlias && key.startsWith('claude:')
        ? key.slice('claude:'.length)
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
        target: targetFromTask(task),
        source: input.source || 'attention-shortcut',
        operationId: input.operationId
      })
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched') acknowledgeOpenedTask(task)
      return result
    })
    attentionQueues[kind] = run.then(() => undefined, () => undefined)
    return run
  }

  async function dispatch(input = {}) {
    if (disposed || !enabled) return { outcome: 'unavailable', errorCode: 'disabled', message: '任务功能未启用' }
    try {
      const targetKey = ['open', 'archive', 'pause', 'resume', 'execute-plan'].includes(input.action)
        && typeof input.key === 'string'
        ? input.key
        : ''
      // Direct opens are exact-key operations. They must not trigger a broad
      // inventory/classification preflight merely because an alias expired.
      if (input.action !== 'open') await ensureReady(targetKey)
    } catch {
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
        ? targetFromTask(task)
        : ephemeralOpenTarget(input.key, typeof input.expectedActionAlias === 'string' ? input.expectedActionAlias : '')
      if (!target) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      const result = await navigation.open({
        key: target.key,
        target,
        trustedResolvedTarget: !task,
        source: input.source || 'manual-row-open',
        operationId: input.operationId
      })
      if (task && (result?.outcome === 'opened' || result?.outcome === 'dispatched')) acknowledgeOpenedTask(task)
      return result
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
      const tasks = currentPackage.tasks.map((candidate) => candidate.key === task.key
        ? finalizeCanonicalTask({ ...candidate, hidden: false, paused: pausing })
        : candidate)
      publishLocalTasks(tasks, pausing ? 'paused' : 'resumed')
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
        target: targetFromTask(task)
      })
      if (result?.outcome === 'executed' && task.paused) {
        writePauseReceipt(task, false)
        publishLocalTasks(currentPackage.tasks.map((candidate) => candidate.key === task.key
          ? finalizeCanonicalTask({ ...candidate, paused: false })
          : candidate), 'execute-started')
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
    actions.close()
    navigation.dispose()
  }

  return {
    revision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: COMPANION_TASK_PACKAGE_REVISION,
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
    dispatch,
    handleEnter,
    getLatest: () => currentPackage,
    subscribe,
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
  COMPANION_TASK_PACKAGE_REVISION,
  PREFLIGHT_PROGRESS_MS,
  PREFLIGHT_TIMEOUT_MS,
  UNKNOWN_GRACE_MS,
  reduceCodexTaskEvidenceV4,
  reduceCodexTaskEvidenceV3,
  reduceCodexParentBranchEvidenceV4,
  reduceClaudeTaskEvidenceV4,
  createCompanionTaskKernel
}
