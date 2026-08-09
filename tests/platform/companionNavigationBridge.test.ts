import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const navigationModule = require('../../preload/companion/navigation.cjs') as {
  COMPANION_NAVIGATION_REVISION: string
  DEFAULT_COALESCE_MS: number
  createCompanionNavigation(options?: Record<string, unknown>): any
}

const targets = [
  { key: 'codex-a', provider: 'codex', actionAlias: 'ct_codex_a_1234567890', revisionAt: 101, phase: 'running', canArchive: false },
  { key: 'claude:local_a', provider: 'claude', actionAlias: 'local_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revisionAt: 102, phase: 'running', canArchive: false },
  { key: 'codex-b', provider: 'codex', actionAlias: 'ct_codex_b_1234567890', revisionAt: 103, phase: 'completed', canArchive: true }
]

function readyNavigation(options: Record<string, unknown> = {}) {
  const navigation = navigationModule.createCompanionNavigation(options)
  const receipt = navigation.begin({ enabled: true, providers: { codex: true, claude: true } })
  expect(navigation.sync({
    lease: receipt.lease,
    enabled: true,
    providers: { codex: true, claude: true },
    ready: true,
    targets,
    cycleKeys: targets.map((target) => target.key)
  })).toBe(true)
  return { navigation, receipt }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('process-lifetime companion navigation', () => {
  it('coalesces shortcut events from separate turns to the final cursor target', async () => {
    vi.useFakeTimers()
    const opened: string[] = []
    const { navigation } = readyNavigation({
      openCodex: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'opened' } },
      openClaude: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'dispatched' } }
    })

    const first = navigation.cycle(1)
    await vi.advanceTimersByTimeAsync(30)
    const second = navigation.cycle(1)
    await vi.advanceTimersByTimeAsync(30)
    const third = navigation.cycle(-1)
    await vi.advanceTimersByTimeAsync(navigationModule.DEFAULT_COALESCE_MS)

    await expect(first).resolves.toMatchObject({ errorCode: 'superseded' })
    await expect(second).resolves.toMatchObject({ errorCode: 'superseded' })
    await expect(third).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    expect(opened).toEqual(['codex-a'])
    expect(navigation.diagnostics()).toMatchObject({ maxConcurrent: 1, replacedCount: 2, acceptedCycleCount: 3 })
  })

  it('never overlaps Codex and Claude Host dispatches', async () => {
    let releaseFirst!: () => void
    let concurrent = 0
    let maximum = 0
    const opened: string[] = []
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const open = async (target: { key: string }) => {
      concurrent += 1
      maximum = Math.max(maximum, concurrent)
      opened.push(target.key)
      if (target.key === 'codex-a') await firstGate
      concurrent -= 1
      return { outcome: 'opened' }
    }
    const { navigation } = readyNavigation({ openCodex: open, openClaude: open })

    const first = navigation.open({ key: 'codex-a', source: 'attention' })
    const second = navigation.open({ key: 'claude:local_a', source: 'attention' })
    await vi.waitFor(() => expect(opened).toEqual(['codex-a']))
    expect(maximum).toBe(1)
    releaseFirst()
    await expect(first).resolves.toMatchObject({ outcome: 'opened' })
    await expect(second).resolves.toMatchObject({ outcome: 'opened' })
    expect(opened).toEqual(['codex-a', 'claude:local_a'])
    expect(navigation.diagnostics().maxConcurrent).toBe(1)
  })

  it('lets an explicit task open replace an undispatched generic cycle', async () => {
    vi.useFakeTimers()
    const opened: string[] = []
    const { navigation } = readyNavigation({
      openCodex: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'opened' } },
      openClaude: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'dispatched' } }
    })

    const cycle = navigation.cycle(1)
    const manual = navigation.open({ key: 'claude:local_a', source: 'manual' })
    await expect(cycle).resolves.toMatchObject({ errorCode: 'superseded' })
    await expect(manual).resolves.toMatchObject({ outcome: 'dispatched' })
    await vi.runAllTimersAsync()
    expect(opened).toEqual(['claude:local_a'])
  })

  it('queues an exact card target even while a remounted Renderer retains an older ready snapshot', async () => {
    const opened: string[] = []
    const { navigation, receipt } = readyNavigation({
      openCodex: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'opened' } },
      openClaude: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'dispatched' } }
    })
    navigation.detach({ lease: receipt.lease })
    expect(navigation.begin({ enabled: true, providers: { codex: true, claude: true } })).toMatchObject({
      retained: true,
      ready: true
    })

    const target = {
      key: 'claude:local_new',
      provider: 'claude',
      actionAlias: 'local_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revisionAt: 104,
      phase: 'running',
      canArchive: false
    }
    await expect(navigation.open({ key: target.key, target, source: 'manual' })).resolves.toMatchObject({
      outcome: 'dispatched',
      key: target.key
    })
    expect(opened).toEqual([target.key])
    expect(navigation.diagnostics().maxConcurrent).toBe(1)
  })

  it('retains the ready snapshot and cursor across Renderer detach/remount', async () => {
    vi.useFakeTimers()
    const opened: string[] = []
    const { navigation, receipt } = readyNavigation({
      openCodex: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'opened' } },
      openClaude: async (target: { key: string }) => { opened.push(target.key); return { outcome: 'dispatched' } }
    })
    expect(navigation.detach({ lease: receipt.lease })).toBe(true)
    const remount = navigation.begin({ enabled: true, providers: { codex: true, claude: true } })
    expect(remount).toMatchObject({ retained: true, ready: true })

    expect(navigation.handleEnter({ code: 'eypc-codex-task-next' })).toBe(true)
    await vi.advanceTimersByTimeAsync(navigationModule.DEFAULT_COALESCE_MS)
    await vi.runAllTimersAsync()
    expect(opened).toEqual(['codex-a'])
  })

  it('invalidates a retained snapshot when provider enablement changes', () => {
    const { navigation, receipt } = readyNavigation()
    navigation.detach({ lease: receipt.lease })
    const remount = navigation.begin({ enabled: true, providers: { codex: true, claude: false } })
    expect(remount).toMatchObject({ retained: false, ready: false })
    expect(navigation.handleEnter({ code: 'eypc-codex-task-next' })).toBe(false)
  })

  it('keeps anonymous successful cycle results for the next Controller lease', async () => {
    vi.useFakeTimers()
    const { navigation, receipt } = readyNavigation({
      openCodex: async () => ({ outcome: 'opened' }),
      openClaude: async () => ({ outcome: 'dispatched' })
    })
    const cycle = navigation.cycle(1)
    await vi.advanceTimersByTimeAsync(navigationModule.DEFAULT_COALESCE_MS)
    await expect(cycle).resolves.toMatchObject({ outcome: 'opened' })
    navigation.detach({ lease: receipt.lease })
    const remount = navigation.begin({ enabled: true, providers: { codex: true, claude: true } })
    expect(navigation.takeResults({ lease: remount.lease })).toEqual([
      expect.objectContaining({ id: 1, provider: 'codex', key: 'codex-a', outcome: 'opened' })
    ])
    expect(navigation.takeResults({ lease: remount.lease })).toEqual([])
  })
})
