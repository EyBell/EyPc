'use strict'

const CODEX_DESKTOP_IPC_VERSIONS = {
  'client-status-changed': 0,
  'ipc-connection-reset': 1,
  'thread-stream-state-changed': 11,
  'thread-stream-following-changed': 1,
  'thread-stream-following-status-requested': 1,
  'thread-read-state-changed': 3,
  'thread-archived': 2,
  'thread-unarchived': 1
}

function codexDesktopIpcVersionAccepted(method, version) {
  const expectedVersion = CODEX_DESKTOP_IPC_VERSIONS[method]
  if (!Number.isInteger(expectedVersion)) return true
  return version === expectedVersion
    || method === 'thread-stream-state-changed' && version === 6
    || method === 'thread-read-state-changed' && version === 1
    || method === 'thread-read-state-changed' && version === 2
}

const STREAM_METHOD = 'thread-stream-state-changed'
const RUNTIME_TYPES = Object.freeze(['active', 'idle', 'notLoaded', 'systemError'])
const WAITING_FLAGS = Object.freeze(['waitingOnUserInput', 'waitingOnApproval'])
const TURN_STATUSES = Object.freeze(['inProgress', 'completed', 'failed', 'interrupted'])
const GOAL_STATUSES = Object.freeze(['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'])
const MAX_REQUESTS = 10_000
const MAX_PATCHES = 50_000

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function decision(kind, reason, fields = {}) {
  return {
    kind,
    reason,
    profile: fields.profile || '',
    revision: Number.isSafeInteger(fields.revision) ? fields.revision : null,
    baseRevision: Number.isSafeInteger(fields.baseRevision) ? fields.baseRevision : null,
    legacyUnrevisioned: fields.legacyUnrevisioned === true
  }
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function ownedIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
}

function threadAccepted(context, threadId) {
  try {
    return typeof context.validThreadId === 'function' && context.validThreadId(threadId) === true
  } catch {
    return false
  }
}

function requestAccepted(context, request) {
  try {
    return typeof context.requestSupported === 'function' && context.requestSupported(request) === true
  } catch {
    return false
  }
}

function runtimeAccepted(value) {
  const runtime = plainRecord(value)
  if (!runtime || !RUNTIME_TYPES.includes(runtime.type)) return false
  if (!Object.hasOwn(runtime, 'activeFlags')) return true
  return Array.isArray(runtime.activeFlags)
    && runtime.activeFlags.every((flag) => WAITING_FLAGS.includes(flag))
}

function turnAccepted(value, requireIdentity = false) {
  const turn = plainRecord(value)
  if (!turn || !TURN_STATUSES.includes(turn.status)) return false
  if (requireIdentity) {
    if (typeof turn.turnId !== 'string' || turn.turnId.length === 0) return false
  } else if (Object.hasOwn(turn, 'turnId') && typeof turn.turnId !== 'string') return false
  if (Object.hasOwn(turn, 'turnStartedAtMs') && !Number.isFinite(turn.turnStartedAtMs)) return false
  return true
}

function historyBodyAccepted(value) {
  const body = plainRecord(value)
  if (!body || !Object.hasOwn(body, 'entitiesByKey') || !Object.hasOwn(body, 'islands')) return false
  const entities = plainRecord(body.entitiesByKey)
  return Boolean(entities && Array.isArray(body.islands) && Object.values(entities).every((turn) => turnAccepted(turn, true)))
}

function historyAccepted(value) {
  if (value === null) return true
  const history = plainRecord(value)
  return Boolean(history && history.kind === 'canonical' && historyBodyAccepted(history.history))
}

function snapshotAccepted(state, context) {
  if (!runtimeAccepted(state.threadRuntimeStatus)) return 'runtime-invalid'
  if (!Array.isArray(state.requests)) return 'requests-missing'
  if (state.requests.length > MAX_REQUESTS || state.requests.some((request) => !requestAccepted(context, request))) {
    return 'request-unsupported'
  }
  if (Object.hasOwn(state, 'turns')) {
    if (!Array.isArray(state.turns) || state.turns.some((turn) => !turnAccepted(turn))) return 'turns-invalid'
  }
  if (Object.hasOwn(state, 'turnHistory') && !historyAccepted(state.turnHistory)) return 'history-invalid'
  if (Object.hasOwn(state, 'hasUnreadTurn') && typeof state.hasUnreadTurn !== 'boolean') return 'unread-invalid'
  if (Object.hasOwn(state, 'sideConversation') && typeof state.sideConversation !== 'boolean') return 'side-invalid'
  if (Object.hasOwn(state, 'ephemeral') && typeof state.ephemeral !== 'boolean') return 'ephemeral-invalid'
  if (Object.hasOwn(state, 'threadGoal') && state.threadGoal !== null) {
    const goal = plainRecord(state.threadGoal)
    if (!goal || !GOAL_STATUSES.includes(goal.status)) return 'goal-invalid'
    if (Object.hasOwn(goal, 'updatedAt') && !Number.isFinite(goal.updatedAt)) return 'goal-invalid'
  }
  return ''
}

