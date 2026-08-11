import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCompanionTaskKernel: createCompanionTaskKernelRaw, reduceCodexTaskEvidenceV4, reduceClaudeTaskEvidenceV4, UNKNOWN_GRACE_MS } = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
  reduceCodexTaskEvidenceV4(value?: Record<string, unknown>): Record<string, any>
  reduceClaudeTaskEvidenceV4(value?: Record<string, unknown>): Record<string, any>
  UNKNOWN_GRACE_MS: number
}

function createCompanionTaskKernel(options: Record<string, unknown> = {}) {
  return createCompanionTaskKernelRaw({ now: () => 1_000, ...options })
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
    membershipRevision: 100,
    phaseRevision: 100,
    unreadRevision: 100,
    visibilityRevision: 100,
    statusEnteredAt: 100,
    lastQuestionAt: 100,
    createdAt: 50,
    displayOrder: 0,
    cycleOrder: 0,
    attentionOrder: 0,
    hidden: false,
    unread: false,
    planImplementation: false,
    planReady: false,
    planLifecycleRevision: 0,
    paused: false,
    turnMode: 'unknown',
    idleConfirmed: false,
    localPin: false,
    dynamicEligible: true,
    capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false },
    ...overrides
  }
}

function draft(tasks: unknown[], revision = 1, overrides: Record<string, unknown> = {}) {
  const sourceGenerations = (overrides.sourceGenerations as { codex?: number; claude?: number } | undefined)
    || { codex: revision, claude: revision }
  const sourceLaneGenerations = (overrides.sourceLaneGenerations as Record<string, unknown> | undefined)
    || {
      codex: { membership: sourceGenerations.codex || 0, phase: sourceGenerations.codex || 0, unread: sourceGenerations.codex || 0 },
      claude: { membership: sourceGenerations.claude || 0, phase: sourceGenerations.claude || 0, unread: sourceGenerations.claude || 0 }
    }
  return {
    schema: 'companion-task-draft-v4',
    producer: 'host-evidence',
    sourceTaskStateRevision: 'task-state-v10',
    draftRevision: revision,
    acceptedAt: 1_000 + revision,
    enabled: true,
    providers: { codex: true, claude: true },
    complete: true,
    focusedKey: '',
    tasks,
    ...overrides,
    sourceGenerations,
    sourceLaneGenerations
  }
}

afterEach(() => vi.useRealTimers())

