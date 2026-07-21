// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
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
    config: { version: 1, model: 'gpt-5.6-sol', reasoningEffort: 'high', serviceTier: 'priority', updatedAt: NOW },
    conversations: conversation(activeTab),
    taskArchive: { key: '', status: 'idle', message: '' },
    projectArchive: { key: '', status: 'idle', message: '' },
    timeWindowDays: 30,
    generatedAt: NOW
  }
}

function mountFloat(expanded: boolean, source = floatSnapshot()) {
  const action = vi.fn(() => true)
  const setExpansion = vi.fn(() => true)
  window.eypcFloat = {
    getSnapshot: () => source,
    getState: () => ({ expanded, pinned: false, resizing: false, resizeCorner: expanded ? 'bottom-right' : null, expandedSize: expanded ? { displayId: '1', width: 360, height: 420, manual: false } : null }),
    onSnapshot: () => () => undefined,
    onState: () => () => undefined,
    onActivate: () => () => undefined,
    setExpansion,
    action,
    dragStart: vi.fn(() => true),
    dragMove: vi.fn(() => true),
    dragEnd: vi.fn(() => true),
    resizeStart: vi.fn(() => true),
    resizeMove: vi.fn(() => true),
    resizeEnd: vi.fn(() => true),
    resizeCancel: vi.fn(() => true)
  }
  const wrapper = mount(FloatApp, { attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, action, setExpansion }
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

  it('opens rows directly, selects only from the selector, auto-advances after Space-add, and confirms Delete in place', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const done = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await failed.trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_FAILED }))
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(0)
    await failed.get('.task-select-point').trigger('click')
    await done.get('.task-select-point').trigger('click', { ctrlKey: true })
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
    await all.get(`[data-focus-key="task:${TASK_INPUT}"] .task-select-point`).trigger('click')
    await all.get(`[data-focus-key="task:${TASK_DONE}"] .task-select-point`).trigger('click', { shiftKey: true })
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

  it('uses always-visible short-character action buttons with fixed 32px slots and in-place confirmation', async () => {
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    expect(failed.findAll('.task-action-rail button').map((button) => button.text())).toEqual(['开', '名', '顶', '隐', '归'])
    expect(failed.findAll('.task-action-rail button').at(-1)?.attributes('disabled')).toBeUndefined()

    const active = wrapper.findAll('.float-task-row').find((row) => row.text().includes('真实进行中'))!
    expect(active.findAll('.task-action-rail button').map((button) => button.text())).toEqual(['开', '名', '顶', '隐', '归'])
    expect(active.findAll('.task-action-rail button').at(-1)?.attributes('disabled')).toBeDefined()
    const archive = failed.get('[aria-label="真实归档 Codex 任务"]')
    await archive.trigger('click')
    expect(archive.classes()).toContain('confirming')
    expect(archive.text()).toBe('确')
    expect(action).not.toHaveBeenCalledWith('codex.tasks.archive', expect.anything())
    await archive.trigger('click')
    expect(action).toHaveBeenCalledWith('codex.tasks.archive', { items: [expect.objectContaining({ key: TASK_FAILED })] })

    await wrapper.findAll('[role="tab"]').find((tab) => tab.text().startsWith('项目'))!.trigger('click')
    const chats = wrapper.findAll('.float-project-row').find((row) => row.text().includes('Chats'))!
    const chatActions = chats.findAll('.project-actions button')
    expect(chatActions.map((button) => button.text())).toEqual(['名', '顶', '归', '移'])
    expect(chatActions[1].attributes('disabled')).toBeDefined()
    expect(chatActions[2].attributes('disabled')).toBeUndefined()
    expect(chatActions[3].attributes('disabled')).toBeDefined()

    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toContain('width: 32px')
    expect(css).toContain('position: absolute')
    expect(css).not.toContain('.task-action-rail button::before')
    expect(css).not.toContain('.task-action-rail button:nth-child')
    expect(css).not.toContain('width: 76px')
  })

  it('moves only the floating batch bar between top and bottom without changing list flow', async () => {
    const { wrapper } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const failed = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"]`)
    const done = wrapper.get(`[data-focus-key="task:${TASK_DONE}"]`)
    await failed.get('.task-select-point').trigger('click')
    await done.get('.task-select-point').trigger('click', { ctrlKey: true })

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
    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .task-select-point`).trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-select-point`).trigger('click', { ctrlKey: true })
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(true)

    await wrapper.get('[aria-label="清空当前多选"]').trigger('click')
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(false)
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(0)

    await wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] .task-select-point`).trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-select-point`).trigger('click', { ctrlKey: true })
    await wrapper.get('input[aria-label="搜索当前 Codex 页签"]').setValue('执行失败')
    expect(wrapper.find('.float-batch-toolbar').exists()).toBe(false)
    expect(wrapper.findAll('.float-task-row.selected')).toHaveLength(1)
  })

  it('keeps native and shared tooltips out, but shows opaque task/status/action hints at 500/200ms', async () => {
    vi.useFakeTimers()
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
    vi.advanceTimersByTime(499)
    expect(expandedMount.find('.float-hover-card').exists()).toBe(false)
    vi.advanceTimersByTime(1)
    await expandedMount.vm.$nextTick()
    expect(expandedMount.get('.float-hover-card').text()).toContain('最后提问')

    await failed.get('[aria-label="编辑任务别名"]').trigger('pointerenter')
    vi.advanceTimersByTime(199)
    expect(expandedMount.find('.float-hover-card').exists()).toBe(false)
    vi.advanceTimersByTime(1)
    await expandedMount.vm.$nextTick()
    expect(expandedMount.get('.float-hover-card').text()).toContain('快捷键：F2')

    const source = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    expect(source).not.toContain('OperationTooltipLayer')
    expect(source).not.toContain('data-operation-tooltip')
    expect(source).not.toContain(':title=')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')
    expect(css).toMatch(/\.float-hover-card\s*\{[^}]*background:\s*var\(--codex-surface\)/s)
  })

  it('cancels the in-place confirmation on timeout, outside interaction, or tab switch', async () => {
    vi.useFakeTimers()
    const { wrapper, action } = mountFloat(true, floatSnapshot('all'))
    await wrapper.vm.$nextTick()
    const archive = wrapper.get(`[data-focus-key="task:${TASK_FAILED}"] [aria-label="真实归档 Codex 任务"]`)
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
    source.keybindings = [{ actionId: 'codex.search.focus', shortcutId: 'Ctrl+K', layer: 'codex' }]
    const { wrapper } = mountFloat(true, source)
    await wrapper.vm.$nextTick()
    await wrapper.get('.float-expanded-card').trigger('keydown', { key: 'k', code: 'KeyK', ctrlKey: true })
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element)
    await wrapper.get('input[aria-label="搜索当前 Codex 页签"]').trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' })
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="搜索当前 Codex 页签"]').element)
  })

  it('exposes input/dynamic/unread counts on the compact ball and routes input clicks by cardinality', async () => {
    vi.useFakeTimers()
    const { wrapper, action, setExpansion } = mountFloat(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-label="1 个待输入任务"]').text()).toBe('1')
    expect(wrapper.get('[aria-label="2 个当前动态任务"]').text()).toBe('2')
    expect(wrapper.get('[aria-label="1 个已完成未查看任务"]').text()).toBe('1')

    await wrapper.get('[aria-label="1 个待输入任务"]').trigger('click')
    expect(action).toHaveBeenCalledWith('codex.task.open', expect.objectContaining({ key: TASK_INPUT }))
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)

    await wrapper.get('[aria-label="1 个待输入任务"]').trigger('pointerenter')
    vi.advanceTimersByTime(199)
    expect(setExpansion).not.toHaveBeenCalledWith(true, false)
    vi.advanceTimersByTime(1)
    expect(action).toHaveBeenCalledWith('codex.tab.set', { tab: 'input' })
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

    await failed.get('.task-select-point').trigger('click')
    await wrapper.get(`[data-focus-key="task:${TASK_DONE}"] .task-select-point`).trigger('click', { ctrlKey: true })
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
    expect(wrapper.findAll('.quick-jump-badge').length).toBeGreaterThan(10)
    rect.mockRestore()
  })

  it('expands immediately on body hover and collapses 100ms after leave', async () => {
    vi.useFakeTimers()
    const { wrapper, setExpansion } = mountFloat(false)
    await wrapper.get('.codex-float-root').trigger('pointerenter')
    expect(setExpansion).toHaveBeenCalledWith(true, false)

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
  })
})
