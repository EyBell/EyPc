import { describe, expect, it, vi } from 'vitest'
import { createActionRuntime } from '../../src/runtime/action/actionRuntime'
import { createInitialState, normalizeAppState } from '../../src/domain/state'
import { createAppRuntime } from '../../src/runtime/appRuntime'
import { createMqttConnectionConfig } from '../../src/domain/mqtt'
import { isFavoriteRunnerTrusted, trustFavoriteRunner } from '../../src/domain/favoriteLaunch'
import type { FavoriteRunRecord } from '../../src/domain/types'
import type { LiveWindow, WindowActivationRequest } from '../../src/domain/windows'
import { WINDOW_BRIDGE_REVISION, type EypcPlatformApi, type FavoriteRunRequest } from '../../src/platform/eypcPlatform'

type TestPlatformOverrides = {
  [Key in keyof EypcPlatformApi]?: EypcPlatformApi[Key] extends (...args: never[]) => unknown
    ? EypcPlatformApi[Key]
    : Partial<EypcPlatformApi[Key]>
}

type TestWindowCapability = Awaited<ReturnType<EypcPlatformApi['windows']['capabilities']>>

function normalizeTestWindowCapability(capability: TestWindowCapability): TestWindowCapability {
  // Ordinary supported-window fixtures target the current bridge. Tests can still
  // provide an explicit stale revision when bridge-version behavior is in scope.
  return capability.supported && capability.bridgeRevision === undefined
    ? { ...capability, bridgeRevision: WINDOW_BRIDGE_REVISION }
    : capability
}

function activationLandingWindow(request: WindowActivationRequest): LiveWindow {
  return request.mode === 'member-exact' ? request.member : request.root
}

describe('action runtime', () => {
  it('dispatches runnable action and captures write snapshots', () => {
    const snapshots: string[] = []
    const runtime = createActionRuntime({ captureSnapshot: () => 'before', commitSnapshot: (value) => snapshots.push(String(value)) })
    let called = false
    runtime.register({
      id: 'ports.kill.force',
      title: '强杀进程',
      group: '端口',
      risk: 'destructive',
      scope: 'tab',
      priority: 100,
      when: (context) => context.tab === 'ports',
      run: () => {
        called = true
        return true
      }
    })

    expect(runtime.dispatch({ actionId: 'ports.kill.force', context: { tab: 'ports', selectedIds: ['p:1:3000'], layerIds: [] } })).toMatchObject({
      handled: true,
      actionId: 'ports.kill.force'
    })
    expect(called).toBe(true)
    expect(snapshots).toEqual(['before'])
  })
})

