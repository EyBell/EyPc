import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCompanionTaskKernel: createCompanionTaskKernelRaw, reduceCodexTaskEvidenceV4, reduceCodexParentBranchEvidenceV4, reduceClaudeTaskEvidenceV4, UNKNOWN_GRACE_MS } = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
  reduceCodexTaskEvidenceV4(value?: Record<string, unknown>): Record<string, any>
  reduceCodexParentBranchEvidenceV4(value?: Record<string, unknown>): Record<string, any>
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
      activityEvidence: 'activity-event',
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
      previousPhase: 'stopped',
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 0,
      terminalEvidenceSequence: 11,
      idleConfirmed: true
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

    expect(reduceCodexTaskEvidenceV4({
      previousPhase: 'completed',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'initial-snapshot',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      terminalEvidenceSequence: 11
    })).toMatchObject({ phase: 'completed', freshness: 'fresh', reason: 'exact-completed' })

    expect(reduceCodexTaskEvidenceV4({
      previousPhase: 'unknown',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'initial-snapshot',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'inventory'
    })).toMatchObject({ phase: 'unknown', freshness: 'verifying', reason: 'insufficient-evidence' })

    expect(reduceCodexTaskEvidenceV4({
      previousPhase: 'unknown',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'initial-snapshot',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'inventory'
    })).toMatchObject({ phase: 'unknown', freshness: 'verifying', reason: 'insufficient-evidence' })

    expect(reduceCodexTaskEvidenceV4({
      previousPhase: 'unknown',
      status: 'active',
      statusAuthority: 'persisted-decision',
      activeFlags: [],
      lastTurnStatus: 'inProgress'
    })).toMatchObject({ phase: 'unknown', freshness: 'verifying', reason: 'insufficient-evidence' })

    expect(reduceCodexTaskEvidenceV4({
      previousPhase: 'unknown',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'initial-snapshot',
      activeFlags: ['waitingOnUserInput']
    })).toMatchObject({ phase: 'waiting-input', freshness: 'fresh', reason: 'causal-waiting-input' })
  })

  it('reduces every main and Side Chat bead with attention then active then unread then completed priority', () => {
    const branch = (ref: string, overrides: Record<string, unknown> = {}) => ({
      ref,
      branchKind: ref.startsWith('main') ? 'main' : 'side',
      unreadKnown: true,
      hasUnreadTurn: false,
      status: 'idle',
      statusAuthority: 'desktop-live',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'targeted-after-exit',
      terminalEvidenceSequence: 20,
      idleConfirmed: true,
      ...overrides
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'stopped',
      branches: [
        branch('main', { status: 'active', lastTurnStatus: 'inProgress', activeEvidenceSequence: 21, idleConfirmed: true }),
        branch('side-terminal')
      ]
    })).toMatchObject({ phase: 'running', freshness: 'fresh', reason: 'branch-running' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'stopped',
      branches: [
        branch('main-interrupted', { lastTurnStatus: 'interrupted' }),
        branch('side-running', { status: 'active', lastTurnStatus: 'inProgress', activeEvidenceSequence: 21, idleConfirmed: true })
      ]
    })).toMatchObject({
      phase: 'running',
      freshness: 'fresh',
      reason: 'branch-running',
      details: { aggregationPolicy: 'all-branches', selectedBranchCount: 2 }
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'completed',
      branches: [
        branch('main'),
        branch('side-running', { status: 'active', lastTurnStatus: 'inProgress', activeEvidenceSequence: 21, idleConfirmed: false })
      ]
    })).toMatchObject({
      phase: 'running',
      unreadKnown: true,
      unread: false,
      reason: 'branch-running',
      details: { aggregationPolicy: 'all-branches', selectedBranchCount: 2 }
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      branches: [
        branch('main', { status: 'active', activeFlags: ['waitingOnApproval'], lastTurnStatus: 'inProgress', activeEvidenceSequence: 21 }),
        branch('side-input', { status: 'active', activeFlags: ['waitingOnUserInput'], lastTurnStatus: 'inProgress', activeEvidenceSequence: 22 })
      ]
    })).toMatchObject({ phase: 'waiting-approval', reason: 'branch-waiting-approval' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      branches: [
        branch('main', { status: 'active', activeFlags: ['waitingOnUserInput'], lastTurnStatus: 'inProgress', activeEvidenceSequence: 23 }),
        branch('side-running', { status: 'active', lastTurnStatus: 'inProgress', activeEvidenceSequence: 24, idleConfirmed: false })
      ]
    })).toMatchObject({ phase: 'waiting-input', reason: 'branch-waiting-input' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      branches: [
        branch('main', { status: 'active', activeFlags: ['waitingOnApproval'], lastTurnStatus: 'inProgress', activeEvidenceSequence: 25 }),
        branch('side-running', { status: 'active', lastTurnStatus: 'inProgress', activeEvidenceSequence: 26, idleConfirmed: false })
      ]
    })).toMatchObject({ phase: 'waiting-approval', reason: 'branch-waiting-approval' })

    expect(reduceCodexParentBranchEvidenceV4({ previousPhase: 'running', branches: [branch('main'), branch('side')] }))
      .toMatchObject({ phase: 'completed', freshness: 'fresh', unreadKnown: true, unread: false, reason: 'all-branches-completed' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'completed',
      branches: [
        branch('main'),
        branch('side-unread', { hasUnreadTurn: true })
      ]
    })).toMatchObject({
      phase: 'completed',
      unreadKnown: true,
      unread: true,
      details: { aggregationPolicy: 'all-branches', selectedBranchCount: 2, unreadCount: 1 }
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'completed',
      branches: [
        branch('main', { hasUnreadTurn: true }),
        branch('side-running', { status: 'active', lastTurnStatus: 'inProgress', activeEvidenceSequence: 21, idleConfirmed: false })
      ]
    })).toMatchObject({
      phase: 'running',
      unreadKnown: true,
      unread: true,
      reason: 'branch-running',
      details: { aggregationPolicy: 'all-branches', selectedBranchCount: 2, unreadCount: 1 }
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      branches: [
        branch('main', { lastTurnStatus: 'interrupted' }),
        branch('side', { lastTurnStatus: 'failed' })
      ]
    })).toMatchObject({ phase: 'stopped', freshness: 'fresh', reason: 'all-branches-idle-terminal' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'waiting-input',
      branches: [branch('main', { lastTurnEvidence: 'inventory', idleConfirmed: false })]
    })).toMatchObject({ phase: 'waiting-input', freshness: 'verifying', reason: 'branch-terminal-verifying' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'completed',
      branches: [branch('hydrated', {
        status: 'active',
        activityEvidence: 'initial-snapshot',
        activeEvidenceSequence: 0,
        terminalEvidenceSequence: 0,
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'inventory',
        idleConfirmed: false
      })]
    })).toMatchObject({ outcome: 'abstain', phase: null, freshness: 'unchanged', reason: 'branch-evidence-insufficient' })
  })

  it('uses Goal status as the long-running task boundary without changing the public phase union', () => {
    const completedTurn = (goalStatus: string, overrides: Record<string, unknown> = {}) => ({
      ref: 'branch-main-anonymous',
      branchKind: String(overrides.ref || 'branch-main-anonymous').includes('side') ? 'side' : 'main',
      unreadKnown: true,
      hasUnreadTurn: false,
      status: 'idle',
      statusAuthority: 'connector',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 20,
      turnStartedAt: 2_000,
      terminalAt: 2_100,
      idleConfirmed: true,
      goalStatus,
      goalFreshness: 'fresh',
      goalEvidenceSequence: 30,
      goalUpdatedAt: 2_050,
      ...overrides
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('active')]
    })).toMatchObject({ phase: 'running', freshness: 'fresh', reason: 'goal-active' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('active', { hasUnreadTurn: true })]
    })).toMatchObject({
      phase: 'running',
      unreadKnown: true,
      unread: true,
      reason: 'goal-active',
      details: { unreadCount: 1 }
    })

    for (const goalStatus of ['paused', 'blocked', 'usageLimited', 'budgetLimited']) {
      expect(reduceCodexParentBranchEvidenceV4({
        previousPhase: 'running',
        previousNonterminalPhase: 'running',
        branches: [completedTurn(goalStatus)]
      })).toMatchObject({ phase: 'stopped', freshness: 'fresh', reason: `goal-${goalStatus}` })
    }

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('complete')]
    })).toMatchObject({ phase: 'completed', freshness: 'fresh', reason: 'goal-complete' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('complete', { hasUnreadTurn: true })]
    })).toMatchObject({
      phase: 'completed',
      unreadKnown: true,
      unread: true,
      reason: 'goal-complete'
    })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'completed',
      previousNonterminalPhase: 'running',
      branches: [
        completedTurn('complete', { ref: 'branch-main-anonymous' }),
        completedTurn('active', { ref: 'branch-side-anonymous', goalEvidenceSequence: 31 })
      ]
    })).toMatchObject({ phase: 'running', freshness: 'fresh', reason: 'goal-active' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('unknown', { goalFreshness: 'verifying' })]
    })).toMatchObject({ phase: 'running', freshness: 'verifying', reason: 'goal-evidence-verifying' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'stopped',
      previousNonterminalPhase: 'stopped',
      branches: [completedTurn('paused', { goalFreshness: 'verifying' })]
    })).toMatchObject({ phase: 'stopped', freshness: 'verifying', reason: 'goal-evidence-verifying' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [
        completedTurn('complete', { ref: 'branch-main-anonymous' }),
        completedTurn('unknown', { ref: 'branch-side-anonymous', goalFreshness: 'verifying' })
      ]
    })).toMatchObject({ phase: 'running', freshness: 'verifying', reason: 'goal-evidence-verifying' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'unknown',
      branches: [completedTurn('unknown', { goalFreshness: 'verifying' })]
    })).toMatchObject({ phase: 'unknown', freshness: 'verifying', reason: 'goal-evidence-verifying' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'running',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('complete', {
        goalEvidenceSequence: 5,
        goalUpdatedAt: 1_500,
        activeEvidenceSequence: 10,
        turnStartedAt: 2_000
      })]
    })).toMatchObject({ phase: 'completed', freshness: 'fresh', reason: 'all-branches-completed' })

    expect(reduceCodexParentBranchEvidenceV4({
      previousPhase: 'completed',
      previousNonterminalPhase: 'running',
      branches: [completedTurn('complete', {
        status: 'active',
        statusAuthority: 'app-server-live',
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'turn-started',
        activeEvidenceSequence: 31,
        terminalEvidenceSequence: 0,
        goalEvidenceSequence: 30,
        goalUpdatedAt: 2_000,
        turnStartedAt: 2_000,
        idleConfirmed: false
      })]
    })).toMatchObject({ phase: 'running', freshness: 'fresh', reason: 'branch-running' })
  })

  it('atomically suppresses an intermediate Turn completion while the Goal remains active', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running', unreadKnown: true, unread: true, turnStartedAt: 100 })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const publications: Array<{ phase: string; unread: boolean; active: number; completedUnread: number }> = []
    const stop = kernel.onPackage((value: Record<string, any>) => {
      if (!value.tasks[0]) return
      publications.push({
        phase: value.tasks[0].phase,
        unread: value.tasks[0].unread === true,
        active: value.views.counts.active,
        completedUnread: value.views.counts.unread
      })
    })

    const branch = (goalStatus: 'active' | 'complete', hasUnreadTurn: boolean) => ({
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      unreadKnown: true,
      hasUnreadTurn,
      status: 'idle',
      statusAuthority: 'connector',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 1,
      terminalEvidenceSequence: 2,
      turnStartedAt: 100,
      terminalAt: 120,
      idleConfirmed: true,
      goalStatus,
      goalFreshness: 'fresh',
      goalEvidenceSequence: goalStatus === 'active' ? 1 : 3,
      goalUpdatedAt: goalStatus === 'active' ? 90 : 130
    })
    const publish = (generation: number, goalStatus: 'active' | 'complete', hasUnreadTurn: boolean, deferPublish = false) => {
      kernel.publishCodexBranchEvidence({
        generation,
        deferPublish,
        parents: [{
        key: 'codex-a',
        complete: true,
          branches: [branch(goalStatus, hasUnreadTurn)]
        }]
      })
    }
    publish(2, 'active', true, true)
    kernel.publishEvidence(draft([
      task({
        phase: 'completed',
        unreadKnown: true,
        unread: true,
        turnStartedAt: 100,
        terminalAt: 120,
        statusEnteredAt: 120
      })
    ], 2, {
      providers: { codex: true, claude: false },
      sourceLaneGenerations: {
        codex: { membership: 1, phase: 2, unread: 1 },
        claude: { membership: 0, phase: 0, unread: 0 }
      }
    }))

    expect(kernel.getLatest()).toMatchObject({
      tasks: [{ phase: 'running', unreadKnown: true, unread: true, freshness: 'fresh', terminalAt: 0 }],
      views: { counts: { active: 1, unread: 0 } }
    })
    expect(publications.map((entry) => entry.phase)).not.toContain('completed')
    expect(publications.at(-1)).toMatchObject({ phase: 'running', unread: true, active: 1, completedUnread: 0 })

    publish(3, 'complete', true)
    expect(kernel.getLatest()).toMatchObject({
      tasks: [{ phase: 'completed', unreadKnown: true, unread: true }],
      views: { counts: { active: 0, unread: 1 } }
    })
    const completedUnreadPublicationCount = publications.filter((entry) => entry.phase === 'completed' && entry.unread).length
    publish(4, 'complete', true)
    expect(publications.filter((entry) => entry.phase === 'completed' && entry.unread)).toHaveLength(completedUnreadPublicationCount)

    publish(5, 'complete', false)
    expect(kernel.getLatest()).toMatchObject({
      tasks: [{ phase: 'completed', unreadKnown: true, unread: false }],
      views: { counts: { active: 0, unread: 0 } }
    })
    publish(4, 'complete', true)
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: false })
    stop()
  })

  it('stores private branch evidence and clears stale idle when a newer branch is active', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'stopped', idleConfirmed: true })], 1, { providers: { codex: true, claude: false } })
    })

    kernel.publishCodexBranchEvidence({
      generation: 2,
      parents: [{
        key: 'codex-a',
        complete: true,
        branches: [
          {
            ref: 'branch-main-anonymous',
            status: 'active',
            statusAuthority: 'desktop-live',
            activeFlags: [],
            lastTurnStatus: 'inProgress',
            lastTurnEvidence: 'turn-started',
            activeEvidenceSequence: 12,
            terminalEvidenceSequence: 11,
            idleConfirmed: true
          },
          {
            ref: 'branch-side-anonymous',
            status: 'idle',
            statusAuthority: 'desktop-live',
            activeFlags: [],
            lastTurnStatus: 'interrupted',
            lastTurnEvidence: 'targeted-after-exit',
            activeEvidenceSequence: 10,
            terminalEvidenceSequence: 11,
            idleConfirmed: true
          }
        ]
      }]
    })

    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ key: 'codex-a', phase: 'running', freshness: 'fresh', idleConfirmed: false }],
      views: { counts: { active: 1 }, groups: { active: ['codex-a'], stopped: [] } }
    })
    expect(kernel.diagnostics()).toMatchObject({ codexBranchParentCount: 1, codexBranchCount: 2 })
    expect(kernel.commitArchived({ provider: 'codex', key: 'codex-a', verified: true, membershipRevision: 3 }))
      .toMatchObject({ outcome: 'archived', removedKeys: ['codex-a'] })
    expect(kernel.diagnostics()).toMatchObject({ codexBranchParentCount: 0, codexBranchCount: 0 })
  })

  it('materializes all-bead Side Chat phase and unread decisions into mutually exclusive canonical views', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'completed', unreadKnown: true, unread: false, idleConfirmed: true })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const completedBranch = (branchKind: 'main' | 'side', hasUnreadTurn = false) => ({
      ref: `branch-${branchKind}-anonymous`,
      branchKind,
      unreadKnown: true,
      hasUnreadTurn,
      status: 'idle',
      statusAuthority: 'desktop-live',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'targeted-after-exit',
      terminalEvidenceSequence: 30,
      turnStartedAt: 200,
      terminalAt: 250,
      idleConfirmed: true
    })
    const publish = (generation: number, branches: Record<string, unknown>[]) => kernel.publishCodexBranchEvidence({
      generation,
      parents: [{ key: 'codex-a', complete: true, branches }]
    })

    publish(2, [
      completedBranch('main'),
      {
        ...completedBranch('side'),
        status: 'active',
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'turn-started',
        activeEvidenceSequence: 21,
        terminalEvidenceSequence: 0,
        turnStartedAt: 200,
        idleConfirmed: false
      }
    ])
    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ phase: 'running', unreadKnown: true, unread: false }],
      views: { counts: { active: 1, unread: 0 } }
    })

    publish(3, [completedBranch('main'), completedBranch('side', true)])
    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ phase: 'completed', unreadKnown: true, unread: true }],
      views: { counts: { active: 0, unread: 1 } }
    })

    publish(4, [
      completedBranch('main', true),
      {
        ...completedBranch('side'),
        status: 'active',
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'turn-started',
        activeEvidenceSequence: 22,
        terminalEvidenceSequence: 0,
        turnStartedAt: 300,
        idleConfirmed: false
      }
    ])
    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ phase: 'running', unreadKnown: true, unread: true }],
      views: { counts: { active: 1, unread: 0 } }
    })
  })

  it('does not let transport generation turn an older terminal snapshot into newer causal evidence', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running' })], 1, { providers: { codex: true, claude: false } })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => kernel.publishCodexBranchEvidence({
      generation,
      parents: [{ key: 'codex-a', complete: true, branches: [branch] }]
    })

    publish(2, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: ['waitingOnUserInput'],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 200,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'waiting-input' })

    publish(3, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'connector',
      activityEvidence: 'initial-snapshot',
      activeFlags: [],
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'targeted-after-exit',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 11,
      turnStartedAt: 100,
      terminalAt: 150,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'waiting-input' })

    publish(4, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 12,
      turnStartedAt: 200,
      terminalAt: 250,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })
  })

  it('orders live evidence by Turn epoch in both directions instead of transport generation', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running' })], 1, { providers: { codex: true, claude: false } })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => kernel.publishCodexBranchEvidence({
      generation,
      parents: [{ key: 'codex-a', complete: true, branches: [branch] }]
    })

    publish(2, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: ['waitingOnUserInput'],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 20,
      turnStartedAt: 200,
      waitingSince: 220,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'waiting-input' })

    publish(3, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 100,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'waiting-input' })

    publish(4, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 30,
      turnStartedAt: 300,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running' })

    publish(5, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 30,
      terminalEvidenceSequence: 40,
      turnStartedAt: 300,
      terminalAt: 350,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(6, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 50,
      turnStartedAt: 200,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(7, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 60,
      turnStartedAt: 400,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running' })
  })

  it('uses real event sequence when a Provider omits comparable Turn timestamps', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running' })], 1, { providers: { codex: true, claude: false } })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => kernel.publishCodexBranchEvidence({
      generation,
      parents: [{ key: 'codex-a', complete: true, branches: [branch] }]
    })

    publish(2, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 0,
      idleConfirmed: false
    })
    publish(3, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 20,
      turnStartedAt: 0,
      terminalAt: 200,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(4, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 30,
      turnStartedAt: 0,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running' })
  })

  it('merges branch phase, unread and Goal as independent evidence lanes', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running', unreadKnown: false, unread: false })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => kernel.publishCodexBranchEvidence({
      generation,
      parents: [{ key: 'codex-a', complete: true, branches: [branch] }]
    })
    const live = {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 100,
      idleConfirmed: false
    }

    publish(2, {
      ...live,
      unreadKnown: true,
      hasUnreadTurn: true,
      goalStatus: 'active',
      goalFreshness: 'fresh',
      goalEvidenceSequence: 10,
      goalUpdatedAt: 90
    })
    // Complete Host branch rows carry `unreadKnown: false` when this source
    // has no unread authority. Unknown must abstain instead of erasing the
    // previously observed unread lane.
    publish(3, { ...live, activeEvidenceSequence: 20, unreadKnown: false })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'running',
        unreadKnown: false,
        unread: false,
        observationGeneration: 3
      })], 2, { providers: { codex: true, claude: false } })
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running', unreadKnown: true, unread: true })

    const terminal = {
      ...live,
      status: 'idle',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 20,
      terminalEvidenceSequence: 30,
      terminalAt: 150,
      idleConfirmed: true
    }
    publish(4, terminal)
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running', unreadKnown: true, unread: true })

    publish(5, {
      ...terminal,
      goalStatus: 'complete',
      goalFreshness: 'fresh',
      goalEvidenceSequence: 40,
      goalUpdatedAt: 160
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed', unreadKnown: true, unread: true })
  })

  it('records anonymous parent decisions only when aggregate semantics change', () => {
    const records: Array<Record<string, unknown>> = []
    const kernel = createCompanionTaskKernel({
      record: (entry: Record<string, unknown>) => records.push(entry),
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'completed', unreadKnown: true, unread: false })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const liveBranches = [{
      ref: 'private-main-ref',
      branchKind: 'main',
      unreadKnown: true,
      hasUnreadTurn: false,
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 2,
      turnStartedAt: 200
    }]
    const publish = (generation: number, branches: Record<string, unknown>[]) => kernel.publishCodexBranchEvidence({
      generation,
      parents: [{ key: 'codex-a', complete: true, branches }]
    })

    publish(2, liveBranches)
    publish(3, liveBranches)
    let decisions = records.filter((entry) => entry.event === 'parent-state-decision')
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({
      phase: 'running',
      reason: 'branch-running',
      details: { aggregationPolicy: 'all-branches', branchCount: 1, runningCount: 1 }
    })
    expect(JSON.stringify(decisions)).not.toContain('private-main-ref')

    publish(4, [{
      ...liveBranches[0],
      status: 'idle',
      statusAuthority: 'connector',
      activityEvidence: 'initial-snapshot',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      terminalEvidenceSequence: 4,
      terminalAt: 250,
      idleConfirmed: true
    }])
    decisions = records.filter((entry) => entry.event === 'parent-state-decision')
    expect(decisions).toHaveLength(2)
    expect(decisions.at(-1)).toMatchObject({ phase: 'completed', reason: 'all-branches-completed' })
  })

  it('stages branch evidence and publishes it atomically with the matching Host draft', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'stopped', idleConfirmed: true })], 1, { providers: { codex: true, claude: false } })
    })
    const baselineRevision = kernel.getPackage().packageRevision
    const publications: number[] = []
    const stop = kernel.onPackage((value: Record<string, any>) => publications.push(value.packageRevision))
    const baselinePublicationCount = publications.length

    kernel.publishCodexBranchEvidence({
      generation: 2,
      deferPublish: true,
      parents: [{
        key: 'codex-a',
        complete: true,
        branches: [{
          ref: 'branch-main-anonymous',
          status: 'active',
          statusAuthority: 'app-server-live',
          activityEvidence: 'activity-event',
          activeFlags: [],
          lastTurnStatus: 'inProgress',
          lastTurnEvidence: 'turn-started',
          activeEvidenceSequence: 2,
          terminalEvidenceSequence: 1,
          idleConfirmed: false
        }]
      }]
    })

    expect(kernel.getPackage().packageRevision).toBe(baselineRevision)
    expect(publications).toHaveLength(baselinePublicationCount)
    kernel.publishEvidence(draft([
      task({
        phase: 'stopped',
        idleConfirmed: true,
        observationGeneration: 2,
        phaseRevision: 2
      })
    ], 2, {
      providers: { codex: true, claude: false },
      sourceGenerations: { codex: 2, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 1, phase: 2, unread: 1 },
        claude: { membership: 0, phase: 0, unread: 0 }
      }
    }))

    expect(kernel.getPackage()).toMatchObject({
      packageRevision: baselineRevision + 1,
      tasks: [{ key: 'codex-a', phase: 'running', idleConfirmed: false }]
    })
    expect(publications.slice(baselinePublicationCount)).toEqual([baselineRevision + 1])
    stop()
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

  it('keeps ordinary waiting ahead while retaining Plan controls when the Implement Plan request is absent', () => {
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
      capabilities: { pause: true, resume: false, executePlan: true }
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

  it('keeps a completed Plan actionable when its implementation prompt was not observed', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'completed',
        turnMode: 'plan',
        planReady: true,
        planLifecycleRevision: 240,
        planImplementation: false,
        capabilities: { open: true, archive: true, pause: true, resume: true, executePlan: true }
      })], 1, { providers: { codex: true, claude: false } })
    })

    expect(current.tasks[0]).toMatchObject({
      phase: 'completed',
      planReady: true,
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

  it('commits ordinary hide and restore locally without any Provider read', () => {
    const preflight = vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed')))
    const kernel = createCompanionTaskKernel({
      preflight,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.publishEvidence(draft([task({ phase: 'stopped', revisionAt: 100 })], 1, { providers: { codex: true, claude: false } }))
    const readsBefore = preflight.mock.calls.length

    const hidden = kernel.setVisibility({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, hidden: true })
    expect(hidden.tasks[0]).toMatchObject({ key: 'codex-a', hidden: true })
    expect(hidden.views.groups.stopped).toEqual([])

    const restored = kernel.setVisibility({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, hidden: false })
    expect(restored.tasks[0]).toMatchObject({ key: 'codex-a', hidden: false })
    expect(restored.views.groups.stopped).toEqual(['codex-a'])
    expect(restored.packageRevision).toBeGreaterThan(hidden.packageRevision)
    expect(preflight.mock.calls.length).toBe(readsBefore)
  })

  it('commits a local pin without a Provider read and keeps Plan rows pinnable', () => {
    const preflight = vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed')))
    const kernel = createCompanionTaskKernel({
      preflight,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.publishEvidence(draft([
      task({ phase: 'completed', revisionAt: 100 }),
      task({
        key: 'codex-plan',
        actionAlias: 'ct_codex_plan_1234567890',
        phase: 'stopped',
        planReady: true,
        planLifecycleRevision: 100,
        revisionAt: 100
      })
    ], 1, { providers: { codex: true, claude: false } }))
    const readsBefore = preflight.mock.calls.length

    const pinned = kernel.setLocalPin({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, localPin: true })
    expect(pinned.tasks.find((value: { key: string }) => value.key === 'codex-a')).toMatchObject({
      localPin: true,
      kind: 'local-pin',
      cycleTier: 'fallback'
    })

    // A completed Plan owns the pause lane for hiding, but stays pinnable.
    const pinnedPlan = kernel.setLocalPin({ lease: receipt.lease, key: 'codex-plan', revisionAt: 100, localPin: true })
    expect(pinnedPlan.tasks.find((value: { key: string }) => value.key === 'codex-plan')).toMatchObject({ localPin: true })

    const unpinned = kernel.setLocalPin({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, localPin: false })
    expect(unpinned.tasks.find((value: { key: string }) => value.key === 'codex-a')).toMatchObject({
      localPin: false,
      kind: 'codex-thread'
    })

    expect(kernel.setLocalPin({ lease: receipt.lease, key: 'codex-a', revisionAt: 99, localPin: true })).toBeNull()
    expect(kernel.setLocalPin({ lease: receipt.lease + 1, key: 'codex-a', revisionAt: 100, localPin: true })).toBeNull()
    expect(kernel.setLocalPin({ lease: receipt.lease, key: 'codex-missing', localPin: true })).toBeNull()
    expect(preflight.mock.calls.length).toBe(readsBefore)
  })

  it('rejects a stale, unleased or Plan-owned visibility mutation', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.publishEvidence(draft([
      task({ phase: 'stopped', revisionAt: 100 }),
      task({
        key: 'codex-plan',
        actionAlias: 'ct_codex_plan_1234567890',
        phase: 'stopped',
        planReady: true,
        planLifecycleRevision: 100,
        revisionAt: 100
      })
    ], 1, { providers: { codex: true, claude: false } }))

    expect(kernel.setVisibility({ lease: receipt.lease, key: 'codex-a', revisionAt: 99, hidden: true })).toBeNull()
    expect(kernel.setVisibility({ lease: receipt.lease + 1, key: 'codex-a', revisionAt: 100, hidden: true })).toBeNull()
    expect(kernel.setVisibility({ lease: receipt.lease, key: 'codex-missing', revisionAt: 100, hidden: true })).toBeNull()
    expect(kernel.setVisibility({ lease: receipt.lease, key: 'codex-plan', revisionAt: 100, hidden: true })).toBeNull()
    expect(kernel.getLatest().tasks.every((value: { hidden: boolean }) => !value.hidden)).toBe(true)
  })

  it('does not renew ordinary dynamic visibility from metadata or observation revisions', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 10_000_000,
      initialConfiguration: {
        enabled: true,
        providers: { codex: true, claude: false },
        dynamicTaskWindowHours: 1
      }
    })
    const receipt = kernel.attach({
      enabled: true,
      providers: { codex: true, claude: false },
      dynamicTaskWindowHours: 1
    })
    const next = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        lastQuestionAt: 1_000,
        turnStartedAt: 1_000,
        statusEnteredAt: 1_000,
        createdAt: 500,
        revisionAt: 10_000,
        metadataRevision: 10_000,
        visibilityRevision: 10_000
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(next.tasks[0]).toMatchObject({ phase: 'running', dynamicEligible: false, dynamicGroup: 'none', cycleTier: 'none' })
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
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'running', dynamicEligible: false, cycleTier: 'none' })
    expect(kernel.getLatest().views.cycleKeys).toEqual([])
    expect(revisions).toHaveLength(2)
    expect(kernel.diagnostics().nextVisibilityTransitionAt).toBe(0)
  })

  it('keeps all visible input and unread attention outside the ordinary activity window', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'old-input', phase: 'waiting-input', dynamicEligible: false, lastQuestionAt: 10 }),
        task({ key: 'old-unread', phase: 'completed', unread: true, dynamicEligible: false, lastQuestionAt: 9 }),
        task({ key: 'old-running', phase: 'running', dynamicEligible: false, lastQuestionAt: 8 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    expect(current.views.groups.input).toEqual(['old-input'])
    expect(current.views.groups.unread).toEqual(['old-unread'])
    expect(current.views.groups.active).toEqual([])
    expect(current.views.counts).toEqual({ input: 1, active: 0, unread: 1 })
    expect(current.views.attentionKeys).toMatchObject({ input: ['old-input'], completedUnread: ['old-unread'] })
    expect(current.views.cycleKeys).toEqual(['old-input'])
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

  it('keeps local pins in ordinary cycling and never uses them as an input shortcut fallback', async () => {
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
    expect(packageValue.views.attentionKeys.input).toEqual([])
    expect(packageValue.views.cycleKeys).toEqual(['codex-pin'])
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'unavailable' })
    expect(opened).toEqual([])
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

  it('reduces precise state immediately, ignores stale terminal regressions and permits a newer Turn restart only without Goal evidence', () => {
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

  it('delegates exact-key alias recovery to Host without broad preflight or target substitution', async () => {
    const opened: Array<Record<string, unknown>> = []
    const preflight = vi.fn(async () => draft([task()], 2, { producer: 'host-preflight', providers: { codex: true, claude: false } }))
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(target); return { outcome: 'opened' } } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    await vi.waitFor(() => expect(preflight).toHaveBeenCalledTimes(1))
    preflight.mockClear()
    const preflightCallsBeforeOpen = preflight.mock.calls.length

    await expect(kernel.dispatch({
      action: 'open',
      key: 'codex-b',
      expectedActionAlias: 'ct_codex_b_expired_123456',
      source: 'card-click'
    })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-b' })
    expect(preflight).toHaveBeenCalledTimes(preflightCallsBeforeOpen)
    expect(opened).toEqual([expect.objectContaining({
      key: 'codex-b',
      actionAlias: 'ct_codex_b_expired_123456'
    })])

    await expect(kernel.dispatch({
      action: 'open',
      key: 'codex-b',
      expectedActionAlias: 'ct_codex_b_older_123456',
      source: 'manual-row-open'
    })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-b' })
    expect(preflight).toHaveBeenCalledTimes(preflightCallsBeforeOpen)
    expect(opened).toHaveLength(2)
    expect(opened.every((target) => target.key === 'codex-b')).toBe(true)
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

  it('keeps repeated UI focus changes process-private without publishing task packages', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task(),
        task({
          key: 'codex-b',
          actionAlias: 'ct_codex_b_1234567890',
          revisionAt: 101,
          membershipRevision: 101,
          phaseRevision: 101,
          unreadRevision: 101,
          visibilityRevision: 101
        })
      ], 1, { providers: { codex: true, claude: false } })
    })
    const baselineRevision = kernel.getLatest().packageRevision
    const publications: number[] = []
    const stop = kernel.subscribe(baselineRevision, (value: Record<string, any>) => publications.push(value.packageRevision))

    for (let index = 0; index < 100; index += 1) {
      const focusedKey = index % 2 === 0 ? 'codex-a' : 'codex-b'
      const current = kernel.configure({
        lease: receipt.lease,
        enabled: true,
        providers: { codex: true, claude: false },
        focusedKey
      })
      expect(current.focusedKey).toBe(focusedKey)
      expect(current.packageRevision).toBe(baselineRevision)
    }

    expect(publications).toEqual([])
    expect(kernel.getLatest()).toMatchObject({ packageRevision: baselineRevision, focusedKey: 'codex-b' })
    stop()
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

describe('provider differences are declared, not branched', () => {
  const kernelSource = readFileSync(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'), 'utf8')

  // Real capability differences survive the causal-core extraction — Codex owns
  // Plan lifecycle and fork topology, Claude revalidates its archive target at
  // dispatch. They belong in one declared table so that adding a Provider is a
  // row rather than a search for every conditional.
  it('keeps no inline provider conditional in the reducer', () => {
    expect(kernelSource).not.toMatch(/provider === '(codex|claude)'/)
    expect(kernelSource).not.toMatch(/inferred === '(codex|claude)'/)
  })

  it('declares a trait row for every registered provider', () => {
    expect(kernelSource).toContain('const PROVIDER_TRAITS = Object.freeze({')
    for (const provider of ['codex', 'claude']) {
      expect(kernelSource).toContain(`  ${provider}: Object.freeze({`)
    }
  })

  it('routes branch topology through the declared trait', () => {
    expect(kernelSource).toContain('providerTraits(task.provider).branchTopology')
    expect(kernelSource).toContain('providerTraits(provider).branchTopology')
  })
})

describe('claude evidence line uses the shared causal core', () => {
  // Claude has no fork topology, so it never entered the Codex branch store and
  // therefore never got bidirectional phase admission. The two directions that
  // were hand-written at the task layer covered terminal→running and
  // waiting→terminal only; an older terminal replacing a newer one was free.
  const claudeTask = (overrides: Record<string, unknown> = {}) => task({
    key: 'claude:local_a',
    provider: 'claude',
    kind: 'claude-session',
    actionAlias: 'local_a',
    ...overrides
  })
  const claudeLanes = (generation: number) => ({
    sourceGenerations: { codex: 0, claude: generation },
    sourceLaneGenerations: {
      codex: { membership: 0, phase: 0, unread: 0 },
      claude: { membership: 0, phase: generation, unread: generation }
    }
  })

  it('refuses an older terminal over a newer terminal at the same revision', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'completed', phaseRevision: 5, statusEnteredAt: 2_000, revisionAt: 2_000 })],
      1,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')

    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'stopped', phaseRevision: 5, statusEnteredAt: 1_000, revisionAt: 2_000 })],
      2,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')
  })

  it('still admits a strictly newer terminal at the same revision', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'completed', phaseRevision: 5, statusEnteredAt: 1_000, revisionAt: 2_000 })],
      1,
      claudeLanes(5)
    ))
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'stopped', phaseRevision: 5, statusEnteredAt: 2_000, revisionAt: 2_000 })],
      2,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('stopped')
  })

  it('keeps refusing a late running observation over a newer terminal', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'completed', phaseRevision: 5, statusEnteredAt: 2_000, revisionAt: 2_000 })],
      1,
      claudeLanes(5)
    ))
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'running', phaseRevision: 5, statusEnteredAt: 1_000, revisionAt: 2_000 })],
      2,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')
  })
})

