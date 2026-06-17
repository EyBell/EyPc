import { buildFavoriteTree, filterFavoriteTree, flattenFavoriteTree, reorderFavoriteNode } from '../domain/favorites'
import { dedupePortProcesses, filterPortProcesses, flattenPortGroupTargets, matchPortGroupProcesses, matchPortGroupTargetProcesses, movePortGroupToFolder, shouldProcessMatchVerifiedPort } from '../domain/ports'
import { filterSearchHistoryItems, historyForTarget, recordSearchHistory, updateHistoryForTarget, type SearchHistoryTarget } from '../domain/searchHistory'
import { normalizeAppState } from '../domain/state'
import { formatShortcutList } from '../domain/shortcuts'
import type { AppState, AppTabId, FavoriteNode, KillRequest, PortGroup, PortGroupFolder, PortGroupTarget, PortProcess, ShortcutProfileId } from '../domain/types'
import type { PortGroupTreeRow } from '../domain/ports'
import { getPlatform } from '../platform/eypcPlatform'
import { createActionRuntime } from './action/actionRuntime'
import type { RuntimeActionContext, RuntimeActionRisk } from './action/types'
import { visibleFeatures } from './feature/featureRegistry'
import { buildEffectiveKeybindings, DEFAULT_KEYBINDINGS, normalizeShortcutId, resolveKeybinding } from './keybinding/keybindingRuntime'
import type { KeybindingContext } from './keybinding/keybindingRuntime'

export interface AppRuntimeSnapshot {
  state: AppState
  ports: PortProcess[]
  filteredPorts: PortProcess[]
  filteredPortGroups: PortGroup[]
  portGroupRows: PortGroupTreeRow[]
  selectedPortGroupTarget: PortGroupTarget | null
  portSearchError: string | null
  selectedPortIds: string[]
  selectedFavoriteIds: string[]
  collapsedFavoriteIds: string[]
  focusedPortId: string | null
  focusedPortGroupId: string | null
  focusedPortGroupTarget: PortGroupTarget | null
  selectedPortGroupId: string | null
  activePortPane: PortPaneId
  portGroupSearch: string
  groupSidePanelOpen: boolean
  portDetail: PortDetailState
  portDetailTarget: PortProcess | null
  portGroupDetail: PortGroupDetailState
  portGroupDetailTarget: PortGroupTreeRow | null
  portDrawer: PortDrawerState
  portDrawerItems: PortDrawerItem[]
  searchOverlayOpen: boolean
  searchFocusRequestId: number
  searchBlurRequestId: number
  groupPanelFocusRequestId: number
  listFocusRequestId: number
  listFocusTarget: PortPaneId | null
  searchFocusTarget: SearchFocusTarget
  portGroupDraft: PortGroupDraft | null
  focusedFavoriteId: string | null
  favoriteRows: ReturnType<typeof flattenFavoriteTree>
  message: string
  confirm: { title: string; detail: string; onConfirm: () => void } | null
  commandShortcutLabels: Record<string, string>
  searchHistoryState: SearchHistoryState
}

export type PortPaneId = 'groups' | 'results'
export type SearchFocusTarget = 'ports' | 'port-groups' | 'favorites'
export type ActiveInputRole = NonNullable<KeybindingContext['activeInputRole']>
export type PortDrawerMode = 'single' | 'multi' | 'group'

export interface SearchHistoryState {
  target: SearchHistoryTarget | null
  open: boolean
  activeIndex: number
  items: string[]
}

export interface PortDetailState {
  open: boolean
  active: boolean
  targetId: string | null
}

export interface PortGroupDetailState {
  open: boolean
  active: boolean
  target: PortGroupTarget | null
}

