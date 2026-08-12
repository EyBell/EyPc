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

function hostDraft(tasks: Record<string, unknown>[], now: number, revision = 1) {
  return {
    schema: 'companion-task-draft-v4',
    producer: 'host-evidence',
    sourceTaskStateRevision: 'task-state-v10',
    draftRevision: revision,
    acceptedAt: now,
    enabled: true,
    providers: { codex: true, claude: false },
    complete: true,
    focusedKey: '',
    sourceGenerations: { codex: revision, claude: 0 },
    sourceLaneGenerations: {
      codex: { membership: revision, phase: revision, unread: revision },
      claude: { membership: 0, phase: 0, unread: 0 }
    },
    tasks
  }
}

describe('Codex controller', () => {
  it('fails closed instead of reconstructing task actions when the V4 Kernel is missing', () => {
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
    expect(messages.at(-1)).toBe('V4 任务 Kernel 未加载，需要重新接入或重载')
    controller.dispose()
  })

  it('holds raw metadata behind verifying until the first complete Kernel package arrives', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false }
    const taskKey = '1111111111111111'
    let inventoryReads = 0
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
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
    expect(controller.view().companionTaskPackage.complete).toBe(false)
    expect(controller.view().taskState.conversations.all).toEqual([])
    expect(controller.view().taskState.dynamic.tasks).toEqual([])

    companionKernel.publishEvidence(hostDraft([hostTask(taskKey, now, {
      actionAlias: 'metadata-alias',
      cycleTier: 'active',
      dynamicGroup: 'active'
    })], now))
    await vi.waitFor(() => expect(controller.view().companionTaskPackage.complete).toBe(true))
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
    state.codex.settings.providers = { codex: true, claude: false }
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
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
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
    await vi.waitFor(() => expect(controller.view().companionTaskPackage.complete).toBe(true))

    const mainPackage = controller.view().companionTaskPackage
    const floatPackage = controller.floatSnapshot().companionTaskPackage
    expect(floatPackage).toBe(mainPackage)
    expect(mainPackage.views.cycleKeys).toEqual([taskKey])
    const revisionBeforeActions = companionKernel.getLatest().packageRevision

    await expect(controller.openThread(taskKey, 'kernel-controller-alias')).resolves.toBe(true)
    expect(controller.cycleTask(1)).toBe(true)
    await vi.waitFor(() => expect(opened).toHaveLength(2))
    await expect(controller.openThread(taskKey, 'expired-card-alias')).resolves.toBe(true)
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
    state.codex.settings.providers = { codex: true, claude: false }
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
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
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
    const current = companionKernel.getPackage()
    const base = current.tasks[0]
    companionKernel.publishEvidence({
      schema: 'companion-task-draft-v4',
      producer: 'host-evidence',
      sourceTaskStateRevision: current.sourceTaskStateRevision,
      draftRevision: 2,
      acceptedAt: now + 10,
      enabled: true,
      providers: { codex: true, claude: false },
      complete: true,
      focusedKey: '',
      sourceGenerations: { ...current.sourceGenerations, codex: current.sourceGenerations.codex + 1 },
      sourceLaneGenerations: {
        ...current.sourceLaneGenerations,
        codex: {
          ...current.sourceLaneGenerations.codex,
          membership: current.sourceLaneGenerations.codex.membership + 1
        }
      },
      tasks: [base, {
        ...base,
        key: newKey,
        actionAlias: `alias-${newKey}`,
        revisionAt: now + 2,
        membershipRevision: now + 2,
        phaseRevision: now + 2,
        unreadRevision: now + 2,
        visibilityRevision: now + 2,
        statusEnteredAt: now + 2,
        lastQuestionAt: now + 2,
        displayOrder: 1,
        cycleOrder: 1,
        attentionOrder: 1
      }]
    })

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

  it('recovers a Codex membership gap without rereading Claude inventory, state, unread, quota or environment', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(20_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      state.codex.settings.providers = { codex: true, claude: true }
      const sourceFingerprint = 'f'.repeat(64)
      let activityGeneration = 1
      let codexTaskReads = 0
      let activityListener: (delta: any) => void = () => undefined
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
                    activityGeneration
                  }
                }
              : { ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now() } }
          },
          onActivityChanged: (listener: (delta: any) => void) => { activityListener = listener; return () => { activityListener = () => undefined } },
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
      expect(claudeReads).toEqual({ environment: 1, inventory: 1, unread: 1, quota: 1 })

      activityGeneration = 2
      activityListener({
        version: 2,
        generation: 2,
        receivedAt: Date.now(),
        inventoryChanged: true,
        desktopBridgeState: 'connected',
        sourceFingerprint,
        entries: []
      })
      await vi.advanceTimersByTimeAsync(201)
      await Promise.resolve()

      expect(codexTaskReads).toBe(2)
      expect(claudeReads).toEqual({ environment: 1, inventory: 1, unread: 1, quota: 1 })
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves one atomic degraded task package when the production adapter reports task-state-v5', async () => {
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
    expect(controller.view().taskState).toMatchObject({
      compatibility: 'degraded',
      sourceRevision: 'task-state-v5',
      conversations: { status: 'ok', ongoingCount: 1 },
      dynamic: { compactCounts: { active: 0 } }
    })
    expect(controller.view().conversations).toBe(controller.view().taskState.conversations)
    expect(messages.at(-1)).toContain('状态已保留')
    expect(controller.floatSnapshot().taskStateRevision).toBe(CODEX_TASK_STATE_REVISION)
    expect(controller.floatSnapshot().taskState).toBe(controller.view().taskState)
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

  it('keeps quota and task projections independent when one snapshot lane fails', async () => {
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
    expect(controller.view().conversations).toMatchObject({ status: 'ok', ongoingCount: 1, runningCount: 0, unknownCount: 0 })

    failedLane = 'threads'
    await controller.refresh()
    expect(controller.view().quota).toMatchObject({ status: 'ok', plan: 'pro' })
    expect(controller.view().config.model).toBe('gpt-5.6')
    expect(controller.view().conversations).toMatchObject({ status: 'stale', ongoingCount: 1, runningCount: 0, unknownCount: 0 })
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
    expect(controller.view().conversations).toMatchObject({ status: 'ok', completeness: 'verified', sourceCount: 1 })
    verified = false
    await controller.refresh()
    expect(controller.view().conversations).toMatchObject({ status: 'stale', completeness: 'verified', sourceCount: 1 })
    expect(controller.view().conversations.all[0].name).toBe('已验证任务')
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
      expect(controller.view().conversations).toMatchObject({ status: 'ok', ongoingCount: 1, sourceCount: 1 })

      includeTask = false
      vi.setSystemTime(10_100)
      await controller.refresh()
      expect(controller.view().conversations).toMatchObject({ status: 'stale', ongoingCount: 1, sourceCount: 1 })
      expect(controller.view().conversations.all[0]).toMatchObject({ key: taskKey, name: '稳定任务' })
      expect(messages.at(-1)).toContain('已保留上一份稳定清单')

      vi.setSystemTime(10_500)
      await controller.refresh()
      expect(controller.view().conversations).toMatchObject({ status: 'stale', ongoingCount: 1, sourceCount: 1 })

      vi.setSystemTime(25_100)
      await controller.refresh()
      expect(controller.view().conversations).toMatchObject({ status: 'ok', ongoingCount: 0, sourceCount: 0 })
      expect(controller.view().conversations.all).toEqual([])
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
      expect(controller.view().conversations.all.map((task) => task.key)).toEqual([taskKey])

      includeTask = false
      await controller.refresh()
      expect(controller.view().conversations).toMatchObject({ status: 'stale', sourceCount: 1 })
      await vi.advanceTimersByTimeAsync(200)
      expect(taskReads).toBe(3)
      expect(controller.view().conversations.all.map((task) => task.key)).toEqual([taskKey])

      await vi.advanceTimersByTimeAsync(2_799)
      expect(controller.view().conversations.all.map((task) => task.key)).toEqual([taskKey])
      await vi.advanceTimersByTimeAsync(1)
      expect(taskReads).toBe(4)
      expect(controller.view().conversations).toMatchObject({ status: 'ok', sourceCount: 0 })
      expect(controller.view().conversations.all).toEqual([])
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
    expect(controller.view().conversations).toMatchObject({ status: 'ok', ongoingCount: 2, sourceCount: 2 })

    secondSnapshot = true
    await controller.refresh()
    expect(controller.view().conversations).toMatchObject({ status: 'stale', ongoingCount: 1, completedUnreadCount: 1, sourceCount: 2 })
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: updatedKey, bucket: 'completed-unread' })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: missingKey })
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
    expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 250, archiveCapability: 'allowed' })

    turn = { status: 'failed', startedAt: 200, completedAt: 0 }
    receivedAt = 400
    await controller.refresh()
    expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 250, archiveCapability: 'allowed' })
    expect(controller.view().conversations.ongoing).toEqual([])

    turn = { status: 'failed', startedAt: 350, completedAt: 0 }
    receivedAt = 500
    await controller.refresh()
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing', archiveCapability: 'blocked-active' })
    expect(controller.view().conversations.completed).toEqual([])
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
    expect(controller.setAlias('task', taskKey, '任务别名')).toBe(true)
    expect(controller.setAlias('project', projectKey, '项目别名')).toBe(true)
    expect(controller.toggleLocalPin('project', projectKey)).toBe(true)
    expect(controller.hideProject(projectKey)).toBe(true)
    expect(state.codex).toMatchObject({ lastTaskTab: 'projects', collapsedProjectKeys: [projectKey], taskAliases: [{ key: taskKey, alias: '任务别名' }], projectAliases: [{ key: projectKey, alias: '项目别名' }], localPins: [{ kind: 'project', key: projectKey }], hiddenProjectKeys: [projectKey] })
    expect(controller.view().conversations.activeTab).toBe('projects')
    expect(controller.view().conversations.hiddenProjects[0]).toMatchObject({ key: projectKey, name: '项目别名' })
    expect(controller.view().conversations.all).toEqual([expect.objectContaining({ key: taskKey })])

    await expect(controller.removeProject(projectKey, 'project-alias', 'a'.repeat(64))).resolves.toBe(true)
    expect(removeProject).toHaveBeenCalledTimes(1)
    expect(state.codex).toMatchObject({
      lastTaskTab: 'projects',
      collapsedProjectKeys: [],
      taskAliases: [{ key: taskKey, alias: '任务别名' }],
      projectAliases: [],
      localPins: [],
      hiddenProjectKeys: []
    })
    expect(controller.view().conversations.projects.some((project) => project.key === projectKey)).toBe(false)
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

  it('rejects an old task snapshot across inbox disable and re-enable', async () => {
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
    expect(controller.view().conversations.all.map((task) => task.key)).toEqual([initialKey])

    const obsoleteRefresh = controller.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(taskReads).toBe(2)
    controller.updateSettings({ conversationInboxEnabled: false })
    expect(controller.view().conversations.all).toEqual([])
    controller.updateSettings({ conversationInboxEnabled: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(taskReads).toBe(3)

    releaseStale(hostResult(staleKey, '过期任务', 2))
    await obsoleteRefresh
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().conversations.all.map((task) => task.key)).toEqual([freshKey])
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
    expect(controller.view().conversations.all.map((task) => task.key).sort()).toEqual([archivedKey, deletedKey, retainedKey])
    expect(controller.view().conversations.projects.some((project) => project.key === oldProjectKey)).toBe(true)

    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: false } : item)
    controller.syncActivation()
    expect(controller.view().conversations.all).toEqual([])
    reopened = true
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'codex' ? { ...item, enabled: true } : item)
    controller.syncActivation()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect({ quotaReads, taskReads }).toEqual({ quotaReads: 2, taskReads: 2 })
    expect(closeCount).toBeGreaterThan(0)
    expect(controller.view().config.model).toBe('reopened-model')
    expect(controller.view().conversations).toMatchObject({ status: 'ok', sourceCount: 2, completeness: 'verified' })
    expect(controller.view().conversations.all.map((task) => task.key).sort()).toEqual([addedKey, retainedKey])
    expect(controller.view().conversations.all.find((task) => task.key === retainedKey)).toMatchObject({
      projectKey: newProjectKey,
      projectName: '新项目'
    })
    expect(controller.view().conversations.projects.some((project) => project.key === oldProjectKey)).toBe(false)
    expect(controller.view().conversations.projects.find((project) => project.key === newProjectKey)).toMatchObject({
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

    const firstBindings = [{ actionId: 'codex.input.open', shortcutId: 'Alt+I', layer: 'codex', when: "tab == 'codex'", weight: 100 }]
    const first = controller.floatSnapshot(firstBindings)
    expect(first).toMatchObject({ style: 'water', colors: state.codex.settings.colors, baseRevision: 1, keybindings: firstBindings })
    expect(controller.floatSnapshot(firstBindings)).toBe(first)
    expect(controller.updateSettings({ displayStyle: 'card', colors })).toBe(true)
    const appearance = controller.floatSnapshot(firstBindings)
    expect(appearance).toMatchObject({ style: 'card', colors, baseRevision: 2 })
    expect(appearance.companionTaskPackage).toBe(first.companionTaskPackage)
    const secondBindings = [{ ...firstBindings[0], shortcutId: 'Alt+Shift+I' }]
    const shortcuts = controller.floatSnapshot(secondBindings)
    expect(shortcuts).toMatchObject({ baseRevision: 3, keybindings: secondBindings })
    expect(shortcuts.companionTaskPackage).toBe(first.companionTaskPackage)
    expect(save).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('projects waiting-input activity notifications immediately without a full snapshot refresh', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'a'.repeat(64)
    const taskKey = 'abcdef0123456789'
    const activityListeners: Array<(delta: any) => void> = []
    let snapshotReads = 0
    const platform = {
      codex: {
        inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt: 100 }),
        readSnapshot: async (options: Record<string, boolean>) => {
          snapshotReads += 1
          const receivedAt = Date.now()
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, threads: [{ key: taskKey, actionAlias: 'activity-alias', name: '实时待输入', status: 'active' as const, activeFlags: [], statusAuthority: 'connector' as const, hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' as const, updatedAt: receivedAt - 10, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: receivedAt - 20, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    let notifyCount = 0
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => { notifyCount += 1 }, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(activityListeners[0]).toBeTypeOf('function')
    const readsAfterBaseline = snapshotReads
    const receivedAt = Date.now() + 10_000
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: ['waitingOnUserInput'], planImplementationOnly: true, statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.inputRequired).toHaveLength(1)
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input', planImplementationOnly: true })
    expect(snapshotReads).toBe(readsAfterBaseline)

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, readStateOnly: true, hasUnreadTurn: true, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({ key: taskKey, planImplementationOnly: true })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 3, receivedAt: receivedAt + 2, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], planImplementationOnly: false, statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.inputRequired).toHaveLength(0)
    expect(notifyCount).toBeGreaterThan(0)
    controller.dispose()
  })

  it('publishes 100 complete waiting-input cycles under 100ms P95 while full reads are blocked', async () => {
    for (const scenarioOffset of [0, 86_400]) {
      const state = createInitialState(1)
      state.activeTab = 'ports'
      state.codex.settings.floatEnabled = false
      const sourceFingerprint = `${scenarioOffset || 1}`.padEnd(64, 'c').slice(0, 64)
      const taskKey = scenarioOffset === 0 ? 'abcdef0123456701' : 'abcdef0123456702'
      const activityListeners: Array<(delta: any) => void> = []
      let snapshotReads = 0
      let blockSnapshot = false
      let releaseSnapshot!: (value: any) => void
      const blockedSnapshot = new Promise<any>((resolvePromise) => { releaseSnapshot = resolvePromise })
      const snapshot = (receivedAt: number) => ({
        ok: true as const,
        receivedAt,
        value: {
          version: 2 as const,
          receivedAt,
          threads: [{
            key: taskKey,
            actionAlias: `hot-edge-alias-${scenarioOffset}`,
            name: '双向热通路',
            status: 'active' as const,
            activeFlags: [],
            statusAuthority: 'app-server-live' as const,
            hasUnreadTurn: false,
            unreadAuthority: 'desktop-live' as const,
            updatedAt: receivedAt - 10,
            lastTurnStatus: 'inProgress' as const,
            lastTurnStartedAt: receivedAt - 20,
            projectKey: 'chats',
            projectName: 'Chats',
            projectKind: 'chats' as const
          }],
          projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
          sourceFingerprint,
          completeness: 'verified' as const,
          activityGeneration: 0
        }
      })
      const baseline = snapshot(Date.now())
      const platform = {
        codex: {
          inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'running' as const, configState: 'detected' as const, connectionState: 'connected' as const, desktopBridgeState: 'connected' as const, checkedAt: Date.now() }),
          readSnapshot: async () => {
            snapshotReads += 1
            return blockSnapshot ? await blockedSnapshot : baseline
          },
          readActivitySnapshot: async () => await new Promise<never>(() => undefined),
          onActivityChanged: (listener: (delta: any) => void) => {
            activityListeners.push(listener)
            return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
          },
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
      const readsAfterBaseline = snapshotReads
      blockSnapshot = true
      const stalledRefresh = controller.refresh()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(snapshotReads).toBe(readsAfterBaseline + 1)

      const latencies: number[] = []
      let generation = 0
      const edge = (activeFlags: string[], receivedAt: number) => {
        const startedAt = performance.now()
        activityListeners[0]({
          version: 2,
          sourceFingerprint,
          generation: ++generation,
          receivedAt,
          inventoryChanged: false,
          desktopBridgeState: 'connected',
          entries: [{
            key: taskKey,
            status: 'active',
            activeFlags,
            statusAuthority: 'app-server-live',
            hasUnreadTurn: false,
            unreadAuthority: 'desktop-live'
          }]
        })
        latencies.push(performance.now() - startedAt)
      }
      for (let cycle = 0; cycle < 100; cycle += 1) {
        const receivedAt = baseline.receivedAt + cycle * 2 + 1
        edge(['waitingOnUserInput'], receivedAt)
        expect(controller.view().conversations.inputRequired).toHaveLength(1)
        expect(controller.view().conversations.all).toHaveLength(1)
        edge([], receivedAt + 1)
        expect(controller.view().conversations.inputRequired).toHaveLength(0)
        expect(controller.view().conversations.ongoing).toHaveLength(1)
        expect(controller.view().conversations.all).toHaveLength(1)
      }
      const ordered = [...latencies].sort((left, right) => left - right)
      expect(ordered[Math.ceil(ordered.length * 0.95) - 1]).toBeLessThan(100)
      expect(snapshotReads).toBe(readsAfterBaseline + 1)

      releaseSnapshot(baseline)
      await stalledRefresh
      controller.dispose()
    }
  })

  it('does not keep a Renderer phase-only watchdog after native recovery moves to Host', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(20_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'ports'
      state.codex.settings.floatEnabled = false
      const readActivitySnapshot = vi.fn(async () => ({
        ok: true as const,
        receivedAt: Date.now(),
        value: { version: 2 as const, sourceFingerprint: 'd'.repeat(64), generation: 1, receivedAt: Date.now(), inventoryChanged: false, entries: [] }
      }))
      const platform = {
        codex: {
          inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'running' as const, configState: 'detected' as const, connectionState: 'connected' as const, desktopBridgeState: 'connected' as const, checkedAt: Date.now() }),
          readSnapshot: async () => ({ ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now(), threads: [], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint: 'd'.repeat(64), completeness: 'verified' as const } }),
          readActivitySnapshot,
          onActivityChanged: () => () => undefined,
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(30_000)

      expect(readActivitySnapshot).not.toHaveBeenCalled()
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an exact persisted ordinary input decision through the full inventory projection', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const receivedAt = Date.now()
    const taskKey = 'abcedf0123456789'
    const platform = {
      codex: {
        readSnapshot: async () => ({
          ok: true as const,
          receivedAt,
          value: {
            version: 2 as const,
            receivedAt,
            threads: [{
              key: taskKey,
              actionAlias: 'persisted-input-alias',
              name: '持久待输入',
              status: 'active' as const,
              activeFlags: ['waitingOnUserInput' as const],
              statusAuthority: 'persisted-decision' as const,
              updatedAt: receivedAt - 10,
              lastTurnStatus: 'interrupted' as const,
              lastTurnStartedAt: receivedAt - 20,
              projectKey: 'chats',
              projectName: 'Chats',
              projectKind: 'chats' as const
            }],
            projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
            sourceFingerprint: 'c'.repeat(64),
            completeness: 'verified' as const
          }
        }),
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

    await controller.refresh()

    expect(controller.view().conversations.inputRequired).toHaveLength(1)
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({
      key: taskKey,
      activityState: 'waiting-input',
      archiveCapability: 'blocked-active'
    })
    controller.dispose()
  })

  it('keeps a completed persisted Plan in waiting-input regardless of unread until a newer Turn starts', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'b'.repeat(64)
    const taskKey = 'bcdef0123456789a'
    const activityListeners: Array<(delta: any) => void> = []
    const completedAt = Date.now() - 1_000
    const platform = {
      codex: {
        readSnapshot: async () => {
          const receivedAt = Date.now()
          return {
            ok: true as const,
            receivedAt,
            value: {
              version: 2 as const,
              receivedAt,
              threads: [{
                key: taskKey,
                actionAlias: 'persisted-plan-alias',
                name: '待实现 Plan',
                status: 'active' as const,
                activeFlags: ['waitingOnUserInput' as const],
                planImplementationOnly: true,
                statusAuthority: 'persisted-decision' as const,
                hasUnreadTurn: true,
                unreadAuthority: 'desktop-persisted' as const,
                updatedAt: completedAt,
                lastTurnStatus: 'completed' as const,
                lastTurnStartedAt: completedAt - 100,
                lastTurnCompletedAt: completedAt,
                projectKey: 'chats',
                projectName: 'Chats',
                projectKind: 'chats' as const
              }],
              projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
              sourceFingerprint,
              completeness: 'verified' as const
            }
          }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({
      key: taskKey,
      activityState: 'waiting-input',
      planImplementationOnly: true
    })
    expect(controller.view().conversations.completedUnread).toHaveLength(0)

    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 1,
      receivedAt: Date.now() + 10_000,
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{
        key: taskKey,
        status: 'active',
        activeFlags: [],
        planImplementationOnly: false,
        statusAuthority: 'app-server-live',
        activityEvidence: 'activity-event',
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: Date.now() + 9_000,
        hasUnreadTurn: false,
        unreadAuthority: 'desktop-live'
      }]
    })
    expect(controller.view().conversations.inputRequired).toHaveLength(0)
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
    controller.dispose()
  })

  it('applies a Desktop read-state delta without resurrecting activity', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'e'.repeat(64)
    const taskKey = 'fedcba9876543210'
    const completedAt = Date.now() - 2_000
    const activityListeners: Array<(delta: any) => void> = []
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = Date.now()
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, threads: [{ key: taskKey, actionAlias: 'read-state-alias', name: '已读不得重启任务', status: 'idle' as const, activeFlags: [], statusAuthority: 'desktop-live' as const, hasUnreadTurn: true, unreadAuthority: 'desktop-live' as const, updatedAt: receivedAt - 10, lastTurnStatus: 'completed' as const, lastTurnStartedAt: completedAt - 100, lastTurnCompletedAt: completedAt, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, completedUnreadCount: 1 })

    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 1,
      receivedAt: Date.now(),
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{
        key: taskKey,
        readStateOnly: true,
        status: 'active',
        activeFlags: ['waitingOnUserInput'],
        statusAuthority: 'desktop-live',
        desktopActiveSince: Date.now(),
        hasUnreadTurn: false,
        unreadAuthority: 'desktop-live',
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: Date.now()
      }]
    })

    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, completedUnreadCount: 0, completedCount: 1 })
    expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, unreadState: 'read' })

    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 3,
      receivedAt: Date.now() + 2,
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{
        key: taskKey,
        readStateOnly: true,
        hasUnreadTurn: true,
        unreadAuthority: 'desktop-persisted'
      }]
    })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, completedUnreadCount: 1, completedCount: 0 })
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey, bucket: 'completed-unread', unreadState: 'unread' })
    controller.dispose()
  })

  it('lets a newer completed Turn displace an earlier Desktop active observation without a stale-shadow timeout', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'd'.repeat(64)
    const taskKey = '0123fedcba987654'
    const activityListeners: Array<(delta: any) => void> = []
    const activeSince = Date.now() - 2_000
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = Date.now()
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, threads: [{ key: taskKey, actionAlias: 'stale-shadow-alias', name: '过期活跃 shadow', status: 'notLoaded' as const, activeFlags: [], statusAuthority: 'connector' as const, hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' as const, updatedAt: receivedAt - 10, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: activeSince - 100, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const receivedAt = Date.now()
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', desktopActiveSince: activeSince, hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', desktopActiveSince: activeSince, hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: activeSince + 500, lastTurnCompletedAt: activeSince + 1_000, lastTurnEvidence: 'turn-completed' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, completedCount: 1 })
    expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: activeSince + 1_000 })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 3, receivedAt: receivedAt + 2, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'initial-snapshot', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'inProgress', lastTurnStartedAt: activeSince + 500, lastTurnEvidence: 'turn-started' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, completedCount: 0 })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
    controller.dispose()
  })

  it('keeps interrupted non-terminal until targeted idle confirmation and rejects stale inventory resurrection', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'b'.repeat(64)
    const taskKey = '1234567890abcdef'
    const baselineTurnStartedAt = Date.now() - 1_000
    const activityListeners: Array<(delta: any) => void> = []
    let fullThread: CodexHostThread = { key: taskKey, actionAlias: 'stopped-alias', name: '停止边界', status: 'notLoaded', activeFlags: [], statusAuthority: 'connector', hasUnreadTurn: false, unreadAuthority: 'desktop-persisted', updatedAt: Date.now() - 10, lastTurnStatus: 'interrupted', lastTurnStartedAt: baselineTurnStartedAt, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' }
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = Date.now()
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, threads: [fullThread], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const receivedAt = Date.now() + 1_000
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: baselineTurnStartedAt, lastTurnEvidence: 'turn-completed' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 3, receivedAt: receivedAt + 2, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: baselineTurnStartedAt, lastTurnEvidence: 'targeted-after-exit', idleConfirmed: true }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, stoppedCount: 1 })
    expect(projectCodexDynamicStatus(controller.view().conversations, receivedAt + 2).compactCounts.active).toBe(0)

    fullThread = {
      ...fullThread,
      status: 'idle',
      updatedAt: receivedAt + 1,
      lastTurnStatus: 'interrupted',
      lastTurnStartedAt: baselineTurnStartedAt,
      lastTurnEvidence: 'targeted-after-exit',
      idleConfirmed: true
    }
    await controller.refresh()
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, stoppedCount: 1 })
    expect(controller.view().conversations.stopped[0]).toMatchObject({ key: taskKey, activityState: 'stopped' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 4, receivedAt: receivedAt + 3, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: true, unreadAuthority: 'desktop-persisted', lastTurnStatus: 'completed', lastTurnStartedAt: baselineTurnStartedAt, lastTurnCompletedAt: receivedAt + 3, lastTurnEvidence: 'targeted-after-exit' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, stoppedCount: 0, completedUnreadCount: 1 })
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey, bucket: 'completed-unread', unreadState: 'unread', archiveCapability: 'allowed' })
    expect(projectCodexDynamicStatus(controller.view().conversations, receivedAt + 3)).toMatchObject({
      compactCounts: { active: 0 },
      groups: { active: [], unread: [{ key: taskKey }] }
    })

    const resumedTurnStartedAt = baselineTurnStartedAt + 100
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 5, receivedAt: receivedAt + 4, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'inProgress', lastTurnStartedAt: resumedTurnStartedAt, lastTurnEvidence: 'turn-started' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 6, receivedAt: receivedAt + 5, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: resumedTurnStartedAt, lastTurnEvidence: 'targeted-after-exit', idleConfirmed: true }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, stoppedCount: 1 })
    expect(projectCodexDynamicStatus(controller.view().conversations, receivedAt + 5).compactCounts.active).toBe(0)
    controller.dispose()
  })

  it('ignores the legacy presentation delay and publishes every fresh completion revision immediately', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      const sourceFingerprint = 'c'.repeat(64)
      const taskKey = 'fedcba9876543210'
      const activityListeners: Array<(delta: any) => void> = []
      let snapshotReads = 0
      let fullThread: CodexHostThread = { key: taskKey, actionAlias: 'targeted-alias', name: '实时完成核验', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', desktopActiveSince: 9_900, hasUnreadTurn: false, unreadAuthority: 'desktop-live', updatedAt: 9_900, lastTurnStatus: 'inProgress', lastTurnStartedAt: 9_000, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' }
      const platform = {
        codex: {
          readSnapshot: async (options: Record<string, boolean>) => {
            snapshotReads += 1
            return options.includeThreads
              ? {
                  ok: true as const,
                  receivedAt: 10_000,
                  value: {
                    version: 2 as const,
                    receivedAt: 10_000,
                    threads: [fullThread],
                    projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                    sourceFingerprint,
                    completeness: 'verified' as const
                  }
                }
              : { ok: true as const, receivedAt: 10_000, value: { version: 2 as const, receivedAt: 10_000 } }
          },
          readActivitySnapshot: async () => await new Promise<never>(() => undefined),
          onActivityChanged: (listener: (delta: any) => void) => {
            activityListeners.push(listener)
            return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
          },
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
      const readsAfterBaseline = snapshotReads

      activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt: 10_000, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
      expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })
      expect(projectCodexDynamicStatus(controller.view().conversations, 10_000)).toMatchObject({
        compactCounts: { active: 0 },
        groups: { active: [] }
      })

      await vi.advanceTimersByTimeAsync(100)
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: 10_100, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: 9_000, lastTurnCompletedAt: 9_500 }] })
      expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 9_500 })
      expect(controller.view().conversations.ongoing).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(100)
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 3, receivedAt: 10_200, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: 9_800, lastTurnCompletedAt: 10_100 }] })
      expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 10_100 })
      expect(controller.view().conversations.ongoing).toHaveLength(0)
      expect(snapshotReads).toBe(readsAfterBaseline)

      expect(projectCodexDynamicStatus(controller.view().conversations, 11_500)).toMatchObject({
        compactCounts: { active: 0 },
        groups: { active: [], completed: [{ key: taskKey, archiveCapability: 'allowed' }] }
      })

      activityListeners[0]({ version: 2, sourceFingerprint, generation: 4, receivedAt: 11_400, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: ['waitingOnApproval'], statusAuthority: 'desktop-live', desktopActiveSince: 11_400, hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: 9_800, lastTurnCompletedAt: 10_100 }] })
      expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'waiting-approval' })
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 5, receivedAt: 11_401, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: 9_800, lastTurnCompletedAt: 10_100, lastTurnEvidence: 'targeted-after-exit' }] })
      expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 10_100 })

      fullThread = {
        ...fullThread,
        status: 'idle',
        activeFlags: [],
        updatedAt: 11_401,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 9_800,
        lastTurnCompletedAt: 10_100
      }
      await controller.refresh()
      expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 10_100 })
      expect(controller.view().conversations.ongoing).toHaveLength(0)

      activityListeners[0]({ version: 2, sourceFingerprint, generation: 6, receivedAt: 11_500, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', desktopActiveSince: 11_500, hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: 11_000 }] })
      expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
      expect(projectCodexDynamicStatus(controller.view().conversations, 11_500).compactCounts.active).toBe(1)
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 7, receivedAt: 11_502, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', desktopActiveSince: 11_500, hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: 11_000, lastTurnCompletedAt: 11_000, lastTurnEvidence: 'targeted-after-exit' }] })
      expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: 11_000 })
      expect(controller.view().conversations.ongoing).toHaveLength(0)
      expect(projectCodexDynamicStatus(controller.view().conversations, 11_502)).toMatchObject({
        compactCounts: { active: 0 },
        groups: { active: [], completed: [{ key: taskKey, archiveCapability: 'allowed' }] }
      })

      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces urgent inventory events for 50ms and replays one that arrives during an in-flight scan', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      const sourceFingerprint = 'd'.repeat(64)
      const activityListeners: Array<(delta: any) => void> = []
      const makeThread = (key: string, offset: number): CodexHostThread => ({
        key,
        actionAlias: `alias-${key}`,
        name: `新增任务 ${offset}`,
        status: 'notLoaded',
        activeFlags: [],
        statusAuthority: 'connector',
        hasUnreadTurn: false,
        unreadAuthority: 'desktop-persisted',
        updatedAt: 9_900 + offset,
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: 9_000 + offset,
        projectKey: 'chats',
        projectName: 'Chats',
        projectKind: 'chats'
      })
      const first = makeThread('1111111111111111', 1)
      const second = makeThread('2222222222222222', 2)
      const third = makeThread('3333333333333333', 3)
      let currentThreads = [first]
      let snapshotGeneration = 0
      let threadReads = 0
      let releaseSecondRead: (value: any) => void = () => undefined
      const secondRead = new Promise<any>((resolve) => { releaseSecondRead = resolve })
      const snapshot = (threads: CodexHostThread[], receivedAt = Date.now(), activityGeneration = snapshotGeneration) => ({
        ok: true as const,
        receivedAt,
        value: {
          version: 2 as const,
          receivedAt,
          threads,
          projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
          sourceFingerprint,
          completeness: 'verified' as const,
          ...(activityGeneration > 0 ? { activityGeneration } : {})
        }
      })
      const platform = {
        codex: {
          inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'running' as const, configState: 'detected' as const, connectionState: 'connected' as const, desktopBridgeState: 'connected' as const, checkedAt: Date.now() }),
          readSnapshot: async (options: Record<string, boolean>) => {
            if (!options.includeThreads) return { ok: true as const, receivedAt: Date.now(), value: { version: 2 as const, receivedAt: Date.now() } }
            threadReads += 1
            if (threadReads === 2) return await secondRead
            return snapshot([...currentThreads])
          },
          readActivitySnapshot: async () => await new Promise<never>(() => undefined),
          onActivityChanged: (listener: (delta: any) => void) => {
            activityListeners.push(listener)
            return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
          },
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(threadReads).toBe(1)

      currentThreads = [first, second]
      snapshotGeneration = 1
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt: 10_001, inventoryChanged: true, inventoryRefreshPriority: 'urgent', desktopBridgeState: 'connected', entries: [] })
      await vi.advanceTimersByTimeAsync(49)
      expect(threadReads).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(threadReads).toBe(2)

      currentThreads = [first, second, third]
      snapshotGeneration = 2
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: 10_051, inventoryChanged: true, inventoryRefreshPriority: 'urgent', desktopBridgeState: 'connected', entries: [] })
      releaseSecondRead(snapshot([first, second], 10_050, 1))
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.view().conversations.all).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(49)
      expect(threadReads).toBe(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(threadReads).toBe(3)
      expect(controller.view().conversations.all).toHaveLength(3)
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies known direct completion even when the same delta contains an unknown inventory key', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = '7'.repeat(64)
    const taskKey = '13572468abcdef01'
    const unknownKey = '24681357abcdef02'
    const startedAt = 8_000
    const activityListeners: Array<(delta: any) => void> = []
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = 9_000
          return options.includeThreads
            ? {
                ok: true as const,
                receivedAt,
                value: {
                  version: 2 as const,
                  receivedAt,
                  activityGeneration: 1,
                  threads: [{
                    key: taskKey,
                    actionAlias: 'known-direct-alias',
                    name: '已登记任务',
                    status: 'active' as const,
                    activeFlags: [],
                    statusAuthority: 'app-server-live' as const,
                    activityEvidence: 'activity-event' as const,
                    updatedAt: receivedAt,
                    lastTurnStatus: 'inProgress' as const,
                    lastTurnStartedAt: startedAt,
                    lastTurnEvidence: 'turn-started' as const,
                    projectKey: 'chats',
                    projectName: 'Chats',
                    projectKind: 'chats' as const
                  }],
                  projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                  sourceFingerprint,
                  completeness: 'verified' as const
                }
              }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 2,
      receivedAt: 9_001,
      inventoryChanged: true,
      inventoryRefreshPriority: 'urgent',
      desktopBridgeState: 'connected',
      entries: [
        {
          key: taskKey,
          status: 'active',
          activeFlags: [],
          statusAuthority: 'app-server-live',
          activityEvidence: 'activity-event',
          lastTurnStatus: 'completed',
          lastTurnStartedAt: startedAt,
          lastTurnEvidence: 'turn-completed',
          hasUnreadTurn: true,
          unreadAuthority: 'desktop-persisted'
        },
        {
          key: unknownKey,
          status: 'active',
          activeFlags: [],
          statusAuthority: 'app-server-live',
          lastTurnStatus: 'inProgress',
          lastTurnStartedAt: startedAt + 1
        }
      ]
    })

    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey, bucket: 'completed-unread' })
    expect(controller.view().conversations.ongoing).toHaveLength(0)
    controller.dispose()
  })

  it('preserves confirmed completion across an active inventory replay without provenance', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = '8'.repeat(64)
    const taskKey = 'abcdef0123456788'
    const startedAt = 10_000
    let fullThread: CodexHostThread = {
      key: taskKey,
      actionAlias: 'provenance-alias',
      name: '完成证据不得丢失',
      status: 'active',
      activeFlags: [],
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      updatedAt: 10_100,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: startedAt,
      lastTurnEvidence: 'turn-started',
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    }
    const activityListeners: Array<(delta: any) => void> = []
    let activityGeneration = 1
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = 10_200 + activityGeneration
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, activityGeneration, threads: [fullThread], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: 10_300, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'app-server-live', activityEvidence: 'activity-event', lastTurnStatus: 'completed', lastTurnStartedAt: startedAt, lastTurnEvidence: 'turn-completed', hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' }] })
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey })

    activityGeneration = 3
    fullThread = {
      ...fullThread,
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      updatedAt: 10_400,
      lastTurnStatus: 'completed',
      lastTurnStartedAt: startedAt,
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    }
    delete fullThread.lastTurnEvidence
    await controller.refresh()

    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey, bucket: 'completed-unread' })
    expect(controller.view().conversations.ongoing).toHaveLength(0)
    controller.dispose()
  })

  it('accepts confirmed same-revision completion directly from a full snapshot after live active', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'a'.repeat(64)
    const taskKey = 'abcdef01234567aa'
    const startedAt = 30_000
    const completedAt = 30_100
    let activityGeneration = 1
    let fullThread: CodexHostThread = {
      key: taskKey,
      actionAlias: 'snapshot-completion-alias',
      name: '快照确认完成',
      status: 'active',
      activeFlags: [],
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      updatedAt: 30_200,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: startedAt,
      lastTurnEvidence: 'turn-started',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted',
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    }
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = 30_300 + activityGeneration
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, activityGeneration, threads: [fullThread], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: () => () => undefined,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })

    activityGeneration = 2
    fullThread = {
      ...fullThread,
      status: 'idle',
      activityEvidence: 'activity-event',
      updatedAt: 30_400,
      lastTurnStatus: 'completed',
      lastTurnCompletedAt: completedAt,
      lastTurnEvidence: 'snapshot-corroborated'
    }
    await controller.refresh()

    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey, bucket: 'completed-unread' })
    expect(controller.view().conversations.ongoing).toHaveLength(0)
    controller.dispose()
  })

  it('uses the full-snapshot activity generation as a stale-delta barrier', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = '9'.repeat(64)
    const taskKey = 'abcdef0123456799'
    const baselineReceivedAt = Date.now() + 1_000
    const activityListeners: Array<(delta: any) => void> = []
    let notifyCount = 0
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = baselineReceivedAt
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, activityGeneration: 5, threads: [{ key: taskKey, actionAlias: 'barrier-alias', name: '顺序屏障', status: 'idle' as const, activeFlags: [], statusAuthority: 'desktop-live' as const, updatedAt: receivedAt, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: receivedAt - 1_000, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => { notifyCount += 1 }, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 4, receivedAt: baselineReceivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 6, receivedAt: baselineReceivedAt + 2, inventoryChanged: false, desktopBridgeState: 'connected', decisionDiagnostics: { liveEpochOpened: 2, staleTurnDiscarded: 1, branchTerminalDeferred: 0, snapshotConflictSuppressed: 0, missingMappingRetained: 0 }, entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'activity-event' }] })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
    expect(controller.view().activityDecisionDiagnostics.liveEpochOpened).toBe(2)

    const notifyBeforeDiagnosticsOnly = notifyCount
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 7, receivedAt: baselineReceivedAt + 2.5, inventoryChanged: false, desktopBridgeState: 'connected', decisionDiagnostics: { liveEpochOpened: -2, staleTurnDiscarded: Number.POSITIVE_INFINITY, branchTerminalDeferred: '3', snapshotConflictSuppressed: 2.9, missingMappingRetained: Number.MAX_VALUE }, entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live' }] })
    expect(controller.view().activityDecisionDiagnostics).toEqual({
      liveEpochOpened: 0,
      hydrationActiveDeferred: 0,
      staleTurnDiscarded: 0,
      branchTerminalDeferred: 0,
      snapshotConflictSuppressed: 2,
      missingMappingRetained: Number.MAX_SAFE_INTEGER,
      waitingEdgeResubscribe: 0,
      waitingEdgeRecoveryExpired: 0
    })
    expect(notifyCount).toBe(notifyBeforeDiagnosticsOnly + 1)

    const notifyBeforeUnchangedDiagnostics = notifyCount
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 8, receivedAt: baselineReceivedAt + 2.75, inventoryChanged: false, desktopBridgeState: 'connected', decisionDiagnostics: { liveEpochOpened: 0, staleTurnDiscarded: 0, branchTerminalDeferred: 0, snapshotConflictSuppressed: 2, missingMappingRetained: Number.MAX_SAFE_INTEGER }, entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live' }] })
    expect(notifyCount).toBe(notifyBeforeUnchangedDiagnostics)

    const notifyBeforeStaleDelta = notifyCount
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 5, receivedAt: baselineReceivedAt + 3, inventoryChanged: false, desktopBridgeState: 'not-running', decisionDiagnostics: { liveEpochOpened: 999, staleTurnDiscarded: 999, branchTerminalDeferred: 999, snapshotConflictSuppressed: 999, missingMappingRetained: 999 }, entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: 19_000 }] })
    expect(controller.view().environment.desktopBridgeState).toBe('connected')
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
    expect(controller.view().activityDecisionDiagnostics.liveEpochOpened).toBe(0)
    expect(notifyCount).toBe(notifyBeforeStaleDelta)
    controller.dispose()
  })

  it('keeps a newer activity delta when an older full snapshot resolves later', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'b'.repeat(64)
    const taskKey = 'abcdef01234567bb'
    const activityListeners: Array<(delta: any) => void> = []
    let snapshotCall = 0
    let olderSnapshotPending = false
    let releaseOlderSnapshot: () => void = () => undefined
    const snapshotThread = (status: 'active' | 'idle', activeFlags: CodexHostThread['activeFlags'] = []): CodexHostThread => ({
      key: taskKey,
      actionAlias: 'reverse-barrier-alias',
      name: '反向顺序屏障',
      status,
      activeFlags,
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activityRevision: 1,
      updatedAt: 40_000,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 39_000,
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    })
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = 40_000 + snapshotCall
          if (!options.includeThreads) return { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
          snapshotCall += 1
          if (snapshotCall === 1) {
            return { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, activityGeneration: 1, threads: [snapshotThread('idle')], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
          }
          await new Promise<void>((resolve) => {
            olderSnapshotPending = true
            releaseOlderSnapshot = () => resolve()
          })
          return { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, activityGeneration: 2, threads: [snapshotThread('idle')], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const pendingRefresh = controller.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(olderSnapshotPending).toBe(true)
    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 3,
      receivedAt: 40_100,
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{ key: taskKey, status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', activityRevision: 3, lastTurnStatus: 'inProgress', lastTurnStartedAt: 39_000 }]
    })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input' })

    releaseOlderSnapshot()
    await pendingRefresh
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input' })
    controller.dispose()
  })

  it('does not let an older completed-unread inventory recur after a newer opened-read delta', async () => {
    const state = createInitialState(1)
    state.activeTab = 'ports'
    state.codex.settings.floatEnabled = false
    const sourceFingerprint = 'd'.repeat(64)
    const taskKey = 'abcdef01234567dd'
    const activityListeners: Array<(delta: any) => void> = []
    let threadRead = 0
    let staleSnapshotPending = false
    let releaseStaleSnapshot: () => void = () => undefined
    const completedUnread: CodexHostThread = {
      key: taskKey,
      actionAlias: 'opened-read-barrier-alias',
      name: '已读不得复现',
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'connector',
      updatedAt: 50_000,
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 49_000,
      lastTurnCompletedAt: 50_000,
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted',
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    }
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          if (!options.includeThreads) return { ok: true as const, receivedAt: 50_000, value: { version: 2 as const, receivedAt: 50_000 } }
          threadRead += 1
          if (threadRead > 1) {
            await new Promise<void>((resolve) => {
              staleSnapshotPending = true
              releaseStaleSnapshot = resolve
            })
          }
          return {
            ok: true as const,
            receivedAt: 50_000 + threadRead,
            value: {
              version: 2 as const,
              receivedAt: 50_000 + threadRead,
              activityGeneration: threadRead,
              threads: [completedUnread],
              projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
              sourceFingerprint,
              completeness: 'verified' as const
            }
          }
        },
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey })

    const pendingRefresh = controller.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(staleSnapshotPending).toBe(true)
    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 3,
      receivedAt: 50_100,
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{ key: taskKey, readStateOnly: true, hasUnreadTurn: false, unreadAuthority: 'desktop-live' }]
    })
    expect(controller.view().conversations.completed).toEqual([expect.objectContaining({ key: taskKey, bucket: 'completed' })])

    releaseStaleSnapshot()
    await pendingRefresh
    expect(controller.view().conversations.completedUnread).toHaveLength(0)
    expect(controller.view().conversations.completed).toEqual([expect.objectContaining({ key: taskKey, bucket: 'completed' })])
    controller.dispose()
  })

  it('rejects a generationless V2 snapshot after a live generation is established', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const sourceFingerprint = 'c'.repeat(64)
    const taskKey = 'abcdef01234567cc'
    const activityListeners: Array<(delta: any) => void> = []
    const thread: CodexHostThread = {
      key: taskKey,
      actionAlias: 'missing-barrier-alias',
      name: '缺失代次屏障',
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'desktop-live',
      updatedAt: 50_000,
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 49_000,
      projectKey: 'chats',
      projectName: 'Chats',
      projectKind: 'chats'
    }
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = 50_000
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, threads: [thread], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt } }
        },
        readActivitySnapshot: async () => await new Promise<never>(() => undefined),
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    activityListeners[0]({
      version: 2,
      sourceFingerprint,
      generation: 1,
      receivedAt: 50_100,
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{ key: taskKey, status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', activityRevision: 1, lastTurnStatus: 'inProgress', lastTurnStartedAt: 49_000 }]
    })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input' })

    await controller.refresh()
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input' })
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
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
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
    expect(controller.view().conversations.ongoing.find((task) => task.key === activeKey)?.archiveCapability).toBe('blocked-active')
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
    expect(controller.view().conversations.completedUnread.some((task) => task.key === completedKey)).toBe(false)

    expect(controller.view().conversations.ongoing.find((task) => task.key === failedKey)?.archiveCapability).toBe('blocked-active')
    expect(await controller.archive(failedKey, 350)).toBe(false)
    expect(controller.view().conversations.ongoing.find((task) => task.key === unknownKey)?.archiveCapability).toBe('blocked-active')
    expect(await controller.archive(unknownKey, 250)).toBe(false)
    expect(controller.view().conversations.stopped.find((task) => task.key === stoppedKey)?.archiveCapability).toBe('allowed')
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
    expect(controller.view().conversations.ongoing.map((task) => task.key)).toEqual([activeKey, failedKey, unknownKey])
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
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
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
    expect(controller.view().conversations.completedCount).toBe(1)

    const archivePromise = controller.archive(taskKey, 400)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(controller.view().conversations.completedCount).toBe(1)
    expect(controller.floatSnapshot().archivingTaskKeys).toEqual([taskKey])
    await controller.refresh()
    expect(controller.view().conversations.completedCount).toBe(1)
    expect(controller.floatSnapshot().archivingTaskKeys).toEqual([taskKey])

    archiveResolve!()
    expect(await archivePromise).toBe(true)
    // Only the verified process-Kernel commit removes the card.
    expect(controller.view().conversations.completedCount).toBe(0)
    expect(controller.floatSnapshot().archivingTaskKeys).toEqual([])
    controller.dispose()
  })

  it('keeps unconfirmed rows ongoing across hide, restore and new-revision reappearance', async () => {
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
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 10, runningCount: 0, unknownCount: 0, sourceCount: 10, authority: 'inventory-only' })
    const target = controller.view().conversations.ongoing[0]
    expect(controller.hide(target.key, target.revisionAt)).toBe(true)
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 9, runningCount: 0, unknownCount: 0, hiddenCount: 1 })
    expect(controller.view().conversations.hidden[0]).toMatchObject({ key: target.key, hiddenKind: 'task' })

    expect(controller.restore(target.key, target.revisionAt, 'task')).toBe(true)
    expect(controller.view().conversations.ongoing.some((task) => task.key === target.key)).toBe(true)
    expect(controller.hide(target.key, target.revisionAt)).toBe(true)

    threads = threads.map((thread) => thread.key === target.key ? { ...thread, updatedAt: target.revisionAt + 1_000 } : thread)
    receivedAt += 10_000
    await controller.refresh()
    expect(controller.view().conversations.hidden.some((task) => task.key === target.key)).toBe(false)
    expect(controller.view().conversations.ongoing.some((task) => task.key === target.key && task.revisionAt === target.revisionAt + 1_000)).toBe(true)
    controller.dispose()
  })

  it('hides and restores a stopped task while the Codex provider is no longer running', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.providers = { codex: true, claude: false }
    const taskKey = '2222222222222222'
    // Codex is not running: every provider read and the cold preflight fail, so
    // only a locally committed decision can move the row.
    const preflight = vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed')))
    const companionKernel = companionTaskKernelModule.createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
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
    expect(controller.view().taskState.conversations.stopped).toEqual([])
    expect(controller.view().taskState.conversations.hidden[0]).toMatchObject({ key: taskKey, hiddenKind: 'task' })
    expect(state.codex.receipts.some((receipt) => receipt.key === taskKey && receipt.dismissedActivityRecency === target.revisionAt)).toBe(true)

    expect(controller.restore(target.key, target.revisionAt, 'task')).toBe(true)
    expect(controller.view().taskState.conversations.hidden).toEqual([])
    expect(controller.view().taskState.conversations.stopped[0]).toMatchObject({ key: taskKey })

    // The local pin shares the same authority and must not wait for a read.
    expect(controller.toggleLocalPin('task', taskKey)).toBe(true)
    expect(controller.view().taskState.conversations.all[0]).toMatchObject({ key: taskKey, pinSource: 'local' })
    expect(controller.toggleLocalPin('task', taskKey)).toBe(true)
    expect(controller.view().taskState.conversations.all[0].pinSource).toBeUndefined()
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
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ firstPromptAt: 120_000, lastTurnStartedAt: 180_000 })
    expect(state.codex.firstPromptTimes).toEqual([{ key, firstPromptAt: 120_000, updatedAt: 200_000 }])
    controller.dispose()

    includeFirstPrompt = false
    controller = createCodexController(options)
    await controller.refresh()
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ firstPromptAt: 120_000 })
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

  it('keeps the task inventory and live activity hot after leaving the Codex tab', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = now - 1_000
    const threads: CodexHostThread[] = [
      { key: 'aaaaaaaaaaaaaaaa', actionAlias: 'alias-ongoing', name: '进行中', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', updatedAt: now - 50, lastTurnStatus: 'inProgress', lastTurnStartedAt: now - 100 }
    ]
    let closeCount = 0
    const closeOptions: Array<{ preserveDesktop?: boolean } | undefined> = []
    const reads: Array<Record<string, boolean>> = []
    const activityListeners: Array<(delta: any) => void> = []
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          reads.push(options)
          return { ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now, threads, projects: [], sourceFingerprint: 'a'.repeat(64), completeness: 'verified' as const } }
        },
        onActivityChanged: (listener: (delta: any) => void) => {
          activityListeners.push(listener)
          return () => { activityListeners.splice(activityListeners.indexOf(listener), 1) }
        },
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
    await controller.refresh()
    expect(controller.view().conversations.ongoing).toHaveLength(1)

    const readsBeforeSwitch = reads.length
    state.activeTab = 'ports'
    controller.syncActivation(false)
    expect(closeCount).toBe(0)
    expect(closeOptions).toEqual([])
    expect(controller.view().conversations.ongoing).toHaveLength(1)

    activityListeners[0]({
      version: 2,
      sourceFingerprint: 'a'.repeat(64),
      generation: 2,
      receivedAt: now + 1,
      inventoryChanged: false,
      desktopBridgeState: 'connected',
      entries: [{
        key: threads[0].key,
        status: 'active',
        activeFlags: ['waitingOnUserInput'],
        statusAuthority: 'desktop-live',
        activityEvidence: 'activity-event',
        activityRevision: 2,
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: now + 1,
        hasUnreadTurn: false,
        unreadAuthority: 'desktop-live'
      }]
    })
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({ key: threads[0].key, activityState: 'waiting-input' })

    expect(reads).toHaveLength(readsBeforeSwitch)
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
