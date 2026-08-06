// @vitest-environment happy-dom
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import type { AppState } from '../../src/domain/types'

const dispatchProbe = vi.hoisted(() => ({ dispatch: vi.fn() }))

vi.mock('../../src/runtime/appRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/appRuntime')>()
  return {
    ...actual,
    createAppRuntime(...args: Parameters<typeof actual.createAppRuntime>) {
      const runtime = actual.createAppRuntime(...args)
      const original = runtime.dispatch.bind(runtime)
      runtime.dispatch = ((...dispatchArgs: Parameters<typeof original>) => {
        dispatchProbe.dispatch(...dispatchArgs)
        return original(...dispatchArgs)
      }) as typeof runtime.dispatch
      return runtime
    }
  }
})

import App from '../../src/App.vue'

interface EnterHarness {
  state: AppState
  saved: AppState[]
  hide: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  clearEnterPayload: ReturnType<typeof vi.fn>
  listeners: Set<(payload: { code?: string } | null) => void>
  emit(payload: { code?: string } | null): void
}

function installHost(payload: { code?: string } | null, codexEnabled = true, windowsEnabled = false, favoritesEnabled = false): EnterHarness {
  const state = createInitialState(100)
  state.activeTab = 'ports'
  state.settings.featureConfigs = state.settings.featureConfigs.map((item) => {
    if (item.id === 'codex') return { ...item, enabled: codexEnabled }
    if (item.id === 'windows') return { ...item, enabled: windowsEnabled }
    if (item.id === 'favorites') return { ...item, enabled: favoritesEnabled }
    return item
  })
  const saved: AppState[] = []
  const listeners = new Set<(payload: { code?: string } | null) => void>()
  const hide = vi.fn(() => true)
  const show = vi.fn(() => true)
  const clearEnterPayload = vi.fn()
  let currentPayload = payload
  window.eypcPlatform = {
    storage: {
      getState: () => state,
      setState: (next) => { saved.push(structuredClone(next)); return true },
      getMqttArchive: () => ({ version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }),
      setMqttArchive: () => true,
      getMqttStorageStatus: () => ({ mode: 'browser-localStorage', sqliteAvailable: false, migratedLegacyArchive: false }),
      getMqttSecrets: () => ({}),
      setMqttSecrets: () => true
    },
    ports: { scan: async () => [], kill: async (request) => ({ ok: false, ...request }) },
    windows: {
      capabilities: async () => ({ platform: 'unsupported' as const, supported: false, permission: 'unsupported' as const, canList: false, canActivate: false }),
      list: async () => ({ capability: { platform: 'unsupported' as const, supported: false, permission: 'unsupported' as const, canList: false, canActivate: false }, windows: [] }),
      activate: async () => ({ outcome: 'unsupported' as const })
    },
    files: {
      capabilities: { platform: 'darwin', open: true, reveal: true, copyPath: true, copyItems: false, pickFiles: false, pickFolders: false, listDirectory: true, inspectPaths: true, run: false, terminalRun: false },
      open: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      reveal: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      copyPath: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      inspectPaths: async (paths) => paths.map((path) => ({ path, status: 'unknown', kind: 'unknown', exists: false, isSymbolicLink: false })),
      listDirectory: async () => ({ ok: false, entries: [], errorCode: 'unsupported' }),
      saveTextFile: async () => ({ outcome: 'failed', errorCode: 'unsupported' })
    },
    clipboard: { copyText: async () => false },
    codex: {
      inspectEnvironment: async () => ({ version: 1, checking: false, platform: 'macos', runtimeState: 'detected', runtimeSource: 'homebrew', processState: 'not-running', configState: 'detected', connectionState: 'not-checked', desktopBridgeState: 'not-checked', checkedAt: 100 }),
      readSnapshot: async () => ({ ok: false, error: { code: 'unavailable', message: 'test host does not open App Server' }, receivedAt: 100 }),
      openThread: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      close: () => undefined
    },
    float: { sync: () => true, close: () => undefined, onAction: () => () => undefined },
    app: { hide, show },
    getEnterPayload: () => currentPayload,
    clearEnterPayload: () => { currentPayload = null; clearEnterPayload() },
    onEnterPayload: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  }
  return {
    state,
    saved,
    hide,
    show,
    clearEnterPayload,
    listeners,
    emit(nextPayload) { for (const listener of [...listeners]) listener(nextPayload) }
  }
}