function pathAccepted(path) {
  return Array.isArray(path) && path.length > 0 && path.length <= 64 && path.every((segment) => (
    typeof segment === 'string' && segment.length > 0 || nonNegativeInteger(segment)
  ))
}

function patchedTurnValueAccepted(path, value) {
  const root = path[0]
  if (root !== 'turns' && root !== 'turnHistory') return true
  if (root === 'turns') {
    if (path.length === 1) return Array.isArray(value) && value.every((turn) => turnAccepted(turn))
    if (path.length === 2) return turnAccepted(value)
    if (path.length === 3 && path[2] === 'status') return TURN_STATUSES.includes(value)
    if (path.length === 3 && path[2] === 'turnId') return typeof value === 'string'
    if (path.length === 3 && path[2] === 'turnStartedAtMs') return Number.isFinite(value)
    return true
  }
  if (path.length === 1) return historyAccepted(value)
  if (path.length === 2 && path[1] === 'kind') return value === 'canonical'
  if (path.length === 2 && path[1] === 'history') return historyBodyAccepted(value)
  if (path.length === 3 && path[2] === 'entitiesByKey') {
    const entities = plainRecord(value)
    return Boolean(entities && Object.values(entities).every((turn) => turnAccepted(turn, true)))
  }
  if (path.length === 4 && path[2] === 'entitiesByKey') return turnAccepted(value, true)
  if (path.length === 5 && path[2] === 'entitiesByKey' && path[4] === 'status') return TURN_STATUSES.includes(value)
  if (path.length === 5 && path[2] === 'entitiesByKey' && path[4] === 'turnId') return typeof value === 'string'
  if (path.length === 5 && path[2] === 'entitiesByKey' && path[4] === 'turnStartedAtMs') return Number.isFinite(value)
  return true
}

function valueGoalAccepted(value) {
  if (value === null) return true
  const goal = plainRecord(value)
  if (!goal || !GOAL_STATUSES.includes(goal.status)) return false
  return !Object.hasOwn(goal, 'updatedAt') || Number.isFinite(goal.updatedAt)
}

function patchCriticalAccepted(patch, context) {
  const path = patch.path
  const root = path[0]
  if (root === 'threadRuntimeStatus') {
    if (path.length === 1) return patch.op !== 'remove' && runtimeAccepted(patch.value)
    if (path[1] === 'type') return path.length === 2 && patch.op !== 'remove' && RUNTIME_TYPES.includes(patch.value)
    if (path[1] === 'activeFlags' && path.length === 2) {
      return patch.op === 'remove' || Array.isArray(patch.value)
        && patch.value.every((flag) => WAITING_FLAGS.includes(flag))
    }
    if (path[1] === 'activeFlags' && path.length === 3) return patch.op === 'remove' || WAITING_FLAGS.includes(patch.value)
    return true
  }
  if (root === 'requests') {
    if (path.length === 1) {
      return patch.op === 'remove' || Array.isArray(patch.value) && patch.value.length <= MAX_REQUESTS
        && patch.value.every((request) => requestAccepted(context, request))
    }
    if (path.length === 2) return patch.op === 'remove' || requestAccepted(context, patch.value)
    return true
  }
  if (root === 'threadGoal') {
    if (path.length === 1) return patch.op === 'remove' || valueGoalAccepted(patch.value)
    if (path.length === 2 && path[1] === 'status') return patch.op === 'remove' || GOAL_STATUSES.includes(patch.value)
    return true
  }
  if (root === 'turns' || root === 'turnHistory') {
    if (patch.op === 'remove' && (
      root === 'turns' && path.length === 3 && path[2] === 'status'
      || root === 'turnHistory' && path.length === 5 && path[2] === 'entitiesByKey' && (path[4] === 'status' || path[4] === 'turnId')
    )) return false
    return patch.op === 'remove' || patchedTurnValueAccepted(path, patch.value)
  }
  return true
}

