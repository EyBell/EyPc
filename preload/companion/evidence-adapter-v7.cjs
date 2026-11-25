'use strict'

const {
  CODEX_THREAD_STATUSES,
  CODEX_GOAL_STATUSES,
  COMPANION_V7_REVISIONS,
  COMPANION_EVIDENCE_CHANNELS_V7
} = require('./contracts-v7.cjs')
const { PROVIDERS: PROVIDER_ORDER } = require('./provider-registry.cjs')

const PROVIDERS = new Set(PROVIDER_ORDER)
const ACTIVITY_KINDS = new Set([
  'turn-running',
  'turn-completed',
  'turn-interrupted',
  'turn-failed',
  'unknown'
])
const INTERACTION_KINDS = new Set(['user-input', 'approval', 'plan-choice', 'plan-implementation'])
const PLAN_STATES = new Set(['unknown', 'available', 'executing', 'consumed', 'cancelled', 'removed'])
const PLAN_REASONS = new Set(['', 'cancel', 'execution-start', 'archive', 'removal'])

function integer(value) {
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function record(value) {
  return value && typeof value === 'object' ? value : {}
}

function selectCodexGoalEvidenceV7(desktop, cached) {
  if (!desktop || cached?.explicitlyCleared) return cached
  // A qualified ephemeral owner can explicitly lack Goal support, or carry
  // an unreadable Goal field. Both observations are scoped to this member.
  if (!desktop.goalUpdatedAt) return desktop
  if (integer(cached?.goalUpdatedAt) > desktop.goalUpdatedAt
    || cached?.goalUpdatedAt === desktop.goalUpdatedAt
      && cached.goalEvidenceSequence >= desktop.goalEvidenceSequence) return cached
  return desktop
}

function activityFromPhaseV7(phase, options = {}) {
  if (phase === 'running') return 'turn-running'
  if (phase === 'completed') return 'turn-completed'
  if (phase === 'stopped') return 'turn-interrupted'
  if (phase === 'waiting-input' || phase === 'waiting-approval') {
    return options.underlyingActivity === 'running' ? 'turn-running' : 'turn-completed'
  }
  if (options.unread === true) return 'turn-completed'
  return 'unknown'
}

const CODEX_TERMINAL_ACTIVITY = Object.freeze({
  completed: 'turn-completed',
  interrupted: 'turn-interrupted',
  failed: 'turn-failed'
})

function codexTurnCandidateV7(branch, turn, live, flags) {
  const terminalKind = CODEX_TERMINAL_ACTIVITY[turn.lastTurnStatus]
  const exactTerminal = terminalKind && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(turn.lastTurnEvidence)
  const inventoryTerminal = terminalKind && turn.lastTurnEvidence === 'inventory'
  const running = live && (turn.lastTurnStatus === 'inProgress' || !flags.length && !branch.groupActivityConfirmed)
    && branch.connectorOnly !== true && !exactTerminal
  if (!running && !exactTerminal && !inventoryTerminal) return null

  const sourceSequence = running ? turn.activeEvidenceSequence : turn.terminalEvidenceSequence
  const causalSequence = Number.isSafeInteger(sourceSequence) && sourceSequence > 0 ? sourceSequence : 0
  const startedAt = integer(turn.turnStartedAt)
  const observedAt = integer(branch.observedAt)
  const terminalAt = running ? 0 : integer(turn.terminalAt) || (inventoryTerminal ? startedAt : 0)
  const transitionAt = turn === branch ? integer(branch.transitionAt) : 0
  return {
    kind: running ? 'turn-running' : terminalKind,
    authority: running && branch.activityEvidence === 'activity-event' ? 'live-turn' : exactTerminal ? 'terminal' : 'inventory',
    causalKey: turn.causalKey,
    causalDomain: turn.causalDomain,
    turnPredecessorKey: turn.turnPredecessorKey,
    causalSequence,
    exact: Boolean(running || exactTerminal),
    sequence: integer(sourceSequence) || (inventoryTerminal && !running ? startedAt : 0) || observedAt,
    observedAt,
    statusEnteredAt: transitionAt || (running ? integer(branch.waitingSince) : terminalAt) || startedAt,
    turnStartedAt: startedAt,
    terminalAt,
    turnStartedAtPrecisionMs: turn.turnStartedAtPrecisionMs,
    terminalAtPrecisionMs: turn.terminalAtPrecisionMs,
    ...(turn === branch && branch.ordinarySideInterruptedAt > 0 && branch.branchKind === 'side'
      && terminalKind === 'turn-interrupted' && exactTerminal && !flags.length && !branch.planImplementationOnly
      && branch.goalFreshness === 'fresh' && ['none', 'complete'].includes(branch.goalStatus)
      ? { ordinarySideInterruptedAt: integer(branch.ordinarySideInterruptedAt) } : {}),
    ...(inventoryTerminal && branch.branchKind === 'main' && branch.hostExternal !== true && terminalKind === 'turn-completed'
      && turn.turnStartedAtSource === 'inventory' && turn.turnRef && startedAt > 0
      && !flags.length && !branch.planImplementationOnly
      && branch.goalStatus === 'none' && branch.goalFreshness === 'fresh' ? { inventoryRootCompletion: true } : {})
  }
}

function codexBranchObservationV7(value = {}) {
  const branch = record(value)
  const flags = Array.isArray(branch.activeFlags) ? branch.activeFlags : []
  const activeSequence = integer(branch.activeEvidenceSequence)
  const terminalSequence = integer(branch.terminalEvidenceSequence)
  const goalSequence = integer(branch.goalEvidenceSequence)
  const exactTerminal = CODEX_TERMINAL_ACTIVITY[branch.lastTurnStatus]
    && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(branch.lastTurnEvidence)
  const terminalNewer = exactTerminal && terminalSequence > 0 && activeSequence > 0
    && terminalSequence > activeSequence
  const hostExternalLive = branch.hostExternal === true && !exactTerminal
  const liveAuthority = branch.statusAuthority === 'desktop-live'
    || branch.statusAuthority === 'app-server-live'
    || branch.statusAuthority === 'persisted-decision'
    || hostExternalLive
  const hasLiveShape = branch.activityEvidence === 'activity-event'
    || activeSequence > 0 || flags.length > 0 || branch.planImplementationOnly === true || hostExternalLive
  const hostSettled = branch.hostExternal === true && exactTerminal && flags.length === 0
  const live = branch.status === 'active' && liveAuthority && !hostSettled && !terminalNewer && hasLiveShape
  const candidates = [codexTurnCandidateV7(branch, branch, live, flags)]
  if (branch.competingTurn) candidates.push(codexTurnCandidateV7(branch, branch.competingTurn,
    branch.competingTurn.lastTurnStatus === 'inProgress', flags))
  const activityCandidates = candidates.filter(Boolean)
  const interactionKind = live && flags.includes('waitingOnApproval')
    ? 'approval'
    : live && flags.includes('waitingOnUserInput')
      ? branch.planImplementationOnly === true ? 'plan-implementation' : 'user-input'
      : ''
  const sequence = Math.max(
    integer(branch.observedAt),
    integer(branch.transitionAt),
    integer(branch.waitingSince),
    activeSequence,
    terminalSequence,
    goalSequence,
    integer(branch.goalUpdatedAt),
    integer(branch.turnStartedAt),
    integer(branch.terminalAt)
  )
  const planAvailable = branch.planReady === true || branch.planImplementationOnly === true
  const planCleared = branch.planLifecycleState === 'cleared'
    && ['cancel', 'execution-start', 'archive', 'removal'].includes(branch.planClearReason)
  const planState = planAvailable
    ? 'available'
    : planCleared
      ? branch.planClearReason === 'cancel' ? 'cancelled'
        : branch.planClearReason === 'execution-start' ? 'executing'
          : 'removed'
      : 'unknown'
  const planSequence = planAvailable || planCleared
    ? integer(branch.planLifecycleRevision) || sequence
    : 0
  return {
    codexState: {
      threadStatus: CODEX_THREAD_STATUSES.includes(branch.status) ? branch.status : 'unknown',
      groupActivityConfirmed: branch.groupActivityConfirmed === true,
      submissionPending: branch.submissionPending === true,
      orderedTurnStart: branch.orderedTurnStart === true,
      ...(branch.emptyTurnHistory === true ? { emptyTurnHistory: true } : {}),
      goal: {
        status: CODEX_GOAL_STATUSES.includes(branch.goalStatus) ? branch.goalStatus : 'unknown',
        freshness: branch.goalFreshness === 'fresh' ? 'fresh' : 'verifying',
        observed: ['app-server', 'desktop', 'pending', 'external'].includes(branch.goalSource)
          || branch.goalStatus !== undefined && branch.goalStatus !== 'unknown',
        updatedAt: integer(branch.goalUpdatedAt),
        sequence: goalSequence
      }
    },
    kind: 'unknown',
    exact: false,
    candidates: activityCandidates.length ? activityCandidates : [{
      kind: 'unknown',
      authority: 'unknown',
      causalKey: typeof branch.causalKey === 'string' ? branch.causalKey : undefined,
      causalDomain: typeof branch.causalDomain === 'string' ? branch.causalDomain : undefined,
      causalSequence: 0,
      exact: false,
      sequence,
      observedAt: integer(branch.observedAt),
      statusEnteredAt: integer(branch.transitionAt),
      turnStartedAt: integer(branch.turnStartedAt),
      terminalAt: integer(branch.terminalAt)
    }],
    sequence,
    statusEnteredAt: integer(branch.transitionAt) || integer(branch.waitingSince),
    turnStartedAt: integer(branch.turnStartedAt),
    terminalAt: integer(branch.terminalAt),
    unreadKnown: branch.unreadKnown === true,
    unread: branch.unreadKnown === true && branch.hasUnreadTurn === true,
    unreadSequence: Math.max(integer(branch.observedAt), terminalSequence, sequence),
    interactionKind,
    interactionSequence: Math.max(integer(branch.waitingSince), activeSequence, sequence),
    planState,
    planSequence,
    planActionable: planAvailable,
    planReason: planCleared ? branch.planClearReason : ''
  }
}

function claudeSessionObservationV7(value = {}, unread = false) {
  const session = record(value)
  const kind = activityFromPhaseV7(session.phase, {
    underlyingActivity: session.activityPhase,
    unread
  })
  const interactionKind = session.phase === 'waiting-approval'
    ? 'approval'
    : session.phase === 'waiting-input' ? 'user-input' : ''
  const sequence = Math.max(
    integer(session.stateGeneration),
    integer(session.phaseUpdatedAt),
    integer(session.turnStartedAt),
    integer(session.lastStopAt),
    integer(session.lastActivityAt)
  )
  return {
    kind,
    exact: kind !== 'unknown',
    candidates: [{
      kind,
      authority: 'live-turn',
      exact: kind !== 'unknown',
      sequence,
      observedAt: sequence,
      statusEnteredAt: integer(session.waitingApprovalAt)
        || integer(session.waitingInputAt)
        || integer(session.lastStopAt)
        || integer(session.phaseUpdatedAt)
        || integer(session.turnStartedAt),
      turnStartedAt: integer(session.turnStartedAt),
      terminalAt: kind === 'turn-completed' || kind === 'turn-interrupted'
        ? integer(session.lastStopAt) || integer(session.phaseUpdatedAt)
        : 0
    }],
    sequence,
    statusEnteredAt: integer(session.waitingApprovalAt)
      || integer(session.waitingInputAt)
      || integer(session.lastStopAt)
      || integer(session.phaseUpdatedAt)
      || integer(session.turnStartedAt),
    turnStartedAt: integer(session.turnStartedAt),
    terminalAt: kind === 'turn-completed' || kind === 'turn-interrupted'
      ? integer(session.lastStopAt) || integer(session.phaseUpdatedAt)
      : 0,
    unreadKnown: typeof unread === 'boolean',
    unread: unread === true,
    unreadSequence: sequence,
    interactionKind,
    interactionSequence: integer(session.waitingApprovalAt)
      || integer(session.waitingInputAt)
      || sequence,
    planState: 'unknown',
    planSequence: 0,
    planActionable: false,
    planReason: ''
  }
}

function cursorSessionObservationV7(value = {}, hookValue = {}) {
  const session = record(value)
  const hook = record(hookValue)
  const subagents = Array.isArray(session.subagents) ? session.subagents.map(record) : []
  let kind = 'unknown'
  const liveFork = subagents.some((child) => integer(child.unfinishedRunAt) > 0)
  const liveSession = integer(session.unfinishedRunAt) > 0
  const hookTerminal = hook.phase === 'completed' || hook.phase === 'stopped'
  // An open Hook Turn beats disk, including `completed`. Cursor 3.27 keeps
  // composerData.status=completed until the next persist, so that value is
  // not a stale-turn proof. A stale turn is one the hook fold already closed.
  // A hook terminal fold beats leftover session unfinishedRunAt; a live fork
  // still keeps the parent running.
  if (liveFork || (!hookTerminal && liveSession) || hook.turnOpen === true) kind = 'turn-running'
  else if (hook.phase === 'completed' || session.hasUnreadMessages === true || session.diskStatus === 'completed') kind = 'turn-completed'
  else if (hook.phase === 'stopped' || session.diskStatus === 'aborted') kind = 'turn-interrupted'
  else if (session.hasPendingPlan === true) kind = 'turn-completed'
  const sequence = Math.max(
    integer(hook.lastEventAt),
    integer(hook.turnStartedAt),
    integer(hook.lastStopAt),
    integer(session.unfinishedRunAt),
    integer(session.lastUpdatedAt),
    integer(session.createdAt)
  )
  // Cursor's own "needs your decision" flag (AskQuestion / plan questions /
  // terminal approval) is an exact open user-input interaction, not an
  // ambiguity: the Kernel shows 待输入 and the deeplink jumps straight to it.
  // Cursor never distinguishes approval from a question at this layer, so
  // `waiting-approval` is still never invented (RAW-206).
  const blockingDecision = session.hasBlockingPendingActions === true
  return {
    kind,
    exact: kind !== 'unknown',
    candidates: [{
      kind,
      authority: 'live-turn',
      exact: kind !== 'unknown',
      sequence,
      observedAt: sequence,
      statusEnteredAt: Math.max(integer(hook.lastEventAt), integer(session.lastUpdatedAt)),
      turnStartedAt: integer(hook.turnStartedAt) || integer(session.unfinishedRunAt),
      terminalAt: kind === 'turn-completed' || kind === 'turn-interrupted'
        ? integer(hook.lastStopAt) || integer(hook.lastEventAt) || integer(session.lastUpdatedAt)
        : 0
    }],
    sequence,
    statusEnteredAt: Math.max(integer(hook.lastEventAt), integer(session.lastUpdatedAt)),
    turnStartedAt: integer(hook.turnStartedAt) || integer(session.unfinishedRunAt),
    terminalAt: kind === 'turn-completed' || kind === 'turn-interrupted'
      ? integer(hook.lastStopAt) || integer(hook.lastEventAt) || integer(session.lastUpdatedAt)
      : 0,
    unreadKnown: true,
    unread: session.hasUnreadMessages === true,
    unreadSequence: integer(session.lastUpdatedAt) || sequence,
    interactionKind: blockingDecision ? 'user-input' : '',
    interactionSequence: blockingDecision ? sequence : 0,
    planState: session.hasPendingPlan === true ? 'available' : 'unknown',
    planSequence: session.hasPendingPlan === true ? sequence : 0,
    planActionable: session.hasPendingPlan === true,
    planReason: ''
  }
}

function orcaSessionObservationV7(value = {}, options = {}) {
  const session = record(value)
  const extra = record(options)
  const state = typeof session.state === 'string' ? session.state.trim().toLowerCase() : ''
  let kind = 'unknown'
  if (state === 'working' || state === 'waiting' || state === 'blocked') kind = 'turn-running'
  else if (state === 'interrupted') kind = 'turn-interrupted'
  else if (state === 'done') kind = 'turn-completed'
  const lastUpdatedAt = integer(session.lastUpdatedAt)
  const stateStartedAt = integer(session.stateStartedAt)
  // Turn epoch is when Orca entered this state, not last tool output and not
  // worktree createdAt. Using lastUpdatedAt as running turnStartedAt made each
  // poll a newer live Turn, so a later `done` with an older createdAt could
  // never close 进行中.
  const turnStartedAt = stateStartedAt || lastUpdatedAt || integer(session.createdAt)
  // acceptedAt is poll time. Folding it into sequence made every 1s inventory
  // look newer than the question, so sort/status clocks drifted while the
  // model was still answering.
  const sequence = Math.max(lastUpdatedAt, stateStartedAt, turnStartedAt)
  const acceptedAt = integer(extra.acceptedAt)
  const terminalAt = kind === 'turn-completed' || kind === 'turn-interrupted'
    ? Math.max(lastUpdatedAt, stateStartedAt, turnStartedAt)
    : 0
  const interactionKind = kind === 'turn-running'
    && ['user-input', 'plan-implementation'].includes(session.interactionKind)
    ? session.interactionKind : ''
  return {
    kind,
    exact: kind !== 'unknown',
    authority: 'inventory',
    candidates: [{
      kind,
      authority: 'inventory',
      exact: kind !== 'unknown',
      sequence,
      observedAt: sequence,
      statusEnteredAt: sequence,
      turnStartedAt,
      terminalAt
    }],
    sequence,
    statusEnteredAt: sequence,
    turnStartedAt,
    terminalAt,
    unreadKnown: true,
    unread: session.unread === true,
    unreadSequence: Math.max(sequence, acceptedAt),
    interactionKind,
    interactionSequence: interactionKind ? sequence : 0,
    planState: 'unknown',
    planSequence: 0,
    planActionable: false,
    planReason: ''
  }
}

function createEvidenceNodeV7(input = {}) {
  const source = record(input)
  const provider = PROVIDERS.has(source.provider) ? source.provider : ''
  const key = typeof source.key === 'string' && source.key.length > 0 && source.key.length <= 256 ? source.key : ''
  const observation = record(source.observation)
  if (!provider || !key) return null
  const kind = ACTIVITY_KINDS.has(observation.kind) ? observation.kind : 'unknown'
  const planState = PLAN_STATES.has(observation.planState) ? observation.planState : 'unknown'
  const planReason = PLAN_REASONS.has(observation.planReason) ? observation.planReason : ''
  const sequence = integer(observation.sequence)
  const goalActivity = provider === 'codex'
    && (observation.authority === 'goal' || observation.authority === 'goal-verifying')
  const candidates = (Array.isArray(observation.candidates) ? observation.candidates : [])
    .map((candidate) => {
      const value = record(candidate)
      const goalCandidate = provider === 'codex'
        && (value.authority === 'goal' || value.authority === 'goal-verifying')
      const causalSequence = Object.prototype.hasOwnProperty.call(value, 'causalSequence')
        ? value.causalSequence : value.sequence
      return {
        kind: ACTIVITY_KINDS.has(value.kind) ? value.kind : 'unknown',
        authority: ['goal-verifying', 'goal', 'live-turn', 'terminal', 'inventory', 'unknown'].includes(value.authority)
          ? value.authority
          : 'unknown',
        causalKey: goalCandidate ? '' : typeof value.causalKey === 'string'
          ? value.causalKey
          : typeof source.causalKey === 'string' ? source.causalKey : '',
        causalDomain: goalCandidate ? '' : typeof value.causalDomain === 'string'
          ? value.causalDomain
          : typeof source.causalDomain === 'string' ? source.causalDomain : '',
        causalSequence: Number.isSafeInteger(causalSequence) && causalSequence > 0 ? causalSequence : 0,
        sequence: integer(value.sequence),
        exact: value.exact === true,
        observedAt: integer(value.observedAt),
        statusEnteredAt: integer(value.statusEnteredAt),
        turnStartedAt: integer(value.turnStartedAt),
        terminalAt: integer(value.terminalAt),
        ...(provider === 'codex' && [1, 1000].includes(value.turnStartedAtPrecisionMs)
          ? { turnStartedAtPrecisionMs: value.turnStartedAtPrecisionMs } : {}),
        ...(provider === 'codex' && [1, 1000].includes(value.terminalAtPrecisionMs)
          ? { terminalAtPrecisionMs: value.terminalAtPrecisionMs } : {}),
        ...(typeof value.turnPredecessorKey === 'string' && value.turnPredecessorKey
          ? { turnPredecessorKey: value.turnPredecessorKey.slice(0, 160) } : {}),
        ...(value.inventoryRootCompletion === true ? { inventoryRootCompletion: true } : {}),
        ...(value.ordinarySideInterruptedAt > 0 ? { ordinarySideInterruptedAt: integer(value.ordinarySideInterruptedAt) } : {})
      }
    })
  return {
    key,
    provider,
    family: typeof source.family === 'string' ? source.family : `${provider}:${key}`,
    role: source.role === 'child' ? 'child' : 'root',
    membership: 'present',
    ...(provider === 'codex' && source.activityRebase && typeof source.activityRebase === 'object'
      ? { activityRebase: {
          expectedCausalKey: source.activityRebase.expectedCausalKey,
          expectedPhaseRevision: source.activityRebase.expectedPhaseRevision,
          causalDomain: source.activityRebase.causalDomain,
          snapshotRevision: source.activityRebase.snapshotRevision
        } }
      : {}),
    activity: {
      kind,
      authority: ['goal-verifying', 'goal', 'live-turn', 'terminal', 'inventory', 'unknown'].includes(observation.authority)
        ? observation.authority
        : 'unknown',
      causalKey: goalActivity ? '' : typeof source.causalKey === 'string' ? source.causalKey : '',
      causalDomain: goalActivity ? '' : typeof source.causalDomain === 'string' ? source.causalDomain : '',
      causalSequence: Number.isSafeInteger(observation.sequence) && observation.sequence > 0 ? observation.sequence : 0,
      sequence,
      exact: observation.exact === true,
      observedAt: integer(source.observedAt) || sequence,
      statusEnteredAt: integer(observation.statusEnteredAt),
      turnStartedAt: integer(observation.turnStartedAt),
      terminalAt: integer(observation.terminalAt),
      ...(candidates.length ? { candidates } : {}),
      ...(provider === 'codex' && observation.codexState ? { codexState: observation.codexState } : {})
    },
    unread: {
      known: observation.unreadKnown === true,
      value: observation.unreadKnown === true && observation.unread === true,
      sequence: integer(observation.unreadSequence)
    },
    planArtifact: {
      revision: COMPANION_V7_REVISIONS.planArtifact,
      state: planState,
      sequence: integer(observation.planSequence),
      actionable: planState === 'available' && observation.planActionable === true,
      reason: planReason
    },
    metadata: {
      ...record(source.metadata),
      partial: source.metadataPartial === true
    },
    capabilities: [...new Set((Array.isArray(source.capabilities) ? source.capabilities : [])
      .filter((name) => typeof name === 'string'))],
    standaloneEligible: source.standaloneEligible !== false,
    error: source.error === true
  }
}

function createInteractionEvidenceV7(input = {}) {
  const source = record(input)
  if (!PROVIDERS.has(source.provider) || !INTERACTION_KINDS.has(source.kind)) return null
  const sequence = integer(source.sequence)
  if (!sequence || typeof source.taskKey !== 'string' || typeof source.interactionRef !== 'string') return null
  return {
    revision: COMPANION_V7_REVISIONS.interaction,
    provider: source.provider,
    taskKey: source.taskKey,
    branchRef: typeof source.branchRef === 'string' && source.branchRef ? source.branchRef : 'root',
    interactionRef: source.interactionRef,
    kind: source.kind,
    state: source.state === 'resolved' || source.state === 'cancelled' || source.state === 'execution-started'
      ? source.state
      : 'opened',
    sequence,
    turnEpoch: integer(source.turnEpoch),
    requestSetRevision: integer(source.requestSetRevision) || sequence,
    authority: ['provider-live', 'provider-snapshot', 'host-command', 'rollout'].includes(source.authority)
      ? source.authority
      : 'provider-live',
    exact: source.exact === true
  }
}

function createInteractionSetV7(input = {}) {
  const source = record(input)
  const requestSetRevision = integer(source.requestSetRevision)
  if (!PROVIDERS.has(source.provider) || typeof source.taskKey !== 'string' || !requestSetRevision) return null
  return {
    revision: COMPANION_V7_REVISIONS.interaction,
    provider: source.provider,
    taskKey: source.taskKey,
    requestSetRevision,
    complete: source.complete === true
  }
}

function createEvidenceBatchV7(input = {}) {
  const source = record(input)
  const provider = PROVIDERS.has(source.provider) ? source.provider : ''
  if (!provider) return null
  const laneGenerations = record(source.laneGenerations)
  const snapshotLanes = new Set(Array.isArray(source.snapshotLanes) ? source.snapshotLanes : [])
  const completeLanes = new Set(Array.isArray(source.completeLanes) ? source.completeLanes : [])
  const removedKeys = record(source.removedKeys)
  return {
    revision: COMPANION_V7_REVISIONS.providerEvidenceBatch,
    provider,
    channels: Object.fromEntries(COMPANION_EVIDENCE_CHANNELS_V7.map((lane) => [lane, {
      mode: snapshotLanes.has(lane) ? 'snapshot' : 'delta',
      complete: completeLanes.has(lane),
      generation: integer(laneGenerations[lane]),
      removedKeys: Array.isArray(removedKeys[lane]) ? removedKeys[lane] : []
    }])),
    nodes: (Array.isArray(source.nodes) ? source.nodes : []).filter(Boolean),
    interactions: (Array.isArray(source.interactions) ? source.interactions : []).filter(Boolean),
    interactionSets: (Array.isArray(source.interactionSets) ? source.interactionSets : []).filter(Boolean),
    relations: (Array.isArray(source.relations) ? source.relations : []).filter(Boolean),
    relationMode: source.relationsComplete === true ? 'snapshot' : 'delta',
    relationsComplete: source.relationsComplete === true,
    removedRelationChildKeys: Array.isArray(source.removedRelationChildKeys) ? source.removedRelationChildKeys : [],
    health: source.health === 'ready' || source.health === 'degraded' ? source.health : 'unavailable'
  }
}

module.exports = {
  selectCodexGoalEvidenceV7,
  activityFromPhaseV7,
  codexBranchObservationV7,
  claudeSessionObservationV7,
  cursorSessionObservationV7,
  orcaSessionObservationV7,
  createEvidenceNodeV7,
  createInteractionEvidenceV7,
  createInteractionSetV7,
  createEvidenceBatchV7
}
