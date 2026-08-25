import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const requireModule = createRequire(import.meta.url)

describe('favorite file bridge source', () => {
  function loadPreload(
    platform: NodeJS.Platform,
    execFile: (...args: unknown[]) => void,
    utools?: Record<string, unknown>,
    electronShell?: Record<string, unknown>,
    fsOverrides: Record<string, unknown> = {},
    spawnProcess: (...args: unknown[]) => unknown = vi.fn()
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
        if (name === 'node:child_process') return { execFile, spawn: spawnProcess }
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') {
          return {
            constants: { R_OK: 4 },
            statSync: () => ({ isFile: () => false }),
            promises: {
              readdir: async () => [],
              lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 12, mtimeMs: 34 }),
              stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 12, mtimeMs: 34 }),
              access: async () => undefined,
              writeFile: async () => undefined
            },
            ...fsOverrides
          }
        }
        if (name === 'node:path') return platform === 'win32' ? requireModule('node:path').win32 : requireModule('node:path')
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

  it('starts background runners with shell disabled and preserves structured arguments', async () => {
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const spawnProcess = vi.fn((command: unknown, args: unknown, options: unknown) => {
      calls.push({ command: String(command), args: args as string[], options: options as Record<string, unknown> })
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const window = loadPreload('linux', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === '/usr/bin/node' }),
      accessSync: () => undefined,
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: '/work/demo/run task.js',
      executable: '/usr/bin/node',
      args: ['/work/demo/run task.js', '--name=空 格'],
      cwd: '/work/demo',
      mode: 'background'
    })).resolves.toMatchObject({ outcome: 'started' })

    expect(calls).toEqual([{
      command: '/usr/bin/node',
      args: ['/work/demo/run task.js', '--name=空 格'],
      options: expect.objectContaining({ cwd: '/work/demo', shell: false, detached: true, stdio: 'ignore', windowsHide: true })
    }])
  })

  it('captures background output to a run log and reports the exit code afterwards', async () => {
    const written: string[] = []
    const opened: string[] = []
    let child: (EventEmitter & { unref: () => void }) | null = null
    const spawnProcess = vi.fn((_command: unknown, _args: unknown, options: unknown) => {
      opened.push(JSON.stringify((options as Record<string, unknown>).stdio))
      child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child?.emit('spawn'))
      return child
    })
    const window = loadPreload('linux', () => undefined, { getPath: () => '/data' }, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === '/usr/bin/node' || target === '/work/demo/app.log', size: 12, mtimeMs: 1 }),
      accessSync: () => undefined,
      mkdirSync: () => undefined,
      openSync: () => 7,
      closeSync: () => undefined,
      writeSync: (_fd: number, text: string) => { written.push(text) },
      readdirSync: () => [],
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    const started = await window.eypcPlatform.files.run({
      targetPath: '/work/demo/run.js',
      executable: '/usr/bin/node',
      args: ['/work/demo/run.js'],
      cwd: '/work/demo',
      mode: 'background',
      favoriteId: 'script',
      favoriteName: 'Run',
      declaredLogPath: '/work/demo/app.log'
    })

    expect(started).toMatchObject({ outcome: 'started', declaredLogPath: '/work/demo/app.log' })
    expect(started.logPath).toContain('favorite-runs')
    // Output goes to a file descriptor, not a pipe, so a plugin restart cannot break the child.
    expect(opened).toEqual([JSON.stringify(['ignore', 7, 7])])
    expect(written.join('')).toContain('/usr/bin/node')

    const runs = window.eypcPlatform.files.listRuns()
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ favoriteId: 'script', status: 'running', mode: 'background' })
    expect(runs[0].exitCode).toBeUndefined()

    let notified = 0
    const stop = window.eypcPlatform.files.watchRuns(() => { notified += 1 })
    child!.emit('exit', 3, null)

    const settled = window.eypcPlatform.files.listRuns()
    expect(notified).toBe(1)
    expect(settled[0]).toMatchObject({ status: 'failed', exitCode: 3, declaredLogExists: true })
    stop()
    child!.emit('exit', 0, null)
    expect(notified).toBe(1)
  })

  it('still launches without capture when the run log cannot be opened', async () => {
    const calls: Array<Record<string, unknown>> = []
    const spawnProcess = vi.fn((_command: unknown, _args: unknown, options: unknown) => {
      calls.push(options as Record<string, unknown>)
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const window = loadPreload('linux', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === '/usr/bin/node' }),
      accessSync: () => undefined,
      mkdirSync: () => { throw new Error('read-only') },
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    const started = await window.eypcPlatform.files.run({
      targetPath: '/work/demo/run.js',
      executable: '/usr/bin/node',
      args: ['/work/demo/run.js'],
      cwd: '/work/demo',
      mode: 'background'
    })

    // Degrades to "no log but still a real launch", never to a silent success claim.
    expect(started).toMatchObject({ outcome: 'started' })
    expect(started.logPath).toBeUndefined()
    expect(calls[0]).toMatchObject({ stdio: 'ignore', shell: false, detached: true })
  })

  it('drops a relative or malformed declared log path instead of guessing', async () => {
    const spawnProcess = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const window = loadPreload('linux', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === '/usr/bin/node' }),
      accessSync: () => undefined,
      mkdirSync: () => { throw new Error('read-only') },
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    const started = await window.eypcPlatform.files.run({
      targetPath: '/work/demo/run.js',
      executable: '/usr/bin/node',
      args: ['/work/demo/run.js'],
      cwd: '/work/demo',
      mode: 'background',
      declaredLogPath: 'relative/app.log'
    })

    expect(started).toMatchObject({ outcome: 'started' })
    expect(started.declaredLogPath).toBeUndefined()
  })

  it('uses a controlled macOS terminal adapter without execution-policy bypasses or raw user shell', async () => {
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const spawnProcess = vi.fn((command: unknown, args: unknown, options: unknown) => {
      calls.push({ command: String(command), args: args as string[], options: options as Record<string, unknown> })
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const window = loadPreload('darwin', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === '/bin/sh' || target === '/usr/bin/osascript' }),
      accessSync: () => undefined,
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: '/work/demo/run task.sh',
      executable: '/bin/sh',
      args: ['/work/demo/run task.sh', '--name=空 格'],
      cwd: '/work/demo',
      mode: 'terminal'
    })).resolves.toMatchObject({ outcome: 'dispatched' })

    expect(calls[0].command).toBe('/usr/bin/osascript')
    expect(calls[0].options).toMatchObject({ shell: false, detached: true, windowsHide: false })
    expect(calls[0].args.slice(-4)).toEqual(['/work/demo', '/bin/sh', '/work/demo/run task.sh', '--name=空 格'])
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    expect(preload).not.toContain('-ExecutionPolicy')
    expect(preload).not.toContain('Bypass')
  })

  it('dispatches Windows terminal mode through a static PowerShell adapter and encoded structured payload', async () => {
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const spawnProcess = vi.fn((command: unknown, args: unknown, options: unknown) => {
      calls.push({ command: String(command), args: args as string[], options: options as Record<string, unknown> })
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const executable = 'C:\\Tools\\runner.exe'
    const window = loadPreload('win32', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === powershell || target === executable }),
      accessSync: () => undefined,
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: 'C:\\work\\task.ps1',
      executable,
      args: ['C:\\work\\task.ps1', '--name=空 格'],
      cwd: 'C:\\work',
      mode: 'terminal'
    })).resolves.toMatchObject({ outcome: 'dispatched' })

    expect(calls[0].command).toBe(powershell)
    expect(calls[0].args).toEqual(expect.arrayContaining(['-NoLogo', '-NoProfile', '-NoExit', '-Command']))
    expect(calls[0].args.join(' ')).not.toContain('Bypass')
    expect(calls[0].options).toMatchObject({ shell: false, detached: true, windowsHide: false })
    const payload = JSON.parse(Buffer.from(calls[0].args.at(-1) || '', 'base64').toString('utf8'))
    expect(payload).toEqual({ cwd: 'C:\\work', executable, args: ['C:\\work\\task.ps1', '--name=空 格'] })
    expect(calls[0].args.join(' ')).not.toContain('C:\\work\\task.ps1')
  })

  it('reports unsupported when Linux terminal mode has no known terminal and never falls back to background', async () => {
    const spawnProcess = vi.fn()
    const window = loadPreload('linux', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === '/bin/sh' }),
      accessSync: () => undefined,
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: '/work/task.sh',
      executable: '/bin/sh',
      args: ['/work/task.sh'],
      cwd: '/work',
      mode: 'terminal'
    })).resolves.toMatchObject({ outcome: 'unsupported' })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('rejects relative executable paths and malformed requests before spawning', async () => {
    const spawnProcess = vi.fn()
    const window = loadPreload('linux', () => undefined, undefined, undefined, {}, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: '/work/demo/task.sh',
      executable: './task.sh',
      args: [],
      cwd: '/work/demo',
      mode: 'background'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'invalid-path' })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('maps an inaccessible executable to permission-denied without spawning', async () => {
    const spawnProcess = vi.fn()
    const permissionError = Object.assign(new Error('access denied'), { code: 'EACCES' })
    const window = loadPreload('linux', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: () => ({ isFile: () => true }),
      accessSync: () => { throw permissionError },
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: '/work/demo/task.sh',
      executable: '/work/tools/runner',
      args: [],
      cwd: '/work/demo',
      mode: 'background'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'permission-denied' })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('rejects direct Windows cmd and bat executables so scripts must use explicit cmd.exe arguments', async () => {
    const spawnProcess = vi.fn()
    const executable = 'C:\\work\\task.cmd'
    const window = loadPreload('win32', () => undefined, undefined, undefined, {
      constants: { R_OK: 4, F_OK: 0, X_OK: 1 },
      statSync: (target: string) => ({ isFile: () => target === executable }),
      accessSync: () => undefined,
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile: async () => undefined
      }
    }, spawnProcess)

    await expect(window.eypcPlatform.files.run({
      targetPath: executable,
      executable,
      args: [],
      cwd: 'C:\\work',
      mode: 'background'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'invalid-path' })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('packages the uTools preload bridge in a CommonJS package scope', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { type?: string; scripts?: Record<string, string> }
    const pluginJson = JSON.parse(readFileSync(resolve(process.cwd(), 'public/plugin.json'), 'utf8')) as { preload?: string; features?: Array<{ code?: string; explain?: string; mainHide?: boolean; cmds?: string[] }> }
    const publicPackageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'public/package.json'), 'utf8')) as { type?: string }
    const prepareScript = readFileSync(resolve(process.cwd(), 'scripts/prepare-utools-runtime.mjs'), 'utf8')
    const preloadAssetsScript = readFileSync(resolve(process.cwd(), 'scripts/utools-preload-assets.mjs'), 'utf8')
    const validateScript = readFileSync(resolve(process.cwd(), 'scripts/validate-utools-runtime.mjs'), 'utf8')
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(packageJson.type).toBe('module')
    expect(pluginJson.preload).toBe('preload.js')
    expect(pluginJson.features?.filter((feature) => /^eypc-favorite-slot-(?:[1-9]|10)$/.test(feature.code || '')).map((feature) => ({
      code: feature.code,
      explain: feature.explain,
      mainHide: feature.mainHide,
      command: feature.cmds?.[0]
    }))).toEqual(Array.from({ length: 10 }, (_, index) => ({
      code: `eypc-favorite-slot-${index + 1}`,
      explain: `EyPc 文件槽 ${index + 1}`,
      mainHide: true,
      command: `EyPc 文件槽 ${index + 1}`
    })))
    expect(publicPackageJson.type).toBe('commonjs')
    expect(prepareScript).toContain("const publicPackageJson = resolve(root, 'public/package.json')")
    expect(prepareScript).toContain("const distPackageJson = resolve(distDir, 'package.json')")
    expect(prepareScript).toContain("const pluginSource = resolve(root, 'public/plugin.json')")
    expect(prepareScript).toContain("const distPlugin = resolve(distDir, 'plugin.json')")
    expect(prepareScript).toContain('copyFileSync(pluginSource, distPlugin)')
    expect(prepareScript).toContain("syncUtoolsPreloads(root, 'public')")
    expect(prepareScript).toContain("syncUtoolsPreloads(root, 'dist')")
    expect(preloadAssetsScript).toContain("canonical: 'preload/index.js', public: 'public/preload.js', dist: 'preload.js'")
    expect(preloadAssetsScript).toContain("canonical: 'preload/action.js', public: 'public/action-preload.js', dist: 'action-preload.js'")
    expect(packageJson.scripts?.['generate:contracts']).toBe('node scripts/generate-companion-contracts.mjs')
    expect(packageJson.scripts?.['validate:contracts']).toBe('node scripts/generate-companion-contracts.mjs --check')
    expect(packageJson.scripts?.['sync:preloads']).toBe('pnpm run generate:contracts && node scripts/sync-utools-preloads.mjs')
    // `validate:mirrors` joined the pipeline because the working-tree mirror
    // check that `build` already runs stays green when the *committed* state is
    // broken, and the host loads the committed mirror.
    expect(packageJson.scripts?.verify).toBe('pnpm run sync:preloads && pnpm run test && pnpm run build && pnpm run validate:mirrors')
    expect(validateScript).toContain("['index.html', 'float.html', 'action.html', 'plugin.json', 'package.json', 'preload.js', 'float-preload.js', 'action-preload.js', 'runtime-identity.cjs', 'logo.svg']")
    expect(validateScript).toContain('UTOOLS_PRELOAD_ASSETS.map')
    expect(validateScript).toContain("dist package.json type must be commonjs")
    expect(validateScript).toContain('`${asset.public} must match ${asset.canonical}`')
    expect(validateScript).toContain('`dist/${asset.dist} must match ${asset.canonical}`')
    expect(viteConfig).toContain("return 'vendor-vue'")
    expect(viteConfig).toContain("return 'vendor-markdown'")
    expect(viteConfig).toContain("return 'vendor-icons'")
    expect(viteConfig).toContain('manualChunks: stableVendorChunk')
    expect(validateScript).toContain('const maxJavaScriptChunkBytes = 500_000')
    expect(validateScript).toContain('JavaScript chunks must stay within 500 kB')
    for (const page of ['PortsPage', 'FavoritesPage', 'QuickFavoritesPage', 'WindowsPage', 'MqttPage', 'CodexPage', 'SettingsPage']) {
      expect(appSource).toContain(`const ${page} = defineAsyncComponent(() => import('./pages/${page}.vue'))`)
      expect(appSource).not.toContain(`import ${page} from './pages/${page}.vue'`)
    }
  })

  it('saves JSON text only after the user chooses a target path and reports cancellation', async () => {
    const writeFile = vi.fn(async () => undefined)
    const showSaveDialog = vi.fn(() => '/tmp/mqtt-export.json')
    const window = loadPreload('darwin', () => undefined, { showSaveDialog }, undefined, {
      promises: {
        readdir: async () => [],
        lstat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        stat: async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }),
        access: async () => undefined,
        writeFile
      }
    })

    await expect(window.eypcPlatform.files.saveTextFile({
      suggestedName: 'mqtt-export.json',
      text: '{"ok":true}\n',
      mimeType: 'application/json'
    })).resolves.toMatchObject({ outcome: 'saved' })
    expect(showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'mqtt-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }))
    expect(writeFile).toHaveBeenCalledWith('/tmp/mqtt-export.json', '{"ok":true}\n', { encoding: 'utf8' })

    const cancelledWindow = loadPreload('darwin', () => undefined, { showSaveDialog: () => undefined })
    await expect(cancelledWindow.eypcPlatform.files.saveTextFile({ suggestedName: 'mqtt-export.json', text: '{}' })).resolves.toMatchObject({ outcome: 'cancelled' })
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
