<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
import CodexCardColorDialog from '../components/CodexCardColorDialog.vue'
import {
  CODEX_THEME_PRESETS,
  matchCodexThemePreset
} from '../domain/codexAppearance'
import type {
  CodexColorSettings,
  CodexCompactField,
  CodexDisplayStyle,
  CodexSettings,
  CodexSavedThemePreset,
  CodexWaterAppearanceSettings
} from '../domain/codex'
import type { CodexRuntimeView } from '../runtime/codexController'

const props = defineProps<{ snapshot: CodexRuntimeView }>()
const emit = defineEmits<{ dispatch: [actionId: string, args?: Record<string, unknown>] }>()
const colorError = ref('')
const waterAppearanceError = ref('')
const themePresetError = ref('')
const manualLaunchPath = ref('')
const launchPathError = ref('')
const cardColorDialogOpen = ref(false)
let cardColorTrigger: HTMLElement | null = null
const THEME_PRESET_BUILTIN_PREFIX = 'builtin:'
const THEME_PRESET_SAVED_PREFIX = 'saved:'
const THEME_PRESET_CUSTOM = 'custom'
const MAX_SAVED_THEME_PRESETS = 20

function cloneWaterAppearance(value: CodexWaterAppearanceSettings): CodexWaterAppearanceSettings {
  return { inner: { ...value.inner }, outer: { ...value.outer } }
}

const waterDraft = ref<CodexWaterAppearanceSettings>(cloneWaterAppearance(props.snapshot.settings.waterAppearance))
const savedThemeName = ref('')
const savedThemeOption = ref(THEME_PRESET_CUSTOM)

const compactOptions: Array<{ id: CodexCompactField; label: string }> = [
  { id: 'tasks', label: '任务数字' }
]
function matchesThemePreset(theme: Pick<CodexSavedThemePreset, 'colors' | 'waterAppearance'>, colors: CodexColorSettings, waterAppearance: CodexWaterAppearanceSettings) {
  return JSON.stringify(theme.colors) === JSON.stringify(colors) && JSON.stringify(theme.waterAppearance) === JSON.stringify(waterAppearance)
}

const activeThemeOption = computed(() => {
  const colors = props.snapshot.settings.colors
  const waterAppearance = props.snapshot.settings.waterAppearance
  const savedId = props.snapshot.settings.savedThemePresets.find((item) => matchesThemePreset(item, colors, waterAppearance))?.id
  if (savedId) return `${THEME_PRESET_SAVED_PREFIX}${savedId}`
  const builtinId = matchCodexThemePreset(colors, waterAppearance)
  return builtinId ? `${THEME_PRESET_BUILTIN_PREFIX}${builtinId}` : THEME_PRESET_CUSTOM
})
watch(() => props.snapshot.settings.waterAppearance, (value) => {
  waterDraft.value = cloneWaterAppearance(value)
}, { deep: true })
watch([() => props.snapshot.settings.colors, () => props.snapshot.settings.waterAppearance, () => props.snapshot.settings.savedThemePresets], () => {
  savedThemeOption.value = activeThemeOption.value
  const activeSavedId = activeThemeOption.value.startsWith(THEME_PRESET_SAVED_PREFIX)
    ? activeThemeOption.value.slice(THEME_PRESET_SAVED_PREFIX.length)
    : null
  const match = activeSavedId ? props.snapshot.settings.savedThemePresets.find((entry) => entry.id === activeSavedId) : null
  savedThemeName.value = match?.name || ''
}, { deep: true, immediate: true })
const ordinaryModels = computed(() => props.snapshot.modelCatalog.models.filter((model) => model.family === 'normal'))
const sparkModels = computed(() => props.snapshot.modelCatalog.models.filter((model) => model.family === 'spark'))
const statusLabel = computed(() => {
  if (props.snapshot.refreshing) return '正在读取 Codex App Server'
  if (props.snapshot.quota.status === 'ok' && props.snapshot.environment.desktopBridgeState === 'connected') return '数据连接器与桌面实时状态已连接'
  if (props.snapshot.quota.status === 'ok' && props.snapshot.environment.statusFeedMode === 'connector-fallback') return '数据连接器已连接 · 实时状态待连接'
  if (props.snapshot.quota.status === 'ok') return 'Codex 数据连接器已连接'
  if (props.snapshot.quota.status === 'stale') return '连接异常，正在展示上次成功数据'
  if (props.snapshot.quota.status === 'error') return props.snapshot.quota.errorMessage || 'Codex 状态读取失败'
  return '等待首次读取'
})

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

