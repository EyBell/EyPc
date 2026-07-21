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
import { CODEX_THEME_PRESETS, codexThemeCssVars, codexWaterAppearanceCssVars, resolveCodexSurfaceTheme } from './domain/codexAppearance'
import { buildCodexCompactPresentation } from './domain/codexPresentation'
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
  | { kind: 'project'; key: string; project: CodexProjectCard; sectionId: string }
  | { kind: 'task'; key: string; task: CodexTaskCard; sectionId?: string; parentProjectKey?: string; nested?: boolean }
  | { kind: 'empty-project'; key: string; projectKey: string }

type FocusItem = Extract<RenderRow, { kind: 'project' | 'task' }>
type PanelState = { mode: 'detail' | 'drawer'; item: FocusItem } | null
type AliasEditor = { kind: 'task' | 'project'; key: string; value: string; originalName: string } | null

const snapshot = ref<CodexFloatSnapshotV1 | null>(null)
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

let stopSnapshot: (() => void) | null = null
let stopState: (() => void) | null = null
let drag: { x: number; y: number; moved: boolean; pointerId: number } | null = null
let resize: { pointerId: number; corner: CodexFloatResizeCorner } | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null
let confirmTimer: ReturnType<typeof setTimeout> | null = null
let pendingRun: (() => void) | null = null
let taskScrollResizeObserver: ResizeObserver | null = null
let desiredExpanded = false
let hoverInside = false
let focusWithin = false
let ignoreCompactClick = false
let restoreCompactFocus = false

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
  ongoing: conversations.value?.ongoing.length || 0,
  hidden: conversations.value?.hidden.length || 0,
  completed: conversations.value?.completedTab.length || 0,
  projects: conversations.value?.projects.length || 0
}))
const tabs: Array<{ id: CodexTaskTab; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'ongoing', label: '进行中' },
  { id: 'hidden', label: '已隐藏' },
  { id: 'completed', label: '已完成' },
  { id: 'projects', label: '项目' }
]

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
      if (!entry.project.collapsed) {
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

const drawerActions = computed(() => {
  const item = panel.value?.item || focusedItem.value
  if (!item) return []
  const actions: Array<{ label: string; danger?: boolean; run: () => void }> = []
  if (selectedTasks.value.length > 1) actions.push({ label: `归档已选 ${selectedTasks.value.length} 项`, danger: true, run: requestTaskArchive })
  if (item.kind === 'task') {
    actions.push({ label: '打开任务', run: () => openTask(item.task) })
    actions.push({ label: item.task.pinSource === 'local' ? '取消本地置顶' : '本地置顶', run: () => togglePin(item) })
    actions.push({ label: '编辑别名', run: () => editAlias(item) })
    actions.push({ label: item.task.isHidden ? '恢复显示' : '移到已隐藏', run: () => item.task.isHidden ? restoreTask(item.task) : hideTask(item.task) })
    if (item.task.canArchive) actions.push({ label: '真实归档', danger: true, run: requestTaskArchive })
  } else {
    actions.push({ label: item.project.collapsed ? '展开项目' : '折叠项目', run: () => toggleProject(item.project) })
    if (item.project.kind !== 'chats') actions.push({ label: item.project.pinSource === 'local' ? '取消本地置顶' : '本地置顶', run: () => togglePin(item) })
    actions.push({ label: '编辑别名', run: () => editAlias(item) })
    if (item.project.actionAlias) actions.push({ label: '全部归档', danger: true, run: () => requestProjectArchive(item.project) })
    if (item.project.kind !== 'chats') actions.push({ label: '从 EyPc 移除', danger: true, run: () => requestProjectRemove(item.project) })
  }
  return actions.slice(0, 9)
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
  action('codex.project.collapse', { key: project.key, collapsed: !project.collapsed })
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
  setSelection(new Set([task.key]), task.key)
}

function toggleTaskSelection(task: CodexTaskCard) {
  const next = new Set(selectedKeys.value)
  if (next.has(task.key)) next.delete(task.key)
  else next.add(task.key)
  setSelection(next, task.key)
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
  void nextTick(() => document.querySelector<HTMLElement>(`[data-focus-key="${item.key}"]`)?.focus())
}

function moveFocus(direction: -1 | 1) {
  if (!focusItems.value.length) return
  const currentIndex = Math.max(0, focusItems.value.findIndex((item) => item.key === focusedKey.value))
  const target = focusItems.value[Math.max(0, Math.min(focusItems.value.length - 1, currentIndex + direction))]
  focusedKey.value = target.key
  focusCurrent()
}

function openPanel(mode: 'detail' | 'drawer') {
  const item = focusedItem.value
  if (!item) return
  panel.value = { mode, item }
  clearConfirm()
}

function executeDrawerAction(index: number) {
  drawerActions.value[index]?.run()
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
  Escape: 'codex.layer.cancel'
}

function commandFor(event: KeyboardEvent) {
  const shortcut = shortcutFromEvent(event)
  const custom = snapshot.value?.keybindings?.find((binding) => binding.shortcutId === shortcut)
  return custom?.actionId || fallbackCommands[shortcut] || (/^Ctrl\+[1-9]$/.test(shortcut) ? `codex.drawer.select.${shortcut.slice(-1)}` : '')
}

function onRootKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
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
  if (command === 'codex.list.up') moveFocus(-1)
  else if (command === 'codex.list.down') moveFocus(1)
  else if (command === 'codex.selection.toggle' && item?.kind === 'task') toggleTaskSelection(item.task)
  else if (command === 'codex.selection.toggle' && item?.kind === 'project') selectProjectChildren(item.project)
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
  else if (command.startsWith('codex.drawer.select.') && panel.value?.mode === 'drawer') executeDrawerAction(Number(command.split('.').at(-1)) - 1)
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

function onMouseEnter() {
  hoverInside = true
  if (collapseTimer) clearTimeout(collapseTimer)
  if (!desiredExpanded && !expanded.value && !drag && !resize) requestExpansion(true)
}

function scheduleCollapse() {
  if (collapseTimer) clearTimeout(collapseTimer)
  if (focusWithin || resize || pendingConfirm.value || panel.value || aliasEditor.value) return
  collapseTimer = setTimeout(() => {
    if (!hoverInside && !focusWithin && !resize) requestExpansion(false)
  }, 220)
}

function onMouseLeave() {
  hoverInside = false
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

watch([searchText, activeTab, renderRows], () => {
  const visible = visibleTaskKeys.value
  selectedKeys.value = new Set([...selectedKeys.value].filter((key) => visible.has(key)))
  if (!focusItems.value.some((item) => item.key === focusedKey.value)) focusedKey.value = focusItems.value[0]?.key || ''
  clearConfirm()
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
  window.addEventListener('resize', scheduleBatchPlacement)
})

onUnmounted(() => {
  if (collapseTimer) clearTimeout(collapseTimer)
  clearConfirm()
  taskScrollResizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleBatchPlacement)
  stopSnapshot?.()
  stopState?.()
})
</script>

<template>
  <main
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
    <button v-if="!expanded" type="button" class="float-compact" :class="settings?.style === 'card' ? 'card-surface' : 'water-surface'" aria-expanded="false" :aria-label="compactAriaLabel" @click="onCompactClick">
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
          @click.stop="switchTab(tab.id)"
        >{{ tab.label }} <span>{{ tabCounts[tab.id] }}</span></button>
      </nav>
      <div class="float-drag-handle" aria-hidden="true" />

      <label class="float-search">
        <Search :size="14" aria-hidden="true" />
        <input ref="searchInput" v-model="searchText" type="search" placeholder="搜索本页会话、别名或项目" aria-label="搜索当前 Codex 页签" />
        <button v-if="searchText" type="button" aria-label="清空搜索" @click.stop="searchText = ''"><X :size="13" /></button>
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

            <div
              v-else-if="row.kind === 'project'"
              class="float-project-row"
              role="treeitem"
              :aria-expanded="!row.project.collapsed"
              :aria-label="`${row.project.name}，${row.project.tasks.length} 个窗口内任务`"
              :tabindex="focusedKey === row.key ? 0 : -1"
              :data-focus-key="row.key"
              @focus="focusedKey = row.key"
              @click.stop="focusedKey = row.key"
              @dblclick.stop="toggleProject(row.project)"
            >
              <button type="button" class="project-main" @click.stop="toggleProject(row.project)">
                <ChevronRight v-if="row.project.collapsed" :size="14" /><ChevronDown v-else :size="14" />
                <Folder v-if="row.project.collapsed" :size="15" /><FolderOpen v-else :size="15" />
                <span><strong>{{ row.project.name }}</strong><small v-if="row.project.alias">原名：{{ row.project.originalName }}</small><small v-else>{{ row.project.tasks.length ? `${row.project.tasks.length} 个最近任务` : `最近 ${settings?.timeWindowDays || 30} 天无会话` }}</small></span>
                <em v-if="row.project.pinSource === 'local'">本地</em>
              </button>
              <div class="task-action-rail project-actions">
                <button type="button" aria-label="编辑项目别名" @click.stop="editAlias(row)"><span aria-hidden="true">名</span></button>
                <button type="button" class="pin-action" :class="{ active: row.project.pinSource === 'local' }" :disabled="row.project.kind === 'chats'" :aria-label="row.project.kind === 'chats' ? 'Chats 分组不可置顶' : row.project.pinSource === 'local' ? '取消项目本地置顶' : '将项目本地置顶'" :aria-pressed="row.project.kind === 'chats' ? undefined : row.project.pinSource === 'local'" @click.stop="togglePin(row)"><span aria-hidden="true">顶</span></button>
                <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id === `archive-project:${row.project.key}` }" :disabled="!row.project.actionAlias" :aria-label="row.project.actionAlias ? '全部归档项目任务' : '当前项目没有可归档任务'" data-confirm-slot @click.stop="requestProjectArchive(row.project)"><span aria-hidden="true">{{ pendingConfirm?.id === `archive-project:${row.project.key}` ? '确' : '归' }}</span></button>
                <button type="button" class="remove" :class="{ confirming: pendingConfirm?.id === `remove-project:${row.project.key}` }" :disabled="row.project.kind === 'chats'" :aria-label="row.project.kind === 'chats' ? 'Chats 分组不能从 EyPc 移除' : '从 EyPc 移除项目'" data-confirm-slot @click.stop="requestProjectRemove(row.project)"><span aria-hidden="true">{{ pendingConfirm?.id === `remove-project:${row.project.key}` ? '确' : '移' }}</span></button>
              </div>
            </div>

            <div
              v-else-if="row.kind === 'task'"
              class="float-task-row"
              :class="[`task-${row.task.activityState}`, `bucket-${row.task.bucket}`, { nested: row.nested, selected: selectedKeys.has(row.task.key), hidden: row.task.isHidden }]"
              :role="activeTab === 'projects' ? 'treeitem' : 'option'"
              :aria-selected="selectedKeys.has(row.task.key)"
              :aria-label="`${row.task.name}，${row.task.projectName}，${taskStateLabel(row.task)}`"
              :tabindex="focusedKey === row.key ? 0 : -1"
              :data-focus-key="row.key"
              @focus="focusedKey = row.key"
              @click.stop="selectTask(row.task, $event)"
              @dblclick.stop="openTask(row.task)"
            >
              <button type="button" class="task-select-point" :aria-label="selectedKeys.has(row.task.key) ? `取消选择 ${row.task.name}` : `选择 ${row.task.name}`" @click.stop="selectTask(row.task, $event)"><i /></button>
              <component :is="taskIcon(row.task)" :size="14" class="task-state-icon" aria-hidden="true" />
              <span class="task-copy">
                <strong>{{ row.task.name }}</strong>
                <small v-if="row.task.alias">原名：{{ row.task.originalName }}</small>
                <small>{{ row.task.projectName }} · {{ taskStateLabel(row.task) }} · {{ formatTaskTime(row.task.lastQuestionAt) }}</small>
              </span>
              <em v-if="row.task.isHidden">隐藏</em><em v-if="row.task.pinSource === 'local'">本地</em>
              <div class="task-action-rail">
                <button type="button" aria-label="打开 Codex 任务" @click.stop="openTask(row.task)"><span aria-hidden="true">开</span></button>
                <button type="button" aria-label="编辑任务别名" @click.stop="editAlias(row)"><span aria-hidden="true">名</span></button>
                <button type="button" class="pin-action" :class="{ active: row.task.pinSource === 'local' }" :aria-label="row.task.pinSource === 'local' ? '取消任务本地置顶' : '将任务本地置顶'" :aria-pressed="row.task.pinSource === 'local'" @click.stop="togglePin(row)"><span aria-hidden="true">顶</span></button>
                <button type="button" :aria-label="row.task.isHidden ? '恢复任务显示' : '隐藏任务'" @click.stop="row.task.isHidden ? restoreTask(row.task) : hideTask(row.task)"><span aria-hidden="true">{{ row.task.isHidden ? '显' : '隐' }}</span></button>
                <button type="button" class="danger" :class="{ confirming: taskArchiveConfirming(row.task) }" :disabled="!row.task.canArchive" :aria-label="row.task.canArchive ? '真实归档 Codex 任务' : '当前任务不可归档'" data-confirm-slot @click.stop="focusedKey = row.key; requestTaskArchive()"><span aria-hidden="true">{{ taskArchiveConfirming(row.task) ? '确' : '归' }}</span></button>
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
            <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id?.startsWith('archive:') }" aria-label="归档当前多选任务" data-confirm-slot @click.stop="requestTaskArchive"><span aria-hidden="true">{{ pendingConfirm?.id?.startsWith('archive:') ? '确' : '归' }}</span></button>
            <button type="button" aria-label="打开当前多选的完整操作" @click.stop="openBatchDrawer"><span aria-hidden="true">操</span></button>
            <button type="button" aria-label="清空当前多选" @click.stop="clearSelection"><span aria-hidden="true">清</span></button>
          </div>
        </div>

        <section v-if="activeTab === 'projects' && removedProjects.length" class="float-removed-projects" aria-label="已从 EyPc 移除的项目">
          <strong>已从 EyPc 移除</strong>
          <button v-for="project in removedProjects" :key="project.key" type="button" @click="action('codex.project.restore', { key: project.key })"><RotateCcw :size="12" />恢复 {{ project.name }}</button>
        </section>
      </section>

      <aside v-if="panel" class="float-side-panel" :class="panel.mode" :aria-label="panel.mode === 'detail' ? '当前项详情' : '批量与完整操作'">
        <header><strong>{{ panel.mode === 'detail' ? '详情' : '完整操作' }}</strong><button type="button" aria-label="关闭" @click="panel = null"><X :size="14" /></button></header>
        <template v-if="panel.mode === 'detail'">
          <dl v-if="panel.item.kind === 'task'">
            <div><dt>标题</dt><dd>{{ panel.item.task.name }}</dd></div><div v-if="panel.item.task.alias"><dt>原名</dt><dd>{{ panel.item.task.originalName }}</dd></div>
            <div><dt>项目</dt><dd>{{ panel.item.task.projectName }}</dd></div><div><dt>状态</dt><dd>{{ taskStateLabel(panel.item.task) }}</dd></div>
            <div><dt>最后提问</dt><dd>{{ formatTaskTime(panel.item.task.lastQuestionAt) }}</dd></div>
          </dl>
          <dl v-else><div><dt>项目</dt><dd>{{ panel.item.project.name }}</dd></div><div><dt>窗口内任务</dt><dd>{{ panel.item.project.tasks.length }}</dd></div><div><dt>顺序</dt><dd>{{ panel.item.project.nativePinned ? 'Codex 原生置顶' : 'Codex 原生项目顺序' }}</dd></div></dl>
        </template>
        <div v-else class="float-drawer-actions"><button v-for="(item, index) in drawerActions" :key="item.label" type="button" :class="{ danger: item.danger }" @click="item.run"><kbd>c-{{ index + 1 }}</kbd>{{ item.label }}</button></div>
      </aside>

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