export interface PortDrawerState {
  open: boolean
  active: boolean
  mode: PortDrawerMode
  activeIndex: number
  targetIds: string[]
  groupTarget: PortGroupTarget | null
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

export interface KeybindingUpdateInput {
  commandId: string
  shortcutId?: string
  shortcutIds?: string[]
  enabled?: boolean
  when?: string
  disabled?: boolean
  profileId?: ShortcutProfileId
}

export interface PortGroupDraft {
  mode: 'create' | 'edit' | 'rename'
  groupId: string | null
  name: string
  entriesText: string
  color: string
  folderId: string | null
  activeField: PortGroupDraftField
}

export type PortGroupDraftField = 'name' | 'entries' | 'color' | 'folder'

export function createAppRuntime(initialState: AppState) {
  const platform = getPlatform()
  let state = normalizeAppState(initialState)
  let ports: PortProcess[] = []
  let selectedPortIds: string[] = []
  let selectedFavoriteIds: string[] = []
  let collapsedFavoriteIds: string[] = []
  let focusedPortId: string | null = null
  let focusedPortGroupId: string | null = null
  let focusedPortGroupTarget: PortGroupTarget | null = null
  let selectedPortGroupId: string | null = null
  let selectedPortGroupTarget: PortGroupTarget | null = null
  let activePortPane: PortPaneId = 'results'
  let portGroupSearch = ''
  let groupSidePanelOpen = true
  let portDetail: PortDetailState = { open: false, active: false, targetId: null }
  let portGroupDetail: PortGroupDetailState = { open: false, active: false, target: null }
  let portDrawer: PortDrawerState = { open: false, active: false, mode: 'single', activeIndex: 0, targetIds: [], groupTarget: null }
  let searchOverlayOpen = false
  let searchFocusRequestId = 0
  let searchBlurRequestId = 0
  let groupPanelFocusRequestId = 0
  let listFocusRequestId = 0
  let listFocusTarget: PortPaneId | null = null
  let searchFocusTarget: SearchFocusTarget = 'ports'
  let searchHistoryTarget: SearchHistoryTarget | null = null
  let searchHistoryOpen = false
  let searchHistoryActiveIndex = -1
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

  function syncLegacySearchHistories() {
    state.portSearchHistory = state.searchHistories.ports.processes
    state.favoriteSearchHistory = state.searchHistories.favorites.files
  }

  function context(): RuntimeActionContext {
    const layerIds = [
      confirm ? 'confirm' : null,
      portGroupDraft ? 'port-group-editor' : null,
      portGroupDetail.open ? 'port-group-detail' : null,
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

  function requestListFocus(target: PortPaneId) {
    listFocusTarget = target
    listFocusRequestId += 1
  }

  function targetKey(target: PortGroupTarget): string {
    return `${target.kind}:${target.id}`
  }

  function sameTarget(left: PortGroupTarget | null, right: PortGroupTarget | null): boolean {
    return Boolean(left && right && left.kind === right.kind && left.id === right.id)
  }

  function filterPortGroupRows(): PortGroupTreeRow[] {
    return flattenPortGroupTargets(state.portGroups, state.portGroupFolders, state.collapsedPortGroupFolderIds, portGroupSearch)
  }

  function rowForGroupTarget(target: PortGroupTarget | null): PortGroupTreeRow | null {
    if (!target) return null
    return filterPortGroupRows().find((row) => sameTarget(row.target, target)) || null
  }

  function setTab(tab: AppTabId) {
    state.activeTab = tab
    save()
    notify()
  }

  function focusPortPane(pane: PortPaneId) {
    activePortPane = pane
    if (pane === 'groups') {
      groupSidePanelOpen = true
      focusedPortGroupTarget = focusedPortGroupTarget || filterPortGroupRows()[0]?.target || null
      focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
      return
    }
    focusedPortId = focusedPortId || null
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

  function toggleGroupPanel() {
    groupSidePanelOpen = !groupSidePanelOpen
    if (groupSidePanelOpen) {
      activePortPane = 'groups'
      normalizeFocusedGroup()
      groupPanelFocusRequestId += 1
    } else {
      activePortPane = 'results'
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      if (portGroupDetail.open) closePortGroupDetail(false)
      if (portDrawer.open && portDrawer.mode === 'group') closePortDrawer(false)
    }
    notify()
    return true
  }

  function focusSearch() {
    if (state.activeTab === 'ports') {
      return focusPortSearch()
    } else if (state.activeTab === 'favorites') {
      searchFocusTarget = 'favorites'
      openSearchHistory('favorites.files')
    } else {
      searchFocusTarget = 'ports'
    }
    searchFocusRequestId += 1
    notify()
    return true
  }

  function focusPortSearch() {
    state.activeTab = 'ports'
    activePortPane = 'results'
    searchFocusTarget = 'ports'
    openSearchHistory('ports.processes')
    ensurePortsScanned()
    searchFocusRequestId += 1
    notify()
    return true
  }

  function focusPortGroupSearch() {
    state.activeTab = 'ports'
    groupSidePanelOpen = true
    activePortPane = 'groups'
    searchFocusTarget = 'port-groups'
    openSearchHistory('ports.groups')
    normalizeFocusedGroup()
    searchFocusRequestId += 1
    notify()
    return true
  }

  function normalizeFocusedPort(allowInitial = true) {
    const rows = currentPortFilter().items
    focusedPortId = focusedPortId && rows.some((item) => item.id === focusedPortId) ? focusedPortId : allowInitial ? rows[0]?.id || null : null
  }

  function normalizeFocusedGroup() {
    const rows = filterPortGroupRows()
    const currentKey = focusedPortGroupTarget ? targetKey(focusedPortGroupTarget) : ''
    focusedPortGroupTarget = rows.some((row) => targetKey(row.target) === currentKey) ? focusedPortGroupTarget : rows[0]?.target || null
    focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
  }

  function resetPortWorkspace() {
    state.portSearch = ''
    portGroupSearch = ''
    selectedPortGroupId = null
    selectedPortGroupTarget = null
    activePortPane = 'results'
    searchBlurRequestId += 1
    normalizeFocusedPort(Boolean(state.portSearch || selectedPortGroupTarget || selectedPortGroupId))
    save()
    notify()
  }

  function closePortDrawer(notifyChange = true) {
    portDrawer = { open: false, active: false, mode: portDrawer.mode, activeIndex: 0, targetIds: [], groupTarget: null }
    if (notifyChange) notify()
    return true
  }

  function closePortDetail(notifyChange = true) {
    portDetail = { open: false, active: false, targetId: null }
    if (notifyChange) notify()
    return true
  }

  function closePortGroupDetail(notifyChange = true) {
    portGroupDetail = { open: false, active: false, target: null }
    if (notifyChange) notify()
    return true
  }

  function openPortDetail() {
    if (activePortPane === 'groups') {
      setMessage('端口组没有进程详情')
      return false
    }
    normalizeFocusedPort(false)
    if (!focusedPortId) {
      setMessage('没有选中的端口进程')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    if (portGroupDetail.open) closePortGroupDetail(false)
    portDetail = { open: true, active: true, targetId: focusedPortId }
    notify()
    return true
  }

  function openPortGroupDetail() {
    if (activePortPane !== 'groups') return false
    normalizeFocusedGroup()
    if (!focusedPortGroupTarget) {
      setMessage('没有选中的端口组')
      return false
    }
    if (portDrawer.open) closePortDrawer(false)
    if (portDetail.open) closePortDetail(false)
    portGroupDetail = { open: true, active: true, target: focusedPortGroupTarget }
    notify()
    return true
  }

  function clearPortSelection() {
    selectedPortIds = []
    if (portDrawer.mode === 'multi') closePortDrawer(false)
    notify()
    return true
  }

  async function hideAppWindow() {
    const ok = await platform.app.hide()
    if (!ok) setMessage('当前环境不支持隐藏插件窗口')
  }

  function shortcutLabelsFor(commandId: string) {
    const labels = buildEffectiveKeybindings(state.settings.shortcutProfiles)
      .filter((binding) => binding.actionId === commandId && !binding.disabled && binding.source !== 'removed')
      .map((binding) => binding.shortcutId)
    return formatShortcutList(labels)
  }

  function buildCommandShortcutLabels(): Record<string, string> {
    const output: Record<string, string> = {}
    for (const binding of buildEffectiveKeybindings(state.settings.shortcutProfiles)) {
      if (binding.disabled || binding.source === 'removed') continue
      if (!output[binding.actionId]) output[binding.actionId] = shortcutLabelsFor(binding.actionId)
    }
    return output
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
      normalizeFocusedGroup()
      return focusedPortGroupTarget ? { open: true, active: true, mode: 'group', activeIndex: 0, targetIds: [focusedPortGroupTarget.id], groupTarget: focusedPortGroupTarget } : null
    }
    if (selectedPortIds.length) {
      return { open: true, active: true, mode: 'multi', activeIndex: 0, targetIds: [...selectedPortIds], groupTarget: null }
    }
    return focusedPortId ? { open: true, active: true, mode: 'single', activeIndex: 0, targetIds: [focusedPortId], groupTarget: null } : null
  }

  function buildPortDrawerItems(drawer = portDrawer): PortDrawerItem[] {
    if (!drawer.open) return []
    if (drawer.mode === 'group') {
      const target = drawer.groupTarget || (drawer.targetIds[0] ? { kind: 'group' as const, id: drawer.targetIds[0] } : null)
      const groupId = target?.kind === 'group' ? target.id : undefined
      const args = target ? { targetKind: target.kind, targetId: target.id, groupId } : {}
      const items = [
        drawerItem('ports.group.apply', target?.kind === 'folder' ? '筛选分组夹' : '筛选分组', '只筛选右侧端口结果。', 'search', args),
        drawerItem('ports.group.focusMatches', '聚焦匹配端口', '筛选后聚焦并多选当前匹配端口。', 'focus', args),
        drawerItem('ports.group.kill.confirm', '终止组进程', '先确认，再终止当前匹配监听进程。', 'stop', args),
        drawerItem('ports.group.kill.force', '强杀组进程', '跳过普通确认，但继续校验 PID 与端口。', 'bolt', args)
      ]
      if (target?.kind === 'group') {
        items.push(
          drawerItem('ports.group.rename', '重命名', '打开分组名称编辑。', 'rename'),
          drawerItem('ports.group.edit', '编辑规则', '维护端口、区间、正则规则和所在分组夹。', 'edit')
        )
      }
      return items
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
    if (portGroupDetail.open) closePortGroupDetail(false)
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
        activeIndex: Math.min(portDrawer.activeIndex, buildPortDrawerItems({ open: true, active: false, mode: 'multi', activeIndex: 0, targetIds: selectedPortIds, groupTarget: null }).length - 1),
        targetIds: [...selectedPortIds],
        groupTarget: null
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

  function targetFromArgs(args?: Record<string, unknown> | null): PortGroupTarget | null {
    if (args?.targetKind === 'folder' && typeof args.targetId === 'string') return { kind: 'folder', id: args.targetId }
    if (args?.targetKind === 'group' && typeof args.targetId === 'string') return { kind: 'group', id: args.targetId }
    if (typeof args?.groupId === 'string') return { kind: 'group', id: args.groupId }
    return focusedPortGroupTarget
  }

  function currentPortGroupSelection(target: PortGroupTarget | null): PortProcess[] {
    if (!target) return []
    return matchPortGroupTargetProcesses(ports, target, state.portGroups, state.portGroupFolders)
  }

  function focusedGroup(): PortGroup | null {
    const id = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : focusedPortGroupId || selectedPortGroupId
    return id ? state.portGroups.find((group) => group.id === id) || null : null
  }

  function filterPortGroups(): PortGroup[] {
    return filterPortGroupRows().flatMap((row) => row.group ? [row.group] : [])
  }

  function currentPortFilter() {
    const scopedPorts = selectedPortGroupTarget
      ? matchPortGroupTargetProcesses(ports, selectedPortGroupTarget, state.portGroups, state.portGroupFolders)
      : selectedPortGroupId
        ? matchPortGroupProcesses(ports, state.portGroups.find((item) => item.id === selectedPortGroupId) || { id: '', name: '', color: '', entries: [], folderId: null, sortOrder: 0 })
        : ports
    return filterPortProcesses(scopedPorts, state.portSearch)
  }

  function moveInList(direction: 1 | -1, page = false) {
    if (state.activeTab === 'ports' && activePortPane === 'groups') {
      const rows = filterPortGroupRows()
      if (!rows.length) {
        focusedPortGroupTarget = null
        focusedPortGroupId = null
        notify()
        return
      }
      const currentKey = focusedPortGroupTarget ? targetKey(focusedPortGroupTarget) : ''
      const currentIndex = rows.findIndex((row) => targetKey(row.target) === currentKey)
      const current = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : rows.length
      const next = Math.min(rows.length - 1, Math.max(0, current + direction * (page ? 5 : 1)))
      focusedPortGroupTarget = rows[next].target
      focusedPortGroupId = focusedPortGroupTarget.kind === 'group' ? focusedPortGroupTarget.id : null
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
    normalizeFocusedPort(false)
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
      detail: `确认终止 ${targets.length} 个进程？失败后可使用 ${shortcutLabelsFor('ports.kill.force') || 'c-del / c-backspace'} 强杀。`,
      onConfirm: () => {
        confirm = null
        void killPorts(false)
      }
    }
    notify()
  }

  function confirmKillGroup(target: PortGroupTarget | null) {
    const targets = currentPortGroupSelection(target)
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

  function recordSearchHistoryForTarget(target: SearchHistoryTarget, value: string) {
    const keyword = value.trim()
    if (!keyword) return false
    state.searchHistories = updateHistoryForTarget(
      state.searchHistories,
      target,
      recordSearchHistory(historyForTarget(state.searchHistories, target), keyword)
    )
    syncLegacySearchHistories()
    return true
  }

  function applyFocusedGroup(targetInput?: PortGroupTarget | null) {
    const historyChanged = recordSearchHistoryForTarget('ports.groups', portGroupSearch)
    const target = targetInput || focusedPortGroupTarget
    if (!target) {
      if (historyChanged) {
        closeSearchHistory()
        save()
        notify()
        return true
      }
      setMessage('没有选中的端口组')
      return false
    }
    selectedPortGroupTarget = target
    selectedPortGroupId = target.kind === 'group' ? target.id : null
    focusedPortId = null
    selectedPortIds = []
    closeSearchHistory()
    if (historyChanged) save()
    notify()
    return true
  }

  function focusFocusedGroupMatches(targetInput?: PortGroupTarget | null) {
    const target = targetInput || focusedPortGroupTarget
    if (!applyFocusedGroup(target)) return false
    const rows = currentPortFilter().items
    selectedPortIds = rows.map((item) => item.id)
    focusedPortId = rows[0]?.id || null
    activePortPane = 'results'
    syncSelectionDrawer()
    notify()
    return true
  }

  function openGroupDraft(group: PortGroup | null, mode: PortGroupDraft['mode'] = group ? 'edit' : 'create') {
    portGroupDraft = group
      ? { mode, groupId: group.id, name: group.name, entriesText: group.entries.join('\n'), color: group.color, folderId: group.folderId, activeField: 'name' }
      : { mode: 'create', groupId: null, name: '', entriesText: '', color: '#00A676', folderId: null, activeField: 'name' }
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
      color: '#00A676',
      folderId: null,
      activeField: 'name'
    }
    notify()
    return true
  }

  function updatePortGroupDraft(input: Partial<Pick<PortGroupDraft, 'name' | 'entriesText' | 'color' | 'folderId'>>) {
    if (!portGroupDraft) return
    portGroupDraft = { ...portGroupDraft, ...input }
    notify()
  }

  function movePortGroupDraftField(direction: 1 | -1) {
    if (!portGroupDraft) return false
    const fields: PortGroupDraftField[] = portGroupDraft.mode === 'rename' ? ['name'] : ['name', 'entries', 'color', 'folder']
    const current = fields.indexOf(portGroupDraft.activeField)
    const next = fields[(Math.max(0, current) + direction + fields.length) % fields.length]
    portGroupDraft = { ...portGroupDraft, activeField: next }
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
    if (sameTarget(focusedPortGroupTarget, { kind: 'group', id: group.id })) focusedPortGroupTarget = filterPortGroupRows()[0]?.target || null
    focusedPortGroupId = focusedPortGroupTarget?.kind === 'group' ? focusedPortGroupTarget.id : null
    save()
    notify()
    return true
  }

  function createPortGroupFolder() {
    const id = `folder:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const folder: PortGroupFolder = {
      id,
      name: `分组夹 ${state.portGroupFolders.length + 1}`,
      color: '#2F80ED',
      sortOrder: state.portGroupFolders.length + 1
    }
    state.portGroupFolders.push(folder)
    groupSidePanelOpen = true
    activePortPane = 'groups'
    focusedPortGroupTarget = { kind: 'folder', id }
    focusedPortGroupId = null
    save()
    notify()
    return true
  }

  function toggleFocusedGroupFolder(expand?: boolean) {
    if (focusedPortGroupTarget?.kind === 'group' && expand === false) {
      const group = state.portGroups.find((item) => item.id === focusedPortGroupTarget?.id)
      if (!group?.folderId) return false
      focusedPortGroupTarget = { kind: 'folder', id: group.folderId }
      focusedPortGroupId = null
      notify()
      return true
    }
    if (focusedPortGroupTarget?.kind !== 'folder') return false
    const id = focusedPortGroupTarget.id
    const collapsed = state.collapsedPortGroupFolderIds.includes(id)
    if (expand === true && !collapsed) {
      const firstChild = filterPortGroupRows().find((row) => row.kind === 'group' && row.group?.folderId === id)
      if (!firstChild) return false
      focusedPortGroupTarget = firstChild.target
      focusedPortGroupId = firstChild.target.id
      notify()
      return true
    }
    const shouldCollapse = expand === undefined ? !collapsed : !expand
    state.collapsedPortGroupFolderIds = shouldCollapse
      ? [...new Set([...state.collapsedPortGroupFolderIds, id])]
      : state.collapsedPortGroupFolderIds.filter((item) => item !== id)
    save()
    notify()
    return true
  }

  function queryForSearchHistoryTarget(target: SearchHistoryTarget): string {
    if (target === 'ports.processes') return state.portSearch
    if (target === 'ports.groups') return portGroupSearch
    return state.favoriteSearch
  }

  function setSearchValueForTarget(target: SearchHistoryTarget, value: string) {
    if (target === 'ports.processes') {
      state.portSearch = value
      ensurePortsScanned()
      normalizeFocusedPort()
      save()
      return
    }
    if (target === 'ports.groups') {
      portGroupSearch = value
      normalizeFocusedGroup()
      return
    }
    state.favoriteSearch = value
    save()
  }

  function filteredSearchHistoryItems(target: SearchHistoryTarget): string[] {
    const query = queryForSearchHistoryTarget(target)
    return query.trim() ? filterSearchHistoryItems(historyForTarget(state.searchHistories, target), query) : []
  }

  function normalizeSearchHistoryIndex() {
    if (!searchHistoryTarget || !searchHistoryOpen) {
      searchHistoryActiveIndex = -1
      return
    }
    const items = filteredSearchHistoryItems(searchHistoryTarget)
    searchHistoryActiveIndex = items.length && searchHistoryActiveIndex >= 0
      ? Math.min(searchHistoryActiveIndex, items.length - 1)
      : -1
  }

  function openSearchHistory(target: SearchHistoryTarget) {
    searchHistoryTarget = target
    searchHistoryOpen = true
    searchHistoryActiveIndex = -1
  }

  function closeSearchHistory() {
    searchHistoryOpen = false
    searchHistoryActiveIndex = -1
  }

  function requestSearchFocusForHistoryTarget(target: SearchHistoryTarget) {
    searchFocusTarget = target === 'ports.groups'
      ? 'port-groups'
      : target === 'favorites.files'
        ? 'favorites'
        : 'ports'
    searchFocusRequestId += 1
  }

  function blurSearchFocus() {
    closeSearchHistory()
    searchBlurRequestId += 1
    notify()
    return true
  }

  function currentSearchHistoryState(): SearchHistoryState {
    const items = searchHistoryTarget && searchHistoryOpen ? filteredSearchHistoryItems(searchHistoryTarget) : []
    return {
      target: searchHistoryTarget,
      open: searchHistoryOpen,
      activeIndex: searchHistoryActiveIndex,
      items
    }
  }

  function searchHistoryHasItems() {
    return Boolean(searchHistoryTarget && searchHistoryOpen && filteredSearchHistoryItems(searchHistoryTarget).length)
  }

  function closeSearchHistoryAndRefocus() {
    if (!searchHistoryTarget || !searchHistoryOpen || !searchHistoryHasItems()) return false
    const target = searchHistoryTarget
    closeSearchHistory()
    requestSearchFocusForHistoryTarget(target)
    notify()
    return true
  }

  function moveSearchHistory(direction: 1 | -1) {
    if (!searchHistoryTarget) return false
    searchHistoryOpen = true
    const items = filteredSearchHistoryItems(searchHistoryTarget)
    if (!items.length) {
      searchHistoryActiveIndex = -1
      notify()
      return false
    }
    searchHistoryActiveIndex = searchHistoryActiveIndex < 0
      ? direction > 0 ? 0 : items.length - 1
      : (searchHistoryActiveIndex + direction + items.length) % items.length
    notify()
    return true
  }

  function searchHistoryTargetFromArgs(args?: Record<string, unknown> | null): SearchHistoryTarget | null {
    const target = args?.target
    return target === 'ports.processes' || target === 'ports.groups' || target === 'favorites.files'
      ? target
      : searchHistoryTarget
  }

  function acceptSearchHistory(args?: Record<string, unknown> | null) {
    const target = searchHistoryTargetFromArgs(args)
    if (!target) return false
    searchHistoryTarget = target
    const items = filteredSearchHistoryItems(target)
    const selected = typeof args?.value === 'string'
      ? args.value
      : searchHistoryActiveIndex >= 0 ? items[searchHistoryActiveIndex] : ''
    const value = (selected || queryForSearchHistoryTarget(target)).trim()
    if (!value) return false
    setSearchValueForTarget(target, value)
    recordSearchHistoryForTarget(target, value)
    closeSearchHistory()
    searchBlurRequestId += 1
    if (target === 'ports.processes') {
      activePortPane = 'results'
      requestListFocus('results')
    } else if (target === 'ports.groups') {
      state.activeTab = 'ports'
      groupSidePanelOpen = true
      activePortPane = 'groups'
      requestListFocus('groups')
    }
    save()
    notify()
    return true
  }

  function deleteSearchHistory(args?: Record<string, unknown> | null) {
    const target = searchHistoryTargetFromArgs(args)
    if (!target) return false
    searchHistoryTarget = target
    const items = filteredSearchHistoryItems(target)
    const deleting = typeof args?.value === 'string'
      ? args.value
      : searchHistoryActiveIndex >= 0 ? items[searchHistoryActiveIndex] : ''
    if (!deleting) return false
    state.searchHistories = updateHistoryForTarget(
      state.searchHistories,
      target,
      historyForTarget(state.searchHistories, target).filter((item) => item !== deleting)
    )
    syncLegacySearchHistories()
    normalizeSearchHistoryIndex()
    save()
    notify()
    return true
  }

  function moveGroupToFolder(groupId: string, folderId: string | null) {
    if (!state.portGroups.some((group) => group.id === groupId)) return false
    if (folderId && !state.portGroupFolders.some((folder) => folder.id === folderId)) return false
    state.portGroups = movePortGroupToFolder(state.portGroups, groupId, folderId)
    focusedPortGroupTarget = { kind: 'group', id: groupId }
    focusedPortGroupId = groupId
    save()
    notify()
    return true
  }

  function clearPortSearchState() {
    const hadPersistentSearch = Boolean(state.portSearch || portGroupSearch)
    state.portSearch = ''
    portGroupSearch = ''
    searchBlurRequestId += 1
    if (hadPersistentSearch) save()
    notify()
  }

  function resolvePortEscapeStep(input: ShortcutInputContext): string | null {
    const searchFocused = input.activeInputRole === 'port-search' || input.activeInputRole === 'port-group-search'
    if (searchFocused) {
      blurSearchFocus()
      return 'ports.search.blur'
    }
    if (portGroupDetail.open && portGroupDetail.active) {
      closePortGroupDetail()
      return 'ports.groupDetail.close'
    }
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
    if (state.portSearch || portGroupSearch) {
      clearPortSearchState()
      return 'ports.search.clear'
    }
    if (selectedPortGroupTarget || selectedPortGroupId) {
      selectedPortGroupTarget = null
      selectedPortGroupId = null
      focusedPortId = null
      notify()
      return 'ports.groupFilter.clear'
    }
    if (activePortPane === 'groups' && focusedPortGroupTarget) {
      focusedPortGroupTarget = null
      focusedPortGroupId = null
      notify()
      return 'ports.focus.clear'
    }
    if (activePortPane === 'results' && focusedPortId) {
      focusedPortId = null
      notify()
      return 'ports.focus.clear'
    }
    return null
  }

  function inferShortcutProfileId(commandId: string): ShortcutProfileId {
    if (commandId.startsWith('ports.')) return 'ports'
    if (commandId.startsWith('favorites.')) return 'favorites'
    if (commandId.startsWith('settings.')) return 'settings'
    return 'global'
  }

  function aggregateShortcutProfiles() {
    return (['global', 'ports', 'favorites', 'settings'] as ShortcutProfileId[])
      .flatMap((profileId) => state.settings.shortcutProfiles[profileId].keybindingOverrides)
  }

  function savePortGroupDraft(input: { name: string; entriesText: string; color: string; folderId?: string | null }) {
    const draft = portGroupDraft
    if (!draft) return false
    const currentGroup = draft.groupId ? state.portGroups.find((group) => group.id === draft.groupId) || null : null
    const entries = draft.mode === 'rename' && currentGroup
      ? currentGroup.entries
      : [...new Set(input.entriesText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
    const color = draft.mode === 'rename' && currentGroup ? currentGroup.color : input.color || '#00A676'
    const folderId = draft.mode === 'rename' && currentGroup
      ? currentGroup.folderId
      : input.folderId && state.portGroupFolders.some((folder) => folder.id === input.folderId) ? input.folderId : null
    if (!input.name.trim() || !entries.length) {
      setMessage('端口组名称和规则不能为空')
      return false
    }
    if (draft.mode === 'edit' && draft.groupId) {
      state.portGroups = state.portGroups.map((group) => group.id === draft.groupId ? { ...group, name: input.name.trim(), color, entries, folderId } : group)
      focusedPortGroupId = draft.groupId
      focusedPortGroupTarget = { kind: 'group', id: draft.groupId }
    } else if (draft.mode === 'rename' && draft.groupId) {
      state.portGroups = state.portGroups.map((group) => group.id === draft.groupId ? { ...group, name: input.name.trim() } : group)
      focusedPortGroupId = draft.groupId
      focusedPortGroupTarget = { kind: 'group', id: draft.groupId }
    } else {
      const id = `group:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      state.portGroups.push({ id, name: input.name.trim(), color, entries, folderId, sortOrder: state.portGroups.length + 1 })
      focusedPortGroupId = id
      focusedPortGroupTarget = { kind: 'group', id }
    }
    portGroupDraft = null
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
    actions.register({ id: 'app.hide', title: '隐藏插件窗口', group: '全局', risk: 'normal', scope: 'global', priority: 100, shortcut: 'Shift+Escape', when: () => true, run: () => { void hideAppWindow(); return true } })
    for (const feature of visibleFeatures()) {
      const tabActionId = `tab.select.${feature.id}`
      actions.register({
        id: tabActionId,
        title: `切到${feature.title}`,
        group: '全局',
        risk: 'normal',
        scope: 'global',
        priority: 10,
        shortcut: feature.shortcutCommandId === tabActionId ? feature.shortcutId : undefined,
        when: () => true,
        run: () => { setTab(feature.id); return true }
      })
    }
    actions.register({ id: 'ports.scan', title: '刷新端口', group: '端口', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'ports', run: () => { void scanPorts(); return true } })
    actions.register({ id: 'ports.groups.togglePanel', title: '展开/收起端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+W', when: (ctx) => ctx.tab === 'ports', run: () => toggleGroupPanel() })
    actions.register({ id: 'ports.search.focus', title: '聚焦端口搜索', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'ports', run: () => focusPortSearch() })
    actions.register({ id: 'ports.groupSearch.focus', title: '聚焦端口组搜索', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'ports', run: () => focusPortGroupSearch() })
    actions.register({ id: 'ports.search.blur', title: '退出端口搜索焦点', group: '端口', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => blurSearchFocus() })
    actions.register({ id: 'ports.kill.confirm', title: '终止选中进程', group: '端口', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: () => { confirmKill(); return true } })
    actions.register({ id: 'ports.kill.force', title: '强杀选中进程', group: '端口', risk: 'destructive', scope: 'tab', priority: 100, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'ports', run: () => { void killPorts(true); return true } })
    actions.register({ id: 'ports.killGroup.confirm', title: '终止端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(targetFromArgs(args)); return true } })
    actions.register({ id: 'ports.killGroup.force', title: '强杀端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(targetFromArgs(args)), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.pane.toggleNext', title: '切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    actions.register({ id: 'ports.pane.togglePrev', title: '反向切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    actions.register({ id: 'ports.pane.groups', title: '聚焦端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('groups'); notify(); return true } })
    actions.register({ id: 'ports.pane.results', title: '聚焦端口结果栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('results'); notify(); return true } })
    actions.register({ id: 'ports.group.apply', title: '应用端口组过滤', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => applyFocusedGroup(targetFromArgs(args)) })
    actions.register({ id: 'ports.group.focusMatches', title: '聚焦组内端口', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => focusFocusedGroupMatches(targetFromArgs(args)) })
    actions.register({ id: 'ports.group.kill.confirm', title: '终止当前端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(targetFromArgs(args)); return true } })
    actions.register({ id: 'ports.group.kill.force', title: '强杀当前端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(targetFromArgs(args)), true, '组内端口当前无监听进程'); return true } })
    actions.register({ id: 'ports.group.createFromSelection', title: '选中端口收藏为组', group: '端口', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'ports', run: () => createGroupFromSelection() })
    actions.register({ id: 'ports.group.create', title: '新建端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'ports', run: () => { openGroupDraft(null); return true } })
    actions.register({ id: 'ports.groupFolder.create', title: '新增分组夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'ports', run: () => createPortGroupFolder() })
    actions.register({ id: 'ports.group.rename', title: '重命名端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'ports', run: () => { const group = focusedGroup(); if (!group) return false; openGroupDraft(group, 'rename'); return true } })
    actions.register({ id: 'ports.group.edit', title: '编辑端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'ports', run: () => { const group = focusedGroup(); if (!group) return false; openGroupDraft(group, 'edit'); return true } })
    actions.register({ id: 'ports.group.save', title: '保存端口组编辑', group: '端口', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => savePortGroupDraft(portGroupDraft || { name: '', entriesText: '', color: '#00A676', folderId: null }) })
    actions.register({ id: 'ports.group.edit.nextField', title: '编辑层下一个字段', group: '端口', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => movePortGroupDraftField(1) })
    actions.register({ id: 'ports.group.edit.prevField', title: '编辑层上一个字段', group: '端口', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => movePortGroupDraftField(-1) })
    actions.register({ id: 'ports.group.delete', title: '删除端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: () => deleteFocusedGroup() })
    actions.register({ id: 'ports.groupTarget.collapse', title: '折叠端口组夹', description: '折叠当前高亮分组夹。', icon: 'left', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder(false) })
    actions.register({ id: 'ports.groupTarget.expand', title: '展开端口组夹', description: '展开当前高亮分组夹。', icon: 'right', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder(true) })
    actions.register({ id: 'ports.groupDetail.open', title: '打开端口组详情抽屉', description: '展示当前分组或分组夹的规则和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => openPortGroupDetail() })
    actions.register({ id: 'ports.groupDetail.close', title: '关闭端口组详情抽屉', description: '关闭左侧端口组详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortGroupDetail() })
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
    actions.register({ id: 'favorites.search.blur', title: '退出收藏搜索焦点', group: '收藏', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'favorites', run: () => blurSearchFocus() })
    actions.register({ id: 'settings.open', title: '打开设置', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+Alt+S', when: () => true, run: () => { setTab('settings'); return true } })
    actions.register({ id: 'search.focus', title: '聚焦搜索', group: '全局', risk: 'normal', scope: 'global', priority: 10, shortcut: 'Ctrl+F', when: () => true, run: () => focusSearch() })
    actions.register({ id: 'search.history.prev', title: '搜索历史上移', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+ArrowUp', when: () => true, run: () => moveSearchHistory(-1) })
    actions.register({ id: 'search.history.next', title: '搜索历史下移', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+ArrowDown', when: () => true, run: () => moveSearchHistory(1) })
    actions.register({ id: 'search.history.accept', title: '选择搜索历史', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Enter', when: () => true, run: (_ctx, args) => acceptSearchHistory(args) })
    actions.register({ id: 'search.history.close', title: '隐藏搜索历史', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: () => true, run: () => closeSearchHistoryAndRefocus() })
    actions.register({ id: 'search.history.delete', title: '删除搜索历史', group: '全局', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Delete', when: () => true, run: (_ctx, args) => deleteSearchHistory(args) })
    actions.register({ id: 'confirm.cancel', title: '关闭确认弹窗', group: '全局', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('confirm'), run: () => { confirm = null; notify(); return true } })
    actions.register({ id: 'ports.workspace.reset', title: '重置端口工作区', group: '端口', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => { resetPortWorkspace(); return true } })
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
      portGroupDetailOpen: portGroupDetail.open,
      portGroupDetailActive: portGroupDetail.active,
      portSelectionMode: selectedPortIds.length > 0,
      searchHistoryOpen,
      searchHistoryHasItems: searchHistoryHasItems(),
      searchHistorySelectionActive: searchHistoryOpen && searchHistoryActiveIndex >= 0
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
      const groupRows = filterPortGroupRows()
      const groupDetailTarget = portGroupDetail.target ? groupRows.find((row) => sameTarget(row.target, portGroupDetail.target)) || rowForGroupTarget(portGroupDetail.target) : null
      return {
        state,
        ports,
        filteredPorts: portFilter.items,
        filteredPortGroups: filterPortGroups(),
        portGroupRows: groupRows,
        portSearchError: portFilter.error,
        selectedPortIds,
        selectedFavoriteIds,
        collapsedFavoriteIds,
        focusedPortId,
        focusedPortGroupId,
        focusedPortGroupTarget,
        selectedPortGroupId,
        selectedPortGroupTarget,
        activePortPane,
        portGroupSearch,
        groupSidePanelOpen,
        portDetail,
        portDetailTarget: detailTarget,
        portGroupDetail,
        portGroupDetailTarget: groupDetailTarget,
        portDrawer,
        portDrawerItems: buildPortDrawerItems(),
        searchOverlayOpen,
        searchFocusRequestId,
        searchBlurRequestId,
        groupPanelFocusRequestId,
        listFocusRequestId,
        listFocusTarget,
        searchFocusTarget,
        portGroupDraft,
        focusedFavoriteId,
        favoriteRows: flattenFavoriteTree(favoriteTree, collapsedFavoriteIds),
        message,
        confirm,
        commandShortcutLabels: buildCommandShortcutLabels(),
        searchHistoryState: currentSearchHistoryState()
      }
    },
    actions: actions.all,
    scanPorts,
    setTab,
    setPortSearch(value: string) {
      state.portSearch = value
      if (searchHistoryTarget !== 'ports.processes') openSearchHistory('ports.processes')
      else {
        searchHistoryOpen = true
        searchHistoryActiveIndex = -1
      }
      ensurePortsScanned()
      normalizeFocusedPort()
      save()
      notify()
    },
    setPortGroupSearch(value: string) {
      portGroupSearch = value
      if (searchHistoryTarget !== 'ports.groups') openSearchHistory('ports.groups')
      else {
        searchHistoryOpen = true
        searchHistoryActiveIndex = -1
      }
      normalizeFocusedGroup()
      notify()
    },
    setFavoriteSearch(value: string) {
      state.favoriteSearch = value
      if (searchHistoryTarget !== 'favorites.files') openSearchHistory('favorites.files')
      else {
        searchHistoryOpen = true
        searchHistoryActiveIndex = -1
      }
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
      groupSidePanelOpen = true
      focusedPortGroupTarget = { kind: 'group', id }
      focusedPortGroupId = id
      notify()
    },
    focusPortGroupFolder(id: string) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortGroupTarget = { kind: 'folder', id }
      focusedPortGroupId = null
      notify()
    },
    focusPortGroupTarget(target: PortGroupTarget) {
      activePortPane = 'groups'
      groupSidePanelOpen = true
      focusedPortGroupTarget = target
      focusedPortGroupId = target.kind === 'group' ? target.id : null
      notify()
    },
    movePortGroupToFolder: moveGroupToFolder,
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
    updatePortGroupDraft,
    savePortGroupDraft,
    cancelPortGroupDraft() {
      portGroupDraft = null
      notify()
    },
    closeSearchOverlay() {
      searchOverlayOpen = false
      notify()
    },
    updateKeybinding(input: string | KeybindingUpdateInput, shortcutId?: string, disabled = false) {
      const payload: KeybindingUpdateInput = typeof input === 'string'
        ? { commandId: input, shortcutId, disabled }
        : input
      const shortcutIds = (payload.shortcutIds?.length ? payload.shortcutIds : payload.shortcutId ? [payload.shortcutId] : [])
        .map(normalizeShortcutId)
        .filter(Boolean)
      const isDisabled = payload.disabled === true || payload.enabled === false
      const profileId = payload.profileId || inferShortcutProfileId(payload.commandId)
      const override = {
        commandId: payload.commandId,
        shortcutId: shortcutIds[0],
        shortcutIds,
        when: payload.when,
        enabled: !isDisabled,
        source: isDisabled ? 'removed' : 'user',
        disabled: isDisabled
      } as const
      state.settings.shortcutProfiles[profileId].keybindingOverrides = state.settings.shortcutProfiles[profileId].keybindingOverrides.filter((item) => item.commandId !== payload.commandId)
      state.settings.shortcutProfiles[profileId].keybindingOverrides.push(override)
      state.settings.shortcutProfiles[profileId].updatedAt = Date.now()
      state.settings.keybindingOverrides = aggregateShortcutProfiles()
      save()
      notify()
    },
    resetKeybinding(commandId: string) {
      for (const profile of Object.values(state.settings.shortcutProfiles)) {
        profile.keybindingOverrides = profile.keybindingOverrides.filter((item) => item.commandId !== commandId)
      }
      state.settings.keybindingOverrides = aggregateShortcutProfiles()
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
        const searchInputFocused = input.activeInputRole === 'port-search' || input.activeInputRole === 'port-group-search' || input.activeInputRole === 'favorite-search'
        if (searchInputFocused && closeSearchHistoryAndRefocus()) {
          return 'search.history.close'
        }
        if (state.activeTab === 'ports') {
          return resolvePortEscapeStep(input)
        }
        if (state.activeTab === 'favorites' && input.activeInputRole === 'favorite-search') {
          blurSearchFocus()
          return 'favorites.search.blur'
        }
        if (state.activeTab === 'favorites' && state.favoriteSearch) {
          this.setFavoriteSearch('')
          return 'favorites.search.clear'
        }
        return null
      }
      const binding = resolveKeybinding(buildEffectiveKeybindings(state.settings.shortcutProfiles), shortcutId, keybindingContext(input))
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
      const result = actions.dispatch({ actionId: binding.actionId, context: context() })
      return result.handled ? binding.actionId : null
    },
    defaultKeybindings: DEFAULT_KEYBINDINGS
  }
}
