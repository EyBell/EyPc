import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCodexLaunchPlan } = require('../../preload/codex/launch-plan.cjs')
const { createCodexLaunchPathPreference } = require('../../preload/codex/launch-path-preference.cjs')
const { createCodexRuntimeDiagnostics } = require('../../preload/codex/runtime-diagnostics.cjs')
const { createRuntimeDiagnostics } = require('../../preload/diagnostics.cjs')
const entry = fs.readFileSync(path.resolve('preload/index.js'), 'utf8')
const loaderSource = entry.slice(entry.indexOf('const codexCliModules ='), entry.indexOf('const codexLaunchContext ='))
const startupSource = entry.slice(entry.indexOf('async function startCodexServer()'), entry.indexOf('async function requestCodexRpc('))
const closeSource = entry.slice(entry.indexOf('function closeCodexServer()'), entry.indexOf('function closeCodexConnections('))
const diagnosticsLoadSource = entry.slice(entry.indexOf('const codexRuntimeDiagnostics ='), entry.indexOf('async function openRuntimeDiagnosticsDirectory('))

function loadModules(load: (candidate: string) => unknown) {
  return vm.runInNewContext(`${loaderSource}\ncodexCliModules`, {
    path, process: { cwd: () => '/private-cwd' }, __dirname: '/private-plugin', require: load
  })
}

function discovery(options: {
  platform?: string
  env?: Record<string, string>
  files?: string[]
  directories?: string[]
  denied?: string[]
  broken?: string[]
  notExecutable?: string[]
  manual?: string
  execFile?: (...args: any[]) => unknown
} = {}) {
  const platform = options.platform || 'win32'
  const platformPath = platform === 'win32' ? path.win32 : path.posix
  const home = platform === 'win32' ? 'C:\\private-user' : '/private-user'
  const files = new Set(options.files || [])
  const directories = new Set(options.directories || [])
  const denied = new Set(options.denied || [])
  const broken = new Set(options.broken || [])
  const notExecutable = new Set(options.notExecutable || [])
  const fileError = (code: string) => Object.assign(new Error('private filesystem detail'), { code })
  const mockFs = {
    constants: { X_OK: 1 },
    statSync: vi.fn((candidate: string) => {
      if (denied.has(candidate)) throw fileError('EACCES')
      if (broken.has(candidate)) throw fileError('PRIVATE_ERROR')
      if (!files.has(candidate) && !directories.has(candidate)) throw fileError('ENOENT')
      return { isFile: () => files.has(candidate) }
    }),
    existsSync: vi.fn((candidate: string) => files.has(candidate) || directories.has(candidate)),
    realpathSync: (candidate: string) => candidate,
    accessSync: (candidate: string) => { if (notExecutable.has(candidate)) throw fileError('EACCES') },
    readdirSync: () => []
  }
  const host = { platform, arch: 'x64', env: options.env || {} }
  const plans = createCodexLaunchPlan({ fs: mockFs, path, process: host })
  const preferences = createCodexLaunchPathPreference({
    platformPath: () => platformPath, launchPlan: plans.codexLaunchPlan, storageKey: 'test-cli-preference',
    fs: mockFs, os: { homedir: () => home }, process: host, execFile: options.execFile,
    utools: { dbStorage: { getItem: () => options.manual || '' } }
  })
  return { preferences, plans, mockFs }
}

