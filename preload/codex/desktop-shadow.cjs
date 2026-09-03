'use strict'

const { COMPANION_V7_REVISIONS } = require('../companion/contracts-v7.cjs')

/**
 * Builds and incrementally patches the Desktop conversation "shadow": the
 * preload's own private mirror of one thread's live runtime status, pending
 * requests and waiting-flag evidence sequences, derived from Desktop's
 * `thread-stream-state-changed` snapshots and JSON-Patch-shaped deltas.
 *
 * `codexDesktopShadowFromSnapshot` builds a fresh shadow from a full
 * snapshot; `codexApplyDesktopShadowPatch` mutates an existing shadow from
 * one patch operation, refusing (`false`) any patch shape it does not fully
 * recognize rather than partially applying it. Both only ever act on the
 * `shadow`/`waitingState`/`previousShadow` objects passed to them — no
 * module-level state.
 *
 * `record`, `timestampMs`, `validThreadId` and `nextLiveEvidenceSequence` are
 * injected on the rollout-evidence precedent (hot helpers with call sites far
 * outside this cluster). `reduceWaitingEdge` and `activityStatus` are
 * injected for the same reason at smaller scale: each has call sites in the
 * entry beyond this shadow/patch pair. `projectedRequest`/
 * `projectedRequests` are injected because they are themselves already an
 * extracted module (`desktop-request-projection.cjs`) reached through the
 * entry's own delegation.
 */

const CODEX_DESKTOP_SHADOW_REVISION = COMPANION_V7_REVISIONS.desktopShadow
/** How many resolved request observations a waiting state remembers. */
const CODEX_DESKTOP_WAITING_REQUEST_HISTORY_LIMIT = 400

