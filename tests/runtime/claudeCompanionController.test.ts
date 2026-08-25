import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createInitialState } from '../../src/domain/state'
import type { ClaudeQuotaAccessStatus, ClaudeRateLimitsInput } from '../../src/domain/claude'
import type { ClaudeCodePhase, ClaudeCodeStateCompatibility, ClaudeCodeStatusCorrelation } from '../../src/domain/claudeCode'
import type { CodexHostThread } from '../../src/domain/codex'
import type { CompanionTaskMutationDelta, EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { companionTaskKey } from '../../src/domain/companionProvider'
import { claudeQuotaScheduleDelay, createCodexController } from '../../src/runtime/codexController'

const require = createRequire(import.meta.url)
const companionTaskKernelModule = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
}

const SOURCE_FINGERPRINT = 'a'.repeat(64)
const LOCAL_A = 'local_7badfe6b-950e-488b-a70c-cc6756e96763'
const LOCAL_B = 'local_8badfe6b-950e-488b-a70c-cc6756e96764'
const LOCAL_C = 'local_9badfe6b-950e-488b-a70c-cc6756e96765'

interface CodeSeed {
  sessionId: string
  title?: string
  phase?: ClaudeCodePhase
  correlation?: ClaudeCodeStatusCorrelation
  compatibility?: ClaudeCodeStateCompatibility
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
    stateCompatibility: seed.compatibility ?? 'compatible',
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
  archiveResult?: { outcome: 'archived' | 'failed' | 'indeterminate'; message?: string }
  codexThreads?: CodexHostThread[]
  kernelActions?: boolean
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
  state.codex.settings.providers = { codex: true, claude: options.claudeEnabled !== false, cursor: false }
  state.codex.settings.claudeAppQuotaAccess = options.appQuotaAccess === true
  const openCalls: string[] = []
  const archiveCalls: string[] = []
  const codexArchiveCalls: string[] = []
  const fallbackCalls: Array<Record<string, unknown>> = []
  const eventListeners: Array<() => void> = []
  const codeListeners: Array<(delta?: CompanionTaskMutationDelta) => void> = []
  const unreadListeners: Array<() => void> = []
  let quotaReads = 0
  let codeReads = 0
  let stateReads = 0
  let unreadReads = 0
  let inspectReads = 0
  let notifications = 0
  const messages: string[] = []

