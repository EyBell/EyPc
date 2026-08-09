import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCompanionTaskKernel, UNKNOWN_GRACE_MS } = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
  UNKNOWN_GRACE_MS: number
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    key: 'codex-a',
    provider: 'codex',
    kind: 'codex-thread',
    phase: 'running',
    cycleTier: 'active',
    dynamicGroup: 'active',
    actionAlias: 'ct_codex_a_1234567890',
    revisionAt: 100,
    statusEnteredAt: 100,
    displayOrder: 0,
    cycleOrder: 0,
    attentionOrder: 0,
    hidden: false,
    unread: false,
    planImplementation: false,
    localPin: false,
    dynamicEligible: true,
    capabilities: { open: true, archive: false },
    ...overrides
  }
}

function draft(tasks: unknown[], revision = 1, overrides: Record<string, unknown> = {}) {
  return {
    schema: 'companion-task-draft-v1',
    producer: 'renderer',
    sourceTaskStateRevision: 'task-state-v9',
    draftRevision: revision,
    acceptedAt: 1_000 + revision,
    enabled: true,
    providers: { codex: true, claude: true },
    complete: true,
    focusedKey: '',
    sourceGenerations: { codex: revision, claude: revision },
    tasks,
    ...overrides
  }
}

afterEach(() => vi.useRealTimers())

