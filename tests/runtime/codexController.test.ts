import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import { CODEX_TASK_STATE_REVISION, type CodexHostThread, type CodexThreadOpenResult } from '../../src/domain/codex'
import { CODEX_ACTION_HOST_RUNTIME_REVISION } from '../../src/domain/codexEnvironment'
import { codexActionLaneId } from '../../src/domain/codexActionRunner'
import { projectCodexDynamicStatus } from '../../src/domain/codexPresentation'
import type { EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { createCodexController } from '../../src/runtime/codexController'

const require = createRequire(import.meta.url)
const companionTaskKernelModule = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
}

function hostTask(key: string, now: number, overrides: Record<string, unknown> = {}) {
  return {
    key,
    provider: 'codex',
    kind: 'codex-thread',
    phase: 'running',
    cycleTier: 'none',
    dynamicGroup: 'none',
    actionAlias: `alias-${key}`,
    revisionAt: now,
    membershipRevision: now,
    phaseRevision: now,
    unreadRevision: now,
    visibilityRevision: now,
    statusEnteredAt: now,
    lastQuestionAt: now,
    displayOrder: 0,
    cycleOrder: 0,
    attentionOrder: 0,
    hidden: false,
    unread: false,
    unreadKnown: true,
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

function hostDraft(
  tasks: Record<string, unknown>[],
  now: number,
  revision = 1,
  providers = { codex: true, claude: false, cursor: false }
) {
  const generation = (provider: keyof typeof providers) => providers[provider] ? revision : 0
  const lanes = {
    codex: { membership: generation('codex'), activity: generation('codex'), interaction: generation('codex'), unread: generation('codex'), planArtifact: generation('codex'), metadata: generation('codex'), topology: generation('codex') },
    claude: { membership: generation('claude'), activity: generation('claude'), interaction: generation('claude'), unread: generation('claude'), planArtifact: generation('claude'), metadata: generation('claude'), topology: generation('claude') },
    cursor: { membership: generation('cursor'), activity: generation('cursor'), interaction: generation('cursor'), unread: generation('cursor'), planArtifact: generation('cursor'), metadata: generation('cursor'), topology: generation('cursor') }
  }
  const evidenceBatches = Object.fromEntries((['codex', 'claude', 'cursor'] as const).map((provider) => [provider, {
    revision: 'companion-provider-evidence-batch-v3',
    provider,
    channels: Object.fromEntries(['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'].map((channel) => [channel, {
      mode: 'delta',
      complete: false,
      generation: lanes[provider][channel as keyof typeof lanes.codex],
      removedKeys: []
    }])),
    nodes: tasks.filter((value) => value.provider === provider).map((value) => {
      const phase = value.phase
      const activityKind = phase === 'running' ? 'turn-running'
        : phase === 'waiting-input' || phase === 'waiting-approval' ? 'turn-completed'
            : phase === 'completed' ? 'turn-completed'
              : phase === 'stopped' ? value.error === true ? 'turn-failed' : 'turn-interrupted'
                : 'unknown'
      return {
        key: value.key,
        provider,
        family: value.family || `${provider}:${value.key}`,
        role: value.role === 'child' ? 'child' : 'root',
        membership: 'present',
        activity: {
          kind: activityKind,
          causalKey: value.causalKey || '',
          sequence: Number(value.phaseRevision) || Number(value.statusEnteredAt) || lanes[provider].activity || Number(value.revisionAt) || 1,
          exact: value.freshness !== 'verifying',
          observedAt: Number(value.observedAt) || now,
          statusEnteredAt: Number(value.statusEnteredAt) || 0,
          turnStartedAt: Number(value.turnStartedAt) || 0,
          terminalAt: Number(value.terminalAt) || 0
        },
        unread: {
          known: value.unreadKnown !== false && typeof value.unread === 'boolean',
          value: value.unread === true,
          sequence: lanes[provider].unread || Number(value.unreadRevision) || 0
        },
        planArtifact: {
          revision: 'companion-plan-artifact-v1',
          state: value.planReady === true || value.planImplementation === true
            ? 'available'
            : value.planLifecycleState === 'cleared' ? 'consumed' : 'unknown',
          sequence: Number(value.planLifecycleRevision) || 0,
          actionable: value.planReady === true || value.planImplementation === true,
          reason: ['cancel', 'execution-start', 'archive', 'removal'].includes(String(value.planClearReason)) ? value.planClearReason : ''
        },
        metadata: { ...value, partial: false },
        capabilities: Object.entries((value.capabilities || {}) as Record<string, unknown>)
          .filter(([, enabled]) => enabled === true)
          .map(([name]) => name === 'executePlan' ? 'execute-plan' : name),
        standaloneEligible: value.standaloneEligible !== false,
        error: value.error === true
      }
    }),
    interactions: tasks.filter((value) => value.provider === provider
      && (value.phase === 'waiting-input' || value.phase === 'waiting-approval')).map((value) => {
      const sequence = Number(value.phaseRevision) || Number(value.statusEnteredAt) || Number(value.revisionAt) || 1
      return {
        revision: 'companion-interaction-evidence-v1',
        provider,
        taskKey: value.key,
        branchRef: value.role === 'child' ? 'child' : 'root',
        interactionRef: `${sequence.toString(16).padStart(16, '0')}aaaaaaaaaaaaaaaa`,
        kind: value.phase === 'waiting-approval' ? 'approval' : value.planImplementation === true ? 'plan-implementation' : 'user-input',
        state: 'opened',
        sequence,
        turnEpoch: Number(value.turnStartedAt) || 0,
        requestSetRevision: sequence,
        authority: 'provider-live',
        exact: value.freshness !== 'verifying'
      }
    }),
    interactionSets: tasks.filter((value) => value.provider === provider).map((value) => ({
      revision: 'companion-interaction-evidence-v1',
      provider,
      taskKey: value.key,
      requestSetRevision: Number(value.phaseRevision) || Number(value.statusEnteredAt) || Number(value.revisionAt) || 1,
      complete: true
    })),
    relations: [],
    relationMode: 'delta',
    relationsComplete: false,
    removedRelationChildKeys: [],
    health: providers[provider] ? 'ready' : 'unavailable'
  }]))
  return {
    schema: 'companion-task-evidence-draft-v7',
    producer: 'host-evidence',
    sourceTaskStateRevision: 'task-state-v12',
    draftRevision: revision,
    acceptedAt: now,
    enabled: true,
    providers,
    complete: true,
    focusedKey: '',
    sourceGenerations: { codex: generation('codex'), claude: generation('claude'), cursor: generation('cursor') },
    sourceLaneGenerations: lanes,
    providerHealth: {
      codex: { status: providers.codex ? 'ready' : 'disabled', generation: generation('codex'), errorCode: '' },
      claude: { status: providers.claude ? 'ready' : 'disabled', generation: generation('claude'), errorCode: '' },
      cursor: { status: providers.cursor ? 'ready' : 'disabled', generation: generation('cursor'), errorCode: '' }
    },
    tasks,
    evidenceBatches
  }
}

describe('Codex controller', () => {
  it('fails closed instead of reconstructing task actions when the V7 Kernel is missing', () => {
    const state = createInitialState(1)
    const messages: string[] = []
    const controller = createCodexController({
      platform: { codex: { close: () => undefined } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: (message) => messages.push(message)
    })

    expect(controller.cycleTask(1)).toBe(false)
    expect(messages.at(-1)).toBe('V6 任务 Kernel 未加载，需要重新接入或重载')
    controller.dispose()
  })

  it('holds raw metadata behind verifying until the first complete Kernel package arrives', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: false }
    const taskKey = '1111111111111111'
    let inventoryReads = 0
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async (options: Record<string, boolean>) => {
          if (!options.includeThreads) return { ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now } }
          inventoryReads += 1
          return {
            ok: true as const,
            receivedAt: now,
            value: {
              version: 2 as const,
              receivedAt: now,
              threads: [{
                key: taskKey,
                actionAlias: 'metadata-alias',
                name: '仅由原始库存提供的标题',
                status: 'active' as const,
                activeFlags: [] as [],
                statusAuthority: 'desktop-live' as const,
                activityEvidence: 'activity-event' as const,
                updatedAt: now,
                lastTurnStatus: 'inProgress' as const,
                lastTurnStartedAt: now - 1
              }],
              projects: [],
              sourceFingerprint: 'f'.repeat(64),
              completeness: 'verified' as const
            }
          }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(inventoryReads).toBeGreaterThan(0))
    expect(controller.view().taskSnapshot.complete).toBe(false)
    expect(controller.view().taskState.conversations.all).toEqual([])
    expect(controller.view().taskState.dynamic.tasks).toEqual([])

    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now, {
      actionAlias: 'metadata-alias',
      cycleTier: 'active',
      dynamicGroup: 'active'
    })], now))
    await vi.waitFor(() => expect(controller.view().taskSnapshot.complete).toBe(true))
    expect(controller.view().taskState.dynamic.groups.active[0]).toMatchObject({
      key: taskKey,
      displayName: '仅由原始库存提供的标题'
    })
    controller.dispose()
  })

  it('publishes one real Kernel package to Main and Float and routes card and cycle to the same target', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: false }
    const taskKey = '1111111111111111'
    const opened: Array<Record<string, unknown>> = []
    const canonicalTask = hostTask(taskKey, now, {
      phase: 'waiting-input',
      actionAlias: 'kernel-controller-alias',
      displayName: '真实 Kernel 组合任务',
      projectKey: 'chats',
      projectName: 'Chats'
    })
    const preflight = vi.fn(async () => ({
      ...hostDraft([canonicalTask], now + 1, 2),
      producer: 'host-preflight'
    }))
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => {
            opened.push({ ...target })
            return { outcome: 'opened' }
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([canonicalTask], now))
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
          ? {
              ok: true as const,
              receivedAt: now,
              value: {
                version: 2 as const,
                receivedAt: now,
                threads: [{
                  key: taskKey,
                  actionAlias: 'kernel-controller-alias',
                  name: '真实 Kernel 组合任务',
                  status: 'active' as const,
                  activeFlags: ['waitingOnUserInput' as const],
                  statusAuthority: 'desktop-live' as const,
                  updatedAt: now,
                  lastTurnStatus: 'inProgress' as const,
                  lastTurnStartedAt: now - 1
                }],
                projects: [],
                sourceFingerprint: 'f'.repeat(64),
                completeness: 'verified' as const
              }
            }
          : { ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now } },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskSnapshot.complete).toBe(true))

    const mainPackage = controller.view().taskSnapshot
    const floatPackage = controller.floatSnapshot().taskSnapshot
    expect(floatPackage).toBe(mainPackage)
    expect(mainPackage.views.cycleKeys).toEqual([taskKey])
    const revisionBeforeActions = companionKernel.getLatest().packageRevision

    await expect(controller.openThread(taskKey)).resolves.toBe(true)
    expect(controller.cycleTask(1)).toBe(true)
    await vi.waitFor(() => expect(opened).toHaveLength(2))
    await expect(controller.openThread(taskKey)).resolves.toBe(true)
    expect(preflight).not.toHaveBeenCalled()
    expect(opened).toHaveLength(3)
    expect(companionKernel.getLatest().packageRevision).toBe(revisionBeforeActions)

    expect(opened[0]).toMatchObject({
      key: taskKey,
      provider: 'codex',
      actionAlias: 'kernel-controller-alias',
      phase: 'waiting-input',
      canArchive: false
    })
    expect(opened[1]).toEqual(opened[0])
    expect(opened[2]).toEqual(opened[0])
    controller.dispose()
  })

  it('hydrates metadata immediately when the process package admits a new Codex task', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: false }
    let includeNew = false
    let inventoryReads = 0
    const firstKey = '1111111111111111'
    const newKey = '2222222222222222'
    const row = (key: string, offset: number) => ({
      key,
      actionAlias: `alias-${key}`,
      name: key === newKey ? '新任务' : '原任务',
      status: 'active' as const,
      activeFlags: [] as [],
      statusAuthority: 'desktop-live' as const,
      updatedAt: now + offset,
      lastTurnStatus: 'inProgress' as const,
      lastTurnStartedAt: now + offset
    })
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([hostTask(firstKey, now, {
      actionAlias: `alias-${firstKey}`,
      displayName: '原任务',
      projectKey: 'chats',
      projectName: 'Chats'
    })], now))
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async (options: Record<string, boolean>) => {
          if (!options.includeThreads) return { ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now } }
          inventoryReads += 1
          return {
            ok: true as const,
            receivedAt: now + inventoryReads,
            value: {
              version: 2 as const,
              receivedAt: now + inventoryReads,
              threads: includeNew ? [row(firstKey, 1), row(newKey, 2)] : [row(firstKey, 1)],
              projects: [],
              sourceFingerprint: 'e'.repeat(64),
              completeness: 'verified' as const
            }
          }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })
    controller.start()
    await vi.waitFor(() => expect(controller.view().taskState.conversations.all.map((task) => task.key)).toEqual([firstKey]))

    includeNew = true
    companionKernel.publishEvidence(hostDraft([
      hostTask(firstKey, now, {
        actionAlias: `alias-${firstKey}`,
        displayName: '原任务',
        projectKey: 'chats',
        projectName: 'Chats'
      }),
      hostTask(newKey, now + 2, {
        actionAlias: `alias-${newKey}`,
        displayName: '新任务',
        projectKey: 'chats',
        projectName: 'Chats',
        displayOrder: 1,
        cycleOrder: 1,
        attentionOrder: 1
      })
    ], now + 10, 2))

    await vi.waitFor(() => expect(controller.view().taskState.conversations.all.map((task) => task.key).sort()).toEqual([firstKey, newKey].sort()))
    await vi.waitFor(() => expect(inventoryReads).toBeGreaterThanOrEqual(2))
    controller.dispose()
  })

  it('schedules quota reads while keeping full inventory off the normal periodic path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      state.codex.settings.quotaRefreshSeconds = 2
      const sourceFingerprint = 'e'.repeat(64)
      let quotaReads = 0
      let taskReads = 0
      const platform = {
        codex: {
          readSnapshot: async (options: Record<string, boolean>) => {
            if (options.includeQuota) quotaReads += 1
            if (options.includeThreads) taskReads += 1
            return options.includeThreads
              ? {
                  ok: true as const,
                  receivedAt: Date.now(),
                  value: {
                    version: 2 as const,
                    receivedAt: Date.now(),
                    threads: [],
                    projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                    sourceFingerprint,
                    completeness: 'verified' as const
                  }
                }
              : {
                  ok: true as const,
                  receivedAt: Date.now(),
                  value: {
                    version: 2 as const,
                    receivedAt: Date.now(),
                    quota: { plan: 'pro', short: { remainingPercent: 80, resetAt: 20_000, windowMinutes: 300 } }
                  }
                }
          },
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect({ quotaReads, taskReads }).toEqual({ quotaReads: 1, taskReads: 1 })

      await vi.advanceTimersByTimeAsync(1_999)
      expect({ quotaReads, taskReads }).toEqual({ quotaReads: 1, taskReads: 1 })
      await vi.advanceTimersByTimeAsync(1)
      expect({ quotaReads, taskReads }).toEqual({ quotaReads: 2, taskReads: 1 })
      await vi.advanceTimersByTimeAsync(1_000)
      expect({ quotaReads, taskReads }).toEqual({ quotaReads: 2, taskReads: 1 })
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves Claude task observation to Host/Kernel while keeping quota independent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(20_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      state.codex.settings.providers = { codex: true, claude: true, cursor: false }
      const sourceFingerprint = 'f'.repeat(64)
      let codexTaskReads = 0
      const onActivityChanged = vi.fn(() => () => undefined)
      const claudeReads = { environment: 0, inventory: 0, unread: 0, quota: 0 }
      const platform = {
        codex: {
          readSnapshot: async (input: Record<string, boolean>) => {
            if (input.includeThreads) codexTaskReads += 1
            return input.includeThreads
              ? {
                  ok: true as const,
                  receivedAt: Date.now(),
                  value: {
                    version: 2 as const,
                    receivedAt: Date.now(),
                    threads: [],
                    projects: [],
                    sourceFingerprint,
                    completeness: 'verified' as const,
                    activityGeneration: 1
                  }
                }
              : { ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now() } }
          },
          onActivityChanged,
          close: () => undefined
        },
        claude: {
          inspect: async () => { claudeReads.environment += 1; return { version: 1 as const, installed: true, homeReady: true, authenticated: true, cliVersion: '', hooks: 'unknown' as const, statusline: 'unknown' as const, checkedAt: Date.now() } },
          readCodeSnapshot: async () => { claudeReads.inventory += 1; return { version: 2 as const, revision: 'test', sessions: [], available: true, truncated: false, readAt: Date.now(), generation: 1 } },
          readCodeUnread: async () => { claudeReads.unread += 1; return { version: 2 as const, revision: 'test', ids: [], readAt: Date.now(), generation: 1, sourceFingerprint: 'a'.repeat(64) } },
          readSnapshot: async () => { claudeReads.quota += 1; return { version: 1 as const, revision: 'test', sessions: [], truncated: false, quota: null, readAt: Date.now() } },
          diagnostics: () => ({ revision: 'test', loaded: true, loadError: '' }),
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      await Promise.resolve()
      expect(codexTaskReads).toBe(1)
      expect(claudeReads).toEqual({ environment: 0, inventory: 0, unread: 0, quota: 1 })
      expect(onActivityChanged).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(201)
      await Promise.resolve()

      expect(codexTaskReads).toBe(1)
      expect(claudeReads).toEqual({ environment: 0, inventory: 0, unread: 0, quota: 1 })
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed instead of resurrecting legacy task state when the Kernel is unavailable', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const now = Date.now()
    const reads: Array<Record<string, boolean>> = []
    const messages: string[] = []
    const platform = {
      codex: {
        taskStateRevision: 'task-state-v5',
        readSnapshot: async (options: Record<string, boolean>) => {
          reads.push(options)
          return {
            ok: true as const,
            receivedAt: now,
            value: {
              version: 2 as const,
              receivedAt: now,
              ...(options.includeQuota ? {
                quota: { plan: 'pro', short: { remainingPercent: 80, resetAt: 1_000, windowMinutes: 300 } }
              } : {
                threads: [{
                  key: '1111111111111111',
                  actionAlias: 'legacy-active',
                  name: '保留中的旧桥任务',
                  status: 'active' as const,
                  activeFlags: [],
                  statusAuthority: 'connector' as const,
                  updatedAt: now - 1_000,
                  lastTurnStatus: 'inProgress' as const,
                  lastTurnStartedAt: now - 1_000
                }],
                projects: [],
                sourceFingerprint: '1'.repeat(64),
                completeness: 'verified' as const
              })
            }
          }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: (message) => messages.push(message)
    })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(reads).toEqual([
      { includeQuota: true, includeConfig: true, includeThreads: false },
      { includeQuota: false, includeConfig: false, includeThreads: true }
    ])
    expect(controller.view().taskSnapshot.complete).toBe(false)
    expect(controller.view().taskState.conversations.all).toEqual([])
    expect(controller.floatSnapshot().taskSnapshot?.complete).toBe(false)
    expect(controller.floatSnapshot().taskInventory?.conversations.ongoing).toHaveLength(1)
    expect(messages).toEqual(['Codex 任务状态桥版本较旧，状态已保留；建议在 uTools 中重新加载 EyPc 插件'])
    controller.dispose()
  })

  it('inspects readiness and keeps the task inventory hot even while the Codex page is inactive', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    let inspectionCount = 0
    const readOptions: Array<Record<string, boolean>> = []
    let closeCount = 0
    const platform = {
      codex: {
        inspectEnvironment: async () => {
          inspectionCount += 1
          return { version: 1 as const, checking: false, platform: 'windows' as const, runtimeState: 'detected' as const, runtimeSource: 'npm-global' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt: 100 }
        },
        readSnapshot: async (options: Record<string, boolean>) => {
          readOptions.push(options)
          return { ok: true as const, receivedAt: 200, value: { version: 1 as const, receivedAt: 200, config: { model: 'gpt-5.6', reasoningEffort: 'high', serviceTier: 'default' } } }
        },
        close: () => { closeCount += 1 }
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(inspectionCount).toBe(1)
    expect(readOptions).toEqual([
      { includeQuota: false, includeConfig: false, includeThreads: true }
    ])
    expect(controller.view().environment).toMatchObject({ platform: 'windows', runtimeState: 'detected', connectionState: 'connected' })

    state.activeTab = 'codex'
    controller.syncActivation(true)
    await controller.refresh()
    expect(inspectionCount).toBe(2)
    expect(readOptions).toEqual([
      { includeQuota: false, includeConfig: false, includeThreads: true },
      { includeQuota: true, includeConfig: true, includeThreads: false },
      { includeQuota: false, includeConfig: false, includeThreads: true }
    ])
    expect(controller.view().environment).toMatchObject({ configState: 'loaded', connectionState: 'connected', processState: 'not-running' })
    controller.dispose()
    expect(closeCount).toBe(0)
  })

  it('keeps explicit readiness diagnostics while a successful App Server read loads data', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const platform = {
      codex: {
        inspectEnvironment: async () => ({
          version: 1 as const,
          checking: false,
          platform: 'macos' as const,
          runtimeState: 'missing' as const,
          runtimeSource: 'unknown' as const,
          processState: 'unknown' as const,
          configState: 'unknown' as const,
          connectionState: 'not-checked' as const,
          desktopBridgeState: 'not-checked' as const,
          checkedAt: 100
        }),
        readSnapshot: async () => ({
          ok: true as const,
          receivedAt: 200,
          value: {
            version: 1 as const,
            receivedAt: 200,
            config: { model: 'gpt-5.6', reasoningEffort: 'high', serviceTier: 'default' }
          }
        }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await controller.refresh()

    expect(controller.view().environment).toMatchObject({
      platform: 'macos',
      runtimeState: 'missing',
      processState: 'unknown',
      configState: 'loaded',
      connectionState: 'connected'
    })
    expect(controller.view().environment).not.toHaveProperty('errorCode')
    controller.dispose()
  })

  it('keeps quota and inventory projections independent when one snapshot lane fails', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    let failedLane: 'quota' | 'threads' = 'quota'
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const quotaLane = options.includeQuota === true
          if ((quotaLane && failedLane === 'quota') || (!quotaLane && failedLane === 'threads')) {
            return { ok: false as const, receivedAt: 200, error: { code: 'timeout' as const, message: 'lane timeout' } }
          }
          if (quotaLane) {
            return {
              ok: true as const,
              receivedAt: 300,
              value: {
                version: 1 as const,
                receivedAt: 300,
                quota: { plan: 'pro', short: { remainingPercent: 75, resetAt: 1000, windowMinutes: 300 } },
                config: { model: 'gpt-5.6', reasoningEffort: 'high', serviceTier: 'priority' }
              }
            }
          }
          return {
            ok: true as const,
            receivedAt: 300,
            value: {
              version: 1 as const,
              receivedAt: 300,
              threads: [{ key: '1111111111111111', actionAlias: 'task-alias', name: '独立任务读取', status: 'active' as const, activeFlags: [], statusAuthority: 'connector' as const, updatedAt: 250, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: 240 }]
            }
          }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await controller.refresh()
    expect(controller.view().quota.status).toBe('error')
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', ongoingCount: 1, runningCount: 0, unknownCount: 0 })

    failedLane = 'threads'
    await controller.refresh()
    expect(controller.view().quota).toMatchObject({ status: 'ok', plan: 'pro' })
    expect(controller.view().config.model).toBe('gpt-5.6')
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'stale', ongoingCount: 1, runningCount: 0, unknownCount: 0 })
    controller.dispose()
  })

  it('preserves the previous verified inventory when a later Host V2 preflight is incomplete', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    let verified = true
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
          ? {
              ok: true as const,
              receivedAt: verified ? 200 : 300,
              value: verified
                ? {
                    version: 2 as const,
                    receivedAt: 200,
                    threads: [{ key: '1111111111111111', actionAlias: 'alias', name: '已验证任务', status: 'notLoaded' as const, activeFlags: [], updatedAt: 180, lastTurnStatus: 'failed' as const, lastTurnStartedAt: 170, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }],
                    projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                    sourceFingerprint: 'a'.repeat(64),
                    completeness: 'verified' as const
                  }
                : { version: 2 as const, receivedAt: 300, threads: [], projects: [] }
            }
          : { ok: true as const, receivedAt: 200, value: { version: 2 as const, receivedAt: 200 } },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const messages: string[] = []
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: (message) => messages.push(message) })

    await controller.refresh()
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', completeness: 'verified', sourceCount: 1 })
    verified = false
    await controller.refresh()
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'stale', completeness: 'verified', sourceCount: 1 })
    expect(controller.view().taskInventory.conversations.all[0].name).toBe('已验证任务')
    expect(messages.at(-1)).toContain('保留上一份已验证快照')
    controller.dispose()
  })

  it('holds a lower verified inventory until the same disappearance survives one full reconciliation interval', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      const taskKey = '1111111111111111'
      const sourceFingerprint = 'd'.repeat(64)
      let includeTask = true
      const messages: string[] = []
      const platform = {
        codex: {
          readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
            ? {
                ok: true as const,
                receivedAt: Date.now(),
                value: {
                  version: 2 as const,
                  receivedAt: Date.now(),
                  threads: includeTask
                    ? [{ key: taskKey, actionAlias: 'stable-alias', name: '稳定任务', status: 'notLoaded' as const, activeFlags: [], updatedAt: 9_900, lastTurnStatus: 'failed' as const, lastTurnStartedAt: 9_800, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }]
                    : [],
                  projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                  sourceFingerprint,
                  completeness: 'verified' as const
                }
              }
            : { ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now() } },
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: (message) => messages.push(message) })

      await controller.refresh()
      expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', ongoingCount: 1, sourceCount: 1 })

      includeTask = false
      vi.setSystemTime(10_100)
      await controller.refresh()
      expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'stale', ongoingCount: 1, sourceCount: 1 })
      expect(controller.view().taskInventory.conversations.all[0]).toMatchObject({ key: taskKey, name: '稳定任务' })
      expect(messages.at(-1)).toContain('已保留上一份稳定清单')

      vi.setSystemTime(10_500)
      await controller.refresh()
      expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'stale', ongoingCount: 1, sourceCount: 1 })

      vi.setSystemTime(25_100)
      await controller.refresh()
      expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', ongoingCount: 0, sourceCount: 0 })
      expect(controller.view().taskInventory.conversations.all).toEqual([])
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('automatically closes a confirmed missing-key quarantine when periodic task refresh is disabled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      const taskKey = '1111111111111111'
      const sourceFingerprint = '9'.repeat(64)
      let includeTask = true
      let taskReads = 0
      const platform = {
        codex: {
          readSnapshot: async (options: Record<string, boolean>) => {
            if (!options.includeThreads) {
              return { ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now() } }
            }
            taskReads += 1
            return {
              ok: true as const,
              receivedAt: Date.now(),
              value: {
                version: 2 as const,
                receivedAt: Date.now(),
                threads: includeTask
                  ? [{ key: taskKey, actionAlias: 'no-poll-alias', name: '无周期刷新任务', status: 'active' as const, activeFlags: [], statusAuthority: 'connector' as const, updatedAt: 9_900, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: 9_800, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }]
                  : [],
                projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                sourceFingerprint,
                completeness: 'verified' as const
              }
            }
          },
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.view().taskInventory.conversations.all.map((task) => task.key)).toEqual([taskKey])

      includeTask = false
      await controller.refresh()
      expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'stale', sourceCount: 1 })
      await vi.advanceTimersByTimeAsync(200)
      expect(taskReads).toBe(3)
      expect(controller.view().taskInventory.conversations.all.map((task) => task.key)).toEqual([taskKey])

      await vi.advanceTimersByTimeAsync(2_799)
      expect(controller.view().taskInventory.conversations.all.map((task) => task.key)).toEqual([taskKey])
      await vi.advanceTimersByTimeAsync(1)
      expect(taskReads).toBe(4)
      expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', sourceCount: 0 })
      expect(controller.view().taskInventory.conversations.all).toEqual([])
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies present task updates while quarantining only the missing inventory rows', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'f'.repeat(64)
    const updatedKey = '11111111111111aa'
    const missingKey = '22222222222222bb'
    let secondSnapshot = false
    const makeThread = (key: string, name: string): CodexHostThread => ({
      key,
      actionAlias: `${key}-alias`,
      name,
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'desktop-live',
      updatedAt: 900,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 800,
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    })
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = secondSnapshot ? 1_100 : 1_000
          const updated = makeThread(updatedKey, '应即时更新')
          if (secondSnapshot) {
            updated.updatedAt = 1_090
            updated.lastTurnStatus = 'completed'
            updated.lastTurnCompletedAt = 1_080
            updated.hasUnreadTurn = true
            updated.unreadAuthority = 'desktop-persisted'
          }
          return options.includeThreads
            ? {
                ok: true as const,
                receivedAt,
                value: {
                  version: 2 as const,
                  receivedAt,
                  activityGeneration: secondSnapshot ? 2 : 1,
                  threads: secondSnapshot ? [updated] : [updated, makeThread(missingKey, '只隔离缺行')],
                  projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                  sourceFingerprint,
                  completeness: 'verified' as const
                }
              }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await controller.refresh()
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', ongoingCount: 2, sourceCount: 2 })

    secondSnapshot = true
    await controller.refresh()
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'stale', ongoingCount: 1, completedUnreadCount: 1, sourceCount: 2 })
    expect(controller.view().taskInventory.conversations.completedUnread[0]).toMatchObject({ key: updatedKey, bucket: 'completed-unread' })
    expect(controller.view().taskInventory.conversations.ongoing[0]).toMatchObject({ key: missingKey })
    controller.dispose()
  })

  it('keeps latest-Turn evidence monotonic across transient status regressions', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const taskKey = '2222222222222222'
    const sourceFingerprint = 'e'.repeat(64)
    let turn: { status: 'completed' | 'failed'; startedAt: number; completedAt: number } = { status: 'completed', startedAt: 200, completedAt: 250 }
    let receivedAt = 300
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
          ? {
              ok: true as const,
              receivedAt,
              value: {
                version: 2 as const,
                receivedAt,
                threads: [{
                  key: taskKey,
                  actionAlias: 'monotonic-alias',
                  name: '单调状态任务',
                  status: 'notLoaded' as const,
                  activeFlags: [],
                  updatedAt: receivedAt - 10,
                  lastTurnStatus: turn.status,
                  lastTurnStartedAt: turn.startedAt,
                  ...(turn.status === 'completed' ? { lastTurnCompletedAt: turn.completedAt } : {}),
                  projectKey: 'chats',
                  projectName: 'Chats',
                  projectKind: 'chats' as const
                }],
                projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                sourceFingerprint,
                completeness: 'verified' as const
              }
            }
          : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await controller.refresh()
    expect(controller.view().taskInventory.conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 250, archiveCapability: 'allowed' })

    turn = { status: 'failed', startedAt: 200, completedAt: 0 }
    receivedAt = 400
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 250, archiveCapability: 'allowed' })
    expect(controller.view().taskInventory.conversations.ongoing).toEqual([])

    turn = { status: 'failed', startedAt: 350, completedAt: 0 }
    receivedAt = 500
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing', archiveCapability: 'blocked-active' })
    expect(controller.view().taskInventory.conversations.completed).toEqual([])
    controller.dispose()
  })

  it('keeps project hiding local, then clears project metadata only after verified native removal', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const projectKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const taskKey = '1111111111111111'
    let projectsPresent = true
    let receivedAt = 200
    const removeProject = vi.fn(async (actionAlias: string, request: { expectedSourceFingerprint: string }) => {
      expect(actionAlias).toBe('project-alias')
      expect(request.expectedSourceFingerprint).toBe('a'.repeat(64))
      projectsPresent = false
      receivedAt += 100
      return { status: 'verified' as const, message: 'Codex 项目已移出侧栏' }
    })
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
          ? {
              ok: true as const,
              receivedAt,
              value: {
                version: 2 as const,
                receivedAt,
                threads: projectsPresent ? [{ key: taskKey, actionAlias: 'alias', name: '原始任务', status: 'notLoaded' as const, activeFlags: [], updatedAt: 180, lastTurnStatus: 'failed' as const, lastTurnStartedAt: 170, projectKey, projectName: '原始项目', projectKind: 'project' as const }] : [],
                projects: projectsPresent ? [{ key: projectKey, actionAlias: 'project-alias', name: '原始项目', kind: 'project' as const, nativePinned: false, nativeOrder: 0 }, { key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }] : [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                sourceFingerprint: (projectsPresent ? 'a' : 'b').repeat(64),
                completeness: 'verified' as const
              }
            }
          : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } },
        removeProject,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })
    await controller.refresh()

    expect(controller.setTaskTab('projects')).toBe(true)
    expect(controller.setProjectCollapsed(projectKey, true)).toBe(true)
    expect(controller.setAlias('project', projectKey, '项目别名')).toBe(true)
    expect(controller.toggleLocalPin('project', projectKey)).toBe(true)
    expect(controller.hideProject(projectKey)).toBe(true)
    expect(state.codex).toMatchObject({ lastTaskTab: 'projects', collapsedProjectKeys: [projectKey], taskAliases: [], projectAliases: [{ key: projectKey, alias: '项目别名' }], localPins: [{ kind: 'project', key: projectKey }], hiddenProjectKeys: [projectKey] })
    expect(controller.view().taskInventory.conversations.activeTab).toBe('projects')
    expect(controller.view().taskInventory.conversations.hiddenProjects[0]).toMatchObject({ key: projectKey, name: '项目别名' })
    expect(controller.view().taskInventory.conversations.all).toEqual([expect.objectContaining({ key: taskKey })])

    await expect(controller.removeProject(projectKey, 'project-alias', 'a'.repeat(64))).resolves.toBe(true)
    expect(removeProject).toHaveBeenCalledTimes(1)
    expect(state.codex).toMatchObject({
      lastTaskTab: 'projects',
      collapsedProjectKeys: [],
      taskAliases: [],
      projectAliases: [],
      localPins: [],
      hiddenProjectKeys: []
    })
    expect(controller.view().taskInventory.conversations.projects.some((project) => project.key === projectKey)).toBe(false)
    controller.dispose()
  })

  it('does not clear local project metadata when the host blocks removal because Codex is running', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const projectKey = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const fingerprint = 'c'.repeat(64)
    state.codex.projectAliases = [{ key: projectKey, alias: '保留别名' }]
    state.codex.hiddenProjectKeys = [projectKey]
    const messages: string[] = []
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
          ? { ok: true as const, receivedAt: 200, value: { version: 2 as const, receivedAt: 200, threads: [], projects: [{ key: projectKey, actionAlias: 'project-alias', name: '原始项目', kind: 'project' as const, nativePinned: false }], sourceFingerprint: fingerprint, completeness: 'verified' as const } }
          : { ok: true as const, receivedAt: 200, value: { version: 2 as const, receivedAt: 200 } },
        removeProject: async () => ({ status: 'codex-running' as const, message: '请先退出 Codex' }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: (message) => messages.push(message) })
    await controller.refresh()

    await expect(controller.removeProject(projectKey, 'project-alias', fingerprint)).resolves.toBe(false)
    expect(state.codex.projectAliases).toEqual([{ key: projectKey, alias: '保留别名' }])
    expect(state.codex.hiddenProjectKeys).toEqual([projectKey])
    expect(messages.at(-1)).toContain('退出 Codex')
    controller.dispose()
  })

  it('rejects an old snapshot across disable and re-enable, then refreshes from a new generation', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    let releaseFirst: (value: { ok: true; receivedAt: number; value: { version: 1; receivedAt: number; config: { model: string; reasoningEffort: string; serviceTier: string } } }) => void = () => undefined
    const firstRead = new Promise<Parameters<typeof releaseFirst>[0]>((resolve) => { releaseFirst = resolve })
    let quotaReadCount = 0
    let threadReadCount = 0
    const platform = {
      codex: {
        inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt: 100 }),
        readSnapshot: async (options: Record<string, boolean>) => {
          if (options.includeQuota) {
            quotaReadCount += 1
            if (quotaReadCount === 1) return await firstRead
            return { ok: true as const, receivedAt: 300, value: { version: 1 as const, receivedAt: 300, config: { model: 'new-generation', reasoningEffort: 'high', serviceTier: 'default' } } }
          }
          threadReadCount += 1
          const receivedAt = threadReadCount === 1 ? 200 : 300
          return { ok: true as const, receivedAt, value: { version: 1 as const, receivedAt, threads: [] } }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect({ quotaReadCount, threadReadCount }).toEqual({ quotaReadCount: 1, threadReadCount: 1 })

    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: false } : item)
    controller.syncActivation()
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: true } : item)
    controller.syncActivation()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect({ quotaReadCount, threadReadCount }).toEqual({ quotaReadCount: 2, threadReadCount: 2 })
    releaseFirst({ ok: true, receivedAt: 200, value: { version: 1, receivedAt: 200, config: { model: 'old-generation', reasoningEffort: 'low', serviceTier: 'default' } } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect({ quotaReadCount, threadReadCount }).toEqual({ quotaReadCount: 2, threadReadCount: 2 })
    expect(controller.view().config.model).toBe('new-generation')
    expect(controller.view().environment.connectionState).toBe('connected')
    expect(controller.view().environment.checkedAt).toBeGreaterThan(0)
    controller.dispose()
  })

  it('rejects an old inventory snapshot across inbox disable and re-enable', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const initialKey = '1111111111111111'
    const staleKey = '2222222222222222'
    const freshKey = '3333333333333333'
    const thread = (key: string, name: string, updatedAt: number): CodexHostThread => ({
      key,
      actionAlias: `${key}-alias`,
      name,
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'connector',
      updatedAt,
      lastTurnStatus: 'completed',
      lastTurnStartedAt: updatedAt - 20,
      lastTurnCompletedAt: updatedAt - 10,
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    })
    const hostResult = (key: string, name: string, generation: number) => ({
      ok: true as const,
      receivedAt: 1_000 + generation,
      value: {
        version: 2 as const,
        receivedAt: 1_000 + generation,
        activityGeneration: generation,
        threads: [thread(key, name, 1_000 + generation)],
        projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
        sourceFingerprint: generation.toString(16).repeat(64),
        completeness: 'verified' as const
      }
    })
    let releaseStale: (value: ReturnType<typeof hostResult>) => void = () => undefined
    const staleRead = new Promise<ReturnType<typeof hostResult>>((resolve) => { releaseStale = resolve })
    let taskReads = 0
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          if (options.includeQuota) {
            return { ok: true as const, receivedAt: Date.now(), value: { version: 1 as const, receivedAt: Date.now(), config: { model: 'gpt-5.6', reasoningEffort: 'high', serviceTier: 'priority' } } }
          }
          taskReads += 1
          if (taskReads === 1) return hostResult(initialKey, '初始任务', 1)
          if (taskReads === 2) return await staleRead
          return hostResult(freshKey, '重新启用后的任务', 3)
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.all.map((task) => task.key)).toEqual([initialKey])

    const obsoleteRefresh = controller.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(taskReads).toBe(2)
    controller.updateSettings({ conversationInboxEnabled: false })
    expect(controller.view().taskInventory.conversations.all).toEqual([])
    controller.updateSettings({ conversationInboxEnabled: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(taskReads).toBe(3)

    releaseStale(hostResult(staleKey, '过期任务', 2))
    await obsoleteRefresh
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().taskInventory.conversations.all.map((task) => task.key)).toEqual([freshKey])
    controller.dispose()
  })

  it('does not spin task refresh or Activity polling while the task inbox is disabled', async () => {
    vi.useFakeTimers()
    try {
      const state = createInitialState(1)
      state.activeTab = 'ports'
      state.codex.settings.floatEnabled = false
      state.codex.settings.conversationInboxEnabled = false
      const readSnapshot = vi.fn()
      const readActivitySnapshot = vi.fn()
      const platform = {
        codex: {
          readSnapshot,
          readActivitySnapshot,
          onActivityChanged: () => () => undefined,
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(readSnapshot).not.toHaveBeenCalled()
      expect(readActivitySnapshot).not.toHaveBeenCalled()
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rebuilds inventory and projects from scratch after changes made while the feature is disabled', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const archivedKey = '1111111111111111'
    const deletedKey = '2222222222222222'
    const addedKey = '3333333333333333'
    const retainedKey = '4444444444444444'
    const oldProjectKey = 'c'.repeat(32)
    const newProjectKey = 'd'.repeat(32)
    let reopened = false
    let quotaReads = 0
    let taskReads = 0
    let closeCount = 0
    const baselineNow = Date.now()
    const makeThread = (key: string, projectKey: string, name: string): CodexHostThread => ({
      key,
      actionAlias: `${key}-alias`,
      name,
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'connector',
      updatedAt: baselineNow + (reopened ? 100 : 0),
      lastTurnStatus: 'completed',
      lastTurnStartedAt: baselineNow + (reopened ? 50 : -100),
      lastTurnCompletedAt: baselineNow + (reopened ? 75 : -50),
      projectKey,
      projectName: projectKey === oldProjectKey ? '旧项目' : projectKey === newProjectKey ? '新项目' : 'Chats',
      projectKind: projectKey === 'chats' ? 'chats' : 'project'
    })
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          if (options.includeQuota) {
            quotaReads += 1
            return { ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now(), config: { model: reopened ? 'reopened-model' : 'baseline-model', reasoningEffort: 'high', serviceTier: 'default' } } }
          }
          taskReads += 1
          const threads = reopened
            ? [
                makeThread(addedKey, 'chats', '关闭期间新增'),
                makeThread(retainedKey, newProjectKey, '关闭期间改归属')
              ]
            : [
                makeThread(archivedKey, oldProjectKey, '关闭期间归档'),
                makeThread(deletedKey, 'chats', '关闭期间删除'),
                makeThread(retainedKey, oldProjectKey, '关闭期间改归属')
              ]
          return {
            ok: true as const,
            receivedAt: Date.now(),
            value: {
              version: 2 as const,
              receivedAt: Date.now(),
              activityGeneration: reopened ? 2 : 1,
              threads,
              projects: reopened
                ? [
                    { key: newProjectKey, actionAlias: 'new-project-alias', name: '新项目', kind: 'project' as const, nativePinned: true, nativePinnedOrder: 0 },
                    { key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }
                  ]
                : [
                    { key: oldProjectKey, actionAlias: 'old-project-alias', name: '旧项目', kind: 'project' as const, nativePinned: true },
                    { key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }
                  ],
              sourceFingerprint: (reopened ? 'b' : 'a').repeat(64),
              completeness: 'verified' as const
            }
          }
        },
        close: () => { closeCount += 1 }
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.all.map((task) => task.key).sort()).toEqual([archivedKey, deletedKey, retainedKey])
    expect(controller.view().taskInventory.conversations.projects.some((project) => project.key === oldProjectKey)).toBe(true)

    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: false } : item)
    controller.syncActivation()
    expect(controller.view().taskInventory.conversations.all).toEqual([])
    reopened = true
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: true } : item)
    controller.syncActivation()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect({ quotaReads, taskReads }).toEqual({ quotaReads: 2, taskReads: 2 })
    expect(closeCount).toBeGreaterThan(0)
    expect(controller.view().config.model).toBe('reopened-model')
    expect(controller.view().taskInventory.conversations).toMatchObject({ status: 'ok', sourceCount: 2, completeness: 'verified' })
    expect(controller.view().taskInventory.conversations.all.map((task) => task.key).sort()).toEqual([addedKey, retainedKey])
    expect(controller.view().taskInventory.conversations.all.find((task) => task.key === retainedKey)).toMatchObject({
      projectKey: newProjectKey,
      projectName: '新项目'
    })
    expect(controller.view().taskInventory.conversations.projects.some((project) => project.key === oldProjectKey)).toBe(false)
    expect(controller.view().taskInventory.conversations.projects.find((project) => project.key === newProjectKey)).toMatchObject({
      nativePinned: true,
      nativePinnedOrder: 0
    })
    controller.dispose()
  })

  it('does not publish or notify when a snapshot read completes after disposal', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    type ReadResult = { ok: true; receivedAt: number; value: { version: 1; receivedAt: number; config: { model: string; reasoningEffort: string; serviceTier: string } } }
    let releaseRead: (value: ReadResult) => void = () => undefined
    const pendingRead = new Promise<ReadResult>((resolve) => { releaseRead = resolve })
    let notifyCount = 0
    const readOptions: Array<Record<string, boolean>> = []
    const platform = {
      codex: {
        inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt: 100 }),
        readSnapshot: async (options: Record<string, boolean>) => {
          readOptions.push(options)
          return await pendingRead
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => { notifyCount += 1 }, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(readOptions).toEqual([
      { includeQuota: true, includeConfig: true, includeThreads: false },
      { includeQuota: false, includeConfig: false, includeThreads: true }
    ])
    controller.dispose()
    const beforeRelease = notifyCount
    releaseRead({ ok: true, receivedAt: 200, value: { version: 1, receivedAt: 200, config: { model: 'must-not-publish', reasoningEffort: 'high', serviceTier: 'default' } } })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(controller.view().config.model).toBe('')
    expect(controller.view().environment.connectionState).toBe('not-checked')
    expect(notifyCount).toBe(beforeRelease)
  })

  it('defers the first readiness inspection until a disabled Codex feature is enabled', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: false } : item)
    let inspectionCount = 0
    const platform = {
      codex: {
        inspectEnvironment: async () => {
          inspectionCount += 1
          return { version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt: 100 }
        },
        readSnapshot: async () => ({ ok: true as const, receivedAt: 100, value: { version: 2 as const, receivedAt: 100, threads: [], projects: [], sourceFingerprint: '0'.repeat(64), completeness: 'verified' as const } }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(inspectionCount).toBe(0)

    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: true } : item)
    controller.syncActivation()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(inspectionCount).toBe(1)
    controller.dispose()
  })

  it('drops an obsolete readiness result across disable/re-enable and accepts a fresh inspection', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    const safeResult = (checkedAt: number) => ({ version: 1 as const, checking: false, platform: 'windows' as const, runtimeState: 'detected' as const, runtimeSource: checkedAt === 200 ? 'volta' as const : 'npm-global' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt })
    let releaseFirst: (value: ReturnType<typeof safeResult>) => void = () => undefined
    let inspectionCount = 0
    const first = new Promise<ReturnType<typeof safeResult>>((resolve) => { releaseFirst = resolve })
    const platform = {
      codex: {
        inspectEnvironment: async () => {
          inspectionCount += 1
          if (inspectionCount === 1) return await first as ReturnType<typeof safeResult>
          return safeResult(200)
        },
        readSnapshot: async () => ({ ok: true as const, receivedAt: 200, value: { version: 2 as const, receivedAt: 200, threads: [], projects: [], sourceFingerprint: '1'.repeat(64), completeness: 'verified' as const } }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await Promise.resolve()
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: false } : item)
    controller.syncActivation()
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: true } : item)
    controller.syncActivation()
    releaseFirst(safeResult(100))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(inspectionCount).toBe(2)
    expect(controller.view().environment).toMatchObject({ platform: 'windows', runtimeSource: 'volta' })
    expect(controller.view().environment.checkedAt).toBeGreaterThanOrEqual(200)
    controller.dispose()
  })

  it('does not publish a readiness result after disposal', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    type ReadyResult = { version: 1; checking: false; platform: 'macos'; runtimeState: 'detected'; runtimeSource: 'homebrew'; processState: 'not-running'; configState: 'detected'; connectionState: 'not-checked'; desktopBridgeState: 'not-checked'; checkedAt: number }
    let release: (value: ReadyResult) => void = () => undefined
    const pending = new Promise<ReadyResult>((resolve) => { release = resolve })
    let notifyCount = 0
    const platform = {
      codex: {
        inspectEnvironment: async () => await pending,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => { notifyCount += 1 }, setMessage: () => undefined })

    controller.start()
    await Promise.resolve()
    controller.dispose()
    const beforeRelease = notifyCount
    release({ version: 1, checking: false, platform: 'macos', runtimeState: 'detected', runtimeSource: 'homebrew', processState: 'not-running', configState: 'detected', connectionState: 'not-checked', desktopBridgeState: 'not-checked', checkedAt: 300 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(controller.view().environment.checkedAt).toBe(0)
    expect(controller.view().environment.checking).toBe(false)
    expect(notifyCount).toBe(beforeRelease)
  })

  it('publishes launch-path mutations directly without a redundant environment inspection', async () => {
    const state = createInitialState(1)
    const inspectEnvironment = vi.fn(async () => ({
      version: 1 as const,
      checking: false,
      platform: 'macos' as const,
      runtimeState: 'detected' as const,
      runtimeSource: 'path' as const,
      processState: 'not-running' as const,
      configState: 'detected' as const,
      connectionState: 'not-checked' as const,
      desktopBridgeState: 'not-checked' as const,
      launchMode: 'automatic' as const,
      manualLaunchPathState: 'not-configured' as const,
      checkedAt: 300
    }))
    const setLaunchPath = vi.fn(async () => ({
      version: 1 as const,
      checking: false,
      platform: 'macos' as const,
      runtimeState: 'detected' as const,
      runtimeSource: 'manual' as const,
      processState: 'not-running' as const,
      configState: 'detected' as const,
      connectionState: 'not-checked' as const,
      desktopBridgeState: 'not-checked' as const,
      launchMode: 'manual' as const,
      manualLaunchPathState: 'valid' as const,
      checkedAt: 100
    }))
    const clearLaunchPath = vi.fn(async () => ({
      version: 1 as const,
      checking: false,
      platform: 'macos' as const,
      runtimeState: 'detected' as const,
      runtimeSource: 'homebrew' as const,
      processState: 'not-running' as const,
      configState: 'detected' as const,
      connectionState: 'not-checked' as const,
      desktopBridgeState: 'not-checked' as const,
      launchMode: 'automatic' as const,
      manualLaunchPathState: 'not-configured' as const,
      checkedAt: 200
    }))
    const notify = vi.fn()
    const controller = createCodexController({
      platform: { codex: { inspectEnvironment, setLaunchPath, clearLaunchPath, close: () => undefined } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save: () => undefined,
      notify,
      setMessage: () => undefined
    })

    await expect(controller.setLaunchPath('  /opt/codex/bin/codex  ')).resolves.toBe(true)
    expect(setLaunchPath).toHaveBeenCalledOnce()
    expect(setLaunchPath).toHaveBeenCalledWith('/opt/codex/bin/codex')
    expect(controller.view().environment).toMatchObject({ runtimeSource: 'manual', launchMode: 'manual', checkedAt: 100 })

    await expect(controller.clearLaunchPath()).resolves.toBe(true)
    expect(clearLaunchPath).toHaveBeenCalledOnce()
    expect(controller.view().environment).toMatchObject({ runtimeSource: 'homebrew', launchMode: 'automatic', checkedAt: 200 })
    expect(inspectEnvironment).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(2)
    controller.dispose()
  })

  it('persists direct color strings without a contrast gate', () => {
    const state = createInitialState(1)
    const save = vi.fn()
    const original = structuredClone(state.codex.settings.colors)
    const controller = createCodexController({
      platform: { codex: { close: () => undefined } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save,
      notify: () => undefined,
      setMessage: () => undefined
    })

    expect(controller.updateSettings({ colors: { ...original, water: '#FFFFFF', card: '#20252A', cardForeground: 'broken' } })).toBe(true)
    expect(state.codex.settings.colors).toMatchObject({ water: '#FFFFFF', card: '#20252A', cardForeground: 'broken' })
    expect(save).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('publishes only persisted appearance without a transient card-color override', () => {
    const state = createInitialState(1)
    state.codex.settings.displayStyle = 'water'
    const colors = { ...state.codex.settings.colors, card: '#20252A', cardForeground: 'direct-token' }
    const save = vi.fn()
    const controller = createCodexController({
      platform: { codex: { close: () => undefined } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save,
      notify: () => undefined,
      setMessage: () => undefined
    })

    const firstBindings = [{ actionId: 'codex.input.open', shortcutId: 'Alt+I', layer: 'codex', when: "tab == 'codex'", weight: 100, executionOwner: 'runtime-action' as const }]
    const first = controller.floatSnapshot(firstBindings)
    expect(first).toMatchObject({ style: 'water', colors: state.codex.settings.colors, baseRevision: 1, keybindings: firstBindings })
    expect(controller.floatSnapshot(firstBindings)).toBe(first)
    expect(controller.updateSettings({ displayStyle: 'card', colors })).toBe(true)
    const appearance = controller.floatSnapshot(firstBindings)
    expect(appearance).toMatchObject({ style: 'card', colors, baseRevision: 2 })
    expect(appearance.taskSnapshot).toBe(first.taskSnapshot)
    const secondBindings = [{ ...firstBindings[0], shortcutId: 'Alt+Shift+I' }]
    const shortcuts = controller.floatSnapshot(secondBindings)
    expect(shortcuts).toMatchObject({ baseRevision: 3, keybindings: secondBindings })
    expect(shortcuts.taskSnapshot).toBe(first.taskSnapshot)
    expect(save).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('consumes Kernel snapshots directly without subscribing to legacy Renderer activity reducers', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: false }
    const taskKey = 'abcdef0123456789'
    const onActivityChanged = vi.fn(() => () => undefined)
    const readActivitySnapshot = vi.fn()
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now, {
      phase: 'waiting-input',
      cycleTier: 'input',
      dynamicGroup: 'input',
      planReady: true,
      planLifecycleRevision: 1
    })], now))
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
          ? {
              ok: true as const,
              receivedAt: now,
              value: {
                version: 2 as const,
                receivedAt: now,
                threads: [{
                  key: taskKey,
                  actionAlias: `alias-${taskKey}`,
                  name: 'Kernel 直出任务',
                  status: 'active' as const,
                  activeFlags: [] as [],
                  statusAuthority: 'desktop-live' as const,
                  updatedAt: now,
                  lastTurnStatus: 'inProgress' as const,
                  lastTurnStartedAt: now - 1
                }],
                projects: [],
                sourceFingerprint: 'a'.repeat(64),
                completeness: 'verified' as const
              }
            }
          : { ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now } },
        onActivityChanged,
        readActivitySnapshot,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskSnapshot.tasks[0]?.phase).toBe('waiting-input'))
    expect(onActivityChanged).not.toHaveBeenCalled()
    expect(readActivitySnapshot).not.toHaveBeenCalled()

    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now + 1, {
      phase: 'running',
      cycleTier: 'none',
      dynamicGroup: 'none',
      planReady: true,
      planLifecycleRevision: 1,
      turnStartedAt: now + 1
    })], now + 1, 2))

    await vi.waitFor(() => expect(controller.view().taskSnapshot.tasks[0]?.phase).toBe('running'))
    expect(controller.view().taskState.conversations.ongoing[0]).toMatchObject({
      key: taskKey,
      activityState: 'active'
    })
    expect(onActivityChanged).not.toHaveBeenCalled()
    expect(readActivitySnapshot).not.toHaveBeenCalled()
    controller.dispose()
  })
  it('archives authoritative completed and stopped Codex tasks while keeping uncertain states ongoing', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = 10
    const activeKey = '1111111111111111'
    const completedKey = '2222222222222222'
    const failedKey = '3333333333333333'
    const unknownKey = '4444444444444444'
    const stoppedKey = '5555555555555555'
    const threads: CodexHostThread[] = [
      { key: activeKey, actionAlias: 'alias-active', name: '进行中', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', updatedAt: 550, lastTurnStatus: 'inProgress', lastTurnStartedAt: 500 },
      { key: completedKey, actionAlias: 'alias-completed', name: '已完成', status: 'notLoaded', activeFlags: [], updatedAt: 450, lastTurnStatus: 'completed', lastTurnStartedAt: 300, lastTurnCompletedAt: 400 },
      { key: failedKey, actionAlias: 'alias-failed', name: '失败', status: 'notLoaded', activeFlags: [], updatedAt: 350, lastTurnStatus: 'failed', lastTurnStartedAt: 320 },
      { key: unknownKey, actionAlias: 'alias-unknown', name: '已中断', status: 'systemError', activeFlags: [], updatedAt: 250, lastTurnStatus: 'interrupted', lastTurnStartedAt: 200 },
      { key: stoppedKey, actionAlias: 'alias-stopped', name: '明确停止', status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', updatedAt: 240, lastTurnStatus: 'interrupted', lastTurnStartedAt: 190 }
    ]
    const archiveThread = vi.fn(async (_actionAlias: string, _request: Record<string, unknown>) => ({ outcome: 'archived' as const }))
    const messages: string[] = []
    let companionKernel: any
    companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      adapters: {
        codex: {
          archive: async (target: Record<string, any>) => {
            const result = await archiveThread(target.actionAlias, target.archiveRequest)
            if (result.outcome === 'archived') {
              companionKernel.commitArchived({
                provider: 'codex',
                key: target.key,
                verified: true,
                terminalEpoch: target.revisionAt,
                membershipRevision: Date.now()
              })
            }
            return result
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([
      hostTask(activeKey, 600, { actionAlias: 'alias-active', phase: 'running', revisionAt: 550 }),
      hostTask(completedKey, 600, {
        actionAlias: 'alias-completed',
        phase: 'completed',
        revisionAt: 400,
        statusEnteredAt: 400,
        terminalAt: 400,
        capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false },
        archiveRequest: {
          expectedUpdatedAt: 450,
          expectedRevisionAt: 400,
          expectedCompletionAt: 400,
          expectedLastTurnStartedAt: 300,
          expectedSourceFingerprint: 'a'.repeat(64),
          evidence: 'completed'
        }
      }),
      hostTask(failedKey, 600, { actionAlias: 'alias-failed', phase: 'running', revisionAt: 350, freshness: 'verifying' }),
      hostTask(unknownKey, 600, { actionAlias: 'alias-unknown', phase: 'running', revisionAt: 250, freshness: 'verifying' }),
      hostTask(stoppedKey, 600, {
        actionAlias: 'alias-stopped',
        phase: 'stopped',
        revisionAt: 190,
        statusEnteredAt: 190,
        terminalAt: 190,
        idleConfirmed: true,
        capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false },
        archiveRequest: {
          expectedUpdatedAt: 240,
          expectedRevisionAt: 190,
          expectedLastTurnStartedAt: 190,
          expectedSourceFingerprint: 'a'.repeat(64),
          evidence: 'stopped'
        }
      })
    ], 600))
    const platform = {
      companionKernel,
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt: 600, value: { version: 2 as const, receivedAt: 600, threads, projects: [], sourceFingerprint: 'a'.repeat(64), completeness: 'verified' as const } }),
        archiveThread,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: (message) => messages.push(message)
    })

    controller.start()
    await controller.refresh()
    expect(controller.view().taskState.conversations.ongoing.find((task) => task.key === activeKey)?.archiveCapability).toBe('blocked-active')
    expect(await controller.archive(activeKey, 550)).toBe(false)
    expect(archiveThread).not.toHaveBeenCalled()

    const completedArchive = await controller.archive(completedKey, 400)
    expect(completedArchive).toBe(true)
    expect(archiveThread).toHaveBeenLastCalledWith('alias-completed', {
      expectedUpdatedAt: 450,
      expectedRevisionAt: 400,
      expectedCompletionAt: 400,
      expectedLastTurnStartedAt: 300,
      expectedSourceFingerprint: 'a'.repeat(64),
      evidence: 'completed'
    })
    expect(controller.view().taskState.conversations.completedUnread.some((task) => task.key === completedKey)).toBe(false)

    expect(controller.view().taskState.conversations.ongoing.find((task) => task.key === failedKey)?.archiveCapability).toBe('blocked-active')
    expect(await controller.archive(failedKey, 350)).toBe(false)
    expect(controller.view().taskState.conversations.ongoing.find((task) => task.key === unknownKey)?.archiveCapability).toBe('blocked-active')
    expect(await controller.archive(unknownKey, 250)).toBe(false)
    expect(controller.view().taskState.conversations.stopped.find((task) => task.key === stoppedKey)?.archiveCapability).toBe('allowed')
    expect(await controller.archive(stoppedKey, 190)).toBe(true)
    expect(archiveThread).toHaveBeenLastCalledWith('alias-stopped', {
      expectedUpdatedAt: 240,
      expectedRevisionAt: 190,
      expectedCompletionAt: 0,
      expectedLastTurnStartedAt: 190,
      expectedSourceFingerprint: 'a'.repeat(64),
      evidence: 'stopped'
    })
    expect(archiveThread).toHaveBeenCalledTimes(2)
    expect(controller.view().taskState.conversations.ongoing.map((task) => task.key)).toEqual([activeKey, failedKey, unknownKey])
    expect(state.codex.receipts.some((receipt) => [completedKey, failedKey, unknownKey, stoppedKey].includes(receipt.key))).toBe(false)
    expect(messages.at(-1)).toContain('已归档')
    controller.dispose()
  })

  it('keeps the card visible and marked archiving until the Provider verifies removal', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = 10
    const taskKey = '5555555555555555'
    const threads: CodexHostThread[] = [
      { key: taskKey, actionAlias: 'alias-task', name: '已完成', status: 'notLoaded', activeFlags: [], updatedAt: 450, lastTurnStatus: 'completed', lastTurnStartedAt: 300, lastTurnCompletedAt: 400 }
    ]
    let archiveResolve: (() => void) | null = null
    const archiveThread = vi.fn(() => new Promise<{ outcome: 'archived' }>(resolve => { archiveResolve = () => resolve({ outcome: 'archived' }) }))
    const notifyCount = { value: 0 }
    let companionKernel: any
    companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      adapters: {
        codex: {
          archive: async (target: Record<string, any>) => {
            const result = await archiveThread()
            companionKernel.commitArchived({
              provider: 'codex',
              key: target.key,
              verified: true,
              terminalEpoch: target.revisionAt,
              membershipRevision: Date.now()
            })
            return result
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, 600, {
      actionAlias: 'alias-task',
      phase: 'completed',
      revisionAt: 400,
      statusEnteredAt: 400,
      terminalAt: 400,
      capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false },
      archiveRequest: {
        expectedUpdatedAt: 450,
        expectedRevisionAt: 400,
        expectedCompletionAt: 400,
        expectedLastTurnStartedAt: 300,
        expectedSourceFingerprint: 'a'.repeat(64),
        evidence: 'completed'
      }
    })], 600))
    const platform = {
      companionKernel,
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt: 600, value: { version: 2 as const, receivedAt: 600, threads, projects: [], sourceFingerprint: 'a'.repeat(64), completeness: 'verified' as const } }),
        archiveThread,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => { notifyCount.value++ },
      setMessage: () => undefined
    })

    controller.start()
    await controller.refresh()
    expect(controller.view().taskState.conversations.completedCount).toBe(1)

    const archivePromise = controller.archive(taskKey, 400)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(controller.view().taskState.conversations.completedCount).toBe(1)
    expect(controller.floatSnapshot().archivingTaskKeys).toEqual([taskKey])
    await controller.refresh()
    expect(controller.view().taskState.conversations.completedCount).toBe(1)
    expect(controller.floatSnapshot().archivingTaskKeys).toEqual([taskKey])

    archiveResolve!()
    expect(await archivePromise).toBe(true)
    // Only the verified process-Kernel commit removes the card.
    expect(controller.view().taskState.conversations.completedCount).toBe(0)
    expect(controller.floatSnapshot().archivingTaskKeys).toEqual([])
    controller.dispose()
  })

  it('keeps unconfirmed inventory rows visible but refuses local mutation outside a complete V6 Kernel snapshot', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    let receivedAt = 100_000
    let threads: CodexHostThread[] = Array.from({ length: 10 }, (_, index) => ({
      key: (index + 32).toString(16).padStart(16, '0'),
      actionAlias: `unknown-${index}`,
      name: `未知任务 ${index + 1}`,
      status: 'notLoaded',
      activeFlags: [],
      updatedAt: 80_000 + index,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 70_000 + index
    }))
    const platform = {
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt, value: { version: 1 as const, receivedAt, threads, taskAuthority: 'inventory-only' as const } }),
        openThread: async () => ({ outcome: 'opened' as const }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await controller.refresh()
    expect(controller.view().taskInventory.conversations).toMatchObject({ ongoingCount: 10, runningCount: 0, unknownCount: 0, sourceCount: 10, authority: 'inventory-only' })
    const target = controller.view().taskInventory.conversations.ongoing[0]
    expect(controller.hide(target.key, target.revisionAt)).toBe(false)
    expect(controller.view().taskInventory.conversations).toMatchObject({ ongoingCount: 10, runningCount: 0, unknownCount: 0, hiddenCount: 0 })

    threads = threads.map((thread) => thread.key === target.key ? { ...thread, updatedAt: target.revisionAt + 1_000 } : thread)
    receivedAt += 10_000
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.ongoing.some((task) => task.key === target.key && task.revisionAt === target.revisionAt + 1_000)).toBe(true)
    controller.dispose()
  })

  it('hides and restores a stopped task while the Codex provider is no longer running', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: false }
    const taskKey = '2222222222222222'
    // Codex is not running: every provider read and the cold preflight fail, so
    // only a locally committed decision can move the row.
    const preflight = vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed')))
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now, {
      phase: 'stopped',
      displayName: '待继续任务'
    })], now))
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async () => ({ ok: false as const, receivedAt: now, error: { code: 'unavailable' as const, message: 'Codex 未运行' } }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskState.conversations.stopped[0]?.key).toBe(taskKey))
    const target = controller.view().taskState.conversations.stopped[0]

    expect(controller.hide(target.key, target.revisionAt)).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.stopped).toEqual([]))
    expect(controller.view().taskState.conversations.hidden[0]).toMatchObject({ key: taskKey, hiddenKind: 'task' })
    expect(state.codex.receipts.some((receipt) => receipt.key === taskKey && receipt.dismissedActivityRecency === target.revisionAt)).toBe(true)

    expect(controller.restore(target.key, target.revisionAt, 'task')).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.hidden).toEqual([]))
    expect(controller.view().taskState.conversations.stopped[0]).toMatchObject({ key: taskKey })

    // The local pin shares the same authority and must not wait for a read.
    expect(controller.toggleLocalPin('task', taskKey)).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.all[0]).toMatchObject({ key: taskKey, pinSource: 'local' }))
    expect(controller.toggleLocalPin('task', taskKey)).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.all[0].pinSource).toBeUndefined())
    controller.dispose()
  })

  it('hides, restores and pins a first-class Cursor root through the V6 Kernel', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: true }
    const codexKey = '3333333333333333'
    const composerId = '4cab4479-df25-4ff7-a427-26aed29c5c0a'
    const cursorKey = `cursor:${composerId}`
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      preflight: vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed'))),
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: true } }
    })
    companionKernel.publishEvidence(hostDraft([
      hostTask(codexKey, now, { phase: 'stopped', displayName: 'Codex 待继续' }),
      hostTask(cursorKey, now, {
        provider: 'cursor',
        kind: 'cursor-session',
        family: cursorKey,
        role: 'root',
        actionAlias: composerId,
        phase: 'stopped',
        cycleTier: 'none',
        dynamicGroup: 'stopped',
        displayName: 'Cursor 待继续会话'
      })
    ], now, 1, { codex: true, claude: false, cursor: true }))
    const cursorSession = {
      composerId,
      workspaceIdentifier: 'file:///repo',
      name: 'Cursor 待继续会话',
      subtitle: '',
      createdAt: now - 10_000,
      lastUpdatedAt: now - 5_000,
      hasUnreadMessages: false,
      isDraft: false,
      hasPendingPlan: false,
      hasBlockingPendingActions: false,
      unfinishedRunAt: 0,
      diskStatus: 'aborted'
    }
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async () => ({ ok: false as const, receivedAt: now, error: { code: 'unavailable' as const, message: 'Codex 未运行' } }),
        close: () => undefined
      },
      cursor: {
        inspect: async () => ({ available: true, reason: 'ready', sessionCount: 1, readAt: now, hooks: 'missing' }),
        readInventory: async () => ({ revision: 'inventory-test', available: true, reason: 'ready', sessions: [cursorSession], truncated: false, readAt: now }),
        openTask: async () => ({ outcome: 'dispatched' as const, confirmsRead: false, message: '' }),
        diagnostics: () => ({ revision: 'cursor-agent-companion-v4', loaded: true, loadError: '' }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskState.conversations.stopped.some((task) => task.key === cursorKey)).toBe(true))
    const cursorCard = controller.view().taskState.conversations.stopped.find((task) => task.key === cursorKey)!

    expect(controller.hide(cursorCard.key, cursorCard.revisionAt)).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.stopped.some((task) => task.key === cursorKey)).toBe(false))
    expect(controller.view().taskState.conversations.hidden.some((task) => task.key === cursorKey && task.hiddenKind === 'task')).toBe(true)
    expect(state.codex.receipts.some((receipt) => receipt.key === cursorKey && receipt.dismissedActivityRecency === cursorCard.revisionAt)).toBe(true)

    expect(controller.restore(cursorCard.key, cursorCard.revisionAt, 'task')).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.hidden.some((task) => task.key === cursorKey)).toBe(false))
    expect(controller.view().taskState.conversations.stopped.some((task) => task.key === cursorKey)).toBe(true)

    expect(controller.toggleLocalPin('task', cursorKey)).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.all.find((task) => task.key === cursorKey)?.pinSource).toBe('local'))
    expect(controller.toggleLocalPin('task', cursorKey)).toBe(true)
    await vi.waitFor(() => expect(controller.view().taskState.conversations.all.find((task) => task.key === cursorKey)?.pinSource).toBeUndefined())
    controller.dispose()
  })

  it('archives a stopped Cursor root through the unified command and keeps it on failure', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: true }
    const composerId = '4cab4479-df25-4ff7-a427-26aed29c5c0a'
    const cursorKey = `cursor:${composerId}`
    const cursorSession = {
      composerId,
      workspaceIdentifier: 'file:///repo',
      name: 'Cursor 待继续会话',
      subtitle: '',
      createdAt: now - 10_000,
      lastUpdatedAt: now - 5_000,
      hasUnreadMessages: false,
      isDraft: false,
      hasPendingPlan: false,
      hasBlockingPendingActions: false,
      unfinishedRunAt: 0,
      diskStatus: 'aborted'
    }
    let archiveOutcome: { outcome: string; message?: string } = { outcome: 'failed', message: 'Cursor 任务归档失败，已保留任务卡片' }
    const archiveTask = vi.fn(async (_composerId: string) => archiveOutcome)
    const messages: string[] = []
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      preflight: vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed'))),
      adapters: { cursor: { archive: async (target: { actionAlias: string }) => archiveTask(target.actionAlias) } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: true } }
    })
    companionKernel.publishEvidence(hostDraft([
      hostTask('3333333333333333', now, { phase: 'stopped', displayName: 'Codex 待继续' }),
      hostTask(cursorKey, now, {
        provider: 'cursor',
        kind: 'cursor-session',
        family: cursorKey,
        role: 'root',
        actionAlias: composerId,
        phase: 'stopped',
        cycleTier: 'none',
        dynamicGroup: 'stopped',
        displayName: 'Cursor 待继续会话',
        terminalAt: now,
        capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false }
      })
    ], now, 1, { codex: true, claude: false, cursor: true }))
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async () => ({ ok: false as const, receivedAt: now, error: { code: 'unavailable' as const, message: 'Codex 未运行' } }),
        close: () => undefined
      },
      cursor: {
        inspect: async () => ({ available: true, reason: 'ready', sessionCount: 1, readAt: now, hooks: 'missing' }),
        readInventory: async () => ({ revision: 'inventory-test', available: true, reason: 'ready', sessions: [cursorSession], truncated: false, readAt: now }),
        openTask: async () => ({ outcome: 'dispatched' as const, confirmsRead: false, message: '' }),
        archiveTask,
        diagnostics: () => ({ revision: 'cursor-agent-companion-v5', loaded: true, loadError: '' }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: (message) => { messages.push(message) }
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskState.conversations.stopped.some((task) => task.key === cursorKey)).toBe(true))
    const card = controller.view().taskState.conversations.stopped.find((task) => task.key === cursorKey)!
    expect(card).toMatchObject({ canArchive: true, archiveCapability: 'allowed' })

    // A failed provider write keeps the card and reports the provider message.
    await expect(controller.archive(card.key, card.revisionAt)).resolves.toBe(false)
    expect(archiveTask).toHaveBeenCalledWith(composerId)
    expect(controller.view().taskState.conversations.stopped.some((task) => task.key === cursorKey)).toBe(true)
    expect(messages.at(-1)).toBe('Cursor 任务归档失败，已保留任务卡片')

    archiveOutcome = { outcome: 'archived', message: '已归档 Cursor 任务（App 归档列表同步可见）' }
    await expect(controller.archive(card.key, card.revisionAt)).resolves.toBe(true)
    expect(controller.view().taskState.conversations.stopped.some((task) => task.key === cursorKey)).toBe(false)
    expect(messages.at(-1)).toBe('已归档 Cursor 任务（App 归档列表同步可见）')
    controller.dispose()
  })

  it('reaches a running Cursor root from previous/next through the same command authority', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false, cursor: true }
    const composerId = '4cab4479-df25-4ff7-a427-26aed29c5c0a'
    const cursorKey = `cursor:${composerId}`
    const openTask = vi.fn(async (_alias: string) => ({ outcome: 'dispatched' as const, confirmsRead: false, message: '已在 Cursor 打开该对话' }))
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      preflight: vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed'))),
      adapters: {
        cursor: { open: async (target: { actionAlias: string }) => openTask(target.actionAlias) }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: true } }
    })
    companionKernel.publishEvidence(hostDraft([
      hostTask('3333333333333333', now, { phase: 'stopped', displayName: 'Codex 待继续' }),
      hostTask(cursorKey, now, {
        provider: 'cursor',
        kind: 'cursor-session',
        family: cursorKey,
        role: 'root',
        actionAlias: composerId,
        phase: 'running',
        cycleTier: 'active',
        dynamicGroup: 'active',
        displayName: 'Cursor 运行中会话'
      })
    ], now, 1, { codex: true, claude: false, cursor: true }))
    const cursorSession = {
      composerId,
      workspaceIdentifier: 'file:///repo',
      name: 'Cursor 运行中会话',
      subtitle: '',
      createdAt: now - 10_000,
      lastUpdatedAt: now - 2_000,
      hasUnreadMessages: false,
      isDraft: false,
      hasPendingPlan: false,
      hasBlockingPendingActions: false,
      unfinishedRunAt: now - 2_000,
      diskStatus: 'in_progress'
    }
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async () => ({ ok: false as const, receivedAt: now, error: { code: 'unavailable' as const, message: 'Codex 未运行' } }),
        close: () => undefined
      },
      cursor: {
        inspect: async () => ({ available: true, reason: 'ready', sessionCount: 1, readAt: now, hooks: 'missing' }),
        readInventory: async () => ({ revision: 'inventory-test', available: true, reason: 'ready', sessions: [cursorSession], truncated: false, readAt: now }),
        openTask: async () => ({ outcome: 'dispatched' as const, confirmsRead: false, message: '' }),
        diagnostics: () => ({ revision: 'cursor-agent-companion-v5', loaded: true, loadError: '' }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskState.conversations.ongoing.some((task) => task.key === cursorKey)).toBe(true))
    expect(companionKernel.getLatest().views.cycleKeys).toEqual([cursorKey])

    expect(controller.cycleTask(1)).toBe(true)
    await vi.waitFor(() => expect(openTask).toHaveBeenCalledWith(composerId))
    controller.dispose()
  })

  it('persists anonymous first-prompt timing and reuses it when the host omits it after restart', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const key = 'abababababababab'
    let includeFirstPrompt = true
    const platform = {
      codex: {
        readSnapshot: async () => ({
          ok: true as const,
          receivedAt: 200_000,
          value: {
            version: 1 as const,
            receivedAt: 200_000,
            threads: [{ key, actionAlias: 'timed-alias', name: '计时任务', status: 'active' as const, activeFlags: [], updatedAt: 190_000, createdAt: 100_000, ...(includeFirstPrompt ? { firstPromptAt: 120_000 } : {}), lastTurnStartedAt: 180_000 }]
          }
        }),
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const options = { platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined }
    let controller = createCodexController(options)
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.ongoing[0]).toMatchObject({ firstPromptAt: 120_000, lastTurnStartedAt: 180_000 })
    expect(state.codex.firstPromptTimes).toEqual([{ key, firstPromptAt: 120_000, updatedAt: 200_000 }])
    controller.dispose()

    includeFirstPrompt = false
    controller = createCodexController(options)
    await controller.refresh()
    expect(controller.view().taskInventory.conversations.ongoing[0]).toMatchObject({ firstPromptAt: 120_000 })
    controller.dispose()
  })

  it('saves expanded geometry per display and resets size independently from position', () => {
    const state = createInitialState(1)
    const resetGeometry = vi.fn(() => true)
    const controller = createCodexController({
      platform: { codex: { close: () => undefined }, float: { resetGeometry } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })
    const position = { displayId: 'screen-2', x: 100, y: -40, edge: 'left' as const }
    expect(controller.saveGeometry(position, { width: 520, height: 640, displayId: 'screen-2', updatedAt: 300 })).toBe(true)
    expect(state.codex.settings.expandedSizes).toEqual([{ displayId: 'screen-2', width: 520, height: 640, updatedAt: 300 }])
    expect(controller.view().floatHost).toEqual({ displayId: 'screen-2', expandedWidth: 520, expandedHeight: 640, expandedManual: true })

    expect(controller.resetPosition()).toBe(true)
    expect(state.codex.settings.position).toEqual({ displayId: '', x: null, y: null, edge: 'right' })
    expect(state.codex.settings.expandedSizes).toHaveLength(1)
    expect(resetGeometry).toHaveBeenCalled()

    expect(controller.resetExpandedSize('screen-2')).toBe(true)
    expect(state.codex.settings.expandedSizes).toEqual([])
    controller.dispose()
  })

  it('returns a known current display to auto size without inheriting another display preference', () => {
    const state = createInitialState(1)
    state.codex.settings.position = { displayId: 'screen-a', x: 100, y: 100, edge: 'right' }
    state.codex.settings.expandedSizes = [
      { displayId: 'screen-a', width: 520, height: 640, updatedAt: 300 },
      { displayId: 'screen-b', width: 700, height: 720, updatedAt: 200 }
    ]
    const resetGeometry = vi.fn(() => true)
    const controller = createCodexController({
      platform: { codex: { close: () => undefined }, float: { resetGeometry } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    expect(controller.resetExpandedSize('screen-a')).toBe(true)
    expect(state.codex.settings.expandedSizes).toEqual([{ displayId: 'screen-b', width: 700, height: 720, updatedAt: 200 }])
    expect(controller.view().floatHost).toEqual({ displayId: 'screen-a', expandedWidth: 360, expandedHeight: 0, expandedManual: false })
    expect(resetGeometry).toHaveBeenCalledWith(expect.objectContaining({ expandedSizes: state.codex.settings.expandedSizes }))
    controller.dispose()
  })

  it('keeps the Kernel task subscription hot after leaving the Codex tab', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = now - 1_000
    state.codex.settings.providers = { codex: true, claude: false, cursor: false }
    const taskKey = 'aaaaaaaaaaaaaaaa'
    const thread: CodexHostThread = {
      key: taskKey,
      actionAlias: 'alias-ongoing',
      name: '进行中',
      status: 'active',
      activeFlags: [],
      statusAuthority: 'desktop-live',
      updatedAt: now - 50,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: now - 100
    }
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now, {
      actionAlias: thread.actionAlias,
      phase: 'running'
    })], now))
    let closeCount = 0
    const closeOptions: Array<{ preserveDesktop?: boolean } | undefined> = []
    const reads: Array<Record<string, boolean>> = []
    const onActivityChanged = vi.fn(() => () => undefined)
    const platform = {
      companionKernel,
      codex: {
        taskStateRevision: CODEX_TASK_STATE_REVISION,
        readSnapshot: async (options: Record<string, boolean>) => {
          reads.push(options)
          return options.includeThreads
            ? {
                ok: true as const,
                receivedAt: now,
                value: {
                  version: 2 as const,
                  receivedAt: now,
                  threads: [thread],
                  projects: [],
                  sourceFingerprint: 'a'.repeat(64),
                  completeness: 'verified' as const
                }
              }
            : { ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now } }
        },
        onActivityChanged,
        close: (options?: { preserveDesktop?: boolean }) => {
          closeCount += 1
          closeOptions.push(options)
        }
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: () => undefined
    })

    controller.start()
    await vi.waitFor(() => expect(controller.view().taskSnapshot.tasks[0]?.phase).toBe('running'))

    const readsBeforeSwitch = reads.length
    state.activeTab = 'ports'
    controller.syncActivation(false)
    expect(closeCount).toBe(0)
    expect(closeOptions).toEqual([])
    expect(controller.view().taskSnapshot.tasks[0]?.phase).toBe('running')

    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now + 1, {
      actionAlias: thread.actionAlias,
      phase: 'waiting-input',
      cycleTier: 'input',
      dynamicGroup: 'input'
    })], now + 1, 2))
    await vi.waitFor(() => expect(controller.view().taskSnapshot.tasks[0]?.phase).toBe('waiting-input'))
    expect(controller.view().taskState.conversations.inputRequired[0]).toMatchObject({
      key: taskKey,
      activityState: 'waiting-input'
    })
    expect(reads).toHaveLength(readsBeforeSwitch)
    expect(onActivityChanged).not.toHaveBeenCalled()
    controller.dispose()
  })
  it('shows Runner first and performs a tasks-only cold preflight before running the persisted Env B slot', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    state.codex.settings.floatEnabled = false
    const projectKey = 'a'.repeat(32)
    const actionAlias = `cp_${'b'.repeat(24)}`
    const selectedLaneId = codexActionLaneId(projectKey, 'env-b', 'build-b')
    const events: string[] = []
    const reads: Array<Record<string, boolean>> = []
    const catalogs: any[] = []
    const runProjectAction = vi.fn(async (request: any) => ({ outcome: 'started' as const, message: `${request.environmentId} started` }))
    const listProjectEnvironments = vi.fn(async () => ({
      outcome: 'ok' as const,
      runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
      projectKey,
      targetId: projectKey,
      environments: [
        { id: 'env-a', name: 'Env A', setupScriptPresent: false, actions: [{ id: 'build-a', name: 'Build A', icon: 'run', risk: 'normal' as const, displayOnly: false, slotEligible: true }] },
        { id: 'env-b', name: 'Env B', setupScriptPresent: false, actions: [{ id: 'build-b', name: 'Build B', icon: 'run', risk: 'normal' as const, displayOnly: false, slotEligible: true }] }
      ]
    }))
    const platform = {
      codex: {
        actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
        readSnapshot: async (options: Record<string, boolean>) => {
          events.push('tasks-preflight')
          reads.push(options)
          return {
            ok: true as const,
            receivedAt: Date.now(),
            value: {
              version: 2 as const,
              receivedAt: Date.now(),
              threads: [],
              projects: [{ key: projectKey, actionAlias, name: 'Priority', kind: 'project' as const, nativePinned: true, nativePinnedOrder: 0 }],
              sourceFingerprint: 'c'.repeat(64),
              completeness: 'verified' as const
            }
          }
        },
        listProjectEnvironments,
        runProjectAction,
        close: () => undefined
      },
      actionRunner: {
        readPreference: () => ({ selectedLaneId }),
        syncCatalog: (catalog: any) => { catalogs.push(structuredClone(catalog)); return true },
        activate: () => { events.push('runner-visible'); return true },
        updatePreference: () => true,
        close: () => undefined,
        onAction: () => () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    const result = await controller.runEnvironmentActionSlot(0)

    expect(result).toBe(true)
    expect(events[0]).toBe('runner-visible')
    expect(reads).toHaveLength(1)
    expect(reads.every((options) => options.includeThreads === true && options.includeQuota === false && options.includeConfig === false)).toBe(true)
    expect(runProjectAction).toHaveBeenCalledWith(expect.objectContaining({
      targetId: projectKey,
      projectKey,
      environmentId: 'env-b',
      actionId: 'build-b'
    }))
    expect(catalogs.at(-1)?.selectedLaneId).toBe(selectedLaneId)
    expect(listProjectEnvironments).toHaveBeenCalledTimes(1)
    await expect(controller.activateActionRunner(selectedLaneId)).resolves.toBe(true)
    expect(reads).toHaveLength(1)
    expect(listProjectEnvironments).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('keeps Action project catalogs hot and incrementally reloads only added or re-aliased projects', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    state.codex.settings.floatEnabled = false
    const firstKey = '1'.repeat(32)
    const secondKey = '2'.repeat(32)
    const thirdKey = '3'.repeat(32)
    const firstAlias = `cp_${'a'.repeat(24)}`
    const oldSecondAlias = `cp_${'b'.repeat(24)}`
    const newSecondAlias = `cp_${'c'.repeat(24)}`
    const thirdAlias = `cp_${'d'.repeat(24)}`
    let inventoryVersion = 0
    const projectForAlias = new Map([
      [firstAlias, firstKey],
      [oldSecondAlias, secondKey],
      [newSecondAlias, secondKey],
      [thirdAlias, thirdKey]
    ])
    const readSnapshot = vi.fn(async () => {
      inventoryVersion += 1
      const projects = inventoryVersion === 1
        ? [
            { key: firstKey, actionAlias: firstAlias, name: 'First', kind: 'project' as const, nativePinned: true, nativePinnedOrder: 0 },
            { key: secondKey, actionAlias: oldSecondAlias, name: 'Second', kind: 'project' as const, nativePinned: false, nativeOrder: 1 }
          ]
        : [
            { key: firstKey, actionAlias: firstAlias, name: 'First', kind: 'project' as const, nativePinned: true, nativePinnedOrder: 0 },
            { key: secondKey, actionAlias: newSecondAlias, name: 'Second', kind: 'project' as const, nativePinned: false, nativeOrder: 1 },
            { key: thirdKey, actionAlias: thirdAlias, name: 'Third', kind: 'project' as const, nativePinned: false, nativeOrder: 2 }
          ]
      return {
        ok: true as const,
        receivedAt: Date.now() + inventoryVersion,
        value: {
          version: 2 as const,
          receivedAt: Date.now() + inventoryVersion,
          threads: [],
          projects,
          sourceFingerprint: `${inventoryVersion}`.repeat(64),
          completeness: 'verified' as const
        }
      }
    })
    const listProjectEnvironments = vi.fn(async (alias: string) => {
      const projectKey = projectForAlias.get(alias)!
      return {
        outcome: 'ok' as const,
        runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
        projectKey,
        targetId: projectKey,
        environments: [{
          id: `env-${projectKey[0]}`,
          name: `Env ${projectKey[0]}`,
          setupScriptPresent: false,
          actions: [{ id: 'build', name: 'Build', icon: 'run', risk: 'normal' as const, displayOnly: false, slotEligible: true }]
        }]
      }
    })
    const catalogs: any[] = []
    const platform = {
      codex: {
        actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
        readSnapshot,
        listProjectEnvironments,
        close: () => undefined
      },
      actionRunner: {
        readPreference: () => ({ selectedLaneId: '' }),
        syncCatalog: (catalog: any) => { catalogs.push(structuredClone(catalog)); return true },
        activate: () => true,
        close: () => undefined,
        onAction: () => () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await expect(controller.activateActionRunner()).resolves.toBe(true)
    expect(listProjectEnvironments.mock.calls.map(([alias]) => alias)).toEqual([firstAlias, oldSecondAlias])

    await controller.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listProjectEnvironments.mock.calls.map(([alias]) => alias)).toEqual([
      firstAlias,
      oldSecondAlias,
      newSecondAlias,
      thirdAlias
    ])
    await expect(controller.activateActionRunner()).resolves.toBe(true)

    expect(readSnapshot).toHaveBeenCalledTimes(2)
    expect(listProjectEnvironments.mock.calls.map(([alias]) => alias)).toEqual([
      firstAlias,
      oldSecondAlias,
      newSecondAlias,
      thirdAlias
    ])
    expect(catalogs.at(-1)?.projects.map((project: any) => project.key)).toEqual([firstKey, secondKey, thirdKey])
    controller.dispose()
  })

  it('fails closed in Runner when the long-lived preload lacks the Action Host runtime revision', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    const readSnapshot = vi.fn()
    const runProjectAction = vi.fn()
    const catalogs: any[] = []
    const activate = vi.fn(() => true)
    const platform = {
      codex: {
        actionRuntimeRevision: 'legacy',
        readSnapshot,
        runProjectAction,
        close: () => undefined
      },
      actionRunner: {
        readPreference: () => ({ selectedLaneId: '' }),
        syncCatalog: (catalog: any) => { catalogs.push(structuredClone(catalog)); return true },
        activate,
        close: () => undefined,
        onAction: () => () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    expect(await controller.runEnvironmentActionSlot(0)).toBe(false)
    expect(activate).toHaveBeenCalled()
    expect(readSnapshot).not.toHaveBeenCalled()
    expect(runProjectAction).not.toHaveBeenCalled()
    expect(catalogs.at(-1)?.message).toContain('需重载')
    controller.dispose()
  })

  it('does not fall back when the persisted selection belongs to another project', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    const firstKey = '1'.repeat(32)
    const secondKey = '2'.repeat(32)
    const firstAlias = `cp_${'d'.repeat(24)}`
    const secondAlias = `cp_${'e'.repeat(24)}`
    const selectedLaneId = codexActionLaneId(secondKey, 'other-env', 'other-build')
    const messages: string[] = []
    const catalogs: any[] = []
    const runProjectAction = vi.fn()
    const platform = {
      codex: {
        actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
        readSnapshot: async () => ({
          ok: true as const,
          receivedAt: Date.now(),
          value: {
            version: 2 as const,
            receivedAt: Date.now(),
            threads: [],
            projects: [
              { key: firstKey, actionAlias: firstAlias, name: 'Priority', kind: 'project' as const, nativePinned: true, nativePinnedOrder: 0 },
              { key: secondKey, actionAlias: secondAlias, name: 'Other', kind: 'project' as const, nativePinned: false, nativeOrder: 1 }
            ],
            sourceFingerprint: 'd'.repeat(64),
            completeness: 'verified' as const
          }
        }),
        listProjectEnvironments: async (alias: string) => {
          const other = alias === secondAlias
          const projectKey = other ? secondKey : firstKey
          return {
            outcome: 'ok' as const,
            runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
            projectKey,
            targetId: projectKey,
            environments: [{
              id: other ? 'other-env' : 'priority-env',
              name: other ? 'Other Env' : 'Priority Env',
              setupScriptPresent: false,
              actions: [{ id: other ? 'other-build' : 'priority-build', name: 'Build', icon: 'run', risk: 'normal' as const, displayOnly: false, slotEligible: true }]
            }]
          }
        },
        runProjectAction,
        close: () => undefined
      },
      actionRunner: {
        readPreference: () => ({ selectedLaneId }),
        syncCatalog: (catalog: any) => { catalogs.push(structuredClone(catalog)); return true },
        activate: () => true,
        close: () => undefined,
        onAction: () => () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: (message) => messages.push(message) })

    expect(await controller.runEnvironmentActionSlot(0)).toBe(false)
    expect(runProjectAction).not.toHaveBeenCalled()
    expect(catalogs.at(-1)?.selectedLaneId).toBe(selectedLaneId)
    expect(catalogs.at(-1)?.message || messages.at(-1)).toContain('优先项目')
    controller.dispose()
  })

  it('rejects a stale persisted selection and a missing slot without falling back to the first Environment', async () => {
    const projectKey = '9'.repeat(32)
    const actionAlias = `cp_${'9'.repeat(24)}`
    const envBSelection = codexActionLaneId(projectKey, 'env-b', 'build-b')
    const staleSelection = codexActionLaneId(projectKey, 'removed-env', 'removed-action')
    for (const scenario of [
      { selectedLaneId: staleSelection, slotIndex: 0, expectedMessage: '已失效' },
      { selectedLaneId: envBSelection, slotIndex: 1, expectedMessage: '未回退其他 Environment' }
    ]) {
      const state = createInitialState(1)
      state.activeTab = 'ports'
      const messages: string[] = []
      const runProjectAction = vi.fn()
      const platform = {
        codex: {
          actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
          readSnapshot: async () => ({
            ok: true as const,
            receivedAt: Date.now(),
            value: {
              version: 2 as const,
              receivedAt: Date.now(),
              threads: [],
              projects: [{ key: projectKey, actionAlias, name: 'Priority', kind: 'project' as const, nativePinned: true }],
              sourceFingerprint: '9'.repeat(64),
              completeness: 'verified' as const
            }
          }),
          listProjectEnvironments: async () => ({
            outcome: 'ok' as const,
            runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
            projectKey,
            targetId: projectKey,
            environments: [
              {
                id: 'env-a', name: 'Env A', setupScriptPresent: false, actions: [
                  { id: 'build-a', name: 'Build A', icon: 'run', risk: 'normal' as const, displayOnly: false, slotEligible: true },
                  { id: 'serve-a', name: 'Serve A', icon: 'run', risk: 'long-running' as const, displayOnly: false, slotEligible: true }
                ]
              },
              { id: 'env-b', name: 'Env B', setupScriptPresent: false, actions: [{ id: 'build-b', name: 'Build B', icon: 'run', risk: 'normal' as const, displayOnly: false, slotEligible: true }] }
            ]
          }),
          runProjectAction,
          close: () => undefined
        },
        actionRunner: {
          readPreference: () => ({ selectedLaneId: scenario.selectedLaneId }),
          syncCatalog: () => true,
          activate: () => true,
          close: () => undefined,
          onAction: () => () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: (message) => messages.push(message) })

      expect(await controller.runEnvironmentActionSlot(scenario.slotIndex)).toBe(false)
      expect(runProjectAction).not.toHaveBeenCalled()
      expect(messages.at(-1)).toContain(scenario.expectedMessage)
      controller.dispose()
    }
  })

  it('rebuilds a stale project alias once and never retries a stale run more than once', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    const projectKey = 'f'.repeat(32)
    const actionAlias = `cp_${'a'.repeat(24)}`
    const readSnapshot = vi.fn(async () => ({
      ok: true as const,
      receivedAt: Date.now(),
      value: {
        version: 2 as const,
        receivedAt: Date.now(),
        threads: [],
        projects: [{ key: projectKey, actionAlias, name: 'Project', kind: 'project' as const, nativePinned: true }],
        sourceFingerprint: 'e'.repeat(64),
        completeness: 'verified' as const
      }
    }))
    const validList = {
      outcome: 'ok',
      runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
      projectKey,
      targetId: projectKey,
      environments: [{ id: 'env', name: 'Env', setupScriptPresent: false, actions: [{ id: 'build', name: 'Build', icon: 'run', risk: 'normal', displayOnly: false, slotEligible: true }] }]
    }
    const listProjectEnvironments = vi.fn()
      .mockResolvedValueOnce({ outcome: 'failed', errorCode: 'stale-alias', message: 'stale', environments: [] })
      .mockResolvedValue(validList)
    const runProjectAction = vi.fn().mockResolvedValue({ outcome: 'failed', errorCode: 'stale-alias', message: 'stale run' })
    const catalogs: any[] = []
    const platform = {
      codex: { actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, readSnapshot, listProjectEnvironments, runProjectAction, close: () => undefined },
      actionRunner: {
        readPreference: () => ({ selectedLaneId: '' }),
        syncCatalog: (catalog: any) => { catalogs.push(structuredClone(catalog)); return true },
        activate: () => true,
        close: () => undefined,
        onAction: () => () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    expect(await controller.activateActionRunner()).toBe(true)
    expect(listProjectEnvironments).toHaveBeenCalledTimes(2)
    expect(readSnapshot).toHaveBeenCalledTimes(2)
    expect(catalogs.at(-1)?.projects[0]?.environments[0]?.id).toBe('env')
    expect(await controller.runActionRunnerLane(codexActionLaneId(projectKey, 'env', 'build'))).toBe(false)
    expect(runProjectAction).toHaveBeenCalledTimes(2)
    controller.dispose()
  })
})
