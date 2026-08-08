import { describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createInitialState } from '../../src/domain/state'
import type { ClaudeQuotaAccessStatus, ClaudeRateLimitsInput } from '../../src/domain/claude'
import type { ClaudeCodePhase, ClaudeCodeStatusCorrelation } from '../../src/domain/claudeCode'
import type { EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { claudeQuotaScheduleDelay, createCodexController } from '../../src/runtime/codexController'

const SOURCE_FINGERPRINT = 'a'.repeat(64)
const LOCAL_A = 'local_7badfe6b-950e-488b-a70c-cc6756e96763'
const LOCAL_B = 'local_8badfe6b-950e-488b-a70c-cc6756e96764'
const LOCAL_C = 'local_9badfe6b-950e-488b-a70c-cc6756e96765'

interface CodeSeed {
  sessionId: string
  title?: string
  phase?: ClaudeCodePhase
  correlation?: ClaudeCodeStatusCorrelation
  archived?: boolean
  at?: number
}

function codeSession(seed: CodeSeed) {
  const now = seed.at ?? Date.now()
  const phase = seed.phase ?? 'running'
  return {
    sessionId: seed.sessionId,
    cliSessionId: seed.sessionId.slice('local_'.length),
    title: seed.title ?? 'Claude App title',
    cwd: '/work/project',
    originCwd: '/work/project',
    createdAt: now - 60_000,
    lastActivityAt: now - 500,
    lastFocusedAt: now - 400,
    model: 'claude-opus-5',
    isArchived: seed.archived === true,
    completedTurns: 1,
    metadataUpdatedAt: now - 300,
    statusCorrelation: seed.correlation ?? 'direct-local',
    stateSource: 'hook' as const,
    stateCompatibility: 'compatible' as const,
    stateGeneration: 1,
    phase,
    phaseUpdatedAt: now - 200,
    turnStartedAt: now - 5_000,
    hookActivityAt: now - 200,
    waitingApprovalAt: phase === 'waiting-approval' ? now - 200 : 0,
    waitingInputAt: phase === 'waiting-input' ? now - 200 : 0,
    lastStopAt: phase === 'completed' ? now - 200 : 0,
    lastSessionEndAt: phase === 'stopped' ? now - 200 : 0
  }
}

interface HarnessOptions {
  claudeEnabled?: boolean
  bridgeAbsent?: boolean
  codeSessions?: CodeSeed[]
  unread?: string[] | null
  quota?: ClaudeRateLimitsInput | null
  fallback?: { rateLimits: ClaudeRateLimitsInput; updatedAt: number } | null
  fallbackPromise?: Promise<{ rateLimits: ClaudeRateLimitsInput; updatedAt: number } | null>
  planUsage?: { at: number; fiveHourUsedPercent: number | null; sevenDayUsedPercent: number | null } | null
  throwQuota?: boolean
  throwCode?: boolean
  codeAvailable?: boolean
  throwUnread?: boolean
  openResult?: { outcome: 'opened' | 'dispatched' | 'unavailable' | 'failed'; confirmsRead: boolean; message?: string }
  appQuotaAccess?: boolean
  quotaAccessStatus?: ClaudeQuotaAccessStatus
}

function harness(options: HarnessOptions = {}) {
  let codeRows = options.codeSessions ?? []
  let unread = options.unread === undefined ? [] : options.unread
  let unreadGeneration = 1
  let stateGenerationOverride: number | null = null
  let throwState = false
  let throwCode = options.throwCode === true
  let throwUnread = options.throwUnread === true
  let codeAvailable = options.codeAvailable !== false
  let codeReadGate: Promise<void> | null = null
  let stateReadGate: Promise<void> | null = null
  let unreadReadGate: Promise<void> | null = null
  const state = createInitialState(1)
  state.activeTab = 'codex'
  state.codex.settings.floatEnabled = true
  state.codex.settings.providers = { codex: true, claude: options.claudeEnabled !== false }
  state.codex.settings.claudeAppQuotaAccess = options.appQuotaAccess === true
  const openCalls: string[] = []
  const fallbackCalls: Array<Record<string, unknown>> = []
  const eventListeners: Array<() => void> = []
  const codeListeners: Array<() => void> = []
  const unreadListeners: Array<() => void> = []
  let quotaReads = 0
  let codeReads = 0
  let stateReads = 0
  let unreadReads = 0
  let notifications = 0
  const messages: string[] = []

  const claude = {
    inspect: async () => ({
      version: 1 as const,
      installed: true,
      homeReady: true,
      authenticated: true,
      cliVersion: '2.1.220',
      hooks: 'installed' as const,
      statusline: 'installed' as const,
      checkedAt: Date.now()
    }),
    readSnapshot: async () => {
      quotaReads += 1
      if (options.throwQuota) throw new Error('quota failed')
      return {
        version: 1 as const,
        revision: 'test',
        sessions: [] as [],
        truncated: false,
        quota: options.quota === null
          ? null
          : { rateLimits: options.quota ?? { five_hour: { used_percentage: 25 } }, updatedAt: Date.now() },
        readAt: Date.now()
      }
    },
    readCodeSnapshot: async () => {
      codeReads += 1
      if (throwCode) throw new Error('code failed')
      const sessions = codeRows.map(codeSession)
      if (codeReadGate) await codeReadGate
      return {
        version: 2 as const,
        revision: 'test-code',
        sessions,
        available: codeAvailable,
        truncated: false,
        readAt: Date.now()
      }
    },
    readCodeStateSnapshot: async () => {
      stateReads += 1
      if (throwState) throw new Error('state failed')
      if (stateReadGate) await stateReadGate
      const readAt = Date.now()
      const generation = stateGenerationOverride ?? stateReads
      return {
        version: 2 as const,
        revision: 'test-state',
        sessions: codeRows.map(codeSession),
        truncated: false,
        generation,
        source: 'hook' as const,
        freshness: { readAt, newestEvidenceAt: readAt },
        compatibility: 'compatible' as const,
        stateGeneration: generation,
        stateCompatibility: 'compatible' as const,
        readAt
      }
    },
    readCodeUnread: async () => {
      unreadReads += 1
      if (throwUnread) throw new Error('unread failed')
      if (unreadReadGate) await unreadReadGate
      return unread === null ? null : {
        version: 2 as const,
        revision: 'test-unread-v2',
        ids: [...unread],
        readAt: Date.now(),
        generation: unreadGeneration,
        sourceFingerprint: unreadGeneration.toString(16).padStart(32, '0')
      }
    },
    readPlanUsage: async () => options.planUsage ?? null,
    readQuotaFallback: async (input: Record<string, unknown>) => {
      fallbackCalls.push(input)
      if (options.fallbackPromise) return options.fallbackPromise
      return options.fallback ?? null
    },
    watchCodeState: (listener: () => void) => { eventListeners.push(listener); return () => undefined },
    watchEvents: (listener: () => void) => { eventListeners.push(listener); return () => undefined },
    watchCodeSessions: (listener: () => void) => { codeListeners.push(listener); return () => undefined },
    watchCodeUnread: (listener: () => void) => { unreadListeners.push(listener); return () => undefined },
    install: () => ({ ok: true }),
    uninstall: () => ({ ok: true }),
    openTask: async (sessionId: string) => {
      openCalls.push(sessionId)
      return options.openResult ?? { outcome: 'dispatched' as const, confirmsRead: false, message: 'opened' }
    },
    diagnostics: () => ({
      revision: 'test',
      loaded: true,
      loadError: '',
      quotaAccess: {
        status: options.quotaAccessStatus ?? 'idle',
        lastAttemptAt: options.quotaAccessStatus && options.quotaAccessStatus !== 'idle' ? Date.now() : 0,
        retryAt: options.quotaAccessStatus === 'rate-limited' ? Date.now() + 60_000 : 0
      }
    }),
    close: () => undefined
  }

  const platform = {
    codex: {
      readSnapshot: async (input: Record<string, boolean>) => input.includeThreads
        ? {
            ok: true as const,
            receivedAt: Date.now(),
            value: {
              version: 2 as const,
              receivedAt: Date.now(),
              threads: [],
              projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
              sourceFingerprint: SOURCE_FINGERPRINT,
              completeness: 'verified' as const
            }
          }
        : {
            ok: true as const,
            receivedAt: Date.now(),
            value: {
              version: 2 as const,
              receivedAt: Date.now(),
              quota: { plan: 'pro', short: { remainingPercent: 80, resetAt: 0, windowMinutes: 300 } }
            }
          },
      openThread: async () => ({ outcome: 'opened' as const }),
      close: () => undefined
    },
    ...(options.bridgeAbsent ? {} : { claude })
  } as unknown as EypcPlatformApi

  const controller = createCodexController({
    platform,
    getAppState: () => state,
    save: () => undefined,
    notify: () => { notifications += 1 },
    setMessage: (message: string) => { messages.push(message) }
  })
  return {
    controller,
    state,
    openCalls,
    fallbackCalls,
    messages,
    quotaReads: () => quotaReads,
    codeReads: () => codeReads,
    stateReads: () => stateReads,
    unreadReads: () => unreadReads,
    notifications: () => notifications,
    setCodeRows: (rows: CodeSeed[]) => { codeRows = rows },
    setThrowCode: (value: boolean) => { throwCode = value },
    setCodeAvailable: (value: boolean) => { codeAvailable = value },
    setCodeReadGate: (value: Promise<void> | null) => { codeReadGate = value },
    setStateReadGate: (value: Promise<void> | null) => { stateReadGate = value },
    setUnreadReadGate: (value: Promise<void> | null) => { unreadReadGate = value },
    setUnread: (ids: string[] | null) => { unread = ids; unreadGeneration += 1 },
    setUnreadSnapshot: (ids: string[] | null, generation: number) => { unread = ids; unreadGeneration = generation },
    setStateGeneration: (generation: number | null) => { stateGenerationOverride = generation },
    setThrowState: (value: boolean) => { throwState = value },
    setThrowUnread: (value: boolean) => { throwUnread = value },
    emitEvent: () => eventListeners.at(-1)?.(),
    emitCode: () => codeListeners.at(-1)?.(),
    emitUnread: () => unreadListeners.at(-1)?.()
  }
}

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

function conversationsOf(context: ReturnType<typeof harness>) {
  return context.controller.view().taskState.conversations
}

describe('Claude App Code aggregation', () => {
  it('publishes only App Code rows with the App title and exact fallback title', async () => {
    const context = harness({
      codeSessions: [
        { sessionId: LOCAL_A, title: '额度和任务状态核验', phase: 'running' },
        { sessionId: LOCAL_B, title: '  ', phase: 'completed' }
      ]
    })
    context.controller.start()
    await settle()
    const tasks = conversationsOf(context).all.filter((task) => task.provider === 'claude')
    expect(tasks.map((task) => task.originalName).sort()).toEqual(['General coding session', '额度和任务状态核验'].sort())
    expect(tasks.map((task) => task.actionAlias).sort()).toEqual([LOCAL_A, LOCAL_B].sort())
    expect(context.controller.view().claudeCodeSessionCount).toBe(2)
    context.controller.dispose()
  })

  it('maps each native phase into exactly one shared bucket', async () => {
    const context = harness({
      codeSessions: [
        { sessionId: LOCAL_A, phase: 'waiting-approval' },
        { sessionId: LOCAL_B, phase: 'completed' },
        { sessionId: LOCAL_C, phase: 'unknown', correlation: 'ambiguous' }
      ],
      unread: [LOCAL_B]
    })
    context.controller.start()
    await settle()
    const conversations = conversationsOf(context)
    const keys = conversations.all.filter((task) => task.provider === 'claude').map((task) => task.key)
    expect(new Set(keys).size).toBe(3)
    expect(conversations.ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('waiting-approval')
    expect(conversations.completedUnread.find((task) => task.actionAlias === LOCAL_B)?.unreadState).toBe('unread')
    expect(conversations.stopped.find((task) => task.actionAlias === LOCAL_C)).toMatchObject({ state: 'attention', claudePhase: 'unknown' })
    context.controller.dispose()
  })

  it('uses native unread to recover a historical unknown row as completed-unread', async () => {
    const context = harness({
      codeSessions: [{ sessionId: LOCAL_A, phase: 'unknown', correlation: 'none' }],
      unread: [LOCAL_A]
    })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).completedUnread.find((task) => task.actionAlias === LOCAL_A))
      .toMatchObject({ claudePhase: 'completed', unreadState: 'unread' })
    context.controller.dispose()
  })

  it('never projects an App-archived Code row', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, archived: true }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.provider === 'claude')).toBe(false)
    expect(context.controller.view().claudeCodeSessionCount).toBe(0)
    context.controller.dispose()
  })

  it('reads nothing and publishes no Claude data while the provider is disabled', async () => {
    const context = harness({ claudeEnabled: false, codeSessions: [{ sessionId: LOCAL_A }] })
    context.controller.start()
    await settle()
    expect(context.quotaReads()).toBe(0)
    expect(context.codeReads()).toBe(0)
    expect(context.unreadReads()).toBe(0)
    expect(conversationsOf(context).all.some((task) => task.provider === 'claude')).toBe(false)
    context.controller.dispose()
  })

  it('degrades to Codex only when the preload exposes no Claude port', async () => {
    const context = harness({ bridgeAbsent: true, codeSessions: [{ sessionId: LOCAL_A }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).status).toBe('ok')
    expect(conversationsOf(context).all.some((task) => task.provider === 'claude')).toBe(false)
    context.controller.dispose()
  })
})

