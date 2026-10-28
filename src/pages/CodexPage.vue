<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BellRing,
  Bot,
  Check,
  CircleGauge,
  Eye,
  EyeOff,
  Activity,
  HeartPulse,
  Keyboard,
  LayoutDashboard,
  LoaderCircle,
  Palette,
  Package,
  Pin,
  Wifi,
  SlidersHorizontal
} from '@lucide/vue'
import CodexStyleSwitch from '../components/CodexStyleSwitch.vue'
import CodexAppearanceStudio from '../components/CodexAppearanceStudio.vue'
import CodexWaterBall from '../components/CodexWaterBall.vue'
import {
  CODEX_THEME_PRESETS,
  codexThemeCssVars,
  matchCodexThemePreset,
  quotaStatusColor,
  resolveCodexExpandedCardTheme
} from '../domain/codexAppearance'
import { buildCodexCompactPresentation, codexBadgeText, codexWeeklyReading } from '../domain/codexPresentation'
import { codexConnectionStatusLabel } from '../domain/codexEnvironmentPresentation'
import { resolveCompanionWaterBallPresentation } from '../domain/companionPresentation'
import {
  CODEX_MAX_DYNAMIC_TASK_WINDOW_HOURS,
  CODEX_MAX_QUOTA_REFRESH_SECONDS,
  CODEX_MIN_DYNAMIC_TASK_WINDOW_HOURS,
  CODEX_MIN_QUOTA_REFRESH_SECONDS
} from '../domain/codex'
import type {
  CodexColorSettings,
  CodexCompactField,
  CodexDisplayStyle,
  CodexExpandedCardAppearanceSettings,
  CodexSettings,
  CodexSavedThemePreset,
  CodexWaterAppearanceSettings } from '../domain/codex'
import type { RuntimeDiagnosticsLevel } from '../domain/types'
import { formatShortcutLabel } from '../domain/shortcuts'
import type { CodexRuntimeView } from '../runtime/codexController'

const props = defineProps<{ snapshot: CodexRuntimeView }>()
const emit = defineEmits<{ dispatch: [actionId: string, args?: Record<string, unknown>] }>()
const themePresetError = ref('')
const THEME_PRESET_BUILTIN_PREFIX = 'builtin:'
const THEME_PRESET_SAVED_PREFIX = 'saved:'
const THEME_PRESET_CUSTOM = 'custom'
const MAX_SAVED_THEME_PRESETS = 20
const THEME_PRESET_CURRENT = 'preference'
const visibleThemePresets = CODEX_THEME_PRESETS.filter(preset => ['graphite', 'amber-mist', 'jade-pulse', 'ice-prism'].includes(preset.id))
const currentPreference = { colors: { ...props.snapshot.settings.colors }, waterAppearance: cloneWaterAppearance(props.snapshot.settings.waterAppearance), expandedCardAppearance: cloneExpandedCardAppearance(props.snapshot.settings.expandedCardAppearance), counterColors: { ...props.snapshot.settings.counterColors } }
const editingThemeId = ref<string | null>(null)
const themeChoiceLocked = ref(false)

type CodexConfigTabId = 'shortcuts' | 'tasks' | 'water' | 'card' | 'runtime'

const configTabs: Array<{ id: CodexConfigTabId; label: string }> = [
  { id: 'shortcuts', label: '快捷方式' },
  { id: 'tasks', label: '任务' },
  { id: 'water', label: '外观' },
  { id: 'runtime', label: '运行' }
]
const activeConfigTab = ref<CodexConfigTabId>('shortcuts')
const appearanceMode = ref<'water' | 'card'>('water')

interface CodexHotkeyRow {
  title: string
  summary: string
  configureAction: string
  bindLabel: string
  runAction?: string
  runLabel?: string
  runShortcutLabel?: string
}

const hotkeyRows: CodexHotkeyRow[] = [
  { title: '悬浮球开关', summary: '显示或隐藏悬浮球', configureAction: 'codex.float.toggle.hotkey.configure', bindLabel: '切换 Codex 悬浮球' },
  { title: '直接展开卡片', summary: '展开并聚焦会话列表', configureAction: 'codex.hotkey.configure', bindLabel: '直接展开 Codex 卡片', runAction: 'codex.float.activate', runLabel: '立即展开', runShortcutLabel: formatShortcutLabel('Ctrl+Alt+Enter') },
  { title: '快速任务查看', summary: '展开动态列表并编号筛选', configureAction: 'codex.quick.hotkey.configure', bindLabel: '快速任务查看', runAction: 'codex.quick.activate', runLabel: '立即进入', runShortcutLabel: formatShortcutLabel('Ctrl+Alt+K') },
  { title: '待输入任务', summary: '最新优先，连续打开待输入', configureAction: 'codex.input.hotkey.configure', bindLabel: '打开 Codex 待输入任务' },
  { title: '已完成未读任务', summary: '最新优先，连续打开已完成未读', configureAction: 'codex.completed-unread.hotkey.configure', bindLabel: '依次打开 Codex 已完成未读任务' },
  { title: '上一个 Codex 任务', summary: '循环到上一个可切换任务', configureAction: 'codex.task.previous.hotkey.configure', bindLabel: '上一个 Codex 任务' },
  { title: '下一个 Codex 任务', summary: '循环到下一个可切换任务', configureAction: 'codex.task.next.hotkey.configure', bindLabel: '下一个 Codex 任务' },
  { title: '归档当前任务', summary: '对当前任务走归档确认', configureAction: 'codex.archive.hotkey.configure', bindLabel: '归档当前 Companion 任务' },
  { title: 'Action 执行工作台', summary: '打开独立 Action 工作台', configureAction: 'codex.actionRunner.hotkey.configure', bindLabel: '打开 Action 执行工作台' },
  ...Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1
    return {
      title: `Action 槽 ${slot}`,
      summary: 'EyPc 等价执行，优先默认项目',
      configureAction: `codex.action.run.${slot}.hotkey.configure`,
      bindLabel: `Codex Action 槽 ${slot}`
    }
  })
]

function configureRuntimeDiagnostics(input: { enabled?: boolean; level?: RuntimeDiagnosticsLevel }) {
  const settings = props.snapshot.runtimeDiagnostics?.settings
  if (!settings) return
  emit('dispatch', 'runtime.logs.configure', {
    enabled: input.enabled ?? settings.enabled,
    level: input.level ?? settings.level
  })
}

function configTabButtonId(id: CodexConfigTabId): string {
  return `codex-config-tab-${id}`
}

function configPanelId(id: CodexConfigTabId): string {
  return `codex-config-panel-${id}`
}

