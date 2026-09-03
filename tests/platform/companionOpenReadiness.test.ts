import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const readinessModule = require('../../preload/companion/open-readiness.cjs') as {
  LAUNCH_WAIT_MS: number
  createCompanionOpenReadiness(dependencies?: Record<string, unknown>): {
    ensure(provider: string, request?: Record<string, unknown>): Promise<Record<string, unknown>>
    wrapOpen(provider: string, open: (...args: unknown[]) => unknown): (target: unknown, request?: unknown) => Promise<Record<string, unknown>>
    inspect(): { providers: string[]; inFlight: string[] }
  }
  createDesktopAppStrategy(options?: Record<string, unknown>): {
    label: string
    probe(): Promise<string>
    launch(): Promise<Record<string, unknown>>
    settle(): Promise<boolean>
  }
}

type Strategy = { label: string; probe: () => Promise<string> | string; launch: () => Promise<unknown> | unknown; settle?: () => Promise<boolean> | boolean }

/** Deterministic clock: every scheduled wait advances time by its delay and yields once. */
function harness(strategies: Record<string, Strategy>, options: { settings?: Record<string, unknown>; waitMs?: number; settleMs?: number } = {}) {
  let clock = 0
  const records: Array<Record<string, unknown>> = []
  const readiness = readinessModule.createCompanionOpenReadiness({
    now: () => clock,
    setTimeout: (callback: () => void, ms: number) => {
      clock += ms
      setImmediate(callback)
      return 0
    },
    record: (entry: Record<string, unknown>) => { records.push(entry) },
    readSettings: () => options.settings ?? { openLaunchesTarget: true },
    strategies,
    ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}),
    ...(options.settleMs !== undefined ? { settleMs: options.settleMs } : {})
  })
  return { readiness, records, clock: () => clock }
}

function closedThenRunning(afterProbes: number) {
  let probes = 0
  return () => (++probes > afterProbes ? 'running' : 'closed')
}

