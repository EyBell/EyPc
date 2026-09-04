'use strict'

const { normalizeOpenResult } = require('./open-handoff.cjs')

const { PROVIDERS } = require('./provider-registry.cjs')
const COMPANION_TASK_ACTIONS_REVISION = 'companion-task-actions-v3'
const ARCHIVE_PHASES = ['completed', 'stopped']
const CONFIRM_WINDOW_MS = 5_000

function providerSet(value) {
  if (Array.isArray(value)) return new Set(value.filter((provider) => PROVIDERS.includes(provider)))
  if (!value || typeof value !== 'object') return new Set()
  return new Set(PROVIDERS.filter((provider) => value[provider] === true))
}

function sameProviders(left, right) {
  return PROVIDERS.every((provider) => left.has(provider) === right.has(provider))
}

function normalizeTarget(value, enabledProviders) {
  if (!value || typeof value !== 'object') return null
  const provider = PROVIDERS.includes(value.provider) ? value.provider : ''
  const key = typeof value.key === 'string' ? value.key : ''
  const actionAlias = typeof value.actionAlias === 'string' ? value.actionAlias : ''
  const revisionAt = Number(value.revisionAt)
  const phase = ARCHIVE_PHASES.includes(value.phase) ? value.phase : typeof value.phase === 'string' ? value.phase.slice(0, 40) : 'unknown'
  if (!provider || !enabledProviders.has(provider) || !key || key.length > 256
    || actionAlias.length > 256 || !Number.isFinite(revisionAt) || revisionAt <= 0) return null
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
    provider,
    key,
    actionAlias,
    revisionAt,
    phase,
    canArchive: value.canArchive === true && Boolean(actionAlias) && ARCHIVE_PHASES.includes(phase),
    planReady: value.planReady === true,
    planLifecycleRevision: Number.isFinite(Number(value.planLifecycleRevision)) ? Math.max(0, Math.trunc(Number(value.planLifecycleRevision))) : 0,
    paused: value.paused === true,
    canPause: value.canPause === true,
    canResume: value.canResume === true,
    canExecutePlan: value.canExecutePlan === true,
    archiveRequest
  }
}

/**
 * One result envelope for every provider effect. `spec.outcomes` is the
 * accepted outcome vocabulary (anything else collapses to `failed`);
 * `spec.passthrough` lists the typed extras the effect may report back.
 */
function normalizeActionResult(value, target, spec) {
  const source = value && typeof value === 'object' ? value : {}
  const outcome = spec.outcomes.includes(source.outcome) ? source.outcome : 'failed'
  const result = {
    outcome,
    provider: target.provider,
    key: target.key,
    ...(typeof source.operationId === 'string' ? { operationId: source.operationId.slice(0, 160) } : {}),
    ...(typeof source.errorCode === 'string' && source.errorCode ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.message === 'string' && source.message ? { message: source.message.slice(0, 240) } : {})
  }
  for (const [field, kind] of Object.entries(spec.passthrough || {})) {
    const extra = source[field]
    if (kind === 'boolean' && typeof extra === 'boolean') result[field] = extra
    else if (kind === 'flag' && extra === true) result[field] = true
    else if (kind === 'string' && typeof extra === 'string') result[field] = extra.slice(0, 80)
  }
  return result
}

const ARCHIVE_RESULT_SPEC = Object.freeze({
  outcomes: ['confirmation-required', 'archived', 'failed', 'indeterminate'],
  passthrough: { alreadyArchived: 'flag' }
})
const PIN_RESULT_SPEC = Object.freeze({
  outcomes: ['completed', 'failed', 'indeterminate'],
  passthrough: { providerPin: 'boolean', method: 'string' }
})
const EXECUTE_RESULT_SPEC = Object.freeze({ outcomes: ['executed', 'failed', 'indeterminate'], passthrough: {} })

const normalizeArchiveResult = (value, target) => normalizeActionResult(value, target, ARCHIVE_RESULT_SPEC)
const normalizePinResult = (value, target) => normalizeActionResult(value, target, PIN_RESULT_SPEC)
const normalizeExecuteResult = (value, target) => normalizeActionResult(value, target, EXECUTE_RESULT_SPEC)

