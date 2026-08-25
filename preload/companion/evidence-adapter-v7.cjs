'use strict'

const {
  COMPANION_V7_REVISIONS,
  COMPANION_EVIDENCE_CHANNELS_V7
} = require('./contracts-v7.cjs')

const PROVIDERS = new Set(['codex', 'claude', 'cursor'])
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

/**
 * Normalize Codex-private branch facts into provider-neutral evidence. This is
 * vocabulary translation only: no public phase, group, count or cycle is
 * emitted. Interaction and Plan facts remain independent of activity.
 */
function codexBranchObservationV7(value = {}) {
  const branch = record(value)
  const flags = Array.isArray(branch.activeFlags) ? branch.activeFlags : []
  const activeSequence = integer(branch.activeEvidenceSequence)
  const terminalSequence = integer(branch.terminalEvidenceSequence)
  const goalSequence = integer(branch.goalEvidenceSequence)
  const exactTerminal = ['completed', 'interrupted', 'failed'].includes(branch.lastTurnStatus)
    && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(branch.lastTurnEvidence)
  const terminalNewer = exactTerminal && terminalSequence > 0 && activeSequence > 0
    && terminalSequence > activeSequence
  const liveAuthority = branch.statusAuthority === 'desktop-live'
    || branch.statusAuthority === 'app-server-live'
    || branch.statusAuthority === 'persisted-decision'
  const live = branch.status === 'active' && liveAuthority
    && !terminalNewer
    && (branch.activityEvidence === 'activity-event'
      || activeSequence > 0
      || flags.length > 0
      || branch.planImplementationOnly === true)
  const goalFresh = branch.goalFreshness !== 'verifying'
    && branch.goalStatus !== 'unknown'
    && branch.goalStatus !== 'none'
  const goalSuperseded = goalFresh && branch.goalStatus !== 'active' && activeSequence > 0 && (
    integer(branch.turnStartedAt) > integer(branch.goalUpdatedAt)
    || (integer(branch.turnStartedAt) === integer(branch.goalUpdatedAt) && activeSequence > goalSequence)
    || (integer(branch.goalUpdatedAt) === 0 && activeSequence > goalSequence)
  )
  const goalCurrent = goalFresh && !goalSuperseded
  const candidates = []
  if (live) {
    const waiting = flags.includes('waitingOnApproval') || flags.includes('waitingOnUserInput')
    candidates.push({
      kind: waiting ? 'turn-completed' : 'turn-running',
      authority: branch.activityEvidence === 'activity-event' ? 'live-turn' : 'inventory',
      exact: true,
      sequence: activeSequence || integer(branch.observedAt),
      observedAt: integer(branch.observedAt),
      statusEnteredAt: integer(branch.transitionAt) || integer(branch.waitingSince),
      turnStartedAt: integer(branch.turnStartedAt),
      terminalAt: waiting ? integer(branch.transitionAt) || integer(branch.waitingSince) : 0
    })
  }
  if (goalCurrent) {
    const goalKind = branch.goalStatus === 'active' ? 'turn-running'
      : ['paused', 'blocked', 'usageLimited', 'budgetLimited'].includes(branch.goalStatus) ? 'turn-interrupted'
        : branch.goalStatus === 'complete' ? 'turn-completed' : 'unknown'
    if (goalKind !== 'unknown') candidates.push({
      kind: goalKind,
      authority: 'goal',
      exact: true,
      sequence: goalSequence || integer(branch.goalUpdatedAt),
      observedAt: integer(branch.observedAt),
      statusEnteredAt: integer(branch.goalUpdatedAt),
      turnStartedAt: integer(branch.turnStartedAt),
      terminalAt: goalKind === 'turn-running' ? 0 : integer(branch.goalUpdatedAt)
    })
  }
  if (branch.goalFreshness === 'verifying' && branch.goalStatus !== 'none') {
    const liveCandidate = candidates.find((candidate) => (
      candidate.authority === 'live-turn' && candidate.kind === 'turn-running'
    ))
    if (liveCandidate) {
      // A transient Goal read cannot erase an exact, newer Turn start. Mark the
      // same activity as verifying so a terminal candidate cannot win until the
      // Goal authority settles.
      liveCandidate.authority = 'goal-verifying'
      liveCandidate.exact = false
    } else {
      candidates.push({
        kind: 'unknown',
        authority: 'goal-verifying',
        exact: false,
        sequence: goalSequence || integer(branch.goalUpdatedAt) || integer(branch.observedAt),
        observedAt: integer(branch.observedAt),
        statusEnteredAt: integer(branch.goalUpdatedAt),
        turnStartedAt: integer(branch.turnStartedAt),
        terminalAt: 0
      })
    }
  }
  if (exactTerminal) {
    candidates.push({
      kind: branch.lastTurnStatus === 'completed' ? 'turn-completed'
        : branch.lastTurnStatus === 'failed' ? 'turn-failed' : 'turn-interrupted',
      authority: 'terminal',
      exact: true,
      sequence: terminalSequence || integer(branch.observedAt),
      observedAt: integer(branch.observedAt),
      statusEnteredAt: integer(branch.transitionAt) || integer(branch.terminalAt),
      turnStartedAt: integer(branch.turnStartedAt),
      terminalAt: integer(branch.terminalAt)
    })
  } else if (['completed', 'interrupted', 'failed'].includes(branch.lastTurnStatus)
    && branch.lastTurnEvidence === 'inventory') {
    candidates.push({
      kind: branch.lastTurnStatus === 'completed' ? 'turn-completed'
        : branch.lastTurnStatus === 'failed' ? 'turn-failed' : 'turn-interrupted',
      authority: 'inventory',
      exact: false,
      sequence: terminalSequence || integer(branch.turnStartedAt) || integer(branch.observedAt),
      observedAt: integer(branch.observedAt),
      statusEnteredAt: integer(branch.transitionAt) || integer(branch.turnStartedAt),
      turnStartedAt: integer(branch.turnStartedAt),
      terminalAt: integer(branch.terminalAt) || integer(branch.turnStartedAt)
    })
  }
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
    kind: 'unknown',
    exact: false,
    candidates: candidates.length ? candidates : [{
      kind: 'unknown',
      authority: 'unknown',
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
  if (hook.turnOpen === true || subagents.some((child) => integer(child.unfinishedRunAt) > 0)
    || integer(session.unfinishedRunAt) > 0) kind = 'turn-running'
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
  return {
    kind,
    exact: kind !== 'unknown' && session.hasBlockingPendingActions !== true,
    candidates: [{
      kind,
      authority: 'live-turn',
      exact: kind !== 'unknown' && session.hasBlockingPendingActions !== true,
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
    interactionKind: '',
    interactionSequence: 0,
    planState: session.hasPendingPlan === true ? 'available' : 'unknown',
    planSequence: session.hasPendingPlan === true ? sequence : 0,
    planActionable: session.hasPendingPlan === true,
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
  const candidates = (Array.isArray(observation.candidates) ? observation.candidates : [])
    .map((candidate) => {
      const value = record(candidate)
      return {
        kind: ACTIVITY_KINDS.has(value.kind) ? value.kind : 'unknown',
        authority: ['goal-verifying', 'goal', 'live-turn', 'terminal', 'inventory', 'unknown'].includes(value.authority)
          ? value.authority
          : 'unknown',
        causalKey: typeof value.causalKey === 'string'
          ? value.causalKey
          : typeof source.causalKey === 'string' ? source.causalKey : '',
        sequence: integer(value.sequence),
        exact: value.exact === true,
        observedAt: integer(value.observedAt),
        statusEnteredAt: integer(value.statusEnteredAt),
        turnStartedAt: integer(value.turnStartedAt),
        terminalAt: integer(value.terminalAt)
      }
    })
  return {
    key,
    provider,
    family: typeof source.family === 'string' ? source.family : `${provider}:${key}`,
    role: source.role === 'child' ? 'child' : 'root',
    membership: 'present',
    activity: {
      kind,
      authority: ['goal-verifying', 'goal', 'live-turn', 'terminal', 'inventory', 'unknown'].includes(observation.authority)
        ? observation.authority
        : 'unknown',
      causalKey: typeof source.causalKey === 'string' ? source.causalKey : '',
      sequence,
      exact: observation.exact === true,
      observedAt: integer(source.observedAt) || sequence,
      statusEnteredAt: integer(observation.statusEnteredAt),
      turnStartedAt: integer(observation.turnStartedAt),
      terminalAt: integer(observation.terminalAt),
      ...(candidates.length ? { candidates } : {})
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
  activityFromPhaseV7,
  codexBranchObservationV7,
  claudeSessionObservationV7,
  cursorSessionObservationV7,
  createEvidenceNodeV7,
  createInteractionEvidenceV7,
  createInteractionSetV7,
  createEvidenceBatchV7
}
