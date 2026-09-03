import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const launchModule = require('../../preload/codex/desktop-launch.cjs') as {
  CODEX_DESKTOP_BUNDLE_ID: string
  createCodexDesktopLaunch(dependencies: Record<string, unknown>): {
    probeDesktop(): Promise<string>
    settleDesktop(): boolean
    desktopLaunchMode(): Promise<string>
    detectCodexhost(): Promise<{ desktop: string; cli: { path: string; source: string; state: string }; descriptor: boolean }>
    hostReady(): boolean
    hostRuntimeState(): string
    resolveCodexhostCliPath(): { path: string; source: string; state: string }
    rememberObservedCliPath(value: string): boolean
    readCodexhostPathPreference(): Record<string, unknown>
    writeCodexhostManualPath(value: string): string
    clearCodexhostManualPath(): boolean
    launchNative(): Promise<Record<string, unknown>>
    launchViaCodexhost(): Promise<Record<string, unknown>>
    inspect(readSettings: () => Record<string, unknown>): Promise<Record<string, unknown>>
    strategy(readSettings: () => Record<string, unknown>): { label: string; probe(): Promise<string>; launch(): Promise<Record<string, unknown>>; settle(): Promise<boolean> }
  }
}

const HOME = '/Users/tester'
const MANAGED_ENV = `11131 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT CODEX_CLI_PATH=${HOME}/codex-host/target/debug/codexhost-shim CODEXHOST_LAUNCHER_PID=11129 CODEXHOST_HOST_RUNTIME_PATH=${HOME}/codex-host/dist/main.js`
const PLAIN_ENV = '11131 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT HOME=/Users/tester PATH=/usr/bin'
const DESCRIPTOR = `${HOME}/Library/Application Support/codexhost/desktop-runtime-v1.json`
const CLI = `${HOME}/.local/bin/codexhost`

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  unref = vi.fn()
}

function fixture(options: {
  files?: Record<string, string | Buffer>
  dirs?: Record<string, string[]>
  stored?: Record<string, unknown>
  env?: Record<string, string>
  running?: string[]
  desktopEnv?: string
  killFails?: boolean
  platform?: string
  ipcEndpoint?: string
  openFails?: string[]
} = {}) {
  const files = new Map<string, Buffer>()
  for (const [file, content] of Object.entries(options.files ?? {})) files.set(file, Buffer.from(content))
  const dirs = new Map<string, string[]>(Object.entries(options.dirs ?? {}))
  const storage = new Map<string, unknown>()
  if (options.stored) storage.set('eypc/codex/codexhost-path/v1', options.stored)
  const running = new Set(options.running ?? [])
  const execCalls: Array<{ file: string; args: string[] }> = []
  const spawnCalls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
  const children: FakeChild[] = []
  const records: Array<Record<string, unknown>> = []
  const fs = {
    statSync: (file: string) => {
      const content = files.get(file)
      if (!content) throw new Error('ENOENT')
      return { isFile: () => true, size: content.length }
    },
    existsSync: (file: string) => files.has(file) || dirs.has(file),
    readFileSync: (file: string, encoding?: string) => {
      const content = files.get(file)
      if (!content) throw new Error('ENOENT')
      return encoding ? content.toString('utf8') : content
    },
    readdirSync: (directory: string, settings?: { withFileTypes?: boolean }) => {
      const names = dirs.get(directory)
      if (!names) throw new Error('ENOENT')
      return settings?.withFileTypes ? names.map((name) => ({ name, isDirectory: () => true })) : names
    }
  }
  const value = launchModule.createCodexDesktopLaunch({
    fs,
    os: { homedir: () => HOME },
    path,
    process: {
      platform: options.platform ?? 'darwin',
      env: { PATH: '/usr/bin:/bin', ...(options.env ?? {}) },
      kill: (pid: number) => {
        if (options.killFails || pid <= 0) throw new Error('ESRCH')
        return true
      }
    },
    execFile: (file: string, args: string[], _settings: unknown, done: (error?: Error | null) => void) => {
      execCalls.push({ file, args })
      done(options.openFails?.includes(args[0] ?? '') ? new Error('open failed') : null)
    },
    spawn: (command: string, args: string[], spawnOptions: Record<string, unknown>) => {
      spawnCalls.push({ command, args, options: spawnOptions })
      const child = new FakeChild()
      children.push(child)
      return child
    },
    utools: {
      dbStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, item: unknown) => { storage.set(key, item); return true }
      }
    },
    storageKey: 'eypc/codex/codexhost-path/v1',
    now: () => 1_000,
    setTimeout: (callback: () => void) => setImmediate(callback),
    clearTimeout: () => {},
    record: (entry: Record<string, unknown>) => { records.push(entry) },
    probeExactProcess: async (_command: string, args: string[]) => running.has(args[1] ?? ''),
    run: async (command: string, args: string[]) => {
      if (command === '/usr/bin/pgrep') return { ok: running.has(args[1] ?? ''), stdout: running.has(args[1] ?? '') ? '11131\n' : '' }
      if (command === 'ps') return { ok: true, stdout: options.desktopEnv ?? PLAIN_ENV }
      return { ok: false, stdout: '' }
    },
    desktopIpcEndpoint: () => options.ipcEndpoint ?? ''
  })
  return { value, files, dirs, storage, running, execCalls, spawnCalls, children, records }
}