describe('Codex CLI module load evidence', () => {
  it('records successful loading without recording module search paths', () => {
    const load = vi.fn(() => ({ createTest: () => ({ ready: true }) }))
    const loader = loadModules(load)
    expect(loader.load('launch-plan.cjs', 'createTest', {})).toEqual({ ready: true })
    expect(loader.summary()).toMatchObject([{ module: 'launch-plan.cjs', state: 'loaded', attempts: 1, loadFailures: 0 }])
    expect(JSON.stringify(loader.summary())).not.toContain('private')
  })

  it('distinguishes all failed requires from a successful fallback require', () => {
    const failure = Object.assign(new Error('private module lookup'), { code: 'MODULE_NOT_FOUND' })
    const load = vi.fn((): unknown => { throw failure })
    const loader = loadModules(load)
    expect(loader.load('launch-plan.cjs', 'createTest', {})).toBeNull()
    expect(loader.summary()).toMatchObject([{
      state: 'load-failed', attempts: 3, loadFailures: 3, nativeCode: 'MODULE_NOT_FOUND'
    }])
    load.mockImplementationOnce(() => { throw failure })
    load.mockImplementation(() => ({ createTest: () => ({ ready: true }) }))
    expect(loader.load('launch-path-preference.cjs', 'createTest', {})).toEqual({ ready: true })
    expect(loader.summary()[1]).toMatchObject({
      state: 'loaded', attempts: 2, loadFailures: 1, priorCode: 'MODULE_NOT_FOUND', nativeCode: ''
    })
    expect(JSON.stringify(loader.summary())).not.toContain('private')
  })

  it.each([{}, null, { createTest: true }])('identifies missing exports for %j', (module) => {
    const loader = loadModules(() => module)
    expect(loader.load('launch-plan.cjs', 'createTest', {})).toBeNull()
    expect(loader.summary()[0]).toMatchObject({ state: 'export-missing', attempts: 1, loadFailures: 0 })
  })

  it('keeps factory exceptions separate and does not retry or disable another module', () => {
    const failure = Object.assign(new SyntaxError('private factory failure'), { code: 'PRIVATE_ERROR' })
    const load = vi.fn((candidate: string) => candidate.includes('launch-plan')
      ? { createTest: () => { throw failure } }
      : { createTest: () => ({ ready: true }) })
    const loader = loadModules(load)
    expect(loader.load('launch-plan.cjs', 'createTest', {})).toBeNull()
    expect(loader.load('proxy-discovery.cjs', 'createTest', {})).toEqual({ ready: true })
    expect(loader.summary()).toMatchObject([
      { state: 'factory-error', attempts: 1, nativeCode: 'OTHER', errorName: 'SyntaxError' },
      { state: 'loaded', attempts: 1 }
    ])
    expect(JSON.stringify(loader.summary())).not.toContain('private')
  })

  it('identifies an invalid factory result', () => {
    const loader = loadModules(() => ({ createTest: () => null }))
    expect(loader.load('runtime-diagnostics.cjs', 'createTest', {}, true)).toBeNull()
    expect(loader.summary()[0]).toMatchObject({ state: 'factory-invalid', attempts: 1 })
  })

  it('persists module failures even when the Codex diagnostic module itself cannot load', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-cli-module-diagnostics-'))
    try {
      const sink = createRuntimeDiagnostics({ fs, path, directory })
      const loader = loadModules(() => { throw Object.assign(new Error('private load failure'), { code: 'EACCES' }) })
      loader.load('launch-plan.cjs', 'createCodexLaunchPlan', {})
      loader.load('launch-path-preference.cjs', 'createCodexLaunchPathPreference', {})
      const diagnostics = vm.runInNewContext(`${diagnosticsLoadSource}\ncodexRuntimeDiagnostics`, {
        codexCliModules: loader, runtimeDiagnostics: sink, startCodexServer: vi.fn(), sendCodexRpc: vi.fn(),
        process: { platform: 'win32' }
      })
      expect(diagnostics).toBeNull()
      await sink.flush()
      const persisted = fs.readFileSync(sink.snapshot().activeFile, 'utf8')
      const event = persisted.trim().split('\n').map((line) => JSON.parse(line)).find((row) => row.event === 'codex-cli-modules')
      expect(event).toMatchObject({
        level: 'error', details: { modules: [
          { module: 'launch-plan.cjs', state: 'load-failed', nativeCode: 'EACCES' },
          { module: 'launch-path-preference.cjs', state: 'load-failed', nativeCode: 'EACCES' },
          { module: 'runtime-diagnostics.cjs', state: 'load-failed', nativeCode: 'EACCES' }
        ] }
      })
      expect(persisted).not.toContain('private')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('Codex CLI bounded candidate evidence', () => {
  it('counts every searched source when no automatic candidate exists', () => {
    const { preferences } = discovery({ env: { NVM_SYMLINK: 'C:\\private-node', Path: 'C:\\private-bin' } })
    const plan = preferences.resolveCodexLaunchPlan()
    expect(plan).toMatchObject({
      command: 'codex', detected: false, source: 'unknown', launchMode: 'automatic', launchCandidates: [],
      launchDiagnostic: { kind: 'path-lookup', resolution: 'unresolved' }
    })
    expect(plan.launchSearch).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'npm-global', checked: 1, missing: 1 }),
      expect.objectContaining({ source: 'volta', checked: 4, missing: 4 }),
      expect.objectContaining({ source: 'nvm', checked: 1, missing: 1 }),
      expect.objectContaining({ source: 'local', checked: 4, missing: 4 }),
      expect.objectContaining({ source: 'path', checked: 3, missing: 3 })
    ]))
    expect(JSON.stringify(plan.launchSearch)).not.toContain('private')
  })

  it('distinguishes inaccessible, non-file, unusable and unknown filesystem failures', () => {
    const { preferences } = discovery({
      env: { Path: 'C:\\private-bin' },
      denied: ['C:\\private-bin\\codex.exe'],
      directories: ['C:\\private-bin\\codex.cmd'],
      broken: ['C:\\private-bin\\codex.bat']
    })
    const plan = preferences.resolveCodexLaunchPlan()
    expect(plan.launchSearch.find((row: any) => row.source === 'path')).toMatchObject({
      checked: 3, inaccessible: 1, nonFile: 1, nonExecutable: 0, unusable: 0, shim: 0, entryMissing: 0,
      failed: 1, nativeCode: 'OTHER'
    })
    expect(plan.launchDiagnostic).toMatchObject({ kind: 'path-lookup', resolution: 'unresolved' })
    expect(plan.detected).toBe(false)
    expect(JSON.stringify(plan.launchSearch)).not.toContain('private')
  })

  it('counts invalid configured relative paths without changing fallback discovery', () => {
    const { preferences, mockFs } = discovery({ env: { CODEX_CLI_PATH: 'private-relative' } })
    const plan = preferences.resolveCodexLaunchPlan()
    expect(plan.launchSearch[0]).toMatchObject({ source: 'configured', checked: 1, relative: 1 })
    expect(mockFs.statSync).not.toHaveBeenCalledWith('private-relative')
    expect(plan).toMatchObject({ detected: false, source: 'unknown' })
  })

  it('skips a directory named codex.exe so it cannot hide a real native CLI', () => {
    const directory = 'D:\\private-directory\\codex.exe'
    const native = 'C:\\private-user\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe'
    const { preferences } = discovery({
      env: { CODEX_CLI_PATH: directory }, directories: [directory], files: [native]
    })
    const plan = preferences.resolveCodexLaunchPlan()
    expect(plan).toMatchObject({ detected: true, command: native, source: 'local' })
    expect(plan.launchSearch[0]).toMatchObject({ source: 'configured', nonFile: 1, available: 0 })
  })

  it('keeps manual invalid-path selection and records its missing file', () => {
    const { preferences } = discovery({ manual: 'C:\\private-cli\\codex.exe' })
    expect(preferences.resolveCodexLaunchPlan()).toMatchObject({
      source: 'manual', launchMode: 'manual', manualLaunchPathState: 'invalid', invalid: true, detected: false,
      launchSearch: [{ source: 'manual', checked: 1, missing: 1, unusable: 1 }]
    })
  })

  it('records POSIX execute denial while preserving the existing candidate selection', () => {
    const candidate = '/private-bin/codex'
    const { preferences } = discovery({
      platform: 'darwin', env: { CODEX_CLI_PATH: candidate }, files: [candidate], notExecutable: [candidate]
    })
    const plan = preferences.resolveCodexLaunchPlan()
    expect(plan).toMatchObject({ source: 'configured', detected: true, command: candidate })
    expect(plan.launchSearch[0]).toMatchObject({ checked: 1, nonExecutable: 1, available: 1 })
  })

  it('records native, shim, JavaScript with Node and missing-Node resolution without executing any candidate', () => {
    const native = 'D:\\private-cli\\codex.exe'
    const shim = 'C:\\private-user\\AppData\\Roaming\\npm\\codex.cmd'
    const jsEntry = 'C:\\private-user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'
    const node = 'C:\\Program Files\\nodejs\\node.exe'
    const { plans } = discovery({ env: { NVM_SYMLINK: 'C:\\Program Files\\nodejs' }, files: [native, shim, jsEntry, node] })
    expect(plans.codexLaunchPlan(native, 'manual', true).launchDiagnostic).toMatchObject({ kind: 'native', resolution: 'direct' })
    expect(plans.codexLaunchPlan(shim, 'npm-global', true)).toMatchObject({
      command: node, argsPrefix: [jsEntry], detected: true,
      launchDiagnostic: { kind: 'javascript', resolution: 'javascript-node' }
    })
    const withoutNode = discovery({ files: [shim, jsEntry] }).plans.codexLaunchPlan(shim, 'npm-global', true)
    expect(withoutNode).toMatchObject({
      detected: false, invalid: true, launchDiagnostic: { kind: 'javascript', resolution: 'node-missing' }
    })
  })
})