function onConfigTabKeydown(event: KeyboardEvent, currentIndex: number) {
  let nextIndex = currentIndex
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % configTabs.length
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + configTabs.length) % configTabs.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = configTabs.length - 1
  else return

  event.preventDefault()
  activeConfigTab.value = configTabs[nextIndex].id
  const tabButtons = (event.currentTarget as HTMLButtonElement)
    .closest('[role="tablist"]')
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabButtons?.[nextIndex]?.focus()
}

function cloneWaterAppearance(value: CodexWaterAppearanceSettings): CodexWaterAppearanceSettings {
  return { inner: { ...value.inner }, outer: { ...value.outer } }
}

function cloneExpandedCardAppearance(value: CodexExpandedCardAppearanceSettings): CodexExpandedCardAppearanceSettings {
  return { ...value }
}

const waterDraft = ref<CodexWaterAppearanceSettings>(cloneWaterAppearance(props.snapshot.settings.waterAppearance))
const savedThemeName = ref('')
const savedThemeOption = ref(THEME_PRESET_CUSTOM)
const taskState = computed(() => props.snapshot.taskState)
const waterPreviewProjection = computed(() => taskState.value.dynamic)

const waterPreview = computed(() => buildCodexCompactPresentation({
  quota: props.snapshot.quota,
  compactFields: props.snapshot.settings.compactFields,
  conversationInboxEnabled: props.snapshot.settings.conversationInboxEnabled,
  taskCounts: waterPreviewProjection.value.compactCounts
}))

/**
 * The configuration preview and the desktop float must render one component off
 * one projection. Without feeding the same companion slice in, the float would
 * show a centre reading the preview never shows, and the preview would drift
 * from runtime.
 */
const companionPreview = computed(() => resolveCompanionWaterBallPresentation({
  providers: props.snapshot.settings.providers,
  claudeQuota: props.snapshot.claudeQuota,
  claudeEnvironment: props.snapshot.claudeEnvironment,
  magpieQuota: props.snapshot.companion?.magpieQuota
}, {
  primary: waterPreview.value.primary,
  secondary: waterPreview.value.secondary
}))

const waterPreviewStyle = computed<Record<string, string>>(() => {
  const { inner, outer } = waterDraft.value
  const colors = props.snapshot.settings.colors
  const weekly = codexWeeklyReading(waterPreview.value.primary, waterPreview.value.secondary)
  const ringPercent = weekly?.bucket.remainingPercent ?? waterPreview.value.primary?.bucket.remainingPercent ?? 100
  return {
    '--appearance-water-base': colors.water,
    '--appearance-water-fill-color-a': inner.fillColorA,
    '--appearance-ring-progress': outer.colorMode === 'custom' ? outer.progressColor : quotaStatusColor(ringPercent, colors),
    '--appearance-water-reading': inner.percentColor,
    '--codex-counter-input': props.snapshot.settings.counterColors.input,
    '--codex-counter-active': props.snapshot.settings.counterColors.active,
    '--codex-counter-unread': props.snapshot.settings.counterColors.unread
  }
})

const waterPreviewCounters = computed(() => waterPreview.value.taskCounts)

const cardPreviewStyle = computed<Record<string, string>>(() => {
  const primaryPercent = waterPreview.value.primary?.bucket.remainingPercent ?? 100
  return codexThemeCssVars(resolveCodexExpandedCardTheme(props.snapshot.settings.colors, props.snapshot.settings.expandedCardAppearance, primaryPercent))
})

const compactOptions: Array<{ id: CodexCompactField; label: string }> = [
  { id: 'tasks', label: '任务数字' }
]
function matchesThemePreset(
  theme: Pick<CodexSavedThemePreset, 'colors' | 'waterAppearance' | 'expandedCardAppearance'>,
  colors: CodexColorSettings,
  waterAppearance: CodexWaterAppearanceSettings,
  expandedCardAppearance: CodexExpandedCardAppearanceSettings,
  counterColors: CodexSettings['counterColors']
) {
  return (!('counterColors' in theme) || !theme.counterColors || JSON.stringify(theme.counterColors) === JSON.stringify(counterColors))
    && JSON.stringify(theme.colors) === JSON.stringify(colors)
    && JSON.stringify(theme.waterAppearance) === JSON.stringify(waterAppearance)
    && JSON.stringify(theme.expandedCardAppearance) === JSON.stringify(expandedCardAppearance)
}

const activeThemeOption = computed(() => {
  const colors = props.snapshot.settings.colors
  const waterAppearance = props.snapshot.settings.waterAppearance
  const expandedCardAppearance = props.snapshot.settings.expandedCardAppearance
  const savedId = props.snapshot.settings.savedThemePresets.find((item) => matchesThemePreset(item, colors, waterAppearance, expandedCardAppearance, props.snapshot.settings.counterColors))?.id
  if (savedId) return `${THEME_PRESET_SAVED_PREFIX}${savedId}`
  const builtinId = matchCodexThemePreset(colors, waterAppearance, expandedCardAppearance)
  return builtinId ? `${THEME_PRESET_BUILTIN_PREFIX}${builtinId}` : THEME_PRESET_CUSTOM
})
watch(() => props.snapshot.settings.waterAppearance, (value) => {
  waterDraft.value = cloneWaterAppearance(value)
}, { deep: true })
watch([() => props.snapshot.settings.colors, () => props.snapshot.settings.counterColors, () => props.snapshot.settings.waterAppearance, () => props.snapshot.settings.expandedCardAppearance, () => props.snapshot.settings.savedThemePresets], () => {
  const previousOption = savedThemeOption.value
  savedThemeOption.value = activeThemeOption.value
  const activeSavedId = activeThemeOption.value.startsWith(THEME_PRESET_SAVED_PREFIX)
    ? activeThemeOption.value.slice(THEME_PRESET_SAVED_PREFIX.length)
    : null
  if (!themeChoiceLocked.value) editingThemeId.value = activeSavedId
  const match = editingThemeId.value ? props.snapshot.settings.savedThemePresets.find((entry) => entry.id === editingThemeId.value) : null
  if (match) savedThemeOption.value = `${THEME_PRESET_SAVED_PREFIX}${match.id}`
  else if (themeChoiceLocked.value) savedThemeOption.value = previousOption
  else if (!activeThemeOption.value.startsWith(THEME_PRESET_BUILTIN_PREFIX) || visibleThemePresets.some(preset => `${THEME_PRESET_BUILTIN_PREFIX}${preset.id}` === activeThemeOption.value)) savedThemeOption.value = activeThemeOption.value
  else savedThemeOption.value = THEME_PRESET_CUSTOM
  if (!savedThemeName.value || match) savedThemeName.value = match?.name || ''
}, { deep: true, immediate: true })
const statusLabel = computed(() => codexConnectionStatusLabel({
  refreshing: props.snapshot.refreshing,
  quotaStatus: props.snapshot.quota.status,
  quotaErrorMessage: props.snapshot.quota.errorMessage,
  desktopBridgeState: props.snapshot.environment.desktopBridgeState,
  statusFeedMode: props.snapshot.environment.statusFeedMode || 'unavailable'
}))