function createCompanionTaskActions(dependencies = {}) {
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const adapters = dependencies.adapters && typeof dependencies.adapters === 'object' ? dependencies.adapters : {}
  const notify = typeof dependencies.notify === 'function' ? dependencies.notify : () => {}
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const onProviderFailure = typeof dependencies.onProviderFailure === 'function' ? dependencies.onProviderFailure : () => {}
  let enabled = false
  let ready = false
  let enabledProviders = new Set()
  let targets = new Map()
  let focusedKey = ''
  let attentionKeys = []
  let confirmation = null
  let disposed = false
  const archiveInFlight = new Map()
  const pinInFlight = new Map()
  const executeInFlight = new Map()
  let lastSyncFingerprint = ''
  let syncNoopCount = 0
  let operationSequence = 0

  function operationId(input, prefix = 'op') {
    if (typeof input?.operationId === 'string' && /^[a-z0-9:_-]{6,160}$/i.test(input.operationId)) return input.operationId
    operationSequence += 1
    return `${prefix}_${now().toString(36)}_${operationSequence.toString(36)}`
  }

  function trace(event, outcome, target, startedAt, input = {}) {
    record({
      level: input.level || (outcome === 'failed' || outcome === 'indeterminate' ? 'error' : input.debug ? 'debug' : 'info'),
      scope: 'task-action',
      event,
      outcome,
      ...(input.errorCode ? { code: input.errorCode } : {}),
      ...(target?.provider ? { provider: target.provider } : {}),
      ...(target?.key ? { taskRef: target.key } : {}),
      ...(input.operationId ? { operationId: input.operationId } : {}),
      source: input.source || 'unknown',
      durationMs: Math.max(0, now() - startedAt),
      details: {
        source: input.source || 'unknown',
        phase: target?.phase,
        revisionAt: target?.revisionAt,
        canArchive: target?.canArchive,
        ready,
        enabled,
        targetCount: targets.size,
        archiveInFlight: archiveInFlight.size,
        executeInFlight: executeInFlight.size,
        ...(input.details || {})
      }
    })
  }

  function clearConfirmation(reason = 'cleared') {
    if (confirmation) {
      const target = targets.get(confirmation.key)
      const prefix = confirmation.kind === 'execute-plan' ? 'execute-plan' : 'archive'
      const event = reason === 'confirmed'
        ? `${prefix}-confirmation-confirmed`
        : reason === 'expired' ? `${prefix}-confirmation-expired` : `${prefix}-confirmation-cleared`
      trace(event, reason, target, now(), {
        operationId: confirmation.operationId,
        level: reason === 'expired' ? 'error' : reason === 'confirmed' ? 'info' : 'debug',
        source: confirmation.kind === 'execute-plan' ? 'execute-plan-button' : 'archive-shortcut'
      })
    }
    confirmation = null
  }

  function sync(input = {}) {
    if (disposed) return false
    const startedAt = now()
    const previous = { enabled, ready, targetCount: targets.size, confirmationPending: Boolean(confirmation && confirmation.until >= startedAt) }
    const nextEnabled = input.enabled === true
    const nextReady = input.ready === true
    const nextProviders = providerSet(input.providers)
    // A mainHide Renderer remount starts with an intentionally empty cache.
    // Preserve the process-owned ready snapshot (and its confirmation) until
    // the same provider set publishes a complete replacement.
    if (enabled && ready && nextEnabled && !nextReady && sameProviders(enabledProviders, nextProviders)) {
      trace('target-sync', 'retained', null, startedAt, { debug: true, source: 'kernel', details: { previous, nextReady, nextEnabled } })
      return false
    }
    enabled = nextEnabled
    ready = nextReady
    enabledProviders = nextProviders
    const next = new Map()
    for (const value of Array.isArray(input.targets) ? input.targets : []) {
      const target = normalizeTarget(value, enabledProviders)
      if (target && !next.has(target.key)) next.set(target.key, target)
    }
    const nextFocusedKey = typeof input.focusedKey === 'string' && next.has(input.focusedKey) ? input.focusedKey : ''
    const nextAttentionKeys = Array.isArray(input.attentionKeys)
      ? input.attentionKeys.filter((key, index, rows) => typeof key === 'string' && next.has(key) && rows.indexOf(key) === index)
      : []
    const fingerprint = JSON.stringify({
      enabled: nextEnabled,
      ready: nextReady,
      providers: [...nextProviders].sort(),
      focusedKey: nextFocusedKey,
      attentionKeys: nextAttentionKeys,
      targets: [...next.values()].map((target) => ({
        provider: target.provider,
        key: target.key,
        actionAlias: target.actionAlias,
        revisionAt: target.revisionAt,
        phase: target.phase,
        canArchive: target.canArchive,
        planReady: target.planReady,
        planLifecycleRevision: target.planLifecycleRevision,
        paused: target.paused,
        canPause: target.canPause,
        canResume: target.canResume,
        canExecutePlan: target.canExecutePlan
      }))
    })
    if (fingerprint === lastSyncFingerprint) {
      syncNoopCount += 1
      trace('target-sync', 'no-op', null, startedAt, { debug: true, source: 'kernel', details: { previous } })
      return false
    }
    targets = next
    focusedKey = nextFocusedKey
    attentionKeys = nextAttentionKeys
    lastSyncFingerprint = fingerprint
    if (!enabled || !ready) clearConfirmation('not-ready')
    else if (confirmation) {
      const target = targets.get(confirmation.key)
      const identity = target
        ? confirmation.kind === 'execute-plan' ? executeTargetIdentity(target) : archiveTargetIdentity(target)
        : ''
      const allowed = confirmation.kind === 'execute-plan' ? target?.canExecutePlan : target?.canArchive
      if (!target || !allowed || identity !== confirmation.identity) clearConfirmation('identity-changed')
    }
    trace('target-sync', 'accepted', null, startedAt, {
      debug: true,
      source: 'kernel',
      details: { previous, next: { enabled, ready, targetCount: targets.size, confirmationPending: Boolean(confirmation && confirmation.until >= now()) } }
    })
    return true
  }

  function resolveTarget(input, allowTrustedOpenTarget = false) {
    const supplied = normalizeTarget(input?.target, enabledProviders)
    const key = typeof input?.key === 'string' ? input.key : ''
    const current = targets.get(key) || null
    if (!current) return allowTrustedOpenTarget && input?.trustedResolvedTarget === true ? supplied : null
    // The process-owned snapshot is authoritative. A Renderer may include its
    // last target only as a compatibility hint; it must never replace a newer
    // Provider, phase, revision, alias, or capability already accepted here.
    if (input?.target && (!supplied
      || supplied.provider !== current.provider
      || supplied.key !== current.key
      || supplied.actionAlias !== current.actionAlias
      || supplied.revisionAt !== current.revisionAt
      || supplied.phase !== current.phase
      || supplied.canArchive !== current.canArchive
      || supplied.planReady !== current.planReady
      || supplied.planLifecycleRevision !== current.planLifecycleRevision
      || supplied.paused !== current.paused
      || supplied.canExecutePlan !== current.canExecutePlan)) return null
    return current
  }

  /** 同一 key 永远用 Host 已接受的 target；Renderer 旧 alias 不能换任务。 */
  function resolveOpenTarget(input) {
    const key = typeof input?.key === 'string' ? input.key : ''
    const current = targets.get(key) || null
    // Opening is an exact-key operation. Renderer/Navigation targets are only
    // compatibility hints and may legitimately carry an older alias, phase or
    // revision while Host has already accepted a newer package. Always use the
    // process-owned target for the same key; the Provider adapter then renews
    // an expired alias without substituting another task.
    if (current) return current
    if (input?.trustedResolvedTarget !== true) return null
    const supplied = normalizeTarget(input?.target, enabledProviders)
    return supplied?.key === key ? supplied : null
  }

  async function inspect(provider) {
    if (!PROVIDERS.includes(provider) || !enabledProviders.has(provider)) {
      return { available: false, reason: 'disabled' }
    }
    const adapter = adapters[provider]
    if (!adapter || typeof adapter.inspect !== 'function') return { available: false, reason: 'unavailable' }
    try { return await adapter.inspect() } catch {
      try { onProviderFailure(provider, 'inspect-failed') } catch {}
      return { available: false, reason: 'degraded' }
    }
  }

  /** 过程快照上的 open；未就绪/无 target/无 adapter 分别失败，成功也要过 handoff 收据。 */
  async function open(input = {}) {
    const startedAt = now()
    const currentOperationId = operationId(input, 'open')
    if (disposed || !enabled || !ready) {
      const result = { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '任务缓存尚未就绪' }
      trace('open', result.outcome, null, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source, debug: true })
      return { ...result, operationId: currentOperationId }
    }
    const target = resolveOpenTarget(input)
    if (!target) {
      const result = { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      trace('open', result.outcome, null, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source, debug: true, details: { requestedKey: typeof input.key === 'string' ? input.key : '' } })
      return { ...result, operationId: currentOperationId }
    }
    const adapter = adapters[target.provider]
    if (!adapter || typeof adapter.open !== 'function') {
      const result = { outcome: 'unavailable', provider: target.provider, key: target.key, errorCode: 'unsupported', message: '当前 Provider 不支持打开任务' }
      trace('open', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source, debug: true })
      return { ...result, operationId: currentOperationId }
    }
    try {
      const result = normalizeOpenResult(await adapter.open(target, { ...input, operationId: currentOperationId }), target)
      trace('open', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
      return { ...result, operationId: currentOperationId }
    } catch {
      try { onProviderFailure(target.provider, 'open-failed') } catch {}
      const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'open-failed', message: '任务打开失败' }
      trace('open', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
      return { ...result, operationId: currentOperationId }
    }
  }

  function archive(input = {}) {
    const startedAt = now()
    const currentOperationId = operationId(input, 'arc')
    if (disposed || !enabled || !ready) {
      const result = { outcome: 'failed', errorCode: 'inventory-not-ready', message: '任务缓存尚未就绪' }
      trace('archive-intent', result.outcome, null, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const target = resolveTarget(input)
    if (!target || !target.canArchive) {
      const result = { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已变化，当前不能归档' }
      trace('archive-intent', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source, details: { requestedKey: typeof input.key === 'string' ? input.key : '' } })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    if (input.phase && input.phase !== target.phase) {
      const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'state-changed', message: '任务版本已变化，未执行归档' }
      trace('archive-intent', result.outcome, target, startedAt, {
        operationId: currentOperationId,
        errorCode: result.errorCode,
        source: input.source,
        details: { requestedRevisionAt: Number(input.revisionAt) || 0, requestedPhase: input.phase || '' }
      })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const adapter = adapters[target.provider]
    if (!adapter || typeof adapter.archive !== 'function') {
      const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'unsupported', message: '当前 Provider 不支持归档任务' }
      trace('archive-intent', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const inFlightKey = `${target.provider}:${target.key}`
    const existing = archiveInFlight.get(inFlightKey)
    if (existing) {
      trace('archive-intent', 'reused-in-flight', target, startedAt, { operationId: currentOperationId, debug: true, source: input.source })
      return existing
    }
    trace('archive-intent', 'started', target, startedAt, {
      operationId: currentOperationId,
      source: input.source,
      details: { requestedRevisionAt: Number(input.revisionAt) || 0, currentRevisionAt: target.revisionAt }
    })
    if (input.confirmationRecorded !== true) {
      trace('archive-confirmation-confirmed', 'confirmed', target, startedAt, {
        operationId: currentOperationId,
        source: input.source,
        details: { owner: 'task-actions', inferredFromDispatch: true }
      })
    }
    const operation = Promise.resolve()
      .then(() => adapter.archive(target, {
        ...input,
        operationId: currentOperationId,
        intentRecorded: true,
        confirmationRecorded: true
      }))
      .then((result) => {
        const normalized = normalizeArchiveResult(result, target)
        trace('archive-result', normalized.outcome, target, startedAt, { operationId: currentOperationId, errorCode: normalized.errorCode, source: input.source, details: { alreadyArchived: normalized.alreadyArchived === true } })
        return { ...normalized, operationId: normalized.operationId || currentOperationId }
      })
      .catch(() => {
        try { onProviderFailure(target.provider, 'archive-failed') } catch {}
        const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'archive-failed', message: '任务归档失败' }
        trace('archive-result', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
        return { ...result, operationId: currentOperationId }
      })
      .finally(() => {
        if (archiveInFlight.get(inFlightKey) === operation) archiveInFlight.delete(inFlightKey)
      })
    archiveInFlight.set(inFlightKey, operation)
    return operation
  }

  /**
   * Provider pin write. No confirmation and no phase gate: a pin is a display
   * placement, so the only preconditions are a live target and an adapter
   * that declared the `pin` capability. Serialized per task like archive.
   */
  function setPin(input = {}) {
    const startedAt = now()
    const currentOperationId = operationId(input, 'pin')
    const pinned = input.pinned === true
    if (disposed || !enabled || !ready) {
      const result = { outcome: 'failed', errorCode: 'inventory-not-ready', message: '任务缓存尚未就绪' }
      trace('pin-intent', result.outcome, null, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const target = resolveTarget(input)
    if (!target) {
      const result = { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      trace('pin-intent', result.outcome, null, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source, details: { requestedKey: typeof input.key === 'string' ? input.key : '' } })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const adapter = adapters[target.provider]
    if (!adapter || typeof adapter.setPin !== 'function') {
      const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'unsupported', message: '当前 Provider 不支持同步置顶' }
      trace('pin-intent', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const inFlightKey = `${target.provider}:${target.key}`
    const existing = pinInFlight.get(inFlightKey)
    if (existing) {
      trace('pin-intent', 'reused-in-flight', target, startedAt, { operationId: currentOperationId, debug: true, source: input.source })
      return existing
    }
    trace('pin-intent', 'started', target, startedAt, { operationId: currentOperationId, source: input.source, details: { pinned } })
    const operation = Promise.resolve()
      .then(() => adapter.setPin(target, { ...input, pinned, operationId: currentOperationId }))
      .then((result) => {
        const normalized = normalizePinResult(result, target)
        trace('pin-result', normalized.outcome, target, startedAt, { operationId: currentOperationId, errorCode: normalized.errorCode, source: input.source, details: { pinned, method: normalized.method || '' } })
        return { ...normalized, operationId: normalized.operationId || currentOperationId }
      })
      .catch(() => {
        try { onProviderFailure(target.provider, 'pin-failed') } catch {}
        const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'pin-failed', message: '置顶同步失败' }
        trace('pin-result', result.outcome, target, startedAt, { operationId: currentOperationId, errorCode: result.errorCode, source: input.source })
        return { ...result, operationId: currentOperationId }
      })
      .finally(() => {
        if (pinInFlight.get(inFlightKey) === operation) pinInFlight.delete(inFlightKey)
      })
    pinInFlight.set(inFlightKey, operation)
    return operation
  }

  function archiveTargetIdentity(target) {
    const terminalEpoch = Number(target.archiveRequest?.expectedRevisionAt) || 0
    return `${target.provider}|${target.key}|${target.phase}|${terminalEpoch}`
  }

  function executeTargetIdentity(target) {
    return `${target.provider}|${target.key}|${target.planLifecycleRevision}|${target.actionAlias}|${target.phase}|${target.paused ? 1 : 0}`
  }

  function executePlan(input = {}) {
    const startedAt = now()
    const target = resolveTarget(input)
    if (disposed || !enabled || !ready || !target || !target.canExecutePlan || !target.planReady
      || Number(input.planLifecycleRevision) !== target.planLifecycleRevision) {
      const result = { outcome: 'failed', errorCode: 'state-changed', message: 'Plan 状态已变化，当前不能执行' }
      trace('execute-plan-intent', result.outcome, target, startedAt, { source: input.source, errorCode: result.errorCode })
      return Promise.resolve(result)
    }
    const inFlightKey = `${target.provider}:${target.key}:${target.planLifecycleRevision}`
    const existing = executeInFlight.get(inFlightKey)
    if (existing) return existing
    const identity = executeTargetIdentity(target)
    const at = now()
    if (confirmation?.until < at) clearConfirmation('expired')
    if (!confirmation || confirmation.kind !== 'execute-plan' || confirmation.identity !== identity || confirmation.until < at) {
      confirmation = {
        kind: 'execute-plan',
        key: target.key,
        identity,
        operationId: operationId(input, 'exec-confirm'),
        until: at + CONFIRM_WINDOW_MS
      }
      trace('execute-plan-confirmation-created', 'created', target, at, {
        operationId: confirmation.operationId,
        source: input.source || 'execute-plan-button',
        details: { expiresAt: confirmation.until, planLifecycleRevision: target.planLifecycleRevision }
      })
      return Promise.resolve({
        outcome: 'confirmation-required',
        provider: target.provider,
        key: target.key,
        operationId: confirmation.operationId,
        message: '5 秒内再次点击“确”以执行原 Plan'
      })
    }
    const currentOperationId = confirmation.operationId
    clearConfirmation('confirmed')
    const adapter = adapters[target.provider]
    if (!adapter || typeof adapter.executePlan !== 'function') {
      const result = { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'unsupported', message: 'Plan 执行服务尚未就绪' }
      trace('execute-plan-result', result.outcome, target, startedAt, { operationId: currentOperationId, source: input.source, errorCode: result.errorCode })
      return Promise.resolve({ ...result, operationId: currentOperationId })
    }
    const operation = Promise.resolve()
      .then(() => adapter.executePlan(target, { ...input, operationId: currentOperationId }))
      .then((value) => {
        const result = normalizeExecuteResult(value, target)
        trace('execute-plan-result', result.outcome, target, startedAt, { operationId: currentOperationId, source: input.source, errorCode: result.errorCode })
        return { ...result, operationId: result.operationId || currentOperationId }
      })
      .catch(() => {
        try { onProviderFailure(target.provider, 'execute-failed') } catch {}
        const result = { outcome: 'indeterminate', provider: target.provider, key: target.key, errorCode: 'execute-result-unknown', message: '执行结果未能确认；未自动重发' }
        trace('execute-plan-result', result.outcome, target, startedAt, { operationId: currentOperationId, source: input.source, errorCode: result.errorCode })
        return { ...result, operationId: currentOperationId }
      })
      .finally(() => {
        if (executeInFlight.get(inFlightKey) === operation) executeInFlight.delete(inFlightKey)
      })
    executeInFlight.set(inFlightKey, operation)
    return operation
  }

  function shortcutTarget() {
    const focused = targets.get(focusedKey)
    if (focused?.canArchive) return focused
    for (const key of attentionKeys) {
      const target = targets.get(key)
      if (target?.canArchive) return target
    }
    return null
  }

  function shortcutArchive() {
    if (disposed || !enabled || !ready) {
      trace('archive-shortcut', 'not-ready', null, now(), { source: 'archive-shortcut', errorCode: 'inventory-not-ready', debug: true })
      return false
    }
    const target = shortcutTarget()
    if (!target) {
      // Silent before: the press was consumed and only a notification remained.
      trace('archive-shortcut', 'no-target', null, now(), {
        source: 'archive-shortcut',
        errorCode: 'no-task',
        details: { focused: Boolean(focusedKey), attentionCount: attentionKeys.length }
      })
      notify('当前没有唯一且可归档的任务')
      return true
    }
    const identity = archiveTargetIdentity(target)
    const at = now()
    if (confirmation?.until < at) clearConfirmation('expired')
    if (!confirmation || confirmation.identity !== identity || confirmation.until < at) {
      confirmation = { kind: 'archive', key: target.key, identity, operationId: operationId({}, 'confirm'), until: at + CONFIRM_WINDOW_MS }
      trace('archive-confirmation-created', 'created', target, at, { operationId: confirmation.operationId, source: 'archive-shortcut', details: { expiresAt: confirmation.until, terminalEpoch: Number(target.archiveRequest?.expectedRevisionAt) || 0 } })
      notify(`准备归档 ${target.provider === 'claude' ? 'Claude' : 'Codex'} 任务；5 秒内再次调用确认`)
      return true
    }
    const confirmationOperationId = confirmation.operationId
    clearConfirmation('confirmed')
    void archive({
      key: target.key,
      revisionAt: target.revisionAt,
      phase: target.phase,
      source: 'archive-shortcut',
      operationId: confirmationOperationId,
      confirmationRecorded: true
    })
      .then((result) => notify(result.message || (result.outcome === 'archived' ? '任务已归档' : '任务归档失败')))
    return true
  }

  function handleEnter(action) {
    if (action?.code !== 'eypc-companion-archive') return false
    return shortcutArchive()
  }

  function diagnostics() {
    return {
      revision: COMPANION_TASK_ACTIONS_REVISION,
      enabled,
      ready,
      targetCount: targets.size,
      archiveInFlight: archiveInFlight.size,
      executeInFlight: executeInFlight.size,
      syncNoopCount,
      confirmationPending: Boolean(confirmation && confirmation.until >= now())
    }
  }

  function close() {
    disposed = true
    clearConfirmation('closed')
    targets = new Map()
    for (const provider of PROVIDERS) {
      try { adapters[provider]?.close?.() } catch {}
    }
  }

  return { revision: COMPANION_TASK_ACTIONS_REVISION, sync, inspect, open, archive, setPin, executePlan, shortcutArchive, handleEnter, diagnostics, close }
}

module.exports = {
  COMPANION_TASK_ACTIONS_REVISION,
  CONFIRM_WINDOW_MS,
  createCompanionTaskActions
}
