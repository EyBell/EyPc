import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const requireModule = createRequire(import.meta.url)

describe('favorite file bridge source', () => {
  function loadPreload(
    platform: NodeJS.Platform,
    execFile: (...args: unknown[]) => void,
    utools?: Record<string, unknown>,
    electronShell?: Record<string, unknown>,
    fsOverrides: Record<string, unknown> = {}
  ) {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const sandbox = {
      window: {},
      globalThis: {},
      process: { platform, env: {} },
      setTimeout,
      clearTimeout,
      utools,
      require(name: string) {
        if (name === 'node:buffer') return requireModule('node:buffer')
        if (name === 'node:crypto') return requireModule('node:crypto')
        if (name === 'node:child_process') return { execFile }
        if (name === 'node:fs') {
          return {
            constants: { R_OK: 4 },
            statSync: () => ({ isFile: () => false }),
            promises: {
              readdir: async () => [],
              lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 12, mtimeMs: 34 }),
              stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 12, mtimeMs: 34 }),
              access: async () => undefined
            },
            ...fsOverrides
          }
        }
        if (name === 'node:path') return requireModule('node:path')
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { shell: electronShell }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    return sandbox.window as { eypcPlatform: { files: Record<string, any> } }
  }

  it('splits file and folder multi-selection dialogs and keeps directory reads non-recursive', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')

    expect(preload).toContain('async function pickFavoritePaths(kind)')
    expect(preload).toContain("const properties = kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']")
    expect(preload).not.toContain("properties: ['openFile', 'openDirectory', 'multiSelections']")
    expect(preload).toContain('async function listFavoriteDirectory')
    expect(preload).toContain('withFileTypes: true')
    expect(preload).toContain('pickFavorites: pickFavoritePaths')
    expect(preload).toContain('listDirectory: listFavoriteDirectory')
  })

  it('packages the uTools preload bridge in a CommonJS package scope', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { type?: string }
    const pluginJson = JSON.parse(readFileSync(resolve(process.cwd(), 'public/plugin.json'), 'utf8')) as { preload?: string }
    const publicPackageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'public/package.json'), 'utf8')) as { type?: string }
    const prepareScript = readFileSync(resolve(process.cwd(), 'scripts/prepare-utools-runtime.mjs'), 'utf8')
    const validateScript = readFileSync(resolve(process.cwd(), 'scripts/validate-utools-runtime.mjs'), 'utf8')

    expect(packageJson.type).toBe('module')
    expect(pluginJson.preload).toBe('preload.js')
    expect(publicPackageJson.type).toBe('commonjs')
    expect(prepareScript).toContain("const publicPackageJson = resolve(root, 'public/package.json')")
    expect(prepareScript).toContain("const distPackageJson = resolve(distDir, 'package.json')")
    expect(prepareScript).toContain("const pluginSource = resolve(root, 'public/plugin.json')")
    expect(prepareScript).toContain("const distPlugin = resolve(distDir, 'plugin.json')")
    expect(prepareScript).toContain('copyFileSync(pluginSource, distPlugin)')
    expect(prepareScript).toContain("const publicPreload = resolve(root, 'public/preload.js')")
    expect(prepareScript).toContain("const distPreload = resolve(distDir, 'preload.js')")
    expect(validateScript).toContain("['index.html', 'float.html', 'plugin.json', 'package.json', 'preload.js', 'float-preload.js', 'logo.svg']")
    expect(validateScript).toContain("readFileSync(resolve(distDir, 'preload.js'), 'utf8')")
    expect(validateScript).toContain("dist package.json type must be commonjs")
    expect(validateScript).toContain('public preload.js must match preload/index.js')
    expect(validateScript).toContain('dist preload.js must match preload/index.js')
  })

  it('prefers Electron openPath and preserves spaces and Unicode arguments', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const openPath = vi.fn(async () => '')
    const window = loadPreload('darwin', (command, args, _options, callback) => {
      calls.push({ command: String(command), args: args as string[] })
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(null, '', '')
    }, undefined, { openPath })

    await expect(window.eypcPlatform.files.open('/Users/demo/空 格.txt')).resolves.toMatchObject({ outcome: 'success' })

    expect(openPath).toHaveBeenCalledWith('/Users/demo/空 格.txt')
    expect(calls).toEqual([])
  })

  it('reports macOS favorite open failures instead of hiding them as success', async () => {
    const window = loadPreload('darwin', (_command, _args, _options, callback) => {
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(new Error('open failed'), '', 'missing')
    })

    await expect(window.eypcPlatform.files.open('/Users/demo/Missing File.txt')).resolves.toMatchObject({ outcome: 'failed' })
  })

  it('reveals macOS files when their extension has no default opener', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const window = loadPreload('darwin', (command, args, _options, callback) => {
      calls.push({ command: String(command), args: args as string[] })
      const argv = args as string[]
      const unsupportedOpen = argv.length === 1 && argv[0].endsWith('.upxs')
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(unsupportedOpen ? new Error('no opener') : null, '', '')
    })

    await expect(window.eypcPlatform.files.open('/Users/demo/EyPc-1.0.0.upxs')).resolves.toMatchObject({ outcome: 'revealed-instead' })

    expect(calls).toEqual([
      { command: '/usr/bin/open', args: ['/Users/demo/EyPc-1.0.0.upxs'] },
      { command: '/usr/bin/open', args: ['-R', '/Users/demo/EyPc-1.0.0.upxs'] }
    ])
  })

  it('falls back to uTools reveal when the macOS native reveal command fails', async () => {
    const revealed: string[] = []
    const window = loadPreload(
      'darwin',
      (_command, _args, _options, callback) => {
        ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(new Error('native reveal failed'), '', '')
      },
      {
        shellOpenPath: () => {
          throw new Error('should prefer reveal')
        },
        shellShowItemInFolder: (target: string) => {
          revealed.push(target)
        }
      }
    )

    await expect(window.eypcPlatform.files.reveal('/Users/demo/EyPc-1.0.0.upxs')).resolves.toMatchObject({ outcome: 'dispatched' })
    expect(revealed).toEqual(['/Users/demo/EyPc-1.0.0.upxs'])
  })

  it('reports void uTools open and reveal calls as dispatched on Linux', async () => {
    const opened: string[] = []
    const revealed: string[] = []
    const window = loadPreload('linux', () => undefined, {
      shellOpenPath: (target: string) => opened.push(target),
      shellShowItemInFolder: (target: string) => revealed.push(target)
    })

    await expect(window.eypcPlatform.files.open('/tmp/-leading name.txt')).resolves.toMatchObject({ outcome: 'dispatched' })
    await expect(window.eypcPlatform.files.reveal('/tmp/-leading name.txt')).resolves.toMatchObject({ outcome: 'dispatched' })
    expect(opened).toEqual(['/tmp/-leading name.txt'])
    expect(revealed).toEqual(['/tmp/-leading name.txt'])
  })

  it('maps Electron openPath rejection and timeout to stable failures', async () => {
    const denied = Object.assign(new Error('access denied'), { code: 'EACCES' })
    const rejectedWindow = loadPreload('win32', () => undefined, undefined, { openPath: vi.fn(async () => { throw denied }) })
    await expect(rejectedWindow.eypcPlatform.files.open('C:\\资料\\说明.txt')).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'permission-denied'
    })

    vi.useFakeTimers()
    try {
      const timeoutWindow = loadPreload('linux', () => undefined, undefined, { openPath: vi.fn(() => new Promise(() => undefined)) })
      const pending = timeoutWindow.eypcPlatform.files.open('/tmp/slow.txt')
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(pending).resolves.toMatchObject({ outcome: 'failed', errorCode: 'timeout' })

      const openPath = vi.fn(async () => '')
      const preflightTimeoutWindow = loadPreload('linux', () => undefined, undefined, { openPath }, {
        promises: {
          readdir: async () => [],
          lstat: () => new Promise(() => undefined),
          stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
          access: async () => undefined
        }
      })
      const stalledPreflight = preflightTimeoutWindow.eypcPlatform.files.open('/mnt/offline/file.txt')
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(stalledPreflight).resolves.toMatchObject({ outcome: 'failed', errorCode: 'timeout' })
      expect(openPath).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves no-handler and macOS native timeout error codes', async () => {
    const noHandlerWindow = loadPreload('linux', () => undefined, undefined, {
      openPath: vi.fn(async () => 'No application is registered to open this file')
    })
    await expect(noHandlerWindow.eypcPlatform.files.open('/tmp/archive.unknown')).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'no-handler'
    })

    const timeout = Object.assign(new Error('operation timed out'), { code: 'ETIMEDOUT' })
    const macWindow = loadPreload('darwin', (_command, _args, _options, callback) => {
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(timeout, '', '')
    })
    await expect(macWindow.eypcPlatform.files.open('/Users/demo/slow.file')).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'timeout'
    })
  })

  it('does not report copyText false as success and treats void hosts as dispatched', async () => {
    const failedWindow = loadPreload('linux', () => undefined, { copyText: () => false })
    await expect(failedWindow.eypcPlatform.files.copyPath('/tmp/a.txt')).resolves.toMatchObject({ outcome: 'failed', errorCode: 'io-error' })

    const dispatchedWindow = loadPreload('linux', () => undefined, { copyText: () => undefined })
    await expect(dispatchedWindow.eypcPlatform.files.copyPath('/tmp/a.txt')).resolves.toMatchObject({ outcome: 'dispatched' })
  })

  it('preflights missing paths before dispatch and exposes stable inspection errors', async () => {
    const opened = vi.fn()
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const window = loadPreload('win32', () => undefined, { shellOpenPath: opened }, undefined, {
      promises: {
        readdir: async () => [],
        lstat: async () => { throw missing },
        stat: async () => { throw missing },
        access: async () => { throw missing }
      }
    })

    await expect(window.eypcPlatform.files.open('\\\\server\\share\\missing.txt')).resolves.toMatchObject({ outcome: 'failed', errorCode: 'not-found' })
    await expect(window.eypcPlatform.files.inspectPaths(['relative.txt'])).resolves.toEqual([
      expect.objectContaining({ path: 'relative.txt', status: 'invalid', errorCode: 'invalid-path' })
    ])
    expect(opened).not.toHaveBeenCalled()
  })

  it('preserves permission inspection errors and describes symlinks without recursive reads', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' })
    const deniedWindow = loadPreload('linux', () => undefined, undefined, undefined, {
      promises: {
        readdir: async () => [],
        lstat: async () => { throw denied },
        stat: async () => { throw denied },
        access: async () => { throw denied }
      }
    })
    await expect(deniedWindow.eypcPlatform.files.inspectPaths(['/private/secret'])).resolves.toEqual([
      expect.objectContaining({ status: 'permission-denied', exists: false, errorCode: 'permission-denied' })
    ])

    const accessDeniedWindow = loadPreload('linux', () => undefined, undefined, undefined, {
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 42, mtimeMs: 84 }),
        stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 42, mtimeMs: 84 }),
        access: async () => { throw denied }
      }
    })
    await expect(accessDeniedWindow.eypcPlatform.files.inspectPaths(['/private/known.txt'])).resolves.toEqual([
      expect.objectContaining({
        path: '/private/known.txt',
        status: 'permission-denied',
        kind: 'file',
        exists: true,
        isSymbolicLink: false,
        size: 42,
        modifiedAt: 84,
        errorCode: 'permission-denied'
      })
    ])

    const targetDeniedWindow = loadPreload('linux', () => undefined, undefined, undefined, {
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true, size: 7, mtimeMs: 8 }),
        stat: async () => { throw denied },
        access: async () => undefined
      }
    })
    await expect(targetDeniedWindow.eypcPlatform.files.inspectPaths(['/private/linked-secret'])).resolves.toEqual([
      expect.objectContaining({
        path: '/private/linked-secret',
        status: 'permission-denied',
        kind: 'other',
        exists: true,
        isSymbolicLink: true,
        linkTargetKind: 'unknown',
        size: 7,
        modifiedAt: 8,
        errorCode: 'permission-denied'
      })
    ])

    const readdir = vi.fn(async () => [{
      name: 'linked-folder',
      isFile: () => false,
      isDirectory: () => false,
      isSymbolicLink: () => true
    }])
    const symlinkWindow = loadPreload('linux', () => undefined, undefined, undefined, {
      promises: {
        readdir,
        lstat: async () => ({ isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true, size: 1, mtimeMs: 2 }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false, size: 3, mtimeMs: 4 }),
        access: async () => undefined
      }
    })
    await expect(symlinkWindow.eypcPlatform.files.listDirectory('/tmp/root')).resolves.toMatchObject({
      ok: true,
      entries: [{ kind: 'folder', name: 'linked-folder', path: '/tmp/root/linked-folder', isSymbolicLink: true, linkTargetKind: 'folder' }]
    })
    expect(readdir).toHaveBeenCalledTimes(1)
  })

  it('omits special and unresolved directory entries instead of labeling them as files', async () => {
    const missing = Object.assign(new Error('missing target'), { code: 'ENOENT' })
    const window = loadPreload('linux', () => undefined, undefined, undefined, {
      promises: {
        readdir: async () => [
          { name: 'service.sock', isFile: () => false, isDirectory: () => false, isSymbolicLink: () => false },
          { name: 'broken-link', isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true }
        ],
        lstat: async (target: string) => ({
          isFile: () => false,
          isDirectory: () => false,
          isSymbolicLink: () => target.endsWith('broken-link'),
          size: 1,
          mtimeMs: 2
        }),
        stat: async () => { throw missing },
        access: async () => undefined
      }
    })

    await expect(window.eypcPlatform.files.listDirectory('/tmp/root')).resolves.toMatchObject({ ok: true, entries: [] })
  })

  it('bounds directory read promises and reports rejection codes', async () => {
    const denied = Object.assign(new Error('access denied'), { code: 'EACCES' })
    const deniedWindow = loadPreload('linux', () => undefined, undefined, undefined, {
      promises: {
        readdir: async () => { throw denied },
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        access: async () => undefined
      }
    })
    await expect(deniedWindow.eypcPlatform.files.listDirectory('/private')).resolves.toMatchObject({
      ok: false,
      errorCode: 'permission-denied'
    })

    vi.useFakeTimers()
    try {
      const timeoutWindow = loadPreload('linux', () => undefined, undefined, undefined, {
        promises: {
          readdir: () => new Promise(() => undefined),
          lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
          stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
          access: async () => undefined
        }
      })
      const pending = timeoutWindow.eypcPlatform.files.listDirectory('/mnt/offline')
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(pending).resolves.toMatchObject({ ok: false, errorCode: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('copies real files through uTools and reports capabilities', async () => {
    const copyFile = vi.fn(() => true)
    const window = loadPreload('linux', () => undefined, { copyFile })

    expect(window.eypcPlatform.files.capabilities).toMatchObject({ open: false, reveal: false, copyItems: true, inspectPaths: true })
    await expect(window.eypcPlatform.files.copyItems(['/tmp/a.txt', '/tmp/空 格.txt'])).resolves.toMatchObject({ outcome: 'success' })
    expect(copyFile).toHaveBeenCalledWith(['/tmp/a.txt', '/tmp/空 格.txt'])
  })

  it('does not report copyFile false or rejection as success', async () => {
    const falseWindow = loadPreload('linux', () => undefined, { copyFile: () => false })
    await expect(falseWindow.eypcPlatform.files.copyItems(['/tmp/a.txt'])).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'io-error'
    })

    const denied = Object.assign(new Error('access denied'), { code: 'EACCES' })
    const rejectedWindow = loadPreload('linux', () => undefined, { copyFile: async () => { throw denied } })
    await expect(rejectedWindow.eypcPlatform.files.copyItems(['/tmp/a.txt'])).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'permission-denied'
    })
  })
})
