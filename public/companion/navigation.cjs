'use strict'

const { PROVIDERS } = require('./provider-registry.cjs')
const { normalizeCompanionOpenReceipt } = require('./open-handoff.cjs')
const COMPANION_NAVIGATION_REVISION = 'companion-navigation-v5'
// Kept as an exported compatibility marker for diagnostics/tests. Generic
// cycling is leading-edge now: the first target is dispatched synchronously.
const { DEFAULT_COALESCE_MS, CYCLE_WALK_HOLD_MS } = require('../timing-policy.cjs')
const MAX_DIRECT_QUEUE = 200
function providerSet(value) {
  if (Array.isArray(value)) return new Set(value.filter((provider) => PROVIDERS.includes(provider)))
  if (!value || typeof value !== 'object') return new Set()
  return new Set(PROVIDERS.filter((provider) => value[provider] === true))
}

function sameProviders(left, right) {
  if (left.size !== right.size) return false
  for (const provider of left) if (!right.has(provider)) return false
  return true
}

function normalizeTarget(value, enabledProviders) {
  if (!value || typeof value !== 'object') return null
  const key = typeof value.key === 'string' ? value.key : ''
  const provider = PROVIDERS.includes(value.provider) ? value.provider : ''
  const actionAlias = typeof value.actionAlias === 'string' ? value.actionAlias : ''
  const revisionAt = Number(value.revisionAt)
  const phase = typeof value.phase === 'string' ? value.phase.slice(0, 40) : 'unknown'
  if (!key || key.length > 256 || !provider || !enabledProviders.has(provider) || actionAlias.length > 256
    || !Number.isFinite(revisionAt) || revisionAt <= 0) return null
  const archiveRequest = value.archiveRequest && typeof value.archiveRequest === 'object'
    ? {
        expectedUpdatedAt: Number(value.archiveRequest.expectedUpdatedAt) || 0,
        expectedRevisionAt: Number(value.archiveRequest.expectedRevisionAt) || 0,
        expectedCompletionAt: Number(value.archiveRequest.expectedCompletionAt) || 0,
        expectedLastTurnStartedAt: Number(value.archiveRequest.expectedLastTurnStartedAt) || 0,
        expectedSourceFingerprint: typeof value.archiveRequest.expectedSourceFingerprint === 'string'
          ? value.archiveRequest.expectedSourceFingerprint.slice(0, 80)
          : '',
        evidence: value.archiveRequest.evidence === 'completed' || value.archiveRequest.evidence === 'stopped'
          ? value.archiveRequest.evidence
          : ''
      }
    : null
  return {
    key,
    provider,
    actionAlias,
    revisionAt,
    phase,
    canArchive: value.canArchive === true,
    archiveRequest
  }
}

function rangeDown(from) {
  const indices = []
  for (let index = from; index >= 0; index -= 1) indices.push(index)
  return indices
}

function rangeUp(from, limit) {
  const indices = []
  for (let index = from; index < limit; index += 1) indices.push(index)
  return indices
}

function unavailable(message, errorCode = 'unavailable') {
  return { outcome: 'unavailable', errorCode, message }
}

function superseded() {
  return unavailable('已由更新的任务跳转目标替代', 'superseded')
}

function normalizeOpenResult(value, target) {
  const source = value && typeof value === 'object' ? value : {}
  const receipt = normalizeCompanionOpenReceipt(source)
  return {
    outcome: receipt.outcome,
    provider: target.provider,
    key: target.key,
    ...(typeof source.operationId === 'string' ? { operationId: source.operationId.slice(0, 160) } : {}),
    ...(typeof source.errorCode === 'string' && source.errorCode ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.message === 'string' && source.message
      ? { message: source.message.slice(0, 240) }
      : receipt.downgraded ? { message: '打开请求已发送，等待原生确认' } : {}),
    confirmsRead: receipt.confirmsRead,
    ...(receipt.handoff ? { handoff: receipt.handoff } : {})
  }
}