describe('codex desktop launch · codexhost CLI location', () => {
  it('resolves manual before observed, environment, well-known directories and PATH', () => {
    const manual = fixture({
      files: { '/opt/custom/codexhost': 'x', [CLI]: 'x', '/opt/homebrew/bin/codexhost': 'x' },
      stored: { version: 1, path: '/opt/custom/codexhost', observedPath: CLI },
      env: { CODEXHOST_CLI_PATH: '/opt/homebrew/bin/codexhost' }
    })
    expect(manual.value.resolveCodexhostCliPath()).toEqual({ path: '/opt/custom/codexhost', source: 'manual', state: 'manual-valid' })
    const observed = fixture({ files: { [CLI]: 'x', '/opt/homebrew/bin/codexhost': 'x' }, stored: { version: 1, observedPath: CLI } })
    expect(observed.value.resolveCodexhostCliPath()).toEqual({ path: CLI, source: 'observed', state: 'observed' })
    const configured = fixture({ files: { '/opt/tools/codexhost': 'x', '/opt/homebrew/bin/codexhost': 'x' }, env: { CODEXHOST_CLI_PATH: '/opt/tools/codexhost' } })
    expect(configured.value.resolveCodexhostCliPath()).toEqual({ path: '/opt/tools/codexhost', source: 'configured', state: 'discovered' })
    const homebrew = fixture({ files: { '/opt/homebrew/bin/codexhost': 'x', '/usr/bin/codexhost': 'x' } })
    expect(homebrew.value.resolveCodexhostCliPath()).toEqual({ path: '/opt/homebrew/bin/codexhost', source: 'homebrew', state: 'discovered' })
    const onPath = fixture({ files: { '/usr/bin/codexhost': 'x' } })
    expect(onPath.value.resolveCodexhostCliPath()).toEqual({ path: '/usr/bin/codexhost', source: 'path', state: 'discovered' })
    const nvm = fixture({
      files: { [`${HOME}/.nvm/versions/node/v24.14.0/bin/codexhost`]: 'x' },
      dirs: { [`${HOME}/.nvm/versions/node`]: ['v22.1.0', 'v24.14.0'] }
    })
    expect(nvm.value.resolveCodexhostCliPath()).toMatchObject({ source: 'nvm', state: 'discovered' })
    expect(fixture().value.resolveCodexhostCliPath()).toEqual({ path: '', source: 'unknown', state: 'missing' })
  })

  it('blocks the search behind an invalid manual path and keeps manual over observed', () => {
    const context = fixture({ files: { [CLI]: 'x' }, stored: { version: 1, path: '/missing/codexhost' } })
    expect(context.value.resolveCodexhostCliPath()).toEqual({ path: '', source: 'manual', state: 'manual-invalid' })
    expect(context.value.rememberObservedCliPath(CLI)).toBe(true)
    expect(context.value.readCodexhostPathPreference()).toMatchObject({ path: '/missing/codexhost', observedPath: CLI, observedAt: 1_000 })
    expect(context.value.rememberObservedCliPath(CLI)).toBe(false)
    expect(context.value.rememberObservedCliPath('relative/codexhost')).toBe(false)
    expect(context.value.clearCodexhostManualPath()).toBe(true)
    expect(context.value.resolveCodexhostCliPath()).toEqual({ path: CLI, source: 'observed', state: 'observed' })
    expect(context.value.writeCodexhostManualPath('  /opt/custom/codexhost ')).toBe('/opt/custom/codexhost')
    expect(context.value.writeCodexhostManualPath('codexhost')).toBe('')
    expect(context.value.readCodexhostPathPreference()).toMatchObject({ path: '/opt/custom/codexhost', observedPath: CLI })
  })
})

