<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  CirclePlay,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  History,
  MessageSquareText,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X
} from '@lucide/vue'
import CodexWaterBall from './components/CodexWaterBall.vue'
import QuickJumpLayer from './components/QuickJumpLayer.vue'
import { CODEX_THEME_PRESETS, codexThemeCssVars, codexWaterAppearanceCssVars, resolveCodexSurfaceTheme } from './domain/codexAppearance'
import { buildCodexCompactPresentation } from './domain/codexPresentation'
import { assignQuickJumpMarkers, moveQuickJumpActive, resolveQuickJumpQuery } from './domain/quickJump'
import type { QuickJumpTarget } from './domain/quickJump'
import { shortcutFromEvent } from './domain/shortcuts'
import type {
  CodexProjectCard,
  CodexProjectEntry,
  CodexProjectSection,
  CodexQuotaBucket,
  CodexTaskCard,
  CodexTaskTab
} from './domain/codex'
import type { CodexFloatResizeCorner, CodexFloatWindowState } from './float-env'
import type { CodexFloatSnapshotV1 } from './runtime/codexController'

type RenderRow =
  | { kind: 'section'; key: string; section: CodexProjectSection }
  | { kind: 'status-section'; key: string; title: string; count: number; tone: 'input' | 'active' | 'unread' }
  | { kind: 'project'; key: string; project: CodexProjectCard; sectionId: string }
  | { kind: 'task'; key: string; task: CodexTaskCard; sectionId?: string; parentProjectKey?: string; nested?: boolean }
  | { kind: 'empty-project'; key: string; projectKey: string }

type FocusItem = Extract<RenderRow, { kind: 'project' | 'task' }>
type PanelState = { mode: 'detail' | 'drawer'; item: FocusItem } | null
type AliasEditor = { kind: 'task' | 'project'; key: string; value: string; originalName: string } | null
type DrawerAction = { id: string; label: string; danger?: boolean; disabled?: boolean; disabledReason?: string; run: () => void }
type HoverCard = { id: string; title: string; lines: string[]; left: number; top: number; kind: 'task' | 'hint' | 'status' }
type QuickJumpDomTarget = QuickJumpTarget & { element: HTMLElement }

const snapshot = ref<CodexFloatSnapshotV1 | null>(null)
const rootElement = ref<HTMLElement | null>(null)
const expanded = ref(false)
const floatState = ref<CodexFloatWindowState>({ expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null })
const activeTab = ref<CodexTaskTab>('ongoing')
const searchText = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const taskScroll = ref<HTMLElement | null>(null)
const selectedKeys = ref<Set<string>>(new Set())
const focusedKey = ref('')
const rangeAnchorKey = ref('')
const batchPlacement = ref<'top' | 'bottom'>('bottom')
const panel = ref<PanelState>(null)
const aliasEditor = ref<AliasEditor>(null)
const aliasInput = ref<HTMLInputElement | null>(null)
const pendingConfirm = ref<{ id: string; label: string; until: number } | null>(null)
const liveMessage = ref('')
const drawerActiveIndex = ref(0)
const highlightOwner = ref<'mouse' | 'keyboard'>('mouse')
const hoverCard = ref<HoverCard | null>(null)
const optimisticProjectCollapsed = ref<Record<string, boolean>>({})
const quickJump = ref<{ open: boolean; query: string; sourceTargets: QuickJumpDomTarget[]; targets: QuickJumpDomTarget[]; activeTargetId: string | null }>({
  open: false,
  query: '',
  sourceTargets: [],
  targets: [],
  activeTargetId: null
})

let stopSnapshot: (() => void) | null = null
let stopState: (() => void) | null = null
let stopActivate: (() => void) | null = null
let drag: { x: number; y: number; moved: boolean; pointerId: number } | null = null
let resize: { pointerId: number; corner: CodexFloatResizeCorner } | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null
let confirmTimer: ReturnType<typeof setTimeout> | null = null
let pendingRun: (() => void) | null = null
let taskScrollResizeObserver: ResizeObserver | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let compactInputTimer: ReturnType<typeof setTimeout> | null = null
let desiredExpanded = false
let hoverInside = false
let focusWithin = false
let ignoreCompactClick = false
let restoreCompactFocus = false
let lastMousePoint = { x: Number.NaN, y: Number.NaN }
let keyboardMouseOrigin = { x: Number.NaN, y: Number.NaN }

const fallbackColors = CODEX_THEME_PRESETS[0].colors
const fallbackWaterAppearance = CODEX_THEME_PRESETS[0].waterAppearance
const settings = computed(() => snapshot.value)
const quota = computed(() => snapshot.value?.quota)
const conversations = computed(() => snapshot.value?.conversations)
const compact = computed(() => buildCodexCompactPresentation({
  quota: quota.value || { version: 1, status: 'idle', plan: '', short: null, weekly: null, updatedAt: 0 },
  compactFields: snapshot.value?.compactFields || [],
  conversationInboxEnabled: snapshot.value?.conversationInboxEnabled === true,
  conversations: conversations.value || { ongoingCount: 0, unknownCount: 0, attentionCount: 0, pendingCount: 0 }
}))
const primaryPercent = computed(() => compact.value.primary?.bucket.remainingPercent ?? 0)
const weeklyPercent = computed(() => quota.value?.weekly?.remainingPercent ?? 0)
const surfaceTheme = computed(() => resolveCodexSurfaceTheme(settings.value?.style || 'water', settings.value?.colors || fallbackColors, primaryPercent.value))
const rootStyle = computed<Record<string, string | number>>(() => ({
  ...codexThemeCssVars(surfaceTheme.value),
  ...codexWaterAppearanceCssVars(settings.value?.waterAppearance || fallbackWaterAppearance, settings.value?.colors || fallbackColors, primaryPercent.value, weeklyPercent.value),
  '--water-level': `${primaryPercent.value}%`,
  '--weekly-ring': weeklyPercent.value
}))

watch(rootStyle, (tokens) => {
  if (typeof document === 'undefined') return
  for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, String(value))
}, { immediate: true })

const expandedQuota = computed(() => {
  const result: Array<{ key: 'short' | 'weekly'; label: string; bucket: CodexQuotaBucket }> = []
  if (quota.value?.short) result.push({ key: 'short', label: '5 小时限额', bucket: quota.value.short })
  if (quota.value?.weekly) result.push({ key: 'weekly', label: '周限额', bucket: quota.value.weekly })
  return result
})
const statusText = computed(() => {
  if (conversations.value?.status === 'stale') return '数据已过期 · 展示上一份已验证快照'
  if (conversations.value?.status === 'error') return conversations.value.errorMessage || '真实会话预检失败'
  if (conversations.value?.completeness === 'verified') {
    return `${conversations.value.rawSourceCount} 条原始 · ${conversations.value.eligibleSourceCount} 条已注册 · 最近 ${settings.value?.timeWindowDays || 30} 天 ${conversations.value.all.length} 条`
  }
  return '等待真实会话预检'
})
const compactAriaLabel = computed(() => {
  if (quota.value?.status === 'stale' || quota.value?.status === 'error') return `${compact.value.ariaLabel}，${statusText.value}`
  return compact.value.ariaLabel
})
const tabCounts = computed<Record<CodexTaskTab, number>>(() => ({
  all: conversations.value?.all.length || 0,
  input: conversations.value?.inputRequired.length || 0,
  ongoing: (conversations.value?.ongoing.length || 0) + (conversations.value?.completedUnread.length || 0),
  hidden: conversations.value?.hidden.length || 0,
  completed: conversations.value?.completedTab.length || 0,
  projects: conversations.value?.projects.length || 0
}))
const tabs: Array<{ id: CodexTaskTab; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'input', label: '待输入' },
  { id: 'ongoing', label: '动态' },
  { id: 'completed', label: '已完成' },
  { id: 'hidden', label: '已隐藏' },
  { id: 'projects', label: '项目' }
]

const compactCounts = computed(() => ({
  input: conversations.value?.inputRequiredCount || 0,
  active: (conversations.value?.ongoing || []).filter((task) => task.activityState !== 'waiting-input').length,
  unread: conversations.value?.completedUnreadCount || 0
}))

function normalizedSearch() {
  return searchText.value.trim().toLocaleLowerCase()
}

