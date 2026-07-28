// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime, type AppRuntimeSnapshot, type WindowActivationDiagnostic, type WindowOperationDebugRecord } from '../../src/runtime/appRuntime'
import WindowsPage from '../../src/pages/WindowsPage.vue'

function snapshotWithDiagnostics(
  windowActivationDiagnostics: WindowActivationDiagnostic[] = [],
  options: { traceEnabled?: boolean; traces?: WindowOperationDebugRecord[] } = {}
): AppRuntimeSnapshot {
  const state = createInitialState(1)
  state.settings.featureConfigs = state.settings.featureConfigs.map((feature) => feature.id === 'windows' ? { ...feature, enabled: true } : feature)
  state.activeTab = 'windows'
  return {
    ...createAppRuntime(state).snapshot(),
    windowActivationDiagnostics,
    windowOperationTraceEnabled: options.traceEnabled === true,
    windowOperationTraces: options.traces || []
  }
}

function diagnostic(overrides: Partial<WindowActivationDiagnostic> = {}): WindowActivationDiagnostic {
  return {
    id: 'window-activation:1:1',
    timestamp: new Date('2026-07-27T09:08:07').getTime(),
    entry: 'slot',
    slot: 3,
    platform: 'darwin',
    stage: 'activate',
    code: 'focus-denied',
    level: 'blocking',
    message: '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护。',
    ...overrides
  }
}

function operationTrace(overrides: Partial<WindowOperationDebugRecord> = {}): WindowOperationDebugRecord {
  return {
    id: 'window-operation:1:1',
    timestamp: new Date('2026-07-27T09:08:07').getTime(),
    targetTitle: 'Selected Development Window',
    entry: 'manual',
    slot: null,
    platform: 'darwin',
    operation: 'activate',
    result: 'blocking',
    code: 'focus-denied',
    steps: [
      { stage: 'entry', outcome: 'ok' },
      { stage: 'restore', outcome: 'skipped' },
      { stage: 'foreground', outcome: 'denied' }
    ],
    ...overrides
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('window activation diagnostics panel', () => {
  it('stays hidden when this runtime has no diagnostics', () => {
    const wrapper = mount(WindowsPage, { props: { snapshot: snapshotWithDiagnostics() } })
    expect(wrapper.find('.window-activation-diagnostics').exists()).toBe(false)
  })

  it('keeps slots and logs in collapsible side rails so the list remains the main surface', () => {
    const wrapper = mount(WindowsPage, { props: { snapshot: snapshotWithDiagnostics() } })
    expect(wrapper.find('.window-slot-rail').exists()).toBe(true)
    expect(wrapper.find('.window-log-rail').exists()).toBe(true)
    expect(wrapper.find('.windows-body .window-workbench').exists()).toBe(true)
    expect(wrapper.find('.window-slot-strip').exists()).toBe(false)
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    expect(css).toContain('.window-slot-rail.expanded')
    expect(css).toContain('grid-template-rows: repeat(10, minmax(0, 1fr))')
    expect(css).toContain('.window-log-rail.expanded')
  })

  it('hides the short blocking panel while development operation traces are enabled', () => {
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([diagnostic()], { traceEnabled: true, traces: [operationTrace()] })
      }
    })
    expect(wrapper.find('.window-activation-diagnostics').exists()).toBe(false)
    expect(wrapper.find('[data-role="window-operation-trace"]').exists()).toBe(true)
  })

  it('renders blocking diagnostics with alert semantics and only sanitized fields', () => {
    const wrapper = mount(WindowsPage, { props: { snapshot: snapshotWithDiagnostics([diagnostic()]) } })
    const panel = wrapper.get('.window-activation-diagnostics')

    expect(panel.get('.window-activation-diagnostics-summary').attributes('role')).toBe('alert')
    expect(panel.get('li').attributes('role')).toBe('alert')
    expect(panel.text()).toContain('focus-denied')
    expect(panel.text()).toContain('全局槽 3')
    expect(panel.text()).toContain('macOS · 激活')
    expect(panel.text()).not.toContain('Secret Application')
    expect(panel.text()).not.toContain('secret-window-title')
    expect(panel.text()).not.toContain('424242')
    expect(panel.text()).not.toContain('0xDEADBEEF')
  })

  it('renders confirmed closed diagnostics as status and dispatches the session-only clear action', async () => {
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([diagnostic({
          code: 'target-closed',
          level: 'accepted',
          stage: 'resolve',
          entry: 'manual',
          slot: null,
          platform: 'win32',
          message: '已确认目标窗口已关闭，已清除陈旧引用。'
        })])
      }
    })

    expect(wrapper.get('.window-activation-diagnostics-summary').attributes('role')).toBe('status')
    expect(wrapper.get('li').attributes('role')).toBe('status')
    expect(wrapper.get('li').text()).toContain('手动激活')
    expect(wrapper.get('li').text()).toContain('Windows · 解析')
    await wrapper.get('[data-role="window-activation-diagnostics-clear"]').trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.activation.diagnostics.clear'])
  })
})