describe('codex desktop launch · detection and readiness', () => {
  it('reads whether the running Desktop was launched by CodexHost from its environment, briefly cached', async () => {
    const managed = fixture({ running: ['ChatGPT'], desktopEnv: MANAGED_ENV })
    expect(await managed.value.desktopLaunchMode()).toBe('managed')
    managed.running.clear()
    expect(await managed.value.desktopLaunchMode()).toBe('managed')
    // The Desktop probe seeing it closed drops the cached verdict immediately.
    expect(await managed.value.probeDesktop()).toBe('closed')
    expect(await managed.value.desktopLaunchMode()).toBe('closed')
    const plain = fixture({ running: ['ChatGPT'], desktopEnv: PLAIN_ENV })
    expect(await plain.value.desktopLaunchMode()).toBe('plain')
    expect(await fixture().value.desktopLaunchMode()).toBe('closed')
    expect(await fixture({ platform: 'win32' }).value.desktopLaunchMode()).toBe('unknown')
  })

  it('decides the effective CodexHost mode from the setting and the three detection signals', async () => {
    const nothing = fixture()
    expect(await nothing.value.inspect(() => ({ codexhostLaunch: 'auto' }))).toEqual({
      mode: 'auto', effective: false, desktop: 'closed', cliState: 'missing', cliSource: 'unknown', runtimeState: 'not-running'
    })
    expect(await nothing.value.inspect(() => ({ codexhostLaunch: 'on' }))).toMatchObject({ mode: 'on', effective: true })
    const managed = fixture({ running: ['ChatGPT'], desktopEnv: MANAGED_ENV })
    expect(await managed.value.inspect(() => ({ codexhostLaunch: 'auto' }))).toMatchObject({ mode: 'auto', effective: true, desktop: 'managed' })
    expect(await managed.value.inspect(() => ({ codexhostLaunch: 'off' }))).toMatchObject({ mode: 'off', effective: false, desktop: 'managed' })
    const plain = fixture({ running: ['ChatGPT'], desktopEnv: PLAIN_ENV })
    expect(await plain.value.inspect(() => ({ codexhostLaunch: 'auto' }))).toMatchObject({ mode: 'auto', effective: false, desktop: 'plain' })
    const cli = fixture({ files: { [CLI]: 'x' } })
    expect(await cli.value.inspect(() => ({}))).toMatchObject({ mode: 'auto', effective: true, cliState: 'discovered', cliSource: 'local' })
    expect(JSON.stringify(await cli.value.inspect(() => ({})))).not.toContain(HOME)
  })

  it('reads Host readiness from the descriptor and the liveness of the launcher it names', () => {
    const live = fixture({ files: { [DESCRIPTOR]: JSON.stringify({ schema_version: 1, launcher_pid: 4242, control_port: 1, nonce: 'n' }) } })
    expect(live.value.hostReady()).toBe(true)
    expect(live.value.hostRuntimeState()).toBe('running')
    const dead = fixture({ files: { [DESCRIPTOR]: JSON.stringify({ launcher_pid: 4242 }) }, killFails: true })
    expect(dead.value.hostReady()).toBe(false)
    expect(fixture({ files: { [DESCRIPTOR]: '{ not json' } }).value.hostReady()).toBe(false)
    expect(fixture().value.hostReady()).toBe(false)
    expect(fixture({ platform: 'linux' }).value.hostRuntimeState()).toBe('unknown')
  })

  it('probes the Desktop by exact process name and settles on the ipc socket', async () => {
    const closed = fixture({ ipcEndpoint: `${HOME}/.codex/ipc/ipc.sock` })
    expect(await closed.value.probeDesktop()).toBe('closed')
    expect(closed.value.settleDesktop()).toBe(false)
    const running = fixture({ running: ['ChatGPT'], ipcEndpoint: `${HOME}/.codex/ipc/ipc.sock`, files: { [`${HOME}/.codex/ipc/ipc.sock`]: '' } })
    expect(await running.value.probeDesktop()).toBe('running')
    expect(running.value.settleDesktop()).toBe(true)
    expect(fixture().value.settleDesktop()).toBe(true)
  })
})

