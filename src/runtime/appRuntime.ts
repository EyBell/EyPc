import { buildFavoriteTree, filterFavoriteTree, flattenFavoriteTree, reorderFavoriteNode } from '../domain/favorites'
import { filterPortProcesses, matchPortGroupProcesses, recordSearchHistory, shouldProcessMatchVerifiedPort } from '../domain/ports'
import { normalizeAppState } from '../domain/state'
import type { AppState, AppTabId, FavoriteNode, KillRequest, PortGroup, PortProcess } from '../domain/types'
import { getPlatform } from '../platform/eypcPlatform'
import { createActionRuntime } from './action/actionRuntime'
import type { RuntimeActionContext } from './action/types'
import { buildEffectiveKeybindings, DEFAULT_KEYBINDINGS, resolveKeybinding } from './keybinding/keybindingRuntime'

export interface AppRuntimeSnapshot {
  state: AppState
  ports: PortProcess[]
  filteredPorts: PortProcess[]
  filteredPortGroups: PortGroup[]
  portSearchError: string | null
  selectedPortIds: string[]
  selectedFavoriteIds: string[]
  collapsedFavoriteIds: string[]
  focusedPortId: string | null
  focusedPortGroupId: string | null
  selectedPortGroupId: string | null
  activePortPane: PortPaneId
  portGroupSearch: string
  searchOverlayOpen: boolean
  searchFocusRequestId: number
  portGroupDraft: PortGroupDraft | null
  focusedFavoriteId: string | null
  favoriteRows: ReturnType<typeof flattenFavoriteTree>
  message: string
  confirm: { title: string; detail: string; onConfirm: () => void } | null
}

export type PortPaneId = 'groups' | 'results'

export interface PortGroupDraft {
  mode: 'create' | 'edit'
  groupId: string | null
  name: string
  entriesText: string
  color: string
}

