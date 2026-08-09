'use strict'

const COMPANION_TASK_ACTIONS_REVISION = 'companion-task-actions-v1'
const PROVIDERS = ['codex', 'claude']
const ARCHIVE_PHASES = ['completed', 'stopped']
const CONFIRM_WINDOW_MS = 5_000
const MAX_TARGETS = 2_000

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
    || !actionAlias || actionAlias.length > 256 || !Number.isFinite(revisionAt) || revisionAt <= 0) return null
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
    canArchive: value.canArchive === true && ARCHIVE_PHASES.includes(phase),
    archiveRequest
  }
}

function normalizeOpenResult(value, target) {
  const source = value && typeof value === 'object' ? value : {}
  const outcome = ['opened', 'dispatched', 'unavailable', 'failed'].includes(source.outcome) ? source.outcome : 'failed'
  return {
    outcome,
    provider: target.provider,
    key: target.key,
    ...(typeof source.errorCode === 'string' && source.errorCode ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.message === 'string' && source.message ? { message: source.message.slice(0, 240) } : {}),
    ...(typeof source.confirmsRead === 'boolean' ? { confirmsRead: source.confirmsRead } : {})
  }
}

function normalizeArchiveResult(value, target) {
  const source = value && typeof value === 'object' ? value : {}
  const outcome = ['confirmation-required', 'archived', 'failed', 'indeterminate'].includes(source.outcome)
    ? source.outcome
    : 'failed'
  return {
    outcome,
    provider: target.provider,
    key: target.key,
    ...(typeof source.errorCode === 'string' && source.errorCode ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.message === 'string' && source.message ? { message: source.message.slice(0, 240) } : {}),
    ...(source.alreadyArchived === true ? { alreadyArchived: true } : {})
  }
}

