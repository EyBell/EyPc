import { describe, expect, it } from 'vitest'
import { createActionRuntime } from '../../src/runtime/action/actionRuntime'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime } from '../../src/runtime/appRuntime'

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

  function installPlatform(overrides: Partial<Window['eypcPlatform']> = {}) {
    const state = createInitialState(100)
    const killed: Array<{ pid: number; port: number; force: boolean }> = []
    const copied: string[] = []
    const opened: string[] = []
    const revealed: string[] = []
    const listed: string[] = []
    let hideCount = 0
    let scanCount = 0
    const platform = {
      storage: {
        getState: () => state,
        setState: () => true,
        getMqttArchive: () => ({ version: 1 as const, sessions: [] }),
        setMqttArchive: () => true
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
      files: {
        open: async (target: string) => {
          opened.push(target)
          return true
        },
        reveal: async (target: string) => {
          revealed.push(target)
          return true
        },
        copyPath: async (path: string) => {
          copied.push(path)
          return true
        },
        pickFavorite: async () => null,
        pickFavorites: async () => [],
        listDirectory: async (target: string) => {
          listed.push(target)
          return { ok: false, entries: [], error: 'unavailable' }
        }
      },
      app: {
        hide: async () => {
          hideCount += 1
          return true
        }
      },
      getEnterPayload: () => null,
      clearEnterPayload: () => undefined,
      ...overrides
    }
    globalThis.window = { eypcPlatform: platform } as unknown as Window & typeof globalThis
    return { state, killed, copied, opened, revealed, listed, platform, getScanCount: () => scanCount, getHideCount: () => hideCount }
  }

  it('keeps favorite search as a filter and reorders favorites through runtime', () => {
    const state = createInitialState(100)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f1', kind: 'folder', path: '/a', name: 'A', parentId: 'g1', tags: ['docs'], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'f2', kind: 'folder', path: '/b', name: 'B', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setTab('favorites')
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    runtime.setFavoriteSearch('docs')
    runtime.reorderFavorite('f2', 'g1', 'f1')

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
      }
    }

    runtime.saveShortcutProfiles(draftProfiles)

    const settings = runtime.snapshot().state.settings
    expect(settings.shortcutProfiles.ports.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutIds: ['Alt+R'] })
    expect(settings.shortcutProfiles.global.keybindingOverrides[0]).toMatchObject({ commandId: 'search.focus', shortcutIds: ['Ctrl+P'] })
    expect(settings.keybindingOverrides.map((item) => item.commandId)).toEqual(['search.focus', 'ports.scan'])
    expect(saveCount).toBe(1)
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

  it('persists feature configs, updates visible tab order, and keeps settings enabled', () => {
    const { state, platform } = installPlatform()
    let savedState: unknown = null
    platform.storage.setState = (nextState: unknown) => {
      savedState = nextState
      return true
    }
    const runtime = createAppRuntime(state)

    expect(runtime.snapshot().visibleFeatures.map((feature) => feature.id)).toEqual(['ports', 'mqtt', 'settings'])
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBe('tab.select.mqtt')
    expect(runtime.snapshot().state.activeTab).toBe('mqtt')
    runtime.setTab('ports')

    runtime.saveFeatureConfigs([
      { id: 'settings', enabled: false, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'mqtt', enabled: true, sortOrder: 3 },
      { id: 'ports', enabled: true, sortOrder: 4 }
    ])

    expect(runtime.snapshot().state.settings.featureConfigs).toEqual([
      { id: 'settings', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'mqtt', enabled: true, sortOrder: 3 },
      { id: 'ports', enabled: true, sortOrder: 4 }
    ])
    expect(runtime.snapshot().visibleFeatures.map((feature) => ({
      id: feature.id,
      shortcutId: feature.shortcutId,
      commandId: feature.shortcutCommandId
    }))).toEqual([
      { id: 'settings', shortcutId: 'Ctrl+Alt+S', commandId: 'settings.open' },
      { id: 'favorites', shortcutId: 'Ctrl+Shift+1', commandId: 'tab.select.favorites' },
      { id: 'mqtt', shortcutId: 'Ctrl+Shift+2', commandId: 'tab.select.mqtt' },
      { id: 'ports', shortcutId: 'Ctrl+Shift+3', commandId: 'tab.select.ports' }
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
          { id: 'ports', enabled: true, sortOrder: 4 }
        ]
      }
    })
  })

  it('keeps MQTT isolated until the feature is enabled and loaded', async () => {
    const { state, platform } = installPlatform()
    const storageCalls: string[] = []
    platform.storage.getMqttArchive = () => {
      storageCalls.push('read')
      return { version: 1, sessions: [] }
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

  it('manages MQTT configs and keeps unsynced message records in memory only', () => {
    const { state, platform } = installPlatform()
    const archiveWrites: unknown[] = []
    platform.storage.getMqttArchive = () => ({ version: 1, sessions: [] })
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
    expect(archiveWrites).toEqual([])

    expect(runtime.dispatch('mqtt.record.rename', { title: 'Greeting', note: 'from broker' }).handled).toBe(true)
    expect(runtime.snapshot().mqttArchive.sessions[0].messages[0]).toMatchObject({
      title: 'Greeting',
      note: 'from broker',
      payload: 'hello'
    })
    expect(runtime.dispatch('mqtt.record.resendDraft').handled).toBe(true)
    expect(runtime.snapshot().mqttPublishDraft).toMatchObject({
      topic: 'demo/in',
      payload: 'hello'
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
        { topic: 'plc/+/status', alias: '状态' },
        { topic: 'plc/#', alias: '全部 PLC' }
      ],
      publishTopic: 'plc/czz060301/set'
    })
    runtime.dispatch('mqtt.config.save')
    const configId = runtime.snapshot().state.mqtt.activeConfigId
    expect(configId).toBeTruthy()

    runtime.appendMqttMessageRecord({ direction: 'incoming', topic: 'plc/czz060301/status', payload: 'in-status', qos: 0, retain: false })
    runtime.appendMqttMessageRecord({ direction: 'outgoing', topic: 'plc/czz060301/set', payload: 'out-set', qos: 0, retain: false })
    runtime.appendMqttMessageRecord({ direction: 'incoming', topic: 'other/status', payload: 'ignored', qos: 0, retain: false })

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

    expect(runtime.dispatch('mqtt.subscription.clearAll').handled).toBe(true)
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptions).toEqual([])
    expect(runtime.snapshot().state.mqtt.configs[0].subscriptionAliases).toEqual({})
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
    expect(runtime.snapshot().mqttSubscriptionDraft?.items[1]).toMatchObject({ topic: '#', alias: '' })

    runtime.updateMqttSubscriptionDraft({
      items: [
        { id: 'row-a', topic: ' plc/a ', alias: 'Alpha' },
        { id: 'row-b', topic: 'plc/b', alias: 'Beta' },
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
      mqttLogDrawer: { open: false },
      mqttPublishRecordsOpen: false
    })

    expect(runtime.handleShortcut('Ctrl+Shift+T', false)).toBe('mqtt.subscription.panel.toggle')
    expect(runtime.snapshot().mqttSubscriptionPanelOpen).toBe(false)
    expect(runtime.handleShortcut('Ctrl+Shift+L', false)).toBe('mqtt.layout.toggle')
    expect(runtime.snapshot().mqttWorkspaceLayout).toBe('split')
    expect(runtime.handleShortcut('Ctrl+L', false)).toBe('mqtt.log.drawer.open')
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

    expect(runtime.dispatch('mqtt.publish.records.toggle').handled).toBe(true)
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
    expect(runtime.snapshot().mqttDrawer).toEqual({ open: true, active: false })
    expect(runtime.handleShortcut('ArrowRight', false)).toBe('mqtt.detail.close')
    expect(runtime.snapshot().mqttDrawer).toEqual({ open: false, active: false })

    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('mqtt.drawer.open')
    expect(runtime.snapshot().mqttDrawer).toEqual({ open: true, active: true })
    expect(runtime.handleShortcut('ArrowLeft', false)).toBe('mqtt.drawer.close')
    expect(runtime.snapshot().mqttDrawer).toEqual({ open: false, active: false })
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
    state.activeTab = 'favorites'
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
    state.activeTab = 'favorites'
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
    expect(runtime.snapshot().activeFavoritePane).toBe('groups')
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
    state.activeTab = 'favorites'
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
    expect(created).toMatchObject({ path: '/work/new-app', name: 'new-app', parentId: 'g1', tags: ['code', 'docs'] })
    expect(runtime.snapshot().focusedFavoriteId).toBe(created?.id)
  })

  it('picks an OS path into the favorite draft without adding metadata immediately', async () => {
    installPlatform({
      files: {
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
        pickFavorite: async () => ({ kind: 'folder', path: '/tmp/picked/', name: '', parentId: null, tags: ['picked'], color: '#2F80ED' }),
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
    expect(created).toMatchObject({ path: '/tmp/picked', name: 'picked', parentId: 'g1' })
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('favorites.drawer.open')
    expect(runtime.snapshot().favoriteDrawer).toMatchObject({ open: true, active: true, targetKind: 'favorite' })
    expect(runtime.snapshot().favoriteDrawerItems.map((item) => item.commandId)).toContain('favorites.open')
    expect(runtime.handleShortcut('Ctrl+1', false)).toBe('favorites.drawer.select.1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(['/work/readme.md'])
    expect(runtime.snapshot().favoriteDrawer.open).toBe(false)
  })

  it('multi-selects real directory rows and adds them as virtual children', async () => {
    const { state } = installPlatform({
      files: {
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
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
})