function taskMatches(task: CodexTaskCard, query = normalizedSearch()) {
  if (!query) return true
  return [task.name, task.originalName, task.alias, task.projectName, task.originalProjectName]
    .some((value) => value?.toLocaleLowerCase().includes(query))
}

function projectMatches(project: CodexProjectCard, query = normalizedSearch()) {
  return !query || [project.name, project.originalName, project.alias]
    .some((value) => value?.toLocaleLowerCase().includes(query))
}

function sourceTasks() {
  const value = conversations.value
  if (!value) return []
  if (activeTab.value === 'all') return value.all
  if (activeTab.value === 'input') return value.inputRequired
  if (activeTab.value === 'ongoing') return value.ongoing
  if (activeTab.value === 'hidden') return value.hidden
  if (activeTab.value === 'completed') return value.completedTab
  return []
}

function filteredProjectSections(): CodexProjectSection[] {
  const query = normalizedSearch()
  return (conversations.value?.projectSections || []).map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry): CodexProjectEntry[] => {
      if (entry.kind === 'task') return taskMatches(entry.task, query) ? [entry] : []
      const matchedProject = projectMatches(entry.project, query)
      const tasks = matchedProject ? entry.project.tasks : entry.project.tasks.filter((task) => taskMatches(task, query))
      if (query && !matchedProject && !tasks.length) return []
      return [{ ...entry, project: { ...entry.project, tasks } }]
    })
  }))
}

const renderRows = computed<RenderRow[]>(() => {
  if (activeTab.value !== 'projects') {
    if (activeTab.value === 'ongoing') {
      const value = conversations.value
      if (!value) return []
      const groups = [
        { key: 'input', title: '待输入', tone: 'input' as const, tasks: value.ongoing.filter((task) => task.activityState === 'waiting-input') },
        { key: 'active', title: '当前动态', tone: 'active' as const, tasks: value.ongoing.filter((task) => task.activityState !== 'waiting-input') },
        { key: 'unread', title: '已完成未查看', tone: 'unread' as const, tasks: value.completedUnread }
      ]
      return groups.flatMap((group): RenderRow[] => {
        const tasks = group.tasks.filter((task) => taskMatches(task))
        if (!tasks.length) return []
        return [
          { kind: 'status-section', key: `status:${group.key}`, title: group.title, count: tasks.length, tone: group.tone },
          ...tasks.map((task) => ({ kind: 'task' as const, key: `task:${task.key}`, task }))
        ]
      })
    }
    return sourceTasks().filter((task) => taskMatches(task)).map((task) => ({ kind: 'task', key: `task:${task.key}`, task }))
  }
  const rows: RenderRow[] = []
  for (const section of filteredProjectSections()) {
    rows.push({ kind: 'section', key: `section:${section.id}`, section })
    for (const entry of section.entries) {
      if (entry.kind === 'task') {
        rows.push({ kind: 'task', key: `task:${entry.task.key}`, task: entry.task, sectionId: section.id })
        continue
      }
      rows.push({ kind: 'project', key: `project:${entry.project.key}`, project: entry.project, sectionId: section.id })
      if (!isProjectCollapsed(entry.project)) {
        if (entry.project.tasks.length) {
          rows.push(...entry.project.tasks.map((task) => ({ kind: 'task' as const, key: `task:${task.key}`, task, sectionId: section.id, parentProjectKey: entry.project.key, nested: true })))
        } else {
          rows.push({ kind: 'empty-project', key: `empty:${entry.project.key}`, projectKey: entry.project.key })
        }
      }
    }
  }
  return rows
})
const focusItems = computed<FocusItem[]>(() => renderRows.value.filter((row): row is FocusItem => row.kind === 'task' || row.kind === 'project'))
const focusedItem = computed(() => focusItems.value.find((item) => item.key === focusedKey.value) || focusItems.value[0] || null)
const visibleTaskKeys = computed(() => new Set(renderRows.value.filter((row): row is Extract<RenderRow, { kind: 'task' }> => row.kind === 'task').map((row) => row.task.key)))
const selectedTasks = computed(() => (conversations.value?.all || []).filter((task) => selectedKeys.value.has(task.key) && visibleTaskKeys.value.has(task.key)))
const showBatchToolbar = computed(() => selectedTasks.value.length >= 2)
const removedProjects = computed(() => (conversations.value?.removedProjects || []).filter((project) => projectMatches(project)))
const drawerIsBatch = computed(() => selectedTasks.value.length >= 2)
const drawerItem = computed<FocusItem | null>(() => {
  if (drawerIsBatch.value) return panel.value?.item || focusedItem.value
  const selected = selectedTasks.value[0]
  if (selected) return { kind: 'task', key: `task:${selected.key}`, task: selected }
  return panel.value?.item || focusedItem.value
})

const drawerActions = computed<DrawerAction[]>(() => {
  if (drawerIsBatch.value) {
    const tasks = selectedTasks.value
    const archivable = tasks.filter((task) => task.canArchive)
    const hidden = tasks.filter((task) => task.isHidden && task.hiddenKind)
    const visible = tasks.filter((task) => !task.isHidden)
    const unpinned = tasks.filter((task) => task.pinSource !== 'local')
    const pinned = tasks.filter((task) => task.pinSource === 'local')
    return [
      { id: 'batch-archive', label: `归档可用项（${archivable.length}/${tasks.length}）`, danger: true, disabled: !archivable.length, disabledReason: '选中项均处于活动状态', run: requestTaskArchive },
      { id: 'batch-hide', label: `移到已隐藏（${visible.length}）`, disabled: !visible.length, disabledReason: '选中项均已隐藏', run: () => visible.forEach(hideTask) },
      { id: 'batch-restore', label: `恢复显示（${hidden.length}）`, disabled: !hidden.length, disabledReason: '选中项没有可恢复的隐藏任务', run: () => hidden.forEach(restoreTask) },
      { id: 'batch-pin', label: `本地置顶（${unpinned.length}）`, disabled: !unpinned.length, disabledReason: '选中项均已置顶', run: () => unpinned.forEach((task) => togglePin({ kind: 'task', key: `task:${task.key}`, task })) },
      { id: 'batch-unpin', label: `取消本地置顶（${pinned.length}）`, disabled: !pinned.length, disabledReason: '选中项没有本地置顶', run: () => pinned.forEach((task) => togglePin({ kind: 'task', key: `task:${task.key}`, task })) },
      { id: 'batch-clear', label: '清空选择', run: clearSelection }
    ]
  }
  const item = drawerItem.value
  if (!item) return []
  if (item.kind === 'task') {
    return [
      { id: 'task-open', label: '打开任务', disabled: !item.task.actionAlias, disabledReason: '任务动作已失效', run: () => openTask(item.task) },
      { id: 'task-detail', label: '查看详情', run: () => { panel.value = { mode: 'detail', item } } },
      { id: 'task-alias', label: '编辑别名', run: () => editAlias(item) },
      { id: 'task-pin', label: item.task.pinSource === 'local' ? '取消本地置顶' : '本地置顶', run: () => togglePin(item) },
      { id: 'task-hide', label: item.task.isHidden ? '恢复显示' : '移到已隐藏', disabled: item.task.isHidden && !item.task.hiddenKind, run: () => item.task.isHidden ? restoreTask(item.task) : hideTask(item.task) },
      { id: 'task-archive', label: '真实归档', danger: true, disabled: !item.task.canArchive, disabledReason: '真实活动任务不可归档', run: requestTaskArchive }
    ]
  }
  return [
    { id: 'project-toggle', label: isProjectCollapsed(item.project) ? '展开项目' : '折叠项目', run: () => toggleProject(item.project) },
    { id: 'project-detail', label: '查看项目详情', run: () => { panel.value = { mode: 'detail', item } } },
    { id: 'project-alias', label: '编辑项目别名', run: () => editAlias(item) },
    { id: 'project-pin', label: item.project.pinSource === 'local' ? '取消本地置顶' : '本地置顶', disabled: item.project.kind === 'chats', disabledReason: 'Chats 分组不可置顶', run: () => togglePin(item) },
    { id: 'project-archive', label: '全部归档', danger: true, disabled: !item.project.actionAlias, disabledReason: '项目没有可归档任务', run: () => requestProjectArchive(item.project) },
    { id: 'project-remove', label: '从 EyPc 移除', danger: true, disabled: item.project.kind === 'chats', disabledReason: 'Chats 分组不可移除', run: () => requestProjectRemove(item.project) }
  ]
})