describe('companion open readiness', () => {
  it('passes a running target straight through without touching the receipt', async () => {
    const launch = vi.fn()
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false, message: '已发送打开请求' }))
    const { readiness, records } = harness({ codex: { label: 'Codex', probe: () => 'running', launch } })
    const result = await readiness.wrapOpen('codex', open)({ key: 'k' }, { source: 'card' })
    expect(result).toEqual({ outcome: 'dispatched', confirmsRead: false, message: '已发送打开请求' })
    expect(launch).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
    expect(records).toEqual([])
  })

  it('launches a closed target, waits for the process and settle, then decorates the receipt', async () => {
    const launch = vi.fn(async () => ({ ok: true, launcher: 'open-b' }))
    let settles = 0
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false, message: '已发送打开请求' }))
    const { readiness, records, clock } = harness({
      codex: { label: 'Codex', probe: closedThenRunning(3), launch, settle: () => ++settles >= 2 }
    })
    const result = await readiness.wrapOpen('codex', open)({ key: 'k' }, { source: 'shortcut', operationId: 'op-1' })
    expect(launch).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      outcome: 'dispatched',
      confirmsRead: false,
      message: '已启动 Codex，已发送打开请求',
      launch: { outcome: 'launched', launcher: 'open-b' }
    })
    expect((result.launch as { waitedMs: number }).waitedMs).toBe(clock())
    expect(clock()).toBe(1500)
    expect(records.map((entry) => entry.outcome)).toEqual(['launch-requested', 'launch-started', 'launched'])
    expect(records.every((entry) => typeof entry.level === 'string' && entry.scope === 'task-action' && entry.event === 'open-readiness')).toBe(true)
    expect(records[0]).toMatchObject({ level: 'debug', details: { probe: 'closed', source: 'shortcut', operationId: 'op-1' } })
    expect(records[2]?.details).toMatchObject({ launcher: 'open-b', source: 'shortcut', operationId: 'op-1', waitedMs: 1500 })
  })

  it('records launch-requested before the strategy runs, so a slow launcher does not hide the issue time', async () => {
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false }))
    let seenAtLaunch: unknown[] = []
    const context = harness({
      codex: {
        label: 'Codex',
        probe: closedThenRunning(1),
        launch: async () => {
          seenAtLaunch = context.records.map((entry) => entry.outcome)
          return { ok: true, launcher: 'codexhost' }
        }
      }
    })
    await context.readiness.wrapOpen('codex', open)({ key: 'k' }, { source: 'card-click' })
    expect(seenAtLaunch).toEqual(['launch-requested'])
    expect(context.records.map((entry) => entry.outcome)).toEqual(['launch-requested', 'launch-started', 'launched'])
  })

  it('joins concurrent opens of one provider onto a single launch', async () => {
    const launch = vi.fn(async () => ({ ok: true, launcher: 'open-b' }))
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false }))
    const { readiness } = harness({ claude: { label: 'Claude', probe: closedThenRunning(4), launch } })
    const wrapped = readiness.wrapOpen('claude', open)
    const [first, second] = await Promise.all([wrapped({ key: 'a' }), wrapped({ key: 'b' })])
    expect(launch).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({ outcome: 'dispatched', launch: { outcome: 'launched' } })
    expect(second).toMatchObject({ outcome: 'dispatched', launch: { outcome: 'launched' } })
    expect(readiness.inspect().inFlight).toEqual([])
  })

  it('fails closed with launch-timeout and never runs the opener when the process never appears', async () => {
    const open = vi.fn()
    const { readiness, records, clock } = harness({
      cursor: { label: 'Cursor', probe: () => 'closed', launch: async () => ({ ok: true, launcher: 'open-b' }) }
    })
    const result = await readiness.wrapOpen('cursor', open)({ key: 'k' })
    expect(open).not.toHaveBeenCalled()
    expect(result).toMatchObject({ outcome: 'failed', errorCode: 'launch-timeout', confirmsRead: false })
    expect(String(result.message)).toContain('25 秒')
    expect(clock()).toBeGreaterThanOrEqual(readinessModule.LAUNCH_WAIT_MS)
    expect(records.at(-1)).toMatchObject({ level: 'warn', outcome: 'launch-timeout' })
  })

  it('does not launch on an unknown probe and lets the opener decide', async () => {
    const launch = vi.fn()
    const open = vi.fn(async () => ({ outcome: 'unavailable', confirmsRead: false, message: '无法确认' }))
    const { readiness, records } = harness({ claude: { label: 'Claude', probe: () => { throw new Error('pgrep missing') }, launch } })
    const result = await readiness.wrapOpen('claude', open)({ key: 'k' })
    expect(launch).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'unavailable', confirmsRead: false, message: '无法确认' })
    expect(records).toEqual([expect.objectContaining({ level: 'debug', outcome: 'probe-unknown' })])
  })

  it('skips probing entirely when the launch-first setting is off', async () => {
    const probe = vi.fn(() => 'closed')
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false }))
    const { readiness } = harness({ codex: { label: 'Codex', probe, launch: vi.fn() } }, { settings: { openLaunchesTarget: false } })
    await readiness.wrapOpen('codex', open)({ key: 'k' })
    expect(probe).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('passes through an unsupported launcher so the URL handler keeps today\'s behavior', async () => {
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false }))
    const { readiness, records } = harness({
      cursor: { label: 'Cursor', probe: () => 'closed', launch: async () => ({ ok: false, code: 'unsupported', launcher: 'unsupported' }) }
    })
    const result = await readiness.wrapOpen('cursor', open)({ key: 'k' })
    expect(open).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ outcome: 'dispatched', confirmsRead: false })
    expect(records.map((entry) => entry.outcome)).toEqual(['launch-requested', 'skipped'])
  })

  it('treats a missing codexhost CLI as unavailable and other launch failures as failed', async () => {
    const open = vi.fn()
    const missing = harness({
      codex: { label: 'Codex', probe: () => 'closed', launch: async () => ({ ok: false, code: 'codexhost-cli-missing', launcher: 'codexhost', message: '未找到 codexhost' }) }
    })
    expect(await missing.readiness.wrapOpen('codex', open)({ key: 'k' })).toMatchObject({
      outcome: 'unavailable',
      errorCode: 'codexhost-cli-missing',
      message: '未找到 codexhost'
    })
    const broken = harness({ codex: { label: 'Codex', probe: () => 'closed', launch: async () => { throw new Error('boom') } } })
    expect(await broken.readiness.wrapOpen('codex', open)({ key: 'k' })).toMatchObject({
      outcome: 'failed',
      errorCode: 'launch-failed',
      message: '无法启动 Codex，未跳转'
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('keeps a settle timeout soft', async () => {
    const open = vi.fn(async () => ({ outcome: 'dispatched', confirmsRead: false }))
    const { readiness, records, clock } = harness(
      { codex: { label: 'Codex', probe: closedThenRunning(1), launch: async () => ({ ok: true, launcher: 'codexhost' }), settle: () => false } },
      { settleMs: 2000 }
    )
    const result = await readiness.wrapOpen('codex', open)({ key: 'k' })
    expect(result).toMatchObject({ launch: { outcome: 'launched', launcher: 'codexhost' } })
    expect(clock()).toBeGreaterThanOrEqual(2000)
    expect(records.map((entry) => entry.outcome)).toEqual(['launch-requested', 'launch-started', 'settle-timeout', 'launched'])
  })
})

describe('desktop app strategy', () => {
  function strategy(options: Record<string, unknown> = {}) {
    const calls: Array<{ file: string; args: string[] }> = []
    const running = new Set<string>((options.running as string[]) ?? [])
    let clock = 0
    const value = readinessModule.createDesktopAppStrategy({
      label: 'Claude',
      executables: ['Claude'],
      bundleId: 'com.anthropic.claudefordesktop',
      appName: 'Claude',
      windowAppIdPrefix: 'com.anthropic.claude',
      probeExactProcess: async (_command: string, args: string[]) => running.has(args[1] ?? ''),
      execFile: (file: string, args: string[], _settings: unknown, done: (error?: Error | null) => void) => {
        calls.push({ file, args })
        const fail = options.failFlags as string[] | undefined
        done(fail && fail.includes(args[0] ?? '') ? new Error('open failed') : null)
      },
      process: { platform: (options.platform as string) ?? 'darwin', env: {} },
      now: () => clock,
      settleDelayMs: 1500,
      ...(options.windowsList ? { windowsList: options.windowsList } : {}),
      ...(options.run ? { run: options.run } : {})
    })
    return { value, calls, running, tick: (ms: number) => { clock += ms } }
  }

  it('probes by exact process name and launches by bundle id with an app-name fallback', async () => {
    const closed = strategy()
    expect(await closed.value.probe()).toBe('closed')
    expect(await closed.value.launch()).toEqual({ ok: true, launcher: 'open-b' })
    expect(closed.calls).toEqual([{ file: 'open', args: ['-b', 'com.anthropic.claudefordesktop'] }])
    const fallback = strategy({ failFlags: ['-b'] })
    expect(await fallback.value.launch()).toEqual({ ok: true, launcher: 'open-a' })
    expect(fallback.calls.map((call) => call.args[0])).toEqual(['-b', '-a'])
    const broken = strategy({ failFlags: ['-b', '-a'] })
    expect(await broken.value.launch()).toMatchObject({ ok: false, code: 'launch-failed' })
    const running = strategy({ running: ['Claude'] })
    expect(await running.value.probe()).toBe('running')
  })

  it('settles on a root window when the inventory is readable, otherwise after the delay', async () => {
    const windowed = strategy({
      running: ['Claude'],
      windowsList: async () => ({
        windows: [{ appId: 'com.anthropic.claude', relationship: 'root' }],
        capability: { supported: true, permission: 'granted', canList: true }
      })
    })
    await windowed.value.probe()
    expect(await windowed.value.settle()).toBe(true)
    const blocked = strategy({
      running: ['Claude'],
      windowsList: async () => ({ windows: [], capability: { supported: true, permission: 'required', canList: false } })
    })
    await blocked.value.probe()
    expect(await blocked.value.settle()).toBe(false)
    blocked.tick(1500)
    expect(await blocked.value.settle()).toBe(true)
  })

  it('reports unsupported launches off macOS and probes through tasklist on Windows', async () => {
    const windows = strategy({
      platform: 'win32',
      run: async () => ({ ok: true, stdout: '"Claude.exe","1234","Console","1","100 K"' })
    })
    expect(await windows.value.probe()).toBe('running')
    expect(await windows.value.launch()).toEqual({ ok: false, code: 'unsupported', launcher: 'unsupported' })
    expect(windows.calls).toEqual([])
    const linux = strategy({ platform: 'linux' })
    expect(await linux.value.launch()).toEqual({ ok: false, code: 'unsupported', launcher: 'unsupported' })
  })
})
