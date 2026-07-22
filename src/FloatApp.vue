<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  History,
  MessageSquareText,
  Search,
  ShieldCheck,
  TriangleAlert,
  X
} from '@lucide/vue'
import CodexWaterBall from './components/CodexWaterBall.vue'
import QuickJumpLayer from './components/QuickJumpLayer.vue'
import {
  CODEX_THEME_PRESETS,
  codexThemeCssVars,
  codexWaterAppearanceCssVars,
  resolveCodexSurfaceTheme
} from './domain/codexAppearance'
import { buildCodexCompactPresentation } from './domain/codexPresentation'
import { assignQuickJumpMarkers, moveQuickJumpActive, resolveQuickJumpQuery } from './domain/quickJump'
import type { QuickJumpTarget } from './domain/quickJump'
import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from './domain/quickJumpHitTest'
import { shortcutFromEvent } from './domain/shortcuts'
import { codexModelReasonLabel, resolveCodexNewThreadModel, resolveManualCodexModel } from './domain/codexNewThread'
import { evaluateWhenExpression, LAYER_PRIORITY, type KeybindingContext, type KeybindingLayerId } from './runtime/keybinding/keybindingRuntime'
import type {
  CodexModelCatalogSnapshotV1,
  CodexTaskTab,
  CodexNewThreadSelectionContext,
  CodexNewThreadTarget,
  CodexProjectCard,
  CodexProjectSection,
  CodexQuotaBucket,
  CodexResolvedNewThreadModel,
  CodexTaskCard
} from './domain/codex'
import { normalizeCodexQuota } from './domain/codex'
import type { CodexFloatResizeCorner, CodexFloatWindowState } from './float-env'
import type { CodexFloatSnapshotV1 } from './runtime/codexController'

type RenderRow =
  | { kind: 'section'; key: string; section: CodexProjectSection }
  | { kind: 'hidden-project-section'; key: string; title: string }
  | { kind: 'status-section'; key: string; title: string; count: number; tone: 'input' | 'active' | 'unread' | 'unknown' | 'attention' }
  | { kind: 'project'; key: string; project: CodexProjectCard; sectionId: string; hiddenProject?: boolean }
  | { kind: 'task'; key: string; task: CodexTaskCard; sectionId?: string; parentProjectKey?: string; nested?: boolean }
  | { kind: 'empty-project'; key: string; projectKey: string }

type FocusItem = Extract<RenderRow, { kind: 'project' | 'task' }>
type PanelState = { mode: 'detail' | 'drawer'; item: FocusItem; returnActionId: string } | null
type AliasEditor = { kind: 'task' | 'project'; key: string; value: string; originalName: string } | null
type DrawerAction = { id: string; label: string; danger?: boolean; disabled?: boolean; disabledReason?: string; run: () => void }
type UiConversationTab = 'all' | 'input' | 'dynamic' | 'completed' | 'hidden' | 'projects'
type ComposerProjectPickerOption = {
  key: string
  label: string
  target: CodexNewThreadTarget
  disabled: boolean
  disabledReason?: string
}
type ComposerState = {
  target: CodexNewThreadTarget
  context: CodexNewThreadSelectionContext
  model: CodexResolvedNewThreadModel
  selectionKind: 'auto' | 'manual'
  prompt: string
  submitting: boolean
  error: string
  errorCode: string
  retryAllowed: boolean
  staleConfirmation: boolean
  manualOnly: boolean
  reopenAlias: string
  projectPickerOpen: boolean
  projectPickerIndex: number
  projectPickerOptions: ComposerProjectPickerOption[]
}
type ShiftPreview = { task: CodexTaskCard; left: number; top: number } | null
type ActionHint = { label: string; left: number; top: number; placement: 'top' | 'bottom' } | null
type QuickJumpDomTarget = QuickJumpTarget & { element: HTMLElement }

const snapshot = ref<CodexFloatSnapshotV1 | null>(null)
const rootElement = ref<HTMLElement | null>(null)
const expanded = ref(false)
const floatState = ref<CodexFloatWindowState>({ expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null })
const searchText = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const taskScroll = ref<HTMLElement | null>(null)
const selectedKeys = ref<Set<string>>(new Set())
const focusedKey = ref('')
const rangeAnchorKey = ref('')
const batchPlacement = ref<'top' | 'bottom'>('bottom')
const panel = ref<PanelState>(null)
const panelLayer = ref<HTMLElement | null>(null)
const aliasEditor = ref<AliasEditor>(null)
const aliasInput = ref<HTMLInputElement | null>(null)
const composer = ref<ComposerState | null>(null)
const composerDialog = ref<HTMLElement | null>(null)
const composerTextarea = ref<HTMLTextAreaElement | null>(null)
const composerModelSelect = ref<HTMLSelectElement | null>(null)
const pendingConfirm = ref<{ id: string; label: string; until: number } | null>(null)
const liveMessage = ref('')
const drawerActiveIndex = ref(0)
const highlightOwner = ref<'mouse' | 'keyboard'>('mouse')
const hoveredTaskKey = ref('')
const previewKeyboardKey = ref('')
const shiftPreview = ref<ShiftPreview>(null)
const shiftHeld = ref(false)
const shiftPreviewSuppressed = ref(false)
const actionHint = ref<ActionHint>(null)
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
let actionHintTimer: ReturnType<typeof setTimeout> | null = null
let pendingRun: (() => void) | null = null
let taskScrollResizeObserver: ResizeObserver | null = null
let desiredExpanded = false
let hoverInside = false
let focusWithin = false
let ignoreCompactClick = false
let restoreCompactFocus = false
let lastMousePoint = { x: Number.NaN, y: Number.NaN }
let keyboardMouseOrigin = { x: Number.NaN, y: Number.NaN }
let composerTrigger: HTMLElement | null = null
let panelTrigger: HTMLElement | null = null
let aliasTrigger: HTMLElement | null = null
let quickJumpTrigger: HTMLElement | null = null

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
const selectedWeekly = computed(() => {
  if (compact.value.primary?.kind === 'weekly') return compact.value.primary
  if (compact.value.secondary?.kind === 'weekly') return compact.value.secondary
  return null
})
const weeklyPercent = computed(() => selectedWeekly.value?.bucket.remainingPercent ?? 0)
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
  const normalized = normalizeCodexQuota(quota.value || { version: 1, status: 'idle', plan: '', short: null, weekly: null, updatedAt: 0 })
  const result: Array<{ key: string; label: string; family: 'normal' | 'spark'; bucket: CodexQuotaBucket }> = []
  if (normalized.normal.short) result.push({ key: 'normal-short', label: '5 小时限额', family: 'normal', bucket: normalized.normal.short })
  if (normalized.normal.weekly) result.push({ key: 'normal-weekly', label: '周限额', family: 'normal', bucket: normalized.normal.weekly })
  for (const pool of normalized.spark) {
    if (pool.short) result.push({ key: `${pool.limitId}-short`, label: 'Spark 额度', family: 'spark', bucket: pool.short })
    if (pool.weekly) result.push({ key: `${pool.limitId}-weekly`, label: 'Spark 周额度', family: 'spark', bucket: pool.weekly })
  }
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
const compactCounts = computed(() => ({
  input: conversations.value?.inputRequiredCount || 0,
  active: [...(conversations.value?.ongoing || []), ...(conversations.value?.hidden || [])]
    .filter((task) => task.activityState === 'active' || task.activityState === 'waiting-approval').length,
  unread: conversations.value?.completedUnreadCount || 0
}))

function normalizedSearch() {
  return searchText.value.trim().toLocaleLowerCase()
}

function taskMatches(task: CodexTaskCard, query = normalizedSearch()) {
  if (!query) return true
  return [task.displayName, task.name, task.originalName, task.alias, task.projectName, task.originalProjectName]
    .some((value) => value?.toLocaleLowerCase().includes(query))
}

function taskDisplayLabel(task: CodexTaskCard) {
  return task.alias || task.originalName || task.displayName || task.name || '未命名任务'
}

function taskTooltip(task: CodexTaskCard) {
  return task.originalName || task.name || '未命名任务'
}

function displayOrderedTasks(tasks: CodexTaskCard[]) {
  const pinnedOrder = new Map<string, number>()
  const pinnedSection = conversations.value?.projectSections.find((section) => section.id === 'pinned')
  for (const entry of pinnedSection?.entries || []) {
    if (entry.kind === 'task' && !pinnedOrder.has(entry.task.key)) pinnedOrder.set(entry.task.key, pinnedOrder.size)
  }
  return tasks
    .map((task, sourceIndex) => ({ task, sourceIndex }))
    .sort((left, right) => {
      const leftPinned = Boolean(left.task.pinSource)
      const rightPinned = Boolean(right.task.pinSource)
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
      if (leftPinned && rightPinned) {
        const leftOrder = pinnedOrder.get(left.task.key)
        const rightOrder = pinnedOrder.get(right.task.key)
        if (leftOrder !== undefined || rightOrder !== undefined) {
          return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER) || left.sourceIndex - right.sourceIndex
        }
      }
      return left.sourceIndex - right.sourceIndex
    })
    .map(({ task }) => task)
}

