// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App.vue'
import { formatShortcutLabel } from '../../src/domain/shortcuts'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime } from '../../src/runtime/appRuntime'

const { hide } = vi.hoisted(() => ({ hide: vi.fn(async () => true) }))

vi.mock('../../src/platform/eypcPlatform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/eypcPlatform')>()
  return {
    ...actual,
    getPlatform() {
      const platform = actual.getPlatform()
      return {
        ...platform,
        storage: { ...platform.storage, getState: () => createInitialState(100), setState: () => true },
        ports: { ...platform.ports, scan: async () => [{ id: 'test-port', port: 4310, pid: 23, command: 'demo', address: '127.0.0.1', protocol: 'tcp', state: 'LISTEN' }] },
        app: { ...platform.app, hide }
      }
    }
  }
})

vi.mock('../../src/runtime/appRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/appRuntime')>()
  return {
    ...actual,
    createAppRuntime: vi.fn((...args: Parameters<typeof actual.createAppRuntime>) => {
      const runtime = actual.createAppRuntime(...args)
      vi.spyOn(runtime, 'dispatch')
      vi.spyOn(runtime, 'focusPort')
      vi.spyOn(runtime, 'startCodex').mockImplementation(() => {})
      return runtime
    })
  }
})

const originalHitTest = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint')
let app: VueWrapper | undefined

async function mountMain() {
  app = mount(App, { attachTo: document.body })
  await flushPromises()
  const runtime = vi.mocked(createAppRuntime).mock.results.at(-1)?.value
  if (!runtime) throw new Error('Expected the main runtime')
  return { app, runtime }
}

function visible(element: HTMLElement, left = 10) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: left, y: 10, left, top: 10, right: left + 40, bottom: 34, width: 40, height: 24, toJSON: () => ({})
  })
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: (x: number) => x >= left && x <= left + 40 ? [element] : []
  })
}

async function press(element: HTMLElement, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  element.dispatchEvent(event)
  await nextTick()
  return event
}

