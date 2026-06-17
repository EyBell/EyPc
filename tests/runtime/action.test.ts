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
  function installPlatform(overrides: Partial<Window['eypcPlatform']> = {}) {
    const state = createInitialState(100)
    const killed: Array<{ pid: number; port: number; force: boolean }> = []
    const copied: string[] = []
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
      getEnterPayload: () => null,
      clearEnterPayload: () => undefined,
      ...overrides
    }
    globalThis.window = { eypcPlatform: platform } as unknown as Window & typeof globalThis
    return { state, killed, copied, platform, getScanCount: () => scanCount }
  }

  it('records favorite search history and reorders favorites through runtime', () => {
    const state = createInitialState(100)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f1', kind: 'folder', path: '/a', name: 'A', parentId: 'g1', tags: ['docs'], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'f2', kind: 'folder', path: '/b', name: 'B', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setFavoriteSearch('docs')
    runtime.setFavoriteSearch('code')
    runtime.setFavoriteSearch('docs')
    runtime.reorderFavorite('f2', 'g1', 'f1')

    const snapshot = runtime.snapshot()
    expect(snapshot.state.favoriteSearchHistory).toEqual(['docs', 'code'])
    expect(snapshot.state.favorites.find((item) => item.id === 'f2')?.parentId).toBe('g1')
    expect(snapshot.favoriteRows.map((item) => item.node.id)).toEqual(['g1', 'f1'])
  })

  it('creates confirmation for port group cleanup and only targets current listeners', async () => {
    const { state, killed } = installPlatform()
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000', '5173-5175'] }]
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
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000', '5173-5175'] }]
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

  it('moves result focus, toggles selection, and force-cleans selected rows through shortcuts', async () => {
    const { killed } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortId).toBe('12:5174:tcp')
    expect(runtime.handleShortcut('Space', false)).toBe('list.toggleSelection')
    expect(runtime.snapshot().selectedPortIds).toEqual(['12:5174:tcp'])
    expect(runtime.handleShortcut('Ctrl+Enter', false)).toBe('ports.kill.force')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(killed).toEqual([{ pid: 12, port: 5174, force: true }])
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

    expect(runtime.handleShortcut('Escape', false)).toBe('app.escape.idle')
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

    expect(runtime.handleShortcut('Escape', false)).toBe('ports.workspace.reset')
    expect(runtime.snapshot().state.portSearch).toBe('')

    expect(runtime.handleShortcut('Escape', false)).toBe('app.escape.idle')
    expect(runtime.snapshot().state.activeTab).toBe('ports')
  })

  it('opens and navigates the port action drawer using command shortcuts', async () => {
    const { killed } = installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

    expect(runtime.handleShortcut('Ctrl+ArrowRight', false)).toBe('ports.drawer.open')
    expect(runtime.snapshot().portDrawer).toMatchObject({ open: true, mode: 'single', targetIds: ['11:3000:tcp'], activeIndex: 0 })
    expect(runtime.snapshot().portDrawerItems[0]).toMatchObject({
      commandId: 'ports.kill.confirm',
      shortcutLabel: 'Enter'
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

  it('keeps group search navigation in the input and resets group search with Escape', async () => {
    const { state } = installPlatform()
    state.portGroups = [
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'] },
      { id: 'vite', name: 'Vite', color: '#2F80ED', entries: ['5173-5175'] }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()
    runtime.dispatch('ports.pane.groups')
    runtime.setPortGroupSearch('vi')

    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')
    expect(runtime.handleShortcut('ArrowDown', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')
    expect(runtime.handleShortcut('Enter', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.group.apply')
    expect(runtime.snapshot().selectedPortGroupId).toBe('vite')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-group-search' })).toBe('ports.workspace.reset')
    expect(runtime.snapshot().portGroupSearch).toBe('')
    expect(runtime.snapshot().activePortPane).toBe('results')
  })

  it('filters result rows from the focused group and cleans that group through shortcuts', async () => {
    const { state, killed } = installPlatform()
    state.portGroups = [
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'] },
      { id: 'vite', name: 'Vite', color: '#2F80ED', entries: ['5173-5175'] }
    ]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.dispatch('ports.pane.groups').handled).toBe(true)
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.handleShortcut('ArrowDown', false)).toBe('list.down')
    expect(runtime.snapshot().focusedPortGroupId).toBe('vite')
    expect(runtime.handleShortcut('Enter', false)).toBe('ports.group.apply')
    expect(runtime.snapshot().filteredPorts.map((row) => row.id)).toEqual(['12:5174:tcp'])

    expect(runtime.handleShortcut('Ctrl+Shift+Enter', false)).toBe('ports.group.kill.force')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(killed).toEqual([{ pid: 12, port: 5174, force: true }])
  })

  it('cycles port panes with Tab shortcuts and keeps pane focus ready', async () => {
    const { state } = installPlatform()
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'] }]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.handleShortcut('Tab', false)).toBe('ports.pane.toggleNext')
    expect(runtime.snapshot().activePortPane).toBe('groups')
    expect(runtime.snapshot().focusedPortGroupId).toBe('web')

    expect(runtime.handleShortcut('Shift+Tab', false)).toBe('ports.pane.togglePrev')
    expect(runtime.snapshot().activePortPane).toBe('results')
    expect(runtime.snapshot().focusedPortId).toBe('11:3000:tcp')
  })

  it('targets Ctrl+F search focus to the active port pane', () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.dispatch('search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchFocusTarget).toBe('ports')

    runtime.dispatch('ports.pane.groups')
    expect(runtime.dispatch('search.focus').handled).toBe(true)
    expect(runtime.snapshot().searchFocusTarget).toBe('port-groups')
  })

  it('uses Escape to close group editing before clearing the active pane search', async () => {
    const { state } = installPlatform()
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'] }]
    const runtime = createAppRuntime(state)
    await runtime.scanPorts()

    runtime.focusPortGroup('web')
    runtime.dispatch('ports.group.edit')
    expect(runtime.snapshot().portGroupDraft).toMatchObject({ mode: 'edit', groupId: 'web' })
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.group.edit.cancel')
    expect(runtime.snapshot().portGroupDraft).toBeNull()

    runtime.setPortGroupSearch('web')
    expect(runtime.handleShortcut('Escape', false)).toBe('ports.workspace.reset')
    expect(runtime.snapshot().portGroupSearch).toBe('')
  })

  it('uses F2 for full group editing, Shift+F2 for rename, and isolates editor shortcuts', async () => {
    const { state } = installPlatform()
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'] }]
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
    state.portGroups = [{ id: 'web', name: 'Web', color: '#00A676', entries: ['3000'] }]
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

    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.drawer.close')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.selection.clear')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('ports.workspace.reset')
    expect(runtime.handleShortcut('Escape', { textInputFocused: true, activeInputRole: 'port-search' })).toBe('app.escape.idle')
  })

  it('uses Escape as a command stack for confirm, editor, drawers, selection, workspace, and idle', async () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))
    await runtime.scanPorts()

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
    expect(runtime.handleShortcut('Escape', false)).toBe('app.escape.idle')
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

  it('switches tabs through Ctrl+1/2/3 and ignores text input focus', () => {
    installPlatform()
    const runtime = createAppRuntime(createInitialState(100))

    expect(runtime.handleShortcut('Ctrl+2', false)).toBe('tab.select.favorites')
    expect(runtime.snapshot().state.activeTab).toBe('favorites')
    expect(runtime.handleShortcut('Ctrl+3', false)).toBe('tab.select.settings')
    expect(runtime.snapshot().state.activeTab).toBe('settings')
    expect(runtime.handleShortcut('Ctrl+1', true)).toBeNull()
    expect(runtime.snapshot().state.activeTab).toBe('settings')
  })

  it('copies selected favorite path and rejects group nodes without a path', async () => {
    const { copied } = installPlatform()
    const state = createInitialState(100)
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
    state.activeTab = 'favorites'
    const runtime = createAppRuntime(state)

    runtime.dispatch('favorites.pickAndAdd')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.snapshot().state.favorites).toHaveLength(1)
    expect(runtime.snapshot().state.favorites[0]).toMatchObject({ kind: 'folder', path: '/tmp/picked', name: 'picked' })
  })
})