function action(actionId: string, args: Record<string, unknown> = {}) {
  if (floatState.value.resizing || resize) return
  window.eypcFloat?.action(actionId, args)
}

function requestExpansion(nextExpanded: boolean) {
  if (floatState.value.resizing || resize) return
  if (collapseTimer) clearTimeout(collapseTimer)
  desiredExpanded = nextExpanded
  window.eypcFloat?.setExpansion(nextExpanded, false)
}

function onCompactClick() {
  if (ignoreCompactClick) {
    ignoreCompactClick = false
    return
  }
  requestExpansion(true)
}

function compactCount(value: number) {
  return value > 99 ? '99+' : String(value)
}

function openCompactStatus(kind: 'input' | 'active' | 'unread') {
  if (kind === 'input' && compactCounts.value.input === 1) {
    const task = conversations.value?.inputRequired[0]
    if (task) openTask(task)
    return
  }
  switchTab(kind === 'input' ? 'input' : 'ongoing')
  requestExpansion(true)
}

function onCompactInputEnter() {
  if (!compactCounts.value.input) return
  if (compactInputTimer) clearTimeout(compactInputTimer)
  compactInputTimer = setTimeout(() => {
    switchTab('input')
    requestExpansion(true)
  }, 200)
}

function onCompactInputLeave() {
  if (compactInputTimer) clearTimeout(compactInputTimer)
  compactInputTimer = null
}

function switchTab(tab: CodexTaskTab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  clearConfirm()
  panel.value = null
  aliasEditor.value = null
  action('codex.tab.set', { tab })
  void nextTick(() => focusCurrent())
}

function openTask(task: CodexTaskCard) {
  if (task.actionAlias) action('codex.task.open', { key: task.key, actionAlias: task.actionAlias })
}

function hideTask(task: CodexTaskCard) {
  action('codex.task.hide', { key: task.key, revisionAt: task.revisionAt })
}

function restoreTask(task: CodexTaskCard) {
  if (task.hiddenKind) action('codex.task.restore', { key: task.key, revisionAt: task.revisionAt, kind: task.hiddenKind })
}

function toggleProject(project: CodexProjectCard) {
  const collapsed = !isProjectCollapsed(project)
  optimisticProjectCollapsed.value = { ...optimisticProjectCollapsed.value, [project.key]: collapsed }
  action('codex.project.collapse', { key: project.key, collapsed })
}

function isProjectCollapsed(project: CodexProjectCard) {
  return Object.prototype.hasOwnProperty.call(optimisticProjectCollapsed.value, project.key)
    ? optimisticProjectCollapsed.value[project.key]
    : project.collapsed
}

function togglePin(item: FocusItem) {
  action('codex.pin.toggle', { kind: item.kind, key: item.kind === 'task' ? item.task.key : item.project.key })
}

function movePin(item: FocusItem, direction: -1 | 1) {
  action('codex.pin.move', { kind: item.kind, key: item.kind === 'task' ? item.task.key : item.project.key, direction })
}

function editAlias(item: FocusItem) {
  const target = item.kind === 'task' ? item.task : item.project
  aliasEditor.value = { kind: item.kind, key: target.key, value: target.alias || '', originalName: target.originalName }
  panel.value = null
  clearConfirm()
  void nextTick(() => {
    aliasInput.value?.focus()
    aliasInput.value?.select()
  })
}

function saveAlias() {
  const editor = aliasEditor.value
  if (!editor) return
  action('codex.alias.set', { kind: editor.kind, key: editor.key, alias: editor.value })
  aliasEditor.value = null
}

function clearConfirm() {
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = null
  pendingConfirm.value = null
  pendingRun = null
}

function requestConfirmation(id: string, label: string, run: () => void) {
  if (pendingConfirm.value?.id === id && pendingConfirm.value.until >= Date.now()) {
    const execute = pendingRun
    clearConfirm()
    execute?.()
    return
  }
  clearConfirm()
  pendingRun = run
  pendingConfirm.value = { id, label, until: Date.now() + 5_000 }
  liveMessage.value = `${label}：请在 5 秒内再次执行相同操作确认`
  confirmTimer = setTimeout(clearConfirm, 5_000)
}

function archiveCandidates() {
  const selected = selectedTasks.value.filter((task) => task.canArchive)
  if (selected.length) return selected
  return focusedItem.value?.kind === 'task' && focusedItem.value.task.canArchive ? [focusedItem.value.task] : []
}

function taskArchiveConfirming(task: CodexTaskCard) {
  const id = pendingConfirm.value?.id || ''
  if (!id.startsWith('archive:')) return false
  return id.slice('archive:'.length).split('|').includes(`${task.key}:${task.revisionAt}`)
}

function requestTaskArchive() {
  const tasks = archiveCandidates()
  if (!tasks.length) {
    liveMessage.value = '当前没有可归档的非活动任务'
    return
  }
  const identity = tasks.map((task) => `${task.key}:${task.revisionAt}`).sort().join('|')
  requestConfirmation(`archive:${identity}`, `归档 ${tasks.length} 个 Codex 任务`, () => {
    action('codex.tasks.archive', { items: tasks.map((task) => ({ key: task.key, revisionAt: task.revisionAt })) })
    selectedKeys.value = new Set()
  })
}

function requestProjectArchive(project: CodexProjectCard) {
  if (!project.actionAlias) return
  requestConfirmation(`archive-project:${project.key}`, `归档 ${project.name} 的全部非活动任务`, () => {
    action('codex.project.archive', { key: project.key, actionAlias: project.actionAlias })
  })
}

function requestProjectRemove(project: CodexProjectCard) {
  requestConfirmation(`remove-project:${project.key}`, `从 EyPc 移除 ${project.name}`, () => action('codex.project.remove', { key: project.key }))
}

function setSelection(next: Set<string>, anchor?: string) {
  selectedKeys.value = new Set(next)
  if (anchor) rangeAnchorKey.value = anchor
}

function clearSelection() {
  selectedKeys.value = new Set()
  rangeAnchorKey.value = ''
  clearConfirm()
}

function selectTask(task: CodexTaskCard, event?: MouseEvent) {
  focusedKey.value = `task:${task.key}`
  const current = new Set(selectedKeys.value)
  if (event?.shiftKey && rangeAnchorKey.value) {
    const taskItems = focusItems.value.filter((item): item is Extract<FocusItem, { kind: 'task' }> => item.kind === 'task')
    const from = taskItems.findIndex((item) => item.task.key === rangeAnchorKey.value)
    const to = taskItems.findIndex((item) => item.task.key === task.key)
    if (from >= 0 && to >= 0) {
      for (const item of taskItems.slice(Math.min(from, to), Math.max(from, to) + 1)) current.add(item.task.key)
      setSelection(current)
      return
    }
  }
  if (event?.ctrlKey || event?.metaKey) {
    if (current.has(task.key)) current.delete(task.key)
    else current.add(task.key)
    setSelection(current, task.key)
    return
  }
  if (current.size === 1 && current.has(task.key)) setSelection(new Set(), task.key)
  else setSelection(new Set([task.key]), task.key)
}

function toggleTaskSelection(task: CodexTaskCard) {
  const next = new Set(selectedKeys.value)
  const added = !next.has(task.key)
  if (!added) next.delete(task.key)
  else next.add(task.key)
  setSelection(next, task.key)
  return added
}

function selectProjectChildren(project: CodexProjectCard) {
  const next = new Set(selectedKeys.value)
  const visible = project.tasks.filter((task) => visibleTaskKeys.value.has(task.key))
  const allSelected = visible.length > 0 && visible.every((task) => next.has(task.key))
  for (const task of visible) {
    if (allSelected) next.delete(task.key)
    else next.add(task.key)
  }
  setSelection(next)
  return !allSelected && visible.length > 0
}

function updateBatchPlacement() {
  const scroll = taskScroll.value
  if (!showBatchToolbar.value || !scroll) {
    batchPlacement.value = 'bottom'
    return
  }
  const focusRows = Array.from(scroll.querySelectorAll<HTMLElement>('[data-focus-key]'))
  const selected = selectedKeys.value
  const anchor = focusRows.find((row) => row.dataset.focusKey === focusedKey.value)
    || [...focusRows].reverse().find((row) => {
      const key = row.dataset.focusKey || ''
      return key.startsWith('task:') && selected.has(key.slice(5))
    })
  if (!anchor) {
    batchPlacement.value = 'bottom'
    return
  }
  const scrollRect = scroll.getBoundingClientRect()
  const anchorRect = anchor.getBoundingClientRect()
  const scrollMiddle = scrollRect.top + scrollRect.height / 2
  const anchorMiddle = anchorRect.top + anchorRect.height / 2
  batchPlacement.value = anchorMiddle > scrollMiddle ? 'top' : 'bottom'
}