const renderRows = computed<RenderRow[]>(() => {
  const value = conversations.value
  if (!value) return []
  const searchQuery = normalizedSearch()
  const usedProjectRows = new Set<string>()

  function addProject(task: CodexTaskCard, sectionId?: string, parentProjectKey?: string, nested = false): RenderRow {
    return { kind: 'task', key: `task:${task.key}`, task, sectionId, parentProjectKey, nested }
  }

  function addProjectRow(project: CodexProjectCard, hiddenProject = false): RenderRow {
    return {
      kind: 'project',
      key: hiddenProject ? `hidden-project:${project.key}` : `project:${project.key}`,
      project,
      sectionId: hiddenProject ? 'hidden-projects' : 'projects',
      hiddenProject
    }
  }

  function taskMatched(task: CodexTaskCard) {
    return taskMatches(task, searchQuery)
  }

  function projectMatched(project: CodexProjectCard) {
    if (!searchQuery) return true
    return [project.name, project.originalName, project.alias]
      .filter(Boolean)
      .some((candidate) => candidate!.toLocaleLowerCase().includes(searchQuery))
  }

  if (selectedUiTab.value === 'all' || selectedUiTab.value === 'input') {
    const tasks = displayOrderedTasks((selectedUiTab.value === 'all' ? value.all : value.inputRequired).filter((task) => taskMatched(task)))
    return tasks.map((task) => addProject(task))
  }

  if (selectedUiTab.value === 'dynamic') {
    const groups = [
      { key: 'input', title: '待输入', tone: 'input' as const, tasks: value.ongoing.filter((task) => task.activityState === 'waiting-input') },
      { key: 'active', title: '正在进行中', tone: 'active' as const, tasks: value.ongoing.filter((task) => task.activityState === 'active' || task.activityState === 'waiting-approval') },
      { key: 'attention', title: '需关注', tone: 'attention' as const, tasks: value.ongoing.filter((task) => ['failed', 'interrupted', 'system-error'].includes(task.activityState)) },
      { key: 'unknown', title: '宿主状态未知', tone: 'unknown' as const, tasks: value.ongoing.filter((task) => task.activityState === 'unknown') },
      { key: 'unread', title: '已完成未读', tone: 'unread' as const, tasks: value.completedUnread }
    ]
    return groups.flatMap((group): RenderRow[] => {
      const tasks = displayOrderedTasks(group.tasks.filter((task) => taskMatched(task)))
      if (!tasks.length) return []
      return [
        { kind: 'status-section', key: `status:${group.key}`, title: group.title, count: tasks.length, tone: group.tone },
        ...tasks.map((task) => addProject(task))
      ]
    })
  }

  if (selectedUiTab.value === 'completed') {
    const tasks = displayOrderedTasks([...value.completedUnread, ...value.completed].filter((task) => taskMatched(task)))
    return tasks.map((task) => addProject(task))
  }

  if (selectedUiTab.value === 'hidden') {
    const tasks = displayOrderedTasks(value.hidden.filter((task) => taskMatched(task)))
    return tasks.map((task) => addProject(task))
  }

  const rows: RenderRow[] = []
  const addSectionTasks = (target: RenderRow[], tasks: CodexTaskCard[], sectionId: string, parentProjectKey?: string, forceOpen = false) => {
    const visibleTasks = displayOrderedTasks(tasks.filter((task) => taskMatched(task)))
    if (!visibleTasks.length) return
    for (const task of visibleTasks) target.push(addProject(task, sectionId, parentProjectKey, forceOpen))
  }

  for (const section of value.projectSections) {
    const sectionRows: RenderRow[] = []
    for (const entry of section.entries) {
      if (entry.kind === 'project') {
        const shouldShowAllTasks = projectMatched(entry.project)
        const projectTasks = displayOrderedTasks(shouldShowAllTasks || !searchQuery ? entry.project.tasks : entry.project.tasks.filter((task) => taskMatched(task)))
        if (projectTasks.length || shouldShowAllTasks) {
          const row = addProjectRow(entry.project)
          usedProjectRows.add(row.key)
          sectionRows.push(row)
          const openChildren = !isProjectCollapsed(entry.project) || Boolean(searchQuery)
          if (openChildren) {
            const children = shouldShowAllTasks || !searchQuery ? entry.project.tasks : entry.project.tasks.filter((task) => taskMatched(task))
            addSectionTasks(sectionRows, children, section.id, entry.project.key, openChildren)
          }
        }
      } else {
        if (taskMatched(entry.task)) sectionRows.push(addProject(entry.task, section.id))
      }
    }
    if (sectionRows.length) {
      rows.push({ kind: 'status-section', key: `section:${section.id}`, title: section.title, count: sectionRows.length, tone: 'active' })
      rows.push(...sectionRows)
    }
  }

  if (value.hiddenProjects.length) {
    rows.push({ kind: 'hidden-project-section', key: 'hidden-projects', title: '已隐藏项目' })
    const hiddenProjects = value.hiddenProjects.filter((project) => !searchQuery || projectMatched(project))
    for (const project of hiddenProjects) {
      const row = addProjectRow(project, true)
      if (usedProjectRows.has(row.key)) continue
      usedProjectRows.add(row.key)
      rows.push(row)
    }
  }

  return rows
})
const focusItems = computed<FocusItem[]>(() => renderRows.value.filter((row): row is FocusItem => row.kind === 'task' || row.kind === 'project'))
const focusedItem = computed(() => focusItems.value.find((item) => item.key === focusedKey.value) || focusItems.value[0] || null)
const visibleTaskKeys = computed(() => new Set(renderRows.value.filter((row): row is Extract<RenderRow, { kind: 'task' }> => row.kind === 'task').map((row) => row.task.key)))
const selectedTasks = computed(() => (conversations.value?.all || []).filter((task) => selectedKeys.value.has(task.key) && visibleTaskKeys.value.has(task.key)))
const showBatchToolbar = computed(() => selectedTasks.value.length >= 2)
const drawerIsBatch = computed(() => selectedTasks.value.length >= 2)
const drawerItem = computed<FocusItem | null>(() => {
  if (drawerIsBatch.value) return panel.value?.item || focusedItem.value
  const selected = selectedTasks.value[0]
  if (selected) return { kind: 'task', key: `task:${selected.key}`, task: selected }
  return panel.value?.item || focusedItem.value
})

const composerModels = computed(() => composer.value?.context.modelCatalog.models || [])
const selectedUiTab = ref<UiConversationTab>('dynamic')
const projectCount = computed(() => {
  const value = conversations.value
  if (!value) return 0
  const projectKeys = new Set<string>()
  for (const section of value.projectSections) {
    for (const entry of section.entries) {
      if (entry.kind === 'project') projectKeys.add(entry.project.key)
    }
  }
  for (const project of value.hiddenProjects || []) projectKeys.add(project.key)
  if (value.projects?.length && !projectKeys.size) for (const project of value.projects) projectKeys.add(project.key)
  return projectKeys.size
})
const tabs = computed(() => {
  const value = conversations.value
  if (!value) return []
  return [
    { id: 'all', label: '全部', count: value.all.length },
    { id: 'input', label: '待输入', count: value.inputRequired.length },
    { id: 'dynamic', label: '动态', count: value.ongoing.length + value.completedUnread.length },
    { id: 'completed', label: '已完成', count: value.completed.length + value.completedUnread.length },
    { id: 'hidden', label: '已隐藏', count: value.hiddenCount },
    { id: 'projects', label: '项目', count: projectCount.value }
  ] satisfies Array<{ id: UiConversationTab; label: string; count: number }>
})
const tabLabelToBackend: Record<UiConversationTab, CodexTaskTab> = {
  all: 'all',
  input: 'input',
  dynamic: 'ongoing',
  completed: 'completed',
  hidden: 'hidden',
  projects: 'projects'
}

function switchComposerTab(tab: UiConversationTab) {
  selectedUiTab.value = tab
  action('codex.tab.set', { tab: tabLabelToBackend[tab] })
}

function composerPickerOptionForChats(context: CodexNewThreadSelectionContext): ComposerProjectPickerOption {
  const project = conversations.value?.projects.find((candidate) => candidate.key === 'chats')
  return {
    key: 'project:chats:none',
    label: '不选择项目（默认 Chats）',
    target: project ? {
      projectKey: project.key,
      projectAlias: project.actionAlias || 'chats',
      projectName: project.name,
      projectKind: 'chats',
      projectFingerprint: context.projectFingerprint
    } : {
      projectKey: 'chats',
      projectAlias: 'chats',
      projectName: 'Chats',
      projectKind: 'chats',
      projectFingerprint: context.projectFingerprint
    },
    disabled: false
  }
}

function projectToComposerTarget(project: CodexProjectCard, projectFingerprint: string): CodexNewThreadTarget {
  return {
    projectKey: project.key,
    projectAlias: project.actionAlias || project.key,
    projectName: project.name,
    projectKind: project.kind,
    projectFingerprint
  }
}

function composerProjectOptions(context: CodexNewThreadSelectionContext): ComposerProjectPickerOption[] {
  const options: ComposerProjectPickerOption[] = [composerPickerOptionForChats(context)]
  const knownProjects = conversations.value?.projects || []
  for (const project of knownProjects) {
    if (project.key === 'chats') continue
    options.push({
      key: `project:${project.key}`,
      label: `${project.name}（${project.kind === 'chats' ? 'Chats' : '项目'}）`,
      target: projectToComposerTarget(project, context.projectFingerprint),
      disabled: !project.actionAlias,
      disabledReason: project.actionAlias ? undefined : '项目动作已失效'
    })
  }
  return options
}

function mapUiTab(input?: CodexTaskTab) {
  if (input === 'all') return 'all'
  if (input === 'input') return 'input'
  if (input === 'completed') return 'completed'
  if (input === 'hidden') return 'hidden'
  if (input === 'projects') return 'projects'
  return 'dynamic'
}

watch(() => conversations.value?.activeTab, (value) => {
  selectedUiTab.value = mapUiTab(value)
}, { immediate: true })

function fallbackFocus() {
  void nextTick(() => {
    const preferred = rootElement.value?.querySelector<HTMLElement>(`[data-focus-key="${focusedKey.value}"]`)
      || rootElement.value?.querySelector<HTMLElement>('[data-focus-key]')
      || taskScroll.value
    preferred?.focus({ preventScroll: true })
  })
}

function restoreTrigger(trigger: HTMLElement | null) {
  if (trigger?.isConnected && window.getComputedStyle(trigger).display !== 'none' && window.getComputedStyle(trigger).visibility !== 'hidden') {
    void nextTick(() => trigger.focus({ preventScroll: true }))
    return
  }
  fallbackFocus()
}

function projectForNewThread(explicit?: CodexProjectCard): CodexProjectCard | null {
  if (explicit) return explicit
  const item = focusedItem.value
  const projectKey = item?.kind === 'project' ? item.project.key : item?.kind === 'task' ? item.task.projectKey : ''
  const project = conversations.value?.projects.find((candidate) => candidate.key === projectKey)
  return project || conversations.value?.projects.find((candidate) => candidate.key === 'chats') || null
}

function selectionContext(): CodexNewThreadSelectionContext {
  const modelCatalog: CodexModelCatalogSnapshotV1 = snapshot.value?.modelCatalog || {
    version: 1,
    status: 'idle',
    models: [],
    fingerprint: '',
    updatedAt: 0
  }
  return {
    quota: quota.value || { version: 1, status: 'idle', plan: '', short: null, weekly: null, updatedAt: 0 },
    modelCatalog,
    contextFingerprint: snapshot.value?.newThreadContextFingerprint || '',
    projectFingerprint: conversations.value?.sourceFingerprint || '',
    receivedAt: snapshot.value?.generatedAt || Date.now()
  }
}

function resolveComposerModel(context: CodexNewThreadSelectionContext) {
  return resolveCodexNewThreadModel({
    quota: context.quota,
    modelCatalog: context.modelCatalog,
    preferredModelId: snapshot.value?.newThreadPreferredModel || ''
  })
}

function closeShiftPreview(suppressUntilRelease = false) {
  shiftPreview.value = null
  previewKeyboardKey.value = ''
  if (suppressUntilRelease && shiftHeld.value) shiftPreviewSuppressed.value = true
}

function openComposer(project?: CodexProjectCard, focusModel = false) {
  const targetProject = projectForNewThread(project)
  if (!targetProject) {
    liveMessage.value = '当前没有可用的项目上下文'
    return
  }
  composerTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  closeQuickJump()
  closeShiftPreview(true)
  clearConfirm()
  aliasEditor.value = null
  panel.value = null
  const context = selectionContext()
  const projectOptions = composerProjectOptions(context)
  const targetAlias = targetProject.key === 'chats' ? 'chats' : (targetProject.actionAlias || '')
  const targetIndex = projectOptions.findIndex((item) => item.target.projectKey === targetProject.key && item.target.projectAlias === targetAlias)
  const model = resolveComposerModel(context)
  const targetAliasMissing = !targetAlias
  composer.value = {
    target: {
      projectKey: targetProject.key,
      projectAlias: targetAlias,
      projectName: targetProject.name,
      projectKind: targetProject.kind,
      projectFingerprint: context.projectFingerprint
    },
    context,
    model,
    selectionKind: 'auto',
    prompt: '',
    submitting: false,
    error: targetAliasMissing ? '项目动作已过期，请刷新后重试' : '',
    errorCode: targetAliasMissing ? 'project-alias-missing' : '',
    retryAllowed: true,
    staleConfirmation: false,
    manualOnly: false,
    reopenAlias: '',
    projectPickerOpen: false,
    projectPickerIndex: targetIndex >= 0 ? targetIndex : 0,
    projectPickerOptions: projectOptions
  }
  void nextTick(() => {
    const state = composer.value
    if (!state) return
    const option = state.projectPickerOptions[state.projectPickerIndex]
    if (option?.disabled) state.projectPickerIndex = firstEnabledProjectPickerIndex(state.projectPickerOptions)
    if (focusModel) composerModelSelect.value?.focus({ preventScroll: true })
    else composerTextarea.value?.focus({ preventScroll: true })
  })
}