function createCompanionTaskActions(dependencies = {}) {
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const adapters = dependencies.adapters && typeof dependencies.adapters === 'object' ? dependencies.adapters : {}
  const notify = typeof dependencies.notify === 'function' ? dependencies.notify : () => {}
  let enabled = false
  let ready = false
  let enabledProviders = new Set()
  let targets = new Map()
  let focusedKey = ''
  let attentionKeys = []
  let confirmation = null
  let disposed = false
  const archiveInFlight = new Map()

  function clearConfirmation() {
    confirmation = null
  }

  function sync(input = {}) {
    if (disposed) return false
    const nextEnabled = input.enabled === true
    const nextReady = input.ready === true
    const nextProviders = providerSet(input.providers)
    // A mainHide Renderer remount starts with an intentionally empty cache.
    // Preserve the process-owned ready snapshot (and its confirmation) until
    // the same provider set publishes a complete replacement.
    if (enabled && ready && nextEnabled && !nextReady && sameProviders(enabledProviders, nextProviders)) return false
    enabled = nextEnabled
    ready = nextReady
    enabledProviders = nextProviders
    const next = new Map()
    for (const value of Array.isArray(input.targets) ? input.targets.slice(0, MAX_TARGETS) : []) {
      const target = normalizeTarget(value, enabledProviders)
      if (target && !next.has(target.key)) next.set(target.key, target)
    }
    targets = next
    focusedKey = typeof input.focusedKey === 'string' && targets.has(input.focusedKey) ? input.focusedKey : ''
    attentionKeys = Array.isArray(input.attentionKeys)
      ? input.attentionKeys.filter((key, index, rows) => typeof key === 'string' && targets.has(key) && rows.indexOf(key) === index)
      : []
    if (!enabled || !ready) clearConfirmation()
    else if (confirmation) {
      const target = targets.get(confirmation.key)
      const identity = target ? targetIdentity(target, focusedKey) : ''
      if (!target || identity !== confirmation.identity) clearConfirmation()
    }
    return true
  }

  function resolveTarget(input) {
    const supplied = normalizeTarget(input?.target, enabledProviders)
    const key = typeof input?.key === 'string' ? input.key : ''
    const current = targets.get(key) || null
    if (!current) return null
    // The process-owned snapshot is authoritative. A Renderer may include its
    // last target only as a compatibility hint; it must never replace a newer
    // Provider, phase, revision, alias, or capability already accepted here.
    if (input?.target && (!supplied
      || supplied.provider !== current.provider
      || supplied.key !== current.key
      || supplied.actionAlias !== current.actionAlias
      || supplied.revisionAt !== current.revisionAt
      || supplied.phase !== current.phase
      || supplied.canArchive !== current.canArchive)) return null
    return current
  }

  async function inspect(provider) {
    if (!PROVIDERS.includes(provider) || !enabledProviders.has(provider)) {
      return { available: false, reason: 'disabled' }
    }
    const adapter = adapters[provider]
    if (!adapter || typeof adapter.inspect !== 'function') return { available: false, reason: 'unavailable' }
    try { return await adapter.inspect() } catch { return { available: false, reason: 'degraded' } }
  }

  async function open(input = {}) {
    if (disposed || !enabled || !ready) return { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '任务缓存尚未就绪' }
    const target = resolveTarget(input)
    if (!target) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
    const adapter = adapters[target.provider]
    if (!adapter || typeof adapter.open !== 'function') {
      return { outcome: 'unavailable', provider: target.provider, key: target.key, errorCode: 'unsupported', message: '当前 Provider 不支持打开任务' }
    }
    try { return normalizeOpenResult(await adapter.open(target, input), target) } catch {
      return { outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'open-failed', message: '任务打开失败' }
    }
  }

  function archive(input = {}) {
    if (disposed || !enabled || !ready) return Promise.resolve({ outcome: 'failed', errorCode: 'inventory-not-ready', message: '任务缓存尚未就绪' })
    const target = resolveTarget(input)
    if (!target || !target.canArchive) {
      return Promise.resolve({ outcome: 'failed', errorCode: 'state-changed', message: '任务状态已变化，当前不能归档' })
    }
    if (Number(input.revisionAt) !== target.revisionAt || (input.phase && input.phase !== target.phase)) {
      return Promise.resolve({ outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'state-changed', message: '任务版本已变化，未执行归档' })
    }
    const adapter = adapters[target.provider]
    if (!adapter || typeof adapter.archive !== 'function') {
      return Promise.resolve({ outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'unsupported', message: '当前 Provider 不支持归档任务' })
    }
    const inFlightKey = `${target.provider}:${target.key}`
    const existing = archiveInFlight.get(inFlightKey)
    if (existing) return existing
    const operation = Promise.resolve()
      .then(() => adapter.archive(target, input))
      .then((result) => normalizeArchiveResult(result, target))
      .catch(() => ({ outcome: 'failed', provider: target.provider, key: target.key, errorCode: 'archive-failed', message: '任务归档失败' }))
      .finally(() => {
        if (archiveInFlight.get(inFlightKey) === operation) archiveInFlight.delete(inFlightKey)
      })
    archiveInFlight.set(inFlightKey, operation)
    return operation
  }

  function targetIdentity(target, focus) {
    return `${target.provider}|${target.key}|${target.revisionAt}|${target.phase}|${focus || ''}`
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
    if (disposed || !enabled || !ready) return false
    const target = shortcutTarget()
    if (!target) {
      notify('当前没有唯一且可归档的任务')
      return true
    }
    const identity = targetIdentity(target, focusedKey)
    const at = now()
    if (!confirmation || confirmation.identity !== identity || confirmation.until < at) {
      confirmation = { key: target.key, identity, until: at + CONFIRM_WINDOW_MS }
      notify(`准备归档 ${target.provider === 'claude' ? 'Claude' : 'Codex'} 任务；5 秒内再次调用确认`)
      return true
    }
    clearConfirmation()
    void archive({ key: target.key, revisionAt: target.revisionAt, phase: target.phase, source: 'shortcut' })
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
      confirmationPending: Boolean(confirmation && confirmation.until >= now())
    }
  }

  function close() {
    disposed = true
    clearConfirmation()
    targets = new Map()
    for (const provider of PROVIDERS) {
      try { adapters[provider]?.close?.() } catch {}
    }
  }

  return { revision: COMPANION_TASK_ACTIONS_REVISION, sync, inspect, open, archive, shortcutArchive, handleEnter, diagnostics, close }
}

module.exports = {
  COMPANION_TASK_ACTIONS_REVISION,
  CONFIRM_WINDOW_MS,
  createCompanionTaskActions
}