afterEach(() => {
  app?.unmount()
  app = undefined
  if (originalHitTest) Object.defineProperty(document, 'elementsFromPoint', originalHitTest)
  else Reflect.deleteProperty(document, 'elementsFromPoint')
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('main window Quick Jump', () => {
  it('prioritizes the default hide command over the marker layer', async () => {
    const { app } = await mountMain()
    visible(app.get<HTMLElement>('.tab-button').element)
    await press(app.element, 'f')
    expect(app.find('.quick-jump-top-layer').exists()).toBe(true)

    const event = await press(app.element, 'Escape', { shiftKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(hide).toHaveBeenCalledOnce()
    expect(app.find('.quick-jump-top-layer').exists()).toBe(false)
  })

  it('uses the current rebound hide key even when it overrides the marker Escape gesture', async () => {
    const { app, runtime } = await mountMain()
    const tab = app.get<HTMLElement>('.tab-button').element
    visible(tab)
    await press(app.element, 'f')
    await press(app.element, 'z')
    runtime.updateKeybinding({ commandId: 'app.hide', shortcutIds: ['Escape'], when: "tab == 'settings'" })

    await press(app.element, 'Escape', { shiftKey: true })
    expect(hide).not.toHaveBeenCalled()
    expect(app.find('.quick-jump-top-layer').exists()).toBe(true)

    await press(app.element, 'Escape')
    expect(hide).not.toHaveBeenCalled()
    expect(tab.dataset.quickJumpActive).toBe('true')
    runtime.updateKeybinding({ commandId: 'app.hide', shortcutIds: ['Escape'], when: "tab == 'ports'" })

    await press(app.element, 'Escape')
    expect(hide).toHaveBeenCalledOnce()
    expect(app.find('.quick-jump-top-layer').exists()).toBe(false)
  })

  it('keeps two-step Escape and blocks lower listeners when hide is disabled', async () => {
    const { app, runtime } = await mountMain()
    const element = app.get<HTMLElement>('.tab-button').element
    visible(element)
    runtime.updateKeybinding({ commandId: 'app.hide', enabled: false })
    await press(app.element, 'F', { shiftKey: true })
    await press(app.element, 'z')
    expect(element.dataset.quickJumpActive).toBeUndefined()

    await press(app.element, 'Escape', { shiftKey: true })
    expect(hide).not.toHaveBeenCalled()
    expect(app.find('.quick-jump-top-layer').exists()).toBe(true)

    const listener = vi.fn()
    app.element.addEventListener('keydown', listener)
    expect((await press(app.element, 'Escape')).defaultPrevented).toBe(true)
    expect(element.dataset.quickJumpActive).toBe('true')
    expect(app.find('.quick-jump-top-layer').exists()).toBe(true)

    await press(app.element, 'Escape')
    expect(app.find('.quick-jump-top-layer').exists()).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('activates a registered port through the page focus command with a stable target', async () => {
    const { app, runtime } = await mountMain()
    await vi.waitFor(() => expect(app.find('.port-row').exists()).toBe(true))
    const port = app.get<HTMLElement>('.port-row').element
    visible(port)
    const click = vi.fn()
    port.addEventListener('click', click)

    await press(app.element, 'f')
    await press(app.element, 'Enter')

    expect(runtime.focusPort).toHaveBeenCalledExactlyOnceWith('23:4310:tcp')
    expect(runtime.dispatch).toHaveBeenCalledWith('codex.quickJump.activate', {
      source: 'manual-quick-jump',
      navigationIntent: {
        revision: 'navigation-intent-v7', commandId: 'ports.port.focus', source: 'quick-jump', disposition: 'focus',
        target: { featureId: 'ports', surfaceId: 'main', kind: 'port', key: '23:4310:tcp' }
      }
    })
    expect(click).not.toHaveBeenCalled()
  })

  it('drops a business target that becomes unavailable while its marker is open', async () => {
    const { app, runtime } = await mountMain()
    await vi.waitFor(() => expect(app.find('.port-row').exists()).toBe(true))
    const port = app.get<HTMLElement>('.port-row').element
    visible(port)
    await press(app.element, 'f')

    port.style.pointerEvents = 'none'
    await press(app.element, 'Enter')

    expect(runtime.focusPort).not.toHaveBeenCalled()
    expect(app.find('.quick-jump-top-layer').exists()).toBe(false)
  })

  it('selects the Settings tab by marker and lets the recorder capture tab shortcuts', async () => {
    const { app, runtime } = await mountMain()
    const settingsTab = app.get<HTMLElement>('.top-tabs .tab-button[title^="设置 ·"]')
    visible(settingsTab.element)
    await press(app.element, 'f')
    await press(app.element, 'Enter')
    expect(runtime.dispatch).toHaveBeenCalledWith('tab.select.settings', expect.objectContaining({ source: 'manual-quick-jump' }))
    expect(runtime.snapshot().state.activeTab).toBe('settings')

    await app.get('[data-command-id="app.hide"] button[aria-label="录制"]').trigger('click')
    const recorder = app.get<HTMLElement>('.shortcut-recorder')
    await press(recorder.element, '!', { code: 'Digit1', ctrlKey: true, shiftKey: true })
    expect(recorder.get('kbd').text()).toBe(formatShortcutLabel('Ctrl+Shift+1'))
    expect(runtime.snapshot().state.activeTab).toBe('settings')
  })

  it('dispatches the existing drawer selection with its port identity and command arguments', async () => {
    const { app, runtime } = await mountMain()
    await vi.waitFor(() => expect(app.find('.port-row').exists()).toBe(true))
    runtime.dispatch('ports.drawer.open', { portId: '23:4310:tcp' })
    await nextTick()
    const action = app.get<HTMLElement>('.port-context-panel button.drawer-action').element
    visible(action)

    await press(app.element, 'f')
    await press(app.element, 'Enter')

    expect(runtime.dispatch).toHaveBeenCalledWith('ports.drawer.select.1', {
      portId: '23:4310:tcp',
      source: 'manual-quick-jump',
      navigationIntent: expect.objectContaining({
        commandId: 'ports.kill.confirm',
        source: 'quick-jump',
        target: { featureId: 'ports', surfaceId: 'main', kind: 'port', key: '23:4310:tcp' }
      })
    })
    expect(runtime.snapshot().portDrawer.open).toBe(false)
    expect(runtime.snapshot().confirm).toBeTruthy()
  })

  it('retains DOM activation for an ordinary control', async () => {
    const { app } = await mountMain()
    const help = app.get<HTMLElement>('.tab-help-trigger').element
    visible(help)
    const click = vi.fn()
    help.addEventListener('click', click)

    await press(app.element, 'f')
    await press(app.element, 'a')

    expect(click).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(help)
    expect(app.find('.quick-jump-top-layer').exists()).toBe(false)
  })
})