function scheduleBatchPlacement() {
  void nextTick(updateBatchPlacement)
}

function openBatchDrawer() {
  openPanel('drawer')
}

function focusCurrent() {
  const item = focusedItem.value
  if (!item) return
  focusedKey.value = item.key
  void nextTick(() => {
    const element = document.querySelector<HTMLElement>(`[data-focus-key="${item.key}"]`)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'nearest' })
  })
}

function moveFocus(direction: -1 | 1) {
  if (!focusItems.value.length) return
  const currentIndex = Math.max(0, focusItems.value.findIndex((item) => item.key === focusedKey.value))
  const target = focusItems.value[Math.max(0, Math.min(focusItems.value.length - 1, currentIndex + direction))]
  highlightOwner.value = 'keyboard'
  keyboardMouseOrigin = { ...lastMousePoint }
  focusedKey.value = target.key
  focusCurrent()
}

function moveAfterCurrent() {
  const currentIndex = focusItems.value.findIndex((item) => item.key === focusedKey.value)
  if (currentIndex < 0 || currentIndex >= focusItems.value.length - 1) return
  moveFocus(1)
}

function onRowPointerMove(event: PointerEvent, key: string) {
  const point = { x: event.clientX, y: event.clientY }
  lastMousePoint = point
  if (highlightOwner.value === 'keyboard') {
    const moved = !Number.isFinite(keyboardMouseOrigin.x)
      || Math.hypot(point.x - keyboardMouseOrigin.x, point.y - keyboardMouseOrigin.y) >= 3
    if (!moved) return
  }
  highlightOwner.value = 'mouse'
  focusedKey.value = key
}

function openContextDrawer(item: FocusItem) {
  focusedKey.value = item.key
  if (item.kind === 'project' || (item.kind === 'task' && selectedKeys.value.size && !selectedKeys.value.has(item.task.key))) clearSelection()
  panel.value = { mode: 'drawer', item }
  drawerActiveIndex.value = 0
  clearConfirm()
}

function openPanel(mode: 'detail' | 'drawer') {
  const item = mode === 'drawer' ? drawerItem.value : focusedItem.value
  if (!item) return
  panel.value = { mode, item }
  drawerActiveIndex.value = 0
  clearConfirm()
}

function executeDrawerAction(index: number) {
  const item = drawerActions.value[index]
  if (!item || item.disabled) {
    if (item?.disabledReason) liveMessage.value = item.disabledReason
    return
  }
  item.run()
}

function moveDrawer(direction: -1 | 1) {
  const actions = drawerActions.value
  if (!actions.length) return
  let index = drawerActiveIndex.value
  for (let step = 0; step < actions.length; step += 1) {
    index = (index + direction + actions.length) % actions.length
    if (!actions[index].disabled) break
  }
  drawerActiveIndex.value = index
  void nextTick(() => document.querySelector<HTMLElement>(`[data-drawer-index="${index}"]`)?.focus({ preventScroll: true }))
}

function clearHoverCard() {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
  hoverCard.value = null
}

function scheduleHoverCard(event: Event, card: Omit<HoverCard, 'left' | 'top'>, delay: 200 | 500) {
  clearHoverCard()
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  hoverTimer = setTimeout(() => {
    const width = Math.min(268, Math.max(210, window.innerWidth - 20))
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))
    const estimatedHeight = card.kind === 'task' ? 126 : 70
    const top = rect.bottom + estimatedHeight + 8 <= window.innerHeight
      ? rect.bottom + 6
      : Math.max(8, rect.top - estimatedHeight - 6)
    hoverCard.value = { ...card, left, top }
  }, delay)
}

function showTaskHover(event: Event, task: CodexTaskCard) {
  scheduleHoverCard(event, {
    id: `task:${task.key}`,
    kind: 'task',
    title: task.name,
    lines: [
      task.alias ? `原名：${task.originalName}` : `项目：${task.projectName}`,
      ...(task.alias ? [`项目：${task.projectName}`] : []),
      `状态：${taskStateLabel(task)}`,
      `最后提问：${formatTaskDateTime(task.lastQuestionAt)}`,
      `归档：${task.canArchive ? task.archiveCapability === 'allowed-with-warning' ? '可归档，状态需再次核验' : '可归档' : '活动中，不可归档'}`
    ]
  }, 500)
}

function showHintHover(event: Event, id: string, title: string, lines: string[] = []) {
  scheduleHoverCard(event, { id, kind: 'hint', title, lines }, 200)
}

function showStatusHover(event: Event, task: CodexTaskCard) {
  scheduleHoverCard(event, {
    id: `status:${task.key}`,
    kind: 'status',
    title: taskStateLabel(task),
    lines: [
      task.activityState === 'waiting-input' ? 'Codex 正在等待你输入内容后继续。' : task.activityState === 'waiting-approval' ? 'Codex 正在等待你的审批。' : task.bucket === 'completed-unread' ? '任务已完成，但你还没有查看这一轮结果。' : '这是 App Server 返回的真实任务状态。',
      ...(task.activeFlags?.length ? [`活动标记：${task.activeFlags.join('、')}`] : [])
    ]
  }, 200)
}

function quickJumpLabel(element: HTMLElement) {
  return element.getAttribute('data-quick-jump-label')
    || element.getAttribute('aria-label')
    || (element.textContent || '').replace(/\s+/g, ' ').trim()
    || '操作'
}

function collectQuickJumpTargets(backward = false): QuickJumpDomTarget[] {
  const elements = Array.from((rootElement.value || document.body).querySelectorAll<HTMLElement>('[data-quick-jump-target]'))
    .filter((element) => {
      if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width >= 6 && rect.height >= 6 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    })
  const targets = elements.map((element, index) => ({
    id: element.dataset.quickJumpId || `float:${index}:${quickJumpLabel(element)}`,
    label: quickJumpLabel(element),
    searchText: element.dataset.quickJumpSearch || '',
    element
  }))
  return assignQuickJumpMarkers(backward ? targets.reverse() : targets)
}