describe('independent local authorities', () => {
  it('keeps Code inventory and quota when the current unread read fails', async () => {
    const context = harness({
      codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }],
      throwUnread: true,
      quota: { five_hour: { used_percentage: 25 } }
    })
    context.controller.start()
    await settle()
    const task = conversationsOf(context).all.find((row) => row.actionAlias === LOCAL_A)
    expect(task).toMatchObject({ bucket: 'completed', unreadState: 'unknown' })
    expect(context.controller.view().claudeQuota.windows).toHaveLength(1)
    context.controller.dispose()
  })

  it('keeps quota and unread authority independent when Code inventory fails', async () => {
    const context = harness({ throwCode: true, unread: [LOCAL_A], quota: { five_hour: { used_percentage: 25 } } })
    context.controller.start()
    await settle()
    expect(context.controller.view().claudeQuota.windows).toHaveLength(1)
    expect(conversationsOf(context).all.some((task) => task.provider === 'claude')).toBe(false)
    context.controller.dispose()
  })

  it('keeps Code inventory when the quota cache read fails', async () => {
    const context = harness({ throwQuota: true, codeSessions: [{ sessionId: LOCAL_A }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })

  it('refreshes promptly from every native watcher without crossing authority ownership', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }] })
    context.controller.start()
    await settle()
    const initialReads = context.codeReads()
    context.setCodeRows([{ sessionId: LOCAL_A, title: 'Updated metadata', phase: 'waiting-input' }])
    context.emitCode()
    await settle()
    expect(context.codeReads()).toBeGreaterThan(initialReads)
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)).toMatchObject({
      state: 'running',
      originalName: 'Updated metadata'
    })
    const afterCode = context.codeReads()
    context.emitEvent()
    await settle()
    expect(context.stateReads()).toBeGreaterThan(0)
    expect(context.codeReads()).toBe(afterCode)
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('waiting-input')
    const afterHook = context.codeReads()
    const beforeUnread = context.unreadReads()
    context.emitUnread()
    await settle()
    expect(context.codeReads()).toBe(afterHook)
    expect(context.unreadReads()).toBeGreaterThan(beforeUnread)
    context.controller.dispose()
  })

  it('rejects a regressing state generation and accepts the next newer generation', async () => {
    const base = Date.now()
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'running', at: base }] })
    context.controller.start()
    await settle()
    context.setStateGeneration(5)
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'waiting-input', at: base + 5_000 }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('waiting-input')

    context.setStateGeneration(4)
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'running', at: base + 10_000 }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('waiting-input')

    context.setStateGeneration(6)
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('running')
    context.controller.dispose()
  })

  it('accepts a newer state generation even when its event time is older', async () => {
    const base = Date.now()
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'running', at: base }] })
    context.controller.start()
    await settle()
    context.setStateGeneration(5)
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'waiting-input', at: base + 5_000 }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('waiting-input')

    context.setStateGeneration(6)
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'completed', at: base + 1_000 }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).completed.find((task) => task.actionAlias === LOCAL_A)).toMatchObject({ claudePhase: 'completed' })
    context.controller.dispose()
  })

  it('degrades a live phase to unknown after two consecutive state read failures', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }] })
    context.controller.start()
    await settle()
    context.setThrowState(true)
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('running')
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).stopped.find((task) => task.actionAlias === LOCAL_A)).toMatchObject({ claudePhase: 'unknown' })
    context.emitCode()
    await settle()
    expect(conversationsOf(context).stopped.find((task) => task.actionAlias === LOCAL_A)).toMatchObject({ claudePhase: 'unknown' })
    context.controller.dispose()
  })

  it('drops unread certainty when a previously successful native snapshot fails', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }], unread: [LOCAL_A] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).completedUnread.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.setUnread(null)
    context.emitUnread()
    await settle()
    expect(conversationsOf(context).completedUnread.some((task) => task.actionAlias === LOCAL_A)).toBe(false)
    expect(conversationsOf(context).completed.find((task) => task.actionAlias === LOCAL_A)?.unreadState).toBe('unknown')
    context.controller.dispose()
  })

  it('rejects a regressing V2 unread generation without losing the last stable native false', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }], unread: [LOCAL_A] })
    context.controller.start()
    await settle()
    context.setUnread([])
    context.emitUnread()
    await settle()
    expect(conversationsOf(context).completed.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.setUnreadSnapshot([LOCAL_A], 1)
    context.emitUnread()
    await settle()
    expect(conversationsOf(context).completed.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })

  it('retains the last valid inventory when a later metadata read fails', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.setThrowCode(true)
    context.emitCode()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })

  it('retains the last valid inventory when the reader reports an incomplete scan', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.setCodeRows([])
    context.setCodeAvailable(false)
    context.emitCode()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })

  it('publishes a state event while an eight-second-class quota request is still pending', async () => {
    let release!: (value: null) => void
    const pendingQuota = new Promise<null>((resolvePromise) => { release = resolvePromise })
    const context = harness({
      codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }],
      fallbackPromise: pendingQuota
    })
    context.controller.start()
    await settle()
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'waiting-input' }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('waiting-input')
    release(null)
    await settle()
    context.controller.dispose()
  })

  it('keeps newer state while a slower inventory patch updates metadata', async () => {
    const base = Date.now() - 10_000
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, title: 'Old title', phase: 'running', at: base }] })
    context.controller.start()
    await settle()
    let releaseInventory!: () => void
    const inventoryGate = new Promise<void>((resolvePromise) => { releaseInventory = resolvePromise })
    context.setCodeReadGate(inventoryGate)
    context.setCodeRows([{ sessionId: LOCAL_A, title: 'New title', phase: 'waiting-input', at: base + 1_000 }])
    context.emitCode()
    await settle()
    context.setCodeRows([{ sessionId: LOCAL_A, title: 'New title', phase: 'running', at: base + 2_000 }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('running')
    releaseInventory()
    context.setCodeReadGate(null)
    await settle()
    const task = conversationsOf(context).ongoing.find((row) => row.actionAlias === LOCAL_A)
    expect(task).toMatchObject({ state: 'running', originalName: 'New title' })
    context.controller.dispose()
  })

  it('publishes 100 state transitions under 250ms P95 while quota remains blocked', async () => {
    let releaseQuota!: (value: null) => void
    const pendingQuota = new Promise<null>((resolvePromise) => { releaseQuota = resolvePromise })
    const base = Date.now()
    const context = harness({
      codeSessions: [{ sessionId: LOCAL_A, phase: 'running', at: base }],
      fallbackPromise: pendingQuota
    })
    context.controller.start()
    await settle()
    const inventoryReads = context.codeReads()
    const latencies: number[] = []
    for (let index = 1; index <= 100; index += 1) {
      context.setCodeRows([{
        sessionId: LOCAL_A,
        phase: index % 2 ? 'waiting-input' : 'running',
        at: base + index * 1_000
      }])
      const startedAt = performance.now()
      context.emitEvent()
      await settle()
      latencies.push(performance.now() - startedAt)
    }
    const ordered = [...latencies].sort((left, right) => left - right)
    const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1]
    expect(p95).toBeLessThan(250)
    expect(context.stateReads()).toBeGreaterThanOrEqual(100)
    expect(context.codeReads()).toBe(inventoryReads)
    expect(conversationsOf(context).ongoing.find((task) => task.actionAlias === LOCAL_A)?.state).toBe('running')
    releaseQuota(null)
    await settle()
    context.controller.dispose()
  })

  it('clears all Claude observations immediately when the provider is disabled', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A }] })
    context.controller.start()
    await settle()
    expect(conversationsOf(context).all.some((task) => task.provider === 'claude')).toBe(true)
    context.controller.updateSettings({ providers: { codex: true, claude: false } })
    await settle()
    expect(conversationsOf(context).all.some((task) => task.provider === 'claude')).toBe(false)
    expect(context.controller.view().claudeCodeSessionCount).toBe(0)
    context.controller.dispose()
  })
})

