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
          taskStateRevision: 'task-state-v6',
          readSnapshot: async () => ({ ok: false, error: { code: 'unavailable', message: 'not used' }, receivedAt: Date.now() })
        },
        float: {},
        app: { hide: async () => true },
        getEnterPayload: () => null,
        clearEnterPayload: () => undefined
      }
    } as unknown as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    expect(getPlatform().codex.taskStateRevision).toBe('task-state-v6')
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

  it('admits macOS product rows only from exact AX windows with CG identity corroboration', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    const macos = readFileSync(resolve(process.cwd(), 'preload/windows/macos.cjs'), 'utf8')
    const publicMacos = readFileSync(resolve(process.cwd(), 'public/windows/macos.cjs'), 'utf8')
    const windowIndex = readFileSync(resolve(process.cwd(), 'preload/windows/index.cjs'), 'utf8')
    const win32 = readFileSync(resolve(process.cwd(), 'preload/windows/win32.cjs'), 'utf8')
    const windowSources = `${windowIndex}\n${macos}\n${win32}`

    expect(preload).not.toContain('MACOS_AX_WINDOW_LIST_SCRIPT')
    expect(macos).toContain('MACOS_AX_WINDOW_LIST_SCRIPT')
    expect(macos).not.toContain('MACOS_WINDOW_LIST_SCRIPT')
    expect(windowSources).not.toContain('Application(\'System Events\')')
    expect(macos).toContain('ObjC.castRefToObject')
    expect(macos).toContain('NSWorkspace.sharedWorkspace.runningApplications')
    expect(macos).toContain('running.activationPolicy')
    expect(macos).toContain("copyAxAttributeResult(appElement, 'AXWindows')")
    expect(macos).toContain('CGWindowListCopyWindowInfo')
    expect(macos).toContain('cgSurfaceKeys')
    expect(macos).toContain("instanceId: 'darwin:'")
    expect(macos).toContain("ObjC.bindFunction('_AXUIElementGetWindow'")
    expect(windowIndex).toContain('title: title || appName')
    expect(macos).toContain("role === 'AXSheet' || role === 'AXDialog'")
    expect(windowSources).not.toContain('function isNoiseTitle')
    expect(windowSources).not.toContain('static bool IsNoiseTitle')
    expect(windowSources).not.toContain("String(pid) + ':' + String(index + 1) + ':0'")
    expect(windowSources).not.toContain('preferAx')
    expect(macos).toContain('未显示任何未验证表面')
    expect(win32).toContain("completeness: 'complete'")
    expect(macos).toContain("completeness: 'partial'")
    expect(windowSources).not.toContain('kCGWindowIsOnscreen')
    expect(publicPreload).toBe(preload)
    expect(publicMacos).toBe(macos)
  })

  it('maps macOS members to an exact root CG window with session Space cache and no title, ordinal, or unique-candidate fallback', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    const windowIndex = readFileSync(resolve(process.cwd(), 'preload/windows/index.cjs'), 'utf8')
    const publicWindowIndex = readFileSync(resolve(process.cwd(), 'public/windows/index.cjs'), 'utf8')
    const macos = readFileSync(resolve(process.cwd(), 'preload/windows/macos.cjs'), 'utf8')
    const publicMacos = readFileSync(resolve(process.cwd(), 'public/windows/macos.cjs'), 'utf8')
    const spaceBridge = readFileSync(resolve(process.cwd(), 'preload/windows/macos-space.cjs'), 'utf8')
    const publicSpaceBridge = readFileSync(resolve(process.cwd(), 'public/windows/macos-space.cjs'), 'utf8')
    const windowDomain = readFileSync(resolve(process.cwd(), 'src/domain/windows.ts'), 'utf8')
    const activation = macos.slice(macos.indexOf('function macosActivateWindowScript'), macos.indexOf('function macosCloseWindowScript'))
    const windowSources = `${windowIndex}\n${macos}\n${spaceBridge}`

    expect(preload).toContain("WINDOW_BRIDGE_REVISION = 'wj22-native-instance-space-cache'")
    expect(windowIndex).toContain("WINDOW_BRIDGE_REVISION = 'wj22-native-instance-space-cache'")
    expect(preload).toContain("require('./windows/index.cjs')")
    expect(preload).not.toContain('function coalesceNativeWindowFamilies')
    expect(windowDomain).toContain('export function coalesceNativeWindowFamilies')
    expect(macos).toContain('rootInstanceId')
    expect(macos).toContain('rootNativeRef')
    expect(macos).toContain("copyAxAttribute(element, 'AXWindow')")
    expect(macos).toContain("copyAxAttribute(element, 'AXTopLevelUIElement')")
    expect(activation).toContain("ObjC.bindFunction('_AXUIElementGetWindow'")
    expect(activation).toContain('function resolveRootAxTarget')
    expect(activation).toContain('function rootCgWindowNumber')
    expect(activation).toContain("copyAxAttribute(app, 'AXFocusedWindow')")
    expect(activation).toContain("addTrace('verify', 'ok', 'ax-focused-root-window')")
    expect(activation).toContain("activationReasonCode = 'instance-mismatch'")
    expect(activation).toContain("activationReasonCode = 'member-mismatch'")
    expect(activation).toContain("activationReasonCode = 'identity-unavailable'")
    expect(activation).toContain('memberCgWindowNumber')
    expect(activation).toContain('memberInstanceId')
    expect(windowSources).not.toContain('EYPC_WINDOW_TARGET_TITLE')
    expect(windowSources).not.toContain('title-mismatch')
    expect(windowSources).not.toContain('targetOrdinal')
    expect(windowSources).not.toContain('resolveCgOrdinal')
    expect(spaceBridge).toContain('SLSCopySpacesForWindows')
    expect(spaceBridge).toContain('SLSCopyManagedDisplaySpaces')
    expect(spaceBridge).toContain('SLSManagedDisplaySetCurrentSpace')
    expect(spaceBridge).toContain('EYPC_WINDOW_SPACE_BINDINGS')
    expect(spaceBridge).not.toContain('EYPC_WINDOW_TARGET_TITLE')
    expect(preload).not.toContain('MACOS_ENV_SNAPSHOT_SCRIPT')
    expect(preload).not.toContain('inspectWindowEnvironment')
    expect(preload).not.toContain('function macosActivateWindowScript')
    expect(publicPreload).toBe(preload)
    expect(publicWindowIndex).toBe(windowIndex)
    expect(publicMacos).toBe(macos)
    expect(publicSpaceBridge).toBe(spaceBridge)
  })

  it('keeps native window operation traces bounded and debug-gated while exposing real Windows topmost', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    const windowIndex = readFileSync(resolve(process.cwd(), 'preload/windows/index.cjs'), 'utf8')
    const win32 = readFileSync(resolve(process.cwd(), 'preload/windows/win32.cjs'), 'utf8')
    const publicWin32 = readFileSync(resolve(process.cwd(), 'public/windows/win32.cjs'), 'utf8')
    const macos = readFileSync(resolve(process.cwd(), 'preload/windows/macos.cjs'), 'utf8')
    const activationStart = win32.indexOf('const WINDOWS_ACTIVATE_SCRIPT')
    const activationEnd = win32.indexOf('const WINDOWS_CLOSE_SCRIPT')
    const activation = win32.slice(activationStart, activationEnd)

    expect(windowIndex).toContain("EYPC_WINDOW_DEBUG_TRACE")
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
    expect(windowIndex).toContain('function parseOperationTrace')
    expect(windowIndex).toContain("'ax-focused-root-window'")
    expect(win32).toContain('async function alwaysOnTop')
    expect(windowIndex).toContain('alwaysOnTop,')
    expect(windowIndex).toContain('canAlwaysOnTop: true')
    expect(windowIndex).toContain('canAlwaysOnTop: false')
    expect(macos).toContain("macOS 只能展开并前置第三方窗口，不能将其保持在最上层")
    expect(preload).not.toContain('const WINDOWS_ACTIVATE_SCRIPT')
    expect(publicPreload).toBe(preload)
    expect(publicWin32).toBe(win32)
  })

  it('filters Windows native handles through the root-owner Alt-Tab chain', () => {
    const win32 = readFileSync(resolve(process.cwd(), 'preload/windows/win32.cjs'), 'utf8')
    expect(win32).toContain('IsActionableWindow')
    expect(win32).toContain('GetLastActivePopup')
    expect(win32).toContain('GA_ROOTOWNER')
    expect(win32).toContain('GetAncestor($foreground, 3)')
    expect(win32).toContain("'root-family-match'")
    expect(win32).toContain('WS_EX_TOOLWINDOW')
    expect(win32).toContain('WS_EX_NOACTIVATE')
    expect(win32).toContain('GetAncestor(hWnd, GA_ROOT)')
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