export function createAppRuntime(initialState: AppState) {
  const platform = getPlatform()
  let state = normalizeAppState(initialState)
  let ports: PortProcess[] = []
  let selectedPortIds: string[] = []
  let selectedFavoriteIds: string[] = []
  let collapsedFavoriteIds: string[] = []
  let focusedPortId: string | null = null
  let focusedPortGroupId: string | null = null
  let selectedPortGroupId: string | null = null
  let activePortPane: PortPaneId = 'results'
  let portGroupSearch = ''
  let searchOverlayOpen = false
  let searchFocusRequestId = 0
  let portGroupDraft: PortGroupDraft | null = null
  let focusedFavoriteId: string | null = null
  let message = ''
  let confirm: AppRuntimeSnapshot['confirm'] = null
  let scanInFlight: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const undoStack: AppState[] = []
  const actions = createActionRuntime({
    captureSnapshot: () => normalizeAppState(state),
    commitSnapshot: (snapshot) => {
      undoStack.push(normalizeAppState(snapshot))
    }
  })

  function notify() {
    listeners.forEach((listener) => listener())
  }

  function save() {
    state.updatedAt = Date.now()
    platform.storage.setState(state)
  }

  function context(): RuntimeActionContext {
    return {
      tab: state.activeTab,
      selectedIds: state.activeTab === 'ports' ? selectedPortIds : selectedFavoriteIds,
      layerIds: confirm ? ['confirm'] : [],
      portPane: activePortPane
    }
  }

  function setMessage(value: string) {
    message = value
    notify()
  }

  function setTab(tab: AppTabId) {
    state.activeTab = tab
    save()
    notify()
  }

  function currentPortSelection(): PortProcess[] {
    const ids = selectedPortIds.length ? selectedPortIds : focusedPortId ? [focusedPortId] : []
    return ids.flatMap((id) => ports.find((item) => item.id === id) || [])
  }

  function currentPortGroupSelection(groupId: unknown): PortProcess[] {
    if (typeof groupId !== 'string') return []
    const group = state.portGroups.find((item) => item.id === groupId)
    if (!group) return []
    return matchPortGroupProcesses(ports, group)
  }

  function focusedGroup(): PortGroup | null {
    const id = focusedPortGroupId || selectedPortGroupId
    return id ? state.portGroups.find((group) => group.id === id) || null : null
  }

  function filterPortGroups(): PortGroup[] {
    const query = portGroupSearch.trim()
    if (!query) return [...state.portGroups]
    try {
      const regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/)
      const regex = regexMatch ? new RegExp(regexMatch[1], regexMatch[2].replace('g', '')) : null
      return state.portGroups.filter((group) => {
        const text = [group.name, group.id, group.entries.join(' ')].join(' ')
        if (regex) {
          regex.lastIndex = 0
          return regex.test(text)
        }
        return text.toLowerCase().includes(query.toLowerCase())
      })
    } catch {
      return [...state.portGroups]
    }
  }

  function currentPortFilter() {
    const group = selectedPortGroupId ? state.portGroups.find((item) => item.id === selectedPortGroupId) : null
    const scopedPorts = group ? matchPortGroupProcesses(ports, group) : ports
    return filterPortProcesses(scopedPorts, state.portSearch)
  }

  function moveInList(direction: 1 | -1, page = false) {
    if (state.activeTab === 'ports' && activePortPane === 'groups') {
      const groups = filterPortGroups()
      if (!groups.length) {
        focusedPortGroupId = null
        notify()
        return
      }
      const current = Math.max(0, groups.findIndex((group) => group.id === focusedPortGroupId))
      const next = Math.min(groups.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedPortGroupId = groups[next].id
      notify()
      return
    }
    if (state.activeTab === 'ports') {
      const rows = currentPortFilter().items
      if (!rows.length) {
        focusedPortId = null
        notify()
        return
      }
      const current = Math.max(0, rows.findIndex((item) => item.id === focusedPortId))
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedPortId = rows[next].id
      notify()
    }
  }

  function toggleFocusedSelection() {
    if (state.activeTab === 'ports' && activePortPane === 'results' && focusedPortId) {
      selectedPortIds = selectedPortIds.includes(focusedPortId) ? selectedPortIds.filter((item) => item !== focusedPortId) : [...selectedPortIds, focusedPortId]
      notify()
    }
  }

  async function scanPorts() {
    ports = await platform.ports.scan()
    const visibleIds = new Set(ports.map((item) => item.id))
    selectedPortIds = selectedPortIds.filter((id) => visibleIds.has(id))
    focusedPortId = focusedPortId && visibleIds.has(focusedPortId) ? focusedPortId : ports[0]?.id || null
    notify()
  }

  function ensurePortsScanned() {
    if (ports.length || scanInFlight) return
    scanInFlight = scanPorts().finally(() => {
      scanInFlight = null
    })
  }

  async function killPortTargets(targets: PortProcess[], force: boolean, emptyMessage = '没有选中的端口进程') {
    if (!targets.length) {
      setMessage(emptyMessage)
      return
    }
    const current = await platform.ports.scan()
    const verified = targets.filter((target) => shouldProcessMatchVerifiedPort(target, current))
    if (!verified.length) {
      setMessage('选中进程已不再占用目标端口')
      await scanPorts()
      return
    }
    const results = await Promise.all(verified.map((target) => platform.ports.kill({ pid: target.pid, port: target.port, force } satisfies KillRequest)))
    const okCount = results.filter((item) => item.ok).length
    setMessage(`${force ? '强杀' : '终止'}完成：${okCount}/${results.length}`)
    await scanPorts()
  }

  async function killPorts(force: boolean) {
    await killPortTargets(currentPortSelection(), force)
  }

  function confirmKill() {
    const targets = currentPortSelection()
    if (!targets.length) {
      setMessage('没有选中的端口进程')
      return
    }
    confirm = {
      title: '终止端口进程',
      detail: `确认终止 ${targets.length} 个进程？失败后可使用 Ctrl+Enter 强杀。`,
      onConfirm: () => {
        confirm = null
        void killPorts(false)
      }
    }
    notify()
  }

  function confirmKillGroup(groupId: unknown) {
    const targets = currentPortGroupSelection(groupId)
    if (!targets.length) {
      setMessage('组内端口当前无监听进程')
      return
    }
    confirm = {
      title: '终止端口组进程',
      detail: `确认终止组内 ${targets.length} 个进程？失败后可使用强杀组。`,
      onConfirm: () => {
        confirm = null
        void killPortTargets(targets, false, '组内端口当前无监听进程')
      }
    }
    notify()
  }

  function applyFocusedGroup() {
    const group = focusedGroup()
    if (!group) {
      setMessage('没有选中的端口组')
      return false
    }
    selectedPortGroupId = group.id
    const rows = currentPortFilter().items
    focusedPortId = rows[0]?.id || null
    selectedPortIds = selectedPortIds.filter((id) => rows.some((item) => item.id === id))
    notify()
    return true
  }

  function openGroupDraft(group: PortGroup | null) {
    portGroupDraft = group
      ? { mode: 'edit', groupId: group.id, name: group.name, entriesText: group.entries.join('\n'), color: group.color }
      : { mode: 'create', groupId: null, name: '', entriesText: '', color: '#00A676' }
    notify()
  }

  function createGroupFromSelection() {
    const targets = currentPortSelection()
    if (!targets.length) {
      setMessage('没有选中的端口进程')
      return false
    }
    const portsText = [...new Set(targets.map((item) => String(item.port)))].join('\n')
    portGroupDraft = {
      mode: 'create',
      groupId: null,
      name: `端口分组 ${state.portGroups.length + 1}`,
      entriesText: portsText,
      color: '#00A676'
    }
    notify()
    return true
  }

  function deleteFocusedGroup() {
    const group = focusedGroup()
    if (!group) {
      setMessage('没有选中的端口组')
      return false
    }
    state.portGroups = state.portGroups.filter((item) => item.id !== group.id)
    if (selectedPortGroupId === group.id) selectedPortGroupId = null
    focusedPortGroupId = state.portGroups[0]?.id || null
    save()
    notify()
    return true
  }

  function selectedFavorite(): FavoriteNode | null {
    const id = selectedFavoriteIds[0] || focusedFavoriteId
    return id ? state.favorites.find((item) => item.id === id) || null : null
  }

  function addFavorite(input: Pick<FavoriteNode, 'kind' | 'path' | 'name' | 'parentId' | 'tags' | 'color'>) {
    const now = Date.now()
    state.favorites.push({
      id: `fav:${now}:${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      path: input.kind === 'group' ? '' : input.path.trim(),
      name: input.name.trim() || input.path.split(/[\\/]/).filter(Boolean).pop() || '未命名',
      parentId: input.parentId || null,
      tags: input.tags,
      color: input.color || '#6B7280',
      sortOrder: state.favorites.length + 1,
      createdAt: now,
      updatedAt: now
    })
    save()
    notify()
  }

  function removeFavorite() {
    const ids = selectedFavoriteIds.length ? selectedFavoriteIds : focusedFavoriteId ? [focusedFavoriteId] : []
    if (!ids.length) return
    const deleting = new Set(ids)
    state.favorites = state.favorites.filter((item) => !deleting.has(item.id))
    selectedFavoriteIds = []
    focusedFavoriteId = state.favorites[0]?.id || null
    save()
    notify()
  }

  async function copyFavoritePath() {
    const item = selectedFavorite()
    if (!item) {
      setMessage('没有选中的收藏')
      return
    }
    if (!item.path) {
      setMessage('分组节点没有可复制路径')
      return
    }
    const ok = await platform.files.copyPath(item.path)
    setMessage(ok ? '路径已复制' : '复制路径失败')
  }

  async function pickAndAddFavorite() {
    const picked = await platform.files.pickFavorite?.()
    if (!picked) {
      setMessage('当前宿主不可选择路径，请手填路径')
      return
    }
    addFavorite(picked)
    setMessage('已添加收藏')
  }

  function registerActions() {
    actions.register({ id: 'tab.select.ports', title: '切到端口进程', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+1', when: () => true, run: () => { setTab('ports'); return true } })
    actions.register({ id: 'tab.select.favorites', title: '切到文件收藏', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+2', when: () => true, run: () => { setTab('favorites'); return true } })
    actions.register({ id: 'tab.select.settings', title: '切到设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+3', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'ports.scan', title: '刷新端口', group: '端口', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'ports', run: () => { void scanPorts(); return true } })
    actions.register({ id: 'ports.kill.confirm', title: '终止选中进程', group: '端口', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: () => { confirmKill(); return true } })
    actions.register({ id: 'ports.kill.force', title: '强杀选中进程', group: '端口', risk: 'destructive', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'ports', run: () => { void killPorts(true); return true } })
    actions.register({ id: 'ports.killGroup.confirm', title: '终止端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(args?.groupId); return true } })
    actions.register({ id: 'ports.killGroup.force', title: '强杀端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(args?.groupId), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.pane.groups', title: '聚焦端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => { activePortPane = 'groups'; focusedPortGroupId = focusedPortGroupId || filterPortGroups()[0]?.id || null; notify(); return true } })
    actions.register({ id: 'ports.pane.results', title: '聚焦端口结果栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => { activePortPane = 'results'; focusedPortId = focusedPortId || currentPortFilter().items[0]?.id || null; notify(); return true } })
    actions.register({ id: 'ports.group.apply', title: '应用端口组过滤', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: () => applyFocusedGroup() })
    actions.register({ id: 'ports.group.kill.confirm', title: '终止当前端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: () => { confirmKillGroup(focusedGroup()?.id); return true } })
    actions.register({ id: 'ports.group.kill.force', title: '强杀当前端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: () => { void killPortTargets(currentPortGroupSelection(focusedGroup()?.id), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.group.createFromSelection', title: '选中端口收藏为组', group: '端口', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'ports', run: () => createGroupFromSelection() })
    actions.register({ id: 'ports.group.create', title: '新建端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'ports', run: () => { openGroupDraft(null); return true } })
    actions.register({ id: 'ports.group.rename', title: '重命名端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'ports', run: () => { const group = focusedGroup(); if (!group) return false; openGroupDraft(group); return true } })
    actions.register({ id: 'ports.group.edit', title: '编辑端口组规则', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+E', when: (ctx) => ctx.tab === 'ports', run: () => { const group = focusedGroup(); if (!group) return false; openGroupDraft(group); return true } })
    actions.register({ id: 'ports.group.delete', title: '删除端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: () => deleteFocusedGroup() })
    actions.register({ id: 'favorites.open', title: '打开收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites', run: () => { const item = selectedFavorite(); if (item?.path) void platform.files.open(item.path); return true } })
    actions.register({ id: 'favorites.reveal', title: '定位收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'favorites', run: () => { const item = selectedFavorite(); if (item?.path) void platform.files.reveal(item.path); return true } })
    actions.register({ id: 'favorites.copyPath', title: '复制收藏路径', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'favorites', run: () => { void copyFavoritePath(); return true } })
    actions.register({ id: 'favorites.pickAndAdd', title: '选择路径并收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'favorites', run: () => { void pickAndAddFavorite(); return true } })
    actions.register({ id: 'favorites.remove', title: '移出收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites', run: () => { removeFavorite(); return true } })
    actions.register({ id: 'settings.open', title: '打开设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+Alt+Shift+S', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'search.focus', title: '聚焦搜索', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+F', when: () => true, run: () => { searchFocusRequestId += 1; ensurePortsScanned(); notify(); return true } })
  }

  registerActions()

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot(): AppRuntimeSnapshot {
      const portFilter = currentPortFilter()
      const favoriteTree = filterFavoriteTree(state.favorites, { keyword: state.favoriteSearch, tags: [], groupId: null })
      return {
        state,
        ports,
        filteredPorts: portFilter.items,
        filteredPortGroups: filterPortGroups(),
        portSearchError: portFilter.error,
        selectedPortIds,
        selectedFavoriteIds,
        collapsedFavoriteIds,
        focusedPortId,
        focusedPortGroupId,
        selectedPortGroupId,
        activePortPane,
        portGroupSearch,
        searchOverlayOpen,
        searchFocusRequestId,
        portGroupDraft,
        focusedFavoriteId,
        favoriteRows: flattenFavoriteTree(favoriteTree, collapsedFavoriteIds),
        message,
        confirm
      }
    },
    actions: actions.all,
    scanPorts,
    setTab,
    setPortSearch(value: string) {
      state.portSearch = value
      state.portSearchHistory = recordSearchHistory(state.portSearchHistory, value)
      ensurePortsScanned()
      save()
      notify()
    },
    setPortGroupSearch(value: string) {
      portGroupSearch = value
      const groups = filterPortGroups()
      focusedPortGroupId = focusedPortGroupId && groups.some((group) => group.id === focusedPortGroupId) ? focusedPortGroupId : groups[0]?.id || null
      notify()
    },
    setFavoriteSearch(value: string) {
      state.favoriteSearch = value
      state.favoriteSearchHistory = recordSearchHistory(state.favoriteSearchHistory, value)
      save()
      notify()
    },
    togglePortSelection(id: string) {
      focusedPortId = id
      selectedPortIds = selectedPortIds.includes(id) ? selectedPortIds.filter((item) => item !== id) : [...selectedPortIds, id]
      notify()
    },
    focusPort(id: string) {
      activePortPane = 'results'
      focusedPortId = id
      notify()
    },
    focusPortGroup(id: string) {
      activePortPane = 'groups'
      focusedPortGroupId = id
      notify()
    },
    focusFavorite(id: string) {
      focusedFavoriteId = id
      notify()
    },
    toggleFavoriteSelection(id: string) {
      focusedFavoriteId = id
      selectedFavoriteIds = selectedFavoriteIds.includes(id) ? selectedFavoriteIds.filter((item) => item !== id) : [...selectedFavoriteIds, id]
      notify()
    },
    toggleFavoriteCollapse(id: string) {
      collapsedFavoriteIds = collapsedFavoriteIds.includes(id) ? collapsedFavoriteIds.filter((item) => item !== id) : [...collapsedFavoriteIds, id]
      notify()
    },
    reorderFavorite(nodeId: string, parentId: string | null, beforeNodeId: string | null) {
      state.favorites = reorderFavoriteNode(state.favorites, nodeId, parentId, beforeNodeId)
      save()
      notify()
    },
    addFavorite,
    removeFavorite,
    savePortGroupDraft(input: { name: string; entriesText: string; color: string }) {
      const draft = portGroupDraft
      if (!draft) return
      const entries = [...new Set(input.entriesText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
      if (!input.name.trim() || !entries.length) {
        setMessage('端口组名称和规则不能为空')
        return
      }
      if (draft.mode === 'edit' && draft.groupId) {
        state.portGroups = state.portGroups.map((group) => group.id === draft.groupId ? { ...group, name: input.name.trim(), color: input.color || '#00A676', entries } : group)
        focusedPortGroupId = draft.groupId
      } else {
        const id = `group:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
        state.portGroups.push({ id, name: input.name.trim(), color: input.color || '#00A676', entries })
        focusedPortGroupId = id
      }
      portGroupDraft = null
      save()
      notify()
    },
    cancelPortGroupDraft() {
      portGroupDraft = null
      notify()
    },
    closeSearchOverlay() {
      searchOverlayOpen = false
      notify()
    },
    updateKeybinding(commandId: string, shortcutId: string, disabled = false) {
      state.settings.keybindingOverrides = state.settings.keybindingOverrides.filter((item) => item.commandId !== commandId)
      state.settings.keybindingOverrides.push({ commandId, shortcutId, source: disabled ? 'removed' : 'user', disabled })
      save()
      notify()
    },
    resetKeybinding(commandId: string) {
      state.settings.keybindingOverrides = state.settings.keybindingOverrides.filter((item) => item.commandId !== commandId)
      save()
      notify()
    },
    cancelConfirm() {
      confirm = null
      notify()
    },
    confirmNow() {
      const next = confirm
      confirm = null
      notify()
      next?.onConfirm()
    },
    dispatch(actionId: string, args?: Record<string, unknown>) {
      return actions.dispatch({ actionId, context: context(), args })
    },
    handleShortcut(shortcutId: string, textInputFocused: boolean): string | null {
      if (confirm && shortcutId === 'Escape') {
        confirm = null
        notify()
        return 'confirm.cancel'
      }
      if (shortcutId === 'Escape') {
        if (state.activeTab === 'ports' && state.portSearch) this.setPortSearch('')
        if (state.activeTab === 'favorites' && state.favoriteSearch) this.setFavoriteSearch('')
        return 'escape'
      }
      const binding = resolveKeybinding(buildEffectiveKeybindings(state.settings.keybindingOverrides), shortcutId, {
        tab: state.activeTab,
        confirmOpen: Boolean(confirm),
        textInputFocused,
        portPane: activePortPane
      })
      if (!binding) return null
      if (binding.actionId === 'tab.next' || binding.actionId === 'tab.prev') {
        const order: AppTabId[] = ['ports', 'favorites', 'settings']
        const current = order.indexOf(state.activeTab)
        const offset = binding.actionId === 'tab.next' ? 1 : -1
        setTab(order[(current + offset + order.length) % order.length])
        return binding.actionId
      }
      if (binding.actionId.startsWith('tab.select.')) {
        const tab = binding.actionId.replace('tab.select.', '') as AppTabId
        if (['ports', 'favorites', 'settings'].includes(tab)) setTab(tab)
        return binding.actionId
      }
      if (binding.actionId === 'list.up') {
        moveInList(-1)
        return binding.actionId
      }
      if (binding.actionId === 'list.down') {
        moveInList(1)
        return binding.actionId
      }
      if (binding.actionId === 'list.pageUp') {
        moveInList(-1, true)
        return binding.actionId
      }
      if (binding.actionId === 'list.pageDown') {
        moveInList(1, true)
        return binding.actionId
      }
      if (binding.actionId === 'list.toggleSelection') {
        toggleFocusedSelection()
        return binding.actionId
      }
      actions.dispatch({ actionId: binding.actionId, context: context() })
      return binding.actionId
    },
    defaultKeybindings: DEFAULT_KEYBINDINGS
  }
}