describe('Windows native CLI discovery without an external Node', () => {
  const packageRoot = 'D:\\private-apps\\OpenAI.Codex_26.1109_x64__2p2nqsd0c76g0'
  const packagedCli = `${packageRoot}\\app\\resources\\codex.exe`

  it.each<[string, Record<string, string>]>([
    ['C:\\private-user\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe', {}],
    ['D:\\private-install\\codex.exe', { CODEX_INSTALL_DIR: 'D:\\private-install' }]
  ])('finds the official standalone location %s with an empty PATH', async (candidate, env) => {
    const execFile = vi.fn()
    const { preferences, mockFs } = discovery({ env, files: [candidate], execFile })
    const plan = await preferences.prepareCodexLaunchPlan()
    expect(plan).toMatchObject({ detected: true, command: candidate, argsPrefix: [], source: 'local' })
    expect(execFile).not.toHaveBeenCalled()
    expect(mockFs.existsSync.mock.calls.flat()).not.toEqual(expect.arrayContaining([expect.stringMatching(/node\.exe$/i)]))
  })

  it('queries only the current-user Codex package once for concurrent discovery', async () => {
    let complete: ((error: any, stdout?: string) => void) | undefined
    const execFile = vi.fn((_command, _args, _options, callback) => { complete = callback })
    const { preferences } = discovery({ files: [packagedCli], execFile })
    const first = preferences.prepareCodexLaunchPlan()
    const second = preferences.prepareCodexLaunchPlan()
    expect(execFile).toHaveBeenCalledTimes(1)
    const [command, args, options] = execFile.mock.calls[0]!
    expect(command).toMatch(/\\System32\\WindowsPowerShell\\v1.0\\powershell\.exe$/)
    expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive']))
    expect(args.at(-1)).toContain('Get-AppxPackage -Name OpenAI.Codex')
    expect(args.at(-1)).not.toContain('-AllUsers')
    expect(args.at(-1)).not.toContain('private')
    expect(options).toMatchObject({ windowsHide: true, timeout: 2000, maxBuffer: 32 * 1024 })
    complete!(null, JSON.stringify([packageRoot]))
    const plans = await Promise.all([first, second])
    expect(plans).toEqual(expect.arrayContaining([
      expect.objectContaining({ detected: true, command: packagedCli, argsPrefix: [], desktopSearch: { state: 'queried', packages: 1, nativeCode: '' } })
    ]))
    expect(await preferences.prepareCodexLaunchPlan()).toMatchObject({ command: packagedCli })
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it.each([
    [Object.assign(new Error('private failure'), { code: 'EACCES' }), '', 'failed', 'EACCES'],
    [Object.assign(new Error('private failure'), { killed: true }), '', 'timeout', 'ETIMEDOUT'],
    [null, JSON.stringify({ state: 'failed', errorCategory: 'PermissionDenied', hresult: -2147024891 }), 'failed', 'EACCES'],
    [null, '{private broken json', 'invalid-output', ''],
    [null, JSON.stringify(['relative-path']), 'invalid-output', ''],
    [null, '', 'queried', '']
  ])('keeps package query failure classification bounded', async (error, output, state, nativeCode) => {
    const execFile = vi.fn((_command, _args, _options, callback) => callback(error, output))
    const { preferences } = discovery({ execFile })
    const plan = await preferences.prepareCodexLaunchPlan()
    expect(plan).toMatchObject({ detected: false, desktopSearch: { state, packages: 0, nativeCode } })
    expect(JSON.stringify(plan.desktopSearch)).not.toContain('private')
    await preferences.prepareCodexLaunchPlan()
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('rejects late timeout results and allows a fresh package query after the cache expires', async () => {
    vi.useFakeTimers()
    try {
      const callbacks: Array<(error: any, output?: string) => void> = []
      const execFile = vi.fn((_command, _args, _options, callback) => callbacks.push(callback))
      const { preferences } = discovery({ files: [packagedCli], execFile })
      const first = preferences.prepareCodexLaunchPlan()
      await vi.advanceTimersByTimeAsync(2500)
      expect(await first).toMatchObject({ detected: false, desktopSearch: { state: 'timeout' } })
      await vi.advanceTimersByTimeAsync(30_000)
      const second = preferences.prepareCodexLaunchPlan()
      callbacks[0]!(null, JSON.stringify(packageRoot))
      callbacks[1]!(null, JSON.stringify([]))
      expect(await second).toMatchObject({ detected: false, desktopSearch: { state: 'queried', packages: 0 } })
    } finally { vi.useRealTimers() }
  })

  it('preserves manual path priority even when it changes during package discovery', async () => {
    let complete: ((error: any, output?: string) => void) | undefined
    const manual = 'D:\\private-manual\\codex.exe'
    const options = { files: [manual, packagedCli], manual: '', execFile: vi.fn((_command, _args, _options, callback) => { complete = callback }) }
    const { preferences } = discovery(options)
    const pending = preferences.prepareCodexLaunchPlan()
    options.manual = manual
    complete!(null, JSON.stringify(packageRoot))
    expect(await pending).toMatchObject({ command: manual, source: 'manual', launchMode: 'manual' })
  })

  it('does not run a Windows package query for Mac or an explicitly invalid manual path', async () => {
    const execFile = vi.fn()
    await discovery({ platform: 'darwin', execFile }).preferences.prepareCodexLaunchPlan()
    expect(await discovery({ manual: 'D:\\private-missing\\codex.exe', execFile }).preferences.prepareCodexLaunchPlan())
      .toMatchObject({ detected: false, launchMode: 'manual' })
    expect(execFile).not.toHaveBeenCalled()
  })
})

describe('Codex CLI startup uses the failed attempt evidence', () => {
  function startupHarness(resolvePlan: () => any, initializationFailure?: Error) {
    const events: any[] = []
    const diagnostics = createCodexRuntimeDiagnostics({
      process: { platform: 'win32' }, runtimeDiagnostics: { record: (event: any) => events.push(event) }
    })
    const child = {
      stdin: {}, stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, once: vi.fn()
    }
    const context = vm.createContext({
      codexRuntimeDiagnostics: diagnostics, resolveCodexLaunchPlan: resolvePlan,
      spawn: vi.fn(() => child), codexError: (code: string, message: string) => Object.assign(new Error(message), { code }),
      codexReadyPromise: null, codexLaunchKey: '', codexProcessAlive: () => false,
      codexStartupState: { generation: 0 },
      codexProcess: null, codexStartupHint: '',
      resolveCodexProxyEnvironment: async () => ({}), codexSpawnEnvironment: () => ({}),
      os: { homedir: () => 'C:\\private-home' }, closeCodexServer: vi.fn(),
      handleCodexStdout: vi.fn(), inspectCodexStderr: vi.fn(), onCodexProcessEnd: vi.fn(),
      notifyCodexRpc: vi.fn(), sendCodexRpc: async () => { if (initializationFailure) throw initializationFailure }
    })
    vm.runInContext(`${startupSource}\nthis.start = startCodexServer`, context)
    return { start: context.start, context, diagnostics, events }
  }

  it('captures the rejected plan at startup and never rescans when reporting it', async () => {
    const plan = discovery({ env: { Path: 'C:\\private-bin' } }).preferences.resolveCodexLaunchPlan()
    const resolvePlan = vi.fn(() => plan)
    const { start, context, diagnostics, events } = startupHarness(resolvePlan)
    const failure = await start().catch((error: unknown) => error)
    resolvePlan.mockImplementation(() => { throw new Error('a second scan is forbidden') })
    diagnostics.inventoryFailure(failure, 'plugin-enter', true)
    expect(resolvePlan).toHaveBeenCalledTimes(1)
    expect(context.spawn).not.toHaveBeenCalled()
    expect(events.find((event) => event.event === 'codex-inventory-membership').details).toMatchObject({
      failure: 'runtime-unavailable', launch: { detected: false, searchState: 'observed' },
      search: expect.arrayContaining([expect.objectContaining({ source: 'path', checked: 3, missing: 3 })])
    })
  })

  it('captures the actual startup plan for initialization errors and shared readiness failures', async () => {
    const plan = { command: 'C:\\private\\codex.exe', argsPrefix: [], key: 'private-key',
      source: 'configured', detected: true, launchMode: 'automatic',
      launchDiagnostic: { kind: 'native', resolution: 'direct' }, launchSearch: [] }
    const resolvePlan = vi.fn(() => plan)
    const failed = Object.assign(new Error('private initialize failure'), { code: 'protocol-error' })
    const { start, diagnostics, events } = startupHarness(resolvePlan, failed)
    const first = start()
    resolvePlan.mockReturnValue({ ...plan, source: 'path' })
    const second = start()
    await Promise.all([first.catch(() => null), second.catch(() => null)])
    diagnostics.inventoryFailure(failed, 'plugin-enter', false)
    expect(events.find((event) => event.event === 'codex-inventory-membership').details).toMatchObject({
      failure: 'protocol-error', launch: { source: 'configured', kind: 'native', resolution: 'direct' }
    })
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it('records the selected native launch and initialization without Node or command paths', async () => {
    const plan = { command: 'D:\\private\\codex.exe', argsPrefix: [], key: 'native', detected: true,
      source: 'local', launchMode: 'automatic', launchDiagnostic: { kind: 'native', resolution: 'direct' } }
    const { start, context, events } = startupHarness(() => plan)
    await expect(start()).resolves.toBe(true)
    expect(context.spawn).toHaveBeenCalledWith(plan.command, ['app-server', '--listen', 'stdio://'], expect.any(Object))
    expect(events.filter((event) => event.event === 'codex-startup').map((event) => event.outcome)).toEqual(['spawn-requested', 'initialized'])
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it('does not start a process after its asynchronous discovery was cancelled', async () => {
    let complete: ((value: any) => void) | undefined
    const { start, context } = startupHarness(() => new Promise((resolve) => { complete = resolve }))
    const pending = start()
    Object.assign(context, { rejectCodexPending: vi.fn(), resetCodexThreadSessionState: vi.fn(),
      codexRpcBuffer: '', codexNativePlanExecutionCapabilityPromise: null, codexNativePlanExecutionCapability: null })
    vm.runInContext(`${closeSource}\nthis.stop = closeCodexServer`, context)
    context.stop()
    complete!({ detected: true, command: 'D:\\private\\codex.exe' })
    await expect(pending).rejects.toMatchObject({ code: 'process-exited' })
    expect(context.spawn).not.toHaveBeenCalled()
  })
})