  const claude = {
    inspect: async () => {
      inspectReads += 1
      return {
        version: 1 as const,
        installed: true,
        homeReady: true,
        authenticated: true,
        cliVersion: '2.1.220',
        hooks: 'installed' as const,
        statusline: 'installed' as const,
        checkedAt: Date.now()
      }
    },
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
    watchCodeSessions: (listener: (delta?: CompanionTaskMutationDelta) => void) => { codeListeners.push(listener); return () => undefined },
    watchCodeUnread: (listener: () => void) => { unreadListeners.push(listener); return () => undefined },
    install: () => ({ ok: true }),
    uninstall: () => ({ ok: true }),
    openTask: async (sessionId: string) => {
      openCalls.push(sessionId)
      return options.openResult ?? { outcome: 'dispatched' as const, confirmsRead: false, message: 'opened' }
    },
    archiveCodeSession: async (sessionId: string) => {
      archiveCalls.push(sessionId)
      return options.archiveResult ?? { outcome: 'archived' as const, message: 'archived' }
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

  const codexArchive = async (actionAlias: string) => {
    codexArchiveCalls.push(actionAlias)
    return { outcome: 'archived' as const }
  }
  let companionKernel: any = null
  let companionDraftRevision = 0
  let publishKernelEvidence = () => undefined
  if (options.kernelActions) {
    companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => ({ outcome: 'opened', key: target.key }),
          archive: async (target: Record<string, unknown>) => codexArchive(String(target.actionAlias))
        },
        claude: {
          open: async (target: Record<string, unknown>) => claude.openTask(String(target.actionAlias)),
          archive: async (target: Record<string, unknown>) => {
            const result = await claude.archiveCodeSession(String(target.actionAlias))
            if (result.outcome === 'archived') {
              companionKernel.commitArchived({
                provider: 'claude',
                key: target.key,
                verified: true,
                terminalEpoch: Number(target.revisionAt) || Date.now(),
                membershipRevision: Date.now()
              })
            }
            return result
          }
        }
      },
      initialConfiguration: { enabled: true, providers: state.codex.settings.providers }
    })
    publishKernelEvidence = () => {
      if (throwCode || !codeAvailable) return
      const revision = ++companionDraftRevision
      const terminal = (phase: string) => phase === 'completed' || phase === 'stopped'
      const tasks = codeRows.filter((seed) => seed.archived !== true).map((seed, index) => {
      const row = codeSession(seed)
      const nativeUnread = Array.isArray(unread) && unread.includes(seed.sessionId)
      const phase = ['running', 'waiting-input', 'waiting-approval'].includes(row.phase)
        ? row.phase
        : nativeUnread ? 'completed' : row.phase
      const revisionAt = Math.max(1, row.phaseUpdatedAt, row.metadataUpdatedAt, row.lastActivityAt)
      // Mirrors the preload draft: archive is status-only, never version-gated.
      const archive = terminal(phase)
      return {
        key: companionTaskKey('claude', seed.sessionId),
        provider: 'claude',
        kind: 'claude-session',
        phase,
        cycleTier: 'none',
        dynamicGroup: 'none',
        actionAlias: seed.sessionId,
        revisionAt,
        membershipRevision: revisionAt,
        phaseRevision: row.phaseUpdatedAt,
        unreadRevision: revisionAt,
        visibilityRevision: revisionAt,
        statusEnteredAt: row.phaseUpdatedAt,
        turnStartedAt: row.turnStartedAt,
        terminalAt: terminal(phase) ? row.phaseUpdatedAt : 0,
        metadataRevision: row.metadataUpdatedAt,
        lastQuestionAt: row.turnStartedAt,
        createdAt: row.createdAt,
        displayOrder: index,
        cycleOrder: index,
        attentionOrder: index,
        hidden: false,
        unreadKnown: unread !== null,
        unread: nativeUnread,
        planImplementation: false,
        planReady: false,
        planLifecycleRevision: 0,
        paused: false,
        turnMode: 'unknown',
        idleConfirmed: terminal(phase),
        localPin: false,
        dynamicEligible: true,
        displayName: row.title,
        capabilities: { open: true, archive, pause: false, resume: false, executePlan: false }
      }
    })
      for (const [index, thread] of (options.codexThreads ?? []).entries()) {
      const phase = thread.lastTurnStatus === 'completed'
        ? 'completed'
        : thread.lastTurnStatus === 'interrupted' && thread.status === 'idle'
          ? 'stopped'
          : 'running'
      const revisionAt = Math.max(1, thread.lastTurnCompletedAt || thread.lastTurnStartedAt || thread.updatedAt)
        tasks.push({
        key: thread.key,
        provider: 'codex',
        kind: 'codex-thread',
        phase,
        cycleTier: 'none',
        dynamicGroup: 'none',
        actionAlias: thread.actionAlias || '',
        revisionAt,
        membershipRevision: revisionAt,
        phaseRevision: revisionAt,
        unreadRevision: revisionAt,
        visibilityRevision: revisionAt,
        statusEnteredAt: revisionAt,
        turnStartedAt: thread.lastTurnStartedAt || 0,
        terminalAt: terminal(phase) ? revisionAt : 0,
        metadataRevision: thread.updatedAt,
        lastQuestionAt: thread.lastTurnStartedAt || thread.updatedAt,
        createdAt: thread.createdAt || 0,
        displayOrder: tasks.length + index,
        cycleOrder: tasks.length + index,
        attentionOrder: tasks.length + index,
        hidden: false,
        unreadKnown: true,
        unread: thread.hasUnreadTurn === true,
        planImplementation: false,
        planReady: false,
        planLifecycleRevision: 0,
        paused: false,
        turnMode: 'unknown',
        idleConfirmed: terminal(phase),
        localPin: false,
        dynamicEligible: true,
        displayName: thread.name,
        capabilities: { open: true, archive: terminal(phase), pause: false, resume: false, executePlan: false },
        archiveRequest: {
          expectedUpdatedAt: thread.updatedAt,
          expectedRevisionAt: revisionAt,
          expectedCompletionAt: thread.lastTurnCompletedAt || 0,
          expectedLastTurnStartedAt: thread.lastTurnStartedAt || 0,
          expectedSourceFingerprint: SOURCE_FINGERPRINT,
          evidence: phase === 'stopped' ? 'stopped' : 'completed'
        }
        } as any)
      }
      const sourceLaneGenerations = {
        codex: { membership: revision, activity: revision, interaction: revision, unread: revision, planArtifact: revision, metadata: revision, topology: revision },
        claude: { membership: revision, activity: revision, interaction: revision, unread: revision, planArtifact: revision, metadata: revision, topology: revision },
        cursor: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 }
      }
      const evidenceBatches = Object.fromEntries((['codex', 'claude', 'cursor'] as const).map((provider) => [provider, {
        revision: 'companion-provider-evidence-batch-v3',
        provider,
        channels: Object.fromEntries(['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'].map((channel) => [channel, {
          mode: 'delta',
          complete: false,
          generation: sourceLaneGenerations[provider][channel as keyof typeof sourceLaneGenerations.codex],
          removedKeys: []
        }])),
        nodes: tasks.filter((task) => task.provider === provider).map((task) => ({
          key: task.key,
          provider,
          family: `${provider}:${task.key}`,
          role: 'root',
          membership: 'present',
          activity: {
            kind: task.phase === 'running' ? 'turn-running'
              : task.phase === 'waiting-input' || task.phase === 'waiting-approval' ? 'turn-completed'
                  : task.phase === 'completed' ? 'turn-completed'
                    : task.phase === 'stopped' ? 'turn-interrupted'
                      : 'unknown',
            causalKey: '',
            sequence: revision,
            exact: true,
            observedAt: Date.now(),
            statusEnteredAt: task.statusEnteredAt,
            turnStartedAt: task.turnStartedAt,
            terminalAt: task.terminalAt
          },
          unread: { known: task.unreadKnown, value: task.unread, sequence: revision },
          planArtifact: { revision: 'companion-plan-artifact-v1', state: 'unknown', sequence: 0, actionable: false, reason: '' },
          metadata: { ...task, partial: false },
          capabilities: Object.entries(task.capabilities)
            .filter(([, enabled]) => enabled === true)
            .map(([name]) => name === 'executePlan' ? 'execute-plan' : name),
          standaloneEligible: true,
          error: false
        })),
        interactions: tasks.filter((task) => task.provider === provider
          && (task.phase === 'waiting-input' || task.phase === 'waiting-approval')).map((task) => ({
          revision: 'companion-interaction-evidence-v1',
          provider,
          taskKey: task.key,
          branchRef: 'root',
          interactionRef: `${revision.toString(16).padStart(16, '0')}bbbbbbbbbbbbbbbb`,
          kind: task.phase === 'waiting-approval' ? 'approval' : 'user-input',
          state: 'opened',
          sequence: revision,
          turnEpoch: task.turnStartedAt,
          requestSetRevision: revision,
          authority: 'provider-live',
          exact: true
        })),
        interactionSets: tasks.filter((task) => task.provider === provider).map((task) => ({
          revision: 'companion-interaction-evidence-v1',
          provider,
          taskKey: task.key,
          requestSetRevision: revision,
          complete: true
        })),
        relations: [],
        relationMode: 'delta',
        relationsComplete: false,
        removedRelationChildKeys: [],
        health: state.codex.settings.providers[provider] ? 'ready' : 'unavailable'
      }]))
      companionKernel.publishEvidence({
        schema: 'companion-task-evidence-draft-v7',
        producer: 'host-evidence',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: revision,
        acceptedAt: Date.now(),
        enabled: true,
        providers: state.codex.settings.providers,
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: revision, claude: revision, cursor: 0 },
        sourceLaneGenerations,
        providerHealth: {
          codex: { status: 'ready', generation: revision, errorCode: '' },
          claude: { status: 'ready', generation: revision, errorCode: '' },
          cursor: { status: 'disabled', generation: 0, errorCode: '' }
        },
        evidenceBatches
      })
    }
    publishKernelEvidence()
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
              threads: options.codexThreads ?? [],
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
      archiveThread: codexArchive,
      close: () => undefined
    },
    ...(companionKernel ? { companionKernel } : {}),
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
    archiveCalls,
    codexArchiveCalls,
    fallbackCalls,
    messages,
    quotaReads: () => quotaReads,
    codeReads: () => codeReads,
    stateReads: () => stateReads,
    unreadReads: () => unreadReads,
    inspectReads: () => inspectReads,
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
    emitEvent: () => { publishKernelEvidence(); eventListeners.at(-1)?.() },
    emitCode: (delta?: CompanionTaskMutationDelta) => { publishKernelEvidence(); codeListeners.at(-1)?.(delta) },
    emitUnread: () => { publishKernelEvidence(); unreadListeners.at(-1)?.() }
  }
}

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

