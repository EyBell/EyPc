// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime, type AppRuntimeSnapshot, type WindowActivationDiagnostic, type WindowOperationDebugRecord } from '../../src/runtime/appRuntime'
import SettingsPage from '../../src/pages/SettingsPage.vue'
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
    windowCapability: {
      platform: 'darwin',
      bridgeRevision: 'wj22-native-instance-space-cache',
      supported: true,
      permission: 'granted',
      canList: true,
      canActivate: true,
      canClose: true,
      canAlwaysOnTop: false
    },
    windowListLoaded: true,
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
    expect(wrapper.get('#window-status-band').text()).not.toContain('系统拒绝聚焦')
  })

  it('hides the production log rail and keeps only the slot rail beside the list', () => {
    const wrapper = mount(WindowsPage, { props: { snapshot: snapshotWithDiagnostics() } })
    expect(wrapper.find('.window-slot-rail').exists()).toBe(true)
    expect(wrapper.find('.window-log-rail').exists()).toBe(false)
    expect(wrapper.find('.windows-body .window-workbench').exists()).toBe(true)
    expect(wrapper.find('.window-slot-strip').exists()).toBe(false)
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    expect(css).toContain('.window-slot-rail.expanded')
    expect(css).toContain('grid-template-rows: repeat(10, minmax(0, 1fr))')
    expect(css).toContain('.window-log-rail.expanded')
  })

  it('keeps the development log rail only when operation tracing is enabled', () => {
    const wrapper = mount(WindowsPage, {
      props: {
        snapshot: snapshotWithDiagnostics([], { traceEnabled: true, traces: [operationTrace()] })
      }
    })
    expect(wrapper.find('.window-log-rail').exists()).toBe(true)
    expect(wrapper.find('[data-role="window-operation-trace"]').exists()).toBe(true)
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

  it('surfaces the latest sanitized diagnostic on the status band in production builds', () => {
    const wrapper = mount(WindowsPage, { props: { snapshot: snapshotWithDiagnostics([diagnostic()]) } })
    const band = wrapper.get('#window-status-band')

    expect(wrapper.find('.window-log-rail').exists()).toBe(false)
    expect(wrapper.find('.window-activation-diagnostics').exists()).toBe(false)
    expect(band.attributes('role')).toBe('alert')
    expect(band.text()).toContain('系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护。')
    expect(band.text()).not.toContain('Secret Application')
    expect(band.text()).not.toContain('secret-window-title')
    expect(band.text()).not.toContain('424242')
    expect(band.text()).not.toContain('0xDEADBEEF')
  })

  it('renders confirmed closed diagnostics as status on the band without opening a log rail', () => {
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

    const band = wrapper.get('#window-status-band')
    expect(wrapper.find('.window-log-rail').exists()).toBe(false)
    expect(band.attributes('role')).toBeUndefined()
    expect(band.text()).toContain('已确认目标窗口已关闭，已清除陈旧引用。')
  })
})