describe('development window operation trace', () => {
  it('never renders the trace surface in a production-style snapshot', () => {
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([], { traceEnabled: false, traces: [operationTrace()] })
      }
    })

    expect(wrapper.find('[data-role="window-operation-trace"]').exists()).toBe(false)
  })

  it('renders only sanitized debug trace fields with status semantics and clears through its own action', async () => {
    const unsafeTrace = {
      ...operationTrace(),
      title: 'Secret Application',
      appName: 'Secret Application',
      pid: 424242,
      nativeRef: '0xDEADBEEF'
    } as WindowOperationDebugRecord
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([], { traceEnabled: true, traces: [unsafeTrace] })
      }
    })
    const panel = wrapper.get('[data-role="window-operation-trace"]')

    expect(panel.attributes('role')).toBe('status')
    expect(panel.text()).toContain('展开并前置 · 阻断')
    expect(panel.text()).toContain('目标窗口：Selected Development Window')
    expect(panel.text()).toContain('系统拒绝聚焦该窗口')
    expect(panel.text()).not.toContain('Secret Application')
    expect(panel.text()).not.toContain('424242')
    expect(panel.text()).not.toContain('0xDEADBEEF')
    expect(wrapper.find('[data-role="window-operation-trace-copy"]').exists()).toBe(true)

    await wrapper.get('[data-role="window-operation-trace-clear"]').trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.operation.traces.clear'])
  })

  it('shows a human-readable summary and a copy button for full details', () => {
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([], {
          traceEnabled: true,
          traces: [operationTrace({
            code: 'space-unbound-multiwindow',
            result: 'blocking',
            steps: [
              { stage: 'space', outcome: 'failed', detail: 'multiwindow-blocked' },
              { stage: 'process', outcome: 'ok' },
              { stage: 'target', outcome: 'not-found' }
            ]
          })]
        })
      }
    })
    const summary = wrapper.get('[data-role="window-operation-trace-summary"]')
    expect(summary.text()).toContain('展开并前置 · 阻断：目标应用有多个窗口且无法绑定目标桌面。')
    expect(wrapper.find('[data-role="window-operation-trace-copy"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="window-operation-trace-plain"]').exists()).toBe(false)
  })
  it('omits the environment snapshot line when no snapshot is attached', () => {
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([], {
          traceEnabled: true,
          traces: [operationTrace()]
        })
      }
    })
    expect(wrapper.find('[data-role="window-operation-trace-env"]').exists()).toBe(false)
    expect(wrapper.find('[data-role="window-operation-trace-summary"]').exists()).toBe(true)
  })

  it('distinguishes real page topmost from local list pinning in the single-window actions', async () => {
    const base = snapshotWithDiagnostics()
    const row: AppRuntimeSnapshot['windowRows'][number] = {
      id: 'live:win32:100',
      displayName: 'Browser',
      title: 'Docs',
      appName: 'Browser',
      favorite: false,
      pinned: false,
      unavailable: false,
      ambiguous: false,
      focused: true,
      selected: false,
      slotNumbers: [],
      live: { id: 'win32:100', platform: 'win32', nativeRef: '100', appId: 'browser.exe', appName: 'Browser', pid: 100, title: 'Docs', minimized: false, focused: false },
      target: null
    }
    const windowsSnapshot: AppRuntimeSnapshot = {
      ...base,
      windowCapability: { platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true, canAlwaysOnTop: true },
      windowActionsOpen: true,
      windowActionsMode: 'single',
      windowActionTarget: row,
      windowActionTargets: [row]
    }
    const wrapper = mount(WindowsPage, { props: { snapshot: windowsSnapshot } })

    expect(wrapper.get('.window-page-topmost').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('列表置顶')
    expect(wrapper.text()).toContain('展开并前置')
    expect(wrapper.text()).toContain('编辑别名')
    expect(wrapper.text()).toContain('完整编辑')
    await wrapper.get('.window-page-topmost').trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.alwaysOnTop', { rowId: row.id }])

    await wrapper.setProps({
      snapshot: {
        ...windowsSnapshot,
        windowCapability: { ...windowsSnapshot.windowCapability, platform: 'darwin', canAlwaysOnTop: false }
      }
    })
    expect(wrapper.get('.window-page-topmost').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('macOS 只能展开并前置第三方窗口')
  })

  it('keeps list and action titles compact while exposing the full identity on hover', () => {
    const base = snapshotWithDiagnostics()
    const longTitle = 'Very Long Browser Document Title That Should Stay Off The Compact Row'
    const row: AppRuntimeSnapshot['windowRows'][number] = {
      id: 'live:win32:200',
      displayName: longTitle,
      title: longTitle,
      appName: 'Browser',
      favorite: false,
      pinned: false,
      unavailable: false,
      ambiguous: false,
      focused: true,
      selected: false,
      slotNumbers: [],
      live: { id: 'win32:200', platform: 'win32', nativeRef: '424242', appId: 'browser.exe', appName: 'Browser', pid: 200, title: longTitle, minimized: false, focused: false },
      target: null
    }
    const second: AppRuntimeSnapshot['windowRows'][number] = {
      ...row,
      id: 'live:win32:201',
      displayName: 'Second',
      title: 'Second',
      live: { ...row.live!, id: 'win32:201', nativeRef: '201', title: 'Second' }
    }
    const third: AppRuntimeSnapshot['windowRows'][number] = {
      ...row,
      id: 'live:win32:202',
      displayName: 'Third',
      title: 'Third',
      live: { ...row.live!, id: 'win32:202', nativeRef: '202', title: 'Third' }
    }
    const listWrapper = mount(WindowsPage, {
      props: {
        snapshot: {
          ...base,
          windowCapability: { platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true, canAlwaysOnTop: true },
          windowListLoaded: true,
          windowRows: [row]
        }
      }
    })
    const listRow = listWrapper.get('.window-row')
    expect(listRow.get('strong').text()).toBe(longTitle)
    expect(listRow.get('small').text()).toBe('Browser')
    expect(listRow.get('small').text()).not.toContain(longTitle)
    expect(listRow.text()).not.toContain('HWND')
    expect(listRow.attributes('data-operation-tooltip')).toContain(longTitle)
    expect(listRow.attributes('data-operation-tooltip')).toContain('HWND 424242')

    const multiWrapper = mount(WindowsPage, {
      props: {
        snapshot: {
          ...base,
          windowCapability: { platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true, canAlwaysOnTop: true },
          windowActionsOpen: true,
          windowActionsMode: 'multi',
          windowActionTarget: row,
          windowActionTargets: [row, second, third]
        }
      }
    })
    expect(multiWrapper.get('.window-actions-subtitle').text()).toBe(`${longTitle}、Second 等 3 个`)
    expect(multiWrapper.get('.window-actions-subtitle').attributes('data-operation-tooltip')).toBe(`${longTitle}、Second、Third`)
  })

  it('keeps the action panel compact: list-primary column, bounded action rail, no horizontal overflow', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const workbench = css.slice(css.indexOf('.window-workbench.has-actions {'), css.indexOf('.window-list-panel,'))
    expect(workbench).toContain('minmax(0, 1fr)')
    expect(workbench).toContain('minmax(0, min(320px, 42%))')
    expect(workbench).not.toContain('minmax(300px, 1fr)')
    expect(workbench).not.toContain('min(420px, 44%)')

    const panelStart = css.indexOf('.window-actions-panel {')
    const panelEnd = css.indexOf('.window-actions-panel header,', panelStart)
    const panel = css.slice(panelStart, panelEnd)
    expect(panel).toContain('overflow-x: hidden')
    expect(panel).toContain('min-width: 0')

    const start = css.indexOf('.window-primary-actions {')
    const end = css.indexOf('.window-primary-actions button.pinned', start)
    const block = css.slice(start, end)
    expect(block).toContain('repeat(2, minmax(0, 1fr))')
    expect(block).toContain('max-width: 100%')
  })

  it('truncates long action titles instead of expanding the panel horizontally', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const start = css.indexOf('.window-actions-title,')
    const end = css.indexOf('.window-actions-panel header p,', start)
    const block = css.slice(start, end)
    expect(block).toContain('text-overflow: ellipsis')
    expect(block).toContain('white-space: nowrap')
    expect(block).toContain('max-width: 100%')
  })
})