const runtimeSourceLabels: Record<string, string> = {
  manual: '手动指定',
  configured: '指定路径',
  volta: 'Volta',
  'npm-global': 'npm 全局安装',
  local: '用户目录',
  homebrew: 'Homebrew',
  nvm: 'NVM',
  path: '系统 PATH',
  unknown: '未识别'
}

const launchModeLabels: Record<string, string> = {
  manual: '手动指定',
  automatic: '自动发现',
  'legacy-fallback': '兼容宿主',
  unknown: '未确认'
}

const manualLaunchPathStateLabels: Record<string, string> = {
  'not-configured': '未设置',
  valid: '已核验',
  invalid: '不可用',
  unavailable: '宿主不支持'
}

const statusFeedLabels: Record<string, string> = {
  'desktop-live': 'Codex Desktop 实时桥',
  'connector-fallback': '兼容连接器降级',
  unavailable: '不可用'
}

const diagnostic = computed(() => {
  const environment = props.snapshot.environment
  const legacyBridgePending = environment.platform !== 'unsupported'
    && environment.runtimeState === 'missing'
    && environment.runtimeSource === 'unknown'
    && environment.processState === 'unknown'
    && environment.configState === 'unknown'
    && environment.connectionState === 'not-checked'
  if (environment.manualLaunchPathState === 'invalid') {
    return { tone: 'error', title: '手动 Codex CLI 位置不可用', detail: '请改为可执行文件本身，或恢复自动发现。为保护隐私，已保存的位置不会在此页面回显。' }
  }
  if (environment.checking) return { tone: 'checking', title: '正在核查 Codex 环境', detail: '正在识别系统、Codex 运行环境、相关进程与本地配置。' }
  // App Server and Codex Desktop have deliberately separate authority during
  // the Easy Agent transition: inventory/quota may stay ready while live task
  // state is unavailable.
  if (environment.connectionState === 'connected' && environment.desktopBridgeState === 'connected') {
    return { tone: 'ready', title: 'Codex 数据与桌面实时状态已就绪', detail: 'App Server 提供额度、模型与任务清单；桌面实时桥提供 Input、正在进行中和完成未读状态。' }
  }
  if (environment.connectionState === 'connected' && (environment.desktopBridgeState === 'connecting' || environment.desktopBridgeState === 'not-checked')) {
    return { tone: 'checking', title: 'Codex 数据已就绪，正在连接桌面实时状态', detail: '额度、模型与任务清单可用；Input、正在进行中和完成未读状态将在桌面桥连接后发布。' }
  }
  if (environment.connectionState === 'connected' && environment.desktopBridgeState === 'not-running') {
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面端未运行', detail: '不会使用 EyPc 缓存推断 Input 或进行中；启动 Codex 桌面端后会自动重连。' }
  }
  if (environment.connectionState === 'connected' && environment.desktopBridgeState === 'incompatible') {
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面实时协议不兼容', detail: '实时桥已安全停用；Input、正在进行中和完成未读不会降级为本地缓存推断。' }
  }
  if (environment.connectionState === 'connected') {
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面实时状态不可用', detail: '额度、模型与任务清单仍可用；Input、正在进行中和完成未读状态会明确显示为未知。' }
  }
  if (environment.platform === 'unsupported') return { tone: 'error', title: '当前系统暂不支持自动核查', detail: 'Codex Companion 的自动核查目前支持 macOS 与 Windows。' }
  if (legacyBridgePending) return { tone: 'checking', title: '等待 Codex 连接验证', detail: '当前宿主使用兼容核查；连接成功后会自动确认 CLI、配置与 App Server 状态。' }
  if (environment.runtimeState === 'unusable' || (environment.runtimeState === 'detected' && environment.errorCode === 'runtime-unavailable')) {
    return { tone: 'error', title: 'Codex 启动入口存在，但运行环境不可用', detail: '请更新或重新安装 Codex CLI；Windows npm 入口还需要可验证的 Node 与 Codex 程序文件。完成后重新检测。' }
  }
  if (environment.runtimeState !== 'detected') {
    return {
      tone: 'error',
      title: '未找到可用的 Codex 运行环境',
      detail: environment.platform === 'windows'
        ? '请安装或更新 Codex CLI；支持 npm 全局目录、Volta、NVM、原生 codex.exe 与系统 PATH。安装后点击“重新检测”。'
        : '请安装或更新 Codex CLI；支持 Homebrew、NVM、Volta、用户目录与系统 PATH。安装后点击“重新检测”。'
    }
  }
  if (environment.errorCode === 'not-authenticated') return { tone: 'error', title: 'Codex 尚未登录或登录已失效', detail: '请先在 Codex App 或 CLI 完成登录，再点击“重新检测”。' }
  if (environment.errorCode === 'timeout') return { tone: 'warning', title: 'Codex 已识别，但服务响应超时', detail: '请检查网络或代理状态；上次成功额度会继续保留，恢复后可重新检测。' }
  if (environment.errorCode === 'protocol-error') return { tone: 'error', title: '当前 Codex 版本返回了不兼容的数据', detail: '请更新 Codex App 或 CLI，然后重新检测。' }
  if (environment.errorCode === 'process-exited') return { tone: 'warning', title: 'Codex App Server 已退出', detail: 'EyPc 不会强制结束或接管其他进程；点击“重新检测”会建立新的只读连接。' }
  if (environment.errorCode) return { tone: 'error', title: 'Codex App Server 暂时不可用', detail: '请确认 Codex 可正常启动，然后点击“重新检测”。' }
  if (environment.configState === 'unreadable') return { tone: 'error', title: 'Codex 配置存在但无法读取', detail: '请检查当前用户对 Codex 配置的读取权限，然后重新检测。' }
  if (environment.configState === 'missing') return { tone: 'warning', title: '已找到 Codex，但未发现本地配置', detail: '请先启动 Codex App 或 CLI 完成首次配置与登录，再点击“重新检测”。' }
  return { tone: 'ready', title: 'Codex 运行环境已识别', detail: '当前未建立 App Server 连接；进入本页或显示悬浮球时会自动建立只读连接。' }
})

