import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('browser fallback platform', () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage
  const originalDocument = globalThis.document

  afterEach(() => {
    vi.resetModules()
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true })
  })

  it.each([
    ['MacIntel', 'macos'],
    ['Win32', 'windows']
  ] as const)('infers %s for a legacy desktop preload without the readiness API', async (navigatorPlatform, expectedPlatform) => {
    globalThis.window = {
      navigator: { platform: navigatorPlatform },
      eypcPlatform: {
        storage: {},
        files: {},
        clipboard: {},
        codex: {
          readSnapshot: async () => ({ ok: false, error: { code: 'unavailable', message: 'not used' }, receivedAt: Date.now() })
        },
        float: {},
        app: { hide: async () => true },
        getEnterPayload: () => null,
        clearEnterPayload: () => undefined
      }
    } as unknown as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    expect(getPlatform().codex.taskStateRevision).toBe('legacy')
    await expect(getPlatform().codex.inspectEnvironment()).resolves.toMatchObject({
      platform: expectedPlatform,
      runtimeState: 'missing',
      runtimeSource: 'unknown',
      connectionState: 'not-checked',
      desktopBridgeState: 'not-checked'
    })
  })

  it('forwards the exact task-state revision exposed by the current preload', async () => {
    globalThis.window = {
      navigator: { platform: 'MacIntel' },
      eypcPlatform: {
        storage: {},
        files: {},
        clipboard: {},
        codex: {
          taskStateRevision: 'task-state-v3',
          readSnapshot: async () => ({ ok: false, error: { code: 'unavailable', message: 'not used' }, receivedAt: Date.now() })
        },
        float: {},
        app: { hide: async () => true },
        getEnterPayload: () => null,
        clearEnterPayload: () => undefined
      }
    } as unknown as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    expect(getPlatform().codex.taskStateRevision).toBe('task-state-v3')
  })

  it('does not claim a legacy compatibility state when the desktop preload has no Codex snapshot bridge', async () => {
    globalThis.window = {
      navigator: { platform: 'MacIntel' },
      eypcPlatform: {
        storage: {},
        files: {},
        clipboard: {},
        codex: {},
        float: {},
        app: { hide: async () => true },
        getEnterPayload: () => null,
        clearEnterPayload: () => undefined
      }
    } as unknown as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    expect(getPlatform().codex.taskStateRevision).toBeUndefined()
    await expect(getPlatform().codex.inspectEnvironment()).resolves.toMatchObject({
      platform: 'unsupported',
      runtimeState: 'unsupported',
      connectionState: 'not-checked',
      desktopBridgeState: 'not-checked'
    })
  })

  it('degrades a stale preload that has not yet exposed the window bridge', async () => {
    globalThis.window = {
      navigator: { platform: 'MacIntel' },
      eypcPlatform: {
        storage: {},
        files: {},
        clipboard: {},
        codex: {},
        float: {},
        app: { hide: async () => true },
        getEnterPayload: () => null,
        clearEnterPayload: () => undefined
      }
    } as unknown as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    await expect(getPlatform().windows.capabilities()).resolves.toMatchObject({
      platform: 'unsupported',
      supported: false,
      permission: 'unsupported'
    })
    await expect(getPlatform().windows.list()).resolves.toMatchObject({ windows: [] })
  })

  it('keeps macOS window list CG-first with AX fallback in preload source', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    expect(preload).toContain('MACOS_WINDOW_LIST_SCRIPT')
    expect(preload).toContain('MACOS_AX_WINDOW_LIST_SCRIPT')
    expect(preload).toContain('Application(\'System Events\')')
    expect(preload).toContain('ObjC.castRefToObject')
    expect(preload).toContain('applicationProcesses.whose({ backgroundOnly: false })')
    expect(preload).toContain("instanceId: 'darwin:'")
    expect(preload).toContain("ObjC.bindFunction('_AXUIElementGetWindow'")
    expect(preload).toContain('title: title || appName')
    expect(preload).not.toContain('function isNoiseTitle')
    expect(preload).not.toContain('static bool IsNoiseTitle')
    expect(preload).not.toContain("String(pid) + ':' + String(index + 1) + ':0'")
    expect(preload).toMatch(/cgParsed\.windows\.length > 0[\s\S]*preferAx = true/)
    expect(preload).toContain("MACOS_AX_WINDOW_LIST_SCRIPT")
    expect(preload).toContain('已回退到当前桌面窗口列表')
    expect(preload).toContain("completeness: 'complete'")
    expect(preload).toContain("completeness: 'partial'")
    expect(preload).toContain('kCGWindowIsOnscreen is also false for a normal window on another Space')
    expect(preload).not.toContain('minimized: !isOnscreen')
    expect(publicPreload).toBe(preload)
  })

  it('maps macOS AX elements to exact CG ids without title or ordinal identity fallback', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    const activationStart = preload.indexOf('function macosActivateWindowScript')
    const activationEnd = preload.indexOf('function macosCloseWindowScript')
    const activation = preload.slice(activationStart, activationEnd)
    const exactActivationStart = activation.indexOf('function activateExactAxTarget')
    const exactActivationEnd = activation.indexOf('function normalizeTitle')
    const exactActivation = activation.slice(exactActivationStart, exactActivationEnd)
    const closeEnd = preload.indexOf('// Private SkyLight CGS')
    const close = preload.slice(activationEnd, closeEnd > activationEnd ? closeEnd : preload.indexOf('function runWindowCommand'))

    expect(activation).not.toContain('function resolveTargetWindow')
    expect(activation).not.toContain('function currentWindowTitle')
    expect(activation).toContain("ObjC.bindFunction('_AXUIElementGetWindow'")
    expect(activation).toContain('function resolveExactAxTarget')
    expect(activation).toContain('function activateExactAxTarget')
    expect(activation).toContain('function validateExactCgTarget')
    expect(activation).toContain("setAxAttribute(app, 'AXFocusedWindow', target)")
    expect(activation).toContain("addTrace('target', 'ok', 'instance-match')")
    expect(activation).toContain("addTrace('verify', 'ok', 'ax-focused-window')")
    expect(activation).not.toContain('EYPC_WINDOW_TARGET_TITLE')
    expect(activation).not.toContain('title-mismatch')
    expect(activation).not.toContain('targetOrdinal')
    expect(activation).not.toContain('AXWindowNumber')
    expect(close).toContain("ObjC.bindFunction('_AXUIElementGetWindow'")
    expect(close).not.toContain('function resolveTargetWindow')
    expect(close).not.toContain('EYPC_WINDOW_TARGET_TITLE')
    expect(close).not.toContain('AXWindowNumber')
    expect(preload).toContain('function trySwitchMacosSpaceByCGS')
    expect(preload).toContain('SLSCopySpacesForWindows')
    expect(preload).toContain('SLSCopyManagedDisplaySpaces')
    expect(preload).toContain('SLSCopyWindowsWithOptionsAndTags')
    expect(preload).toContain('CFDictionaryGetValue')
    expect(preload).toContain('CFStringGetCString')
    expect(preload).toContain('Display Identifier')
    expect(preload).toContain('macosWindowSpaceCache')
    expect(preload).toContain('macosWarmWindowSpaceCacheFromInventory')
    expect(preload).toContain('macosWindowNumbersOnSpace')
    expect(preload).toContain('macosResolveBindingsByReverseScan')
    expect(preload).toContain("detail: 'current'")
    expect(preload).toContain('macosRemoveLegacySpaceBindingCache')
    expect(preload).toContain('macosCacheSpaceBindings')
    expect(preload).toContain('macosDedupeSpaceBindings')
    expect(preload).toContain('function macosWindowInstanceKey(pid, cgWindowNumber)')
    expect(preload).toContain('return `darwin:${ownerPid}:${wid}`')
    expect(preload).toContain('macosCachedWindowSpaceResolution')
    expect(preload).toContain('trySwitchMacosSpaceFromSessionCache')
    expect(preload).toContain("bindingSource: 'session-cache'")
    expect(activation).toContain('expectedApp')
    expect(activation).toContain("activationReasonCode = 'instance-mismatch'")
    expect(activation).toContain("activationReasonCode = 'identity-unavailable'")
    expect(exactActivation).not.toContain("copyAxAttribute(target, 'AXTitle')")
    expect(preload).not.toContain('EYPC_WINDOW_TARGET_TITLE')
    expect(preload).toContain('nativeInstanceMatches')
    expect(preload).toContain('axInstanceMatches')
    expect(preload).toContain("instanceId: 'darwin:'")
    expect(preload).toContain("WINDOW_BRIDGE_REVISION = 'wj19-native-instance-id'")
    expect(preload).toContain('eypc/macos-window-spaces/v1')
    expect(preload).toContain('macosManagedSpaceSnapshot')
    expect(preload).toContain('MACOS_CGS_SPACE_SETTLE_MS = 120')
    expect(preload).toContain('SLSManagedDisplaySetCurrentSpace')
    expect(preload).toContain('MACOS_CGS_WINDOW_TAG_MASK = 0x7')
    expect(preload).toContain('MACOS_CGS_SPACE_QUERY_MASKS = [0x7, 0x7fffffff]')
    expect(preload).not.toContain('MACOS_CGS_ALL_SPACES_MASK')
    expect(preload).not.toContain('SLSCopyManagedDisplayForSpace')
    expect(preload).not.toContain('CFPropertyListCreateData')
    expect(preload).not.toContain('macosListAllCgWindowNumbers')
    expect(preload).toContain('trySwitchMacosSpaceByCGSInProcess(nativeRef)')
    expect(preload).toContain('async function trySwitchMacosSpace(target)')
    expect(preload).toContain('macosLookupOrResolveWindowSpaceBinding')
    expect(preload).toContain('macosRebuildWindowSpaceCache')
    expect(preload).toContain('macosCacheSpaceBindings(next, instanceKey, bindings)')
    expect(preload).toContain('macosActivateWindowScript(pid, cgWindowNumber)')
    expect(preload).toContain('macosCloseWindowScript(pid, cgWindowNumber)')
    expect(preload).toContain("'ambiguous', 'focus-denied'")
    expect(preload).toContain('allowCurrentSpaceInferred')
    expect(preload).toContain("'current-space-inferred'")
    expect(preload).not.toContain("'cg-ordinal-fallback'")
    expect(preload).not.toContain("'ax-fallback'")
    expect(preload).not.toContain("'process-frontmost'")
    expect(preload).not.toContain("'single-window-frontmost'")
    expect(preload).not.toContain("'walked'")
    expect(preload).not.toContain('function resolveCgOrdinal')
    expect(preload).not.toContain('resolvedByCgOrdinal')
    const nativeActivation = preload.slice(preload.indexOf('async function activateWindow('), preload.indexOf('async function alwaysOnTopWindow('))
    const identityGate = nativeActivation.indexOf('readMacosWindowIdentity(source, { forceRefresh: true })')
    const sessionCacheSwitch = nativeActivation.indexOf('trySwitchMacosSpaceFromSessionCache(nativeRef)')
    expect(identityGate).toBeGreaterThan(-1)
    expect(sessionCacheSwitch).toBeGreaterThan(identityGate)
    expect(publicPreload).toBe(preload)
  })

  it('keeps native window operation traces bounded and debug-gated while exposing real Windows topmost', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    const activationStart = preload.indexOf('const WINDOWS_ACTIVATE_SCRIPT')
    const activationEnd = preload.indexOf('const WINDOWS_CLOSE_SCRIPT')
    const activation = preload.slice(activationStart, activationEnd)

    expect(preload).toContain("EYPC_WINDOW_DEBUG_TRACE")
    expect(activation).toContain("$trace.Count -lt 16")
    expect(activation).toContain("Add-EypcTrace 'restore'")
    expect(activation).toContain("Add-EypcTrace 'foreground'")
    expect(activation).toContain('const WINDOWS_TOPMOST_SCRIPT')
    expect(activation).toContain('SetWindowPos')
    expect(activation).toContain('[IntPtr]::new(-1)')
    expect(activation).toContain('GetWindowThreadProcessId')
    expect(activation).toContain('IsActionableTopLevel')
    expect(activation).toContain("$instanceId = 'win32:'")
    expect(activation).toContain('EYPC_WINDOW_TARGET_APP_ID')
    expect(activation).toContain('EYPC_WINDOW_INSTANCE_ID')
    expect(activation).toContain("Write-EypcOutcome 'activated' '' $instanceId")
    expect(preload).toContain('function parseWindowOperationTrace')
    expect(preload).toContain("stage: 'space'")
    expect(preload).toContain('function macosSpaceTraceStep')
    expect(preload).toContain('function alwaysOnTopWindow')
    expect(preload).toContain('alwaysOnTop: alwaysOnTopWindow')
    expect(preload).toContain('canAlwaysOnTop: true')
    expect(preload).toContain('canAlwaysOnTop: false')
    expect(preload).toContain("macOS 只能展开并前置第三方窗口，不能将其保持在最上层")
    expect(publicPreload).toBe(preload)
  })

  it('filters Windows native handles through the root-owner Alt-Tab chain', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    expect(preload).toContain('IsActionableWindow')
    expect(preload).toContain('GetLastActivePopup')
    expect(preload).toContain('WS_EX_TOOLWINDOW')
    expect(preload).toContain('WS_EX_NOACTIVATE')
    expect(preload).toContain('GetAncestor(hWnd, GA_ROOT)')
  })

  it('persists fallback state through localStorage across module reloads', async () => {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) }
      },
      configurable: true
    })
    globalThis.window = {} as Window & typeof globalThis

    const first = await import('../../src/platform/eypcPlatform')
    const firstPlatform = first.getPlatform()
    firstPlatform.storage.setState({
      ...firstPlatform.storage.getState(),
      portGroups: [{ id: 'group:local', name: 'Local Group', color: '#00A676', entries: ['3000'], folderId: null, sortOrder: 1 }]
    })

    vi.resetModules()
    const second = await import('../../src/platform/eypcPlatform')

    expect(second.getPlatform().storage.getState().portGroups).toEqual([
      { id: 'group:local', name: 'Local Group', color: '#00A676', entries: ['3000'], folderId: null, sortOrder: 1 }
    ])
  })

  it('persists MQTT archive through a separate fallback storage key', async () => {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) }
      },
      configurable: true
    })
    globalThis.window = {} as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')
    const platform = getPlatform()
    expect(platform.storage.getMqttArchive()).toEqual({ version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] })
    platform.storage.setMqttArchive({
      version: 1,
      connectionSnapshots: [],
      sessions: [{ id: 's1', connectionId: 'c1', title: 'Session', startedAt: 1, messages: [] }],
      publishTemplates: [],
      publishDraftHistory: [{ id: 'hist1', connectionId: 'c1', title: 'Draft', topic: 'out', payload: 'draft', qos: 0, retain: false, source: 'manual', createdAt: 1, updatedAt: 2 }]
    })

    expect(store.has('eypc/state/v1')).toBe(false)
    expect(JSON.parse(store.get('eypc/mqtt/archive/v1') || '{}')).toMatchObject({
      sessions: [{ id: 's1', connectionId: 'c1', title: 'Session' }],
      publishDraftHistory: [{ id: 'hist1', topic: 'out', payload: 'draft' }]
    })
    expect(platform.storage.getMqttStorageStatus()).toMatchObject({
      mode: 'browser-localStorage',
      sqliteAvailable: false
    })
  })

  it('persists MQTT secrets through a local-only fallback key', async () => {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) }
      },
      configurable: true
    })
    globalThis.window = {} as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')
    const platform = getPlatform()
    expect(platform.storage.getMqttSecrets()).toEqual({})

    platform.storage.setMqttSecrets({ 'config-a': 'local-secret' })

    expect(store.has('eypc/state/v1')).toBe(false)
    expect(store.has('eypc/mqtt/archive/v1')).toBe(false)
    expect(JSON.parse(store.get('eypc/mqtt/secrets-local/v1') || '{}')).toEqual({
      version: 1,
      secrets: { 'config-a': 'local-secret' }
    })
    expect(platform.storage.getMqttSecrets()).toEqual({ 'config-a': 'local-secret' })
  })

  it('scans ports through the Vite dev API when uTools preload is unavailable', async () => {
    globalThis.window = {} as Window & typeof globalThis
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/__eypc__/ports/scan')
      return {
        ok: true,
        json: async () => ({
          ports: [
            { id: '87822:8081:tcp', pid: 87822, port: 8081, command: 'node', address: '[::1]:8081', protocol: 'tcp', state: 'LISTEN' }
          ]
        })
      } as Response
    })

    const { getPlatform } = await import('../../src/platform/eypcPlatform')
    await expect(getPlatform().ports.scan()).resolves.toEqual([
      { id: '87822:8081:tcp', pid: 87822, port: 8081, command: 'node', address: '[::1]:8081', protocol: 'tcp', state: 'LISTEN' }
    ])
  })

  it('kills ports through the Vite dev API when uTools preload is unavailable', async () => {
    globalThis.window = {} as Window & typeof globalThis
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/__eypc__/ports/kill')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ pid: 87822, port: 8081, force: true })
      return {
        ok: true,
        json: async () => ({ ok: true, pid: 87822, port: 8081, force: true })
      } as Response
    })

    const { getPlatform } = await import('../../src/platform/eypcPlatform')
    await expect(getPlatform().ports.kill({ pid: 87822, port: 8081, force: true })).resolves.toEqual({
      ok: true,
      pid: 87822,
      port: 8081,
      force: true
    })
  })

  it('exposes a safe browser fallback for hiding the host window', async () => {
    globalThis.window = {} as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')
    await expect(getPlatform().app.hide()).resolves.toBe(false)
  })

  it('exposes safe browser fallbacks for split multi-pick and directory listing', async () => {
    globalThis.window = {} as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')
    expect(getPlatform().files.capabilities).toMatchObject({ open: false, reveal: false, copyItems: false, listDirectory: false, inspectPaths: false })
    await expect(getPlatform().files.open('/tmp/demo')).resolves.toMatchObject({ outcome: 'failed', errorCode: 'unsupported' })
    await expect(getPlatform().files.copyItems?.(['/tmp/demo'])).resolves.toMatchObject({ outcome: 'failed', errorCode: 'unsupported' })
    await expect(getPlatform().files.inspectPaths?.(['/tmp/demo'])).resolves.toEqual([
      expect.objectContaining({ path: '/tmp/demo', status: 'unknown', errorCode: 'unsupported' })
    ])
    await expect(getPlatform().files.pickFavorites?.('file')).resolves.toEqual([])
    await expect(getPlatform().files.pickFavorites?.('folder')).resolves.toEqual([])
    await expect(getPlatform().files.listDirectory('/tmp')).resolves.toEqual({
      ok: false,
      entries: [],
      error: 'directory listing unavailable',
      errorCode: 'unsupported'
    })
  })

  it('uses a browser file input fallback when preload path picking is unavailable', async () => {
    globalThis.window = {} as Window & typeof globalThis
    const listeners = new Map<string, () => void>()
    const input = {
      type: '',
      multiple: false,
      files: [
        { name: 'readme.md', path: '/tmp/readme.md' },
        { name: 'guide.md', path: '/tmp/guide.md' }
      ],
      style: {},
      setAttribute: vi.fn(),
      remove: vi.fn(),
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, listener)
      }),
      click: vi.fn(() => {
        listeners.get('change')?.()
      })
    }
    const appendChild = vi.fn()
    globalThis.document = {
      createElement: vi.fn(() => input),
      body: { appendChild }
    } as unknown as Document

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    await expect(getPlatform().files.pickFavorites?.('file')).resolves.toEqual([
      { kind: 'file', path: '/tmp/readme.md', name: 'readme.md', parentId: null, tags: [], color: '#F2994A' },
      { kind: 'file', path: '/tmp/guide.md', name: 'guide.md', parentId: null, tags: [], color: '#F2994A' }
    ])
    expect(input.type).toBe('file')
    expect(input.multiple).toBe(true)
    expect(appendChild).toHaveBeenCalledWith(input)
    expect(input.click).toHaveBeenCalled()
    expect(input.remove).toHaveBeenCalled()
  })
})
