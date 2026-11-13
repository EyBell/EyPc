// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexWaterBall from '../../src/components/CodexWaterBall.vue'
import FloatApp from '../../src/FloatApp.vue'
import CompanionEdgeRail from '../../src/components/CompanionEdgeRail.vue'
import type { CodexFloatWindowState } from '../../src/float-env'
import CodexPage from '../../src/pages/CodexPage.vue'
import {
  CODEX_MAX_QUOTA_REFRESH_SECONDS,
  CODEX_MIN_QUOTA_REFRESH_SECONDS,
  CODEX_TASK_STATE_REVISION,
  defaultCodexSettings,
  emptyCodexConfig,
  emptyCodexEnvironment,
  emptyCodexModelCatalog,
  emptyCodexQuota,
  projectConversations,
  type CodexHostProject,
  type CodexHostThread,
  type CodexQuotaSnapshotV1,
  type CodexTaskCard,
  type ConversationSnapshotV1
} from '../../src/domain/codex'
import { buildCodexCompactPresentation, buildCodexTaskStatePackage, type CodexTaskStatePackageV1 } from '../../src/domain/codexPresentation'
import { buildCodexEnvironmentPresentation } from '../../src/domain/codexEnvironmentPresentation'
import {
  emptyCompanionTaskPackage,
  type CompanionCanonicalTaskV4,
  type CompanionTaskSnapshotV6
} from '../../src/domain/companionTaskPackage'
import { companionTaskProvider } from '../../src/domain/companionProvider'
import { contrastRatio } from '../../src/domain/codexAppearance'
import { emptyClaudeEnvironment, emptyClaudeQuota, normalizeClaudeQuota } from '../../src/domain/claude'
import { mergeCompanionConversations } from '../../src/domain/companionAggregate'
import type { CodexFloatSnapshotV1, CodexRuntimeView } from '../../src/runtime/codexController'

const NOW = 1_784_364_000_000
const PROJECT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const PROJECT_C = 'cccccccccccccccccccccccccccccccc'
const TASK_ACTIVE = '1111111111111111'
const TASK_FAILED = '2222222222222222'
const TASK_DONE = '3333333333333333'
const TASK_HIDDEN = '4444444444444444'
const TASK_INPUT = '5555555555555555'
const defaults = defaultCodexSettings()
const mounted: VueWrapper[] = []
let taskSnapshotRevision = 0

type FloatFixture = CodexFloatSnapshotV1 & {
  conversations: ConversationSnapshotV1
  taskState: CodexTaskStatePackageV1
  taskStateRevision?: string
}

function canonicalTask(card: CodexTaskCard, index: number): CompanionCanonicalTaskV4 {
  const provider = companionTaskProvider(card)
  const phase = card.companionPhase
    || (card.activityState === 'waiting-input' ? 'waiting-input'
      : card.activityState === 'waiting-approval' ? 'waiting-approval'
        : card.claudePhase === 'unknown' ? 'unknown'
          : card.bucket === 'stopped' ? 'stopped'
            : card.bucket === 'completed' || card.bucket === 'completed-unread' ? 'completed'
              : 'running')
  const unread = card.bucket === 'completed-unread'
  const hidden = card.isHidden === true
  const dynamicGroup = hidden
    ? 'none'
    : phase === 'waiting-input' || phase === 'waiting-approval' ? 'input'
      : phase === 'running' ? 'active'
        : phase === 'stopped' || phase === 'unknown' ? 'stopped'
          : unread ? 'unread' : 'completed'
  const capabilities = card.companionCapabilities || {
    open: true,
    archive: card.canArchive === true,
    pause: card.planReady === true && card.planPaused !== true,
    resume: card.planReady === true && card.planPaused === true,
    executePlan: card.planReady === true && card.planPaused !== true
  }
  return {
    key: card.key,
    provider,
    kind: provider === 'codex' ? 'codex-thread' : provider === 'cursor' ? 'cursor-session' : 'claude-session',
    phase,
    cycleTier: phase === 'waiting-input' || phase === 'waiting-approval' ? 'attention' : phase === 'running' ? 'active' : 'none',
    dynamicGroup,
    actionAlias: card.actionAlias || '',
    revisionAt: card.revisionAt,
    semanticRevision: card.revisionAt,
    observationGeneration: card.revisionAt,
    membershipRevision: card.revisionAt,
    phaseRevision: card.statusEnteredAt || card.revisionAt,
    unreadRevision: card.completionRevision || card.revisionAt,
    visibilityRevision: card.revisionAt,
    statusEnteredAt: card.statusEnteredAt || card.revisionAt,
    turnStartedAt: card.lastTurnStartedAt || 0,
    terminalAt: card.lastTurnCompletedAt || 0,
    metadataRevision: card.updatedAt,
    capabilityToken: card.actionAlias || '',
    freshness: card.canonicalFreshness || 'fresh',
    lastQuestionAt: card.lastQuestionAt || 0,
    createdAt: card.createdAt || 0,
    displayOrder: index,
    cycleOrder: index,
    attentionOrder: index,
    hidden,
    unread,
    unreadKnown: phase === 'completed',
    planImplementation: card.planImplementationOnly === true,
    planReady: card.planReady === true,
    planLifecycleRevision: card.planLifecycleRevision || 0,
    planLifecycleState: card.planReady === true ? 'ready' : 'unknown',
    planClearReason: '',
    paused: card.planPaused === true,
    turnMode: card.planReady ? 'plan' : 'unknown',
    idleConfirmed: phase === 'completed' || phase === 'stopped',
    localPin: card.pinSource === 'local',
    dynamicEligible: !hidden,
    capabilities,
    displayName: card.displayName || card.name,
    originalTitle: card.originalName,
    alias: card.alias,
    projectKey: card.projectKey,
    projectName: card.projectName,
    projectKind: card.projectKind
  }
}

function canonicalSnapshot(taskState: CodexTaskStatePackageV1): CompanionTaskSnapshotV6 {
  const tasks = taskState.conversations.all.map(canonicalTask)
  const keys = (group: CompanionCanonicalTaskV4['dynamicGroup']) => tasks.filter((task) => task.dynamicGroup === group).map((task) => task.key)
  const revision = ++taskSnapshotRevision
  return {
    ...emptyCompanionTaskPackage(),
    packageRevision: revision,
    topologyRevision: revision,
    sourceTaskStateRevision: CODEX_TASK_STATE_REVISION,
    publishedAt: NOW + revision,
    enabled: true,
    complete: true,
    freshness: 'fresh',
    sourceGenerations: { codex: revision, claude: revision, cursor: revision, orca: 0 },
    sourceLaneGenerations: {
      codex: { membership: revision, activity: revision, interaction: revision, unread: revision, planArtifact: revision, metadata: revision, topology: revision },
      claude: { membership: revision, activity: revision, interaction: revision, unread: revision, planArtifact: revision, metadata: revision, topology: revision },
      cursor: { membership: revision, activity: revision, interaction: revision, unread: revision, planArtifact: revision, metadata: revision, topology: revision },
      orca: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 }
    },
    providerHealth: {
      codex: { status: 'ready', generation: revision, errorCode: '' },
      claude: { status: 'ready', generation: revision, errorCode: '' },
      cursor: { status: 'ready', generation: revision, errorCode: '' },
      orca: { status: 'disabled', generation: 0, errorCode: '' }
    },
    tasks,
    views: {
      groups: { pinned: keys('pinned'), input: keys('input'), active: keys('active'), stopped: keys('stopped'), unread: keys('unread'), completed: keys('completed') },
      counts: { input: keys('input').length, active: keys('active').length, unread: keys('unread').length },
      cycleKeys: tasks.filter((task) => !task.hidden).map((task) => task.key),
      attentionKeys: {
        input: keys('input'),
        completedUnread: keys('unread'),
        archive: tasks.filter((task) => task.capabilities.archive).map((task) => task.key)
      },
      pausedKeys: tasks.filter((task) => task.paused).map((task) => task.key)
    }
  }
}

function hostThread(input: Partial<CodexHostThread> & Pick<CodexHostThread, 'key' | 'name' | 'projectKey' | 'projectName'>): CodexHostThread {
  return {
    actionAlias: `alias-${input.key}`,
    status: 'notLoaded',
    activeFlags: [],
    statusAuthority: 'desktop-live',
    activityEvidence: input.status === 'active' ? 'activity-event' : undefined,
    hasUnreadTurn: false,
    unreadAuthority: 'desktop-persisted',
    updatedAt: NOW,
    lastTurnStatus: 'failed',
    lastTurnStartedAt: NOW,
    createdAt: NOW - 8_000,
    firstPromptAt: NOW - 7_000,
    projectKind: 'project',
    nativePinned: false,
    ...input
  }
}

function conversation(activeTab: 'all' | 'input' | 'ongoing' | 'hidden' | 'completed' | 'projects' = 'ongoing') {
  const projects: CodexHostProject[] = [
    { key: PROJECT_A, actionAlias: 'project-a-alias', name: 'CodeNote', kind: 'project', nativePinned: true, nativePinnedOrder: 0, nativeOrder: 0 },
    { key: PROJECT_B, actionAlias: 'project-b-alias', name: 'EyTodo', kind: 'project', nativePinned: false, nativeOrder: 1 },
    { key: PROJECT_C, actionAlias: 'project-c-alias', name: 'EzDesign', kind: 'project', nativePinned: false, nativeOrder: 2 },
    { key: 'chats', actionAlias: 'chats-alias', name: 'Chats', kind: 'chats', nativePinned: false }
  ]
  const threads: CodexHostThread[] = [
    hostThread({ key: TASK_ACTIVE, name: '真实进行中', projectKey: PROJECT_A, projectName: 'CodeNote', status: 'active', lastTurnStatus: 'inProgress', lastTurnStartedAt: NOW - 1_000, updatedAt: NOW - 500, nativePinned: true, nativePinnedOrder: 0 }),
    hostThread({ key: TASK_FAILED, name: '执行失败', projectKey: PROJECT_A, projectName: 'CodeNote', status: 'idle', lastTurnStatus: 'failed', lastTurnStartedAt: NOW - 2_000, updatedAt: NOW - 1_500 }),
    hostThread({ key: TASK_DONE, name: '原始完成标题', projectKey: PROJECT_A, projectName: 'CodeNote', lastTurnStatus: 'completed', lastTurnStartedAt: NOW - 3_000, lastTurnCompletedAt: NOW - 2_500, hasUnreadTurn: true, updatedAt: NOW - 2_000 }),
    hostThread({ key: TASK_HIDDEN, name: '隐藏的 Chats 会话', projectKey: 'chats', projectName: 'Chats', projectKind: 'chats', lastTurnStatus: 'completed', lastTurnStartedAt: NOW - 4_000, lastTurnCompletedAt: NOW - 3_500, updatedAt: NOW - 3_000 }),
    hostThread({ key: TASK_INPUT, name: '等待补充输入', projectKey: PROJECT_B, projectName: 'EyTodo', status: 'active', activeFlags: ['waitingOnUserInput'], lastTurnStatus: 'inProgress', lastTurnStartedAt: NOW - 500, updatedAt: NOW - 250 })
  ]
  return projectConversations({
    threads,
    projects,
    receipts: [{ key: TASK_HIDDEN, acknowledgedRecency: NOW - 3_500, acknowledgedAt: NOW, pendingRecency: 0, pendingSince: 0, dismissedActivityRecency: NOW - 3_500, dismissedAt: NOW }],
    lastTaskScanAt: NOW - 10_000,
    now: NOW,
    timeWindowDays: 30,
    activeTab,
    taskAliases: [{ key: TASK_DONE, alias: '完成别名' }],
    localPins: [{ kind: 'project', key: PROJECT_B }],
    sourceFingerprint: 'a'.repeat(64),
    completeness: 'verified',
    rawSourceCount: 9,
    eligibleSourceCount: 5,
    excludedSourceCount: 4
  }).snapshot
}

function quota(short = true, weekly = true): CodexQuotaSnapshotV1 {
  return {
    version: 1,
    status: 'ok',
    plan: 'pro',
    short: short ? { remainingPercent: 78, resetAt: NOW + 3_600_000, windowMinutes: 300 } : null,
    weekly: weekly ? { remainingPercent: 23, resetAt: NOW + 86_400_000, windowMinutes: 10_080 } : null,
    updatedAt: NOW
  }
}

function sparkQuota(): CodexQuotaSnapshotV1 {
  const short = { remainingPercent: 0, resetAt: NOW + 3_600_000, windowMinutes: 300 }
  const weekly = { remainingPercent: 0, resetAt: NOW + 86_400_000, windowMinutes: 10_080 }
  return {
    version: 2,
    status: 'ok',
    plan: 'pro',
    short,
    weekly,
    normal: { limitId: 'codex', limitName: 'Codex', family: 'normal', short, weekly },
    spark: [{
      limitId: 'codex_bengalfox',
      limitName: 'GPT-5.3-Codex-Spark',
      family: 'spark',
      short: { remainingPercent: 64, resetAt: NOW + 3_600_000, windowMinutes: 300 },
      weekly: { remainingPercent: 52, resetAt: NOW + 86_400_000, windowMinutes: 10_080 }
    }],
    updatedAt: NOW
  }
}

