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
          taskStateRevision: 'task-state-v4',
          readSnapshot: async () => ({ ok: false, error: { code: 'unavailable', message: 'not used' }, receivedAt: Date.now() })
        },
        float: {},
        app: { hide: async () => true },
        getEnterPayload: () => null,
        clearEnterPayload: () => undefined
      }
    } as unknown as Window & typeof globalThis

    const { getPlatform } = await import('../../src/platform/eypcPlatform')

    expect(getPlatform().codex.taskStateRevision).toBe('task-state-v4')
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
    expect(preload).toContain('MACOS_AX_WINDOW_LIST_SCRIPT')
    expect(preload).not.toContain('MACOS_WINDOW_LIST_SCRIPT')
    expect(preload).not.toContain('Application(\'System Events\')')
    expect(preload).toContain('ObjC.castRefToObject')
    expect(preload).toContain('NSWorkspace.sharedWorkspace.runningApplications')
    expect(preload).toContain('running.activationPolicy')
    expect(preload).toContain("copyAxAttributeResult(appElement, 'AXWindows')")
    expect(preload).toContain('CGWindowListCopyWindowInfo')
    expect(preload).toContain('cgSurfaceKeys')
    expect(preload).toContain("instanceId: 'darwin:'")
    expect(preload).toContain("ObjC.bindFunction('_AXUIElementGetWindow'")
    expect(preload).toContain('title: title || appName')
    expect(preload).toContain("role === 'AXSheet' || role === 'AXDialog'")
    expect(preload).not.toContain('function isNoiseTitle')
    expect(preload).not.toContain('static bool IsNoiseTitle')
    expect(preload).not.toContain("String(pid) + ':' + String(index + 1) + ':0'")
    expect(preload).not.toContain('preferAx')
    expect(preload).toContain('未显示任何未验证表面')
    expect(preload).toContain("completeness: 'complete'")
    expect(preload).toContain("completeness: 'partial'")
    expect(preload).not.toContain('kCGWindowIsOnscreen')
    expect(publicPreload).toBe(preload)
  })

  it('maps macOS members to an exact root CG window without Space, title, ordinal, or unique-candidate fallback', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const publicPreload = readFileSync(resolve(process.cwd(), 'public/preload.js'), 'utf8')
    const windowDomain = readFileSync(resolve(process.cwd(), 'src/domain/windows.ts'), 'utf8')
    const activation = preload.slice(preload.indexOf('function macosActivateWindowScript'), preload.indexOf('function macosCloseWindowScript'))

    expect(preload).toContain("WINDOW_BRIDGE_REVISION = 'wj21-main-child-window-tree'")
    expect(preload).not.toContain('function coalesceNativeWindowFamilies')
    expect(windowDomain).toContain('export function coalesceNativeWindowFamilies')
    expect(preload).toContain('rootInstanceId')
    expect(preload).toContain('rootNativeRef')
    expect(preload).toContain("copyAxAttribute(element, 'AXWindow')")
    expect(preload).toContain("copyAxAttribute(element, 'AXTopLevelUIElement')")
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
    expect(preload).not.toContain('EYPC_WINDOW_TARGET_TITLE')
    expect(preload).not.toContain('title-mismatch')
    expect(preload).not.toContain('targetOrdinal')
    expect(preload).not.toContain('resolveCgOrdinal')
    expect(preload).not.toContain('trySwitchMacosSpace')
    expect(preload).not.toContain('SLSCopySpacesForWindows')
    expect(preload).not.toContain('MACOS_ENV_SNAPSHOT_SCRIPT')
    expect(preload).not.toContain('inspectWindowEnvironment')
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
    expect(preload).toContain("'ax-focused-root-window'")
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
    expect(preload).toContain('GA_ROOTOWNER')
    expect(preload).toContain('GetAncestor($foreground, 3)')
    expect(preload).toContain("'root-family-match'")
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