const runtimeBuildPresentation = computed(() => {
  const identity = props.snapshot.runtimeIdentity
  const builtAtLocal = identity?.builtAtLocal?.trim() || '等待构建信息'
  const packageVersion = identity?.packageVersion?.trim()
  const loaded = identity?.status === 'host-loaded'
  return {
    builtAt: identity?.builtAt || '',
    builtAtLocal,
    summary: `${packageVersion ? `v${packageVersion} · ` : ''}${loaded ? '宿主已加载此构建' : '运行身份不一致，需要重载'}`,
    detail: '时间直接来自当前宿主产物的 runtime-identity.cjs。每次打包前执行 pnpm run build，并以 dist/runtime-identity.cjs 的 builtAt、builtAtLocal 与 Host/Renderer 指纹作为最新产物凭据。'
  }
})

const statusIconBar = computed(() => {
  const env = props.snapshot.environment
  const ws = props.snapshot.floatHost.workspaceVisibility
  const health = ws?.health
  const identity = props.snapshot.runtimeIdentity
  const log = props.snapshot.runtimeDiagnostics
  const connectionTone = props.snapshot.refreshing || env.checking
    ? 'checking'
    : props.snapshot.quota.status === 'error' || env.connectionState === 'failed'
      ? 'error'
      : props.snapshot.quota.status === 'stale' || env.connectionState !== 'connected'
        ? 'warning'
        : 'ready'
  return [
    { id: 'connection', icon: Wifi, tone: connectionTone, label: '连接', title: statusLabel.value },
    {
      id: 'build',
      icon: Package,
      tone: identity?.status === 'host-loaded' ? 'ready' : identity ? 'warning' : 'muted',
      label: '产物',
      title: runtimeBuildPresentation.value.summary
    },
    {
      id: 'pin',
      icon: Pin,
      tone: ws?.allWorkspaces && ws?.visibleOnFullScreen ? 'ready' : ws?.supported ? 'warning' : 'muted',
      label: '置顶',
      title: ws?.allWorkspaces && ws?.visibleOnFullScreen ? '跨桌面置顶已启用' : ws?.errorCode || '跨桌面置顶'
    },
    {
      id: 'health',
      icon: HeartPulse,
      tone: health?.alive ? 'ready' : health?.persistent ? 'warning' : 'muted',
      label: '健康',
      title: health?.alive ? '悬浮球心跳正常' : health?.persistent ? '悬浮球等待恢复' : '悬浮球未启用'
    },
    {
      id: 'log',
      icon: Activity,
      tone: log?.settings.enabled ? (log.status === 'ok' ? 'ready' : 'warning') : 'muted',
      label: '日志',
      title: log?.settings.enabled ? `诊断日志 · ${log.settings.level}` : '诊断日志已关闭'
    }
  ]
})

function formatDiagnosticBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDiagnosticTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '等待事件'
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function update(patch: Partial<CodexSettings>) {
  emit('dispatch', 'codex.settings.update', { settings: patch })
}

function toggleClaude(enabled: boolean) {
  update({ providers: { ...props.snapshot.settings.providers, claude: enabled } })
}

function toggleCursor(enabled: boolean) {
  update({ providers: { ...props.snapshot.settings.providers, cursor: enabled } })
}

function toggleOrca(enabled: boolean) {
  update({ providers: { ...props.snapshot.settings.providers, orca: enabled } })
}

function changeStyle(style: CodexDisplayStyle) {
  if (style !== props.snapshot.settings.displayStyle) update({ displayStyle: style })
}

function toggleField<T extends string>(fields: T[], field: T, checked: boolean, key: 'compactFields' | 'expandedFields') {
  const next = checked ? [...new Set([...fields, field])] : fields.filter((item) => item !== field)
  update({ [key]: next } as Partial<CodexSettings>)
}

function applyThemePreset(preset: { colors: CodexColorSettings, waterAppearance: CodexWaterAppearanceSettings, expandedCardAppearance: CodexExpandedCardAppearanceSettings, counterColors?: CodexSettings['counterColors'] }, source: string) {
  waterDraft.value = cloneWaterAppearance(preset.waterAppearance)
  update({
    colors: { ...preset.colors },
    waterAppearance: cloneWaterAppearance(preset.waterAppearance),
    expandedCardAppearance: cloneExpandedCardAppearance(preset.expandedCardAppearance),
    ...(preset.counterColors ? { counterColors: { ...preset.counterColors } } : {})
  })
  savedThemeOption.value = source
}

function applyThemePresetBySelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  themePresetError.value = ''
  if (!value || value === THEME_PRESET_CUSTOM) return
  savedThemeOption.value = value
  themeChoiceLocked.value = true
  editingThemeId.value = value.startsWith(THEME_PRESET_SAVED_PREFIX) ? value.slice(THEME_PRESET_SAVED_PREFIX.length) : null
  if (value === THEME_PRESET_CURRENT) { savedThemeName.value = ''; applyThemePreset(currentPreference, value); return }
  if (value.startsWith(THEME_PRESET_BUILTIN_PREFIX)) {
    const presetId = value.slice(THEME_PRESET_BUILTIN_PREFIX.length)
    const preset = CODEX_THEME_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    savedThemeName.value = ''
    applyThemePreset(preset, value)
    return
  }
  if (value.startsWith(THEME_PRESET_SAVED_PREFIX)) {
    const presetId = value.slice(THEME_PRESET_SAVED_PREFIX.length)
    const preset = props.snapshot.settings.savedThemePresets.find((item) => item.id === presetId)
    if (!preset) return
    savedThemeName.value = preset.name
    applyThemePreset(preset, value)
  }
}

function sanitizeThemeName(value: string) {
  return value.trim().slice(0, 40)
}

function generateThemePresetId() {
  return `theme-${Date.now().toString(36)}-${Math.floor(Math.random() * 100000).toString(16)}`
}

