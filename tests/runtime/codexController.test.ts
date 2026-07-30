import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import { CODEX_TASK_STATE_REVISION, type CodexHostThread, type CodexThreadOpenResult } from '../../src/domain/codex'
import { CODEX_DYNAMIC_TASK_WINDOW_MS, projectCodexDynamicStatus } from '../../src/domain/codexPresentation'
import type { EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { createCodexController } from '../../src/runtime/codexController'

describe('Codex controller', () => {
  it('preserves one atomic degraded task package when the production adapter reports a legacy bridge', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const now = Date.now()
    const reads: Array<Record<string, boolean>> = []
    const messages: string[] = []
    const platform = {
      codex: {
        taskStateRevision: 'legacy',
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
      sourceRevision: 'legacy',
      conversations: { status: 'ok', ongoingCount: 1 },
      dynamic: { compactCounts: { active: 1 } }
    })
    expect(controller.view().conversations).toBe(controller.view().taskState.conversations)
    expect(messages.at(-1)).toContain('状态已保留')
    expect(controller.floatSnapshot().taskStateRevision).toBe(CODEX_TASK_STATE_REVISION)
    expect(controller.floatSnapshot().taskState).toBe(controller.view().taskState)
    controller.dispose()
  })

  it('inspects macOS or Windows readiness once on first enabled launch even while the Codex page is inactive', async () => {
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
    expect(readOptions).toEqual([])
    expect(controller.view().environment).toMatchObject({ platform: 'windows', runtimeState: 'detected', connectionState: 'not-checked' })

    state.activeTab = 'codex'
    controller.syncActivation(true)
    await controller.refresh()
    expect(inspectionCount).toBe(2)
    expect(readOptions).toEqual([
      { includeQuota: true, includeConfig: true, includeThreads: false },
      { includeQuota: false, includeConfig: false, includeThreads: true }
    ])
    expect(controller.view().environment).toMatchObject({ configState: 'loaded', connectionState: 'connected', processState: 'not-running' })
    controller.dispose()
    expect(closeCount).toBeGreaterThan(0)
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
      state.codex.settings.taskRefreshSeconds = 15
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
    releaseFirst({ ok: true, receivedAt: 200, value: { version: 1, receivedAt: 200, config: { model: 'old-generation', reasoningEffort: 'low', serviceTier: 'default' } } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect({ quotaReadCount, threadReadCount }).toEqual({ quotaReadCount: 2, threadReadCount: 2 })
    expect(controller.view().config.model).toBe('new-generation')
    expect(controller.view().environment.connectionState).toBe('connected')
    expect(controller.view().environment.checkedAt).toBeGreaterThan(0)
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
    const safeResult = (checkedAt: number) => ({ version: 1 as const, checking: false, platform: 'windows' as const, runtimeState: 'detected' as const, runtimeSource: 'volta' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt })
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
    expect(controller.view().environment.checkedAt).toBe(200)
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

    expect(controller.floatSnapshot()).toMatchObject({ style: 'water', colors: state.codex.settings.colors })
    expect(controller.updateSettings({ displayStyle: 'card', colors })).toBe(true)
    expect(controller.floatSnapshot()).toMatchObject({ style: 'card', colors })
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
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.inputRequired).toHaveLength(1)
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input' })
    expect(snapshotReads).toBe(readsAfterBaseline)

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.inputRequired).toHaveLength(0)
    expect(notifyCount).toBeGreaterThan(0)
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
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', desktopActiveSince: activeSince, hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', desktopActiveSince: activeSince, hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'completed', lastTurnStartedAt: activeSince + 500, lastTurnCompletedAt: activeSince + 1_000, lastTurnEvidence: 'turn-completed' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, completedCount: 1 })
    expect(controller.view().conversations.completed[0]).toMatchObject({ key: taskKey, completionRevision: activeSince + 1_000 })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 3, receivedAt: receivedAt + 2, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'initial-snapshot', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'inProgress', lastTurnStartedAt: activeSince + 500, lastTurnEvidence: 'turn-started' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, completedCount: 0 })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
    controller.dispose()
  })

  it('keeps stale interrupted inventory ongoing, then accepts completion-unread or a fresh stop', async () => {
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
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: baselineTurnStartedAt }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    expect(projectCodexDynamicStatus(controller.view().conversations, receivedAt + 1).compactCounts.active).toBe(1)

    fullThread = {
      ...fullThread,
      status: 'idle',
      updatedAt: receivedAt + 1,
      lastTurnStatus: 'interrupted',
      lastTurnStartedAt: baselineTurnStartedAt
    }
    await controller.refresh()
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 3, receivedAt: receivedAt + 2, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: true, unreadAuthority: 'desktop-persisted', lastTurnStatus: 'completed', lastTurnStartedAt: baselineTurnStartedAt, lastTurnCompletedAt: receivedAt + 2, lastTurnEvidence: 'targeted-after-exit' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, stoppedCount: 0, completedUnreadCount: 1 })
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key: taskKey, bucket: 'completed-unread', unreadState: 'unread', archiveCapability: 'allowed' })
    expect(projectCodexDynamicStatus(controller.view().conversations, receivedAt + 2)).toMatchObject({
      compactCounts: { active: 0 },
      groups: { active: [], unread: [{ key: taskKey }] }
    })

    const resumedTurnStartedAt = baselineTurnStartedAt + 100
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 4, receivedAt: receivedAt + 3, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live', activityEvidence: 'activity-event', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'inProgress', lastTurnStartedAt: resumedTurnStartedAt, lastTurnEvidence: 'turn-started' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 1, stoppedCount: 0 })
    activityListeners[0]({ version: 2, sourceFingerprint, generation: 5, receivedAt: receivedAt + 4, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'idle', activeFlags: [], statusAuthority: 'desktop-live', hasUnreadTurn: false, unreadAuthority: 'desktop-live', lastTurnStatus: 'interrupted', lastTurnStartedAt: resumedTurnStartedAt, lastTurnEvidence: 'targeted-after-exit' }] })
    expect(controller.view().conversations).toMatchObject({ ongoingCount: 0, stoppedCount: 1 })
    expect(projectCodexDynamicStatus(controller.view().conversations, receivedAt + 4).compactCounts.active).toBe(0)
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
      let fullThread: CodexHostThread = { key: taskKey, actionAlias: 'targeted-alias', name: '实时完成核验', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', desktopActiveSince: 9_900, hasUnreadTurn: false, unreadAuthority: 'desktop-live', updatedAt: 9_900, lastTurnStatus: 'inProgress', lastTurnStartedAt: 9_000, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' }
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
        compactCounts: { active: 1 },
        groups: { active: [{ key: taskKey }] }
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
      let threadReads = 0
      let releaseSecondRead: (value: any) => void = () => undefined
      const secondRead = new Promise<any>((resolve) => { releaseSecondRead = resolve })
      const snapshot = (threads: CodexHostThread[], receivedAt = Date.now()) => ({
        ok: true as const,
        receivedAt,
        value: {
          version: 2 as const,
          receivedAt,
          threads,
          projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
          sourceFingerprint,
          completeness: 'verified' as const
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
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 1, receivedAt: 10_001, inventoryChanged: true, inventoryRefreshPriority: 'urgent', desktopBridgeState: 'connected', entries: [] })
      await vi.advanceTimersByTimeAsync(49)
      expect(threadReads).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(threadReads).toBe(2)

      currentThreads = [first, second, third]
      activityListeners[0]({ version: 2, sourceFingerprint, generation: 2, receivedAt: 10_051, inventoryChanged: true, inventoryRefreshPriority: 'urgent', desktopBridgeState: 'connected', entries: [] })
      releaseSecondRead(snapshot([first, second], 10_050))
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.view().conversations.all).toHaveLength(2)
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

  it('uses a 5s watchdog for the push activity lane and backs off to 1s after three failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      const sourceFingerprint = 'b'.repeat(64)
      let activityReads = 0
      const platform = {
        codex: {
          inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, desktopBridgeState: 'not-checked' as const, checkedAt: 10_000 }),
          readSnapshot: async (options: Record<string, boolean>) => options.includeThreads
            ? { ok: true as const, receivedAt: 10_000, value: { version: 2 as const, receivedAt: 10_000, threads: [], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
            : { ok: true as const, receivedAt: 10_000, value: { version: 2 as const, receivedAt: 10_000 } },
          readActivitySnapshot: async () => {
            activityReads += 1
            return { ok: false as const, receivedAt: Date.now(), error: { code: 'timeout' as const, message: 'activity timeout' } }
          },
          onActivityChanged: () => () => undefined,
          close: () => undefined
        }
      } as unknown as EypcPlatformApi
      const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(activityReads).toBe(1)
      await vi.advanceTimersByTimeAsync(4_999)
      expect(activityReads).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(activityReads).toBe(2)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(activityReads).toBe(3)
      await vi.advanceTimersByTimeAsync(999)
      expect(activityReads).toBe(3)
      await vi.advanceTimersByTimeAsync(1)
      expect(activityReads).toBe(4)
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps Codex Desktop unread authority unchanged after opening or locally hiding a task', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = 50
    const key = 'abcdef0123456789'
    const threads: CodexHostThread[] = [{
      key,
      actionAlias: 'alias-1',
      name: '实现悬浮球',
      status: 'notLoaded',
      activeFlags: [],
      statusAuthority: 'desktop-live',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live',
      updatedAt: 220,
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 150,
      lastTurnCompletedAt: 200
    }]
    const openThread = vi.fn(async () => ({ outcome: 'opened' as const }))
    const platform = {
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt: 230, value: { version: 1 as const, receivedAt: 230, threads } }),
        openThread,
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const messages: string[] = []
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: (message) => messages.push(message)
    })

    await controller.refresh()
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key, revisionAt: 200 })
    expect(await controller.openThread(key, 'alias-1')).toBe(true)
    expect(state.codex.receipts).toEqual([])
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key, bucket: 'completed-unread', unreadState: 'unread' })
    expect(controller).not.toHaveProperty('acknowledge')
    expect(controller).not.toHaveProperty('acknowledgeAll')

    expect(controller.openFirstCompletedUnread()).toBe(true)
    await Promise.resolve()
    expect(state.codex.receipts).toEqual([])
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key, bucket: 'completed-unread', unreadState: 'unread' })

    expect(controller.hide(key, 200)).toBe(true)
    expect(controller.view().conversations.completedUnread).toHaveLength(0)
    expect(controller.view().conversations.hidden[0]).toMatchObject({ key, bucket: 'completed-unread', hiddenKind: 'task', unreadState: 'unread' })
    expect(state.codex.receipts[0]).toMatchObject({ dismissedActivityRecency: 200, pendingRecency: 0 })

    expect(controller.restore(key, 200, 'task')).toBe(true)
    expect(controller.view().conversations.completedUnread[0]).toMatchObject({ key, bucket: 'completed-unread' })
    expect(messages.at(-1)).toBe('已从已隐藏区释放任务')
    controller.dispose()
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
      activityEvidence: 'initial-snapshot',
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
      activityEvidence: 'initial-snapshot',
      updatedAt: 30_200,
      lastTurnStatus: 'completed',
      lastTurnStartedAt: startedAt,
      lastTurnCompletedAt: completedAt,
      lastTurnEvidence: 'inventory',
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
    const activityListeners: Array<(delta: any) => void> = []
    const platform = {
      codex: {
        readSnapshot: async (options: Record<string, boolean>) => {
          const receivedAt = 20_000
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, activityGeneration: 5, threads: [{ key: taskKey, actionAlias: 'barrier-alias', name: '顺序屏障', status: 'idle' as const, activeFlags: [], statusAuthority: 'desktop-live' as const, updatedAt: receivedAt, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: 19_000, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
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
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 4, receivedAt: 20_001, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })

    activityListeners[0]({ version: 2, sourceFingerprint, generation: 6, receivedAt: 20_002, inventoryChanged: false, desktopBridgeState: 'connected', entries: [{ key: taskKey, status: 'active', activeFlags: [], statusAuthority: 'desktop-live' }] })
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'active' })
    controller.dispose()
  })

  it('archives only authoritative completed tasks and keeps abnormal states ongoing', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = 10
    const activeKey = '1111111111111111'
    const completedKey = '2222222222222222'
    const failedKey = '3333333333333333'
    const unknownKey = '4444444444444444'
    const threads: CodexHostThread[] = [
      { key: activeKey, actionAlias: 'alias-active', name: '进行中', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', updatedAt: 550, lastTurnStatus: 'inProgress', lastTurnStartedAt: 500 },
      { key: completedKey, actionAlias: 'alias-completed', name: '已完成', status: 'notLoaded', activeFlags: [], updatedAt: 450, lastTurnStatus: 'completed', lastTurnStartedAt: 300, lastTurnCompletedAt: 400 },
      { key: failedKey, actionAlias: 'alias-failed', name: '失败', status: 'notLoaded', activeFlags: [], updatedAt: 350, lastTurnStatus: 'failed', lastTurnStartedAt: 320 },
      { key: unknownKey, actionAlias: 'alias-unknown', name: '已中断', status: 'systemError', activeFlags: [], updatedAt: 250, lastTurnStatus: 'interrupted', lastTurnStartedAt: 200 }
    ]
    const archiveThread = vi.fn(async () => ({ outcome: 'archived' as const }))
    const messages: string[] = []
    const platform = {
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

    await controller.refresh()
    expect(controller.view().conversations.ongoing.find((task) => task.key === activeKey)?.archiveCapability).toBe('blocked-active')
    expect(await controller.archive(activeKey, 550)).toBe(false)
    expect(archiveThread).not.toHaveBeenCalled()

    expect(await controller.archive(completedKey, 400)).toBe(true)
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
    expect(archiveThread).toHaveBeenCalledTimes(1)
    expect(controller.view().conversations.ongoing.map((task) => task.key)).toEqual([activeKey, failedKey, unknownKey])
    expect(state.codex.receipts.some((receipt) => [completedKey, failedKey, unknownKey].includes(receipt.key))).toBe(false)
    expect(messages.at(-1)).toBe('任务仍在进行中，暂不能归档')
    controller.dispose()
  })

  it('optimistically hides the task during archive and blocks structural refresh from restoring it', async () => {
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
    const platform = {
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

    await controller.refresh()
    expect(controller.view().conversations.completedCount).toBe(1)

    const archivePromise = controller.archive(taskKey, 400)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(controller.view().conversations.completedCount).toBe(0)
    expect(controller.view().conversations.ongoingCount).toBe(0)

    archiveResolve!()
    expect(await archivePromise).toBe(true)
    expect(controller.view().conversations.completedCount).toBe(0)
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

  it('cycles complete input-required before recent active tasks and skips completed-unread', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = now - 1_000
    const ongoingKey = 'aaaaaaaaaaaaaaaa'
    const completedUnreadKey = 'bbbbbbbbbbbbbbbb'
    const inputKey = 'dddddddddddddddd'
    const threads: CodexHostThread[] = [
      { key: inputKey, actionAlias: 'alias-input', name: '待输入', status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live', updatedAt: now - CODEX_DYNAMIC_TASK_WINDOW_MS - 100, lastTurnStatus: 'inProgress', lastTurnStartedAt: now - CODEX_DYNAMIC_TASK_WINDOW_MS - 100 },
      { key: ongoingKey, actionAlias: 'alias-ongoing', name: '进行中', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', updatedAt: now - 50, lastTurnStatus: 'inProgress', lastTurnStartedAt: now - 100 },
      { key: completedUnreadKey, actionAlias: 'alias-unread', name: '已完成未读', status: 'notLoaded', activeFlags: [], updatedAt: now - 150, lastTurnStatus: 'completed', lastTurnStartedAt: now - 300, lastTurnCompletedAt: now - 200, hasUnreadTurn: true, unreadAuthority: 'desktop-live' }
    ]
    const openThread = vi.fn(async () => ({ outcome: 'opened' as const }))
    const platform = {
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now, threads, projects: [], sourceFingerprint: 'a'.repeat(64), completeness: 'verified' as const } }),
        openThread,
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
    expect(controller.view().conversations.ongoing).toHaveLength(2)
    expect(controller.view().conversations.inputRequired.map((task) => task.key)).toEqual([inputKey])
    expect(controller.view().conversations.completedUnread).toHaveLength(1)

    controller.cycleTask(-1)
    expect(openThread).toHaveBeenCalledWith('alias-ongoing')

    controller.cycleTask(1)
    expect(openThread).toHaveBeenLastCalledWith('alias-input')

    controller.cycleTask(1)
    expect(openThread).toHaveBeenLastCalledWith('alias-ongoing')

    expect(openThread).not.toHaveBeenCalledWith('alias-unread')
    controller.dispose()
  })

  it('excludes conservative ongoing tasks older than six hours unless they are explicitly pinned in EyPc', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = now - 1_000
    const taskKey = 'cccccccccccccccc'
    const oldActivityAt = now - CODEX_DYNAMIC_TASK_WINDOW_MS - 1
    const threads: CodexHostThread[] = [{
      key: taskKey,
      actionAlias: 'alias-old-conservative',
      name: '超过六小时的保守进行中',
      status: 'notLoaded',
      activeFlags: [],
      statusAuthority: 'connector',
      updatedAt: oldActivityAt,
      lastTurnStatus: 'interrupted',
      lastTurnStartedAt: oldActivityAt
    }]
    const openThread = vi.fn(async () => ({ outcome: 'opened' as const }))
    const messages: string[] = []
    const platform = {
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now, threads, projects: [], sourceFingerprint: 'b'.repeat(64), completeness: 'verified' as const } }),
        openThread,
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

    await controller.refresh()
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, activityState: 'ongoing' })
    expect(controller.view().conversations.ongoing[0]?.pinSource).toBeUndefined()
    expect(controller.cycleTask(1)).toBe(false)
    expect(openThread).not.toHaveBeenCalled()
    expect(messages.at(-1)).toBe('当前没有可切换的 Codex 任务')

    expect(controller.toggleLocalPin('task', taskKey)).toBe(true)
    expect(controller.view().conversations.ongoing[0]).toMatchObject({ key: taskKey, pinSource: 'local' })
    expect(controller.cycleTask(1)).toBe(true)
    expect(openThread).toHaveBeenCalledWith('alias-old-conservative')
    controller.dispose()
  })

  it('cycleTask shows no tasks after syncActivation clears conversations on non-codex tab', async () => {
    const now = Date.now()
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = now - 1_000
    const threads: CodexHostThread[] = [
      { key: 'aaaaaaaaaaaaaaaa', actionAlias: 'alias-ongoing', name: '进行中', status: 'active', activeFlags: [], statusAuthority: 'desktop-live', updatedAt: now - 50, lastTurnStatus: 'inProgress', lastTurnStartedAt: now - 100 }
    ]
    const openThread = vi.fn(async () => ({ outcome: 'opened' as const }))
    let closeCount = 0
    const platform = {
      codex: {
        readSnapshot: async () => ({ ok: true as const, receivedAt: now, value: { version: 2 as const, receivedAt: now, threads, projects: [], sourceFingerprint: 'a'.repeat(64), completeness: 'verified' as const } }),
        openThread,
        close: () => { closeCount += 1 }
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

    controller.cycleTask(1)
    expect(openThread).toHaveBeenCalledTimes(1)

    state.activeTab = 'ports'
    controller.syncActivation(false)
    expect(closeCount).toBeGreaterThan(0)
    expect(controller.view().conversations.ongoing).toHaveLength(0)

    openThread.mockClear()
    controller.cycleTask(1)
    expect(openThread).not.toHaveBeenCalled()
    controller.dispose()
  })
})