describe('app runtime', () => {
  function group(id: string, name: string, entries: string[], sortOrder = 1, folderId: string | null = null) {
    return { id, name, color: '#00A676', entries, folderId, sortOrder }
  }

  function enableFavorites(state: ReturnType<typeof createInitialState>) {
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
  }

  function enableWindows(state: ReturnType<typeof createInitialState>) {
    state.settings.featureConfigs = state.settings.featureConfigs.map((item) => item.id === 'windows' ? { ...item, enabled: true } : item)
    state.activeTab = 'windows'
  }

  function installPlatform(overrides: TestPlatformOverrides = {}) {
    const state = createInitialState(100)
    const killed: Array<{ pid: number; port: number; force: boolean }> = []
    const copied: string[] = []
    const savedTextFiles: Array<{ suggestedName: string; text: string; mimeType?: string }> = []
    const copiedItems: string[][] = []
    const opened: string[] = []
    const revealed: string[] = []
    const listed: string[] = []
    const configuredHotkeys: string[] = []
    let hideCount = 0
    let showCount = 0
    let scanCount = 0
    const files = {
      capabilities: { open: true, reveal: true, copyPath: true, copyItems: true, pickFiles: true, pickFolders: true, listDirectory: true, inspectPaths: true },
      open: async (target: string) => {
        opened.push(target)
        return { outcome: 'success' as const }
      },
      reveal: async (target: string) => {
        revealed.push(target)
        return { outcome: 'success' as const }
      },
      copyPath: async (path: string) => {
        copied.push(path)
        return { outcome: 'success' as const }
      },
      copyItems: async (paths: string[]) => {
        copiedItems.push(paths)
        return { outcome: 'success' as const }
      },
      inspectPaths: async (paths: string[]) => paths.map((path) => ({ path, status: 'available' as const, kind: 'file' as const, exists: true, isSymbolicLink: false })),
      pickFavorite: async () => null,
      pickFavorites: async () => [],
      listDirectory: async (target: string) => {
        listed.push(target)
        return { ok: false, entries: [], error: 'unavailable' }
      },
      saveTextFile: async (input: { suggestedName: string; text: string; mimeType?: string }) => {
        savedTextFiles.push(input)
        return { outcome: 'saved' as const }
      }
    }
    const windowOverrides = overrides.windows
    const windows = windowOverrides
      ? {
          ...windowOverrides,
          ...(windowOverrides.capabilities
            ? { capabilities: async () => normalizeTestWindowCapability(await windowOverrides.capabilities!()) }
            : {}),
          ...(windowOverrides.list
            ? {
                list: async () => {
                  const result = await windowOverrides.list!()
                  return { ...result, capability: normalizeTestWindowCapability(result.capability) }
                }
              }
            : {}),
          ...(windowOverrides.activate
            ? {
                activate: async (...args: Parameters<NonNullable<typeof windowOverrides.activate>>) => {
                  const result = await windowOverrides.activate!(...args)
                  if (result.outcome !== 'activated') return result
                  const root = args[0].root
                  const instanceId = root.instanceId.includes(':legacy:') ? `${root.platform}:verified:${root.nativeRef}` : root.instanceId
                  return {
                    ...result,
                    instanceId: result.instanceId || instanceId,
                    ...(args[0].mode === 'member-exact'
                      ? { memberInstanceId: result.memberInstanceId || args[0].member.instanceId }
                      : {})
                  }
                }
              }
            : {}),
          ...(windowOverrides.alwaysOnTop
            ? {
                alwaysOnTop: async (...args: Parameters<NonNullable<typeof windowOverrides.alwaysOnTop>>) => {
                  const result = await windowOverrides.alwaysOnTop!(...args)
                  const instanceId = args[0].instanceId.includes(':legacy:') ? `${args[0].platform}:verified:${args[0].nativeRef}` : args[0].instanceId
                  return result.outcome === 'activated' && !result.instanceId ? { ...result, instanceId } : result
                }
              }
            : {})
        }
      : undefined
    const platform = {
      storage: {
        getState: () => state,
        setState: () => true,
        getMqttArchive: () => ({ version: 1 as const, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }),
        setMqttArchive: () => true,
        getMqttStorageStatus: () => ({ mode: 'browser-localStorage' as const, sqliteAvailable: false, migratedLegacyArchive: false }),
        getMqttSecrets: () => ({}),
        setMqttSecrets: () => true
      },
      ports: {
        scan: async () => {
          scanCount += 1
          return [
            { id: '11:3000:tcp', pid: 11, port: 3000, command: 'node', address: '*:3000', protocol: 'tcp' as const, state: 'LISTEN' as const },
            { id: '12:5174:tcp', pid: 12, port: 5174, command: 'vite', address: '*:5174', protocol: 'tcp' as const, state: 'LISTEN' as const },
            { id: '13:9000:tcp', pid: 13, port: 9000, command: 'other', address: '*:9000', protocol: 'tcp' as const, state: 'LISTEN' as const }
          ]
        },
        kill: async (request: { pid: number; port: number; force: boolean }) => {
          killed.push(request)
          return { ok: true, ...request }
        }
      },
      clipboard: {
        copyText: async (text: string) => {
          copied.push(text)
          return true
        }
      },
      app: {
        hide: async () => {
          hideCount += 1
          return true
        },
        show: () => {
          showCount += 1
          return true
        },
        configureHotkey: (commandLabel: string) => {
          configuredHotkeys.push(commandLabel)
          return true
        }
      },
      getEnterPayload: () => null,
      clearEnterPayload: () => undefined,
      ...overrides,
      ...(windows ? { windows } : {}),
      files: { ...files, ...overrides.files }
    }
    globalThis.window = { eypcPlatform: platform } as unknown as Window & typeof globalThis
    return { state, killed, copied, copiedItems, savedTextFiles, opened, revealed, listed, configuredHotkeys, platform, getScanCount: () => scanCount, getHideCount: () => hideCount, getShowCount: () => showCount }
  }

  async function flushWindowActions() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  function createFakeMqttClient() {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    return {
      listeners,
      end: () => undefined,
      publish: (_topic: string, _payload: string, _options: unknown, callback?: (error?: Error | null) => void) => callback?.(null),
      subscribe: (_topic: string | string[], _options: unknown, callback?: (error?: Error | null) => void) => callback?.(null),
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, [...(listeners.get(event) || []), listener])
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) || []) listener(...args)
      }
    }
  }

  it('keeps favorite search as a filter and reorders favorites through runtime', () => {
    const state = createInitialState(100)
    enableFavorites(state)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f1', kind: 'folder', path: '/a', name: 'A', parentId: 'g1', tags: ['docs'], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'f2', kind: 'folder', path: '/b', name: 'B', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('favorites')
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    runtime.setFavoriteSearch('docs')
    expect(runtime.dispatch('favorites.reorder', { nodeId: 'f2', parentId: 'g1', beforeNodeId: 'f1' }).handled).toBe(true)

    const snapshot = runtime.snapshot()
    expect(snapshot.state.favoriteSearchHistory).toEqual([])
    expect(snapshot.state.favorites.find((item) => item.id === 'f2')?.parentId).toBe('g1')
    expect(snapshot.favoriteRows.map((item) => item.node.id)).toEqual(['g1', 'f1'])
  })

  it('saves shortcut profile drafts as one runtime settings update', () => {
    const { state, platform } = installPlatform()
    let saveCount = 0
    platform.storage.setState = () => {
      saveCount += 1
      return true
    }
    const runtime = createAppRuntime(state)
    const draftProfiles = {
      ...state.settings.shortcutProfiles,
      ports: {
        keybindingOverrides: [
          { commandId: 'ports.scan', shortcutIds: ['Alt+R'], shortcutId: 'Alt+R', enabled: true, source: 'user' as const }
        ],
        updatedAt: 500
      },
      global: {
        keybindingOverrides: [
          { commandId: 'search.focus', shortcutIds: ['Ctrl+P'], shortcutId: 'Ctrl+P', enabled: true, source: 'user' as const }
        ],
        updatedAt: 501
      },
      mqtt: {
        keybindingOverrides: [
          { commandId: 'mqtt.publish.draft.toggle', shortcutIds: ['Alt+L'], shortcutId: 'Alt+L', enabled: true, source: 'user' as const }
        ],
        updatedAt: 502
      }
    }

    runtime.saveShortcutProfiles(draftProfiles)

    const settings = runtime.snapshot().state.settings
    expect(settings.shortcutProfiles.ports.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutIds: ['Alt+R'] })
    expect(settings.shortcutProfiles.global.keybindingOverrides[0]).toMatchObject({ commandId: 'search.focus', shortcutIds: ['Ctrl+P'] })
    expect(settings.shortcutProfiles.mqtt.keybindingOverrides[0]).toMatchObject({ commandId: 'mqtt.publish.draft.toggle', shortcutIds: ['Alt+L'] })
    expect(settings.keybindingOverrides.map((item) => item.commandId)).toEqual(['search.focus', 'ports.scan', 'mqtt.publish.draft.toggle'])
    expect(saveCount).toBe(1)
  })

  it('stores MQTT shortcut updates in the MQTT profile', () => {
    const { state } = installPlatform()
    const runtime = createAppRuntime(state)

    runtime.updateKeybinding({ commandId: 'mqtt.publish.draft.saveDraft', shortcutIds: ['Alt+Shift+L'] })

    const settings = runtime.snapshot().state.settings
    expect(settings.shortcutProfiles.mqtt.keybindingOverrides[0]).toMatchObject({
      commandId: 'mqtt.publish.draft.saveDraft',
      shortcutIds: ['Alt+Shift+L']
    })
    expect(settings.shortcutProfiles.global.keybindingOverrides.find((item) => item.commandId === 'mqtt.publish.draft.saveDraft')).toBeUndefined()
    expect(settings.keybindingOverrides.map((item) => item.commandId)).toContain('mqtt.publish.draft.saveDraft')
  })

  it('hides the app with Shift+Escape above active layers', async () => {
    const { state, getHideCount } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.dispatch('ports.drawer.open')
    expect(runtime.handleShortcut('Shift+Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('app.hide')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getHideCount()).toBe(1)

    runtime.dispatch('ports.group.edit')
    expect(runtime.handleShortcut('Shift+Escape', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('app.hide')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getHideCount()).toBe(2)
  })

  it('reports when the host cannot hide the app window', async () => {
    installPlatform({ app: { hide: async () => false } })
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.handleShortcut('Shift+Escape', false)).toBe('app.hide')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().message).toBe('当前环境不支持隐藏插件窗口')
  })

  it('creates confirmation for port group cleanup and only targets current listeners', async () => {
    const { state, killed } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000', '5173-5175'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    const result = runtime.dispatch('ports.killGroup.confirm', { groupId: 'web' })
    expect(result.handled).toBe(true)
    expect(runtime.snapshot().confirm?.detail).toContain('2 个进程')
    expect(killed).toEqual([])

    runtime.confirmNow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(killed).toEqual([
      { pid: 11, port: 3000, force: false },
      { pid: 12, port: 5174, force: false }
    ])
  })

  it('force-cleans a port group without confirmation and ignores unmatched ports', async () => {
    const { state, killed } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000', '5173-5175'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    const result = runtime.dispatch('ports.killGroup.force', { groupId: 'web' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.handled).toBe(true)
    expect(runtime.snapshot().confirm).toBeNull()
    expect(killed).toEqual([
      { pid: 11, port: 3000, force: true },
      { pid: 12, port: 5174, force: true }
    ])
  })

  it('moves result focus, toggles selection, and force-cleans selected rows through delete shortcuts', async () => {
    const { killed } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp'])
    expect(runtime.handleShortcut('Ctrl+Enter', false)).toBeNull()
    expect(runtime.handleShortcut('Ctrl+Backspace', false)).toBe('ports.kill.force')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(killed).toEqual([{ pid: 11, port: 3000, force: true }])
  })

  it('uses the default highlighted port for force kill while port search is focused', async () => {
    const { killed } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    runtime.setPortSearch('vite')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.handleShortcut('Ctrl+Backspace', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.kill.force')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(killed).toEqual([{ pid: 12, port: 5174, force: true }])
  })

  it('creates a port group from selected rows while port search is focused', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    runtime.togglePortSelection('11:3000:tcp')
    runtime.togglePortSelection('12:5174:tcp')

    expect(runtime.handleShortcut('Ctrl+G', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.group.createFromSelection')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'create', entriesText: '3000\n5174' })
  })

  it('starts without port focus, creates focus on first movement, and lets idle Escape fall through', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    expect(runtime.snapshot().focusedPortId).toBeNull()
    expect(runtime.handleShortcut('Escape', false)).toBeNull()
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.focus.clear')
    expect(runtime.snapshot().focusedPortId).toBeNull()
    expect(runtime.handleShortcut('Escape', false)).toBeNull()
  })

  it('clears selection before search and clears focused search in one Escape step', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()
    runtime.setPortSearch('3000')

    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.handleShortcut('Space', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp'])

    const blurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.selection.clear')
    expect(runtime.snapshot().searchBlurRequestId).toBe(blurRequestId)
    expect(runtime.snapshot().selectedPortIds).toEqual([])
    expect(runtime.snapshot().state.portSearch).toBe('3000')

    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.search.clear')
    expect(runtime.snapshot().searchBlurRequestId).toBe(blurRequestId + 1)
    expect(runtime.snapshot().state.portSearch).toBe('')

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.focus.clear')
    expect(runtime.snapshot().focusedPortId).toBeNull()
  })

  it('keeps port search Enter inert and lets group search Enter apply the focused group', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      group('web', 'Web', ['3000'], 1),
      { ...group('vite', 'Vite', ['5173-5175'], 2), color: '#2F80ED' }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.setPortSearch('vi')
    const portBlurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-search' })).toBeNull()
    expect(runtime.snapshot().state.portSearch).toBe('vi')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.snapshot().searchBlurRequestId).toBe(portBlurRequestId)
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBeNull()

    runtime.dispatch('ports.groupSearch.focus')
    runtime.setPortGroupSearch('vi')
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'group', id: 'vite' })
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.apply')
    expect(runtime.snapshot().portGroupSearch).toBe('vi')
    expect(runtime.snapshot().selectedPortGroupTarget).toEqual({ kind: 'group', id: 'vite' })
    expect(runtime.snapshot().state.searchHistories.ports.groups).toEqual([])
  })

  it('normalizes result focus after search and keeps search-input navigation on visible rows', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    runtime.setPortSearch('9000')
    expect(runtime.snapshot().filteredPorts.map((row) => row.id)).toEqual(['13:9000:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('13:9000:tcp')

    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('13:9000:tcp')
    expect(runtime.handleShortcut('ArrowUp', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.up')
    expect(runtime.snapshot().focusedPortId).toBe('13:9000:tcp')
  })

  it('moves focus to the next visible result after Space multi-select and clamps at the last row', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')
    expect(runtime.handleShortcut('Space', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')

    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('13:9000:tcp')
    expect(runtime.handleShortcut('Space', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp', '13:9000:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('13:9000:tcp')
  })

  it('keeps multi-select on the list until the right action drawer is explicitly opened', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    runtime.togglePortSelection('11:3000:tcp')
    expect(runtime.snapshot().portDrawer.open).toBe(false)

    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawer).toMatchObject({ open: true, active: true, mode: 'multi', targetIds: ['11:3000:tcp'] })

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.drawer.close')
    expect(runtime.snapshot().portDrawer.open).toBe(false)
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp'])

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.selection.clear')
    expect(runtime.snapshot().selectedPortIds).toEqual([])
    expect(runtime.snapshot().portDrawer.open).toBe(false)
    expect(runtime.snapshot().state.activeTab).toBe('ports')

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.focus.clear')
    expect(runtime.handleShortcut('Escape', false)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('ports')
  })

  it('retargets an open port drawer when another row is focused by mouse', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()
    const ids = runtime.snapshot().ports.map((port) => port.id)
    expect(ids.length).toBeGreaterThan(1)

    runtime.focusPort(ids[0])
    expect(runtime.dispatch('ports.drawer.open').handled).toBe(true)
    expect(runtime.snapshot().portDrawer.targetIds).toEqual([ids[0]])

    runtime.focusPort(ids[1])
    expect(runtime.snapshot().portDrawer.open).toBe(true)
    expect(runtime.snapshot().portDrawer.mode).toBe('single')
    expect(runtime.snapshot().portDrawer.targetIds).toEqual([ids[1]])
    expect(runtime.snapshot().focusedPortId).toBe(ids[1])
  })

  it('prefers a newly focused port over stale selection while preserving focused multi-select batches', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    runtime.togglePortSelection('11:3000:tcp')
    runtime.focusPort('12:5174:tcp')
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawer).toMatchObject({ mode: 'single', targetIds: ['12:5174:tcp'] })

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.drawer.close')
    runtime.togglePortSelection('12:5174:tcp')
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawer).toMatchObject({ mode: 'multi', targetIds: ['11:3000:tcp', '12:5174:tcp'] })
  })

  it('opens a left detail drawer for the focused process and closes it before clearing search', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()
    runtime.setPortSearch('3000')

    expect(runtime.handleShortcut('Ctrl+ArrowLeft', false)).toBe('ports.detail.open')
    expect(runtime.snapshot().portDetail).toMatchObject({ open: true, active: true, targetId: '11:3000:tcp' })
    expect(runtime.snapshot().portDetailTarget).toMatchObject({ id: '11:3000:tcp', port: 3000, pid: 11 })

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.detail.close')
    expect(runtime.snapshot().portDetail.open).toBe(false)
    expect(runtime.snapshot().state.portSearch).toBe('3000')

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.search.clear')
    expect(runtime.snapshot().state.portSearch).toBe('')

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.focus.clear')
    expect(runtime.handleShortcut('Escape', false)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('ports')
  })

  it('opens and navigates the port action drawer using command shortcuts', async () => {
    const { killed } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawer).toMatchObject({ open: true, mode: 'single', targetIds: ['11:3000:tcp'], activeIndex: 0 })
    expect(runtime.snapshot().portDrawerItems[0]).toMatchObject({
      commandId: 'ports.kill.confirm',
      shortcutLabel: 'del / backspace'
    })
    expect(runtime.dispatch('ports.drawer.open', { portId: '12:5174:tcp' }).handled).toBe(true)
    expect(runtime.snapshot().portDrawer.targetIds).toEqual(['12:5174:tcp'])
    expect(runtime.dispatch('ports.drawer.open', { portId: 'missing' }).handled).toBe(false)
    expect(runtime.snapshot().portDrawer.targetIds).toEqual(['12:5174:tcp'])
    expect(runtime.dispatch('ports.drawer.open', { portId: '11:3000:tcp' }).handled).toBe(true)

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('ports.drawer.next')
    expect(runtime.snapshot().portDrawer.activeIndex).toBe(1)
    expect(runtime.handleShortcut('ArrowUp', false)).toBe('ports.drawer.prev')
    expect(runtime.snapshot().portDrawer.activeIndex).toBe(0)
    expect(runtime.handleShortcut('Ctrl+2', false)).toBe('ports.drawer.select.2')
    expect(runtime.snapshot().confirm?.title).toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(killed).toEqual([{ pid: 11, port: 3000, force: true }])
  })

  it('highlights the first matching group during search and runs group commands from the input', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      group('web', 'Web', ['3000'], 1),
      { ...group('vite', 'Vite', ['5173-5175'], 2), color: '#2F80ED' }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    runtime.dispatch('ports.pane.groups')
    runtime.setPortGroupSearch('vi')

    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'group', id: 'vite' })
    expect(runtime.handleShortcut('F2', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.edit')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'edit', groupId: 'vite' })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.group.edit.cancel')
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')
    expect(runtime.snapshot().selectedPortGroupId).toBeNull()

    expect(runtime.handleShortcut('Enter', false)).toBe('ports.group.apply')
    expect(runtime.snapshot().selectedPortGroupId).toBe('vite')
    expect(runtime.snapshot().selectedPortIds).toEqual([])
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.search.clear')
    expect(runtime.snapshot().portGroupSearch).toBe('')
  })

  it('runs highlighted group commands from the group search input after arrow movement', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      group('web', 'Web', ['3000'], 1),
      { ...group('vite', 'Vite', ['5173-5175'], 2), color: '#2F80ED' }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.dispatch('ports.groupSearch.focus')
    runtime.setPortGroupSearch('vi')
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')

    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.apply')
    expect(runtime.snapshot().selectedPortGroupTarget).toEqual({ kind: 'group', id: 'vite' })

    expect(runtime.handleShortcut('F2', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.edit')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'edit', groupId: 'vite' })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.group.edit.cancel')

    expect(runtime.handleShortcut('Shift+F2', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.rename')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'rename', groupId: 'vite' })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.group.edit.cancel')

    expect(runtime.handleShortcut('Ctrl+ArrowRight', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawer).toMatchObject({ open: true, mode: 'group', groupTarget: { kind: 'group', id: 'vite' } })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.drawer.close')

    expect(runtime.handleShortcut('Ctrl+ArrowLeft', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.groupDetail.open')
    expect(runtime.snapshot().portGroupDetail).toMatchObject({ open: true, target: { kind: 'group', id: 'vite' } })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.groupDetail.close')

    expect(runtime.handleShortcut('Ctrl+Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.focusMatches')
    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.snapshot().selectedPortIds).toEqual(['12:5174:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.snapshot().focusedPortGroupId).toBeNull()
    expect(runtime.snapshot().focusedPortGroupTarget).toBeNull()
  })

  it('runs group deletion shortcuts from the group search input after arrow movement', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      group('web', 'Web', ['3000'], 1),
      { ...group('vite', 'Vite', ['5173-5175'], 2), color: '#2F80ED' }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.dispatch('ports.groupSearch.focus')
    runtime.setPortGroupSearch('vi')
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('list.down')
    expect(runtime.handleShortcut('Backspace', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.delete')
    expect(runtime.snapshot().confirm?.title).toBe('删除端口组')
    runtime.cancelConfirm()

    expect(runtime.handleShortcut('Ctrl+Backspace', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.delete.force')
    expect(runtime.snapshot().state.portGroups.map((item) => item.id)).toEqual(['web'])
  })

  it('filters result rows from the focused group and cleans that group through shortcuts', async () => {
    const { state, killed } = installPlatform()
    state.portGroups = [
      group('web', 'Web', ['3000'], 1),
      { ...group('vite', 'Vite', ['5173-5175'], 2), color: '#2F80ED' }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.dispatch('ports.pane.groups').handled).toBe(true)
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')
    expect(runtime.handleShortcut('Enter', false)).toBe('ports.group.apply')
    expect(runtime.snapshot().filteredPorts.map((row) => row.id)).toEqual(['12:5174:tcp'])
    expect(runtime.snapshot().selectedPortIds).toEqual([])
    expect(runtime.snapshot().focusedPortId).toBeNull()

    expect(runtime.handleShortcut('Ctrl+Enter', false)).toBe('ports.group.focusMatches')
    expect(runtime.snapshot().selectedPortIds).toEqual(['12:5174:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.snapshot().focusedPortGroupId).toBeNull()
    expect(runtime.snapshot().focusedPortGroupTarget).toBeNull()
    expect(killed).toEqual([])
  })

  it('applies a group or folder by filtering first, then focuses matches with Ctrl+Enter', async () => {
    const { state } = installPlatform()
    state.portGroupFolders = [{ id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 1 }]
    state.portGroups = [
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 },
      { id: 'vite', name: 'Vite', color: '#2F80ED', entries: ['5173-5175'], folderId: 'dev', sortOrder: 2 }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroup('web')
    expect(runtime.handleShortcut('Enter', false)).toBe('ports.group.apply')
    expect(runtime.snapshot().selectedPortGroupId).toBe('web')
    expect(runtime.snapshot().selectedPortIds).toEqual([])
    expect(runtime.snapshot().focusedPortId).toBeNull()

    runtime.focusPortGroup('web')
    expect(runtime.handleShortcut('Ctrl+Enter', false)).toBe('ports.group.focusMatches')
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.selection.clear')
    runtime.focusPortGroupFolder('dev')
    expect(runtime.handleShortcut('Enter', false)).toBe('ports.group.apply')
    expect(runtime.snapshot().selectedPortGroupTarget).toEqual({ kind: 'folder', id: 'dev' })
    expect(runtime.snapshot().selectedPortIds).toEqual([])
    expect(runtime.snapshot().focusedPortId).toBeNull()

    runtime.focusPortGroupFolder('dev')
    expect(runtime.handleShortcut('Ctrl+Enter', false)).toBe('ports.group.focusMatches')
    expect(runtime.snapshot().selectedPortIds).toEqual(['11:3000:tcp', '12:5174:tcp'])
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
  })

  it('renames focused port group folders through F2 and drawer actions', async () => {
    const { state } = installPlatform()
    state.portGroupFolders = [{ id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 1 }]
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 }]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroupFolder('dev')
    expect(runtime.handleShortcut('F2', false)).toBe('ports.group.edit')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({
      mode: 'rename',
      target: { kind: 'folder', id: 'dev' },
      name: 'Dev'
    })

    runtime.updatePortGroupDraft({ name: 'Runtime' })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroupFolders[0]).toMatchObject({ id: 'dev', name: 'Runtime' })
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'folder', id: 'dev' })

    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawerItems.map((item) => item.commandId)).toEqual([
      'ports.group.apply',
      'ports.group.focusMatches',
      'ports.group.kill.confirm',
      'ports.group.kill.force',
      'ports.group.rename'
    ])

    expect(runtime.handleShortcut('Ctrl+5', false)).toBe('ports.drawer.select.5')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({
      mode: 'rename',
      target: { kind: 'folder', id: 'dev' },
      name: 'Runtime'
    })
  })

  it('moves a focused port group between folders through Ctrl+F2', async () => {
    const { state } = installPlatform()
    state.portGroupFolders = [
      { id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 1 },
      { id: 'ops', name: 'Ops', color: '#2F80ED', sortOrder: 2 }
    ]
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 }]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroup('web')
    expect(runtime.handleShortcut('Ctrl+F2', false)).toBe('ports.group.moveFolder')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'move-folder', groupId: 'web', activeField: 'folder', folderId: 'dev' })

    runtime.updatePortGroupDraft({ name: 'Ignored', entriesText: '9999', color: '#D64545', folderId: 'ops' })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ id: 'web', name: 'Web', entries: ['3000'], color: '#00A676', folderId: 'ops' })

    expect(runtime.handleShortcut('Ctrl+F2', false)).toBe('ports.group.moveFolder')
    runtime.updatePortGroupDraft({ folderId: null })
    expect(runtime.handleShortcut('Ctrl+Enter', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ id: 'web', folderId: null })

    runtime.focusPortGroupFolder('dev')
    expect(runtime.handleShortcut('Ctrl+F2', false)).toBeNull()
  })

  it('deletes focused groups with confirmation and force-deletes folders with child groups', async () => {
    const { state } = installPlatform()
    state.portGroupFolders = [
      { id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 1 },
      { id: 'ops', name: 'Ops', color: '#2F80ED', sortOrder: 2 }
    ]
    state.portGroups = [
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 },
      { id: 'vite', name: 'Vite', color: '#2F80ED', entries: ['5173-5175'], folderId: 'dev', sortOrder: 2 },
      { id: 'api', name: 'API', color: '#D64545', entries: ['9000'], folderId: 'ops', sortOrder: 3 }
    ]
    state.collapsedPortGroupFolderIds = ['dev']
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroup('api')
    expect(runtime.handleShortcut('Backspace', false)).toBe('ports.group.delete')
    expect(runtime.snapshot().confirm?.detail).toContain('API')
    expect(runtime.handleShortcut('Escape', false)).toBe('confirm.cancel')
    expect(runtime.snapshot().state.portGroups.map((item) => item.id)).toEqual(['web', 'vite', 'api'])

    expect(runtime.handleShortcut('Delete', false)).toBe('ports.group.delete')
    expect(runtime.handleShortcut('Enter', false)).toBe('confirm.accept')
    expect(runtime.snapshot().state.portGroups.map((item) => item.id)).toEqual(['web', 'vite'])

    runtime.focusPortGroupFolder('dev')
    expect(runtime.handleShortcut('Ctrl+Backspace', false)).toBe('ports.group.delete.force')
    expect(runtime.snapshot().state.portGroupFolders.map((item) => item.id)).toEqual(['ops'])
    expect(runtime.snapshot().state.portGroups).toEqual([])
    expect(runtime.snapshot().state.collapsedPortGroupFolderIds).toEqual([])
    expect(runtime.snapshot().selectedPortGroupTarget).toBeNull()
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'folder', id: 'ops' })
  })

  it('creates and focuses a port group folder through Ctrl+T from any port work area', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    const initialListFocusRequestId = runtime.snapshot().listFocusRequestId

    runtime.focusPort('11:3000:tcp')
    expect(runtime.handleShortcut('Ctrl+T', false)).toBe('ports.groupFolder.create')
    expect(runtime.snapshot().state.portGroupFolders).toHaveLength(1)
    const firstFolder = runtime.snapshot().state.portGroupFolders[0]
    expect(runtime.snapshot()).toMatchObject({
      groupSidePanelOpen: true,
      activePortPane: 'groups',
      focusedPortGroupTarget: { kind: 'folder', id: firstFolder.id },
      focusedPortGroupId: null,
      portGroupDraft: {
        mode: 'create',
        target: { kind: 'folder', id: firstFolder.id },
        name: firstFolder.name,
        activeField: 'name'
      }
    })
    expect(runtime.snapshot().listFocusRequestId).toBe(initialListFocusRequestId)

    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.cancel')

    expect(runtime.dispatch('ports.search.focus').handled).toBe(true)
    expect(runtime.handleShortcut('Ctrl+T', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.groupFolder.create')
    expect(runtime.snapshot().state.portGroupFolders).toHaveLength(2)
    const secondFolder = runtime.snapshot().state.portGroupFolders[1]
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'folder', id: secondFolder.id })
    expect(runtime.snapshot().portGroupDraft).toMatchObject({
      mode: 'create',
      target: { kind: 'folder', id: secondFolder.id },
      name: secondFolder.name,
      activeField: 'name'
    })
    expect(runtime.snapshot().listFocusRequestId).toBe(initialListFocusRequestId)
  })

  it('toggles focused port group folders through arrow commands', async () => {
    const { state } = installPlatform()
    state.portGroupFolders = [{ id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 1 }]
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 }]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroupFolder('dev')
    expect(runtime.handleShortcut('ArrowLeft', false)).toBe('ports.groupTarget.collapse')
    expect(runtime.snapshot().state.collapsedPortGroupFolderIds).toEqual(['dev'])

    expect(runtime.handleShortcut('ArrowRight', false)).toBe('ports.groupTarget.expand')
    expect(runtime.snapshot().state.collapsedPortGroupFolderIds).toEqual([])
  })

  it('cycles port panes with Tab shortcuts and starts row focus on first arrow movement', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    const initialListFocusRequestId = runtime.snapshot().listFocusRequestId

    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.handleShortcut('Tab', false)).toBe('ports.pane.toggleNext')
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')
    expect(runtime.snapshot().listFocusRequestId).toBe(initialListFocusRequestId + 1)
    expect(runtime.snapshot().listFocusTarget).toBe('groups')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')

    expect(runtime.handleShortcut('Shift+Tab', false)).toBe('ports.pane.togglePrev')
    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.snapshot().listFocusRequestId).toBe(initialListFocusRequestId + 2)
    expect(runtime.snapshot().listFocusTarget).toBe('results')

    expect(runtime.dispatch('ports.search.focus').handled).toBe(true)
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.pane.toggleNext')
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')
    expect(runtime.snapshot().listFocusRequestId).toBe(initialListFocusRequestId + 3)
    expect(runtime.snapshot().listFocusTarget).toBe('groups')

    expect(runtime.dispatch('ports.groupSearch.focus').handled).toBe(true)
    expect(runtime.handleShortcut('Shift+Tab', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.pane.togglePrev')
    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.snapshot().listFocusRequestId).toBe(initialListFocusRequestId + 4)
    expect(runtime.snapshot().listFocusTarget).toBe('results')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
  })

  it('toggles group panel with Ctrl+Shift+W using expand-pane and collapse-blur semantics', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    const initialFocusRequestId = runtime.snapshot().groupPanelFocusRequestId

    expect(runtime.handleShortcut('Alt+1', false)).toBeNull()
    expect(runtime.handleShortcut('Ctrl+W', false)).toBeNull()
    expect(runtime.handleShortcut('Ctrl+Shift+W', false)).toBe('ports.groups.togglePanel')
    expect(runtime.snapshot()).toMatchObject({
      groupSidePanelOpen: false,
      activePortPane: 'results',
      focusedPortGroupId: null,
      focusedPortGroupTarget: null,
      groupPanelFocusRequestId: initialFocusRequestId
    })

    expect(runtime.handleShortcut('Ctrl+Shift+W', false)).toBe('ports.groups.togglePanel')
    expect(runtime.snapshot()).toMatchObject({
      groupSidePanelOpen: true,
      activePortPane: 'groups',
      focusedPortGroupId: 'web',
      focusedPortGroupTarget: { kind: 'group', id: 'web' },
      groupPanelFocusRequestId: initialFocusRequestId + 1
    })

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')
  })

  it('routes search focus through explicit port and group search commands', () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.dispatch('search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchFocusTarget).toBe('ports')

    runtime.dispatch('ports.pane.groups')
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchFocusTarget).toBe('ports')

    expect(runtime.dispatch('ports.groupSearch.focus').handled).toBe(true)
    expect(runtime.snapshot().searchFocusTarget).toBe('port-groups')
  })

  it('clears previous port highlights when search focus is requested by command', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPort('11:3000:tcp')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.dispatch('ports.search.focus').handled).toBe(true)
    expect(runtime.snapshot()).toMatchObject({
      activePortPane: 'results',
      focusedPortId: null,
      focusedPortGroupId: null,
      focusedPortGroupTarget: null,
      searchFocusTarget: 'ports'
    })

    runtime.focusPortGroup('web')
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'group', id: 'web' })
    expect(runtime.dispatch('ports.groupSearch.focus').handled).toBe(true)
    expect(runtime.snapshot()).toMatchObject({
      activePortPane: 'groups',
      focusedPortId: null,
      focusedPortGroupId: null,
      focusedPortGroupTarget: null,
      searchFocusTarget: 'port-groups'
    })
  })

  it('opens the group pane and focuses group search from Ctrl+Shift+F inside port search', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.handleShortcut('Ctrl+Shift+W', false)).toBe('ports.groups.togglePanel')
    expect(runtime.snapshot().groupSidePanelOpen).toBe(false)

    expect(runtime.handleShortcut('Ctrl+Shift+F', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.groupSearch.focus')
    expect(runtime.snapshot()).toMatchObject({
      groupSidePanelOpen: true,
      activePortPane: 'groups',
      searchFocusTarget: 'port-groups'
    })
  })

  it('uses Escape to close group editing before clearing the active pane search', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroup('web')
    runtime.dispatch('ports.group.edit')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'edit', groupId: 'web' })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.group.edit.cancel')
    expect(runtime.snapshot().portGroupDraft).toBeNull()

    runtime.setPortGroupSearch('web')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.search.clear')
    expect(runtime.snapshot().portGroupSearch).toBe('')
  })

  it('uses F2 for full group editing, Shift+F2 for rename, and isolates editor shortcuts', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroup('web')
    expect(runtime.handleShortcut('F2', false)).toBe('ports.group.edit')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'edit', groupId: 'web', activeField: 'name' })

    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.nextField')
    expect(runtime.snapshot().portGroupDraft?.activeField).toBe('entries')
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.nextField')
    expect(runtime.snapshot().portGroupDraft?.activeField).toBe('color')
    expect(runtime.handleShortcut('Shift+Tab', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.prevField')
    expect(runtime.snapshot().portGroupDraft?.activeField).toBe('entries')

    runtime.updatePortGroupDraft({ name: 'Web Full', entriesText: '3000\n5174', color: '#2F80ED' })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ name: 'Web Full', entries: ['3000', '5174'], color: '#2F80ED' })

    runtime.focusPortGroup('web')
    expect(runtime.handleShortcut('F2', false)).toBe('ports.group.edit')
    runtime.updatePortGroupDraft({ name: 'Web Enter', entriesText: '3000\n5174\n9000', color: '#D64545' })
    expect(runtime.handleShortcut('Ctrl+Enter', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ name: 'Web Enter', entries: ['3000', '5174', '9000'], color: '#D64545' })

    runtime.focusPortGroup('web')
    expect(runtime.handleShortcut('Shift+F2', false)).toBe('ports.group.rename')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'rename', activeField: 'name' })
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.nextField')
    expect(runtime.snapshot().portGroupDraft?.activeField).toBe('name')
    runtime.updatePortGroupDraft({ name: 'Name Only', entriesText: '9999', color: '#D64545' })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ name: 'Name Only', entries: ['3000', '5174', '9000'], color: '#D64545' })
  })

  it('keeps editor Escape above search and drawer layers', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    runtime.setPortSearch('3000')
    runtime.togglePortSelection('11:3000:tcp')
    runtime.dispatch('ports.drawer.open')
    runtime.focusPortGroup('web')
    runtime.dispatch('ports.group.edit')

    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.cancel')
    expect(runtime.snapshot().portGroupDraft).toBeNull()
    expect(runtime.snapshot().portDrawer.open).toBe(true)
    expect(runtime.snapshot().state.portSearch).toBe('3000')

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.drawer.close')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.selection.clear')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.search.clear')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.focus.clear')
  })

  it('uses Escape as a command stack for confirm, editor, drawers, selection, workspace, and idle', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    runtime.handleShortcut('ArrowDown', false)
    runtime.dispatch('ports.kill.confirm')
    expect(runtime.snapshot().confirm).not.toBeNull()
    expect(runtime.handleShortcut('Escape', false)).toBe('confirm.cancel')
    expect(runtime.snapshot().confirm).toBeNull()

    runtime.togglePortSelection('11:3000:tcp')
    runtime.dispatch('ports.drawer.open')
    runtime.dispatch('ports.group.createFromSelection')
    expect(runtime.snapshot().portGroupDraft).not.toBeNull()
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.cancel')
    expect(runtime.snapshot().portGroupDraft).toBeNull()
    expect(runtime.snapshot().portDrawer.open).toBe(true)

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.drawer.close')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.selection.clear')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.focus.clear')
    expect(runtime.handleShortcut('Escape', false)).toBeNull()
  })

  it('creates, renames, edits, searches, and deletes user port groups through runtime actions', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()
    runtime.togglePortSelection('11:3000:tcp')
    runtime.togglePortSelection('12:5174:tcp')

    expect(runtime.dispatch('ports.group.createFromSelection').handled).toBe(true)
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'create', entriesText: '3000\n5174' })

    runtime.savePortGroupDraft({ name: 'Selected', entriesText: '3000\n5174', color: '#00A676' })
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ name: 'Selected', entries: ['3000', '5174'] })
    const groupId = runtime.snapshot().state.portGroups[0].id

    runtime.focusPortGroup(groupId)
    runtime.dispatch('ports.group.rename')
    runtime.savePortGroupDraft({ name: 'Renamed', entriesText: '3000\n5174', color: '#00A676' })
    expect(runtime.snapshot().state.portGroups[0].name).toBe('Renamed')

    runtime.setPortGroupSearch('renamed')
    expect(runtime.snapshot().filteredPortGroups.map((group) => group.id)).toEqual([groupId])

    runtime.dispatch('ports.group.delete')
    expect(runtime.snapshot().confirm?.title).toContain('删除端口组')
    expect(runtime.handleShortcut('Enter', false)).toBe('confirm.accept')
    expect(runtime.snapshot().state.portGroups).toEqual([])
  })

  it('auto-scans and requests inline focus when search is opened or typed before ports are loaded', async () => {
    const { getScanCount } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.dispatch('search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchOverlayOpen).toBe(false)
    expect(runtime.snapshot().searchFocusRequestId).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getScanCount()).toBe(1)
    expect(runtime.snapshot().filteredPorts.map((row) => row.id)).toEqual(['11:3000:tcp', '12:5174:tcp', '13:9000:tcp'])

    const { getScanCount: getSecondScanCount } = installPlatform()
    const secondRuntime = createAppRuntime(createInitialState(100))
    secondRuntime.setPortSearch('3000')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSecondScanCount()).toBe(1)
    expect(secondRuntime.snapshot().filteredPorts.map((row) => row.id)).toEqual(['11:3000:tcp'])
  })

  it('keeps legacy search histories inert while search inputs drive current filters', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      group('api', 'API', ['9000']),
      group('dev', 'Dev', ['3000'])
    ]
    state.searchHistories = {
      ports: {
        processes: ['node', 'vite'],
        groups: ['dev']
      },
      favorites: {
        files: ['docs']
      }
    }
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.dispatch('ports.search.focus').handled).toBe(true)
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')

    runtime.setPortSearch('n')
    expect(runtime.snapshot().state.portSearch).toBe('n')
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.pane.toggleNext')
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBeNull()
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-search' })).toBeNull()
    expect(runtime.dispatch('search.history.accept').handled).toBe(false)
    expect(runtime.snapshot().state.searchHistories.ports.processes).toEqual(['node', 'vite'])

    expect(runtime.dispatch('ports.groupSearch.focus').handled).toBe(true)
    runtime.setPortGroupSearch('api')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.apply')
    expect(runtime.snapshot().state.searchHistories.ports.groups).toEqual(['dev'])
    expect(runtime.snapshot().state.searchHistories.ports.processes).not.toContain('api')
    expect(runtime.snapshot().focusedPortGroupId).toBe('api')
    expect(runtime.snapshot().selectedPortGroupTarget).toEqual({ kind: 'group', id: 'api' })

    runtime.saveFeatureConfigs([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ])
    runtime.setTab('favorites')
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    runtime.setFavoriteSearch('repo')
    expect(runtime.dispatch('search.history.accept').handled).toBe(false)
    expect(runtime.snapshot().state.searchHistories.favorites.files).toEqual(['docs'])
  })

  it('switches feature tabs through Ctrl+Shift numbers and keeps settings on Ctrl+Alt+S', () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.handleShortcut('Ctrl+2', false)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('ports')
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBe('tab.select.mqtt')
    expect(runtime.snapshot().state.activeTab).toBe('mqtt')
    runtime.setTab('ports')
    expect(runtime.handleShortcut('Ctrl+3', false)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('ports')
    expect(runtime.handleShortcut('Ctrl+Alt+S', false)).toBe('settings.open')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    runtime.setTab('ports')
    expect(runtime.handleShortcut('Ctrl+Alt+S', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('settings.open')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    runtime.setTab('ports')
    expect(runtime.handleShortcut('Ctrl+Alt+S', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('settings.open')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    runtime.saveFeatureConfigs([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ])
    runtime.setTab('favorites')
    expect(runtime.handleShortcut('Ctrl+Alt+S', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBe('settings.open')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    runtime.setTab('settings')
    expect(runtime.handleShortcut('Ctrl+Alt+S', { textInputFocused: true, activeInputRole: 'settings' })).toBe('settings.open')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    runtime.setTab('ports')
    expect(runtime.handleShortcut('Ctrl+Alt+S', { textInputFocused: true, activeInputRole: 'other' })).toBe('settings.open')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    runtime.setTab('ports')
    expect(runtime.dispatch('tab.select.settings').handled).toBe(true)
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    expect(runtime.handleShortcut('Ctrl+1', true)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('settings')
  })

  it('toggles the Codex float from every app context and refuses to bypass a disabled feature', () => {
    const { configuredHotkeys } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)
    expect(runtime.dispatch('codex.hotkey.configure').handled).toBe(true)
    expect(configuredHotkeys).toEqual(['直接展开 Codex 卡片'])
    expect(runtime.handleShortcut('Ctrl+Alt+Q', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('codex.float.toggle')
    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(true)
    expect(runtime.handleShortcut('Ctrl+Alt+Q', { textInputFocused: true, activeInputRole: 'other' })).toBe('codex.float.toggle')
    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)

    runtime.saveFeatureConfigs([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'codex', enabled: false, sortOrder: 4 },
      { id: 'settings', enabled: true, sortOrder: 5 }
    ])
    expect(runtime.handleShortcut('Ctrl+Alt+Q', false)).toBeNull()
    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)
    expect(runtime.snapshot().message).toBe('请先在总设置中启用 Codex Companion')
    runtime.dispose()
  })

  it('registers the fixed Claude task sync action and rejects incomplete identity arguments', () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.dispatch('codex.claude.task.sync', {
      key: 'claude:local_11111111-1111-4111-8111-111111111111',
      actionAlias: 'local_11111111-1111-4111-8111-111111111111'
    })).toMatchObject({ handled: true, actionId: 'codex.claude.task.sync' })
    expect(runtime.dispatch('codex.claude.task.sync', { key: 'claude:stale' })).toMatchObject({
      handled: false,
      actionId: 'codex.claude.task.sync'
    })
    runtime.dispose()
  })

  it('shows, expands and focuses the Codex card through its global activation command', async () => {
    const activate = vi.fn(() => true)
    const { state } = installPlatform({
      float: { sync: () => true, activate, close: () => undefined, onAction: () => () => undefined }
    })
    const runtime = createAppRuntime(state)

    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)
    expect(runtime.handleShortcut('Ctrl+Alt+Enter', { textInputFocused: true, activeInputRole: 'other' })).toBe('codex.float.activate')
    await Promise.resolve()
    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(true)
    expect(activate).toHaveBeenCalledTimes(1)
    runtime.dispose()
  })

  it('routes Codex Ctrl+T to the float composer only in the Codex profile and outside text input', async () => {
    const activate = vi.fn(() => true)
    const { state } = installPlatform({
      float: { sync: () => true, activate, close: () => undefined, onAction: () => () => undefined }
    })
    const runtime = createAppRuntime(state)
    runtime.setTab('codex')

    expect(runtime.handleShortcut('Ctrl+T', false)).toBe('codex.thread.createFocused')
    await Promise.resolve()
    expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(true)
    expect(activate).toHaveBeenCalledWith({ command: 'new-thread' })
    expect(runtime.handleShortcut('Ctrl+T', { textInputFocused: true, activeInputRole: 'codex-composer' })).toBeNull()

    runtime.setTab('favorites')
    expect(runtime.handleShortcut('Ctrl+T', false)).not.toBe('codex.thread.createFocused')
    runtime.dispose()
  })

  it('deduplicates the in-app and uTools Codex toggle in either delivery order', () => {
    const runtime = createAppRuntime(createInitialState(100))
    const now = vi.spyOn(Date, 'now')
    try {
      now.mockReturnValue(1_000)
      expect(runtime.dispatch('codex.float.toggle', { source: 'utools-feature' }).handled).toBe(true)
      expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(true)
      now.mockReturnValue(1_100)
      expect(runtime.dispatch('codex.float.toggle', { source: 'in-app-shortcut' }).handled).toBe(true)
      expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(true)

      now.mockReturnValue(2_000)
      expect(runtime.dispatch('codex.float.toggle', { source: 'in-app-shortcut' }).handled).toBe(true)
      expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)
      now.mockReturnValue(2_100)
      expect(runtime.dispatch('codex.float.toggle', { source: 'utools-feature' }).handled).toBe(true)
      expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)

      now.mockReturnValue(3_000)
      expect(runtime.handleShortcut('Ctrl+Alt+Q', false)).toBe('codex.float.toggle')
      expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(true)
      now.mockReturnValue(3_400)
      expect(runtime.handleShortcut('Ctrl+Alt+Q', false)).toBe('codex.float.toggle')
      expect(runtime.snapshot().state.codex.settings.floatEnabled).toBe(false)
    } finally {
      now.mockRestore()
      runtime.dispose()
    }
  })

  it('persists feature configs, updates visible tab order, and keeps settings enabled', () => {
    const { state, platform } = installPlatform()
    let savedState: unknown = null
    platform.storage.setState = (nextState: unknown) => {
      savedState = nextState
      return true
    }
    const runtime = createAppRuntime(state)

    expect(runtime.snapshot().visibleFeatures.map((feature) => feature.id)).toEqual(['ports', 'mqtt', 'codex', 'settings'])
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBe('tab.select.mqtt')
    expect(runtime.snapshot().state.activeTab).toBe('mqtt')
    runtime.setTab('ports')

    runtime.saveFeatureConfigs([
      { id: 'settings', enabled: false, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'mqtt', enabled: true, sortOrder: 3 },
      { id: 'ports', enabled: true, sortOrder: 4 },
      { id: 'codex', enabled: true, sortOrder: 5 }
    ])

    expect(runtime.snapshot().state.settings.featureConfigs).toEqual([
      { id: 'settings', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'mqtt', enabled: true, sortOrder: 3 },
      { id: 'ports', enabled: true, sortOrder: 4 },
      { id: 'codex', enabled: true, sortOrder: 5 },
      { id: 'windows', enabled: false, sortOrder: 6 }
    ])
    expect(runtime.snapshot().visibleFeatures.map((feature) => ({
      id: feature.id,
      shortcutId: feature.shortcutId,
      commandId: feature.shortcutCommandId
    }))).toEqual([
      { id: 'settings', shortcutId: 'Ctrl+Alt+S', commandId: 'settings.open' },
      { id: 'favorites', shortcutId: 'Ctrl+Shift+1', commandId: 'tab.select.favorites' },
      { id: 'mqtt', shortcutId: 'Ctrl+Shift+2', commandId: 'tab.select.mqtt' },
      { id: 'ports', shortcutId: 'Ctrl+Shift+3', commandId: 'tab.select.ports' },
      { id: 'codex', shortcutId: 'Ctrl+Shift+4', commandId: 'tab.select.codex' }
    ])
    expect(runtime.handleShortcut('Ctrl+Shift+1', false)).toBe('tab.select.favorites')
    expect(runtime.snapshot().state.activeTab).toBe('favorites')
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBe('tab.select.mqtt')
    expect(runtime.snapshot().state.activeTab).toBe('mqtt')
    expect(runtime.handleShortcut('Ctrl+Shift+3', false)).toBe('tab.select.ports')
    expect(runtime.snapshot().state.activeTab).toBe('ports')
    expect(savedState).toMatchObject({
      settings: {
        featureConfigs: [
          { id: 'settings', enabled: true, sortOrder: 1 },
          { id: 'favorites', enabled: true, sortOrder: 2 },
          { id: 'mqtt', enabled: true, sortOrder: 3 },
          { id: 'ports', enabled: true, sortOrder: 4 },
          { id: 'codex', enabled: true, sortOrder: 5 },
          { id: 'windows', enabled: false, sortOrder: 6 }
        ]
      }
    })
  })

  it('keeps MQTT isolated until the feature is enabled and loaded', async () => {
    const { state, platform } = installPlatform()
    const storageCalls: string[] = []
    platform.storage.getMqttArchive = () => {
      storageCalls.push('read')
      return { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
    }
    platform.storage.setMqttArchive = () => {
      storageCalls.push('write')
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: false, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    expect(runtime.snapshot().mqttArchiveLoaded).toBe(false)
    expect(storageCalls).toEqual([])

    runtime.saveFeatureConfigs([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ])
    runtime.setTab('mqtt')
    expect(runtime.snapshot().state.activeTab).toBe('mqtt')
    expect(runtime.snapshot().mqttArchiveLoaded).toBe(true)
    expect(storageCalls).toEqual(['read'])
  })

  it('manages MQTT configs and keeps message records durable even when syncRecords is disabled', () => {
    const { state, platform } = installPlatform()
    const archiveWrites: unknown[] = []
    platform.storage.getMqttArchive = () => ({ version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] })
    platform.storage.setMqttArchive = (archive: unknown) => {
      archiveWrites.push(archive)
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.dispatch('mqtt.config.create').handled).toBe(true)
    runtime.updateMqttConfigDraft({
      name: 'Dev Broker',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      username: 'user',
      password: 'secret',
      subscriptionItems: [{ topic: 'demo/#', alias: '演示订阅' }],
      publishTopic: 'demo/out',
      syncRecords: false
    })
    expect(runtime.dispatch('mqtt.config.save').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      name: 'Dev Broker',
      url: 'ws://broker.example:8083/',
      subscriptions: ['demo/#'],
      subscriptionAliases: { 'demo/#': '演示订阅' },
      publishTopic: 'demo/out',
      syncRecords: false
    })
    expect(JSON.stringify(runtime.snapshot().state.mqtt)).not.toContain('secret')

    runtime.appendMqttMessageRecord({
      direction: 'incoming',
      topic: 'demo/in',
      payload: 'hello',
      qos: 0,
      retain: false
    })
    expect(runtime.snapshot().mqttArchive.sessions[0].messages[0]).toMatchObject({
      topic: 'demo/in',
      payload: 'hello'
    })
    expect(archiveWrites.length).toBeGreaterThan(0)
    expect(archiveWrites.at(-1)).toMatchObject({
      connectionSnapshots: [expect.objectContaining({ id: runtime.snapshot().state.mqtt.configs[0].id, name: 'Dev Broker' })],
      sessions: [expect.objectContaining({
        messages: [expect.objectContaining({ topic: 'demo/in', payload: 'hello' })]
      })]
    })

    expect(runtime.dispatch('mqtt.record.rename', { title: 'Greeting', note: 'from broker' }).handled).toBe(true)
    expect(runtime.snapshot().mqttArchive.sessions[0].messages[0]).toMatchObject({
      payload: 'hello'
    })
    expect(runtime.snapshot().mqttArchive.sessions[0].messages[0].title).toBeUndefined()
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({
      title: 'Greeting',
      note: 'from broker',
      topic: 'demo/in',
      payload: 'hello'
    })
    expect(runtime.dispatch('mqtt.record.resendDraft').handled).toBe(true)
    expect(runtime.snapshot().mqttPublishDraft).toMatchObject({
      topic: 'demo/in',
      payload: 'hello'
    })
  })

  it('keeps MQTT message rows visible when reconnect creates a new session', async () => {
    const { state } = installPlatform()
    const clientRef: { current: ReturnType<typeof createFakeMqttClient> | null } = { current: null }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state, {
      mqttModuleLoader: async () => ({
        default: {
          connect: () => {
            clientRef.current = createFakeMqttClient()
            return clientRef.current
          }
        }
      })
    })

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    const configId = runtime.snapshot().state.mqtt.configs[0].id
    runtime.appendMqttMessageRecord({ id: 'before-reconnect', direction: 'incoming', topic: 'plc/status', payload: 'online', qos: 0, retain: false, timestamp: 1000 })
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['before-reconnect'])

    runtime.focusMqttConfig(configId)
    runtime.dispatch('mqtt.connection.connect')
    for (let index = 0; index < 10 && !clientRef.current; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    clientRef.current?.emit('connect')

    expect(runtime.snapshot().mqttArchive.sessions).toHaveLength(2)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['before-reconnect'])

    runtime.dispatch('mqtt.connection.disconnect')
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['before-reconnect'])
  })

  it('starts new MQTT config drafts without active-config cache data', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'Ws-Plc',
      protocol: 'ws',
      host: 'ainongyun.net',
      port: '8083',
      path: '/',
      clientId: 'cached-client',
      subscriptionItems: [
        { topic: 'plc/czz060301/cmd', alias: 'cmd' },
        { topic: 'plc/czz060301/status', alias: 'status' }
      ],
      publishTopic: 'plc/czz060301/set'
    })
    runtime.dispatch('mqtt.config.save')

    expect(runtime.dispatch('mqtt.config.create').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      mode: 'create',
      targetId: null,
      name: '',
      url: '',
      clientId: '',
      host: '',
      port: '',
      path: '',
      username: '',
      password: '',
      subscriptionsText: '',
      subscriptionItems: [],
      publishTopic: ''
    })
  })

  it('tracks MQTT subscription unread counts and filters received rows by subscription and direction', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      subscriptionItems: [
        { topic: 'plc/+/status', alias: '状态', color: '#111111' },
        { topic: 'plc/#', alias: '全部 PLC', color: '#222222' }
      ],
      publishTopic: 'plc/czz060301/set'
    })
    runtime.dispatch('mqtt.config.save')
    const configId = runtime.snapshot().state.mqtt.activeConfigId
    expect(configId).toBeTruthy()

    runtime.appendMqttMessageRecord({ direction: 'incoming', topic: 'plc/czz060301/status', payload: 'in-status', qos: 0, retain: false, timestamp: 1300 })
    runtime.appendMqttMessageRecord({ direction: 'outgoing', topic: 'plc/czz060301/set', payload: 'out-set', qos: 0, retain: false, timestamp: 1200 })
    runtime.appendMqttMessageRecord({ direction: 'incoming', topic: 'other/status', payload: 'ignored', qos: 0, retain: false, timestamp: 1100 })

    expect(runtime.snapshot().mqttSubscriptionRows).toEqual([
      expect.objectContaining({ topic: 'plc/+/status', alias: '状态', displayName: '状态', unreadCount: 1, selected: false, focused: false }),
      expect.objectContaining({ topic: 'plc/#', alias: '全部 PLC', displayName: '全部 PLC', unreadCount: 1, selected: false, focused: false })
    ])
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.payload)).toEqual(['in-status', 'ignored'])

    expect(runtime.dispatch('mqtt.subscription.select', { topic: 'plc/+/status' }).handled).toBe(true)
    expect(runtime.snapshot().mqttActiveSubscriptionTopic).toBe('plc/+/status')
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual(['plc/+/status'])
    expect(runtime.snapshot().mqttSubscriptionRows[0]).toMatchObject({ unreadCount: 0, active: true, selected: true, focused: true })
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.payload)).toEqual(['in-status'])

    expect(runtime.dispatch('mqtt.subscription.toggleSelect', { topic: 'plc/#' }).handled).toBe(true)
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual(['plc/+/status', 'plc/#'])
    expect(runtime.dispatch('mqtt.subscription.applyFilter').handled).toBe(true)
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual(['plc/+/status', 'plc/#'])
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.payload)).toEqual(['in-status'])

    expect(runtime.dispatch('mqtt.subscription.select', { topic: '' }).handled).toBe(true)
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual([])
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.payload)).toEqual(['in-status', 'ignored'])

    expect(runtime.dispatch('mqtt.receive.filter.out').handled).toBe(true)
    expect(runtime.snapshot().mqttReceiveFilter).toBe('outgoing')
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.payload)).toEqual(['out-set'])

    expect(runtime.dispatch('mqtt.receive.filter.all').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.payload)).toEqual(['in-status', 'out-set', 'ignored'])

    expect(runtime.dispatch('mqtt.subscription.delete', { topic: 'plc/+/status' }).handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptions).toEqual(['plc/#'])
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptionAliases).toEqual({ 'plc/#': '全部 PLC' })
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptionColors).toEqual({ 'plc/#': '#222222' })

    expect(runtime.dispatch('mqtt.subscription.clearAll').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptions).toEqual([])
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptionAliases).toEqual({})
  })

  it('moves, selects, copies, and deletes MQTT connection rail rows through command actions', async () => {
    const { state, copied } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.configs = [
      createMqttConnectionConfig({ id: 'dev-a', name: 'PLC A', url: 'ws://a.example:8083/', subscriptions: ['plc/a'] }, 100),
      createMqttConnectionConfig({ id: 'dev-b', name: 'PLC B', url: 'wss://b.example:443/mqtt', subscriptions: ['plc/b'] }, 101)
    ]
    state.mqtt.activeConfigId = 'dev-a'
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.focusMqttConfig('dev-a')
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('list.down')
    expect(runtime.snapshot().state.mqtt.activeConfigId).toBe('dev-b')
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'config', id: 'dev-b' })

    expect(runtime.dispatch('mqtt.connection.toggleSelect').handled).toBe(true)
    expect(runtime.snapshot().mqttSelectedConfigIds).toEqual(['dev-b'])
    expect(runtime.handleShortcut('Ctrl+C', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.connection.copyAddress')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['wss://b.example:443/mqtt'])

    expect(runtime.dispatch('mqtt.drawer.open', { kind: 'config', id: 'dev-a' }).handled).toBe(true)
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ active: true, targetKind: 'config', targetId: 'dev-a' })
    expect(runtime.dispatch('mqtt.detail.open', { kind: 'config', id: 'dev-b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ active: false, targetKind: 'config', targetId: 'dev-b' })
    expect(runtime.dispatch('mqtt.drawer.open', { kind: 'config', id: 'missing' }).handled).toBe(false)
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ targetKind: 'config', targetId: 'dev-b' })
    expect(runtime.dispatch('mqtt.drawer.open', { kind: 'config', id: 'dev-b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttDrawerItems.map((item) => item.commandId)).toEqual(expect.arrayContaining([
      'mqtt.detail.open',
      'mqtt.connection.copyAddress',
      'mqtt.connection.connect',
      'mqtt.connection.disconnect',
      'mqtt.config.edit',
      'mqtt.connection.delete'
    ]))

    expect(runtime.dispatch('mqtt.connection.deleteSelected').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs.map((config) => config.id)).toEqual(['dev-a'])
    expect(runtime.snapshot().mqttSelectedConfigIds).toEqual([])
  })

  it('creates nested MQTT connection groups and reorders connection tree targets', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.configs = [
      createMqttConnectionConfig({ id: 'root', name: 'Root Broker', url: 'ws://root.example:8083/', sortOrder: 1 }, 100)
    ]
    state.mqtt.activeConfigId = 'root'
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.dispatch('mqtt.connectionGroup.create').handled).toBe(true)
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'create', name: '', parentId: null, activeField: 'name' })
    runtime.updateMqttConnectionGroupDraft({ name: '生产线', color: '#00A676' })
    expect(runtime.dispatch('mqtt.connectionGroup.save').handled).toBe(true)
    const rootGroupId = runtime.snapshot().state.mqtt.connectionGroups.find((group) => group.name === '生产线')?.id
    expect(rootGroupId).toBeTruthy()
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'connection-group', id: rootGroupId })

    expect(runtime.dispatch('mqtt.connectionGroup.create').handled).toBe(true)
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ parentId: rootGroupId })
    runtime.updateMqttConnectionGroupDraft({ name: 'A 线', color: '#2F80ED' })
    expect(runtime.dispatch('mqtt.connectionGroup.save').handled).toBe(true)
    const lineGroupId = runtime.snapshot().state.mqtt.connectionGroups.find((group) => group.name === 'A 线')?.id
    expect(lineGroupId).toBeTruthy()

    expect(runtime.dispatch('mqtt.config.create').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'create', groupId: lineGroupId })
    runtime.updateMqttConfigDraft({
      name: 'PLC A',
      protocol: 'ws',
      host: 'a.example',
      port: '8083',
      path: '/',
      clientId: 'client-a'
    })
    expect(runtime.dispatch('mqtt.config.save').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs.find((config) => config.name === 'PLC A')?.groupId).toBe(lineGroupId)

    expect(runtime.dispatch('mqtt.connectionTree.move', {
      movingKind: 'config',
      movingId: 'root',
      targetKind: 'group',
      targetId: lineGroupId,
      position: 'inside'
    }).handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs.filter((config) => config.groupId === lineGroupId).map((config) => config.id)).toEqual([
      expect.stringMatching(/^mqtt-config:/),
      'root'
    ])
    expect(runtime.snapshot().mqttConnectionRows.map((row) => [row.kind, row.id, row.depth])).toEqual([
      ['group', rootGroupId, 0],
      ['group', lineGroupId, 1],
      ['config', expect.stringMatching(/^mqtt-config:/), 2],
      ['config', 'root', 2]
    ])

    expect(runtime.dispatch('mqtt.connectionGroup.collapse', { id: rootGroupId }).handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.layoutPrefs.collapsedConnectionGroupIds).toEqual([rootGroupId])
    expect(runtime.snapshot().mqttConnectionRows.map((row) => row.id)).toEqual([rootGroupId])

    expect(runtime.dispatch('mqtt.connectionGroup.expand', { id: rootGroupId }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.connectionGroup.delete', { id: lineGroupId }).handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.connectionGroups.map((group) => group.id)).toEqual([rootGroupId])
    expect(runtime.snapshot().state.mqtt.configs.filter((config) => config.groupId === rootGroupId).map((config) => config.name)).toEqual(['PLC A', 'Root Broker'])
  })

  it('routes MQTT connection group edit and rename through the connection pane F2 commands', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.connectionGroups = [
      { id: 'prod', name: '生产线', color: '#00A676', parentId: null, sortOrder: 1, createdAt: 1, updatedAt: 1 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.focusMqttConnectionGroup('prod')
    expect(runtime.handleShortcut('F2', false)).toBe('mqtt.connectionGroup.edit')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'edit', targetId: 'prod', name: '生产线' })

    runtime.updateMqttConnectionGroupDraft({ name: '生产现场' })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'mqtt-connection-group-editor' })).toBe('mqtt.connectionGroup.save')
    expect(runtime.snapshot().state.mqtt.connectionGroups[0].name).toBe('生产现场')

    expect(runtime.handleShortcut('Shift+F2', false)).toBe('mqtt.connectionGroup.rename')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'rename', targetId: 'prod', name: '生产现场', activeField: 'name' })

    runtime.updateMqttConnectionGroupDraft({ name: '生产内网' })
    expect(runtime.handleShortcut('Ctrl+Enter', { textInputFocused: true, activeInputRole: 'mqtt-connection-group-editor' })).toBe('mqtt.connectionGroup.save')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toBeNull()
    expect(runtime.snapshot().state.mqtt.connectionGroups[0].name).toBe('生产内网')

    expect(runtime.handleShortcut('Shift+F2', false)).toBe('mqtt.connectionGroup.rename')
    runtime.updateMqttConnectionGroupDraft({ name: '不保存' })
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'mqtt-connection-group-editor' })).toBe('mqtt.connectionGroup.cancel')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toBeNull()
    expect(runtime.snapshot().state.mqtt.connectionGroups[0].name).toBe('生产内网')
  })

  it('routes MQTT connection group create, move-parent, detail, and drawer through connection tree shortcuts', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.connectionGroups = [
      { id: 'prod', name: '生产线', color: '#00A676', parentId: null, sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'line-a', name: 'A 线', color: '#2F80ED', parentId: 'prod', sortOrder: 1, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.focusMqttConnectionGroup('line-a')
    expect(runtime.handleShortcut('Ctrl+F2', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.connectionGroup.moveParent')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'move-parent', targetId: 'line-a', activeField: 'parent' })

    runtime.updateMqttConnectionGroupDraft({ parentId: null })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'mqtt-connection-group-editor' })).toBe('mqtt.connectionGroup.save')
    expect(runtime.snapshot().state.mqtt.connectionGroups.find((group) => group.id === 'line-a')?.parentId).toBeNull()

    expect(runtime.handleShortcut('Ctrl+G', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.connectionGroup.create')
    expect(runtime.handleShortcut('Ctrl+Alt+G', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBeNull()
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'create', parentId: 'line-a' })

    runtime.dispatch('mqtt.connectionGroup.cancel')
    expect(runtime.handleShortcut('Ctrl+ArrowLeft', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.detail.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: true, active: false, targetKind: 'connection-group', targetId: 'line-a' })

    expect(runtime.handleShortcut('Ctrl+ArrowRight', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.drawer.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: true, active: true, targetKind: 'connection-group', targetId: 'line-a' })
    expect(runtime.snapshot().mqttDrawerItems.map((item) => item.commandId)).toEqual([
      'mqtt.detail.open',
      'mqtt.connectionGroup.create',
      'mqtt.config.create',
      'mqtt.connectionGroup.moveParent',
      'mqtt.connectionGroup.rename',
      'mqtt.connectionGroup.edit',
      'mqtt.connectionGroup.collapse',
      'mqtt.connectionGroup.expand',
      'mqtt.connectionGroup.delete'
    ])
    const collapseItem = runtime.snapshot().mqttDrawerItems.find((item) => item.commandId === 'mqtt.connectionGroup.collapse')
    const expandItem = runtime.snapshot().mqttDrawerItems.find((item) => item.commandId === 'mqtt.connectionGroup.expand')
    expect(collapseItem?.shortcutLabel.startsWith('c-7')).toBe(true)
    expect(collapseItem?.shortcutLabel.includes('←')).toBe(false)
    expect(expandItem?.shortcutLabel.startsWith('c-8')).toBe(true)
    expect(expandItem?.shortcutLabel.includes('→')).toBe(false)
    expect(runtime.snapshot().mqttDrawerItems.find((item) => item.commandId === 'mqtt.config.create')?.icon).toBe('add')
  })

  it('uses MQTT connection focus scope to choose create parent targets', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.connectionGroups = [
      { id: 'prod', name: '生产线', color: '#00A676', parentId: null, sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'line-a', name: 'A 线', color: '#2F80ED', parentId: 'prod', sortOrder: 1, createdAt: 2, updatedAt: 2 }
    ]
    state.mqtt.configs = [
      createMqttConnectionConfig({ id: 'plc-a', name: 'PLC A', url: 'ws://a.example:8083/', groupId: 'line-a', sortOrder: 1 }, 100)
    ]
    state.mqtt.activeConfigId = 'plc-a'
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.snapshot().mqttPanelOpen).toBe(true)

    runtime.focusMqttConnectionGroup('line-a')
    expect(runtime.handleShortcut('Ctrl+G', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.connectionGroup.create')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'create', parentId: 'line-a' })
    runtime.dispatch('mqtt.connectionGroup.cancel')

    expect(runtime.handleShortcut('Ctrl+N', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.config.create')
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'create', groupId: 'line-a' })
    runtime.dispatch('mqtt.config.cancel')

    runtime.focusMqttConfig('plc-a')
    expect(runtime.handleShortcut('Ctrl+G', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.connectionGroup.create')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'create', parentId: 'line-a' })
    runtime.dispatch('mqtt.connectionGroup.cancel')

    expect(runtime.handleShortcut('Ctrl+N', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.config.create')
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'create', groupId: 'line-a' })
    runtime.dispatch('mqtt.config.cancel')

    runtime.focusMqttConnectionGroup('line-a')
    expect(runtime.handleShortcut('Ctrl+G', { textInputFocused: true, activeInputRole: 'mqtt-search' })).toBe('mqtt.connectionGroup.create')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'create', parentId: null })
    runtime.dispatch('mqtt.connectionGroup.cancel')

    expect(runtime.handleShortcut('Ctrl+N', { textInputFocused: true, activeInputRole: 'mqtt-search' })).toBe('mqtt.config.create')
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'create', groupId: null })
    runtime.dispatch('mqtt.config.cancel')

    runtime.dispatch('mqtt.focus.messages')
    expect(runtime.handleShortcut('Ctrl+G', false)).toBe('mqtt.connectionGroup.create')
    expect(runtime.snapshot().mqttConnectionGroupDraft).toMatchObject({ mode: 'create', parentId: null })
    runtime.dispatch('mqtt.connectionGroup.cancel')

    expect(runtime.handleShortcut('Ctrl+N', false)).toBe('mqtt.config.create')
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'create', groupId: null })
    runtime.dispatch('mqtt.config.cancel')

    runtime.dispatch('mqtt.panel.toggle')
    expect(runtime.snapshot().mqttPanelOpen).toBe(false)
    expect(runtime.handleShortcut('Ctrl+G', false)).toBeNull()
    expect(runtime.handleShortcut('Ctrl+N', false)).toBeNull()
  })

  it('clears MQTT rail multi-select rendering with Escape before clearing focused record', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.configs = [
      createMqttConnectionConfig({ id: 'dev-a', name: 'PLC A', url: 'ws://a.example:8083/', subscriptions: ['plc/a', 'plc/b'] }, 100),
      createMqttConnectionConfig({ id: 'dev-b', name: 'PLC B', url: 'ws://b.example:8083/', subscriptions: ['plc/c'] }, 101)
    ]
    state.mqtt.activeConfigId = 'dev-a'
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.dispatch('mqtt.connection.toggleSelect', { configId: 'dev-a' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.connection.toggleSelect', { configId: 'dev-b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttSelectedConfigIds).toEqual(['dev-a', 'dev-b'])

    expect(runtime.handleShortcut('Escape', { textInputFocused: false, activeInputRole: 'mqtt-connections' })).toBe('mqtt.selection.clear')
    expect(runtime.snapshot().mqttSelectedConfigIds).toEqual([])
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'config', id: 'dev-b' })

    runtime.focusMqttConfig('dev-a')
    expect(runtime.dispatch('mqtt.subscription.toggleSelect', { topic: 'plc/a' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.subscription.toggleSelect', { topic: 'plc/b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual(['plc/a', 'plc/b'])
    expect(runtime.snapshot().mqttSubscriptionRows.map((row) => [row.topic, row.selected])).toEqual([
      ['plc/a', true],
      ['plc/b', true]
    ])

    expect(runtime.handleShortcut('Escape', { textInputFocused: false, activeInputRole: 'mqtt-subscriptions' })).toBe('mqtt.selection.clear')
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual([])
    expect(runtime.snapshot().mqttFocusedSubscriptionTopic).toBeNull()
    expect(runtime.snapshot().mqttSelectedRecord).toBeNull()
    expect(runtime.snapshot().mqttSubscriptionRows.map((row) => [row.topic, row.selected])).toEqual([
      ['plc/a', false],
      ['plc/b', false]
    ])

    expect(runtime.dispatch('mqtt.subscription.select', { topic: 'plc/a' }).handled).toBe(true)
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual(['plc/a'])
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual(['plc/a'])
    expect(runtime.handleShortcut('Escape', { textInputFocused: false, activeInputRole: 'mqtt-subscriptions' })).toBe('mqtt.selection.clear')
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual([])
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual([])
    expect(runtime.snapshot().mqttFocusedSubscriptionTopic).toBeNull()
    expect(runtime.snapshot().mqttSelectedRecord).toBeNull()
  })

  it('moves MQTT subscription rail focus and exposes topic row menu actions', async () => {
    const { state, copied } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.configs = [
      createMqttConnectionConfig({ id: 'dev', name: 'PLC', url: 'ws://broker.example:8083/', subscriptions: ['plc/a', 'plc/b'] }, 100)
    ]
    state.mqtt.activeConfigId = 'dev'
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.dispatch('mqtt.subscription.focus', { topic: 'plc/a' }).handled).toBe(true)
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: false, activeInputRole: 'mqtt-subscriptions' })).toBe('list.down')
    expect(runtime.snapshot().mqttFocusedSubscriptionTopic).toBe('plc/b')
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual([])

    expect(runtime.handleShortcut('Enter', { textInputFocused: false, activeInputRole: 'mqtt-subscriptions' })).toBe('mqtt.subscription.applyFilter')
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual(['plc/b'])
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual(['plc/b'])
    expect(runtime.handleShortcut('ArrowUp', { textInputFocused: false, activeInputRole: 'mqtt-subscriptions' })).toBe('list.up')
    expect(runtime.snapshot().mqttFocusedSubscriptionTopic).toBe('plc/a')
    expect(runtime.handleShortcut('Enter', { textInputFocused: false, activeInputRole: 'mqtt-subscriptions' })).toBe('mqtt.subscription.applyFilter')
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual(['plc/a'])
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual(['plc/a'])

    expect(runtime.dispatch('mqtt.drawer.open', { kind: 'subscription', id: 'plc/b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ targetKind: 'subscription', targetId: 'plc/b', active: true })
    expect(runtime.snapshot().mqttDrawerItems.map((item) => item.commandId)).toEqual(expect.arrayContaining([
      'mqtt.detail.open',
      'mqtt.subscription.copyTopic',
      'mqtt.subscription.useAsPublishTopic',
      'mqtt.subscription.editor.open',
      'mqtt.subscription.delete'
    ]))

    expect(runtime.dispatch('mqtt.subscription.copyTopic', { kind: 'subscription', id: 'plc/b' }).handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['plc/b'])

    expect(runtime.dispatch('mqtt.subscription.useAsPublishTopic', { kind: 'subscription', id: 'plc/b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishDraft.topic).toBe('plc/b')
    expect(runtime.snapshot().activeMqttPane).toBe('publish')
    expect(runtime.snapshot().mqttFocusTarget).toBe('publish-topic')
  })

  it('orders MQTT message and publish record lists by latest time first', () => {
    const { state, platform } = installPlatform()
    let archive: unknown = {
      version: 1,
      connectionSnapshots: [],
      sessions: [{
        id: 'session-1',
        connectionId: 'dev',
        title: 'Session',
        startedAt: 100,
        messages: [
          { id: 'old-in', connectionId: 'dev', sessionId: 'session-1', direction: 'incoming', topic: 'plc/status', payload: 'old', qos: 0, retain: false, timestamp: 100 },
          { id: 'new-in', connectionId: 'dev', sessionId: 'session-1', direction: 'incoming', topic: 'plc/status', payload: 'new', qos: 0, retain: false, timestamp: 300 },
          { id: 'mid-out', connectionId: 'dev', sessionId: 'session-1', direction: 'outgoing', topic: 'plc/set', payload: 'mid', qos: 0, retain: false, timestamp: 200 }
        ]
      }],
      publishTemplates: [
        { id: 'old', connectionId: 'dev', title: 'Old', topic: 'plc/old', payload: 'old', qos: 0, retain: false, createdAt: 1, updatedAt: 30 },
        { id: 'used', connectionId: 'dev', title: 'Used', topic: 'plc/used', payload: 'used', qos: 0, retain: false, createdAt: 2, updatedAt: 10, operatedAt: 500 },
        { id: 'edited', connectionId: 'dev', title: 'Edited', topic: 'plc/edited', payload: 'edited', qos: 0, retain: false, createdAt: 3, updatedAt: 400 }
      ],
      publishDraftHistory: []
    }
    platform.storage.getMqttArchive = () => archive as never
    platform.storage.setMqttArchive = (next: unknown) => {
      archive = next
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    state.mqtt.configs = [createMqttConnectionConfig({ id: 'dev', name: 'PLC', url: 'ws://broker.example:8083/', subscriptions: [] }, 100)]
    state.mqtt.activeConfigId = 'dev'
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['new-in', 'old-in'])

    expect(runtime.dispatch('mqtt.receive.filter.all').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['new-in', 'mid-out', 'old-in'])
    expect(runtime.snapshot().mqttPublishHistoryRows.map((item) => item.id)).toEqual(['mid-out'])
    expect(runtime.snapshot().mqttPublishTemplateRows.map((item) => item.id)).toEqual(['used', 'edited', 'old'])

    expect(runtime.dispatch('mqtt.publish.template.apply', { id: 'old' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({ id: 'old', operatedAt: expect.any(Number) })
  })

  it('routes MQTT focus, topic filtering, publish favorites, and publish options by command layer', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'Other',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-other',
      subscriptionItems: [{ topic: 'other/#', alias: '其他' }]
    })
    runtime.dispatch('mqtt.config.save')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      subscriptionItems: [
        { topic: 'plc/+/status', alias: '状态', color: '#111111' },
        { topic: 'plc/+/cmd', alias: '命令', color: '#222222' }
      ],
      publishTopic: 'plc/czz060301/set'
    })
    runtime.dispatch('mqtt.config.save')

    runtime.appendMqttMessageRecord({ id: 'in-status', direction: 'incoming', topic: 'plc/czz060301/status', payload: 'status', qos: 0, retain: false, timestamp: 1000 })
    runtime.appendMqttMessageRecord({ id: 'in-cmd', direction: 'incoming', topic: 'plc/czz060301/cmd', payload: 'cmd', qos: 0, retain: false, timestamp: 1100 })
    runtime.updateMqttPublishDraft({ topic: 'other/template', payload: '{"saved":true}', qos: 0, retain: false })

    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.template.save')
    const templateId = runtime.snapshot().mqttPublishTemplateRows[0].id
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({
      topic: 'other/template',
      payload: '{"saved":true}'
    })

    expect(runtime.handleShortcut('Ctrl+Shift+F', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.topicFilter.focus')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'topic-filter',
      mqttTopicFilterOpen: true,
      mqttTopicFilterQuery: ''
    })
    expect(runtime.snapshot().mqttTopicFilterOptions.map((item) => ({ topic: item.topic, alias: item.alias, highlighted: item.highlighted }))).toEqual([
      { topic: '', alias: '', highlighted: true },
      { topic: 'plc/+/status', alias: '状态', highlighted: false },
      { topic: 'plc/+/cmd', alias: '命令', highlighted: false }
    ])

    expect(runtime.dispatch('mqtt.topicFilter.search.set', { query: '状态' }).handled).toBe(true)
    expect(runtime.snapshot().mqttTopicFilterOptions.map((item) => ({ topic: item.topic, highlighted: item.highlighted }))).toEqual([
      { topic: '', highlighted: false },
      { topic: 'plc/+/status', highlighted: true }
    ])
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'mqtt-topic-filter' })).toBe('mqtt.topicFilter.select')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'records',
      mqttTopicFilterOpen: false,
      mqttActiveSubscriptionTopics: ['plc/+/status']
    })
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['in-status'])
    expect(runtime.dispatch('mqtt.topicFilter.focus').handled).toBe(true)
    expect(runtime.snapshot().mqttTopicFilterOptions.map((item) => ({ topic: item.topic, highlighted: item.highlighted }))).toEqual([
      { topic: '', highlighted: false },
      { topic: 'plc/+/status', highlighted: true },
      { topic: 'plc/+/cmd', highlighted: false }
    ])
    expect(runtime.handleShortcut('ArrowUp', { textInputFocused: true, activeInputRole: 'mqtt-topic-filter' })).toBe('mqtt.topicFilter.prev')
    expect(runtime.snapshot().mqttTopicFilterOptions.map((item) => ({ topic: item.topic, highlighted: item.highlighted }))).toEqual([
      { topic: '', highlighted: true },
      { topic: 'plc/+/status', highlighted: false },
      { topic: 'plc/+/cmd', highlighted: false }
    ])
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'mqtt-topic-filter' })).toBe('mqtt.topicFilter.select')
    expect(runtime.snapshot().mqttActiveSubscriptionTopics).toEqual([])

    expect(runtime.handleShortcut('Ctrl+M', false)).toBe('mqtt.focus.templates')
    expect(runtime.snapshot().mqttPublishTemplateRows.map((item) => item.id)).toEqual([templateId])

    expect(runtime.handleShortcut('Ctrl+P', false)).toBe('mqtt.focus.publish')
    expect(runtime.snapshot().mqttFocusTarget).toBe('publish-topic')
    expect(runtime.snapshot().mqttSelectedRecord).toBeNull()
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.nextField')
    expect(runtime.snapshot().mqttFocusTarget).toBe('publish-payload')
    expect(runtime.handleShortcut('Shift+Tab', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.prevField')
    expect(runtime.snapshot().mqttFocusTarget).toBe('publish-topic')

    expect(runtime.handleShortcut('Ctrl+ArrowLeft', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBeNull()
    expect(runtime.handleShortcut('Ctrl+ArrowRight', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBeNull()
    expect(runtime.dispatch('mqtt.publish.options.open').handled).toBe(true)
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-options',
      mqttPublishOptionsOpen: true,
      mqttPublishOptionsActiveIndex: 0
    })
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: false, activeInputRole: 'mqtt-publish-options' })).toBe('mqtt.publish.options.next')
    expect(runtime.handleShortcut('Enter', { textInputFocused: false, activeInputRole: 'mqtt-publish-options' })).toBe('mqtt.publish.options.select')
    expect(runtime.snapshot().mqttPublishScratch.qos).toBe(1)
    runtime.dispatch('mqtt.publish.options.next')
    runtime.dispatch('mqtt.publish.options.next')
    expect(runtime.handleShortcut('Enter', { textInputFocused: false, activeInputRole: 'mqtt-publish-options' })).toBe('mqtt.publish.options.select')
    expect(runtime.snapshot().mqttPublishScratch.retain).toBe(true)
    expect(runtime.handleShortcut('Escape', { textInputFocused: false, activeInputRole: 'mqtt-publish-options' })).toBe('mqtt.publish.options.close')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-topic',
      mqttPublishOptionsOpen: false
    })

    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.blur')
    expect(runtime.snapshot().mqttFocusTarget).toBe('records')
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: templateId })
  })

  it('persists MQTT info and topic filters and preserves them when publish focus blurs', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      subscriptionItems: [
        { topic: 'plc/+/status', alias: '状态' },
        { topic: 'plc/+/cmd', alias: '命令' }
      ],
      publishTopic: 'plc/czz060301/set'
    })
    runtime.dispatch('mqtt.config.save')
    const configId = runtime.snapshot().state.mqtt.activeConfigId!

    expect(runtime.handleShortcut('Ctrl+3', false)).toBe('mqtt.receive.filter.out')
    expect(runtime.snapshot()).toMatchObject({ mqttReceiveFilter: 'outgoing', activeMqttRecordList: 'messages' })
    expect(runtime.snapshot().state.mqtt.viewPrefs.infoFilter).toBe('outgoing')

    runtime.dispatch('mqtt.topicFilter.focus')
    expect(runtime.dispatch('mqtt.topicFilter.select', { topic: 'plc/+/status' }).handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.viewPrefs.activeSubscriptionTopicsByConfigId[configId]).toEqual(['plc/+/status'])

    expect(runtime.handleShortcut('Ctrl+M', false)).toBe('mqtt.focus.templates')
    expect(runtime.snapshot()).toMatchObject({ activeMqttRecordList: 'templates', mqttFocusTarget: 'records' })
    expect(runtime.snapshot().state.mqtt.viewPrefs.infoFilter).toBe('favorites')

    expect(runtime.handleShortcut('Ctrl+P', false)).toBe('mqtt.focus.publish')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.blur')
    expect(runtime.snapshot()).toMatchObject({
      activeMqttRecordList: 'templates',
      mqttFocusTarget: 'records',
      mqttActiveSubscriptionTopics: ['plc/+/status']
    })
    expect(runtime.snapshot().state.mqtt.viewPrefs.infoFilter).toBe('favorites')

    const restored = createAppRuntime(runtime.snapshot().state)
    restored.setTab('mqtt')
    expect(restored.snapshot()).toMatchObject({
      activeMqttRecordList: 'templates',
      mqttActiveSubscriptionTopics: ['plc/+/status']
    })
  })

  it('archives overwritten MQTT publish drafts and manages the publish history popover', () => {
    const { state, platform } = installPlatform()
    let archive: unknown = { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
    platform.storage.getMqttArchive = () => archive as never
    platform.storage.setMqttArchive = (next: unknown) => {
      archive = next
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      publishTopic: 'plc/default'
    })
    runtime.dispatch('mqtt.config.save')
    runtime.appendMqttMessageRecord({ id: 'in-1', direction: 'incoming', topic: 'plc/in/1', payload: '{"in":1}', qos: 0, retain: false, timestamp: 1000 })

    runtime.updateMqttPublishDraft({ topic: 'plc/default', payload: '', qos: 0, retain: false })
    expect(runtime.dispatch('mqtt.record.resendDraft', { kind: 'message', id: 'in-1' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishDraftHistoryRows).toEqual([])

    runtime.updateMqttPublishDraft({ topic: 'draft/topic', payload: 'draft-payload', qos: 1, retain: true })
    expect(runtime.dispatch('mqtt.record.resendDraft', { kind: 'message', id: 'in-1' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishDraftHistoryRows).toHaveLength(1)
    expect(runtime.snapshot().mqttPublishDraftHistoryRows[0]).toMatchObject({
      topic: 'draft/topic',
      payload: 'draft-payload',
      qos: 1,
      retain: true,
      source: 'overwrite'
    })

    runtime.updateMqttPublishDraft({ topic: 'draft/topic', payload: 'draft-payload', qos: 2, retain: false })
    expect(runtime.handleShortcut('Ctrl+Shift+H', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.saveDraft')
    expect(runtime.handleShortcut('Ctrl+Shift+L', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBeNull()
    expect(runtime.snapshot().mqttPublishDraftHistoryRows).toHaveLength(1)
    expect(runtime.snapshot().mqttPublishDraftHistoryRows[0]).toMatchObject({ source: 'manual', qos: 2, retain: false })

    expect(runtime.handleShortcut('Ctrl+H', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.toggle')
    expect(runtime.handleShortcut('Ctrl+L', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBeNull()
    expect(runtime.snapshot()).toMatchObject({
      mqttPublishDraftHistoryOpen: true,
      mqttFocusTarget: 'publish-draft',
      mqttPublishDraftHistoryActiveIndex: 0
    })
    expect(runtime.handleShortcut('Space', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.toggleSelect')
    expect(runtime.snapshot().mqttPublishDraftHistorySelectedIds).toEqual([runtime.snapshot().mqttPublishDraftHistoryRows[0].id])
    expect(runtime.handleShortcut('Space', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.toggleSelect')
    expect(runtime.snapshot().mqttPublishDraftHistorySelectedIds).toEqual([])
    expect(runtime.handleShortcut('Space', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.toggleSelect')
    expect(runtime.snapshot().mqttPublishDraftHistorySelectedIds).toEqual([runtime.snapshot().mqttPublishDraftHistoryRows[0].id])
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.favorite')
    expect(runtime.snapshot().mqttPublishTemplateRows).toHaveLength(1)
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({ topic: 'draft/topic', payload: 'draft-payload' })

    expect(runtime.handleShortcut('Enter', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.apply')
    expect(runtime.snapshot().mqttPublishScratch).toMatchObject({ topic: 'draft/topic', payload: 'draft-payload', qos: 2, retain: false })
    expect(runtime.snapshot()).toMatchObject({ mqttPublishDraftHistoryOpen: false, mqttFocusTarget: 'publish-payload' })
  })

  it('keeps publish draft history highlight stable for apply and direct send', () => {
    const { state, platform } = installPlatform()
    let archive: unknown = { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
    platform.storage.getMqttArchive = () => archive as never
    platform.storage.setMqttArchive = (next: unknown) => {
      archive = next
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      publishTopic: 'plc/default'
    })
    runtime.dispatch('mqtt.config.save')

    runtime.updateMqttPublishDraft({ topic: 'draft/one', payload: 'one', qos: 0, retain: false })
    expect(runtime.dispatch('mqtt.publish.draft.saveDraft').handled).toBe(true)
    runtime.updateMqttPublishDraft({ topic: 'draft/two', payload: 'two', qos: 1, retain: false })
    expect(runtime.dispatch('mqtt.publish.draft.saveDraft').handled).toBe(true)
    runtime.updateMqttPublishDraft({ topic: 'draft/three', payload: 'three', qos: 2, retain: true })
    expect(runtime.dispatch('mqtt.publish.draft.saveDraft').handled).toBe(true)

    expect(runtime.handleShortcut('Ctrl+H', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.toggle')
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.next')
    const applyTarget = runtime.snapshot().mqttPublishDraftHistoryRows[runtime.snapshot().mqttPublishDraftHistoryActiveIndex]
    expect(applyTarget).toMatchObject({ topic: 'draft/two', payload: 'two' })

    runtime.updateMqttPublishDraft({ topic: 'draft/current-before-apply', payload: 'current', qos: 0, retain: false })
    expect(runtime.handleShortcut('Enter', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.apply')
    expect(runtime.snapshot()).toMatchObject({
      mqttPublishDraftHistoryOpen: false,
      mqttFocusTarget: 'publish-payload',
      mqttPublishScratch: { topic: 'draft/two', payload: 'two', qos: 1, retain: false }
    })

    expect(runtime.handleShortcut('Ctrl+H', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.toggle')
    const rowsAfterApply = runtime.snapshot().mqttPublishDraftHistoryRows
    const draftThree = rowsAfterApply.find((row) => row.topic === 'draft/three')
    expect(draftThree).toBeTruthy()
    expect(runtime.dispatch('mqtt.publish.draft.focus', { id: draftThree?.id }).handled).toBe(true)
    const sendTarget = runtime.snapshot().mqttPublishDraftHistoryRows[runtime.snapshot().mqttPublishDraftHistoryActiveIndex]
    expect(sendTarget).toMatchObject({ topic: 'draft/three', payload: 'three' })

    runtime.updateMqttPublishDraft({ topic: 'draft/current-before-send', payload: 'send-current', qos: 0, retain: false })
    expect(runtime.handleShortcut('Ctrl+Enter', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.send')
    const snapshot = runtime.snapshot()
    expect(snapshot).toMatchObject({
      mqttPublishDraftHistoryOpen: true,
      mqttFocusTarget: 'publish-draft',
      mqttPublishScratch: { topic: 'draft/three', payload: 'three', qos: 2, retain: true }
    })
    expect(snapshot.mqttPublishDraftHistoryRows[snapshot.mqttPublishDraftHistoryActiveIndex]).toMatchObject({
      id: sendTarget.id,
      topic: 'draft/three'
    })
    expect(snapshot.mqttPublishHistoryRows[0]).toMatchObject({ topic: 'draft/three', payload: 'three', qos: 2, retain: true })
    expect(runtime.handleShortcut('Ctrl+Backspace', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.delete')
    expect(runtime.snapshot().mqttPublishDraftHistoryRows.find((row) => row.id === sendTarget.id)).toBeUndefined()
  })

  it('allows only shift preview for publish draft history rows', () => {
    const { state, platform } = installPlatform()
    let archive: unknown = { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
    platform.storage.getMqttArchive = () => archive as never
    platform.storage.setMqttArchive = (next: unknown) => {
      archive = next
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      publishTopic: 'plc/default'
    })
    runtime.dispatch('mqtt.config.save')
    runtime.updateMqttPublishDraft({ topic: 'draft/preview', payload: '{"ok":true}', qos: 1, retain: false })
    expect(runtime.dispatch('mqtt.publish.draft.saveDraft').handled).toBe(true)
    const row = runtime.snapshot().mqttPublishDraftHistoryRows[0]

    expect(runtime.dispatch('mqtt.preview.open', { kind: 'publish-draft-history', id: row.id, source: 'keyboard' }).handled).toBe(false)
    expect(runtime.dispatch('mqtt.preview.open', { kind: 'publish-draft-history', id: row.id, source: 'shift' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPreview).toMatchObject({
      open: true,
      targetKind: 'publish-draft-history',
      targetId: row.id,
      source: 'shift'
    })
  })

  it('isolates MQTT publish editor focus from message-list selection shortcuts', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      publishTopic: 'plc/default'
    })
    runtime.dispatch('mqtt.config.save')
    runtime.appendMqttMessageRecord({ id: 'in-1', direction: 'incoming', topic: 'plc/in/1', payload: '{"in":1}', qos: 0, retain: false, timestamp: 1000 })

    expect(runtime.dispatch('mqtt.record.focus', { kind: 'message', id: 'in-1' }).handled).toBe(true)
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'in-1' })
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.messages.selectedIds).toEqual(['in-1'])

    expect(runtime.handleShortcut('Ctrl+P', false)).toBe('mqtt.focus.publish')
    expect(runtime.snapshot()).toMatchObject({
      activeMqttPane: 'publish',
      mqttFocusTarget: 'publish-topic',
      mqttSelectedRecord: null
    })
    expect(runtime.handleShortcut('Space', { textInputFocused: false, activeInputRole: 'mqtt-publish-editor' })).toBeNull()
    expect(runtime.snapshot().mqttRecordListStates.messages.selectedIds).toEqual(['in-1'])
  })

  it('edits MQTT publish draft history through an editor layer and keeps row click separate from apply', () => {
    const { state, platform } = installPlatform()
    let archive: unknown = { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
    platform.storage.getMqttArchive = () => archive as never
    platform.storage.setMqttArchive = (next: unknown) => {
      archive = next
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-plc',
      publishTopic: 'plc/default'
    })
    runtime.dispatch('mqtt.config.save')
    runtime.updateMqttPublishDraft({ topic: 'draft/topic', payload: 'draft-payload', qos: 1, retain: true })
    expect(runtime.handleShortcut('Ctrl+Shift+H', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.saveDraft')
    const row = runtime.snapshot().mqttPublishDraftHistoryRows[0]
    expect(runtime.handleShortcut('Ctrl+H', { textInputFocused: true, activeInputRole: 'mqtt-publish-editor' })).toBe('mqtt.publish.draft.toggle')

    expect(runtime.handleShortcut('Ctrl+ArrowLeft', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.detail.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({
      open: true,
      active: false,
      targetKind: 'publish-draft-history',
      targetId: row.id
    })
    expect(runtime.dispatch('mqtt.drawer.close').handled).toBe(true)
    expect(runtime.handleShortcut('Ctrl+ArrowRight', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.drawer.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({
      open: true,
      active: true,
      targetKind: 'publish-draft-history',
      targetId: row.id
    })
    expect(runtime.dispatch('mqtt.drawer.close').handled).toBe(true)

    expect(runtime.handleShortcut('F2', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.rename')
    expect(runtime.snapshot()).toMatchObject({
      mqttPublishDraftHistoryOpen: true,
      mqttFocusTarget: 'publish-draft-edit-title',
      mqttPublishDraftHistoryEditDraft: {
        mode: 'rename',
        id: row.id,
        title: 'draft/topic',
        note: '',
        topic: 'draft/topic',
        payload: 'draft-payload',
        activeField: 'title'
      }
    })
    expect(typeof (runtime as unknown as { updateMqttPublishDraftHistoryEditDraft?: unknown }).updateMqttPublishDraftHistoryEditDraft).toBe('function')

    const updateDraft = (runtime as unknown as { updateMqttPublishDraftHistoryEditDraft: (input: Record<string, unknown>) => void }).updateMqttPublishDraftHistoryEditDraft
    const renameFocusRequestId = runtime.snapshot().mqttFocusRequestId
    updateDraft({ title: '命令草稿', note: '常用下发' })
    expect(runtime.snapshot().mqttFocusRequestId).toBe(renameFocusRequestId)
    updateDraft({ activeField: 'note' })
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusRequestId: renameFocusRequestId,
      mqttPublishDraftHistoryEditDraft: { activeField: 'note' }
    })
    updateDraft({ activeField: 'title' })
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusRequestId: renameFocusRequestId,
      mqttPublishDraftHistoryEditDraft: { activeField: 'title' }
    })
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.nextField')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-draft-edit-note',
      mqttPublishDraftHistoryEditDraft: { activeField: 'note' }
    })
    expect(runtime.handleShortcut('Shift+Tab', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.prevField')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-draft-edit-title',
      mqttPublishDraftHistoryEditDraft: { activeField: 'title' }
    })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.save')
    expect(runtime.snapshot().mqttPublishDraftHistoryEditDraft).toBeNull()
    expect(runtime.snapshot().mqttPublishDraftHistoryRows[0]).toMatchObject({
      id: row.id,
      title: '命令草稿',
      note: '常用下发',
      topic: 'draft/topic',
      payload: 'draft-payload',
      qos: 1,
      retain: true
    })

    expect(runtime.handleShortcut('Shift+F2', { textInputFocused: false, activeInputRole: 'mqtt-publish-draft' })).toBe('mqtt.publish.draft.edit')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-draft-edit-topic',
      mqttPublishDraftHistoryEditDraft: {
        mode: 'edit',
        id: row.id,
        title: '命令草稿',
        note: '常用下发',
        topic: 'draft/topic',
        payload: 'draft-payload',
        activeField: 'topic'
      }
    })

    const editFocusRequestId = runtime.snapshot().mqttFocusRequestId
    updateDraft({ topic: 'edited/topic', payload: 'edited-payload' })
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusRequestId: editFocusRequestId,
      mqttPublishDraftHistoryEditDraft: {
        topic: 'edited/topic',
        payload: 'edited-payload',
        activeField: 'topic'
      }
    })
    updateDraft({ activeField: 'payload' })
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusRequestId: editFocusRequestId,
      mqttPublishDraftHistoryEditDraft: { activeField: 'payload' }
    })
    updateDraft({ activeField: 'topic' })
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusRequestId: editFocusRequestId,
      mqttPublishDraftHistoryEditDraft: { activeField: 'topic' }
    })
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.nextField')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-draft-edit-payload',
      mqttPublishDraftHistoryEditDraft: { activeField: 'payload' }
    })
    expect(runtime.handleShortcut('Shift+Tab', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.prevField')
    expect(runtime.snapshot()).toMatchObject({
      mqttFocusTarget: 'publish-draft-edit-topic',
      mqttPublishDraftHistoryEditDraft: { activeField: 'topic' }
    })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.save')
    expect(runtime.snapshot().mqttPublishDraftHistoryEditDraft).toBeNull()
    expect(runtime.snapshot().mqttPublishDraftHistoryRows[0]).toMatchObject({
      id: row.id,
      title: '命令草稿',
      note: '常用下发',
      topic: 'edited/topic',
      payload: 'edited-payload',
      qos: 1,
      retain: true
    })

    expect(runtime.dispatch('mqtt.publish.draft.edit', { id: row.id }).handled).toBe(true)
    updateDraft({ payload: 'cancelled-payload' })
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'mqtt-publish-draft-editor' })).toBe('mqtt.publish.draft.edit.cancel')
    expect(runtime.snapshot().mqttPublishDraftHistoryEditDraft).toBeNull()
    expect(runtime.snapshot().mqttPublishDraftHistoryRows[0]).toMatchObject({
      topic: 'edited/topic',
      payload: 'edited-payload'
    })
  })

  it('deletes selected MQTT subscriptions from the persisted connection config', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      subscriptionItems: [
        { topic: 'plc/a', alias: 'A' },
        { topic: 'plc/b', alias: 'B' },
        { topic: 'plc/c', alias: 'C' }
      ]
    })
    runtime.dispatch('mqtt.config.save')

    expect(runtime.dispatch('mqtt.subscription.toggleSelect', { topic: 'plc/a' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.subscription.toggleSelect', { topic: 'plc/b' }).handled).toBe(true)
    expect(runtime.snapshot().mqttSelectedSubscriptionTopics).toEqual(['plc/a', 'plc/b'])
    expect(runtime.dispatch('mqtt.subscription.deleteSelected').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      subscriptions: ['plc/c'],
      subscriptionAliases: { 'plc/c': 'C' }
    })

    expect(runtime.dispatch('mqtt.subscription.clearAll').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      subscriptions: [],
      subscriptionAliases: {}
    })
  })

  it('edits MQTT subscriptions in a dedicated draft without opening the full config editor', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      subscriptionItems: [
        { topic: 'plc/a', alias: 'A' }
      ]
    })
    runtime.dispatch('mqtt.config.save')

    expect(runtime.dispatch('mqtt.subscription.add').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toBeNull()
    expect(runtime.snapshot().mqttSubscriptionDraft).toMatchObject({
      connectionId: runtime.snapshot().state.mqtt.activeConfigId,
      activeField: 'topic'
    })
    expect(runtime.snapshot().mqttSubscriptionDraft?.items).toHaveLength(2)
    expect(runtime.snapshot().mqttSubscriptionDraft?.items[0]).toMatchObject({ topic: 'plc/a', alias: 'A' })
    expect(runtime.snapshot().mqttSubscriptionDraft?.items[0].id).toBeTruthy()
    expect(runtime.snapshot().mqttSubscriptionDraft?.items[1]).toMatchObject({ topic: '', alias: '' })
    const appendedSubscriptionItem = runtime.snapshot().mqttSubscriptionDraft?.items.at(-1)
    expect(runtime.snapshot().mqttSubscriptionDraft?.activeItemId).toBe(appendedSubscriptionItem?.id)

    expect(runtime.dispatch('mqtt.subscription.editor.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttSubscriptionDraft).toMatchObject({
      activeItemId: appendedSubscriptionItem?.id,
      activeField: 'color'
    })
    expect(runtime.dispatch('mqtt.subscription.editor.prevField').handled).toBe(true)
    expect(runtime.snapshot().mqttSubscriptionDraft).toMatchObject({
      activeItemId: appendedSubscriptionItem?.id,
      activeField: 'topic'
    })

    runtime.updateMqttSubscriptionDraft({
      activeItemId: 'row-b',
      activeField: 'topic',
      items: [
        { id: 'row-a', topic: 'plc/a', alias: 'Alpha' },
        { id: 'row-b', topic: 'plc/b', alias: 'Beta' }
      ]
    })
    expect(runtime.dispatch('mqtt.subscription.editor.prevRow').handled).toBe(true)
    expect(runtime.snapshot().mqttSubscriptionDraft).toMatchObject({
      activeItemId: 'row-a',
      activeField: 'topic'
    })
    expect(runtime.dispatch('mqtt.subscription.editor.nextRow').handled).toBe(true)
    expect(runtime.snapshot().mqttSubscriptionDraft).toMatchObject({
      activeItemId: 'row-b',
      activeField: 'topic'
    })
    expect(runtime.dispatch('mqtt.subscription.editor.deleteRow').handled).toBe(true)
    expect(runtime.snapshot().mqttSubscriptionDraft).toMatchObject({
      activeItemId: 'row-a',
      activeField: 'topic'
    })
    expect(runtime.snapshot().mqttSubscriptionDraft?.items.map((item) => item.id)).toEqual(['row-a'])

    runtime.updateMqttSubscriptionDraft({
      items: [
        { id: 'row-a', topic: ' plc/a ', alias: 'Alpha' },
        { id: 'row-b', topic: 'plc/b', alias: 'Beta' },
        { id: 'row-added-empty', topic: '', alias: '' },
        { id: 'row-empty', topic: ' ', alias: 'drop-me' },
        { id: 'row-duplicate', topic: 'plc/b', alias: 'Duplicate ignored' }
      ]
    })
    expect(runtime.dispatch('mqtt.subscription.editor.save').handled).toBe(true)
    expect(runtime.snapshot().mqttSubscriptionDraft).toBeNull()
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      subscriptions: ['plc/a', 'plc/b'],
      subscriptionAliases: { 'plc/a': 'Alpha', 'plc/b': 'Beta' }
    })
  })

  it('edits MQTT config subscriptions inside the config draft instead of opening the subscription modal', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      subscriptionItems: [{ topic: 'plc/a', alias: 'A' }]
    })
    runtime.dispatch('mqtt.config.save')

    expect(runtime.dispatch('mqtt.config.edit').handled).toBe(true)
    expect(runtime.dispatch('mqtt.subscription.editor.open').handled).toBe(false)
    expect(runtime.snapshot().mqttSubscriptionDraft).toBeNull()

    runtime.updateMqttConfigDraft({
      subscriptionItems: [
        { topic: 'plc/b', alias: 'Beta' },
        { topic: ' plc/c ', alias: '' },
        { topic: ' ', alias: 'ignored' }
      ]
    })
    expect(runtime.dispatch('mqtt.config.subscription.focus', { index: 1, field: 'topic' }).handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'subscriptions',
      activeSubscriptionIndex: 1,
      activeSubscriptionField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.subscription.prevRow').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeSubscriptionIndex: 0,
      activeSubscriptionField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.subscription.nextRow').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeSubscriptionIndex: 1,
      activeSubscriptionField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.subscription.deleteRow').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'subscriptions',
      activeSubscriptionIndex: 1,
      activeSubscriptionField: 'topic'
    })
    expect(runtime.snapshot().mqttConfigDraft?.subscriptionItems).toEqual([
      { topic: 'plc/b', alias: 'Beta' },
      { topic: ' ', alias: 'ignored' }
    ])
    expect(runtime.dispatch('mqtt.config.save').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      subscriptions: ['plc/b'],
      subscriptionAliases: { 'plc/b': 'Beta' }
    })
  })

  it('cycles MQTT config draft Tab focus through row fields and connection options', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      subscriptionItems: [
        { topic: 'plc/a', alias: 'A', color: '#111111' },
        { topic: 'plc/b', alias: 'B', color: '#222222' }
      ],
      publishTopics: ['plc/set', 'plc/debug']
    })

    expect(runtime.dispatch('mqtt.config.subscription.focus', { index: 0, field: 'alias' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'subscriptions',
      activeSubscriptionIndex: 0,
      activeSubscriptionField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'subscriptions',
      activeSubscriptionIndex: 0,
      activeSubscriptionField: 'color'
    })
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'subscriptions',
      activeSubscriptionIndex: 1,
      activeSubscriptionField: 'alias'
    })
    expect(runtime.dispatch('mqtt.config.prevField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'subscriptions',
      activeSubscriptionIndex: 0,
      activeSubscriptionField: 'color'
    })

    expect(runtime.dispatch('mqtt.config.publish.focus', { index: 0 }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'publishTopic',
      activePublishIndex: 1,
      activePublishField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ activeField: 'qos' })
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ activeField: 'reconnectPeriodMs' })
    expect(runtime.dispatch('mqtt.config.nextField').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ activeField: 'connectTimeoutMs' })
  })

  it('saves MQTT config publish topic candidates and refreshes client id in the draft only', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.dispatch('mqtt.config.create').handled).toBe(true)
    const beforeRefresh = runtime.snapshot().mqttConfigDraft?.clientId || ''
    expect(runtime.dispatch('mqtt.config.clientId.refresh').handled).toBe(true)
    const refreshedClientId = runtime.snapshot().mqttConfigDraft?.clientId || ''
    expect(refreshedClientId).toMatch(/^eypc_/)
    expect(refreshedClientId).not.toBe(beforeRefresh)
    expect(runtime.snapshot().state.mqtt.configs).toEqual([])

    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      publishTopics: [' plc/cmd ', 'plc/status', 'plc/cmd', ' ']
    })
    expect(runtime.dispatch('mqtt.config.publish.focus', { index: 1 }).handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'publishTopic',
      activePublishIndex: 1,
      activePublishField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.publish.prevRow').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activePublishIndex: 0,
      activePublishField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.publish.nextRow').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activePublishIndex: 1,
      activePublishField: 'topic'
    })
    expect(runtime.dispatch('mqtt.config.publish.deleteRow').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({
      activeField: 'publishTopic',
      publishTopic: 'plc/cmd',
      activePublishIndex: 1,
      activePublishField: 'topic'
    })
    expect(runtime.snapshot().mqttConfigDraft?.publishTopics).toEqual([' plc/cmd ', 'plc/cmd', ' '])
    expect(runtime.dispatch('mqtt.config.save').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      clientId: refreshedClientId,
      publishTopic: 'plc/cmd',
      publishTopics: ['plc/cmd']
    })
  })

  it('cancels MQTT subscription edits without mutating the connection config', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      subscriptionItems: [{ topic: 'plc/a', alias: 'A' }]
    })
    runtime.dispatch('mqtt.config.save')

    expect(runtime.dispatch('mqtt.subscription.editor.open').handled).toBe(true)
    runtime.updateMqttSubscriptionDraft({
      items: [{ id: 'row-a', topic: 'plc/changed', alias: 'Changed' }]
    })
    expect(runtime.dispatch('mqtt.subscription.editor.cancel').handled).toBe(true)

    expect(runtime.snapshot().mqttSubscriptionDraft).toBeNull()
    expect(runtime.snapshot().state.mqtt.configs[0]).toMatchObject({
      subscriptions: ['plc/a'],
      subscriptionAliases: { 'plc/a': 'A' }
    })
  })

  it('manages MQTT workbench layout, log drawer, and publish templates', () => {
    const { state, platform } = installPlatform()
    const archiveWrites: unknown[] = []
    platform.storage.setMqttArchive = (archive: unknown) => {
      archiveWrites.push(archive)
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')

    expect(runtime.snapshot()).toMatchObject({
      mqttPanelOpen: true,
      mqttSubscriptionPanelOpen: true,
      mqttWorkspaceLayout: 'stack',
      mqttLayoutPrefs: {
        workspaceLayout: 'stack',
        stackReceiveRatio: 0.58,
        splitReceiveRatio: 0.55
      },
      toolPreviewPrefs: {
        hoverPreviewEnabled: false,
        hoverPreviewDelayMs: 500
      },
      mqttLogDrawer: { open: false },
      mqttPublishRecordsOpen: false
    })

    expect(runtime.handleShortcut('Ctrl+Shift+T', false)).toBe('mqtt.subscription.panel.toggle')
    expect(runtime.snapshot().mqttSubscriptionPanelOpen).toBe(false)
    expect(runtime.handleShortcut('Ctrl+Shift+S', false)).toBe('mqtt.layout.toggle')
    expect(runtime.snapshot().mqttWorkspaceLayout).toBe('split')
    expect(runtime.snapshot().state.mqtt.layoutPrefs.workspaceLayout).toBe('split')
    expect(runtime.dispatch('mqtt.layout.resize', { layout: 'split', receiveRatio: 0.7 }).handled).toBe(true)
    expect(runtime.snapshot().mqttLayoutPrefs.splitReceiveRatio).toBe(0.7)
    expect(runtime.dispatch('mqtt.layout.resize', { layout: 'stack', receiveRatio: 0.1 }).handled).toBe(true)
    expect(runtime.snapshot().mqttLayoutPrefs.stackReceiveRatio).toBe(0.28)
    expect(normalizeAppState(runtime.snapshot().state).mqtt.layoutPrefs).toMatchObject({
      workspaceLayout: 'split',
      stackReceiveRatio: 0.28,
      splitReceiveRatio: 0.7
    })
    expect(normalizeAppState(runtime.snapshot().state).settings.toolPreviewPrefs).toMatchObject({
      hoverPreviewEnabled: false,
      hoverPreviewDelayMs: 500
    })
    expect(runtime.dispatch('tool.preview.hover.update', { enabled: true, delayMs: 750 }).handled).toBe(true)
    expect(runtime.snapshot().toolPreviewPrefs).toMatchObject({
      hoverPreviewEnabled: true,
      hoverPreviewDelayMs: 750
    })
    expect(normalizeAppState(runtime.snapshot().state).settings.toolPreviewPrefs).toMatchObject({
      hoverPreviewEnabled: true,
      hoverPreviewDelayMs: 750
    })
    expect(runtime.dispatch('mqtt.log.drawer.open').handled).toBe(true)
    expect(runtime.snapshot().mqttLogDrawer).toEqual({ open: true })
    expect(runtime.handleShortcut('Escape', false)).toBe('mqtt.log.drawer.close')
    expect(runtime.snapshot().mqttLogDrawer).toEqual({ open: false })

    runtime.updateMqttPublishDraft({ topic: 'plc/czz060301/set', payload: '{"code":"200"}', qos: 1, retain: true })
    expect(runtime.snapshot().mqttPublishScratch).toMatchObject({ topic: 'plc/czz060301/set', payload: '{"code":"200"}' })
    expect(runtime.dispatch('mqtt.publish.template.save', { title: 'Set Code', note: 'manual' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishTemplateRows).toHaveLength(1)
    const templateId = runtime.snapshot().mqttPublishTemplateRows[0].id
    expect(archiveWrites.at(-1)).toMatchObject({
      publishTemplates: [expect.objectContaining({ id: templateId, title: 'Set Code', note: 'manual' })]
    })

    expect(runtime.dispatch('mqtt.focus.templates').handled).toBe(true)
    expect(runtime.snapshot().mqttPublishRecordsOpen).toBe(true)
    runtime.updateMqttPublishDraft({ topic: '', payload: '', qos: 0, retain: false })
    expect(runtime.dispatch('mqtt.publish.template.apply', { id: templateId }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishDraft).toMatchObject({ topic: 'plc/czz060301/set', payload: '{"code":"200"}', qos: 1, retain: true })

    expect(runtime.dispatch('mqtt.publish.template.rename', { id: templateId, title: 'Set Code Renamed' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({ title: 'Set Code Renamed' })
    expect(runtime.dispatch('mqtt.publish.template.send', { id: templateId }).handled).toBe(true)
    expect(runtime.snapshot().mqttArchive.sessions[0].messages.at(-1)).toMatchObject({
      direction: 'outgoing',
      topic: 'plc/czz060301/set',
      payload: '{"code":"200"}'
    })

    expect(runtime.dispatch('mqtt.publish.template.delete', { id: templateId }).handled).toBe(true)
    expect(runtime.snapshot().mqttPublishTemplateRows).toEqual([])
  })

  it('owns MQTT pane navigation, drawer actions, copy, favorite aliases, stats, and preview through commands', async () => {
    const { state, platform, copied } = installPlatform()
    const archiveWrites: unknown[] = []
    platform.storage.setMqttArchive = (archive: unknown) => {
      archiveWrites.push(archive)
      return true
    }
    ;(platform as unknown as { clipboard: { copyText: (text: string) => Promise<boolean> } }).clipboard = {
      copyText: async (text: string) => {
        copied.push(text)
        return true
      }
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      subscriptionItems: [{ topic: 'plc/#', alias: 'PLC 全部' }],
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')

    runtime.appendMqttMessageRecord({ id: 'in-1', direction: 'incoming', topic: 'plc/a', payload: '{"ok":true}', qos: 0, retain: false, timestamp: 1000 })
    runtime.appendMqttMessageRecord({ id: 'out-1', direction: 'outgoing', topic: 'plc/b', payload: 'set=1', qos: 1, retain: true, timestamp: 1100 })
    runtime.appendMqttMessageRecord({ id: 'in-2', direction: 'incoming', topic: 'other/a', payload: 'ignored', qos: 0, retain: false, timestamp: 1200 })

    expect(runtime.snapshot().mqttMessageStats).toEqual({ all: 3, incoming: 2, outgoing: 1 })
    expect(runtime.dispatch('mqtt.subscription.select', { topic: 'plc/#' }).handled).toBe(true)
    expect(runtime.snapshot().mqttMessageStats).toEqual({ all: 2, incoming: 1, outgoing: 1 })
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['in-1'])

    expect(runtime.snapshot().activeMqttPane).toBe('subscriptions')
    runtime.focusMqttMessage('in-1')
    expect(runtime.snapshot().activeMqttPane).toBe('messages')
    expect(runtime.dispatch('mqtt.pane.next').handled).toBe(true)
    expect(runtime.snapshot().activeMqttPane).toBe('publish')
    expect(runtime.dispatch('mqtt.pane.prev').handled).toBe(true)
    expect(runtime.snapshot().activeMqttPane).toBe('messages')

    expect(runtime.dispatch('mqtt.drawer.open').handled).toBe(true)
    expect(runtime.snapshot().mqttDrawer).toMatchObject({
      open: true,
      active: true,
      activeIndex: 0,
      targetKind: 'message',
      targetId: 'in-1'
    })
    expect(runtime.snapshot().mqttDrawerItems.map((item) => item.commandId)).toEqual(expect.arrayContaining([
      'mqtt.detail.open',
      'mqtt.record.rename',
      'mqtt.record.edit',
      'mqtt.record.favorite',
      'mqtt.record.copyTopic',
      'mqtt.record.copyPayload',
      'mqtt.record.copyAll',
      'mqtt.record.resendDraft',
      'mqtt.record.repeatSend',
      'mqtt.record.delete',
      'mqtt.messages.clearAll'
    ]))
    expect(runtime.snapshot().mqttDrawerItems[0]?.shortcutLabel.startsWith('c-1')).toBe(true)
    expect(runtime.snapshot().mqttDrawerItems[1]?.shortcutLabel.startsWith('c-2')).toBe(true)
    expect(runtime.snapshot().mqttDrawerItems.every((item) => !item.shortcutLabel.includes('未绑定'))).toBe(true)
    expect(runtime.dispatch('mqtt.drawer.next').handled).toBe(true)
    expect(runtime.snapshot().mqttDrawer.activeIndex).toBe(1)

    expect(runtime.dispatch('mqtt.record.copyTopic').handled).toBe(true)
    expect(runtime.dispatch('mqtt.record.copyPayload').handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['plc/a', '{"ok":true}'])

    expect(runtime.handleShortcut('Ctrl+S', false)).toBe('mqtt.record.favorite')
    expect(runtime.snapshot().mqttFavoriteDraft).toBeNull()
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({
      title: '',
      topic: 'plc/a',
      payload: '{"ok":true}'
    })

    expect(runtime.dispatch('mqtt.record.favorite', { kind: 'message', id: 'out-1' }).handled).toBe(true)
    expect(runtime.snapshot().mqttFavoriteDraft).toBeNull()
    expect(runtime.snapshot().mqttPublishTemplateRows).toHaveLength(2)

    const firstTemplateId = runtime.snapshot().mqttPublishTemplateRows[0].id
    runtime.dispatch('mqtt.focus.templates')
    runtime.dispatch('mqtt.record.focus', { kind: 'publish-template', id: firstTemplateId, list: 'templates' })
    expect(runtime.handleShortcut('Ctrl+S', false)).toBe('mqtt.record.favorite')
    expect(runtime.snapshot().mqttPublishTemplateRows.some((item) => item.id === firstTemplateId)).toBe(false)

    expect(runtime.snapshot().mqttDrawer.open).toBe(false)
    runtime.focusMqttMessage('in-1')
    const archiveWritesBeforePreview = archiveWrites.length
    expect(runtime.handleShortcut('Ctrl+I', false)).toBe('mqtt.preview.open')
    expect(runtime.snapshot().mqttPreview).toMatchObject({ open: true, targetKind: 'message', targetId: 'in-1', source: 'keyboard' })
    expect(runtime.handleShortcut('Shift+ArrowDown', false)).toBe('mqtt.preview.scroll.down')
    expect(runtime.snapshot().mqttPreview.scrollTop).toBe(240)
    expect(runtime.dispatch('mqtt.preview.scroll.set', { scrollTop: 480 }).handled).toBe(true)
    expect(runtime.snapshot().mqttPreview.scrollTop).toBe(480)
    expect(runtime.dispatch('mqtt.preview.scroll.set', { scrollTop: -120 }).handled).toBe(true)
    expect(runtime.snapshot().mqttPreview.scrollTop).toBe(0)
    expect(runtime.handleShortcut('Shift+ArrowUp', false)).toBe('mqtt.preview.scroll.up')
    expect(runtime.snapshot().mqttPreview.scrollTop).toBe(0)
    expect(archiveWrites).toHaveLength(archiveWritesBeforePreview)
    expect(runtime.handleShortcut('Escape', false)).toBe('mqtt.preview.close')
    expect(runtime.snapshot().mqttPreview.open).toBe(false)

    expect(runtime.dispatch('mqtt.preview.open', { kind: 'message', id: 'in-1', source: 'keyboard' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.drawer.open', { kind: 'message', id: 'in-1' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.config.edit').handled).toBe(true)
    expect(runtime.snapshot().mqttConfigDraft).not.toBeNull()
    expect(runtime.snapshot().mqttPreview.open).toBe(false)
    expect(runtime.snapshot().mqttDrawer.open).toBe(false)
    expect(runtime.dispatch('mqtt.preview.open', { kind: 'message', id: 'in-1', source: 'keyboard' }).handled).toBe(false)
    expect(runtime.dispatch('mqtt.preview.open', { kind: 'message', id: 'in-1', source: 'shift' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPreview).toMatchObject({ open: true, targetKind: 'message', targetId: 'in-1', source: 'shift' })
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'mqtt-editor' })).toBe('mqtt.preview.close')
    expect(runtime.snapshot().mqttPreview.open).toBe(false)
    expect(runtime.snapshot().mqttConfigDraft).not.toBeNull()
  })

  it('scopes MQTT F2 editing to the highlighted record or connection pane', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    const configId = runtime.snapshot().state.mqtt.activeConfigId
    expect(configId).toBeTruthy()

    runtime.appendMqttMessageRecord({ id: 'msg-1', direction: 'incoming', topic: 'plc/original', payload: '{"ok":true}', qos: 0, retain: false, timestamp: 1000 })
    runtime.focusMqttMessage('msg-1')

    expect(runtime.handleShortcut('F2', false)).toBe('mqtt.record.rename')
    expect(runtime.snapshot().mqttRecordEditDraft).toMatchObject({
      mode: 'rename',
      targetKind: 'message',
      targetId: 'msg-1',
      title: ''
    })
    runtime.updateMqttRecordEditDraft({ title: '状态回包' })
    expect(runtime.dispatch('mqtt.record.edit.save').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows[0]).toMatchObject({ id: 'msg-1', topic: 'plc/original', payload: '{"ok":true}' })
    expect(runtime.snapshot().mqttMessageRows[0].title).toBeUndefined()
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({
      title: '状态回包',
      topic: 'plc/original',
      payload: '{"ok":true}'
    })

    runtime.focusMqttMessage('msg-1')
    expect(runtime.handleShortcut('Shift+F2', false)).toBe('mqtt.record.edit')
    runtime.updateMqttRecordEditDraft({
      title: '',
      note: 'manual',
      topic: 'plc/edited',
      payload: '{"ok":false}',
      qos: 1,
      retain: true
    })
    expect(runtime.dispatch('mqtt.record.edit.save').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows[0]).toMatchObject({ id: 'msg-1', topic: 'plc/original', payload: '{"ok":true}', qos: 0, retain: false })
    expect(runtime.snapshot().mqttPublishTemplateRows[0]).toMatchObject({
      note: 'manual',
      topic: 'plc/edited',
      payload: '{"ok":false}',
      qos: 1,
      retain: true
    })
    expect(runtime.snapshot().mqttPublishTemplateRows[0].title).toMatch(/^\d{10}$/)

    runtime.focusMqttConfig(configId as string)
    expect(runtime.handleShortcut('F2', false)).toBe('mqtt.config.edit')
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'edit', targetId: configId })
    runtime.dispatch('mqtt.config.cancel')
    expect(runtime.handleShortcut('Shift+F2', false)).toBe('mqtt.config.rename')
    expect(runtime.snapshot().mqttConfigDraft).toMatchObject({ mode: 'rename', targetId: configId })
  })

  it('moves MQTT item focus across messages, templates, and history with effective detail and preview targets', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    runtime.appendMqttMessageRecord({ id: 'in-1', direction: 'incoming', topic: 'plc/a', payload: '{"a":1}', qos: 0, retain: false, timestamp: 1000 })
    runtime.appendMqttMessageRecord({ id: 'in-2', direction: 'incoming', topic: 'plc/b', payload: '{"b":2}', qos: 0, retain: false, timestamp: 1100 })
    runtime.appendMqttMessageRecord({ id: 'out-1', direction: 'outgoing', topic: 'plc/out', payload: '{"out":1}', qos: 1, retain: true, timestamp: 1200 })
    runtime.updateMqttPublishDraft({ topic: 'plc/template', payload: '{"tpl":1}', qos: 1, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'Set Template' })
    const templateId = runtime.snapshot().mqttPublishTemplateRows[0].id

    expect(runtime.handleShortcut('Ctrl+2', false)).toBe('mqtt.receive.filter.in')
    expect(runtime.snapshot().activeMqttRecordList).toBe('messages')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'in-2' })
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'in-1' })

    expect(runtime.handleShortcut('Ctrl+M', false)).toBe('mqtt.focus.templates')
    expect(runtime.snapshot().activeMqttRecordList).toBe('templates')
    expect(runtime.dispatch('mqtt.template.search.set', { query: 'set' }).handled).toBe(true)
    expect(runtime.snapshot().mqttTemplateSearch).toBe('set')
    expect(runtime.snapshot().mqttPublishTemplateRows.map((item) => item.id)).toEqual([templateId])
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: templateId })

    expect(runtime.dispatch('mqtt.history.search.set', { query: '' }).handled).toBe(true)
    expect(runtime.snapshot()).toMatchObject({ activeMqttPane: 'messages', activeMqttRecordList: 'history', mqttPublishRecordsOpen: true })
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'out-1' })

    expect(runtime.handleShortcut('Ctrl+ArrowLeft', false)).toBe('mqtt.detail.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: true, active: false, targetKind: 'message', targetId: 'out-1' })
    expect(runtime.dispatch('mqtt.preview.open', { source: 'shift' }).handled).toBe(true)
    expect(runtime.snapshot().mqttPreview).toMatchObject({ open: true, source: 'shift', targetKind: 'message', targetId: 'out-1' })
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('mqtt.drawer.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: true, active: true, targetKind: 'message', targetId: 'out-1' })

    expect(runtime.handleShortcut('Ctrl+P', false)).toBe('mqtt.focus.publish')
    expect(runtime.snapshot().activeMqttPane).toBe('publish')
  })

  it('focuses the visible MQTT record search for the active list mode', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.handleShortcut('Ctrl+F', false)).toBe('mqtt.search.focus')
    expect(runtime.snapshot().searchFocusTarget).toBe('mqtt')

    runtime.dispatch('mqtt.focus.templates')
    expect(runtime.handleShortcut('Ctrl+F', false)).toBe('mqtt.search.focus')
    expect(runtime.snapshot().searchFocusTarget).toBe('mqtt-templates')

    runtime.dispatch('mqtt.history.search.set', { query: '' })
    expect(runtime.handleShortcut('Ctrl+F', false)).toBe('mqtt.search.focus')
    expect(runtime.snapshot().searchFocusTarget).toBe('mqtt-history')
  })

  it('filters MQTT messages through top search and force deletes from search mode', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    runtime.appendMqttMessageRecord({ id: 'in-alpha', direction: 'incoming', topic: 'plc/in/alpha', payload: 'alpha', qos: 0, retain: false, timestamp: 1000 })
    runtime.appendMqttMessageRecord({ id: 'in-beta', direction: 'incoming', topic: 'plc/in/beta', payload: 'beta incoming', qos: 0, retain: false, timestamp: 1100 })
    runtime.appendMqttMessageRecord({ id: 'out-beta', direction: 'outgoing', topic: 'plc/out/beta', payload: 'beta outgoing', qos: 0, retain: false, timestamp: 1200 })
    runtime.appendMqttMessageRecord({ id: 'del-1', direction: 'incoming', topic: 'plc/delete/one', payload: 'delete one', qos: 0, retain: false, timestamp: 1300 })
    runtime.appendMqttMessageRecord({ id: 'del-2', direction: 'incoming', topic: 'plc/delete/two', payload: 'delete two', qos: 0, retain: false, timestamp: 1400 })

    runtime.setMqttSearch('beta')
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['in-beta'])
    expect(runtime.dispatch('mqtt.receive.filter.all').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['out-beta', 'in-beta'])
    expect(runtime.dispatch('mqtt.receive.filter.out').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['out-beta'])

    expect(runtime.dispatch('mqtt.receive.filter.in').handled).toBe(true)
    runtime.setMqttSearch('delete')
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['del-2', 'del-1'])
    runtime.focusMqttMessage('del-2')
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.messages).toMatchObject({
      activeIndex: 1,
      selectedIds: ['del-2']
    })
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'del-1' })

    expect(runtime.handleShortcut('Ctrl+Delete', { textInputFocused: true, activeInputRole: 'mqtt-search' })).toBe('mqtt.record.delete')
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['del-1'])
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'del-1' })

    expect(runtime.handleShortcut('Ctrl+Backspace', { textInputFocused: true, activeInputRole: 'mqtt-search' })).toBe('mqtt.record.delete')
    expect(runtime.snapshot().mqttMessageRows).toEqual([])
    expect(runtime.snapshot().mqttSelectedRecord).toBeNull()
  })

  it('uses EzClipboard-style multi-select and delete recovery for MQTT publish records', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    runtime.updateMqttPublishDraft({ topic: 'plc/a', payload: 'a', qos: 0, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'A' })
    runtime.updateMqttPublishDraft({ topic: 'plc/b', payload: 'b', qos: 0, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'B' })
    runtime.updateMqttPublishDraft({ topic: 'plc/c', payload: 'c', qos: 0, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'C' })
    const templateIds = runtime.snapshot().mqttPublishTemplateRows.map((item) => item.id)

    runtime.dispatch('mqtt.focus.templates')
    runtime.handleShortcut('ArrowDown', false)
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: templateIds[0] })
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.templates).toMatchObject({
      activeIndex: 1,
      selectedIds: [templateIds[0]]
    })
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: templateIds[1] })
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.templates).toMatchObject({
      activeIndex: 2,
      selectedIds: [templateIds[0], templateIds[1]]
    })
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: templateIds[2] })

    expect(runtime.handleShortcut('Delete', false)).toBe('mqtt.record.delete')
    expect(runtime.snapshot().mqttPublishTemplateRows.map((item) => item.id)).toEqual([templateIds[2]])
    expect(runtime.snapshot().mqttRecordListStates.templates).toMatchObject({
      activeIndex: 0,
      selectedIds: []
    })
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: templateIds[2] })
  })

  it('copies and saves selected MQTT records as one merged JSON export without clearing selection', async () => {
    const { state, copied, savedTextFiles } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    runtime.appendMqttMessageRecord({ id: 'export-a', direction: 'incoming', topic: 'plc/a', payload: '{"value":1}', qos: 1, retain: false, timestamp: 1_000 })
    runtime.appendMqttMessageRecord({ id: 'export-b', direction: 'incoming', topic: 'plc/b', payload: 'plain text', qos: 0, retain: true, timestamp: 1_100 })

    expect(runtime.dispatch('mqtt.record.toggleSelect', { kind: 'message', id: 'export-a', list: 'messages' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.record.toggleSelect', { kind: 'message', id: 'export-b', list: 'messages' }).handled).toBe(true)
    const selectedIds = [...runtime.snapshot().mqttRecordListStates.messages.selectedIds]

    expect(runtime.dispatch('mqtt.record.export.copyMergedJson', { list: 'messages' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.record.export.copyTopics', { list: 'messages' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.record.export.copyPayloads', { list: 'messages' }).handled).toBe(true)
    expect(runtime.dispatch('mqtt.record.export.saveMergedJson', { list: 'messages' }).handled).toBe(true)
    await flushWindowActions()

    expect(copied).toEqual(expect.arrayContaining([
      'plc/b\nplc/a',
      'plain text\n\n{"value":1}'
    ]))
    const copiedExport = JSON.parse(copied.find((item) => item.includes('eypc-mqtt-merged-export/v1')) || '{}')
    expect(copiedExport).toMatchObject({ schema: 'eypc-mqtt-merged-export/v1', count: 2 })
    expect(copiedExport.records).toEqual([
      expect.objectContaining({ topic: 'plc/b', payload: 'plain text', payloadFormat: 'text' }),
      expect.objectContaining({ topic: 'plc/a', payload: '{"value":1}', payloadFormat: 'json', payloadJson: { value: 1 } })
    ])
    expect(runtime.dispatch('mqtt.record.copyAll', { kind: 'message', id: 'export-a' }).handled).toBe(true)
    await flushWindowActions()
    const singleExport = JSON.parse(copied.at(-1) || '{}')
    expect(singleExport).toMatchObject({ schema: 'eypc-mqtt-merged-export/v1', count: 1 })
    expect(singleExport.records).toEqual([
      expect.objectContaining({ topic: 'plc/a', payload: '{"value":1}' })
    ])
    expect(savedTextFiles).toHaveLength(1)
    expect(savedTextFiles[0]).toMatchObject({ mimeType: 'application/json;charset=utf-8' })
    expect(savedTextFiles[0].suggestedName).toMatch(/^mqtt-merged-.+\.json$/)
    const savedExport = JSON.parse(savedTextFiles[0].text)
    expect(savedExport).toMatchObject({ schema: 'eypc-mqtt-merged-export/v1', count: 2, records: copiedExport.records })
    expect(runtime.snapshot().mqttRecordListStates.messages.selectedIds).toEqual(selectedIds)
  })

  it('recovers MQTT message focus after delete and isolates template/history search and selection state', () => {
    const { state } = installPlatform()
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'PLC',
      protocol: 'ws',
      host: 'broker.example',
      port: '8083',
      path: '/',
      clientId: 'client-a',
      syncRecords: true
    })
    runtime.dispatch('mqtt.config.save')
    runtime.appendMqttMessageRecord({ id: 'in-1', direction: 'incoming', topic: 'plc/in/1', payload: '{"in":1}', qos: 0, retain: false, timestamp: 1000 })
    runtime.appendMqttMessageRecord({ id: 'in-2', direction: 'incoming', topic: 'plc/in/2', payload: '{"in":2}', qos: 0, retain: false, timestamp: 1100 })
    runtime.appendMqttMessageRecord({ id: 'in-3', direction: 'incoming', topic: 'plc/in/3', payload: '{"in":3}', qos: 0, retain: false, timestamp: 1200 })

    runtime.focusMqttMessage('in-3')
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.messages).toMatchObject({
      activeIndex: 1,
      selectedIds: ['in-3']
    })
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'in-2' })
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.messages).toMatchObject({
      activeIndex: 2,
      selectedIds: ['in-3', 'in-2']
    })
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'in-1' })
    expect(runtime.dispatch('mqtt.record.delete').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual(['in-1'])
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'in-1' })
    expect(runtime.snapshot().mqttRecordListStates.messages.activeIndex).toBe(0)
    expect(runtime.snapshot().mqttRecordListStates.messages.selectedIds).toEqual([])

    expect(runtime.dispatch('mqtt.record.delete').handled).toBe(true)
    expect(runtime.snapshot().mqttMessageRows.map((item) => item.id)).toEqual([])
    expect(runtime.snapshot().mqttSelectedRecord).toBeNull()
    expect(runtime.snapshot().mqttRecordListStates.messages.activeIndex).toBe(0)

    runtime.updateMqttPublishDraft({ topic: 'plc/template/alpha', payload: '{"tpl":"alpha"}', qos: 0, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'Alpha template' })
    runtime.updateMqttPublishDraft({ topic: 'plc/template/beta', payload: '{"tpl":"beta"}', qos: 0, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'Beta template' })
    runtime.updateMqttPublishDraft({ topic: 'plc/template/gamma', payload: '{"tpl":"gamma"}', qos: 0, retain: false })
    runtime.dispatch('mqtt.publish.template.save', { title: 'Gamma template' })
    runtime.appendMqttMessageRecord({ id: 'out-1', direction: 'outgoing', topic: 'plc/out/1', payload: '{"out":1}', qos: 0, retain: false, timestamp: 1300 })
    runtime.appendMqttMessageRecord({ id: 'out-2', direction: 'outgoing', topic: 'plc/out/2', payload: '{"out":2}', qos: 0, retain: false, timestamp: 1400 })
    runtime.appendMqttMessageRecord({ id: 'out-3', direction: 'outgoing', topic: 'plc/out/3', payload: '{"out":3}', qos: 0, retain: false, timestamp: 1500 })

    expect(runtime.dispatch('mqtt.template.search.set', { query: 'beta' }).handled).toBe(true)
    expect(runtime.snapshot().mqttTemplateSearch).toBe('beta')
    expect(runtime.snapshot().mqttHistorySearch).toBe('')
    expect(runtime.snapshot().mqttPublishTemplateRows.map((item) => item.title)).toEqual(['Beta template'])
    expect(runtime.snapshot().mqttRecordListStates.templates.activeIndex).toBe(0)
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'publish-template', id: runtime.snapshot().mqttPublishTemplateRows[0].id })
    expect(runtime.dispatch('mqtt.template.search.set', { query: '' }).handled).toBe(true)

    expect(runtime.handleShortcut('Ctrl+M', false)).toBe('mqtt.focus.templates')
    const templateIds = runtime.snapshot().mqttPublishTemplateRows.map((item) => item.id)
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().mqttRecordListStates.templates).toMatchObject({
      activeIndex: 2,
      selectedIds: [templateIds[1]]
    })

    expect(runtime.dispatch('mqtt.history.search.set', { query: 'out/2' }).handled).toBe(true)
    expect(runtime.snapshot().mqttHistorySearch).toBe('out/2')
    expect(runtime.snapshot().mqttTemplateSearch).toBe('')
    expect(runtime.snapshot().mqttPublishHistoryRows.map((item) => item.id)).toEqual(['out-2'])
    expect(runtime.snapshot().mqttRecordListStates.history.activeIndex).toBe(0)
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'message', id: 'out-2' })
    expect(runtime.snapshot().mqttRecordListStates.templates.selectedIds).toEqual([templateIds[1]])

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().mqttRecordListStates.history).toMatchObject({
      activeIndex: 0,
      selectedIds: ['out-2']
    })
    expect(runtime.snapshot().mqttRecordListStates.templates.selectedIds).toEqual([templateIds[1]])

    expect(runtime.handleShortcut('Delete', false)).toBe('mqtt.record.delete')
    expect(runtime.snapshot().mqttPublishHistoryRows).toEqual([])
    expect(runtime.snapshot().mqttRecordListStates.history).toMatchObject({
      activeIndex: 0,
      selectedIds: []
    })
    expect(runtime.snapshot().mqttRecordListStates.templates.selectedIds).toEqual([templateIds[1]])
  })

  it('keeps MQTT connection passwords in local-only storage across runtime reloads', () => {
    const { state, platform } = installPlatform()
    const savedStates: unknown[] = []
    const archiveWrites: unknown[] = []
    let localSecrets: Record<string, string> = {}
    platform.storage.setState = (nextState: unknown) => {
      savedStates.push(nextState)
      return true
    }
    platform.storage.setMqttArchive = (archive: unknown) => {
      archiveWrites.push(archive)
      return true
    }
    ;(platform.storage as unknown as {
      getMqttSecrets: () => Record<string, string>
      setMqttSecrets: (secrets: Record<string, string>) => boolean
    }).getMqttSecrets = () => localSecrets
    ;(platform.storage as unknown as {
      getMqttSecrets: () => Record<string, string>
      setMqttSecrets: (secrets: Record<string, string>) => boolean
    }).setMqttSecrets = (secrets) => {
      localSecrets = { ...secrets }
      return true
    }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'Local Secret Broker',
      protocol: 'wss',
      host: 'broker.example',
      port: '8084',
      path: '/mqtt',
      clientId: 'client-secret',
      username: 'user-secret',
      password: 'local-only-secret'
    })
    expect(runtime.dispatch('mqtt.config.save').handled).toBe(true)

    const configId = runtime.snapshot().state.mqtt.activeConfigId
    expect(configId).toBeTruthy()
    expect(localSecrets).toEqual({ [configId as string]: 'local-only-secret' })
    expect(JSON.stringify(savedStates)).not.toContain('local-only-secret')
    expect(JSON.stringify(archiveWrites)).not.toContain('local-only-secret')

    const reloaded = createAppRuntime(runtime.snapshot().state)
    reloaded.setTab('mqtt')
    expect(reloaded.dispatch('mqtt.config.edit').handled).toBe(true)
    expect(reloaded.snapshot().mqttConfigDraft?.password).toBe('local-only-secret')

    reloaded.updateMqttConfigDraft({ password: '' })
    expect(reloaded.dispatch('mqtt.config.save').handled).toBe(true)
    expect(localSecrets).toEqual({})
  })

  it('closes MQTT detail and drawer layers with scoped shortcuts', () => {
    const { state } = installPlatform()
    const runtime = createAppRuntime(state)

    runtime.setTab('mqtt')
    expect(runtime.handleShortcut('Ctrl+ArrowLeft', false)).toBe('mqtt.detail.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: true, active: false })
    expect(runtime.handleShortcut('ArrowRight', false)).toBe('mqtt.detail.close')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: false, active: false, targetKind: null, targetId: null })

    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('mqtt.drawer.open')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: true, active: true })
    expect(runtime.handleShortcut('ArrowLeft', false)).toBe('mqtt.drawer.close')
    expect(runtime.snapshot().mqttDrawer).toMatchObject({ open: false, active: false, targetKind: null, targetId: null })
  })

  it('moves active tab to settings when the current feature is disabled', () => {
    installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    runtime.saveFeatureConfigs([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: false, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ])

    expect(runtime.snapshot().state.activeTab).toBe('settings')
  })

  it('copies selected favorite path and rejects group nodes without a path', async () => {
    const { copied } = installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    enableFavorites(state)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f1', kind: 'folder', path: '/tmp/demo', name: 'Demo', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavorite('f1')
    expect(runtime.dispatch('favorites.copyPath').handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['/tmp/demo'])

    runtime.focusFavorite('g1')
    runtime.dispatch('favorites.copyPath')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['/tmp/demo'])
    expect(runtime.snapshot().message).toBe('分组节点没有可复制路径')
  })

  it('navigates favorites groups and item rows as separate panes', () => {
    installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    enableFavorites(state)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Projects', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'g2', kind: 'group', path: '', name: 'Docs', parentId: 'g1', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'f1', kind: 'folder', path: '/work/app', name: 'App', parentId: 'g1', tags: ['code'], color: '#2F80ED', sortOrder: 1, createdAt: 3, updatedAt: 3 },
      { id: 'f2', kind: 'file', path: '/work/app/README.md', name: 'README', parentId: 'g2', tags: ['docs'], color: '#F2994A', sortOrder: 1, createdAt: 4, updatedAt: 4 }
    ]
    const runtime = createAppRuntime(state)

    expect(runtime.snapshot().favoriteGroupRows.map((row) => row.node.id)).toEqual(['g1', 'g2'])
    expect(runtime.snapshot().favoriteItemRows.map((row) => row.id)).toEqual(['f1', 'f2'])

    expect(runtime.handleShortcut('Tab', false)).toBe('favorites.pane.toggleNext')
    expect(runtime.snapshot().activeFavoritePane).toBe('containers')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedFavoriteGroupId).toBe('g2')
    expect(runtime.handleShortcut('Enter', false)).toBe('favorites.group.apply')
    expect(runtime.snapshot().selectedFavoriteGroupId).toBe('g2')
    expect(runtime.snapshot().favoriteItemRows.map((row) => row.id)).toEqual(['f2'])
  })

  it('edits favorite group metadata and prevents invalid parent moves', () => {
    installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    enableFavorites(state)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Projects', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'g2', kind: 'group', path: '', name: 'Docs', parentId: 'g1', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavoriteGroup('g1')
    expect(runtime.dispatch('favorites.rename').handled).toBe(true)
    expect(runtime.snapshot().favoriteDraft?.mode).toBe('rename')
    runtime.updateFavoriteDraft({ name: 'Work Projects' })
    expect(runtime.dispatch('favorites.save').handled).toBe(true)
    expect(runtime.snapshot().state.favorites.find((item) => item.id === 'g1')?.name).toBe('Work Projects')

    runtime.focusFavoriteGroup('g1')
    runtime.dispatch('favorites.group.moveParent')
    runtime.updateFavoriteDraft({ parentId: 'g2' })
    runtime.dispatch('favorites.save')
    expect(runtime.snapshot().message).toBe('不能移动到自身或子分组下')
    expect(runtime.snapshot().state.favorites.find((item) => item.id === 'g1')?.parentId).toBeNull()
  })

  it('confirms normal favorite metadata removal and force-removes groups directly', () => {
    installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Projects', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f1', kind: 'folder', path: '/work/app', name: 'App', parentId: 'g1', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavorite('f1')
    runtime.dispatch('favorites.remove')
    expect(runtime.snapshot().confirm?.title).toBe('移出收藏')
    runtime.confirmNow()
    expect(runtime.snapshot().state.favorites.map((item) => item.id)).toEqual(['g1'])

    runtime.focusFavoriteGroup('g1')
    runtime.dispatch('favorites.remove.force')
    expect(runtime.snapshot().state.favorites).toEqual([])
  })

  it('opens quick favorite results and hides the app after quick actions', async () => {
    const { opened, copied, revealed, getHideCount } = installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'f1', kind: 'folder', path: '/work/app', name: 'App', parentId: null, tags: ['code'], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f2', kind: 'file', path: '/work/readme.md', name: 'README', parentId: null, tags: ['docs'], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setFavoriteQuickMode(true)
    runtime.setFavoriteSearch('app')
    expect(runtime.snapshot().favoriteQuickMode).toBe(true)
    expect(runtime.snapshot().favoriteItemRows.map((row) => row.id)).toEqual(['f1'])
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBe('favorites.open')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/work/app'])
    expect(getHideCount()).toBe(1)
    expect(runtime.snapshot().state.favorites.find((item) => item.id === 'f1')?.usageCount).toBe(1)

    runtime.focusFavorite('f1')
    runtime.dispatch('favorites.copyPath')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['/work/app'])
    expect(getHideCount()).toBe(2)

    runtime.dispatch('favorites.reveal', { favoriteId: 'f2' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(revealed).toEqual(['/work/readme.md'])
    expect(getHideCount()).toBe(3)
  })

  it('runs the first ten quick results with Ctrl+1…0 and learns only successful launches', async () => {
    const runRequests: unknown[] = []
    const { state, getHideCount } = installPlatform({
      files: {
        capabilities: { platform: 'darwin', open: true, reveal: true, copyPath: true, copyItems: true, pickFiles: true, pickFolders: true, listDirectory: true, inspectPaths: true, run: true, terminalRun: true },
        run: async (request) => { runRequests.push(request); return { outcome: 'started' as const } }
      }
    })
    enableFavorites(state)
    state.favorites = Array.from({ length: 10 }, (_, index) => {
      const node = { id: `script-${index + 1}`, kind: 'file' as const, path: `/work/script-${index + 1}.sh`, name: `Script ${index + 1}`, parentId: null, tags: [], color: '#F2994A', sortOrder: index + 1, createdAt: index + 1, updatedAt: index + 1 }
      return index === 9
        ? { ...node, runnerByPlatform: { darwin: trustFavoriteRunner(node, 'darwin', { mode: 'background', executable: '/bin/sh', args: ['{path}'], cwdMode: 'target-directory' }, 100) } }
        : node
    })
    const runtime = createAppRuntime(state)
    runtime.setFavoriteQuickMode(true)
    runtime.setFavoriteSearch('script')

    expect(runtime.handleShortcut('Ctrl+0', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBe('favorites.quick.open.10')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runRequests).toEqual([expect.objectContaining({ targetPath: '/work/script-10.sh', executable: '/bin/sh', args: ['/work/script-10.sh'], mode: 'background' })])
    expect(getHideCount()).toBe(1)
    expect(runtime.snapshot().state.favoriteSearchAffinities).toEqual([
      expect.objectContaining({ query: 'script', favoriteId: 'script-10', usageCount: 1 })
    ])
    expect(runtime.snapshot().state.favorites.find((item) => item.id === 'script-10')?.usageCount).toBe(1)
  })

  it('requires one trust confirmation, survives a cosmetic rename, and blocks a runner after stored trust drifts', async () => {
    const runRequests: unknown[] = []
    const { state, getShowCount } = installPlatform({
      files: {
        capabilities: { platform: 'darwin', open: true, reveal: true, copyPath: true, copyItems: true, pickFiles: true, pickFolders: true, listDirectory: true, inspectPaths: true, run: true, terminalRun: true },
        run: async (request) => { runRequests.push(request); return { outcome: 'started' as const } }
      }
    })
    enableFavorites(state)
    state.favorites = [{ id: 'script', kind: 'file', path: '/work/run.sh', name: 'Run', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)

    runtime.focusFavorite('script')
    runtime.dispatch('favorites.edit')
    runtime.updateFavoriteDraft({ runnerEnabled: true, runnerMode: 'background', runnerExecutable: '/bin/sh', runnerArgsText: '{path}\n  --label=空 格  ', runnerCwdMode: 'target-directory' })
    expect(runtime.dispatch('favorites.save').handled).toBe(true)
    expect(runtime.snapshot().confirm?.title).toBe('信任并保存自定义运行器')
    expect(runtime.snapshot().state.favorites[0].runnerByPlatform).toBeUndefined()
    runtime.confirmNow()

    const trusted = runtime.snapshot().state.favorites[0].runnerByPlatform?.darwin
    expect(isFavoriteRunnerTrusted(runtime.snapshot().state.favorites[0], 'darwin', trusted)).toBe(true)
    runtime.dispatch('favorites.slot.manager.open', { favoriteId: 'script' })
    runtime.dispatch('favorites.slot.assign.1')
    runtime.dispatch('favorites.slot.manager.close')
    runtime.dispatch('favorites.open', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runRequests).toHaveLength(1)
    expect(runRequests[0]).toMatchObject({ args: ['/work/run.sh', '  --label=空 格  '] })

    // This runner never expands `{name}`, so renaming it is cosmetic and must keep trust.
    runtime.focusFavorite('script')
    runtime.dispatch('favorites.rename')
    runtime.updateFavoriteDraft({ name: 'Renamed' })
    runtime.dispatch('favorites.save')
    runtime.dispatch('favorites.open', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runRequests).toHaveLength(2)
    expect(runtime.snapshot().confirm).toBeFalsy()

    // Stored trust that no longer matches the target still blocks, and a slot failure opens the repair manager.
    const live = runtime.snapshot().state
    live.favorites = live.favorites.map((item) => item.id === 'script'
      ? { ...item, runnerByPlatform: { darwin: { ...item.runnerByPlatform!.darwin!, trustedFingerprint: 'fnv1a64:0000000000000000' } } }
      : item)
    runtime.dispatch('favorites.open', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runRequests).toHaveLength(2)
    expect(runtime.snapshot().message).toContain('配置已变更或尚未确认')
    runtime.dispatch('favorites.slot.activate.1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getShowCount()).toBe(1)
    expect(runtime.snapshot().favoriteSlotManagerOpen).toBe(true)
  })

  it('separates launch acceptance from exit code and exposes the captured run log', async () => {
    let listeners: Array<() => void> = []
    const runs: FavoriteRunRecord[] = []
    const { state, opened, copied } = installPlatform({
      files: {
        capabilities: { platform: 'darwin', open: true, reveal: true, copyPath: true, copyItems: true, pickFiles: true, pickFolders: true, listDirectory: true, inspectPaths: true, run: true, terminalRun: true },
        run: async () => {
          runs.unshift({ runId: 'r1', favoriteId: 'script', favoriteName: 'Run', mode: 'background', status: 'running', startedAt: 10, executable: '/bin/sh', args: ['/work/run.sh'], cwd: '/work', logPath: '/data/favorite-runs/run-1.log' })
          for (const listener of listeners) listener()
          return { outcome: 'started' as const, runId: 'r1', logPath: '/data/favorite-runs/run-1.log' }
        },
        listRuns: () => runs,
        watchRuns: (listener: () => void) => {
          listeners.push(listener)
          return () => { listeners = listeners.filter((item) => item !== listener) }
        }
      }
    })
    enableFavorites(state)
    const node = { id: 'script', kind: 'file' as const, path: '/work/run.sh', name: 'Run', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    state.favorites = [{ ...node, runnerByPlatform: { darwin: trustFavoriteRunner(node, 'darwin', { mode: 'background', executable: '/bin/sh', args: ['{path}'], cwdMode: 'target-directory' }, 100) } }]
    const runtime = createAppRuntime(state)

    runtime.dispatch('favorites.open', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().favoriteRunSummaries.script).toMatchObject({ status: 'running', text: '运行中', failed: false })

    // A non-zero exit arrives after the launch already reported success, and must not reuse it.
    runs[0] = { ...runs[0], status: 'failed', exitCode: 2, endedAt: 20 }
    for (const listener of listeners) listener()
    const failedSummary = runtime.snapshot().favoriteRunSummaries.script
    expect(failedSummary.failed).toBe(true)
    expect(failedSummary.text).toBe('以非 0 退出码 2 结束')

    runs[0] = { ...runs[0], status: 'exited', exitCode: 0 }
    for (const listener of listeners) listener()
    expect(runtime.snapshot().favoriteRunSummaries.script).toMatchObject({ failed: false, text: '已成功退出（退出码 0）' })

    runtime.dispatch('favorites.run.openLog', { favoriteId: 'script' })
    runtime.dispatch('favorites.run.copyLogPath', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toContain('/data/favorite-runs/run-1.log')
    expect(copied).toContain('/data/favorite-runs/run-1.log')

    runtime.dispatch('favorites.run.copyCommand', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied.at(-1)).toBe('"/bin/sh" "/work/run.sh"')

    // A favorite whose run left no log says so instead of opening something unrelated.
    runs.length = 0
    for (const listener of listeners) listener()
    runtime.dispatch('favorites.run.openLog', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().message).toBe('这次运行没有可用的日志文件')

    runtime.dispose()
    expect(listeners).toHaveLength(0)
  })

  it('collects dynamic runner parameters before launching and cancels without running', async () => {
    const runRequests: FavoriteRunRequest[] = []
    const { state, getShowCount } = installPlatform({
      files: {
        capabilities: { platform: 'darwin', open: true, reveal: true, copyPath: true, copyItems: true, pickFiles: true, pickFolders: true, listDirectory: true, inspectPaths: true, run: true, terminalRun: true },
        run: async (request: FavoriteRunRequest) => { runRequests.push(request); return { outcome: 'started' as const } }
      }
    })
    enableFavorites(state)
    const node = { id: 'script', kind: 'file' as const, path: '/work/run.sh', name: 'Run', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    const runner = { mode: 'background' as const, executable: '/bin/sh', args: ['{path}', '--env={ask:环境=dev}', '--tag={ask:标签}'], cwdMode: 'target-directory' as const }
    state.favorites = [{ ...node, runnerByPlatform: { darwin: trustFavoriteRunner(node, 'darwin', runner, 100) } }]
    const runtime = createAppRuntime(state)

    runtime.dispatch('favorites.open', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Nothing launches until the required value exists.
    expect(runRequests).toHaveLength(0)
    const prompt = runtime.snapshot().favoriteRunPrompt
    expect(prompt?.fields).toEqual([
      { name: '环境', required: false, value: 'dev' },
      { name: '标签', required: true, value: '' }
    ])
    expect(prompt?.preview).toBe('')
    expect(prompt?.error).toContain('标签')

    expect(runtime.submitFavoriteRunPrompt()).toBe(false)
    expect(runRequests).toHaveLength(0)

    runtime.updateFavoriteRunPrompt('标签', 'v1 空格')
    expect(runtime.snapshot().favoriteRunPrompt?.preview).toBe('"/bin/sh" "/work/run.sh" "--env=dev" "--tag=v1 空格"')
    runtime.submitFavoriteRunPrompt()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().favoriteRunPrompt).toBeNull()
    expect(runRequests).toHaveLength(1)
    expect(runRequests[0]).toMatchObject({ args: ['/work/run.sh', '--env=dev', '--tag=v1 空格'] })

    // The last values are remembered for this session, and cancelling never launches.
    runtime.dispatch('favorites.open', { favoriteId: 'script' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoriteRunPrompt?.fields.find((field) => field.name === '标签')?.value).toBe('v1 空格')
    runtime.cancelFavoriteRunPrompt()
    expect(runtime.snapshot().favoriteRunPrompt).toBeNull()
    expect(runtime.snapshot().message).toBe('已取消本次运行')
    expect(runRequests).toHaveLength(1)

    // A slot launch gives up its silent promise instead of failing quietly.
    runtime.dispatch('favorites.slot.manager.open', { favoriteId: 'script' })
    runtime.dispatch('favorites.slot.assign.1')
    runtime.dispatch('favorites.slot.manager.close')
    const showsBefore = getShowCount()
    runtime.dispatch('favorites.slot.activate.1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoriteRunPrompt?.favoriteId).toBe('script')
    expect(getShowCount()).toBe(showsBefore + 1)
    expect(runRequests).toHaveLength(1)
  })

  it('keeps file slots platform-isolated and cleans slot and learning references on removal', async () => {
    const { state, opened, configuredHotkeys, getShowCount } = installPlatform({
      files: {
        capabilities: { platform: 'darwin', open: true, reveal: true, copyPath: true, copyItems: true, pickFiles: true, pickFolders: true, listDirectory: true, inspectPaths: true, run: true, terminalRun: true }
      }
    })
    enableFavorites(state)
    state.favorites = [
      { id: 'mac', kind: 'folder', path: '/work/mac', name: 'Mac', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'linux', kind: 'folder', path: '/work/linux', name: 'Linux', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    state.favoriteSlots[0].favoriteIdByPlatform = { darwin: 'mac', linux: 'linux' }
    state.favoriteSearchAffinities = [{ query: 'mac', favoriteId: 'mac', usageCount: 1, lastUsedAt: 100 }]
    const runtime = createAppRuntime(state)

    expect(runtime.dispatch('favorites.slot.activate.1').handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/work/mac'])
    expect(getShowCount()).toBe(0)

    runtime.dispatch('favorites.slot.manager.open', { favoriteId: 'linux' })
    runtime.dispatch('favorites.slot.assign.1')
    expect(runtime.snapshot().state.favoriteSlots[0].favoriteIdByPlatform).toEqual({ darwin: 'linux', linux: 'linux' })
    runtime.dispatch('favorites.slot.hotkey.1')
    expect(configuredHotkeys).toContain('EyPc 文件槽 1')

    runtime.focusFavorite('mac')
    runtime.dispatch('favorites.remove.force')
    expect(runtime.snapshot().state.favoriteSearchAffinities).toEqual([])
    expect(Object.values(runtime.snapshot().state.favoriteSlots[0].favoriteIdByPlatform)).not.toContain('mac')
  })

  it('opens the first quick favorite when entering quick mode without a search query', async () => {
    const { opened, getHideCount } = installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'f1', kind: 'folder', path: '/work/app', name: 'App', parentId: null, tags: ['code'], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f2', kind: 'file', path: '/work/readme.md', name: 'README', parentId: null, tags: ['docs'], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setFavoriteQuickMode(true)

    expect(runtime.snapshot().focusedFavoriteId).toBe('f1')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBe('favorites.open')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/work/app'])
    expect(getHideCount()).toBe(1)
  })

  it('enters pick review before saving a selected file favorite', async () => {
    let pickedKind: 'file' | 'folder' | null = null
    installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async (kind) => {
          pickedKind = kind
          return [{ kind: 'file', path: '/tmp/readme.md', name: '', parentId: null, tags: ['picked'], color: '#F2994A' }]
        },
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    runtime.dispatch('favorites.pick.files')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(pickedKind).toBe('file')
    expect(runtime.snapshot().state.favorites).toHaveLength(0)
    expect(runtime.snapshot().favoritePickReview).toMatchObject({
      kind: 'file',
      activeIndex: 0,
      items: [{ kind: 'file', path: '/tmp/readme.md', name: 'readme.md' }]
    })
    runtime.updateFavoritePickReviewItem(0, { name: 'Readme' })
    expect(runtime.dispatch('favorites.pickReview.commit').handled).toBe(true)

    expect(runtime.snapshot().state.favorites).toHaveLength(1)
    expect(runtime.snapshot().state.favorites[0]).toMatchObject({ kind: 'file', path: '/tmp/readme.md', name: 'Readme' })
    expect(runtime.snapshot().favoritePickReview).toBeNull()
  })

  it('cancels pick review without writing favorite metadata', async () => {
    installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [
          { kind: 'folder', path: '/tmp/picked-folder', name: 'Picked Folder', parentId: null, tags: [], color: '#2F80ED' }
        ],
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    runtime.dispatch('favorites.pick.folders')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoritePickReview?.kind).toBe('folder')
    expect(runtime.dispatch('favorites.pickReview.cancel').handled).toBe(true)

    expect(runtime.snapshot().favoritePickReview).toBeNull()
    expect(runtime.snapshot().state.favorites).toEqual([])
  })

  it('creates a manual favorite target with Ctrl+N under the selected group', () => {
    installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Projects', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavoriteGroup('g1')
    runtime.dispatch('favorites.group.apply')
    expect(runtime.handleShortcut('Ctrl+N', false)).toBe('favorites.target.create')
    expect(runtime.snapshot().favoriteDraft).toMatchObject({ mode: 'create-target', kind: 'folder', activeField: 'path', parentId: 'g1' })

    runtime.updateFavoriteDraft({ path: '/work/new-app/', tagsText: 'code, docs' })
    expect(runtime.dispatch('favorites.save').handled).toBe(true)

    const created = runtime.snapshot().state.favorites.find((item) => item.kind === 'folder')
    expect(created).toMatchObject({ path: '/work/new-app/', name: 'new-app', parentId: 'g1', tags: ['code', 'docs'] })
    expect(runtime.snapshot().focusedFavoriteId).toBe(created?.id)
  })

  it('picks an OS path into the favorite draft without adding metadata immediately', async () => {
    installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async (kind) => {
          expect(kind).toBe('file')
          return [
          { kind: 'file', path: '/tmp/readme.md', name: '', parentId: null, tags: [], color: '#F2994A' }
          ]
        },
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    expect(runtime.dispatch('favorites.target.create').handled).toBe(true)
    runtime.updateFavoriteDraft({ kind: 'file' })
    expect(runtime.dispatch('favorites.draft.pickPath').handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().state.favorites).toEqual([])
    expect(runtime.snapshot().favoriteDraft).toMatchObject({
      kind: 'file',
      path: '/tmp/readme.md',
      name: 'readme.md',
      activeField: 'path'
    })
  })

  it('lets the favorite draft picker choose a folder without pre-switching the draft kind', async () => {
    let pickedKind: 'file' | 'folder' | null = null
    installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async (kind) => {
          pickedKind = kind
          return [
            { kind: 'folder', path: '/tmp/project', name: '', parentId: null, tags: [], color: '#2F80ED' }
          ]
        },
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    expect(runtime.dispatch('favorites.target.create').handled).toBe(true)
    runtime.updateFavoriteDraft({ kind: 'file' })
    expect(runtime.dispatch('favorites.draft.pickPath', { kind: 'folder' }).handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(pickedKind).toBe('folder')
    expect(runtime.snapshot().state.favorites).toEqual([])
    expect(runtime.snapshot().favoriteDraft).toMatchObject({
      kind: 'folder',
      path: '/tmp/project',
      name: 'project',
      activeField: 'path'
    })
  })

  it('adds picked favorites to the current group and focuses duplicates instead of writing them', async () => {
    installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => ({ kind: 'folder', path: '/tmp/picked/', name: '', parentId: null, tags: ['picked'], color: '#2F80ED' }),
        pickFavorites: async () => [{ kind: 'folder', path: '/tmp/picked/', name: '', parentId: null, tags: ['picked'], color: '#2F80ED' }],
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Projects', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavoriteGroup('g1')
    runtime.dispatch('favorites.group.apply')
    expect(runtime.handleShortcut('Ctrl+Shift+O', false)).toBe('favorites.pick.folders')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoritePickReview).toMatchObject({ kind: 'folder', parentId: 'g1' })
    expect(runtime.dispatch('favorites.pickReview.commit').handled).toBe(true)

    const created = runtime.snapshot().state.favorites.find((item) => item.kind === 'folder')
    expect(created).toMatchObject({ path: '/tmp/picked/', name: 'picked', parentId: 'g1' })
    expect(runtime.snapshot().focusedFavoriteId).toBe(created?.id)

    runtime.dispatch('favorites.pick.folders')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.dispatch('favorites.pickReview.commit').handled).toBe(true)
    expect(runtime.snapshot().state.favorites.filter((item) => item.kind === 'folder')).toHaveLength(1)
    expect(runtime.snapshot().focusedFavoriteId).toBe(created?.id)
    expect(runtime.snapshot().message).toBe('收藏已存在，已定位到现有项')
  })

  it('does not expose add commands from quick favorite mode', () => {
    installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    runtime.setFavoriteQuickMode(true)

    expect(runtime.handleShortcut('Ctrl+N', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBeNull()
    expect(runtime.handleShortcut('Ctrl+O', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBeNull()
    expect(runtime.handleShortcut('Ctrl+Shift+O', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBeNull()
    expect(runtime.handleShortcut('Delete', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBeNull()
    expect(runtime.handleShortcut('F2', { textInputFocused: true, activeInputRole: 'favorite-search' })).toBeNull()
    expect(runtime.dispatch('favorites.target.create').handled).toBe(false)
    expect(runtime.dispatch('favorites.pick.files').handled).toBe(false)
    expect(runtime.dispatch('favorites.pick.folders').handled).toBe(false)
    expect(runtime.dispatch('favorites.remove').handled).toBe(false)
    expect(runtime.dispatch('favorites.edit').handled).toBe(false)
  })

  it('uses any favorite node as a virtual container and only lists real directories for folders', async () => {
    const { state, listed } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async (target: string) => {
          listed.push(target)
          return {
            ok: true,
            entries: [
              { kind: 'file' as const, name: 'index.ts', path: `${target}/index.ts`, size: 120, modifiedAt: 500 },
              { kind: 'folder' as const, name: 'src', path: `${target}/src`, modifiedAt: 501 }
            ]
          }
        }
      }
    })
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'file-parent', kind: 'file', path: '/notes/root.md', name: 'Root Note', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'virtual-child', kind: 'folder', path: '/elsewhere/project', name: 'Virtual Project', parentId: 'file-parent', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'real-folder', kind: 'folder', path: '/work/app', name: 'App', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavoriteGroup('file-parent')
    runtime.dispatch('favorites.group.apply')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoriteContainerRows.map((row) => row.node.id)).toEqual(['file-parent', 'virtual-child', 'real-folder'])
    expect(runtime.snapshot().favoriteVirtualChildRows.map((row) => row.id)).toEqual(['virtual-child'])
    expect(runtime.snapshot().favoriteDirectoryEntries).toEqual([])
    expect(listed).toEqual([])

    runtime.focusFavoriteGroup('real-folder')
    runtime.dispatch('favorites.group.apply')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listed).toEqual(['/work/app'])
    expect(runtime.snapshot().favoriteDirectoryEntries.map((row) => [row.kind, row.name, row.favorited])).toEqual([
      ['file', 'index.ts', false],
      ['folder', 'src', false]
    ])
  })

  it('saves reviewed picked paths under the current virtual parent and skips duplicates', async () => {
    installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async (kind) => {
          expect(kind).toBe('file')
          return [
          { kind: 'file', path: '/work/app.md', name: '', parentId: null, tags: [], color: '#F2994A' },
          { kind: 'file', path: '/work/new.md', name: '', parentId: null, tags: [], color: '#F2994A' }
          ]
        },
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'file-parent', kind: 'file', path: '/notes/root.md', name: 'Root Note', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'existing', kind: 'file', path: '/work/app.md', name: 'App', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavoriteGroup('file-parent')
    runtime.dispatch('favorites.group.apply')
    runtime.dispatch('favorites.pick.files')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoritePickReview?.items.map((item) => item.path)).toEqual(['/work/app.md', '/work/new.md'])
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'favorite-pick-review' })).toBe('favorites.pickReview.next')
    expect(runtime.snapshot().favoritePickReview?.activeIndex).toBe(1)
    expect(runtime.handleShortcut('Ctrl+Enter', { textInputFocused: true, activeInputRole: 'favorite-pick-review' })).toBe('favorites.pickReview.commit')

    expect(runtime.snapshot().state.favorites.filter((item) => item.path === '/work/app.md')).toHaveLength(1)
    expect(runtime.snapshot().state.favorites.find((item) => item.path === '/work/new.md')).toMatchObject({
      name: 'new.md',
      parentId: 'file-parent'
    })
    expect(runtime.snapshot().focusedFavoriteId).toBe(runtime.snapshot().state.favorites.find((item) => item.path === '/work/new.md')?.id)
  })

  it('opens a favorite action drawer and executes drawer shortcuts', async () => {
    const { opened } = installPlatform()
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'f1', kind: 'file', path: '/work/readme.md', name: 'Readme', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavorite('f1')
    expect(runtime.handleShortcut('Ctrl+ArrowLeft', false)).toBe('favorites.detail.open')
    expect(runtime.snapshot().favoriteDrawer).toMatchObject({ open: true, active: false, targetIds: ['f1'] })
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('favorites.drawer.open')
    expect(runtime.snapshot().favoriteDrawer).toMatchObject({ open: true, active: true, targetKind: 'favorite' })
    expect(runtime.snapshot().favoriteDrawerItems.map((item) => item.commandId)).toContain('favorites.open')
    expect(runtime.handleShortcut('Ctrl+1', false)).toBe('favorites.drawer.select.1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/work/readme.md'])
    expect(runtime.snapshot().favoriteDrawer.open).toBe(false)
  })

  it('keeps quick favorites read-only while exposing detail and safe action panels', () => {
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'quick-1', kind: 'file', path: '/work/quick.md', name: 'Quick', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    ]
    const runtime = createAppRuntime(state)
    runtime.setFavoriteQuickMode(true)
    runtime.focusFavorite('quick-1')

    expect(runtime.handleShortcut('Ctrl+ArrowLeft', false)).toBe('favorites.detail.open')
    expect(runtime.snapshot().favoriteDrawer.active).toBe(false)
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('favorites.drawer.open')
    expect(runtime.snapshot().favoriteDrawerItems.map((item) => item.commandId)).toEqual([
      'favorites.open',
      'favorites.reveal',
      'favorites.copyPath',
      'favorites.copyItems'
    ])
    expect(runtime.snapshot().favoriteDrawerItems.some((item) => item.commandId.includes('remove') || item.commandId.includes('edit'))).toBe(false)
  })

  it('lets an explicit favorite panel target replace an older frozen target', () => {
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'one', kind: 'file', path: '/one.txt', name: 'One', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'two', kind: 'file', path: '/two.txt', name: 'Two', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavorite('one')
    expect(runtime.dispatch('favorites.drawer.open').handled).toBe(true)
    expect(runtime.snapshot().favoriteDrawer.targetIds).toEqual(['one'])

    expect(runtime.dispatch('favorites.drawer.open', { favoriteId: 'two' }).handled).toBe(true)
    expect(runtime.snapshot().favoriteDrawer.targetIds).toEqual(['two'])
    expect(runtime.dispatch('favorites.drawer.open', { favoriteId: 'missing' }).handled).toBe(false)
    expect(runtime.snapshot().favoriteDrawer.targetIds).toEqual(['two'])
  })

  it('retargets an open favorite drawer when another row is focused by mouse', () => {
    const state = createInitialState(100)
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'one', kind: 'file', path: '/one.txt', name: 'One', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'two', kind: 'file', path: '/two.txt', name: 'Two', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavorite('one')
    expect(runtime.dispatch('favorites.drawer.open').handled).toBe(true)
    expect(runtime.snapshot().favoriteDrawer.targetIds).toEqual(['one'])

    runtime.focusFavorite('two')
    expect(runtime.snapshot().focusedFavoriteId).toBe('two')
    expect(runtime.snapshot().favoriteDrawer.open).toBe(true)
    expect(runtime.snapshot().favoriteDrawer.targetIds).toEqual(['two'])
  })

  it('multi-selects real directory rows and adds them as virtual children', async () => {
    const { state } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async (target: string) => ({
          ok: true,
          entries: [
            { kind: 'file' as const, name: 'index.ts', path: `${target}/index.ts`, size: 120, modifiedAt: 500 },
            { kind: 'folder' as const, name: 'src', path: `${target}/src`, modifiedAt: 501 }
          ]
        })
      }
    })
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ]
    state.activeTab = 'favorites'
    state.favorites = [
      { id: 'folder', kind: 'folder', path: '/work/app', name: 'App', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 }
    ]
    const runtime = createAppRuntime(state)

    runtime.focusFavoriteGroup('folder')
    runtime.dispatch('favorites.group.apply')
    await new Promise((resolve) => setTimeout(resolve, 0))
    runtime.toggleFavoriteDirectorySelection('/work/app/index.ts')
    runtime.toggleFavoriteDirectorySelection('/work/app/src')
    expect(runtime.snapshot().selectedFavoriteDirectoryPaths).toEqual(['/work/app/index.ts', '/work/app/src'])

    runtime.dispatch('favorites.directory.addSelected')

    expect(runtime.snapshot().state.favorites.filter((item) => item.parentId === 'folder').map((item) => [item.kind, item.path])).toEqual([
      ['file', '/work/app/index.ts'],
      ['folder', '/work/app/src']
    ])
  })

  it('clears stale management targets when entering quick favorite mode', async () => {
    const { state } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async () => ({ ok: true, entries: [{ kind: 'file' as const, name: 'child.txt', path: '/work/child.txt' }] })
      }
    })
    enableFavorites(state)
    state.favorites = [
      { id: 'folder', kind: 'folder', path: '/work', name: 'Work', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'file', kind: 'file', path: '/work/file.txt', name: 'File', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavoriteGroup('folder')
    runtime.dispatch('favorites.group.apply')
    await new Promise((resolve) => setTimeout(resolve, 0))
    runtime.toggleFavoriteDirectorySelection('/work/child.txt')
    runtime.toggleFavoriteSelection('file')
    runtime.handleShortcut('Ctrl+ArrowRight', false)

    runtime.setFavoriteQuickMode(true)

    expect(runtime.snapshot()).toMatchObject({
      activeFavoritePane: 'items',
      selectedFavoriteIds: [],
      selectedFavoriteDirectoryPaths: [],
      favoriteDirectoryEntries: [],
      favoriteDrawer: { open: false, targetIds: [] }
    })
    expect(runtime.snapshot().focusedFavoriteId).toBe('folder')
  })

  it('prefers current focus over stale selection and preserves visible selection for batch copies', async () => {
    const { copied, copiedItems, state } = installPlatform()
    enableFavorites(state)
    state.favorites = [
      { id: 'one', kind: 'file', path: '/one.txt', name: 'One', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'two', kind: 'file', path: '/two.txt', name: 'Two', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.toggleFavoriteSelection('one')
    runtime.focusFavorite('two')
    runtime.dispatch('favorites.copyPath')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied).toEqual(['/two.txt'])

    runtime.toggleFavoriteSelection('two')
    runtime.dispatch('favorites.copyPath')
    runtime.dispatch('favorites.copyItems')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(copied.at(-1)).toBe('/one.txt\n/two.txt')
    expect(copiedItems).toEqual([['/one.txt', '/two.txt']])
  })

  it('shows removal counts and restores the latest metadata removal once', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [
      { id: 'group', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'child', kind: 'file', path: '/child.txt', name: 'Child', parentId: 'group', tags: [], color: '#F2994A', sortOrder: 1, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavoriteGroup('group')
    runtime.dispatch('favorites.remove')
    expect(runtime.snapshot().confirm?.detail).toContain('1 个根节点、1 个后代')
    runtime.confirmNow()
    expect(runtime.snapshot().state.favorites).toEqual([])
    expect(runtime.handleShortcut('Ctrl+Z', false)).toBe('favorites.remove.undo')
    expect(runtime.snapshot().state.favorites.map((item) => item.id)).toEqual(['group', 'child'])
    expect(runtime.handleShortcut('Ctrl+Z', false)).toBeNull()
  })

  it('restores removal order, collapsed state, focus and selection without stealing later navigation', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [
      { id: 'group', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'child', kind: 'file', path: '/child.txt', name: 'Child', parentId: 'group', tags: [], color: '#F2994A', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'other', kind: 'file', path: '/other.txt', name: 'Other', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)
    runtime.toggleFavoriteCollapse('group')
    runtime.focusFavoriteGroup('group')
    runtime.dispatch('favorites.remove')
    runtime.confirmNow()

    expect(runtime.handleShortcut('Ctrl+Z', false)).toBe('favorites.remove.undo')
    expect(runtime.snapshot()).toMatchObject({
      activeFavoritePane: 'containers',
      focusedFavoriteGroupId: 'group',
      selectedFavoriteIds: []
    })
    expect(runtime.snapshot().state.favorites.map((item) => item.id)).toEqual(['group', 'child', 'other'])
    expect(runtime.snapshot().state.collapsedFavoriteGroupIds).toContain('group')

    runtime.focusFavorite('child')
    runtime.toggleFavoriteSelection('child')
    runtime.dispatch('favorites.remove')
    runtime.confirmNow()
    runtime.focusFavorite('other')

    expect(runtime.handleShortcut('Ctrl+Z', false)).toBe('favorites.remove.undo')
    expect(runtime.snapshot().focusedFavoriteId).toBe('other')
    expect(runtime.snapshot().selectedFavoriteIds).toEqual([])
    expect(runtime.snapshot().state.favorites.map((item) => item.id)).toEqual(['group', 'child', 'other'])
  })

  it('restores a removed visible multi-selection on immediate undo', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [
      { id: 'one', kind: 'file', path: '/one.txt', name: 'One', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'two', kind: 'file', path: '/two.txt', name: 'Two', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 },
      { id: 'three', kind: 'file', path: '/three.txt', name: 'Three', parentId: null, tags: [], color: '#F2994A', sortOrder: 3, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)
    runtime.toggleFavoriteSelection('one')
    runtime.toggleFavoriteSelection('two')
    runtime.dispatch('favorites.remove')
    runtime.confirmNow()

    expect(runtime.handleShortcut('Ctrl+Z', false)).toBe('favorites.remove.undo')
    expect(runtime.snapshot().selectedFavoriteIds).toEqual(['one', 'two'])
    expect(runtime.snapshot().focusedFavoriteId).toBe('two')
  })

  it('follows directory selection then favorite selection in the Escape recovery chain', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [{ id: 'file', kind: 'file', path: '/file.txt', name: 'File', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    runtime.toggleFavoriteSelection('file')
    runtime.toggleFavoriteDirectorySelection('/directory.txt')

    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.directory.selection.clear')
    expect(runtime.snapshot().selectedFavoriteDirectoryPaths).toEqual([])
    expect(runtime.snapshot().selectedFavoriteIds).toEqual(['file'])
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.selection.clear')
    expect(runtime.snapshot().selectedFavoriteIds).toEqual([])
  })

  it('does not apply favorite metadata actions to hidden selections from the directory pane', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [{ id: 'file', kind: 'file', path: '/file.txt', name: 'File', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    runtime.toggleFavoriteSelection('file')
    runtime.focusFavoriteDirectory('/directory.txt')

    const directoryContext = { textInputFocused: false, activeInputRole: 'favorite-directory' as const }
    expect(runtime.handleShortcut('Ctrl+Delete', directoryContext)).toBeNull()
    expect(runtime.handleShortcut('F2', directoryContext)).toBeNull()
    expect(runtime.handleShortcut('Shift+F2', directoryContext)).toBeNull()
    expect(runtime.dispatch('favorites.remove.force').handled).toBe(false)
    expect(runtime.snapshot().state.favorites.map((item) => item.id)).toEqual(['file'])
    expect(runtime.snapshot().favoriteDraft).toBeNull()
  })

  it('moves the current visible favorite selection as one Ctrl+F2 batch', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [
      { id: 'group', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'one', kind: 'file', path: '/one.txt', name: 'One', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 },
      { id: 'two', kind: 'file', path: '/two.txt', name: 'Two', parentId: null, tags: [], color: '#F2994A', sortOrder: 3, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)
    runtime.toggleFavoriteSelection('one')
    runtime.toggleFavoriteSelection('two')

    expect(runtime.handleShortcut('Ctrl+F2', { textInputFocused: false, activeInputRole: 'favorite-items' })).toBe('favorites.group.moveParent')
    expect(runtime.snapshot().favoriteDraft?.targetIds).toEqual(['one', 'two'])
    runtime.updateFavoriteDraft({ parentId: 'group' })
    expect(runtime.dispatch('favorites.save').handled).toBe(true)
    expect(runtime.snapshot().state.favorites.filter((item) => item.id === 'one' || item.id === 'two').map((item) => item.parentId)).toEqual(['group', 'group'])
  })

  it('ignores an in-flight directory response after entering quick mode', async () => {
    let resolveDirectory!: (value: { ok: true; entries: Array<{ kind: 'file'; name: string; path: string }> }) => void
    const { state } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async () => new Promise((resolve) => { resolveDirectory = resolve })
      }
    })
    enableFavorites(state)
    state.favorites = [{ id: 'folder', kind: 'folder', path: '/work', name: 'Work', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    runtime.focusFavoriteGroup('folder')
    runtime.dispatch('favorites.group.apply')
    expect(runtime.snapshot().favoriteDirectoryLoading).toBe(true)

    runtime.setFavoriteQuickMode(true)
    resolveDirectory({ ok: true, entries: [{ kind: 'file', name: 'late.txt', path: '/work/late.txt' }] })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().favoriteDirectoryEntries).toEqual([])
    expect(runtime.snapshot().favoriteDirectoryLoading).toBe(false)
  })

  it('rejects editing a favorite into an equivalent existing path', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [
      { id: 'one', kind: 'folder', path: 'C:\\Work\\Demo', name: 'One', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'two', kind: 'folder', path: 'C:\\Other', name: 'Two', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavorite('two')
    runtime.dispatch('favorites.edit')
    runtime.updateFavoriteDraft({ path: 'c:/work/demo/' })

    expect(runtime.dispatch('favorites.save').handled).toBe(false)
    expect(runtime.snapshot().message).toBe('已有等价路径的同类型收藏')
    expect(runtime.snapshot().state.favorites.find((item) => item.id === 'two')?.path).toBe('C:\\Other')
  })

  it('retargets an open drawer to current focus and never falls back from invalid explicit targets', async () => {
    const opened: string[] = []
    const { state } = installPlatform({
      files: {
        capabilities: { open: true, reveal: true, copyPath: true, copyItems: false, pickFiles: false, pickFolders: false, listDirectory: true, inspectPaths: false },
        open: async (path: string) => { opened.push(path); return { outcome: 'success' as const } },
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async () => ({ ok: true, entries: [{ kind: 'file' as const, name: 'child.txt', path: '/folder/child.txt' }] })
      }
    })
    enableFavorites(state)
    state.favorites = [
      { id: 'one', kind: 'file', path: '/one.txt', name: 'One', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'two', kind: 'file', path: '/two.txt', name: 'Two', parentId: null, tags: [], color: '#F2994A', sortOrder: 2, createdAt: 2, updatedAt: 2 },
      { id: 'folder', kind: 'folder', path: '/folder', name: 'Folder', parentId: null, tags: [], color: '#2F80ED', sortOrder: 3, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavorite('one')
    runtime.dispatch('favorites.drawer.open')
    runtime.focusFavorite('two')
    runtime.dispatch('favorites.open')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/two.txt'])

    runtime.dispatch('favorites.open', { favoriteId: 'missing' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/two.txt'])
    expect(runtime.snapshot().message).toBe('没有选中的文件或文件夹')

    runtime.dispatch('favorites.drawer.close')
    runtime.focusFavoriteGroup('folder')
    runtime.dispatch('favorites.group.apply')
    await new Promise((resolve) => setTimeout(resolve, 0))
    runtime.focusFavoriteDirectory('/folder/child.txt')
    runtime.dispatch('favorites.drawer.open')
    runtime.focusFavorite('two')
    runtime.dispatch('favorites.open')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/two.txt', '/two.txt'])
    expect(runtime.snapshot().favoriteDrawerItems.map((item) => item.commandId)).toContain('favorites.copyItems')

    runtime.dispatch('favorites.directory.open', { directoryPaths: ['/folder/missing.txt'] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/two.txt', '/two.txt'])
    expect(runtime.snapshot().message).toBe('没有选中的实际目录项')
  })

  it('preserves host directory display paths while comparing equivalent identities', async () => {
    const { state } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async () => ({ ok: true, entries: [{ kind: 'folder' as const, name: 'Child', path: '/folder/Child/' }] })
      }
    })
    enableFavorites(state)
    state.favorites = [{ id: 'folder', kind: 'folder', path: '/folder', name: 'Folder', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    runtime.focusFavoriteGroup('folder')
    runtime.dispatch('favorites.group.apply')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().favoriteDirectoryEntries[0].path).toBe('/folder/Child/')
    runtime.focusFavoriteDirectory('/folder/Child')
    runtime.toggleFavoriteDirectorySelection('/folder/Child')
    expect(runtime.snapshot().focusedFavoriteDirectoryPath).toBe('/folder/Child/')
    expect(runtime.snapshot().selectedFavoriteDirectoryPaths).toEqual(['/folder/Child/'])
    expect(runtime.snapshot().focusedFavoriteGroupId).toBeNull()
  })

  it('turns inspection rejection into an explicit unknown state instead of perpetual loading', async () => {
    const { state } = installPlatform({
      files: {
        capabilities: { open: true, reveal: true, copyPath: true, copyItems: false, pickFiles: false, pickFolders: false, listDirectory: false, inspectPaths: true },
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        inspectPaths: async () => { throw new Error('inspection unavailable') },
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    enableFavorites(state)
    state.favorites = [{ id: 'file', kind: 'file', path: '/file.txt', name: 'File', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(Object.values(runtime.snapshot().favoritePathInspections)).toEqual([
      expect.objectContaining({ path: '/file.txt', status: 'unknown', errorCode: 'io-error', error: 'inspection unavailable' })
    ])
  })

  it('clears the main and container searches as separate Escape steps', () => {
    const { state } = installPlatform()
    enableFavorites(state)
    state.favorites = [{ id: 'group', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    runtime.setFavoriteSearch('File')
    runtime.setFavoriteGroupSearch('Group')

    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.search.clear')
    expect(runtime.snapshot().state.favoriteSearch).toBe('')
    expect(runtime.snapshot().favoriteGroupSearch).toBe('Group')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.groupSearch.clear')
    expect(runtime.snapshot().favoriteGroupSearch).toBe('')
  })

  it('ignores folder A responses after switching to B and clears a filtered-out container', async () => {
    const pending = new Map<string, (value: { ok: true; entries: Array<{ kind: 'file'; name: string; path: string }> }) => void>()
    const { state } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async (target: string) => new Promise((resolve) => pending.set(target, resolve))
      }
    })
    enableFavorites(state)
    state.favorites = [
      { id: 'a', kind: 'folder', path: '/alpha', name: 'Alpha', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'b', kind: 'folder', path: '/beta', name: 'Beta', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavoriteGroup('a')
    runtime.dispatch('favorites.group.apply')
    runtime.focusFavoriteGroup('b')
    runtime.dispatch('favorites.group.apply')

    pending.get('/alpha')?.({ ok: true, entries: [{ kind: 'file', name: 'old.txt', path: '/alpha/old.txt' }] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().selectedFavoriteGroupId).toBe('b')
    expect(runtime.snapshot().favoriteDirectoryEntries).toEqual([])
    expect(runtime.snapshot().favoriteDirectoryLoading).toBe(true)

    pending.get('/beta')?.({ ok: true, entries: [{ kind: 'file', name: 'new.txt', path: '/beta/new.txt' }] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.snapshot().favoriteDirectoryEntries.map((item) => item.path)).toEqual(['/beta/new.txt'])

    runtime.setFavoriteGroupSearch('Alpha')
    expect(runtime.snapshot().selectedFavoriteGroupId).toBeNull()
    expect(runtime.snapshot().favoriteDirectoryEntries).toEqual([])
    expect(runtime.snapshot().selectedFavoriteDirectoryPaths).toEqual([])
  })

  it('applies the complete favorites Escape recovery order through quick hide', async () => {
    const { state, getHideCount } = installPlatform({
      files: {
        open: async () => ({ outcome: 'success' as const }),
        reveal: async () => ({ outcome: 'success' as const }),
        copyPath: async () => ({ outcome: 'success' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [{ kind: 'file' as const, path: '/picked.txt', name: 'Picked', parentId: null, tags: [], color: '#F2994A' }],
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    enableFavorites(state)
    state.favorites = [
      { id: 'group', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'file', kind: 'file', path: '/file.txt', name: 'File', parentId: 'group', tags: [], color: '#F2994A', sortOrder: 1, createdAt: 2, updatedAt: 2 }
    ]
    const runtime = createAppRuntime(state)
    runtime.focusFavorite('file')
    runtime.dispatch('favorites.edit')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.cancel')

    runtime.dispatch('favorites.pick.files')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.pickReview.cancel')

    runtime.focusFavorite('file')
    runtime.dispatch('favorites.drawer.open')
    runtime.toggleFavoriteDirectorySelection('/directory.txt')
    runtime.toggleFavoriteSelection('file')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.drawer.close')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.directory.selection.clear')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.selection.clear')

    runtime.focusFavoriteGroup('group')
    runtime.dispatch('favorites.group.apply')
    runtime.setFavoriteSearch('File')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.search.clear')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.group.clear')
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.focus.clear')

    runtime.setFavoriteQuickMode(true)
    expect(runtime.handleShortcut('Escape', false)).toBe('favorites.focus.clear')
    expect(runtime.handleShortcut('Escape', false)).toBe('app.hide')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getHideCount()).toBe(1)
  })

  it('does not hide quick mode or mark usage when a structured open result fails', async () => {
    const { state, getHideCount } = installPlatform({
      files: {
        open: async () => ({ outcome: 'failed' as const, errorCode: 'not-found' as const }),
        reveal: async () => ({ outcome: 'failed' as const, errorCode: 'not-found' as const }),
        copyPath: async () => ({ outcome: 'failed' as const, errorCode: 'unsupported' as const }),
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async () => ({ ok: false, entries: [] })
      }
    })
    enableFavorites(state)
    state.favorites = [{ id: 'file', kind: 'file', path: '/missing.txt', name: 'Missing', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)
    runtime.setFavoriteQuickMode(true)
    runtime.dispatch('favorites.open')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getHideCount()).toBe(0)
    expect(runtime.snapshot().state.favorites[0].usageCount).toBeUndefined()
    expect(runtime.snapshot().state.favoriteSearchAffinities).toEqual([])
    expect(runtime.snapshot().message).toContain('路径不存在')
  })

  it('requires an explicit candidate selection before activating duplicate window titles from a stable slot', async () => {
    const activated: string[] = []
    const { state, getHideCount, getShowCount } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [
            { id: 'darwin:91:1:11', instanceId: 'darwin:91:1:11', platform: 'darwin', nativeRef: '91:1:11', appId: 'com.browser', appName: 'Browser', pid: 91, title: 'Docs', minimized: false, focused: false },
            { id: 'darwin:91:2:12', instanceId: 'darwin:91:2:12', platform: 'darwin', nativeRef: '91:2:12', appId: 'com.browser', appName: 'Browser', pid: 91, title: 'Docs', minimized: false, focused: false }
          ]
        }),
        activate: async (request) => { activated.push(activationLandingWindow(request).nativeRef); return { outcome: 'activated' as const } }
      }
    })
    enableWindows(state)
    state.activeTab = 'ports'
    state.windowTargets = [{ id: 'work-browser', alias: '工作浏览器', scope: 'instance', platform: 'darwin', appId: 'com.browser', appName: 'Browser', lastKnownTitle: 'Docs', lastInstanceId: null, lastNativeRef: null, groupKey: null, lastActiveInstanceId: null, alternateAliases: ['旧浏览器'], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
    state.windowSlots[0].targetIdByPlatform.darwin = 'work-browser'
    const runtime = createAppRuntime(state)

    runtime.dispatch('windows.slot.activate', { slot: 1 })
    await flushWindowActions()

    expect(runtime.snapshot().state.activeTab).toBe('windows')
    expect(runtime.snapshot().windowRebind).toMatchObject({ phase: 'confirming', targetId: 'work-browser' })
    expect(getShowCount()).toBeGreaterThan(0)
    expect(activated).toEqual([])
    runtime.focusWindow('candidate:darwin:91:2:12')
    runtime.dispatch('windows.activate')
    await flushWindowActions()

    expect(activated).toEqual(['91:2:12'])
    const recovered = runtime.snapshot().state.windowTargets.find((target) => target.id !== 'work-browser')
    expect(runtime.snapshot().state.windowTargets.find((target) => target.id === 'work-browser')).toMatchObject({
      alias: '工作浏览器',
      lastNativeRef: null,
      alternateAliases: ['旧浏览器'],
      favorite: true
    })
    expect(recovered).toMatchObject({ lastNativeRef: '91:2:12', lastKnownTitle: 'Docs', favorite: false, alternateAliases: [] })
    expect(getHideCount()).toBe(1)

    runtime.focusWindow(`target:${recovered?.id}`)
    runtime.dispatch('windows.rename')
    runtime.updateWindowDraft({ alias: '文档浏览器' })
    runtime.dispatch('windows.editor.save')

    expect(runtime.snapshot().state.windowTargets.find((target) => target.id === recovered?.id)?.alias).toBe('文档浏览器')
    expect(runtime.snapshot().state.windowTargets.find((target) => target.id === 'work-browser')?.alternateAliases).toEqual(['旧浏览器'])
    expect(runtime.snapshot().state.windowSlots[0].targetIdByPlatform.darwin).toBe(recovered?.id)
  })

  it('switches a stable root to its current child and opens an explicit child exactly', async () => {
    const activations: Array<{ mode: WindowActivationRequest['mode']; root: string; member: string | null }> = []
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [
            { id: 'root', instanceId: 'darwin:9:100', relationship: 'root' as const, relationEvidence: 'root-self' as const, rootInstanceId: 'darwin:9:100', platform: 'darwin' as const, nativeRef: '9:0:100', rootNativeRef: '9:0:100', rootPid: 9, appId: 'com.browser', appName: 'Browser', pid: 9, title: 'Browser Main', minimized: false, focused: false },
            { id: 'member-a', instanceId: 'darwin:9:201', relationship: 'child' as const, relationEvidence: 'macos-ax-top-level' as const, rootInstanceId: 'darwin:9:100', platform: 'darwin' as const, nativeRef: '9:0:201', rootNativeRef: '9:0:100', rootPid: 9, appId: 'com.browser', appName: 'Browser', pid: 9, title: 'Tab A', minimized: false, focused: false },
            { id: 'member-b', instanceId: 'darwin:9:202', relationship: 'child' as const, relationEvidence: 'macos-ax-top-level' as const, rootInstanceId: 'darwin:9:100', platform: 'darwin' as const, nativeRef: '9:0:202', rootNativeRef: '9:0:100', rootPid: 9, appId: 'com.browser', appName: 'Browser', pid: 9, title: 'Tab B', minimized: false, focused: true }
          ]
        }),
        activate: async (request) => {
          activations.push({
            mode: request.mode,
            root: request.root.instanceId,
            member: request.mode === 'member-exact' ? request.member.instanceId : null
          })
          return { outcome: 'activated' as const }
        }
      }
    })
    enableWindows(state)
    state.windowTargets = [{
      id: 'browser-root', alias: '工作浏览器', scope: 'instance', platform: 'darwin', appId: 'com.browser', appName: 'Browser',
      lastKnownTitle: 'Tab A', lastInstanceId: 'darwin:9:201', lastNativeRef: '9:0:201', groupKey: null,
      lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1
    }]
    state.windowSlots[0].targetIdByPlatform.darwin = 'browser-root'
    const runtime = createAppRuntime(state)
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    expect(runtime.snapshot().windowRows).toMatchObject([{
      id: 'target:browser-root',
      title: 'Browser Main',
      kind: 'window',
      treeLevel: 1,
      expandable: true,
      childCount: 2
    }])
    expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastInstanceId: 'darwin:9:100', lastNativeRef: '9:0:100' })
    runtime.dispatch('windows.slot.activate', { slot: 1 })
    await flushWindowActions()
    expect(activations).toEqual([{ mode: 'root-current', root: 'darwin:9:100', member: null }])

    runtime.dispatch('windows.tree.toggle', { rowId: 'target:browser-root', expanded: true })
    const child = runtime.snapshot().windowRows.find((row) => row.kind === 'child-window' && row.title === 'Tab A')
    expect(child).toMatchObject({ treeLevel: 2, parentRowId: 'target:browser-root', favorite: false, pinned: false, slotNumbers: [] })
    runtime.focusWindow(child!.id)
    runtime.dispatch('windows.activate')
    await flushWindowActions()

    expect(activations).toEqual([
      { mode: 'root-current', root: 'darwin:9:100', member: null },
      { mode: 'member-exact', root: 'darwin:9:100', member: 'darwin:9:201' }
    ])
  })

  it('does not fall back to a root or sibling after the requested child disappears', async () => {
    let listCount = 0
    const activations: WindowActivationRequest[] = []
    const root = { id: 'root', instanceId: 'darwin:9:100', relationship: 'root' as const, relationEvidence: 'root-self' as const, rootInstanceId: 'darwin:9:100', platform: 'darwin' as const, nativeRef: '9:0:100', rootNativeRef: '9:0:100', rootPid: 9, appId: 'com.browser', appName: 'Browser', pid: 9, title: 'Browser Main', minimized: false, focused: false }
    const child = { id: 'child', instanceId: 'darwin:9:201', relationship: 'child' as const, relationEvidence: 'macos-ax-top-level' as const, rootInstanceId: 'darwin:9:100', platform: 'darwin' as const, nativeRef: '9:0:201', rootNativeRef: '9:0:100', rootPid: 9, appId: 'com.browser', appName: 'Browser', pid: 9, title: 'Tab A', minimized: false, focused: true }
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => {
          listCount += 1
          return {
            capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
            completeness: 'complete' as const,
            windows: listCount === 1 ? [root, child] : [root]
          }
        },
        activate: async (request) => {
          activations.push(request)
          return request.mode === 'member-exact'
            ? { outcome: 'not-found' as const, reasonCode: 'member-mismatch' as const }
            : { outcome: 'activated' as const }
        }
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    const rootRow = runtime.snapshot().windowRows.find((row) => row.kind === 'window')!
    runtime.dispatch('windows.tree.toggle', { rowId: rootRow.id, expanded: true })
    const childRow = runtime.snapshot().windowRows.find((row) => row.kind === 'child-window')!
    runtime.focusWindow(childRow.id)
    runtime.dispatch('windows.activate')
    await flushWindowActions()

    expect(activations).toHaveLength(1)
    expect(activations[0]).toMatchObject({ mode: 'member-exact', root: { instanceId: 'darwin:9:100' }, member: { instanceId: 'darwin:9:201' } })
    expect(runtime.snapshot().message).toContain('指定子窗口已失效')
    expect(runtime.snapshot().focusedWindowId).toBe(rootRow.id)
  })

  it('keeps Finder roots under one virtual parent, excludes the parent from selection, and activates the focused child first', async () => {
    const activated: string[] = []
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [
            { id: 'finder-a', instanceId: 'darwin:20:100', platform: 'darwin', nativeRef: '20:0:100', appId: 'com.apple.finder', appName: 'Finder', pid: 20, title: 'Downloads', minimized: false, focused: false },
            { id: 'finder-b', instanceId: 'darwin:21:101', platform: 'darwin', nativeRef: '21:0:101', appId: 'com.apple.finder', appName: 'Finder', pid: 21, title: 'Projects', minimized: false, focused: true }
          ]
        }),
        activate: async (request) => { activated.push(activationLandingWindow(request).instanceId); return { outcome: 'activated' as const } }
      }
    })
    enableWindows(state)
    state.windowTargets = [{
      id: 'finder-group', alias: '文件管理', scope: 'file-manager-group', platform: 'darwin', appId: 'com.apple.finder', appName: 'Finder',
      lastKnownTitle: 'Downloads', lastInstanceId: null, lastNativeRef: null, groupKey: 'file-manager:darwin:com.apple.finder',
      lastActiveInstanceId: 'darwin:20:100', alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1
    }]
    const runtime = createAppRuntime(state)
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    const parent = runtime.snapshot().windowRows[0]
    expect(parent).toMatchObject({ kind: 'file-manager-group', treeLevel: 1, childCount: 2, expanded: false })
    runtime.setWindowSearch('Projects')
    runtime.focusWindow('live:darwin:21:101')
    runtime.setWindowSearch('')
    expect(runtime.snapshot().focusedWindowId).toBe(parent.id)

    runtime.setWindowSearch('Projects')
    runtime.dispatch('windows.actions.open', { rowId: parent.id })
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'window-search' })).toBe('windows.actions.close')
    expect(runtime.snapshot().state.windowSearch).toBe('Projects')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'window-search' })).toBe('windows.search.clear')
    runtime.focusWindow(parent.id)
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedWindowIds).toEqual([])
    expect(runtime.handleShortcut('ArrowRight', false)).toBe('windows.tree.expand')
    expect(runtime.snapshot().windowRows.map((row) => row.treeLevel)).toEqual([1, 2, 2])

    runtime.dispatch('windows.activate', { rowId: parent.id })
    await flushWindowActions()
    expect(activated).toEqual(['darwin:21:101'])
    expect(runtime.snapshot().state.windowTargets[0].lastActiveInstanceId).toBe('darwin:21:101')
    runtime.dispatch('windows.activate', { rowId: 'live:darwin:20:100' })
    await flushWindowActions()
    expect(activated).toEqual(['darwin:21:101', 'darwin:20:100'])
    expect(runtime.snapshot().state.windowTargets[0].lastActiveInstanceId).toBe('darwin:20:100')
  })

  it('keeps an empty file-manager parent and never launches or substitutes a window', async () => {
    let activateCount = 0
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [],
          completeness: 'complete'
        }),
        activate: async () => { activateCount += 1; return { outcome: 'activated' as const } }
      }
    })
    enableWindows(state)
    state.windowTargets = [{
      id: 'finder-group', alias: '文件管理', scope: 'file-manager-group', platform: 'darwin', appId: 'com.apple.finder', appName: 'Finder',
      lastKnownTitle: 'Downloads', lastInstanceId: null, lastNativeRef: null, groupKey: 'file-manager:darwin:com.apple.finder',
      lastActiveInstanceId: 'darwin:20:100', alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1
    }]
    const runtime = createAppRuntime(state)
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    expect(runtime.snapshot().windowRows).toMatchObject([{ kind: 'file-manager-group', unavailable: true, childCount: 0 }])
    runtime.dispatch('windows.activate', { rowId: 'group:file-manager:darwin:com.apple.finder' })
    await flushWindowActions()
    expect(activateCount).toBe(0)
    expect(runtime.snapshot().state.windowTargets[0].id).toBe('finder-group')
    expect(runtime.snapshot().message).toContain('不会自动启动 Finder/Explorer')
  })

  it('does not auto-load windows on tab entry and reuses the session cache for a second slot jump', async () => {
    let listCount = 0
    const { state, getHideCount } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => {
          listCount += 1
          return {
            capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
            windows: [{ id: 'darwin:7:1:1', instanceId: 'darwin:7:1:1', platform: 'darwin', nativeRef: '7:1:1', appId: 'com.notes', appName: 'Notes', pid: 7, title: 'Inbox', minimized: false, focused: false }]
          }
        },
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    state.windowTargets = [{ id: 'notes', alias: '笔记', scope: 'instance', platform: 'darwin', appId: 'com.notes', appName: 'Notes', lastKnownTitle: 'Inbox', lastInstanceId: null, lastNativeRef: '7:1:1', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
    state.windowSlots[0].targetIdByPlatform.darwin = 'notes'
    const runtime = createAppRuntime(state)

    runtime.setTab('windows')
    await flushWindowActions()
    expect(listCount).toBe(0)
    expect(runtime.snapshot().windowListLoaded).toBe(false)

    runtime.dispatch('windows.refresh')
    await flushWindowActions()
    expect(listCount).toBe(1)
    expect(runtime.snapshot().windowListLoaded).toBe(true)

    runtime.dispatch('windows.slot.activate', { slot: 1 })
    await flushWindowActions()
    expect(listCount).toBe(1)
    expect(getHideCount()).toBeGreaterThanOrEqual(1)

    runtime.dispatch('windows.slot.activate', { slot: 1 })
    await flushWindowActions()
    expect(listCount).toBe(1)
    expect(getHideCount()).toBeGreaterThanOrEqual(2)
  })

  it('activates a stable slot from the uTools-persisted nativeRef without listing windows', async () => {
    let listCount = 0
    const activated: string[] = []
    const { state, getHideCount } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => {
          listCount += 1
          return {
            capability: { platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true },
            windows: []
          }
        },
        activate: async (request) => {
          activated.push(activationLandingWindow(request).nativeRef)
          return { outcome: 'activated' as const }
        }
      }
    })
    enableWindows(state)
    state.activeTab = 'ports'
    state.windowTargets = [{ id: 'docs', alias: '文档', scope: 'instance', platform: 'win32', appId: 'browser.exe', appName: 'Browser', lastKnownTitle: 'Docs', lastInstanceId: null, lastNativeRef: '424242', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
    state.windowSlots[0].targetIdByPlatform.win32 = 'docs'
    const runtime = createAppRuntime(state)

    runtime.dispatch('windows.slot.activate', { slot: 1 })
    await flushWindowActions()

    expect(listCount).toBe(0)
    expect(activated).toEqual(['424242'])
    expect(getHideCount()).toBeGreaterThan(0)
    expect(runtime.snapshot().state.activeTab).toBe('ports')
  })

  it('keeps slot-bound non-favorite targets visible and opens the workbench after an exact probe confirms closure', async () => {
    let listCount = 0
    const { state, getShowCount } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => {
          listCount += 1
          return {
            capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
            windows: []
          }
        },
        probeInstance: async (window) => ({ status: 'gone' as const, instanceId: window.instanceId, liveness: 'verified-gone' as const, reason: 'native-window-absent' as const }),
        activate: async () => ({ outcome: 'not-found' as const })
      }
    })
    enableWindows(state)
    state.activeTab = 'ports'
    state.windowTargets = [{ id: 'pinned', alias: '固定编辑器', scope: 'instance', platform: 'darwin', appId: 'com.editor', appName: 'Editor', lastKnownTitle: 'Main', lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: false, pinned: false, createdAt: 1, updatedAt: 1 }]
    state.windowSlots[2].targetIdByPlatform.darwin = 'pinned'
    const runtime = createAppRuntime(state)

    runtime.setTab('windows')
    expect(runtime.snapshot().windowRows.some((row) => row.id === 'target:pinned')).toBe(true)

    runtime.dispatch('windows.slot.activate', { slot: 3 })
    await flushWindowActions()

    expect(listCount).toBe(1)
    expect(runtime.snapshot().state.activeTab).toBe('windows')
    expect(runtime.snapshot().focusedWindowId).toBe('target:pinned')
    expect(runtime.snapshot().message).toBe('已确认目标窗口已关闭，已清除陈旧引用。')
    expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(
      expect.objectContaining({ entry: 'slot', slot: 3, code: 'target-closed', level: 'accepted' })
    )
    expect(getShowCount()).toBeGreaterThan(0)
  })

  it('retargets the open window action panel when another row is focused', async () => {
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [
            { id: 'darwin:1:1:1', instanceId: 'darwin:1:1:1', platform: 'darwin', nativeRef: '1:1:1', appId: 'com.a', appName: 'Alpha', pid: 1, title: 'One', minimized: false, focused: false },
            { id: 'darwin:2:1:1', instanceId: 'darwin:2:1:1', platform: 'darwin', nativeRef: '2:1:1', appId: 'com.b', appName: 'Beta', pid: 2, title: 'Two', minimized: false, focused: false }
          ]
        }),
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)
    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    runtime.focusWindow('live:darwin:1:1:1')
    expect(runtime.dispatch('windows.actions.open').handled).toBe(true)
    expect(runtime.snapshot().windowActionTarget?.id).toBe('live:darwin:1:1:1')

    runtime.focusWindow('live:darwin:2:1:1')
    expect(runtime.snapshot().windowActionsOpen).toBe(true)
    expect(runtime.snapshot().focusedWindowId).toBe('live:darwin:2:1:1')
    expect(runtime.snapshot().windowActionTarget?.id).toBe('live:darwin:2:1:1')

    const beforeListFocus = runtime.snapshot().windowFocusRequestId
    const beforeActionsFocus = runtime.snapshot().windowActionsFocusRequestId
    expect(runtime.handleShortcut('ArrowUp', { textInputFocused: false, activeInputRole: 'window-actions' })).toBe('windows.list.up')
    expect(runtime.snapshot().focusedWindowId).toBe('live:darwin:1:1:1')
    expect(runtime.snapshot().windowActionTarget?.id).toBe('live:darwin:1:1:1')
    expect(runtime.snapshot().windowFocusRequestId).toBeGreaterThan(beforeListFocus)
    expect(runtime.snapshot().windowActionsFocusRequestId).toBe(beforeActionsFocus)
  })

  it('sorts by application and persists an independent pinned-first state', async () => {
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [
            { id: 'darwin:2:1:1', instanceId: 'darwin:2:1:1', platform: 'darwin', nativeRef: '2:1:1', appId: 'com.beta', appName: 'Beta', pid: 2, title: 'Two', minimized: false, focused: false },
            { id: 'darwin:1:1:1', instanceId: 'darwin:1:1:1', platform: 'darwin', nativeRef: '1:1:1', appId: 'com.alpha', appName: 'Alpha', pid: 1, title: 'One', minimized: false, focused: false }
          ]
        }),
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)
    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    expect(runtime.snapshot().windowRows.map((row) => row.appName)).toEqual(['Alpha', 'Beta'])
    runtime.focusWindow('live:darwin:2:1:1')
    expect(runtime.dispatch('windows.actions.open').handled).toBe(true)
    expect(runtime.dispatch('windows.pin.toggle').handled).toBe(true)

    const pinned = runtime.snapshot().windowRows[0]
    expect(pinned).toMatchObject({ appName: 'Beta', pinned: true, favorite: false })
    expect(runtime.snapshot().windowActionsOpen).toBe(true)
    expect(runtime.snapshot().windowActionTarget).toMatchObject({ id: pinned.id, pinned: true })
    expect(runtime.snapshot().state.windowTargets).toHaveLength(1)
    expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ appName: 'Beta', pinned: true, favorite: false })

    expect(runtime.dispatch('windows.pin.toggle').handled).toBe(true)
    expect(runtime.snapshot().windowRows.map((row) => row.appName)).toEqual(['Alpha', 'Beta'])
    expect(runtime.snapshot().windowActionsOpen).toBe(true)
    expect(runtime.snapshot().windowActionTarget).toMatchObject({ id: 'live:darwin:2:1:1', pinned: false })
    expect(runtime.snapshot().state.windowTargets).toEqual([])
  })

  it('keeps favorite retention when a pinned window is unpinned', async () => {
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [{ id: 'darwin:3:1:1', instanceId: 'darwin:3:1:1', platform: 'darwin', nativeRef: '3:1:1', appId: 'com.notes', appName: 'Notes', pid: 3, title: 'Inbox', minimized: false, focused: false }]
        }),
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)
    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    runtime.dispatch('windows.favorite.toggle', { rowId: 'live:darwin:3:1:1' })
    const targetRow = runtime.snapshot().windowRows[0]
    runtime.dispatch('windows.pin.toggle', { rowId: targetRow.id })
    runtime.dispatch('windows.pin.toggle', { rowId: targetRow.id })

    expect(runtime.snapshot().state.windowTargets).toHaveLength(1)
    expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ favorite: true, pinned: false })
    expect(runtime.snapshot().windowRows[0]).toMatchObject({ favorite: true, pinned: false })

    runtime.dispatch('windows.favorite.toggle', { rowId: targetRow.id })
    expect(runtime.snapshot().state.windowTargets).toEqual([])
    expect(runtime.snapshot().windowRows[0]).toMatchObject({ id: 'live:darwin:3:1:1', favorite: false, pinned: false })
  })

  it('does not deduplicate a stale target by pid or application when the native instance differs', async () => {
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [{
            id: 'darwin:7:0:222',
            instanceId: 'darwin:7:0:222',
            platform: 'darwin',
            nativeRef: '7:0:222',
            appId: 'com.example',
            appName: 'Example',
            pid: 7,
            title: 'New Title',
            minimized: false,
            focused: false
          }]
        }),
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    state.windowTargets = [{
      id: 't1',
      alias: 'Example Win',
      scope: 'instance',
      platform: 'darwin',
      appId: 'com.example',
      appName: 'Example',
      lastKnownTitle: 'Old Title',
      lastInstanceId: null,
      lastNativeRef: '7:0:111',
      groupKey: null,
      lastActiveInstanceId: null,
      alternateAliases: [],
      favorite: true,
      pinned: false,
      createdAt: 1,
      updatedAt: 1
    }]
    const runtime = createAppRuntime(state)
    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    const rows = runtime.snapshot().windowRows
    expect(rows).toEqual([
      expect.objectContaining({ id: 'target:t1', unavailable: true, title: 'Old Title' }),
      expect.objectContaining({ id: 'live:darwin:7:0:222', unavailable: false, title: 'New Title' })
    ])
  })

  it('keeps darwin minimized live windows because off-Space CG windows are also reported offscreen', async () => {
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [{
            id: 'darwin:9:0:33',
            instanceId: 'darwin:9:0:33',
            platform: 'darwin',
            nativeRef: '9:0:33',
            appId: 'com.notes',
            appName: 'Notes',
            pid: 9,
            title: 'Inbox',
            minimized: true,
            focused: false
          }]
        }),
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)
    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    expect(runtime.snapshot().windowRows).toEqual([
      expect.objectContaining({ id: 'live:darwin:9:0:33', cached: false, live: expect.objectContaining({ minimized: true }) })
    ])
  })

  it('retains windows missing from a partial refresh and marks only the retained rows as cached', async () => {
    let listCount = 0
    const first = { id: 'darwin:1:0:11', instanceId: 'darwin:1:0:11', platform: 'darwin' as const, nativeRef: '1:0:11', appId: 'com.a', appName: 'Alpha', pid: 1, title: 'One', minimized: false, focused: false }
    const second = { id: 'darwin:2:0:22', instanceId: 'darwin:2:0:22', platform: 'darwin' as const, nativeRef: '2:0:22', appId: 'com.b', appName: 'Beta', pid: 2, title: 'Two', minimized: false, focused: false }
    const capability = { platform: 'darwin' as const, supported: true, permission: 'granted' as const, canList: true, canActivate: true }
    const { state } = installPlatform({
      windows: {
        capabilities: async () => capability,
        list: async () => {
          listCount += 1
          return listCount === 1
            ? { capability, windows: [first, second], completeness: 'complete' as const }
            : { capability, windows: [first], completeness: 'partial' as const }
        },
        activate: async () => ({ outcome: 'activated' as const })
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)

    runtime.dispatch('windows.refresh')
    await flushWindowActions()
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    expect(runtime.snapshot().windowRows).toEqual([
      expect.objectContaining({ id: 'live:darwin:1:0:11', cached: false }),
      expect.objectContaining({ id: 'live:darwin:2:0:22', cached: true })
    ])
  })

  it('multi-selects windows with Space advance and closes via OS-then-confirm force path', async () => {
    const closed: string[] = []
    const terminated: string[] = []
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true, canClose: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'granted', canList: true, canActivate: true, canClose: true },
          windows: [
            { id: 'darwin:1:0:11', instanceId: 'darwin:1:0:11', platform: 'darwin', nativeRef: '1:0:11', appId: 'com.a', appName: 'Alpha', pid: 1, title: 'One', minimized: false, focused: false },
            { id: 'darwin:2:0:22', instanceId: 'darwin:2:0:22', platform: 'darwin', nativeRef: '2:0:22', appId: 'com.b', appName: 'Beta', pid: 2, title: 'Two', minimized: false, focused: false }
          ]
        }),
        activate: async () => ({ outcome: 'activated' as const }),
        close: async (window) => {
          closed.push(window.id)
          return { outcome: 'close-denied' as const }
        },
        terminate: async (window) => {
          terminated.push(window.id)
          return { outcome: 'terminated' as const }
        }
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)
    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    runtime.focusWindow('live:darwin:1:0:11')
    expect(runtime.handleShortcut('Space', { textInputFocused: false })).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedWindowIds).toEqual(['live:darwin:1:0:11'])
    expect(runtime.snapshot().focusedWindowId).toBe('live:darwin:2:0:22')

    expect(runtime.handleShortcut('Space', { textInputFocused: false })).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedWindowIds.sort()).toEqual(['live:darwin:1:0:11', 'live:darwin:2:0:22'].sort())

    expect(runtime.dispatch('windows.actions.open').handled).toBe(true)
    expect(runtime.snapshot().windowActionsMode).toBe('multi')
    expect(runtime.snapshot().windowActionTargets.length).toBe(2)

    expect(runtime.handleShortcut('Ctrl+Delete', { textInputFocused: false })).toBe('windows.close')
    await flushWindowActions()
    expect(closed.length).toBe(2)
    expect(runtime.snapshot().confirm?.title).toContain('强制关闭')
    runtime.confirmNow()
    await flushWindowActions()
    expect(terminated.length).toBe(2)
  })

  it('does not hide the plugin when Windows foreground protection rejects activation', async () => {
    const { state, getHideCount } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'win32', supported: true, permission: 'granted', canList: true, canActivate: true },
          windows: [{ id: 'win32:123', instanceId: 'win32:123', platform: 'win32', nativeRef: '123', appId: 'browser.exe', appName: 'Browser', pid: 10, title: 'Docs', minimized: true, focused: false }]
        }),
        activate: async () => ({ outcome: 'focus-denied' as const, message: '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护' })
      }
    })
    enableWindows(state)
    state.windowTargets = [{ id: 'browser', alias: '浏览器', scope: 'instance', platform: 'win32', appId: 'browser.exe', appName: 'Browser', lastKnownTitle: 'Docs', lastInstanceId: null, lastNativeRef: '123', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
    const runtime = createAppRuntime(state)

    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()
    runtime.dispatch('windows.activate')
    await flushWindowActions()

    expect(getHideCount()).toBe(0)
    expect(runtime.snapshot().message).toContain('系统拒绝聚焦')
  })

  it('shows macOS authorization as an empty guarded state rather than a fabricated window list', async () => {
    const { state } = installPlatform({
      windows: {
        capabilities: async () => ({ platform: 'darwin', supported: true, permission: 'unknown', canList: true, canActivate: true }),
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'required', canList: false, canActivate: false, reason: '需要辅助功能与自动化权限' },
          windows: [],
          message: '需要在系统设置中允许 EyPc 控制 System Events'
        }),
        activate: async () => ({ outcome: 'permission-required' as const })
      }
    })
    enableWindows(state)
    const runtime = createAppRuntime(state)

    runtime.setTab('windows')
    runtime.dispatch('windows.refresh')
    await flushWindowActions()

    expect(runtime.snapshot().windowCapability).toMatchObject({ platform: 'darwin', permission: 'required', canList: false })
    expect(runtime.snapshot().windowRows).toEqual([])
    expect(runtime.snapshot().message).not.toContain('System Events')
  })

  describe('window activation diagnostics', () => {
    const darwinCapability = { platform: 'darwin' as const, bridgeRevision: WINDOW_BRIDGE_REVISION, supported: true, permission: 'granted' as const, canList: true, canActivate: true }

    function assignSlotTarget(state: ReturnType<typeof createInitialState>, lastNativeRef: string | null = 'old-ref') {
      state.windowTargets = [{
        id: 'diagnostic-target',
        alias: '诊断目标',
        scope: 'instance',
        platform: 'darwin',
        appId: 'com.example.target',
        appName: 'Example',
        lastKnownTitle: 'Target',
        lastInstanceId: null,
        lastNativeRef,
        groupKey: null,
        lastActiveInstanceId: null,
        alternateAliases: [],
        favorite: true,
        pinned: false,
        createdAt: 1,
        updatedAt: 1
      }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'diagnostic-target'
    }

    it('keeps successful slot activation free of blocking diagnostics', async () => {
      const { state, getHideCount } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({ outcome: 'activated' as const })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(getHideCount()).toBe(1)
      expect(runtime.snapshot().windowActivationDiagnostics.filter((diagnostic) => diagnostic.level === 'blocking')).toEqual([])
    })

    it('records a bounded sanitized development trace without persisting it into AppState', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({
            outcome: 'activated' as const,
            trace: {
              steps: [
                { stage: 'target' as const, outcome: 'ok' as const },
                { stage: 'restore' as const, outcome: 'skipped' as const },
                { stage: 'foreground' as const, outcome: 'ok' as const },
                { stage: 'verify' as const, outcome: 'ok' as const }
              ]
            }
          })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      const snapshot = runtime.snapshot()
      expect(snapshot.windowOperationTraceEnabled).toBe(true)
      expect(snapshot.windowOperationTraces).toEqual([
        expect.objectContaining({
          entry: 'slot',
          slot: 1,
          platform: 'darwin',
          operation: 'activate',
          result: 'success',
          code: 'activated',
          steps: expect.arrayContaining([
            expect.objectContaining({ stage: 'target', outcome: 'ok' }),
            expect.objectContaining({ stage: 'foreground', outcome: 'ok' })
          ])
        })
      ])
      const serializedTrace = JSON.stringify(snapshot.windowOperationTraces)
      expect(snapshot.windowOperationTraces[0].targetTitle).toBe('Target')
      expect(serializedTrace).not.toContain('Example')
      expect(serializedTrace).not.toContain('old-ref')
      expect(JSON.stringify(snapshot.state)).not.toContain('windowOperationTrace')

      expect(runtime.dispatch('windows.operation.traces.clear').handled).toBe(true)
      expect(runtime.snapshot().windowOperationTraces).toEqual([])
    })

    it('bounds development operation traces to fifty records and clears them independently', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({ outcome: 'activated' as const })
        }
      })
      enableWindows(state)
      const runtime = createAppRuntime(state)

      for (let index = 0; index < 51; index += 1) runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().windowOperationTraceEnabled).toBe(true)
      expect(runtime.snapshot().windowOperationTraces).toHaveLength(50)
      expect(runtime.snapshot().windowOperationTraces.every((record) => record.code === 'slot-unassigned')).toBe(true)
      expect(runtime.dispatch('windows.operation.traces.clear').handled).toBe(true)
      expect(runtime.snapshot().windowOperationTraces).toEqual([])
    })

    it('does not favorite a live window merely because it is assigned to a stable slot', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            windows: [{ id: 'darwin:slot-live', instanceId: 'darwin:slot-live', platform: 'darwin', nativeRef: 'slot-live', appId: 'com.example.slot', appName: 'Example', pid: 7, title: 'Slot target', minimized: false, focused: false }]
          }),
          activate: async () => ({ outcome: 'activated' as const })
        }
      })
      enableWindows(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.refresh')
      await flushWindowActions()
      expect(runtime.dispatch('windows.slot.assign', { slot: 4, rowId: 'live:darwin:slot-live' }).handled).toBe(true)

      expect(runtime.snapshot().state.windowTargets).toEqual([
        expect.objectContaining({ favorite: false, pinned: false, appName: 'Example' })
      ])
      const assignedTargetId = runtime.snapshot().state.windowSlots[3].targetIdByPlatform.darwin
      expect(assignedTargetId).toBe(runtime.snapshot().state.windowTargets[0].id)
      expect(runtime.snapshot().windowRows).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: `target:${assignedTargetId}`, favorite: false, slotNumbers: [4] })
      ]))
    })

    it('keeps the last known title read-only while editing the alias', () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({ outcome: 'activated' as const })
        }
      })
      enableWindows(state)
      state.activeTab = 'windows'
      assignSlotTarget(state, null)
      const runtime = createAppRuntime(state)

      runtime.focusWindow('target:diagnostic-target')
      expect(runtime.dispatch('windows.edit').handled).toBe(true)
      expect(runtime.snapshot().windowDraft).toMatchObject({ lastKnownTitle: 'Target', activeField: 'alias' })
      runtime.updateWindowDraft({ alias: 'Renamed target' })
      expect(runtime.dispatch('windows.editor.save').handled).toBe(true)

      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ alias: 'Renamed target', lastKnownTitle: 'Target' })
    })

    it('uses a separate Windows page-topmost call and treats unsupported topmost as blocking', async () => {
      const topmostCalls: string[] = []
      const win32Capability = { platform: 'win32' as const, bridgeRevision: WINDOW_BRIDGE_REVISION, supported: true, permission: 'granted' as const, canList: true, canActivate: true, canAlwaysOnTop: true }
      const { state, getHideCount } = installPlatform({
        windows: {
          capabilities: async () => win32Capability,
          list: async () => ({
            capability: win32Capability,
            windows: [{ id: 'win32:880', instanceId: 'win32:880', platform: 'win32', nativeRef: '880', appId: 'browser.exe', appName: 'Browser', pid: 88, title: 'Docs', minimized: true, focused: false }]
          }),
          activate: async () => ({ outcome: 'activated' as const }),
          alwaysOnTop: async (window) => {
            topmostCalls.push(window.nativeRef)
            return { outcome: 'activated' as const, trace: { steps: [{ stage: 'topmost' as const, outcome: 'ok' as const }, { stage: 'foreground' as const, outcome: 'ok' as const }] } }
          }
        }
      })
      enableWindows(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.refresh')
      await flushWindowActions()
      runtime.dispatch('windows.alwaysOnTop', { rowId: 'live:win32:880' })
      await flushWindowActions()

      expect(topmostCalls).toEqual(['880'])
      expect(getHideCount()).toBe(1)
      expect(runtime.snapshot().windowActivationDiagnostics.filter((diagnostic) => diagnostic.level === 'blocking')).toEqual([])
      expect(runtime.snapshot().windowOperationTraces[0]).toMatchObject({ operation: 'always-on-top', result: 'success', code: 'topmost-enabled' })

      const unsupported = installPlatform({
        windows: {
          capabilities: async () => ({ ...darwinCapability, canAlwaysOnTop: false }),
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({ outcome: 'activated' as const })
        }
      })
      enableWindows(unsupported.state)
      const unsupportedRuntime = createAppRuntime(unsupported.state)
      unsupportedRuntime.dispatch('windows.alwaysOnTop')
      await flushWindowActions()
      expect(unsupportedRuntime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'topmost-unsupported', level: 'blocking' }))
    })

    it('rescans a stale native reference once but requires explicit replacement confirmation', async () => {
      const activated: string[] = []
      let listCount = 0
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => {
            listCount += 1
            return {
              capability: darwinCapability,
              windows: [{ id: 'darwin:new-ref', instanceId: 'darwin:new-ref', platform: 'darwin', nativeRef: 'new-ref', appId: 'com.example.target', appName: 'Example', pid: 7, title: 'Target', minimized: false, focused: false }]
            }
          },
          activate: async (request) => {
            const window = activationLandingWindow(request)
            activated.push(window.nativeRef)
            return { outcome: window.nativeRef === 'old-ref' ? 'not-found' as const : 'activated' as const }
          }
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(activated).toEqual(['old-ref'])
      expect(listCount).toBe(1)
      expect(runtime.snapshot().state.windowTargets[0].lastNativeRef).toBe('old-ref')
      expect(runtime.snapshot().windowRebind).toMatchObject({ phase: 'confirming', targetId: 'diagnostic-target' })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'rebind-required', level: 'blocking' }))
    })

    it('rebinds only the originating slot after explicit confirmation and preserves the shared old target', async () => {
      const activated: string[] = []
      const previousTitle = 'agro-management [~/work/czzWork/GuoJi/agro] – /Users/gdkmjd/work/czzWork/GuoJi/agro/WebCore/appsettings.Mac.json'
      const currentTitle = 'agro-management [~/work/czzWork/GuoJi/agro] – /Users/gdkmjd/work/czzWork/GuoJi/agro/WebCore/Program.cs'
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            completeness: 'complete' as const,
            windows: [{ id: 'darwin:91:0:222', instanceId: 'darwin:91:0:222', platform: 'darwin', nativeRef: '91:0:222', appId: 'com.jetbrains.rider', appName: 'Rider', pid: 91, title: currentTitle, minimized: false, focused: false }]
          }),
          activate: async (request) => {
            const window = activationLandingWindow(request)
            activated.push(window.nativeRef)
            return { outcome: window.nativeRef === '7:0:111' ? 'not-found' as const : 'activated' as const }
          }
        }
      })
      enableWindows(state)
      state.windowTargets = [{ id: 'rider', alias: '农业项目', scope: 'instance', platform: 'darwin', appId: 'com.jetbrains.rider', appName: 'Rider', lastKnownTitle: previousTitle, lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'rider'
      state.windowSlots[1].targetIdByPlatform.darwin = 'rider'
      const runtime = createAppRuntime(state)
      runtime.focusWindow('target:rider')
      expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
      expect(runtime.snapshot().selectedWindowIds).toEqual(['target:rider'])
      const focusRequestBeforeRebind = runtime.snapshot().windowFocusRequestId

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(activated).toEqual(['7:0:111'])
      expect(runtime.snapshot().windowRebind).toMatchObject({ phase: 'confirming', targetId: 'rider' })
      expect(runtime.snapshot().windowRows).toHaveLength(1)
      expect(runtime.snapshot().windowRows[0]).toMatchObject({
        id: 'candidate:darwin:91:0:222',
        displayName: currentTitle,
        title: currentTitle,
        candidate: true,
        favorite: false,
        pinned: false,
        slotNumbers: []
      })
      expect(runtime.snapshot().selectedWindowIds).toEqual([])
      expect(runtime.snapshot().windowFocusRequestId).toBeGreaterThan(focusRequestBeforeRebind)
      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', lastKnownTitle: previousTitle })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'rebind-required', level: 'blocking' }))
      expect(runtime.dispatch('windows.actions.open', { rowId: 'candidate:darwin:91:0:222' }).handled).toBe(false)
      expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
      expect(runtime.snapshot().selectedWindowIds).toEqual([])

      const focusRequestBeforeCancel = runtime.snapshot().windowFocusRequestId
      expect(runtime.handleShortcut('Escape', false)).toBe('windows.candidates.clear')
      expect(runtime.snapshot().focusedWindowId).toBe('target:rider')
      expect(runtime.snapshot().windowFocusRequestId).toBeGreaterThan(focusRequestBeforeCancel)
      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()
      runtime.focusWindow('candidate:darwin:91:0:222')
      runtime.dispatch('windows.activate')
      await flushWindowActions()

      expect(activated).toEqual(['7:0:111', '7:0:111', '91:0:222'])
      const snapshot = runtime.snapshot().state
      expect(snapshot.windowTargets.find((target) => target.id === 'rider')).toMatchObject({
        alias: '农业项目',
        favorite: true,
        lastInstanceId: 'darwin:7:111',
        lastNativeRef: '7:0:111',
        lastKnownTitle: previousTitle
      })
      const replacement = snapshot.windowTargets.find((target) => target.id !== 'rider')
      expect(replacement).toMatchObject({
        favorite: false,
        pinned: false,
        alternateAliases: [],
        lastInstanceId: 'darwin:91:0:222',
        lastNativeRef: '91:0:222',
        lastKnownTitle: currentTitle
      })
      expect(snapshot.windowSlots[0].targetIdByPlatform.darwin).toBe(replacement?.id)
      expect(snapshot.windowSlots[1].targetIdByPlatform.darwin).toBe('rider')
    })

    it('preserves an active editor instead of opening a competing rebind flow', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            completeness: 'complete' as const,
            windows: [{ id: 'darwin:91:0:222', instanceId: 'darwin:91:0:222', platform: 'darwin', nativeRef: '91:0:222', appId: 'com.jetbrains.rider', appName: 'Rider', pid: 91, title: 'Program.cs', minimized: false, focused: false }]
          }),
          activate: async () => ({ outcome: 'not-found' as const })
        }
      })
      enableWindows(state)
      state.windowTargets = [{ id: 'rider', alias: '农业项目', scope: 'instance', platform: 'darwin', appId: 'com.jetbrains.rider', appName: 'Rider', lastKnownTitle: 'appsettings.Mac.json', lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'rider'
      const runtime = createAppRuntime(state)

      runtime.focusWindow('target:rider')
      expect(runtime.dispatch('windows.edit').handled).toBe(true)
      runtime.updateWindowDraft({ alias: '未保存的新别名' })
      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().windowDraft).toMatchObject({ alias: '未保存的新别名' })
      expect(runtime.snapshot().windowRebind).toEqual({ phase: 'idle', targetId: null, candidateInstanceIds: [] })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'editor-active', level: 'blocking' }))
    })

    it('keeps candidate recovery active across empty, partial, and replacement refreshes until the user exits', async () => {
      let listCount = 0
      const firstCandidate = { id: 'darwin:91:0:222', instanceId: 'darwin:91:0:222', platform: 'darwin' as const, nativeRef: '91:0:222', appId: 'com.jetbrains.rider', appName: 'Rider', pid: 91, title: 'Program.cs', minimized: false, focused: false }
      const partialCandidate = { ...firstCandidate, id: 'darwin:91:0:333', instanceId: 'darwin:91:0:333', nativeRef: '91:0:333', title: 'README.md' }
      const replacementCandidate = { ...firstCandidate, id: 'darwin:91:0:444', instanceId: 'darwin:91:0:444', nativeRef: '91:0:444', title: 'package.json' }
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => {
            listCount += 1
            if (listCount === 1) return { capability: darwinCapability, completeness: 'complete' as const, windows: [firstCandidate] }
            if (listCount === 2) return { capability: darwinCapability, completeness: 'complete' as const, windows: [] }
            if (listCount === 3) return { capability: darwinCapability, completeness: 'partial' as const, windows: [partialCandidate] }
            if (listCount === 4) return { capability: darwinCapability, completeness: 'partial' as const, windows: [] }
            return { capability: darwinCapability, completeness: 'complete' as const, windows: [replacementCandidate] }
          },
          activate: async (request) => ({ outcome: activationLandingWindow(request).nativeRef === '7:0:111' ? 'not-found' as const : 'activated' as const })
        }
      })
      enableWindows(state)
      state.windowTargets = [{ id: 'rider', alias: '农业项目', scope: 'instance', platform: 'darwin', appId: 'com.jetbrains.rider', appName: 'Rider', lastKnownTitle: 'appsettings.Mac.json', lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'rider'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()
      expect(runtime.snapshot().windowRows.map((row) => row.id)).toEqual(['candidate:darwin:91:0:222'])

      runtime.dispatch('windows.refresh')
      await flushWindowActions()
      expect(runtime.snapshot().windowRebind).toMatchObject({ phase: 'confirming', targetId: 'rider', candidateInstanceIds: [] })
      expect(runtime.snapshot().windowRows).toEqual([])
      expect(runtime.snapshot().focusedWindowId).toBeNull()
      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111' })
      expect(runtime.snapshot().message).toContain('无法确认目标窗口状态')

      const focusRequestBeforeCandidateReturns = runtime.snapshot().windowFocusRequestId
      runtime.dispatch('windows.refresh')
      await flushWindowActions()
      expect(runtime.snapshot().windowRows).toEqual([
        expect.objectContaining({ id: 'candidate:darwin:91:0:333', cached: false, candidate: true })
      ])
      expect(runtime.snapshot().focusedWindowId).toBe('candidate:darwin:91:0:333')
      expect(runtime.snapshot().windowFocusRequestId).toBeGreaterThan(focusRequestBeforeCandidateReturns)

      runtime.dispatch('windows.refresh')
      await flushWindowActions()
      expect(runtime.snapshot().windowRows).toEqual([
        expect.objectContaining({ id: 'candidate:darwin:91:0:333', cached: true, candidate: true })
      ])

      runtime.dispatch('windows.refresh')
      await flushWindowActions()
      expect(runtime.snapshot().windowRows).toEqual([
        expect.objectContaining({ id: 'candidate:darwin:91:0:444', cached: false, candidate: true })
      ])
      expect(runtime.snapshot().focusedWindowId).toBe('candidate:darwin:91:0:444')
      expect(runtime.handleShortcut('Escape', false)).toBe('windows.candidates.clear')
      expect(runtime.snapshot().windowRebind).toEqual({ phase: 'idle', targetId: null, candidateInstanceIds: [] })
      expect(runtime.snapshot().focusedWindowId).toBe('target:rider')
    })

    it('does not learn an automatic replacement when the new candidate fails native focus verification', async () => {
      const previousTitle = 'agro-management – appsettings.Mac.json'
      const currentTitle = 'agro-management – Program.cs'
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            completeness: 'complete' as const,
            windows: [{ id: 'darwin:91:0:222', instanceId: 'darwin:91:0:222', platform: 'darwin', nativeRef: '91:0:222', appId: 'com.jetbrains.rider', appName: 'Rider', pid: 91, title: currentTitle, minimized: false, focused: false }]
          }),
          activate: async (request) => ({ outcome: activationLandingWindow(request).nativeRef === '7:0:111' ? 'not-found' as const : 'focus-denied' as const })
        }
      })
      enableWindows(state)
      state.windowTargets = [{ id: 'rider', alias: '农业项目', scope: 'instance', platform: 'darwin', appId: 'com.jetbrains.rider', appName: 'Rider', lastKnownTitle: previousTitle, lastInstanceId: null, lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'rider'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      runtime.focusWindow('candidate:darwin:91:0:222')
      runtime.dispatch('windows.activate')
      await flushWindowActions()

      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastNativeRef: '7:0:111', lastKnownTitle: previousTitle })
      expect(runtime.snapshot().state.windowTargets[0]).not.toHaveProperty('titleHistory')
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'focus-denied', level: 'blocking' }))
    })

    it('keeps every same-app replacement manual regardless of title similarity', async () => {
      const activated: string[] = []
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            completeness: 'complete' as const,
            windows: [
              { id: 'darwin:91:0:222', instanceId: 'darwin:91:0:222', platform: 'darwin', nativeRef: '91:0:222', appId: 'com.google.Chrome', appName: 'Google Chrome', pid: 91, title: 'AiTools - Chat - Google Chrome', minimized: false, focused: false },
              { id: 'darwin:92:0:333', instanceId: 'darwin:92:0:333', platform: 'darwin', nativeRef: '92:0:333', appId: 'com.google.Chrome', appName: 'Google Chrome', pid: 92, title: 'AiTools - Settings - Google Chrome', minimized: false, focused: false }
            ]
          }),
          activate: async (request) => {
            activated.push(activationLandingWindow(request).nativeRef)
            return { outcome: 'not-found' as const }
          }
        }
      })
      enableWindows(state)
      state.windowTargets = [{ id: 'aitools', alias: 'AiTools', scope: 'instance', platform: 'darwin', appId: 'com.google.Chrome', appName: 'Google Chrome', lastKnownTitle: 'AiTools - Dashboard - Google Chrome', lastInstanceId: null, lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'aitools'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(activated).toEqual(['7:0:111'])
      expect(runtime.snapshot().windowRebind).toMatchObject({ phase: 'confirming', targetId: 'aitools' })
      expect(runtime.snapshot().windowRows).toHaveLength(2)
      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastNativeRef: '7:0:111', lastKnownTitle: 'AiTools - Dashboard - Google Chrome' })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'rebind-required', level: 'blocking' }))
    })

    it('does not auto-replace from a partial inventory even when its only visible candidate is similar', async () => {
      const activated: string[] = []
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            completeness: 'partial' as const,
            windows: [{ id: 'darwin:91:0:222', instanceId: 'darwin:91:0:222', platform: 'darwin', nativeRef: '91:0:222', appId: 'com.jetbrains.rider', appName: 'Rider', pid: 91, title: 'agro-management – Program.cs', minimized: false, focused: false }]
          }),
          activate: async (request) => {
            activated.push(activationLandingWindow(request).nativeRef)
            return { outcome: 'not-found' as const }
          }
        }
      })
      enableWindows(state)
      state.windowTargets = [{ id: 'rider', alias: '农业项目', scope: 'instance', platform: 'darwin', appId: 'com.jetbrains.rider', appName: 'Rider', lastKnownTitle: 'agro-management – appsettings.Mac.json', lastInstanceId: null, lastNativeRef: '7:0:111', groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: true, pinned: false, createdAt: 1, updatedAt: 1 }]
      state.windowSlots[0].targetIdByPlatform.darwin = 'rider'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(activated).toEqual(['7:0:111'])
      expect(runtime.snapshot().state.windowTargets[0].lastNativeRef).toBe('7:0:111')
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'target-indeterminate', level: 'blocking' }))
    })

    it('uses the same explicit rebind requirement for manual workbench activation', async () => {
      const activated: string[] = []
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({
            capability: darwinCapability,
            windows: [{ id: 'darwin:manual-new', instanceId: 'darwin:manual-new', platform: 'darwin', nativeRef: 'manual-new', appId: 'com.example.target', appName: 'Example', pid: 8, title: 'Target', minimized: false, focused: false }]
          }),
          activate: async (request) => {
            const window = activationLandingWindow(request)
            activated.push(window.nativeRef)
            return { outcome: window.nativeRef === 'old-ref' ? 'not-found' as const : 'activated' as const }
          }
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      const runtime = createAppRuntime(state)

      expect(runtime.dispatch('windows.actions.open', { rowId: 'target:diagnostic-target' }).handled).toBe(true)
      expect(runtime.dispatch('windows.activate').handled).toBe(true)
      await flushWindowActions()

      expect(activated).toEqual(['old-ref'])
      expect(runtime.snapshot().state.windowTargets[0].lastNativeRef).toBe('old-ref')
      expect(runtime.snapshot().windowRebind).toMatchObject({ phase: 'confirming', targetId: 'diagnostic-target' })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'rebind-required', level: 'blocking' }))
    })

    it('marks a target closed only after an exact native-instance probe proves it gone', async () => {
      const { state, getShowCount } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          probeInstance: async (window) => ({ status: 'gone' as const, instanceId: window.instanceId, liveness: 'verified-gone' as const, reason: 'native-window-absent' as const }),
          activate: async () => ({ outcome: 'not-found' as const })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      state.windowTargets[0].lastInstanceId = 'darwin:7:111'
      state.windowTargets[0].lastNativeRef = '7:0:111'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().state.windowTargets[0].lastNativeRef).toBeNull()
      expect(runtime.snapshot().windowActivationDiagnostics).toEqual([
        expect.objectContaining({ entry: 'slot', slot: 1, stage: 'resolve', code: 'target-closed', level: 'accepted' })
      ])
      expect(getShowCount()).toBe(1)
    })

    it('keeps a unique off-Space instance when a complete projection omits it but the native probe proves it live', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [], completeness: 'complete' as const }),
          probeInstance: async (window) => ({ status: 'live' as const, instanceId: window.instanceId, liveness: 'verified-live' as const, evidence: 'space-binding' as const }),
          activate: async () => ({ outcome: 'not-found' as const })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      state.windowTargets[0].lastInstanceId = 'darwin:7:111'
      state.windowTargets[0].lastNativeRef = '7:0:111'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111' })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(
        expect.objectContaining({ code: 'target-unobserved', level: 'blocking' })
      )
    })

    it('keeps a unique instance when native liveness is indeterminate', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [], completeness: 'complete' as const }),
          probeInstance: async (window) => ({ status: 'indeterminate' as const, instanceId: window.instanceId, liveness: 'indeterminate' as const, reason: 'native-query-failed' as const }),
          activate: async () => ({ outcome: 'not-found' as const })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      state.windowTargets[0].lastInstanceId = 'darwin:7:111'
      state.windowTargets[0].lastNativeRef = '7:0:111'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111' })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(
        expect.objectContaining({ code: 'target-indeterminate', level: 'blocking' })
      )
    })

    it('keeps a stale reference when a partial rescan cannot confirm that the target closed', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [], completeness: 'partial' as const }),
          activate: async () => ({ outcome: 'not-found' as const })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().state.windowTargets[0].lastNativeRef).toBe('old-ref')
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(
        expect.objectContaining({ code: 'target-indeterminate', level: 'blocking' })
      )
    })

    it('keeps a precise slot binding and skips inventory rebind when only the Space mapping is unavailable', async () => {
      let listCount = 0
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => { listCount += 1; return { capability: darwinCapability, windows: [], completeness: 'partial' as const } },
          activate: async () => ({ outcome: 'not-found' as const, reasonCode: 'space-unbound-multiwindow' as const })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      state.windowTargets[0].lastInstanceId = 'darwin:7:111'
      state.windowTargets[0].lastNativeRef = '7:0:111'
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(listCount).toBe(0)
      expect(runtime.snapshot().state.windowTargets[0]).toMatchObject({ lastInstanceId: 'darwin:7:111', lastNativeRef: '7:0:111' })
      expect(runtime.snapshot().windowRebind).toEqual({ phase: 'idle', targetId: null, candidateInstanceIds: [] })
      expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: 'space-unbound', level: 'blocking' }))
    })

    it('records focus, permission, host-call, feature-disabled, unassigned-slot, workbench-show, and silent-hide failures as blocking', async () => {
      const cases = [
        {
          code: 'focus-denied',
          setup: () => installPlatform({
            windows: {
              capabilities: async () => darwinCapability,
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'focus-denied' as const })
            }
          }),
          target: true,
          enabled: true
        },
        {
          code: 'permission-required',
          setup: () => installPlatform({
            windows: {
              capabilities: async () => ({ ...darwinCapability, permission: 'required' as const, canList: false, canActivate: false }),
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'permission-required' as const })
            }
          }),
          target: false,
          enabled: true
        },
        {
          code: 'capability-read-failed',
          setup: () => installPlatform({
            windows: {
              capabilities: async () => { throw new Error('capability host failure') },
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'activated' as const })
            }
          }),
          target: false,
          enabled: true
        },
        {
          code: 'activation-failed',
          setup: () => installPlatform({
            windows: {
              capabilities: async () => darwinCapability,
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => { throw new Error('host failure') }
            }
          }),
          target: true,
          enabled: true
        },
        {
          code: 'feature-disabled',
          setup: () => installPlatform({
            windows: {
              capabilities: async () => darwinCapability,
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'activated' as const })
            }
          }),
          target: false,
          enabled: false
        },
        {
          code: 'slot-unassigned',
          setup: () => installPlatform({
            windows: {
              capabilities: async () => darwinCapability,
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'activated' as const })
            }
          }),
          target: false,
          enabled: true
        },
        {
          code: 'silent-hide-failed',
          setup: () => installPlatform({
            app: { hide: async () => false },
            windows: {
              capabilities: async () => darwinCapability,
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'activated' as const })
            }
          }),
          target: true,
          enabled: true
        },
        {
          code: 'workbench-show-failed',
          setup: () => installPlatform({
            app: { hide: async () => true, show: () => false },
            windows: {
              capabilities: async () => darwinCapability,
              list: async () => ({ capability: darwinCapability, windows: [] }),
              activate: async () => ({ outcome: 'activated' as const })
            }
          }),
          target: false,
          enabled: true
        }
      ] as const

      for (const testCase of cases) {
        const { state } = testCase.setup()
        if (testCase.enabled) enableWindows(state)
        if (testCase.target) assignSlotTarget(state)
        const runtime = createAppRuntime(state)
        runtime.dispatch('windows.slot.activate', { slot: 1 })
        await flushWindowActions()
        expect(runtime.snapshot().windowActivationDiagnostics).toContainEqual(expect.objectContaining({ code: testCase.code, level: 'blocking' }))
      }
    })

    it('never copies a host activation message into session diagnostics', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({ outcome: 'failed' as const, message: 'secret-window-title 424242 0xDEADBEEF' })
        }
      })
      enableWindows(state)
      assignSlotTarget(state)
      const runtime = createAppRuntime(state)

      runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      const diagnostic = runtime.snapshot().windowActivationDiagnostics[0]
      expect(diagnostic).toMatchObject({ code: 'activation-failed', level: 'blocking' })
      expect(diagnostic.message).not.toContain('secret-window-title')
      expect(diagnostic.message).not.toContain('424242')
      expect(diagnostic.message).not.toContain('0xDEADBEEF')
    })

    it('bounds session diagnostics to fifty records and clears them through a runtime action', async () => {
      const { state } = installPlatform({
        windows: {
          capabilities: async () => darwinCapability,
          list: async () => ({ capability: darwinCapability, windows: [] }),
          activate: async () => ({ outcome: 'activated' as const })
        }
      })
      enableWindows(state)
      const runtime = createAppRuntime(state)

      for (let index = 0; index < 51; index += 1) runtime.dispatch('windows.slot.activate', { slot: 1 })
      await flushWindowActions()

      expect(runtime.snapshot().windowActivationDiagnostics).toHaveLength(50)
      expect(runtime.snapshot().windowActivationDiagnostics.every((diagnostic) => diagnostic.code === 'slot-unassigned')).toBe(true)
      expect(runtime.dispatch('windows.activation.diagnostics.clear').handled).toBe(true)
      expect(runtime.snapshot().windowActivationDiagnostics).toEqual([])
    })
  })
})