const diagnosticRole = computed(() => diagnostic.value.tone === 'error' || diagnostic.value.tone === 'warning' ? 'alert' : 'status')
const environmentRows = computed(() => {
  const environment = props.snapshot.environment
  const connected = environment.connectionState === 'connected'
  const legacyBridgePending = environment.platform !== 'unsupported'
    && environment.runtimeState === 'missing'
    && environment.runtimeSource === 'unknown'
    && environment.processState === 'unknown'
    && environment.configState === 'unknown'
    && environment.connectionState === 'not-checked'
  const platform = environment.platform === 'macos' ? 'macOS' : environment.platform === 'windows' ? 'Windows' : connected ? '桌面宿主已连接' : '不支持'
  const runtime = connected && environment.runtimeSource === 'unknown'
    ? '已识别 · 兼容宿主'
    : legacyBridgePending
      ? '等待连接验证'
      : environment.runtimeState === 'detected'
        ? `已识别 · ${runtimeSourceLabels[environment.runtimeSource] || '未知来源'}`
        : environment.runtimeState === 'unusable'
          ? `入口不可用 · ${runtimeSourceLabels[environment.runtimeSource] || '未知来源'}`
          : environment.runtimeState === 'missing' ? '未找到' : '不支持'
  const process = environment.processState === 'running' ? '发现相关进程' : environment.processState === 'not-running' ? '未发现 · 不影响按需启动' : '无法判断 · 不阻断使用'
  const config = environment.configState === 'loaded' ? 'App Server 已加载' : environment.configState === 'detected' ? '已发现配置文件' : environment.configState === 'missing' ? '未发现' : environment.configState === 'unreadable' ? '无法读取' : '未核查'
  const connection = environment.connectionState === 'connected' ? '已连接' : environment.connectionState === 'failed' ? '连接失败' : '按需连接'
  const desktopBridge = environment.desktopBridgeState === 'connected'
    ? '已连接 · 实时权威'
    : environment.desktopBridgeState === 'connecting'
      ? '正在连接'
      : environment.desktopBridgeState === 'not-running'
        ? 'Codex 桌面端未运行'
        : environment.desktopBridgeState === 'incompatible'
          ? '协议不兼容 · 已安全停用'
          : environment.desktopBridgeState === 'failed'
            ? '连接失败 · 状态不推断'
            : '未核查'
  const launchMode = launchModeLabels[environment.launchMode || 'unknown'] || '未确认'
  const manualLaunchPathState = manualLaunchPathStateLabels[environment.manualLaunchPathState || 'unavailable'] || '未确认'
  const statusFeed = statusFeedLabels[environment.statusFeedMode || 'unavailable'] || '未确认'
  return [
    { label: '系统', value: platform },
    { label: 'Codex CLI', value: runtime },
    { label: '启动方式', value: launchMode },
    { label: '手动位置', value: manualLaunchPathState },
    { label: '相关进程', value: process },
    { label: '本地配置', value: config },
    { label: 'App Server', value: connection },
    { label: '桌面实时桥', value: desktopBridge },
    { label: '状态来源', value: statusFeed }
  ]
})