function conversationsOf(context: ReturnType<typeof harness>) {
  return context.controller.view().taskState.conversations
}

describe('Claude tasks through the V6 Kernel', () => {
  it('maps native phases and unread into one public task snapshot without exposing Provider aliases', async () => {
    const context = harness({
      kernelActions: true,
      codeSessions: [
        { sessionId: LOCAL_A, phase: 'waiting-approval' },
        { sessionId: LOCAL_B, phase: 'completed' },
        { sessionId: LOCAL_C, phase: 'unknown', correlation: 'ambiguous' }
      ],
      unread: [LOCAL_B]
    })
    context.controller.start()
    await settle()

    const tasks = context.controller.view().taskSnapshot.tasks.filter((task) => task.provider === 'claude')
    expect(tasks).toHaveLength(3)
    expect(tasks.find((task) => task.key === companionTaskKey('claude', LOCAL_A))?.phase).toBe('waiting-approval')
    expect(tasks.find((task) => task.key === companionTaskKey('claude', LOCAL_B))).toMatchObject({
      phase: 'completed',
      unread: true,
      unreadKnown: true
    })
    expect(tasks.find((task) => task.key === companionTaskKey('claude', LOCAL_C))?.phase).toBe('unknown')
    expect(tasks.every((task) => !('actionAlias' in task) && !('capabilityToken' in task))).toBe(true)
    expect(context.controller.view().claudeCodeSessionCount).toBe(3)
    context.controller.dispose()
  })

  it('reads Claude hook registration on start without opening inventory or unread lanes', async () => {
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }]
    })
    expect(context.controller.view().claudeEnvironment.hooks).toBe('unknown')
    context.controller.start()
    await settle()
    expect(context.controller.view().claudeEnvironment.hooks).toBe('installed')
    expect(context.controller.view().claudeEnvironment.statusline).toBe('installed')
    expect({
      inspect: context.inspectReads(),
      code: context.codeReads(),
      state: context.stateReads(),
      unread: context.unreadReads()
    }).toEqual({ inspect: 1, code: 0, state: 0, unread: 0 })
    context.controller.dispose()
  })

  it('accepts Host evidence updates without starting Renderer-side Claude task readers or watchers', async () => {
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }]
    })
    context.controller.start()
    await settle()
    expect({
      inspect: context.inspectReads(),
      code: context.codeReads(),
      state: context.stateReads(),
      unread: context.unreadReads()
    }).toEqual({ inspect: 1, code: 0, state: 0, unread: 0 })

    context.setCodeRows([{ sessionId: LOCAL_A, phase: 'waiting-input' }])
    context.emitEvent()
    await settle()

    expect(context.controller.view().taskSnapshot.tasks.find((task) => task.key === companionTaskKey('claude', LOCAL_A))?.phase)
      .toBe('waiting-input')
    expect({
      inspect: context.inspectReads(),
      code: context.codeReads(),
      state: context.stateReads(),
      unread: context.unreadReads()
    }).toEqual({ inspect: 1, code: 0, state: 0, unread: 0 })
    context.controller.dispose()
  })

  it.each(['completed', 'stopped'] as const)('routes a %s Claude archive through the unified Kernel command', async (phase) => {
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase }],
      archiveResult: { outcome: 'archived' }
    })
    context.controller.start()
    await settle()
    const key = companionTaskKey('claude', LOCAL_A)
    const task = conversationsOf(context).all.find((row) => row.key === key)!
    expect(task).toMatchObject({ archiveCapability: 'allowed', canArchive: true })

    await expect(context.controller.archive(task.key, task.revisionAt)).resolves.toBe(true)
    expect(context.archiveCalls).toEqual([LOCAL_A])
    expect(context.controller.view().taskSnapshot.tasks.some((row) => row.key === key)).toBe(false)
    context.controller.dispose()
  })

  it.each(['failed', 'indeterminate'] as const)('retains the Claude card when the unified archive adapter is %s', async (outcome) => {
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }],
      archiveResult: { outcome, message: `archive ${outcome}` }
    })
    context.controller.start()
    await settle()
    const key = companionTaskKey('claude', LOCAL_A)
    const task = conversationsOf(context).all.find((row) => row.key === key)!

    await expect(context.controller.archive(task.key, task.revisionAt)).resolves.toBe(false)
    expect(context.controller.view().taskSnapshot.tasks.some((row) => row.key === key)).toBe(true)
    expect(context.messages.at(-1)).toBe(`archive ${outcome}`)
    context.controller.dispose()
  })

  it('does not clear Provider unread when open only returns a dispatched handoff', async () => {
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }],
      unread: [LOCAL_A],
      openResult: { outcome: 'dispatched', confirmsRead: false, message: '等待 native receipt' }
    })
    context.controller.start()
    await settle()
    const key = companionTaskKey('claude', LOCAL_A)
    expect(context.controller.view().taskSnapshot.tasks.find((task) => task.key === key)).toMatchObject({
      phase: 'completed',
      unread: true
    })

    await expect(context.controller.openThread(key)).resolves.toBe(true)
    expect(context.openCalls).toEqual([LOCAL_A])
    expect(context.controller.view().taskSnapshot.tasks.find((task) => task.key === key)).toMatchObject({
      phase: 'completed',
      unread: true
    })
    context.controller.dispose()
  })

  it('removes the Claude lane immediately when the unified provider configuration disables it', async () => {
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase: 'running' }]
    })
    context.controller.start()
    await settle()
    expect(context.controller.view().taskSnapshot.tasks.some((task) => task.provider === 'claude')).toBe(true)

    context.controller.updateSettings({ providers: { codex: true, claude: false, cursor: false } })
    await settle()
    expect(context.controller.view().taskSnapshot.tasks.some((task) => task.provider === 'claude')).toBe(false)
    expect(context.controller.view().claudeCodeSessionCount).toBe(0)
    context.controller.dispose()
  })

  it('commits a mixed Codex and Claude archive selection through one command authority', async () => {
    const now = Date.now()
    const context = harness({
      kernelActions: true,
      codeSessions: [{ sessionId: LOCAL_A, phase: 'completed' }],
      codexThreads: [{
        key: 'abcdef0123456789',
        actionAlias: 'codex-completed-alias',
        name: 'Codex 已完成',
        status: 'notLoaded',
        activeFlags: [],
        statusAuthority: 'connector',
        updatedAt: now - 100,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: now - 300,
        lastTurnCompletedAt: now - 200,
        projectKey: 'chats',
        projectName: 'Chats',
        projectKind: 'chats'
      }]
    })
    context.controller.start()
    await settle()
    const tasks = conversationsOf(context).all
    const codexTask = tasks.find((task) => task.key === 'abcdef0123456789')!
    const claudeTask = tasks.find((task) => task.key === companionTaskKey('claude', LOCAL_A))!

    await expect(context.controller.archiveMany([
      { key: codexTask.key, revisionAt: codexTask.revisionAt },
      { key: claudeTask.key, revisionAt: claudeTask.revisionAt }
    ])).resolves.toBe(true)
    expect(context.codexArchiveCalls).toEqual(['codex-completed-alias'])
    expect(context.archiveCalls).toEqual([LOCAL_A])
    expect(context.controller.view().taskSnapshot.tasks).toHaveLength(0)
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
