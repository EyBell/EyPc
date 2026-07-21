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

function installHost(payload: { code?: string } | null, codexEnabled = true): EnterHarness {
  const state = createInitialState(100)
  state.activeTab = 'ports'
  state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: codexEnabled } : item)
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
    files: {
      open: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      reveal: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      copyPath: async () => ({ outcome: 'failed', errorCode: 'unsupported' }),
      inspectPaths: async (paths) => paths.map((path) => ({ path, status: 'unknown', kind: 'unknown', exists: false, isSymbolicLink: false })),
      listDirectory: async () => ({ ok: false, entries: [], errorCode: 'unsupported' })
    },
    clipboard: { copyText: async () => false },
    codex: {
      inspectEnvironment: async () => ({ version: 1, checking: false, platform: 'macos', runtimeState: 'detected', runtimeSource: 'homebrew', processState: 'not-running', configState: 'detected', connectionState: 'not-checked', checkedAt: 100 }),
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
  it('handles a cold-start enabled payload exactly once and hides the main window', async () => {
    const host = installHost({ code: 'eypc-codex-toggle' })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })

    wrapper = shallowMount(App)
    await flushPromises()

    expect(toggleCalls()).toHaveLength(1)
    expect(host.hide).toHaveBeenCalledTimes(1)
    expect(host.show).not.toHaveBeenCalled()
    expect(host.clearEnterPayload).toHaveBeenCalledTimes(1)
    expect(host.listeners.size).toBe(1)
    expect(host.saved.at(-1)?.codex.settings.floatEnabled).toBe(true)
  })

  it('handles a hot re-entry exactly once, hides, and disposes the listener', async () => {
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
    expect(host.hide).toHaveBeenCalledTimes(1)
    expect(host.show).not.toHaveBeenCalled()
    expect(host.saved.at(-1)?.codex.settings.floatEnabled).toBe(true)
    wrapper.unmount()
    wrapper = null
    expect(host.listeners.size).toBe(0)
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
})