function saveThemePreset(action: 'save' | 'saveAs' | 'backup' | 'rename') {
  const name = sanitizeThemeName(savedThemeName.value)
  const next = [...props.snapshot.settings.savedThemePresets]
  const index = editingThemeId.value ? next.findIndex(item => item.id === editingThemeId.value) : -1
  if (action === 'rename') {
    if (index < 0) { themePresetError.value = '请先选择已保存的方案'; return }
    if (!name) { themePresetError.value = '请填写新名称'; return }
    if (next.some((item, i) => i !== index && item.name === name)) { themePresetError.value = '方案名称已存在'; return }
    next[index] = { ...next[index], name, updatedAt: Date.now() }
    update({ savedThemePresets: next }); themePresetError.value = ''; return
  }
  if (action !== 'save' || index < 0) {
    if (!name) { themePresetError.value = '请填写主题名称'; return }
    if (next.some(item => item.name === name)) { themePresetError.value = '方案名称已存在，请使用其他名称'; return }
    if (next.length >= MAX_SAVED_THEME_PRESETS) { themePresetError.value = '最多保存 20 个方案'; return }
  }
  const now = Date.now()
  const values = { colors: { ...props.snapshot.settings.colors }, waterAppearance: cloneWaterAppearance(props.snapshot.settings.waterAppearance), expandedCardAppearance: cloneExpandedCardAppearance(props.snapshot.settings.expandedCardAppearance), counterColors: { ...props.snapshot.settings.counterColors } }
  if (action === 'save' && index >= 0) next[index] = { ...next[index], ...values, updatedAt: now }
  else {
    const entry: CodexSavedThemePreset = { id: generateThemePresetId(), name, ...values, ...(action === 'backup' ? { alternate: true } : {}), createdAt: now, updatedAt: now }
    next.unshift(entry)
    if (action !== 'backup') { editingThemeId.value = entry.id; themeChoiceLocked.value = true; savedThemeOption.value = `${THEME_PRESET_SAVED_PREFIX}${entry.id}` }
  }
  if (action === 'backup') themeChoiceLocked.value = true
  update({ savedThemePresets: next }); themePresetError.value = ''
}

function updateColor(key: keyof CodexColorSettings, value: string) {
  const candidate = { ...props.snapshot.settings.colors, [key]: value.toUpperCase() }
  update({ colors: candidate })
}

function updateExpandedCardAppearance(key: keyof CodexExpandedCardAppearanceSettings, value: string) {
  update({ expandedCardAppearance: { ...props.snapshot.settings.expandedCardAppearance, [key]: value.toUpperCase() } })
}

function updateWaterDraft(section: 'inner' | 'outer', key: string, value: string | number | boolean) {
  const candidate = {
    ...waterDraft.value,
    [section]: { ...waterDraft.value[section], [key]: value }
  }
  waterDraft.value = candidate
  update({ waterAppearance: cloneWaterAppearance(candidate) })
}
</script>

<template>
  <section
    class="codex-config-page"
    aria-label="Codex Companion 配置"
    :data-companion-package-revision="snapshot.taskSnapshot.packageRevision || undefined"
  >
  <header class="codex-config-hero" aria-label="额度任务悬浮球配置总览">
    <div class="codex-hero-copy">
      <h1>额度任务悬浮球</h1>
      <span class="codex-eyebrow"><Bot :size="12" /> CODEX · CLAUDE COMPANION</span>
    </div>
      <nav class="codex-status-icon-bar" aria-label="运行状态">
        <button
          v-for="item in statusIconBar"
          :key="item.id"
          type="button"
          class="codex-status-icon"
          :class="`tone-${item.tone}`"
          :title="item.title"
          :aria-label="`${item.label}：${item.title}`"
        >
          <component :is="item.icon" :size="14" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <div class="codex-hero-actions">
        <button
          type="button"
          class="codex-float-toggle"
          :class="{ active: snapshot.settings.floatEnabled }"
          :aria-pressed="snapshot.settings.floatEnabled"
          :title="snapshot.settings.floatEnabled ? '关闭悬浮面板：关闭后将仅保留主界面入口。' : '显示悬浮面板：打开后可快速触发常用操作。'"
          :aria-label="snapshot.settings.floatEnabled ? '关闭悬浮面板' : '显示悬浮面板'"
          :data-operation-tooltip="snapshot.settings.floatEnabled ? '关闭桌面悬浮' : '显示桌面悬浮'"
          data-operation-description="显示或隐藏 Codex 浮窗主入口；隐藏后仅保留主界面入口。"
          @click="update({ floatEnabled: !snapshot.settings.floatEnabled })"
        >
          <EyeOff v-if="snapshot.settings.floatEnabled" :size="13" aria-hidden="true" />
          <Eye v-else :size="13" aria-hidden="true" />
          {{ snapshot.settings.floatEnabled ? '隐藏桌面悬浮' : '显示桌面悬浮' }}
        </button>
