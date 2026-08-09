'use strict'

const { createCompanionNavigation } = require('./navigation.cjs')
const { createCompanionTaskActions } = require('./task-actions.cjs')

const COMPANION_TASK_KERNEL_REVISION = 'companion-task-kernel-v1'
const COMPANION_TASK_PACKAGE_REVISION = 'companion-task-package-v1'
const COMPANION_TASK_DRAFT_REVISION = 'companion-task-draft-v1'
const PREFLIGHT_PROGRESS_MS = 600
const PREFLIGHT_TIMEOUT_MS = 5_000
const UNKNOWN_GRACE_MS = 1_250
const PROVIDERS = ['codex', 'claude']
const PHASES = ['running', 'waiting-input', 'waiting-approval', 'completed', 'stopped', 'unknown']
const TIERS = ['attention', 'plan-implementation', 'active', 'fallback', 'none']
const GROUPS = ['input', 'active', 'stopped', 'unread', 'completed', 'none']
const DRAFT_PRODUCERS = ['renderer', 'host-preflight', 'host-evidence']
const MAX_TASKS = 2_000

function providerSet(value) {
  if (Array.isArray(value)) return new Set(value.filter((provider) => PROVIDERS.includes(provider)))
  if (!value || typeof value !== 'object') return new Set()
  return new Set(PROVIDERS.filter((provider) => value[provider] === true))
}

function providerShape(value) {
  const providers = providerSet(value)
  return { codex: providers.has('codex'), claude: providers.has('claude') }
}

function sameProviders(left, right) {
  return PROVIDERS.every((provider) => left[provider] === right[provider])
}

function finiteInteger(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback
}

function draftProducer(value) {
  return DRAFT_PRODUCERS.includes(value) ? value : 'renderer'
}

function normalizeArchiveRequest(value) {
  if (!value || typeof value !== 'object') return undefined
  const evidence = value.evidence === 'completed' || value.evidence === 'stopped' ? value.evidence : ''
  const expectedRevisionAt = finiteInteger(value.expectedRevisionAt)
  const expectedUpdatedAt = finiteInteger(value.expectedUpdatedAt)
  const expectedLastTurnStartedAt = finiteInteger(value.expectedLastTurnStartedAt)
  const expectedSourceFingerprint = typeof value.expectedSourceFingerprint === 'string'
    ? value.expectedSourceFingerprint.slice(0, 80)
    : ''
  if (!evidence || !expectedRevisionAt || !expectedUpdatedAt || !expectedLastTurnStartedAt || !expectedSourceFingerprint) return undefined
  return {
    expectedUpdatedAt,
    expectedRevisionAt,
    ...(finiteInteger(value.expectedCompletionAt) ? { expectedCompletionAt: finiteInteger(value.expectedCompletionAt) } : {}),
    expectedLastTurnStartedAt,
    expectedSourceFingerprint,
    evidence
  }
}

function normalizeTask(value, enabledProviders) {
  if (!value || typeof value !== 'object') return null
  const provider = PROVIDERS.includes(value.provider) ? value.provider : ''
  const key = typeof value.key === 'string' ? value.key : ''
  const kind = value.kind === 'claude-session' || value.kind === 'codex-thread' || value.kind === 'local-pin' ? value.kind : ''
  const phase = PHASES.includes(value.phase) ? value.phase : 'unknown'
  const cycleTier = TIERS.includes(value.cycleTier) ? value.cycleTier : 'none'
  const dynamicGroup = GROUPS.includes(value.dynamicGroup) ? value.dynamicGroup : 'none'
  const actionAlias = typeof value.actionAlias === 'string' ? value.actionAlias : ''
  const revisionAt = finiteInteger(value.revisionAt)
  if (!provider || !enabledProviders.has(provider) || !key || key.length > 256 || !kind || !revisionAt) return null
  const capabilities = value.capabilities && typeof value.capabilities === 'object' ? value.capabilities : {}
  const archiveRequest = normalizeArchiveRequest(value.archiveRequest)
  return {
    key,
    provider,
    kind,
    phase,
    cycleTier,
    dynamicGroup,
    actionAlias: actionAlias.slice(0, 256),
    revisionAt,
    statusEnteredAt: finiteInteger(value.statusEnteredAt, revisionAt),
    displayOrder: finiteInteger(value.displayOrder),
    cycleOrder: finiteInteger(value.cycleOrder),
    attentionOrder: finiteInteger(value.attentionOrder),
    hidden: value.hidden === true,
    unread: value.unread === true,
    planImplementation: value.planImplementation === true,
    localPin: value.localPin === true,
    dynamicEligible: value.dynamicEligible === true,
    capabilities: {
      open: capabilities.open === true && Boolean(actionAlias),
      archive: capabilities.archive === true
    },
    ...(archiveRequest ? { archiveRequest } : {})
  }
}