const launchCandidates = computed(() => props.snapshot.environment.launchCandidates || [])

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

function changeStyle(style: CodexDisplayStyle) {
  if (style !== props.snapshot.settings.displayStyle) update({ displayStyle: style })
}

function toggleField<T extends string>(fields: T[], field: T, checked: boolean, key: 'compactFields' | 'expandedFields') {
  const next = checked ? [...new Set([...fields, field])] : fields.filter((item) => item !== field)
  update({ [key]: next } as Partial<CodexSettings>)
}

function applyThemePreset(preset: { colors: CodexColorSettings, waterAppearance: CodexWaterAppearanceSettings }, source: string) {
  colorError.value = ''
  waterAppearanceError.value = ''
  waterDraft.value = cloneWaterAppearance(preset.waterAppearance)
  update({ colors: { ...preset.colors }, waterAppearance: cloneWaterAppearance(preset.waterAppearance) })
  savedThemeOption.value = source
}

function applyThemePresetBySelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  colorError.value = ''
  waterAppearanceError.value = ''
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
        updatedAt: now
      }
    } else {
      next.unshift({
        id: generateThemePresetId(),
        name,
        colors,
        waterAppearance,
        createdAt: now,
        updatedAt: now
      })
    }
  }

  const sanitized = next.slice(0, MAX_SAVED_THEME_PRESETS)
  const ordered = [...sanitized].sort((a, b) => b.updatedAt - a.updatedAt)
  update({ savedThemePresets: ordered })
  themePresetError.value = ''
  const selected = ordered.find((entry) => entry.name === name && JSON.stringify(entry.colors) === JSON.stringify(colors) && JSON.stringify(entry.waterAppearance) === JSON.stringify(waterAppearance))
  if (selected) {
    savedThemeOption.value = `${THEME_PRESET_SAVED_PREFIX}${selected.id}`
    savedThemeName.value = selected.name
  }
}

function openCardColorDialog(event: Event) {
  cardColorTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null
  cardColorDialogOpen.value = true
}

function closeCardColorDialog() {
  cardColorDialogOpen.value = false
  const trigger = cardColorTrigger
  cardColorTrigger = null
  void nextTick(() => {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true })
  })
}

function applyCardColors(colors: CodexColorSettings) {
  colorError.value = ''
  emit('dispatch', 'codex.card-colors.commit', { colors: { ...colors } })
  closeCardColorDialog()
}

function previewCardColors(colors: CodexColorSettings) {
  emit('dispatch', 'codex.card-colors.preview', { colors: { ...colors } })
}

function cancelCardColorDialog() {
  emit('dispatch', 'codex.card-colors.cancel')
  closeCardColorDialog()
}

function updateColor(key: keyof CodexColorSettings, value: string) {
  const candidate = { ...props.snapshot.settings.colors, [key]: value.toUpperCase() }
  colorError.value = ''
  update({ colors: candidate })
}

