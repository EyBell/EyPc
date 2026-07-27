// @vitest-environment happy-dom

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
    expect(panel.text()).toContain('前置：被拒绝')
    expect(panel.text()).toContain('focus-denied')
    expect(panel.text()).not.toContain('Secret Application')
    expect(panel.text()).not.toContain('424242')
    expect(panel.text()).not.toContain('0xDEADBEEF')

    await wrapper.get('[data-role="window-operation-trace-clear"]').trigger('click')
    expect(wrapper.emitted('dispatch')).toContainEqual(['windows.operation.traces.clear'])
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
})