describe('slot inline binding mode', () => {
  function makeRow(id: string, name: string, slotNumbers: number[] = []): AppRuntimeSnapshot['windowRows'][number] {
    return {
      id,
      displayName: name,
      title: name,
      appName: 'App',
      favorite: false,
      pinned: false,
      unavailable: false,
      ambiguous: false,
      focused: false,
      selected: false,
      slotNumbers,
      live: null,
      target: null
    }
  }

  function snapshotWithRows(
    rows: AppRuntimeSnapshot['windowRows'][number][],
    overrides: Partial<AppRuntimeSnapshot> = {}
  ): AppRuntimeSnapshot {
    const base = snapshotWithDiagnostics()
    return {
      ...base,
      windowCapability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true, canAlwaysOnTop: false },
      windowListLoaded: true,
      windowRows: rows,
      ...overrides
    }
  }

  function snapshotWithAssignedSlot(
    slot: number,
    targetId: string,
    alias: string,
    rows: AppRuntimeSnapshot['windowRows'][number][]
  ): AppRuntimeSnapshot {
    const base = snapshotWithDiagnostics()
    const target = { id: targetId, alias, platform: 'darwin' as const, appId: 'app.exe', appName: 'App', titleLocator: '', lastNativeRef: null, favorite: false, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }
    return {
      ...base,
      windowCapability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true, canAlwaysOnTop: false },
      windowListLoaded: true,
      windowRows: rows,
      state: {
        ...base.state,
        windowTargets: [target],
        windowSlots: base.state.windowSlots.map((s) =>
          s.slot === slot ? { ...s, targetIdByPlatform: { darwin: targetId } } : s
        )
      }
    }
  }

  it('enters binding mode when clicking an unassigned slot and shows the hint bar', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithRows([makeRow('w1', 'Window 1')]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0 })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="window-slot-picker"]').exists()).toBe(false)
  })

  it('dispatches windows.slot.assign when clicking a window row in binding mode then exits', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithRows([makeRow('w1', 'Window 1'), makeRow('w2', 'Window 2')]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0 })
    await wrapper.get('.window-row').trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.slot.assign', { slot: 1, rowId: 'w1' }])
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(false)
  })

  it('does not re-assign when clicking the row already bound to the current slot', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithAssignedSlot(1, 'target-1', 'Target 1', [makeRow('w1', 'Window 1', [1])]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0, altKey: true })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(true)
    await wrapper.get('.window-row').trigger('click')
    const dispatchEvents = wrapper.emitted('dispatch') || []
    expect(dispatchEvents).not.toContainEqual(['windows.slot.assign', { slot: 1, rowId: 'w1' }])
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(false)
  })

  it('enters binding mode via Alt+click on an assigned slot', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithAssignedSlot(1, 'target-1', 'Target 1', [makeRow('w1', 'Window 1')]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0 })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(false)
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0, altKey: true })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(true)
  })

  it('exits binding mode on Escape keydown', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithRows([makeRow('w1', 'Window 1')]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0 })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(true)
    await wrapper.get('#window-list').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(false)
  })

  it('no longer renders the popup picker', () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithRows([makeRow('w1', 'Window 1')]) }
    })
    expect(wrapper.find('[data-role="window-slot-picker"]').exists()).toBe(false)
  })
})