describe('codex desktop launch · launching', () => {
  it('launches natively by bundle id with an app-name fallback', async () => {
    const context = fixture()
    expect(await context.value.launchNative()).toEqual({ ok: true, launcher: 'open-b' })
    expect(context.execCalls).toEqual([{ file: 'open', args: ['-b', 'com.openai.codex'] }])
    const fallback = fixture({ openFails: ['-b'] })
    expect(await fallback.value.launchNative()).toEqual({ ok: true, launcher: 'open-a' })
    expect(fallback.execCalls.map((call) => call.args)).toEqual([['-b', 'com.openai.codex'], ['-a', 'Codex']])
    expect(await fixture({ platform: 'linux' }).value.launchNative()).toEqual({ ok: false, code: 'unsupported', launcher: 'unsupported' })
  })

  it('spawns a detached codexhost launch that refuses a running Desktop and resolves on the ready line', async () => {
    const context = fixture({ files: { [CLI]: 'x' } })
    const pending = context.value.launchViaCodexhost()
    await new Promise((resolve) => setImmediate(resolve))
    expect(context.spawnCalls).toHaveLength(1)
    const [call] = context.spawnCalls
    expect(call?.command).toBe(CLI)
    expect(call?.args).toEqual(['launch'])
    expect(call?.options).toMatchObject({ detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const env = call?.options.env as Record<string, string>
    expect(env.CODEXHOST_REFUSE_RUNNING_DESKTOP).toBe('1')
    expect(env.PATH.split(':')[0]).toBe(`${HOME}/.local/bin`)
    expect(env.PATH).toContain('/usr/bin')
    context.children[0]?.stdout.emit('data', 'launcher warming\nready\n')
    expect(await pending).toEqual({ ok: true, launcher: 'codexhost' })
    expect(context.children[0]?.unref).toHaveBeenCalled()
    expect(JSON.stringify(context.records)).not.toContain(HOME)
  })

  it('surfaces the launcher refusal from stderr on a non-zero exit', async () => {
    const context = fixture({ files: { [CLI]: 'x' } })
    const pending = context.value.launchViaCodexhost()
    await new Promise((resolve) => setImmediate(resolve))
    context.children[0]?.stderr.emit('data', 'codexhost launcher: Source launch refuses an existing Codex Desktop or runtime descriptor; nothing was attached\nmore\n')
    context.children[0]?.emit('exit', 1)
    expect(await pending).toEqual({
      ok: false,
      code: 'codexhost-launch-refused',
      launcher: 'codexhost',
      message: 'CodexHost 拒绝启动：Source launch refuses an existing Codex Desktop or runtime descriptor; nothing was attached'
    })
  })

  it('never launches through CodexHost while a Desktop process exists', async () => {
    const context = fixture({ files: { [CLI]: 'x' }, running: ['Codex'] })
    expect(await context.value.launchViaCodexhost()).toEqual({ ok: false, code: 'desktop-present', launcher: 'codexhost' })
    expect(context.spawnCalls).toEqual([])
  })

  it('blocks without a CLI instead of starting a Desktop the Host could not attach to', async () => {
    const nothing = fixture()
    expect(await nothing.value.launchViaCodexhost()).toMatchObject({ ok: false, code: 'codexhost-cli-missing', launcher: 'codexhost' })
    expect(String((await nothing.value.launchViaCodexhost()).message)).toContain('未找到 codexhost 命令')
    expect(nothing.execCalls).toEqual([])
    expect(nothing.spawnCalls).toEqual([])
    expect(nothing.records.at(-1)).toMatchObject({ level: 'warn', outcome: 'codexhost-cli-missing' })
  })

  it('routes the strategy by the effective mode', async () => {
    const context = fixture({ files: { [CLI]: 'x', [DESCRIPTOR]: JSON.stringify({ launcher_pid: 7 }) }, ipcEndpoint: `${HOME}/.codex/ipc/ipc.sock` })
    const viaHost = context.value.strategy(() => ({ codexhostLaunch: 'auto' }))
    expect(viaHost.label).toBe('Codex')
    const pending = viaHost.launch()
    await new Promise((resolve) => setImmediate(resolve))
    expect(context.spawnCalls).toHaveLength(1)
    context.children[0]?.emit('exit', 0)
    expect(await pending).toEqual({ ok: true, launcher: 'codexhost' })
    expect(await viaHost.settle()).toBe(false)
    context.files.set(`${HOME}/.codex/ipc/ipc.sock`, Buffer.from(''))
    expect(await viaHost.settle()).toBe(true)
    const native = context.value.strategy(() => ({ codexhostLaunch: 'off' }))
    expect(await native.launch()).toEqual({ ok: true, launcher: 'open-b' })
    expect(await native.settle()).toBe(true)
  })
})
