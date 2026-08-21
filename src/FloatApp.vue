<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  CircleHelp,
  CircleStop,
  Clipboard,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  MessageSquareText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from '@lucide/vue'
import CodexWaterBall from './components/CodexWaterBall.vue'
import {
  buildCompanionQuotaStrip,
  claudeRealtimeGapNote,
  companionQuotaChipAriaLabel,
  companionQuotaChipHint,
  companionQuotaFreshnessText,
  companionResetDetailText,
  companionSearchAlertText,
  companionSearchHintOverlaps,
  companionSearchIconHint,
  companionSearchMetaText,
  companionSearchPlaceholder,
  placeFloatActionHint,
  resolveCompanionProjectMarker,
  resolveCompanionRowMarker,
  resolveCompanionWaterBallPresentation
} from './domain/companionPresentation'
import type { CompanionProjectMarker, CompanionQuotaChip, CompanionRowMarker } from './domain/companionPresentation'
import QuickJumpLayer from './components/QuickJumpLayer.vue'
import {
  CODEX_THEME_PRESETS,
  codexThemeCssVars,
  codexWaterAppearanceCssVars,
  resolveCodexExpandedCardTheme,
  resolveCodexSurfaceTheme
} from './domain/codexAppearance'
import { buildCodexCompactPresentation, codexBadgeText, normalizeCodexTaskStatePackage } from './domain/codexPresentation'
import { applyCompanionTaskPackageViews } from './domain/companionTaskPackage'
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
import { normalizeCodexQuota, orderCodexAttentionTasks, orderCodexTasksForDisplay } from './domain/codex'
import { companionTaskProvider, type CompanionProviderId } from './domain/companionProvider'
import type { CodexFloatResizeCorner, CodexFloatWindowState } from './float-env'
import type { CodexFloatSnapshotV1 } from './runtime/codexController'
import type { RuntimeIdentityHandshakeV1 } from './platform/eypcPlatform'

type RenderRow =
  | { kind: 'section'; key: string; section: CodexProjectSection }
  | { kind: 'hidden-project-section'; key: string; title: string }
  | { kind: 'status-section'; key: string; title: string; count: number; tone: 'input' | 'active' | 'unknown' | 'stopped' | 'unread' | 'completed' }
  | { kind: 'project'; key: string; project: CodexProjectCard; marker: CompanionProjectMarker; sectionId: string; hiddenProject?: boolean }
  | { kind: 'task'; key: string; task: CodexTaskCard; marker: CompanionRowMarker; sectionId?: string; parentProjectKey?: string; nested?: boolean }
  | { kind: 'empty-project'; key: string; projectKey: string }

