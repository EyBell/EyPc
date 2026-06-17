import { buildFavoriteTree, filterFavoriteTree, flattenFavoriteTree, reorderFavoriteNode } from '../domain/favorites'
import { dedupePortProcesses, filterPortProcesses, matchPortGroupProcesses, recordSearchHistory, shouldProcessMatchVerifiedPort } from '../domain/ports'
import { normalizeAppState } from '../domain/state'
import type { AppState, AppTabId, FavoriteNode, KillRequest, PortGroup, PortProcess } from '../domain/types'
import { getPlatform } from '../platform/eypcPlatform'
import { createActionRuntime } from './action/actionRuntime'
import type { RuntimeActionContext, RuntimeActionRisk } from './action/types'
import { buildEffectiveKeybindings, DEFAULT_KEYBINDINGS, resolveKeybinding } from './keybinding/keybindingRuntime'
import type { KeybindingContext } from './keybinding/keybindingRuntime'

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
  portDetail: PortDetailState
  portDetailTarget: PortProcess | null
  portDrawer: PortDrawerState
  portDrawerItems: PortDrawerItem[]
  searchOverlayOpen: boolean
  searchFocusRequestId: number
  searchFocusTarget: SearchFocusTarget
  portGroupDraft: PortGroupDraft | null
  focusedFavoriteId: string | null
  favoriteRows: ReturnType<typeof flattenFavoriteTree>
  message: string
  confirm: { title: string; detail: string; onConfirm: () => void } | null
}

export type PortPaneId = 'groups' | 'results'
export type SearchFocusTarget = 'ports' | 'port-groups' | 'favorites'
export type ActiveInputRole = NonNullable<KeybindingContext['activeInputRole']>
export type PortDrawerMode = 'single' | 'multi' | 'group'

export interface PortDetailState {
  open: boolean
  active: boolean
  targetId: string | null
}

export interface PortDrawerState {
  open: boolean
  active: boolean
  mode: PortDrawerMode
  activeIndex: number
  targetIds: string[]
}

export interface PortDrawerItem {
  commandId: string
  title: string
  description: string
  icon: string
  shortcutLabel: string
  risk: RuntimeActionRisk
  enabled: boolean
  args?: Record<string, unknown>
}

