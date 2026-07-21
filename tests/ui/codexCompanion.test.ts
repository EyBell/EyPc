// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexWaterBall from '../../src/components/CodexWaterBall.vue'
import FloatApp from '../../src/FloatApp.vue'
import CodexPage from '../../src/pages/CodexPage.vue'
import {
  defaultCodexSettings,
  projectConversations,
  type CodexHostProject,
  type CodexHostThread,
  type CodexQuotaSnapshotV1
} from '../../src/domain/codex'
import { buildCodexCompactPresentation } from '../../src/domain/codexPresentation'
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
    hostThread({ key: TASK_FAILED, name: '执行失败', projectKey: PROJECT_A, projectName: 'CodeNote', lastTurnStatus: 'failed', lastTurnStartedAt: NOW - 2_000, updatedAt: NOW - 1_500 }),
    hostThread({ key: TASK_DONE, name: '原始完成标题', projectKey: PROJECT_A, projectName: 'CodeNote', lastTurnStatus: 'completed', lastTurnStartedAt: NOW - 3_000, lastTurnCompletedAt: NOW - 2_500, updatedAt: NOW - 2_000 }),
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
  return {
    version: 2,
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
    conversations: conversation(activeTab),
    taskArchive: { key: '', status: 'idle', message: '' },
    projectArchive: { key: '', status: 'idle', message: '' },
    timeWindowDays: 30,
    generatedAt: NOW
  }
}

function mountFloat(expanded: boolean, source = floatSnapshot(), overrides: Partial<NonNullable<Window['eypcFloat']>> = {}) {
  const action = vi.fn(() => true)
  const setExpansion = vi.fn(() => true)
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
    action,
    createThread,
    reopenThread,
    openBlank,
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
  return { wrapper, action, setExpansion, createThread, reopenThread, openBlank }
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  delete window.eypcFloat
  document.body.innerHTML = ''
})

