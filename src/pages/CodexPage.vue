<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  BellRing,
  Bot,
  Check,
  CircleCheckBig,
  CircleGauge,
  Eye,
  EyeOff,
  Keyboard,
  LayoutDashboard,
  LoaderCircle,
  Palette,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal
} from '@lucide/vue'
import CodexStyleSwitch from '../components/CodexStyleSwitch.vue'
import CodexWaterBall from '../components/CodexWaterBall.vue'
import {
  CODEX_THEME_PRESETS,
  codexThemeCssVars,
  matchCodexThemePreset,
  quotaStatusColor,
  resolveCodexExpandedCardTheme
} from '../domain/codexAppearance'
import { buildCodexCompactPresentation, codexBadgeText } from '../domain/codexPresentation'
import { buildCodexEnvironmentPresentation, codexConnectionStatusLabel } from '../domain/codexEnvironmentPresentation'
import { claudeRegistrationRows, claudeSourceStatusText, cursorRegistrationRows, cursorSourceStatusText, resolveCompanionWaterBallPresentation } from '../domain/companionPresentation'
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
  CodexWaterAppearanceSettings
} from '../domain/codex'
import type { RuntimeDiagnosticsLevel } from '../domain/types'
import type { CodexRuntimeView } from '../runtime/codexController'

const props = defineProps<{ snapshot: CodexRuntimeView }>()
const emit = defineEmits<{ dispatch: [actionId: string, args?: Record<string, unknown>] }>()
const themePresetError = ref('')
const manualLaunchPath = ref('')
const launchPathError = ref('')
const THEME_PRESET_BUILTIN_PREFIX = 'builtin:'
const THEME_PRESET_SAVED_PREFIX = 'saved:'
const THEME_PRESET_CUSTOM = 'custom'
const MAX_SAVED_THEME_PRESETS = 20

type CodexConfigTabId = 'shortcuts' | 'tasks' | 'water' | 'card' | 'runtime'

const configTabs: Array<{ id: CodexConfigTabId; label: string }> = [
  { id: 'shortcuts', label: '快捷方式' },
  { id: 'tasks', label: '任务' },
  { id: 'water', label: '水球' },
  { id: 'card', label: '卡片' },
  { id: 'runtime', label: '运行' }
]
const activeConfigTab = ref<CodexConfigTabId>('shortcuts')

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
  claudeEnvironment: props.snapshot.claudeEnvironment
}))