export interface ShortcutInputContext {
  textInputFocused: boolean
  activeInputRole?: ActiveInputRole
}

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
  let portDetail: PortDetailState = { open: false, active: false, targetId: null }
  let portDrawer: PortDrawerState = { open: false, active: false, mode: 'single', activeIndex: 0, targetIds: [] }
  let searchOverlayOpen = false
  let searchFocusRequestId = 0
  let searchFocusTarget: SearchFocusTarget = 'ports'
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
    const layerIds = [
      confirm ? 'confirm' : null,
      portGroupDraft ? 'port-group-editor' : null,
      portDetail.open ? 'port-detail' : null,
      portDrawer.open ? 'port-drawer' : null
    ].filter((item): item is string => Boolean(item))
    return {
      tab: state.activeTab,
      selectedIds: state.activeTab === 'ports' ? selectedPortIds : selectedFavoriteIds,
      layerIds,
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

  function focusPortPane(pane: PortPaneId) {
    activePortPane = pane
    if (pane === 'groups') {
      focusedPortGroupId = focusedPortGroupId || filterPortGroups()[0]?.id || null
      return
    }
    focusedPortId = focusedPortId || currentPortFilter().items[0]?.id || null
  }

  function togglePortPane() {
    if (activePortPane === 'results') {
      focusPortPane('groups')
    } else {
      focusPortPane('results')
    }
    notify()
    return true
  }

  function focusSearch() {
    if (state.activeTab === 'ports') {
      searchFocusTarget = activePortPane === 'groups' ? 'port-groups' : 'ports'
      ensurePortsScanned()
    } else if (state.activeTab === 'favorites') {
      searchFocusTarget = 'favorites'
    } else {
      searchFocusTarget = 'ports'
    }
    searchFocusRequestId += 1
    notify()
    return true
  }

  function normalizeFocusedPort() {
    const rows = currentPortFilter().items
    focusedPortId = focusedPortId && rows.some((item) => item.id === focusedPortId) ? focusedPortId : rows[0]?.id || null
  }

  function normalizeFocusedGroup() {
    const groups = filterPortGroups()
    focusedPortGroupId = focusedPortGroupId && groups.some((group) => group.id === focusedPortGroupId) ? focusedPortGroupId : groups[0]?.id || null
  }

  function resetPortWorkspace() {
    state.portSearch = ''
    portGroupSearch = ''
    selectedPortGroupId = null
    activePortPane = 'results'
    normalizeFocusedPort()
    save()
    notify()
  }

  function closePortDrawer(notifyChange = true) {
    portDrawer = { open: false, active: false, mode: portDrawer.mode, activeIndex: 0, targetIds: [] }
    if (notifyChange) notify()
    return true
  }

  function closePortDetail(notifyChange = true) {
    portDetail = { open: false, active: false, targetId: null }
    if (notifyChange) notify()
    return true
  }

  function openPortDetail() {
    if (activePortPane === 'groups') {
      setMessage('端口组没有进程详情')
      return false
    }
    normalizeFocusedPort()
    if (!focusedPortId) {
      setMessage('没有选中的端口进程')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    portDetail = { open: true, active: true, targetId: focusedPortId }
    notify()
    return true
  }

  function clearPortSelection() {
    selectedPortIds = []
    if (portDrawer.mode === 'multi') closePortDrawer(false)
    notify()
    return true
  }

  function shortcutLabelsFor(commandId: string) {
    const labels = buildEffectiveKeybindings(state.settings.keybindingOverrides)
      .filter((binding) => binding.actionId === commandId && !binding.disabled && binding.source !== 'removed')
      .map((binding) => binding.shortcutId)
    return [...new Set(labels)].join(' / ')
  }

  function drawerItem(
    commandId: string,
    title: string,
    description: string,
    icon: string,
    args?: Record<string, unknown>
  ): PortDrawerItem {
    const action = actions.get(commandId)
    return {
      commandId,
      title,
      description,
      icon,
      args,
      risk: action?.risk || 'normal',
      shortcutLabel: shortcutLabelsFor(commandId),
      enabled: Boolean(action?.when(context()))
    }
  }

  function inferPortDrawerState(): PortDrawerState | null {
    if (activePortPane === 'groups') {
      const group = focusedGroup()
      return group ? { open: true, active: true, mode: 'group', activeIndex: 0, targetIds: [group.id] } : null
    }
    if (selectedPortIds.length) {
      return { open: true, active: true, mode: 'multi', activeIndex: 0, targetIds: [...selectedPortIds] }
    }
    return focusedPortId ? { open: true, active: true, mode: 'single', activeIndex: 0, targetIds: [focusedPortId] } : null
  }

  function buildPortDrawerItems(drawer = portDrawer): PortDrawerItem[] {
    if (!drawer.open) return []
    if (drawer.mode === 'group') {
      const groupId = drawer.targetIds[0]
      return [
        drawerItem('ports.group.apply', '应用分组', '按当前端口组过滤结果列表。', 'filter', { groupId }),
        drawerItem('ports.group.kill.confirm', '终止组进程', '先确认，再终止组内当前监听进程。', 'stop', { groupId }),
        drawerItem('ports.group.kill.force', '强杀组进程', '跳过普通确认，但继续校验 PID 与端口。', 'bolt', { groupId }),
        drawerItem('ports.group.rename', '重命名', '打开分组名称编辑。', 'rename'),
        drawerItem('ports.group.edit', '编辑规则', '维护端口、区间或正则规则。', 'edit')
      ]
    }
    return [
      drawerItem('ports.kill.confirm', '终止确认', drawer.mode === 'multi' ? '确认后终止已选端口进程。' : '确认后终止当前端口进程。', 'stop'),
      drawerItem('ports.kill.force', '强杀', '直接执行强杀，并保留 PID + 端口双重校验。', 'bolt'),
      drawerItem('ports.group.createFromSelection', '收藏为组', '把当前目标端口写入新的端口组草稿。', 'bookmark'),
      drawerItem('ports.scan', '刷新扫描', '重新扫描本机监听端口。', 'refresh'),
      drawerItem('search.focus', '聚焦搜索', '回到当前栏搜索框。', 'search')
    ]
  }

  function openPortDrawer() {
    const inferred = inferPortDrawerState()
    if (!inferred) {
      setMessage(activePortPane === 'groups' ? '没有选中的端口组' : '没有选中的端口进程')
      return false
    }
    if (portDetail.open) closePortDetail(false)
    portDrawer = inferred
    notify()
    return true
  }

  function movePortDrawer(direction: 1 | -1) {
    if (!portDrawer.open) return false
    const items = buildPortDrawerItems()
    if (!items.length) return false
    portDrawer = {
      ...portDrawer,
      activeIndex: (portDrawer.activeIndex + direction + items.length) % items.length
    }
    notify()
    return true
  }

  function executePortDrawerItem(index = portDrawer.activeIndex, useInferredWhenClosed = false) {
    const drawer = portDrawer.open ? portDrawer : useInferredWhenClosed ? inferPortDrawerState() : null
    if (!drawer) return false
    const items = buildPortDrawerItems(drawer)
    const item = items[index]
    if (!item || !item.enabled) return false
    const result = actions.dispatch({ actionId: item.commandId, context: context(), args: item.args })
    if (portDrawer.open) closePortDrawer(false)
    notify()
    return result.handled
  }

  function syncSelectionDrawer() {
    if (selectedPortIds.length && portDrawer.open) {
      portDrawer = {
        open: true,
        active: portDrawer.active,
        mode: 'multi',
        activeIndex: Math.min(portDrawer.activeIndex, buildPortDrawerItems({ open: true, active: false, mode: 'multi', activeIndex: 0, targetIds: selectedPortIds }).length - 1),
        targetIds: [...selectedPortIds]
      }
      return
    }
    if (portDrawer.mode === 'multi') {
      closePortDrawer(false)
    }
  }

  function currentPortSelection(): PortProcess[] {
    const ids = portDrawer.open && portDrawer.mode !== 'group' && portDrawer.targetIds.length
      ? portDrawer.targetIds
      : portDetail.open && portDetail.active && portDetail.targetId ? [portDetail.targetId]
      : selectedPortIds.length ? selectedPortIds : focusedPortId ? [focusedPortId] : []
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
      const currentIndex = groups.findIndex((group) => group.id === focusedPortGroupId)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : groups.length
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
      const currentIndex = rows.findIndex((item) => item.id === focusedPortId)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedPortId = rows[next].id
      notify()
    }
  }

  function toggleFocusedSelection(advance = true) {
    if (state.activeTab === 'ports' && activePortPane === 'results' && focusedPortId) {
      const rows = currentPortFilter().items
      const currentIndex = rows.findIndex((item) => item.id === focusedPortId)
      selectedPortIds = selectedPortIds.includes(focusedPortId) ? selectedPortIds.filter((item) => item !== focusedPortId) : [...selectedPortIds, focusedPortId]
      if (advance && currentIndex >= 0 && currentIndex < rows.length - 1) {
        focusedPortId = rows[currentIndex + 1].id
      }
      syncSelectionDrawer()
      notify()
    }
  }

  async function scanPorts() {
    ports = dedupePortProcesses(await platform.ports.scan())
    const visibleIds = new Set(ports.map((item) => item.id))
    selectedPortIds = selectedPortIds.filter((id) => visibleIds.has(id))
    if (portDetail.targetId && !visibleIds.has(portDetail.targetId)) closePortDetail(false)
    normalizeFocusedPort()
    syncSelectionDrawer()
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

  function applyFocusedGroup(groupId?: unknown) {
    const group = typeof groupId === 'string'
      ? state.portGroups.find((item) => item.id === groupId) || null
      : focusedGroup()
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
    actions.register({ id: 'ports.pane.toggleNext', title: '切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    actions.register({ id: 'ports.pane.togglePrev', title: '反向切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    actions.register({ id: 'ports.pane.groups', title: '聚焦端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('groups'); notify(); return true } })
    actions.register({ id: 'ports.pane.results', title: '聚焦端口结果栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('results'); notify(); return true } })
    actions.register({ id: 'ports.group.apply', title: '应用端口组过滤', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => applyFocusedGroup(args?.groupId) })
    actions.register({ id: 'ports.group.kill.confirm', title: '终止当前端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(args?.groupId || focusedGroup()?.id); return true } })
    actions.register({ id: 'ports.group.kill.force', title: '强杀当前端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(args?.groupId || focusedGroup()?.id), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.group.createFromSelection', title: '选中端口收藏为组', group: '端口', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'ports', run: () => createGroupFromSelection() })
    actions.register({ id: 'ports.group.create', title: '新建端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'ports', run: () => { openGroupDraft(null); return true } })
    actions.register({ id: 'ports.group.rename', title: '重命名端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'ports', run: () => { const group = focusedGroup(); if (!group) return false; openGroupDraft(group); return true } })
    actions.register({ id: 'ports.group.edit', title: '编辑端口组规则', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+E', when: (ctx) => ctx.tab === 'ports', run: () => { const group = focusedGroup(); if (!group) return false; openGroupDraft(group); return true } })
    actions.register({ id: 'ports.group.delete', title: '删除端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: () => deleteFocusedGroup() })
    actions.register({ id: 'ports.drawer.open', title: '打开端口动作抽屉', description: '展示当前端口、选中端口或端口组的可执行动作。', icon: 'drawer', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => openPortDrawer() })
    actions.register({ id: 'ports.drawer.close', title: '关闭端口动作抽屉', description: '关闭右侧动作抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDrawer() })
    actions.register({ id: 'ports.detail.open', title: '打开端口详情抽屉', description: '展示当前高亮进程的端口、PID、命令和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => openPortDetail() })
    actions.register({ id: 'ports.detail.close', title: '关闭端口详情抽屉', description: '关闭左侧进程详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDetail() })
    actions.register({ id: 'ports.drawer.next', title: '抽屉内下移', description: '移动到下一个抽屉动作。', icon: 'down', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => movePortDrawer(1) })
    actions.register({ id: 'ports.drawer.prev', title: '抽屉内上移', description: '移动到上一个抽屉动作。', icon: 'up', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => movePortDrawer(-1) })
    actions.register({ id: 'ports.drawer.select', title: '执行抽屉当前动作', description: '执行右侧抽屉中当前高亮的动作。', icon: 'enter', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => executePortDrawerItem() })
    actions.register({ id: 'ports.selection.clear', title: '清空端口多选', description: '清空当前端口多选并关闭多选抽屉。', icon: 'clear', group: '端口', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'ports', run: () => clearPortSelection() })
    for (let index = 1; index <= 9; index += 1) {
      actions.register({
        id: `ports.drawer.select.${index}`,
        title: `执行抽屉第 ${index} 个动作`,
        description: '执行右侧抽屉中的指定序号动作。',
        icon: 'number',
        group: '端口',
        risk: 'normal',
        scope: 'layer',
        priority: 90 - index,
        shortcut: `Ctrl+${index}`,
        when: (ctx) => ctx.tab === 'ports',
        run: () => executePortDrawerItem(index - 1)
      })
      actions.register({
        id: `ports.drawer.action.${index}`,
        title: `直接执行第 ${index} 个端口动作`,
        description: '不打开抽屉，直接执行当前端口上下文的指定动作。',
        icon: 'number',
        group: '端口',
        risk: 'normal',
        scope: 'tab',
        priority: 80 - index,
        shortcut: `Ctrl+Alt+${index}`,
        when: (ctx) => ctx.tab === 'ports',
        run: () => executePortDrawerItem(index - 1, true)
      })
    }
    actions.register({ id: 'favorites.open', title: '打开收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Enter', when: (ctx) => ctx.tab === 'favorites', run: () => { const item = selectedFavorite(); if (item?.path) void platform.files.open(item.path); return true } })
    actions.register({ id: 'favorites.reveal', title: '定位收藏', group: '收藏', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'favorites', run: () => { const item = selectedFavorite(); if (item?.path) void platform.files.reveal(item.path); return true } })
    actions.register({ id: 'favorites.copyPath', title: '复制收藏路径', group: '收藏', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'favorites', run: () => { void copyFavoritePath(); return true } })
    actions.register({ id: 'favorites.pickAndAdd', title: '选择路径并收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'favorites', run: () => { void pickAndAddFavorite(); return true } })
    actions.register({ id: 'favorites.remove', title: '移出收藏', group: '收藏', risk: 'data-write', scope: 'tab', priority: 100, when: (ctx) => ctx.tab === 'favorites', run: () => { removeFavorite(); return true } })
    actions.register({ id: 'settings.open', title: '打开设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+Alt+Shift+S', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'search.focus', title: '聚焦搜索', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+F', when: () => true, run: () => focusSearch() })
  }

  registerActions()

  function normalizeShortcutInput(input: boolean | ShortcutInputContext): ShortcutInputContext {
    return typeof input === 'boolean' ? { textInputFocused: input } : input
  }

  function keybindingContext(input: ShortcutInputContext): KeybindingContext {
    return {
      tab: state.activeTab,
      confirmOpen: Boolean(confirm),
      textInputFocused: input.textInputFocused,
      activeInputRole: input.activeInputRole,
      portPane: activePortPane,
      portDrawerOpen: portDrawer.open,
      portDrawerActive: portDrawer.active,
      portDetailOpen: portDetail.open,
      portDetailActive: portDetail.active,
      portSelectionMode: selectedPortIds.length > 0
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot(): AppRuntimeSnapshot {
      const portFilter = currentPortFilter()
      const favoriteTree = filterFavoriteTree(state.favorites, { keyword: state.favoriteSearch, tags: [], groupId: null })
      const detailTarget = portDetail.targetId ? ports.find((item) => item.id === portDetail.targetId) || null : null
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
        portDetail,
        portDetailTarget: detailTarget,
        portDrawer,
        portDrawerItems: buildPortDrawerItems(),
        searchOverlayOpen,
        searchFocusRequestId,
        searchFocusTarget,
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
      normalizeFocusedPort()
      save()
      notify()
    },
    setPortGroupSearch(value: string) {
      portGroupSearch = value
      normalizeFocusedGroup()
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
      syncSelectionDrawer()
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
    handleShortcut(shortcutId: string, inputContext: boolean | ShortcutInputContext): string | null {
      const input = normalizeShortcutInput(inputContext)
      if (confirm && shortcutId === 'Escape') {
        confirm = null
        notify()
        return 'confirm.cancel'
      }
      if (portGroupDraft && shortcutId === 'Escape') {
        portGroupDraft = null
        notify()
        return 'ports.group.edit.cancel'
      }
      if (shortcutId === 'Escape') {
        if (state.activeTab === 'ports') {
          if (portDetail.open && portDetail.active) {
            closePortDetail()
            return 'ports.detail.close'
          }
          if (portDrawer.open && portDrawer.active) {
            closePortDrawer()
            return 'ports.drawer.close'
          }
          if (selectedPortIds.length) {
            clearPortSelection()
            return 'ports.selection.clear'
          }
          if (state.portSearch || portGroupSearch || selectedPortGroupId || activePortPane !== 'results') {
            resetPortWorkspace()
            return 'escape'
          }
          normalizeFocusedPort()
          notify()
          return 'escape'
        }
        if (state.activeTab === 'favorites' && state.favoriteSearch) this.setFavoriteSearch('')
        return 'escape'
      }
      const binding = resolveKeybinding(buildEffectiveKeybindings(state.settings.keybindingOverrides), shortcutId, keybindingContext(input))
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