function firstEnabledProjectPickerIndex(options: ComposerProjectPickerOption[]) {
  const enabled = options.findIndex((item) => !item.disabled)
  return enabled >= 0 ? enabled : 0
}

function nextProjectPickerIndex(current: number, direction: -1 | 1, options: ComposerProjectPickerOption[]) {
  if (!options.length) return current
  const len = options.length
  let next = current
  for (let step = 0; step < len; step += 1) {
    next = (next + direction + len) % len
    if (!options[next].disabled) return next
  }
  return current
}

function closeProjectPicker(preserve = false) {
  if (!composer.value) return
  composer.value.projectPickerOpen = false
  if (!preserve) composer.value.projectPickerIndex = Math.max(0, composer.value.projectPickerIndex)
}

function selectComposerProject(index: number) {
  const state = composer.value
  if (!state) return
  const option = state.projectPickerOptions[index]
  if (!option || option.disabled) {
    if (option?.disabled) {
      state.error = option.disabledReason || '当前项目不可用'
      state.errorCode = 'project-unavailable'
    } else {
      state.error = '项目选择异常，请重试'
      state.errorCode = 'project-selection-invalid'
    }
    return
  }
  state.target = option.target
  state.projectPickerOpen = false
  const missingAlias = option.target.projectAlias !== 'chats' && !option.target.projectAlias
  state.error = missingAlias ? '项目动作已过期，请刷新后重试' : ''
  state.errorCode = missingAlias ? 'project-alias-missing' : ''
  state.retryAllowed = true
  void nextTick(() => {
    const optionIndex = state.projectPickerOptions.findIndex((candidate) => candidate.target.projectKey === option.target.projectKey && candidate.target.projectAlias === option.target.projectAlias)
    state.projectPickerIndex = optionIndex >= 0 ? optionIndex : state.projectPickerIndex
  })
}

function openComposerProjectPicker() {
  if (!composer.value) return
  if (composer.value.projectPickerOpen) return
  composer.value.projectPickerOpen = true
  const index = composer.value.projectPickerOptions.findIndex(
    (option) => option.target.projectKey === composer.value!.target.projectKey && option.target.projectAlias === composer.value!.target.projectAlias
  )
  const nextIndex = index >= 0 ? index : firstEnabledProjectPickerIndex(composer.value.projectPickerOptions)
  composer.value.projectPickerIndex = Math.max(0, nextIndex)
  if (composer.value.projectPickerOptions[composer.value.projectPickerIndex]?.disabled) {
    composer.value.projectPickerIndex = nextProjectPickerIndex(
      composer.value.projectPickerIndex,
      1,
      composer.value.projectPickerOptions
    )
  }
  if (composer.value.projectPickerOptions[composer.value.projectPickerIndex]?.disabled) {
    composer.value.projectPickerIndex = firstEnabledProjectPickerIndex(composer.value.projectPickerOptions)
  }
  void nextTick(() => {
    const selected = composerDialog.value?.querySelector<HTMLElement>(`[data-composer-project-index="${composer.value?.projectPickerIndex}"]`)
    selected?.focus()
    selected?.scrollIntoView({ block: 'nearest' })
  })
}

function cancelComposer() {
  if (!composer.value) return
  composer.value.prompt = ''
  composer.value.projectPickerOpen = false
  composer.value.projectPickerIndex = Math.max(0, firstEnabledProjectPickerIndex(composer.value.projectPickerOptions))
  composer.value = null
  const trigger = composerTrigger
  composerTrigger = null
  restoreTrigger(trigger)
}

function selectComposerModel(modelId: string) {
  const state = composer.value
  if (!state) return
  const resolved = resolveManualCodexModel({ modelId, quota: state.context.quota, modelCatalog: state.context.modelCatalog })
  if (!resolved) {
    state.error = '所选模型已不可用'
    state.errorCode = 'model-unavailable'
    return
  }
  state.model = resolved
  state.selectionKind = 'manual'
  state.error = ''
  state.errorCode = ''
  state.staleConfirmation = false
}

function onComposerModelChange(event: Event) {
  selectComposerModel((event.target as HTMLSelectElement).value)
}

async function submitComposer(mode: 'send-and-open' | 'create-empty') {
  const state = composer.value
  if (!state || state.submitting) return
  if (state.model.status !== 'ready' || !state.model.modelId) {
    state.error = '当前策略无法确定可用模型，请先手动选择'
    state.errorCode = 'model-required'
    composerModelSelect.value?.focus()
    return
  }
  if (mode === 'send-and-open' && !state.prompt.trim()) {
    state.error = '请输入首轮提示词；Enter 换行，Ctrl/Cmd+Enter 发送'
    state.errorCode = 'prompt-required'
    composerTextarea.value?.focus()
    return
  }
  if (!state.target.projectAlias || !state.context.contextFingerprint) {
    state.error = '项目或额度上下文尚未就绪，请刷新后重试'
    state.errorCode = 'context-unavailable'
    return
  }
  state.submitting = true
  state.error = ''
  state.errorCode = ''
  try {
    const result = await window.eypcFloat?.createThread({
      target: {
        projectKey: state.target.projectKey,
        projectAlias: state.target.projectAlias,
        projectFingerprint: state.target.projectFingerprint
      },
      modelId: state.model.modelId,
      contextFingerprint: state.context.contextFingerprint,
      mode,
      selectionKind: state.selectionKind,
      ...(mode === 'send-and-open' ? { prompt: state.prompt } : {})
    })
    if (!result) throw new Error('bridge unavailable')
    if (result.outcome === 'stale-selection' && result.context) {
      const previousModelId = state.model.modelId
      state.context = result.context
      if (result.target) state.target = result.target
      const manual = state.selectionKind === 'manual'
        ? resolveManualCodexModel({ modelId: previousModelId, quota: result.context.quota, modelCatalog: result.context.modelCatalog })
        : null
      state.model = manual || resolveComposerModel(result.context)
      state.selectionKind = manual ? 'manual' : 'auto'
      state.error = result.message || '额度、模型目录或项目已更新，请再次确认'
      state.errorCode = result.errorCode || 'selection-stale'
      state.retryAllowed = true
      state.staleConfirmation = true
      state.manualOnly = false
      return
    }
    if (result.outcome === 'opened' || result.outcome === 'created') {
      state.prompt = ''
      liveMessage.value = `已使用 ${state.model.modelName} 创建并打开会话`
      composer.value = null
      composerTrigger = null
      fallbackFocus()
      return
    }
    if (result.outcome === 'reopen-available') {
      state.prompt = ''
      state.reopenAlias = result.reopenAlias || ''
      state.error = result.message || '会话已启动，但页面未打开'
      state.errorCode = result.errorCode || 'open-failed'
      state.retryAllowed = true
      state.manualOnly = false
      return
    }
    state.error = result.message || '新会话创建失败'
    state.errorCode = result.errorCode || 'create-failed'
    state.retryAllowed = result.retryAllowed !== false
    state.manualOnly = result.outcome === 'manual-only'
  } catch {
    state.error = '新会话桥接暂不可用，提示词仍保留在当前编辑器内存中'
    state.errorCode = 'bridge-unavailable'
    state.retryAllowed = true
  } finally {
    if (composer.value === state) state.submitting = false
  }
}

async function retryOpenComposerThread() {
  const state = composer.value
  if (!state?.reopenAlias || state.submitting) return
  state.submitting = true
  const result = await window.eypcFloat?.reopenThread(state.reopenAlias)
  state.submitting = false
  if (result?.outcome === 'opened' || result?.outcome === 'dispatched') {
    liveMessage.value = '已重新打开新会话'
    cancelComposer()
  } else state.error = result?.message || '重试打开失败'
}

async function openBlankFromComposer() {
  const state = composer.value
  if (!state || state.submitting) return
  state.submitting = true
  const result = await window.eypcFloat?.openBlank()
  state.submitting = false
  if (result?.outcome === 'opened' || result?.outcome === 'dispatched') {
    state.prompt = ''
    liveMessage.value = '已打开 Codex 空白页；请在 Codex 中手动选择模型'
    cancelComposer()
  } else state.error = result?.message || 'Codex 空白页打开失败'
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (composer.value?.projectPickerOpen) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const options = composer.value?.projectPickerOptions || []
      if (!options.length) return
      const direction = event.key === 'ArrowUp' ? -1 : 1
      const next = nextProjectPickerIndex(composer.value.projectPickerIndex, direction, options)
      composer.value.projectPickerIndex = next
      void nextTick(() => {
        const nextOption = composerDialog.value?.querySelector<HTMLElement>(`[data-composer-project-index="${composer.value?.projectPickerIndex}"]`)
        nextOption?.focus()
        nextOption?.scrollIntoView({ block: 'nearest' })
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectComposerProject(composer.value.projectPickerIndex)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeProjectPicker()
      return
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault()
      closeProjectPicker()
      return
    }
  }

  if (event.key === 'f' || event.key === 'F') {
    event.preventDefault()
    openComposerProjectPicker()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelComposer()
    return
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void submitComposer('send-and-open')
    return
  }
  if (event.key !== 'Tab') return
  const focusable = Array.from(composerDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])
    .filter((element) => element.isConnected && window.getComputedStyle(element).display !== 'none' && window.getComputedStyle(element).visibility !== 'hidden')
  if (!focusable.length) return
  const current = focusable.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current < 0 || current === focusable.length - 1 ? 0 : current + 1)
  event.preventDefault()
  focusable[next].focus({ preventScroll: true })
}

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
    const project = conversations.value?.projects.find((candidate) => candidate.key === item.task.projectKey)
    return [
      { id: 'task-new-thread', label: '在当前项目新建会话', disabled: !project?.actionAlias, disabledReason: '项目动作已失效', run: () => openComposer(project) },
      { id: 'task-new-thread-model', label: '选择模型新建会话', disabled: !project?.actionAlias, disabledReason: '项目动作已失效', run: () => openComposer(project, true) },
      { id: 'task-open', label: '打开任务', disabled: !item.task.actionAlias, disabledReason: '任务动作已失效', run: () => openTask(item.task) },
      { id: 'task-detail', label: '查看详情', run: () => openDetailPanel(item) },
      { id: 'task-alias', label: '编辑别名', run: () => editAlias(item) },
      { id: 'task-pin', label: item.task.pinSource === 'native' ? 'Codex 原生置顶（只读）' : item.task.pinSource === 'local' ? '取消本地置顶' : '本地置顶', disabled: item.task.pinSource === 'native', disabledReason: '原生置顶顺序由 Codex 管理', run: () => togglePin(item) },
      { id: 'task-hide', label: item.task.isHidden ? '恢复显示' : '移到已隐藏', disabled: item.task.isHidden && !item.task.hiddenKind, run: () => item.task.isHidden ? restoreTask(item.task) : hideTask(item.task) },
      { id: 'task-archive', label: '真实归档', danger: true, disabled: !item.task.canArchive, disabledReason: '真实活动任务不可归档', run: requestTaskArchive }
    ]
  }
  return [
    { id: 'project-new-thread', label: '新建会话', disabled: !item.project.actionAlias, disabledReason: '项目动作已失效', run: () => openComposer(item.project) },
    { id: 'project-new-thread-model', label: '选择模型新建会话', disabled: !item.project.actionAlias, disabledReason: '项目动作已失效', run: () => openComposer(item.project, true) },
    { id: 'project-toggle', label: isProjectCollapsed(item.project) ? '展开项目' : '折叠项目', run: () => toggleProject(item.project) },
    { id: 'project-detail', label: '查看项目详情', run: () => openDetailPanel(item) },
    { id: 'project-alias', label: '编辑项目别名', run: () => editAlias(item) },
    { id: 'project-pin', label: item.project.pinSource === 'native' ? 'Codex 原生置顶（只读）' : item.project.pinSource === 'local' ? '取消本地置顶' : '本地置顶', disabled: item.project.kind === 'chats' || item.project.pinSource === 'native', disabledReason: item.project.kind === 'chats' ? 'Chats 分组不可置顶' : '原生置顶顺序由 Codex 管理', run: () => togglePin(item) },
    { id: 'project-hide', label: isProjectHidden(item.project) ? '恢复项目分组' : '隐藏项目分组', disabled: item.project.kind === 'chats', disabledReason: 'Chats 分组不可隐藏', run: () => toggleProjectHidden(item.project) },
    { id: 'project-archive', label: '全部归档', danger: true, disabled: !item.project.actionAlias, disabledReason: '项目没有可归档任务', run: () => requestProjectArchive(item.project) },
    { id: 'project-remove', label: '从 Codex 侧栏移除', danger: true, disabled: item.project.kind === 'chats' || !item.project.actionAlias || !conversations.value?.sourceFingerprint, disabledReason: item.project.kind === 'chats' ? 'Chats 分组不可移除' : '项目动作已失效', run: () => requestProjectRemove(item.project) }
  ]
})