<CodexStyleSwitch :model-value="snapshot.settings.displayStyle" @update:model-value="changeStyle" />
      </div>
    </header>

    <nav class="codex-config-tabs" role="tablist" aria-label="Codex 配置分类">
      <button
        v-for="(tab, index) in configTabs"
        :id="configTabButtonId(tab.id)"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeConfigTab === tab.id"
        :aria-controls="configPanelId(tab.id)"
        :tabindex="activeConfigTab === tab.id ? 0 : -1"
        :class="{ active: activeConfigTab === tab.id }"
        @click="activeConfigTab = tab.id"
        @keydown="onConfigTabKeydown($event, index)"
      >{{ tab.label }}</button>
    </nav>

    <section
      :id="configPanelId(activeConfigTab)"
      class="codex-config-tab-panel"
      role="tabpanel"
      :aria-labelledby="configTabButtonId(activeConfigTab)"
    >
    <div class="codex-workbench">
      <article v-if="activeConfigTab === 'shortcuts'" class="codex-panel codex-settings-section codex-shortcuts-panel">
        <div class="codex-panel-title">
          <div><LayoutDashboard :size="13" /><strong>快捷方式</strong></div>
          <button
            type="button"
            class="codex-tip"
            aria-label="快捷方式说明"
            data-operation-tooltip="快捷方式说明"
            data-operation-description="只跳转 uTools 绑定或执行入口，不回显宿主快捷键。"
          >i</button>
        </div>
        <div class="codex-shortcut-stack">
          <div
            v-for="row in hotkeyRows"
            :key="row.configureAction"
            class="codex-hotkey-row"
          >
            <Keyboard :size="12" aria-hidden="true" />
            <span>
              <strong>{{ row.title }}</strong>
              <small>{{ row.summary }}</small>
            </span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              data-operation-tooltip="去绑定"
              :data-operation-description="row.bindLabel"
              @click="$emit('dispatch', row.configureAction)"
            >去设置</button>
            <button
              v-if="row.runAction && row.runLabel"
              type="button"
              class="secondary codex-hotkey-cta"
              :data-operation-tooltip="row.runLabel"
              :data-operation-shortcut="row.runShortcutLabel"
              @click="$emit('dispatch', row.runAction)"
            >{{ row.runLabel }}</button>
          </div>
        </div>
      </article>

      <article v-if="activeConfigTab === 'tasks'" class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><SlidersHorizontal :size="13" /><strong>内容</strong></div>
          <button
            type="button"
            class="codex-tip"
            aria-label="内容区域说明"
            data-operation-tooltip="内容区域说明"
            data-operation-description="仅控制卡片可视内容，不涉及任务正文或会话记录持久化。"
            data-tip="仅控制卡片可视内容，不涉及任务正文或会话记录持久化。"
          >i</button>
        </div>
        <fieldset class="codex-fieldset">
          <legend>水球补充读数</legend>
          <div class="codex-check-grid">
            <label v-for="item in compactOptions" :key="item.id">
              <input type="checkbox" :checked="snapshot.settings.compactFields.includes(item.id)" @change="toggleField(snapshot.settings.compactFields, item.id, ($event.target as HTMLInputElement).checked, 'compactFields')" />
              {{ item.label }}
            </label>
          </div>
        </fieldset>
      </article>

      <article v-if="activeConfigTab === 'tasks'" class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><BellRing :size="13" /><strong>任务</strong></div>
          <button
            type="button"
            class="codex-tip"
            aria-label="任务区域说明"
            data-operation-tooltip="任务区域说明"
            data-operation-description="任务先按状态分组，组内统一按最近提问时间倒序；仅展示可见会话摘要，不显示正文。"
            data-tip="任务先按状态分组，组内统一按最近提问时间倒序；仅展示可见会话摘要，不显示正文。"
          >i</button>
        </div>
        <label class="codex-switch-row">
          <span><strong>显示任务状态</strong></span>
          <input type="checkbox" :checked="snapshot.settings.conversationInboxEnabled" @change="update({ conversationInboxEnabled: ($event.target as HTMLInputElement).checked })" />
          <i />
        </label>
        <div class="codex-form-grid">
          <label>
            <span class="codex-label-row">
              <span>时间窗口（天）</span>
            </span>
            <input
              class="codex-number"
              type="number"
              min="1"
              max="365"
              :value="snapshot.settings.timeWindowDays"
              @change="update({ timeWindowDays: Number(($event.target as HTMLInputElement).value) })"
              data-operation-tooltip="时间窗口（天）"
              data-operation-description="按最新 Turn 活动时间过滤完整任务库存；悬浮卡片动态页另用下方小时数筛选。"
            />
          </label>
          <label>
            <span class="codex-label-row">
              <span>动态时间筛选（小时）</span>
            </span>
            <input
              class="codex-number"
              type="number"
              :min="CODEX_MIN_DYNAMIC_TASK_WINDOW_HOURS"
              :max="CODEX_MAX_DYNAMIC_TASK_WINDOW_HOURS"
              step="1"
              :value="snapshot.settings.dynamicTaskWindowHours"
              @change="update({ dynamicTaskWindowHours: Number(($event.target as HTMLInputElement).value) })"
              data-operation-tooltip="动态时间筛选（小时）"
              data-operation-description="控制悬浮卡片「动态」Tab、进行中角标和前后任务循环使用的最近活动范围；默认 24 小时。"
            />
          </label>
          <label>
            <span class="codex-label-row">
              <span>Action 默认项目</span>
            </span>
            <select
              class="codex-select"
              :value="snapshot.settings.actionDefaultProjectKey || ''"
              @change="update({ actionDefaultProjectKey: ($event.target as HTMLSelectElement).value })"
              title="Environment Action 默认项目"
              data-operation-tooltip="Action 默认项目"
              data-operation-description="可选。配置后，无选中任务时优先用该项目执行 Action；不配置则回退到悬浮卡「项目」Tab 最近焦点项目。"
            >
              <option value="">不配置（使用项目 Tab）</option>
              <option
                v-for="project in taskState.conversations.projects.filter((item) => item.kind === 'project')"
                :key="project.key"
                :value="project.key"
              >{{ project.name }}</option>
            </select>
          </label>
          <div class="codex-readonly-field"><span>真实预检</span><strong>{{ taskState.conversations.status === 'error' ? taskState.conversations.errorMessage || '任务状态读取失败' : taskState.conversations.completeness === 'verified' ? `${taskState.conversations.rawSourceCount} 原始 · ${taskState.conversations.eligibleSourceCount} 已注册` : '尚未获得完整快照' }}</strong></div>
        </div>
        <div
          class="codex-retention-readonly"
          data-operation-tooltip="待确认持久化"
          data-operation-description="打开、刷新或重启都不会清除待确认状态；会话正文不在此页展示。"
        >
          <Check :size="13" />
          <strong>待确认持久化</strong>
        </div>
      </article>

      <article v-if="activeConfigTab === 'water'" class="codex-panel codex-settings-section codex-appearance-panel">
        <div class="codex-panel-title">
          <div><Palette :size="13" /><strong>{{ appearanceMode === 'water' ? '悬浮水球' : '展开卡片' }}</strong></div>
          <button type="button" class="codex-tip" aria-label="外观配置说明" data-operation-tooltip="外观配置说明" data-operation-description="主题预设会同时保存水球与展开卡片；当前页只展示所选目标的预览与控件。" data-tip="主题预设会同时保存水球与展开卡片；当前页只展示所选目标的预览与控件。">i</button>
        </div>
        <div class="codex-theme-toolbar">
          <label>
            <span>整套主题</span>
            <select class="codex-select" :value="savedThemeOption" @change="applyThemePresetBySelect">
              <option :value="THEME_PRESET_CUSTOM">当前配置（未匹配）</option>
              <optgroup label="默认主题"><option :value="THEME_PRESET_CURRENT">当前偏好</option><option v-for="preset in visibleThemePresets" :key="preset.id" :value="`${THEME_PRESET_BUILTIN_PREFIX}${preset.id}`">{{ preset.label }}</option></optgroup>
              <optgroup v-if="snapshot.settings.savedThemePresets.length" label="已保存"><option v-for="preset in snapshot.settings.savedThemePresets" :key="preset.id" :value="`${THEME_PRESET_SAVED_PREFIX}${preset.id}`">{{ preset.alternate ? '备选 · ' : '' }}{{ preset.name }}</option></optgroup>
            </select>
          </label>
          <label class="codex-theme-name"><span>保存当前外观</span><input v-model="savedThemeName" type="text" class="codex-input" maxlength="40" placeholder="主题名称" /></label>
          <button type="button" class="secondary" @click="saveThemePreset('save')">保存</button><details class="codex-theme-actions"><summary aria-label="更多方案操作">•••</summary><div><button type="button" @click="saveThemePreset('saveAs')">另存为</button><button type="button" @click="saveThemePreset('backup')">保存备选</button><button type="button" @click="saveThemePreset('rename')">重命名</button></div></details>
        </div>
        <p v-if="themePresetError" class="codex-color-error" role="alert">{{ themePresetError }}</p>

        <CodexAppearanceStudio :snapshot="snapshot" :mode="appearanceMode" @update:mode="appearanceMode = $event" @dispatch="(action, args) => emit('dispatch', action, args)" />
        <details class="codex-appearance-advanced"><summary>更多外观参数</summary>
        <div class="codex-appearance-zones" :class="{ 'card-only': appearanceMode === 'card' }">
          <section v-if="appearanceMode === 'water'" class="codex-appearance-zone codex-appearance-zone--water" aria-labelledby="water-appearance-title">
            <div class="codex-appearance-zone-head"><div><span>01 · 悬浮水球</span><h3 id="water-appearance-title">水球外观</h3></div><button type="button" class="codex-tip" aria-label="水球外观说明" data-operation-tooltip="水球外观说明" data-operation-description="预览与桌面水球共用渲染；可分别控制球体背景、液体、Weekly 进度环、百分比读数和三类数字角标。" data-tip="预览与桌面水球共用渲染；可分别控制球体背景、液体、Weekly 进度环、百分比读数和三类数字角标。">i</button></div>
            <div class="codex-water-appearance-preview" :style="waterPreviewStyle" aria-label="与真实悬浮水球一致的颜色部位预览">
              <CodexWaterBall
                :primary="waterPreview.primary"
                :secondary="waterPreview.secondary"
                :state-label="waterPreview.stateLabel"
                :label="`${waterPreview.ariaLabel}${companionPreview.ariaSuffix}${companionPreview.quotaGrid.ariaSuffix}`"
                :percent-override="companionPreview.percentOverride"
                :scoped-percent="companionPreview.scopedPercent"
                :percent-provider-label="companionPreview.percentProviderLabel"
                :liquid-percent="companionPreview.liquidPercent"
                :ring-percent="companionPreview.ringPercent"
                :quota-grid="companionPreview.quotaGrid.enabled ? companionPreview.quotaGrid.cells : null"
                :appearance="waterDraft"
                :colors="snapshot.settings.colors"
                decorative
              />
              <b v-if="waterPreviewCounters.input" class="water-preview-counter companion-counter-geometry water-preview-counter--input">{{ codexBadgeText(waterPreviewCounters.input) }}</b>
              <b v-if="waterPreviewCounters.active" class="water-preview-counter companion-counter-geometry water-preview-counter--active">{{ codexBadgeText(waterPreviewCounters.active) }}</b>
              <b v-if="waterPreviewCounters.unread" class="water-preview-counter companion-counter-geometry water-preview-counter--unread">{{ codexBadgeText(waterPreviewCounters.unread) }}</b>
            </div>
            <div class="codex-appearance-controls">
              <label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.water" @input="updateColor('water', ($event.target as HTMLInputElement).value)" /><span><strong>球体底色</strong><small>只影响球体背景，不影响液体</small></span></label>
              <label class="water-range"><span>球体底色透明度 <strong>{{ waterDraft.inner.baseOpacity }}%</strong></span><input type="range" min="0" max="100" step="1" :value="waterDraft.inner.baseOpacity" @input="updateWaterDraft('inner', 'baseOpacity', Number(($event.target as HTMLInputElement).value))" /></label>
              <label class="codex-color-control"><input type="color" :value="waterDraft.inner.fillColorA" @input="updateWaterDraft('inner', 'fillColorA', ($event.target as HTMLInputElement).value.toUpperCase())" /><span><strong>液体填充 A</strong><small>渐变起始色</small></span></label>
              <label class="codex-color-control"><input type="color" :value="waterDraft.inner.fillColorB" @input="updateWaterDraft('inner', 'fillColorB', ($event.target as HTMLInputElement).value.toUpperCase())" /><span><strong>液体填充 B</strong><small>渐变结束色</small></span></label>
              <label><span>液体配色</span><select class="codex-select" :value="waterDraft.inner.palette" @change="updateWaterDraft('inner', 'palette', ($event.target as HTMLSelectElement).value)"><option value="solid">纯色（单一液面）</option><option value="gradient">渐变（A → B）</option><option value="aurora">高级炫彩（三段流光）</option></select></label>
              <label><span>水波速度</span><select class="codex-select" :value="waterDraft.inner.motion" @change="updateWaterDraft('inner', 'motion', ($event.target as HTMLSelectElement).value)"><option value="static">静止</option><option value="slow">缓慢</option><option value="normal">正常</option><option value="fast">快速</option></select></label>
              <label class="water-range"><span>透明度 <strong>{{ waterDraft.inner.opacity }}%</strong></span><input type="range" min="40" max="95" step="1" :value="waterDraft.inner.opacity" @input="updateWaterDraft('inner', 'opacity', Number(($event.target as HTMLInputElement).value))" /></label>
              <label class="water-range"><span>波幅 <strong>{{ waterDraft.inner.amplitude }}px</strong></span><input type="range" min="4" max="12" step="1" :value="waterDraft.inner.amplitude" @input="updateWaterDraft('inner', 'amplitude', Number(($event.target as HTMLInputElement).value))" /></label>
              <label><span>环样式</span><select class="codex-select" :value="waterDraft.outer.style" @change="updateWaterDraft('outer', 'style', ($event.target as HTMLSelectElement).value)"><option value="segmented">固定分段</option><option value="solid">圆环</option></select></label>
              <label><span>进度颜色</span><select class="codex-select" :value="waterDraft.outer.colorMode" @change="updateWaterDraft('outer', 'colorMode', ($event.target as HTMLSelectElement).value)"><option value="quota">跟随额度状态</option><option value="custom">自定义</option></select></label>
              <label class="codex-color-control"><input type="color" :value="waterDraft.outer.progressColor" @input="updateWaterDraft('outer', 'colorMode', 'custom'); updateWaterDraft('outer', 'progressColor', ($event.target as HTMLInputElement).value.toUpperCase())" /><span><strong>Weekly 进度色</strong><small>选择即改为自定义</small></span></label>
              <label class="codex-color-control"><input type="color" :value="waterDraft.outer.trackColor" @input="updateWaterDraft('outer', 'trackColor', ($event.target as HTMLInputElement).value.toUpperCase())" /><span><strong>Weekly 轨道色</strong><small>未完成部分</small></span></label>
            </div>
            <div class="codex-water-reading-controls" aria-label="百分比读数配置">
              <header><strong>百分比读数</strong><button type="button" class="codex-tip" aria-label="百分比读数说明" data-operation-tooltip="百分比读数说明" data-operation-description="独立设置水球百分比的位置、字号、字形和颜色。" data-tip="独立设置水球百分比的位置、字号、字形和颜色。">i</button></header>
              <label><span>显示位置</span><select class="codex-select" :value="waterDraft.inner.percentPosition" @change="updateWaterDraft('inner', 'percentPosition', ($event.target as HTMLSelectElement).value)"><option value="auto">自动（居中）</option><option value="center">居中</option><option value="bottom-left">左下</option><option value="bottom-right">右下</option></select></label>
              <label class="water-reading-range"><span>文字大小 <strong>{{ waterDraft.inner.percentSize }}px</strong></span><input type="range" min="12" max="32" step="1" :value="waterDraft.inner.percentSize" @input="updateWaterDraft('inner', 'percentSize', Number(($event.target as HTMLInputElement).value))" /></label>
              <label><span>文字样式</span><select class="codex-select" :value="waterDraft.inner.percentTextStyle" @change="updateWaterDraft('inner', 'percentTextStyle', ($event.target as HTMLSelectElement).value)"><option value="regular">常规</option><option value="bold">加粗</option><option value="italic">斜体</option><option value="bold-italic">粗斜体</option></select></label>
              <label class="codex-color-control"><input type="color" :value="waterDraft.inner.percentColor" @input="updateWaterDraft('inner', 'percentColor', ($event.target as HTMLInputElement).value.toUpperCase())" /><span><strong>文字颜色</strong><small>只影响水球百分比</small></span></label>
            </div>
            <div class="codex-counter-colors"><label class="codex-color-control"><input type="color" :value="snapshot.settings.counterColors.input" @input="update({ counterColors: { ...snapshot.settings.counterColors, input: ($event.target as HTMLInputElement).value.toUpperCase() } })" /><span><strong>待输入角标</strong><small>左下数字</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.counterColors.active" @input="update({ counterColors: { ...snapshot.settings.counterColors, active: ($event.target as HTMLInputElement).value.toUpperCase() } })" /><span><strong>进行中角标</strong><small>右下上方数字</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.counterColors.unread" @input="update({ counterColors: { ...snapshot.settings.counterColors, unread: ($event.target as HTMLInputElement).value.toUpperCase() } })" /><span><strong>已未读角标</strong><small>右下角数字</small></span></label></div>
          </section>

          <section v-if="appearanceMode === 'card'" class="codex-appearance-zone codex-appearance-zone--card" aria-labelledby="card-appearance-title">
            <div class="codex-appearance-zone-head"><div><span>02 · 悬浮展开卡片</span><h3 id="card-appearance-title">展开卡片主题</h3></div><button type="button" class="codex-tip" aria-label="展开卡片主题说明" data-operation-tooltip="展开卡片主题说明" data-operation-description="单独控制展开面板、文字、交互与任务状态；不会读取水球配色。" data-tip="单独控制展开面板、文字、交互与任务状态；不会读取水球配色。">i</button></div>
            <div class="codex-expanded-card-preview" :style="cardPreviewStyle" aria-label="悬浮展开卡片颜色部位预览">
              <div class="expanded-card-preview-tabs"><b><i>3</i>动态</b><span>已完成</span><span>已隐藏</span><span>项目</span></div>
              <div class="expanded-card-preview-search"><i /><span>别名|任务|项目</span><small>最近 30 天的 42 条</small></div>
              <div class="expanded-card-preview-quota"><span>5 小时限额</span><strong>72%</strong><i><b /></i></div>
              <div class="expanded-card-preview-task"><i /><span>进行中的 Codex 会话</span><small>2 分钟前</small></div>
              <div class="expanded-card-preview-map"><span><b>层次</b>主背景、内层块与边框</span><span><b>内容</b>主/次文字、选中和焦点</span><span><b>状态</b>进行中与完成未读</span></div>
            </div>
            <div class="codex-card-appearance-controls" aria-label="展开卡片主题配置">
              <div class="codex-card-config-group">
                <strong>面板层次</strong>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.surface" @input="updateExpandedCardAppearance('surface', ($event.target as HTMLInputElement).value)" /><span><strong>主面板底色</strong><small>展开外框与整体背景</small></span></label>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.surfaceRaised" @input="updateExpandedCardAppearance('surfaceRaised', ($event.target as HTMLInputElement).value)" /><span><strong>内层块底色</strong><small>页签、搜索、额度与任务行</small></span></label>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.border" @input="updateExpandedCardAppearance('border', ($event.target as HTMLInputElement).value)" /><span><strong>面板边框</strong><small>外框、分区和控件描边</small></span></label>
              </div>
              <div class="codex-card-config-group">
                <strong>文字层级</strong>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.foreground" @input="updateExpandedCardAppearance('foreground', ($event.target as HTMLInputElement).value)" /><span><strong>主文字 / 图标</strong><small>标题、数字与当前页签</small></span></label>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.secondary" @input="updateExpandedCardAppearance('secondary', ($event.target as HTMLInputElement).value)" /><span><strong>次文字</strong><small>搜索提示、时间和辅助标签</small></span></label>
              </div>
              <div class="codex-card-config-group">
                <strong>交互强调</strong>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.accent" @input="updateExpandedCardAppearance('accent', ($event.target as HTMLInputElement).value)" /><span><strong>选中 / 进度强调</strong><small>当前页签、进度与完成状态</small></span></label>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.focus" @input="updateExpandedCardAppearance('focus', ($event.target as HTMLInputElement).value)" /><span><strong>键盘焦点</strong><small>页签和按钮的焦点框</small></span></label>
              </div>
              <div class="codex-card-config-group">
                <strong>任务状态</strong>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.running" @input="updateExpandedCardAppearance('running', ($event.target as HTMLInputElement).value)" /><span><strong>进行中</strong><small>运行状态点、边框和标签</small></span></label>
                <label class="codex-color-control"><input type="color" :value="snapshot.settings.expandedCardAppearance.pending" @input="updateExpandedCardAppearance('pending', ($event.target as HTMLInputElement).value)" /><span><strong>完成未读</strong><small>未读徽标和待处理状态</small></span></label>
              </div>
            </div>
          </section>

          <section v-if="appearanceMode === 'water'" class="codex-appearance-zone codex-appearance-zone--signals" aria-labelledby="signal-appearance-title">
            <div class="codex-appearance-zone-head"><div><span>02 · 状态信号</span><h3 id="signal-appearance-title">额度状态色</h3></div><button type="button" class="codex-tip" aria-label="额度状态颜色说明" data-operation-tooltip="额度状态颜色说明" data-operation-description="用于跟随额度状态的 Weekly 进度和状态强调：充足、提醒、紧张。" data-tip="用于跟随额度状态的 Weekly 进度和状态强调：充足、提醒、紧张。">i</button></div>
            <div class="codex-signal-controls"><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.healthy" @input="updateColor('healthy', ($event.target as HTMLInputElement).value)" /><span><strong>充足</strong><small>高额度状态</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.warning" @input="updateColor('warning', ($event.target as HTMLInputElement).value)" /><span><strong>提醒</strong><small>中额度状态</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.critical" @input="updateColor('critical', ($event.target as HTMLInputElement).value)" /><span><strong>紧张</strong><small>低额度状态</small></span></label></div>
          </section>
        </div>
        </details>
      </article>

      <article v-if="activeConfigTab === 'runtime'" class="codex-panel codex-settings-section codex-runtime-panel">
        <div class="codex-panel-title">
          <div><CircleGauge :size="13" /><strong>接入来源</strong></div>
          <button type="button" class="codex-tip" aria-label="接入来源说明" data-operation-tooltip="接入来源" data-operation-description="各来源独立开关。开启 Claude / Cursor 时会自动注册事件钩子，关闭时自动移除。" data-tip="各来源独立开关。开启 Claude / Cursor 时会自动注册事件钩子，关闭时自动移除。">i</button>
        </div>
        <label class="codex-switch-row codex-switch-row--compact">
          <span><strong>跳转前启动目标应用</strong></span>
          <input type="checkbox" :checked="snapshot.settings.openLaunchesTarget" @change="update({ openLaunchesTarget: ($event.target as HTMLInputElement).checked })" />
          <i />
        </label>
        <label class="codex-switch-row codex-switch-row--compact">
          <span><strong>Claude Code</strong><small>{{ snapshot.settings.providers.claude ? '已启用' : '未启用' }}</small></span>
          <input type="checkbox" :checked="snapshot.settings.providers.claude" @change="toggleClaude(($event.target as HTMLInputElement).checked)" />
          <i />
        </label>
        <label class="codex-switch-row codex-switch-row--compact">
          <span><strong>Cursor Agent</strong><small>{{ snapshot.settings.providers.cursor ? '已启用' : '未启用' }}</small></span>
          <input type="checkbox" :checked="snapshot.settings.providers.cursor" @change="toggleCursor(($event.target as HTMLInputElement).checked)" />
          <i />
        </label>
        <label class="codex-switch-row codex-switch-row--compact">
          <span><strong>Orca</strong><small>{{ snapshot.settings.providers.orca ? '已启用' : '未启用' }}</small></span>
          <input type="checkbox" :checked="snapshot.settings.providers.orca" @change="toggleOrca(($event.target as HTMLInputElement).checked)" />
          <i />
        </label>
        <label v-if="snapshot.settings.providers.claude" class="codex-switch-row codex-switch-row--compact">
          <span><strong>Claude App 额度</strong></span>
          <input type="checkbox" :checked="snapshot.settings.claudeAppQuotaAccess" @change="update({ claudeAppQuotaAccess: ($event.target as HTMLInputElement).checked, claudeQuotaFallback: false })" />
          <i />
        </label>
      </article>

      <article v-if="activeConfigTab === 'runtime'" class="codex-panel codex-settings-section codex-runtime-panel">
        <div class="codex-panel-title">
          <div><CircleGauge :size="13" /><strong>额度</strong></div>
        </div>
        <div class="codex-quota-compact">
          <label class="codex-quota-refresh">
            <span>刷新</span>
            <input class="codex-number codex-number--compact" type="number" :min="CODEX_MIN_QUOTA_REFRESH_SECONDS" :max="CODEX_MAX_QUOTA_REFRESH_SECONDS" step="1" :value="snapshot.settings.quotaRefreshSeconds" @change="update({ quotaRefreshSeconds: Number(($event.target as HTMLInputElement).value) })" />
            <span>秒</span>
          </label>
          <label class="codex-switch-row codex-switch-row--compact codex-switch-row--inline">
            <span><strong>Magpie</strong></span>
            <input type="checkbox" :checked="snapshot.settings.magpieQuotaAccess" @change="update({ magpieQuotaAccess: ($event.target as HTMLInputElement).checked })" />
            <i />
          </label>
        </div>
      </article>

      <article v-if="activeConfigTab === 'runtime' && snapshot.runtimeDiagnostics" class="codex-panel codex-settings-section codex-runtime-panel codex-runtime-log-panel">
        <div class="codex-panel-title">
          <div><Activity :size="13" /><strong>诊断日志</strong></div>
          <span :class="`codex-log-badge is-${snapshot.runtimeDiagnostics.status}`">{{ snapshot.runtimeDiagnostics.settings.enabled ? snapshot.runtimeDiagnostics.settings.level : '关' }}</span>
        </div>
        <div class="codex-runtime-log-controls codex-runtime-log-controls--compact" role="group" aria-label="诊断日志">
          <label class="codex-runtime-log-toggle">
            <input type="checkbox" aria-label="启用诊断日志" :checked="snapshot.runtimeDiagnostics.settings.enabled" @change="configureRuntimeDiagnostics({ enabled: ($event.target as HTMLInputElement).checked })" />
            <span><strong>{{ snapshot.runtimeDiagnostics.settings.enabled ? '已开启' : '已关闭' }}</strong></span>
          </label>
          <label class="codex-runtime-log-level" for="codex-runtime-diagnostics-level">
            <span>级别</span>
            <select id="codex-runtime-diagnostics-level" :value="snapshot.runtimeDiagnostics.settings.level" @change="configureRuntimeDiagnostics({ level: ($event.target as HTMLSelectElement).value as RuntimeDiagnosticsLevel })">
              <option value="error">error</option>
              <option value="info">info</option>
              <option value="debug">debug</option>
            </select>
          </label>
          <div class="codex-runtime-log-actions codex-runtime-log-actions--compact">
            <button type="button" :disabled="!snapshot.runtimeDiagnostics.activeFile" @click="emit('dispatch', 'runtime.logs.openFile')">打开文件</button>
            <button type="button" @click="emit('dispatch', 'runtime.logs.openDirectory')">目录</button>
            <button type="button" class="danger" :disabled="snapshot.runtimeDiagnostics.storage.fileCount === 0" @click="emit('dispatch', 'runtime.logs.clear')">清空</button>
          </div>
        </div>
        <p class="codex-runtime-log-meta">事件 {{ snapshot.runtimeDiagnostics.totals.events }} · 慢 {{ snapshot.runtimeDiagnostics.totals.slow }} · 落盘 {{ snapshot.runtimeDiagnostics.storage.fileCount }} 文件</p>
      </article>
    </div>
    </section>
  </section>
</template>
