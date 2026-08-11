'use strict'

const COMPANION_NAVIGATION_REVISION = 'companion-navigation-v3'
// Kept as an exported compatibility marker for diagnostics/tests. Generic
// cycling is leading-edge now: the first target is dispatched synchronously.
const DEFAULT_COALESCE_MS = 0
const MAX_DIRECT_QUEUE = 200
const PROVIDERS = ['codex', 'claude']

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
  if (!key || key.length > 256 || !provider || !enabledProviders.has(provider) || !actionAlias || actionAlias.length > 256
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

function unavailable(message, errorCode = 'unavailable') {
  return { outcome: 'unavailable', errorCode, message }
}

function superseded() {
  return unavailable('已由更新的任务跳转目标替代', 'superseded')
}

function normalizeOpenResult(value, target) {
  const source = value && typeof value === 'object' ? value : {}
  const outcome = ['opened', 'dispatched', 'unavailable', 'failed'].includes(source.outcome)
    ? source.outcome
    : 'failed'
  return {
    outcome,
    provider: target.provider,
    key: target.key,
    ...(typeof source.operationId === 'string' ? { operationId: source.operationId.slice(0, 160) } : {}),
    ...(typeof source.errorCode === 'string' && source.errorCode ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.message === 'string' && source.message ? { message: source.message.slice(0, 240) } : {}),
    ...(typeof source.confirmsRead === 'boolean' ? { confirmsRead: source.confirmsRead } : {})
  }
}

function createCompanionNavigation(dependencies = {}) {
  const queueTask = typeof dependencies.queueMicrotask === 'function' ? dependencies.queueMicrotask : queueMicrotask
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const openCodex = typeof dependencies.openCodex === 'function'
    ? dependencies.openCodex
    : async () => unavailable('Codex 任务打开能力不可用')
  const openClaude = typeof dependencies.openClaude === 'function'
    ? dependencies.openClaude
    : async () => unavailable('Claude 任务打开能力不可用')

  let enabled = false
  let enabledProviders = new Set()
  let leaseCounter = 0
  let activeLease = 0
  let snapshot = { ready: false, targets: new Map(), cycleKeys: [] }
  let snapshotFingerprint = ''
  let cursorKey = ''
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
    snapshot = { ready: input.ready === true, targets, cycleKeys }
    snapshotFingerprint = fingerprint
    if (cursorKey && !targets.has(cursorKey)) cursorKey = ''
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
      const open = request.target.provider === 'claude' ? openClaude : openCodex
      const result = normalizeOpenResult(await open(request.target, request), request.target)
      const currentOperationId = result.operationId || request.operationId
      if (result.outcome === 'opened' || result.outcome === 'dispatched') {
        if (request.target.provider === 'claude') dispatchedClaude += 1
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
        slowMs: 200
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
    const offset = direction === -1 ? -1 : 1
    const currentIndex = snapshot.cycleKeys.indexOf(cursorKey)
    const nextIndex = currentIndex < 0
      ? offset > 0 ? 0 : snapshot.cycleKeys.length - 1
      : (currentIndex + offset + snapshot.cycleKeys.length) % snapshot.cycleKeys.length
    const key = snapshot.cycleKeys[nextIndex]
    const target = snapshot.targets.get(key)
    if (!target) return reject(unavailable('任务缓存已变化，请重试', 'stale-target'))
    cursorKey = key
    acceptedCycleCount += 1
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
      details: { direction: offset, currentIndex, nextIndex, cycleCount: snapshot.cycleKeys.length }
    })
    return new Promise((resolve) => queueCycle({ target, source, operationId: currentOperationId, resolve }))
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
      directQueue.push({ target, source, operationId: currentOperationId, resolve })
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
      pendingCycle: Boolean(queuedCycle),
      directQueueDepth: directQueue.length,
      dispatchInFlight,
      inFlightKey: inFlightRequest?.target?.key || '',
      maxConcurrent,
      replacedCount,
      acceptedCycleCount,
      syncNoopCount,
      dispatched: { codex: dispatchedCodex, claude: dispatchedClaude },
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
  createCompanionNavigation
}