function toggleCalls() {
  return dispatchProbe.dispatch.mock.calls.filter(([actionId]) => actionId === 'codex.float.toggle')
}

function activateCalls() {
  return dispatchProbe.dispatch.mock.calls.filter(([actionId]) => actionId === 'codex.float.activate')
}

function completedUnreadCalls() {
  return dispatchProbe.dispatch.mock.calls.filter(([actionId]) => actionId === 'codex.completed-unread.openFirst')
}

function windowSlotCalls() {
  return dispatchProbe.dispatch.mock.calls.filter(([actionId]) => actionId === 'windows.slot.activate')
}

function favoriteSlotCalls() {
  return dispatchProbe.dispatch.mock.calls.filter(([actionId]) => String(actionId).startsWith('favorites.slot.activate.'))
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  delete window.eypcPlatform
  dispatchProbe.dispatch.mockClear()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('App uTools Codex toggle entry', () => {
  it('handles the global Codex card activation entry without adding a renderer hide', async () => {
    const host = installHost({ code: 'eypc-codex-activate' })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(activateCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.saved.at(-1)?.codex.settings.floatEnabled).toBe(true)
  })

  it('handles a cold-start enabled payload exactly once and leaves visibility to mainHide', async () => {
    const host = installHost({ code: 'eypc-codex-toggle' })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(toggleCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).not.toHaveBeenCalled()
    expect(host.clearEnterPayload).toHaveBeenCalledTimes(1)
    expect(host.listeners.size).toBe(1)
    expect(host.saved.at(-1)?.codex.settings.floatEnabled).toBe(true)
  })

  it('handles a hot re-entry exactly once without a second hide and disposes the listener', async () => {
    const host = installHost(null)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })
    wrapper = shallowMount(App)
    await flushPromises()
    dispatchProbe.dispatch.mockClear()
    host.hide.mockClear()
    host.saved.splice(0)

    host.emit({ code: 'eypc-codex-toggle' })
    await flushPromises()

    expect(toggleCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).not.toHaveBeenCalled()
    expect(host.saved.at(-1)?.codex.settings.floatEnabled).toBe(true)
    wrapper.unmount()
    wrapper = null
    expect(host.listeners.size).toBe(0)
  })

  it('dispatches a cold completed-unread shortcut without changing the current tab or hiding twice', async () => {
    const host = installHost({ code: 'eypc-codex-completed-unread' })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(completedUnreadCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).not.toHaveBeenCalled()
    expect(host.saved).toHaveLength(0)
  })

  it('shows Settings instead of hiding when the Codex feature is disabled', async () => {
    const host = installHost({ code: 'eypc-codex-toggle' }, false)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(toggleCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.saved.at(-1)?.activeTab).toBe('settings')
    expect(host.saved.at(-1)?.codex.settings.floatEnabled).toBe(false)
  })

  it('does not apply a second hide after an enabled global window slot reports a blocking runtime result', async () => {
    const host = installHost({ code: 'eypc-window-slot-1' }, true, true)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(windowSlotCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.saved.at(-1)?.activeTab).toBe('windows')
  })

  it('dispatches a disabled global window slot for a visible blocking diagnostic instead of silently hiding it', async () => {
    const host = installHost({ code: 'eypc-window-slot-10' }, true, false)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(windowSlotCalls()).toHaveLength(1)
    expect(windowSlotCalls()[0]?.[1]).toMatchObject({ slot: 10, source: 'utools-feature' })
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.saved.at(-1)?.activeTab).toBe('settings')
  })

  it('opens the favorite slot repair manager only when a mainHide file slot cannot launch', async () => {
    const host = installHost({ code: 'eypc-favorite-slot-1' }, true, false, true)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(favoriteSlotCalls()).toHaveLength(1)
    expect(host.hide).not.toHaveBeenCalled()
    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.saved.at(-1)?.activeTab).toBe('favorites')
  })
})