function targetFromTask(task) {
  return {
    key: task.key,
    provider: task.provider,
    actionAlias: task.actionAlias,
    revisionAt: task.revisionAt,
    phase: task.phase,
    canArchive: task.capabilities.archive,
    ...(task.archiveRequest ? { archiveRequest: task.archiveRequest } : {})
  }
}

function emptyViews() {
  return {
    groups: { input: [], active: [], stopped: [], unread: [], completed: [] },
    counts: { input: 0, active: 0, unread: 0 },
    cycleKeys: [],
    attentionKeys: { input: [], completedUnread: [], archive: [] }
  }
}

function emptyPackage(providers = { codex: true, claude: false }) {
  return {
    schema: COMPANION_TASK_PACKAGE_REVISION,
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: 0,
    sourceTaskStateRevision: 'legacy',
    publishedAt: 0,
    enabled: false,
    providers: { ...providers },
    complete: false,
    freshness: 'degraded',
    focusedKey: '',
    sourceGenerations: { codex: 0, claude: 0 },
    tasks: [],
    views: emptyViews()
  }
}

function taskSort(field) {
  return (left, right) => left[field] - right[field] || left.key.localeCompare(right.key)
}

function buildViews(tasks) {
  const views = emptyViews()
  const visible = tasks.filter((task) => !task.hidden)
  const display = [...visible].sort(taskSort('displayOrder'))
  for (const task of display) {
    if (task.dynamicEligible && task.dynamicGroup !== 'none') views.groups[task.dynamicGroup].push(task.key)
  }
  views.counts.input = tasks.filter((task) => task.phase === 'waiting-input' || task.phase === 'waiting-approval').length
  views.counts.active = views.groups.active.length
  views.counts.unread = tasks.filter((task) => task.unread).length

  const cycleCandidates = [...visible]
    .filter((task) => task.capabilities.open && task.cycleTier !== 'none')
    .sort(taskSort('cycleOrder'))
  for (const tier of ['attention', 'plan-implementation', 'active', 'fallback']) {
    const keys = cycleCandidates.filter((task) => task.cycleTier === tier).map((task) => task.key)
    if (keys.length) {
      views.cycleKeys = keys
      break
    }
  }

  const attention = [...visible].sort(taskSort('attentionOrder'))
  views.attentionKeys.input = attention
    .filter((task) => task.capabilities.open && (task.phase === 'waiting-input' || task.phase === 'waiting-approval'))
    .map((task) => task.key)
  views.attentionKeys.completedUnread = attention
    .filter((task) => task.capabilities.open && task.phase === 'completed' && task.unread)
    .map((task) => task.key)
  views.attentionKeys.archive = attention
    .filter((task) => task.capabilities.archive)
    .map((task) => task.key)
  return views
}

function semanticPackage(packageValue) {
  return JSON.stringify({
    sourceTaskStateRevision: packageValue.sourceTaskStateRevision,
    enabled: packageValue.enabled,
    providers: packageValue.providers,
    complete: packageValue.complete,
    freshness: packageValue.freshness,
    focusedKey: packageValue.focusedKey,
    sourceGenerations: packageValue.sourceGenerations,
    tasks: packageValue.tasks,
    views: packageValue.views
  })
}

