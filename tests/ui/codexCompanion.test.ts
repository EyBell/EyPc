// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexWaterBall from '../../src/components/CodexWaterBall.vue'
import FloatApp from '../../src/FloatApp.vue'
import CodexPage from '../../src/pages/CodexPage.vue'
import {
  CODEX_TASK_STATE_REVISION,
  defaultCodexSettings,
  projectConversations,
  type CodexHostProject,
  type CodexHostThread,
  type CodexQuotaSnapshotV1
} from '../../src/domain/codex'
import { buildCodexCompactPresentation, buildCodexTaskStatePackage } from '../../src/domain/codexPresentation'
import { contrastRatio } from '../../src/domain/codexAppearance'
import { emptyClaudeEnvironment, normalizeClaudeQuota } from '../../src/domain/claude'
import type { CodexFloatSnapshotV1 } from '../../src/runtime/codexController'

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

function hostThread(input: Partial<CodexHostThread> & Pick<CodexHostThread, 'key' | 'name' | 'projectKey' | 'projectName'>): CodexHostThread {
  return {
    actionAlias: `alias-${input.key}`,
    status: 'notLoaded',
    activeFlags: [],
    statusAuthority: 'desktop-live',
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

function floatSnapshot(activeTab: 'all' | 'input' | 'ongoing' | 'hidden' | 'completed' | 'projects' = 'ongoing', quotaValue = quota()): CodexFloatSnapshotV1 {
  const conversations = conversation(activeTab)
  return {
    version: 2,
    taskStateRevision: CODEX_TASK_STATE_REVISION,
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
    taskState: buildCodexTaskStatePackage(conversations, { sourceRevision: CODEX_TASK_STATE_REVISION, now: NOW }),
    conversations,
    taskArchive: { key: '', status: 'idle', message: '' },
    projectArchive: { key: '', status: 'idle', message: '' },
    timeWindowDays: 30,
    generatedAt: NOW
  }
}

function refreshTaskState(source: CodexFloatSnapshotV1): void {
  source.taskState = buildCodexTaskStatePackage(source.conversations, {
    sourceRevision: source.taskStateRevision,
    now: NOW
  })
}

function mountFloat(expanded: boolean, source = floatSnapshot(), overrides: Partial<NonNullable<Window['eypcFloat']>> = {}) {
  const action = vi.fn(() => true)
  const setExpansion = vi.fn(() => true)
  const returnFocus = vi.fn(() => true)
  const createThread = vi.fn(async () => ({ outcome: 'opened' as const, modelId: 'gpt-5.6-sol' }))
  const reopenThread = vi.fn(async () => ({ outcome: 'opened' as const }))
  const openBlank = vi.fn(async () => ({ outcome: 'opened' as const }))
  window.eypcFloat = {
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

describe('Codex Companion V3 UI contract', () => {
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
    expect(source).toContain('默认 24 小时')
  })

  it('uses custom whole-second inputs for quota refresh and full reconciliation', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/CodexPage.vue'), 'utf8')
    expect(source).toContain('额度刷新（秒）')
    expect(source).toContain(':value="snapshot.settings.quotaRefreshSeconds"')
    expect(source).toContain('update({ quotaRefreshSeconds:')
    expect(source).toContain('完整校对频率（秒）')
    expect(source).toContain(':value="snapshot.settings.taskRefreshSeconds"')
    expect(source).toContain('update({ taskRefreshSeconds:')
    expect(source).toContain('0 表示仅手动，最大 86400 秒')
    expect(source).not.toContain('snapshot.settings.quotaRefreshMinutes')
  })

  it('surfaces aggregate activity decision diagnostics without an identity field', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/CodexPage.vue'), 'utf8')
    expect(source).toContain("label: '状态裁决'")
    expect(source).toContain('丢弃旧读')
    expect(source).toContain('延后分支终态')
    expect(source).toContain('`保护 ${protectionCount} · 周期 ${decisions.liveEpochOpened}`')
    expect(source).toContain(':data-tip="row.detail"')
    expect(source).toContain('class="codex-diagnostic-copy" :role="diagnosticRole" aria-live="polite" aria-atomic="true"')
    expect(source).not.toContain('class="codex-diagnostic" :class="diagnostic.tone" :role="diagnosticRole"')
    expect(source).not.toContain('role="button"')
    expect(source).not.toContain('tabindex="0" aria-label=')
    expect(source).not.toContain('decisions.task')
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
    const { wrapper, action } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const localPin = wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .action-pin`)
    const nativePin = wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"] .action-pin`)
    const plainPin = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .action-pin`)
    expect(localPin.attributes('aria-label')).toContain('来源：EyPc 本地置顶 · 点击取消')
    expect(nativePin.attributes('aria-label')).toContain('来源：Codex 原生置顶 · 顺序只读')
    expect(nativePin.attributes('aria-disabled')).toBe('true')
    expect(nativePin.attributes('disabled')).toBeUndefined()
    expect(plainPin.attributes('aria-label')).toContain('未置顶 · 点击后由 EyPc 本地置顶')
    action.mockClear()
    await nativePin.trigger('click')
    const nativeRow = wrapper.get(`[data-focus-key="task:${TASK_ACTIVE}"]`)
    ;(nativeRow.element as HTMLElement).focus()
    await nativeRow.trigger('keydown', { key: 'p', code: 'KeyP', ctrlKey: true })
    await nativeRow.trigger('keydown', { key: 'ArrowUp', code: 'ArrowUp', altKey: true })
    expect(action).not.toHaveBeenCalled()
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
    expect(projects.action).not.toHaveBeenCalled()

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('.action-pin[data-pin-source="local"]')
    expect(css).toContain('var(--codex-warning)')
    const component = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    expect(component).toContain("element.getAttribute('aria-disabled') === 'true' && !element.matches('.action-pin')")
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
    expect(stoppedArchive.attributes('aria-disabled')).toBe('true')
    expect(stoppedArchive.attributes('disabled')).toBeUndefined()
    await stoppedArchive.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('会话已停止但未完成')
    await stoppedArchive.trigger('pointerleave')

    const archive = wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-inline-actions .action-archive`)
    await archive.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('真实归档')
    expect(archive.attributes('title')).toBeUndefined()
    vi.useRealTimers()
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

  it('honors resolved Codex shortcut bindings and suppresses list commands in the search input', async () => {
    const source = floatSnapshot('all')
    source.keybindings = [{ actionId: 'codex.search.focus', shortcutId: 'Ctrl+K', layer: 'codex', when: "tab == 'codex' && !textInputFocused", weight: 100 }]
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    await wrapper.get('.float-expanded-card').trigger('keydown', { key: 'k', code: 'KeyK', ctrlKey: true })
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element)
    await wrapper.get('input[aria-label="搜索当前 Codex 页签"]').trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element)
  })

  it('returns to the pre-card focus through Shift+Escape without changing float settings', async () => {
    const { wrapper, returnFocus, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.get('.codex-float-root').trigger('keydown', { key: 'Escape', code: 'Escape', shiftKey: true })
    expect(returnFocus).toHaveBeenCalledTimes(1)
    expect(action).not.toHaveBeenCalledWith('codex.float.hide', expect.anything())
  })

  it('keeps compact counters directly clickable without hover expansion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { wrapper, action, setExpansion } = mountFloat(false, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const input = wrapper.get('.float-counter.input')
    const active = wrapper.get('.float-counter.active')
    const unread = wrapper.get('.float-counter.unread')
    expect(input.attributes('aria-label')).toBe('待输入 1 · 打开第一条')
    expect(active.attributes('aria-label')).toBe('进行中 1')
    expect(unread.attributes('aria-label')).toBe('未读 1 · 打开第一条')

    await input.trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_INPUT }))
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await input.trigger('pointerenter', { pointerType: 'touch' })
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-compact-counter-hint').exists()).toBe(false)

    for (const [counter, label] of [
      [input, '待输入 1 · 打开第一条'],
      [active, '进行中 1'],
      [unread, '未读 1 · 打开第一条']
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
    expect(wrapper.get('.float-compact-counter-hint').text()).toBe('未读 1 · 打开第一条')
    await unread.trigger('blur')
    expect(wrapper.find('.float-compact-counter-hint').exists()).toBe(false)
    expect(action).not.toHaveBeenCalledWith('codex.tab.set', { tab: 'input' })
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await active.trigger('click')
    expect(action).not.toHaveBeenCalledWith('codex.tab.set', expect.anything())
    expect(setExpansion).toHaveBeenCalledWith(true, false)
  })

  it('preserves task counters from a long-lived Controller snapshot by normalizing one degraded package', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const source = floatSnapshot('all')
    delete source.taskStateRevision
    delete source.taskState

    const compact = mountFloat(false, source).wrapper
    await compact.vm.$nextTick()
    expect(compact.get('.float-counter.input').text()).toBe('1')
    expect(compact.get('.float-counter.active').text()).toBe('1')
    expect(compact.get('.float-counter.unread').text()).toBe('1')
    expect(compact.get('.float-compact').attributes('aria-label')).toContain('状态已保留')

    const expanded = mountFloat(true, source).wrapper
    await expanded.vm.$nextTick()
    expect(expanded.text()).toContain('状态已保留')
    expect(expanded.text()).toContain('真实进行中')
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
    expect(wrapper.text()).toContain('再次操作确认')

    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-side-panel.drawer').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('再次操作确认')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())

    await wrapper.get('.float-side-panel').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.find('.float-side-panel').exists()).toBe(false)
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
    vi.advanceTimersByTime(219)
    expect(expandedMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    vi.advanceTimersByTime(1)
    expect(expandedMount.setExpansion).toHaveBeenCalledWith(false, false)

    const blurredMount = mountFloat(true)
    window.dispatchEvent(new Event('blur'))
    vi.advanceTimersByTime(219)
    expect(blurredMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    vi.advanceTimersByTime(1)
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
    expect(wrapper.get('.float-action-hint').text()).toBe('5 小时限额 · 1 小时后重置')

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
        providers: { codex: true, claude: true },
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
    await claudeChip.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.float-action-hint').text()).toContain('Claude · 5 小时限额')

    // Platform separation is a token, not a hard-coded brand color.
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('.float-quota-group.provider-codex .float-quota-chip strong { color: var(--codex-quota-codex); }')
    expect(css).toContain('.float-quota-group.provider-claude .float-quota-chip strong { color: var(--codex-quota-claude); }')
  })

  it('keeps every color control in settings and out of the desktop floating card', () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    expect(wrapper.find('.float-water-config-entry').exists()).toBe(false)
    expect(wrapper.find('.float-water-palette-dialog').exists()).toBe(false)
    expect(wrapper.findAll('input[type="color"]')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('水纹配色')
  })

})
