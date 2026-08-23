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
  it('correlates quick-jump selection and Provider open with one operation id and records failures as errors', async () => {
    const records: Array<Record<string, unknown>> = []
    const operationId = 'manual-quick-jump-0001'
    const { navigation } = readyNavigation({
      record: (entry: Record<string, unknown>) => records.push(entry),
      openTarget: async (target: { provider: string }) => ({
        outcome: target.provider === 'claude' ? 'dispatched' : 'opened',
        operationId
      })
    })

    await expect(navigation.open({
      key: 'codex-a',
      source: 'manual-quick-jump',
      operationId
    })).resolves.toMatchObject({ outcome: 'opened', operationId })
    expect(records).toContainEqual(expect.objectContaining({
      level: 'debug',
      scope: 'navigation',
      event: 'target-selected',
      operationId,
      source: 'manual-quick-jump',
      provider: 'codex',
      taskRef: 'codex-a'
    }))
    expect(records).toContainEqual(expect.objectContaining({
      level: 'info',
      scope: 'navigation',
      event: 'codex-open',
      outcome: 'opened',
      operationId,
      source: 'manual-quick-jump'
    }))

    await expect(navigation.open({
      key: 'missing',
      source: 'manual-row-open',
      operationId: 'manual-row-open-failed-0002'
    })).resolves.toMatchObject({
      outcome: 'unavailable',
      operationId: 'manual-row-open-failed-0002',
      errorCode: 'stale-target'
    })
    expect(records).toContainEqual(expect.objectContaining({
      level: 'error',
      event: 'open',
      outcome: 'failed',
      code: 'stale-target',
      operationId: 'manual-row-open-failed-0002',
      source: 'manual-row-open'
    }))
  })

  it('dispatches the leading shortcut immediately without advancing past an unconfirmed target', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const opened: string[] = []
    const open = async (target: { key: string }) => {
      opened.push(target.key)
      if (opened.length === 1) await firstGate
      return { outcome: 'opened' }
    }
    const { navigation } = readyNavigation({ openTarget: open })

    const first = navigation.cycle(1)
    await Promise.resolve()
    expect(opened).toEqual(['codex-a'])

    const second = navigation.cycle(1)
    const third = navigation.cycle(1)
    expect(opened).toEqual(['codex-a'])
    releaseFirst()

    await expect(first).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    await expect(second).resolves.toMatchObject({ errorCode: 'superseded' })
    await expect(third).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    expect(opened).toEqual(['codex-a'])
    expect(navigation.diagnostics()).toMatchObject({ maxConcurrent: 1, acceptedCycleCount: 3 })
  })

  it('commits the cycle cursor only after Host confirms the exact target opened', async () => {
    const opened: string[] = []
    let failFirst = true
    const { navigation } = readyNavigation({
      openTarget: async (target: { key: string; provider: string }) => {
        opened.push(target.key)
        if (failFirst) {
          failFirst = false
          return { outcome: 'failed', errorCode: 'test-failure' }
        }
        return { outcome: target.provider === 'claude' ? 'dispatched' : 'opened' }
      }
    })

    await expect(navigation.cycle(1)).resolves.toMatchObject({ outcome: 'failed', key: 'codex-a' })
    await expect(navigation.cycle(1)).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    await expect(navigation.cycle(1)).resolves.toMatchObject({ outcome: 'dispatched', key: 'claude:local_a' })
    expect(opened).toEqual(['codex-a', 'codex-a', 'claude:local_a'])
  })

  it('dispatches separate completed shortcut turns without a fixed debounce delay', async () => {
    const opened: string[] = []
    const { navigation } = readyNavigation({
      openTarget: async (target: { key: string; provider: string }) => {
        opened.push(target.key)
        return { outcome: target.provider === 'claude' ? 'dispatched' : 'opened' }
      }
    })

    const first = navigation.cycle(1)
    await expect(first).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    const second = navigation.cycle(1)
    await expect(second).resolves.toMatchObject({ outcome: 'dispatched', key: 'claude:local_a' })
    const third = navigation.cycle(-1)
    await expect(third).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    expect(opened).toEqual(['codex-a', 'claude:local_a', 'codex-a'])
    expect(navigation.diagnostics()).toMatchObject({ maxConcurrent: 1, replacedCount: 0, acceptedCycleCount: 3 })
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
    const { navigation } = readyNavigation({ openTarget: open })

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

  it('lets an explicit task open replace the queued trailing generic cycle', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const opened: string[] = []
    let callCount = 0
    const { navigation } = readyNavigation({
      openTarget: async (target: { key: string; provider: string }) => {
        opened.push(target.key)
        callCount += 1
        if (callCount === 1) await firstGate
        return { outcome: target.provider === 'claude' ? 'dispatched' : 'opened' }
      }
    })

    const first = navigation.cycle(1)
    const cycle = navigation.cycle(1)
    const manual = navigation.open({ key: 'claude:local_a', source: 'manual' })
    releaseFirst()
    await expect(first).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    await expect(cycle).resolves.toMatchObject({ errorCode: 'superseded' })
    await expect(manual).resolves.toMatchObject({ outcome: 'dispatched' })
    expect(opened).toEqual(['codex-a', 'claude:local_a'])
  })

  it('queues an exact card target even while a remounted Renderer retains an older ready snapshot', async () => {
    const opened: string[] = []
    const { navigation, receipt } = readyNavigation({
      openTarget: async (target: { key: string; provider: string }) => {
        opened.push(target.key)
        return { outcome: target.provider === 'claude' ? 'dispatched' : 'opened' }
      }
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
      openTarget: async (target: { key: string; provider: string }) => {
        opened.push(target.key)
        return { outcome: target.provider === 'claude' ? 'dispatched' : 'opened' }
      }
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

  it('cycles across Cursor targets through the same Provider-neutral openTarget lane', async () => {
    const opened: Array<{ provider: string; key: string }> = []
    const navigation = navigationModule.createCompanionNavigation({
      openTarget: async (target: { key: string; provider: string }) => {
        opened.push({ provider: target.provider, key: target.key })
        return { outcome: target.provider === 'codex' ? 'opened' : 'dispatched' }
      }
    })
    const receipt = navigation.begin({ enabled: true, providers: { codex: true, claude: true, cursor: true } })
    const mixedTargets = [
      ...targets,
      { key: 'cursor:11111111-2222-4333-8444-555555555555', provider: 'cursor', actionAlias: '11111111-2222-4333-8444-555555555555', revisionAt: 105, phase: 'running', canArchive: false }
    ]
    expect(navigation.sync({
      lease: receipt.lease,
      enabled: true,
      providers: { codex: true, claude: true, cursor: true },
      ready: true,
      targets: mixedTargets,
      cycleKeys: mixedTargets.map((target) => target.key)
    })).toBe(true)

    await expect(navigation.cycle(1)).resolves.toMatchObject({ outcome: 'opened', key: 'codex-a' })
    await expect(navigation.cycle(1)).resolves.toMatchObject({ outcome: 'dispatched', key: 'claude:local_a' })
    await expect(navigation.cycle(1)).resolves.toMatchObject({ outcome: 'opened', key: 'codex-b' })
    await expect(navigation.cycle(1)).resolves.toMatchObject({
      outcome: 'dispatched',
      provider: 'cursor',
      key: 'cursor:11111111-2222-4333-8444-555555555555'
    })
    expect(opened.at(-1)).toEqual({ provider: 'cursor', key: 'cursor:11111111-2222-4333-8444-555555555555' })
    expect(navigation.diagnostics().dispatched).toMatchObject({ codex: 2, claude: 1, cursor: 1 })
  })

  it('keeps anonymous successful cycle results for the next Controller lease', async () => {
    vi.useFakeTimers()
    const { navigation, receipt } = readyNavigation({
      openTarget: async (target: { provider: string }) => ({ outcome: target.provider === 'claude' ? 'dispatched' : 'opened' })
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
