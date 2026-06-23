import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('favorite file bridge source', () => {
  function loadPreload(platform: NodeJS.Platform, execFile: (...args: unknown[]) => void, utools?: Record<string, unknown>) {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const sandbox = {
      window: {},
      globalThis: {},
      process: { platform },
      utools,
      require(name: string) {
        if (name === 'node:child_process') return { execFile }
        if (name === 'node:fs') {
          return {
            statSync: () => ({ isFile: () => false }),
            promises: {
              readdir: async () => []
            }
          }
        }
        if (name === 'node:path') return { basename: (value: string) => value.split(/[\\/]/).filter(Boolean).pop() || value }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    return sandbox.window as { eypcPlatform: { files: { open(path: string): Promise<boolean>; reveal(path: string): Promise<boolean> } } }
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
    expect(validateScript).toContain("['index.html', 'plugin.json', 'package.json', 'preload.js', 'logo.svg']")
    expect(validateScript).toContain("readFileSync(resolve(distDir, 'preload.js'), 'utf8')")
    expect(validateScript).toContain("dist package.json type must be commonjs")
  })

  it('opens and reveals macOS favorites through the native open command', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const window = loadPreload('darwin', (command, args, _options, callback) => {
      calls.push({ command: String(command), args: args as string[] })
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(null, '', '')
    })

    await expect(window.eypcPlatform.files.open('/Users/demo/My File.txt')).resolves.toBe(true)
    await expect(window.eypcPlatform.files.reveal('/Users/demo/My File.txt')).resolves.toBe(true)

    expect(calls).toEqual([
      { command: '/usr/bin/open', args: ['/Users/demo/My File.txt'] },
      { command: '/usr/bin/open', args: ['-R', '/Users/demo/My File.txt'] }
    ])
  })

  it('reports macOS favorite open failures instead of hiding them as success', async () => {
    const window = loadPreload('darwin', (_command, _args, _options, callback) => {
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(new Error('open failed'), '', 'missing')
    })

    await expect(window.eypcPlatform.files.open('/Users/demo/Missing File.txt')).resolves.toBe(false)
  })

  it('reveals macOS files when their extension has no default opener', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const window = loadPreload('darwin', (command, args, _options, callback) => {
      calls.push({ command: String(command), args: args as string[] })
      const argv = args as string[]
      const unsupportedOpen = argv.length === 1 && argv[0].endsWith('.upxs')
      ;(callback as (error: Error | null, stdout: string, stderr: string) => void)(unsupportedOpen ? new Error('no opener') : null, '', '')
    })

    await expect(window.eypcPlatform.files.open('/Users/demo/EyPc-1.0.0.upxs')).resolves.toBe(true)

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

    await expect(window.eypcPlatform.files.reveal('/Users/demo/EyPc-1.0.0.upxs')).resolves.toBe(true)
    expect(revealed).toEqual(['/Users/demo/EyPc-1.0.0.upxs'])
  })
})