function codexDesktopStreamMessageDecision(message, context = {}) {
  const source = plainRecord(message)
  const scope = plainRecord(context) || {}
  const parameters = plainRecord(source?.params)
  const change = plainRecord(parameters?.change)
  if (!source || source.method !== STREAM_METHOD) return decision('ignore', 'method-mismatch')
  if (!parameters || parameters.hostId !== 'local') return decision('ignore', 'host-not-local')
  if (!threadAccepted(scope, parameters.conversationId)) return decision('ignore', 'thread-invalid')
  if (source.type !== 'broadcast') return decision('ignore', 'message-type-invalid')
  if (!ownedIdentity(source.sourceClientId)) return decision('ignore', 'owner-missing')
  if (source.sourceClientId === scope.clientId) return decision('ignore', 'owner-self')
  if (Array.isArray(source.targetClientIds) && !source.targetClientIds.includes(scope.clientId)) {
    return decision('ignore', 'target-mismatch')
  }
  if (!nonNegativeInteger(source.version)) return decision('recover', 'version-invalid')
  if (!change || change.type !== 'snapshot' && change.type !== 'patches') return decision('recover', 'change-invalid')
  const previousShadow = plainRecord(scope.previousShadow)
  const sameOwner = previousShadow?.ownerClientId === source.sourceClientId
  if (change.type === 'snapshot') {
    const state = plainRecord(change.conversationState)
    const legacyUnrevisioned = source.version === 6 && !Number.isInteger(change.revision)
    const revision = legacyUnrevisioned
      ? sameOwner && nonNegativeInteger(previousShadow?.revision) ? previousShadow.revision + 1 : 1
      : change.revision
    const profile = legacyUnrevisioned ? 'legacy-unrevisioned' : 'revisioned'
    if (!legacyUnrevisioned && !nonNegativeInteger(revision)) return decision('recover', 'revision-invalid', { profile })
    if (sameOwner && nonNegativeInteger(previousShadow?.revision) && revision < previousShadow.revision) {
      return decision('ignore', 'revision-stale', { profile, revision, legacyUnrevisioned })
    }
    if (!state) return decision('recover', 'snapshot-invalid', { profile, revision, legacyUnrevisioned })
    const failure = snapshotAccepted(state, scope)
    if (failure) return decision('recover', failure, { profile, revision, legacyUnrevisioned })
    return decision('snapshot', legacyUnrevisioned ? 'legacy-snapshot' : 'revisioned-snapshot', {
      profile, revision, legacyUnrevisioned
    })
  }
  const legacyUnrevisioned = source.version === 6
    && !Number.isInteger(change.baseRevision)
    && !Number.isInteger(change.revision)
  const profile = legacyUnrevisioned ? 'legacy-unrevisioned' : 'revisioned'
  if (!sameOwner || !nonNegativeInteger(previousShadow?.revision)) {
    return decision('recover', previousShadow ? 'owner-mismatch' : 'shadow-missing', { profile, legacyUnrevisioned })
  }
  const baseRevision = legacyUnrevisioned ? previousShadow.revision : change.baseRevision
  const revision = legacyUnrevisioned ? previousShadow.revision + 1 : change.revision
  if (!nonNegativeInteger(baseRevision) || !nonNegativeInteger(revision) || baseRevision !== previousShadow.revision || revision <= baseRevision) {
    return decision('recover', 'revision-gap', { profile, revision, baseRevision, legacyUnrevisioned })
  }
  if (!Array.isArray(change.patches) || change.patches.length > MAX_PATCHES) {
    return decision('recover', 'patches-invalid', { profile, revision, baseRevision, legacyUnrevisioned })
  }
  for (const patch of change.patches) {
    const current = plainRecord(patch)
    if (!current || !['add', 'replace', 'remove'].includes(current.op) || !pathAccepted(current.path)) {
      return decision('recover', 'patch-invalid', { profile, revision, baseRevision, legacyUnrevisioned })
    }
    if (current.op !== 'remove' && !Object.hasOwn(current, 'value')) {
      return decision('recover', 'patch-invalid', { profile, revision, baseRevision, legacyUnrevisioned })
    }
    if (!patchCriticalAccepted(current, scope)) {
      return decision('recover', 'patch-value-invalid', { profile, revision, baseRevision, legacyUnrevisioned })
    }
  }
  return decision('patches', legacyUnrevisioned ? 'legacy-patches' : 'revisioned-patches', {
    profile, revision, baseRevision, legacyUnrevisioned
  })
}

module.exports = {
  CODEX_DESKTOP_IPC_VERSIONS,
  codexDesktopIpcVersionAccepted,
  codexDesktopStreamMessageDecision
}