describe('CompanionTaskKernel', () => {
  it('keeps canonical selectors and production fallback ownership inside the V4 Kernel', () => {
    const kernelSource = readFileSync(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'), 'utf8')
    const hostSource = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const domainSource = readFileSync(resolve(process.cwd(), 'src/domain/companionTaskPackage.ts'), 'utf8')
    const controllerSource = readFileSync(resolve(process.cwd(), 'src/runtime/codexController.ts'), 'utf8')
    const floatSource = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')

    expect(kernelSource).toContain('function derivedCycleTier(task)')
    expect(kernelSource).toContain('function derivedDynamicGroup(task)')
    expect(kernelSource).toContain('function buildViews(tasks)')
    expect(kernelSource).toContain('function reduceClaudeTaskEvidenceV4(value = {})')
    expect(controllerSource).not.toContain('buildCompanionTaskPackageDraft')
    expect(domainSource).not.toContain('buildCompanionTaskPackageDraft')
    expect(domainSource).not.toContain('function canonicalPhase(')
    expect(domainSource).not.toContain('function dynamicGroupByKey(')
    expect(domainSource).not.toContain('function cycleTier(')
    expect(controllerSource).not.toContain('allowLegacyCompanionAdapters')
    expect(controllerSource).not.toContain('companionTaskActionTarget')
    expect(controllerSource).not.toContain('syncCompanionNavigation')
    expect(controllerSource).not.toContain('syncCompanionTaskActions')
    expect(controllerSource).not.toContain('cycleOrderedTasks')
    expect(controllerSource).not.toContain('runDirectTaskCommand')
    expect(floatSource).not.toMatch(/(?:cycleTier|dynamicGroup|cycleKeys)\s*:/)
    expect(hostSource).not.toContain('function companionCycleTier(')
    expect(hostSource).not.toContain('function companionDynamicGroup(')
    expect(hostSource).toContain('return reduceClaudeTaskEvidenceV4({ phase: value, unread: unread === true })')
    expect([...hostSource.matchAll(/cycleTier:\s*([^,\n]+)/g)].map((match) => match[1].trim()).every((value) => value === "'none'")).toBe(true)
    expect([...hostSource.matchAll(/dynamicGroup:\s*([^,\n]+)/g)].map((match) => match[1].trim()).every((value) => value === "'none'")).toBe(true)
  })

  it('uses causal Turn watermarks as the sole Codex phase truth table', () => {
    const base = {
      previousPhase: 'running',
      status: 'active',
      statusAuthority: 'app-server-live',
      activeFlags: []
    }

    expect(reduceCodexTaskEvidenceV4({
      ...base,
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 11
    })).toMatchObject({ phase: 'running', freshness: 'verifying', reason: 'terminal-verifying' })

    expect(reduceCodexTaskEvidenceV4({
      ...base,
      status: 'idle',
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'targeted-after-exit',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 11,
      idleConfirmed: true
    })).toMatchObject({ phase: 'stopped', freshness: 'fresh', reason: 'ordinary-interrupted-idle-confirmed' })

    expect(reduceCodexTaskEvidenceV4({
      ...base,
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 12,
      terminalEvidenceSequence: 11
    })).toMatchObject({ phase: 'running', freshness: 'verifying', reason: 'active-terminal-conflict' })

    expect(reduceCodexTaskEvidenceV4({
      ...base,
      activeFlags: ['waitingOnUserInput'],
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 12,
      terminalEvidenceSequence: 11
    })).toMatchObject({ phase: 'waiting-input', freshness: 'fresh', reason: 'causal-waiting-input' })

    expect(reduceCodexTaskEvidenceV4({
      ...base,
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 11
    })).toMatchObject({ phase: 'running', freshness: 'fresh', reason: 'causal-active' })

    expect(reduceCodexTaskEvidenceV4({
      ...base,
      previousPhase: 'completed',
      status: 'notLoaded',
      statusAuthority: 'inventory',
      lastTurnStatus: 'failed',
      lastTurnEvidence: 'inventory',
      activeEvidenceSequence: 0,
      terminalEvidenceSequence: 0
    })).toMatchObject({ phase: 'completed', freshness: 'verifying', reason: 'terminal-verifying' })
  })

  it('keeps Claude live/terminal/unread phase rules inside the shared Kernel reducer', () => {
    expect(reduceClaudeTaskEvidenceV4({ phase: 'running', unread: true })).toMatchObject({ phase: 'running', reason: 'provider-live' })
    expect(reduceClaudeTaskEvidenceV4({ phase: 'stopped', unread: true })).toMatchObject({ phase: 'completed', reason: 'native-unread-completion' })
    expect(reduceClaudeTaskEvidenceV4({ phase: 'unknown', unread: false })).toMatchObject({ phase: 'unknown', freshness: 'verifying' })
  })

  it('keeps the Plan lifecycle across refinement, interruption and pause until exact default execution starts', async () => {
    const persisted: Array<Record<string, unknown>> = []
    const kernel = createCompanionTaskKernel({
      persistPlanPause: (value: Record<string, unknown>) => { persisted.push(value); return true },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 })
    const sync = (value: Record<string, unknown>, revision: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(value)], revision, { providers: { codex: true, claude: false } })
    })

    expect(sync({ turnMode: 'plan', phase: 'running', planReady: false }, 1).tasks[0]).toMatchObject({ phase: 'running', planReady: false })
    const ready = sync({
      turnMode: 'plan',
      phase: 'waiting-input',
      planImplementation: true,
      planReady: true,
      planLifecycleRevision: 200,
      capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: false }
    }, 2)
    expect(ready.tasks[0]).toMatchObject({ phase: 'waiting-input', planReady: true, planLifecycleRevision: 200 })
    expect(ready.views.counts.input).toBe(1)
    expect(ready.views.cycleKeys).toEqual(['codex-a'])

    expect(sync({ turnMode: 'plan', phase: 'running', planReady: false, planLifecycleRevision: 0 }, 3).tasks[0])
      .toMatchObject({ phase: 'running', planReady: true, planLifecycleRevision: 200 })
    const stopped = sync({
      turnMode: 'plan',
      phase: 'stopped',
      planReady: true,
      planLifecycleRevision: 200,
      dynamicEligible: false,
      capabilities: { open: true, archive: true, pause: true, resume: true, executePlan: false }
    }, 4)
    expect(stopped.tasks[0]).toMatchObject({ phase: 'stopped', planReady: true, dynamicGroup: 'stopped' })
    expect(stopped.views.groups.stopped).toEqual(['codex-a'])
    expect(stopped.views.cycleKeys).toEqual(['codex-a'])

    await expect(kernel.dispatch({ action: 'pause', key: 'codex-a', planLifecycleRevision: 200 }))
      .resolves.toMatchObject({ outcome: 'paused' })
    expect(kernel.getLatest().views).toMatchObject({ pausedKeys: ['codex-a'], cycleKeys: [], counts: { input: 0, active: 0, unread: 0 } })
    await expect(kernel.dispatch({ action: 'resume', key: 'codex-a', planLifecycleRevision: 200 }))
      .resolves.toMatchObject({ outcome: 'resumed' })
    expect(persisted.map((value) => value.paused)).toEqual([true, false])

    const executing = sync({ turnMode: 'default', turnStartedAt: 500, phase: 'running', planReady: true, planLifecycleRevision: 200 }, 5)
    expect(executing.tasks[0]).toMatchObject({ phase: 'running', planReady: false, planLifecycleRevision: 0, paused: false })
  })

  it('keeps ordinary waiting ahead of a retained Plan and makes only the exact Plan wait executable', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const ordinaryWait = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'waiting-input',
        planReady: true,
        planLifecycleRevision: 200,
        planImplementation: false,
        capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: true }
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(ordinaryWait.tasks[0]).toMatchObject({
      cycleTier: 'attention',
      capabilities: { pause: false, resume: false, executePlan: false }
    })

    const exactPlanWait = kernel.publishEvidence(draft([task({
      phase: 'waiting-input',
      phaseRevision: 201,
      statusEnteredAt: 201,
      planReady: true,
      planLifecycleRevision: 200,
      planImplementation: true,
      capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: true }
    })], 2, { producer: 'host-evidence', providers: { codex: true, claude: false } }))
    expect(exactPlanWait.tasks[0]).toMatchObject({
      cycleTier: 'plan',
      planLifecycleRevision: 200,
      capabilities: { pause: true, resume: false, executePlan: true }
    })
  })

  it('does not change the Plan lifecycle revision when only generic metadata advances', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'waiting-input',
        planReady: true,
        planImplementation: true,
        planLifecycleRevision: 200,
        revisionAt: 200
      })], 1, { providers: { codex: true, claude: false } })
    })
    const refreshed = kernel.publishEvidence(draft([task({
      phase: 'waiting-input',
      planReady: true,
      planImplementation: true,
      planLifecycleRevision: 200,
      revisionAt: 9_999,
      metadataRevision: 9_999
    })], 2, { producer: 'host-evidence', providers: { codex: true, claude: false } }))
    expect(refreshed.tasks[0].planLifecycleRevision).toBe(200)
  })

  it('migrates a legacy hidden Plan transactionally and rolls back pause when hidden-state cleanup fails', () => {
    const persisted: boolean[] = []
    const kernel = createCompanionTaskKernel({
      persistPlanPause: (value: Record<string, unknown>) => { persisted.push(value.paused === true); return true },
      migrateHiddenPlan: () => false,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        hidden: true,
        phase: 'stopped',
        planReady: true,
        planLifecycleRevision: 200
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(current.tasks[0]).toMatchObject({ hidden: true, paused: false })
    expect(persisted).toEqual([true, false])
  })

  it('uses one next-boundary timer and publishes only when dynamic visibility actually changes', () => {
    vi.useFakeTimers()
    let now = 1_000
    const kernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 })
    const revisions: number[] = []
    kernel.subscribe(0, (value: any) => { if (value.complete) revisions.push(value.packageRevision) })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    expect(kernel.getLatest().views.groups.active).toEqual(['codex-a'])
    expect(kernel.diagnostics().nextVisibilityTransitionAt).toBe(3_600_100)

    now = 3_600_101
    vi.advanceTimersByTime(3_599_101)
    expect(kernel.getLatest().views.groups.active).toEqual([])
    expect(revisions).toHaveLength(2)
    expect(kernel.diagnostics().nextVisibilityTransitionAt).toBe(0)
  })

  it('keeps the complete admitted inventory without a product task-count cap', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const tasks = Array.from({ length: 2_005 }, (_, index) => task({
      key: `codex-${index}`,
      actionAlias: `ct_codex_${String(index).padStart(10, '0')}`,
      revisionAt: 1_000 + index,
      membershipRevision: 1_000 + index,
      phaseRevision: 1_000 + index,
      unreadRevision: 1_000 + index,
      visibilityRevision: 1_000 + index,
      displayOrder: index,
      cycleOrder: index,
      attentionOrder: index
    }))
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })
    expect(kernel.getPackage().tasks).toHaveLength(2_005)
    expect(kernel.diagnostics()).toMatchObject({
      taskCount: 2_005,
      navigation: { targetCount: 2_005 },
      actions: { targetCount: 2_005 }
    })
    kernel.close()
  })

  it('keeps all 240 paged tasks in package, unread tab, badge, attention shortcut and archive targets', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const tasks = Array.from({ length: 240 }, (_, index) => task({
      key: `codex-page-${index + 1}`,
      actionAlias: `ct_codex_page_${String(index + 1).padStart(10, '0')}`,
      phase: 'completed',
      cycleTier: 'none',
      dynamicGroup: 'unread',
      revisionAt: 1_000 + index,
      membershipRevision: 1_000 + index,
      phaseRevision: 1_000 + index,
      unreadRevision: 1_000 + index,
      visibilityRevision: 1_000 + index,
      displayOrder: index,
      cycleOrder: index,
      attentionOrder: index,
      unread: true,
      unreadKnown: true,
      capabilities: { open: true, archive: true },
      archiveRequest: {
        evidence: 'completed',
        expectedRevisionAt: 1_000 + index,
        expectedUpdatedAt: 1_000 + index,
        expectedCompletionAt: 1_000 + index,
        expectedLastTurnStartedAt: 900 + index,
        expectedSourceFingerprint: 'a'.repeat(64)
      }
    }))
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })

    for (const index of [40, 100, 200]) {
      const key = `codex-page-${index + 1}`
      expect(current.tasks.some((value: any) => value.key === key)).toBe(true)
      expect(current.views.groups.unread).toContain(key)
      expect(current.views.attentionKeys.completedUnread).toContain(key)
      expect(current.views.attentionKeys.archive).toContain(key)
    }
    expect(current.views.counts.unread).toBe(240)
    expect(kernel.diagnostics()).toMatchObject({ taskCount: 240, actions: { targetCount: 240 } })
    kernel.close()
  })

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

  it('owns attention progress, preserves it across equivalent packages and advances only after a successful open', async () => {
    const opened: string[] = []
    let failFirst = true
    const kernel = createCompanionTaskKernel({
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => {
            opened.push(String(target.key))
            if (target.key === 'codex-new' && failFirst) {
              failFirst = false
              return { outcome: 'failed', errorCode: 'test-failure' }
            }
            return { outcome: 'opened' }
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-old', phase: 'waiting-input', lastQuestionAt: 100, statusEnteredAt: 100 }),
        task({ key: 'codex-new', phase: 'waiting-input', lastQuestionAt: 200, statusEnteredAt: 200 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'failed' })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-new' })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-old', phase: 'waiting-input', lastQuestionAt: 100, statusEnteredAt: 100, metadataRevision: 500 }),
        task({ key: 'codex-new', phase: 'waiting-input', lastQuestionAt: 200, statusEnteredAt: 200, metadataRevision: 500 })
      ], 2, { providers: { codex: true, claude: false } })
    })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-old' })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-new' })

    expect(opened).toEqual(['codex-new', 'codex-new', 'codex-old', 'codex-new'])
  })

  it('uses a local pin only as the input shortcut fallback without changing the compact input count', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => {
            opened.push(String(target.key))
            return { outcome: 'opened' }
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const packageValue = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ key: 'codex-pin', phase: 'completed', localPin: true, unread: false })], 1, {
        providers: { codex: true, claude: false }
      })
    })

    expect(packageValue.views.counts.input).toBe(0)
    expect(packageValue.views.attentionKeys.input).toEqual(['codex-pin'])
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-pin' })
    expect(opened).toEqual(['codex-pin'])
  })

  it('keeps a Claude open-read hint for the same completion and releases it for the next completion', async () => {
    const kernel = createCompanionTaskKernel({
      adapters: { claude: { open: async () => ({ outcome: 'opened' }) } },
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    const claudeTask = (overrides: Record<string, unknown>) => task({
      key: 'claude:local-a',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'local-a',
      capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false },
      ...overrides
    })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'completed', unread: true, revisionAt: 100, phaseRevision: 100, statusEnteredAt: 100, terminalAt: 100 })], 1, {
        providers: { codex: false, claude: true }
      })
    })
    await expect(kernel.dispatch({ action: 'open', key: 'claude:local-a' })).resolves.toMatchObject({ outcome: 'opened' })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: false })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'completed', unread: true, revisionAt: 100, phaseRevision: 100, unreadRevision: 200, statusEnteredAt: 100, terminalAt: 100 })], 2, {
        providers: { codex: false, claude: true }
      })
    })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: false })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'running', unread: false, revisionAt: 200, phaseRevision: 200, statusEnteredAt: 200, terminalAt: 0 })], 3, {
        providers: { codex: false, claude: true }
      })
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'completed', unread: true, revisionAt: 300, phaseRevision: 300, statusEnteredAt: 300, terminalAt: 300 })], 4, {
        providers: { codex: false, claude: true }
      })
    })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: true })
  })

  it('reduces precise state immediately, ignores stale terminal regressions and permits a newer Turn restart', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const sync = (value: Record<string, unknown>, revision: number, phaseGeneration = revision) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(value)], revision, {
        providers: { codex: true, claude: false },
        sourceLaneGenerations: {
          codex: { membership: revision, phase: phaseGeneration, unread: revision },
          claude: { membership: 0, phase: 0, unread: 0 }
        }
      })
    })

    expect(sync({ phase: 'running', revisionAt: 100, statusEnteredAt: 100 }, 1).tasks[0].phase).toBe('running')
    expect(sync({ phase: 'waiting-input', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 110, statusEnteredAt: 110 }, 2).tasks[0].phase).toBe('waiting-input')
    expect(sync({ phase: 'completed', cycleTier: 'none', dynamicGroup: 'completed', revisionAt: 120, statusEnteredAt: 120 }, 3).tasks[0].phase).toBe('completed')
    expect(sync({ phase: 'running', revisionAt: 120, statusEnteredAt: 119 }, 4, 3).tasks[0].phase).toBe('completed')
    expect(sync({ phase: 'running', revisionAt: 130, statusEnteredAt: 130 }, 5).tasks[0].phase).toBe('running')
    expect(sync({ phase: 'waiting-approval', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 140, statusEnteredAt: 140 }, 6).tasks[0].phase).toBe('waiting-approval')
    expect(sync({ phase: 'stopped', cycleTier: 'none', dynamicGroup: 'stopped', revisionAt: 140, statusEnteredAt: 139 }, 7, 6).tasks[0].phase).toBe('waiting-approval')
  })

  it('accepts a newer Claude completion and unread lane even when its metadata revision is lower', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    const claude = task({
      key: 'claude-a',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'local-claude-a',
      revisionAt: 200,
      statusEnteredAt: 200
    })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claude], 1, {
        providers: { codex: false, claude: true },
        sourceGenerations: { codex: 0, claude: 10 },
        sourceLaneGenerations: {
          codex: { membership: 0, phase: 0, unread: 0 },
          claude: { membership: 10, phase: 10, unread: 10 }
        }
      })
    })
    const completed = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([{
        ...claude,
        phase: 'completed',
        cycleTier: 'none',
        dynamicGroup: 'unread',
        revisionAt: 150,
        statusEnteredAt: 150,
        unread: true,
        capabilities: { open: true, archive: true }
      }], 2, {
        providers: { codex: false, claude: true },
        sourceGenerations: { codex: 0, claude: 12 },
        sourceLaneGenerations: {
          codex: { membership: 0, phase: 0, unread: 0 },
          claude: { membership: 10, phase: 11, unread: 12 }
        }
      })
    })

    expect(completed.tasks[0]).toMatchObject({
      phase: 'completed',
      unread: true,
      dynamicGroup: 'unread',
      capabilities: { open: true, archive: true }
    })
    expect(completed.views.groups.unread).toEqual(['claude-a'])
    expect(completed.sourceLaneGenerations.claude).toEqual({ membership: 10, phase: 11, unread: 12 })
  })

  it('revokes a stale Codex archive capability on a newer non-terminal phase without inventory', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const completed = task({
      phase: 'completed',
      cycleTier: 'none',
      dynamicGroup: 'completed',
      capabilities: { open: true, archive: true },
      archiveRequest: {
        evidence: 'completed',
        expectedRevisionAt: 100,
        expectedUpdatedAt: 100,
        expectedLastTurnStartedAt: 90,
        expectedSourceFingerprint: 'a'.repeat(64)
      }
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([completed], 1, {
        providers: { codex: true, claude: false },
        sourceLaneGenerations: {
          codex: { membership: 10, phase: 10, unread: 10 },
          claude: { membership: 0, phase: 0, unread: 0 }
        }
      })
    })
    expect(kernel.getPackage().tasks[0]).toHaveProperty('archiveRequest')

    const running = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        ...completed,
        phase: 'running',
        cycleTier: 'active',
        dynamicGroup: 'active',
        phaseRevision: 110,
        statusEnteredAt: 110,
        capabilities: { open: true, archive: false }
      })], 2, {
        providers: { codex: true, claude: false },
        sourceLaneGenerations: {
          codex: { membership: 10, phase: 11, unread: 10 },
          claude: { membership: 0, phase: 0, unread: 0 }
        }
      })
    })

    expect(running.tasks[0]).toMatchObject({ phase: 'running', capabilities: { open: true, archive: false } })
    expect(running.tasks[0]).not.toHaveProperty('archiveRequest')
  })

  it('orders every group and the selected cycle tier by latest question across providers and pins', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-old', lastQuestionAt: 100, createdAt: 10 }),
        task({ key: 'claude-new', provider: 'claude', kind: 'claude-session', actionAlias: 'local-new', lastQuestionAt: 300, createdAt: 30 }),
        task({ key: 'codex-pinned-middle', kind: 'local-pin', localPin: true, lastQuestionAt: 200, createdAt: 20 })
      ], 1)
    })

    expect(current.views.groups.active).toEqual(['claude-new', 'codex-pinned-middle', 'codex-old'])
    expect(current.views.cycleKeys).toEqual(['claude-new', 'codex-pinned-middle', 'codex-old'])
  })

  it('keeps an ordinary stopped local pin in the fourth navigation layer', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'stopped',
        localPin: true,
        kind: 'local-pin',
        planReady: false,
        capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false }
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(current.tasks[0].cycleTier).toBe('fallback')
    expect(current.views.cycleKeys).toEqual(['codex-a'])
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
    expect(next.tasks.find((value: any) => value.provider === 'claude')).toMatchObject({ key: 'claude-a', phase: 'waiting-input', revisionAt: 100 })
    expect(next.sourceGenerations).toEqual({ codex: 10, claude: 11 })
  })

  it('holds one unknown observation for only the bounded 250 ms grace', () => {
    let now = 1_000
    const kernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    const firstUnknown = kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 2, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    expect(firstUnknown).toMatchObject({ freshness: 'verifying' })
    expect(firstUnknown.tasks[0].phase).toBe('running')

    now += UNKNOWN_GRACE_MS
    const secondUnknown = kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 3, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    expect(secondUnknown.tasks[0].phase).toBe('running')
    expect(secondUnknown.views.groups.active).toEqual(['codex-a'])
    expect(secondUnknown.views.counts.active).toBe(1)
    expect(secondUnknown.views.cycleKeys).toEqual(['codex-a'])

    const claudeKernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const claudeReceipt = claudeKernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    const claudeUnknown = claudeKernel.syncPackage({
      lease: claudeReceipt.lease,
      draft: draft([task({
        key: 'claude-a',
        provider: 'claude',
        kind: 'claude-session',
        actionAlias: 'cs_claude_a_123456',
        phase: 'unknown',
        cycleTier: 'none',
        dynamicGroup: 'none',
        capabilities: { open: true, archive: false }
      })], 1, { acceptedAt: now, providers: { codex: false, claude: true } })
    })
    expect(claudeUnknown.views.groups.stopped).toEqual([])
    expect(claudeUnknown.views.counts.active).toBe(0)
    expect(claudeUnknown.views.cycleKeys).toEqual([])
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

    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'verifying', tasks: [{ phase: 'running' }] })
    await expect(kernel.dispatch({ action: 'cycle', direction: 1 })).resolves.toMatchObject({
      outcome: 'unavailable',
      errorCode: 'inventory-not-ready'
    })
    expect(preflight).toHaveBeenCalledTimes(1)
    expect(opened).not.toHaveBeenCalled()
    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'verifying', tasks: [{ phase: 'running' }] })
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

  it('turns 1,000 equivalent observations into complete semantic no-ops', () => {
    const records: Array<Record<string, unknown>> = []
    const opened = vi.fn(async () => ({ outcome: 'opened' }))
    const kernel = createCompanionTaskKernel({
      record: (entry: Record<string, unknown>) => records.push(entry),
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const publications: number[] = []
    const floatPublications: number[] = []
    kernel.onPackage((value: any) => {
      if (value.complete) publications.push(value.packageRevision)
    })
    kernel.subscribe(0, (value: any) => {
      if (value.complete) floatPublications.push(value.packageRevision)
    })
    const initial = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ observationGeneration: 1 })], 1, { providers: { codex: true, claude: false } })
    })
    const initialTaskRevision = initial.tasks[0].semanticRevision
    const initialPackageRevision = initial.packageRevision
    const consumerDiagnostics = kernel.diagnostics()

    for (let index = 2; index <= 1_001; index += 1) {
      const current = kernel.publishEvidence(draft([task({ observationGeneration: index })], index, {
        producer: 'host-evidence',
        providers: { codex: true, claude: false },
        sourceGenerations: { codex: index, claude: 0 },
        sourceLaneGenerations: {
          codex: { membership: index, phase: index, unread: index },
          claude: { membership: 0, phase: 0, unread: 0 }
        }
      }))
      expect(current.packageRevision).toBe(initialPackageRevision)
      expect(current.tasks[0].semanticRevision).toBe(initialTaskRevision)
    }

    expect(publications).toEqual([initialPackageRevision])
    expect(floatPublications).toEqual([initialPackageRevision])
    expect(opened).not.toHaveBeenCalled()
    expect(records.filter((entry) => entry.event === 'same-state-no-op')).toHaveLength(1_000)
    expect(records.filter((entry) => entry.level === 'info' && entry.outcome === 'no-op')).toEqual([])
    expect(kernel.diagnostics().navigation).toMatchObject({ dispatched: { codex: 0, claude: 0 } })
    expect(kernel.diagnostics().navigation.syncNoopCount).toBe(consumerDiagnostics.navigation.syncNoopCount)
    expect(kernel.diagnostics().actions.syncNoopCount).toBe(consumerDiagnostics.actions.syncNoopCount)
    kernel.close()
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