function createCodexDesktopShadow(dependencies = {}) {
  const record = dependencies.record
  const timestampMs = dependencies.timestampMs
  const validThreadId = dependencies.validThreadId
  const nextLiveEvidenceSequence = dependencies.nextLiveEvidenceSequence
  const reduceWaitingEdge = dependencies.reduceWaitingEdge
  const activityStatus = dependencies.activityStatus
  const projectedRequest = dependencies.projectedRequest
  const projectedRequests = dependencies.projectedRequests
  /** Lazy: CodexHost discovery is constructed after this shadow. */
  const isExternalThreadId = typeof dependencies.isExternalThreadId === 'function'
    ? dependencies.isExternalThreadId
    : () => false

  /**
   * Writes the Desktop's native unread set onto one connector record. CodexHost
   * external conversations are absent from that atom by design, so their
   * Host-written value is left alone (RAW-190). Returns whether it applied.
   */
  function codexApplyNativeConnectorUnread(known, threadId, unreadIds) {
    // Duck-typed on purpose: the entry may run in a VM realm whose `Set` is not
    // this module's `Set`, and `instanceof` would silently report "not applied".
    if (!known || !unreadIds || typeof unreadIds.has !== 'function') return { applied: false, hasUnreadTurn: false }
    if (isExternalThreadId(threadId) === true) return { applied: false, hasUnreadTurn: false }
    const hasUnreadTurn = unreadIds.has(threadId)
    known.connectorHasUnreadTurn = hasUnreadTurn
    known.connectorUnreadAuthority = 'desktop-persisted'
    return { applied: true, hasUnreadTurn }
  }
  if (typeof record !== 'function'
    || typeof timestampMs !== 'function'
    || typeof validThreadId !== 'function'
    || typeof nextLiveEvidenceSequence !== 'function'
    || typeof reduceWaitingEdge !== 'function'
    || typeof activityStatus !== 'function'
    || typeof projectedRequest !== 'function'
    || typeof projectedRequests !== 'function') {
    throw new TypeError('codex desktop shadow requires record, timestampMs, validThreadId, nextLiveEvidenceSequence, reduceWaitingEdge, activityStatus, projectedRequest and projectedRequests')
  }

  function codexDesktopRuntimeWaitingSequences(flags, previousFlags = [], previousSequences = {}, options = {}) {
    const previous = new Set(Array.isArray(previousFlags) ? previousFlags : [])
    const sequences = {}
    for (const flag of [...new Set((Array.isArray(flags) ? flags : [])
      .filter((item) => item === 'waitingOnUserInput' || item === 'waitingOnApproval'))]) {
      const preserved = options.refresh !== true
        && previous.has(flag)
        && Number.isInteger(previousSequences?.[flag])
        ? previousSequences[flag]
        : 0
      sequences[flag] = preserved || nextLiveEvidenceSequence()
    }
    return sequences
  }

  function codexDesktopRuntimeProjection(value) {
    const activity = activityStatus(value)
    return activity ? { type: activity.status, activeFlags: activity.activeFlags } : null
  }

  function codexRememberDesktopRequestObservations(waitingState, requests) {
    if (!waitingState || !Array.isArray(requests)) return
    const history = new Map()
    for (const request of Array.isArray(waitingState.requestHistory) ? waitingState.requestHistory : []) {
      if (Number.isInteger(request?.observedSequence)) history.set(request.observedSequence, request)
    }
    for (const request of requests) {
      if (!Number.isInteger(request?.observedSequence)) continue
      history.delete(request.observedSequence)
      history.set(request.observedSequence, request)
    }
    while (history.size > CODEX_DESKTOP_WAITING_REQUEST_HISTORY_LIMIT) {
      const oldest = history.keys().next().value
      if (!Number.isInteger(oldest)) break
      history.delete(oldest)
    }
    waitingState.requestHistory = [...history.values()]
  }

  function codexDesktopRequestObservationCandidates(previousShadow, waitingState) {
    const bySequence = new Map()
    for (const request of [
      ...(Array.isArray(previousShadow?.requests) ? previousShadow.requests : []),
      ...(Array.isArray(waitingState?.requestHistory) ? waitingState.requestHistory : [])
    ]) {
      if (!Number.isInteger(request?.observedSequence)) continue
      if (!bySequence.has(request.observedSequence)) bySequence.set(request.observedSequence, request)
    }
    return [...bySequence.values()]
  }

  function codexDesktopShadowFromSnapshot(change, previousShadow = null, waitingState = null) {
    const state = record(change.conversationState)
    const revision = Number.isInteger(change.revision) && change.revision >= 0 ? change.revision : -1
    const runtime = codexDesktopRuntimeProjection(state.threadRuntimeStatus)
    const requests = Array.isArray(state.requests) && state.requests.length <= 10_000
      ? projectedRequests(
          state.requests,
          codexDesktopRequestObservationCandidates(previousShadow, waitingState)
        )
      : null
    if (revision < 0 || !runtime || requests === null) return null
    const priorRuntimeSequences = {
      ...(waitingState?.runtimeWaitingSequences || {}),
      ...(previousShadow?.runtimeWaitingSequences || {})
    }
    const priorRuntimeFlags = [...new Set([
      ...Object.keys(waitingState?.runtimeWaitingSequences || {}),
      ...(previousShadow?.runtime?.activeFlags || [])
    ])]
    const runtimeWaitingSequences = codexDesktopRuntimeWaitingSequences(
      runtime.activeFlags,
      priorRuntimeFlags,
      priorRuntimeSequences
    )
    const shadow = {
      revision,
      activityRevision: revision,
      activityEvidence: 'initial-snapshot',
      runtime,
      sideConversation: state.sideConversation === true,
      parentThreadId: validThreadId(state.forkedFromId)
        ? state.forkedFromId
        : typeof state.sideConversationParentNavigationPath === 'string'
          ? (state.sideConversationParentNavigationPath.match(/^\/local\/([0-9a-f-]{36})$/i)?.[1] || '')
          : '',
      resumeState: typeof state.resumeState === 'string' ? state.resumeState.slice(0, 40) : '',
      hasUnreadTurn: typeof state.hasUnreadTurn === 'boolean' ? state.hasUnreadTurn : undefined,
      unreadEvidence: typeof state.hasUnreadTurn === 'boolean' ? 'snapshot' : '',
      requests,
      requestSetRevision: nextLiveEvidenceSequence(),
      requestSetComplete: true,
      requestSetAuthority: 'provider-snapshot',
      runtimeWaitingSequences,
      waitingState
    }
    if (waitingState) {
      waitingState.runtimeWaitingSequences = {
        ...(waitingState.runtimeWaitingSequences || {}),
        ...runtimeWaitingSequences
      }
      codexRememberDesktopRequestObservations(waitingState, requests)
    }
    const runtimeEdge = reduceWaitingEdge({
      flags: runtime.activeFlags,
      previousFlags: previousShadow?.runtime?.activeFlags,
      previousWaitingSince: previousShadow?.runtimeWaitingSince
    })
    if (runtimeEdge.waitingSince) shadow.runtimeWaitingSince = runtimeEdge.waitingSince
    return shadow
  }

  function codexDesktopPatchIndex(value, length, allowEnd = false) {
    const index = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : -1
    const maximum = allowEnd ? length : length - 1
    return Number.isInteger(index) && index >= 0 && index <= maximum ? index : -1
  }

  function codexApplyDesktopShadowPatch(shadow, patch) {
    const source = record(patch)
    const operation = source.op
    const patchPath = Array.isArray(source.path) ? source.path : null
    if (!['add', 'replace', 'remove'].includes(operation) || !patchPath || patchPath.length === 0 || patchPath.length > 64) return false
    const root = patchPath[0]
    // Desktop streams the whole private conversation state. The Companion keeps
    // only the finite runtime/request/read subset; unrelated well-formed patches
    // still advance the stream revision and must not tear down live authority.
    // A malformed patch inside the observed subset remains a resubscribe signal.
    if (!['hasUnreadTurn', 'resumeState', 'threadRuntimeStatus', 'requests'].includes(root)) return true
    if (patchPath.length > 8) return false
    if (root === 'hasUnreadTurn') {
      if (patchPath.length !== 1) return false
      if (operation === 'remove') {
        shadow.hasUnreadTurn = undefined
        shadow.unreadEvidence = ''
      } else if (typeof source.value === 'boolean') {
        shadow.hasUnreadTurn = source.value
        shadow.unreadEvidence = 'event'
      }
      else return false
      return true
    }
    if (root === 'resumeState') {
      if (patchPath.length !== 1) return false
      if (operation === 'remove') shadow.resumeState = ''
      else if (typeof source.value === 'string') shadow.resumeState = source.value.slice(0, 40)
      else return false
      return true
    }
    if (root === 'threadRuntimeStatus') {
      if (patchPath.length === 1) {
        if (operation === 'remove') return false
        const runtime = codexDesktopRuntimeProjection(source.value)
        if (!runtime) return false
        shadow.runtime = runtime
        return true
      }
      if (patchPath[1] === 'type') {
        if (patchPath.length !== 2 || operation === 'remove' || !['active', 'idle', 'notLoaded', 'systemError'].includes(source.value)) return false
        shadow.runtime.type = source.value
        if (source.value !== 'active') shadow.runtime.activeFlags = []
        return true
      }
      if (patchPath[1] !== 'activeFlags') return false
      if (patchPath.length === 2) {
        if (operation === 'remove') shadow.runtime.activeFlags = []
        else if (Array.isArray(source.value)) {
          shadow.runtime.activeFlags = [...new Set(source.value.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
        } else return false
        return true
      }
      if (patchPath.length !== 3) return false
      const flags = shadow.runtime.activeFlags || []
      const index = codexDesktopPatchIndex(patchPath[2], flags.length, operation === 'add')
      if (index < 0) return false
      if (operation === 'remove') flags.splice(index, 1)
      else if (source.value === 'waitingOnApproval' || source.value === 'waitingOnUserInput') {
        if (operation === 'add') flags.splice(index, 0, source.value)
        else flags[index] = source.value
      } else return false
      shadow.runtime.activeFlags = [...new Set(flags)]
      return true
    }
    if (root !== 'requests') return false
    if (patchPath.length === 1) {
      if (operation === 'remove') shadow.requests = []
      else if (Array.isArray(source.value) && source.value.length <= 10_000) shadow.requests = projectedRequests(source.value, shadow.requests)
      else return false
      return true
    }
    const requests = shadow.requests || []
    const index = codexDesktopPatchIndex(patchPath[1], requests.length, operation === 'add')
    if (index < 0) return false
    if (patchPath.length === 2) {
      if (operation === 'remove') requests.splice(index, 1)
      else if (operation === 'add') requests.splice(index, 0, projectedRequest(source.value))
      else requests[index] = projectedRequest(source.value, Date.now(), requests[index])
      shadow.requests = requests
      return true
    }
    if (patchPath.length === 3 && (patchPath[2] === 'type' || patchPath[2] === 'method')) {
      const field = patchPath[2]
      if (operation === 'remove') requests[index][field] = ''
      else if (typeof source.value === 'string') requests[index][field] = source.value.slice(0, field === 'type' ? 80 : 120)
      else return false
      requests[index].observedAt = Date.now()
      return true
    }
    const timestampField = (patchPath.length === 3
        && (patchPath[2] === 'startedAt' || patchPath[2] === 'createdAt' || patchPath[2] === 'timestamp'))
      || (patchPath.length === 4
        && patchPath[2] === 'params'
        && (patchPath[3] === 'startedAt' || patchPath[3] === 'createdAt' || patchPath[3] === 'timestamp'))
    if (!timestampField) return false
    if (operation === 'remove') delete requests[index].startedAt
    else {
      const startedAt = timestampMs(source.value)
      if (!startedAt) return false
      requests[index].startedAt = startedAt
    }
    return true
  }

  return {
    revision: CODEX_DESKTOP_SHADOW_REVISION,
    codexDesktopRuntimeWaitingSequences,
    codexDesktopRuntimeProjection,
    codexRememberDesktopRequestObservations,
    codexDesktopRequestObservationCandidates,
    codexDesktopShadowFromSnapshot,
    codexDesktopPatchIndex,
    codexApplyDesktopShadowPatch,
    codexApplyNativeConnectorUnread
  }
}

module.exports = {
  CODEX_DESKTOP_SHADOW_REVISION,
  CODEX_DESKTOP_WAITING_REQUEST_HISTORY_LIMIT,
  createCodexDesktopShadow
}