function syncQuickJumpActive(scroll = false) {
  rootElement.value?.querySelectorAll<HTMLElement>('[data-quick-jump-active="true"]').forEach((element) => delete element.dataset.quickJumpActive)
  const target = quickJump.value.targets.find((item) => item.id === quickJump.value.activeTargetId)
  if (!target) return
  target.element.dataset.quickJumpActive = 'true'
  if (scroll) target.element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function closeQuickJump() {
  rootElement.value?.querySelectorAll<HTMLElement>('[data-quick-jump-active="true"]').forEach((element) => delete element.dataset.quickJumpActive)
  quickJump.value = { open: false, query: '', sourceTargets: [], targets: [], activeTargetId: null }
}

function openQuickJump(backward = false) {
  const targets = collectQuickJumpTargets(backward)
  if (!targets.length) return false
  quickJump.value = { open: true, query: '', sourceTargets: targets, targets, activeTargetId: targets[0]?.id || null }
  syncQuickJumpActive(true)
  clearHoverCard()
  return true
}

function activateQuickJumpTarget() {
  const target = quickJump.value.sourceTargets.find((item) => item.id === quickJump.value.activeTargetId)
  if (!target) return
  closeQuickJump()
  target.element.focus({ preventScroll: true })
  target.element.click()
}

function handleQuickJumpKey(event: KeyboardEvent) {
  if (!quickJump.value.open) return false
  const shortcut = shortcutFromEvent(event)
  if (shortcut === 'Escape') closeQuickJump()
  else if (shortcut === 'Enter') activateQuickJumpTarget()
  else if (shortcut === 'ArrowDown' || shortcut === 'Ctrl+J') {
    quickJump.value.activeTargetId = moveQuickJumpActive(quickJump.value.targets, quickJump.value.activeTargetId, 1)
    syncQuickJumpActive(true)
  } else if (shortcut === 'ArrowUp' || shortcut === 'Ctrl+K') {
    quickJump.value.activeTargetId = moveQuickJumpActive(quickJump.value.targets, quickJump.value.activeTargetId, -1)
    syncQuickJumpActive(true)
  } else {
    const nextQuery = shortcut === 'Backspace'
      ? quickJump.value.query.slice(0, -1)
      : /^[A-Z]$/.test(shortcut) ? `${quickJump.value.query}${shortcut.toLocaleLowerCase()}` : null
    if (nextQuery !== null) {
      const result = resolveQuickJumpQuery(quickJump.value.sourceTargets, nextQuery)
      quickJump.value = { ...quickJump.value, query: result.query, targets: result.targets, activeTargetId: result.activeTargetId }
      syncQuickJumpActive(true)
      if (result.exactTargetId) activateQuickJumpTarget()
    }
  }
  return true
}

const fallbackCommands: Record<string, string> = {
  ArrowUp: 'codex.list.up',
  ArrowDown: 'codex.list.down',
  Space: 'codex.selection.toggle',
  Enter: 'codex.task.openFocused',
  'Ctrl+ArrowLeft': 'codex.detail.open',
  'Ctrl+ArrowRight': 'codex.drawer.open',
  Delete: 'codex.task.archiveFocused',
  F2: 'codex.alias.edit',
  'Ctrl+P': 'codex.pin.toggleFocused',
  'Alt+ArrowUp': 'codex.pin.moveUp',
  'Alt+ArrowDown': 'codex.pin.moveDown',
  'Ctrl+F': 'codex.search.focus',
  'Ctrl+R': 'codex.refresh',
  F: 'quickJump.openForward',
  'Shift+F': 'quickJump.openBackward',
  Escape: 'codex.layer.cancel'
}

function commandFor(event: KeyboardEvent) {
  const shortcut = shortcutFromEvent(event)
  const resolved = snapshot.value?.keybindings
  if (Array.isArray(resolved)) return resolved.find((binding) => binding.shortcutId === shortcut)?.actionId || ''
  return fallbackCommands[shortcut] || (/^Ctrl\+[1-9]$/.test(shortcut) ? `codex.drawer.select.${shortcut.slice(-1)}` : '')
}

function onRootKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (handleQuickJumpKey(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  const target = event.target as HTMLElement
  const editing = Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  const command = commandFor(event)
  if (editing) {
    if (command === 'codex.layer.cancel') {
      event.preventDefault()
      if (aliasEditor.value) aliasEditor.value = null
      else if (target === searchInput.value && searchText.value) searchText.value = ''
      else target.blur()
    } else if (command === 'codex.search.focus') {
      event.preventDefault()
      searchInput.value?.focus()
    }
    return
  }
  if (!command) return
  event.preventDefault()
  event.stopPropagation()
  const item = focusedItem.value
  if (command === 'codex.float.activate') {
    requestExpansion(true)
    focusCurrent()
  }
  else if (command === 'codex.float.toggle') action('codex.float.toggle', { source: 'in-app-shortcut' })
  else if (command === 'quickJump.openForward') openQuickJump(false)
  else if (command === 'quickJump.openBackward') openQuickJump(true)
  else if (command === 'codex.list.up' && panel.value?.mode === 'drawer') moveDrawer(-1)
  else if (command === 'codex.list.down' && panel.value?.mode === 'drawer') moveDrawer(1)
  else if (command === 'codex.task.openFocused' && panel.value?.mode === 'drawer') executeDrawerAction(drawerActiveIndex.value)
  else if (command === 'codex.list.up') moveFocus(-1)
  else if (command === 'codex.list.down') moveFocus(1)
  else if (command === 'codex.selection.toggle' && item?.kind === 'task') {
    if (toggleTaskSelection(item.task)) moveAfterCurrent()
  }
  else if (command === 'codex.selection.toggle' && item?.kind === 'project') {
    if (selectProjectChildren(item.project)) moveAfterCurrent()
  }
  else if (command === 'codex.task.openFocused' && item?.kind === 'task') openTask(item.task)
  else if (command === 'codex.task.openFocused' && item?.kind === 'project') toggleProject(item.project)
  else if (command === 'codex.detail.open') openPanel('detail')
  else if (command === 'codex.drawer.open') openPanel('drawer')
  else if (command === 'codex.task.archiveFocused') requestTaskArchive()
  else if (command === 'codex.alias.edit' && item) editAlias(item)
  else if (command === 'codex.pin.toggleFocused' && item) togglePin(item)
  else if (command === 'codex.pin.moveUp' && item) movePin(item, -1)
  else if (command === 'codex.pin.moveDown' && item) movePin(item, 1)
  else if (command === 'codex.search.focus') searchInput.value?.focus()
  else if (command === 'codex.refresh') action('codex.refresh')
  else if (command.startsWith('codex.drawer.select.')) executeDrawerAction(Number(command.split('.').at(-1)) - 1)
  else if (command === 'codex.layer.cancel') {
    if (pendingConfirm.value) clearConfirm()
    else if (aliasEditor.value) aliasEditor.value = null
    else if (panel.value) panel.value = null
    else if (selectedKeys.value.size) selectedKeys.value = new Set()
    else if (searchText.value) searchText.value = ''
    else if (expanded.value && !resize) {
      restoreCompactFocus = true
      requestExpansion(false)
    }
  }
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (pendingConfirm.value && !target.closest('[data-confirm-slot]')) clearConfirm()
  if (resize || target.closest('.float-resize-handle')) return
  const compactTarget = target.closest('.float-compact')
  if (!compactTarget && !target.closest('.float-drag-handle')) return
  drag = { x: event.screenX, y: event.screenY, moved: false, pointerId: event.pointerId }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  window.eypcFloat?.dragStart(event.screenX, event.screenY)
}

function onPointerMove(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) >= 5) drag.moved = true
  if (drag.moved) window.eypcFloat?.dragMove(event.screenX, event.screenY)
}

function onPointerUp(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  ignoreCompactClick = drag.moved
  drag = null
  window.eypcFloat?.dragEnd()
}

function onPointerCancel(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  ignoreCompactClick = drag.moved
  drag = null
  window.eypcFloat?.dragEnd()
}

function onMouseEnter(event: PointerEvent) {
  hoverInside = true
  if (collapseTimer) clearTimeout(collapseTimer)
  if ((event.target as HTMLElement | null)?.closest('.float-counter')) return
  if (!desiredExpanded && !expanded.value && !drag && !resize) requestExpansion(true)
}

function scheduleCollapse() {
  if (collapseTimer) clearTimeout(collapseTimer)
  if (focusWithin || resize || pendingConfirm.value || panel.value || aliasEditor.value) return
  collapseTimer = setTimeout(() => {
    if (!hoverInside && !focusWithin && !resize) requestExpansion(false)
  }, 100)
}

function onMouseLeave() {
  hoverInside = false
  onCompactInputLeave()
  clearHoverCard()
  scheduleCollapse()
}

function onFocusIn() {
  focusWithin = true
  if (collapseTimer) clearTimeout(collapseTimer)
}

function onFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
  focusWithin = false
  if (!hoverInside) scheduleCollapse()
}

function onResizePointerDown(event: PointerEvent, corner: CodexFloatResizeCorner) {
  if (!expanded.value || resize || drag) return
  event.preventDefault()
  if (!window.eypcFloat?.resizeStart(event.screenX, event.screenY, corner)) return
  resize = { pointerId: event.pointerId, corner }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onResizePointerMove(event: PointerEvent) {
  if (resize?.pointerId === event.pointerId) window.eypcFloat?.resizeMove(event.screenX, event.screenY)
}

function onResizePointerUp(event: PointerEvent) {
  if (resize?.pointerId !== event.pointerId) return
  resize = null
  window.eypcFloat?.resizeEnd()
}

function onResizePointerCancel(event: PointerEvent) {
  if (resize?.pointerId !== event.pointerId) return
  resize = null
  window.eypcFloat?.resizeCancel()
}

function onResizeHandleKeydown(event: KeyboardEvent, corner: CodexFloatResizeCorner) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Escape') return void window.eypcFloat?.resizeCancel()
  const step = event.shiftKey ? 32 : 8
  const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
  const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
  if (!window.eypcFloat?.resizeStart(0, 0, corner)) return
  window.eypcFloat.resizeMove(dx, dy)
  window.eypcFloat.resizeEnd()
}