type FocusItem = Extract<RenderRow, { kind: 'project' | 'task' }>
type PanelState = { mode: 'detail' | 'drawer'; item: FocusItem; returnActionId: string } | null
type AliasEditor = { kind: 'task' | 'project'; key: string; value: string; originalName: string } | null
type DrawerAction = { id: string; label: string; danger?: boolean; disabled?: boolean; disabledReason?: string; run: () => void }
type UiConversationTab = 'dynamic' | 'completed' | 'hidden' | 'projects'
type CompanionProjectFilter = 'all' | CompanionProviderId
type ComposerProjectPickerOption = {
  key: string
  label: string
  target: CodexNewThreadTarget
  disabled: boolean
  disabledReason?: string
}
type ComposerImageAttachment = {
  file: File
  previewUrl: string
}
type ComposerState = {
  target: CodexNewThreadTarget
  context: CodexNewThreadSelectionContext
  model: CodexResolvedNewThreadModel
  selectionKind: 'auto' | 'manual'
  prompt: string
  image: ComposerImageAttachment | null
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
type ActionHint = {
  label: string
  left: number
  top: number
  placement: 'top' | 'bottom'
  arrowLeft: number
  maxWidth: number
  sticky?: boolean
} | null
type QuickJumpDomTarget = QuickJumpTarget & { element: HTMLElement }

const COMPOSER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const COMPOSER_IMAGE_MAX_BYTES = 20 * 1024 * 1024
const FLOAT_COLLAPSE_DELAY_MS = 220

const snapshot = ref<CodexFloatSnapshotV1 | null>(null)
const floatRuntimeIdentity = ref<RuntimeIdentityHandshakeV1 | null>(null)
const rootElement = ref<HTMLElement | null>(null)
const expanded = ref(false)
const floatState = ref<CodexFloatWindowState>({ expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null })
const searchText = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const searchField = ref<HTMLElement | null>(null)
const searchMeasure = ref<HTMLElement | null>(null)
const searchMetaEl = ref<HTMLElement | null>(null)
const searchPlaceholderHidden = ref(false)
const searchMetaPad = ref(0)
const taskScroll = ref<HTMLElement | null>(null)
const selectedKeys = ref<Set<string>>(new Set())
const focusedKey = ref('')
const rangeAnchorKey = ref('')
/** 快速筛选模式：动态列表编号可见，`Ctrl+1…0` 直接打开对应任务。 */
const quickMode = ref(false)
const batchPlacement = ref<'top' | 'bottom'>('bottom')
const panel = ref<PanelState>(null)
const panelLayer = ref<HTMLElement | null>(null)
const aliasEditor = ref<AliasEditor>(null)
const aliasInput = ref<HTMLInputElement | null>(null)
const composer = ref<ComposerState | null>(null)
const composerDialog = ref<HTMLElement | null>(null)
const composerTextarea = ref<HTMLTextAreaElement | null>(null)
const composerModelSelect = ref<HTMLSelectElement | null>(null)
const composerImageInput = ref<HTMLInputElement | null>(null)
const pendingConfirm = ref<{
  id: string
  label: string
  until: number
  operationId: string
  source: 'archive-button' | 'batch-archive' | 'project-archive' | 'manual-row-open'
} | null>(null)
const pendingPlanExecute = ref<{ key: string; identity: string; until: number } | null>(null)
const liveMessage = ref('')
const drawerActiveIndex = ref(0)
const highlightOwner = ref<'mouse' | 'keyboard'>('mouse')
const hoveredTaskKey = ref('')
const previewKeyboardKey = ref('')
const shiftPreview = ref<ShiftPreview>(null)
const shiftHeld = ref(false)
const shiftPreviewSuppressed = ref(false)
const actionHint = ref<ActionHint>(null)
const actionHintEl = ref<HTMLElement | null>(null)
const compactCounterHintText = ref('')
const optimisticProjectCollapsed = ref<Record<string, boolean>>({})

const runtimeReloadRequired = computed(() => (
  floatRuntimeIdentity.value?.status !== 'host-loaded'
  || snapshot.value?.runtimeIdentity?.status !== 'host-loaded'
  || snapshot.value?.runtimeIdentity?.actual.hostAssetId !== __EYPC_HOST_ASSET_ID__
  || snapshot.value?.runtimeIdentity?.actual.rendererAssetId !== __EYPC_RENDERER_ASSET_ID__
))
const runtimeReloadMessage = computed(() => (
  floatRuntimeIdentity.value?.status === 'reload-required'
    ? floatRuntimeIdentity.value.message
    : snapshot.value?.runtimeIdentity?.message || 'Float 与主插件运行版本不一致，请重新接入并重新打开 Float'
))
// `mode: 'tasks'` 是专项跳转：标记只落在展示出来的会话行上，激活等同于点击标题（直接打开），
// 而不是普通模式的「把高亮移过去」。两种模式共用同一套标记/筛选/Escape 逻辑。
const quickJump = ref<{ open: boolean; mode: 'all' | 'tasks'; query: string; sourceTargets: QuickJumpDomTarget[]; targets: QuickJumpDomTarget[]; activeTargetId: string | null }>({
  open: false,
  mode: 'all',
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
let planExecuteTimer: ReturnType<typeof setTimeout> | null = null
let actionHintTimer: ReturnType<typeof setTimeout> | null = null
let lastHintAnchor: HTMLElement | null = null
let compactCounterHintTimer: ReturnType<typeof setTimeout> | null = null
let taskScrollResizeObserver: ResizeObserver | null = null
let searchLayoutObserver: ResizeObserver | null = null
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
let pendingTaskFocusSource: 'manual-quick-jump' | null = null
let archiveConfirmationSequence = 0

const fallbackColors = CODEX_THEME_PRESETS[0].colors
const fallbackWaterAppearance = CODEX_THEME_PRESETS[0].waterAppearance
const fallbackExpandedCardAppearance = CODEX_THEME_PRESETS[0].expandedCardAppearance
const settings = computed(() => snapshot.value)
const quota = computed(() => snapshot.value?.quota)
const taskState = computed(() => {
  const normalized = normalizeCodexTaskStatePackage(
    snapshot.value?.taskState,
    snapshot.value?.conversations,
    snapshot.value?.taskStateRevision
  )
  const taskPackage = snapshot.value?.companionTaskPackage
  return taskPackage ? applyCompanionTaskPackageViews(normalized, taskPackage) : normalized
})
const conversations = computed(() => taskState.value.conversations)
const dynamicStatus = computed(() => taskState.value.dynamic)
const compact = computed(() => buildCodexCompactPresentation({
  quota: quota.value || { version: 1, status: 'idle', plan: '', short: null, weekly: null, updatedAt: 0 },
  compactFields: snapshot.value?.compactFields || [],
  conversationInboxEnabled: snapshot.value?.conversationInboxEnabled === true,
  taskCounts: dynamicStatus.value.compactCounts
}))
const compactCounts = computed(() => compact.value.taskCounts)
const companionSlice = computed(() => snapshot.value?.companion || null)
const companionWaterBall = computed(() => resolveCompanionWaterBallPresentation(companionSlice.value))
function taskFocusItem(task: CodexTaskCard): Extract<FocusItem, { kind: 'task' }> {
  return { kind: 'task', key: `task:${task.key}`, task, marker: resolveCompanionRowMarker(task)! }
}
function taskProvider(task: CodexTaskCard): CompanionProviderId {
  return companionTaskProvider(task)
}

function projectMarker(project: CodexProjectCard): CompanionProjectMarker {
  return resolveCompanionProjectMarker(project)!
}

function taskMatchesProjectFilter(task: CodexTaskCard) {
  return projectProviderFilter.value === 'all' || taskProvider(task) === projectProviderFilter.value
}

function projectMatchesProvider(project: CodexProjectCard) {
  return projectProviderFilter.value === 'all' || projectMarker(project).providers.includes(projectProviderFilter.value)
}
const primaryPercent = computed(() => compact.value.primary?.bucket.remainingPercent ?? 0)
const selectedWeekly = computed(() => {
  if (compact.value.primary?.kind === 'weekly') return compact.value.primary
  if (compact.value.secondary?.kind === 'weekly') return compact.value.secondary
  return null
})
const compactSurfaceTheme = computed(() => resolveCodexSurfaceTheme(settings.value?.style || 'water', settings.value?.colors || fallbackColors, primaryPercent.value))
const expandedSurfaceTheme = computed(() => resolveCodexExpandedCardTheme(
  settings.value?.colors || fallbackColors,
  settings.value?.expandedCardAppearance || fallbackExpandedCardAppearance,
  primaryPercent.value
))
const surfaceTheme = computed(() => expanded.value ? expandedSurfaceTheme.value : compactSurfaceTheme.value)
const rootStyle = computed<Record<string, string | number>>(() => ({
  ...codexThemeCssVars(surfaceTheme.value),
  ...codexWaterAppearanceCssVars(settings.value?.waterAppearance || fallbackWaterAppearance, settings.value?.colors || fallbackColors),
  '--water-level': `${primaryPercent.value}%`,
  '--codex-counter-input': settings.value?.counterColors?.input || '#E5486F',
  '--codex-counter-active': settings.value?.counterColors?.active || '#258BC7',
  '--codex-counter-unread': settings.value?.counterColors?.unread || '#B84D91'
}))

watch(rootStyle, (tokens) => {
  if (typeof document === 'undefined') return
  for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, String(value))
}, { immediate: true })

const expandedQuota = computed(() => {
  const normalized = normalizeCodexQuota(quota.value || { version: 1, status: 'idle', plan: '', short: null, weekly: null, updatedAt: 0 })
  const result: Array<{ key: string; label: string; family: 'normal' | 'spark'; window: 'short' | 'weekly'; bucket: CodexQuotaBucket }> = []
  if (normalized.normal.short) result.push({ key: 'normal-short', label: '5 小时限额', family: 'normal', window: 'short', bucket: normalized.normal.short })
  if (normalized.normal.weekly) result.push({ key: 'normal-weekly', label: '周限额', family: 'normal', window: 'weekly', bucket: normalized.normal.weekly })
  for (const pool of normalized.spark) {
    if (pool.short) result.push({ key: `${pool.limitId}-short`, label: 'Spark 额度', family: 'spark', window: 'short', bucket: pool.short })
    if (pool.weekly) result.push({ key: `${pool.limitId}-weekly`, label: 'Spark 周额度', family: 'spark', window: 'weekly', bucket: pool.weekly })
  }
  return result
})

/**
 * The whole quota area is one row: both providers, ordered, with the provider
 * caption and Spark subordination already resolved by the domain.
 */
const quotaStrip = computed(() => buildCompanionQuotaStrip(
  expandedQuota.value.map((item) => ({
    key: item.key,
    label: item.label,
    family: item.family,
    window: item.window,
    remainingPercent: item.bucket.remainingPercent,
    resetAt: item.bucket.resetAt
  })),
  companionSlice.value,
  compact.value.stateLabel
))
/**
 * Claude chips get the precise reset moment plus reading freshness in the hint
 * and accessible name (user decision 2026-08-06); Codex chips keep the original
 * `formatReset` strings byte-for-byte.
 */
function quotaChipHint(chip: CompanionQuotaChip) {
  if (chip.provider === 'claude') {
    const now = Date.now()
    return companionQuotaChipHint(
      chip,
      companionResetDetailText(chip.resetAt, now),
      quotaStrip.value.multiProvider,
      companionQuotaFreshnessText(chip, now)
    )
  }
  return companionQuotaChipHint(chip, formatReset(chip.resetAt), quotaStrip.value.multiProvider)
}
function quotaChipAria(chip: CompanionQuotaChip) {
  if (chip.provider === 'claude') {
    const now = Date.now()
    return companionQuotaChipAriaLabel(
      chip,
      companionResetDetailText(chip.resetAt, now),
      quotaStrip.value.multiProvider,
      companionQuotaFreshnessText(chip, now)
    )
  }
  return companionQuotaChipAriaLabel(chip, formatReset(chip.resetAt), quotaStrip.value.multiProvider)
}
const searchPlaceholder = computed(() => companionSearchPlaceholder(quickMode.value))
const searchAlertText = computed(() => companionSearchAlertText({
  compatibility: taskState.value.compatibility,
  compatibilityMessage: taskState.value.compatibilityMessage,
  conversationStatus: conversations.value?.status,
  conversationErrorMessage: conversations.value?.errorMessage,
  claudeGapNote: claudeRealtimeGapNote(companionSlice.value)
}))
const searchMetaText = computed(() => companionSearchMetaText({
  timeWindowDays: settings.value?.timeWindowDays || 30,
  count: conversations.value?.all.length,
  hasInventory: conversations.value?.completeness === 'verified' || conversations.value?.status === 'stale'
}))
const searchIconHint = computed(() => companionSearchIconHint(
  searchAlertText.value,
  searchPlaceholderHidden.value,
  searchPlaceholder.value
))
const searchLiveText = computed(() => {
  const parts = [searchAlertText.value, searchMetaText.value].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return snapshot.value ? '' : '等待真实会话预检'
})
const statusText = computed(() => searchLiveText.value || '等待真实会话预检')
const compactAriaLabel = computed(() => {
  if (snapshot.value && (taskState.value.compatibility === 'degraded' || quota.value?.status === 'stale' || quota.value?.status === 'error' || conversations.value?.status === 'stale' || conversations.value?.status === 'error')) return `${compact.value.ariaLabel}，${statusText.value}`
  return compact.value.ariaLabel
})
const composerHasContent = computed(() => Boolean(composer.value?.image || composer.value?.prompt.trim()))

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
  const pinnedSection = conversations.value?.projectSections.find((section) => section.id === 'pinned')
  const pinnedTaskKeys = (pinnedSection?.entries || [])
    .filter((entry) => entry.kind === 'task')
    .map((entry) => entry.task.key)
  return orderCodexTasksForDisplay(tasks, pinnedTaskKeys)
}

const renderRows = computed<RenderRow[]>(() => {
  const value = conversations.value
  if (!value) return []
  const searchQuery = normalizedSearch()
  const usedProjectRows = new Set<string>()

  function addTaskRow(task: CodexTaskCard, sectionId?: string, parentProjectKey?: string, nested = false): RenderRow {
    return { ...taskFocusItem(task), sectionId, parentProjectKey, nested }
  }

  function addProjectRow(project: CodexProjectCard, hiddenProject = false): RenderRow {
    return {
      kind: 'project',
      key: hiddenProject ? `hidden-project:${project.key}` : `project:${project.key}`,
      project,
      marker: projectMarker(project),
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

  if (selectedUiTab.value === 'dynamic') {
    const statusGroups = dynamicStatus.value.groups
    const unknownTasks = statusGroups.stopped.filter((task) => task.claudePhase === 'unknown')
    const stoppedTasks = statusGroups.stopped.filter((task) => task.claudePhase !== 'unknown')
    const groups = [
      { key: 'input', title: '待输入', tone: 'input' as const, tasks: statusGroups.input },
      { key: 'active', title: '正在进行中', tone: 'active' as const, tasks: statusGroups.active },
      { key: 'unknown', title: '状态未知', tone: 'unknown' as const, tasks: unknownTasks },
      { key: 'stopped', title: '待继续', tone: 'stopped' as const, tasks: stoppedTasks },
      { key: 'unread', title: '已完成未读', tone: 'unread' as const, tasks: statusGroups.unread },
      { key: 'completed', title: '已完成', tone: 'completed' as const, tasks: statusGroups.completed }
    ]
    return groups.flatMap((group): RenderRow[] => {
      const matched = group.tasks.filter((task) => taskMatched(task))
      const tasks = group.key === 'input' || group.key === 'unread'
        ? orderCodexAttentionTasks(matched)
        : displayOrderedTasks(matched)
      if (!tasks.length) return []
      return [
        { kind: 'status-section', key: `status:${group.key}`, title: group.title, count: tasks.length, tone: group.tone },
        ...tasks.map((task) => addTaskRow(task))
      ]
    })
  }

  if (selectedUiTab.value === 'completed') {
    const unread = orderCodexAttentionTasks(value.completedUnread.filter((task) => taskMatched(task)))
    const tasks = [...unread, ...displayOrderedTasks(value.completed.filter((task) => taskMatched(task)))]
    return tasks.map((task) => addTaskRow(task))
  }

  if (selectedUiTab.value === 'hidden') {
    const matched = value.hidden.filter((task) => taskMatched(task))
    const paused = displayOrderedTasks(matched.filter((task) => task.planPaused))
    const ordinary = displayOrderedTasks(matched.filter((task) => !task.planPaused))
    return [
      ...(paused.length ? [
        { kind: 'status-section' as const, key: 'hidden:paused', title: '已暂停', count: paused.length, tone: 'stopped' as const },
        ...paused.map((task) => addTaskRow(task))
      ] : []),
      ...(ordinary.length ? [
        { kind: 'status-section' as const, key: 'hidden:ordinary', title: '普通隐藏', count: ordinary.length, tone: 'unknown' as const },
        ...ordinary.map((task) => addTaskRow(task))
      ] : [])
    ]
  }

  const rows: RenderRow[] = []
  const addSectionTasks = (target: RenderRow[], tasks: CodexTaskCard[], sectionId: string, parentProjectKey?: string, forceOpen = false) => {
    const visibleTasks = displayOrderedTasks(tasks.filter((task) => taskMatched(task)))
    if (!visibleTasks.length) return
    for (const task of visibleTasks) target.push(addTaskRow(task, sectionId, parentProjectKey, forceOpen))
  }

  for (const section of value.projectSections) {
    const sectionRows: RenderRow[] = []
    for (const entry of section.entries) {
      if (entry.kind === 'project') {
        if (!projectMatchesProvider(entry.project)) continue
        const filteredProject = { ...entry.project, tasks: entry.project.tasks.filter((task) => taskMatchesProjectFilter(task)) }
        const shouldShowAllTasks = projectMatched(filteredProject)
        const projectTasks = displayOrderedTasks(shouldShowAllTasks || !searchQuery ? filteredProject.tasks : filteredProject.tasks.filter((task) => taskMatched(task)))
        if (projectTasks.length || shouldShowAllTasks) {
          const row = addProjectRow(filteredProject)
          usedProjectRows.add(row.key)
          sectionRows.push(row)
          const openChildren = !isProjectCollapsed(filteredProject) || Boolean(searchQuery)
          if (openChildren) {
            const children = shouldShowAllTasks || !searchQuery ? filteredProject.tasks : filteredProject.tasks.filter((task) => taskMatched(task))
            addSectionTasks(sectionRows, children, section.id, filteredProject.key, openChildren)
          }
        }
      } else {
        if (taskMatchesProjectFilter(entry.task) && taskMatched(entry.task)) sectionRows.push(addTaskRow(entry.task, section.id))
      }
    }
    if (sectionRows.length) {
      rows.push({ kind: 'status-section', key: `section:${section.id}`, title: section.title, count: sectionRows.length, tone: 'active' })
      rows.push(...sectionRows)
    }
  }

  if (value.hiddenProjects.length) {
    rows.push({ kind: 'hidden-project-section', key: 'hidden-projects', title: '已隐藏项目' })
    const hiddenProjects = value.hiddenProjects
      .filter((project) => projectMatchesProvider(project))
      .map((project) => ({ ...project, tasks: project.tasks.filter((task) => taskMatchesProjectFilter(task)) }))
      .filter((project) => !searchQuery || projectMatched(project))
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
const focusedItem = computed(() => focusItems.value.find((item) => item.key === focusedKey.value) || null)

const QUICK_INDEX_LIMIT = 10
/** 编号只落在任务行上，并且跟着搜索结果实时重排——所见即所开。 */
const quickTaskRows = computed(() => renderRows.value
  .filter((row): row is Extract<RenderRow, { kind: 'task' }> => row.kind === 'task')
  .slice(0, QUICK_INDEX_LIMIT))
// 编号常驻：`Alt+数字` 在展开卡片里始终可用，所以徽标不能只在筛选模式出现，
// 否则就成了隐藏快捷键。筛选模式额外让 `Ctrl+数字` 也走同一编号。
const quickIndexByRowKey = computed(() => {
  const map = new Map<string, number>()
  quickTaskRows.value.forEach((row, index) => map.set(row.key, index + 1))
  return map
})

/** 徽标显示的是实际要按的数字：第 10 项对应 `Alt+0` / `Ctrl+0`。 */
function quickIndexDigit(rowKey: string) {
  const index = quickIndexByRowKey.value.get(rowKey)
  if (!index) return ''
  return String(index === QUICK_INDEX_LIMIT ? 0 : index)
}

/** 编号的可达路径必须对读屏可见，不能只靠徽标这一个视觉线索。 */
function quickIndexHint(rowKey: string) {
  const digit = quickIndexDigit(rowKey)
  if (!digit) return ''
  return quickMode.value ? `，快捷键 Ctrl+${digit} 或 Alt+${digit} 打开` : `，快捷键 Alt+${digit} 打开`
}

const visibleTaskKeys = computed(() => new Set(renderRows.value.filter((row): row is Extract<RenderRow, { kind: 'task' }> => row.kind === 'task').map((row) => row.task.key)))
const selectedTasks = computed(() => (conversations.value?.all || []).filter((task) => selectedKeys.value.has(task.key) && visibleTaskKeys.value.has(task.key)))
const archivingTaskKeys = computed(() => new Set(snapshot.value?.archivingTaskKeys || []))
const showBatchToolbar = computed(() => selectedTasks.value.length >= 2)
const drawerIsBatch = computed(() => selectedTasks.value.length >= 2)
const drawerItem = computed<FocusItem | null>(() => {
  if (drawerIsBatch.value) return panel.value?.item || focusedItem.value
  const selected = selectedTasks.value[0]
  if (selected) return taskFocusItem(selected)
  return panel.value?.item || focusedItem.value
})

const composerModels = computed(() => composer.value?.context.modelCatalog.models || [])
const selectedUiTab = ref<UiConversationTab>('dynamic')
const projectProviderFilter = ref<CompanionProjectFilter>('all')
const appliedCompanionRevision = ref(0)
const appliedBaseRevision = ref(0)
const projectFilters = computed(() => {
  const filters: Array<{ id: CompanionProjectFilter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'codex', label: '只显示 Codex' },
    { id: 'claude', label: '只显示 Claude' }
  ]
  if (snapshot.value?.companion?.providers.cursor === true) {
    filters.push({ id: 'cursor', label: '只显示 Cursor' })
  }
  return filters
})

const projectCount = computed(() => {
  const value = conversations.value
  if (!value) return 0
  return value.projects.filter((project) => projectMatchesProvider(project)).length
})
const projectTaskCount = computed(() => {
  const tasks = new Set<string>()
  for (const project of conversations.value?.projects || []) {
    if (!projectMatchesProvider(project)) continue
    for (const task of project.tasks) if (taskMatchesProjectFilter(task)) tasks.add(task.key)
  }
  return tasks.size
})
const tabs = computed(() => {
  const value = conversations.value
  if (!value) return []
  return [
    { id: 'dynamic', label: '动态', count: dynamicStatus.value.tasks.length },
    { id: 'completed', label: '已完成', count: value.completed.length + value.completedUnread.length },
    { id: 'hidden', label: '已隐藏', count: value.hiddenCount },
    { id: 'projects', label: '项目', count: projectCount.value }
  ] satisfies Array<{ id: UiConversationTab; label: string; count: number }>
})
const tabLabelToBackend: Record<UiConversationTab, CodexTaskTab> = {
  dynamic: 'ongoing',
  completed: 'completed',
  hidden: 'hidden',
  projects: 'projects'
}

function switchComposerTab(tab: UiConversationTab) {
  clearConfirm()
  selectedUiTab.value = tab
  action('codex.tab.set', { tab: tabLabelToBackend[tab] })
}

function setProjectProviderFilter(filter: CompanionProjectFilter) {
  projectProviderFilter.value = filter
}

function onProjectFilterKeydown(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? projectFilters.value.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + projectFilters.value.length) % projectFilters.value.length
  setProjectProviderFilter(projectFilters.value[nextIndex].id)
  void nextTick(() => rootElement.value?.querySelectorAll<HTMLElement>('.float-project-provider-tabs [role="tab"]')[nextIndex]?.focus())
}

function focusSelectedComposerTab() {
  void nextTick(() => {
    rootElement.value?.querySelector<HTMLElement>('.float-task-tabs [role="tab"][aria-selected="true"]')?.focus({ preventScroll: true })
  })
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
  if (input === 'completed') return 'completed'
  if (input === 'hidden') return 'hidden'
  if (input === 'projects') return 'projects'
  return 'dynamic'
}

watch(() => conversations.value?.activeTab, (value) => {
  selectedUiTab.value = mapUiTab(value)
}, { immediate: true })

watch(() => conversations.value?.all, (tasks) => {
  const pending = pendingPlanExecute.value
  if (!pending) return
  const task = tasks?.find((candidate) => candidate.key === pending.key)
  if (!task || planActionIdentity(task) !== pending.identity) clearPlanExecuteConfirmation()
})

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
  if (project && projectMarker(project).claudeOnly) {
    liveMessage.value = projectMutationBlockedReason(project, '新建会话')
    return
  }
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
    image: null,
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

function clearComposerImage(state = composer.value) {
  if (!state?.image) return
  URL.revokeObjectURL(state.image.previewUrl)
  state.image = null
  if (composerImageInput.value) composerImageInput.value.value = ''
}

function addComposerImage(file: File | null) {
  const state = composer.value
  if (!state || !file) return
  if (!COMPOSER_IMAGE_TYPES.has(file.type)) {
    state.error = '仅支持 PNG、JPEG 或 WebP 图片'
    state.errorCode = 'image-type-unsupported'
    return
  }
  if (file.size <= 0 || file.size > COMPOSER_IMAGE_MAX_BYTES) {
    state.error = '图片需小于 20MB'
    state.errorCode = 'image-too-large'
    return
  }
  clearComposerImage(state)
  state.image = { file, previewUrl: URL.createObjectURL(file) }
  state.error = ''
  state.errorCode = ''
}

function onComposerImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  addComposerImage(input.files?.[0] || null)
}

function onComposerImageDrop(event: DragEvent) {
  event.preventDefault()
  addComposerImage([...Array.from(event.dataTransfer?.files || [])].find((file) => COMPOSER_IMAGE_TYPES.has(file.type)) || null)
}

function onComposerPaste(event: ClipboardEvent) {
  const image = [...Array.from(event.clipboardData?.items || [])]
    .find((item) => item.kind === 'file' && COMPOSER_IMAGE_TYPES.has(item.type))
    ?.getAsFile() || null
  if (!image) return
  event.preventDefault()
  addComposerImage(image)
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
  clearComposerImage(composer.value)
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
  if (mode === 'create-empty' && (state.image || state.prompt.trim())) {
    state.error = '已有首轮内容，请使用“发送并打开”'
    state.errorCode = 'content-requires-send'
    return
  }
  if (state.image) {
    await openImageFallback(state)
    return
  }
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

async function openImageFallback(state: ComposerState) {
  const prompt = state.prompt.trim()
  if (!prompt) {
    state.error = '请同时填写首轮提示词；图片将由你在 Codex 中手动粘贴'
    state.errorCode = 'prompt-required'
    composerTextarea.value?.focus()
    return
  }
  state.submitting = true
  state.error = ''
  state.errorCode = ''
  try {
    const copied = await window.eypcFloat?.copyText(prompt)
    if (!copied) {
      state.error = '无法复制首轮文字，未打开 Codex 空白会话'
      state.errorCode = 'clipboard-unavailable'
      return
    }
    const result = await window.eypcFloat?.openBlank()
    if (result?.outcome === 'opened' || result?.outcome === 'dispatched') {
      liveMessage.value = '已打开 Codex 空白会话并复制首轮文字；请粘贴图片并手动选择模型'
      cancelComposer()
      return
    }
    state.error = result?.message || 'Codex 空白页打开失败；首轮文字仍在剪贴板'
    state.errorCode = result?.errorCode || 'blank-open-failed'
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
    const hidden = tasks.filter((task) => !task.planReady && task.isHidden && task.hiddenKind)
    const visible = tasks.filter((task) => !task.planReady && !task.isHidden)
    const pausablePlans = tasks.filter((task) => task.companionCapabilities?.pause === true)
    const resumablePlans = tasks.filter((task) => task.companionCapabilities?.resume === true)
    const unpinned = tasks.filter((task) => task.pinSource !== 'local')
    const pinned = tasks.filter((task) => task.pinSource === 'local')
    return [
      { id: 'batch-archive', label: `归档可归档项（${archivable.length}/${tasks.length}）`, danger: true, disabled: !archivable.length, disabledReason: '选中项没有当前可归档的任务', run: requestTaskArchive },
      { id: 'batch-hide', label: `移到已隐藏（${visible.length}）`, disabled: !visible.length, disabledReason: '选中项均已隐藏或属于 Plan', run: () => visible.forEach(hideTask) },
      { id: 'batch-restore', label: `恢复显示（${hidden.length}）`, disabled: !hidden.length, disabledReason: '选中项没有可恢复的普通隐藏任务', run: () => hidden.forEach(restoreTask) },
      { id: 'batch-pause-plan', label: `暂停 Plan（${pausablePlans.length}）`, disabled: !pausablePlans.length, disabledReason: '选中项没有可暂停的 Plan', run: () => action('codex.tasks.pausePlan', { items: pausablePlans.map((task) => ({ key: task.key, revisionAt: task.revisionAt })) }) },
      { id: 'batch-resume-plan', label: `恢复 Plan（${resumablePlans.length}）`, disabled: !resumablePlans.length, disabledReason: '选中项没有可恢复的 Plan', run: () => action('codex.tasks.resumePlan', { items: resumablePlans.map((task) => ({ key: task.key, revisionAt: task.revisionAt })) }) },
      { id: 'batch-pin', label: `本地置顶（${unpinned.length}）`, disabled: !unpinned.length, disabledReason: '选中项均已置顶', run: () => unpinned.forEach((task) => togglePin(taskFocusItem(task))) },
      { id: 'batch-unpin', label: `取消本地置顶（${pinned.length}）`, disabled: !pinned.length, disabledReason: '选中项没有本地置顶', run: () => pinned.forEach((task) => togglePin(taskFocusItem(task))) },
      { id: 'batch-clear', label: '清空选择', run: clearSelection }
    ]
  }
  const item = drawerItem.value
  if (!item) return []
  if (item.kind === 'task') {
    const project = conversations.value?.projects.find((candidate) => candidate.key === item.task.projectKey)
    const canCreateInProject = taskCanCreateInProject(item.task, project)
    const claudeSyncActions: DrawerAction[] = companionTaskProvider(item.task) === 'claude'
      ? [{
          id: 'task-claude-sync',
          label: '同步 Claude 状态',
          disabled: !item.task.actionAlias,
          disabledReason: 'Claude 任务身份已失效',
          run: () => action('codex.claude.task.sync', { key: item.task.key, actionAlias: item.task.actionAlias })
        }]
      : []
    const planActions: DrawerAction[] = item.task.planReady
      ? [
          {
            id: item.task.planPaused ? 'task-resume-plan' : 'task-pause-plan',
            label: item.task.planPaused ? '恢复 Plan' : '暂停 Plan',
            disabled: item.task.planPaused
              ? item.task.companionCapabilities?.resume !== true
              : item.task.companionCapabilities?.pause !== true,
            disabledReason: planActionBlockedReason(item.task, item.task.planPaused ? '恢复' : '暂停'),
            run: () => togglePlanPause(item.task)
          },
          {
            id: 'task-execute-plan',
            label: planExecuteConfirming(item.task) ? '确认执行原 Plan' : '执行原 Plan',
            disabled: item.task.companionCapabilities?.executePlan !== true,
            disabledReason: planActionBlockedReason(item.task, '执行'),
            run: () => requestPlanExecute(item.task)
          }
        ]
      : [{ id: 'task-hide', label: item.task.isHidden ? '恢复显示' : '移到已隐藏', disabled: item.task.isHidden && !item.task.hiddenKind, run: () => item.task.isHidden ? restoreTask(item.task) : hideTask(item.task) }]
    return [
      { id: 'task-open', label: '打开', disabled: item.task.companionCapabilities?.open === false, disabledReason: '任务打开能力不可用', run: () => openTask(item.task) },
      ...claudeSyncActions,
      { id: 'task-new-thread', label: '在当前项目新建会话', disabled: !canCreateInProject, disabledReason: taskProjectActionBlockedReason(item.task, project), run: () => openComposer(project) },
      { id: 'task-new-thread-model', label: '选择模型新建会话', disabled: !canCreateInProject, disabledReason: taskProjectActionBlockedReason(item.task, project), run: () => openComposer(project, true) },
      { id: 'task-detail', label: '查看详情', run: () => openDetailPanel(item) },
      { id: 'task-alias', label: '编辑别名', run: () => editAlias(item) },
      { id: 'task-pin', label: item.task.pinSource === 'native' ? 'Codex 原生置顶（只读）' : item.task.pinSource === 'local' ? '取消本地置顶' : '本地置顶', disabled: item.task.pinSource === 'native', disabledReason: '原生置顶顺序由 Codex 管理', run: () => togglePin(item) },
      ...planActions,
      { id: 'task-archive', label: '真实归档', danger: true, disabled: !item.task.canArchive, disabledReason: taskArchiveBlockedReason(item.task), run: requestTaskArchive }
    ]
  }
  return [
    { id: 'project-new-thread', label: '新建会话', disabled: !item.project.actionAlias || item.marker.claudeOnly, disabledReason: projectActionBlockedReason(item.marker, '新建会话'), run: () => openComposer(item.project) },
    { id: 'project-new-thread-model', label: '选择模型新建会话', disabled: !item.project.actionAlias || item.marker.claudeOnly, disabledReason: projectActionBlockedReason(item.marker, '新建会话'), run: () => openComposer(item.project, true) },
    { id: 'project-toggle', label: isProjectCollapsed(item.project) ? '展开项目' : '折叠项目', run: () => toggleProject(item.project) },
    { id: 'project-detail', label: '查看项目详情', run: () => openDetailPanel(item) },
    { id: 'project-alias', label: '编辑项目别名', run: () => editAlias(item) },
    { id: 'project-pin', label: item.project.pinSource === 'native' ? 'Codex 原生置顶（只读）' : item.project.pinSource === 'local' ? '取消本地置顶' : '本地置顶', disabled: item.project.kind === 'chats' || item.project.pinSource === 'native' || item.marker.claudeOnly, disabledReason: item.project.kind === 'chats' ? 'Chats 分组不可置顶' : item.marker.claudeOnly ? projectActionBlockedReason(item.marker, '项目置顶') : '原生置顶顺序由 Codex 管理', run: () => togglePin(item) },
    { id: 'project-hide', label: isProjectHidden(item.project) ? '恢复项目分组' : '隐藏项目分组', disabled: item.project.kind === 'chats' || item.marker.claudeOnly, disabledReason: item.project.kind === 'chats' ? 'Chats 分组不可隐藏' : projectActionBlockedReason(item.marker, '项目隐藏'), run: () => toggleProjectHidden(item.project) },
    { id: 'project-archive', label: '归档已完成任务', danger: true, disabled: !item.project.actionAlias || item.marker.claudeOnly, disabledReason: projectActionBlockedReason(item.marker, '归档'), run: () => requestProjectArchive(item.project) },
    { id: 'project-remove', label: '从 Codex 侧栏移除', danger: true, disabled: item.project.kind === 'chats' || item.marker.claudeOnly || !item.project.actionAlias || !conversations.value?.sourceFingerprint, disabledReason: item.project.kind === 'chats' ? 'Chats 分组不可移除' : projectActionBlockedReason(item.marker, '从 Codex 移除'), run: () => requestProjectRemove(item.project) }
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

function compactSurfaceVerticalRatio(event: MouseEvent | PointerEvent, surface: HTMLElement) {
  const bounds = surface.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return null
  const insideSurface = event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom
  if (!insideSurface) return null
  return (event.clientY - bounds.top) / bounds.height
}

function isCompactExpansionZone(event: MouseEvent | PointerEvent, surface: HTMLElement) {
  const ratio = compactSurfaceVerticalRatio(event, surface)
  return ratio !== null && ratio <= 1 / 3
}

function isCompactDragZone(event: PointerEvent, surface: HTMLElement) {
  const ratio = compactSurfaceVerticalRatio(event, surface)
  return ratio !== null && ratio >= 1 / 2
}

function onCompactClick(event: MouseEvent) {
  if (ignoreCompactClick) {
    ignoreCompactClick = false
    return
  }
  const surface = event.currentTarget as HTMLElement | null
  if (event.detail !== 0 && (!surface || !isCompactExpansionZone(event, surface))) return
  requestExpansion(true)
}

function compactCounterHint(kind: 'input' | 'active' | 'unread') {
  const count = compactCounts.value[kind]
  if (kind === 'input') return `待输入 ${count} · 最新优先，连续触发依次打开`
  if (kind === 'active') return `进行中 ${count}`
  return `未读 ${count} · 最新优先，连续触发依次打开`
}

function queueCompactCounterHint(event: Event, kind: 'input' | 'active' | 'unread') {
  if (event instanceof PointerEvent && event.pointerType === 'touch') return
  clearCompactCounterHint()
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!target) return
  compactCounterHintTimer = setTimeout(() => {
    if (target.isConnected) compactCounterHintText.value = compactCounterHint(kind)
  }, 200)
}

function clearCompactCounterHint() {
  if (compactCounterHintTimer) clearTimeout(compactCounterHintTimer)
  compactCounterHintTimer = null
  compactCounterHintText.value = ''
}

function openCompactStatus(kind: 'input' | 'active' | 'unread') {
  if (kind === 'active') {
    requestExpansion(true)
    return
  }
  if (kind === 'unread') {
    action('codex.completed-unread.openFirst')
    return
  }
  action('codex.input.open')
}

function openTask(task: CodexTaskCard, source: 'card-click' | 'manual-quick-jump' | 'local-shortcut' = 'card-click') {
  action('codex.task.open', { key: task.key, actionAlias: task.actionAlias || '', source })
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

function planActionIdentity(task: CodexTaskCard) {
  return [
    companionTaskProvider(task),
    task.key,
    task.actionAlias || '',
    task.planLifecycleRevision || 0,
    task.bucket,
    task.activityState,
    task.planPaused ? 1 : 0
  ].join('|')
}

function clearPlanExecuteConfirmation() {
  if (planExecuteTimer) clearTimeout(planExecuteTimer)
  planExecuteTimer = null
  pendingPlanExecute.value = null
}

function planExecuteConfirming(task: CodexTaskCard) {
  return pendingPlanExecute.value?.identity === planActionIdentity(task)
    && pendingPlanExecute.value.until >= Date.now()
}

function planActionBlockedReason(task: CodexTaskCard, actionName: '暂停' | '恢复' | '执行') {
  if (!task.planReady) return '当前任务没有可继续的已完成 Plan'
  if (actionName === '暂停' && task.companionCapabilities?.pause !== true) return '当前 Plan 状态不可暂停'
  if (actionName === '恢复' && task.companionCapabilities?.resume !== true) return '当前 Plan 状态不可恢复'
  if (actionName === '执行' && task.companionCapabilities?.executePlan !== true) return '当前 Plan 尚未完成，或任务已有其它待决状态'
  return `${actionName} Plan`
}

function togglePlanPause(task: CodexTaskCard) {
  const actionName = task.planPaused ? '恢复' : '暂停'
  const capability = task.planPaused ? task.companionCapabilities?.resume : task.companionCapabilities?.pause
  if (capability !== true) {
    liveMessage.value = planActionBlockedReason(task, actionName)
    return
  }
  action(task.planPaused ? 'codex.task.resumePlan' : 'codex.task.pausePlan', {
    key: task.key,
    revisionAt: task.revisionAt
  })
}

function requestPlanExecute(task: CodexTaskCard) {
  if (task.companionCapabilities?.executePlan !== true) {
    liveMessage.value = planActionBlockedReason(task, '执行')
    return
  }
  const identity = planActionIdentity(task)
  const confirmed = pendingPlanExecute.value?.identity === identity
    && pendingPlanExecute.value.until >= Date.now()
  if (confirmed) clearPlanExecuteConfirmation()
  else {
    clearPlanExecuteConfirmation()
    pendingPlanExecute.value = { key: task.key, identity, until: Date.now() + 5_000 }
    planExecuteTimer = setTimeout(clearPlanExecuteConfirmation, 5_000)
  }
  action('codex.task.executePlan', { key: task.key, revisionAt: task.revisionAt })
}

function taskSecondaryActionLabel(task: CodexTaskCard) {
  if (task.planReady) return task.planPaused ? '恢' : '暂'
  return task.isHidden ? '显' : '隐'
}

function taskSecondaryActionHint(task: CodexTaskCard) {
  if (task.planReady) return planActionBlockedReason(task, task.planPaused ? '恢复' : '暂停')
  return task.isHidden ? '恢复会话显示' : '移到 Companion 已隐藏区'
}

function taskSecondaryActionDisabled(task: CodexTaskCard) {
  if (task.planReady) return task.planPaused
    ? task.companionCapabilities?.resume !== true
    : task.companionCapabilities?.pause !== true
  return task.isHidden && !task.hiddenKind
}

function runTaskSecondaryAction(task: CodexTaskCard) {
  if (task.planReady) togglePlanPause(task)
  else if (task.isHidden) restoreTask(task)
  else hideTask(task)
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
  if (projectMarker(project).claudeOnly) {
    liveMessage.value = projectMutationBlockedReason(project, '项目隐藏')
    return
  }
  action(isProjectHidden(project) ? 'codex.project.show' : 'codex.project.hide', { key: project.key })
}

function isProjectCollapsed(project: CodexProjectCard) {
  return Object.prototype.hasOwnProperty.call(optimisticProjectCollapsed.value, project.key)
    ? optimisticProjectCollapsed.value[project.key]
    : project.collapsed
}

function pinSourceHint(item: FocusItem) {
  if (item.kind === 'project' && item.project.kind === 'chats') return 'Chats 分组不可置顶'
  if (item.kind === 'project' && item.marker.claudeOnly) return projectActionBlockedReason(item.marker, '项目置顶')
  const source = item.kind === 'task' ? item.task.pinSource : item.project.pinSource
  if (source === 'native') return '来源：Codex 原生置顶 · 顺序只读'
  if (source === 'local') return '来源：EyPc 本地置顶 · 点击取消'
  return '未置顶 · 点击后由 EyPc 本地置顶'
}

function pinSourceValue(item: FocusItem) {
  if (item.kind === 'project' && (item.project.kind === 'chats' || item.marker.claudeOnly)) return 'blocked'
  return (item.kind === 'task' ? item.task.pinSource : item.project.pinSource) || 'none'
}

function pinIsReadOnly(item: FocusItem) {
  const source = pinSourceValue(item)
  return source === 'native' || source === 'blocked'
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

function clearConfirm(reason: 'cleared' | 'confirmed' | 'expired' = 'cleared') {
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = null
  const current = pendingConfirm.value
  pendingConfirm.value = null
  clearActionHint(true)
  if (current && reason === 'expired' && current.id.startsWith('archive')) {
    action('codex.archive.confirmation', {
      operationId: current.operationId,
      source: current.source,
      stage: 'expired'
    })
  }
}

function requestConfirmation(
  id: string,
  label: string,
  run: (operationId: string) => void,
  source: 'archive-button' | 'batch-archive' | 'project-archive' | 'manual-row-open' = 'manual-row-open'
) {
  const current = pendingConfirm.value
  if (current?.id === id && current.until >= Date.now()) {
    if (id.startsWith('archive')) {
      action('codex.archive.confirmation', {
        operationId: current.operationId,
        source: current.source,
        stage: 'confirmed'
      })
    }
    clearConfirm('confirmed')
    run(current.operationId)
    return
  }
  clearConfirm()
  archiveConfirmationSequence += 1
  const operationId = `archive-ui-${Date.now().toString(36)}-${archiveConfirmationSequence.toString(36)}`
  pendingConfirm.value = { id, label, until: Date.now() + 5_000, operationId, source }
  if (id.startsWith('archive')) {
    action('codex.archive.confirmation', { operationId, source, stage: 'created' })
  }
  liveMessage.value = `${label}：请在 5 秒内再次执行相同操作确认`
  confirmTimer = setTimeout(() => clearConfirm('expired'), 5_000)
  showActionHint(resolveHintAnchor(), `${label} · 再次操作确认`, { sticky: true })
}

function archiveCandidates() {
  const selected = selectedTasks.value.filter((task) => task.canArchive && !archivingTaskKeys.value.has(task.key))
  if (selected.length) return selected
  return focusedItem.value?.kind === 'task'
    && focusedItem.value.task.canArchive
    && !archivingTaskKeys.value.has(focusedItem.value.task.key)
    ? [focusedItem.value.task]
    : []
}

function taskArchiving(task: CodexTaskCard) {
  return archivingTaskKeys.value.has(task.key)
}

function taskArchiveConfirming(task: CodexTaskCard) {
  const id = pendingConfirm.value?.id || ''
  if (!id.startsWith('archive:')) return false
  return id.slice('archive:'.length).split('|').includes(taskArchiveIdentity(task))
}

function taskArchiveIdentity(task: CodexTaskCard) {
  const terminalEpoch = task.bucket === 'completed' || task.bucket === 'completed-unread'
    ? task.completionRevision || task.lastTurnCompletedAt || task.lastTurnStartedAt || task.statusEnteredAt || 0
    : task.bucket === 'stopped'
      ? task.lastTurnStartedAt || task.statusEnteredAt || 0
      : 0
  return `${taskProvider(task)}:${task.key}:${terminalEpoch}`
}

function confirmationMatchesCurrentState() {
  const id = pendingConfirm.value?.id || ''
  if (!id) return true
  if (id.startsWith('archive:')) {
    const identities = new Set((conversations.value?.all || [])
      .filter((task) => task.canArchive && !taskArchiving(task))
      .map(taskArchiveIdentity))
    return id.slice('archive:'.length).split('|').every((identity) => identities.has(identity))
  }
  if (id.startsWith('archive-project:') || id.startsWith('remove-project:')) {
    const key = id.slice(id.indexOf(':') + 1)
    return Boolean(conversations.value?.projects.some((project) => project.key === key && project.actionAlias))
  }
  return false
}

function taskArchiveBlockedReason(task: CodexTaskCard) {
  if (task.claudePhase === 'unknown') return '状态证据不足，暂不能归档'
  return task.archiveCapability === 'blocked-stopped'
    ? '任务状态证据不足，暂不能归档'
    : '任务仍在进行中，暂不能归档'
}

function projectActionBlockedReason(marker: CompanionProjectMarker, actionName: string) {
  return marker.claudeOnly
    ? `Claude 虚拟项目不支持${actionName}；可打开、折叠，或对任务执行本地置顶与隐藏`
    : '项目动作已失效'
}

function projectMutationBlockedReason(project: CodexProjectCard, actionName: string) {
  return projectActionBlockedReason(projectMarker(project), actionName)
}

function taskProjectActionBlockedReason(task: CodexTaskCard, project?: CodexProjectCard) {
  if (taskProvider(task) === 'claude') return 'Claude 任务只支持打开、本地置顶和本地隐藏；不会转发 Codex 新建动作'
  return project ? projectMutationBlockedReason(project, '新建会话') : '项目动作已失效'
}

function taskCanCreateInProject(task: CodexTaskCard, project?: CodexProjectCard) {
  return taskProvider(task) === 'codex' && Boolean(project?.actionAlias)
}

function requestTaskArchive(task?: CodexTaskCard | CodexTaskCard[], event?: Event) {
  captureHintAnchor(event)
  const targetTasks = task
    ? Array.isArray(task) ? task : [task]
    : archiveCandidates()
  const normalized = targetTasks.filter((candidate) => candidate.canArchive && !taskArchiving(candidate))
  const tasks = targetTasks.length ? normalized : archiveCandidates()
  if (!tasks.length) {
    liveMessage.value = '当前没有可归档的任务'
    return
  }
  const identity = tasks.map(taskArchiveIdentity).sort().join('|')
  const source = tasks.length > 1 ? 'batch-archive' : 'archive-button'
  requestConfirmation(`archive:${identity}`, `归档 ${tasks.length} 个任务`, (operationId) => {
    action('codex.tasks.archive', {
      items: tasks.map((task) => ({ key: task.key, revisionAt: task.revisionAt })),
      operationId,
      source,
      confirmationRecorded: true
    })
    selectedKeys.value = new Set()
  }, source)
}

function requestProjectArchive(project: CodexProjectCard, event?: Event) {
  captureHintAnchor(event)
  if (projectMarker(project).claudeOnly) {
    liveMessage.value = projectMutationBlockedReason(project, '归档')
    return
  }
  if (!project.actionAlias) return
  requestConfirmation(`archive-project:${project.key}`, `归档 ${project.name} 的全部已完成任务`, (operationId) => {
    action('codex.project.archive', {
      key: project.key,
      actionAlias: project.actionAlias,
      operationId,
      source: 'project-archive',
      confirmationRecorded: true
    })
  }, 'project-archive')
}

function requestProjectRemove(project: CodexProjectCard, event?: Event) {
  captureHintAnchor(event)
  const sourceFingerprint = conversations.value?.sourceFingerprint || ''
  if (projectMarker(project).claudeOnly) {
    liveMessage.value = projectMutationBlockedReason(project, '从 Codex 移除')
    return
  }
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

function activateTaskTitle(task: CodexTaskCard, event: MouseEvent) {
  focusedKey.value = `task:${task.key}`
  if (event.ctrlKey || event.metaKey) {
    toggleTaskSelection(task)
    return
  }
  openTask(task)
}

function focusTaskMetadata(task: CodexTaskCard) {
  focusedKey.value = `task:${task.key}`
  focusCurrent()
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

const FOCUS_RETRY_FRAMES = 3

function scheduleFocusRetry(callback: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback)
  else setTimeout(callback, 16)
}

/**
 * 展开是跨进程往返（子窗口请求父 preload 改 bounds，父再回推 state），一个 nextTick 经常
 * 抢在列表渲染之前。以前 querySelector 拿不到元素就无声放弃，焦点留在 document.body，
 * 于是根派发器收不到任何键。这里改成有界重试，超过帧数才放弃。
 */
function focusFocusKey(key: string, remainingFrames = FOCUS_RETRY_FRAMES) {
  const element = document.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)
  if (element) {
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'nearest' })
    return
  }
  if (remainingFrames <= 0) return
  scheduleFocusRetry(() => focusFocusKey(key, remainingFrames - 1))
}

function focusCurrent() {
  const item = focusedItem.value
  if (!item) return
  focusedKey.value = item.key
  void nextTick(() => focusFocusKey(item.key))
}

function moveFocus(direction: -1 | 1) {
  if (!focusItems.value.length) return null
  const currentIndex = focusItems.value.findIndex((item) => item.key === focusedKey.value)
  // 没有游标（findIndex 为 -1）时，↓ 落到第一项、↑ 落到最后一项。
  // 以前这里用 Math.max(0, -1) 把"无游标"折叠成"游标在第 0 项"，导致首次 ↓ 直接跳到第 2 项。
  const nextIndex = currentIndex < 0
    ? (direction === 1 ? 0 : focusItems.value.length - 1)
    : Math.max(0, Math.min(focusItems.value.length - 1, currentIndex + direction))
  const target = focusItems.value[nextIndex]
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

function focusQuickSearch(remainingFrames = FOCUS_RETRY_FRAMES) {
  const input = searchInput.value
  if (input) {
    input.focus({ preventScroll: true })
    return
  }
  if (remainingFrames <= 0) return
  scheduleFocusRetry(() => focusQuickSearch(remainingFrames - 1))
}

function enterQuickMode() {
  quickMode.value = true
  requestExpansion(true)
  if (panel.value) closePanel()
  if (composer.value) cancelComposer()
  if (aliasEditor.value) cancelAlias()
  if (selectedKeys.value.size) clearSelection()
  closeQuickJump()
  closeShiftPreview(true)
  searchText.value = ''
  if (selectedUiTab.value !== 'dynamic') switchComposerTab('dynamic')
  void nextTick(() => focusQuickSearch())
}

function exitQuickMode() {
  quickMode.value = false
}

function openQuickIndex(index: number) {
  const row = quickTaskRows.value[index - 1]
  if (!row) return
  focusedKey.value = row.key
  openTask(row.task, 'local-shortcut')
  exitQuickMode()
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

function executeDrawerAction(index: number, event?: Event) {
  const item = drawerActions.value[index]
  if (!item || item.disabled) {
    if (item?.disabledReason) liveMessage.value = item.disabledReason
    return
  }
  captureHintAnchor(event)
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
  if (composer.value || pendingConfirm.value || panel.value || quickJump.value.open || aliasEditor.value) return true
  const editing = active?.closest('input, textarea, select, [contenteditable="true"]')
  if (!editing) return false
  // 筛选模式下搜索框恒有焦点。若继续把"任意输入有焦点"当作阻断条件，Shift 预览就永远出不来。
  // 只放行会话搜索框；composer、别名编辑器和其它输入继续阻断。
  return !(editing instanceof HTMLElement && editing.dataset.inputRole === 'codex-search')
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

function quickJumpTaskKeyFor(element: HTMLElement) {
  const focusKey = element.dataset.focusKey || ''
  return focusKey.startsWith('task:') ? focusKey : ''
}

function collectQuickJumpTargets(backward = false, mode: 'all' | 'tasks' = 'all'): QuickJumpDomTarget[] {
  const elements = Array.from((rootElement.value || document.body).querySelectorAll<HTMLElement>('[data-quick-jump-target]'))
    .filter((element) => (mode === 'tasks' ? Boolean(quickJumpTaskKeyFor(element)) : true))
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
  quickJump.value = { open: false, mode: 'all', query: '', sourceTargets: [], targets: [], activeTargetId: null }
  const trigger = quickJumpTrigger
  quickJumpTrigger = null
  if (restore) restoreTrigger(trigger)
}

function openQuickJump(backward = false, mode: 'all' | 'tasks' = 'all') {
  if (composer.value || pendingConfirm.value || aliasEditor.value) return false
  closeShiftPreview(true)
  const targets = collectQuickJumpTargets(backward, mode)
  if (!targets.length) return false
  quickJumpTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  quickJump.value = { open: true, mode, query: '', sourceTargets: targets, targets, activeTargetId: targets[0]?.id || null }
  syncQuickJumpActive(true)
  return true
}

function activateQuickJumpTarget() {
  const target = quickJump.value.sourceTargets.find((item) => item.id === quickJump.value.activeTargetId)
  if (!target) return
  window.eypcFloat?.action('codex.quickJump.activate', { source: 'manual-quick-jump' })
  // 专项模式：一个按键直接跳到那条会话，等同于点击它的标题。普通模式仍然只转移高亮。
  if (quickJump.value.mode === 'tasks') {
    const taskKey = quickJumpTaskKeyFor(target.element)
    const matched = focusItems.value.find((item) => item.key === taskKey)
    closeQuickJump()
    if (matched?.kind !== 'task') return
    focusedKey.value = matched.key
    openTask(matched.task, 'manual-quick-jump')
    return
  }
  closeQuickJump()
  target.element.focus({ preventScroll: true })
  const focusKey = target.element.dataset.focusKey
  if (focusKey) {
    const matchedItem = focusItems.value.find((item) => item.key === focusKey)
    const taskItem = matchedItem?.kind === 'task' ? matchedItem : null
    if (taskItem) {
      if (focusedKey.value === focusKey) {
        window.eypcFloat?.action('codex.task.focus', { key: taskItem.task.key, source: 'manual-quick-jump' })
      } else {
        pendingTaskFocusSource = 'manual-quick-jump'
      }
    } else pendingTaskFocusSource = null
    focusedKey.value = focusKey
    return
  }
  target.element.click()
}

function handleQuickJumpKey(event: KeyboardEvent) {
  if (!quickJump.value.open) return false
  const shortcut = shortcutFromEvent(event)
  if (shortcut === 'Escape') {
    if (quickJump.value.query) {
      const result = resolveQuickJumpQuery(quickJump.value.sourceTargets, '')
      quickJump.value = { ...quickJump.value, query: result.query, targets: result.targets, activeTargetId: result.activeTargetId }
      syncQuickJumpActive(true)
    } else {
      closeQuickJump(true)
    }
  }
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
  ArrowLeft: 'codex.tab.prev',
  ArrowRight: 'codex.tab.next',
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
  'Ctrl+Shift+F': 'codex.search.focus',
  'Alt+F': 'codex.quickJump.openTasks',
  'Ctrl+T': 'codex.thread.createFocused',
  'Ctrl+Shift+1': 'codex.action.run.1',
  'Ctrl+Shift+2': 'codex.action.run.2',
  'Ctrl+Shift+3': 'codex.action.run.3',
  'Ctrl+Shift+4': 'codex.action.run.4',
  'Ctrl+Shift+5': 'codex.action.run.5',
  F: 'quickJump.openForward',
  'Shift+F': 'quickJump.openBackward',
  Escape: 'codex.layer.cancel'
}

function floatInputRole(target: HTMLElement, editing: boolean): KeybindingContext['activeInputRole'] {
  if (!editing) return undefined
  if (target.closest('[data-input-role="codex-composer"]')) return 'codex-composer'
  if (target.closest('[data-input-role="codex-search"]')) return 'codex-search'
  return 'other'
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
      codexQuickMode: quickMode.value,
      codexDrawerActive: panel.value?.mode === 'drawer',
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
  if (fallbackCommands[shortcut]) return fallbackCommands[shortcut]
  const digit = /^(Ctrl|Alt)\+([0-9])$/.exec(shortcut)
  if (!digit) return ''
  const slot = Number(digit[2]) === 0 ? 10 : Number(digit[2])
  const drawerOpen = panel.value?.mode === 'drawer'
  if (digit[1] === 'Alt') return drawerOpen ? '' : `codex.task.openIndex.${slot}`
  if (quickMode.value && !drawerOpen) return `codex.quick.open.${slot}`
  return slot === 10 ? '' : `codex.drawer.select.${slot}`
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
    if (quickJump.value.query) {
      const result = resolveQuickJumpQuery(quickJump.value.sourceTargets, '')
      quickJump.value = { ...quickJump.value, query: result.query, targets: result.targets, activeTargetId: result.activeTargetId }
      syncQuickJumpActive(true)
      return
    }
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
  if (quickMode.value) {
    exitQuickMode()
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

/**
 * 会话搜索框允许边打字边导航，和 ports/favorites/mqtt/windows 的搜索框同构。
 * 只对搜索框放行：composer、别名编辑器和其它输入保持原有的完全隔离。
 */
function searchNavigationAllowed(target: HTMLElement, command: string) {
  if (!command || target !== searchInput.value) return false
  return command === 'codex.list.up'
    || command === 'codex.list.down'
    || command === 'codex.task.openFocused'
    || command.startsWith('codex.quick.open.')
    || command.startsWith('codex.task.openIndex.')
}

/**
 * 事件可能直接派发在 window 上（DOM 焦点还没进入子窗口时），此时 target 是 Window 而不是元素。
 * 归一成一个真实元素，让下游的 closest / blur 判定不必各自防御。
 */
function resolveKeyEventTarget(event: KeyboardEvent): HTMLElement {
  if (event.target instanceof HTMLElement) return event.target
  if (document.activeElement instanceof HTMLElement) return document.activeElement
  return document.body
}

function onRootKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  const shortcut = shortcutFromEvent(event)
  const target = resolveKeyEventTarget(event)

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
  if (editing && !searchNavigationAllowed(target, command)) {
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
  else if (command === 'codex.tab.prev' || command === 'codex.tab.next') {
    action(command)
    focusSelectedComposerTab()
  }
  else if (command === 'codex.float.toggle') action('codex.float.toggle', { source: 'in-app-shortcut' })
  else if (command === 'quickJump.openForward' || command === 'codex.quickJump.openForward') openQuickJump(false)
  else if (command === 'quickJump.openBackward') openQuickJump(true)
  else if (command === 'codex.quickJump.openTasks') openQuickJump(false, 'tasks')
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
  else if (command === 'codex.thread.createFocused') openComposer()
  else if (command === 'codex.quick.activate') enterQuickMode()
  else if (command.startsWith('codex.quick.open.') || command.startsWith('codex.task.openIndex.')) openQuickIndex(Number(command.split('.').at(-1)))
  else if (command.startsWith('codex.drawer.select.')) executeDrawerAction(Number(command.split('.').at(-1)) - 1)
  else if (command.startsWith('codex.action.run.')) action(command)
  else if (command === 'codex.layer.cancel') {
    cancelTopLayer()
  }
}

function eventInsideRoot(event: KeyboardEvent) {
  const target = event.target
  return target instanceof Node && Boolean(rootElement.value?.contains(target))
}

/** 返回 true 表示事件已被 window 层完全消费，不再继续派发。 */
function handleWindowLevelKeydown(event: KeyboardEvent) {
  if (shortcutFromEvent(event) === 'Shift+Escape') {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    returnToPreviousFocus()
    return true
  }
  if (
    event.key === 'Escape'
    && (panel.value || aliasEditor.value || composer.value || pendingConfirm.value || quickJump.value.open || shiftPreview.value || selectedKeys.value.size || Boolean(searchText.value) || quickMode.value)
  ) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    cancelTopLayer()
    return true
  }
  if (event.key === 'Shift') {
    shiftHeld.value = true
    if (event.ctrlKey || event.metaKey || event.altKey) shiftPreviewSuppressed.value = true
    updateShiftPreview()
    return true
  }
  if (!shiftHeld.value || !event.shiftKey) return false
  if (event.ctrlKey || event.metaKey || event.altKey) {
    shiftPreviewSuppressed.value = true
    closeShiftPreview()
    return false
  }
  return handleShiftPreviewArrow(event)
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (handleWindowLevelKeydown(event)) return
  // 宿主刚显示子窗口、DOM 焦点仍停在 document.body 时，事件不会冒泡到根元素，
  // 根派发器整个不会执行。这里补一次派发，让"焦点没落进列表"不再等于"快捷键全部失灵"。
  // 只在事件确实落在根之外时补派发，避免和根/子层的 @keydown.stop 隔离打架。
  if (!eventInsideRoot(event)) onRootKeydown(event)
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
  drag = null
  resize = null
  window.eypcFloat?.cancelInteraction?.()
  hoverInside = false
  focusWithin = false
  shiftHeld.value = false
  shiftPreviewSuppressed.value = false
  clearConfirm()
  clearActionHint()
  clearCompactCounterHint()
  closeShiftPreview()
  scheduleCollapse()
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
  const compactTarget = target.closest<HTMLElement>('.float-compact')
  if (!compactTarget && !target.closest('.float-drag-handle')) return
  if (compactTarget && !isCompactDragZone(event, compactTarget)) return
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
  if (isCompactExpansionZone(event, surface)) requestExpansion(true)
}

function scheduleCollapse() {
  if (collapseTimer) clearTimeout(collapseTimer)
  if (focusWithin || resize || composer.value || panel.value || aliasEditor.value || quickJump.value.open || shiftPreview.value) return
  collapseTimer = setTimeout(() => {
    if (!hoverInside && !focusWithin && !resize && !composer.value && !panel.value && !aliasEditor.value && !quickJump.value.open && !shiftPreview.value) requestExpansion(false)
  }, FLOAT_COLLAPSE_DELAY_MS)
}

function onMouseLeave() {
  hoverInside = false
  hoveredTaskKey.value = ''
  clearActionHint()
  clearCompactCounterHint()
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

function measureSearchLayout() {
  const field = searchField.value
  if (!field) {
    searchPlaceholderHidden.value = false
    searchMetaPad.value = 0
    return
  }
  const metaWidth = searchMetaEl.value?.offsetWidth || 0
  searchMetaPad.value = metaWidth > 0 ? metaWidth + 8 : 0
  if (searchText.value.trim()) {
    searchPlaceholderHidden.value = false
    return
  }
  searchPlaceholderHidden.value = companionSearchHintOverlaps(
    field.clientWidth,
    searchMeasure.value?.offsetWidth || 0,
    metaWidth
  )
}

function captureHintAnchor(event?: Event) {
  if (event?.currentTarget instanceof HTMLElement) lastHintAnchor = event.currentTarget
}

function resolveHintAnchor(): HTMLElement | null {
  if (lastHintAnchor?.isConnected) return lastHintAnchor
  const root = rootElement.value
  if (!root) return null
  const active = document.activeElement
  if (active instanceof HTMLElement && root.contains(active) && active.matches('button, [role="button"]')) {
    return active
  }
  const focusKey = focusedKey.value
  if (focusKey) {
    const focusedArchive = root.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"] .action-archive`)
    if (focusedArchive) return focusedArchive
  }
  return root.querySelector<HTMLElement>(
    '.action-archive.confirming, .action-remove.confirming, .float-batch-toolbar button.confirming, [data-drawer-action-id="task-archive"], [data-drawer-action-id="project-archive"], [data-drawer-action-id="batch-archive"], [data-drawer-action-id="project-remove"], .float-expanded-card'
  )
}

function estimateHintSize(label: string) {
  return { width: Math.min(240, Math.max(72, label.length * 7 + 16)), height: 28 }
}

function showActionHint(target: HTMLElement | null, label: string, options?: { delay?: number; sticky?: boolean }) {
  if (actionHintTimer) {
    clearTimeout(actionHintTimer)
    actionHintTimer = null
  }
  if (!label) return
  const apply = () => {
    const anchor = target?.isConnected ? target : resolveHintAnchor()
    if (!anchor) return
    const card = rootElement.value?.querySelector('.float-expanded-card') || rootElement.value
    const cardRect = card?.getBoundingClientRect()
    const bounds = anchor.getBoundingClientRect()
    const estimated = estimateHintSize(label)
    const placed = placeFloatActionHint({
      anchorLeft: bounds.left,
      anchorTop: bounds.top,
      anchorWidth: bounds.width,
      anchorHeight: bounds.height,
      cardLeft: cardRect?.left ?? 0,
      cardTop: cardRect?.top ?? 0,
      cardWidth: cardRect?.width ?? 0,
      cardHeight: cardRect?.height ?? 0,
      hintWidth: estimated.width,
      hintHeight: estimated.height
    })
    actionHint.value = { label, ...placed, sticky: options?.sticky }
    void nextTick(() => {
      const el = actionHintEl.value
      if (!el || !anchor.isConnected) return
      const measured = el.getBoundingClientRect()
      if (!(measured.width > 0) || !(measured.height > 0)) return
      const refined = placeFloatActionHint({
        anchorLeft: bounds.left,
        anchorTop: bounds.top,
        anchorWidth: bounds.width,
        anchorHeight: bounds.height,
        cardLeft: cardRect?.left ?? 0,
        cardTop: cardRect?.top ?? 0,
        cardWidth: cardRect?.width ?? 0,
        cardHeight: cardRect?.height ?? 0,
        hintWidth: measured.width,
        hintHeight: measured.height
      })
      actionHint.value = { label, ...refined, sticky: options?.sticky }
    })
  }
  if (options?.delay) {
    actionHintTimer = setTimeout(apply, options.delay)
    return
  }
  apply()
}

function clearActionHint(force: boolean | Event = false) {
  if (actionHint.value?.sticky && force !== true) return
  if (actionHintTimer) clearTimeout(actionHintTimer)
  actionHintTimer = null
  actionHint.value = null
}

function queueActionHint(event: Event, label: string) {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!target || !label) return
  if (actionHint.value?.sticky) return
  showActionHint(target, label, { delay: 200 })
}

function taskStateLabel(task: CodexTaskCard) {
  const label = task.activityState === 'waiting-input'
    ? '等待输入'
    : task.activityState === 'waiting-approval'
      ? '等待审批'
      : task.claudePhase === 'unknown'
        ? '状态未知'
        : task.bucket === 'stopped'
          ? '待继续'
          : task.bucket === 'completed-unread'
            ? '已完成 · 未读'
            : task.bucket === 'completed'
              ? '已完成'
              : '进行中'
  return task.canonicalFreshness === 'verifying' ? `${label} · 核验中` : label
}

function taskIcon(task: CodexTaskCard) {
  if (task.isHidden) return EyeOff
  if (task.claudePhase === 'unknown') return CircleHelp
  if (task.bucket === 'stopped') return CircleStop
  if (task.bucket === 'completed' || task.bucket === 'completed-unread') return Eye
  if (task.activityState === 'waiting-input') return MessageSquareText
  if (task.activityState === 'waiting-approval') return ShieldCheck
  return CirclePlay
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

watch(searchText, () => {
  clearConfirm()
  closeQuickJump()
  closeShiftPreview(true)
}, { flush: 'post' })

watch([searchField, searchMetaText, searchPlaceholder, searchText], () => {
  searchLayoutObserver?.disconnect()
  searchLayoutObserver = null
  const field = searchField.value
  if (field && typeof ResizeObserver !== 'undefined') {
    searchLayoutObserver = new ResizeObserver(() => measureSearchLayout())
    searchLayoutObserver.observe(field)
  }
  void nextTick(measureSearchLayout)
}, { flush: 'post' })

// 列表非空即有键盘游标。以前 focusedItem 用 `|| focusItems[0]` 做隐式回退，于是"看到的高亮"
// 和"键盘游标"是两个东西：focusedKey 为空时界面照样高亮首行，但 moveFocus 从 -1 起算。
// 这里把两者合成同一个真相，immediate 保证首次挂载就成立。
// 必须注册在 renderRows watcher 之前，否则同一轮里面板刷新会读到还没补种的游标。
watch(focusItems, (items) => {
  if (!items.some((item) => item.key === focusedKey.value)) focusedKey.value = items[0]?.key || ''
}, { immediate: true, flush: 'post' })

watch(renderRows, () => {
  const visible = visibleTaskKeys.value
  selectedKeys.value = new Set([...selectedKeys.value].filter((key) => visible.has(key)))
  // 游标补种由上方 focusItems 的专用 watcher 单独拥有，这里不再重复。
  if (panel.value) {
    const currentPanel = panel.value
    const refreshedItem = focusItems.value.find((item) => item.key === currentPanel.item.key)
    if (refreshedItem) panel.value = { ...currentPanel, item: refreshedItem }
    else closePanel()
  }
  if (!confirmationMatchesCurrentState()) clearConfirm('expired')
  closeQuickJump()
  closeShiftPreview(true)
}, { flush: 'post' })

watch(() => `${selectedTasks.value.map((task) => task.key).join('|')}::${focusedKey.value}`, scheduleBatchPlacement, { flush: 'post' })

watch(() => {
  const item = focusedItem.value
  return item?.kind === 'task' ? `${item.task.provider || 'codex'}:${item.task.key}` : ''
}, () => {
  const item = focusedItem.value
  const source = pendingTaskFocusSource || 'automatic-focus'
  pendingTaskFocusSource = null
  window.eypcFloat?.action('codex.task.focus', item?.kind === 'task'
    ? { key: item.task.key, source }
    : { key: '', source })
}, { flush: 'post', immediate: true })

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
  const expectation = {
    hostAssetId: __EYPC_HOST_ASSET_ID__,
    rendererAssetId: __EYPC_RENDERER_ASSET_ID__,
    kernelRevision: __EYPC_COMPANION_KERNEL_REVISION__,
    taskPackageRevision: __EYPC_COMPANION_TASK_PACKAGE_REVISION__
  }
  try {
    floatRuntimeIdentity.value = window.eypcFloat?.runtimeIdentity?.revision === __EYPC_RUNTIME_IDENTITY_REVISION__
      ? window.eypcFloat.runtimeIdentity.handshake(expectation)
      : {
          revision: 'runtime-identity-v1',
          status: 'reload-required',
          expected: expectation,
          actual: { hostAssetId: '', rendererAssetId: '', kernelRevision: '', taskPackageRevision: '' },
          kernelRevision: '',
          taskPackageRevision: '',
          message: 'Float Preload 版本过旧，请重新打开悬浮卡片',
          errorCode: 'identity-missing'
        }
  } catch {
    floatRuntimeIdentity.value = {
      revision: 'runtime-identity-v1',
      status: 'reload-required',
      expected: expectation,
      actual: { hostAssetId: '', rendererAssetId: '', kernelRevision: '', taskPackageRevision: '' },
      kernelRevision: '',
      taskPackageRevision: '',
      message: 'Float 运行身份握手失败，请重新打开悬浮卡片',
      errorCode: 'identity-handshake-failed'
    }
  }
  const applySnapshot = (value: CodexFloatSnapshotV1 | null) => {
    if (!value) return false
    const baseRevision = value.baseRevision || 0
    const taskRevision = value.companionTaskPackage?.packageRevision
      || (baseRevision === 0 ? value.companion?.revision || 0 : 0)
    if (taskRevision > 0 && floatRuntimeIdentity.value?.status !== 'host-loaded') {
      window.eypcFloat?.ackTaskPackage?.('rejected', 'identity-mismatch')
      return false
    }
    const baseOlder = appliedBaseRevision.value > 0
      && (baseRevision === 0 || baseRevision < appliedBaseRevision.value)
    const taskOlder = taskRevision > 0 && taskRevision < appliedCompanionRevision.value
    if (taskOlder) {
      window.eypcFloat?.ackTaskPackage?.('rejected', 'older-revision')
    }
    const baseChanged = !baseOlder && (baseRevision === 0
      ? appliedBaseRevision.value === 0
      : baseRevision > appliedBaseRevision.value)
    const taskChanged = !taskOlder && taskRevision > appliedCompanionRevision.value
    if (!baseChanged && !taskChanged) {
      if (taskRevision > 0 && taskRevision === appliedCompanionRevision.value) {
        window.eypcFloat?.ackTaskPackage?.('applied')
      }
      return false
    }
    let nextValue = value
    if (!baseChanged && snapshot.value) {
      nextValue = taskChanged && value.companionTaskPackage
        ? { ...snapshot.value, companionTaskPackage: value.companionTaskPackage }
        : snapshot.value
    } else if ((taskOlder || taskRevision === 0) && snapshot.value?.companionTaskPackage) {
      nextValue = { ...value, companionTaskPackage: snapshot.value.companionTaskPackage }
    }
    if (baseRevision > 0 && baseChanged) appliedBaseRevision.value = baseRevision
    if (taskChanged) appliedCompanionRevision.value = taskRevision
    snapshot.value = nextValue
    if (taskRevision > 0 && !taskOlder) {
      void nextTick(() => window.eypcFloat?.ackTaskPackage?.('applied'))
    }
    return true
  }
  applySnapshot(window.eypcFloat?.getSnapshot() || null)
  floatState.value = window.eypcFloat?.getState() || floatState.value
  expanded.value = floatState.value.expanded
  desiredExpanded = expanded.value
  stopSnapshot = window.eypcFloat?.onSnapshot((value) => { applySnapshot(value) }) || null
  stopState = window.eypcFloat?.onState((value) => {
    floatState.value = value
    expanded.value = value.expanded
    desiredExpanded = value.expanded
    if (!value.expanded) {
      closeShiftPreview(true)
      closeQuickJump()
      // 快速筛选是展开列表上的模式；卡片收起后它没有载体，编号也不应留在紧凑面上。
      exitQuickMode()
    }
    if (!value.expanded && restoreCompactFocus) {
      restoreCompactFocus = false
      void nextTick(() => document.querySelector<HTMLElement>('.float-compact')?.focus())
    }
  }) || null
  stopActivate = window.eypcFloat?.onActivate?.((payload) => {
    if (payload.command === 'quick') {
      enterQuickMode()
      return
    }
    requestExpansion(true)
    void nextTick(() => payload.command === 'new-thread' ? openComposer() : focusCurrent())
  }) || null
  window.addEventListener('keydown', onWindowKeydown, true)
  window.addEventListener('keyup', onWindowKeyup, true)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.eypcFloat?.cancelInteraction?.()
  if (collapseTimer) clearTimeout(collapseTimer)
  clearActionHint()
  clearCompactCounterHint()
  closeShiftPreview()
  if (composer.value) {
    composer.value.prompt = ''
    clearComposerImage(composer.value)
  }
  composer.value = null
  closeQuickJump()
  clearConfirm()
  clearPlanExecuteConfirmation()
  taskScrollResizeObserver?.disconnect()
  searchLayoutObserver?.disconnect()
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('keyup', onWindowKeyup, true)
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
    :data-companion-revision="appliedCompanionRevision || undefined"
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
    <div
      v-if="runtimeReloadRequired"
      class="float-runtime-reload"
      role="alert"
      :title="runtimeReloadMessage"
      @pointerdown.stop
      @click.stop
    >
      <strong>需要重载</strong>
      <span v-if="expanded">{{ runtimeReloadMessage }}</span>
    </div>
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
          :label="`${compact.ariaLabel}${companionWaterBall.ariaSuffix}`"
          :appearance="settings?.waterAppearance || fallbackWaterAppearance"
          :colors="settings?.colors || fallbackColors"
          :percent-override="companionWaterBall.percentOverride"
          :percent-provider-label="companionWaterBall.percentProviderLabel"
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
        class="float-counter companion-counter-geometry input"
        :aria-label="compactCounterHint('input')"
        @pointerenter.stop="queueCompactCounterHint($event, 'input')"
        @pointermove.stop
        @pointerleave.stop="clearCompactCounterHint"
        @focus="queueCompactCounterHint($event, 'input')"
        @blur="clearCompactCounterHint"
        @click.stop="openCompactStatus('input')"
      >{{ codexBadgeText(compactCounts.input) }}</button>
      <button v-if="compactCounts.active" type="button" class="float-counter companion-counter-geometry active" :aria-label="compactCounterHint('active')" @pointerenter.stop="queueCompactCounterHint($event, 'active')" @pointermove.stop @pointerleave.stop="clearCompactCounterHint" @focus="queueCompactCounterHint($event, 'active')" @blur="clearCompactCounterHint" @click.stop="openCompactStatus('active')">{{ codexBadgeText(compactCounts.active) }}</button>
      <button v-if="compactCounts.unread" type="button" class="float-counter companion-counter-geometry unread" :aria-label="compactCounterHint('unread')" @pointerenter.stop="queueCompactCounterHint($event, 'unread')" @pointermove.stop @pointerleave.stop="clearCompactCounterHint" @focus="queueCompactCounterHint($event, 'unread')" @blur="clearCompactCounterHint" @click.stop="openCompactStatus('unread')">{{ codexBadgeText(compactCounts.unread) }}</button>
      <div v-if="compactCounterHintText" class="float-compact-counter-hint" role="tooltip">{{ compactCounterHintText }}</div>
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

      <div
        v-if="selectedUiTab === 'projects'"
        class="float-project-provider-tabs"
        role="tablist"
        aria-label="按项目归属筛选"
      >
        <button
          v-for="(filter, index) in projectFilters"
          :key="filter.id"
          type="button"
          role="tab"
          :aria-selected="projectProviderFilter === filter.id"
          aria-controls="project-task-list"
          :tabindex="projectProviderFilter === filter.id ? 0 : -1"
          :class="{ active: projectProviderFilter === filter.id }"
          @click="setProjectProviderFilter(filter.id)"
          @keydown="onProjectFilterKeydown($event, index)"
        >{{ filter.label }}</button>
        <span aria-live="polite">{{ projectCount }} 项目 · {{ projectTaskCount }} 任务</span>
      </div>

      <div class="float-drag-handle" aria-hidden="true" />

      <label class="float-search">
        <button
          v-if="searchIconHint"
          type="button"
          class="float-search-glyph"
          :class="{ alert: Boolean(searchAlertText) }"
          :aria-label="searchIconHint"
          @click.stop
          @pointerenter="queueActionHint($event, searchIconHint)"
          @pointerleave="clearActionHint"
          @focus="queueActionHint($event, searchIconHint)"
          @blur="clearActionHint"
        >
          <template v-if="searchAlertText">!</template>
          <Search v-else :size="14" aria-hidden="true" />
        </button>
        <span v-else class="float-search-glyph" aria-hidden="true"><Search :size="14" /></span>
        <span ref="searchField" class="float-search-field">
          <span ref="searchMeasure" class="float-search-measure" aria-hidden="true">{{ searchPlaceholder }}</span>
          <input
            ref="searchInput"
            v-model="searchText"
            type="search"
            data-input-role="codex-search"
            :placeholder="searchPlaceholderHidden ? '' : searchPlaceholder"
            :style="searchMetaPad ? { paddingRight: `${searchMetaPad}px` } : undefined"
            aria-label="搜索当前 Codex 页签"
            data-quick-jump-target
            data-quick-jump-label="搜索当前 Codex 页签"
          />
          <span v-if="searchMetaText" ref="searchMetaEl" class="float-search-meta">{{ searchMetaText }}</span>
        </span>
        <button v-if="searchText" type="button" class="float-search-clear" aria-label="清空搜索" data-quick-jump-target @click.stop="searchText = ''"><X :size="13" /></button>
        <span class="sr-only" role="status" aria-live="polite">{{ searchLiveText }}</span>
      </label>

      <!-- One row for every enabled provider. The full title and the reset time
           live in the shared 200ms child hint and in each chip's accessible name,
           so the row itself stays a single line of readings. -->
      <section class="float-quota-text" aria-label="实际额度窗口">
        <div
          v-for="(group, groupIndex) in quotaStrip.groups"
          :key="group.provider"
          class="float-quota-group"
          :class="[`provider-${group.provider}`, { divided: groupIndex > 0 }]"
        >
          <h3 v-if="group.caption" class="float-quota-provider">{{ group.caption }}</h3>
          <div
            v-for="chip in group.chips"
            :key="chip.key"
            class="float-quota-chip"
            :class="{ spark: chip.spark, 'is-stale': chip.stale === true, 'is-warning': chip.tone === 'warning', 'is-danger': chip.tone === 'danger' }"
            :tabindex="chip.provider === 'claude' ? 0 : undefined"
            :aria-label="chip.provider === 'claude' ? quotaChipAria(chip) : undefined"
            @pointerenter="queueActionHint($event, quotaChipHint(chip))"
            @pointerleave="clearActionHint"
            @focus="queueActionHint($event, quotaChipHint(chip))"
            @blur="clearActionHint"
          >
            <span class="sr-only">{{ quotaChipAria(chip) }}</span>
            <span aria-hidden="true">{{ chip.shortLabel }}</span><strong aria-hidden="true">{{ chip.remainingPercent }}%</strong>
          </div>
          <p v-if="group.emptyReason">{{ group.emptyReason }}</p>
        </div>
      </section>

      <form v-if="aliasEditor" class="float-inline-editor" @submit.prevent="saveAlias">
        <label><span>本地别名</span><input ref="aliasInput" v-model="aliasEditor.value" maxlength="120" :placeholder="aliasEditor.originalName" /></label>
        <button type="submit">保存</button><button type="button" @click="cancelAlias">取消</button>
      </form>

      <section v-if="settings?.conversationInboxEnabled" class="float-task-inbox">
        <div class="float-task-list-stage" :class="{ 'selection-mode': selectedKeys.size > 0 }">
          <div
            ref="taskScroll"
            id="project-task-list"
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
              :class="[row.marker.className, { highlighted: focusedKey === row.key, 'hidden-project': row.hiddenProject }]"
              role="treeitem"
              :aria-expanded="row.hiddenProject ? undefined : !isProjectCollapsed(row.project)"
              :aria-label="`${row.project.name}，${row.marker.label}，${row.project.tasks.length} 个窗口内任务${row.hiddenProject ? '，项目分组已隐藏' : ''}`"
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
                <span><strong>{{ row.project.name }}</strong><i class="project-provider-marker" :class="row.marker.className">{{ row.marker.label }}</i><small v-if="row.hiddenProject">项目分组已隐藏 · 任务仍在其他页签</small><small v-else>{{ row.project.tasks.length ? `${row.project.tasks.length} 个最近任务` : `最近 ${settings?.timeWindowDays || 30} 天无会话` }}</small></span>
              </button>
              <div class="project-inline-actions" role="toolbar" :aria-label="`${row.project.name} 项目操作`">
                <button type="button" class="inline-character-button action-pin" :data-pin-source="pinSourceValue(row)" :aria-disabled="pinIsReadOnly(row)" :aria-pressed="Boolean(row.project.pinSource)" :aria-label="`${row.project.name}，${pinSourceHint(row)}`" data-quick-jump-target :data-quick-jump-label="pinSourceHint(row)" @pointerenter="queueActionHint($event, pinSourceHint(row))" @pointerleave="clearActionHint" @focus="queueActionHint($event, pinSourceHint(row))" @blur="clearActionHint" @click.stop="focusedKey = row.key; togglePin(row)">顶</button>
                <button type="button" class="inline-character-button action-remove" :class="{ confirming: projectRemoveConfirming(row.project) }" :disabled="row.project.kind === 'chats' || row.marker.claudeOnly || !row.project.actionAlias || !conversations?.sourceFingerprint" :title="row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '从 Codex 移除') : '从 Codex 侧栏移除；需先完全退出 Codex'" :aria-label="row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '从 Codex 移除') : projectRemoveConfirming(row.project) ? `确认从 Codex 侧栏移除 ${row.project.name}` : `从 Codex 侧栏移除 ${row.project.name}`" data-confirm-slot data-quick-jump-target :data-quick-jump-label="row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '从 Codex 移除') : `从 Codex 移除 ${row.project.name}`" @pointerenter="queueActionHint($event, row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '从 Codex 移除') : projectRemoveConfirming(row.project) ? '再次点击确认真实移除' : '从 Codex 侧栏移除；需先完全退出 Codex')" @pointerleave="clearActionHint" @focus="queueActionHint($event, row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '从 Codex 移除') : projectRemoveConfirming(row.project) ? '再次点击确认真实移除' : '从 Codex 侧栏移除；需先完全退出 Codex')" @blur="clearActionHint" @click.stop="focusedKey = row.key; requestProjectRemove(row.project, $event)">{{ projectRemoveConfirming(row.project) ? '确' : '移' }}</button>
                <button type="button" class="inline-character-button action-hide" :disabled="row.project.kind === 'chats' || row.marker.claudeOnly" :aria-pressed="isProjectHidden(row.project)" :aria-label="isProjectHidden(row.project) ? `恢复项目分组 ${row.project.name}` : `隐藏项目分组 ${row.project.name}`" data-quick-jump-target :data-quick-jump-label="isProjectHidden(row.project) ? `恢复项目 ${row.project.name}` : `隐藏项目 ${row.project.name}`" @pointerenter="queueActionHint($event, row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '项目隐藏') : isProjectHidden(row.project) ? '恢复项目页分组' : '仅隐藏项目页分组；任务仍保留')" @pointerleave="clearActionHint" @focus="queueActionHint($event, row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '项目隐藏') : isProjectHidden(row.project) ? '恢复项目页分组' : '仅隐藏项目页分组；任务仍保留')" @blur="clearActionHint" @click.stop="focusedKey = row.key; toggleProjectHidden(row.project)">{{ isProjectHidden(row.project) ? '显' : '隐' }}</button>
                <button type="button" class="inline-character-button action-create" :disabled="row.marker.claudeOnly || !row.project.actionAlias" :aria-label="row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '新建会话') : row.project.actionAlias ? `在 ${row.project.name} 新建会话` : '项目动作已失效'" data-quick-jump-target :data-quick-jump-label="row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '新建会话') : `在 ${row.project.name} 新建会话`" @pointerenter="queueActionHint($event, row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '新建会话') : '在该项目新建会话')" @pointerleave="clearActionHint" @focus="queueActionHint($event, row.marker.claudeOnly ? projectActionBlockedReason(row.marker, '新建会话') : '在该项目新建会话')" @blur="clearActionHint" @click.stop="focusedKey = row.key; openComposer(row.project)">+</button>
              </div>
            </div>

            <div
              v-else-if="row.kind === 'task'"
              class="float-task-row"
              :class="[`task-${row.task.activityState}`, `bucket-${row.task.bucket}`, `provider-${row.marker.provider}`, { nested: row.nested, selected: selectedKeys.has(row.task.key), hidden: row.task.isHidden, highlighted: focusedKey === row.key, archiving: taskArchiving(row.task) }]"
              role="option"
              :aria-selected="selectedKeys.has(row.task.key)"
              :aria-label="`${taskDisplayLabel(row.task)}，${row.marker.tooltip}，${row.task.projectName}，${taskStateLabel(row.task)}${quickIndexHint(row.key)}`"
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
              <!-- 绝对定位 + pointer-events:none：编号是瞬时提示，不得改变行高、列表顶边或行坐标。
                   完整语义已在行的 aria-label 里，所以这里对读屏隐藏。 -->
              <span v-if="quickIndexDigit(row.key)" class="task-quick-index" aria-hidden="true">{{ quickIndexDigit(row.key) }}</span>
              <div
                class="task-open"
                @click.stop="activateTaskCore(row.task, $event)"
              >
                <div class="task-copy">
                  <button
                    type="button"
                    class="task-title-button"
                    :aria-label="`打开会话 ${taskDisplayLabel(row.task)}`"
                    @click.stop="activateTaskTitle(row.task, $event)"
                  >{{ taskDisplayLabel(row.task) }}</button>
                  <div class="task-meta-line">
                    <span class="task-provider-marker" :class="`provider-${row.marker.provider}`">{{ row.marker.label }}</span>
                    <button
                      type="button"
                      class="task-meta-button"
                      :aria-label="`聚焦会话 ${taskDisplayLabel(row.task)}，以接收会话快捷键`"
                      @click.stop="focusTaskMetadata(row.task)"
                    >{{ row.task.projectName }} · {{ taskStateLabel(row.task) }} · {{ formatTaskTime(row.task.lastQuestionAt) }}</button>
                  </div>
                </div>
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
                    :aria-label="`${taskSecondaryActionHint(row.task)} ${taskDisplayLabel(row.task)}`"
                    data-quick-jump-target
                    :data-quick-jump-label="`${taskSecondaryActionHint(row.task)} ${taskDisplayLabel(row.task)}`"
                    :disabled="taskSecondaryActionDisabled(row.task)"
                    @pointerenter="queueActionHint($event, taskSecondaryActionHint(row.task))"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, taskSecondaryActionHint(row.task))"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; runTaskSecondaryAction(row.task)"
                >
                    {{ taskSecondaryActionLabel(row.task) }}
                  </button>
                <button
                  type="button"
                  class="inline-character-button action-archive"
                    :class="{ confirming: taskArchiveConfirming(row.task), archiving: taskArchiving(row.task) }"
                    :aria-label="taskArchiving(row.task) ? `正在归档 ${taskDisplayLabel(row.task)}` : taskArchiveConfirming(row.task) ? `确认归档 ${taskDisplayLabel(row.task)}` : `归档 ${taskDisplayLabel(row.task)}`"
                    data-confirm-slot
                    data-quick-jump-target
                    :data-quick-jump-label="`归档 ${taskDisplayLabel(row.task)}`"
                    :disabled="taskArchiving(row.task)"
                    :aria-disabled="!row.task.canArchive || taskArchiving(row.task)"
                    @pointerenter="queueActionHint($event, taskArchiving(row.task) ? '正在归档' : taskArchiveConfirming(row.task) ? '再次点击确认真实归档' : row.task.canArchive ? '真实归档会话' : taskArchiveBlockedReason(row.task))"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, taskArchiving(row.task) ? '正在归档' : taskArchiveConfirming(row.task) ? '再次点击确认真实归档' : row.task.canArchive ? '真实归档会话' : taskArchiveBlockedReason(row.task))"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; requestTaskArchive(row.task, $event)"
                >
                    {{ taskArchiving(row.task) ? '中' : taskArchiveConfirming(row.task) ? '确' : '归' }}
                  </button>
                <button
                  type="button"
                  class="inline-character-button action-create"
                    :class="{ confirming: row.task.planReady && planExecuteConfirming(row.task) }"
                    :aria-label="row.task.planReady ? (planExecuteConfirming(row.task) ? `确认执行 ${taskDisplayLabel(row.task)} 的原 Plan` : `执行 ${taskDisplayLabel(row.task)} 的原 Plan`) : taskCanCreateInProject(row.task, taskProject(row.task)) ? `在 ${row.task.projectName} 新建会话` : taskProjectActionBlockedReason(row.task, taskProject(row.task))"
                    :title="row.task.planReady ? planActionBlockedReason(row.task, '执行') : taskCanCreateInProject(row.task, taskProject(row.task)) ? `在 ${row.task.projectName} 新建会话` : taskProjectActionBlockedReason(row.task, taskProject(row.task))"
                    data-quick-jump-target
                    :data-quick-jump-label="row.task.planReady ? planActionBlockedReason(row.task, '执行') : taskCanCreateInProject(row.task, taskProject(row.task)) ? `在 ${row.task.projectName} 新建会话` : taskProjectActionBlockedReason(row.task, taskProject(row.task))"
                    :disabled="row.task.planReady ? row.task.companionCapabilities?.executePlan !== true : !taskCanCreateInProject(row.task, taskProject(row.task))"
                    @pointerenter="queueActionHint($event, row.task.planReady ? (planExecuteConfirming(row.task) ? '再次点击确认执行原 Plan' : planActionBlockedReason(row.task, '执行')) : taskCanCreateInProject(row.task, taskProject(row.task)) ? '在所属项目新建会话' : taskProjectActionBlockedReason(row.task, taskProject(row.task)))"
                  @pointerleave="clearActionHint"
                  @focus="queueActionHint($event, row.task.planReady ? (planExecuteConfirming(row.task) ? '再次点击确认执行原 Plan' : planActionBlockedReason(row.task, '执行')) : taskCanCreateInProject(row.task, taskProject(row.task)) ? '在所属项目新建会话' : taskProjectActionBlockedReason(row.task, taskProject(row.task)))"
                  @blur="clearActionHint"
                  @click.stop="focusedKey = row.key; row.task.planReady ? requestPlanExecute(row.task) : taskProject(row.task) && openComposer(taskProject(row.task)!)"
                >{{ row.task.planReady ? (planExecuteConfirming(row.task) ? '确' : '执') : '+' }}</button>
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

          <div v-if="selectedKeys.size" class="float-selection-mode-bar" role="status" aria-live="polite">
            <strong>选择模式</strong>
            <span>已选 {{ selectedKeys.size }} 项</span>
            <kbd>Esc 退出</kbd>
          </div>

          <div v-if="showBatchToolbar" class="float-batch-toolbar" :class="batchPlacement" role="toolbar" :aria-label="`已选择 ${selectedTasks.length} 个任务的批量操作`">
            <strong>已选 {{ selectedTasks.length }}</strong>
            <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id?.startsWith('archive:') }" aria-label="归档当前多选任务；仅归档通过真实状态核验的任务" data-confirm-slot data-quick-jump-target @click.stop="requestTaskArchive(undefined, $event)"><span aria-hidden="true">{{ pendingConfirm?.id?.startsWith('archive:') ? '确' : '归' }}</span></button>
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
            @click="executeDrawerAction(index, $event)"
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
              @paste="onComposerPaste"
            />
          </label>

          <section
            class="composer-image-field"
            :class="{ attached: composer.image }"
            aria-label="参考图片"
            @dragenter.prevent
            @dragover.prevent
            @drop="onComposerImageDrop"
          >
            <input ref="composerImageInput" type="file" accept="image/png,image/jpeg,image/webp" :disabled="composer.submitting" @change="onComposerImageChange" />
            <template v-if="composer.image">
              <img :src="composer.image.previewUrl" alt="待手动粘贴到 Codex 的参考图片预览" />
              <span><strong>{{ composer.image.file.name || '剪贴板图片' }}</strong><small>将打开空白 Codex 会话；文字会复制到剪贴板，请手动粘贴此图并选择模型。</small></span>
              <button type="button" :disabled="composer.submitting" aria-label="移除参考图片" @click="clearComposerImage()"><Trash2 :size="14" aria-hidden="true" /></button>
            </template>
            <template v-else>
              <Upload :size="15" aria-hidden="true" />
              <span><strong>添加参考图片</strong><small>选择、拖放或在提示词框粘贴 PNG / JPEG / WebP（最大 20MB）</small></span>
            </template>
          </section>
          <p v-if="composer.image" class="composer-stale"><Clipboard :size="12" aria-hidden="true" /> 当前 App Server 未声明图片输入能力：不会创建空线程；将复制文字并打开 Codex 空白会话。</p>

          <div v-if="composer.error" class="composer-error" role="alert" aria-live="assertive">
            <strong>{{ composer.error }}</strong>
            <small v-if="composer.errorCode">错误代码：{{ composer.errorCode }}</small>
          </div>

          <footer>
            <button type="button" class="composer-secondary" :disabled="composer.submitting" @click="cancelComposer">取消</button>
            <button v-if="composer.manualOnly" type="button" class="composer-secondary" :disabled="composer.submitting" @click="openBlankFromComposer">打开 Codex 空白页</button>
            <button v-if="composer.reopenAlias" type="button" class="composer-primary" :disabled="composer.submitting" @click="retryOpenComposerThread">重试打开</button>
            <button v-if="!composerHasContent" type="button" class="composer-secondary" :disabled="composer.submitting || !composer.retryAllowed" @click="submitComposer('create-empty')">仅创建空会话</button>
            <button type="button" class="composer-primary" :disabled="composer.submitting || !composer.retryAllowed || !composerHasContent" @click="submitComposer('send-and-open')">{{ composer.submitting ? '正在创建…' : composer.image ? '打开 Codex 并复制文字' : '发送并打开' }}</button>
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
      ref="actionHintEl"
      class="float-action-hint"
      :class="[actionHint.placement, { sticky: actionHint.sticky }]"
      :style="{
        left: `${actionHint.left}px`,
        top: `${actionHint.top}px`,
        maxWidth: `${actionHint.maxWidth}px`,
        '--float-hint-arrow-left': `${actionHint.arrowLeft}px`
      }"
      role="tooltip"
    >{{ actionHint.label }}</div>
  </main>
</template>

<style scoped>
.float-runtime-reload {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  color: #fff4e8;
  background: color-mix(in srgb, #7f1d1d 92%, transparent);
  border: 1px solid #fb923c;
  border-radius: inherit;
  text-align: center;
  font-size: 12px;
  line-height: 1.35;
}

.float-runtime-reload strong {
  font-size: 13px;
}
</style>