function action(actionId: string, args: Record<string, unknown> = {}) {
  if (floatState.value.resizing || resize) return false
  const dispatched = window.eypcFloat?.action(actionId, args) === true
  if (!dispatched) liveMessage.value = '浮窗操作未送达，请重新打开 EyPc 后重试'
  return dispatched
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

function compactCounterHint(kind: 'input' | 'active' | 'unread') {
  const count = compactCounts.value[kind]
  if (kind === 'input') return `待输入 ${count}`
  if (kind === 'active') return `进行中 ${count}`
  return `未读 ${count}`
}

function queueCompactCounterHint(event: PointerEvent, kind: 'input' | 'active' | 'unread') {
  if (event.pointerType === 'touch') return
  queueActionHint(event, compactCounterHint(kind))
}

function openCompactStatus(kind: 'input' | 'active' | 'unread') {
  if (kind === 'input' && compactCounts.value.input === 1) {
    const task = conversations.value?.inputRequired[0]
    if (task) openTask(task)
    return
  }
  requestExpansion(true)
}

function openTask(task: CodexTaskCard) {
  if (task.actionAlias) action('codex.task.open', { key: task.key, actionAlias: task.actionAlias })
}

function taskProject(task: CodexTaskCard) {
  return conversations.value?.projects.find((project) => project.key === task.projectKey)
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

function isProjectHidden(project: CodexProjectCard) {
  return conversations.value?.hiddenProjects.some((item) => item.key === project.key) === true
}

function toggleProjectHidden(project: CodexProjectCard) {
  if (project.kind === 'chats') return
  action(isProjectHidden(project) ? 'codex.project.show' : 'codex.project.hide', { key: project.key })
}

function isProjectCollapsed(project: CodexProjectCard) {
  return Object.prototype.hasOwnProperty.call(optimisticProjectCollapsed.value, project.key)
    ? optimisticProjectCollapsed.value[project.key]
    : project.collapsed
}

function pinSourceHint(item: FocusItem) {
  if (item.kind === 'project' && item.project.kind === 'chats') return 'Chats 分组不可置顶'
  const source = item.kind === 'task' ? item.task.pinSource : item.project.pinSource
  if (source === 'native') return '来源：Codex 原生置顶 · 顺序只读'
  if (source === 'local') return '来源：EyPc 本地置顶 · 点击取消'
  return '未置顶 · 点击后由 EyPc 本地置顶'
}

function pinSourceValue(item: FocusItem) {
  if (item.kind === 'project' && item.project.kind === 'chats') return 'blocked'
  return (item.kind === 'task' ? item.task.pinSource : item.project.pinSource) || 'none'
}

function pinIsReadOnly(item: FocusItem) {
  return pinSourceValue(item) === 'native' || pinSourceValue(item) === 'blocked'
}

function togglePin(item: FocusItem) {
  if (pinIsReadOnly(item)) {
    liveMessage.value = pinSourceHint(item)
    return false
  }
  action('codex.pin.toggle', { kind: item.kind, key: item.kind === 'task' ? item.task.key : item.project.key })
  return true
}

function movePin(item: FocusItem, direction: -1 | 1) {
  if (pinIsReadOnly(item)) {
    liveMessage.value = pinSourceHint(item)
    return false
  }
  action('codex.pin.move', { kind: item.kind, key: item.kind === 'task' ? item.task.key : item.project.key, direction })
  return true
}

function editAlias(item: FocusItem) {
  aliasTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
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
  const trigger = aliasTrigger
  aliasTrigger = null
  restoreTrigger(trigger)
}

function cancelAlias() {
  if (!aliasEditor.value) return
  aliasEditor.value = null
  const trigger = aliasTrigger
  aliasTrigger = null
  restoreTrigger(trigger)
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

function requestTaskArchive(task?: CodexTaskCard | CodexTaskCard[]) {
  const targetTasks = task
    ? Array.isArray(task) ? task : [task]
    : archiveCandidates()
  const normalized = targetTasks.filter((candidate) => candidate.canArchive)
  const tasks = targetTasks.length ? normalized : archiveCandidates()
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
  const sourceFingerprint = conversations.value?.sourceFingerprint || ''
  if (!project.actionAlias || !sourceFingerprint || project.kind === 'chats') {
    liveMessage.value = '项目动作或状态指纹已失效，请刷新后重试'
    return
  }
  requestConfirmation(`remove-project:${project.key}`, `从 Codex 侧栏移除 ${project.name}`, () => action('codex.project.remove', {
    key: project.key,
    actionAlias: project.actionAlias,
    sourceFingerprint
  }))
}

function projectRemoveConfirming(project: CodexProjectCard) {
  return pendingConfirm.value?.id === `remove-project:${project.key}`
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
  const added = !next.has(task.key)
  if (!added) next.delete(task.key)
  else next.add(task.key)
  setSelection(next, task.key)
  return added
}

function activateTaskSelection(task: CodexTaskCard, event?: MouseEvent) {
  if (selectedKeys.value.size) {
    toggleTaskSelection(task)
    return
  }
  selectTask(task, event)
}

function activateTaskCore(task: CodexTaskCard, event?: MouseEvent) {
  if (selectedKeys.value.size || event?.ctrlKey || event?.metaKey) {
    toggleTaskSelection(task)
    return
  }
  openTask(task)
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
  if (!focusItems.value.length) return null
  const currentIndex = Math.max(0, focusItems.value.findIndex((item) => item.key === focusedKey.value))
  const target = focusItems.value[Math.max(0, Math.min(focusItems.value.length - 1, currentIndex + direction))]
  highlightOwner.value = 'keyboard'
  keyboardMouseOrigin = { ...lastMousePoint }
  focusedKey.value = target.key
  focusCurrent()
  return target
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
  previewKeyboardKey.value = ''
  updateShiftPreview()
}

function detailActionId(item: FocusItem) {
  return item.kind === 'task' ? 'task-detail' : 'project-detail'
}

function capturePanelTrigger(explicit?: EventTarget | null) {
  if (panel.value) return
  panelTrigger = explicit instanceof HTMLElement
    ? explicit
    : document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function openContextDrawer(item: FocusItem, event?: Event) {
  capturePanelTrigger(event?.currentTarget)
  focusedKey.value = item.key
  if (item.kind === 'project') clearSelection()
  else if (!selectedKeys.value.has(item.task.key)) setSelection(new Set([item.task.key]), item.task.key)
  panel.value = { mode: 'drawer', item, returnActionId: drawerIsBatch.value ? '' : detailActionId(item) }
  drawerActiveIndex.value = 0
  clearConfirm()
  focusPanelLayer()
}

function openPanel(mode: 'detail' | 'drawer', focusReturnAction = false) {
  if (mode === 'detail' && drawerIsBatch.value) return
  const previous = panel.value
  const item = previous?.item || (mode === 'drawer' ? drawerItem.value : focusedItem.value)
  if (!item) return
  capturePanelTrigger()
  const returnActionId = previous?.returnActionId || detailActionId(item)
  panel.value = { mode, item, returnActionId }
  drawerActiveIndex.value = mode === 'drawer'
    ? Math.max(0, drawerActions.value.findIndex((actionItem) => actionItem.id === returnActionId))
    : 0
  clearConfirm()
  if (mode === 'drawer' && focusReturnAction) focusDrawerAction(returnActionId)
  else focusPanelLayer()
}

function openDetailPanel(item: FocusItem) {
  if (drawerIsBatch.value) return
  capturePanelTrigger()
  panel.value = { mode: 'detail', item, returnActionId: detailActionId(item) }
  clearConfirm()
  focusPanelLayer()
}

function focusDrawerAction(actionId: string) {
  void nextTick(() => {
    const index = drawerActions.value.findIndex((item) => item.id === actionId)
    drawerActiveIndex.value = index >= 0 ? index : 0
    const actionButton = panelLayer.value?.querySelector<HTMLElement>(`[data-drawer-action-id="${actionId}"]`)
      || panelLayer.value?.querySelector<HTMLElement>('[data-drawer-index]')
    actionButton?.focus({ preventScroll: true })
  })
}

function returnToDrawer() {
  if (panel.value?.mode !== 'detail') return
  openPanel('drawer', true)
}

function focusPanelLayer() {
  void nextTick(() => panelLayer.value?.focus({ preventScroll: true }))
}

function closePanel() {
  if (!panel.value) return
  panelLayer.value?.blur()
  panel.value = null
  clearConfirm()
  const trigger = panelTrigger
  panelTrigger = null
  restoreTrigger(trigger)
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

function previewBlocked() {
  const active = document.activeElement as HTMLElement | null
  return Boolean(composer.value || pendingConfirm.value || panel.value || quickJump.value.open || aliasEditor.value
    || active?.closest('input, textarea, select, [contenteditable="true"]'))
}

function shiftPreviewTask() {
  if (previewKeyboardKey.value) {
    const item = focusItems.value.find((candidate) => candidate.key === previewKeyboardKey.value)
    if (item?.kind === 'task') return item.task
  }
  if (hoveredTaskKey.value) return (conversations.value?.all || []).find((task) => task.key === hoveredTaskKey.value) || null
  return focusedItem.value?.kind === 'task' ? focusedItem.value.task : null
}

function updateShiftPreview() {
  if (!shiftHeld.value || shiftPreviewSuppressed.value || previewBlocked()) {
    shiftPreview.value = null
    return
  }
  const task = shiftPreviewTask()
  const anchor = task ? rootElement.value?.querySelector<HTMLElement>(`[data-focus-key="task:${task.key}"]`) : null
  if (!task || !anchor) {
    shiftPreview.value = null
    return
  }
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(304, Math.max(230, window.innerWidth - 16))
  const estimatedHeight = Math.min(330, Math.max(220, window.innerHeight - 16))
  const placeRight = rect.right + width + 8 <= window.innerWidth
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, placeRight ? rect.right + 6 : rect.left - width - 6))
  const top = Math.max(8, Math.min(window.innerHeight - estimatedHeight - 8, rect.top - 8))
  shiftPreview.value = { task, left, top }
}

function onTaskPointerEnter(task: CodexTaskCard) {
  hoveredTaskKey.value = task.key
  if (!previewKeyboardKey.value) updateShiftPreview()
}

function onTaskPointerLeave(task: CodexTaskCard) {
  if (hoveredTaskKey.value === task.key) hoveredTaskKey.value = ''
  if (!previewKeyboardKey.value) updateShiftPreview()
}

function formatTaskDuration(value: number | undefined) {
  if (!value) return '未提供'
  const seconds = Math.max(1, Math.round(value / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

function taskSourceLabel(task: CodexTaskCard) {
  if (task.source === 'current') return '当前 App Server'
  if (task.source === 'history') return '历史任务'
  if (task.source === 'archived') return '归档恢复证据'
  if (task.source === 'unresolved') return '待核验来源'
  return '来源未提供'
}

function taskActiveFlagsLabel(task: CodexTaskCard) {
  const flags = task.activeFlags || []
  if (!flags.length) return task.hasCurrentActivity ? '存在当前活动' : '无活动标记'
  return flags.map((flag) => flag === 'waitingOnApproval' ? '等待审批' : '等待用户输入').join('、')
}

function quickJumpLabel(element: HTMLElement) {
  return element.getAttribute('data-quick-jump-label')
    || element.getAttribute('aria-label')
    || (element.textContent || '').replace(/\s+/g, ' ').trim()
    || '操作'
}

function quickJumpStyleHidden(style: CSSStyleDeclaration) {
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.pointerEvents === 'none'
}

function quickJumpClippingAncestor(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return ['hidden', 'clip', 'scroll', 'auto'].some((value) => style.overflow === value || style.overflowX === value || style.overflowY === value)
}

function quickJumpVisibleRect(element: HTMLElement) {
  const source = element.getBoundingClientRect()
  let left = Math.max(0, source.left)
  let top = Math.max(0, source.top)
  let right = Math.min(window.innerWidth, source.right)
  let bottom = Math.min(window.innerHeight, source.bottom)
  for (let current = element.parentElement; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (quickJumpStyleHidden(style)) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    if (!quickJumpClippingAncestor(current)) continue
    const rect = current.getBoundingClientRect()
    left = Math.max(left, rect.left)
    top = Math.max(top, rect.top)
    right = Math.min(right, rect.right)
    bottom = Math.min(bottom, rect.bottom)
  }
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

function quickJumpHitTargetVisible(element: HTMLElement, visibleRect: ReturnType<typeof quickJumpVisibleRect>) {
  if (typeof document.elementsFromPoint !== 'function') return true
  return quickJumpHitTestPoints(visibleRect).some((point) => quickJumpHitStackContainsTarget(element, document.elementsFromPoint(point.x, point.y)))
}

function quickJumpTargetVisible(element: HTMLElement) {
  if (element.matches(':disabled')) return false
  if (element.getAttribute('aria-disabled') === 'true' && !element.matches('.action-pin')) return false
  const style = window.getComputedStyle(element)
  if (quickJumpStyleHidden(style)) return false
  const visibleRect = quickJumpVisibleRect(element)
  if (visibleRect.width < 6 || visibleRect.height < 6) return false
  if (composer.value || shiftPreview.value) return false
  if (panel.value && !element.closest('.float-side-panel')) return false
  return quickJumpHitTargetVisible(element, visibleRect)
}

function collectQuickJumpTargets(backward = false): QuickJumpDomTarget[] {
  const elements = Array.from((rootElement.value || document.body).querySelectorAll<HTMLElement>('[data-quick-jump-target]'))
    .filter(quickJumpTargetVisible)
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

function closeQuickJump(restore = false) {
  rootElement.value?.querySelectorAll<HTMLElement>('[data-quick-jump-active="true"]').forEach((element) => delete element.dataset.quickJumpActive)
  quickJump.value = { open: false, query: '', sourceTargets: [], targets: [], activeTargetId: null }
  const trigger = quickJumpTrigger
  quickJumpTrigger = null
  if (restore) restoreTrigger(trigger)
}

function openQuickJump(backward = false) {
  if (composer.value || pendingConfirm.value || aliasEditor.value) return false
  closeShiftPreview(true)
  const targets = collectQuickJumpTargets(backward)
  if (!targets.length) return false
  quickJumpTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  quickJump.value = { open: true, query: '', sourceTargets: targets, targets, activeTargetId: targets[0]?.id || null }
  syncQuickJumpActive(true)
  return true
}

function activateQuickJumpTarget() {
  const target = quickJump.value.sourceTargets.find((item) => item.id === quickJump.value.activeTargetId)
  if (!target) return
  closeQuickJump()
  target.element.focus({ preventScroll: true })
  const focusKey = target.element.dataset.focusKey
  if (focusKey) {
    focusedKey.value = focusKey
    return
  }
  target.element.click()
}

function handleQuickJumpKey(event: KeyboardEvent) {
  if (!quickJump.value.open) return false
  const shortcut = shortcutFromEvent(event)
  if (shortcut === 'Escape') closeQuickJump(true)
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
  'Ctrl+F': 'codex.quickJump.openForward',
  'Ctrl+Shift+F': 'codex.search.focus',
  'Ctrl+R': 'codex.refresh',
  'Ctrl+T': 'codex.thread.createFocused',
  F: 'quickJump.openForward',
  'Shift+F': 'quickJump.openBackward',
  Escape: 'codex.layer.cancel'
}

function floatInputRole(target: HTMLElement, editing: boolean): KeybindingContext['activeInputRole'] {
  if (!editing) return undefined
  return target.closest('[data-input-role="codex-composer"]') ? 'codex-composer' : 'other'
}

function floatActiveLayers(target: HTMLElement): KeybindingLayerId[] {
  const layers: KeybindingLayerId[] = ['codex']
  if (pendingConfirm.value) layers.push('confirm')
  if (composer.value) layers.push('codex-composer')
  if (composer.value && target.closest('.composer-model-field')) layers.push('codex-model')
  if (quickJump.value.open) layers.push('codex-quick-jump')
  if (shiftPreview.value) layers.push('codex-preview')
  if (aliasEditor.value) layers.push('codex-inline-editor')
  if (panel.value?.mode === 'drawer') layers.push('codex-drawer')
  if (panel.value?.mode === 'detail') layers.push('codex-detail')
  return layers
}

function commandFor(event: KeyboardEvent, target: HTMLElement, editing = false) {
  const shortcut = shortcutFromEvent(event)
  const resolved = snapshot.value?.keybindings
  if (Array.isArray(resolved)) {
    const activeLayers = [...floatActiveLayers(target), 'app', 'global'] as KeybindingLayerId[]
    const context: KeybindingContext = {
      tab: 'codex',
      confirmOpen: Boolean(pendingConfirm.value),
      textInputFocused: editing,
      activeInputRole: floatInputRole(target, editing),
      activeLayers
    }
    return resolved
      .filter((binding) => binding.shortcutId === shortcut)
      .filter((binding) => activeLayers.includes(binding.layer as KeybindingLayerId))
      .filter((binding) => {
        try { return evaluateWhenExpression(binding.when || 'true', context) } catch { return false }
      })
      .sort((left, right) => LAYER_PRIORITY[right.layer as KeybindingLayerId] - LAYER_PRIORITY[left.layer as KeybindingLayerId]
        || right.weight - left.weight)[0]?.actionId || ''
  }
  return fallbackCommands[shortcut] || (/^Ctrl\+[1-9]$/.test(shortcut) ? `codex.drawer.select.${shortcut.slice(-1)}` : '')
}

function cancelTopLayer() {
  if (pendingConfirm.value) {
    clearConfirm()
    return
  }
  if (composer.value) {
    cancelComposer()
    return
  }
  if (quickJump.value.open) {
    closeQuickJump(true)
    return
  }
  if (shiftPreview.value) {
    closeShiftPreview(true)
    return
  }
  if (aliasEditor.value) {
    cancelAlias()
    return
  }
  if (panel.value?.mode === 'detail') {
    closePanel()
    return
  }
  if (panel.value?.mode === 'drawer') {
    closePanel()
    return
  }
  if (selectedKeys.value.size) {
    clearSelection()
    return
  }
  if (searchText.value) {
    searchText.value = ''
    return
  }
  if (expanded.value && !resize) {
    restoreCompactFocus = true
    requestExpansion(false)
    return
  }
}

function returnToPreviousFocus() {
  window.eypcFloat?.returnFocus()
}

function handleShiftPreviewArrow(event: KeyboardEvent) {
  if (!shiftHeld.value || !event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return false
  if (event.ctrlKey || event.metaKey || event.altKey || (previewBlocked() && !shiftPreview.value) || shiftPreviewSuppressed.value) return false
  event.preventDefault()
  event.stopPropagation()
  const target = moveFocus(event.key === 'ArrowUp' ? -1 : 1)
  hoveredTaskKey.value = ''
  previewKeyboardKey.value = target?.kind === 'task' ? target.key : ''
  updateShiftPreview()
  return true
}

function onRootKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  const shortcut = shortcutFromEvent(event)
  const target = event.target as HTMLElement

  if (shortcut === 'Shift+Escape') {
    event.preventDefault()
    event.stopPropagation()
    returnToPreviousFocus()
    return
  }

  if (
    shortcut === 'Escape'
    && (panel.value || aliasEditor.value || composer.value || pendingConfirm.value || quickJump.value.open || shiftPreview.value || selectedKeys.value.size || Boolean(searchText.value))
  ) {
    event.preventDefault()
    event.stopPropagation()
    cancelTopLayer()
    return
  }

  if (handleShiftPreviewArrow(event)) return
  if (handleQuickJumpKey(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if ((shortcut === 'Space' || shortcut === 'Enter') && target.closest('button')) return
  const editing = Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  const command = commandFor(event, target, editing)
  if (editing) {
    if (command === 'codex.layer.cancel') {
      event.preventDefault()
      if (aliasEditor.value) cancelAlias()
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
  else if (command === 'quickJump.openForward' || command === 'codex.quickJump.openForward') openQuickJump(false)
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
  else if (command === 'codex.drawer.open') openPanel('drawer', panel.value?.mode === 'detail')
  else if (command === 'codex.task.archiveFocused') requestTaskArchive()
  else if (command === 'codex.alias.edit' && item) editAlias(item)
  else if (command === 'codex.pin.toggleFocused' && item) togglePin(item)
  else if (command === 'codex.pin.moveUp' && item) movePin(item, -1)
  else if (command === 'codex.pin.moveDown' && item) movePin(item, 1)
  else if (command === 'codex.search.focus') searchInput.value?.focus()
  else if (command === 'codex.refresh') action('codex.refresh')
  else if (command === 'codex.thread.createFocused') openComposer()
  else if (command.startsWith('codex.drawer.select.')) executeDrawerAction(Number(command.split('.').at(-1)) - 1)
  else if (command === 'codex.layer.cancel') {
    cancelTopLayer()
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (shortcutFromEvent(event) === 'Shift+Escape') {
    event.preventDefault()
    event.stopPropagation()
    returnToPreviousFocus()
    return
  }
  if (
    event.key === 'Escape'
    && (panel.value || aliasEditor.value || composer.value || pendingConfirm.value || quickJump.value.open || shiftPreview.value || selectedKeys.value.size || Boolean(searchText.value))
  ) {
    event.preventDefault()
    event.stopPropagation()
    cancelTopLayer()
    return
  }
  if (event.key === 'Shift') {
    shiftHeld.value = true
    if (event.ctrlKey || event.metaKey || event.altKey) shiftPreviewSuppressed.value = true
    updateShiftPreview()
    return
  }
  if (!shiftHeld.value || !event.shiftKey) return
  if (event.ctrlKey || event.metaKey || event.altKey) {
    shiftPreviewSuppressed.value = true
    closeShiftPreview()
    return
  }
  handleShiftPreviewArrow(event)
}

function onWindowKeyup(event: KeyboardEvent) {
  if (event.key !== 'Shift') return
  shiftHeld.value = false
  shiftPreviewSuppressed.value = false
  closeShiftPreview()
}

function onPanelLayerKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelTopLayer()
    return
  }
  const target = event.target as HTMLElement
  const command = commandFor(event, target)
  if (!command) return
  if (command === 'codex.detail.open') openPanel('detail')
  else if (command === 'codex.drawer.open') openPanel('drawer', panel.value?.mode === 'detail')
  else if (command === 'codex.list.up' && panel.value?.mode === 'drawer') moveDrawer(-1)
  else if (command === 'codex.list.down' && panel.value?.mode === 'drawer') moveDrawer(1)
  else if (command === 'codex.task.openFocused' && panel.value?.mode === 'drawer') executeDrawerAction(drawerActiveIndex.value)
  else if (command.startsWith('codex.drawer.select.') && panel.value?.mode === 'drawer') executeDrawerAction(Number(command.split('.').at(-1)) - 1)
  else return
  event.preventDefault()
  event.stopPropagation()
}

function taskCanRestore(task: CodexTaskCard) {
  return task.isHidden && Boolean(task.hiddenKind)
}

function onWindowBlur() {
  shiftHeld.value = false
  shiftPreviewSuppressed.value = false
  closeShiftPreview()
}

function onWindowResize() {
  scheduleBatchPlacement()
  if (shiftPreview.value) updateShiftPreview()
  if (quickJump.value.open) closeQuickJump(true)
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (expanded.value && !target.closest('input, textarea, select, [contenteditable="true"]')) {
    rootElement.value?.focus({ preventScroll: true })
  }
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
}

function onCompactSurfacePointer(event: PointerEvent) {
  if (event.pointerType === 'touch' || desiredExpanded || expanded.value || drag || resize) return
  const surface = event.currentTarget as HTMLElement | null
  if (!surface) return
  const bounds = surface.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return
  const insideSurface = event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom
  const entersExpansionZone = settings.value?.style === 'card'
    || event.clientY >= bounds.top + bounds.height / 2
  if (insideSurface && entersExpansionZone) requestExpansion(true)
}

function scheduleCollapse() {
  if (collapseTimer) clearTimeout(collapseTimer)
  if (focusWithin || resize || pendingConfirm.value || composer.value || panel.value || aliasEditor.value || quickJump.value.open || shiftPreview.value) return
  collapseTimer = setTimeout(() => {
    if (!hoverInside && !focusWithin && !resize && !composer.value && !panel.value && !quickJump.value.open && !shiftPreview.value) requestExpansion(false)
  }, 100)
}

function onMouseLeave() {
  hoverInside = false
  hoveredTaskKey.value = ''
  clearActionHint()
  updateShiftPreview()
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

function clearActionHint() {
  if (actionHintTimer) clearTimeout(actionHintTimer)
  actionHintTimer = null
  actionHint.value = null
}

function queueActionHint(event: Event, label: string) {
  clearActionHint()
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!target || !label) return
  const bounds = target.getBoundingClientRect()
  const placement: 'top' | 'bottom' = bounds.top >= 48 ? 'top' : 'bottom'
  const left = Math.max(68, Math.min(window.innerWidth - 68, bounds.left + bounds.width / 2))
  const top = placement === 'top' ? bounds.top - 7 : bounds.bottom + 7
  actionHintTimer = setTimeout(() => {
    if (!target.isConnected) return
    actionHint.value = { label, left, top, placement }
  }, 200)
}

function taskStateLabel(task: CodexTaskCard) {
  if (task.activityState === 'waiting-input') return '等待输入'
  if (task.activityState === 'waiting-approval') return '等待审批'
  if (task.state === 'running' || task.activityState === 'active') return '进行中'
  if (task.bucket === 'completed-unread') return '已完成 · 未读'
  if (task.bucket === 'completed') return task.unreadState === 'unknown' ? '已完成 · 未读状态未知' : '已完成'
  if (task.activityState === 'failed') return '执行失败'
  if (task.activityState === 'interrupted') return '已中断'
  if (task.activityState === 'system-error') return '系统错误'
  if (task.activityState === 'unknown') return '宿主状态未知'
  return '进行中'
}

function taskIcon(task: CodexTaskCard) {
  if (task.isHidden) return EyeOff
  if (task.bucket === 'completed' || task.bucket === 'completed-unread') return Eye
  if (task.activityState === 'waiting-input') return MessageSquareText
  if (task.activityState === 'waiting-approval') return ShieldCheck
  if (task.state === 'running') return CirclePlay
  if (['failed', 'interrupted', 'system-error'].includes(task.activityState)) return TriangleAlert
  if (task.activityState === 'active') return CirclePlay
  return History
}

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

watch([searchText, renderRows], () => {
  const visible = visibleTaskKeys.value
  selectedKeys.value = new Set([...selectedKeys.value].filter((key) => visible.has(key)))
  if (!focusItems.value.some((item) => item.key === focusedKey.value)) focusedKey.value = focusItems.value[0]?.key || ''
  if (panel.value) {
    const currentPanel = panel.value
    const refreshedItem = focusItems.value.find((item) => item.key === currentPanel.item.key)
    if (refreshedItem) panel.value = { ...currentPanel, item: refreshedItem }
    else closePanel()
  }
  clearConfirm()
  closeQuickJump()
  closeShiftPreview(true)
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
  stopSnapshot = window.eypcFloat?.onSnapshot((value) => { snapshot.value = value }) || null
  stopState = window.eypcFloat?.onState((value) => {
    floatState.value = value
    expanded.value = value.expanded
    desiredExpanded = value.expanded
    if (!value.expanded) {
      closeShiftPreview(true)
      closeQuickJump()
    }
    if (!value.expanded && restoreCompactFocus) {
      restoreCompactFocus = false
      void nextTick(() => document.querySelector<HTMLElement>('.float-compact')?.focus())
    }
  }) || null
  stopActivate = window.eypcFloat?.onActivate?.((payload) => {
    requestExpansion(true)
    void nextTick(() => payload.command === 'new-thread' ? openComposer() : focusCurrent())
  }) || null
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('keyup', onWindowKeyup)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  if (collapseTimer) clearTimeout(collapseTimer)
  clearActionHint()
  closeShiftPreview()
  if (composer.value) composer.value.prompt = ''
  composer.value = null
  closeQuickJump()
  clearConfirm()
  taskScrollResizeObserver?.disconnect()
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('keyup', onWindowKeyup)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('resize', onWindowResize)
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
    tabindex="-1"
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
      <button
        type="button"
        class="float-compact"
        :class="settings?.style === 'card' ? 'card-surface' : 'water-surface'"
        aria-expanded="false"
        :aria-label="compactAriaLabel"
        @pointerenter="onCompactSurfacePointer"
        @pointermove="onCompactSurfacePointer"
        @click="onCompactClick"
      >
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
            <b v-if="compact.primary?.family === 'spark'" class="float-card-spark" aria-label="Spark 额度">S</b>
            <strong>{{ compact.primary ? `${compact.primary.bucket.remainingPercent}%` : compact.stateLabel }}</strong>
            <small v-if="compact.primary?.kind === 'short'">5h</small>
          </div>
          <div v-if="selectedWeekly" class="float-card-detail">
            <div class="card-weekly-head"><span>{{ selectedWeekly.longLabel }}</span><strong>{{ selectedWeekly.bucket.remainingPercent }}%</strong></div>
            <div class="card-weekly-track"><i :style="{ width: `${selectedWeekly.bucket.remainingPercent}%` }" /></div>
          </div>
        </template>
        <span v-if="quota?.status === 'stale' || quota?.status === 'error'" class="float-status-dot" :class="quota.status" aria-hidden="true" />
      </button>
      <button
        v-if="compactCounts.input"
        type="button"
        class="float-counter input"
        :aria-label="compactCounterHint('input')"
        @pointerenter.stop="queueCompactCounterHint($event, 'input')"
        @pointermove.stop
        @pointerleave.stop="clearActionHint"
        @focus="queueActionHint($event, compactCounterHint('input'))"
        @blur="clearActionHint"
        @click.stop="openCompactStatus('input')"
      >{{ compactCount(compactCounts.input) }}</button>
      <button v-if="compactCounts.active" type="button" class="float-counter active" :aria-label="compactCounterHint('active')" @pointerenter.stop="queueCompactCounterHint($event, 'active')" @pointermove.stop @pointerleave.stop="clearActionHint" @focus="queueActionHint($event, compactCounterHint('active'))" @blur="clearActionHint" @click.stop="openCompactStatus('active')">{{ compactCount(compactCounts.active) }}</button>
      <button v-if="compactCounts.unread" type="button" class="float-counter unread" :aria-label="compactCounterHint('unread')" @pointerenter.stop="queueCompactCounterHint($event, 'unread')" @pointermove.stop @pointerleave.stop="clearActionHint" @focus="queueActionHint($event, compactCounterHint('unread'))" @blur="clearActionHint" @click.stop="openCompactStatus('unread')">{{ compactCount(compactCounts.unread) }}</button>
    </div>

    <section v-else class="float-expanded-card" aria-label="Codex Companion">
      <div class="float-task-tabs" role="tablist" aria-label="会话分组">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="selectedUiTab === tab.id"
          :class="{ active: selectedUiTab === tab.id }"
          :data-quick-jump-target="tab.label"
          @click="switchComposerTab(tab.id)"
        >
          <span>{{ tab.count }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <div class="float-drag-handle" aria-hidden="true" />

      <label class="float-search">
        <Search :size="14" aria-hidden="true" />
            <input ref="searchInput" v-model="searchText" type="search" placeholder="搜索会话、别名或项目" aria-label="搜索当前 Codex 页签" data-quick-jump-target data-quick-jump-label="搜索当前 Codex 页签" />
        <button v-if="searchText" type="button" aria-label="清空搜索" data-quick-jump-target @click.stop="searchText = ''"><X :size="13" /></button>
      </label>

      <section class="float-quota-text" aria-label="Codex 实际额度窗口">
        <div v-for="item in expandedQuota" :key="item.key" :class="item.family">
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
        <button type="submit">保存</button><button type="button" @click="cancelAlias">取消</button>
      </form>

      <section v-if="settings?.conversationInboxEnabled" class="float-task-inbox">
        <div v-if="selectedKeys.size" class="float-selection-mode-bar" role="status" aria-live="polite">
          <strong>选择模式</strong>
          <span>已选 {{ selectedKeys.size }} 项</span>
          <kbd>Esc 退出</kbd>
        </div>
        <div class="float-task-list-stage">
          <div
            ref="taskScroll"
            class="float-task-scroll"
            :class="{
              'batch-toolbar-top': showBatchToolbar && batchPlacement === 'top',
              'batch-toolbar-bottom': showBatchToolbar && batchPlacement === 'bottom',
              'selection-mode': selectedKeys.size > 0
            }"
            role="listbox"
            :aria-multiselectable="true"
            aria-label="动态会话"
            @scroll.passive="updateBatchPlacement"
          >
          <template v-for="row in renderRows" :key="row.key">
            <h2 v-if="row.kind === 'section'" class="float-project-section">{{ row.section.title }}</h2>
            <h2 v-else-if="row.kind === 'hidden-project-section'" class="float-project-section hidden-project-section">{{ row.title }}</h2>
            <h2 v-else-if="row.kind === 'status-section'" class="float-status-section" :class="row.tone"><span>{{ row.title }}</span><em>{{ row.count }}</em></h2>

            <div
              v-else-if="row.kind === 'project'"
              class="float-project-row"
              :class="{ highlighted: focusedKey === row.key, 'hidden-project': row.hiddenProject }"
              role="treeitem"
              :aria-expanded="row.hiddenProject ? undefined : !isProjectCollapsed(row.project)"
              :aria-label="`${row.project.name}，${row.project.tasks.length} 个窗口内任务${row.hiddenProject ? '，项目分组已隐藏' : ''}`"
              :data-pin-source="row.project.pinSource"
              :tabindex="focusedKey === row.key ? 0 : -1"
              :data-focus-key="row.key"
              data-quick-jump-target
              :data-quick-jump-label="row.hiddenProject ? `聚焦已隐藏项目 ${row.project.name}` : `${isProjectCollapsed(row.project) ? '展开' : '折叠'}项目 ${row.project.name}`"
              @focus="focusedKey = row.key"
              @pointermove="onRowPointerMove($event, row.key)"
              @contextmenu.prevent.stop="openContextDrawer(row, $event)"
            >
              <button type="button" class="project-main" data-quick-jump-target :data-quick-jump-label="row.hiddenProject ? `查看已隐藏项目 ${row.project.name}` : `${isProjectCollapsed(row.project) ? '展开' : '折叠'}项目 ${row.project.name}`" @click.stop="focusedKey = row.key; row.hiddenProject ? openContextDrawer(row) : toggleProject(row.project)">
                <template v-if="row.hiddenProject"><EyeOff :size="14" /><Folder :size="15" /></template>
                <template v-else><ChevronRight v-if="isProjectCollapsed(row.project)" :size="14" /><ChevronDown v-else :size="14" /><Folder v-if="isProjectCollapsed(row.project)" :size="15" /><FolderOpen v-else :size="15" /></template>
                <span><strong>{{ row.project.name }}</strong><small v-if="row.hiddenProject">项目分组已隐藏 · 任务仍在其他页签</small><small v-else>{{ row.project.tasks.length ? `${row.project.tasks.length} 个最近任务` : `最近 ${settings?.timeWindowDays || 30} 天无会话` }}</small></span>
              </button>
              <div class="project-inline-actions" role="toolbar" :aria-label="`${row.project.name} 项目操作`">
                <button type="button" class="inline-character-button action-pin" :data-pin-source="pinSourceValue(row)" :aria-disabled="pinIsReadOnly(row)" :aria-pressed="Boolean(row.project.pinSource)" :aria-label="`${row.project.name}，${pinSourceHint(row)}`" data-quick-jump-target :data-quick-jump-label="pinSourceHint(row)" @pointerenter="queueActionHint($event, pinSourceHint(row))" @pointerleave="clearActionHint" @focus="queueActionHint($event, pinSourceHint(row))" @blur="clearActionHint" @click.stop="focusedKey = row.key; togglePin(row)">顶</button>
                <button type="button" class="inline-character-button action-remove" :class="{ confirming: projectRemoveConfirming(row.project) }" :disabled="row.project.kind === 'chats' || !row.project.actionAlias || !conversations?.sourceFingerprint" :aria-label="projectRemoveConfirming(row.project) ? `确认从 Codex 侧栏移除 ${row.project.name}` : `从 Codex 侧栏移除 ${row.project.name}`" data-confirm-slot data-quick-jump-target :data-quick-jump-label="`从 Codex 移除 ${row.project.name}`" @pointerenter="queueActionHint($event, projectRemoveConfirming(row.project) ? '再次点击确认真实移除' : '从 Codex 侧栏移除；需先完全退出 Codex')" @pointerleave="clearActionHint" @focus="queueActionHint($event, projectRemoveConfirming(row.project) ? '再次点击确认真实移除' : '从 Codex 侧栏移除；需先完全退出 Codex')" @blur="clearActionHint" @click.stop="focusedKey = row.key; requestProjectRemove(row.project)">{{ projectRemoveConfirming(row.project) ? '确' : '移' }}</button>
                <button type="button" class="inline-character-button action-hide" :disabled="row.project.kind === 'chats'" :aria-pressed="isProjectHidden(row.project)" :aria-label="isProjectHidden(row.project) ? `恢复项目分组 ${row.project.name}` : `隐藏项目分组 ${row.project.name}`" data-quick-jump-target :data-quick-jump-label="isProjectHidden(row.project) ? `恢复项目 ${row.project.name}` : `隐藏项目 ${row.project.name}`" @pointerenter="queueActionHint($event, isProjectHidden(row.project) ? '恢复项目页分组' : '仅隐藏项目页分组；任务仍保留')" @pointerleave="clearActionHint" @focus="queueActionHint($event, isProjectHidden(row.project) ? '恢复项目页分组' : '仅隐藏项目页分组；任务仍保留')" @blur="clearActionHint" @click.stop="focusedKey = row.key; toggleProjectHidden(row.project)">{{ isProjectHidden(row.project) ? '显' : '隐' }}</button>
                <button type="button" class="inline-character-button action-create" :disabled="!row.project.actionAlias" :aria-label="row.project.actionAlias ? `在 ${row.project.name} 新建会话` : '项目动作已失效'" data-quick-jump-target :data-quick-jump-label="`在 ${row.project.name} 新建会话`" @pointerenter="queueActionHint($event, '在该项目新建会话')" @pointerleave="clearActionHint" @focus="queueActionHint($event, '在该项目新建会话')" @blur="clearActionHint" @click.stop="focusedKey = row.key; openComposer(row.project)">+</button>
              </div>
            </div>

            <div
              v-else-if="row.kind === 'task'"
              class="float-task-row"
              :class="[`task-${row.task.activityState}`, `bucket-${row.task.bucket}`, { nested: row.nested, selected: selectedKeys.has(row.task.key), hidden: row.task.isHidden, highlighted: focusedKey === row.key }]"
              role="option"
              :aria-selected="selectedKeys.has(row.task.key)"
              :aria-label="`${taskDisplayLabel(row.task)}，${row.task.projectName}，${taskStateLabel(row.task)}`"
              :data-pin-source="row.task.pinSource"
              :tabindex="focusedKey === row.key ? 0 : -1"
              :data-focus-key="row.key"
              data-quick-jump-target
              :data-quick-jump-label="`聚焦任务 ${taskDisplayLabel(row.task)}`"
              @focus="focusedKey = row.key"
              @pointermove="onRowPointerMove($event, row.key)"
              @pointerenter="onTaskPointerEnter(row.task)"
              @pointerleave="onTaskPointerLeave(row.task)"
              @click="activateTaskCore(row.task, $event)"
              @contextmenu.prevent.stop="openContextDrawer(row, $event)"
            >
              <button
                type="button"
                class="task-state-button"
                :class="{ clickable: taskCanRestore(row.task) }"
                :aria-pressed="selectedKeys.has(row.task.key)"
                :aria-label="`左侧区域：${selectedKeys.has(row.task.key) ? '移出选择' : '加入选择'} ${taskDisplayLabel(row.task)}`"
                @pointerenter="queueActionHint($event, `${taskStateLabel(row.task)}；点击切换选择`)"
                @pointerleave="clearActionHint"
                @focus="queueActionHint($event, `${taskStateLabel(row.task)}；点击切换选择`)"
                @blur="clearActionHint"
                @click.stop="focusedKey = row.key; activateTaskSelection(row.task, $event)"
                data-quick-jump-target
                :data-quick-jump-label="`切换选择 ${taskDisplayLabel(row.task)}`"
              >
                <component :is="taskIcon(row.task)" :size="14" class="task-state-icon" aria-hidden="true" />
              </button>
              <div
                class="task-open"
                @click.stop="activateTaskCore(row.task, $event)"
              >
                <span class="task-copy">
                  <strong>{{ taskDisplayLabel(row.task) }}</strong>
                  <small>{{ row.task.projectName }} · {{ taskStateLabel(row.task) }} · {{ formatTaskTime(row.task.lastQuestionAt) }}</small>
                </span>
                <div class="task-inline-actions" role="toolbar" :aria-label="`${taskDisplayLabel(row.task)} 会话操作`">
                <button
                  type="button"
                  class="inline-character-button action-pin"
                    :data-pin-source="pinSourceValue(row)"
                    :aria-disabled="pinIsReadOnly(row)"
                    :aria-pressed="Boolean(row.task.pinSource)"
                    :aria-label="`${taskDisplayLabel(row.task)}，${pinSourceHint(row)}`"
                    data-quick-jump-target
                    :data-quick-jump-label="pinSourceHint(row)"
                    @pointerenter="queueActionHint($event, pinSourceHint(row))"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, pinSourceHint(row))"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; togglePin(row)"
                >顶</button>
                <button
                  type="button"
                  class="inline-character-button action-hide"
                    :aria-label="row.task.isHidden ? `恢复显示 ${taskDisplayLabel(row.task)}` : `隐藏 ${taskDisplayLabel(row.task)}`"
                    data-quick-jump-target
                    :data-quick-jump-label="row.task.isHidden ? `恢复显示 ${taskDisplayLabel(row.task)}` : `隐藏 ${taskDisplayLabel(row.task)}`"
                    :disabled="row.task.isHidden && !row.task.hiddenKind"
                    @pointerenter="queueActionHint($event, row.task.isHidden ? '恢复会话显示' : '移到 Companion 已隐藏区')"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, row.task.isHidden ? '恢复会话显示' : '移到 Companion 已隐藏区')"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; row.task.isHidden ? restoreTask(row.task) : hideTask(row.task)"
                >
                    {{ row.task.isHidden ? '显' : '隐' }}
                  </button>
                <button
                  type="button"
                  class="inline-character-button action-archive"
                    :class="{ confirming: taskArchiveConfirming(row.task) }"
                    :aria-label="taskArchiveConfirming(row.task) ? `确认归档 ${taskDisplayLabel(row.task)}` : `归档 ${taskDisplayLabel(row.task)}`"
                    data-confirm-slot
                    data-quick-jump-target
                    :data-quick-jump-label="`归档 ${taskDisplayLabel(row.task)}`"
                    :disabled="!row.task.canArchive"
                    @pointerenter="queueActionHint($event, taskArchiveConfirming(row.task) ? '再次点击确认真实归档' : row.task.canArchive ? '真实归档 Codex 会话' : '真实活动任务不可归档')"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, taskArchiveConfirming(row.task) ? '再次点击确认真实归档' : row.task.canArchive ? '真实归档 Codex 会话' : '真实活动任务不可归档')"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; requestTaskArchive(row.task)"
                >
                    {{ taskArchiveConfirming(row.task) ? '确' : '归' }}
                  </button>
                <button
                  type="button"
                  class="inline-character-button action-create"
                    :aria-label="`在 ${row.task.projectName} 新建会话`"
                    data-quick-jump-target
                    :data-quick-jump-label="`在 ${row.task.projectName} 新建会话`"
                    :disabled="!taskProject(row.task)?.actionAlias"
                    @pointerenter="queueActionHint($event, '在所属项目新建会话')"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, '在所属项目新建会话')"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; taskProject(row.task) && openComposer(taskProject(row.task)!)"
                >+</button>
              </div>
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
            <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id?.startsWith('archive:') }" aria-label="归档当前多选任务；仅归档通过真实状态核验的任务" data-confirm-slot data-quick-jump-target @click.stop="requestTaskArchive()"><span aria-hidden="true">{{ pendingConfirm?.id?.startsWith('archive:') ? '确' : '归' }}</span></button>
            <button type="button" aria-label="打开当前多选的完整操作；快捷键 Ctrl+右箭头" data-quick-jump-target @click.stop="openBatchDrawer"><span aria-hidden="true">操</span></button>
            <button type="button" aria-label="清空当前多选" data-quick-jump-target @click.stop="clearSelection"><span aria-hidden="true">清</span></button>
          </div>
        </div>

      </section>

      <aside
        v-if="panel"
        ref="panelLayer"
        tabindex="-1"
        class="float-side-panel"
        :class="panel.mode"
        :aria-label="panel.mode === 'detail' ? '当前项详情' : '批量与完整操作'"
        @keydown.stop="onPanelLayerKeydown"
      >
        <header>
          <strong>{{ panel.mode === 'detail' ? '详情' : drawerIsBatch ? `多选操作 · ${selectedTasks.length} 项` : '单项完整操作' }}</strong>
          <button v-if="panel.mode === 'detail'" type="button" aria-label="返回更多操作" data-quick-jump-target @click="returnToDrawer"><ArrowLeft :size="14" aria-hidden="true" /><span>返回更多操作</span></button>
          <button v-else type="button" aria-label="关闭" data-quick-jump-target @click="closePanel"><X :size="14" aria-hidden="true" /></button>
        </header>
        <template v-if="panel.mode === 'detail'">
          <dl v-if="panel.item.kind === 'task'">
            <div>
              <dt>标题</dt>
              <dd>
                {{ taskDisplayLabel(panel.item.task) }}
                <span
                  v-if="taskTooltip(panel.item.task) !== taskDisplayLabel(panel.item.task)"
                  class="codex-tip"
                  role="button"
                  tabindex="0"
                  aria-label="查看完整标题"
                  :data-tip="taskTooltip(panel.item.task)"
                >i</span>
              </dd>
            </div>
            <div v-if="panel.item.task.alias"><dt>原名</dt><dd>{{ taskTooltip(panel.item.task) }}</dd></div>
            <div><dt>项目</dt><dd>{{ panel.item.task.projectName }}</dd></div><div><dt>状态</dt><dd>{{ taskStateLabel(panel.item.task) }}</dd></div>
            <div><dt>最后提问</dt><dd>{{ formatTaskDateTime(panel.item.task.lastQuestionAt) }}（{{ formatTaskTime(panel.item.task.lastQuestionAt) }}）</dd></div>
          </dl>
          <dl v-else><div><dt>项目</dt><dd>{{ panel.item.project.name }}</dd></div><div v-if="panel.item.project.alias"><dt>原名</dt><dd>{{ panel.item.project.originalName }}</dd></div><div><dt>窗口内任务</dt><dd>{{ panel.item.project.tasks.length }}</dd></div><div><dt>顺序</dt><dd>{{ panel.item.project.nativePinned ? 'Codex 原生置顶' : 'Codex 原生项目顺序' }}</dd></div></dl>
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
            :data-drawer-action-id="item.id"
            data-quick-jump-target
            @focus="drawerActiveIndex = index"
            @click="executeDrawerAction(index)"
          ><kbd>c-{{ index + 1 }}</kbd><span>{{ item.label }}</span><small v-if="item.disabledReason && item.disabled">{{ item.disabledReason }}</small></button>
        </div>
      </aside>

      <aside
        v-if="shiftPreview"
        class="float-shift-preview"
        :style="{ left: `${shiftPreview.left}px`, top: `${shiftPreview.top}px` }"
        role="status"
        aria-live="polite"
        aria-label="会话详情预览"
        @wheel.stop
      >
        <header><kbd>Shift</kbd><strong>{{ taskDisplayLabel(shiftPreview.task) }}</strong></header>
        <dl>
          <div v-if="shiftPreview.task.alias"><dt>原名</dt><dd>{{ shiftPreview.task.originalName }}</dd></div>
          <div><dt>项目</dt><dd>{{ shiftPreview.task.projectName }}</dd></div>
          <div><dt>状态</dt><dd>{{ taskStateLabel(shiftPreview.task) }}</dd></div>
          <div><dt>活动标记</dt><dd>{{ taskActiveFlagsLabel(shiftPreview.task) }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatTaskDateTime(shiftPreview.task.createdAt) }}</dd></div>
          <div><dt>首次提问</dt><dd>{{ formatTaskDateTime(shiftPreview.task.firstPromptAt) }}</dd></div>
          <div><dt>最近提问</dt><dd>{{ formatTaskDateTime(shiftPreview.task.lastQuestionAt) }}</dd></div>
          <div><dt>完成时间</dt><dd>{{ formatTaskDateTime(shiftPreview.task.lastTurnCompletedAt) }}</dd></div>
          <div><dt>耗时</dt><dd>{{ formatTaskDuration(shiftPreview.task.lastTurnDurationMs) }}</dd></div>
          <div><dt>来源</dt><dd>{{ taskSourceLabel(shiftPreview.task) }}</dd></div>
          <div><dt>本地状态</dt><dd>{{ [shiftPreview.task.isHidden ? '隐藏' : '', shiftPreview.task.pinSource ? '置顶' : ''].filter(Boolean).join('、') || '普通' }}</dd></div>
          <div><dt>归档</dt><dd>{{ shiftPreview.task.canArchive ? '当前可归档' : '当前不可归档' }}</dd></div>
        </dl>
      </aside>

      <div v-if="composer" class="float-composer-layer" @pointerdown.stop @click.stop>
        <section
          ref="composerDialog"
          class="float-composer-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="codex-composer-title"
          aria-describedby="codex-composer-model-reason"
          @keydown.stop="onComposerKeydown"
        >
          <header>
            <span class="composer-project-info">
              <small>目标项目</small>
              <strong id="codex-composer-title">{{ composer.target.projectName }}</strong>
              <small class="composer-project-switch-hint">按 F 重新选择项目</small>
            </span>
            <button type="button" class="composer-project-switch" :disabled="composer.submitting" @click="openComposerProjectPicker">重选项目</button>
            <button type="button" aria-label="取消新建会话" :disabled="composer.submitting" @click="cancelComposer"><X :size="16" aria-hidden="true" /></button>
          </header>

          <div v-if="composer.projectPickerOpen" class="composer-project-picker" role="listbox" aria-label="新建会话目标项目">
            <button
              v-for="(option, index) in composer.projectPickerOptions"
              :key="option.key"
              type="button"
              role="option"
              :aria-selected="composer.projectPickerIndex === index"
              :aria-disabled="option.disabled"
              :disabled="option.disabled"
              :class="{ active: composer.projectPickerIndex === index }"
              :data-composer-project-index="index"
              :title="option.disabledReason || option.label"
              @click.stop="selectComposerProject(index)"
            >
              <span>{{ option.label }}</span>
              <small v-if="option.disabledReason">{{ option.disabledReason }}</small>
            </button>
          </div>

          <label class="composer-model-field">
            <span>本次模型</span>
            <select ref="composerModelSelect" :value="composer.model.modelId" data-input-role="codex-composer" :disabled="composer.submitting" @change="onComposerModelChange">
              <option v-if="composer.model.status !== 'ready'" value="">请选择可用模型</option>
              <option v-for="model in composerModels" :key="model.id" :value="model.id">{{ model.displayName }} · {{ model.id }}</option>
            </select>
          </label>
          <div class="composer-model-card" :class="composer.model.family">
            <b v-if="composer.model.family === 'spark'" aria-hidden="true">S</b>
            <span>
              <strong>{{ composer.model.modelName || '尚未选择模型' }}</strong>
              <code>{{ composer.model.modelId || 'model-required' }}</code>
            </span>
            <em v-if="composer.model.quota">{{ composer.model.quotaLabel }} · {{ composer.model.quota.remainingPercent }}%</em>
            <em v-else>{{ composer.model.quotaLabel }}</em>
          </div>
          <p id="codex-composer-model-reason" class="composer-model-reason">{{ codexModelReasonLabel(composer.model) }}</p>
          <p v-if="composer.staleConfirmation" class="composer-stale">额度、目录或项目指纹已变化；模型说明已刷新，请核对后再次提交。</p>

          <label class="composer-prompt-field">
            <span>首轮提示词 <small>支持系统听写；Enter 换行，Ctrl/Cmd+Enter 发送</small></span>
            <textarea
              ref="composerTextarea"
              v-model="composer.prompt"
              data-input-role="codex-composer"
              rows="5"
              maxlength="32000"
              spellcheck="true"
              placeholder="说出或输入你希望 Codex 开始处理的内容…"
              :disabled="composer.submitting"
            />
          </label>

          <div v-if="composer.error" class="composer-error" role="alert" aria-live="assertive">
            <strong>{{ composer.error }}</strong>
            <small v-if="composer.errorCode">错误代码：{{ composer.errorCode }}</small>
          </div>

          <footer>
            <button type="button" class="composer-secondary" :disabled="composer.submitting" @click="cancelComposer">取消</button>
            <button v-if="composer.manualOnly" type="button" class="composer-secondary" :disabled="composer.submitting" @click="openBlankFromComposer">打开 Codex 空白页</button>
            <button v-if="composer.reopenAlias" type="button" class="composer-primary" :disabled="composer.submitting" @click="retryOpenComposerThread">重试打开</button>
            <button type="button" class="composer-secondary" :disabled="composer.submitting || !composer.retryAllowed" @click="submitComposer('create-empty')">仅创建空会话</button>
            <button type="button" class="composer-primary" :disabled="composer.submitting || !composer.retryAllowed" @click="submitComposer('send-and-open')">{{ composer.submitting ? '正在创建…' : '发送并打开' }}</button>
          </footer>
        </section>
      </div>

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

    <div
      v-if="actionHint"
      class="float-action-hint"
      :class="actionHint.placement"
      :style="{ left: `${actionHint.left}px`, top: `${actionHint.top}px` }"
      role="tooltip"
    >{{ actionHint.label }}</div>
  </main>
</template>
