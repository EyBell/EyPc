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

    await expect(getPlatform().codex.inspectEnvironment()).resolves.toMatchObject({
      platform: expectedPlatform,
      runtimeState: 'missing',
      runtimeSource: 'unknown',
      connectionState: 'not-checked'
    })
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

    await expect(getPlatform().codex.inspectEnvironment()).resolves.toMatchObject({
      platform: 'unsupported',
      runtimeState: 'unsupported',
      connectionState: 'not-checked'
    })
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
