import { afterEach, describe, expect, it, vi } from 'vitest'

describe('browser fallback platform', () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage

  afterEach(() => {
    vi.resetModules()
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true })
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
      portGroups: [{ id: 'group:local', name: 'Local Group', color: '#00A676', entries: ['3000'] }]
    })

    vi.resetModules()
    const second = await import('../../src/platform/eypcPlatform')

    expect(second.getPlatform().storage.getState().portGroups).toEqual([
      { id: 'group:local', name: 'Local Group', color: '#00A676', entries: ['3000'] }
    ])
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
})