describe('CompanionTaskKernel', () => {
  it('routes card click and keyboard cycle through the same complete target', async () => {
    const opened: Array<Record<string, unknown>> = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      adapters: {
        codex: {
          open: vi.fn(async (target: Record<string, unknown>) => {
            opened.push({ ...target })
            return { outcome: 'opened' }
          })
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })

    await expect(kernel.dispatch({ action: 'open', key: 'codex-a', source: 'manual' })).resolves.toMatchObject({ outcome: 'opened' })
    await expect(kernel.dispatch({ action: 'cycle', direction: 1 })).resolves.toMatchObject({ outcome: 'opened' })

    expect(opened).toHaveLength(2)
    expect(opened[0]).toMatchObject({ key: 'codex-a', provider: 'codex', revisionAt: 100, phase: 'running', canArchive: false })
    expect(opened[1]).toEqual(opened[0])
    expect(kernel.diagnostics().navigation.lastOutcome).toBe('opened')
  })

  it('reduces precise state immediately, ignores stale terminal regressions and permits a newer Turn restart', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const sync = (value: Record<string, unknown>, revision: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(value)], revision, { providers: { codex: true, claude: false } })
    })

    expect(sync({ phase: 'running', revisionAt: 100, statusEnteredAt: 100 }, 1).tasks[0].phase).toBe('running')
    expect(sync({ phase: 'waiting-input', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 110, statusEnteredAt: 110 }, 2).tasks[0].phase).toBe('waiting-input')
    expect(sync({ phase: 'completed', cycleTier: 'none', dynamicGroup: 'completed', revisionAt: 120, statusEnteredAt: 120 }, 3).tasks[0].phase).toBe('completed')
    expect(sync({ phase: 'running', revisionAt: 120, statusEnteredAt: 119 }, 4).tasks[0].phase).toBe('completed')
    expect(sync({ phase: 'running', revisionAt: 130, statusEnteredAt: 130 }, 5).tasks[0].phase).toBe('running')
    expect(sync({ phase: 'waiting-approval', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 140, statusEnteredAt: 140 }, 6).tasks[0].phase).toBe('waiting-approval')
    expect(sync({ phase: 'stopped', cycleTier: 'none', dynamicGroup: 'stopped', revisionAt: 140, statusEnteredAt: 139 }, 7).tasks[0].phase).toBe('waiting-approval')
  })

  it('ignores duplicate and lower producer drafts without deleting newer tasks', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const second = task({ key: 'codex-b', actionAlias: 'ct_codex_b_1234567890', displayOrder: 1, cycleOrder: 1, attentionOrder: 1 })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(), second], 5, { providers: { codex: true, claude: false }, sourceGenerations: { codex: 5, claude: 0 } })
    })

    const lower = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ revisionAt: 999 })], 4, { providers: { codex: true, claude: false }, sourceGenerations: { codex: 4, claude: 0 } })
    })
    const duplicate = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ revisionAt: 1_000 })], 5, { providers: { codex: true, claude: false }, sourceGenerations: { codex: 6, claude: 0 } })
    })

    expect(lower).toBe(current)
    expect(duplicate).toBe(current)
    expect(current.tasks.map((value: any) => value.key)).toEqual(['codex-a', 'codex-b'])
  })

  it('preserves only the provider slice whose source generation regressed', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const claude = task({
      key: 'claude-a',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'local-claude-a',
      displayOrder: 1,
      cycleOrder: 1,
      attentionOrder: 1
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(), claude], 1, { sourceGenerations: { codex: 10, claude: 10 } })
    })

    const next = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-stale', actionAlias: 'ct_codex_stale_123456', revisionAt: 999 }),
        { ...claude, phase: 'waiting-input', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 200, statusEnteredAt: 200 }
      ], 2, { sourceGenerations: { codex: 9, claude: 11 } })
    })

    expect(next.tasks.find((value: any) => value.provider === 'codex')).toMatchObject({ key: 'codex-a', revisionAt: 100 })
    expect(next.tasks.find((value: any) => value.provider === 'claude')).toMatchObject({ key: 'claude-a', phase: 'waiting-input', revisionAt: 200 })
    expect(next.sourceGenerations).toEqual({ codex: 10, claude: 11 })
  })

  it('degrades freshness before two failed observations cross the unknown grace', () => {
    let now = 1_000
    const kernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    const firstUnknown = kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 2, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    expect(firstUnknown).toMatchObject({ freshness: 'degraded' })
    expect(firstUnknown.tasks[0].phase).toBe('running')

    now += UNKNOWN_GRACE_MS
    const secondUnknown = kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 3, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    expect(secondUnknown.tasks[0].phase).toBe('unknown')
  })

  it('refuses to navigate from a degraded retained package when its shared preflight fails', async () => {
    const opened = vi.fn(async () => ({ outcome: 'opened' }))
    const preflight = vi.fn(async () => { throw new Error('provider unavailable') })
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 2, { providers: { codex: true, claude: false } })
    })

    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'degraded', tasks: [{ phase: 'running' }] })
    await expect(kernel.dispatch({ action: 'cycle', direction: 1 })).resolves.toMatchObject({
      outcome: 'unavailable',
      errorCode: 'inventory-not-ready'
    })
    expect(preflight).toHaveBeenCalledTimes(1)
    expect(opened).not.toHaveBeenCalled()
    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'degraded', tasks: [{ phase: 'running' }] })
  })

  it('consumes a silent shortcut before any Renderer attaches and never replays it', async () => {
    const opened = vi.fn(async () => ({ outcome: 'opened' }))
    const preflight = vi.fn(async () => draft([task()], 1, { providers: { codex: true, claude: false } }))
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })

    expect(kernel.handleEnter({ code: 'eypc-codex-task-next' })).toBe(true)
    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    expect(preflight).toHaveBeenCalledTimes(1)

    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    expect(receipt.retained).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('publishes coherent revisions once across 100 rapid provider transitions', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const published: Array<{ revision: number; phase: string; group: string }> = []
    kernel.onPackage((value: any) => {
      if (!value.complete) return
      const row = value.tasks[0]
      published.push({
        revision: value.packageRevision,
        phase: row.phase,
        group: Object.entries(value.views.groups).find(([, keys]) => (keys as string[]).includes(row.key))?.[0] || 'none'
      })
    })

    for (let index = 1; index <= 100; index += 1) {
      const waiting = index % 2 === 0
      kernel.syncPackage({
        lease: receipt.lease,
        draft: draft([task({
          phase: waiting ? 'waiting-input' : 'running',
          cycleTier: waiting ? 'attention' : 'active',
          dynamicGroup: waiting ? 'input' : 'active',
          revisionAt: 100 + index,
          statusEnteredAt: 100 + index
        })], index)
      })
    }

    expect(published).toHaveLength(100)
    expect(new Set(published.map((value) => value.revision)).size).toBe(100)
    expect(published.every((value) => value.phase === 'waiting-input' ? value.group === 'input' : value.group === 'active')).toBe(true)
  })

  it('keeps hot dispatch and atomic Main/Float publication inside the accepted latency budgets', async () => {
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      adapters: { codex: { open: async () => ({ outcome: 'opened' }) } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const mainApplied: number[] = []
    const floatApplied: number[] = []
    kernel.onPackage((value: any) => { if (value.complete) mainApplied.push(value.packageRevision) })
    kernel.onPackage((value: any) => { if (value.complete) floatApplied.push(value.packageRevision) })
    const publishStarted = performance.now()
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    const publishElapsed = performance.now() - publishStarted
    expect(mainApplied.at(-1)).toBe(floatApplied.at(-1))
    expect(publishElapsed).toBeLessThan(50)

    const samples: number[] = []
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now()
      await kernel.dispatch({ action: 'open', key: 'codex-a', source: 'manual' })
      samples.push(performance.now() - started)
    }
    samples.sort((left, right) => left - right)
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(200)
  })

  it('completes an available-provider cold preflight within 1.5 seconds', async () => {
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight: async () => draft([task()], 1, { providers: { codex: true, claude: false } }),
      adapters: { codex: { open: async () => ({ outcome: 'opened' }) } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const started = performance.now()
    await expect(kernel.dispatch({ action: 'cycle', direction: 1 })).resolves.toMatchObject({ outcome: 'opened' })
    expect(performance.now() - started).toBeLessThan(1_500)
  })
})