function floatSnapshot(activeTab: 'all' | 'input' | 'ongoing' | 'hidden' | 'completed' | 'projects' = 'ongoing', quotaValue = quota()): FloatFixture {
  const conversations = conversation(activeTab)
  const taskState = buildCodexTaskStatePackage(conversations, { sourceRevision: CODEX_TASK_STATE_REVISION, now: NOW })
  return {
    version: 2,
    baseRevision: 1,
    style: 'water',
    conversationInboxEnabled: true,
    compactFields: ['short', 'weekly', 'tasks'],
    expandedFields: ['plan', 'short', 'weekly', 'reset', 'config', 'tasks', 'updatedAt'],
    colors: defaults.colors,
    waterAppearance: defaults.waterAppearance,
    expandedSizes: [],
    quota: quotaValue,
    modelCatalog: {
      version: 1,
      status: 'ok',
      models: [
        { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', description: '普通 Codex 模型', family: 'normal', isDefault: true, supportsText: true },
        { id: 'gpt-5.3-codex-spark', displayName: 'GPT-5.3 Codex Spark', description: 'Spark 模型', family: 'spark', isDefault: false, supportsText: true }
      ],
      fingerprint: 'b'.repeat(64),
      updatedAt: NOW
    },
    newThreadContextFingerprint: 'c'.repeat(64),
    newThreadModelPolicy: 'quota-auto',
    newThreadPreferredModel: 'gpt-5.6-sol',
    config: { version: 1, model: 'gpt-5.6-sol', reasoningEffort: 'high', serviceTier: 'priority', updatedAt: NOW },
    taskSnapshot: canonicalSnapshot(taskState),
    taskInventory: taskState,
    taskState,
    taskStateRevision: CODEX_TASK_STATE_REVISION,
    conversations,
    taskArchive: { key: '', status: 'idle', message: '' },
    projectArchive: { key: '', status: 'idle', message: '' },
    timeWindowDays: 30,
    generatedAt: NOW
  }
}

function refreshTaskState(source: FloatFixture): void {
  source.taskState = buildCodexTaskStatePackage(source.conversations, {
    sourceRevision: source.taskStateRevision || CODEX_TASK_STATE_REVISION,
    now: NOW
  })
  source.taskInventory = source.taskState
  source.taskSnapshot = canonicalSnapshot(source.taskState)
}

function mountFloat(expanded: boolean, source: FloatFixture = floatSnapshot(), overrides: Partial<NonNullable<Window['eypcFloat']>> = {}) {
  const action = vi.fn((_id: string, _args?: unknown) => true)
  const setExpansion = vi.fn(() => true)
  const returnFocus = vi.fn(() => true)
  const createThread = vi.fn(async () => ({ outcome: 'opened' as const, modelId: 'gpt-5.6-sol' }))
  const reopenThread = vi.fn(async () => ({ outcome: 'opened' as const }))
  const openBlank = vi.fn(async () => ({ outcome: 'dispatched' as const }))
  window.eypcFloat = {
    runtimeIdentity: {
      revision: 'runtime-identity-v2',
      handshake: (expected) => ({
        revision: 'runtime-identity-v2',
        status: 'host-loaded',
        expected,
        actual: expected,
        kernelRevision: expected.kernelRevision,
        taskPackageRevision: expected.taskPackageRevision,
        message: 'loaded'
      })
    },
    getSnapshot: () => source,
    getState: () => ({ expanded, pinned: false, resizing: false, resizeCorner: expanded ? 'bottom-right' : null, expandedSize: expanded ? { displayId: '1', width: 360, height: 420, manual: false } : null }),
    onSnapshot: () => () => undefined,
    onState: () => () => undefined,
    onActivate: () => () => undefined,
    setExpansion,
    returnFocus,
    action,
    createThread,
    reopenThread,
    openBlank,
    copyText: vi.fn(async () => true),
    ackTaskSnapshot: vi.fn(() => true),
    dragStart: vi.fn(() => true),
    dragMove: vi.fn(() => true),
    dragEnd: vi.fn(() => true),
    resizeStart: vi.fn(() => true),
    resizeMove: vi.fn(() => true),
    resizeEnd: vi.fn(() => true),
    resizeCancel: vi.fn(() => true),
    ...overrides
  }
  const wrapper = mount(FloatApp, { attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, action, setExpansion, returnFocus, createThread, reopenThread, openBlank }
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  delete window.eypcFloat
  document.body.innerHTML = ''
})

async function mountRuntimePage(options: { claudeHooks?: 'outdated' | 'installed'; claudeEnabled?: boolean } = {}) {
  const settings = defaultCodexSettings()
  settings.providers.claude = options.claudeEnabled ?? false
  settings.providers.cursor = false
  const snapshot = {
    settings,
    quota: emptyCodexQuota(),
    claudeQuota: emptyClaudeQuota(),
    claudeEnvironment: { ...emptyClaudeEnvironment(), hooks: options.claudeHooks || 'installed' },
    taskState: { dynamic: { compactCounts: { input: 0, active: 0, unread: 0 } } },
    environment: emptyCodexEnvironment(),
    floatHost: {},
    taskSnapshot: { packageRevision: 0 },
    config: emptyCodexConfig(),
    modelCatalog: emptyCodexModelCatalog(),
    refreshing: false,
    runtimeIdentity: { status: 'host-loaded', packageVersion: '1.0.0', builtAtLocal: '2026-10-30 12:34', builtAt: '2026-10-30T04:34:00Z' },
    runtimeDiagnostics: {
      status: 'ok', settings: { enabled: true, level: 'debug' }, activeFile: '/diagnostic/current.log',
      totals: { events: 12, slow: 2 }, storage: { fileCount: 3 }
    }
  } as unknown as CodexRuntimeView
  const wrapper = mount(CodexPage, { props: { snapshot } })
  mounted.push(wrapper)
  await wrapper.get('#codex-config-tab-runtime').trigger('click')
  return { wrapper, snapshot }
}

describe('Codex Companion V4 UI contract', () => {
  it('waits for the first host snapshot without recreating, then rejects an actual identity mismatch', async () => {
    const requestRecreate = vi.fn(() => true)
    let currentIdentity: NonNullable<CodexFloatSnapshotV1['runtimeIdentity']> | undefined
    let receiveSnapshot: ((value: CodexFloatSnapshotV1) => void) | undefined
    const { wrapper } = mountFloat(false, floatSnapshot(), {
      getSnapshot: () => null,
      onSnapshot: (listener) => { receiveSnapshot = listener; return () => undefined },
      requestRecreate,
      runtimeIdentity: {
        revision: 'runtime-identity-v2',
        handshake: (expected) => {
          currentIdentity = {
            revision: 'runtime-identity-v2', status: 'host-loaded', expected, actual: expected,
            kernelRevision: expected.kernelRevision, taskPackageRevision: expected.taskPackageRevision,
            message: 'loaded'
          }
          return currentIdentity
        }
      }
    })
    await flushPromises()
    expect(wrapper.get('.float-runtime-reload').text()).toContain('正在连接')
    expect(requestRecreate).not.toHaveBeenCalled()
    receiveSnapshot!({ ...floatSnapshot(), runtimeIdentity: currentIdentity })
    await flushPromises()
    expect(wrapper.find('.float-runtime-reload').exists()).toBe(false)
    expect(requestRecreate).not.toHaveBeenCalled()
    receiveSnapshot!({
      ...floatSnapshot(), baseRevision: 2,
      runtimeIdentity: { ...currentIdentity!, actual: { ...currentIdentity!.actual, hostAssetId: 'host-retired' } }
    })
    await flushPromises()
    expect(wrapper.get('.float-runtime-reload').text()).toContain('需要重载')
    expect(requestRecreate).toHaveBeenCalledExactlyOnceWith('identity-mismatch')
  })

  it.each([true, false, undefined])('gates one-click continue by explicit root capability %s and preserves Plus', async (continueTask) => {
    const source = floatSnapshot('all')
    const task = source.conversations.all.find((candidate) => candidate.key === TASK_FAILED)!
    task.companionCapabilities = { open: true, archive: true, pause: false, resume: false, executePlan: false, continueTask }
    refreshTaskState(source)
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const row = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    expect(row.get('.action-create').find('svg').exists()).toBe(true)
    expect(row.find('.action-continue').exists()).toBe(continueTask === true)
    action.mockClear()
    if (continueTask === true) {
      expect(row.get('.action-continue').attributes('aria-label')).toContain('继续任务')
      await row.get('.action-continue').trigger('click')
      expect(action.mock.calls.filter(([id]) => id === 'codex.task.continueTask')).toHaveLength(1)
      expect(action).toHaveBeenCalledWith('codex.task.continueTask', { key: task.key, revisionAt: task.revisionAt })
    }
    action.mockClear()
    await row.trigger('contextmenu')
    expect(wrapper.find('[data-drawer-action-id="task-continue"]').exists()).toBe(continueTask === true)
    if (continueTask === true) {
      await wrapper.get('[data-drawer-action-id="task-continue"]').trigger('click')
      expect(action.mock.calls.filter(([id]) => id === 'codex.task.continueTask')).toHaveLength(1)
      expect(action).toHaveBeenCalledWith('codex.task.continueTask', { key: task.key, revisionAt: task.revisionAt })
    } else expect(action).not.toHaveBeenCalledWith('codex.task.continueTask', expect.anything())
  })

  it('retains two-click archive dispatch beside one-click continue', async () => {
    const source = floatSnapshot('all')
    const task = source.conversations.all.find((candidate) => candidate.key === TASK_FAILED)!
    task.companionCapabilities = { open: true, archive: true, pause: false, resume: false, executePlan: false, continueTask: true }
    refreshTaskState(source)
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const row = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    action.mockClear()
    await row.get('.action-archive').trigger('click')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())
    expect(row.get('.action-archive').attributes('aria-label')).toContain('确认归档')
    await row.get('.action-archive').trigger('click')
    expect(action.mock.calls.filter(([id]) => id === 'codex.tasks.archive')).toHaveLength(1)
    expect(action).toHaveBeenCalledWith('codex.tasks.archive', expect.objectContaining({
      items: [{ key: task.key, revisionAt: task.revisionAt }], confirmationRecorded: true
    }))
    expect(action).not.toHaveBeenCalledWith('codex.task.continueTask', expect.anything())
  })

  it('renders Plan-ready four-slot actions, single-click implementation and complete drawer/batch actions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const source = floatSnapshot('all')
    const task = source.conversations.all.find((candidate) => candidate.key === TASK_FAILED)!
    task.planReady = true
    task.planLifecycleRevision = NOW - 2_000
    task.planPaused = false
    task.companionCapabilities = { open: true, archive: true, pause: true, resume: false, executePlan: true }
    refreshTaskState(source)
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const row = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    expect(row.findAll('.task-inline-actions button')).toHaveLength(4)
    expect(row.findAll('.task-inline-actions button svg')).toHaveLength(4)
    expect(row.findAll('.task-inline-actions button').map((button) => button.attributes('aria-label'))).toEqual([
      expect.stringContaining('置顶'),
      expect.stringContaining('暂停 Plan'),
      expect.stringContaining('归档'),
      expect.stringContaining('实施计划')
    ])
    expect(row.get('.action-hide').attributes('aria-label')).toContain('暂停 Plan')
    expect(row.get('.action-create').attributes('aria-label')).toContain('实施计划')

    await row.get('.action-hide').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.pausePlan', { key: TASK_FAILED, revisionAt: task.revisionAt })
    action.mockClear()
    await row.get('.action-create').trigger('click')
    expect(row.get('.action-create').attributes('aria-label')).not.toContain('确认')
    expect(action).toHaveBeenCalledWith('codex.task.executePlan', { key: TASK_FAILED, revisionAt: task.revisionAt })
    expect(action).toHaveBeenCalledTimes(1)
    expect(row.get('.action-create').attributes('aria-label')).toContain('实施计划')

    await row.trigger('contextmenu')
    expect(wrapper.get('[data-drawer-action-id="task-new-thread"]').text()).toContain('在当前项目新建会话')
    expect(wrapper.get('[data-drawer-action-id="task-new-thread-model"]').text()).toContain('选择模型新建会话')
    expect(wrapper.get('[data-drawer-action-id="task-pause-plan"]').attributes('aria-label')).toBe('暂停 Plan')
    expect(wrapper.get('[data-drawer-action-id="task-execute-plan"]').text()).toContain('实施计划')
    action.mockClear()
    await wrapper.get('[data-drawer-action-id="task-execute-plan"]').trigger('click')
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith('codex.task.executePlan', { key: TASK_FAILED, revisionAt: task.revisionAt })
    await wrapper.get('.float-side-panel [aria-label="关闭"]').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-state-button`).trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.get('.float-batch-toolbar [aria-label^="打开当前多选的完整操作"]').trigger('click')
    expect(wrapper.get('[data-drawer-action-id="batch-pause-plan"]').attributes('aria-label')).toContain('暂停 Plan（1）')
    expect(wrapper.get('[data-drawer-action-id="batch-resume-plan"]').attributes()).toHaveProperty('disabled')
  })

  it('shows paused Plans before ordinary hidden tasks and exposes resume in the second slot', async () => {
    const source = floatSnapshot('hidden')
    const paused = source.conversations.all.find((candidate) => candidate.key === TASK_HIDDEN)!
    paused.planReady = true
    paused.planLifecycleRevision = NOW - 4_000
    paused.planPaused = true
    paused.companionCapabilities = { open: true, archive: true, pause: false, resume: true, executePlan: true }
    const ordinary = source.conversations.all.find((candidate) => candidate.key === TASK_FAILED)!
    ordinary.isHidden = true
    ordinary.hiddenKind = 'activity'
    source.conversations.hidden = [paused, ordinary]
    source.conversations.stopped = source.conversations.stopped.filter((candidate) => candidate.key !== TASK_FAILED)
    refreshTaskState(source)
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.float-status-section').map((section) => section.text())).toEqual([
      expect.stringContaining('已暂停'),
      expect.stringContaining('普通隐藏')
    ])
    const pausedRow = wrapper.get(`[data-focus-key="task:${TASK_HIDDEN}"]`)
    expect(pausedRow.findAll('.task-inline-actions button')).toHaveLength(4)
    expect(pausedRow.findAll('.task-inline-actions button svg')).toHaveLength(4)
    expect(pausedRow.get('.action-hide').attributes('aria-label')).toContain('恢复 Plan')
    await pausedRow.get('.action-hide').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.resumePlan', { key: TASK_HIDDEN, revisionAt: paused.revisionAt })
  })

  it('separates unknown Claude evidence from the stopped section', async () => {
    const source = floatSnapshot('ongoing')
    const task = source.conversations.stopped.find((candidate) => candidate.key === TASK_FAILED)!
    task.provider = 'claude'
    task.claudePhase = 'unknown'
    task.state = 'attention'
    task.activityState = 'ongoing'
    refreshTaskState(source)
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const sectionTitles = wrapper.findAll('.float-status-section').map((row) => row.text())
    expect(sectionTitles.some((text) => text.includes('状态未知'))).toBe(true)
    expect(sectionTitles.some((text) => text.includes('已停止'))).toBe(false)
    expect(wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`).text()).toContain('状态未知')
  })

  it('removes the legacy completion presentation delay control', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/CodexPage.vue'), 'utf8')
    expect(source).not.toContain('进行中离开稳定窗')
    expect(source).not.toContain('completionPresentationDelayMs')
  })

  it('exposes the floating Dynamic-tab time filter in the task settings', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/CodexPage.vue'), 'utf8')
    expect(source).toContain('动态时间筛选（小时）')
    expect(source).toContain(':value="snapshot.settings.dynamicTaskWindowHours"')
    expect(source).toContain('update({ dynamicTaskWindowHours:')
    expect(source).toContain('默认一周')
  })

  it('configures the automatic quota interval without exposing full task reconciliation', async () => {
    const { wrapper } = await mountRuntimePage()
    const input = wrapper.get('.codex-runtime-panel--quota input[type="number"]')
    expect((input.element as HTMLInputElement).value).toBe('300')
    expect(input.attributes('min')).toBe(String(CODEX_MIN_QUOTA_REFRESH_SECONDS))
    expect(input.attributes('max')).toBe(String(CODEX_MAX_QUOTA_REFRESH_SECONDS))
    await input.setValue('600')
    expect(wrapper.emitted('dispatch')).toContainEqual(['codex.settings.update', { settings: { quotaRefreshSeconds: 600 } }])
    const source = readFileSync(resolve(process.cwd(), 'src/pages/CodexPage.vue'), 'utf8')
    expect(source).not.toContain('完整校对频率（秒）')
    expect(source).not.toContain('snapshot.settings.taskRefreshSeconds')
    expect(source).not.toContain("'codex.refresh'")
    expect(source).not.toContain('snapshot.settings.quotaRefreshMinutes')
  })

  it('shows the loaded build and exposes compact runtime log controls', async () => {
    const { wrapper, snapshot } = await mountRuntimePage()
    const build = wrapper.get('[aria-label^="产物："]')
    expect(build.attributes('title')).toContain('宿主已加载此构建')
    expect(build.attributes('title')).toContain('2026-10-30 12:34')
    expect(wrapper.get('.codex-runtime-log-panel').text()).toContain('事件 12 · 慢 2 · 落盘 3 文件')
    await wrapper.get('[aria-label="启用诊断日志"]').setValue(false)
    await wrapper.get('#codex-runtime-diagnostics-level').setValue('error')
    expect(wrapper.emitted('dispatch')).toContainEqual(['runtime.logs.configure', { enabled: false, level: 'debug' }])
    expect(wrapper.emitted('dispatch')).toContainEqual(['runtime.logs.configure', { enabled: true, level: 'error' }])
    const buttons = wrapper.findAll('.codex-runtime-log-actions button')
    for (const button of buttons) await button.trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['runtime.logs.openFile'])
    expect(wrapper.emitted('dispatch')).toContainEqual(['runtime.logs.openDirectory'])
    expect(wrapper.emitted('dispatch')).toContainEqual(['runtime.logs.clear'])
    expect(wrapper.text()).not.toContain('/diagnostic/current.log')
    await wrapper.setProps({ snapshot: {
      ...snapshot, runtimeIdentity: { ...snapshot.runtimeIdentity!, status: 'reload-required' },
      runtimeDiagnostics: { ...snapshot.runtimeDiagnostics!, activeFile: '', storage: { ...snapshot.runtimeDiagnostics!.storage, fileCount: 0 } }
    } })
    expect(wrapper.get('[aria-label^="产物："]').attributes('title')).toContain('运行身份不一致，需要重载')
    expect(wrapper.findAll('.codex-runtime-log-actions button')[0].attributes()).toHaveProperty('disabled')
    expect(wrapper.findAll('.codex-runtime-log-actions button')[2].attributes()).toHaveProperty('disabled')
  })

  it('keeps the compact connection status and aggregate decisions free of task identities', async () => {
    const { wrapper } = await mountRuntimePage()
    expect(wrapper.get('[aria-label^="连接："]').attributes('title')).toBe('等待首次读取')
    const presentation = buildCodexEnvironmentPresentation(emptyCodexEnvironment(), {
      liveEpochOpened: 2, hydrationActiveDeferred: 0, staleTurnDiscarded: 3, branchTerminalDeferred: 5,
      snapshotConflictSuppressed: 7, missingMappingRetained: 11, waitingEdgeResubscribe: 0, waitingEdgeRecoveryExpired: 0,
      task: 'private-task-id'
    } as Parameters<typeof buildCodexEnvironmentPresentation>[1])
    const row = presentation.rows.find((candidate) => candidate.label === '状态裁决')!
    expect(row.value).toBe('保护 26 · 周期 2')
    expect(row.detail).toContain('丢弃旧读 3')
    expect(row.detail).toContain('延后分支终态 5')
    expect(JSON.stringify(row)).not.toContain('private-task-id')
  })

  it('lets Claude and Cursor source switches request automatic hook registration', async () => {
    const { wrapper, snapshot } = await mountRuntimePage()
    const rows = wrapper.findAll('.codex-runtime-switch-grid label')
    const claude = rows.find((row) => row.text().includes('Claude Code'))!
    const cursor = rows.find((row) => row.text().includes('Cursor Agent'))!
    await claude.get('input').setValue(true)
    await cursor.get('input').setValue(true)
    expect(wrapper.emitted('dispatch')).toContainEqual(['codex.settings.update', { settings: { providers: { ...snapshot.settings.providers, claude: true } } }])
    expect(wrapper.emitted('dispatch')).toContainEqual(['codex.settings.update', { settings: { providers: { ...snapshot.settings.providers, cursor: true } } }])
    expect(wrapper.text()).not.toContain('重新注册钩子')
    expect(wrapper.text()).not.toContain('移除钩子')
  })

  it('keeps the Claude source switch usable when installed hooks are outdated', async () => {
    const { wrapper, snapshot } = await mountRuntimePage({ claudeHooks: 'outdated', claudeEnabled: true })
    const claude = wrapper.findAll('.codex-runtime-switch-grid label').find((row) => row.text().includes('Claude Code'))!
    expect(claude.text()).toContain('自动注册钩子')
    await claude.get('input').setValue(false)
    expect(wrapper.emitted('dispatch')).toContainEqual(['codex.settings.update', { settings: { providers: { ...snapshot.settings.providers, claude: false } } }])
  })

  it('shows Weekly-only 23% with a complete Weekly ring and no false 5h label', () => {
    const quotaValue = quota(false, true)
    const compact = buildCodexCompactPresentation({
      quota: quotaValue,
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: { primary: compact.primary, secondary: compact.secondary, stateLabel: '', label: compact.ariaLabel, appearance: defaults.waterAppearance, colors: defaults.colors }
    })
    mounted.push(wrapper)
    expect(wrapper.get('.codex-water-ball__value strong').text()).toBe('23%')
    expect(wrapper.find('.codex-water-ball__value span').exists()).toBe(false)
    expect(wrapper.find('.codex-water-ball__ring .track').exists()).toBe(true)
    expect(wrapper.find('.codex-water-ball__ring .value').exists()).toBe(true)
    expect(wrapper.find('.codex-water-ball__badge').exists()).toBe(false)

    const source = readFileSync(resolve(process.cwd(), 'src/components/CodexWaterBall.vue'), 'utf8')
    expect(source).toContain('background: transparent')
    expect(source).toContain('border: 0')

    const dualCompact = buildCodexCompactPresentation({
      quota: quota(true, true),
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const dualBall = mount(CodexWaterBall, {
      props: { primary: dualCompact.primary, secondary: dualCompact.secondary, stateLabel: '', label: dualCompact.ariaLabel, appearance: defaults.waterAppearance, colors: defaults.colors }
    })
    mounted.push(dualBall)
    expect(dualBall.get('.codex-water-ball__value').text()).toBe('78%')
  })

  it('reads the Claude pair as `{fable}/{plain}` on a denser type scale with no percent sign', () => {
    const compact = buildCodexCompactPresentation({
      quota: quota(true, true),
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: {
        primary: compact.primary,
        secondary: compact.secondary,
        stateLabel: '',
        label: compact.ariaLabel,
        appearance: defaults.waterAppearance,
        colors: defaults.colors,
        percentOverride: 45,
        scopedPercent: 79,
        percentProviderLabel: 'Claude'
      }
    })
    mounted.push(wrapper)
    expect(wrapper.get('.codex-water-ball__pair').text()).toBe('79/45')
    expect(wrapper.get('.codex-water-ball__value').text()).not.toContain('%')
    expect(wrapper.get('.codex-water-ball__percent-source').text()).toBe('Claude')
    // `percentSize` reaches 32px, where an uncapped pair would push `100/100`
    // through the ring, so the pair is bounded by the ball as well.
    const source = readFileSync(resolve(process.cwd(), 'src/components/CodexWaterBall.vue'), 'utf8')
    // The pair rule must outrank `.codex-water-ball__value strong`, or the cap
    // silently loses the cascade and `100/100` renders at full size again.
    expect(source).toContain('.codex-water-ball__value strong.codex-water-ball__pair {')
    expect(source).toContain("font-size: min(calc(var(--water-percent-size, 22px) * .7), calc(var(--water-size, 94px) * .165));")
    expect(source).toContain('font-variant-numeric: tabular-nums lining-nums;')

    const single = mount(CodexWaterBall, {
      props: {
        primary: compact.primary,
        secondary: compact.secondary,
        stateLabel: '',
        label: compact.ariaLabel,
        appearance: defaults.waterAppearance,
        colors: defaults.colors,
        percentOverride: 45,
        percentProviderLabel: 'Claude'
      }
    })
    mounted.push(single)
    expect(single.find('.codex-water-ball__pair').exists()).toBe(false)
    expect(single.get('.codex-water-ball__value strong').text()).toBe('45%')
  })

  it('keeps a 4-cell Magpie quota grid compact so Token/Grok/Cursor do not collide', () => {
    const compact = buildCodexCompactPresentation({
      quota: quota(false, true),
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: {
        primary: compact.primary,
        secondary: compact.secondary,
        stateLabel: '',
        label: compact.ariaLabel,
        appearance: defaults.waterAppearance,
        colors: defaults.colors,
        quotaGrid: [
          { key: 'token', label: 'Token', kind: 'token', percent: null, text: '3.6W', detail: 'Codex Token 余量 36000 credits' },
          { key: 'grok', label: 'Grok', kind: 'percent', percent: 81, text: '81', detail: 'Grok 7 天剩余 81%' },
          { key: 'cursor-models', label: 'G', kind: 'percent', percent: 73, text: '73', detail: 'Cursor Models 剩余 73%' },
          { key: 'cursor-other', label: 'A', kind: 'percent', percent: 20, text: '20', detail: 'Cursor Other Models 剩余 20%' }
        ]
      }
    })
    mounted.push(wrapper)
    expect(wrapper.get('.codex-water-ball__grid').classes()).toContain('layout-rows')
    expect(wrapper.findAll('.codex-water-ball__grid-row')).toHaveLength(2)
    expect(wrapper.get('.codex-water-ball__grid-row.row-top').classes()).toContain('row-pair')
    expect(wrapper.get('.codex-water-ball__grid-row.row-bottom').classes()).toContain('row-pair')
    expect(wrapper.findAll('.codex-water-ball__grid-cell')).toHaveLength(4)
    expect(wrapper.get('.codex-water-ball__grid-cell.kind-token .codex-water-ball__grid-value').text()).toBe('3.6W')
    expect(wrapper.get('.codex-water-ball__grid').text()).toContain('Grok')
    expect(wrapper.get('.codex-water-ball__grid').text()).toContain('81')
    const source = readFileSync(resolve(process.cwd(), 'src/components/CodexWaterBall.vue'), 'utf8')
    expect(source).toContain('.codex-water-ball__value strong.codex-water-ball__grid-value {')
    expect(source).toContain("font-size: min(calc(var(--water-percent-size, 22px) * .66), calc(var(--water-size, 94px) * .17));")
    expect(source).toContain('place-content: center;')
    expect(source).toContain('.codex-water-ball__value.has-grid')
    expect(source).toContain('transform: translateY(4%);')
    expect(wrapper.get('.codex-water-ball__value').classes()).toContain('has-grid')
    expect(source).not.toContain('.codex-water-ball__grid-cell.kind-token .codex-water-ball__grid-value')
    expect(source).not.toContain('layout-three')
    expect(source).toMatch(/\.codex-water-ball__grid-label \{[^}]*color: #F7F4EA;[^}]*text-transform: none;/)
    expect(source).toMatch(/\.codex-water-ball__value strong\.codex-water-ball__grid-value \{[^}]*color: #F7F4EA;/)
    expect(source).toContain('color: var(--water-percent-color, #fff);')
    expect(source).not.toContain('rgba(3, 13, 24, .72)')
  })

  it('centres a lone Magpie quota cell in its surviving row', () => {
    const compact = buildCodexCompactPresentation({
      quota: quota(false, true),
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: {
        primary: compact.primary,
        secondary: compact.secondary,
        stateLabel: '',
        label: compact.ariaLabel,
        appearance: defaults.waterAppearance,
        colors: defaults.colors,
        quotaGrid: [
          { key: 'token', label: 'Token', kind: 'token', percent: null, text: '3.6W', detail: 'Codex Token 余量 36000 credits' },
          { key: 'cursor-models', label: 'G', kind: 'percent', percent: 73, text: '73', detail: 'Cursor Models 剩余 73%' }
        ]
      }
    })
    mounted.push(wrapper)
    expect(wrapper.get('.codex-water-ball__grid').classes()).toContain('layout-rows')
    expect(wrapper.findAll('.codex-water-ball__grid-row')).toHaveLength(2)
    expect(wrapper.get('.codex-water-ball__grid-row.row-top').classes()).toContain('row-single')
    expect(wrapper.get('.codex-water-ball__grid-row.row-bottom').classes()).toContain('row-single')
    expect(wrapper.findAll('.codex-water-ball__grid-cell')).toHaveLength(2)
  })

  it('fills the empty codex channels from the centre provider overrides', () => {
    // No codex reading at all: without the overrides the ball is dead glass,
    // which is the state the companion fix exists to prevent.
    const dead = mount(CodexWaterBall, {
      props: { primary: null, secondary: null, stateLabel: '', label: '', appearance: defaults.waterAppearance, colors: defaults.colors, percentOverride: 45, percentProviderLabel: 'Claude' }
    })
    mounted.push(dead)
    expect(dead.find('.codex-water-ball__liquid').exists()).toBe(false)
    expect(dead.find('.codex-water-ball__ring').exists()).toBe(false)

    const wrapper = mount(CodexWaterBall, {
      props: {
        primary: null,
        secondary: null,
        stateLabel: '',
        label: '',
        appearance: defaults.waterAppearance,
        colors: defaults.colors,
        percentOverride: 45,
        percentProviderLabel: 'Claude',
        liquidPercent: 70,
        ringPercent: 45
      }
    })
    mounted.push(wrapper)
    expect(wrapper.find('.codex-water-ball__liquid').exists()).toBe(true)
    expect(wrapper.find('.codex-water-ball__ring').exists()).toBe(true)
    expect(wrapper.get('.codex-water-ball').attributes('style')).toContain('--water-level: 70%')
    expect(wrapper.get('.codex-water-ball').attributes('style')).toContain('--weekly-ring: 45')
    expect(wrapper.get('.codex-water-ball__value strong').text()).toBe('45%')
  })

  it('keeps the codex channels authoritative when codex has a reading', () => {
    const compact = buildCodexCompactPresentation({
      quota: quota(true, true),
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: {
        primary: compact.primary,
        secondary: compact.secondary,
        stateLabel: '',
        label: compact.ariaLabel,
        appearance: defaults.waterAppearance,
        colors: defaults.colors,
        percentOverride: 45,
        percentProviderLabel: 'Claude'
      }
    })
    mounted.push(wrapper)
    // No channel overrides: liquid and ring stay on the codex readings.
    expect(wrapper.get('.codex-water-ball').attributes('style')).toContain(`--water-level: ${compact.primary!.bucket.remainingPercent}%`)
    expect(wrapper.find('.codex-water-ball__ring').exists()).toBe(true)
  })

  it('marks Spark quota with S and switches the outer ring to Spark weekly quota', () => {
    const presentation = buildCodexCompactPresentation({
      quota: sparkQuota(),
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: { primary: presentation.primary, secondary: presentation.secondary, stateLabel: '', label: presentation.ariaLabel, appearance: defaults.waterAppearance, colors: defaults.colors }
    })
    mounted.push(wrapper)
    expect(wrapper.get('.codex-water-ball__spark').text()).toBe('S')
    expect(wrapper.get('.codex-water-ball__value strong').text()).toBe('64%')
    expect(wrapper.get('.codex-water-ball').attributes('style')).toContain('--weekly-ring: 52')
  })

  it('supports project-header Space selection of visible children', async () => {
    const projects = mountFloat(true, floatSnapshot('projects')).wrapper
    await projects.vm.$nextTick()
    const codeNote = projects.findAll('.float-project-row').find((row) => row.text().includes('CodeNote'))!
    ;(codeNote.element as HTMLElement).focus()
    await projects.vm.$nextTick()
    await codeNote.trigger('keydown', { key: ' ', code: 'Space' })
    expect(document.activeElement).not.toBe(codeNote.element)
    expect(projects.findAll('.float-task-row.selected').map((row) => row.text())).toEqual(expect.arrayContaining([
      expect.stringContaining('执行失败'),
      expect.stringContaining('完成别名')
    ]))
  })

  it('renders a compressed task meta line and keeps the full owner phrase for readers', async () => {
    vi.useFakeTimers({ now: NOW })
    const { wrapper } = mountFloat(true, floatSnapshot())
    await wrapper.vm.$nextTick()
    const active = wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"]`)
    expect(active.get('.task-provider-marker').text()).toBe('CX')
    expect(active.get('.task-meta-button').text()).toBe('CodeNote 进行中 RECENT')
    expect(active.attributes('aria-label')).toContain('归属 Codex')
    expect(active.attributes('aria-label')).toContain('CodeNote')

    const hidden = mountFloat(true, floatSnapshot('hidden')).wrapper
    await hidden.vm.$nextTick()
    const chatsRow = hidden.get(`[data-focus-key="task:${TASK_HIDDEN}"]`)
    expect(chatsRow.get('.task-provider-marker').text()).toBe('CX')
    expect(chatsRow.get('.task-meta-button').text()).not.toMatch(/Chats/i)
    expect(chatsRow.get('.task-meta-button').text()).toMatch(/已完成 RECENT$/)
  })

  it('filters virtual projects by provider and keeps textual ownership plus action capabilities', async () => {
    const source = floatSnapshot('projects')
    const seed = source.conversations.all.find((task) => task.key === TASK_FAILED)!
    source.conversations = mergeCompanionConversations(source.conversations, [
      {
        ...seed,
        key: 'claude:shared-task',
        actionAlias: 'local_11111111-1111-4111-8111-111111111111',
        name: 'Claude shared task',
        originalName: 'Claude shared task',
        provider: 'claude',
        projectKey: PROJECT_A,
        projectName: 'CodeNote',
        originalProjectName: 'CodeNote',
        canArchive: false,
        claudePhase: 'completed'
      },
      {
        ...seed,
        key: 'claude:solo-task',
        actionAlias: 'local_22222222-2222-4222-8222-222222222222',
        name: 'Claude solo task',
        originalName: 'Claude solo task',
        provider: 'claude',
        projectKey: 'dddddddddddddddddddddddddddddddd',
        projectName: 'ClaudeSolo',
        originalProjectName: 'ClaudeSolo',
        canArchive: false,
        claudePhase: 'completed'
      }
    ])
    source.companion = {
      providers: { codex: true, claude: true, cursor: false },
      claudeQuota: normalizeClaudeQuota(null),
      claudeEnvironment: emptyClaudeEnvironment()
    }
    refreshTaskState(source)
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()

    const filters = wrapper.findAll('.float-project-provider-tabs [role="tab"]')
    expect(filters.map((filter) => filter.text())).toEqual(['全部', '只显示 Codex', '只显示 Claude'])
    expect(filters[0].attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.float-project-row').some((row) => row.text().includes('归属 Codex + Claude'))).toBe(true)
    expect(wrapper.findAll('.task-provider-marker').map((marker) => marker.text())).toEqual(expect.arrayContaining(['CX', 'CC']))

    await filters[1].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.float-task-row.provider-claude')).toHaveLength(0)
    expect(wrapper.findAll('.float-project-row').some((row) => row.text().includes('ClaudeSolo'))).toBe(false)

    await wrapper.findAll('.float-project-provider-tabs [role="tab"]')[2].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.float-task-row').every((row) => row.classes().includes('provider-claude'))).toBe(true)
    expect(wrapper.get('.float-project-provider-tabs > span').text()).toContain('2 项目 · 2 任务')
    const archive = wrapper.get('[data-focus-key="task:claude:shared-task"] .action-archive')
    expect(archive.attributes('aria-disabled')).toBe('true')
    const create = wrapper.get('[data-focus-key="task:claude:shared-task"] .action-create')
    expect(create.attributes()).toHaveProperty('disabled')
    expect(create.attributes('title')).toContain('不会转发 Codex 新建动作')
    const claudeOnlyProject = wrapper.findAll('.float-project-row').find((row) => row.text().includes('ClaudeSolo'))!
    expect(claudeOnlyProject.get('.action-create').attributes()).toHaveProperty('disabled')
    expect(claudeOnlyProject.get('.action-remove').attributes()).toHaveProperty('disabled')
    expect(claudeOnlyProject.get('.action-hide').attributes()).toHaveProperty('disabled')
    expect(claudeOnlyProject.get('.action-pin').attributes('aria-disabled')).toBe('true')
  })

  it('does not expose a provider-specific task sync action', async () => {
    const source = floatSnapshot('projects')
    const seed = source.conversations.all.find((task) => task.key === TASK_FAILED)!
    const actionAlias = 'local_11111111-1111-4111-8111-111111111111'
    source.conversations = mergeCompanionConversations(source.conversations, [{
      ...seed,
      key: 'claude:sync-task',
      actionAlias,
      name: 'Claude sync task',
      originalName: 'Claude sync task',
      provider: 'claude',
      projectKey: PROJECT_A,
      projectName: 'CodeNote',
      originalProjectName: 'CodeNote',
      canArchive: false,
      claudePhase: 'completed'
    }])
    source.companion = {
      providers: { codex: true, claude: true, cursor: false },
      claudeQuota: normalizeClaudeQuota(null),
      claudeEnvironment: emptyClaudeEnvironment()
    }
    refreshTaskState(source)
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-focus-key="task:claude:sync-task"]').trigger('contextmenu')
    expect(wrapper.find('[data-drawer-action-id="task-claude-sync"]').exists()).toBe(false)

    await wrapper.get('.float-side-panel [aria-label="关闭"]').trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`).trigger('contextmenu')
    expect(wrapper.find('[data-drawer-action-id="task-claude-sync"]').exists()).toBe(false)
  })

  it('uses 8% normal and 12% hover provider tints with forced-colors fallbacks', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('var(--codex-quota-codex) 8%')
    expect(css).toContain('var(--codex-quota-claude) 8%')
    expect(css).toContain('var(--codex-quota-codex) 12%')
    expect(css).toContain('@media (forced-colors: active)')
  })

  it('gives Cursor its own ownership token and a filled marker distinct from the outline markers', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    // Row tints follow the dedicated token, no longer the shared accent.
    expect(css).toContain('var(--codex-quota-cursor) 8%')
    expect(css).toContain('var(--codex-quota-cursor) 12%')
    expect(css).not.toMatch(/provider-cursor[^}]*var\(--codex-accent\)/)
    // The Cursor badge is filled while Codex/Claude badges stay outline-only.
    expect(css).toMatch(/\.task-provider-marker\.provider-cursor[^}]*background: color-mix\(in srgb, var\(--codex-quota-cursor\)/)
    expect(css).not.toMatch(/\.task-provider-marker\.provider-codex[^}]*background/)
    expect(css).not.toMatch(/\.task-provider-marker\.provider-claude[^}]*background/)
    expect(css).toContain('.project-provider-marker.provider-cursor { color: var(--codex-quota-cursor); }')
    // Mixed-project gradients only paint providers actually present in the row.
    expect(css).toMatch(/provider-shared:where\(\.with-codex\.with-cursor\):not\(:where\(\.with-claude\)\) \{ background: linear-gradient\(90deg, color-mix\(in srgb, var\(--codex-quota-codex\) 8%[^}]*var\(--codex-quota-cursor\) 8%/)
    expect(css).toMatch(/provider-shared:where\(\.with-claude\.with-cursor\):not\(:where\(\.with-codex\)\) \{ background: linear-gradient\(90deg, color-mix\(in srgb, var\(--codex-quota-claude\) 8%[^}]*var\(--codex-quota-cursor\) 8%/)
    expect(css).toMatch(/provider-shared:where\(\.with-codex\.with-claude\.with-cursor\) \{ background: linear-gradient\(90deg,[^}]*quota-codex\) 8%[^}]*quota-claude\) 8%[^}]*quota-cursor\) 8%/)
  })

  it('rejects a regressing task snapshot revision in the Float renderer', async () => {
    const source = floatSnapshot('all')
    source.companion = {
      providers: { codex: true, claude: true, cursor: false },
      revision: 2,
      stateGeneration: 4,
      unreadGeneration: 3,
      claudeQuota: normalizeClaudeQuota(null),
      claudeEnvironment: emptyClaudeEnvironment()
    }
    const listenerBox: { current?: (value: CodexFloatSnapshotV1) => void } = {}
    const { wrapper } = mountFloat(true, source, {
      runtimeIdentity: {
        revision: 'runtime-identity-v2',
        handshake: (expected) => ({
          revision: 'runtime-identity-v2',
          status: 'host-loaded',
          expected,
          actual: expected,
          kernelRevision: expected.kernelRevision,
          taskPackageRevision: expected.taskPackageRevision,
          message: 'loaded'
        })
      },
      onSnapshot: (listener) => { listenerBox.current = listener; return () => undefined }
    })
    await wrapper.vm.$nextTick()
    await flushPromises()
    const currentRevision = source.taskSnapshot!.packageRevision
    expect(wrapper.get('.codex-float-root').attributes('data-companion-revision')).toBe(String(currentRevision))
    const older = { ...source, taskSnapshot: { ...source.taskSnapshot!, packageRevision: currentRevision - 1 } }
    listenerBox.current?.(older)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.codex-float-root').attributes('data-companion-revision')).toBe(String(currentRevision))
    listenerBox.current?.({ ...source, taskSnapshot: undefined })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.codex-float-root').attributes('data-companion-revision')).toBe(String(currentRevision))
  })

  it('keeps Space and Enter owned by the focused child button instead of the task row', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const selector = failed.get('.task-state-button')
    await selector.trigger('keydown', { key: ' ', code: 'Space' })
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(0)
    await selector.trigger('click')
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(1)
    await selector.trigger('click')
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(0)

    const pin = failed.get('.task-inline-actions .action-pin')
    action.mockClear()
    await pin.trigger('keydown', { key: ' ', code: 'Space' })
    await pin.trigger('keydown', { key: 'Enter', code: 'Enter' })
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(0)
    expect(action).not.toHaveBeenCalled()
    await pin.trigger('click')
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith('codex.pin.toggle', { kind: 'task', key: TASK_FAILED })
  })

  it('routes row click, title click and focused Enter through the same exact task-open payload', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const expected = {
      key: TASK_FAILED,
      source: 'card-click'
    }

    await failed.get('.task-open').trigger('click')
    expect(action).toHaveBeenLastCalledWith('codex.task.open', expected)
    action.mockClear()
    await failed.get('.task-title-button').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.open', expected)
    action.mockClear()
    ;(failed.element as HTMLElement).focus()
    await failed.trigger('keydown', { key: 'Enter', code: 'Enter' })
    expect(action).toHaveBeenCalledWith('codex.task.open', expected)
  })

  it('routes every card entry by anonymous key even when its advisory alias is absent', async () => {
    const source = floatSnapshot('all')
    const task = source.conversations.all.find((candidate) => candidate.key === TASK_FAILED)!
    task.actionAlias = ''
    refreshTaskState(source)
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const expected = { key: TASK_FAILED, source: 'card-click' }

    await failed.get('.task-open').trigger('click')
    await failed.get('.task-title-button').trigger('click')
    ;(failed.element as HTMLElement).focus()
    await failed.trigger('keydown', { key: 'Enter', code: 'Enter' })

    expect(action.mock.calls.filter(([id]) => id === 'codex.task.open')).toEqual([
      ['codex.task.open', expected],
      ['codex.task.open', expected],
      ['codex.task.open', expected]
    ])
  })

  it('renders the full-height selector and theme-gradient selection feedback without replacing the task state icon', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    await failed.get('.task-state-button').trigger('click')
    expect(failed.classes()).toContain('selected')
    expect(failed.get('.task-state-button').attributes('aria-pressed')).toBe('true')
    expect(failed.find('.task-state-icon').exists()).toBe(true)
    expect(wrapper.get('.float-selection-mode-bar').text()).toContain('已选 1 项')

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('width: 38px')
    expect(css).toContain('align-self: stretch')
    expect(css).toContain('linear-gradient(118deg')
    expect(css).toContain('var(--codex-accent) 34%')
    expect(css).toContain('var(--codex-running) 28%')
    expect(css).toContain('var(--codex-pending) 30%')
    expect(css).toContain('inset 0 2px 7px')
    expect(css).not.toContain("content: '✓'")
  })

  it('puts pin source feedback on the pin control and gates native and Chats pin actions', async () => {
    vi.useFakeTimers()
    const source = floatSnapshot('all')
    source.conversations.all.find((task) => task.key === TASK_DONE)!.pinSource = 'local'
    refreshTaskState(source)
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const localPin = wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .action-pin`)
    const nativePin = wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"] .action-pin`)
    const plainPin = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .action-pin`)
    expect(localPin.attributes('aria-label')).toContain('来源：EyPc 本地置顶 · 点击取消')
    expect(localPin.attributes('aria-pressed')).toBe('true')
    expect(localPin.get('.action-pin-glyph').classes()).toContain('is-pinned')
    expect(String((localPin.get('.action-pin-glyph').element as HTMLElement).style.transform)).toContain('rotate(-45deg)')
    // A native pin the plugin cannot write is not read-only: a click layers an
    // EyPc local pin on it; only the local order stays unmovable.
    expect(nativePin.attributes('aria-label')).toContain('来源：Codex 置顶 · 点击叠加 EyPc 本地置顶；应用内取消请在应用中操作')
    expect(nativePin.attributes('aria-pressed')).toBe('true')
    expect(nativePin.get('.action-pin-glyph').classes()).toContain('is-pinned')
    expect(nativePin.attributes('aria-disabled')).toBe('false')
    expect(nativePin.attributes('disabled')).toBeUndefined()
    expect(plainPin.attributes('aria-label')).toContain('未置顶 · 点击后由 EyPc 本地置顶')
    expect(plainPin.attributes('aria-pressed')).toBe('false')
    expect(plainPin.get('.action-pin-glyph').classes()).not.toContain('is-pinned')
    action.mockClear()
    await nativePin.trigger('click')
    expect(action).toHaveBeenCalledWith('codex.pin.toggle', { kind: 'task', key: TASK_ACTIVE })
    action.mockClear()
    const nativeRow = wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"]`)
    ;(nativeRow.element as HTMLElement).focus()
    await nativeRow.trigger('keydown', { key: 'ArrowUp', code: 'ArrowUp', altKey: true })
    // Alt+↑ on a provider-only pin has no local order to move.
    expect(action.mock.calls.some(([id]) => id === 'codex.pin.move')).toBe(false)
    await localPin.trigger('focus')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toBe('来源：EyPc 本地置顶 · 点击取消')

    const projects = mountFloat(true, floatSnapshot('projects'))
    await projects.wrapper.vm.$nextTick()
    const chatsPin = projects.wrapper.findAll('.float-project-row').find((row) => row.text().includes('Chats'))!.get('.action-pin')
    expect(chatsPin.attributes('aria-label')).toContain('Chats 分组不可置顶')
    expect(chatsPin.attributes('aria-disabled')).toBe('true')
    projects.action.mockClear()
    await chatsPin.trigger('click')
    expect(projects.action.mock.calls.every(([id]) => id === 'codex.task.focus')).toBe(true)

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    const component = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    expect(css).toContain('.action-pin[data-pin-source="local"]')
    expect(css).toContain('var(--codex-warning)')
    expect(css).toContain('.action-pin[data-pin-source="local"] .action-pin-glyph')
    expect(css).toContain('.action-pin-glyph.is-pinned')
    expect(css).toContain('rotate(-45deg)')
    expect(component).toContain('pinGlyphStyle')
    expect(component).toContain("allowAriaDisabled: element.matches('.action-pin')")
  })

  it('moves only the floating batch bar between top and bottom without changing list flow', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const done = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await failed.get('.task-state-button').trigger('click')
    await done.get('.task-open').trigger('click')

    const scroll = wrapper.get('.float-task-scroll')
    vi.spyOn(scroll.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 400, left: 0, right: 360, width: 360, height: 400, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(done.element, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 350, left: 0, right: 360, width: 360, height: 50, x: 0, y: 300, toJSON: () => ({}) })
    await done.trigger('focus')
    await scroll.trigger('scroll')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-batch-toolbar').classes()).toContain('top')

    vi.spyOn(failed.element, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 70, left: 0, right: 360, width: 360, height: 50, x: 0, y: 20, toJSON: () => ({}) })
    await failed.trigger('focus')
    await scroll.trigger('scroll')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-batch-toolbar').classes()).toContain('bottom')

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('.float-batch-toolbar')
    expect(css).toContain('position: absolute')
  })

  it('shows opaque 200ms help only for status and fixed character controls without native titles', async () => {
    vi.useFakeTimers()
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const status = failed.get('.task-state-button')
    await status.trigger('pointerenter')
    vi.advanceTimersByTime(199)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-action-hint').exists()).toBe(false)
    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('点击切换选择')
    expect(wrapper.get('.float-action-hint').attributes('role')).toBe('tooltip')
    await status.trigger('pointerleave')
    expect(wrapper.find('.float-action-hint').exists()).toBe(false)

    const stoppedArchive = failed.get('.task-inline-actions .action-archive')
    expect(stoppedArchive.attributes('aria-disabled')).toBe('false')
    expect(stoppedArchive.attributes('disabled')).toBeUndefined()
    await stoppedArchive.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('真实归档会话')
    await stoppedArchive.trigger('pointerleave')

    const archive = wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-inline-actions .action-archive`)
    await archive.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('真实归档')
    expect(archive.attributes('title')).toBeUndefined()
    vi.useRealTimers()
  })

  it('archives a stopped task directly from its row after the retained two-step confirmation', async () => {
    const source = floatSnapshot('all')
    const stopped = source.conversations.stopped.find((task) => task.key === TASK_FAILED)!
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const archive = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .task-inline-actions .action-archive`)

    await archive.trigger('click')
    expect(wrapper.find('.float-source-status').exists()).toBe(false)
    expect(wrapper.get('.float-action-hint').text()).toContain('再次操作确认')
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .task-inline-actions .action-archive`).trigger('click')

    expect(action).toHaveBeenCalledWith('codex.tasks.archive', expect.objectContaining({
      items: [{ key: TASK_FAILED, revisionAt: stopped.revisionAt }],
      source: 'archive-button',
      confirmationRecorded: true
    }))
  })

  it('renders locally hidden projects in a recovery group without removing their tasks from other tabs', async () => {
    const source = floatSnapshot('projects')
    const hidden = source.conversations.projects.find((project) => project.key === PROJECT_B)!
    source.conversations.hiddenProjects = [hidden]
    source.conversations.projectSections = source.conversations.projectSections.map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => entry.kind !== 'project' || entry.project.key !== PROJECT_B)
    }))
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.float-project-section').map((section) => section.text())).toContain('已隐藏项目')
    const hiddenRow = wrapper.get(`[data-focus-key="hidden-project:${PROJECT_B}"]`)
    expect(hiddenRow.text()).toContain('任务仍在其他页签')
    expect(source.conversations.all.some((task) => task.projectKey === PROJECT_B)).toBe(true)
    await hiddenRow.get('.project-inline-actions .action-hide').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.project.show', { key: PROJECT_B })
  })

  it('suppresses modified Shift, lets Shift+arrows take over the preview target, and closes on Escape or blur', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    await failed.trigger('pointermove', { clientX: 20, clientY: 20 })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, altKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-shift-preview').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-shift-preview').text()).toContain('执行失败')
    wrapper.get('.float-expanded-card').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', shiftKey: true, bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).classes()).toContain('highlighted')
    expect(wrapper.get('.float-shift-preview').text()).toContain('完成别名')

    await wrapper.get('.float-expanded-card').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-shift-preview').exists()).toBe(false)
    await failed.trigger('pointermove', { clientX: 35, clientY: 35 })
    expect(wrapper.find('.float-shift-preview').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-shift-preview').exists()).toBe(true)
    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-shift-preview').exists()).toBe(false)
  })

  it('supports one-off model selection and empty-thread creation without changing the configured default', async () => {
    const source = floatSnapshot('projects')
    const { wrapper, createThread } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const codeNote = wrapper.findAll('.float-project-row').find((row) => row.text().includes('CodeNote'))!
    await codeNote.get('.project-inline-actions .action-create').trigger('click')
    const select = wrapper.get('.composer-model-field select')
    await select.setValue('gpt-5.3-codex-spark')
    expect(wrapper.get('.composer-model-card').text()).toContain('GPT-5.3 Codex Spark')
    await wrapper.findAll('.float-composer-dialog footer button').find((button) => button.text().includes('仅创建空会话'))!.trigger('click')
    await flushPromises()
    expect(createThread).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'gpt-5.3-codex-spark', mode: 'create-empty', selectionKind: 'manual' }))
    expect(source.newThreadPreferredModel).toBe('gpt-5.6-sol')
  })

  it('gives Quick Jump the top layer over Shift preview while keeping task targets focus-only', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 52, left: 20, right: 100, width: 80, height: 32, x: 20, y: 20, toJSON: () => ({}) })
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    await failed.trigger('pointermove', { clientX: 20, clientY: 20 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-shift-preview').exists()).toBe(true)
    await failed.trigger('keydown', { key: 'f', code: 'KeyF', shiftKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-shift-preview').exists()).toBe(false)
    expect(wrapper.find('.quick-jump-top-layer').exists()).toBe(true)

    await failed.trigger('keydown', { key: 'Enter', code: 'Enter' })
    await wrapper.vm.$nextTick()
    expect(action).not.toHaveBeenCalledWith('codex.task.open', expect.anything())
    expect(action).toHaveBeenCalledWith('codex.quickJump.activate', {
      source: 'manual-quick-jump'
    })
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))
    rect.mockRestore()
  })

  it('refreshes stale quota/model context and requires an explicit second submit', async () => {
    const source = floatSnapshot('all')
    const createThread = vi.fn()
      .mockResolvedValueOnce({
        outcome: 'stale-selection',
        message: '上下文已变化',
        errorCode: 'selection-stale',
        context: {
          quota: source.quota,
          modelCatalog: source.modelCatalog,
          contextFingerprint: 'd'.repeat(64),
          projectFingerprint: source.conversations.sourceFingerprint,
          receivedAt: NOW + 1
        },
        target: {
          projectKey: PROJECT_A,
          projectAlias: 'project-a-alias-2',
          projectName: 'CodeNote',
          projectKind: 'project',
          projectFingerprint: source.conversations.sourceFingerprint
        }
      })
      .mockResolvedValueOnce({ outcome: 'opened', modelId: 'gpt-5.6-sol' })
    const { wrapper } = mountFloat(true, source, { createThread })
    await wrapper.vm.$nextTick()
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`).trigger('keydown', { key: 't', code: 'KeyT', ctrlKey: true })
    await wrapper.get('.float-composer-dialog textarea').setValue('保留草稿')
    const send = wrapper.findAll('.float-composer-dialog footer button').find((button) => button.text().includes('发送并打开'))!
    await send.trigger('click')
    await flushPromises()
    expect(createThread).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.composer-stale').text()).toContain('再次提交')
    expect((wrapper.get('.float-composer-dialog textarea').element as HTMLTextAreaElement).value).toBe('保留草稿')
    await send.trigger('click')
    await flushPromises()
    expect(createThread).toHaveBeenCalledTimes(2)
    expect(createThread.mock.calls[1][0]).toEqual(expect.objectContaining({ contextFingerprint: 'd'.repeat(64) }))
  })

  it('cancels the in-place confirmation on timeout, outside interaction, or tab switch', async () => {
    vi.useFakeTimers()
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).trigger('contextmenu')
    const archive = wrapper.findAll('.float-drawer-actions button').find((button) => button.text().includes('真实归档'))!
    await archive.trigger('click')
    vi.advanceTimersByTime(5_000)
    await archive.trigger('click')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())
    await wrapper.get('.float-search').trigger('pointerdown')
    expect(wrapper.text()).not.toContain('再次操作确认')

    await archive.trigger('click')
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.text()).not.toContain('再次操作确认')
  })

  describe('local opening shortcut repeat regression', () => {
    it.each(['codex.task.openFocused', 'codex.task.openIndex.1', 'codex.quick.open.1'].flatMap(
      (command) => ['root', 'window', 'search'].map((target) => ({ command, target }))
    ))('opens once for $command at $target while a key is held', async ({ command, target }) => {
      const source = floatSnapshot('ongoing')
      source.keybindings = [{ actionId: command, shortcutId: 'Ctrl+J', layer: 'codex', when: 'true', weight: 100, executionOwner: 'float-local' }]
      const { wrapper, action } = mountFloat(true, source)
      await wrapper.vm.$nextTick()
      await wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"]`).trigger('pointermove', { clientX: 10, clientY: 10 })
      const destination = target === 'window' ? window : target === 'search'
        ? wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element
        : wrapper.get('.codex-float-root').element
      for (const repeat of [false, true, true]) {
        destination.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', ctrlKey: true, repeat, bubbles: true, cancelable: true }))
        await wrapper.vm.$nextTick()
      }
      expect(action.mock.calls.filter(([id]) => id === 'codex.task.open')).toHaveLength(1)
    })

    it('still moves focus on repeated arrow navigation', async () => {
      const { wrapper } = mountFloat(true, floatSnapshot('all'))
      await wrapper.vm.$nextTick()
      await wrapper.get(`[data-focus-key="task:${TASK_INPUT}"]`).trigger('pointermove', { clientX: 10, clientY: 10 })
      await wrapper.get('.codex-float-root').trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown', repeat: true })
      expect(wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"]`).classes()).toContain('highlighted')
    })
  })

  describe('water collapse callback regression', () => {
    afterEach(() => { vi.restoreAllMocks() })

    function controlledCollapse() {
      vi.useFakeTimers()
      const frames: FrameRequestCallback[] = []
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
      const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
      const timers = vi.spyOn(globalThis, 'setTimeout')
      let activate!: Parameters<NonNullable<NonNullable<Window['eypcFloat']>['onActivate']>>[0]
      let state!: Parameters<NonNullable<Window['eypcFloat']>['onState']>[0]
      const fixture = mountFloat(true, floatSnapshot(), {
        onActivate: (listener) => { activate = listener; return () => undefined },
        onState: (listener) => { state = listener; return () => undefined }
      })
      const collapse = async () => {
        await fixture.wrapper.get('.codex-float-root').trigger('keydown', { key: 'Escape', code: 'Escape' })
        const timeout = timers.mock.calls.filter(([, delay]) => delay === 200).at(-1)![0] as () => void
        return timeout
      }
      const reopen = async () => {
        activate({})
        state({ expanded: true, pinned: false, resizing: false, resizeCorner: 'bottom-right', expandedSize: null })
        await fixture.wrapper.vm.$nextTick()
      }
      return { ...fixture, frames, cancelFrame, collapse, reopen }
    }

    it.each(['frames', 'timeout'])('sends once after the normal %s boundary', async (mode) => {
      const { collapse, frames, setExpansion } = controlledCollapse()
      await collapse()
      expect(setExpansion).not.toHaveBeenCalled()
      if (mode === 'frames') {
        frames[0]!(0)
        expect(setExpansion).not.toHaveBeenCalled()
        frames[1]!(16)
      } else {
        await vi.advanceTimersByTimeAsync(199)
        expect(setExpansion).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
      }
      await vi.advanceTimersByTimeAsync(200)
      frames.forEach((callback) => callback(400))
      expect(setExpansion.mock.calls).toEqual([[false, false]])
    })

    it.each(['restart', 'reopen', 'unmount'].flatMap(
      (transition) => ['frame', 'timeout'].map((callback) => ({ transition, callback }))
    ))('ignores already queued $callback after $transition', async ({ transition, callback }) => {
      const { wrapper, collapse, reopen, frames, setExpansion, cancelFrame } = controlledCollapse()
      const staleTimeout = await collapse()
      frames[0]!(0)
      const staleFrame = frames[1]!
      if (transition === 'unmount') {
        wrapper.unmount()
        mounted.splice(mounted.indexOf(wrapper), 1)
      } else {
        await reopen()
        if (transition === 'restart') await collapse()
      }
      setExpansion.mockClear()
      if (callback === 'frame') staleFrame(16)
      else staleTimeout()
      expect(setExpansion).not.toHaveBeenCalled()
      expect(cancelFrame).toHaveBeenCalled()
      if (transition === 'restart') {
        // 旧回调不能抢发，也不能清除新一轮的 200ms 兜底。
        await vi.advanceTimersByTimeAsync(199)
        expect(setExpansion).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(setExpansion.mock.calls).toEqual([[false, false]])
      } else {
        await vi.advanceTimersByTimeAsync(200)
        expect(setExpansion).not.toHaveBeenCalled()
      }
    })
  })

  it('honors resolved Codex shortcut bindings and suppresses list commands in the search input', async () => {
    const source = floatSnapshot('all')
    source.keybindings = [{ actionId: 'codex.search.focus', shortcutId: 'Ctrl+K', layer: 'codex', when: "tab == 'codex' && !textInputFocused", weight: 100, executionOwner: 'float-local' }]
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    await wrapper.get('.float-expanded-card').trigger('keydown', { key: 'k', code: 'KeyK', ctrlKey: true })
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element)
    await wrapper.get('input[aria-label="搜索当前 Codex 页签"]').trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element)
  })

  it('keeps one real keyboard cursor and moves from the first row instead of skipping it', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing'))
    await wrapper.vm.$nextTick()
    const focusKeys = () => wrapper.findAll('[data-focus-key]').map((node) => node.attributes('data-focus-key') || '')
    const cursorKey = () => wrapper.findAll('[data-focus-key]').find((node) => node.attributes('tabindex') === '0')?.attributes('data-focus-key') || ''
    const keys = focusKeys()
    expect(keys.length).toBeGreaterThan(1)

    // 挂载后游标就是真实存在的第一项，不再依赖 focusedItem 的隐式回退。
    expect(cursorKey()).toBe(keys[0])
    expect(wrapper.findAll('[data-focus-key][tabindex="0"]')).toHaveLength(1)

    const root = wrapper.get('.codex-float-root')
    await root.trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(cursorKey()).toBe(keys[1])
    await root.trigger('keydown', { key: 'ArrowUp', code: 'ArrowUp' })
    expect(cursorKey()).toBe(keys[0])
    // 不环绕：已在首项时 ArrowUp 停住。
    await root.trigger('keydown', { key: 'ArrowUp', code: 'ArrowUp' })
    expect(cursorKey()).toBe(keys[0])
  })

  it('still dispatches list commands when DOM focus never entered the float root', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing'))
    await wrapper.vm.$nextTick()
    const cursorKey = () => wrapper.findAll('[data-focus-key]').find((node) => node.attributes('tabindex') === '0')?.attributes('data-focus-key') || ''
    const keys = wrapper.findAll('[data-focus-key]').map((node) => node.attributes('data-focus-key') || '')
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    expect(wrapper.element.contains(document.activeElement)).toBe(false)

    // 宿主刚显示子窗口时事件目标是 document.body，永远不会冒泡到根元素。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(cursorKey()).toBe(keys[1])
  })

  it('keeps pinned rows in local order and lets one collapsed badge expand before renumbering visible tasks', async () => {
    const source = floatSnapshot('ongoing')
    const pinKeys = [TASK_DONE, TASK_FAILED]
    const taskSnapshot = source.taskSnapshot!
    const taskInventory = source.taskInventory!
    for (const [index, key] of pinKeys.entries()) {
      const task = taskSnapshot.tasks.find((candidate) => candidate.key === key)!
      Object.assign(task, {
        kind: 'local-pin',
        phase: 'completed',
        dynamicGroup: 'pinned',
        localPin: true,
        unreadKnown: true,
        unread: false,
        displayOrder: index,
        lastQuestionAt: index === 0 ? NOW - 9_000 : NOW + 9_000
      })
    }
    const groups = taskSnapshot.views.groups
    groups.pinned = [...pinKeys]
    groups.input = groups.input.filter((key) => !pinKeys.includes(key))
    groups.active = groups.active.filter((key) => !pinKeys.includes(key))
    groups.stopped = groups.stopped.filter((key) => !pinKeys.includes(key))
    groups.unread = groups.unread.filter((key) => !pinKeys.includes(key))
    groups.completed = groups.completed.filter((key) => !pinKeys.includes(key))
    const cards = new Map(taskInventory.conversations.all.map((task) => [task.key, task]))
    const pinnedSection = taskInventory.conversations.projectSections.find((section) => section.id === 'pinned')!
    pinnedSection.entries = [
      ...pinKeys.map((key) => ({ kind: 'task' as const, task: cards.get(key)!, pinSource: 'local' as const })),
      ...pinnedSection.entries
    ]

    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const visibleKeys = () => wrapper.findAll('.float-task-row').map((row) => row.attributes('data-focus-key'))
    expect(visibleKeys().slice(0, 2)).toEqual([`task:${TASK_DONE}`, `task:${TASK_FAILED}`])

    const initialSearchCount = wrapper.get('.float-search-meta').text()
    const pinnedHeader = wrapper.get('.float-status-section.pinned')
    await pinnedHeader.get('.status-section-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find(`[data-focus-key="task:${TASK_DONE}"]`).exists()).toBe(false)
    expect(wrapper.find(`[data-focus-key="task:${TASK_FAILED}"]`).exists()).toBe(false)
    expect(wrapper.get('.float-search-meta').text()).toBe(initialSearchCount)
    expect(wrapper.findAll('.status-quick-index').map((badge) => badge.text())).toEqual(['1'])
    expect(wrapper.findAll('.task-quick-index')[0]?.text()).toBe('2')

    const root = wrapper.get('.codex-float-root')
    await root.trigger('keydown', { key: '1', code: 'Digit1', altKey: true })
    await wrapper.vm.$nextTick()
    expect(action).not.toHaveBeenCalledWith('codex.task.open', expect.anything())
    expect(wrapper.find('.status-quick-index').exists()).toBe(false)
    expect(wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-quick-index`).text()).toBe('1')
    expect(wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .task-quick-index`).text()).toBe('2')

    await root.trigger('keydown', { key: '2', code: 'Digit2', altKey: true })
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_FAILED, source: 'local-shortcut' }))
  })

  it('enters quick filter mode, numbers visible tasks and opens by Ctrl+number from the search box', async () => {
    const activations: Array<(payload: { requestedAt?: number; command?: 'new-thread' | 'quick' }) => void> = []
    const { wrapper, action, setExpansion } = mountFloat(true, floatSnapshot('ongoing'), {
      onActivate: (listener) => { activations.push(listener); return () => undefined }
    })
    await wrapper.vm.$nextTick()
    // 编号常驻：`Alt+数字` 在展开卡片里始终可用，所以进入筛选模式前编号就该在。
    const restingRows = wrapper.findAll('.float-task-row').filter((row) => row.find('.task-quick-index').exists())
    expect(restingRows.length).toBeGreaterThan(0)
    expect(restingRows[0].find('.task-title-line .task-quick-index').exists()).toBe(true)
    expect(restingRows[0].attributes('aria-label')).toContain('快捷键 Alt+1 打开')
    expect(restingRows[0].attributes('aria-label')).not.toContain('Ctrl+1')

    activations[0]?.({ command: 'quick', requestedAt: NOW })
    await flushPromises()
    const search = wrapper.get('input[aria-label="搜索当前 Codex 页签"]')
    expect(setExpansion).toHaveBeenCalledWith(true, false)
    expect(document.activeElement).toBe(search.element)
    expect(search.attributes('placeholder')).toBe('筛选任务，c-1…0 直接打开')

    const badges = wrapper.findAll('.task-quick-index')
    expect(badges.length).toBeGreaterThan(0)
    expect(badges.length).toBeLessThanOrEqual(10)
    expect(badges.map((node) => node.text())).toEqual(badges.map((_node, index) => String(index + 1)))
    // 编号只落在任务行上，且不改变行布局。
    expect(wrapper.findAll('.float-project-row .task-quick-index')).toHaveLength(0)
    expect(badges[0].attributes('aria-hidden')).toBe('true')

    const numberedRows = wrapper.findAll('.float-task-row').filter((row) => row.find('.task-quick-index').exists())
    expect(numberedRows[0].attributes('aria-label')).toContain('快捷键 Ctrl+1 或 Alt+1 打开')

    // 在搜索框里直接按 Ctrl+1 打开第 1 条，不需要先离开输入框。
    await search.trigger('keydown', { key: '1', code: 'Digit1', ctrlKey: true })
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ source: 'local-shortcut' }))
    // 意图已消费：退出筛选模式，但编号保留给常驻的 Alt 路径。
    await wrapper.vm.$nextTick()
    const afterOpen = wrapper.findAll('.float-task-row').filter((row) => row.find('.task-quick-index').exists())
    expect(afterOpen.length).toBeGreaterThan(0)
    expect(afterOpen[0].attributes('aria-label')).toContain('快捷键 Alt+1 打开')
  })

  it('opens the numbered row with Alt+number without entering filter mode', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('ongoing'))
    await wrapper.vm.$nextTick()
    const root = wrapper.get('.codex-float-root')

    await root.trigger('keydown', { key: '2', code: 'Digit2', altKey: true })
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ source: 'local-shortcut' }))

    // `Alt+0` 是第 10 项；本装配只有少数几行，因此不应该派发任何 open。
    action.mockClear()
    await root.trigger('keydown', { key: '0', code: 'Digit0', altKey: true })
    expect(action).not.toHaveBeenCalledWith('codex.task.open', expect.anything())
  })

  it('gives Alt+F a task-only Quick Jump whose marker opens the conversation instead of only focusing it', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 52, left: 20, right: 100, width: 80, height: 32, x: 20, y: 20, toJSON: () => ({}) })
    const { wrapper, action } = mountFloat(true, floatSnapshot('ongoing'))
    await wrapper.vm.$nextTick()
    const root = wrapper.get('.codex-float-root')

    // 标记层要等一帧才完成定位。
    const settleMarkers = async () => {
      await wrapper.vm.$nextTick()
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
      await wrapper.vm.$nextTick()
    }

    // 普通 F：标记覆盖全部可跳转控件。
    await root.trigger('keydown', { key: 'f', code: 'KeyF' })
    await settleMarkers()
    const allMarkers = wrapper.findAll('.quick-jump-badge').length
    expect(allMarkers).toBeGreaterThan(0)
    await root.trigger('keydown', { key: 'Escape', code: 'Escape' })

    // Alt+F：标记只落在展示出来的会话行上，数量必然更少。
    await root.trigger('keydown', { key: 'f', code: 'KeyF', altKey: true })
    await settleMarkers()
    const taskBadges = wrapper.findAll('.quick-jump-badge')
    expect(taskBadges.length).toBeGreaterThan(0)
    expect(taskBadges.length).toBeLessThan(allMarkers)

    // 激活标记 = 点击标题效果：直接打开该会话，而不是只转移高亮。
    const firstMarker = taskBadges[0].text().trim().toLowerCase()
    await root.trigger('keydown', { key: firstMarker, code: `Key${firstMarker.toUpperCase()}` })
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ source: 'manual-quick-jump' }))
    rect.mockRestore()
  })

  it('lets the session search box navigate and keeps Escape unwinding query before quick mode', async () => {
    const activations: Array<(payload: { requestedAt?: number; command?: 'new-thread' | 'quick' }) => void> = []
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing'), {
      onActivate: (listener) => { activations.push(listener); return () => undefined }
    })
    await wrapper.vm.$nextTick()
    activations[0]?.({ command: 'quick', requestedAt: NOW })
    await flushPromises()

    const search = wrapper.get('input[aria-label="搜索当前 Codex 页签"]')
    const cursorKey = () => wrapper.findAll('[data-focus-key]').find((node) => node.attributes('tabindex') === '0')?.attributes('data-focus-key') || ''
    const keys = wrapper.findAll('[data-focus-key]').map((node) => node.attributes('data-focus-key') || '')
    await search.trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(cursorKey()).toBe(keys[1])

    const numberedRow = () => wrapper.findAll('.float-task-row').find((row) => row.find('.task-quick-index').exists())
    expect(numberedRow()?.attributes('aria-label')).toContain('快捷键 Ctrl+1 或 Alt+1 打开')

    // 筛不到任何任务时编号自然清空——编号永远等于当前可见任务行。
    await search.setValue('zzz-no-such-task')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.task-quick-index')).toHaveLength(0)

    // Escape 先清查询词，再退出筛选模式，最后才轮到收起卡片。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect((search.element as HTMLInputElement).value).toBe('')
    expect(numberedRow()?.attributes('aria-label')).toContain('快捷键 Ctrl+1 或 Alt+1 打开')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    // 退出筛选模式后编号仍在（Alt 常驻），但不再宣称 Ctrl 也能用。
    expect(numberedRow()?.attributes('aria-label')).toContain('快捷键 Alt+1 打开')
    expect(numberedRow()?.attributes('aria-label')).not.toContain('Ctrl+1')
  })

  it('returns to the pre-card focus through Shift+Escape without changing float settings', async () => {
    const { wrapper, returnFocus, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.get('.codex-float-root').trigger('keydown', { key: 'Escape', code: 'Escape', shiftKey: true })
    expect(returnFocus).toHaveBeenCalledTimes(1)
    expect(action).not.toHaveBeenCalledWith('codex.float.hide', expect.anything())
  })

  it('keeps the compact counter and settings preview on the same 20px circular single-digit contract', () => {
    const sharedCss = readFileSync(resolve(process.cwd(), 'src/styles/companion-counter.css'), 'utf8')
    const sharedRule = sharedCss.match(/\.companion-counter-geometry\s*\{([^}]+)\}/)?.[1] || ''
    const floatTemplate = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    const settingsTemplate = readFileSync(resolve(process.cwd(), 'src/pages/CodexPage.vue'), 'utf8')

    expect(sharedCss).toMatch(/--companion-counter-size:\s*20px/)
    expect(sharedCss).toMatch(/--companion-counter-inline-padding:\s*5px/)
    expect(sharedRule).toMatch(/min-width:\s*var\(--companion-counter-size\)/)
    expect(sharedRule).toMatch(/height:\s*var\(--companion-counter-size\)/)
    expect(sharedRule).toMatch(/padding:\s*0 var\(--companion-counter-inline-padding\)/)
    expect(sharedRule).toMatch(/border-radius:\s*999px/)
    expect(sharedCss).not.toContain('ui-monospace')
    expect(sharedCss).not.toContain('font-variant-numeric')
    expect(floatTemplate).toContain('float-counter companion-counter-geometry')
    expect(settingsTemplate).toContain('water-preview-counter companion-counter-geometry')
  })

  it('keeps compact counters directly clickable without hover expansion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { wrapper, action, setExpansion } = mountFloat(false, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const input = wrapper.get('.float-counter.input')
    const active = wrapper.get('.float-counter.active')
    const unread = wrapper.get('.float-counter.unread')
    expect(input.attributes('aria-label')).toBe('待输入 1 · 最新优先，循环打开；新增待输入后重新开始')
    expect(active.attributes('aria-label')).toBe('进行中 1')
    expect(unread.attributes('aria-label')).toBe('未读 1 · 最新优先，连续触发依次打开')

    await input.trigger('click')
    expect(action).toHaveBeenCalledWith('codex.input.open', {})
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await input.trigger('pointerenter', { pointerType: 'touch' })
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-compact-counter-hint').exists()).toBe(false)

    for (const [counter, label] of [
      [input, '待输入 1 · 最新优先，循环打开；新增待输入后重新开始'],
      [active, '进行中 1'],
      [unread, '未读 1 · 最新优先，连续触发依次打开']
    ] as const) {
      await counter.trigger('pointerenter', { pointerType: 'mouse' })
      vi.advanceTimersByTime(199)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.float-compact-counter-hint').exists()).toBe(false)
      vi.advanceTimersByTime(1)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('.float-compact-counter-hint').text()).toBe(label)
      expect(wrapper.find('.float-expanded-card').exists()).toBe(false)
      await counter.trigger('pointerleave', { pointerType: 'mouse' })
      expect(wrapper.find('.float-compact-counter-hint').exists()).toBe(false)
    }
    await unread.trigger('focus')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-compact-counter-hint').text()).toBe('未读 1 · 最新优先，连续触发依次打开')
    await unread.trigger('blur')
    expect(wrapper.find('.float-compact-counter-hint').exists()).toBe(false)
    expect(action).not.toHaveBeenCalledWith('codex.tab.set', { tab: 'input' })
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await active.trigger('click')
    expect(action).not.toHaveBeenCalledWith('codex.tab.set', expect.anything())
    expect(setExpansion).toHaveBeenCalledWith(true, false)
  })

  it('fails closed when no complete Kernel snapshot is available', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const source = floatSnapshot('all')
    source.taskSnapshot = emptyCompanionTaskPackage()

    const compact = mountFloat(false, source).wrapper
    await compact.vm.$nextTick()
    expect(compact.find('.float-counter.input').exists()).toBe(false)
    expect(compact.find('.float-counter.active').exists()).toBe(false)
    expect(compact.find('.float-counter.unread').exists()).toBe(false)

    const expanded = mountFloat(true, source).wrapper
    await expanded.vm.$nextTick()
    expect(expanded.text()).not.toContain('真实进行中')
  })

  it('hides zero counters, caps the visible badge at 99+, and keeps exact accessible counts aligned', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const source = floatSnapshot('all')
    const active = source.conversations.ongoing.find((task) => task.key === TASK_ACTIVE)!
    source.conversations.ongoing = Array.from({ length: 100 }, (_, index) => ({
      ...active,
      key: (index + 100).toString(16).padStart(16, '0'),
      actionAlias: `alias-overflow-${index}`,
      lastTurnStartedAt: NOW - index
    }))
    source.conversations.inputRequired = []
    source.conversations.completedUnread = []
    source.conversations.stopped = []
    source.conversations.completed = []
    source.conversations.hidden = []
    source.conversations.all = [...source.conversations.ongoing]
    refreshTaskState(source)

    const { wrapper } = mountFloat(false, source)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-counter.input').exists()).toBe(false)
    expect(wrapper.find('.float-counter.unread').exists()).toBe(false)
    expect(wrapper.get('.float-counter.active').text()).toBe('99+')
    expect(wrapper.get('.float-counter.active').attributes('aria-label')).toBe('进行中 100')
    expect(wrapper.get('.float-compact').attributes('aria-label')).toContain('100 个进行中')
  })

  it('backs out from detail directly to the original row', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    ;(failed.element as HTMLElement).focus()
    await failed.trigger('contextmenu')
    await wrapper.get('[data-drawer-action-id="task-detail"]').trigger('click')

    expect(wrapper.get('.float-side-panel.detail').text()).toContain('详情')
    expect(wrapper.get('[aria-label="返回更多操作"]').attributes('aria-label')).toBe('返回更多操作')

    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-side-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(failed.element)
  })

  it('uses the same detail-drawer stack for Ctrl arrows without replacing the row focus origin', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    ;(failed.element as HTMLElement).focus()

    await failed.trigger('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true })
    expect(wrapper.find('.float-side-panel.detail').exists()).toBe(true)
    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'ArrowRight', code: 'ArrowRight', ctrlKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-side-panel.drawer').exists()).toBe(true)
    expect(document.activeElement?.getAttribute('data-drawer-action-id')).toBe('task-detail')

    await wrapper.get('[data-drawer-action-id="task-detail"]').trigger('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true })
    expect(wrapper.find('.float-side-panel.detail').exists()).toBe(true)
    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-side-panel').exists()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(failed.element)
  })

  it('cancels drawer confirmation before closing the drawer', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).trigger('contextmenu')
    const archive = wrapper.findAll('.float-drawer-actions button').find((button) => button.text().includes('真实归档'))!
    await archive.trigger('click')
    expect(wrapper.find('.float-source-status').exists()).toBe(false)
    expect(wrapper.get('.float-action-hint').text()).toContain('再次操作确认')

    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-side-panel.drawer').exists()).toBe(true)
    expect(wrapper.find('.float-action-hint').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('再次操作确认')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())

    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-side-panel').exists()).toBe(false)
  })

  it('keeps archive confirmation through revision-only refresh and dispatches the latest revision', async () => {
    const source = floatSnapshot('all')
    const snapshotListener: { current: ((value: CodexFloatSnapshotV1) => void) | null } = { current: null }
    const { wrapper, action } = mountFloat(true, source, {
      onSnapshot: (listener) => {
        snapshotListener.current = listener
        return () => undefined
      }
    })
    await wrapper.vm.$nextTick()
    const firstRow = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await firstRow.find('button[aria-label^="归档"]').trigger('click')
    expect(wrapper.text()).toContain('再次操作确认')

    const next = floatSnapshot('all')
    const nextTask = next.conversations.completedUnread.find((task) => task.key === TASK_DONE)!
    nextTask.revisionAt += 1
    refreshTaskState(next)
    snapshotListener.current?.(next)
    await wrapper.vm.$nextTick()

    const refreshedRow = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await refreshedRow.find('button[aria-label^="确认归档"]').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.tasks.archive', expect.objectContaining({
      items: [{ key: TASK_DONE, revisionAt: nextTask.revisionAt }],
      operationId: expect.stringMatching(/^archive-ui-/),
      source: 'archive-button',
      confirmationRecorded: true
    }))
    const created = action.mock.calls.find(([id, args]) => id === 'codex.archive.confirmation'
      && args !== null
      && typeof args === 'object'
      && 'stage' in args
      && args.stage === 'created')?.[1] as Record<string, unknown> | undefined
    const confirmed = action.mock.calls.find(([id, args]) => id === 'codex.archive.confirmation'
      && args !== null
      && typeof args === 'object'
      && 'stage' in args
      && args.stage === 'confirmed')?.[1] as Record<string, unknown> | undefined
    expect(created?.operationId).toMatch(/^archive-ui-/)
    expect(confirmed?.operationId).toBe(created?.operationId)
  })

  it('cancels archive confirmation when the terminal epoch changes', async () => {
    const source = floatSnapshot('all')
    const snapshotListener: { current: ((value: CodexFloatSnapshotV1) => void) | null } = { current: null }
    const { wrapper, action } = mountFloat(true, source, {
      onSnapshot: (listener) => {
        snapshotListener.current = listener
        return () => undefined
      }
    })
    await wrapper.vm.$nextTick()
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).find('button[aria-label^="归档"]').trigger('click')
    expect(wrapper.text()).toContain('再次操作确认')

    const next = floatSnapshot('all')
    const nextTask = next.conversations.completedUnread.find((task) => task.key === TASK_DONE)!
    nextTask.revisionAt += 1_000
    nextTask.lastTurnStartedAt = (nextTask.lastTurnStartedAt || 0) + 1_000
    nextTask.lastTurnCompletedAt = (nextTask.lastTurnCompletedAt || 0) + 1_000
    nextTask.completionRevision = (nextTask.completionRevision || 0) + 1_000
    refreshTaskState(next)
    snapshotListener.current?.(next)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('再次操作确认')
    const refreshed = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).find('button[aria-label^="归档"]')
    await refreshed.trigger('click')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())
    expect(wrapper.text()).toContain('再次操作确认')
  })

  it('keeps the batch drawer flat and closes it with one Escape', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .task-state-button`).trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-state-button`).trigger('click', { ctrlKey: true })
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(true)

    await wrapper.get('[aria-label^="打开当前多选的完整操作"]').trigger('click')
    expect(wrapper.get('.float-side-panel').text()).toContain('多选操作 · 2 项')
    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true })
    expect(wrapper.find('.float-side-panel.detail').exists()).toBe(false)
    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-side-panel').exists()).toBe(false)
  })

  it('keeps one mouse/keyboard highlight and provides F quick-jump markers for in-card actions', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 52, left: 20, right: 100, width: 80, height: 32, x: 20, y: 20, toJSON: () => ({}) })
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const input = wrapper.get(`[data-focus-key="task:${TASK_INPUT}"]`)
    const active = wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"]`)
    await input.trigger('pointermove', { clientX: 10, clientY: 10 })
    expect(input.classes()).toContain('highlighted')
    await input.trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(active.classes()).toContain('highlighted')
    await input.trigger('pointermove', { clientX: 10, clientY: 10 })
    expect(active.classes()).toContain('highlighted')
    await input.trigger('pointermove', { clientX: 20, clientY: 20 })
    expect(input.classes()).toContain('highlighted')

    await input.trigger('keydown', { key: 'f', code: 'KeyF' })
    await wrapper.vm.$nextTick()
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.quick-jump-top-layer').exists()).toBe(true)
    expect(wrapper.findAll('.quick-jump-badge').length).toBeGreaterThan(3)
    rect.mockRestore()
  })

  it('collapses 220ms after pointer departure or window blur', async () => {
    vi.useFakeTimers()
    const expandedMount = mountFloat(true)
    await expandedMount.wrapper.get('.codex-float-root').trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(219)
    expect(expandedMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    await vi.advanceTimersByTimeAsync(1)
    expect(expandedMount.wrapper.get('.codex-float-root').classes()).not.toContain('expanded')
    expect(expandedMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    await vi.advanceTimersByTimeAsync(200)
    expect(expandedMount.setExpansion).toHaveBeenCalledWith(false, false)

    const blurredMount = mountFloat(true)
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(219)
    expect(blurredMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    await vi.advanceTimersByTimeAsync(1)
    expect(blurredMount.wrapper.get('.codex-float-root').classes()).not.toContain('expanded')
    expect(blurredMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    await vi.advanceTimersByTimeAsync(200)
    expect(blurredMount.setExpansion).toHaveBeenCalledWith(false, false)
  })

  it('shows only server-returned quota windows in the expanded card', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing', quota(false, true)))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.float-quota-chip')).toHaveLength(1)
    expect(wrapper.find('.float-action-slots').exists()).toBe(false)
    expect(wrapper.find('.float-action-picker').exists()).toBe(false)
    expect(wrapper.text()).toContain('周限额')
    expect(wrapper.text()).not.toContain('5 小时限额')

    const dual = mountFloat(true, floatSnapshot('ongoing', quota(true, true))).wrapper
    await dual.vm.$nextTick()
    expect(dual.findAll('.float-quota-chip')).toHaveLength(2)

    const emptyQuota = quota(false, false)
    const compact = buildCodexCompactPresentation({
      quota: emptyQuota,
      compactFields: [],
      conversationInboxEnabled: true,
      taskCounts: { input: 0, active: 0, unread: 0 }
    })
    const ball = mount(CodexWaterBall, { props: { primary: compact.primary, secondary: compact.secondary, stateLabel: compact.stateLabel, label: compact.ariaLabel, appearance: defaults.waterAppearance, colors: defaults.colors } })
    mounted.push(ball)
    expect(ball.find('.codex-water-ball__ring').exists()).toBe(false)
    expect(ball.get('.codex-water-ball__value').text()).toContain('暂无额度')

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('container-type: inline-size')
    expect(css).toContain('@container (max-width: 350px)')
  })

  it('shows the remote Magpie key limit in the collapsed centre and ring with an accessible hover hint', async () => {
    vi.useFakeTimers({ now: NOW })
    const source = {
      ...floatSnapshot('ongoing', { ...emptyCodexQuota('ok'), plan: 'free' }),
      companion: {
        providers: { codex: true, claude: false, cursor: false, orca: false },
        claudeQuota: emptyClaudeQuota(),
        claudeEnvironment: emptyClaudeEnvironment(),
        magpieQuota: {
          status: 'stale' as const, updatedAt: NOW, providers: [{
            provider: 'office/~keys', kind: 'plan',
            windows: [
              { name: 'Tokens today', remaining: 78, amount: 22, limit: 100, unit: 'tokens' },
              { name: 'Spend this week', remaining: 37, amount: 6.3, limit: 10, unit: 'USD', resetsAt: new Date(NOW + 3_600_000).toISOString() }
            ]
          }]
        }
      }
    }
    const { wrapper } = mountFloat(false, source)
    await wrapper.vm.$nextTick()
    const ball = wrapper.get('.codex-water-ball')
    expect(ball.get('.codex-water-ball__value strong').text()).toBe('37%')
    expect(ball.get('.codex-water-ball__percent-source').text()).toBe('Magpie')
    expect(ball.attributes('style')).toContain('--weekly-ring: 37')
    expect(ball.find('.codex-water-ball__liquid').exists()).toBe(false)
    expect(wrapper.get('.float-compact').attributes('aria-label')).toContain('上次数据，可能过期')
    expect(ball.attributes('data-operation-tooltip')).toContain('上限 10 USD')
    await ball.trigger('pointerenter')
    await vi.advanceTimersByTimeAsync(200)
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('已用 6.3 USD')
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('重置')
    expect(ball.attributes('aria-describedby')).toBe('eypc-operation-tooltip')
  })

  it('shows Magpie reset countdowns beside quota without a collapsed row', async () => {
    vi.useFakeTimers({ now: NOW })
    const source = {
      ...floatSnapshot('ongoing', quota(true, true)),
      companion: {
        providers: { codex: true, claude: false, cursor: true },
        claudeQuota: normalizeClaudeQuota(null),
        claudeEnvironment: emptyClaudeEnvironment(),
        magpieQuota: { status: 'ok' as const, updatedAt: NOW, providers: [
          { provider: 'codex', windows: [{ name: '7 days', remaining: 0, resetsAt: new Date(NOW + 5 * 86_400_000).toISOString() }] },
          { provider: 'grok', windows: [{ name: '7 days', remaining: 85, resetsAt: new Date(NOW + 3_600_000).toISOString() }] },
          { provider: 'cursor', windows: [{ name: 'Cursor Models', remaining: 80, resetsAt: new Date(NOW + 10 * 60_000).toISOString() }] }
        ] }
      }
    }
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const row = wrapper.get('.float-quota-text')
    const reset = row.get('.float-magpie-reset-inline')
    expect(reset.findAll('.float-magpie-reset-item').map(item => item.text())).toEqual(['C 5天', 'G 1时', 'U 10分'])
    expect(reset.attributes('aria-label')).toContain('Codex')
    expect(wrapper.find('.float-magpie-reset-bar').exists()).toBe(false)
    expect(reset.attributes('tabindex')).toBeUndefined()
    await reset.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('Cursor')
  })

  it('keeps the quota area on one line and moves titles into hover help', async () => {
    // Pinned to the fixture clock so the reset wording is a real assertion.
    vi.useFakeTimers({ now: NOW })
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing', quota(true, true)))
    await wrapper.vm.$nextTick()

    // One section, one group, no stacked provider block.
    expect(wrapper.findAll('.float-quota-text')).toHaveLength(1)
    expect(wrapper.findAll('.float-quota-group')).toHaveLength(1)
    expect(wrapper.find('.float-quota-group.divided').exists()).toBe(false)

    const chips = wrapper.findAll('.float-quota-chip')
    expect(chips.map((chip) => chip.get('span[aria-hidden="true"]').text())).toEqual(['5h', '周'])
    expect(chips.map((chip) => chip.get('strong').text())).toEqual(['78%', '23%'])

    // The dense row must not carry the long title or the reset line any more,
    // but the accessible name still carries both without a hover.
    const visible = chips[0].findAll('[aria-hidden="true"]').map((node) => node.text()).join(' ')
    expect(visible).not.toContain('5 小时限额')
    expect(visible).not.toContain('重置')
    expect(chips[0].get('.sr-only').text()).toBe('5 小时限额，剩余 78%，1 小时后重置')

    // Codex-only stays byte-identical to the pre-multi-provider row: no caption.
    expect(wrapper.find('.float-quota-provider').exists()).toBe(false)

    await chips[0].trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toBe('5 小时限额 · 1 小时后重置 · 点击立即刷新')

    await chips[0].trigger('pointerleave')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-action-hint').exists()).toBe(false)
  })

  it('marks Spark inside the same row instead of adding a second row', async () => {
    vi.useFakeTimers({ now: NOW })
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing', sparkQuota()))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.float-quota-group')).toHaveLength(1)
    expect(wrapper.findAll('.float-quota-chip').map((chip) => chip.get('span[aria-hidden="true"]').text()))
      .toEqual(['5h', '周', 'S5h', 'S周'])
    expect(wrapper.findAll('.float-quota-chip.spark')).toHaveLength(2)
  })

  it('renders both providers in one row with a caption and a platform tone', async () => {
    vi.useFakeTimers({ now: NOW })
    const snapshot = {
      ...floatSnapshot('ongoing', quota(true, true)),
      companion: {
        providers: { codex: true, claude: true, cursor: false },
        claudeQuota: normalizeClaudeQuota({ five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } }),
        claudeEnvironment: {
          ...emptyClaudeEnvironment(),
          installed: true,
          homeReady: true,
          authenticated: true,
          cliVersion: '2.1.220',
          hooks: 'installed' as const,
          statusline: 'installed' as const
        }
      }
    }
    const { wrapper } = mountFloat(true, snapshot)
    await wrapper.vm.$nextTick()

    // Still one section — the Claude windows join the row rather than stacking.
    expect(wrapper.findAll('.float-quota-text')).toHaveLength(1)
    const groups = wrapper.findAll('.float-quota-group')
    expect(groups).toHaveLength(2)
    expect(groups[0].classes()).toContain('provider-codex')
    expect(groups[1].classes()).toContain('provider-claude')
    expect(groups[1].classes()).toContain('divided')
    expect(groups[1].get('.float-quota-provider').text()).toBe('Claude')
    expect(wrapper.findAll('.float-quota-chip')).toHaveLength(4)

    // Once the row is mixed, help and accessible names name the platform.
    const claudeChip = groups[1].findAll('.float-quota-chip')[0]
    expect(claudeChip.get('.sr-only').text()).toContain('Claude 5 小时限额，剩余 70%')
    expect(claudeChip.attributes('tabindex')).toBe('0')
    expect(claudeChip.attributes('aria-label')).toContain('Claude 5 小时限额，剩余 70%')
    await claudeChip.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('Claude · 5 小时限额')
    await claudeChip.trigger('pointerleave')
    await claudeChip.trigger('focus')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('Claude · 5 小时限额')

    // Platform separation is a token, not a hard-coded brand color.
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('.float-quota-group.provider-codex .float-quota-chip strong { color: var(--codex-quota-codex); }')
    expect(css).toContain('.float-quota-group.provider-claude .float-quota-chip strong { color: var(--codex-quota-claude); }')
    expect(css).toContain('.float-quota-group.provider-claude .float-quota-chip:focus-visible')
  })

  it('keeps every color control in settings and out of the desktop floating card', () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    expect(wrapper.find('.float-water-config-entry').exists()).toBe(false)
    expect(wrapper.find('.float-water-palette-dialog').exists()).toBe(false)
    expect(wrapper.findAll('input[type="color"]')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('水纹配色')
  })

  it('shows tab-specific search counts and the saved dynamic range without counting collapsed rows away', async () => {
    vi.useFakeTimers()
    const source = floatSnapshot('all')
    Object.assign(source, { dynamicTaskWindowHours: 72 })
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const tabs = wrapper.findAll('.float-task-tabs button')
    const count = (index: number) => tabs[index].find('span').text()
    expect(wrapper.get('.float-search-meta').text()).toBe(`近期 3 天 · ${count(0)} 条`)
    expect(wrapper.get('.float-search-meta').attributes('aria-label')).toContain('待继续不受时间限制')
    await wrapper.get('.float-search-field').trigger('pointerenter')
    await vi.advanceTimersByTimeAsync(200)
    expect(document.querySelector('.operation-tooltip')?.textContent).toContain('待继续不受时间限制')
    await wrapper.get('.float-search-field').trigger('pointerleave')
    await wrapper.get('input[data-input-role="codex-search"]').setValue('执行失败')
    expect(wrapper.get('.float-search-meta').text()).toBe('近期 3 天 · 匹配 1 条')
    await wrapper.get('input[data-input-role="codex-search"]').setValue('')
    await tabs[1].trigger('click')
    expect(wrapper.get('.float-search-meta').text()).toBe(`已完成 · ${count(1)} 条`)
    await tabs[2].trigger('click')
    expect(wrapper.get('.float-search-meta').text()).toBe(`已隐藏 · ${count(2)} 条`)
    await tabs[3].trigger('click')
    expect(wrapper.get('.float-search-meta').text()).toBe(`项目 · ${count(3)} 个`)
    expect(wrapper.get('.float-search-meta').text()).not.toContain('30 天')
  })

  it('moves inventory count into the search field and uses a hover ! for stale snapshots', async () => {
    const verified = mountFloat(true, floatSnapshot('all'))
    await verified.wrapper.vm.$nextTick()
    expect(verified.wrapper.get('input[data-input-role="codex-search"]').attributes('placeholder')).toBe('别名|任务|项目')
    expect(verified.wrapper.get('.float-search-meta').text()).toMatch(/^动态 · \d+ 条$/)
    expect(verified.wrapper.find('.float-source-status').exists()).toBe(false)
    expect(verified.wrapper.find('.float-search-glyph.alert').exists()).toBe(false)

    const staleSource = floatSnapshot('all')
    staleSource.conversations.status = 'stale'
    refreshTaskState(staleSource)
    const stale = mountFloat(true, staleSource)
    await stale.wrapper.vm.$nextTick()
    expect(stale.wrapper.get('.float-search-glyph.alert').text()).toBe('!')
    expect(stale.wrapper.get('.float-search-glyph.alert').attributes('aria-label')).toContain('数据已过期 · 展示上一份已验证快照')
    expect(stale.wrapper.get('.float-search-meta').text()).toMatch(/^动态 · \d+ 条$/)
    expect(stale.wrapper.find('.float-source-status').exists()).toBe(false)
    expect(stale.wrapper.find('.float-search-meta').text()).not.toContain('数据已过期')
  })

})


