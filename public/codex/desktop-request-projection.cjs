'use strict'

const {
  COMPANION_V7_REVISIONS,
  COMPANION_INTERACTION_KINDS_V1,
  normalizeCompanionInteractionEvidenceV1,
  normalizeCompanionInteractionSetEvidenceV1
} = require('../companion/contracts-v7.cjs')

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
const OWNER_REQUEST_LIMIT = 8
const OWNER_BACKGROUND_LIMIT = 4
const OWNER_RESERVED_FOR_ACTIVITY = 2
const OWNER_SIDE_LIMIT = 4
const OWNER_QUEUE_LIMIT = 32
const OWNER_ATTEMPT_LIMIT = 1_000
const OWNER_BROADCAST_GRACE_MS = 250
const OWNER_BACKGROUND_QUEUE_MS = 1_000
const OWNER_RESPONSE_MS = 5_000
const OWNER_BACKGROUND_BACKOFF_MS = 30_000
const OWNER_ATTEMPTS_PER_SIGNATURE = 2

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
  const fallbackMembers = new Map()
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now()
  const startTimer = dependencies.setTimeout || setTimeout
  const stopTimer = dependencies.clearTimeout || clearTimeout

  function pendingOwnerSignature(shadow) {
    const requests = (shadow?.requests || []).filter((request) => request.asyncQuestion === true
      && request.identityExact === true
      && !['resolved', 'cancelled', 'execution-started'].includes(request.interactionState)
      && dependencies.waitingEvidenceVisible?.(shadow.waitingState, codexDesktopRequestFlag(request), request.observedSequence) !== false)
    return requests.length ? {
      value: requests.map((request) => request.observedSequence).sort((left, right) => left - right).join(','),
      observedAt: Math.max(...requests.map((request) => timestampMs(request.observedAt)))
    } : null
  }

  function recordOwnerRefresh(threadId, outcome, entry, reason) {
    dependencies.recordDiagnostic?.({ level: 'info', scope: 'task-recovery', event: 'desktop-owner-snapshot',
      provider: 'codex', taskRef: threadId, outcome,
      details: { mode: entry.mode, pendingCount: entry.shadow?.requests?.filter((request) => request.asyncQuestion).length || 0,
        ...(typeof entry.ownerMatched === 'boolean' ? { ownerMatched: entry.ownerMatched } : {}) } })
    dependencies.recordSyncStage?.(entry.parentId, outcome === 'requested' ? 'owner-requested' : 'owner-resolved', {
      outcome, turnStartedAt: entry.turnStartedAt, priority: entry.priority ? 'targeted' : 'background', reason
    }, threadId)
  }

  function coversOwnerTurn(turnStartedAt, turnId, observedStart, observedRef) {
    if (turnStartedAt && observedStart !== turnStartedAt) return observedStart > turnStartedAt
    return !turnId || observedRef === codexDesktopRequestCorrelation({ id: turnId })
  }

  function inventoryOwnerSatisfied(bridge, entry, shadow) {
    const stream = bridge.streamProtocolFor?.(entry.threadId)
    if (!shadow?.ownerClientId || shadow.ownerDisconnectedAt || stream?.available !== true
      || stream.generation !== bridge.streamGeneration || stream.ownerClientId !== shadow.ownerClientId
      || !Number.isSafeInteger(stream.trustedRevision) || stream.trustedRevision !== shadow.revision) return false
    return coversOwnerTurn(entry.turnStartedAt, entry.turnId,
      timestampMs(shadow.currentCanonicalTurn?.startedAt), shadow.currentCanonicalTurn?.turnRef)
  }

  function pendingOwnerSatisfied(bridge, entry, shadow, requestedSetRevision) {
    return entry.mode === 'pending' && shadow?.requestSetComplete === true
      && shadow.requestSetRevision > requestedSetRevision && inventoryOwnerSatisfied(bridge, entry, shadow)
  }

  function ownerDemand(bridge, entry) {
    const { threadId, parentId } = entry
    if (!bridge.inventory.has(parentId)
      || bridge.parentThreadIdFor && bridge.parentThreadIdFor(threadId) !== parentId) return null
    const context = bridge.ownerEvidenceFor ? bridge.ownerEvidenceFor(threadId, parentId) : { known: entry.known }
    const known = context?.known
    if (!known) return null
    const shadow = bridge.shadows.get(threadId) || bridge.sideShadows.get(threadId)
    const side = threadId !== parentId
    const member = context.member
    const appActivity = side ? context.appServerSide : known
    const appLive = appActivity?.appServerLiveActive === true
    const ownStatus = side ? member?.status : known.connectorStatus
    const ownTurnStatus = side ? member?.lastTurnStatus : known.connectorLastTurnStatus
    const rootStart = timestampMs(known.connectorLastTurnStartedAt)
    const rootTurnId = known.connectorLastTurnId || ''
    const directRoot = !side && known.status === 'active' && (known.lastTurnEvidence === 'turn-started' || appLive)
    const turnStartedAt = side
      ? timestampMs(appLive && context.liveTurn?.startedAt || member?.turnStartedAt)
      : timestampMs(directRoot && known.lastTurnStartedAt) || rootStart
    const turnId = side ? (appLive && context.liveTurn?.id || member?.turnId || '')
      : (directRoot && known.lastTurnId || rootTurnId)
    const parentTurn = !side || (!turnStartedAt && !turnId)
      ? [rootStart, rootTurnId, timestampMs(known.lastTurnStartedAt), known.lastTurnId] : null
    const basis = JSON.stringify([parentId, member?.spawnEdgeBasis, turnStartedAt, turnId, parentTurn])
    if (entry.mode === 'pending') {
      const pending = pendingOwnerSignature(shadow)
      if (!pending?.observedAt || now() - pending.observedAt < 20_000
        || codexDesktopRuntimeHasWaitingFlags({ activeFlags: side ? member?.activeFlags : known.connectorActiveFlags })) return null
      return { signature: `${basis}:pending:${pending.value}`, priority: 2, turnStartedAt, turnId, shadow }
    }
    const closedAt = context.machine && member?.closedSpawnObservedAt
    if (closedAt > 0 && closedAt > Math.max(member.activeEvidenceSequence || 0,
      shadow?.activityEventSequence || 0, appLive ? appActivity.appServerLiveSequence || 0 : 0)) return null
    const terminal = context.terminal
    const terminalStart = timestampMs(terminal?.turnStartedAt)
    const terminalCurrent = terminalStart > 0 && coversOwnerTurn(turnStartedAt, turnId, terminalStart, terminal.turnRef)
    const waiting = codexDesktopRuntimeHasWaitingFlags({ activeFlags: side ? member?.activeFlags : known.connectorActiveFlags })
    const ambiguous = ownStatus === 'notLoaded' && ownTurnStatus === 'interrupted' && Boolean(turnStartedAt || turnId)
    const openRollout = ambiguous && context.openRollout === true
    if (terminalCurrent && !appLive && !directRoot && !waiting
      && !(openRollout && terminal.lastTurnEvidence === 'targeted-after-exit' && terminal.lastTurnStatus === 'interrupted')
      && !(member?.activeEvidenceSequence > terminal.terminalEvidenceSequence)) return null
    const active = appLive || directRoot || ownStatus === 'active' || ownTurnStatus === 'inProgress' || openRollout
    const recoverSide = side && !active && !context.machine && !shadow
      && (entry.recoveryRequested || known.lastTurnStatus === 'completed' && bridge.sideRecoveryPending?.has(threadId))
    if (!active && !recoverSide && !ambiguous) return null
    const priority = active ? 2 : recoverSide ? 1 : 0
    return { signature: `${basis}:${priority}:${appLive ? appActivity.appServerLiveSequence || 0 : 0}`,
      priority, recoverSide, turnStartedAt, turnId, shadow }
  }

  function ownerEntryObsolete(bridge, entry) {
    if (bridge.closed || bridge.state !== 'connected' || bridge.socket !== entry.socket
      || bridge.streamGeneration !== entry.generation) return 'connection-changed'
    const current = ownerDemand(bridge, entry)
    if (!current || current.signature !== entry.signature) return 'target-changed'
    if (pendingOwnerSatisfied(bridge, entry, current.shadow, entry.requestedSetRevision)) return 'stream-current'
    if (entry.mode === 'pending' && current.shadow !== entry.shadow) return 'target-changed'
    if (entry.mode === 'inventory' && inventoryOwnerSatisfied(bridge, entry, current.shadow)) return 'stream-current'
    return ''
  }

  function discardOwnerEntry(state, entry, reason) {
    if (state.queue.get(entry.threadId) === entry) state.queue.delete(entry.threadId)
    if (entry.requestId) {
      state.pending.delete(entry.requestId)
      stopTimer(entry.timer)
    }
    entry.outcome = 'discarded'
    recordOwnerRefresh(entry.threadId, 'discarded', entry, reason)
  }

  function recoverOwnerSide(bridge, state, entry, dueAt = now()) {
    const key = `inventory:${entry.threadId}`
    const attempt = state.attempted.get(key)
    if (!entry.recoverSide || attempt?.signature !== entry.signature) return
    const current = () => ownerRefreshes.get(bridge) === state && state.attempted.get(key) === attempt
      && !ownerEntryObsolete(bridge, entry)
    if (!current()) return
    if (dueAt > now() || bridge.sideTerminalReadAvailable?.(entry.threadId) === false) {
      attempt.sideReadAt = dueAt
      return
    }
    delete attempt.sideReadAt
    void bridge.recoverUnloadedSideTerminal?.(entry.parentId, entry.threadId, undefined, current)
  }

  function expireOwnerResponse(bridge, state, entry) {
    if (state.pending.get(entry.requestId) !== entry) return
    state.pending.delete(entry.requestId)
    stopTimer(entry.timer)
    const reason = ownerEntryObsolete(bridge, entry)
    entry.outcome = reason ? 'discarded' : 'expired'
    recordOwnerRefresh(entry.threadId, entry.outcome, entry, reason || 'response-deadline')
    if (!reason) {
      armOwnerRetry(state, entry)
      if (!entry.priority) state.backgroundRetryAt = now() + OWNER_BACKGROUND_BACKOFF_MS
      if (entry.recoverSide) recoverOwnerSide(bridge, state, entry)
    }
    drainOwnerQueue(bridge, state)
  }

  function armOwnerRetry(state, entry) {
    const attempt = state.attempted.get(`${entry.mode}:${entry.threadId}`)
    if (!attempt || attempt.signature !== entry.signature || attempt.count >= OWNER_ATTEMPTS_PER_SIGNATURE) return
    attempt.retryAt = now() + OWNER_BACKGROUND_BACKOFF_MS
    attempt.retry = entry
  }

  function drainOwnerQueue(bridge, state) {
    if (state.draining || ownerRefreshes.get(bridge) !== state) return
    state.draining = true
    try {
      for (const attempt of state.attempted.values()) {
        const entry = attempt.retry
        if (!entry || attempt.retryAt > now()) continue
        delete attempt.retry
        if (!ownerEntryObsolete(bridge, entry)) {
          refreshOwner(bridge, entry.threadId, entry.known, entry.mode, entry.parentId, entry.recoveryRequested)
        }
      }
      while (state.queue.size && ownerRefreshes.get(bridge) === state) {
        const at = now()
        const pending = [...state.pending.values()]
        const lowerPriorityCount = pending.filter((item) => item.priority < 2).length
        const sideCount = pending.filter((item) => item.recoverSide).length
        let entry = null
        for (const candidate of state.queue.values()) {
          const reason = at >= candidate.expiresAt ? 'queue-deadline'
            : !candidate.priority && at < state.backgroundRetryAt ? 'background-backoff' : ownerEntryObsolete(bridge, candidate)
          if (reason) { discardOwnerEntry(state, candidate, reason); continue }
          if (at < candidate.readyAt || pending.length >= OWNER_REQUEST_LIMIT
            || candidate.priority < 2 && lowerPriorityCount >= OWNER_REQUEST_LIMIT - OWNER_RESERVED_FOR_ACTIVITY
            || candidate.recoverSide && sideCount >= OWNER_SIDE_LIMIT) continue
          if (!entry || entry.priority < candidate.priority) entry = candidate
        }
        if (!entry) break
        const { threadId } = entry
        state.queue.delete(threadId)
        const requestId = crypto.randomUUID()
        entry.responseDeadline = now() + OWNER_RESPONSE_MS
        const attemptKey = `${entry.mode}:${threadId}`
        const previous = state.attempted.get(attemptKey)
        state.attempted.delete(attemptKey)
        entry.requestedSetRevision = entry.shadow?.requestSetRevision || 0
        state.attempted.set(attemptKey, {
          signature: entry.signature, mode: entry.mode, threadId, parentId: entry.parentId,
          turnStartedAt: entry.turnStartedAt, turnId: entry.turnId,
          requestedSetRevision: entry.requestedSetRevision,
          count: (previous?.signature === entry.signature ? previous.count : 0) + 1,
          retryAt: entry.responseDeadline + OWNER_BACKGROUND_BACKOFF_MS
        })
        while (state.attempted.size > OWNER_ATTEMPT_LIMIT) state.attempted.delete(state.attempted.keys().next().value)
        entry.requestId = requestId
        state.pending.set(requestId, entry)
        entry.timer = startTimer(() => expireOwnerResponse(bridge, state, entry), OWNER_RESPONSE_MS)
        entry.timer?.unref?.()
        entry.outcome = 'requested'
        recordOwnerRefresh(threadId, 'requested', entry)
        if (bridge.send({ type: 'request', method: 'thread-owner-discovery', requestId,
          sourceClientId: bridge.clientId, version: 1, params: { hostId: 'local', conversationId: threadId } })) continue
        stopTimer(entry.timer)
        state.pending.delete(requestId)
        entry.outcome = 'unavailable'
        armOwnerRetry(state, entry)
        if (!entry.priority) state.backgroundRetryAt = now() + OWNER_BACKGROUND_BACKOFF_MS
        recordOwnerRefresh(threadId, 'unavailable', entry, 'send-unavailable')
        if (entry.recoverSide) recoverOwnerSide(bridge, state, entry)
      }
    } finally {
      state.draining = false
      if (state.wakeTimer != null) stopTimer(state.wakeTimer)
      state.wakeTimer = null
      if (ownerRefreshes.get(bridge) === state) {
        const at = now()
        const deadlines = Array.from(state.queue.values(), entry => entry.readyAt > at ? entry.readyAt : entry.expiresAt)
        for (const attempt of state.attempted.values()) if (attempt.retry) deadlines.push(attempt.retryAt)
        if (deadlines.length) {
          const next = Math.min(...deadlines)
          state.wakeTimer = startTimer(() => drainOwnerQueue(bridge, state), Math.max(0, next - at))
          state.wakeTimer?.unref?.()
        }
      }
    }
  }

  function refreshOwner(bridge, threadId, known, mode, verifiedParentId, recoverSide = false) {
    const shadow = bridge?.shadows?.get(threadId) || bridge?.sideShadows?.get(threadId)
    const parentId = verifiedParentId || shadow?.parentThreadId || threadId
    if (bridge?.closed || bridge?.state !== 'connected' || !bridge.socket) return false
    const entry = { threadId, parentId, known, mode, recoveryRequested: recoverSide,
      socket: bridge.socket, generation: bridge.streamGeneration, outcome: 'queued' }
    const demand = ownerDemand(bridge, entry)
    Object.assign(entry, demand)
    if (!demand || mode === 'inventory' && inventoryOwnerSatisfied(bridge, entry, entry.shadow)) {
      const previous = ownerRefreshes.get(bridge)
      const removed = previous?.attempted.delete(`${mode}:${threadId}`)
      codexDesktopReconcileOwnerTarget(bridge, threadId)
      if (removed) drainOwnerQueue(bridge, previous)
      return false
    }
    let state = ownerRefreshes.get(bridge)
    if (state && (state.socket !== bridge.socket || state.generation !== bridge.streamGeneration)) {
      codexDesktopClearOwnerRefreshes(bridge)
      state = null
    }
    if (!state) {
      state = { pending: new Map(), attempted: new Map(), queue: new Map(), backgroundRetryAt: 0,
        socket: bridge.socket, generation: bridge.streamGeneration, wakeTimer: null }
      ownerRefreshes.set(bridge, state)
    }
    const attemptKey = `${mode}:${threadId}`
    const current = state.queue.get(threadId) || [...state.pending.values()].find((item) => item.threadId === threadId)
    if (current) {
      const reason = ownerEntryObsolete(bridge, current)
      if (reason) discardOwnerEntry(state, current, reason)
      else if (mode === 'pending' && current.mode === 'inventory' && !current.requestId) {
        discardOwnerEntry(state, current, 'superseded')
      } else return !current.requestId && current.mode === mode
    }
    const queueLimit = entry.priority === 2 ? OWNER_QUEUE_LIMIT : OWNER_QUEUE_LIMIT - OWNER_REQUEST_LIMIT
    const at = now()
    const attempt = state.attempted.get(attemptKey)
    if (attempt?.signature === entry.signature) {
      if (pendingOwnerSatisfied(bridge, entry, entry.shadow, attempt.requestedSetRevision)) return false
      if (attempt.sideReadAt != null && attempt.sideReadAt <= at) recoverOwnerSide(bridge, state, entry)
      if (attempt.count >= OWNER_ATTEMPTS_PER_SIGNATURE || at < attempt.retryAt) return false
    }
    if (state.queue.size >= queueLimit) return false
    if (!entry.priority && (at < state.backgroundRetryAt
      || [...state.queue.values(), ...state.pending.values()].filter((item) => !item.priority).length >= OWNER_BACKGROUND_LIMIT)) return false
    entry.readyAt = entry.priority ? at : at + OWNER_BROADCAST_GRACE_MS
    entry.expiresAt = at + (entry.priority ? OWNER_RESPONSE_MS * 2 : OWNER_BACKGROUND_QUEUE_MS)
    state.queue.set(threadId, entry)
    dependencies.recordSyncStage?.(parentId, 'owner-queued', {
      outcome: 'queued', turnStartedAt: entry.turnStartedAt, priority: entry.priority ? 'targeted' : 'background'
    }, threadId)
    drainOwnerQueue(bridge, state)
    return !['unavailable', 'discarded'].includes(entry.outcome)
  }

  function codexDesktopRefreshInventoryOwner(bridge, threadId, known, verifiedParentId, recoverSide) {
    return refreshOwner(bridge, threadId, known, 'inventory', verifiedParentId, recoverSide)
  }

  /** Revalidate evidence, never infer that plain-active or elapsed time answered it. */
  function codexDesktopRefreshPendingOwner(bridge, threadId, known) {
    return refreshOwner(bridge, threadId, known, 'pending')
  }

  function codexDesktopHandleOwnerDiscoveryResponse(bridge, message) {
    const state = ownerRefreshes.get(bridge)
    const entry = message?.type === 'response' ? state?.pending.get(message.requestId) : null
    if (!entry) return false
    if (now() >= entry.responseDeadline) {
      expireOwnerResponse(bridge, state, entry)
      return true
    }
    state.pending.delete(message.requestId)
    stopTimer(entry.timer)
    const shadow = bridge.shadows.get(entry.threadId) || bridge.sideShadows.get(entry.threadId)
    const reason = ownerEntryObsolete(bridge, entry)
    if (message.method !== 'thread-owner-discovery' || message.resultType !== 'success'
      || typeof message.handledByClientId !== 'string' || !message.handledByClientId || message.handledByClientId.length > 512
      || reason) {
      const failed = message.method === 'thread-owner-discovery' && message.resultType === 'error'
      if (!reason) {
        armOwnerRetry(state, entry)
        if (!entry.priority) state.backgroundRetryAt = now() + OWNER_BACKGROUND_BACKOFF_MS
        if (entry.recoverSide && failed && message.error === 'no-client-found') recoverOwnerSide(bridge, state, entry)
      }
      recordOwnerRefresh(entry.threadId, 'discarded', entry, reason || (failed ? 'owner-unavailable' : 'invalid-response'))
      drainOwnerQueue(bridge, state)
      return true
    }
    entry.ownerMatched = shadow?.ownerClientId === message.handledByClientId
    const sent = bridge.followAny(entry.threadId, true, [message.handledByClientId])
    armOwnerRetry(state, entry)
    recordOwnerRefresh(entry.threadId, sent ? 'targeted' : 'unavailable', entry)
    if (entry.recoverSide) recoverOwnerSide(bridge, state, entry, sent ? entry.responseDeadline : now())
    drainOwnerQueue(bridge, state)
    return true
  }

  function codexDesktopReconcileOwnerTarget(bridge, threadId, forget = false) {
    const state = ownerRefreshes.get(bridge)
    if (!state) return
    let discarded = false
    for (const entry of [...state.pending.values(), ...state.queue.values()]) {
      if (entry.threadId !== threadId && !(forget && entry.parentId === threadId)) continue
      const reason = forget ? 'target-changed' : ownerEntryObsolete(bridge, entry)
      if (!reason) continue
      discardOwnerEntry(state, entry, reason)
      discarded = true
    }
    if (forget) {
      state.attempted.delete(`inventory:${threadId}`)
      state.attempted.delete(`pending:${threadId}`)
      for (const [key, attempt] of state.attempted) if (attempt.parentId === threadId) state.attempted.delete(key)
    }
    for (const mode of ['pending', 'inventory']) {
      const key = `${mode}:${threadId}`
      const attempt = state.attempted.get(key)
      if (!attempt) continue
      const shadow = bridge.shadows.get(threadId) || bridge.sideShadows.get(threadId)
      if (mode === 'pending' ? pendingOwnerSatisfied(bridge, attempt, shadow, attempt.requestedSetRevision)
        : inventoryOwnerSatisfied(bridge, attempt, shadow)) {
        if (mode === 'inventory') state.attempted.delete(key)
        else {
          // This complete set satisfies the request while it remains trusted.
          // Losing the owner later starts a new budget, even for the same Turn.
          attempt.count = 0
          attempt.retryAt = 0
          delete attempt.retry
        }
        discarded = true
        continue
      }
      const retry = attempt.retry
      const reason = retry && ownerEntryObsolete(bridge, retry)
      if (reason) {
        state.attempted.delete(key)
        discarded = true
      }
    }
    if (discarded || forget) drainOwnerQueue(bridge, state)
  }

  function codexDesktopClearOwnerRefreshes(bridge) {
    streamObservations.delete(bridge)
    const state = ownerRefreshes.get(bridge)
    if (!state) return
    ownerRefreshes.delete(bridge)
    if (state.wakeTimer != null) stopTimer(state.wakeTimer)
    for (const entry of [...state.pending.values(), ...state.queue.values()]) discardOwnerEntry(state, entry, 'connection-changed')
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

  function fallbackMember(taskKey, parentTaskKey) {
    let member = fallbackMembers.get(taskKey)
    if (!member) {
      member = { parentTaskKey, branches: new Map(), nativeRevision: 0, nativeTurnEpoch: 0 }
      fallbackMembers.set(taskKey, member)
    }
    return member
  }

  function codexDesktopClearFallbackInteractions(taskKey) {
    return fallbackMembers.delete(taskKey)
  }

  function codexDesktopResetFallbackInteractions() {
    fallbackMembers.clear()
  }

  function codexDesktopProjectFallbackInteractions(input = {}) {
    const source = record(input)
    const parentTaskKey = typeof source.parentTaskKey === 'string' ? source.parentTaskKey : ''
    if (!parentTaskKey || parentTaskKey.length > 256 || /[\r\n\0]/.test(parentTaskKey)) {
      return { interactions: [], interactionSets: [], requestSetRevision: 0 }
    }
    const native = record(source.nativeEvidence)
    const interactions = []
    const invalidMembers = new Set()
    const nativeRequestsKnown = Array.isArray(native.interactions)
    for (const value of nativeRequestsKnown ? native.interactions : []) {
      const interaction = normalizeCompanionInteractionEvidenceV1(value, 'codex')
      if (interaction) interactions.push(interaction)
      else invalidMembers.add(typeof value?.taskKey === 'string' ? value.taskKey : '')
    }
    const completeSets = new Map()
    if (nativeRequestsKnown && (native.health === undefined || native.health === 'ready')
      && !invalidMembers.has('')) {
      for (const value of Array.isArray(native.interactionSets) ? native.interactionSets : []) {
        const requestSet = normalizeCompanionInteractionSetEvidenceV1(value, 'codex')
        if (!requestSet || invalidMembers.has(requestSet.taskKey)) continue
        const member = fallbackMember(requestSet.taskKey, parentTaskKey)
        if (member.parentTaskKey !== parentTaskKey) continue
        if (requestSet.requestSetRevision < member.nativeRevision
          || requestSet.requestSetRevision > member.nativeRevision
            && [...member.branches.values()].some((branch) => [...branch.instances.values()]
            .some((interaction) => interaction.state === 'opened'
              && interaction.sequence > requestSet.requestSetRevision))) continue
        const previous = completeSets.get(requestSet.taskKey)
        if (!previous || requestSet.requestSetRevision > previous.requestSetRevision) {
          completeSets.set(requestSet.taskKey, requestSet)
        }
      }
    }
    const handoffSets = new Map([...completeSets].filter(([taskKey, requestSet]) => (
      requestSet.requestSetRevision > fallbackMember(taskKey, parentTaskKey).nativeRevision
    )))
    const members = (Array.isArray(source.members) ? source.members : []).map(record)
      .filter((member) => typeof member.taskKey === 'string' && member.taskKey.length > 0
        && member.taskKey.length <= 256 && !/[\r\n\0]/.test(member.taskKey)
        && (member.branchRef === undefined || typeof member.branchRef === 'string'
          && member.branchRef.length > 0 && member.branchRef.length <= 128 && !/[\r\n\0]/.test(member.branchRef)))
      .map((member) => ({
        ...member,
        branchRef: member.branchRef || 'root',
        turnEpoch: timestampMs(member.turnEpoch) || 0,
        waitingSince: timestampMs(member.waitingSince) || 0
      }))
    function retire(branch, clearSequence = 0) {
      for (const [key, interaction] of branch.instances) {
        if (interaction.state !== 'opened' || clearSequence && clearSequence <= interaction.sequence) continue
        const sequence = clearSequence || nextLiveEvidenceSequence()
        const terminal = { ...interaction, state: 'resolved', sequence, requestSetRevision: sequence,
          authority: 'provider-live', exact: true }
        branch.instances.set(key, terminal)
        const boundary = branch.closedBoundary
        if (!boundary || branch.turnEpoch > boundary.turnEpoch
          || branch.turnEpoch === boundary.turnEpoch && branch.waitingSince > boundary.waitingSince) {
          branch.closedBoundary = { turnEpoch: branch.turnEpoch, waitingSince: branch.waitingSince }
        }
      }
    }
    for (const value of members) {
      const member = fallbackMember(value.taskKey, parentTaskKey)
      if (member.parentTaskKey !== parentTaskKey) continue
      if (!value.kind && Number.isSafeInteger(value.clearSequence) && value.clearSequence > 0) {
        const branch = member.branches.get(value.branchRef)
        if (branch && value.turnEpoch >= branch.turnEpoch) retire(branch, value.clearSequence)
      }
      if (!COMPANION_INTERACTION_KINDS_V1.includes(value.kind) && !handoffSets.has(value.taskKey)) continue
      let branch = member.branches.get(value.branchRef)
      if (!branch) {
        branch = { turnEpoch: 0, waitingSince: 0, closedBoundary: member.nativeRevision
          ? { turnEpoch: member.nativeTurnEpoch || Number.MAX_SAFE_INTEGER, waitingSince: Number.MAX_SAFE_INTEGER }
          : null, instances: new Map() }
        member.branches.set(value.branchRef, branch)
      }
      if (value.turnEpoch < branch.turnEpoch
        || value.turnEpoch === branch.turnEpoch && value.waitingSince < branch.waitingSince) continue
      if (value.turnEpoch > branch.turnEpoch || value.waitingSince > branch.waitingSince) retire(branch)
      branch.turnEpoch = value.turnEpoch
      branch.waitingSince = value.waitingSince
    }
    for (const [taskKey, requestSet] of handoffSets) {
      const member = fallbackMember(taskKey, parentTaskKey)
      member.nativeRevision = requestSet.requestSetRevision
      member.nativeTurnEpoch = Math.max(member.nativeTurnEpoch,
        ...interactions.filter((value) => value.taskKey === taskKey).map((value) => value.turnEpoch),
        ...[...member.branches.values()].map((branch) => branch.turnEpoch))
      for (const branch of member.branches.values()) {
        const boundary = branch.closedBoundary
        if (!boundary || branch.turnEpoch > boundary.turnEpoch
          || branch.turnEpoch === boundary.turnEpoch && branch.waitingSince > boundary.waitingSince) {
          branch.closedBoundary = { turnEpoch: branch.turnEpoch, waitingSince: branch.waitingSince }
        }
        retire(branch)
      }
    }
    for (const value of members) {
      if (!COMPANION_INTERACTION_KINDS_V1.includes(value.kind) || handoffSets.has(value.taskKey)) continue
      const member = fallbackMember(value.taskKey, parentTaskKey)
      if (member.parentTaskKey !== parentTaskKey) continue
      const branch = member.branches.get(value.branchRef)
      if (value.turnEpoch !== branch.turnEpoch || value.waitingSince !== branch.waitingSince) continue
      const boundary = branch.closedBoundary
      if (boundary && (value.turnEpoch < boundary.turnEpoch
        || value.turnEpoch === boundary.turnEpoch && value.waitingSince <= boundary.waitingSince)) continue
      const instanceKey = JSON.stringify([value.turnEpoch, value.waitingSince, value.kind])
      let interaction = branch.instances.get(instanceKey)
      if (!interaction) {
        const sequence = nextLiveEvidenceSequence()
        interaction = {
          revision: COMPANION_V7_REVISIONS.interaction, provider: 'codex',
          taskKey: value.taskKey, branchRef: value.branchRef,
          interactionRef: anonymousInteractionRef('fallback-v1', value.taskKey, value.branchRef, instanceKey, sequence),
          kind: value.kind, state: 'opened', sequence, turnEpoch: value.turnEpoch,
          requestSetRevision: sequence,
          authority: value.authority === 'provider-live' ? 'provider-live' : 'provider-snapshot',
          exact: value.exact === true
        }
        branch.instances.set(instanceKey, interaction)
      }
    }
    for (const member of fallbackMembers.values()) {
      if (member.parentTaskKey !== parentTaskKey) continue
      for (const branch of member.branches.values()) {
        for (const interaction of branch.instances.values()) {
          interactions.push({ ...interaction })
        }
      }
    }
    const interactionSets = [...completeSets.values()]
    return {
      interactions,
      interactionSets,
      requestSetRevision: Math.max(0,
        ...interactions.flatMap((value) => [value.sequence, value.requestSetRevision]),
        ...interactionSets.map((value) => value.requestSetRevision))
    }
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

  function codexDesktopIsPlanChoiceRequest(request) {
    const type = String(request?.type || '').toLowerCase()
    const method = String(request?.method || '').toLowerCase()
    return method === 'item/plan/requestuserinput'
      || method === 'item/plan/requestchoice'
      || type === 'planchoice'
  }

  function codexDesktopRequestKind(request) {
    if (codexDesktopIsPlanImplementationRequest(request)) return 'plan-implementation'
    if (codexDesktopIsPlanChoiceRequest(request)) return 'plan-choice'
    if (codexDesktopRequestFlag(request) === 'waitingOnApproval') return 'approval'
    if (codexDesktopRequestFlag(request) === 'waitingOnUserInput') return 'user-input'
    return ''
  }

  function codexDesktopRequestFlag(request) {
    const type = String(request?.type || '').toLowerCase()
    const method = String(request?.method || '').toLowerCase()
    if (codexDesktopIsPlanImplementationRequest(request)
      || codexDesktopIsPlanChoiceRequest(request)
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
    if (!shadow || !previousState) return false
    if (codexDesktopRuntimeBecamePlainActive(previousState.runtime, shadow.runtime)) {
      // An omitted Plan carried across an idle frame expires on execution.
      // A request still present in the native collection has its own lifetime.
      shadow.requests = (shadow.requests || []).filter(request => !request.retainedWhileIdle)
      return false
    }
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
    shadow.requests = [...(shadow.requests || []), ...retained.map(request => ({ ...request, retainedWhileIdle: true }))]
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

  function codexDesktopResumedWaitingEvidence(previousRuntime, currentRuntime, currentRequests, previousRequests) {
    if (!codexDesktopRuntimeBecamePlainActive(previousRuntime, currentRuntime)) return null
    const prior = Array.isArray(previousRequests) ? previousRequests : []
    const previouslyWaiting = new Set(prior
      .map(codexDesktopRequestFlag)
      .filter(Boolean))
    if (codexDesktopRuntimeHasWaitingFlags(previousRuntime)) {
      for (const flag of previousRuntime.activeFlags) previouslyWaiting.add(flag)
    }
    const requests = Array.isArray(currentRequests) ? currentRequests : []
    const exactFlags = new Set(requests.filter(request => request.identityExact === true)
      .map(codexDesktopRequestFlag))
    const flags = [...new Set(requests
      .map(codexDesktopRequestFlag)
      .filter(Boolean))]
      .filter((flag) => previouslyWaiting.has(flag) && !exactFlags.has(flag))
    const previousInstances = new Set(prior.map(request => request.observedSequence))
    const residues = requests.filter(request => request.identityExact !== true
      && previousInstances.has(request.observedSequence) && exactFlags.has(codexDesktopRequestFlag(request)))
    return { flags, residues }
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
      const requestSetRevision = Math.max(0, Number(shadow.requestSetRevision) || 0,
        Number(shadow.activityEventSequence) || 0,
        ...Object.values(record(shadow.runtimeWaitingSequences)).map((value) => Number(value) || 0))
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
          turnEpoch: Number(request.turnEpoch) || turnEpoch,
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
    codexDesktopReconcileOwnerTarget,
    codexDesktopClearOwnerRefreshes,
    codexDesktopProjectFallbackInteractions,
    codexDesktopClearFallbackInteractions,
    codexDesktopResetFallbackInteractions,
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
    codexDesktopResumedWaitingEvidence
  }
}

module.exports = {
  CODEX_DESKTOP_REQUEST_PROJECTION_REVISION,
  createCodexDesktopRequestProjection
}
