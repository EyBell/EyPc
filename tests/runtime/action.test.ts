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
    let hideCount = 0
    let scanCount = 0
    const platform = {
      storage: {
        getState: () => state,
        setState: () => true
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
        open: async () => true,
        reveal: async () => true,
        copyPath: async (path: string) => {
          copied.push(path)
          return true
        },
        pickFavorite: async () => null
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
    return { state, killed, copied, platform, getScanCount: () => scanCount, getHideCount: () => hideCount }
  }

  it('records favorite search history and reorders favorites through runtime', () => {
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
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    runtime.setFavoriteSearch('code')
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    runtime.setFavoriteSearch('docs')
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    runtime.reorderFavorite('f2', 'g1', 'f1')

    const snapshot = runtime.snapshot()
    expect(snapshot.state.favoriteSearchHistory).toEqual(['docs', 'code'])
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

  it('keeps focused search Enter for history acceptance instead of confirming highlighted rows', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      group('web', 'Web', ['3000'], 1),
      { ...group('vite', 'Vite', ['5173-5175'], 2), color: '#2F80ED' }
    ]
    state.searchHistories = {
      ports: {
        processes: ['vite'],
        groups: ['vite']
      },
      favorites: {
        files: []
      }
    }
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.setPortSearch('vite')
    const portBlurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-search' })).toBeNull()
    expect(runtime.snapshot().state.portSearch).toBe('vite')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.snapshot().searchBlurRequestId).toBe(portBlurRequestId)
    runtime.setPortSearch('vi')
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.next')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.accept')
    expect(runtime.snapshot().state.portSearch).toBe('vite')

    runtime.dispatch('ports.groupSearch.focus')
    runtime.setPortGroupSearch('vi')
    const groupBlurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.snapshot().focusedPortGroupTarget).toEqual({ kind: 'group', id: 'vite' })
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBeNull()
    expect(runtime.snapshot().portGroupSearch).toBe('vi')
    expect(runtime.snapshot().selectedPortGroupTarget).toBeNull()
    expect(runtime.snapshot().searchBlurRequestId).toBe(groupBlurRequestId)
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('search.history.next')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('search.history.accept')
    expect(runtime.snapshot().portGroupSearch).toBe('vite')
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

  it('cycles port panes with Tab shortcuts and starts row focus on first arrow movement', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.handleShortcut('Tab', false)).toBeNull()
    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.handleShortcut('Shift+Tab', false)).toBe('ports.pane.togglePrev')
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')

    expect(runtime.handleShortcut('Shift+Tab', false)).toBe('ports.pane.togglePrev')
    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
  })

  it('toggles group panel with Ctrl+W using expand-pane and collapse-blur semantics', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    const initialFocusRequestId = runtime.snapshot().groupPanelFocusRequestId

    expect(runtime.handleShortcut('Alt+1', false)).toBeNull()
    expect(runtime.handleShortcut('Ctrl+W', false)).toBe('ports.groups.togglePanel')
    expect(runtime.snapshot()).toMatchObject({
      groupSidePanelOpen: false,
      activePortPane: 'results',
      focusedPortGroupId: null,
      focusedPortGroupTarget: null,
      groupPanelFocusRequestId: initialFocusRequestId
    })

    expect(runtime.handleShortcut('Ctrl+W', false)).toBe('ports.groups.togglePanel')
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

  it('opens the group pane and focuses group search from Ctrl+Shift+F inside port search', async () => {
    const { state } = installPlatform()
    state.portGroups = [group('web', 'Web', ['3000'])]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.handleShortcut('Ctrl+W', false)).toBe('ports.groups.togglePanel')
    expect(runtime.snapshot().groupSidePanelOpen).toBe(false)

    expect(runtime.handleShortcut('Ctrl+Shift+F', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.groupSearch.focus')
    expect(runtime.snapshot()).toMatchObject({
      groupSidePanelOpen: true,
      activePortPane: 'groups',
      searchFocusTarget: 'port-groups',
      searchHistoryState: { target: 'ports.groups', open: false, activeIndex: -1 }
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
    expect(runtime.handleShortcut('Shift+F2', false)).toBe('ports.group.rename')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'rename', activeField: 'name' })
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.edit.nextField')
    expect(runtime.snapshot().portGroupDraft?.activeField).toBe('name')
    runtime.updatePortGroupDraft({ name: 'Name Only', entriesText: '9999', color: '#D64545' })
    expect(runtime.handleShortcut('Ctrl+S', { textInputFocused: true, activeInputRole: 'port-group-editor' })).toBe('ports.group.save')
    expect(runtime.snapshot().state.portGroups[0]).toMatchObject({ name: 'Name Only', entries: ['3000', '5174'], color: '#2F80ED' })
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

  it('persists partitioned search histories and supports keyboard selection and deletion', async () => {
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
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: [] })
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')

    runtime.setPortSearch('n')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: ['node'] })
    expect(runtime.handleShortcut('Tab', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.acceptInline')
    expect(runtime.snapshot().state.portSearch).toBe('node')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: ['node'] })

    runtime.setPortSearch('n')
    const focusRequestId = runtime.snapshot().searchFocusRequestId
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.next')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: true, activeIndex: 0, items: ['node'] })
    expect(runtime.handleShortcut('ArrowRight', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.close')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: ['node'] })
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.next')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.close')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: ['node'] })
    expect(runtime.snapshot().state.portSearch).toBe('n')
    expect(runtime.snapshot().searchFocusRequestId).toBe(focusRequestId + 2)
    expect(runtime.snapshot().searchFocusTarget).toBe('ports')
    const blurAfterHistoryCloseId = runtime.snapshot().searchBlurRequestId
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.search.clear')
    expect(runtime.snapshot().state.portSearch).toBe('')
    expect(runtime.snapshot().searchBlurRequestId).toBe(blurAfterHistoryCloseId + 1)
    expect(runtime.snapshot().searchHistoryState.open).toBe(false)

    expect(runtime.dispatch('ports.search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: [] })
    runtime.setPortSearch('n')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: ['node'] })
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.next')
    expect(runtime.snapshot().searchHistoryState.activeIndex).toBe(0)
    const historyAcceptFocusRequestId = runtime.snapshot().searchFocusRequestId
    const historyAcceptBlurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.accept')
    expect(runtime.snapshot().state.portSearch).toBe('node')
    expect(runtime.snapshot().state.searchHistories.ports.processes[0]).toBe('node')
    expect(runtime.snapshot().searchHistoryState.open).toBe(false)
    expect(runtime.snapshot().searchFocusRequestId).toBe(historyAcceptFocusRequestId + 1)
    expect(runtime.snapshot().searchFocusTarget).toBe('ports')
    expect(runtime.snapshot().searchBlurRequestId).toBe(historyAcceptBlurRequestId)

    runtime.setPortSearch('vit')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: ['vite'] })
    const directBlurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    expect(runtime.snapshot().state.portSearch).toBe('vit')
    expect(runtime.snapshot().state.searchHistories.ports.processes[0]).toBe('vit')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.snapshot().searchBlurRequestId).toBe(directBlurRequestId + 1)

    runtime.setPortSearch('redis')
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.processes', open: false, activeIndex: -1, items: [] })
    const blurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    expect(runtime.snapshot().state.searchHistories.ports.processes[0]).toBe('redis')
    expect(runtime.snapshot().searchHistoryState.open).toBe(false)
    expect(runtime.snapshot().searchBlurRequestId).toBe(blurRequestId + 1)
    expect(runtime.snapshot().focusedPortId).toBeNull()

    runtime.setPortSearch('node')
    expect(runtime.dispatch('ports.search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchHistoryState.activeIndex).toBe(-1)
    expect(runtime.handleShortcut('Backspace', { textInputFocused: true, activeInputRole: 'port-search' })).toBeNull()
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('list.down')
    expect(runtime.handleShortcut('Shift+ArrowDown', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.next')
    expect(runtime.handleShortcut('Delete', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('search.history.delete')
    expect(runtime.snapshot().state.searchHistories.ports.processes).not.toContain('node')

    expect(runtime.dispatch('ports.groupSearch.focus').handled).toBe(true)
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'ports.groups', open: false, activeIndex: -1, items: [] })
    runtime.setPortGroupSearch('api')
    const groupBlurRequestId = runtime.snapshot().searchBlurRequestId
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    expect(runtime.snapshot().state.searchHistories.ports.groups).toEqual(['api', 'dev'])
    expect(runtime.snapshot().state.searchHistories.ports.processes).not.toContain('api')
    expect(runtime.snapshot().searchBlurRequestId).toBe(groupBlurRequestId + 1)
    expect(runtime.snapshot().focusedPortGroupId).toBe('api')

    runtime.saveFeatureConfigs([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'settings', enabled: true, sortOrder: 3 }
    ])
    runtime.setTab('favorites')
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchHistoryState).toMatchObject({ target: 'favorites.files', open: false, activeIndex: -1, items: [] })
    runtime.setFavoriteSearch('repo')
    expect(runtime.dispatch('search.history.accept').handled).toBe(true)
    expect(runtime.snapshot().state.searchHistories.favorites.files).toEqual(['repo', 'docs'])
  })

  it('switches feature tabs through Ctrl+Shift numbers and keeps settings on Ctrl+Alt+S', () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.handleShortcut('Ctrl+2', false)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('ports')
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('ports')
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

    expect(runtime.snapshot().visibleFeatures.map((feature) => feature.id)).toEqual(['ports', 'settings'])
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBeNull()

    runtime.saveFeatureConfigs([
      { id: 'settings', enabled: false, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'ports', enabled: true, sortOrder: 3 }
    ])

    expect(runtime.snapshot().state.settings.featureConfigs).toEqual([
      { id: 'settings', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: true, sortOrder: 2 },
      { id: 'ports', enabled: true, sortOrder: 3 }
    ])
    expect(runtime.snapshot().visibleFeatures.map((feature) => ({
      id: feature.id,
      shortcutId: feature.shortcutId,
      commandId: feature.shortcutCommandId
    }))).toEqual([
      { id: 'settings', shortcutId: 'Ctrl+Alt+S', commandId: 'settings.open' },
      { id: 'favorites', shortcutId: 'Ctrl+Shift+1', commandId: 'tab.select.favorites' },
      { id: 'ports', shortcutId: 'Ctrl+Shift+2', commandId: 'tab.select.ports' }
    ])
    expect(runtime.handleShortcut('Ctrl+Shift+1', false)).toBe('tab.select.favorites')
    expect(runtime.snapshot().state.activeTab).toBe('favorites')
    expect(runtime.handleShortcut('Ctrl+Shift+2', false)).toBe('tab.select.ports')
    expect(runtime.snapshot().state.activeTab).toBe('ports')
    expect(savedState).toMatchObject({
      settings: {
        featureConfigs: [
          { id: 'settings', enabled: true, sortOrder: 1 },
          { id: 'favorites', enabled: true, sortOrder: 2 },
          { id: 'ports', enabled: true, sortOrder: 3 }
        ]
      }
    })
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

  it('adds picked favorite when platform picker returns a path', async () => {
    installPlatform({
      files: {
        open: async () => true,
        reveal: async () => true,
        copyPath: async () => true,
        pickFavorite: async () => ({ kind: 'folder', path: '/tmp/picked', name: 'picked', parentId: null, tags: ['picked'], color: '#2F80ED' })
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

    runtime.dispatch('favorites.pickAndAdd')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().state.favorites).toHaveLength(1)
    expect(runtime.snapshot().state.favorites[0]).toMatchObject({ kind: 'folder', path: '/tmp/picked', name: 'picked' })
  })
})