describe('exact jump and unread authority', () => {
  it('rejects a sync request whose key and App-local id do not identify the current row', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }] })
    context.controller.start()
    await settle()
    const before = { state: context.stateReads(), unread: context.unreadReads() }
    await expect(context.controller.syncClaudeTask('claude:stale', LOCAL_A)).resolves.toMatchObject({ accepted: false })
    expect({ state: context.stateReads(), unread: context.unreadReads() }).toEqual(before)
    expect(context.messages.at(-1)).toBe('Claude 任务身份已失效，请刷新后重试')
    context.controller.dispose()
  })

  it('joins concurrent per-task syncs onto one state read and one unread read', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }] })
    context.controller.start()
    await settle()
    const key = conversationsOf(context).all.find((task) => task.actionAlias === LOCAL_A)!.key
    let releaseState!: () => void
    let releaseUnread!: () => void
    context.setStateReadGate(new Promise<void>((resolvePromise) => { releaseState = resolvePromise }))
    context.setUnreadReadGate(new Promise<void>((resolvePromise) => { releaseUnread = resolvePromise }))
    const before = { state: context.stateReads(), unread: context.unreadReads() }
    const first = context.controller.syncClaudeTask(key, LOCAL_A)
    const second = context.controller.syncClaudeTask(key, LOCAL_A)
    await settle()
    expect(context.stateReads() - before.state).toBe(1)
    expect(context.unreadReads() - before.unread).toBe(1)
    releaseState()
    releaseUnread()
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ accepted: true, state: 'ok', unread: 'ok' }),
      expect.objectContaining({ accepted: true, state: 'ok', unread: 'ok' })
    ])
    context.controller.dispose()
  })

  it('publishes one merged update and reports a partial unread failure precisely', async () => {
    const base = Date.now()
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'running', at: base }] })
    context.controller.start()
    await settle()
    const key = conversationsOf(context).all.find((task) => task.actionAlias === LOCAL_A)!.key
    const beforeNotifications = context.notifications()
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'completed', at: base + 5_000 }])
    context.setThrowUnread(true)
    await expect(context.controller.syncClaudeTask(key, LOCAL_A)).resolves.toMatchObject({
      accepted: true,
      state: 'ok',
      unread: 'unavailable',
      changed: true
    })
    expect(context.notifications() - beforeNotifications).toBe(1)
    expect(context.messages.at(-1)).toBe('Claude 状态已同步；原生已读信息暂不可用')
    expect(conversationsOf(context).completed.find((task) => task.actionAlias === LOCAL_A)).toMatchObject({
      claudePhase: 'completed',
      unreadState: 'unknown'
    })
    context.controller.dispose()
  })

  it('passes the App-local id unchanged and creates only a process-local same-completion read hint', async () => {
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }], unread: [LOCAL_A] })
    context.controller.start()
    await settle()
    const key = conversationsOf(context).all.find((task) => task.actionAlias === LOCAL_A)!.key
    const before = JSON.stringify(context.state.codex)
    expect(await context.controller.openThread(key, LOCAL_A)).toBe(true)
    expect(context.openCalls).toEqual([LOCAL_A])
    expect(JSON.stringify(context.state.codex)).toBe(before)
    expect(conversationsOf(context).completedUnread.some((task) => task.actionAlias === LOCAL_A)).toBe(false)
    expect(conversationsOf(context).completed.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })

  it('runs one silent state/unread sync after a successful open and none after a failed dispatch', async () => {
    const success = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }], unread: [LOCAL_A] })
    success.controller.start()
    await settle()
    const successKey = conversationsOf(success).all.find((task) => task.actionAlias === LOCAL_A)!.key
    const beforeSuccess = { state: success.stateReads(), unread: success.unreadReads() }
    expect(await success.controller.openThread(successKey, LOCAL_A)).toBe(true)
    await settle()
    expect(success.stateReads()).toBeGreaterThan(beforeSuccess.state)
    expect(success.unreadReads()).toBeGreaterThan(beforeSuccess.unread)
    success.controller.dispose()

    const failure = harness({
      codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }],
      unread: [LOCAL_A],
      openResult: { outcome: 'failed', confirmsRead: false, message: 'failed' }
    })
    failure.controller.start()
    await settle()
    const failureKey = conversationsOf(failure).all.find((task) => task.actionAlias === LOCAL_A)!.key
    const beforeFailure = { state: failure.stateReads(), unread: failure.unreadReads() }
    expect(await failure.controller.openThread(failureKey, LOCAL_A)).toBe(false)
    await settle()
    expect({ state: failure.stateReads(), unread: failure.unreadReads() }).toEqual(beforeFailure)
    failure.controller.dispose()
  })

  it('reports a failed App jump without changing the card', async () => {
    const context = harness({
      codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }],
      unread: [LOCAL_A],
      openResult: { outcome: 'unavailable', confirmsRead: false, message: 'Claude 桌面端未在运行' }
    })
    context.controller.start()
    await settle()
    const key = conversationsOf(context).all.find((task) => task.actionAlias === LOCAL_A)!.key
    expect(await context.controller.openThread(key, LOCAL_A)).toBe(false)
    expect(context.messages.at(-1)).toBe('Claude 桌面端未在运行')
    expect(conversationsOf(context).completedUnread.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })

  it('rejects a late unread=true for the same completion but allows the next completion to become unread', async () => {
    const base = Date.now()
    const context = harness({ codeSessions: [{ sessionId: LOCAL_A, phase: 'completed', at: base }], unread: [LOCAL_A] })
    context.controller.start()
    await settle()
    const key = conversationsOf(context).all.find((task) => task.actionAlias === LOCAL_A)!.key
    expect(await context.controller.openThread(key, LOCAL_A)).toBe(true)

    context.setUnread([])
    context.emitUnread()
    await settle()
    context.setUnread([LOCAL_A])
    context.emitUnread()
    await settle()
    expect(conversationsOf(context).completed.some((task) => task.actionAlias === LOCAL_A)).toBe(true)

    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'running', at: base + 10_000 }])
    context.emitEvent()
    await settle()
    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'completed', at: base + 20_000 }])
    context.emitEvent()
    await settle()
    expect(conversationsOf(context).completedUnread.some((task) => task.actionAlias === LOCAL_A)).toBe(true)
    context.controller.dispose()
  })
})

