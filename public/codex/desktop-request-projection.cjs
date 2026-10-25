'use strict'

const { COMPANION_V7_REVISIONS } = require('../companion/contracts-v7.cjs')

/**
 * How the desktop plan bridge classifies a live Codex request: a stable
 * correlation identity, a best-effort timestamp, and whether the request is
 * currently waiting on the user (input or approval).
 *
 * `codexDesktopProjectedRequest`/`codexDesktopProjectedRequests` fold a raw
 * request payload against the previous observation of "the same" request —
 * matched by correlation id when the source supplies one, otherwise by
 * `(type, method, startedAt)` — so a request's `observedSequence` and
 * `startedAt` survive across repeated observations instead of resetting on
 * every poll.
 * A bounded owner lookup can revalidate an async question against a current
 * snapshot; lookup failure never decides that the question has been answered.
 *
 * `record`, `timestampMs` and `nextLiveEvidenceSequence` are injected on the
 * rollout-evidence precedent: `codexRecord`/`codexTimestampMs` are among the
 * hottest helpers in the entry, and `codexNextLiveEvidenceSequence` closes
 * over the entry's live-evidence counter, so all three stay there. `crypto`
 * is injected on the node-runtime precedent.
 */

const CODEX_DESKTOP_REQUEST_PROJECTION_REVISION = COMPANION_V7_REVISIONS.desktopRequestProjection