describe('full-width compact lower drag area', () => {
  it('records compact hover gating and expansion intent without changing the gesture decision', async () => {
    const source = floatSnapshot()
    source.style = 'water'
    const observeInteraction = vi.fn(() => true)
    const { wrapper, setExpansion } = mountFloat(false, source, { observeInteraction })
    await wrapper.vm.$nextTick()
    const compact = wrapper.get('.float-compact')
    vi.spyOn(compact.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 94, 94))
    await compact.trigger('pointerenter', { pointerType: 'touch', clientX: 45, clientY: 10 })
    expect(observeInteraction).toHaveBeenCalledWith('compact-hover', expect.objectContaining({ blocked: true, reason: 'touch' }))
    expect(setExpansion).not.toHaveBeenCalled()
    await compact.trigger('pointermove', { pointerType: 'mouse', clientX: 45, clientY: 40 })
    expect(observeInteraction).toHaveBeenCalledWith('compact-hover', expect.objectContaining({ blocked: true, reason: 'outside-zone' }))
    expect(setExpansion).not.toHaveBeenCalled()
    await compact.trigger('pointermove', { pointerType: 'mouse', clientX: 45, clientY: 10 })
    expect(observeInteraction).toHaveBeenCalledWith('expansion-intent', expect.objectContaining({ blocked: false, reason: 'ready', nextExpanded: true }))
    expect(setExpansion).toHaveBeenCalledWith(true, false)
  })

  it.each(['water', 'card', 'edge'] as const)('drags from %s bottom padding/corners without consulting circular button geometry', async (style) => {
    const source = floatSnapshot()
    source.style = style
    const { wrapper, setExpansion } = mountFloat(false, source)
    await wrapper.vm.$nextTick()
    const zone = wrapper.get('.float-compact-drag-zone')
    const compactRect = wrapper.find('.float-compact').exists() ? vi.spyOn(wrapper.get('.float-compact').element, 'getBoundingClientRect') : null
    const width = style === 'water' ? 94 : style === 'card' ? 166 : 40
    for (const x of [0, width / 2, width - 1]) {
      await zone.trigger('pointerdown', { button: 0, pointerId: 1, clientX: x, clientY: 103, screenX: x, screenY: 103 })
      await zone.trigger('pointermove', { pointerId: 1, screenX: x + 10, screenY: 113 })
      await zone.trigger('pointerup', { pointerId: 1 })
      await zone.trigger('click', { detail: 1 })
    }
    expect(window.eypcFloat!.dragStart).toHaveBeenCalledTimes(3)
    expect(window.eypcFloat!.dragMove).toHaveBeenCalledTimes(3)
    expect(window.eypcFloat!.dragEnd).toHaveBeenCalledTimes(3)
    expect(setExpansion).not.toHaveBeenCalled()
    if (compactRect) expect(compactRect).not.toHaveBeenCalled()
    const starts = vi.mocked(window.eypcFloat!.dragStart).mock.calls.length
    for (const badge of wrapper.findAll('.float-counter, .edge-counters button')) await badge.trigger('pointerdown', { button: 0, pointerId: 2 })
    expect(window.eypcFloat!.dragStart).toHaveBeenCalledTimes(starts)
  })
  it('keeps the collapsed water shell clear and the list markers quiet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    const app = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    expect(css).toContain('.codex-float-root.water:not(.expanded) .float-compact.water-surface')
    expect(css).toContain('.float-compact.card-surface')
    expect(css).not.toContain('rgba(0, 0, 0, .004)')
    expect(css).not.toContain('#e4163d')
    expect(css).toContain(".float-status-section em::before { content: '· '; }")
    expect(css).toContain('width: 18px;')
    expect(css).not.toContain('background: color-mix(in srgb, var(--task-tone, var(--codex-muted)) 12%')
    expect(app).toContain('index === QUICK_INDEX_LIMIT ? 0 : index')
    expect(app).toContain('class="task-title-line"')
  })
  it('isolates the transparent Float canvas from the shared color scheme', () => {
    const shared = document.createElement('style')
    const float = document.createElement('style')
    shared.textContent = readFileSync(resolve(process.cwd(), 'src/styles/design-system-v7.css'), 'utf8')
    float.textContent = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    document.head.append(shared, float)
    try {
      expect(getComputedStyle(document.documentElement).colorScheme).toBe('normal')
      expect(getComputedStyle(document.documentElement).backgroundColor).toBe('transparent')
      expect(getComputedStyle(document.body).backgroundColor).toBe('transparent')
    } finally {
      shared.remove()
      float.remove()
    }
  })
  it('paints one full-width lower-half grab surface below the counter buttons', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const root = document.createElement('main')
    root.className = 'codex-float-root'
    root.innerHTML = '<div class="float-compact-drag-zone"></div><div class="float-compact-shell"><button class="float-counter">1</button></div>'
    document.body.append(root)
    const zone = getComputedStyle(root.firstElementChild!)
    expect([zone.top, zone.left, zone.right, zone.bottom]).toEqual(['50%', '0px', '0px', '0px'])
    expect(zone.cursor).toBe('grab')
    expect(Number(zone.zIndex)).toBeLessThan(Number(getComputedStyle(root.querySelector('button')!).zIndex))
    root.classList.add('dragging')
    expect(getComputedStyle(root.firstElementChild!).cursor).toBe('grabbing')
    root.remove()
    style.remove()
  })
})