function createCompanionTaskKernel(dependencies = {}) {
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : setTimeout
  const clearTimer = typeof dependencies.clearTimeout === 'function' ? dependencies.clearTimeout : clearTimeout
  const notify = typeof dependencies.notify === 'function' ? dependencies.notify : () => {}
  const preflight = typeof dependencies.preflight === 'function' ? dependencies.preflight : null
  const initial = dependencies.initialConfiguration && typeof dependencies.initialConfiguration === 'object'
    ? dependencies.initialConfiguration
    : {}
  let enabled = initial.enabled === true
  let providers = providerShape(initial.providers || { codex: true, claude: false })
  let activeLease = 0
  let leaseSequence = 0
  let packageSequence = 0
  let currentPackage = emptyPackage(providers)
  let lastDraft = null
  const lastDraftRevisionByProducer = new Map()
  let lastSemantic = semanticPackage(currentPackage)
  let disposed = false
  let preflightInFlight = null
  let unknownTimer = null
  const unknownEvidence = new Map()
  const packageListeners = new Set()

  const actions = createCompanionTaskActions({
    adapters: dependencies.adapters,
    notify,
    now
  })
  const navigation = createCompanionNavigation({
    coalesceMs: dependencies.coalesceMs,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    queueMicrotask: dependencies.queueMicrotask,
    openCodex: (target) => actions.open({ key: target.key, target, source: 'cycle' }),
    openClaude: (target) => actions.open({ key: target.key, target, source: 'cycle' })
  })
  let navigationLease = 0

  function beginNavigation() {
    const receipt = navigation.begin({ enabled, providers })
    navigationLease = receipt.lease
  }

  beginNavigation()

  function clearUnknownTimer() {
    if (unknownTimer) clearTimer(unknownTimer)
    unknownTimer = null
  }

  function emitPackage(packageValue) {
    for (const listener of packageListeners) {
      try { listener(packageValue) } catch {}
    }
  }

  function invalidate(reason) {
    clearUnknownTimer()
    unknownEvidence.clear()
    lastDraftRevisionByProducer.clear()
    lastDraft = null
    const next = emptyPackage(providers)
    next.enabled = enabled
    next.publishedAt = now()
    next.packageRevision = ++packageSequence
    currentPackage = next
    lastSemantic = semanticPackage(next)
    actions.sync({ enabled, ready: false, providers, targets: [] })
    navigation.sync({ lease: navigationLease, enabled, providers, ready: false, targets: [], cycleKeys: [] })
    emitPackage(currentPackage)
    return reason
  }

  function configure(input = {}) {
    const nextEnabled = input.enabled === true
    const nextProviders = providerShape(input.providers || providers)
    const changed = enabled !== nextEnabled || !sameProviders(providers, nextProviders)
    enabled = nextEnabled
    providers = nextProviders
    if (changed) {
      beginNavigation()
      invalidate(enabled ? 'provider-configuration-changed' : 'disabled')
    }
    return changed
  }

  function reconcileTask(previous, incoming, draft, forceUnknown) {
    if (!previous) {
      if (incoming.phase !== 'unknown') unknownEvidence.delete(incoming.key)
      return { task: incoming, degraded: false }
    }
    if (incoming.revisionAt < previous.revisionAt) return { task: previous, degraded: false }
    if ((previous.phase === 'completed' || previous.phase === 'stopped')
      && incoming.phase === 'running'
      && incoming.revisionAt === previous.revisionAt
      && incoming.statusEnteredAt <= previous.statusEnteredAt) return { task: previous, degraded: false }
    if ((previous.phase === 'waiting-input' || previous.phase === 'waiting-approval')
      && (incoming.phase === 'completed' || incoming.phase === 'stopped')
      && incoming.revisionAt === previous.revisionAt
      && incoming.statusEnteredAt <= previous.statusEnteredAt) return { task: previous, degraded: false }
    if (incoming.phase !== 'unknown' || previous.phase === 'unknown') {
      unknownEvidence.delete(incoming.key)
      return { task: incoming, degraded: false }
    }
    const observation = unknownEvidence.get(incoming.key)
    const next = observation
      ? { firstSeenAt: observation.firstSeenAt, count: observation.count + 1 }
      : { firstSeenAt: draft.acceptedAt || now(), count: 1 }
    unknownEvidence.set(incoming.key, next)
    if (forceUnknown || (next.count >= 2 && now() - next.firstSeenAt >= UNKNOWN_GRACE_MS)) {
      return { task: incoming, degraded: false }
    }
    return { task: previous, degraded: true }
  }

  function scheduleUnknownCommit(draft) {
    clearUnknownTimer()
    let dueAt = 0
    for (const value of unknownEvidence.values()) {
      if (value.count < 2) continue
      const candidate = value.firstSeenAt + UNKNOWN_GRACE_MS
      if (!dueAt || candidate < dueAt) dueAt = candidate
    }
    if (!dueAt) return
    unknownTimer = setTimer(() => {
      unknownTimer = null
      if (!disposed && lastDraft === draft) commitDraft(draft, true)
    }, Math.max(0, dueAt - now()))
  }

  function commitDraft(draft, forceUnknown = false) {
    if (disposed || !draft || draft.schema !== COMPANION_TASK_DRAFT_REVISION) return null
    const producer = draftProducer(draft.producer)
    const draftRevision = finiteInteger(draft.draftRevision)
    if (!draftRevision) return null
    const lastProducerRevision = lastDraftRevisionByProducer.get(producer) || 0
    if (!forceUnknown && draftRevision <= lastProducerRevision) return currentPackage
    configure({ enabled: draft.enabled, providers: draft.providers })
    if (!forceUnknown) lastDraftRevisionByProducer.set(producer, draftRevision)
    if (!enabled) return currentPackage
    const draftProviders = providerShape(draft.providers)
    if (!sameProviders(providers, draftProviders)) return null
    if (currentPackage.complete && draft.complete !== true) return currentPackage
    const enabledProviders = providerSet(providers)
    const staleProviders = new Set(PROVIDERS.filter((provider) => {
      if (!enabledProviders.has(provider)) return false
      const incomingGeneration = finiteInteger(draft.sourceGenerations?.[provider])
      const currentGeneration = finiteInteger(currentPackage.sourceGenerations[provider])
      return incomingGeneration > 0 && currentGeneration > 0 && incomingGeneration < currentGeneration
    }))
    const previousByKey = new Map(currentPackage.tasks.map((task) => [task.key, task]))
    const nextTasks = []
    const seen = new Set()
    let freshness = 'fresh'
    for (const value of Array.isArray(draft.tasks) ? draft.tasks.slice(0, MAX_TASKS) : []) {
      const incoming = normalizeTask(value, enabledProviders)
      if (!incoming || seen.has(incoming.key)) continue
      if (staleProviders.has(incoming.provider)) continue
      seen.add(incoming.key)
      const reconciled = reconcileTask(previousByKey.get(incoming.key), incoming, draft, forceUnknown)
      if (reconciled.degraded) freshness = 'degraded'
      nextTasks.push(reconciled.task)
    }
    for (const task of currentPackage.tasks) {
      if (!staleProviders.has(task.provider) || seen.has(task.key)) continue
      seen.add(task.key)
      nextTasks.push(task)
    }
    nextTasks.sort(taskSort('displayOrder'))
    lastDraft = draft
    if (!forceUnknown) scheduleUnknownCommit(draft)
    const focusedKey = typeof draft.focusedKey === 'string' && nextTasks.some((task) => task.key === draft.focusedKey)
      ? draft.focusedKey
      : ''
    const next = {
      schema: COMPANION_TASK_PACKAGE_REVISION,
      kernelRevision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: currentPackage.packageRevision,
      sourceTaskStateRevision: typeof draft.sourceTaskStateRevision === 'string' ? draft.sourceTaskStateRevision : 'legacy',
      publishedAt: finiteInteger(draft.acceptedAt, now()),
      enabled,
      providers: { ...providers },
      complete: draft.complete === true,
      freshness,
      focusedKey,
      sourceGenerations: {
        codex: Math.max(currentPackage.sourceGenerations.codex, finiteInteger(draft.sourceGenerations?.codex)),
        claude: Math.max(currentPackage.sourceGenerations.claude, finiteInteger(draft.sourceGenerations?.claude))
      },
      tasks: nextTasks,
      views: buildViews(nextTasks)
    }
    const semantic = semanticPackage(next)
    if (semantic === lastSemantic) return currentPackage
    next.packageRevision = ++packageSequence
    currentPackage = next
    lastSemantic = semantic
    const targets = nextTasks.filter((task) => task.capabilities.open).map(targetFromTask)
    actions.sync({
      enabled,
      providers,
      ready: next.complete,
      targets,
      focusedKey,
      attentionKeys: next.views.attentionKeys.archive
    })
    navigation.sync({
      lease: navigationLease,
      enabled,
      providers,
      ready: next.complete,
      targets,
      cycleKeys: next.views.cycleKeys
    })
    emitPackage(currentPackage)
    return currentPackage
  }

  function attach(input = {}) {
    if (disposed) return { revision: COMPANION_TASK_KERNEL_REVISION, lease: 0, retained: false, ready: false, package: currentPackage }
    configure(input)
    activeLease = ++leaseSequence
    return {
      revision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: COMPANION_TASK_PACKAGE_REVISION,
      lease: activeLease,
      retained: currentPackage.complete,
      ready: currentPackage.complete,
      package: currentPackage
    }
  }

  function syncPackage(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return null
    return commitDraft(input.draft)
  }

  function detach(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return false
    activeLease = 0
    return true
  }

  async function ensureReady() {
    if (currentPackage.complete && currentPackage.freshness === 'fresh') return currentPackage
    if (!enabled) throw new Error('disabled')
    if (!preflight) throw new Error('preflight-unavailable')
    if (preflightInFlight) return preflightInFlight
    const progressTimer = setTimer(() => notify('正在读取最新任务状态…'), PREFLIGHT_PROGRESS_MS)
    let timeoutTimer = null
    const timeout = new Promise((_resolve, reject) => {
      timeoutTimer = setTimer(() => reject(new Error('preflight-timeout')), PREFLIGHT_TIMEOUT_MS)
    })
    const operation = Promise.race([
      Promise.resolve().then(() => preflight({ providers: { ...providers } })),
      timeout
    ]).then((draft) => {
      const accepted = commitDraft(draft)
      if (!accepted?.complete) throw new Error('preflight-incomplete')
      return accepted
    }).finally(() => {
      clearTimer(progressTimer)
      if (timeoutTimer) clearTimer(timeoutTimer)
      if (preflightInFlight === operation) preflightInFlight = null
    })
    preflightInFlight = operation
    return operation
  }

  function taskForKey(key) {
    return currentPackage.tasks.find((task) => task.key === key) || null
  }

  async function dispatch(input = {}) {
    if (disposed || !enabled) return { outcome: 'unavailable', errorCode: 'disabled', message: '任务功能未启用' }
    try {
      await ensureReady()
    } catch {
      notify('任务状态预检失败，未使用不完整缓存')
      return { outcome: 'unavailable', errorCode: 'inventory-not-ready', message: '任务状态预检失败，请重试' }
    }
    if (input.action === 'cycle') return navigation.cycle(input.direction === -1 ? -1 : 1)
    if (input.action === 'open-attention') {
      const keys = input.kind === 'completed-unread'
        ? currentPackage.views.attentionKeys.completedUnread
        : currentPackage.views.attentionKeys.input
      const key = keys[0]
      const task = taskForKey(key)
      if (!task) return { outcome: 'unavailable', errorCode: 'no-task', message: '当前没有符合条件的任务' }
      return navigation.open({ key, target: targetFromTask(task), source: 'attention' })
    }
    if (input.action === 'open') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.open) return { outcome: 'unavailable', errorCode: 'stale-target', message: '任务身份已失效，请刷新后重试' }
      return navigation.open({ key: task.key, target: targetFromTask(task), source: input.source === 'attention' ? 'attention' : 'manual' })
    }
    if (input.action === 'archive') {
      const task = taskForKey(input.key)
      if (!task?.capabilities.archive) return { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已变化，当前不能归档' }
      return actions.archive({
        key: task.key,
        revisionAt: finiteInteger(input.revisionAt),
        phase: typeof input.phase === 'string' ? input.phase : task.phase,
        source: input.source === 'batch' || input.source === 'shortcut' ? input.source : 'card',
        target: targetFromTask(task)
      })
    }
    if (input.action === 'archive-focused') {
      const accepted = actions.shortcutArchive()
      return accepted
        ? { outcome: 'dispatched', message: '任务归档意图已处理' }
        : { outcome: 'unavailable', errorCode: 'no-task', message: '当前没有可归档的任务' }
    }
    return { outcome: 'unavailable', errorCode: 'unsupported', message: '未知任务操作' }
  }

  function handleEnter(action) {
    const code = action && typeof action.code === 'string' ? action.code : ''
    if (!enabled || ![
      'eypc-codex-task-previous',
      'eypc-codex-task-next',
      'eypc-codex-input',
      'eypc-codex-completed-unread',
      'eypc-companion-archive'
    ].includes(code)) return false
    const intent = code === 'eypc-codex-task-previous'
      ? { action: 'cycle', direction: -1 }
      : code === 'eypc-codex-task-next'
        ? { action: 'cycle', direction: 1 }
        : code === 'eypc-codex-completed-unread'
          ? { action: 'open-attention', kind: 'completed-unread' }
          : code === 'eypc-companion-archive'
            ? { action: 'archive-focused' }
            : { action: 'open-attention', kind: 'input' }
    void dispatch(intent).then((result) => {
      if (result?.outcome === 'opened' || result?.outcome === 'dispatched' || result?.errorCode === 'superseded') return
      notify(result?.message || '任务切换失败，请重试')
    }).catch(() => notify('任务切换失败，请重试'))
    return true
  }

  function onPackage(listener) {
    if (typeof listener !== 'function') return () => {}
    packageListeners.add(listener)
    listener(currentPackage)
    return () => packageListeners.delete(listener)
  }

  function takeResults(input = {}) {
    if (!Number.isInteger(input.lease) || input.lease !== activeLease) return []
    return navigation.takeResults({ lease: navigationLease })
  }

  function diagnostics() {
    return {
      revision: COMPANION_TASK_KERNEL_REVISION,
      packageRevision: COMPANION_TASK_PACKAGE_REVISION,
      enabled,
      ready: currentPackage.complete,
      packageGeneration: currentPackage.packageRevision,
      taskCount: currentPackage.tasks.length,
      cycleCount: currentPackage.views.cycleKeys.length,
      preflightInFlight: Boolean(preflightInFlight),
      freshness: currentPackage.freshness,
      navigation: navigation.diagnostics(),
      actions: actions.diagnostics()
    }
  }

  function close() {
    if (disposed) return
    disposed = true
    clearUnknownTimer()
    packageListeners.clear()
    actions.close()
    navigation.dispose()
  }

  return {
    revision: COMPANION_TASK_KERNEL_REVISION,
    packageRevision: COMPANION_TASK_PACKAGE_REVISION,
    attach,
    syncPackage,
    /** Host-only provider evidence path; never exposed as a Renderer authority. */
    publishEvidence: commitDraft,
    detach,
    dispatch,
    handleEnter,
    getPackage: () => currentPackage,
    onPackage,
    onResult: navigation.onResult,
    takeResults,
    diagnostics,
    close
  }
}

module.exports = {
  COMPANION_TASK_KERNEL_REVISION,
  COMPANION_TASK_PACKAGE_REVISION,
  PREFLIGHT_PROGRESS_MS,
  PREFLIGHT_TIMEOUT_MS,
  UNKNOWN_GRACE_MS,
  createCompanionTaskKernel
}