function createCodexDesktopRequestProjection(dependencies = {}) {
  const record = dependencies.record
  const timestampMs = dependencies.timestampMs
  const nextLiveEvidenceSequence = dependencies.nextLiveEvidenceSequence
  if (typeof record !== 'function' || typeof timestampMs !== 'function' || typeof nextLiveEvidenceSequence !== 'function') {
    throw new TypeError('codex desktop request projection requires record, timestampMs and nextLiveEvidenceSequence')
  }
  const crypto = dependencies.crypto || require('node:crypto')
  const suppliedSalt = dependencies.correlationSalt
  const correlationSalt = Buffer.isBuffer(suppliedSalt) && suppliedSalt.length >= 16
    ? Buffer.from(suppliedSalt)
    : typeof suppliedSalt === 'string' && /^[a-f0-9]{32,128}$/i.test(suppliedSalt)
      ? Buffer.from(suppliedSalt, 'hex')
      : crypto.randomBytes(16)
  const ownerRefreshes = new WeakMap()
  const streamObservations = new WeakMap()
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now()
  const startTimer = dependencies.setTimeout || setTimeout
  const stopTimer = dependencies.clearTimeout || clearTimeout

  function pendingOwnerSignature(shadow, known) {
    const requests = (shadow?.requests || []).filter((request) => request.asyncQuestion === true
      && request.identityExact === true
      && !['resolved', 'cancelled', 'execution-started'].includes(request.interactionState))
    return requests.length ? {
      value: `${timestampMs(known?.connectorLastTurnStartedAt)}:${requests.map((request) => request.observedSequence).sort((a, b) => a - b).join(',')}`,
      observedAt: Math.max(...requests.map((request) => timestampMs(request.observedAt)))
    } : null
  }

  function recordOwnerRefresh(threadId, outcome, entry) {
    dependencies.recordDiagnostic?.({ level: 'info', scope: 'task-recovery', event: 'desktop-owner-snapshot',
      provider: 'codex', taskRef: threadId, outcome,
      details: { mode: entry.mode, pendingCount: entry.shadow?.requests?.filter((request) => request.asyncQuestion).length || 0,
        ...(typeof entry.ownerMatched === 'boolean' ? { ownerMatched: entry.ownerMatched } : {}) } })
  }

  function inventoryOwnerSignature(known) {
    return `${timestampMs(known?.connectorLastTurnStartedAt)}:${known?.connectorLastTurnId || ''}`
  }

  function ownerEntryCurrent(bridge, state, entry) {
    if (bridge.closed || bridge.state !== 'connected' || bridge.socket !== entry.socket
      || !bridge.inventory.has(entry.parentId)) return false
    if (entry.mode === 'inventory') return state.latest.get(entry.threadId) === entry.signature
      && inventoryOwnerSignature(entry.known) === entry.signature
    const shadow = bridge.shadows.get(entry.threadId) || bridge.sideShadows.get(entry.threadId)
    return shadow === entry.shadow
      && pendingOwnerSignature(shadow, { connectorLastTurnStartedAt: entry.turnStartedAt })?.value === entry.signature
  }

  function drainOwnerQueue(bridge, state) {
    while (state.pending.size < 8 && state.queue.size) {
      const [threadId, entry] = state.queue.entries().next().value
      state.queue.delete(threadId)
      if (!ownerEntryCurrent(bridge, state, entry)) {
        entry.outcome = 'discarded'
        recordOwnerRefresh(threadId, 'discarded', entry)
        continue
      }
      const requestId = crypto.randomUUID()
      const attemptKey = `${entry.mode}:${threadId}`
      state.attempted.delete(attemptKey)
      state.attempted.set(attemptKey, entry.signature)
      while (state.attempted.size > 1_000) state.attempted.delete(state.attempted.keys().next().value)
      state.pending.set(requestId, entry)
      entry.timer = startTimer(() => {
        if (state.pending.get(requestId) !== entry) return
        state.pending.delete(requestId)
        recordOwnerRefresh(threadId, 'expired', entry)
        drainOwnerQueue(bridge, state)
      }, 5_000)
      entry.timer?.unref?.()
      entry.outcome = 'requested'
      recordOwnerRefresh(threadId, 'requested', entry)
      if (bridge.send({ type: 'request', method: 'thread-owner-discovery', requestId,
        sourceClientId: bridge.clientId, version: 1, params: { hostId: 'local', conversationId: threadId } })) continue
      stopTimer(entry.timer)
      state.pending.delete(requestId)
      entry.outcome = 'unavailable'
      recordOwnerRefresh(threadId, 'unavailable', entry)
    }
  }

  function refreshOwner(bridge, threadId, known, mode, verifiedParentId) {
    const shadow = bridge?.shadows?.get(threadId) || bridge?.sideShadows?.get(threadId)
    const parentId = shadow?.parentThreadId || verifiedParentId || threadId
    if (bridge?.closed || bridge?.state !== 'connected' || !bridge.socket
      || !bridge.inventory?.has(parentId) || !known) return false
    const signature = mode === 'inventory' ? { value: inventoryOwnerSignature(known) } : pendingOwnerSignature(shadow, known)
    if (mode === 'pending' && (codexDesktopRuntimeHasWaitingFlags({ activeFlags: known.connectorActiveFlags })
      || !signature?.observedAt || now() - signature.observedAt < 20_000)) return false
    let state = ownerRefreshes.get(bridge)
    if (!state) {
      state = { pending: new Map(), attempted: new Map(), queue: new Map(), latest: new Map() }
      ownerRefreshes.set(bridge, state)
    }
    if (mode === 'inventory') {
      state.latest.delete(threadId)
      state.latest.set(threadId, signature.value)
      while (state.latest.size > 1_000) state.latest.delete(state.latest.keys().next().value)
    }
    const attemptKey = `${mode}:${threadId}`
    if (state.queue.size >= 1_000 || state.queue.has(threadId)
      || mode === 'pending' && state.pending.size >= 8 || state.attempted.get(attemptKey) === signature.value
      || [...state.pending.values()].some((entry) => entry.threadId === threadId)) return false
    const entry = { threadId, parentId, shadow, known, mode, signature: signature.value,
      turnStartedAt: timestampMs(known.connectorLastTurnStartedAt), socket: bridge.socket, timer: null, outcome: 'queued' }
    state.queue.set(threadId, entry)
    drainOwnerQueue(bridge, state)
    return !['unavailable', 'discarded'].includes(entry.outcome)
  }

  /** Subscription discovers authority; independent notLoaded/interrupted is not an exclusion. */
  function codexDesktopRefreshInventoryOwner(bridge, threadId, known, verifiedParentId) {
    return refreshOwner(bridge, threadId, known, 'inventory', verifiedParentId)
  }

  /** Revalidate evidence, never infer that plain-active or elapsed time answered it. */
  function codexDesktopRefreshPendingOwner(bridge, threadId, known) {
    return refreshOwner(bridge, threadId, known, 'pending')
  }

  function codexDesktopHandleOwnerDiscoveryResponse(bridge, message) {
    const state = ownerRefreshes.get(bridge)
    const entry = message?.type === 'response' ? state?.pending.get(message.requestId) : null
    if (!entry) return false
    state.pending.delete(message.requestId)
    stopTimer(entry.timer)
    const shadow = bridge.shadows.get(entry.threadId) || bridge.sideShadows.get(entry.threadId)
    if (message.method !== 'thread-owner-discovery' || message.resultType !== 'success'
      || typeof message.handledByClientId !== 'string' || !message.handledByClientId || message.handledByClientId.length > 512
      || !ownerEntryCurrent(bridge, state, entry)) {
      recordOwnerRefresh(entry.threadId, 'discarded', entry)
      drainOwnerQueue(bridge, state)
      return true
    }
    entry.ownerMatched = shadow?.ownerClientId === message.handledByClientId
    const sent = bridge.followAny(entry.threadId, true, [message.handledByClientId])
    recordOwnerRefresh(entry.threadId, sent ? 'targeted' : 'unavailable', entry)
    drainOwnerQueue(bridge, state)
    return true
  }

  function codexDesktopClearOwnerRefreshes(bridge) {
    streamObservations.delete(bridge)
    const state = ownerRefreshes.get(bridge)
    if (!state) return
    for (const entry of state.pending.values()) stopTimer(entry.timer)
    ownerRefreshes.delete(bridge)
  }

  function recordStreamProjection(bridge, threadId, shadow, waitingEvidenceVisible) {
    if (typeof dependencies.recordDiagnostic !== 'function') return
    let observations = streamObservations.get(bridge)
    if (!observations) { observations = new Map(); streamObservations.set(bridge, observations) }
    const details = {
      ownerRef: anonymousInteractionRef('stream-owner', shadow.ownerClientId),
      canonicalStatus: shadow.currentCanonicalTurn?.status || 'unknown',
      canonicalStartedAt: Number(shadow.currentCanonicalTurn?.startedAt) || 0,
      pendingCount: (shadow.requests || []).filter((request) => request.asyncQuestion
        && !['resolved', 'cancelled', 'execution-started'].includes(request.interactionState)).length,
      visibleCount: (shadow.requests || []).filter((request) => waitingEvidenceVisible(shadow.waitingState,
        codexDesktopRequestFlag(request), request.observedSequence)).length,
      inputClearSequence: Number(shadow.waitingState?.inputClearSequence) || 0
    }
    const fingerprint = JSON.stringify(details)
    if (observations.get(threadId) === fingerprint) return
    observations.delete(threadId)
    observations.set(threadId, fingerprint)
    while (observations.size > 1_000) observations.delete(observations.keys().next().value)
    dependencies.recordDiagnostic({ level: 'debug', scope: 'task-evidence', event: 'desktop-stream-projection',
      provider: 'codex', taskRef: threadId, outcome: 'observed', details: { ...details, streamRevision: Number(shadow.revision) || 0 } })
  }

  function anonymousInteractionRef(...parts) {
    const hash = crypto.createHash('sha256')
      .update(correlationSalt)
      .update('\0interaction-v1')
    for (const part of parts) hash.update('\0').update(String(part || ''))
    return hash.digest('hex').slice(0, 32)
  }

  function codexDesktopRequestTimestamp(value) {
    const source = record(value)
    const params = record(source.params)
    return timestampMs(source.startedAt)
      || timestampMs(source.createdAt)
      || timestampMs(source.timestamp)
      || timestampMs(params.startedAt)
      || timestampMs(params.createdAt)
      || timestampMs(params.timestamp)
  }

  function codexDesktopRequestCorrelation(value) {
    const source = record(value)
    const params = record(source.params)
    const identity = [source.requestId, source.id, source.callId, params.requestId, params.id, params.callId]
      .find((candidate) => typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 512
        || Number.isSafeInteger(candidate))
    if (identity === undefined) return ''
    return crypto.createHash('sha256')
      .update(correlationSalt)
      .update('\0')
      .update(String(identity))
      .digest('hex')
      .slice(0, 32)
  }

  function codexDesktopProjectedRequest(value, observedAt = Date.now(), previous = null) {
    const source = record(value)
    const type = typeof source.type === 'string' ? source.type.slice(0, 80) : ''
    const method = typeof source.method === 'string' ? source.method.slice(0, 120) : ''
    const suppliedCorrelation = codexDesktopRequestCorrelation(source)
    const suppliedStartedAt = codexDesktopRequestTimestamp(source)
    const sameInstance = Boolean(previous)
      && (suppliedCorrelation
        ? previous.correlation === suppliedCorrelation
        : previous.type === type
          && previous.method === method
          && (!suppliedStartedAt || !previous.startedAt || previous.startedAt === suppliedStartedAt))
    const correlation = suppliedCorrelation
      || (sameInstance ? previous.correlation : '')
    const observedSequence = sameInstance && Number.isInteger(previous?.observedSequence)
      ? previous.observedSequence
      : nextLiveEvidenceSequence()
    const interactionRef = suppliedCorrelation
      || (sameInstance && typeof previous?.interactionRef === 'string' ? previous.interactionRef : '')
      || anonymousInteractionRef(type, method, suppliedStartedAt, observedSequence)
    const projection = {
      type,
      method,
      observedAt: timestampMs(observedAt) || Date.now(),
      observedSequence,
      interactionRef,
      identityExact: Boolean(suppliedCorrelation)
    }
    if (correlation) projection.correlation = correlation
    const startedAt = suppliedStartedAt || (sameInstance ? timestampMs(previous?.startedAt) : 0)
    if (startedAt) projection.startedAt = startedAt
    if (sameInstance
      && previous.type === projection.type
      && previous.method === projection.method
      && !suppliedStartedAt
      && !startedAt
      && timestampMs(previous.observedAt)) projection.observedAt = previous.observedAt
    if (sameInstance && ['resolved', 'cancelled', 'execution-started'].includes(previous?.interactionState)) {
      projection.interactionState = previous.interactionState
      if (Number.isInteger(previous.resolutionSequence) && previous.resolutionSequence > 0) {
        projection.resolutionSequence = previous.resolutionSequence
      }
    }
    return projection
  }

  function codexDesktopProjectedRequests(values, previous = []) {
    const observations = Array.isArray(previous) ? [...previous] : []
    const used = new Set()
    const observedAt = Date.now()
    return values.map((value) => {
      const source = record(value)
      const type = typeof source.type === 'string' ? source.type.slice(0, 80) : ''
      const method = typeof source.method === 'string' ? source.method.slice(0, 120) : ''
      const startedAt = codexDesktopRequestTimestamp(source)
      const correlation = codexDesktopRequestCorrelation(source)
      const matchIndex = observations.findIndex((item, index) => !used.has(index)
        && (correlation
          ? item.correlation === correlation
          : item.type === type
            && item.method === method
            && (!startedAt || !item.startedAt || item.startedAt === startedAt)))
      if (matchIndex >= 0) used.add(matchIndex)
      return codexDesktopProjectedRequest(source, observedAt, matchIndex >= 0 ? observations[matchIndex] : null)
    })
  }

  function codexDesktopIsPlanImplementationRequest(request) {
    return String(request?.method || '').toLowerCase() === 'item/plan/requestimplementation'
  }

  function codexDesktopRequestKind(request) {
    const type = String(request?.type || '').toLowerCase()
    const method = String(request?.method || '').toLowerCase()
    if (codexDesktopIsPlanImplementationRequest(request)) return 'plan-implementation'
    if (method === 'item/plan/requestuserinput'
      || method === 'item/plan/requestchoice'
      || type === 'planchoice') return 'plan-choice'
    if (codexDesktopRequestFlag(request) === 'waitingOnApproval') return 'approval'
    if (codexDesktopRequestFlag(request) === 'waitingOnUserInput') return 'user-input'
    return ''
  }

  function codexDesktopRequestFlag(request) {
    const type = String(request?.type || '').toLowerCase()
    const method = String(request?.method || '').toLowerCase()
    if (codexDesktopIsPlanImplementationRequest(request)
      || method === 'item/tool/requestuserinput'
      || method === 'requestuserinput'
      || type === 'userinput'
      || type === 'optionpicker'
      || type === 'setupcodex') return 'waitingOnUserInput'
    if (method === 'item/commandexecution/requestapproval'
      || method === 'item/filechange/requestapproval'
      || method === 'item/permissions/requestapproval'
      || method === 'mcpserver/elicitation/request'
      || method === 'requestapproval' && (type === 'approval' || type === 'commandexecution' || type === 'filechange' || type === 'permissions')
      || type === 'elicitation') return 'waitingOnApproval'
    return ''
  }

  function codexDesktopRuntimeHasWaitingFlags(runtime) {
    return (Array.isArray(runtime?.activeFlags) ? runtime.activeFlags : [])
      .some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
  }

  function codexDesktopRuntimeIsPlainActive(runtime) {
    return runtime?.type === 'active' && !codexDesktopRuntimeHasWaitingFlags(runtime)
  }

  function codexDesktopRuntimeBecamePlainActive(previousRuntime, currentRuntime) {
    return Boolean(previousRuntime?.type)
      && codexDesktopRuntimeIsPlainActive(currentRuntime)
      && !codexDesktopRuntimeIsPlainActive(previousRuntime)
  }

  function codexDesktopRemovedWaitingRequests(previousRequests, currentRequests) {
    const currentSequences = new Set((Array.isArray(currentRequests) ? currentRequests : [])
      .map((request) => request?.observedSequence)
      .filter(Number.isInteger))
    return (Array.isArray(previousRequests) ? previousRequests : [])
      .filter((request) => !currentSequences.has(request?.observedSequence))
  }

  function codexDesktopRetainCausallyOpenRequests(shadow, previousState, completedPlanContext = false) {
    if (!shadow || !previousState
      || codexDesktopRuntimeBecamePlainActive(previousState.runtime, shadow.runtime)) return false
    const retained = codexDesktopRemovedWaitingRequests(previousState.requests, shadow.requests)
      .filter((request) => {
        if (request?.asyncQuestion === true
          || ['resolved', 'cancelled', 'execution-started'].includes(request?.interactionState)
          || !codexDesktopRequestFlag(request)) return false
        const kind = codexDesktopRequestKind(request)
        return kind === 'plan-choice' || kind === 'plan-implementation'
          || request.identityExact === true && completedPlanContext
      })
    if (!retained.length) return false
    shadow.requests = [...(Array.isArray(shadow.requests) ? shadow.requests : []), ...retained]
    shadow.requestSetRevision = previousState.requestSetRevision
    shadow.requestSetComplete = previousState.requestSetComplete
    shadow.requestSetAuthority = previousState.requestSetAuthority
    return true
  }

  function codexDesktopResolveWaitingRequestObservations(bridge, threadId, requests, sequence, shadow, resolvedLimit, visible) {
    const observations = (Array.isArray(requests) ? requests : [])
      .filter((request) => codexDesktopRequestFlag(request) && Number.isInteger(request?.observedSequence))
    if (!observations.length) return 0
    const state = bridge.waitingStateFor(threadId)
    const resolvedSequence = Number.isInteger(sequence) && sequence > 0
      ? sequence
      : nextLiveEvidenceSequence()
    for (const request of observations) {
      state.resolvedRequestSequences.delete(request.observedSequence)
      state.resolvedRequestSequences.set(request.observedSequence, resolvedSequence)
      bridge.recordInteractionTerminalOnShadow(shadow, request, 'resolved', resolvedSequence)
    }
    while (state.resolvedRequestSequences.size > resolvedLimit) {
      const oldest = state.resolvedRequestSequences.keys().next().value
      if (!Number.isInteger(oldest)) break
      state.resolvedRequestSequences.delete(oldest)
    }
    const clearedAsyncFlags = codexDesktopAsyncResolvedRuntimeFlags(
      observations, shadow?.requests, state, visible) || []
    if (clearedAsyncFlags.length) bridge.clearWaitingEvidence(threadId, clearedAsyncFlags, { sequence: resolvedSequence })
    bridge.recordWaitingResolutionOnShadow(shadow, resolvedSequence)
    return resolvedSequence
  }

  function codexDesktopAsyncResolvedRuntimeFlags(observations, requests, state, visible) {
    // Only exact async-question closure can retire that input epoch's older
    // runtime flag; other current input instances remain independently live.
    return [...new Set(observations
      .filter((request) => request.asyncQuestion === true && request.identityExact === true)
      .map(codexDesktopRequestFlag))]
      .filter((flag) => !(requests || []).some((request) => (
        codexDesktopRequestFlag(request) === flag && visible(state, flag, request.observedSequence)
      )))
  }

  function codexDesktopResumedWaitingFlags(previousRuntime, currentRuntime, currentRequests, previousRequests) {
    if (!codexDesktopRuntimeBecamePlainActive(previousRuntime, currentRuntime)) return []
    const previouslyWaiting = new Set((Array.isArray(previousRequests) ? previousRequests : [])
      .map(codexDesktopRequestFlag)
      .filter(Boolean))
    if (codexDesktopRuntimeHasWaitingFlags(previousRuntime)) {
      for (const flag of previousRuntime.activeFlags) previouslyWaiting.add(flag)
    }
    return [...new Set((Array.isArray(currentRequests) ? currentRequests : [])
      .map(codexDesktopRequestFlag)
      .filter(Boolean))]
      .filter((flag) => previouslyWaiting.has(flag))
  }

  function codexDesktopCompanionInteractionsForParent(bridge, parentThreadId, known, privateBranchRef, waitingEvidenceVisible) {
    if (!known?.key) return null
    const shadowEntries = []
    const own = bridge.shadows.get(parentThreadId)
    if (own) shadowEntries.push([parentThreadId, own])
    for (const [childThreadId, shadow] of bridge.sideShadows) {
      if (shadow.parentThreadId === parentThreadId) shadowEntries.push([childThreadId, shadow])
    }
    const requestSetRevision = Math.max(
      0,
      ...shadowEntries.flatMap(([, shadow]) => [
        Number(shadow.requestSetRevision) || 0,
        Number(shadow.activityEventSequence) || 0,
        ...Object.values(record(shadow.runtimeWaitingSequences)).map((value) => Number(value) || 0)
      ])
    )
    if (!requestSetRevision) return null
    const byInstance = new Map()
    const interactionSets = []
    for (const [threadId, shadow] of shadowEntries) {
      recordStreamProjection(bridge, threadId, shadow, waitingEvidenceVisible)
      const branchRef = threadId === parentThreadId
        ? 'root'
        : privateBranchRef(parentThreadId, threadId)
      // Requests belong to the member that presents them. Parent activity and
      // complete request sets cannot resolve an unanswered Side instance.
      const taskKey = threadId === parentThreadId ? known.key : `codex-child:${branchRef}`
      const turnEpoch = threadId === parentThreadId
        ? Number(known.lastTurnStartedAt) || 0
        : Number(shadow.currentCanonicalTurn?.startedAt) || 0
      if (shadow.requestSetComplete === true) interactionSets.push({
        revision: COMPANION_V7_REVISIONS.interaction, provider: 'codex',
        taskKey, requestSetRevision, complete: true
      })
      const candidates = [
        ...(Array.isArray(shadow.requests) ? shadow.requests : []),
        ...(Array.isArray(shadow.interactionTerminals) ? shadow.interactionTerminals : [])
      ]
      const visibleRequestFlags = new Set()
      for (const request of candidates) {
        const kind = codexDesktopRequestKind(request)
        const interactionRef = typeof request?.interactionRef === 'string' && /^[a-f0-9]{16,64}$/i.test(request.interactionRef)
          ? request.interactionRef.toLowerCase()
          : ''
        if (!kind || !interactionRef) continue
        const terminal = ['resolved', 'cancelled', 'execution-started'].includes(request.interactionState)
        if (!terminal) {
          const flag = codexDesktopRequestFlag(request)
          if (!flag || !waitingEvidenceVisible(shadow.waitingState, flag, request.observedSequence)) continue
          visibleRequestFlags.add(flag)
        }
        const sequence = terminal
          ? Number(request.resolutionSequence) || Number(request.observedSequence) || 0
          : Number(request.observedSequence) || 0
        if (!Number.isSafeInteger(sequence) || sequence <= 0) continue
        const evidence = {
          revision: COMPANION_V7_REVISIONS.interaction,
          provider: 'codex',
          taskKey,
          branchRef,
          interactionRef,
          kind,
          state: terminal ? request.interactionState : 'opened',
          sequence,
          turnEpoch,
          requestSetRevision,
          authority: terminal
            ? 'provider-live'
            : shadow.requestSetAuthority === 'provider-live' ? 'provider-live' : 'provider-snapshot',
          exact: request.identityExact === true
        }
        const instanceKey = `${branchRef}\0${interactionRef}`
        const previous = byInstance.get(instanceKey)
        if (!previous || evidence.sequence > previous.sequence
          || evidence.sequence === previous.sequence && terminal && previous.state === 'opened') {
          byInstance.set(instanceKey, evidence)
        }
      }
      for (const flag of Array.isArray(shadow.runtime?.activeFlags) ? shadow.runtime.activeFlags : []) {
        if (visibleRequestFlags.has(flag)) continue
        const sequence = Number(shadow.runtimeWaitingSequences?.[flag]) || 0
        if (!sequence || !waitingEvidenceVisible(shadow.waitingState, flag, sequence)) continue
        const interactionRef = crypto.createHash('sha256')
          .update('codex-runtime-interaction-v1')
          .update('\0')
          .update(branchRef)
          .update('\0')
          .update(flag)
          .update('\0')
          .update(String(sequence))
          .digest('hex')
          .slice(0, 32)
        byInstance.set(`${branchRef}\0${interactionRef}`, {
          revision: COMPANION_V7_REVISIONS.interaction,
          provider: 'codex',
          taskKey,
          branchRef,
          interactionRef,
          kind: flag === 'waitingOnApproval' ? 'approval' : 'user-input',
          state: 'opened',
          sequence,
          turnEpoch,
          requestSetRevision,
          authority: shadow.activityEvidence === 'activity-event' ? 'provider-live' : 'provider-snapshot',
          exact: true
        })
      }
    }
    return {
      taskKey: known.key,
      requestSetRevision,
      interactions: [...byInstance.values()],
      interactionSets
    }
  }


  return {
    revision: CODEX_DESKTOP_REQUEST_PROJECTION_REVISION,
    codexDesktopRefreshInventoryOwner,
    codexDesktopRefreshPendingOwner,
    codexDesktopHandleOwnerDiscoveryResponse,
    codexDesktopClearOwnerRefreshes,
    codexDesktopCompanionInteractionsForParent,
    codexDesktopRequestTimestamp,
    codexDesktopRequestCorrelation,
    codexDesktopProjectedRequest,
    codexDesktopProjectedRequests,
    codexDesktopIsPlanImplementationRequest,
    codexDesktopRequestKind,
    codexDesktopRequestFlag,
    codexDesktopRuntimeHasWaitingFlags,
    codexDesktopRuntimeBecamePlainActive,
    codexDesktopRemovedWaitingRequests,
    codexDesktopRetainCausallyOpenRequests,
    codexDesktopAsyncResolvedRuntimeFlags,
    codexDesktopResolveWaitingRequestObservations,
    codexDesktopResumedWaitingFlags
  }
}

module.exports = {
  CODEX_DESKTOP_REQUEST_PROJECTION_REVISION,
  createCodexDesktopRequestProjection
}