function formatReset(value: number | null | undefined) {
  if (!value) return '重置时间未提供'
  const minutes = Math.max(0, Math.round((value - Date.now()) / 60_000))
  if (minutes < 60) return `${minutes} 分钟后重置`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时后重置`
  return `${Math.floor(minutes / 1440)} 天后重置`
}

function formatTaskTime(value: number | undefined) {
  if (!value) return '时间缺失'
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}

function formatTaskDateTime(value: number | undefined) {
  if (!value) return '时间缺失'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(value))
}

function taskStateLabel(task: CodexTaskCard) {
  if (task.bucket === 'completed-unread') return '已完成 · 未查看'
  if (task.bucket === 'completed') return '已完成'
  if (task.activityState === 'waiting-approval') return '等待审批'
  if (task.activityState === 'waiting-input') return '等待输入'
  if (task.activityState === 'failed') return '执行失败'
  if (task.activityState === 'interrupted') return '已中断'
  if (task.activityState === 'system-error') return '系统错误'
  if (task.activityState === 'unknown') return '状态待核验'
  return '进行中'
}

function taskIcon(task: CodexTaskCard) {
  if (task.isHidden) return EyeOff
  if (task.bucket === 'completed' || task.bucket === 'completed-unread') return Eye
  if (task.activityState === 'waiting-input') return MessageSquareText
  if (task.activityState === 'waiting-approval') return ShieldCheck
  if (['failed', 'interrupted', 'system-error'].includes(task.activityState)) return TriangleAlert
  if (task.activityState === 'active') return CirclePlay
  return History
}

watch(() => conversations.value?.activeTab, (tab) => {
  if (tab && tabs.some((item) => item.id === tab)) activeTab.value = tab
}, { immediate: true })

watch(() => conversations.value?.projects.map((project) => `${project.key}:${project.collapsed}`).join('|'), () => {
  const next = { ...optimisticProjectCollapsed.value }
  let changed = false
  for (const project of conversations.value?.projects || []) {
    if (Object.prototype.hasOwnProperty.call(next, project.key) && next[project.key] === project.collapsed) {
      delete next[project.key]
      changed = true
    }
  }
  if (changed) optimisticProjectCollapsed.value = next
})

watch([searchText, activeTab, renderRows], () => {
  const visible = visibleTaskKeys.value
  selectedKeys.value = new Set([...selectedKeys.value].filter((key) => visible.has(key)))
  if (!focusItems.value.some((item) => item.key === focusedKey.value)) focusedKey.value = focusItems.value[0]?.key || ''
  clearConfirm()
  closeQuickJump()
  clearHoverCard()
}, { flush: 'post' })

watch(() => `${selectedTasks.value.map((task) => task.key).join('|')}::${focusedKey.value}`, scheduleBatchPlacement, { flush: 'post' })

watch(taskScroll, (element) => {
  taskScrollResizeObserver?.disconnect()
  taskScrollResizeObserver = null
  if (element && typeof ResizeObserver !== 'undefined') {
    taskScrollResizeObserver = new ResizeObserver(updateBatchPlacement)
    taskScrollResizeObserver.observe(element)
  }
  scheduleBatchPlacement()
})

onMounted(() => {
  snapshot.value = window.eypcFloat?.getSnapshot() || null
  floatState.value = window.eypcFloat?.getState() || floatState.value
  expanded.value = floatState.value.expanded
  desiredExpanded = expanded.value
  if (snapshot.value?.conversations.activeTab) activeTab.value = snapshot.value.conversations.activeTab
  stopSnapshot = window.eypcFloat?.onSnapshot((value) => { snapshot.value = value }) || null
  stopState = window.eypcFloat?.onState((value) => {
    floatState.value = value
    expanded.value = value.expanded
    desiredExpanded = value.expanded
    if (!value.expanded && restoreCompactFocus) {
      restoreCompactFocus = false
      void nextTick(() => document.querySelector<HTMLElement>('.float-compact')?.focus())
    }
  }) || null
  stopActivate = window.eypcFloat?.onActivate?.(() => {
    requestExpansion(true)
    void nextTick(() => focusCurrent())
  }) || null
  window.addEventListener('resize', scheduleBatchPlacement)
})

onUnmounted(() => {
  if (collapseTimer) clearTimeout(collapseTimer)
  if (compactInputTimer) clearTimeout(compactInputTimer)
  clearHoverCard()
  closeQuickJump()
  clearConfirm()
  taskScrollResizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleBatchPlacement)
  stopSnapshot?.()
  stopState?.()
  stopActivate?.()
})
</script>

<template>
  <main
    ref="rootElement"
    class="codex-float-root"
    :class="[{ expanded, resizing: floatState.resizing, card: settings?.style === 'card', water: settings?.style !== 'card' }, floatState.resizeCorner ? `resize-${floatState.resizeCorner}` : '']"
    :style="rootStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerenter="onMouseEnter"
    @pointerleave="onMouseLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onRootKeydown"
  >
    <div v-if="!expanded" class="float-compact-shell" :class="settings?.style === 'card' ? 'card-shell' : 'water-shell'">
      <button type="button" class="float-compact" :class="settings?.style === 'card' ? 'card-surface' : 'water-surface'" aria-expanded="false" :aria-label="compactAriaLabel" @click="onCompactClick">
        <CodexWaterBall
          v-if="settings?.style !== 'card'"
          :primary="compact.primary"
          :secondary="compact.secondary"
          :state-label="compact.stateLabel"
          :label="compact.ariaLabel"
          :appearance="settings?.waterAppearance || fallbackWaterAppearance"
          :colors="settings?.colors || fallbackColors"
          decorative
        />
        <template v-else>
          <div class="float-card-primary" :class="{ empty: !compact.primary }">
            <span>{{ compact.primary?.longLabel || 'Codex' }}</span>
            <strong>{{ compact.primary ? `${compact.primary.bucket.remainingPercent}%` : compact.stateLabel }}</strong>
            <small v-if="compact.primary?.kind === 'short'">5h</small>
          </div>
          <div v-if="quota?.weekly" class="float-card-detail">
            <div class="card-weekly-head"><span>周限额</span><strong>{{ quota.weekly.remainingPercent }}%</strong></div>
            <div class="card-weekly-track"><i :style="{ width: `${quota.weekly.remainingPercent}%` }" /></div>
          </div>
        </template>
        <span v-if="quota?.status === 'stale' || quota?.status === 'error'" class="float-status-dot" :class="quota.status" aria-hidden="true" />
      </button>
      <button
        v-if="compactCounts.input"
        type="button"
        class="float-counter input"
        :aria-label="`${compactCounts.input} 个待输入任务`"
        @pointerenter.stop="onCompactInputEnter"
        @pointerleave.stop="onCompactInputLeave"
        @click.stop="openCompactStatus('input')"
      >{{ compactCount(compactCounts.input) }}</button>
      <button v-if="compactCounts.active" type="button" class="float-counter active" :aria-label="`${compactCounts.active} 个当前动态任务`" @click.stop="openCompactStatus('active')">{{ compactCount(compactCounts.active) }}</button>
      <button v-if="compactCounts.unread" type="button" class="float-counter unread" :aria-label="`${compactCounts.unread} 个已完成未查看任务`" @click.stop="openCompactStatus('unread')">{{ compactCount(compactCounts.unread) }}</button>
    </div>

    <section v-else class="float-expanded-card" aria-label="Codex Companion">
      <nav class="float-task-tabs" role="tablist" aria-label="Codex 会话分类">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :tabindex="activeTab === tab.id ? 0 : -1"
          :class="{ active: activeTab === tab.id }"
          data-quick-jump-target
          :data-quick-jump-label="`切换到${tab.label}`"
          @click.stop="switchTab(tab.id)"
        >{{ tab.label }} <span>{{ tabCounts[tab.id] }}</span></button>
      </nav>
      <div class="float-drag-handle" aria-hidden="true" />

      <label class="float-search">
        <Search :size="14" aria-hidden="true" />
        <input ref="searchInput" v-model="searchText" type="search" placeholder="搜索本页会话、别名或项目" aria-label="搜索当前 Codex 页签" data-quick-jump-target data-quick-jump-label="搜索当前页签" />
        <button v-if="searchText" type="button" aria-label="清空搜索" data-quick-jump-target @click.stop="searchText = ''"><X :size="13" /></button>
      </label>

      <section class="float-quota-text" aria-label="Codex 实际额度窗口">
        <div v-for="item in expandedQuota" :key="item.key">
          <span>{{ item.label }}</span><strong>{{ item.bucket.remainingPercent }}%</strong><small>{{ formatReset(item.bucket.resetAt) }}</small>
        </div>
        <p v-if="!expandedQuota.length">{{ compact.stateLabel || '服务端未返回额度窗口' }}</p>
      </section>

      <div class="float-source-status" :class="conversations?.status" role="status" aria-live="polite">
        <span>{{ statusText }}</span>
        <span v-if="pendingConfirm" class="confirm-hint">{{ pendingConfirm.label }} · 再次操作确认</span>
      </div>

      <form v-if="aliasEditor" class="float-inline-editor" @submit.prevent="saveAlias">
        <label><span>本地别名</span><input ref="aliasInput" v-model="aliasEditor.value" maxlength="120" :placeholder="aliasEditor.originalName" /></label>
        <button type="submit">保存</button><button type="button" @click="aliasEditor = null">取消</button>
      </form>

      <section v-if="settings?.conversationInboxEnabled" class="float-task-inbox">
        <div class="float-task-list-stage">
          <div
            ref="taskScroll"
            class="float-task-scroll"
            :class="{
              'batch-toolbar-top': showBatchToolbar && batchPlacement === 'top',
              'batch-toolbar-bottom': showBatchToolbar && batchPlacement === 'bottom'
            }"
            :role="activeTab === 'projects' ? 'tree' : 'listbox'"
            :aria-multiselectable="activeTab === 'projects' ? undefined : true"
            :aria-label="`${tabs.find((tab) => tab.id === activeTab)?.label || ''}会话`"
            @scroll.passive="updateBatchPlacement"
          >
          <template v-for="row in renderRows" :key="row.key">
            <h2 v-if="row.kind === 'section'" class="float-project-section">{{ row.section.title }}</h2>
            <h2 v-else-if="row.kind === 'status-section'" class="float-status-section" :class="row.tone"><span>{{ row.title }}</span><em>{{ row.count }}</em></h2>

            <div
              v-else-if="row.kind === 'project'"
              class="float-project-row"
              :class="{ highlighted: focusedKey === row.key }"
              role="treeitem"
              :aria-expanded="!isProjectCollapsed(row.project)"
              :aria-label="`${row.project.name}，${row.project.tasks.length} 个窗口内任务`"
              :tabindex="focusedKey === row.key ? 0 : -1"
              :data-focus-key="row.key"
              data-quick-jump-target
              :data-quick-jump-label="`${isProjectCollapsed(row.project) ? '展开' : '折叠'}项目 ${row.project.name}`"
              @focus="focusedKey = row.key"
              @pointermove="onRowPointerMove($event, row.key)"
              @contextmenu.prevent.stop="openContextDrawer(row)"
            >
              <button type="button" class="project-main" data-quick-jump-target :data-quick-jump-label="`${isProjectCollapsed(row.project) ? '展开' : '折叠'}项目 ${row.project.name}`" @click.stop="focusedKey = row.key; toggleProject(row.project)">
                <ChevronRight v-if="isProjectCollapsed(row.project)" :size="14" /><ChevronDown v-else :size="14" />
                <Folder v-if="isProjectCollapsed(row.project)" :size="15" /><FolderOpen v-else :size="15" />
                <span><strong>{{ row.project.name }}</strong><small v-if="row.project.alias">原名：{{ row.project.originalName }}</small><small v-else>{{ row.project.tasks.length ? `${row.project.tasks.length} 个最近任务` : `最近 ${settings?.timeWindowDays || 30} 天无会话` }}</small></span>
                <em v-if="row.project.pinSource === 'local'">本地</em>
              </button>
              <div class="task-action-rail project-actions">
                <button type="button" aria-label="编辑项目别名" data-quick-jump-target @pointerenter="showHintHover($event, `project-alias:${row.project.key}`, '编辑项目别名', ['快捷键：F2'])" @pointerleave="clearHoverCard" @click.stop="editAlias(row)"><span aria-hidden="true">名</span></button>
                <button type="button" class="pin-action" :class="{ active: row.project.pinSource === 'local' }" :disabled="row.project.kind === 'chats'" :aria-label="row.project.kind === 'chats' ? 'Chats 分组不可置顶' : row.project.pinSource === 'local' ? '取消项目本地置顶' : '将项目本地置顶'" :aria-pressed="row.project.kind === 'chats' ? undefined : row.project.pinSource === 'local'" data-quick-jump-target @pointerenter="showHintHover($event, `project-pin:${row.project.key}`, row.project.pinSource === 'local' ? '取消本地置顶' : '本地置顶', ['快捷键：Ctrl+P'])" @pointerleave="clearHoverCard" @click.stop="togglePin(row)"><span aria-hidden="true">顶</span></button>
                <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id === `archive-project:${row.project.key}` }" :disabled="!row.project.actionAlias" :aria-label="row.project.actionAlias ? '全部归档项目任务' : '当前项目没有可归档任务'" data-confirm-slot data-quick-jump-target @pointerenter="showHintHover($event, `project-archive:${row.project.key}`, '全部归档项目', ['排除活动任务；同位二次确认'])" @pointerleave="clearHoverCard" @click.stop="requestProjectArchive(row.project)"><span aria-hidden="true">{{ pendingConfirm?.id === `archive-project:${row.project.key}` ? '确' : '归' }}</span></button>
                <button type="button" class="remove" :class="{ confirming: pendingConfirm?.id === `remove-project:${row.project.key}` }" :disabled="row.project.kind === 'chats'" :aria-label="row.project.kind === 'chats' ? 'Chats 分组不能从 EyPc 移除' : '从 EyPc 移除项目'" data-confirm-slot data-quick-jump-target @pointerenter="showHintHover($event, `project-remove:${row.project.key}`, '从 EyPc 移除', ['只影响 EyPc 展示，不修改 Codex 原生项目'])" @pointerleave="clearHoverCard" @click.stop="requestProjectRemove(row.project)"><span aria-hidden="true">{{ pendingConfirm?.id === `remove-project:${row.project.key}` ? '确' : '移' }}</span></button>
              </div>
            </div>

            <div
              v-else-if="row.kind === 'task'"
              class="float-task-row"
              :class="[`task-${row.task.activityState}`, `bucket-${row.task.bucket}`, { nested: row.nested, selected: selectedKeys.has(row.task.key), hidden: row.task.isHidden, highlighted: focusedKey === row.key }]"
              :role="activeTab === 'projects' ? 'treeitem' : 'option'"
              :aria-selected="selectedKeys.has(row.task.key)"
              :aria-label="`${row.task.name}，${row.task.projectName}，${taskStateLabel(row.task)}`"
              :tabindex="focusedKey === row.key ? 0 : -1"
              :data-focus-key="row.key"
              data-quick-jump-target
              :data-quick-jump-label="`打开任务 ${row.task.name}`"
              @focus="focusedKey = row.key"
              @pointermove="onRowPointerMove($event, row.key)"
              @pointerenter="showTaskHover($event, row.task)"
              @pointerleave="clearHoverCard"
              @click.stop="focusedKey = row.key; openTask(row.task)"
              @contextmenu.prevent.stop="openContextDrawer(row)"
            >
              <button type="button" class="task-select-point" :aria-label="selectedKeys.has(row.task.key) ? `取消选择 ${row.task.name}` : `选择 ${row.task.name}`" data-quick-jump-target @click.stop="selectTask(row.task, $event)"><i /></button>
              <button type="button" class="task-state-button" :aria-label="`状态：${taskStateLabel(row.task)}`" @pointerenter.stop="showStatusHover($event, row.task)" @pointerleave.stop="clearHoverCard" @click.stop>
                <component :is="taskIcon(row.task)" :size="14" class="task-state-icon" aria-hidden="true" />
              </button>
              <span class="task-copy">
                <strong>{{ row.task.name }}</strong>
                <small v-if="row.task.alias">原名：{{ row.task.originalName }}</small>
                <small>{{ row.task.projectName }} · {{ taskStateLabel(row.task) }} · {{ formatTaskTime(row.task.lastQuestionAt) }}</small>
              </span>
              <em v-if="row.task.isHidden">隐藏</em><em v-if="row.task.pinSource === 'local'">本地</em>
              <div class="task-action-rail">
                <button type="button" aria-label="打开 Codex 任务" data-quick-jump-target @pointerenter.stop="showHintHover($event, `open:${row.task.key}`, '打开任务', ['单击整行或按 Enter'])" @pointerleave.stop="clearHoverCard" @click.stop="openTask(row.task)"><span aria-hidden="true">开</span></button>
                <button type="button" aria-label="编辑任务别名" data-quick-jump-target @pointerenter.stop="showHintHover($event, `alias:${row.task.key}`, '编辑任务别名', ['快捷键：F2'])" @pointerleave.stop="clearHoverCard" @click.stop="editAlias(row)"><span aria-hidden="true">名</span></button>
                <button type="button" class="pin-action" :class="{ active: row.task.pinSource === 'local' }" :aria-label="row.task.pinSource === 'local' ? '取消任务本地置顶' : '将任务本地置顶'" :aria-pressed="row.task.pinSource === 'local'" data-quick-jump-target @pointerenter.stop="showHintHover($event, `pin:${row.task.key}`, row.task.pinSource === 'local' ? '取消本地置顶' : '本地置顶', ['快捷键：Ctrl+P'])" @pointerleave.stop="clearHoverCard" @click.stop="togglePin(row)"><span aria-hidden="true">顶</span></button>
                <button type="button" :aria-label="row.task.isHidden ? '恢复任务显示' : '隐藏任务'" data-quick-jump-target @pointerenter.stop="showHintHover($event, `hide:${row.task.key}`, row.task.isHidden ? '恢复任务显示' : '移到已隐藏', ['只影响 EyPc 展示'])" @pointerleave.stop="clearHoverCard" @click.stop="row.task.isHidden ? restoreTask(row.task) : hideTask(row.task)"><span aria-hidden="true">{{ row.task.isHidden ? '显' : '隐' }}</span></button>
                <button type="button" class="danger" :class="{ confirming: taskArchiveConfirming(row.task) }" :disabled="!row.task.canArchive" :aria-label="row.task.canArchive ? '真实归档 Codex 任务' : '当前任务不可归档'" data-confirm-slot data-quick-jump-target @pointerenter.stop="showHintHover($event, `archive:${row.task.key}`, row.task.canArchive ? '真实归档 Codex 任务' : '活动任务不可归档', ['快捷键：Delete；同位二次确认'])" @pointerleave.stop="clearHoverCard" @click.stop="focusedKey = row.key; requestTaskArchive()"><span aria-hidden="true">{{ taskArchiveConfirming(row.task) ? '确' : '归' }}</span></button>
              </div>
            </div>

            <div v-else-if="row.kind === 'empty-project'" class="float-project-empty">最近 {{ settings?.timeWindowDays || 30 }} 天无会话</div>
          </template>

            <div v-if="!renderRows.length" class="float-empty">
              <template v-if="conversations?.status === 'loading'">正在执行真实会话预检</template>
              <template v-else-if="conversations?.status === 'error'">预检失败 · {{ conversations.errorMessage || '请刷新后重试' }}</template>
              <template v-else-if="searchText">当前页签没有匹配结果</template>
              <template v-else>当前页签没有未归档会话</template>
            </div>
          </div>

          <div v-if="showBatchToolbar" class="float-batch-toolbar" :class="batchPlacement" role="toolbar" :aria-label="`已选择 ${selectedTasks.length} 个任务的批量操作`">
            <strong>已选 {{ selectedTasks.length }}</strong>
            <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id?.startsWith('archive:') }" aria-label="归档当前多选任务" data-confirm-slot data-quick-jump-target @pointerenter="showHintHover($event, 'batch-archive', '归档当前多选', ['仅归档通过真实状态核验的任务'])" @pointerleave="clearHoverCard" @click.stop="requestTaskArchive"><span aria-hidden="true">{{ pendingConfirm?.id?.startsWith('archive:') ? '确' : '归' }}</span></button>
            <button type="button" aria-label="打开当前多选的完整操作" data-quick-jump-target @pointerenter="showHintHover($event, 'batch-actions', '多选完整操作', ['快捷键：Ctrl+→'])" @pointerleave="clearHoverCard" @click.stop="openBatchDrawer"><span aria-hidden="true">操</span></button>
            <button type="button" aria-label="清空当前多选" data-quick-jump-target @pointerenter="showHintHover($event, 'batch-clear', '清空多选')" @pointerleave="clearHoverCard" @click.stop="clearSelection"><span aria-hidden="true">清</span></button>
          </div>
        </div>

        <section v-if="activeTab === 'projects' && removedProjects.length" class="float-removed-projects" aria-label="已从 EyPc 移除的项目">
          <strong>已从 EyPc 移除</strong>
          <button v-for="project in removedProjects" :key="project.key" type="button" @click="action('codex.project.restore', { key: project.key })"><RotateCcw :size="12" />恢复 {{ project.name }}</button>
        </section>
      </section>

      <aside v-if="panel" class="float-side-panel" :class="panel.mode" :aria-label="panel.mode === 'detail' ? '当前项详情' : '批量与完整操作'">
        <header><strong>{{ panel.mode === 'detail' ? '详情' : drawerIsBatch ? `多选操作 · ${selectedTasks.length} 项` : '单项完整操作' }}</strong><button type="button" aria-label="关闭" data-quick-jump-target @click="panel = null"><X :size="14" /></button></header>
        <template v-if="panel.mode === 'detail'">
          <dl v-if="panel.item.kind === 'task'">
            <div><dt>标题</dt><dd>{{ panel.item.task.name }}</dd></div><div v-if="panel.item.task.alias"><dt>原名</dt><dd>{{ panel.item.task.originalName }}</dd></div>
            <div><dt>项目</dt><dd>{{ panel.item.task.projectName }}</dd></div><div><dt>状态</dt><dd>{{ taskStateLabel(panel.item.task) }}</dd></div>
            <div><dt>最后提问</dt><dd>{{ formatTaskDateTime(panel.item.task.lastQuestionAt) }}（{{ formatTaskTime(panel.item.task.lastQuestionAt) }}）</dd></div>
          </dl>
          <dl v-else><div><dt>项目</dt><dd>{{ panel.item.project.name }}</dd></div><div><dt>窗口内任务</dt><dd>{{ panel.item.project.tasks.length }}</dd></div><div><dt>顺序</dt><dd>{{ panel.item.project.nativePinned ? 'Codex 原生置顶' : 'Codex 原生项目顺序' }}</dd></div></dl>
        </template>
        <div v-else class="float-drawer-actions">
          <button
            v-for="(item, index) in drawerActions"
            :key="item.id"
            type="button"
            :class="{ danger: item.danger, active: drawerActiveIndex === index }"
            :disabled="item.disabled"
            :aria-label="item.disabled && item.disabledReason ? `${item.label}，${item.disabledReason}` : item.label"
            :data-drawer-index="index"
            data-quick-jump-target
            @focus="drawerActiveIndex = index"
            @click="executeDrawerAction(index)"
          ><kbd>c-{{ index + 1 }}</kbd><span>{{ item.label }}</span><small v-if="item.disabledReason && item.disabled">{{ item.disabledReason }}</small></button>
        </div>
      </aside>

      <aside v-if="hoverCard" class="float-hover-card" :class="hoverCard.kind" :style="{ left: `${hoverCard.left}px`, top: `${hoverCard.top}px` }" role="status" aria-live="polite">
        <strong>{{ hoverCard.title }}</strong>
        <span v-for="line in hoverCard.lines" :key="line">{{ line }}</span>
      </aside>

      <QuickJumpLayer v-if="quickJump.open" :targets="quickJump.targets" :active-target-id="quickJump.activeTargetId" />

      <span class="sr-only" role="status" aria-live="polite">{{ liveMessage }}</span>
      <button
        v-if="floatState.resizeCorner"
        type="button"
        class="float-resize-handle"
        :class="`corner-${floatState.resizeCorner}`"
        aria-label="调整展开面板尺寸"
        @pointerdown.stop="onResizePointerDown($event, floatState.resizeCorner)"
        @pointermove.stop="onResizePointerMove"
        @pointerup.stop="onResizePointerUp"
        @pointercancel.stop="onResizePointerCancel"
        @keydown.stop="onResizeHandleKeydown($event, floatState.resizeCorner)"
      />
    </section>
  </main>
</template>
