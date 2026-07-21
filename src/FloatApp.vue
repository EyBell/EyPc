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
  Plus,
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
import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from './domain/quickJumpHitTest'
import { shortcutFromEvent } from './domain/shortcuts'
import { codexModelReasonLabel, resolveCodexNewThreadModel, resolveManualCodexModel } from './domain/codexNewThread'
import { evaluateWhenExpression, LAYER_PRIORITY, type KeybindingContext, type KeybindingLayerId } from './runtime/keybinding/keybindingRuntime'
import type {
  CodexModelCatalogSnapshotV1,
  CodexNewThreadSelectionContext,
  CodexNewThreadTarget,
  CodexProjectCard,
  CodexProjectEntry,
  CodexProjectSection,
  CodexQuotaBucket,
  CodexResolvedNewThreadModel,
  CodexTaskCard,
  CodexTaskTab
} from './domain/codex'
import { normalizeCodexQuota } from './domain/codex'
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
}
type ShiftPreview = { task: CodexTaskCard; left: number; top: number } | null
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

const composerModels = computed(() => composer.value?.context.modelCatalog.models || [])

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
  const model = resolveComposerModel(context)
  composer.value = {
    target: {
      projectKey: targetProject.key,
      projectAlias: targetProject.actionAlias || '',
      projectName: targetProject.name,
      projectKind: targetProject.kind,
      projectFingerprint: context.projectFingerprint
    },
    context,
    model,
    selectionKind: 'auto',
    prompt: '',
    submitting: false,
    error: targetProject.actionAlias ? '' : '项目动作已过期，请刷新后重试',
    errorCode: targetProject.actionAlias ? '' : 'project-alias-missing',
    retryAllowed: true,
    staleConfirmation: false,
    manualOnly: false,
    reopenAlias: ''
  }
  void nextTick(() => (focusModel ? composerModelSelect.value : composerTextarea.value)?.focus({ preventScroll: true }))
}