describe('edge rail gestures', () => {
  it('waits 200ms, cancels hover on press, requires 5px and cancels instead of committing', async () => {
    vi.useFakeTimers()
    const source = floatSnapshot()
    source.style = 'edge'
    const cancelInteraction = vi.fn(() => true)
    const { wrapper, setExpansion } = mountFloat(false, source, { cancelInteraction })
    await wrapper.vm.$nextTick()
    const rail = wrapper.get('.companion-edge-line')
    await rail.trigger('pointerenter', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(199)
    expect(setExpansion).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(setExpansion).toHaveBeenLastCalledWith(true, false)
    setExpansion.mockClear()
    await rail.trigger('pointerleave')
    await rail.trigger('pointerdown', { button: 0, screenX: 10, screenY: 10, pointerId: 1 })
    expect(window.eypcFloat!.dragStart).toHaveBeenCalledWith(10, 10)
    await rail.trigger('pointerenter', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(250)
    expect(setExpansion).not.toHaveBeenCalled()
    await rail.trigger('pointermove', { screenX: 13, screenY: 13, pointerId: 1 })
    expect(window.eypcFloat!.dragMove).not.toHaveBeenCalled()
    await rail.trigger('pointermove', { screenX: 13, screenY: 14, pointerId: 1 })
    expect(window.eypcFloat!.dragMove).toHaveBeenCalledExactlyOnceWith(13, 14)
    await rail.trigger('pointercancel', { pointerId: 1 })
    expect(cancelInteraction).toHaveBeenCalledTimes(1)
    expect(window.eypcFloat!.dragEnd).not.toHaveBeenCalled()
  })
  it('continues after lost capture, cancels explicit pointercancel, and unlocks after a host timeout', async () => {
    const source = floatSnapshot()
    source.style = 'edge'
    let receiveState!: (value: CodexFloatWindowState) => void
    const cancelInteraction = vi.fn(() => true)
    const { wrapper } = mountFloat(false, source, { cancelInteraction, onState: (listener) => { receiveState = listener; return () => undefined } })
    await wrapper.vm.$nextTick()
    const rail = wrapper.get('.companion-edge-line')
    await rail.trigger('pointerdown', { button: 0, screenX: 10, screenY: 10, pointerId: 1 })
    await wrapper.trigger('lostpointercapture', { pointerId: 1 })
    expect(cancelInteraction).not.toHaveBeenCalled()
    await rail.trigger('pointermove', { screenX: 20, screenY: 10, pointerId: 1 })
    expect(window.eypcFloat!.dragMove).toHaveBeenCalledWith(20, 10)
    await rail.trigger('pointercancel', { pointerId: 1 })
    expect(cancelInteraction).toHaveBeenCalledTimes(1)
    expect(window.eypcFloat!.dragEnd).not.toHaveBeenCalled()
    await rail.trigger('pointerdown', { button: 0, screenX: 10, screenY: 10, pointerId: 2 })
    const state = { expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null }
    receiveState({ ...state, dragging: true })
    receiveState({ ...state, dragging: false })
    await rail.trigger('pointerdown', { button: 0, screenX: 10, screenY: 10, pointerId: 3 })
    expect(window.eypcFloat!.dragStart).toHaveBeenCalledTimes(3)
  })
  it('starts despite native capture rejection and finishes through window-level events', async () => {
    const source = floatSnapshot()
    source.style = 'edge'
    const { wrapper } = mountFloat(false, source)
    await wrapper.vm.$nextTick()
    Object.defineProperty(wrapper.element, 'setPointerCapture', { configurable: true, value: () => { throw new DOMException('No active pointer', 'NotFoundError') } })
    const rail = wrapper.get('.companion-edge-line')
    await rail.trigger('pointerdown', { button: 0, screenX: 10, screenY: 10, pointerId: 1 })
    expect(window.eypcFloat!.dragStart).toHaveBeenCalledWith(10, 10)
    window.dispatchEvent(new PointerEvent('pointermove', { screenX: 20, screenY: 25, pointerId: 1, buttons: 1 }))
    expect(window.eypcFloat!.dragMove).toHaveBeenCalledWith(20, 25)
    window.dispatchEvent(new PointerEvent('pointerup', { screenX: 20, screenY: 25, pointerId: 1 }))
    expect(window.eypcFloat!.dragEnd).toHaveBeenCalledTimes(1)
  })
  it('retains the rail through expansion, pins independently, and allows the header blank area to drag', async () => {
    const source = floatSnapshot()
    source.style = 'edge'
    let receiveState!: (value: CodexFloatWindowState) => void
    const { wrapper, setExpansion } = mountFloat(false, source, { onState: (listener) => { receiveState = listener; return () => undefined } })
    await wrapper.vm.$nextTick()
    const line = wrapper.get('.companion-edge-line').element
    receiveState({ expanded: true, pinned: false, resizing: false, resizeCorner: null, expandedSize: null, edge: 'top' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.companion-edge-line').element).toBe(line)
    const pin = wrapper.get('[aria-label="固定预览"]')
    await pin.trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(window.eypcFloat!.dragStart).not.toHaveBeenCalled()
    await pin.trigger('click')
    expect(setExpansion).toHaveBeenLastCalledWith(true, true)
    await wrapper.get('.float-edge-preview-header span').trigger('pointerdown', { button: 0, screenX: 10, screenY: 20, pointerId: 2 })
    expect(window.eypcFloat!.dragStart).toHaveBeenCalledWith(10, 20)
  })
  it('collapses after 220ms outside the preview and holds when pinned', async () => {
    vi.useFakeTimers()
    const source = floatSnapshot()
    source.style = 'edge'
    let receiveState!: (value: CodexFloatWindowState) => void
    const { wrapper, setExpansion } = mountFloat(true, source, { onState: (listener) => { receiveState = listener; return () => undefined } })
    await wrapper.vm.$nextTick()
    const card = wrapper.get('.float-expanded-card')
    await card.trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(219)
    expect(setExpansion).not.toHaveBeenCalled()
    await card.trigger('pointerenter')
    await vi.advanceTimersByTimeAsync(10)
    expect(setExpansion).not.toHaveBeenCalled()
    await card.trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(220)
    expect(setExpansion).toHaveBeenLastCalledWith(false, false)
    setExpansion.mockClear()
    receiveState({ expanded: true, pinned: true, resizing: false, resizeCorner: null, expandedSize: null })
    await card.trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(300)
    expect(setExpansion).not.toHaveBeenCalled()
  })
  it('isolates counter gestures, cancels release outside, and keeps unavailable quota distinct from zero', async () => {
    const wrapper = mount(CompanionEdgeRail, { props: { edge: 'right', codexPercent: 0, claudePercent: null, counts: { input: 100, active: 2, unread: 0 } } })
    mounted.push(wrapper)
    expect(wrapper.get('.companion-edge-line').attributes('aria-label')).toContain('Codex 周额度 0%')
    expect(wrapper.get('.companion-edge-line').attributes('aria-label')).toContain('Claude 周额度 暂无数据')
    expect(wrapper.findAll('.edge-counters button')).toHaveLength(2)
    const badge = wrapper.get('button.input')
    expect(badge.text()).toBe('99+')
    await badge.trigger('pointerdown')
    await badge.trigger('pointerleave')
    await badge.trigger('click', { detail: 1 })
    expect(wrapper.emitted('action')).toBeUndefined()
    await badge.trigger('pointerdown')
    await badge.trigger('click', { detail: 1 })
    expect(wrapper.emitted('action')).toEqual([['input']])
  })
})


it('renders a native auto-docked strip before the newer quota snapshot and suppresses immediate hover', async () => {
  vi.useFakeTimers()
  const source = floatSnapshot()
  source.style = 'water'
  source.baseRevision = 10
  let receiveState: ((state: import('../../src/float-env').CodexFloatWindowState) => void) | undefined
  const { wrapper, setExpansion } = mountFloat(false, source, { onState: (listener) => { receiveState = listener; return () => undefined } })
  receiveState!({ style: 'edge', edge: 'top', expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null,
    placement: { bounds: { x: 400, y: 32, width: 120, height: 40 }, rail: { x: 0, y: 0, width: 120, height: 8 }, slot: { x: 0, y: 0, width: 120, height: 40 }, panel: null } })
  await wrapper.vm.$nextTick()
  expect(wrapper.find('.float-compact-shell').exists()).toBe(false)
  const rail = wrapper.get('.companion-edge-line')
  expect(wrapper.classes()).toContain('edge')
  await rail.trigger('pointerenter', { pointerType: 'mouse' })
  await vi.advanceTimersByTimeAsync(250)
  expect(setExpansion).not.toHaveBeenCalled()
  await rail.trigger('pointerleave')
  await rail.trigger('pointerenter', { pointerType: 'mouse' })
  await vi.advanceTimersByTimeAsync(200)
  expect(setExpansion).toHaveBeenLastCalledWith(true, false)
})


it('groups real quota readings and separate status-dot buttons in the micro readout', async () => {
  const wrapper = mount(CompanionEdgeRail, { props: { edge: 'right', codexPercent: 19, claudePercent: 37, counts: { input: 0, active: 1, unread: 100 } } })
  mounted.push(wrapper)
  expect(wrapper.findAll('.edge-reading strong').map((node) => node.text())).toEqual(['19', '37'])
  expect(wrapper.get('.edge-reading.codex').attributes('aria-label')).toBe('Codex 周额度 19%')
  expect(wrapper.get('.edge-readout-body').findAll('button')).toHaveLength(2)
  expect(wrapper.findAll('.edge-counter-dot')).toHaveLength(2)
  await wrapper.get('button.active').trigger('click', { detail: 0 })
  expect(wrapper.emitted('action')).toEqual([['active']])
  await wrapper.setProps({ edge: 'top', codexPercent: null })
  expect(wrapper.classes()).toContain('horizontal')
  expect(wrapper.get('.edge-reading.codex strong').text()).toBe('—')
  expect(wrapper.get('button.unread span').text()).toBe('99+')
})