function updateWaterDraft(section: 'inner' | 'outer', key: string, value: string | number) {
  waterDraft.value = {
    ...waterDraft.value,
    [section]: { ...waterDraft.value[section], [key]: value }
  }
}

function commitWaterAppearance() {
  const candidate = cloneWaterAppearance(waterDraft.value)
  waterAppearanceError.value = ''
  update({ waterAppearance: cloneWaterAppearance(candidate) })
  waterDraft.value = candidate
}

onBeforeUnmount(() => {
  if (cardColorDialogOpen.value) emit('dispatch', 'codex.card-colors.cancel')
})
</script>

<template>
  <section class="codex-config-page" aria-label="Codex Companion 配置">
  <header class="codex-config-hero" aria-label="Codex Companion 配置总览">
    <div class="codex-hero-copy">
      <span class="codex-eyebrow"><Bot :size="15" /> Codex Companion</span>
      <h1>额度悬浮与任务桌宠</h1>
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
        <span class="codex-status-pill" :class="snapshot.quota.status" :title="statusLabel">{{ statusLabel }}</span>
        <CodexStyleSwitch :model-value="snapshot.settings.displayStyle" @update:model-value="changeStyle" />
        <button
          type="button"
          class="primary"
          :disabled="snapshot.refreshing"
          data-operation-tooltip="刷新"
          data-operation-description="立即重新读取额度、环境与会话快照。"
          @click="$emit('dispatch', 'codex.refresh')"
        >
          <RefreshCw :size="15" :class="{ spinning: snapshot.refreshing }" /> 刷新
        </button>
      </div>
    </header>

    <section class="codex-diagnostic" :class="diagnostic.tone" :role="diagnosticRole" aria-live="polite">
      <div class="codex-diagnostic-copy">
        <LoaderCircle v-if="diagnostic.tone === 'checking'" :size="19" class="spinning" aria-hidden="true" />
        <CircleCheckBig v-else-if="diagnostic.tone === 'ready'" :size="19" aria-hidden="true" />
        <AlertTriangle v-else :size="19" aria-hidden="true" />
        <div><strong>{{ diagnostic.title }}</strong><p>{{ diagnostic.detail }}</p></div>
      </div>
      <dl class="codex-diagnostic-grid">
        <div v-for="row in environmentRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
      </dl>
      <form class="codex-launch-config" @submit.prevent="saveLaunchPath">
        <div class="codex-launch-copy">
          <strong>连接位置与降级说明</strong>
          <p>手动位置只保存在本机插件存储，页面不会回显完整路径；未设置时将使用自动发现和现有本地连接器。</p>
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
        <ul v-if="launchCandidates.length" class="codex-launch-candidates" aria-label="已发现的 Codex 启动来源">
          <li v-for="candidate in launchCandidates" :key="`${candidate.source}-${candidate.state}`">
            {{ candidate.label }} · {{ candidate.state === 'available' ? '可用' : '不可用' }}
          </li>
        </ul>
        <p class="codex-launch-guide">
          <template v-if="snapshot.environment.platform === 'windows'">Windows：优先选择 <code>codex.exe</code>；自动核查会检查 Volta、npm、NVM、用户目录与系统 PATH。若只有 npm 的 <code>.cmd</code> 入口，宿主还会核验 Node 与 Codex 程序文件。</template>
          <template v-else>macOS：自动核查会检查 Homebrew、Volta、NVM、用户目录与系统 PATH；常见位置包括 <code>/opt/homebrew/bin/codex</code>、<code>/usr/local/bin/codex</code> 与 <code>~/.volta/bin/codex</code>。</template>
        </p>
        <p v-if="snapshot.environment.statusFeedMode !== 'desktop-live'" class="codex-launch-fallback">
          当前为兼容连接器降级：可展示额度、库存和归档结果，但会有连接延迟；Input、正在进行中和已完成未读保持“未知”，直到 Codex Desktop 实时桥连接，绝不由插件缓存补猜。
        </p>
      </form>
        <button
          type="button"
          class="secondary"
          :disabled="snapshot.refreshing || snapshot.environment.checking"
          data-operation-tooltip="重新检测"
          data-operation-description="立即重新核查当前 Codex 运行环境与连接可用性。"
          @click="$emit('dispatch', 'codex.refresh')"
        >
          <RefreshCw :size="14" :class="{ spinning: snapshot.refreshing || snapshot.environment.checking }" />重新检测
        </button>
    </section>

    <div class="codex-workbench">
      <article class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><LayoutDashboard :size="17" /><strong>显示</strong></div>
          <span
            class="codex-tip"
            role="button"
            tabindex="0"
            aria-label="显示区域说明"
            data-tip="可配置悬浮球显示入口与直接展开入口；面板操作不读取对话正文。"
          >i</span>
        </div>
        <div class="codex-shortcut-stack">
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>悬浮球开关</strong></span>
            <button
              type="button"
              class="secondary"
              title="配置系统级快捷键（由 uTools 统一管理）"
              data-operation-tooltip="配置系统级快捷键"
              data-operation-description="打开快捷键配置入口，可把核心入口动作同步到系统级按键。"
              @click="$emit('dispatch', 'codex.hotkey.configure')"
            >配置系统级快捷键</button>
          </div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>直接展开卡片</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="快捷键也可触发：⌘⌥↵（macOS）或 Ctrl+Alt+Enter（Windows），立即展开并聚焦会话列表。"
              data-operation-tooltip="立即展开"
              data-operation-description="快捷键也可触发：⌘⌥↵（macOS）或 Ctrl+Alt+Enter（Windows），立即展开并聚焦会话列表。"
              @click="$emit('dispatch', 'codex.float.activate')"
            >立即展开</button>
          </div>
        </div>
      </article>

      <article class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><SlidersHorizontal :size="17" /><strong>内容</strong></div>
          <span
            class="codex-tip"
            role="button"
            tabindex="0"
            aria-label="内容区域说明"
            data-tip="仅控制卡片可视内容，不涉及任务正文或会话记录持久化。"
          >i</span>
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

      <article class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><BellRing :size="17" /><strong>任务</strong></div>
          <span
            class="codex-tip"
            role="button"
            tabindex="0"
            aria-label="任务区域说明"
            data-tip="任务视图按最新已启动时间排序；仅展示可见会话摘要，不显示正文。"
          >i</span>
        </div>
        <label class="codex-switch-row">
          <span><strong>显示任务状态</strong></span>
          <input type="checkbox" :checked="snapshot.settings.conversationInboxEnabled" @change="update({ conversationInboxEnabled: ($event.target as HTMLInputElement).checked })" />
          <i />
        </label>
        <div class="codex-form-grid">
          <label>
            <span class="codex-label-row">
              <span>刷新频率</span>
            </span>
            <select
              class="codex-select"
              :value="snapshot.settings.taskRefreshSeconds"
              @change="update({ taskRefreshSeconds: Number(($event.target as HTMLSelectElement).value) as CodexSettings['taskRefreshSeconds'] })"
              title="会话列表刷新周期"
              data-operation-tooltip="刷新频率"
              data-operation-description="按该秒数轮询会话列表；高频有助于新任务识别，但会提高资源消耗。"
            >
              <option :value="15">15 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option><option :value="0">仅手动</option>
            </select>
          </label>
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
              data-operation-description="按最新 Turn 活动时间过滤常规会话；动态页固定显示最近 6 小时活动。"
            />
          </label>
          <div class="codex-readonly-field"><span>真实预检</span><strong>{{ snapshot.conversations.completeness === 'verified' ? `${snapshot.conversations.rawSourceCount} 原始 · ${snapshot.conversations.eligibleSourceCount} 已注册` : '尚未获得完整快照' }}</strong></div>
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

      <article class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><Palette :size="17" /><strong>主题</strong></div>
          <span
            class="codex-tip"
            role="button"
            tabindex="0"
            aria-label="主题区域说明"
            data-tip="主题与颜色只影响悬浮展示，不影响连接与权限。"
          >i</span>
        </div>
        <p class="codex-color-help">颜色配置入口统一在一个区域：先选预设，再在下方按项调整；所有配色会同步到悬浮面板显示。</p>
        <section class="codex-color-group">
          <h3 class="codex-color-group-title">颜色预设</h3>
          <div class="codex-theme-select">
            <select class="codex-select" :value="savedThemeOption" @change="applyThemePresetBySelect">
              <option :value="THEME_PRESET_CUSTOM">当前配置（未匹配）</option>
              <optgroup label="默认样式">
                <option v-for="preset in CODEX_THEME_PRESETS" :key="preset.id" :value="`${THEME_PRESET_BUILTIN_PREFIX}${preset.id}`">
                  {{ preset.label }} · {{ preset.description }}
                </option>
              </optgroup>
              <optgroup v-if="snapshot.settings.savedThemePresets.length > 0" label="已保存">
                <option
                  v-for="preset in snapshot.settings.savedThemePresets"
                  :key="preset.id"
                  :value="`${THEME_PRESET_SAVED_PREFIX}${preset.id}`"
                >
                  {{ preset.name }}
                </option>
              </optgroup>
            </select>
                <div class="codex-theme-save">
                  <input
                    type="text"
                    class="codex-input"
                    maxlength="40"
                    v-model="savedThemeName"
                    placeholder="为当前配置输入主题名称（保存/覆盖）"
                  />
                  <button type="button" class="secondary" @click="saveCurrentThemePreset">另存主题</button>
                </div>
              </div>
            </section>
            <p v-if="themePresetError" class="codex-color-error" role="alert">{{ themePresetError }}</p>
            <section class="codex-color-group">
          <h3 class="codex-color-group-title">手动配色</h3>
          <div class="codex-color-grid codex-color-grid--manual">
            <label><input type="color" :value="snapshot.settings.colors.water" @input="updateColor('water', ($event.target as HTMLInputElement).value)" /><span>水球底色</span></label>
            <label><input type="color" :value="waterDraft.inner.colorA" @input="updateWaterDraft('inner', 'colorA', ($event.target as HTMLInputElement).value.toUpperCase())" @change="commitWaterAppearance" /><span>内层水纹色 A</span></label>
            <label><input type="color" :value="waterDraft.inner.colorB" @input="updateWaterDraft('inner', 'colorB', ($event.target as HTMLInputElement).value.toUpperCase())" @change="commitWaterAppearance" /><span>内层水纹色 B</span></label>
            <button type="button" class="codex-card-color-trigger" data-role="card-color-pair-trigger" @click="openCardColorDialog">
              <span class="codex-card-color-trigger-swatches" aria-hidden="true"><i :style="{ background: snapshot.settings.colors.card }" /><i :style="{ background: snapshot.settings.colors.cardForeground }" /></span>
              <span><strong>卡片表面 + 前景</strong><small>点击打开颜色编辑器</small></span>
            </button>
            <label><input type="color" :value="snapshot.settings.colors.healthy" @input="updateColor('healthy', ($event.target as HTMLInputElement).value)" /><span>状态：充足</span></label>
            <label><input type="color" :value="snapshot.settings.colors.warning" @input="updateColor('warning', ($event.target as HTMLInputElement).value)" /><span>状态：提醒</span></label>
            <label><input type="color" :value="snapshot.settings.colors.critical" @input="updateColor('critical', ($event.target as HTMLInputElement).value)" /><span>状态：紧张</span></label>
          </div>
        </section>
        <p v-if="colorError" class="codex-color-error" role="alert">{{ colorError }}；已恢复最近一次有效配置。</p>

        <div class="codex-water-settings">
          <fieldset class="codex-fieldset water-settings-group">
            <legend>
              内层水纹
            </legend>
            <label>
              <span>配色</span>
              <select class="codex-select" :value="waterDraft.inner.palette" @change="updateWaterDraft('inner', 'palette', ($event.target as HTMLSelectElement).value); commitWaterAppearance()">
                <option value="solid">纯色</option>
                <option value="gradient">渐变</option>
                <option value="aurora">高级炫彩</option>
              </select>
            </label>
            <label class="water-range"><span>透明度 <strong>{{ waterDraft.inner.opacity }}%</strong></span><input type="range" min="40" max="95" step="1" :value="waterDraft.inner.opacity" @input="updateWaterDraft('inner', 'opacity', Number(($event.target as HTMLInputElement).value))" @change="commitWaterAppearance" /></label>
            <label class="water-range"><span>波幅 <strong>{{ waterDraft.inner.amplitude }}px</strong></span><input type="range" min="4" max="12" step="1" :value="waterDraft.inner.amplitude" @input="updateWaterDraft('inner', 'amplitude', Number(($event.target as HTMLInputElement).value))" @change="commitWaterAppearance" /></label>
            <label>
              <span>水纹速度</span>
              <select class="codex-select" :value="waterDraft.inner.motion" @change="updateWaterDraft('inner', 'motion', ($event.target as HTMLSelectElement).value); commitWaterAppearance()">
                <option value="static">静态</option><option value="slow">慢</option><option value="normal">正常</option><option value="fast">快</option>
              </select>
            </label>
          </fieldset>

          <fieldset class="codex-fieldset water-settings-group">
            <legend>
              水球外层质感
            </legend>
            <label class="water-range"><span>外层光泽透明度 <strong>{{ waterDraft.outer.shellOpacity }}%</strong></span><input type="range" min="25" max="95" step="1" :value="waterDraft.outer.shellOpacity" @input="updateWaterDraft('outer', 'shellOpacity', Number(($event.target as HTMLInputElement).value));" @change="commitWaterAppearance" /></label>
          </fieldset>
        </div>
      </article>

      <article class="codex-panel codex-settings-section">
        <div class="codex-panel-title">
          <div><CircleGauge :size="17" /><strong>刷新与 Codex 配置</strong></div>
          <span
            class="codex-tip"
            role="button"
            tabindex="0"
            aria-label="刷新与配置区域说明"
            data-tip="包含模型策略、额度刷新与窗口几何设置。"
          >i</span>
        </div>
        <div class="codex-config-facts">
          <div><span>套餐</span><strong>{{ snapshot.quota.plan || '未提供' }}</strong></div>
          <div><span>模型</span><strong>{{ snapshot.config.model || '未提供' }}</strong></div>
          <div><span>Reasoning</span><strong>{{ snapshot.config.reasoningEffort || '未提供' }}</strong></div>
          <div><span>Service tier</span><strong>{{ snapshot.config.serviceTier || '未提供' }}</strong></div>
        </div>
        <div class="codex-form-grid refresh-grid">
          <label>
            <span>额度刷新</span>
            <select
              class="codex-select"
              :value="snapshot.settings.quotaRefreshMinutes"
              @change="update({ quotaRefreshMinutes: Number(($event.target as HTMLSelectElement).value) as CodexSettings['quotaRefreshMinutes'] })"
              data-operation-tooltip="额度刷新"
              data-operation-description="按固定周期刷新额度状态；1~30 分钟可提升额度准确性。"
            >
              <option :value="5">5 分钟</option><option :value="10">10 分钟</option><option :value="15">15 分钟</option><option :value="30">30 分钟</option><option :value="0">仅手动</option>
            </select>
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
            <small>{{ snapshot.floatHost.expandedManual ? `按显示器保存${snapshot.floatHost.displayId ? ` · ${snapshot.floatHost.displayId}` : ''}` : '默认宽 360px，高度随内容在 280–460px 间变化' }}</small>
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
        <div class="codex-size-summary codex-workspace-diagnostic">
          <span>
            <strong>{{ snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '跨桌面置顶：已启用' : snapshot.floatHost.workspaceVisibility?.supported ? '跨桌面置顶：核验失败' : '跨桌面置顶：当前平台不支持' }}</strong>
            <small>{{ snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '当前显示器的所有 Space 与全屏 Space 可见' : snapshot.floatHost.workspaceVisibility?.errorCode || '等待悬浮窗宿主核验' }}</small>
          </span>
        </div>
      </article>
    </div>
    <CodexCardColorDialog
      v-if="cardColorDialogOpen"
      :colors="snapshot.settings.colors"
      @preview="previewCardColors"
      @confirm="applyCardColors"
      @cancel="cancelCardColorDialog"
    />
  </section>
</template>