function cancelComposer() {
  if (!composer.value) return
  composer.value.prompt = ''
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
      { id: 'task-detail', label: '查看详情', run: () => { panel.value = { mode: 'detail', item } } },
      { id: 'task-alias', label: '编辑别名', run: () => editAlias(item) },
      { id: 'task-pin', label: item.task.pinSource === 'local' ? '取消本地置顶' : '本地置顶', run: () => togglePin(item) },
      { id: 'task-hide', label: item.task.isHidden ? '恢复显示' : '移到已隐藏', disabled: item.task.isHidden && !item.task.hiddenKind, run: () => item.task.isHidden ? restoreTask(item.task) : hideTask(item.task) },
      { id: 'task-archive', label: '真实归档', danger: true, disabled: !item.task.canArchive, disabledReason: '真实活动任务不可归档', run: requestTaskArchive }
    ]
  }
  return [
    { id: 'project-new-thread', label: '新建会话', disabled: !item.project.actionAlias, disabledReason: '项目动作已失效', run: () => openComposer(item.project) },
    { id: 'project-new-thread-model', label: '选择模型新建会话', disabled: !item.project.actionAlias, disabledReason: '项目动作已失效', run: () => openComposer(item.project, true) },
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

function switchTab(tab: CodexTaskTab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  clearConfirm()
  closeShiftPreview(true)
  if (panel.value) closePanel()
  if (aliasEditor.value) cancelAlias()
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

function openContextDrawer(item: FocusItem) {
  panelTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  focusedKey.value = item.key
  if (item.kind === 'project') clearSelection()
  else if (!selectedKeys.value.has(item.task.key)) setSelection(new Set([item.task.key]), item.task.key)
  panel.value = { mode: 'drawer', item }
  drawerActiveIndex.value = 0
  clearConfirm()
}

function openPanel(mode: 'detail' | 'drawer') {
  const item = mode === 'drawer' ? drawerItem.value : focusedItem.value
  if (!item) return
  panelTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  panel.value = { mode, item }
  drawerActiveIndex.value = 0
  clearConfirm()
}

function closePanel() {
  if (!panel.value) return
  panel.value = null
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
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false
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
  'Ctrl+F': 'codex.search.focus',
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
  if (pendingConfirm.value) clearConfirm()
  else if (composer.value) cancelComposer()
  else if (quickJump.value.open) closeQuickJump(true)
  else if (shiftPreview.value) closeShiftPreview(true)
  else if (aliasEditor.value) cancelAlias()
  else if (panel.value) closePanel()
  else if (selectedKeys.value.size) clearSelection()
  else if (searchText.value) searchText.value = ''
  else if (expanded.value && !resize) {
    restoreCompactFocus = true
    requestExpansion(false)
  }
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
  if (handleShiftPreviewArrow(event)) return
  if (shortcutFromEvent(event) === 'Escape' && pendingConfirm.value) {
    event.preventDefault()
    event.stopPropagation()
    cancelTopLayer()
    return
  }
  if (handleQuickJumpKey(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  const target = event.target as HTMLElement
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
  else if (command === 'codex.thread.createFocused') openComposer()
  else if (command.startsWith('codex.drawer.select.')) executeDrawerAction(Number(command.split('.').at(-1)) - 1)
  else if (command === 'codex.layer.cancel') {
    cancelTopLayer()
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
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
  if (snapshot.value?.conversations.activeTab) activeTab.value = snapshot.value.conversations.activeTab
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
        :aria-label="`${compactCounts.input} 个待输入任务`"
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
              <button type="button" class="project-new-thread" :disabled="!row.project.actionAlias" :aria-label="row.project.actionAlias ? `在 ${row.project.name} 新建会话` : '项目动作已失效'" data-quick-jump-target :data-quick-jump-label="`在 ${row.project.name} 新建会话`" @click.stop="focusedKey = row.key; openComposer(row.project)"><Plus :size="15" aria-hidden="true" /></button>
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
              :data-quick-jump-label="`聚焦任务 ${row.task.name}`"
              @focus="focusedKey = row.key"
              @pointermove="onRowPointerMove($event, row.key)"
              @pointerenter="onTaskPointerEnter(row.task)"
              @pointerleave="onTaskPointerLeave(row.task)"
              @click.stop="selectTask(row.task, $event)"
              @dblclick.stop="openTask(row.task)"
              @contextmenu.prevent.stop="openContextDrawer(row)"
            >
              <span class="task-state-button" :aria-label="`状态：${taskStateLabel(row.task)}`">
                <component :is="taskIcon(row.task)" :size="14" class="task-state-icon" aria-hidden="true" />
              </span>
              <span class="task-copy">
                <strong>{{ row.task.name }}</strong>
                <small v-if="row.task.alias">原名：{{ row.task.originalName }}</small>
                <small>{{ row.task.projectName }} · {{ taskStateLabel(row.task) }} · {{ formatTaskTime(row.task.lastQuestionAt) }}</small>
              </span>
              <em v-if="row.task.isHidden">隐藏</em><em v-if="row.task.pinSource === 'local'">本地</em>
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
            <button type="button" class="danger" :class="{ confirming: pendingConfirm?.id?.startsWith('archive:') }" aria-label="归档当前多选任务；仅归档通过真实状态核验的任务" data-confirm-slot data-quick-jump-target @click.stop="requestTaskArchive"><span aria-hidden="true">{{ pendingConfirm?.id?.startsWith('archive:') ? '确' : '归' }}</span></button>
            <button type="button" aria-label="打开当前多选的完整操作；快捷键 Ctrl+右箭头" data-quick-jump-target @click.stop="openBatchDrawer"><span aria-hidden="true">操</span></button>
            <button type="button" aria-label="清空当前多选" data-quick-jump-target @click.stop="clearSelection"><span aria-hidden="true">清</span></button>
          </div>
        </div>

        <section v-if="activeTab === 'projects' && removedProjects.length" class="float-removed-projects" aria-label="已从 EyPc 移除的项目">
          <strong>已从 EyPc 移除</strong>
          <button v-for="project in removedProjects" :key="project.key" type="button" @click="action('codex.project.restore', { key: project.key })"><RotateCcw :size="12" />恢复 {{ project.name }}</button>
        </section>
      </section>

      <aside v-if="panel" class="float-side-panel" :class="panel.mode" :aria-label="panel.mode === 'detail' ? '当前项详情' : '批量与完整操作'">
        <header><strong>{{ panel.mode === 'detail' ? '详情' : drawerIsBatch ? `多选操作 · ${selectedTasks.length} 项` : '单项完整操作' }}</strong><button type="button" aria-label="关闭" data-quick-jump-target @click="closePanel"><X :size="14" /></button></header>
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

      <aside
        v-if="shiftPreview"
        class="float-shift-preview"
        :style="{ left: `${shiftPreview.left}px`, top: `${shiftPreview.top}px` }"
        role="status"
        aria-live="polite"
        aria-label="会话详情预览"
        @wheel.stop
      >
        <header><kbd>Shift</kbd><strong>{{ shiftPreview.task.name }}</strong></header>
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
            <span><small>新建会话到</small><strong id="codex-composer-title">{{ composer.target.projectName }}</strong></span>
            <button type="button" aria-label="取消新建会话" :disabled="composer.submitting" @click="cancelComposer"><X :size="16" aria-hidden="true" /></button>
          </header>

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
  </main>
</template>
