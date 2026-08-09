import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from '../../scripts/utools-preload-assets.mjs'
import { buildUtoolsRuntimeIdentity } from '../../scripts/utools-runtime-identity.mjs'
import { getPlatform } from '../../src/platform/eypcPlatform'

const expectation = {
  hostAssetId: __EYPC_HOST_ASSET_ID__,
  rendererAssetId: __EYPC_RENDERER_ASSET_ID__,
  kernelRevision: __EYPC_COMPANION_KERNEL_REVISION__,
  taskPackageRevision: __EYPC_COMPANION_TASK_PACKAGE_REVISION__
}

function rawPlatform(overrides: Record<string, unknown> = {}) {
  return {
    storage: {
      getState: () => null,
      setState: () => true,
      getMqttArchive: () => null,
      setMqttArchive: () => true,
      getMqttStorageStatus: () => ({ mode: 'memory' }),
      getMqttSecrets: () => ({}),
      setMqttSecrets: () => true
    },
    ports: { scan: async () => [], kill: async () => ({ ok: false }) },
    windows: {},
    files: {
      open: async () => ({ outcome: 'failed' }),
      reveal: async () => ({ outcome: 'failed' }),
      copyPath: async () => ({ outcome: 'failed' }),
      listDirectory: async () => ({ ok: false, entries: [] }),
      saveTextFile: async () => ({ outcome: 'failed' })
    },
    clipboard: { copyText: async () => false },
    codex: {},
    float: {},
    actionRunner: {},
    app: {},
    ...overrides
  }
}

function runFloatPreload(identity: Record<string, unknown> | null) {
  const source = readFileSync(resolve(process.cwd(), 'preload/float.js'), 'utf8')
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const sent: Array<{ channel: string; payload: unknown }> = []
  const window: Record<string, any> = {}
  const sandbox = {
    window,
    globalThis: {
      utools: {
        sendToParent(channel: string, payload: unknown) {
          sent.push({ channel, payload })
        }
      }
    },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Promise,
    require(name: string) {
      if (name === 'electron') return { ipcRenderer: { on: (channel: string, listener: (...args: unknown[]) => void) => handlers.set(channel, listener) } }
      if (name === './runtime-identity.cjs' && identity) return identity
      throw new Error(`unavailable: ${name}`)
    }
  }
  vm.runInNewContext(source, sandbox, { filename: 'float-preload.js' })
  return { bridge: window.eypcFloat, sent }
}

afterEach(() => {
  delete (globalThis as any).window
})

describe('uTools runtime identity', () => {
  it('changes Renderer identity with its embedded Host contract and with Renderer source only', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'eypc-runtime-identity-'))
    const write = (relativePath: string, content = relativePath) => {
      const file = resolve(root, relativePath)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
    }
    try {
      write('public/plugin.json', '{}')
      for (const asset of [...UTOOLS_PRELOAD_ASSETS, ...UTOOLS_PRELOAD_MODULE_ASSETS]) write(asset.canonical)
      for (const file of ['src/main.ts', 'index.html', 'float.html', 'action.html', 'vite.config.ts', 'package.json']) write(file)

      const baseline = buildUtoolsRuntimeIdentity(root)
      write('preload/index.js', 'changed host')
      const hostChanged = buildUtoolsRuntimeIdentity(root)
      expect(hostChanged.hostAssetId).not.toBe(baseline.hostAssetId)
      expect(hostChanged.rendererAssetId).not.toBe(baseline.rendererAssetId)

      write('src/main.ts', 'changed renderer')
      const rendererChanged = buildUtoolsRuntimeIdentity(root)
      expect(rendererChanged.hostAssetId).toBe(hostChanged.hostAssetId)
      expect(rendererChanged.rendererAssetId).not.toBe(hostChanged.rendererAssetId)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails closed when a new Main UI is paired with an old Preload', () => {
    ;(globalThis as any).window = { eypcPlatform: rawPlatform({
      companionKernel: {
        revision: 'companion-task-kernel-v1',
        packageRevision: 'companion-task-package-v1',
        attach: vi.fn(),
        syncPackage: vi.fn(),
        dispatch: vi.fn(),
        getPackage: vi.fn(),
        diagnostics: vi.fn()
      }
    }) }
    const platform = getPlatform()
    expect(platform.runtimeIdentityStatus).toMatchObject({ status: 'reload-required', errorCode: 'identity-missing' })
    expect(platform.companionKernel).toBeUndefined()
  })

  it('accepts the unified Kernel only after exact Main/Preload identity handshake', () => {
    const kernel = {
      revision: 'companion-task-kernel-v1',
      packageRevision: 'companion-task-package-v1',
      attach: vi.fn(),
      syncPackage: vi.fn(),
      dispatch: vi.fn(),
      getPackage: vi.fn(),
      diagnostics: vi.fn()
    }
    ;(globalThis as any).window = { eypcPlatform: rawPlatform({
      runtimeIdentity: {
        revision: 'runtime-identity-v1',
        handshake: () => ({
          revision: 'runtime-identity-v1',
          status: 'host-loaded',
          expected: expectation,
          actual: expectation,
          kernelRevision: expectation.kernelRevision,
          taskPackageRevision: expectation.taskPackageRevision,
          message: 'loaded'
        })
      },
      companionKernel: kernel
    }) }
    const platform = getPlatform()
    expect(platform.runtimeIdentityStatus?.status).toBe('host-loaded')
    expect(platform.companionKernel).toBe(kernel)
  })

  it('keeps a new Float Preload inert until its UI handshakes and rejects an old child artifact', async () => {
    const currentArtifact = {
      revision: 'runtime-identity-v1',
      artifactState: 'artifact-ready',
      ...expectation
    }
    const current = runFloatPreload(currentArtifact)
    expect(current.bridge.action('codex.task.open', {})).toBe(false)
    await expect(current.bridge.reopenThread('alias')).resolves.toMatchObject({ errorCode: 'reload-required' })
    expect(current.bridge.runtimeIdentity.handshake(expectation)).toMatchObject({ status: 'host-loaded' })
    expect(current.bridge.action('codex.task.open', {})).toBe(true)
    expect(current.sent).toHaveLength(1)

    const oldChild = runFloatPreload({ ...currentArtifact, hostAssetId: 'host-old-child' })
    expect(oldChild.bridge.runtimeIdentity.handshake(expectation)).toMatchObject({ status: 'reload-required' })
    expect(oldChild.bridge.action('codex.task.open', {})).toBe(false)
  })

  it('treats a missing Float identity as reload-required', () => {
    const child = runFloatPreload(null)
    expect(child.bridge.runtimeIdentity.handshake(expectation)).toMatchObject({ status: 'reload-required' })
    expect(child.bridge.action('codex.task.open', {})).toBe(false)
  })
})