describe('source lane units', () => {
  // Real 2026-08-13 host regression. `membership` is an observation timestamp
  // while `phase`/`unread` are provider counters. Letting either seed the other
  // — directly, or through the aggregate — pins a lane to ~1.78e12, which no
  // counter can ever overtake, so every later generation is rejected as stale.
  it('never seeds the membership timestamp from the counter aggregate', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft([task()], 1, {
      sourceGenerations: { codex: 7, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 0, phase: 7, unread: 7 },
        claude: { membership: 0, phase: 0, unread: 0 }
      }
    }))
    expect(kernel.getPackage().sourceLaneGenerations.codex.membership).toBe(0)
    expect(kernel.getPackage().sourceLaneGenerations.codex.phase).toBe(7)
  })

  it('treats an unstated membership lane as unchanged rather than older', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft([task()], 1, {
      sourceGenerations: { codex: 1, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 1_786_600_000_000, phase: 1, unread: 1 },
        claude: { membership: 0, phase: 0, unread: 0 }
      }
    }))
    expect(kernel.getPackage().tasks).toHaveLength(1)

    // A phase-only push carries no inventory observation at all.
    kernel.publishEvidence(draft([task({ phase: 'completed' })], 2, {
      sourceGenerations: { codex: 2, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 0, phase: 2, unread: 2 },
        claude: { membership: 0, phase: 0, unread: 0 }
      }
    }))
    const next = kernel.getPackage()
    expect(next.tasks).toHaveLength(1)
    expect(next.tasks[0].phase).toBe('completed')
    expect(next.sourceLaneGenerations.codex.membership).toBe(1_786_600_000_000)
  })
})
