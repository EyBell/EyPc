import { buildFavoriteTree, filterFavoriteTree, flattenFavoriteTree, reorderFavoriteNode } from '../domain/favorites'
import { filterPortProcesses, recordSearchHistory, shouldProcessMatchVerifiedPort } from '../domain/ports'
import { normalizeAppState } from '../domain/state'
import type { AppState, AppTabId, FavoriteNode, KillRequest, PortProcess } from '../domain/types'
import { getPlatform } from '../platform/eypcPlatform'
import { createActionRuntime } from './action/actionRuntime'
import type { RuntimeActionContext } from './action/types'
import { buildEffectiveKeybindings, DEFAULT_KEYBINDINGS, resolveKeybinding } from './keybinding/keybindingRuntime'

export interface AppRuntimeSnapshot {
  state: AppState
  ports: PortProcess[]
  filteredPorts: PortProcess[]
  portSearchError: string | null
  selectedPortIds: string[]
  selectedFavoriteIds: string[]
  collapsedFavoriteIds: string[]
  focusedPortId: string | null
  focusedFavoriteId: string | null
  favoriteRows: ReturnType<typeof flattenFavoriteTree>
  message: string
  confirm: { title: string; detail: string; onConfirm: () => void } | null
}

export function createAppRuntime(initialState: AppState) {
  const platform = getPlatform()
  let state = normalizeAppState(initialState)
  let ports: PortProcess[] = []
  let selectedPortIds: string[] = []
  let selectedFavoriteIds: string[] = []
  let collapsedFavoriteIds: string[] = []
  let focusedPortId: string | null = null
  let focusedFavoriteId: string | null = null
  let message = ''
  let confirm: AppRuntimeSnapshot['confirm'] = null
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
      layerIds: confirm ? ['confirm'] : []
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

  async function scanPorts() {
    ports = await platform.ports.scan()
    const visibleIds = new Set(ports.map((item) => item.id))
    selectedPortIds = selectedPortIds.filter((id) => visibleIds.has(id))
    focusedPortId = focusedPortId && visibleIds.has(focusedPortId) ? focusedPortId : ports[0]?.id || null
    notify()
  }

  async function killPorts(force: boolean) {
    const targets = currentPortSelection()
    if (!targets.length) {
      setMessage('没有选中的端口进程')
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

  function registerActions() {
    actions.register({ id: 'ports.scan', title: '刷新端口', group: '端口', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'ports', run: () => { void scanPorts(); return true } })
    actions.register({ id: 'ports.kill.confirm', title: '终止选中进程', group: '端口', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: () => { confirmKill(); return true } })
    actions.register({ id: 'ports.kill.force', title: '强杀选中进程', group: '端口', risk: 'destructive', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'ports', run: () => { void killPorts(true); return true } })
    actions.register({ id: 'favorites.open', title: '打开收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites', run: () => { const item = selectedFavorite(); if (item?.path) void platform.files.open(item.path); return true } })
    actions.register({ id: 'favorites.reveal', title: '定位收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'favorites', run: () => { const item = selectedFavorite(); if (item?.path) void platform.files.reveal(item.path); return true } })
    actions.register({ id: 'favorites.remove', title: '移出收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites', run: () => { removeFavorite(); return true } })
    actions.register({ id: 'settings.open', title: '打开设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+Alt+Shift+S', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'search.focus', title: '聚焦搜索', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+F', when: () => true, run: () => true })
  }

  registerActions()

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot(): AppRuntimeSnapshot {
      const portFilter = filterPortProcesses(ports, state.portSearch)
      const favoriteTree = filterFavoriteTree(state.favorites, { keyword: state.favoriteSearch, tags: [], groupId: null })
      return {
        state,
        ports,
        filteredPorts: portFilter.items,
        portSearchError: portFilter.error,
        selectedPortIds,
        selectedFavoriteIds,
        collapsedFavoriteIds,
        focusedPortId,
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
      save()
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
      focusedPortId = id
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
        textInputFocused
      })
      if (!binding) return null
      if (binding.actionId === 'tab.next' || binding.actionId === 'tab.prev') {
        const order: AppTabId[] = ['ports', 'favorites', 'settings']
        const current = order.indexOf(state.activeTab)
        const offset = binding.actionId === 'tab.next' ? 1 : -1
        setTab(order[(current + offset + order.length) % order.length])
        return binding.actionId
      }
      actions.dispatch({ actionId: binding.actionId, context: context() })
      return binding.actionId
    },
    defaultKeybindings: DEFAULT_KEYBINDINGS
  }
}