describe('Codex Companion V3 UI contract', () => {
  it('shows Weekly-only 23% with a complete Weekly ring and no false 5h label', () => {
    const quotaValue = quota(false, true)
    const compact = buildCodexCompactPresentation({
      quota: quotaValue,
      compactFields: [],
      conversationInboxEnabled: true,
      conversations: { ongoingCount: 0, unknownCount: 0, attentionCount: 0, pendingCount: 0 }
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
      conversations: { ongoingCount: 0, unknownCount: 0, attentionCount: 0, pendingCount: 0 }
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
      conversations: { ongoingCount: 0, unknownCount: 0, attentionCount: 0, pendingCount: 0 }
    })
    const wrapper = mount(CodexWaterBall, {
      props: { primary: presentation.primary, secondary: presentation.secondary, stateLabel: '', label: presentation.ariaLabel, appearance: defaults.waterAppearance, colors: defaults.colors }
    })
    mounted.push(wrapper)
    expect(wrapper.get('.codex-water-ball__spark').text()).toBe('S')
    expect(wrapper.get('.codex-water-ball__value strong').text()).toBe('64%')
    expect(wrapper.get('.codex-water-ball').attributes('style')).toContain('--weekly-ring: 52')
  })

  it('places six tabs at the top, defaults to dynamic, and orders its status sections by priority', async () => {
    const { wrapper, action } = mountFloat(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-expanded-card').element.firstElementChild?.classList.contains('float-task-tabs')).toBe(true)
    expect(wrapper.findAll('.float-task-tabs [role="tab"]').map((button) => button.text().replace(/\s+/g, ' ').trim())).toEqual([
      '全部 5', '待输入 1', '动态 4', '已完成 1', '已隐藏 1', '项目 4'
    ])
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('动态')
    expect(wrapper.findAll('.float-status-section').map((section) => section.text().replace(/\s+/g, ' ').trim())).toEqual([
      '待输入1', '当前动态2', '已完成未查看1'
    ])
    expect(wrapper.find('.float-header').exists()).toBe(false)
    expect(wrapper.find('[aria-label="打开 Codex Companion 配置"]').exists()).toBe(false)

    await wrapper.findAll('[role="tab"]')[4].trigger('click')
    expect(action).toHaveBeenCalledWith('codex.tab.set', { tab: 'hidden' })
    expect(wrapper.findAll('.float-task-row')).toHaveLength(1)
    expect(wrapper.text()).toContain('隐藏的 Chats 会话')
  })

  it('shares one search box per runtime, matches aliases/original/project names, and keeps project-match children', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const search = wrapper.get('input[aria-label="搜索当前 Codex 页签"]')
    await search.setValue('完成别名')
    expect(wrapper.findAll('.float-task-row')).toHaveLength(1)
    expect(wrapper.text()).toContain('完成别名')
    expect(wrapper.text()).toContain('原名：原始完成标题')

    await wrapper.findAll('[role="tab"]')[5].trigger('click')
    await search.setValue('CodeNote')
    expect(wrapper.text()).toContain('真实进行中')
    expect(wrapper.text()).toContain('执行失败')
    expect(wrapper.text()).toContain('完成别名')
    expect(wrapper.text()).not.toContain('隐藏的 Chats 会话')
  })

  it('renders native Pinned, Projects and Chats order without duplicate tasks, including empty projects', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('projects'))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.float-project-section').map((item) => item.text())).toEqual(['Pinned', 'Projects', 'Chats'])
    const text = wrapper.text()
    expect(text.indexOf('CodeNote')).toBeLessThan(text.indexOf('EyTodo'))
    expect(text.indexOf('EyTodo')).toBeLessThan(text.indexOf('Chats'))
    expect(wrapper.findAll('.float-task-row').filter((row) => row.text().includes('真实进行中'))).toHaveLength(1)
    expect(text).toContain('最近 30 天无会话')
    expect(text).toContain('本地')
  })

  it('selects on single click, opens on double click or Enter, auto-advances after Space-add, and confirms Delete in place', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const done = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await failed.trigger('click')
    expect(action).not.toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_FAILED }))
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(1)
    await failed.trigger('dblclick')
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_FAILED }))
    await done.trigger('click', { ctrlKey: true })
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(2)
    const batch = wrapper.get('.float-batch-toolbar')
    expect(batch.get('strong').text()).toBe('已选 2')
    expect(batch.findAll('button').map((button) => button.text())).toEqual(['归', '操', '清'])

    await done.trigger('keydown', { key: 'Delete', code: 'Delete' })
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())
    expect(wrapper.text()).toContain('再次操作确认')
    await done.trigger('keydown', { key: 'Delete', code: 'Delete' })
    expect(action).toHaveBeenCalledWith('codex.tasks.archive', {
      items: expect.arrayContaining([
        expect.objectContaining({ key: TASK_FAILED }),
        expect.objectContaining({ key: TASK_DONE })
      ])
    })

    ;(failed.element as HTMLElement).focus()
    await wrapper.vm.$nextTick()
    await failed.trigger('keydown', { key: ' ', code: 'Space' })
    expect(document.activeElement?.getAttribute('data-focus-key')).toBe(`task:${TASK_DONE}`)
  })

  it('supports Shift ranges and project-header Space selection of visible children', async () => {
    const all = mountFloat(true, floatSnapshot('all')).wrapper
    await all.vm.$nextTick()
    await all.get(`[data-focus-key="task:${TASK_INPUT}"]`).trigger('click')
    await all.get(`[data-focus-key="task:${TASK_DONE}"]`).trigger('click', { shiftKey: true })
    expect(all.findAll('.float-task-row.selected').map((row) => row.attributes('data-focus-key'))).toEqual([
      `task:${TASK_INPUT}`,
      `task:${TASK_ACTIVE}`,
      `task:${TASK_FAILED}`,
      `task:${TASK_DONE}`
    ])

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

  it('keeps low-frequency actions in the right-click drawer and leaves only plus on project rows', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    expect(failed.find('.task-action-rail').exists()).toBe(false)
    await failed.trigger('contextmenu')
    const archive = wrapper.findAll('.float-drawer-actions button').find((button) => button.text().includes('真实归档'))!
    await archive.trigger('click')
    expect(wrapper.text()).toContain('再次操作确认')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())
    await archive.trigger('click')
    expect(action).toHaveBeenCalledWith('codex.tasks.archive', { items: [expect.objectContaining({ key: TASK_FAILED })] })

    await wrapper.get('.float-side-panel [aria-label="关闭"]').trigger('click')
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text().startsWith('项目'))!.trigger('click')
    const chats = wrapper.findAll('.float-project-row').find((row) => row.text().includes('Chats'))!
    expect(chats.findAll('button')).toHaveLength(2)
    expect(chats.find('.project-new-thread').exists()).toBe(true)
    await chats.trigger('contextmenu')
    const chatActions = wrapper.findAll('.float-drawer-actions button')
    expect(chatActions.map((button) => button.text())).toEqual(expect.arrayContaining([
      expect.stringContaining('新建会话'),
      expect.stringContaining('编辑项目别名'),
      expect.stringContaining('全部归档'),
      expect.stringContaining('从 EyPc 移除')
    ]))
    expect(chatActions.find((button) => button.text().includes('本地置顶'))?.attributes('disabled')).toBeDefined()
    expect(chatActions.find((button) => button.text().includes('从 EyPc 移除'))?.attributes('disabled')).toBeDefined()

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('.project-new-thread')
    expect(css).not.toContain('.task-action-rail')
  })

  it('moves only the floating batch bar between top and bottom without changing list flow', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const done = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await failed.trigger('click')
    await done.trigger('click', { ctrlKey: true })

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

  it('closes the batch bar when filtering leaves fewer than two visible selections or when cleared', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`).trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).trigger('click', { ctrlKey: true })
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(true)

    await wrapper.get('[aria-label="清空当前多选"]').trigger('click')
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(false)
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(0)

    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`).trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).trigger('click', { ctrlKey: true })
    await wrapper.get('input[aria-label="搜索当前 Codex 页签"]').setValue('执行失败')
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(false)
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(1)
  })

  it('keeps every ordinary hover tooltip out and opens only the privacy-safe Shift preview', async () => {
    const staleQuota = quota(false, true)
    staleQuota.status = 'stale'
    const compactMount = mountFloat(false, floatSnapshot('ongoing', staleQuota)).wrapper
    await compactMount.vm.$nextTick()
    expect(compactMount.find('.operation-tooltip').exists()).toBe(false)
    expect(compactMount.get('.float-status-dot').attributes('title')).toBeUndefined()

    const expandedMount = mountFloat(true).wrapper
    await expandedMount.vm.$nextTick()
    expect(expandedMount.find('.operation-tooltip').exists()).toBe(false)
    const failed = expandedMount.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    await failed.trigger('pointerenter')
    expect(expandedMount.find('.float-shift-preview').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
    await expandedMount.vm.$nextTick()
    const preview = expandedMount.get('.float-shift-preview')
    expect(preview.text()).toContain('创建时间')
    expect(preview.text()).toContain('首次提问')
    expect(preview.text()).toContain('最近提问')
    expect(preview.text()).toContain('来源')
    expect(preview.text()).not.toContain(TASK_FAILED)
    expect(preview.text()).not.toContain(PROJECT_A)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))
    await expandedMount.vm.$nextTick()
    expect(expandedMount.find('.float-shift-preview').exists()).toBe(false)

    const source = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    expect(source).not.toContain('OperationTooltipLayer')
    expect(source).not.toContain('data-operation-tooltip')
    expect(source).not.toContain(':title=')
    expect(source).not.toContain('float-hover-card')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).not.toContain('.float-hover-card')
    expect(css).toContain('.float-shift-preview')
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

  it('opens the quota-auto composer with Ctrl+T, preserves native composition, and submits prompts only over the transient bridge', async () => {
    const { wrapper, action, createThread } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    await failed.trigger('click')
    await failed.trigger('keydown', { key: 't', code: 'KeyT', ctrlKey: true })
    await wrapper.vm.$nextTick()

    const dialog = wrapper.get('[role="dialog"][aria-modal="true"]')
    expect(dialog.text()).toContain('CodeNote')
    expect(dialog.text()).toContain('GPT-5.6 Sol')
    expect(dialog.text()).toContain('gpt-5.6-sol')
    expect(dialog.text()).toContain('普通额度可用')
    const textarea = dialog.get('textarea[data-input-role="codex-composer"]')
    expect(document.activeElement).toBe(textarea.element)
    await textarea.setValue('只存在内存中的首轮提示词')
    await textarea.trigger('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, isComposing: true })
    expect(createThread).not.toHaveBeenCalled()
    await textarea.trigger('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(createThread).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-5.6-sol',
      mode: 'send-and-open',
      selectionKind: 'auto',
      prompt: '只存在内存中的首轮提示词',
      target: { projectKey: PROJECT_A, projectAlias: 'project-a-alias', projectFingerprint: 'a'.repeat(64) }
    }))
    expect(wrapper.find('.float-composer-dialog').exists()).toBe(false)
    expect(action.mock.calls.flatMap((call) => call).join(' ')).not.toContain('只存在内存中的首轮提示词')
    expect(JSON.stringify(floatSnapshot('all'))).not.toContain('只存在内存中的首轮提示词')
  })

  it('supports one-off model selection and empty-thread creation without changing the configured default', async () => {
    const source = floatSnapshot('projects')
    const { wrapper, createThread } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    const codeNote = wrapper.findAll('.float-project-row').find((row) => row.text().includes('CodeNote'))!
    await codeNote.get('.project-new-thread').trigger('click')
    const select = wrapper.get('.composer-model-field select')
    await select.setValue('gpt-5.3-codex-spark')
    expect(wrapper.get('.composer-model-card').text()).toContain('GPT-5.3 Codex Spark')
    await wrapper.findAll('.float-composer-dialog footer button').find((button) => button.text().includes('仅创建空会话'))!.trigger('click')
    await flushPromises()
    expect(createThread).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'gpt-5.3-codex-spark', mode: 'create-empty', selectionKind: 'manual' }))
    expect(source.newThreadPreferredModel).toBe('gpt-5.6-sol')
  })

  it('traps focus inside the composer, restores its trigger on Escape, and suspends Quick Jump', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 52, left: 20, right: 100, width: 80, height: 32, x: 20, y: 20, toJSON: () => ({}) })
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    ;(failed.element as HTMLElement).focus()
    await failed.trigger('keydown', { key: 't', code: 'KeyT', ctrlKey: true })
    await wrapper.vm.$nextTick()
    const dialog = wrapper.get('.float-composer-dialog')
    const close = dialog.get('[aria-label="取消新建会话"]')
    ;(close.element as HTMLElement).focus()
    await close.trigger('keydown', { key: 'Tab', code: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(dialog.findAll('footer button').at(-1)!.element)

    await dialog.get('textarea').trigger('keydown', { key: 'f', code: 'KeyF' })
    expect(wrapper.find('.quick-jump-top-layer').exists()).toBe(false)
    await dialog.get('textarea').trigger('keydown', { key: 'Escape', code: 'Escape' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.float-composer-dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(failed.element)
    rect.mockRestore()
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
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`).trigger('contextmenu')
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

  it('keeps compact counters directly clickable without hover expansion', async () => {
    vi.useFakeTimers()
    const { wrapper, action, setExpansion } = mountFloat(false, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-label="1 个待输入任务"]').text()).toBe('1')
    expect(wrapper.get('[aria-label="2 个当前动态任务"]').text()).toBe('2')
    expect(wrapper.get('[aria-label="1 个已完成未查看任务"]').text()).toBe('1')

    await wrapper.get('[aria-label="1 个待输入任务"]').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_INPUT }))
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await wrapper.get('[aria-label="1 个待输入任务"]').trigger('pointerenter')
    vi.advanceTimersByTime(250)
    expect(action).not.toHaveBeenCalledWith('codex.tab.set', { tab: 'input' })
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await wrapper.get('[aria-label="2 个当前动态任务"]').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.tab.set', { tab: 'ongoing' })
    expect(setExpansion).toHaveBeenCalledWith(true, false)
  })

  it('separates single and batch drawers, opens them by right click, and routes arrows inside the drawer', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    await failed.trigger('contextmenu')
    expect(wrapper.get('.float-side-panel').text()).toContain('单项完整操作')
    expect(wrapper.get('.float-drawer-actions').text()).toContain('打开任务')
    expect(wrapper.get('.float-drawer-actions').text()).toContain('编辑别名')
    await wrapper.get('.float-side-panel [aria-label="关闭"]').trigger('click')

    await failed.trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`).trigger('click', { ctrlKey: true })
    await failed.trigger('contextmenu')
    const drawer = wrapper.get('.float-side-panel')
    expect(drawer.text()).toContain('多选操作 · 2 项')
    expect(drawer.text()).not.toContain('打开任务')
    expect(drawer.text()).not.toContain('编辑别名')
    expect(drawer.text()).toContain('移到已隐藏')

    await drawer.trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(wrapper.findAll('.float-drawer-actions button')[1].classes()).toContain('active')
    await drawer.trigger('keydown', { key: '2', code: 'Digit2', ctrlKey: true })
    expect(action).toHaveBeenCalledWith('codex.task.hide', expect.objectContaining({ key: TASK_FAILED }))
    expect(action).toHaveBeenCalledWith('codex.task.hide', expect.objectContaining({ key: TASK_DONE }))
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

  it('keeps the compact upper half stable and expands only from lower-half hover', async () => {
    vi.useFakeTimers()
    const { wrapper, setExpansion } = mountFloat(false)
    const surface = wrapper.get('.float-compact')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      top: 5,
      right: 99,
      bottom: 99,
      left: 5,
      width: 94,
      height: 94,
      x: 5,
      y: 5,
      toJSON: () => ({})
    })

    await wrapper.get('.codex-float-root').trigger('pointerenter', { clientX: 52, clientY: 20, pointerType: 'mouse' })
    await surface.trigger('pointerenter', { clientX: 52, clientY: 20, pointerType: 'mouse' })
    await surface.trigger('pointermove', { clientX: 52, clientY: 51, pointerType: 'mouse' })
    await surface.trigger('pointermove', { clientX: 52, clientY: 70, pointerType: 'touch' })
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await surface.trigger('pointermove', { clientX: 52, clientY: 70, pointerType: 'mouse' })
    expect(setExpansion).toHaveBeenCalledWith(true, false)

    const explicitMount = mountFloat(false)
    await explicitMount.wrapper.get('.float-compact').trigger('click')
    expect(explicitMount.setExpansion).toHaveBeenCalledWith(true, false)

    const cardSource = floatSnapshot()
    cardSource.style = 'card'
    const cardMount = mountFloat(false, cardSource)
    const cardSurface = cardMount.wrapper.get('.float-compact')
    vi.spyOn(cardSurface.element, 'getBoundingClientRect').mockReturnValue({
      top: 5,
      right: 161,
      bottom: 87,
      left: 5,
      width: 156,
      height: 82,
      x: 5,
      y: 5,
      toJSON: () => ({})
    })
    await cardSurface.trigger('pointerenter', { clientX: 52, clientY: 20, pointerType: 'mouse' })
    expect(cardMount.setExpansion).toHaveBeenCalledWith(true, false)
  })

  it('collapses 100ms after pointer departure', async () => {
    vi.useFakeTimers()
    const expandedMount = mountFloat(true)
    await expandedMount.wrapper.get('.codex-float-root').trigger('pointerleave')
    vi.advanceTimersByTime(99)
    expect(expandedMount.setExpansion).not.toHaveBeenCalledWith(false, false)
    vi.advanceTimersByTime(1)
    expect(expandedMount.setExpansion).toHaveBeenCalledWith(false, false)
  })

  it('shows only server-returned quota windows in the expanded card', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('ongoing', quota(false, true)))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.float-quota-text > div')).toHaveLength(1)
    expect(wrapper.text()).toContain('周限额')
    expect(wrapper.text()).not.toContain('5 小时限额')

    const dual = mountFloat(true, floatSnapshot('ongoing', quota(true, true))).wrapper
    await dual.vm.$nextTick()
    expect(dual.findAll('.float-quota-text > div')).toHaveLength(2)

    const emptyQuota = quota(false, false)
    const compact = buildCodexCompactPresentation({
      quota: emptyQuota,
      compactFields: [],
      conversationInboxEnabled: true,
      conversations: { ongoingCount: 0, unknownCount: 0, attentionCount: 0, pendingCount: 0 }
    })
    const ball = mount(CodexWaterBall, { props: { primary: compact.primary, secondary: compact.secondary, stateLabel: compact.stateLabel, label: compact.ariaLabel, appearance: defaults.waterAppearance, colors: defaults.colors } })
    mounted.push(ball)
    expect(ball.find('.codex-water-ball__ring').exists()).toBe(false)
    expect(ball.get('.codex-water-ball__value').text()).toContain('暂无额度')

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('container-type: inline-size')
    expect(css).toContain('@container (max-width: 350px)')
  })

  it('places the rolling 1-365 day window in the Codex settings tab', async () => {
    const source = floatSnapshot()
    const wrapper = mount(CodexPage, {
      props: {
        snapshot: {
          settings: defaults,
          environment: { version: 1, checking: false, platform: 'macos', runtimeState: 'detected', runtimeSource: 'nvm', processState: 'running', configState: 'loaded', connectionState: 'connected', checkedAt: NOW },
          quota: source.quota,
          config: source.config,
          modelCatalog: source.modelCatalog,
          newThreadContextFingerprint: source.newThreadContextFingerprint,
          conversations: source.conversations,
          refreshing: false,
          floatHost: { displayId: 'screen', expandedWidth: 360, expandedHeight: 0, expandedManual: false }
        }
      }
    })
    mounted.push(wrapper)
    const input = wrapper.get('input[type="number"][min="1"][max="365"]')
    expect((input.element as HTMLInputElement).value).toBe('30')
    await input.setValue('45')
    await input.trigger('change')
    expect(wrapper.emitted('dispatch')).toContainEqual(['codex.settings.update', { settings: { timeWindowDays: 45 } }])

    const modelField = wrapper.findAll('label').find((label) => label.text().includes('新会话普通模型'))!
    expect(modelField.text()).toContain('quota-auto')
    expect(modelField.text()).toContain('GPT-5.6 Sol')
    await modelField.get('select').setValue('gpt-5.6-sol')
    expect(wrapper.emitted('dispatch')).toContainEqual(['codex.settings.update', { settings: { newThreadPreferredModel: 'gpt-5.6-sol' } }])
  })
})
