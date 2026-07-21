import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import type { CodexHostThread, CodexThreadOpenResult } from '../../src/domain/codex'
import type { EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { createCodexController } from '../../src/runtime/codexController'

describe('Codex controller', () => {
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
          return { version: 1 as const, checking: false, platform: 'windows' as const, runtimeState: 'detected' as const, runtimeSource: 'npm-global' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt: 100 }
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
    expect(controller.view().environment).toMatchObject({ configState: 'loaded', connectionState: 'connected', processState: 'running' })
    controller.dispose()
    expect(closeCount).toBeGreaterThan(0)
  })

  it('promotes a successful App Server read over an incomplete legacy readiness result', async () => {
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
      runtimeState: 'detected',
      processState: 'running',
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
              threads: [{ key: '1111111111111111', actionAlias: 'task-alias', name: '独立任务读取', status: 'active' as const, activeFlags: [], updatedAt: 250 }]
            }
          }
        },
        close: () => undefined
      }
    } as unknown as EypcPlatformApi
    const controller = createCodexController({ platform, getAppState: () => state, save: () => undefined, notify: () => undefined, setMessage: () => undefined })

    await controller.refresh()
    expect(controller.view().quota.status).toBe('error')
    expect(controller.view().conversations).toMatchObject({ status: 'ok', ongoingCount: 1 })

    failedLane = 'threads'
    await controller.refresh()
    expect(controller.view().quota).toMatchObject({ status: 'ok', plan: 'pro' })
    expect(controller.view().config.model).toBe('gpt-5.6')
    expect(controller.view().conversations).toMatchObject({ status: 'stale', ongoingCount: 1 })
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

  it('persists tab, collapse, aliases, local pins and EyPc-only project removal by anonymous keys', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    const projectKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const taskKey = '1111111111111111'
    let projectsPresent = true
    let receivedAt = 200
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
    expect(controller.removeProject(projectKey)).toBe(true)
    expect(state.codex).toMatchObject({ lastTaskTab: 'projects', collapsedProjectKeys: [projectKey], taskAliases: [{ key: taskKey, alias: '任务别名' }], projectAliases: [{ key: projectKey, alias: '项目别名' }], localPins: [{ kind: 'project', key: projectKey }], removedProjectKeys: [projectKey] })
    expect(controller.view().conversations.activeTab).toBe('projects')
    expect(controller.view().conversations.removedProjects[0]).toMatchObject({ key: projectKey, name: '项目别名' })

    projectsPresent = false
    receivedAt += 100
    await controller.refresh()
    expect(state.codex.removedProjectAbsentKeys).toEqual([projectKey])
    projectsPresent = true
    receivedAt += 100
    await controller.refresh()
    expect(state.codex.removedProjectKeys).toEqual([])
    expect(state.codex.removedProjectAbsentKeys).toEqual([])
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
        inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt: 100 }),
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
        inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt: 100 }),
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
          return { version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt: 100 }
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
    const safeResult = (checkedAt: number) => ({ version: 1 as const, checking: false, platform: 'windows' as const, runtimeState: 'detected' as const, runtimeSource: 'volta' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt })
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
    type ReadyResult = { version: 1; checking: false; platform: 'macos'; runtimeState: 'detected'; runtimeSource: 'homebrew'; processState: 'not-running'; configState: 'detected'; connectionState: 'not-checked'; checkedAt: number }
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
    release({ version: 1, checking: false, platform: 'macos', runtimeState: 'detected', runtimeSource: 'homebrew', processState: 'not-running', configState: 'detected', connectionState: 'not-checked', checkedAt: 300 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(controller.view().environment.checkedAt).toBe(0)
    expect(controller.view().environment.checking).toBe(false)
    expect(notifyCount).toBe(beforeRelease)
  })

  it('rejects low-contrast theme patches outside the configuration UI', () => {
    const state = createInitialState(1)
    const messages: string[] = []
    const original = structuredClone(state.codex.settings.colors)
    const controller = createCodexController({
      platform: { codex: { close: () => undefined } } as unknown as EypcPlatformApi,
      getAppState: () => state,
      save: () => undefined,
      notify: () => undefined,
      setMessage: (message) => messages.push(message)
    })

    expect(controller.updateSettings({ colors: { ...original, water: '#FFFFFF' } })).toBe(false)
    expect(state.codex.settings.colors).toEqual(original)
    expect(messages.at(-1)).toContain('已保留上一次有效主题')

    expect(controller.updateSettings({ colors: { ...original, water: '#18212B', card: '#F2F4F3' } })).toBe(true)
    expect(state.codex.settings.colors).toMatchObject({ water: '#18212B', card: '#F2F4F3' })
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
        inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt: 100 }),
        readSnapshot: async (options: Record<string, boolean>) => {
          snapshotReads += 1
          const receivedAt = Date.now()
          return options.includeThreads
            ? { ok: true as const, receivedAt, value: { version: 2 as const, receivedAt, threads: [{ key: taskKey, actionAlias: 'activity-alias', name: '实时待输入', status: 'active' as const, activeFlags: [], updatedAt: receivedAt - 10, lastTurnStatus: 'inProgress' as const, lastTurnStartedAt: receivedAt - 20, projectKey: 'chats', projectName: 'Chats', projectKind: 'chats' as const }], projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }], sourceFingerprint, completeness: 'verified' as const } }
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
    activityListeners[0]({ version: 1, sourceFingerprint, generation: 1, receivedAt, inventoryChanged: false, entries: [{ key: taskKey, status: 'active', activeFlags: ['waitingOnUserInput'] }] })
    expect(controller.view().conversations.inputRequired).toHaveLength(1)
    expect(controller.view().conversations.inputRequired[0]).toMatchObject({ key: taskKey, activityState: 'waiting-input' })
    expect(snapshotReads).toBe(readsAfterBaseline)

    activityListeners[0]({ version: 1, sourceFingerprint, generation: 2, receivedAt: receivedAt + 1, inventoryChanged: false, entries: [{ key: taskKey, status: 'active', activeFlags: [] }] })
    expect(controller.view().conversations.inputRequired).toHaveLength(0)
    expect(notifyCount).toBeGreaterThan(0)
    controller.dispose()
  })

  it('polls the lightweight activity lane every 200ms and backs off to 1s after three failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const state = createInitialState(1)
      state.activeTab = 'codex'
      const sourceFingerprint = 'b'.repeat(64)
      let activityReads = 0
      const platform = {
        codex: {
          inspectEnvironment: async () => ({ version: 1 as const, checking: false, platform: 'macos' as const, runtimeState: 'detected' as const, runtimeSource: 'homebrew' as const, processState: 'not-running' as const, configState: 'detected' as const, connectionState: 'not-checked' as const, checkedAt: 10_000 }),
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
      await vi.advanceTimersByTimeAsync(199)
      expect(activityReads).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(activityReads).toBe(2)
      await vi.advanceTimersByTimeAsync(200)
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

  it('marks a completed-unread task viewed only after a successful open', async () => {
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
    expect(state.codex.receipts[0]).toMatchObject({ acknowledgedRecency: 200, pendingRecency: 0 })
    expect(controller.view().conversations.completedUnread).toHaveLength(0)
    expect(controller.view().conversations.completed[0]).toMatchObject({ key, bucket: 'completed' })
    expect(controller).not.toHaveProperty('acknowledge')
    expect(controller).not.toHaveProperty('acknowledgeAll')

    expect(controller.hide(key, 200)).toBe(true)
    expect(controller.view().conversations.completedUnread).toHaveLength(0)
    expect(controller.view().conversations.hidden[0]).toMatchObject({ key, bucket: 'completed', hiddenKind: 'task' })
    expect(state.codex.receipts[0]).toMatchObject({ acknowledgedRecency: 200, dismissedActivityRecency: 200 })

    expect(controller.restore(key, 200, 'task')).toBe(true)
    expect(controller.view().conversations.completed[0]).toMatchObject({ key, bucket: 'completed' })
    expect(messages.at(-1)).toBe('已从已隐藏区释放任务')
    controller.dispose()
  })

  it('archives every non-active state with an exact preflight request and removes it immediately', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.lastTaskScanAt = 10
    const activeKey = '1111111111111111'
    const completedKey = '2222222222222222'
    const failedKey = '3333333333333333'
    const unknownKey = '4444444444444444'
    const threads: CodexHostThread[] = [
      { key: activeKey, actionAlias: 'alias-active', name: '进行中', status: 'active', activeFlags: [], updatedAt: 550, lastTurnStatus: 'inProgress', lastTurnStartedAt: 500 },
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

    expect(await controller.archive(failedKey, 350)).toBe(true)
    expect(archiveThread).toHaveBeenLastCalledWith('alias-failed', {
      expectedUpdatedAt: 350,
      expectedRevisionAt: 350,
      expectedLastTurnStartedAt: 320,
      expectedSourceFingerprint: 'a'.repeat(64),
      evidence: 'terminal'
    })

    expect(await controller.archive(unknownKey, 250)).toBe(true)
    expect(archiveThread).toHaveBeenLastCalledWith('alias-unknown', {
      expectedUpdatedAt: 250,
      expectedRevisionAt: 250,
      expectedLastTurnStartedAt: 200,
      expectedSourceFingerprint: 'a'.repeat(64),
      evidence: 'terminal'
    })
    expect(controller.view().conversations.ongoing.map((task) => task.key)).toEqual([activeKey])
    expect(state.codex.receipts.some((receipt) => [completedKey, failedKey, unknownKey].includes(receipt.key))).toBe(false)
    expect(messages.at(-1)).toBe('已归档 Codex 任务')
    controller.dispose()
  })

  it('keeps unknown rows aligned with counts and supports hide, restore and new-revision reappearance', async () => {
    const state = createInitialState(1)
    state.activeTab = 'codex'
    let receivedAt = 100_000
    let threads: CodexHostThread[] = Array.from({ length: 10 }, (_, index) => ({
      key: (index + 32).toString(16).padStart(16, '0'),
      actionAlias: `unknown-${index}`,
      name: `未知任务 ${index + 1}`,
      status: 'notLoaded',
      activeFlags: [],
      updatedAt: 80_000 + index
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
    expect(controller.view().conversations).toMatchObject({ unknownCount: 10, sourceCount: 10, authority: 'inventory-only' })
    const target = controller.view().conversations.ongoing[0]
    expect(controller.hide(target.key, target.revisionAt)).toBe(true)
    expect(controller.view().conversations).toMatchObject({ unknownCount: 9, hiddenCount: 1 })
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
})
