import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createWindowSessionCache } = require('../../preload/windows/session-cache.cjs') as {
  createWindowSessionCache(options?: { now?: () => number }): ReturnTypeFactory
}
const { createMacosSpaceBridge } = require('../../preload/windows/macos-space.cjs') as {
  createMacosSpaceBridge(options: { run: FakeRun; cache: ReturnTypeFactory }): ReturnTypeSpaceBridge
}
const { createMacosWindowPlatform } = require('../../preload/windows/macos.cjs') as {
  createMacosWindowPlatform(options: {
    cache: ReturnTypeFactory
    spaceBridge: ReturnTypeSpaceBridge
    run: FakeRun
    protocol: Record<string, unknown>
  }): ReturnTypeMacosPlatform
}
const { createWindowSubsystem } = require('../../preload/windows/index.cjs') as {
  createWindowSubsystem(options: Record<string, unknown>): Record<string, unknown>
}

interface CacheRecord {
  instanceId: string
  liveness: string
  spaceBindings: Array<{ displayUuid: string; spaceId: string; source: string }>
}

interface ReturnTypeFactory {
  observe(window: Record<string, unknown>, evidence?: string): CacheRecord | null
  ensure(window: Record<string, unknown>): CacheRecord | null
  setSpaceBindings(instanceId: string, bindings: unknown[]): unknown[]
  getSpaceBindings(instanceId: string): Array<{ displayUuid: string; spaceId: string; source: string }>
  clearSpaceBindings(instanceId: string): void
  markGone(window: Record<string, unknown>, reason: string): CacheRecord | null
  markIndeterminate(window: Record<string, unknown>, reason: string): CacheRecord | null
  observeInventory(platform: string, windows: Record<string, unknown>[]): void
  getCurrentByDisplay(): Record<string, string>
  snapshot(): CacheRecord[]
}

type FakeRun = (command: string, args: string[], options: { environment: Record<string, string> }) => Promise<{ ok: boolean; stdout: string; stderr?: string; error?: string }>

interface ReturnTypeSpaceBridge {
  parseMacWindow(window: Record<string, unknown>): { instanceId: string } | null
  resolve(window: Record<string, unknown>, shouldSwitch: boolean): Promise<Record<string, unknown>>
  prepare(window: Record<string, unknown>, options?: { switch?: boolean; forceRefresh?: boolean }): Promise<Record<string, unknown>>
}

interface ReturnTypeMacosPlatform {
  probeInstance(window: Record<string, unknown>): Promise<Record<string, unknown>>
}

const edgeA = {
  instanceId: 'darwin:44:1001',
  nativeRef: '44:0:1001',
  platform: 'darwin',
  pid: 44,
  appId: 'com.microsoft.edgemac',
  appName: 'Microsoft Edge'
}