function createCompanionNavigation(dependencies = {}) {
  const queueTask = typeof dependencies.queueMicrotask === 'function' ? dependencies.queueMicrotask : queueMicrotask
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const openTarget = typeof dependencies.openTarget === 'function'
    ? dependencies.openTarget
    : async () => unavailable('任务打开能力不可用')

  let enabled = false
  let enabledProviders = new Set()
  let leaseCounter = 0
  let activeLease = 0
  let snapshot = { ready: false, targets: new Map(), cycleKeys: [] }
  let snapshotFingerprint = ''
  let cursorKey = ''
  // A cursor that leaves the ring is not a lost cursor. `cycleKeys` carries only
  // the first non-empty tier, so an ordinary tier change drops the cursor out of
  // it while the task itself is still perfectly alive in `targets`. Treating that
  // as "no cursor" made every later press fall back to index 0, which pins a
  // one-entry tier to a single task forever — the badge still counts the others,
  // and nothing reaches them. The displaced side records which neighbour we
  // re-anchored to, so both directions still resolve to the task the user would
  // have reached from the position they actually lost.
  let cursorDisplacedSide = ''
  let cursorRecoveredCount = 0
  // The ring one walk is traversing, held for the duration of that walk. See
  // CYCLE_WALK_HOLD_MS: the published ring re-sorts on every publish, and the
  // act of opening a task changes the field it sorts on, so a live ring moved
  // under the user between two presses of one walk.
  let walkRing = []
  let walkExpiresAt = 0
  let walkAdoptedCount = 0
  let walkMergedCount = 0
  // Where the next press counts from while an earlier one is still open.
  //
  // `cursorKey` only moves on a confirmed open, which is correct for it — but
  // it meant every press arriving during one in-flight open recomputed from the
  // same unmoved position and selected the same task. A burst of five presses
  // therefore advanced one step, and the four that appeared to be swallowed
  // were really four selections of a target already being opened. The logical
  // cursor advances per press; only the dispatch is collapsed to the last one.
  let pendingCursorKey = ''
  let outstandingCycles = 0
  let coalescedAdvanceCount = 0
  let queuedCycle = null
  let inFlightRequest = null
  const directQueue = []
  let dispatchInFlight = false
  let disposed = false
  let currentConcurrent = 0
  let maxConcurrent = 0
  let replacedCount = 0
  let acceptedCycleCount = 0
  let syncNoopCount = 0
  let dispatchedCodex = 0
  let dispatchedClaude = 0
  let dispatchedCursor = 0
  let lastOutcome = 'idle'
  let resultSequence = 0
  let operationSequence = 0
  const pendingResults = []
  const resultListeners = new Set()

  function operationId(value, prefix = 'nav') {
    if (typeof value === 'string' && /^[a-z0-9:_-]{6,160}$/i.test(value)) return value
    operationSequence += 1
    return `${prefix}_${Date.now().toString(36)}_${operationSequence.toString(36)}`
  }

  function resolveRequest(request, result) {
    if (request?.cycle === true && outstandingCycles > 0) outstandingCycles -= 1
    if (outstandingCycles === 0) pendingCursorKey = ''
    try {
      request.resolve({
        ...result,
        ...(typeof result?.operationId === 'string'
          ? { operationId: result.operationId }
          : typeof request?.operationId === 'string' ? { operationId: request.operationId } : {})
      })
    } catch {}
  }

  function cancelPendingCycle() {
    if (queuedCycle) {
      replacedCount += 1
      resolveRequest(queuedCycle, { ...superseded(), operationId: queuedCycle.operationId })
      queuedCycle = null
    }
    // An abandoned walk must not keep steering later presses; whatever confirms
    // next owns the position.
    pendingCursorKey = ''
  }

  /**
   * The position the next press counts from.
   *
   * While a walk is still resolving, that is the last target this walk selected,
   * so presses accumulate into one final trailing target. With nothing in
   * flight it is the confirmed cursor, which is the only position a completed
   * walk may resume from.
   */
  function walkOrigin() {
    return outstandingCycles > 0 && pendingCursorKey ? pendingCursorKey : cursorKey
  }

  function clearQueued(reason = '导航状态已重置') {
    cancelPendingCycle()
    while (directQueue.length) resolveRequest(directQueue.shift(), unavailable(reason, 'reset'))
  }

  function clearSnapshot(reason) {
    clearQueued(reason)
    snapshot = { ready: false, targets: new Map(), cycleKeys: [] }
    snapshotFingerprint = ''
    cursorKey = ''
    cursorDisplacedSide = ''
    walkRing = []
    walkExpiresAt = 0
    pendingCursorKey = ''
  }


  function walkHeld(now = Date.now()) {
    return walkRing.length > 0 && now < walkExpiresAt
  }

  /**
   * Resolves the ring this press walks, holding the one an in-progress walk
   * started on and adopting the published ring otherwise.
   *
   * Adoption is also where a cursor that did not survive into the new ring is
   * re-anchored, so a walk that resumes after the hold lapsed continues from the
   * position it stopped at instead of from the head.
   */
  function ringForCycle(now) {
    if (walkHeld(now)) {
      const alive = walkRing.filter((key) => snapshot.targets.has(key))
      if (alive.length) {
        // The hold freezes the order the user is walking, not membership. A
        // task published into the ring mid-walk joins at the tail: the badge
        // already counts it, and every press renews the hold, so a steady walk
        // would otherwise never reach it at all.
        const fresh = snapshot.cycleKeys.filter((key) => !alive.includes(key))
        if (fresh.length) {
          walkMergedCount += 1
          record({
            level: 'debug',
            scope: 'navigation',
            event: 'ring-merged',
            outcome: 'merged',
            cache: 'process-package',
            details: { heldCount: alive.length, mergedCount: fresh.length }
          })
        }
        walkRing = fresh.length ? [...alive, ...fresh] : alive
        return walkRing
      }
    }
    const previous = walkRing.length ? walkRing : snapshot.cycleKeys
    walkRing = snapshot.cycleKeys
    walkAdoptedCount += 1
    if (cursorKey && walkRing.length && !walkRing.includes(cursorKey)) recoverCursor(previous)
    return walkRing
  }

  /**
   * Re-anchors a cursor that survived in `targets` but left `cycleKeys`.
   *
   * Scans the ring the cursor was last part of, outward from where it sat, and
   * adopts the nearest surviving neighbour. Which side that neighbour came from
   * is remembered rather than discarded: anchoring to the predecessor makes the
   * next forward press land on the task that followed the lost one, but would
   * make a backward press skip a step, so the opposite direction resolves to the
   * anchor itself.
   */
  function recoverCursor(previousCycleKeys) {
    const lostIndex = previousCycleKeys.indexOf(cursorKey)
    const ring = walkRing.length ? walkRing : snapshot.cycleKeys
    const lostKey = cursorKey
    if (lostIndex >= 0 && ring.length) {
      for (const [side, indices] of [
        ['before', rangeDown(lostIndex - 1)],
        ['after', rangeUp(lostIndex + 1, previousCycleKeys.length)]
      ]) {
        for (const index of indices) {
          const candidate = previousCycleKeys[index]
          if (!ring.includes(candidate)) continue
          cursorKey = candidate
          cursorDisplacedSide = side
          cursorRecoveredCount += 1
          record({
            level: 'debug',
            scope: 'navigation',
            event: 'cursor-recovered',
            outcome: 'recovered',
            taskRef: candidate,
            cache: 'process-package',
            details: { lostKey, side, cycleCount: ring.length }
          })
          return
        }
      }
    }
    cursorKey = ''
    cursorDisplacedSide = ''
  }

  function begin(input = {}) {
    if (disposed) return { revision: COMPANION_NAVIGATION_REVISION, lease: 0, retained: false, ready: false }
    const nextEnabled = input.enabled === true
    const nextProviders = providerSet(input.providers)
    const configurationChanged = enabled !== nextEnabled || !sameProviders(enabledProviders, nextProviders)
    enabled = nextEnabled
    enabledProviders = nextProviders
    activeLease = ++leaseCounter
    if (configurationChanged || !enabled) clearSnapshot(enabled ? '任务来源配置已变化' : '任务功能已停用')
    return {
      revision: COMPANION_NAVIGATION_REVISION,
      lease: activeLease,
      retained: snapshot.ready,
      ready: snapshot.ready
    }
  }

  function sync(input = {}) {
    if (disposed || !Number.isInteger(input.lease) || input.lease !== activeLease) return false
    const nextEnabled = input.enabled === true
    const nextProviders = providerSet(input.providers)
    if (enabled !== nextEnabled || !sameProviders(enabledProviders, nextProviders)) {
      enabled = nextEnabled
      enabledProviders = nextProviders
      clearSnapshot(enabled ? '任务来源配置已变化' : '任务功能已停用')
    }
    if (!enabled) return true
    const targets = new Map()
    for (const value of Array.isArray(input.targets) ? input.targets : []) {
      const target = normalizeTarget(value, enabledProviders)
      if (target && !targets.has(target.key)) targets.set(target.key, target)
    }
    const cycleKeys = []
    const seen = new Set()
    for (const key of Array.isArray(input.cycleKeys) ? input.cycleKeys : []) {
      if (typeof key !== 'string' || seen.has(key) || !targets.has(key)) continue
      seen.add(key)
      cycleKeys.push(key)
    }
    const fingerprint = JSON.stringify({
      ready: input.ready === true,
      targets: [...targets.values()].map((target) => [
        target.key,
        target.provider,
        target.actionAlias,
        target.revisionAt,
        target.phase,
        target.canArchive
      ]),
      cycleKeys
    })
    if (fingerprint === snapshotFingerprint) {
      syncNoopCount += 1
      return true
    }
    const previousCycleKeys = snapshot.cycleKeys
    snapshot = { ready: input.ready === true, targets, cycleKeys }
    snapshotFingerprint = fingerprint
    if (cursorKey && !targets.has(cursorKey)) {
      cursorKey = ''
      cursorDisplacedSide = ''
    } else if (cursorKey && !walkHeld() && !cycleKeys.includes(cursorKey)) {
      recoverCursor(previousCycleKeys)
    }
    return true
  }

  function detach(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return false
    activeLease = 0
    return true
  }

  async function dispatch(request) {
    const startedAt = Date.now()
    currentConcurrent += 1
    maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
    try {
      const result = normalizeOpenResult(await openTarget(request.target, request), request.target)
      const currentOperationId = result.operationId || request.operationId
      if (result.outcome === 'opened' || result.outcome === 'dispatched') {
        // The ring position is what the user is walking, so any confirmed open
        // that lands inside it owns the cursor. A card click, a quick jump or an
        // attention shortcut used to leave the cursor wherever the last cycle
        // stopped, and the next press resumed from there instead of from the
        // task now in front of the user. An open that lands outside the ring —
        // a hidden row, an ephemeral target — deliberately leaves it alone
        // rather than re-creating an unreachable cursor.
        if ((walkHeld() ? walkRing : snapshot.cycleKeys).includes(request.target.key)) {
          cursorKey = request.target.key
          cursorDisplacedSide = ''
        }
        if (request.target.provider === 'claude') dispatchedClaude += 1
        else if (request.target.provider === 'cursor') dispatchedCursor += 1
        else dispatchedCodex += 1
        const event = {
          id: ++resultSequence,
          provider: request.target.provider,
          key: request.target.key,
          source: request.source,
          outcome: result.outcome,
          operationId: currentOperationId,
          at: Date.now()
        }
        pendingResults.push(event)
        if (pendingResults.length > 50) pendingResults.splice(0, pendingResults.length - 50)
        for (const listener of resultListeners) {
          try { listener({ ...event }) } catch {}
        }
      }
      lastOutcome = result.outcome
      resolveRequest(request, result)
      record({
        level: result.outcome === 'failed' ? 'error' : 'info',
        scope: 'navigation',
        event: `${request.target.provider}-open`,
        outcome: result.outcome,
        code: result.errorCode || undefined,
        operationId: currentOperationId,
        provider: request.target.provider,
        taskRef: request.target.key,
        source: request.source,
        durationMs: Date.now() - startedAt,
        slowMs: 200,
        details: {
          confirmsRead: result.confirmsRead === true,
          handoffStage: result.handoff?.stage || 'none',
          nativeVisible: result.handoff?.nativeVisible === true
        }
      })
      // A rapid sequence may return to the target already being opened. The
      // final intent has then already been satisfied, so do not call Provider
      // twice merely because intermediate presses advanced the logical cursor.
      if (!directQueue.length && queuedCycle?.target.key === request.target.key) {
        const satisfied = queuedCycle
        queuedCycle = null
        resolveRequest(satisfied, { ...result })
      }
    } catch {
      lastOutcome = 'failed'
      record({ scope: 'navigation', event: `${request.target.provider}-open`, outcome: 'failed', code: 'exception', durationMs: Date.now() - startedAt, slowMs: 200, level: 'error', operationId: request.operationId, provider: request.target.provider, taskRef: request.target.key, source: request.source })
      resolveRequest(request, {
        outcome: 'failed',
        errorCode: 'open-failed',
        message: '任务打开失败',
        provider: request.target.provider,
        key: request.target.key
      })
    } finally {
      currentConcurrent = Math.max(0, currentConcurrent - 1)
    }
  }

  function pump() {
    if (dispatchInFlight || disposed) return
    const next = directQueue.shift() || queuedCycle
    if (!next) return
    if (next === queuedCycle) queuedCycle = null
    dispatchInFlight = true
    inFlightRequest = next
    void dispatch(next).finally(() => {
      dispatchInFlight = false
      inFlightRequest = null
      queueTask(pump)
    })
  }

  function queueCycle(request) {
    if (dispatchInFlight || directQueue.length) {
      if (queuedCycle) {
        replacedCount += 1
        resolveRequest(queuedCycle, superseded())
      }
      queuedCycle = request
      return
    }
    queuedCycle = request
    pump()
  }

  function cycle(direction, input = {}) {
    const startedAt = Date.now()
    const source = input.source || 'task-cycle'
    const currentOperationId = operationId(input.operationId, 'cycle')
    const reject = (result) => {
      record({
        level: 'error',
        scope: 'navigation',
        event: 'cycle',
        outcome: 'failed',
        code: result.errorCode,
        operationId: currentOperationId,
        source,
        cache: 'process-package',
        durationMs: Date.now() - startedAt,
        details: { ready: snapshot.ready, targetCount: snapshot.targets.size, cycleCount: snapshot.cycleKeys.length }
      })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    if (disposed || !enabled || !snapshot.ready) return reject(unavailable('任务缓存尚未就绪', 'inventory-not-ready'))
    if (!snapshot.cycleKeys.length) return reject(unavailable('当前没有可切换的任务', 'no-task'))
    const ring = ringForCycle(startedAt)
    if (!ring.length) return reject(unavailable('当前没有可切换的任务', 'no-task'))
    walkExpiresAt = startedAt + CYCLE_WALK_HOLD_MS
    const offset = direction === -1 ? -1 : 1
    const origin = walkOrigin()
    const coalescing = origin !== cursorKey
    const currentIndex = ring.indexOf(origin)
    // A displaced anchor stands in for a ring position that no longer exists.
    // Moving away from the side the anchor was taken from is an ordinary step;
    // moving back toward the gap resolves to the anchor itself, which is exactly
    // the task that sat there before the ring changed.
    const holdsAnchor = currentIndex >= 0 && !coalescing && (cursorDisplacedSide === 'before'
      ? offset < 0
      : cursorDisplacedSide === 'after' && offset > 0)
    const nextIndex = currentIndex < 0
      ? offset > 0 ? 0 : ring.length - 1
      : holdsAnchor
        ? currentIndex
        : (currentIndex + offset + ring.length) % ring.length
    const key = ring[nextIndex]
    const target = snapshot.targets.get(key)
    if (!target) return reject(unavailable('任务缓存已变化，请重试', 'stale-target'))
    acceptedCycleCount += 1
    if (coalescing) coalescedAdvanceCount += 1
    pendingCursorKey = key
    outstandingCycles += 1
    record({
      level: 'debug',
      scope: 'navigation',
      event: 'target-selected',
      outcome: 'selected',
      operationId: currentOperationId,
      provider: target.provider,
      taskRef: target.key,
      source,
      cache: 'process-package',
      details: { direction: offset, currentIndex, nextIndex, cycleCount: ring.length, held: walkHeld(startedAt), coalescing, displaced: cursorDisplacedSide || 'none' }
    })
    return new Promise((resolve) => queueCycle({ target, source, operationId: currentOperationId, cycle: true, resolve }))
  }

  function open(input = {}) {
    const startedAt = Date.now()
    const source = input.source || 'manual-row-open'
    const currentOperationId = operationId(input.operationId, 'open')
    const reject = (result) => {
      record({
        level: 'error',
        scope: 'navigation',
        event: 'open',
        outcome: 'failed',
        code: result.errorCode,
        operationId: currentOperationId,
        source,
        taskRef: typeof input.key === 'string' ? input.key : '',
        cache: 'process-package',
        durationMs: Date.now() - startedAt,
        details: { ready: snapshot.ready, targetCount: snapshot.targets.size }
      })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    if (disposed || !enabled) return reject(unavailable('任务功能未启用', 'disabled'))
    const key = typeof input.key === 'string' ? input.key : ''
    const suppliedTarget = normalizeTarget(input.target, enabledProviders)
    const target = suppliedTarget?.key === key ? suppliedTarget : snapshot.targets.get(key)
    if (!target) return reject(unavailable('任务身份已失效，请刷新后重试', 'stale-target'))
    if (directQueue.length >= MAX_DIRECT_QUEUE) return reject(unavailable('任务打开队列繁忙，请稍后重试', 'queue-full'))
    cancelPendingCycle()
    record({
      level: 'debug',
      scope: 'navigation',
      event: 'target-selected',
      outcome: 'selected',
      operationId: currentOperationId,
      provider: target.provider,
      taskRef: target.key,
      source,
      cache: suppliedTarget ? 'supplied-target' : 'process-package',
      details: { ready: snapshot.ready, targetCount: snapshot.targets.size }
    })
    return new Promise((resolve) => {
      directQueue.push({
        target,
        source,
        operationId: currentOperationId,
        trustedResolvedTarget: input.trustedResolvedTarget === true,
        resolve
      })
      pump()
    })
  }

  function handleEnter(action) {
    const code = action && typeof action.code === 'string' ? action.code : ''
    const direction = code === 'eypc-codex-task-previous' ? -1 : code === 'eypc-codex-task-next' ? 1 : 0
    if (!direction || disposed || !enabled || !snapshot.ready || !snapshot.cycleKeys.length) return false
    void cycle(direction)
    return true
  }

  function onResult(listener) {
    if (typeof listener !== 'function') return () => {}
    resultListeners.add(listener)
    return () => resultListeners.delete(listener)
  }

  function takeResults(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return []
    return pendingResults.splice(0).map((event) => ({ ...event }))
  }

  function diagnostics() {
    return {
      revision: COMPANION_NAVIGATION_REVISION,
      enabled,
      ready: snapshot.ready,
      enabledProviderCount: enabledProviders.size,
      targetCount: snapshot.targets.size,
      cycleCount: snapshot.cycleKeys.length,
      cursorKey,
      cursorDisplaced: cursorDisplacedSide || 'none',
      cursorRecoveredCount,
      walkHeld: walkHeld(),
      walkRingCount: walkRing.length,
      walkAdoptedCount,
      walkMergedCount,
      coalescedAdvanceCount,
      outstandingCycles,
      pendingCycle: Boolean(queuedCycle),
      directQueueDepth: directQueue.length,
      dispatchInFlight,
      inFlightKey: inFlightRequest?.target?.key || '',
      maxConcurrent,
      replacedCount,
      acceptedCycleCount,
      syncNoopCount,
      dispatched: { codex: dispatchedCodex, claude: dispatchedClaude, cursor: dispatchedCursor },
      pendingResultCount: pendingResults.length,
      lastOutcome
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    activeLease = 0
    pendingResults.splice(0)
    resultListeners.clear()
    clearSnapshot('插件进程已结束')
  }

  return {
    revision: COMPANION_NAVIGATION_REVISION,
    begin,
    sync,
    detach,
    cycle,
    open,
    handleEnter,
    onResult,
    takeResults,
    diagnostics,
    dispose
  }
}

module.exports = {
  COMPANION_NAVIGATION_REVISION,
  DEFAULT_COALESCE_MS,
  CYCLE_WALK_HOLD_MS,
  createCompanionNavigation
}