const waterPreviewStyle = computed<Record<string, string>>(() => {
  const { inner, outer } = waterDraft.value
  const colors = props.snapshot.settings.colors
  const weekly = waterPreview.value.primary?.kind === 'weekly'
    ? waterPreview.value.primary
    : waterPreview.value.secondary?.kind === 'weekly' ? waterPreview.value.secondary : null
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
  expandedCardAppearance: CodexExpandedCardAppearanceSettings
) {
  return JSON.stringify(theme.colors) === JSON.stringify(colors)
    && JSON.stringify(theme.waterAppearance) === JSON.stringify(waterAppearance)
    && JSON.stringify(theme.expandedCardAppearance) === JSON.stringify(expandedCardAppearance)
}

const activeThemeOption = computed(() => {
  const colors = props.snapshot.settings.colors
  const waterAppearance = props.snapshot.settings.waterAppearance
  const expandedCardAppearance = props.snapshot.settings.expandedCardAppearance
  const savedId = props.snapshot.settings.savedThemePresets.find((item) => matchesThemePreset(item, colors, waterAppearance, expandedCardAppearance))?.id
  if (savedId) return `${THEME_PRESET_SAVED_PREFIX}${savedId}`
  const builtinId = matchCodexThemePreset(colors, waterAppearance, expandedCardAppearance)
  return builtinId ? `${THEME_PRESET_BUILTIN_PREFIX}${builtinId}` : THEME_PRESET_CUSTOM
})
watch(() => props.snapshot.settings.waterAppearance, (value) => {
  waterDraft.value = cloneWaterAppearance(value)
}, { deep: true })
watch([() => props.snapshot.settings.colors, () => props.snapshot.settings.waterAppearance, () => props.snapshot.settings.expandedCardAppearance, () => props.snapshot.settings.savedThemePresets], () => {
  savedThemeOption.value = activeThemeOption.value
  const activeSavedId = activeThemeOption.value.startsWith(THEME_PRESET_SAVED_PREFIX)
    ? activeThemeOption.value.slice(THEME_PRESET_SAVED_PREFIX.length)
    : null
  const match = activeSavedId ? props.snapshot.settings.savedThemePresets.find((entry) => entry.id === activeSavedId) : null
  savedThemeName.value = match?.name || ''
}, { deep: true, immediate: true })
const ordinaryModels = computed(() => props.snapshot.modelCatalog.models.filter((model) => model.family === 'normal'))
const sparkModels = computed(() => props.snapshot.modelCatalog.models.filter((model) => model.family === 'spark'))
const statusLabel = computed(() => codexConnectionStatusLabel({
  refreshing: props.snapshot.refreshing,
  quotaStatus: props.snapshot.quota.status,
  quotaErrorMessage: props.snapshot.quota.errorMessage,
  desktopBridgeState: props.snapshot.environment.desktopBridgeState,
  statusFeedMode: props.snapshot.environment.statusFeedMode || 'unavailable'
}))

const preferredModelName = computed(() => {
  if (!ordinaryModels.value.length) return '暂未读取到可用普通模型'
  const selected = props.snapshot.settings.newThreadPreferredModel
  if (!selected) {
    const fallback = ordinaryModels.value.find((model) => model.isDefault) || ordinaryModels.value[0]
    return fallback ? `${fallback.displayName} · ${fallback.id}` : '暂未读取到可用普通模型'
  }
  const model = ordinaryModels.value.find((item) => item.id === selected)
  return model ? `${model.displayName} · ${model.id}` : '当前选择不在目录中'
})

const preferredModelMode = computed(() => props.snapshot.settings.newThreadPreferredModel ? '手动指定' : '目录默认')

const environmentPresentation = computed(() => buildCodexEnvironmentPresentation(
  props.snapshot.environment,
  props.snapshot.activityDecisionDiagnostics
))

const runtimeDiagnosticHighlights = computed(() => (props.snapshot.runtimeDiagnostics?.recent || [])
  .filter((entry) => entry.level === 'error' || (entry.durationMs || 0) >= 250)
  .slice(-6)
  .reverse())

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

function formatDiagnosticBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDiagnosticTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '等待事件'
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function saveLaunchPath() {
  const candidate = manualLaunchPath.value.trim()
  if (!candidate) {
    launchPathError.value = '请输入 Codex CLI 可执行文件的完整绝对路径'
    return
  }
  launchPathError.value = ''
  emit('dispatch', 'codex.set-launch-path', { path: candidate })
}

function clearLaunchPath() {
  launchPathError.value = ''
  manualLaunchPath.value = ''
  emit('dispatch', 'codex.clear-launch-path')
}

function update(patch: Partial<CodexSettings>) {
  emit('dispatch', 'codex.settings.update', { settings: patch })
}

// `outdated` means our marked entries are present but their command string no
// longer matches, so the honest label is "重新注册" and removal must stay
// available — treating it as "never registered" left the only way to clean up
// hidden behind a successful re-registration.
const claudeRegistered = computed(() => {
  const hooks = props.snapshot.claudeEnvironment?.hooks
  return hooks === 'installed' || hooks === 'outdated'
})
const claudeRegistrationGrid = computed(() => claudeRegistrationRows(props.snapshot.claudeEnvironment, Date.now()))
const claudeStatusText = computed(() => claudeSourceStatusText({
  enabled: props.snapshot.settings.providers.claude,
  environment: props.snapshot.claudeEnvironment,
  codeSessionCount: props.snapshot.claudeCodeSessionCount
}))

function toggleClaude(enabled: boolean) {
  update({ providers: { ...props.snapshot.settings.providers, claude: enabled } })
}

const cursorStatusText = computed(() => cursorSourceStatusText({
  enabled: props.snapshot.settings.providers.cursor === true,
  available: props.snapshot.cursorAvailable,
  reason: props.snapshot.cursorInventoryReason,
  sessionCount: props.snapshot.cursorSessionCount,
  hooks: props.snapshot.cursorHooks
}))
const cursorRegistered = computed(() => {
  const hooks = props.snapshot.cursorHooks
  return hooks === 'installed' || hooks === 'outdated'
})
const cursorRegistrationGrid = computed(() => cursorRegistrationRows(props.snapshot.cursorHooks))

function toggleCursor(enabled: boolean) {
  update({ providers: { ...props.snapshot.settings.providers, cursor: enabled } })
}

function registerClaude(register: boolean) {
  emit('dispatch', 'codex.claude.register', { register, statusline: true })
}

function registerCursor(register: boolean) {
  emit('dispatch', 'codex.cursor.register', { register })
}

function changeStyle(style: CodexDisplayStyle) {
  if (style !== props.snapshot.settings.displayStyle) update({ displayStyle: style })
}

function toggleField<T extends string>(fields: T[], field: T, checked: boolean, key: 'compactFields' | 'expandedFields') {
  const next = checked ? [...new Set([...fields, field])] : fields.filter((item) => item !== field)
  update({ [key]: next } as Partial<CodexSettings>)
}

function applyThemePreset(preset: { colors: CodexColorSettings, waterAppearance: CodexWaterAppearanceSettings, expandedCardAppearance: CodexExpandedCardAppearanceSettings }, source: string) {
  waterDraft.value = cloneWaterAppearance(preset.waterAppearance)
  update({
    colors: { ...preset.colors },
    waterAppearance: cloneWaterAppearance(preset.waterAppearance),
    expandedCardAppearance: cloneExpandedCardAppearance(preset.expandedCardAppearance)
  })
  savedThemeOption.value = source
}

function applyThemePresetBySelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  themePresetError.value = ''
  if (!value || value === THEME_PRESET_CUSTOM) return
  savedThemeOption.value = value
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

function saveCurrentThemePreset() {
  const name = sanitizeThemeName(savedThemeName.value)
  if (!name) {
    themePresetError.value = '请先填写主题名称'
    return
  }
  const colors = { ...props.snapshot.settings.colors }
  const waterAppearance = cloneWaterAppearance(props.snapshot.settings.waterAppearance)
  const expandedCardAppearance = cloneExpandedCardAppearance(props.snapshot.settings.expandedCardAppearance)
  const now = Date.now()
  const existingSavedId = savedThemeOption.value.startsWith(THEME_PRESET_SAVED_PREFIX)
    ? savedThemeOption.value.slice(THEME_PRESET_SAVED_PREFIX.length)
    : null
  const next = [...props.snapshot.settings.savedThemePresets]
  const existing = existingSavedId ? next.findIndex((item) => item.id === existingSavedId) : -1

  if (existing >= 0) {
    next[existing] = {
      ...next[existing],
      name,
      colors,
      waterAppearance,
      expandedCardAppearance,
      updatedAt: now
    }
  } else {
    const sameNameIndex = next.findIndex((item) => item.name === name)
    if (sameNameIndex >= 0) {
      next[sameNameIndex] = {
        ...next[sameNameIndex],
        name,
        colors,
        waterAppearance,
        expandedCardAppearance,
        updatedAt: now
      }
    } else {
      next.unshift({
        id: generateThemePresetId(),
        name,
        colors,
        waterAppearance,
        expandedCardAppearance,
        createdAt: now,
        updatedAt: now
      })
    }
  }

  const sanitized = next.slice(0, MAX_SAVED_THEME_PRESETS)
  const ordered = [...sanitized].sort((a, b) => b.updatedAt - a.updatedAt)
  update({ savedThemePresets: ordered })
  themePresetError.value = ''
  const selected = ordered.find((entry) => entry.name === name
    && JSON.stringify(entry.colors) === JSON.stringify(colors)
    && JSON.stringify(entry.waterAppearance) === JSON.stringify(waterAppearance)
    && JSON.stringify(entry.expandedCardAppearance) === JSON.stringify(expandedCardAppearance))
  if (selected) {
    savedThemeOption.value = `${THEME_PRESET_SAVED_PREFIX}${selected.id}`
    savedThemeName.value = selected.name
  }
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
      <span class="codex-eyebrow"><Bot :size="15" /> CODEX · CLAUDE COMPANION</span>
      <h1>额度任务悬浮球</h1>
    </div>
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
          <EyeOff v-if="snapshot.settings.floatEnabled" :size="15" aria-hidden="true" />
          <Eye v-else :size="15" aria-hidden="true" />
          {{ snapshot.settings.floatEnabled ? '隐藏桌面悬浮' : '显示桌面悬浮' }}
        </button>
        <span
          class="codex-status-pill"
          :class="[snapshot.quota.status, { busy: snapshot.refreshing }]"
          :aria-busy="snapshot.refreshing ? 'true' : undefined"
          data-operation-tooltip="连接状态"
          :data-operation-description="statusLabel"
        >
          <LoaderCircle v-if="snapshot.refreshing" :size="12" class="spinning" aria-hidden="true" />
          {{ statusLabel }}
        </span>
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
    <section v-if="activeConfigTab === 'runtime'" class="codex-diagnostic" :class="[environmentPresentation.diagnostic.tone, { busy: environmentPresentation.busy }]">
      <div
        class="codex-diagnostic-copy"
        :role="environmentPresentation.diagnostic.role"
        :aria-live="environmentPresentation.diagnostic.role === 'alert' ? 'polite' : undefined"
        :aria-atomic="environmentPresentation.diagnostic.role === 'alert' ? 'true' : undefined"
        :aria-busy="environmentPresentation.busy ? 'true' : undefined"
      >
        <LoaderCircle v-if="environmentPresentation.diagnostic.tone === 'checking'" :size="19" class="spinning" aria-hidden="true" />
        <CircleCheckBig v-else-if="environmentPresentation.diagnostic.tone === 'ready'" :size="19" aria-hidden="true" />
        <AlertTriangle v-else :size="19" aria-hidden="true" />
        <div class="codex-diagnostic-heading">
          <strong>{{ environmentPresentation.diagnostic.title }}</strong>
          <p>{{ environmentPresentation.diagnostic.detail }}</p>
        </div>
      </div>
      <dl class="codex-diagnostic-grid">
        <div v-for="row in environmentPresentation.rows" :key="row.label">
          <dt :class="{ 'has-detail': row.detail }">
            <span>{{ row.label }}</span>
            <button
              v-if="row.detail"
              type="button"
              class="codex-tip codex-diagnostic-tip"
              :aria-label="`${row.label}详情`"
              :data-operation-tooltip="`${row.label}详情`"
              :data-operation-description="row.detail"
              :data-tip="row.detail"
            >i</button>
          </dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
      <form class="codex-launch-config" @submit.prevent="saveLaunchPath">
        <div class="codex-launch-copy">
          <strong>连接位置</strong>
          <button
            type="button"
            class="codex-tip"
            aria-label="连接位置说明"
            data-operation-tooltip="连接位置说明"
            :data-operation-description="environmentPresentation.launchHelpText"
            :data-tip="environmentPresentation.launchHelpText"
          >i</button>
        </div>
        <label class="codex-launch-field" for="codex-launch-path">
          <span>手动指定 Codex CLI 路径（可选）</span>
          <input
            id="codex-launch-path"
            v-model="manualLaunchPath"
            class="codex-input codex-launch-path-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :aria-invalid="launchPathError ? 'true' : undefined"
            :aria-describedby="launchPathError ? 'codex-launch-path-error' : undefined"
            placeholder="选择 codex 或 codex.exe 的完整路径"
          />
        </label>
        <div class="codex-launch-actions">
          <button type="button" class="secondary" :disabled="snapshot.refreshing" @click="$emit('dispatch', 'codex.pick-launch-path')">从磁盘选择</button>
          <button type="submit" class="secondary" :disabled="snapshot.refreshing">使用此位置</button>
          <button
            type="button"
            class="secondary"
            :disabled="snapshot.refreshing || snapshot.environment.launchMode !== 'manual'"
            @click="clearLaunchPath"
          >恢复自动发现</button>
        </div>
        <p v-if="launchPathError" id="codex-launch-path-error" class="codex-launch-error" role="alert">{{ launchPathError }}</p>
        <ul v-if="environmentPresentation.launchCandidates.length" class="codex-launch-candidates" aria-label="已发现的 Codex 启动来源">
          <li v-for="candidate in environmentPresentation.launchCandidates" :key="`${candidate.source}-${candidate.state}`">
            {{ candidate.label }} · {{ candidate.state === 'available' ? '可用' : '不可用' }}
          </li>
        </ul>
      </form>
        <button
          type="button"
          class="secondary"
          :disabled="snapshot.refreshing || snapshot.environment.checking"
          data-operation-tooltip="重新检测"
          data-operation-description="立即重新核查当前 Codex 运行环境与连接可用性。"
          @click="$emit('dispatch', 'codex.inspect-environment')"
        >
          <RefreshCw :size="14" :class="{ spinning: snapshot.refreshing || snapshot.environment.checking }" />重新检测
        </button>
    </section>

    <div class="codex-workbench">
      <article v-if="activeConfigTab === 'shortcuts'" class="codex-panel codex-settings-section codex-shortcuts-panel">
        <div class="codex-panel-title">
          <div><LayoutDashboard :size="17" /><strong>快捷方式</strong></div>
          <button
            type="button"
            class="codex-tip"
            aria-label="快捷方式说明"
            data-operation-tooltip="快捷方式说明"
            data-operation-description="这里只跳转到 uTools 快捷键设置或执行入口动作，不读取、回显任何宿主快捷键绑定。"
            data-tip="这里只跳转到 uTools 快捷键设置或执行入口动作，不读取、回显任何宿主快捷键绑定。"
          >i</button>
        </div>
        <div class="codex-shortcut-stack">
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>悬浮球开关</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，显示或隐藏 Codex 悬浮球。"
              data-operation-tooltip="配置悬浮球开关快捷键"
              data-operation-description="打开 uTools 全局功能，为“切换 Codex 悬浮球”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.float.toggle.hotkey.configure')"
            >去设置</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>直接展开卡片</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，显示并展开卡片、把焦点交给会话列表。"
              data-operation-tooltip="配置进入卡片快捷键"
              data-operation-description="打开 uTools 全局功能，为“直接展开 Codex 卡片”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.hotkey.configure')"
            >去设置</button>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="快捷键也可触发：⌘⌥↵（macOS）或 Ctrl+Alt+Enter（Windows），立即展开并聚焦会话列表。"
              data-operation-tooltip="立即展开"
              data-operation-description="快捷键也可触发：⌘⌥↵（macOS）或 Ctrl+Alt+Enter（Windows），立即展开并聚焦会话列表。"
              @click="$emit('dispatch', 'codex.float.activate')"
            >立即展开</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span>
              <strong>快速任务查看</strong>
              <small>展开动态列表并进入筛选模式：直接打字筛选，c-1…0 打开对应编号任务。</small>
            </span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键；展开卡片、聚焦搜索并给前 10 条任务编号。"
              data-operation-tooltip="配置快速任务查看快捷键"
              data-operation-description="打开 uTools 全局功能，为“快速任务查看”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.quick.hotkey.configure')"
            >去设置</button>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="快捷键也可触发：⌘⌥K（macOS）或 Ctrl+Alt+K（Windows）。"
              data-operation-tooltip="立即进入筛选模式"
              data-operation-description="快捷键也可触发：⌘⌥K（macOS）或 Ctrl+Alt+K（Windows）。"
              @click="$emit('dispatch', 'codex.quick.activate')"
            >立即进入</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>待输入任务</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键；最新优先，连续触发依次打开待输入任务。"
              data-operation-tooltip="配置待输入快捷键"
              data-operation-description="打开 uTools 全局功能，为“打开 Codex 待输入任务”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.input.hotkey.configure')"
            >去设置</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>已完成未读任务</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键；最新优先，连续触发依次打开已完成未读任务。"
              data-operation-tooltip="配置已完成未读快捷键"
              data-operation-description="打开 uTools 全局功能，为“依次打开 Codex 已完成未读任务”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.completed-unread.hotkey.configure')"
            >去设置</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>上一个 Codex 任务</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，在待输入、已完成未读和进行中任务之间循环到上一项。"
              data-operation-tooltip="配置上一个任务快捷键"
              data-operation-description="打开 uTools 全局功能，为“上一个 Codex 任务”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.task.previous.hotkey.configure')"
            >去设置</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>下一个 Codex 任务</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，在待输入、已完成未读和进行中任务之间循环到下一项。"
              data-operation-tooltip="配置下一个任务快捷键"
              data-operation-description="打开 uTools 全局功能，为“下一个 Codex 任务”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.task.next.hotkey.configure')"
            >去设置</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span>
              <strong>归档当前任务</strong>
              <small>归档卡片里当前高亮或已选中的 Codex / Claude 任务；不可归档时保持原状并提示。</small>
            </span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，归档当前 Companion 任务。"
              data-operation-tooltip="配置归档当前任务快捷键"
              data-operation-description="打开 uTools 全局功能，为“归档当前 Companion 任务”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.archive.hotkey.configure')"
            >去设置</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>Action 执行工作台</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，打开独立的 Action Runner 工作台。"
              data-operation-tooltip="配置 Action Runner 快捷键"
              data-operation-description="打开 uTools 全局功能，为“打开 Action 执行工作台”绑定系统级快捷键。"
              @click="$emit('dispatch', 'codex.actionRunner.hotkey.configure')"
            >去设置</button>
          </div>
          <div
            v-for="slot in 5"
            :key="`action-slot-${slot}`"
            class="codex-hotkey-row"
          >
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>Action 槽 {{ slot }}</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              :title="`配置 uTools 全局快捷键，执行 Environment Action 槽 ${slot}（EyPc 等价执行，非 Codex 原生 Action）。`"
              :data-operation-tooltip="`配置 Action 槽 ${slot} 快捷键`"
              :data-operation-description="`打开 uTools 全局功能，为“Codex Action 槽 ${slot}”绑定系统级快捷键。目标优先 Action 默认项目，否则置顶/项目 Tab。`"
              @click="$emit('dispatch', `codex.action.run.${slot}.hotkey.configure`)"
            >去设置</button>
          </div>
        </div>
      </article>

      <article v-if="activeConfigTab === 'tasks'" class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><SlidersHorizontal :size="17" /><strong>内容</strong></div>
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
          <div><BellRing :size="17" /><strong>任务</strong></div>
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
          <Check :size="15" />
          <strong>待确认持久化</strong>
        </div>
      </article>

      <article v-if="activeConfigTab === 'water' || activeConfigTab === 'card'" class="codex-panel codex-settings-section codex-appearance-panel">
        <div class="codex-panel-title">
          <div><Palette :size="17" /><strong>{{ activeConfigTab === 'water' ? '悬浮水球' : '展开卡片' }}</strong></div>
          <button type="button" class="codex-tip" aria-label="外观配置说明" data-operation-tooltip="外观配置说明" data-operation-description="主题预设会同时保存水球与展开卡片；当前页只展示所选目标的预览与控件。" data-tip="主题预设会同时保存水球与展开卡片；当前页只展示所选目标的预览与控件。">i</button>
        </div>
        <div class="codex-theme-toolbar">
          <label>
            <span>整套主题</span>
            <select class="codex-select" :value="savedThemeOption" @change="applyThemePresetBySelect">
              <option :value="THEME_PRESET_CUSTOM">当前配置（未匹配）</option>
              <optgroup label="默认样式"><option v-for="preset in CODEX_THEME_PRESETS" :key="preset.id" :value="`${THEME_PRESET_BUILTIN_PREFIX}${preset.id}`">{{ preset.label }} · {{ preset.description }}</option></optgroup>
              <optgroup v-if="snapshot.settings.savedThemePresets.length" label="已保存"><option v-for="preset in snapshot.settings.savedThemePresets" :key="preset.id" :value="`${THEME_PRESET_SAVED_PREFIX}${preset.id}`">{{ preset.name }}</option></optgroup>
            </select>
          </label>
          <label class="codex-theme-name"><span>保存当前外观</span><input v-model="savedThemeName" type="text" class="codex-input" maxlength="40" placeholder="主题名称" /></label>
          <button type="button" class="secondary" @click="saveCurrentThemePreset">另存主题</button>
        </div>
        <p v-if="themePresetError" class="codex-color-error" role="alert">{{ themePresetError }}</p>

        <div class="codex-appearance-zones" :class="{ 'card-only': activeConfigTab === 'card' }">
          <section v-if="activeConfigTab === 'water'" class="codex-appearance-zone codex-appearance-zone--water" aria-labelledby="water-appearance-title">
            <div class="codex-appearance-zone-head"><div><span>01 · 悬浮水球</span><h3 id="water-appearance-title">水球外观</h3></div><button type="button" class="codex-tip" aria-label="水球外观说明" data-operation-tooltip="水球外观说明" data-operation-description="预览与桌面水球共用渲染；可分别控制球体背景、液体、Weekly 进度环、百分比读数和三类数字角标。" data-tip="预览与桌面水球共用渲染；可分别控制球体背景、液体、Weekly 进度环、百分比读数和三类数字角标。">i</button></div>
            <div class="codex-water-appearance-preview" :style="waterPreviewStyle" aria-label="与真实悬浮水球一致的颜色部位预览">
              <CodexWaterBall
                :primary="waterPreview.primary"
                :secondary="waterPreview.secondary"
                :state-label="waterPreview.stateLabel"
                :label="`${waterPreview.ariaLabel}${companionPreview.ariaSuffix}`"
                :percent-override="companionPreview.percentOverride"
                :scoped-percent="companionPreview.scopedPercent"
                :percent-provider-label="companionPreview.percentProviderLabel"
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

          <section v-if="activeConfigTab === 'card'" class="codex-appearance-zone codex-appearance-zone--card" aria-labelledby="card-appearance-title">
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

          <section v-if="activeConfigTab === 'water'" class="codex-appearance-zone codex-appearance-zone--signals" aria-labelledby="signal-appearance-title">
            <div class="codex-appearance-zone-head"><div><span>02 · 状态信号</span><h3 id="signal-appearance-title">额度状态色</h3></div><button type="button" class="codex-tip" aria-label="额度状态颜色说明" data-operation-tooltip="额度状态颜色说明" data-operation-description="用于跟随额度状态的 Weekly 进度和状态强调：充足、提醒、紧张。" data-tip="用于跟随额度状态的 Weekly 进度和状态强调：充足、提醒、紧张。">i</button></div>
            <div class="codex-signal-controls"><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.healthy" @input="updateColor('healthy', ($event.target as HTMLInputElement).value)" /><span><strong>充足</strong><small>高额度状态</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.warning" @input="updateColor('warning', ($event.target as HTMLInputElement).value)" /><span><strong>提醒</strong><small>中额度状态</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.critical" @input="updateColor('critical', ($event.target as HTMLInputElement).value)" /><span><strong>紧张</strong><small>低额度状态</small></span></label></div>
          </section>
        </div>
      </article>

      <article v-if="activeConfigTab === 'runtime'" class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><CircleGauge :size="17" /><strong>接入来源</strong></div>
          <button
            type="button"
            class="codex-tip"
            aria-label="接入来源区域说明"
            data-operation-tooltip="接入来源区域说明"
            data-operation-description="Codex、Claude Code 与 Cursor Agent 是独立来源，可分别开关。关闭的来源完全不读取。Cursor 只列本机 Agent 卡片，不读额度；点卡片经官方 deeplink 跳到该对话。"
            data-tip="Codex、Claude Code 与 Cursor Agent 是独立来源，可分别开关。关闭的来源完全不读取。Cursor 只列本机 Agent 卡片，不读额度；点卡片经官方 deeplink 跳到该对话。"
          >i</button>
        </div>
        <label class="codex-switch-row">
          <span>
            <strong>接入 Claude Code</strong>
            <small>{{ claudeStatusText }}</small>
          </span>
          <input
            type="checkbox"
            :checked="snapshot.settings.providers.claude"
            data-operation-tooltip="接入 Claude Code"
            data-operation-description="开启后，Claude Code 会话与 Codex 任务在同一水球中按状态汇总；关闭时完全不读取 Claude 数据。Claude 桌面端在本机运行的会话同属这一开关，只读取会话元数据与事件日志，无需注册任何东西；从卡片打开它们只能把桌面端前置，再由你在应用内选中该会话。"
            @change="toggleClaude(($event.target as HTMLInputElement).checked)"
          />
          <i />
        </label>
        <label class="codex-switch-row">
          <span>
            <strong>接入 Cursor Agent</strong>
            <small>{{ cursorStatusText }}</small>
          </span>
          <input
            type="checkbox"
            :checked="snapshot.settings.providers.cursor"
            data-operation-tooltip="接入 Cursor Agent"
            data-operation-description="开启后只读本机 Cursor Agent 会话元数据并列入同一任务清单；默认关闭。不做额度。事件钩子需点下方按钮确认后才写入 ~/.cursor/hooks.json。点卡片经 Cursor 官方 deeplink 跳到该对话（Cursor 未运行会先被启动）。"
            @change="toggleCursor(($event.target as HTMLInputElement).checked)"
          />
          <i />
        </label>
        <dl v-if="snapshot.settings.providers.cursor" class="codex-diagnostic-grid codex-claude-grid">
          <div v-for="row in cursorRegistrationGrid" :key="row.id">
            <dt class="has-detail">
              <span>{{ row.label }}</span>
              <button
                type="button"
                class="codex-tip codex-diagnostic-tip"
                :aria-label="`${row.label}详情`"
                :data-operation-tooltip="`${row.label}详情`"
                :data-operation-description="row.detail"
                :data-tip="row.detail"
              >i</button>
            </dt>
            <dd :class="`is-${row.tone}`">{{ row.value }}</dd>
          </div>
        </dl>
        <div v-if="snapshot.settings.providers.cursor" class="codex-claude-actions">
          <button
            type="button"
            class="codex-secondary-button"
            data-operation-tooltip="注册 Cursor 事件钩子"
            data-operation-description="向 ~/.cursor/hooks.json 加法写入 EyPc 的观察脚本引用；保留你已有的钩子，可随时移除。失败开放，不阻断 Cursor。"
            @click="registerCursor(true)"
          >{{ cursorRegistered ? '重新注册钩子' : '注册事件钩子' }}</button>
          <button
            v-if="cursorRegistered"
            type="button"
            class="codex-secondary-button"
            data-operation-tooltip="移除 Cursor 事件钩子"
            data-operation-description="从 ~/.cursor/hooks.json 移除 EyPc 写入的条目，保留你原有的钩子。"
            @click="registerCursor(false)"
          >移除钩子</button>
        </div>
        <label v-if="snapshot.settings.providers.claude" class="codex-switch-row">
          <span>
            <strong>允许读取 Claude App 额度</strong>
          </span>
          <input
            type="checkbox"
            :checked="snapshot.settings.claudeAppQuotaAccess"
            data-operation-tooltip="允许读取 Claude App 额度"
            data-operation-description="默认关闭。开启后只读 Claude App 当前账号的加密登录缓存，用于读取 5 小时、总周额度和模型周额度；令牌只在请求期间存在，不写入 EyPc，也不进入诊断。多个账号无法唯一确认时会停止读取。"
            @change="update({ claudeAppQuotaAccess: ($event.target as HTMLInputElement).checked, claudeQuotaFallback: false })"
          />
          <i />
        </label>
        <dl v-if="snapshot.settings.providers.claude" class="codex-diagnostic-grid codex-claude-grid">
          <div v-for="row in claudeRegistrationGrid" :key="row.id">
            <dt class="has-detail">
              <span>{{ row.label }}</span>
              <button
                type="button"
                class="codex-tip codex-diagnostic-tip"
                :aria-label="`${row.label}详情`"
                :data-operation-tooltip="`${row.label}详情`"
                :data-operation-description="row.detail"
                :data-tip="row.detail"
              >i</button>
            </dt>
            <dd :class="`is-${row.tone}`">{{ row.value }}</dd>
          </div>
        </dl>
        <div v-if="snapshot.settings.providers.claude" class="codex-claude-actions">
          <button
            type="button"
            class="codex-secondary-button"
            data-operation-tooltip="注册 Claude 事件钩子"
            data-operation-description="向 ~/.claude/settings.json 写入 EyPc 的事件钩子与状态栏包装；保留你已有的钩子与状态栏，可随时移除。"
            @click="registerClaude(true)"
          >{{ claudeRegistered ? '重新注册钩子' : '注册事件钩子' }}</button>
          <button
            v-if="claudeRegistered"
            type="button"
            class="codex-secondary-button"
            data-operation-tooltip="移除 Claude 事件钩子"
            data-operation-description="从 ~/.claude/settings.json 移除 EyPc 写入的条目并还原你原有的状态栏。"
            @click="registerClaude(false)"
          >移除钩子</button>
        </div>
      </article>

      <article v-if="activeConfigTab === 'runtime'" class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><CircleGauge :size="17" /><strong>额度与 Codex 配置</strong></div>
          <button
            type="button"
            class="codex-tip"
            aria-label="额度与配置区域说明"
            data-operation-tooltip="额度与配置区域说明"
            data-operation-description="包含模型策略、额度自动更新与窗口几何设置。"
            data-tip="包含模型策略、额度自动更新与窗口几何设置。"
          >i</button>
        </div>
        <div class="codex-config-facts">
          <div><span>套餐</span><strong>{{ snapshot.quota.plan || '未提供' }}</strong></div>
          <div><span>模型</span><strong>{{ snapshot.config.model || '未提供' }}</strong></div>
          <div><span>Reasoning</span><strong>{{ snapshot.config.reasoningEffort || '未提供' }}</strong></div>
          <div><span>Service tier</span><strong>{{ snapshot.config.serviceTier || '未提供' }}</strong></div>
        </div>
        <div class="codex-form-grid refresh-grid">
          <label>
            <span>额度刷新（秒）</span>
            <input
              class="codex-number"
              type="number"
              :min="CODEX_MIN_QUOTA_REFRESH_SECONDS"
              :max="CODEX_MAX_QUOTA_REFRESH_SECONDS"
              step="1"
              :value="snapshot.settings.quotaRefreshSeconds"
              @change="update({ quotaRefreshSeconds: Number(($event.target as HTMLInputElement).value) })"
              data-operation-tooltip="额度刷新（秒）"
              data-operation-description="按整数秒设置自动额度刷新周期；默认 300 秒，最大 86400 秒。"
            />
          </label>
          <button
            type="button"
            class="secondary"
            :title="'重置浮窗到首次配置记录的尺寸与位置。'"
            data-operation-tooltip="重置浮窗位置"
            data-operation-description="恢复浮窗尺寸与窗口位置到首次配置记录，不影响当前布局策略。"
            @click="$emit('dispatch', 'codex.float.position.reset')"
          >
            <RotateCcw :size="14" />重置浮窗位置
          </button>
        </div>
        <div class="codex-model-policy-card" role="note">
          <div class="codex-model-policy-copy">
            <strong>模型策略：普通优先，自动兜底 Spark</strong>
            <span class="codex-model-policy-summary">当前生效：{{ preferredModelMode }} · {{ preferredModelName }}</span>
          </div>
          <label class="codex-model-policy-select">
            <span>新会话普通模型</span>
            <select
              class="codex-select"
              :value="snapshot.settings.newThreadPreferredModel"
              :disabled="!ordinaryModels.length"
              @change="update({ newThreadPreferredModel: ($event.target as HTMLSelectElement).value })"
              title="空则使用目录默认模型"
              data-operation-tooltip="新会话普通模型"
              data-operation-description="未选择则使用目录默认普通模型；普通模型不可用时自动回退可用优先项。"
            >
              <option value="">目录默认非 Spark 模型</option>
              <option v-for="model in ordinaryModels" :key="model.id" :value="model.id">{{ model.displayName }} · {{ model.id }}</option>
            </select>
          </label>
        </div>
        <div class="codex-size-summary">
          <span>
            <strong>{{ snapshot.floatHost.expandedManual ? `展开面板：${snapshot.floatHost.expandedWidth} × ${snapshot.floatHost.expandedHeight}` : '展开面板：内容自适应' }}</strong>
            <button type="button" class="codex-tip" aria-label="展开面板尺寸说明" data-operation-tooltip="展开面板尺寸说明" :data-operation-description="snapshot.floatHost.expandedManual ? `按显示器保存${snapshot.floatHost.displayId ? ` · ${snapshot.floatHost.displayId}` : ''}` : '默认宽 360px，高度随内容在 280–460px 间变化'" :data-tip="snapshot.floatHost.expandedManual ? `按显示器保存${snapshot.floatHost.displayId ? ` · ${snapshot.floatHost.displayId}` : ''}` : '默认宽 360px，高度随内容在 280–460px 间变化'">i</button>
          </span>
          <button
            type="button"
            class="secondary"
            :disabled="!snapshot.floatHost.expandedManual"
            data-operation-tooltip="恢复自适应尺寸"
            data-operation-description="恢复浮窗为内容驱动尺寸，清空手动修改后的宽高。"
            @click="$emit('dispatch', 'codex.float.size.reset', { displayId: snapshot.floatHost.displayId })"
          >
            <RotateCcw :size="14" />恢复自适应尺寸
          </button>
        </div>
        <div class="codex-size-summary codex-runtime-build" role="status" aria-label="当前宿主产物构建时间">
          <span>
            <span>
              <strong>当前宿主产物：<time :datetime="runtimeBuildPresentation.builtAt || undefined">{{ runtimeBuildPresentation.builtAtLocal }}</time></strong>
              <small>{{ runtimeBuildPresentation.summary }}</small>
            </span>
            <button type="button" class="codex-tip" aria-label="构建时间凭据说明" data-operation-tooltip="构建时间凭据说明" :data-operation-description="runtimeBuildPresentation.detail" :data-tip="runtimeBuildPresentation.detail">i</button>
          </span>
        </div>
        <div class="codex-size-summary codex-workspace-diagnostic">
          <span>
            <strong>{{ snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '跨桌面置顶：已启用' : snapshot.floatHost.workspaceVisibility?.supported ? '跨桌面置顶：核验失败' : '跨桌面置顶：当前平台不支持' }}</strong>
            <button type="button" class="codex-tip" aria-label="跨桌面置顶说明" data-operation-tooltip="跨桌面置顶说明" :data-operation-description="snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '当前显示器的所有 Space 与全屏 Space 可见' : snapshot.floatHost.workspaceVisibility?.errorCode || '等待悬浮窗宿主核验'" :data-tip="snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '当前显示器的所有 Space 与全屏 Space 可见' : snapshot.floatHost.workspaceVisibility?.errorCode || '等待悬浮窗宿主核验'">i</button>
          </span>
        </div>
        <div v-if="snapshot.floatHost.workspaceVisibility?.health" class="codex-size-summary codex-float-health">
          <span>
            <strong>{{ snapshot.floatHost.workspaceVisibility.health.recoveryDeadline > Date.now() ? '悬浮球健康：正在恢复' : snapshot.floatHost.workspaceVisibility.health.alive ? '悬浮球健康：心跳通道已建立' : snapshot.floatHost.workspaceVisibility.health.persistent ? '悬浮球健康：等待自动恢复' : '悬浮球健康：当前未启用' }}</strong>
            <button type="button" class="codex-tip" aria-label="悬浮球健康说明" data-operation-tooltip="悬浮球健康说明" :data-operation-description="`最近心跳 ${formatDiagnosticTime(snapshot.floatHost.workspaceVisibility.health.lastHeartbeatAt)} · 最近重建 ${formatDiagnosticTime(snapshot.floatHost.workspaceVisibility.health.lastRecreateAt)} · 当前交互 ${snapshot.floatHost.workspaceVisibility.health.interaction}`" :data-tip="`最近心跳 ${formatDiagnosticTime(snapshot.floatHost.workspaceVisibility.health.lastHeartbeatAt)} · 最近重建 ${formatDiagnosticTime(snapshot.floatHost.workspaceVisibility.health.lastRecreateAt)} · 当前交互 ${snapshot.floatHost.workspaceVisibility.health.interaction}`">i</button>
          </span>
        </div>
        <section v-if="snapshot.runtimeDiagnostics" class="codex-runtime-log" aria-labelledby="codex-runtime-log-title">
          <header>
            <div>
              <strong id="codex-runtime-log-title">全局安装诊断日志</strong>
              <small>精确记录运行 ID、Provider 状态、水位、缓存、路径、动作结果与耗时；可在这里直接启停和切换等级，设置页保留同一入口。</small>
            </div>
            <span :class="`is-${snapshot.runtimeDiagnostics.status}`">{{ snapshot.runtimeDiagnostics.status === 'ok' ? '正常写入' : snapshot.runtimeDiagnostics.status === 'degraded' ? '写入降级' : snapshot.runtimeDiagnostics.status === 'disabled' ? '已关闭' : '不可用' }}</span>
          </header>
          <div class="codex-runtime-log-controls" role="group" aria-label="安装诊断日志控制">
            <label class="codex-runtime-log-toggle">
              <input
                type="checkbox"
                aria-label="启用安装诊断日志"
                :checked="snapshot.runtimeDiagnostics.settings.enabled"
                @change="configureRuntimeDiagnostics({ enabled: ($event.target as HTMLInputElement).checked })"
              />
              <span>
                <strong>{{ snapshot.runtimeDiagnostics.settings.enabled ? '日志已开启' : '日志已关闭' }}</strong>
                <small>立即生效并持久化</small>
              </span>
            </label>
            <label class="codex-runtime-log-level" for="codex-runtime-diagnostics-level">
              <span>记录级别</span>
              <select
                id="codex-runtime-diagnostics-level"
                aria-label="安装诊断日志记录级别"
                :value="snapshot.runtimeDiagnostics.settings.level"
                @change="configureRuntimeDiagnostics({ level: ($event.target as HTMLSelectElement).value as RuntimeDiagnosticsLevel })"
              >
                <option value="error">error · 失败</option>
                <option value="info">info · 关键流程</option>
                <option value="debug">debug · 完整诊断</option>
              </select>
            </label>
          </div>
          <dl class="codex-runtime-log-facts">
            <div><dt>事件</dt><dd>{{ snapshot.runtimeDiagnostics.totals.events }}</dd></div>
            <div><dt>慢操作 ≥250ms</dt><dd>{{ snapshot.runtimeDiagnostics.totals.slow }}</dd></div>
            <div><dt>debug / info / error</dt><dd>{{ snapshot.runtimeDiagnostics.totals.debug }} / {{ snapshot.runtimeDiagnostics.totals.info }} / {{ snapshot.runtimeDiagnostics.totals.error }}</dd></div>
            <div><dt>落盘</dt><dd>{{ snapshot.runtimeDiagnostics.storage.fileCount }} 文件 · {{ formatDiagnosticBytes(snapshot.runtimeDiagnostics.storage.totalBytes) }}</dd></div>
          </dl>
          <div class="codex-runtime-log-actions" role="group" aria-label="安装诊断日志文件操作">
            <button
              type="button"
              aria-label="打开当前安装诊断日志文件"
              data-operation-tooltip="打开当前日志文件"
              :data-disabled-reason="snapshot.runtimeDiagnostics.activeFile ? undefined : '尚未生成日志文件'"
              :disabled="!snapshot.runtimeDiagnostics.activeFile"
              @click="emit('dispatch', 'runtime.logs.openFile')"
            >打开当前文件</button>
            <button
              type="button"
              aria-label="打开安装诊断日志目录"
              data-operation-tooltip="在文件管理器中打开日志目录"
              @click="emit('dispatch', 'runtime.logs.openDirectory')"
            >打开日志目录</button>
            <button
              type="button"
              class="danger"
              aria-label="清空安装诊断日志文件"
              data-operation-tooltip="清空安装诊断日志"
              :data-disabled-reason="snapshot.runtimeDiagnostics.storage.fileCount ? undefined : '当前没有可清理的日志文件'"
              :disabled="snapshot.runtimeDiagnostics.storage.fileCount === 0"
              @click="emit('dispatch', 'runtime.logs.clear')"
            >清空日志</button>
          </div>
          <ul v-if="runtimeDiagnosticHighlights.length" class="codex-runtime-log-events" aria-label="最近慢操作与异常">
            <li v-for="entry in runtimeDiagnosticHighlights" :key="`${entry.sessionId}:${entry.seq}`" :class="`is-${entry.level}`">
              <time :datetime="new Date(entry.at).toISOString()">{{ formatDiagnosticTime(entry.at) }}</time>
              <strong>{{ entry.scope }} · {{ entry.event }}</strong>
              <span>{{ entry.outcome }}<template v-if="entry.code"> · {{ entry.code }}</template><template v-if="entry.durationMs"> · {{ entry.durationMs }}ms</template><template v-if="entry.cache"> · cache:{{ entry.cache }}</template></span>
            </li>
          </ul>
          <p v-else class="codex-runtime-log-empty">暂无慢操作或异常事件。</p>
          <footer>级别 {{ snapshot.runtimeDiagnostics.settings.level }}；单文件上限 {{ formatDiagnosticBytes(snapshot.runtimeDiagnostics.storage.maxFileBytes) }}，总量上限 {{ formatDiagnosticBytes(snapshot.runtimeDiagnostics.storage.maxTotalBytes) }}，保留 {{ snapshot.runtimeDiagnostics.storage.retentionDays }} 天；最近事件 {{ formatDiagnosticTime(snapshot.runtimeDiagnostics.updatedAt) }}。不写入提示词、对话正文、命令参数、stdout/stderr、凭据或隐藏推理。</footer>
        </section>
      </article>
    </div>
    </section>
  </section>
</template>