describe('settings window diagnostics section', () => {
  it('renders blocking diagnostics with alert semantics and clears through the shared action', async () => {
    const state = createInitialState(1)
    const wrapper = mount(SettingsPage, {
      attachTo: document.body,
      props: {
        actions: [],
        defaultKeybindings: [],
        overrides: [],
        shortcutProfiles: state.settings.shortcutProfiles,
        featureConfigs: state.settings.featureConfigs,
        settings: state.settings,
        mqttStorageStatus: {
          mode: 'browser-localStorage' as const,
          sqliteAvailable: false,
          migratedLegacyArchive: false
        },
        persistedSettingsTabId: 'maintenance' as const,
        persistedMaintenanceSectionId: 'window-diagnostics' as const,
        windowActivationDiagnostics: [diagnostic()],
        windowOperationTraceEnabled: false,
        windowOperationTraces: []
      }
    })

    const panel = wrapper.get('[data-role="settings-window-diagnostics"]')
    expect(panel.get('.window-activation-diagnostics-summary').attributes('role')).toBe('alert')
    expect(panel.get('li').attributes('role')).toBe('alert')
    expect(panel.text()).toContain('focus-denied')
    expect(panel.text()).toContain('全局槽 3')
    expect(panel.text()).toContain('macOS · 激活')
    expect(panel.text()).not.toContain('Secret Application')
    expect(panel.text()).not.toContain('424242')
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
            code: 'instance-mismatch',
            result: 'blocking',
            steps: [
              { stage: 'target', outcome: 'not-found', detail: 'instance-mismatch' },
              { stage: 'process', outcome: 'ok' },
              { stage: 'target', outcome: 'not-found' }
            ]
          })]
        })
      }
    })
    const summary = wrapper.get('[data-role="window-operation-trace-summary"]')
    expect(summary.text()).toContain('展开并前置 · 阻断：窗口实例与保存目标不一致，请重新确认。')
    expect(wrapper.find('[data-role="window-operation-trace-copy"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="window-operation-trace-plain"]').exists()).toBe(false)
  })
  it('does not render retired environment snapshot markup', () => {
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
      live: { id: 'win32:100:100', instanceId: 'win32:100:100', platform: 'win32', nativeRef: '100', appId: 'browser.exe', appName: 'Browser', pid: 100, title: 'Docs', minimized: false, focused: false },
      target: null,
      kind: 'window', treeLevel: 1, parentGroupKey: null, parentRowId: null, groupKey: null, expandable: false, expanded: false, childCount: 0, groupLiveInstanceIds: []
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
    expect(wrapper.text()).toContain('打开当前子窗口')
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
      live: { id: 'win32:200:424242', instanceId: 'win32:200:424242', platform: 'win32', nativeRef: '424242', appId: 'browser.exe', appName: 'Browser', pid: 200, title: longTitle, minimized: false, focused: false },
      target: null,
      kind: 'window', treeLevel: 1, parentGroupKey: null, parentRowId: null, groupKey: null, expandable: false, expanded: false, childCount: 0, groupLiveInstanceIds: []
    }
    const second: AppRuntimeSnapshot['windowRows'][number] = {
      ...row,
      id: 'live:win32:201',
      displayName: 'Second',
      title: 'Second',
      live: { ...row.live!, id: 'win32:201:201', instanceId: 'win32:201:201', nativeRef: '201', title: 'Second' }
    }
    const third: AppRuntimeSnapshot['windowRows'][number] = {
      ...row,
      id: 'live:win32:202',
      displayName: 'Third',
      title: 'Third',
      live: { ...row.live!, id: 'win32:202:202', instanceId: 'win32:202:202', nativeRef: '202', title: 'Third' }
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
          windowActionsContext: 'selection',
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
      target: null,
      kind: 'window', treeLevel: 1, parentGroupKey: null, parentRowId: null, groupKey: null, expandable: false, expanded: false, childCount: 0, groupLiveInstanceIds: []
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
    const target = { id: targetId, alias, scope: 'instance' as const, platform: 'darwin' as const, appId: 'app.exe', appName: 'App', lastKnownTitle: '', lastInstanceId: null, lastNativeRef: null, groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: false, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }
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

  it('shows a focused manual rebind flow even when only one candidate is visible', async () => {
    const currentTitle = 'Settings - Google Chrome'
    const candidate = {
      ...makeRow('candidate:darwin:91:222', currentTitle, [1]),
      candidate: true,
      favorite: false,
      pinned: false,
      slotNumbers: [],
      live: { id: 'darwin:91:222', instanceId: 'darwin:91:222', platform: 'darwin' as const, nativeRef: '91:222', appId: 'com.google.Chrome', appName: 'Google Chrome', pid: 91, title: currentTitle, minimized: false, focused: true }
    }
    const snapshot = snapshotWithRows([candidate], {
      windowRebind: { phase: 'confirming', targetId: 'target-1', candidateInstanceIds: ['darwin:91:222'] }
    })
    snapshot.state.windowTargets = [{
      id: 'target-1', alias: '工作浏览器', scope: 'instance', platform: 'darwin', appId: 'com.google.Chrome', appName: 'Google Chrome',
      lastKnownTitle: 'Dashboard - Google Chrome', lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [],
      favorite: true, pinned: true, createdAt: 1, updatedAt: 1
    }]
    const wrapper = mount(WindowsPage, {
      props: { snapshot }
    })

    const status = wrapper.get('.window-status-band')
    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.text()).toContain('工作浏览器')
    expect(status.text()).toContain('上次标题「Dashboard - Google Chrome」')
    expect(status.text()).toContain('原窗口实例已失效')
    expect(status.text()).toContain('标题与状态仅供人工辨认')
    expect(status.text()).toContain('Enter')
    expect(status.text()).toContain('Escape')
    const list = wrapper.get('#window-list')
    expect(list.attributes('role')).toBe('tree')
    expect(list.attributes('aria-multiselectable')).toBeUndefined()
    expect(list.attributes('aria-describedby')).toBe('window-status-band')
    expect(wrapper.get('.window-row strong').text()).toBe(currentTitle)
    expect(wrapper.get('.window-status').text()).toBe('前台 · 待确认')
    expect(wrapper.find('.window-pin-badge').exists()).toBe(false)
    expect(wrapper.find('.window-slot-badges').exists()).toBe(false)
    expect(wrapper.find('.window-slot-rail').exists()).toBe(false)
    expect(wrapper.find('.window-log-rail').exists()).toBe(false)
    expect(wrapper.get('[data-role="window-search"]').attributes('disabled')).toBeDefined()
    await wrapper.get('.window-row').trigger('contextmenu')
    expect(wrapper.emitted('dispatch')).toBeUndefined()
  })

  it('keeps an empty candidate flow visible until the user refreshes or cancels', () => {
    const snapshot = snapshotWithRows([], {
      windowRebind: { phase: 'confirming', targetId: 'target-1', candidateInstanceIds: [] },
      focusedWindowId: null
    })
    snapshot.state.windowTargets = [{
      id: 'target-1', alias: '工作浏览器', scope: 'instance', platform: 'darwin', appId: 'com.google.Chrome', appName: 'Google Chrome',
      lastKnownTitle: 'Dashboard - Google Chrome', lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [],
      favorite: true, pinned: true, createdAt: 1, updatedAt: 1
    }]
    const wrapper = mount(WindowsPage, { props: { snapshot } })

    expect(wrapper.get('.window-status-band').text()).toContain('工作浏览器')
    expect(wrapper.get('.empty-state').text()).toContain('当前没有可确认的同应用窗口')
    expect(wrapper.get('.empty-state').text()).toContain('刷新重试')
    expect(wrapper.get('.empty-state').text()).toContain('Escape 返回原目标')
    expect(wrapper.get('#window-list').attributes('aria-describedby')).toBe('window-status-band')
    expect(wrapper.find('.window-slot-rail').exists()).toBe(false)
    expect(wrapper.find('.window-log-rail').exists()).toBe(false)
  })

  it('labels minimized and partial-cache candidates without treating those states as identity', () => {
    const minimizedTitle = 'Downloads - Google Chrome'
    const cachedTitle = 'Docs - Google Chrome'
    const minimized = {
      ...makeRow('candidate:darwin:91:333', minimizedTitle),
      candidate: true,
      live: { id: 'darwin:91:333', instanceId: 'darwin:91:333', platform: 'darwin' as const, nativeRef: '91:333', appId: 'com.google.Chrome', appName: 'Google Chrome', pid: 91, title: minimizedTitle, minimized: true, focused: false }
    }
    const cached = {
      ...makeRow('candidate:darwin:91:444', cachedTitle),
      candidate: true,
      cached: true,
      live: { id: 'darwin:91:444', instanceId: 'darwin:91:444', platform: 'darwin' as const, nativeRef: '91:444', appId: 'com.google.Chrome', appName: 'Google Chrome', pid: 91, title: cachedTitle, minimized: false, focused: true }
    }
    const snapshot = snapshotWithRows([minimized, cached], {
      windowRebind: { phase: 'confirming', targetId: 'target-1', candidateInstanceIds: ['darwin:91:333', 'darwin:91:444'] }
    })
    snapshot.state.windowTargets = [{
      id: 'target-1', alias: '工作浏览器', scope: 'instance', platform: 'darwin', appId: 'com.google.Chrome', appName: 'Google Chrome',
      lastKnownTitle: 'Dashboard - Google Chrome', lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [],
      favorite: true, pinned: false, createdAt: 1, updatedAt: 1
    }]
    const wrapper = mount(WindowsPage, { props: { snapshot } })
    const statuses = wrapper.findAll('.window-status').map((status) => status.text())

    expect(statuses).toContain('已最小化 · 待确认')
    expect(statuses).toContain('缓存候选 · 待确认')
    expect(wrapper.text()).toContain('标题与状态仅供人工辨认')
  })

  it('renders the current or last title as read-only display metadata', () => {
    const snapshot = snapshotWithRows([], {
      windowDraft: {
        mode: 'edit', targetId: 'target-1', sourceWindowId: null, sourceGroupKey: null, alias: 'Browser', appName: 'Browser', appId: 'com.browser',
        lastKnownTitle: 'Current tab title', activeField: 'alias'
      }
    })
    const wrapper = mount(WindowsPage, { props: { snapshot } })

    expect(wrapper.get('[data-field="lastKnownTitle"]').attributes('readonly')).toBeDefined()
    expect(wrapper.text()).toContain('标题仅用于展示、搜索与人工辨认，不参与窗口身份判断')
    expect(wrapper.find('[data-field="titleLocator"]').exists()).toBe(false)
  })

  it('enters binding mode when clicking an unassigned slot and shows the hint bar', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithRows([makeRow('w1', 'Window 1')]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0 })
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="window-slot-picker"]').exists()).toBe(false)
  })

  it('shares the panel height between the binding hint and the scrollable window list', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithRows([makeRow('w1', 'Window 1')]) }
    })
    await wrapper.get('[data-slot-chip="1"]').trigger('pointerdown', { button: 0 })

    const hint = wrapper.get('[data-role="window-slot-binding-hint"]')
    const list = wrapper.get('#window-list')
    expect(hint.element.parentElement).toBe(list.element.parentElement)
    expect(hint.element.nextElementSibling).toBe(list.element)

    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const standaloneRule = (selector: string) => {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const match = css.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'))
      if (!match) throw new Error(`Missing standalone CSS rule for ${selector}`)
      return match[1]
    }
    const panelRule = standaloneRule('.window-list-panel')
    const hintRule = standaloneRule('.window-slot-binding-hint')
    const listRule = standaloneRule('.window-list')

    expect(panelRule).toMatch(/display:\s*flex/)
    expect(panelRule).toMatch(/flex-direction:\s*column/)
    expect(hintRule).toMatch(/flex:\s*0 0 auto/)
    expect(listRule).toMatch(/flex:\s*1 1 0/)
    expect(listRule).toMatch(/min-height:\s*0/)
    expect(listRule).toMatch(/height:\s*auto/)
    expect(listRule).toMatch(/overflow:\s*auto/)
    expect(listRule).not.toMatch(/height:\s*100%/)
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

  it('uses target identity instead of the visible alias to decide whether a slot is assigned', async () => {
    const wrapper = mount(WindowsPage, {
      props: { snapshot: snapshotWithAssignedSlot(1, 'target-1', '未分配', [makeRow('w1', 'Window 1')]) }
    })
    const chip = wrapper.get('[data-slot-chip="1"]')
    expect(chip.classes()).toContain('assigned')
    await chip.trigger('pointerdown', { button: 0 })
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.slot.focus', { slot: 1 }])
    expect(wrapper.find('[data-role="window-slot-binding-hint"]').exists()).toBe(false)
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

  it('renders file managers as an accessible parent-child tree and exposes only parent-safe actions', async () => {
    const group: AppRuntimeSnapshot['windowRows'][number] = {
      ...makeRow('group:file-manager:darwin:com.apple.finder', 'Finder'),
      appName: 'Finder',
      kind: 'file-manager-group',
      groupKey: 'file-manager:darwin:com.apple.finder',
      expandable: true,
      expanded: true,
      childCount: 1,
      groupLiveInstanceIds: ['darwin:20:100']
    }
    const child: AppRuntimeSnapshot['windowRows'][number] = {
      ...makeRow('live:darwin:20:100', 'Downloads'),
      appName: 'Finder',
      treeLevel: 2,
      parentGroupKey: group.groupKey,
      groupKey: group.groupKey
    }
    const snapshot = snapshotWithRows([group, child], {
      focusedWindowId: group.id,
      windowActionsOpen: true,
      windowActionsContext: 'file-manager-group',
      windowActionTarget: group,
      windowActionTargets: [group]
    })
    const wrapper = mount(WindowsPage, { props: { snapshot } })

    expect(wrapper.get('#window-list').attributes('role')).toBe('tree')
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(2)
    expect(wrapper.findAll('[role="treeitem"]')[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[role="treeitem"]')[0].attributes('aria-selected')).toBeUndefined()
    expect(wrapper.findAll('[role="treeitem"]')[1].attributes('aria-level')).toBe('2')
    await wrapper.get('.window-tree-toggle').trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.tree.toggle', { rowId: group.id, expanded: false }])
    expect(wrapper.text()).toContain('激活最近主窗口')
    expect(wrapper.text()).toContain('收起子窗口')
    expect(wrapper.text()).not.toContain('页面置顶')
    expect(wrapper.text()).not.toContain('强制关闭')
    expect(wrapper.text()).not.toContain('完整编辑')
  })

  it('opens a unified slot action panel from right click with activate, reselect, clear, and settings actions', async () => {
    const row = makeRow('target:target-1', 'Target 1', [1])
    const snapshot = snapshotWithAssignedSlot(1, 'target-1', 'Target 1', [row])
    snapshot.windowActionsOpen = true
    snapshot.windowActionsContext = 'slot'
    snapshot.windowActionSlot = 1
    snapshot.windowActionTarget = row
    snapshot.windowActionTargets = [row]
    const wrapper = mount(WindowsPage, { props: { snapshot } })

    expect(wrapper.text()).toContain('稳定槽 1')
    expect(wrapper.text()).toContain('激活槽位')
    expect(wrapper.text()).toContain('重新选择目标')
    expect(wrapper.text()).toContain('清除槽位')
    expect(wrapper.text()).toContain('打开 uTools 快捷键设置')
    expect(wrapper.text()).not.toContain('强制关闭')

    await wrapper.get('[data-slot-chip="1"]').trigger('contextmenu')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.slot.actions.open', { slot: 1 }])
  })
})
