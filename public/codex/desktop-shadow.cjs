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

const { desktopReadEvidence, persistedConnectorUnread, parseCodexDesktopUnreadState, codexReadStateContextBinding } = require('./desktop-unread-evidence.cjs')

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

  // Keep only salted identities and lifecycle bits, never question/answer text.
  function asyncItem(value) {
    const item = record(value)
    const itemRef = typeof item.id === 'string'
      ? projectedRequest({ id: item.id }).correlation : ''
    const count = item.type === 'agentMessage' && Array.isArray(item.questions)
      ? Math.min(item.questions.length, 100) : 0
    const answered = []
    let continuesConversation = false
    if (item.type === 'userMessage' || item.type === 'steeringUserMessage') {
      const content = item.type === 'userMessage' ? item.content : item.input
      continuesConversation = item.type === 'steeringUserMessage' && Array.isArray(content)
        && content.some((part) => part?.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0)
        && !content.some((part) => typeof part?.text === 'string' && part.text.includes('<send_user_message_question_reply>'))
      const text = Array.isArray(content) && content.length === 1 && content[0]?.type === 'text'
        ? content[0].text : null
      if (typeof text === 'string' && text.length <= 262144) {
        const match = text.trim().match(/^<send_user_message_question_reply>([\s\S]*)<\/send_user_message_question_reply>$/)
        if (match) try {
          const parsed = JSON.parse(match[1])
          for (const reply of (Array.isArray(parsed) ? parsed : [parsed]).slice(0, 100)) {
            if (typeof reply?.question !== 'string' || typeof reply?.answer !== 'string') continue
            const key = JSON.parse(reply.questionItemId)
            if (Array.isArray(key) && key.length === 3 && key[0] === 'request_user_input_async'
              && typeof key[1] === 'string' && Number.isInteger(key[2]) && key[2] >= 0) {
              answered.push(`${projectedRequest({ id: key[1] }).correlation}:${key[2]}`)
            }
          }
        } catch {}
      }
    }
    return {
      itemRef, count, answered, continuesConversation,
      activityItem: ['reasoning', 'commandExecution', 'mcpToolCall', 'fileChange', 'agentMessage'].includes(item.type),
      type: ['agentMessage', 'userMessage', 'steeringUserMessage'].includes(item.type) ? item.type : 'other',
      replyAccepted: item.type === 'userMessage' || item.type === 'steeringUserMessage' && item.status === 'accepted'
    }
  }

  function asyncTurn(value) {
    const turn = record(value)
    return {
      turnRef: typeof turn.turnId === 'string' && turn.turnId.length > 0 ? projectedRequest({ id: turn.turnId }).correlation : '',
      status: ['inProgress', 'completed', 'failed', 'interrupted'].includes(turn.status) ? turn.status : '',
      startedAt: timestampMs(turn.turnStartedAtMs),
      items: Array.isArray(turn.items) ? turn.items.map(asyncItem) : []
    }
  }

  function historyRef(value) {
    return typeof value === 'string' ? projectedRequest({ id: value }).correlation || '' : ''
  }

  function historyOrder(islands) {
    return (Array.isArray(islands) ? islands : []).flatMap((island) => Array.isArray(island?.entries)
      ? island.entries.map((entry) => historyRef(entry?.value)).filter(Boolean) : [])
  }

  function historyEntities(value) {
    const entities = {}
    for (const [key, turn] of Object.entries(record(value))) {
      const ref = historyRef(key)
      if (ref) entities[ref] = asyncTurn(turn)
    }
    return entities
  }

  function asyncHistory(value) {
    if (value?.kind !== 'canonical') return null
    const history = record(value.history)
    return { order: historyOrder(history.islands), entities: historyEntities(history.entitiesByKey) }
  }

  function refreshAsyncRequests(shadow, previous = shadow.requests) {
    const overlays = shadow.asyncTurns || []
    // Only the current live overlay can supply activity; canonical history
    // may contain old inProgress turns and is not a running proof.
    const latestLiveTurn = overlays[overlays.length - 1]
    const liveTurnRunning = Boolean(latestLiveTurn?.turnRef && latestLiveTurn.status === 'inProgress')
    shadow.liveTurnActivityChanged = shadow.liveTurnRunning !== liveTurnRunning
    shadow.liveTurnRunning = liveTurnRunning
    const history = (shadow.asyncCanonical?.order || []).map((ref) => shadow.asyncCanonical.entities[ref]).filter(Boolean)
    const historyRefs = new Set(history.map((turn) => turn.turnRef))
    const turns = history.map((turn) => {
      const overlay = overlays.find((value) => value.turnRef && value.turnRef === turn.turnRef)
      if (!overlay) return turn
      // The native view prefers the longer loaded item list while the live
      // overlay supplies status. No message bodies are needed for this lane.
      return { ...overlay, items: overlay.items.length >= turn.items.length ? overlay.items : turn.items }
    }).concat(overlays.filter((turn) => !turn.turnRef || !historyRefs.has(turn.turnRef)))
    const latest = turns[turns.length - 1]
    // Generation completion does not answer an asynchronously presented question.
    // A Side can end a later generation (for example by auto-review) while
    // native Desktop still presents a question on its earlier inProgress Turn.
    // This is question evidence only, never a historical running witness.
    const pendingSideTurn = shadow.sideConversation === true
      && ['completed', 'interrupted', 'failed'].includes(latest?.status)
      ? turns.findLast(value => value.turnRef && value.status === 'inProgress') : null
    const turn = pendingSideTurn || (latest?.turnRef && ['inProgress', 'completed'].includes(latest.status) ? latest : null)
    const canonical = shadow.asyncCanonical?.entities[shadow.asyncCanonical?.order.at(-1)]
    shadow.currentCanonicalTurn = canonical?.turnRef
      ? { turnRef: canonical.turnRef, status: canonical.status, startedAt: canonical.startedAt } : null
    const followingItems = pendingSideTurn
      ? turns.slice(turns.indexOf(pendingSideTurn) + 1).flatMap(value => value.items) : []
    const answered = new Set([...(turn?.items || []), ...followingItems].flatMap((item) => item.replyAccepted ? item.answered : []))
    const items = turn?.items || []
    // Accepted force-inserted conversation input supersedes questions before
    // that item. Pending/rejected input and partial question replies do not.
    const continuationIndex = items.findLastIndex((item) => item.replyAccepted && item.continuesConversation)
    const laterContinuation = followingItems.some(item => item.replyAccepted && item.continuesConversation)
    const values = (laterContinuation ? [] : items).flatMap((item, index) => index > continuationIndex && item.itemRef
      ? Array.from({ length: item.count }, (_, index) => `${item.itemRef}:${index}`)
        .filter((key) => !answered.has(key))
        .map((key) => ({ type: 'userInput', method: 'requestUserInput', id: `async:${key}` })) : [])
    const prior = (previous || []).filter((request) => request.asyncQuestion === true)
    const requests = projectedRequests(values, prior).map((request) => ({ ...request, asyncQuestion: true }))
    shadow.asyncRequestSetChanged = prior.map((request) => request.observedSequence).join(',') !== requests.map((request) => request.observedSequence).join(',')
    shadow.requests = [...(shadow.requests || []).filter((request) => !request.asyncQuestion), ...requests]
  }

  function patchAsyncTurns(shadow, source) {
    const p = source.path
    const op = source.op
    const turns = shadow.asyncTurns || []
    if (p.length === 1) {
      if (op !== 'remove' && !Array.isArray(source.value)) return false
      shadow.asyncTurns = op === 'remove' ? [] : source.value.map(asyncTurn)
      return true
    }
    const ti = codexDesktopPatchIndex(p[1], turns.length, op === 'add' && p.length === 2)
    if (ti < 0) return false
    if (p.length === 2) {
      if (op === 'remove') turns.splice(ti, 1)
      else if (op === 'add') turns.splice(ti, 0, asyncTurn(source.value))
      else turns[ti] = asyncTurn(source.value)
      shadow.asyncTurns = turns
      return true
    }
    if (p[2] === 'status' && p.length === 3) {
      if (op !== 'remove' && !['inProgress', 'completed', 'failed', 'interrupted'].includes(source.value)) return false
      turns[ti].status = op === 'remove' ? '' : source.value
      return true
    }
    if (p[2] === 'turnId' && p.length === 3) {
      turns[ti].turnRef = op === 'remove' ? '' : historyRef(source.value)
      return true
    }
    if (p[2] !== 'items') return 'ignored'
    if (p.length === 3) {
      if (op !== 'remove' && !Array.isArray(source.value)) return false
      turns[ti].items = op === 'remove' ? [] : source.value.map(asyncItem)
      return true
    }
    const items = turns[ti].items
    const ii = codexDesktopPatchIndex(p[3], items.length, op === 'add' && p.length === 4)
    if (ii < 0) return false
    if (p.length === 4) {
      if (op === 'remove') items.splice(ii, 1)
      else if (op === 'add') items.splice(ii, 0, asyncItem(source.value))
      else items[ii] = asyncItem(source.value)
      return true
    }
    const item = items[ii]
    const field = p[4]
    if (field === 'id' && p.length === 5) {
      item.itemRef = op === 'remove' ? '' : historyRef(source.value)
      return true
    }
    if (field === 'type') return false
    if (field === 'questions' && item.type === 'agentMessage') {
      if (p.length === 5) {
        if (op !== 'remove' && !Array.isArray(source.value)) return false
        item.count = op === 'remove' ? 0 : Math.min(source.value.length, 100)
      } else if (p.length === 6) {
        if (codexDesktopPatchIndex(p[5], item.count, op === 'add') < 0) return false
        const count = item.count + (op === 'add' ? 1 : op === 'remove' ? -1 : 0)
        if (count > 100) return false
        item.count = count
      } else return 'ignored' // Question wording/options do not change its identity.
      return true
    }
    if (item.type !== 'userMessage' && item.type !== 'steeringUserMessage') return 'ignored'
    if (field === 'status' && p.length === 5 && item.type === 'steeringUserMessage') {
      item.replyAccepted = op !== 'remove' && source.value === 'accepted'
      return true
    }
    if (field !== (item.type === 'userMessage' ? 'content' : 'input')) return 'ignored'
    // Retain only parsed reply correlations, including pending steering replies;
    // later acceptance can then clear the question without a snapshot round trip.
    let content
    if (op === 'remove' && (p.length === 5 || p[5] === 0 || p[5] === '0')) content = []
    else if (p.length === 5 && Array.isArray(source.value)) content = source.value
    else if (p.length === 6 && (p[5] === 0 || p[5] === '0')) content = [source.value]
    else if (p.length === 7 && (p[5] === 0 || p[5] === '0') && p[6] === 'text' && typeof source.value === 'string') {
      content = [{ type: 'text', text: source.value }]
    } else return false
    const projected = asyncItem({ type: item.type, [field]: content })
    item.answered = projected.answered
    item.continuesConversation = projected.continuesConversation
    return true
  }

  function patchAsyncHistory(shadow, source) {
    const p = source.path
    if (p.length === 1) {
      shadow.asyncCanonical = source.op === 'remove' ? null : asyncHistory(source.value)
      return true
    }
    if (p[1] === 'kind') return false
    if (p[1] !== 'history') return 'ignored'
    if (p.length === 2) {
      shadow.asyncCanonical = source.op === 'remove' ? null : asyncHistory({ kind: 'canonical', history: source.value })
      return true
    }
    if (!['entitiesByKey', 'islands'].includes(p[2])) return 'ignored'
    // Old snapshots may not carry canonical history at all. Ordinary body/tool
    // deltas still cannot introduce a question and must not reset live authority.
    if (!shadow.asyncCanonical) {
      return p.length > 4 && !['items', 'questions', 'turnId'].includes(p.at(-1)) ? 'ignored' : false
    }
    if (p[2] === 'islands') {
      if (p.length !== 3) return false
      shadow.asyncCanonical.order = source.op === 'remove' ? [] : historyOrder(source.value)
      return true
    }
    if (p.length === 3) {
      shadow.asyncCanonical.entities = source.op === 'remove' ? {} : historyEntities(source.value)
      return true
    }
    const ref = historyRef(p[3])
    if (!ref) return false
    if (p.length === 4) {
      if (source.op === 'remove') delete shadow.asyncCanonical.entities[ref]
      else shadow.asyncCanonical.entities[ref] = asyncTurn(source.value)
      return true
    }
    const turn = shadow.asyncCanonical.entities[ref]
    if (!turn) return false
    const projection = { asyncTurns: [turn] }
    const result = patchAsyncTurns(projection, { ...source, path: ['turns', 0, ...p.slice(4)] })
    shadow.asyncCanonical.entities[ref] = projection.asyncTurns[0]
    return result
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
      asyncTurns: Array.isArray(state.turns) ? state.turns.map(asyncTurn) : [],
      asyncCanonical: asyncHistory(state.turnHistory),
      requestSetRevision: nextLiveEvidenceSequence(),
      requestSetComplete: true,
      requestSetAuthority: 'provider-snapshot',
      runtimeWaitingSequences,
      waitingState
    }
    refreshAsyncRequests(shadow, codexDesktopRequestObservationCandidates(previousShadow, waitingState))
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
    shadow.asyncRequestSetChanged = false
    shadow.liveTurnActivityChanged = false
    shadow.canonicalRunningProgress = false
    const source = record(patch)
    if (!['add', 'replace', 'remove'].includes(source.op) || !Array.isArray(source.path)
      || !source.path.length || source.path.length > 64) return false
    if (source.path[0] === 'turnHistory' || source.path[0] === 'turns') {
      const result = source.path[0] === 'turnHistory' ? patchAsyncHistory(shadow, source) : patchAsyncTurns(shadow, source)
      if (result === false) return false
      if (result !== 'ignored') refreshAsyncRequests(shadow)
      const p = source.path
      const canonical = shadow.asyncCanonical
      const entityRef = historyRef(p[3])
      const current = canonical?.entities[entityRef]
      if (p[0] === 'turnHistory' && p[2] === 'entitiesByKey'
        && entityRef === canonical?.order.at(-1)
        && current?.turnRef && current.status === 'inProgress'
        && source.op !== 'remove' && p[4] === 'items' && p.length >= 6
        && p[6] !== 'questions'
        && current.items[codexDesktopPatchIndex(p[5], current.items.length)]?.activityItem === true) {
        shadow.canonicalRunningProgress = true
      }
      return true
    }
    const asyncRequests = (shadow.requests || []).filter((request) => request.asyncQuestion)
    shadow.requests = (shadow.requests || []).filter((request) => !request.asyncQuestion)
    const applied = applyNativePatch(shadow, patch)
    shadow.requests.push(...asyncRequests)
    return applied
  }

  function applyNativePatch(shadow, patch) {
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
    codexApplyNativeConnectorUnread,
    // Re-exported so the entry reaches the shared evidence through the one
    // shadow binding it already holds (entry budget), while the CodexHost
    // lane requires the evidence module directly.
    desktopReadEvidence,
    persistedConnectorUnread,
    parseCodexDesktopUnreadState,
    codexReadStateContextBinding
  }
}

module.exports = {
  CODEX_DESKTOP_SHADOW_REVISION,
  CODEX_DESKTOP_WAITING_REQUEST_HISTORY_LIMIT,
  createCodexDesktopShadow
}