describe('window preload subsystem', () => {
  it('keeps same-app roots as separate native cache records', () => {
    let now = 100
    const cache = createWindowSessionCache({ now: () => ++now })
    cache.observe(edgeA)
    cache.observe({ ...edgeA, instanceId: 'darwin:44:1002', nativeRef: '44:0:1002' })

    expect(cache.snapshot().map((record) => record.instanceId)).toEqual(['darwin:44:1001', 'darwin:44:1002'])
    expect(cache.snapshot().every((record) => record.liveness === 'verified-live')).toBe(true)
  })

  it('marks an omitted projection temporarily unobserved without deleting its precise record', () => {
    const cache = createWindowSessionCache()
    const edgeB = { ...edgeA, instanceId: 'darwin:44:1002', nativeRef: '44:0:1002' }
    cache.observe(edgeA)
    cache.observe(edgeB)

    cache.observeInventory('darwin', [edgeA])

    expect(cache.snapshot()).toEqual([
      expect.objectContaining({ instanceId: edgeA.instanceId, nativeRef: edgeA.nativeRef, liveness: 'verified-live' }),
      expect.objectContaining({ instanceId: edgeB.instanceId, nativeRef: edgeB.nativeRef, liveness: 'temporarily-unobserved' })
    ])
  })

  it.each([
    { minimized: true },
    { hidden: true },
    { onscreen: false },
    { bounds: { x: -5000, y: -5000, width: 1000, height: 700 } }
  ])('does not confuse presentation state with native death: %o', (presentation) => {
    const cache = createWindowSessionCache()
    cache.observe({ ...edgeA, ...presentation })
    expect(cache.snapshot()[0]).toMatchObject({ instanceId: edgeA.instanceId, liveness: 'verified-live' })
  })

  it('uses a verified per-window Space binding on the warm path without repeating target resolution', async () => {
    const cache = createWindowSessionCache()
    cache.ensure(edgeA)
    const environments: Array<Record<string, string>> = []
    const run: FakeRun = async (_command, _args, options) => {
      environments.push(options.environment)
      return environments.length === 1
        ? {
            ok: true,
            stdout: JSON.stringify({
              detail: 'switch-confirmed', confirmed: true, switched: true, exactWindow: true,
              bindingCount: 1, bindingSource: 'direct+reverse', managedSpaceCount: 7,
              directBindingCount: 1, reverseBindingCount: 1,
              currentByDisplay: { 'display-1': '4', 'display-2': '9' },
              bindings: [{ displayUuid: 'display-1', spaceId: '4', source: 'direct+reverse' }]
            })
          }
        : { ok: true, stdout: JSON.stringify({ detail: 'current', confirmed: true, switched: false, bindingCount: 1, currentByDisplay: { 'display-1': '4', 'display-2': '10' } }) }
    }
    const bridge = createMacosSpaceBridge({ run, cache })

    await expect(bridge.prepare(edgeA)).resolves.toMatchObject({ cacheHit: false, confirmed: true })
    await expect(bridge.prepare(edgeA)).resolves.toMatchObject({ cacheHit: true, confirmed: true, bindingSource: 'session-cache' })

    expect(environments[0]).toMatchObject({ EYPC_WINDOW_TARGET_PID: '44', EYPC_WINDOW_TARGET_CG_ID: '1001' })
    expect(environments[1].EYPC_WINDOW_SPACE_BINDINGS).toContain('display-1')
    expect(environments[1]).not.toHaveProperty('EYPC_WINDOW_TARGET_CG_ID')
    expect(cache.getCurrentByDisplay()).toEqual({ 'display-1': '4', 'display-2': '10' })
  })

  it('evicts only a stale target binding and resolves that instance once', async () => {
    const cache = createWindowSessionCache()
    cache.ensure(edgeA)
    cache.setSpaceBindings(edgeA.instanceId, [{ displayUuid: 'display-1', spaceId: '4', source: 'direct' }])
    const environments: Array<Record<string, string>> = []
    const run: FakeRun = async (_command, _args, options) => {
      environments.push(options.environment)
      if (environments.length === 1) return { ok: true, stdout: JSON.stringify({ detail: 'cache-stale', bindingCount: 0, currentByDisplay: { 'display-1': '5' } }) }
      return {
        ok: true,
        stdout: JSON.stringify({
          detail: 'current', confirmed: true, exactWindow: true, bindingCount: 1,
          authoritativeAbsence: true, currentByDisplay: { 'display-1': '5' },
          bindings: [{ displayUuid: 'display-1', spaceId: '5', source: 'direct+reverse' }]
        })
      }
    }
    const bridge = createMacosSpaceBridge({ run, cache })

    await expect(bridge.prepare(edgeA)).resolves.toMatchObject({ cacheHit: false, confirmed: true })

    expect(environments).toHaveLength(2)
    expect(environments[0]).not.toHaveProperty('EYPC_WINDOW_TARGET_CG_ID')
    expect(environments[1]).toMatchObject({ EYPC_WINDOW_TARGET_CG_ID: '1001' })
    expect(cache.getSpaceBindings(edgeA.instanceId)).toEqual([{ displayUuid: 'display-1', spaceId: '5', source: 'direct+reverse' }])
  })

  it('requires exact native evidence before reporting an instance gone', async () => {
    const cache = createWindowSessionCache()
    cache.ensure(edgeA)
    const responses = [
      { detail: 'empty-spaces', exactWindow: false, appMatches: true, bindingCount: 0, managedSpaceCount: 0, nativeQueryFailed: true },
      { detail: 'empty-spaces', exactWindow: false, appMatches: true, bindingCount: 0, managedSpaceCount: 7, authoritativeAbsence: false },
      { detail: 'remote', exactWindow: false, appMatches: true, bindingCount: 1, managedSpaceCount: 7 },
      { detail: 'empty-spaces', exactWindow: false, appMatches: true, bindingCount: 0, managedSpaceCount: 7, authoritativeAbsence: true }
    ]
    const bridge = {
      parseMacWindow: () => ({ instanceId: edgeA.instanceId }),
      resolve: async () => responses.shift()!,
      prepare: async () => ({})
    } as unknown as ReturnTypeSpaceBridge
    const platform = createMacosWindowPlatform({
      cache,
      spaceBridge: bridge,
      run: async () => ({ ok: false, stdout: '' }),
      protocol: {}
    })

    await expect(platform.probeInstance(edgeA)).resolves.toMatchObject({ status: 'indeterminate' })
    await expect(platform.probeInstance(edgeA)).resolves.toMatchObject({ status: 'indeterminate' })
    await expect(platform.probeInstance(edgeA)).resolves.toMatchObject({ status: 'live', evidence: 'space-binding' })
    await expect(platform.probeInstance(edgeA)).resolves.toMatchObject({ status: 'gone', reason: 'native-window-absent' })
  })

  it('probes a Win32 HWND by exact PID owner and rejects handle reuse', async () => {
    const responses = [
      { ownerAlive: true, isWindow: true, actualPid: 55 },
      { ownerAlive: true, isWindow: true, actualPid: 77 }
    ]
    const environments: Array<Record<string, string>> = []
    const subsystem = createWindowSubsystem({
      platform: 'win32',
      process: { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, pid: 10, ppid: 9 },
      execFile(
        _command: string,
        _args: string[],
        options: { env: Record<string, string> },
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) {
        environments.push(options.env)
        callback(null, JSON.stringify(responses.shift()), '')
      }
    }) as { probeInstance(window: Record<string, unknown>): Promise<Record<string, unknown>> }
    const window = { instanceId: 'win32:55:1234', nativeRef: '1234', platform: 'win32', pid: 55, appId: 'example.browser' }

    await expect(subsystem.probeInstance(window)).resolves.toMatchObject({ status: 'live', evidence: 'native-owner' })
    await expect(subsystem.probeInstance(window)).resolves.toMatchObject({ status: 'gone', reason: 'owner-mismatch' })

    expect(environments).toHaveLength(2)
    expect(environments[0]).toMatchObject({ EYPC_WINDOW_HANDLE: '1234', EYPC_WINDOW_PID: '55' })
  })

  it('has no top-level native calls or background timers and degrades independently', () => {
    expect(() => createWindowSubsystem({ execFile() { throw new Error('native call at module load') } })).not.toThrow()
    const moduleSources = ['index.cjs', 'native-command.cjs', 'session-cache.cjs', 'macos.cjs', 'macos-space.cjs', 'win32.cjs']
      .map((file) => readFileSync(resolve(process.cwd(), 'preload/windows', file), 'utf8'))
      .join('\n')
    expect(moduleSources).not.toContain('setInterval(')
    expect(moduleSources).not.toContain('dbStorage')
    expect(moduleSources).not.toContain('EYPC_WINDOW_TARGET_TITLE')
  })
})