describe('dynamic quota supplement', () => {
  it('wakes at reset + 1 second when that is earlier than the configured cadence', () => {
    expect(claudeQuotaScheduleDelay(
      { quotaRefreshSeconds: 300 },
      1_000,
      [{ resetAt: 10_000 }, { resetAt: 20_000 }],
      5_000
    )).toBe(6_000)
    expect(claudeQuotaScheduleDelay({ quotaRefreshSeconds: 0 }, 1_000, [{ resetAt: 4_000 }], 5_000)).toBe(1)
    expect(claudeQuotaScheduleDelay({ quotaRefreshSeconds: 0 }, 5_000, [{ resetAt: 4_000 }], 5_001)).toBe(Number.POSITIVE_INFINITY)
  })

  it('preserves primary windows and automatically supplements the missing Fable window', async () => {
    const now = Date.now()
    const context = harness({
      appQuotaAccess: true,
      quota: {
        five_hour: { used_percentage: 25, resets_at: Math.round(now / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.round(now / 1000) + 86_400 }
      },
      fallback: {
        rateLimits: { seven_day_fable: { used_percentage: 60, resets_at: Math.round(now / 1000) + 86_400 } },
        updatedAt: now
      }
    })
    context.controller.start()
    await settle()
    expect(context.controller.view().claudeQuota.windows.map((window) => window.key)).toEqual([
      'five_hour', 'seven_day', 'seven_day_fable'
    ])
    expect(context.fallbackCalls.at(-1)).toMatchObject({ enabled: true, supplement: true, coldStart: false })
    context.controller.dispose()
  })

  it('marks retained quota stale and publishes safe access health after a credential rejection', async () => {
    const now = Date.now()
    const context = harness({
      appQuotaAccess: true,
      quotaAccessStatus: 'credential-unavailable',
      quota: {
        five_hour: { used_percentage: 25, resets_at: Math.round(now / 1000) + 3_600 },
        seven_day: { used_percentage: 50, resets_at: Math.round(now / 1000) + 86_400 },
        seven_day_fable: { used_percentage: 60, resets_at: Math.round(now / 1000) + 86_400 }
      },
      fallback: null
    })
    context.controller.start()
    await settle()
    expect(context.controller.view().claudeQuota.status).toBe('stale')
    expect(context.controller.floatSnapshot().companion?.claudeQuotaAccess).toMatchObject({
      status: 'credential-unavailable'
    })
    context.controller.dispose()
  })

  it('merges the App plan sample without deleting model-scoped windows or reset moments', async () => {
    const sampleAt = Date.now() + 1_000
    const shortReset = Math.round(Date.now() / 1000) + 3_600
    const weeklyReset = Math.round(Date.now() / 1000) + 86_400
    const context = harness({
      quota: {
        five_hour: { used_percentage: 25, resets_at: shortReset },
        seven_day: { used_percentage: 50, resets_at: weeklyReset },
        seven_day_fable: { used_percentage: 60, resets_at: weeklyReset }
      },
      planUsage: { at: sampleAt, fiveHourUsedPercent: 30, sevenDayUsedPercent: 55 }
    })
    context.controller.start()
    await settle()
    const quota = context.controller.view().claudeQuota
    expect(quota.windows.map((window) => window.key)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
    expect(quota.windows.find((window) => window.key === 'five_hour')).toMatchObject({ remainingPercent: 70, resetAt: shortReset * 1000 })
    expect(quota.windows.find((window) => window.key === 'seven_day_fable')).toMatchObject({ remainingPercent: 40, resetAt: weeklyReset * 1000 })
    context.controller.dispose()
  })

  it('does not let a newer plan-history sample overwrite App-owned quota windows', async () => {
    const now = Date.now()
    const options: HarnessOptions = {
      appQuotaAccess: true,
      quota: null,
      planUsage: { at: now + 2_000, fiveHourUsedPercent: 90, sevenDayUsedPercent: 80 },
      fallback: {
        rateLimits: {
          five_hour: { used_percentage: 10, resets_at: Math.round(now / 1000) + 3_600 },
          seven_day: { used_percentage: 20, resets_at: Math.round(now / 1000) + 86_400 },
          seven_day_fable: { used_percentage: 30, resets_at: Math.round(now / 1000) + 86_400 }
        },
        updatedAt: now
      }
    }
    const context = harness(options)
    context.controller.start()
    await settle()
    options.fallback = null
    await context.controller.refresh()
    await settle()
    expect(context.controller.view().claudeQuota.windows.map((window) => [window.key, window.remainingPercent, window.source])).toEqual([
      ['five_hour', 90, 'usage-api'],
      ['seven_day', 80, 'usage-api'],
      ['seven_day_fable', 70, 'usage-api']
    ])
    context.controller.dispose()
  })
})
