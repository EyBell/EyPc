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
import type {
  CodexColorSettings,
  CodexCompactField,
  CodexDisplayStyle,
  CodexExpandedCardAppearanceSettings,
  CodexSettings,
  CodexSavedThemePreset,
  CodexWaterAppearanceSettings
} from '../domain/codex'
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
const waterPreviewProjection = computed(() => props.snapshot.taskState.dynamic)

const waterPreview = computed(() => buildCodexCompactPresentation({
  quota: props.snapshot.quota,
  compactFields: props.snapshot.settings.compactFields,
  conversationInboxEnabled: props.snapshot.settings.conversationInboxEnabled,
  taskCounts: waterPreviewProjection.value.compactCounts
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
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面实时状态不可用', detail: '额度、模型与任务清单仍可用；实时细分暂不可用，未确认任务保持“进行中”。' }
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
const launchHelpText = computed(() => {
  const platformGuide = props.snapshot.environment.platform === 'windows'
    ? 'Windows 优先选择 codex.exe；自动核查会检查 Volta、npm、NVM、用户目录与系统 PATH。'
    : 'macOS 自动核查会检查 Homebrew、Volta、NVM、用户目录与系统 PATH。'
  const fallbackGuide = props.snapshot.environment.statusFeedMode !== 'desktop-live'
    ? ' 当前为兼容连接器降级：额度与库存仍可用，实时任务状态保持未知，直到桌面实时桥连接。'
    : ''
  return `手动位置只保存在本机插件存储，页面不会回显完整路径；未设置时使用自动发现。${platformGuide}${fallbackGuide}`
})

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
    <section v-if="activeConfigTab === 'runtime'" class="codex-diagnostic" :class="diagnostic.tone" :role="diagnosticRole" aria-live="polite">
      <div class="codex-diagnostic-copy">
        <LoaderCircle v-if="diagnostic.tone === 'checking'" :size="19" class="spinning" aria-hidden="true" />
        <CircleCheckBig v-else-if="diagnostic.tone === 'ready'" :size="19" aria-hidden="true" />
        <AlertTriangle v-else :size="19" aria-hidden="true" />
        <div class="codex-diagnostic-heading">
          <strong>{{ diagnostic.title }}</strong>
          <span class="codex-tip" role="button" tabindex="0" aria-label="诊断详情" :data-tip="diagnostic.detail">i</span>
        </div>
      </div>
      <dl class="codex-diagnostic-grid">
        <div v-for="row in environmentRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
      </dl>
      <form class="codex-launch-config" @submit.prevent="saveLaunchPath">
        <div class="codex-launch-copy">
          <strong>连接位置</strong>
          <span class="codex-tip" role="button" tabindex="0" aria-label="连接位置说明" :data-tip="launchHelpText">i</span>
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
      <article v-if="activeConfigTab === 'shortcuts'" class="codex-panel codex-settings-section codex-shortcuts-panel">
        <div class="codex-panel-title">
          <div><LayoutDashboard :size="17" /><strong>快捷方式</strong></div>
          <span
            class="codex-tip"
            role="button"
            tabindex="0"
            aria-label="快捷方式说明"
            data-tip="这里只跳转到 uTools 快捷键设置或执行入口动作，不读取、回显任何宿主快捷键绑定。"
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
            >去设置</button>
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
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>待输入任务</strong></span>
            <button
              type="button"
              class="secondary codex-hotkey-cta"
              title="配置 uTools 全局快捷键，直接打开第一条待输入任务。"
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
              title="配置 uTools 全局快捷键，打开并在 EyPc 内标记第一条已完成未读任务。"
              data-operation-tooltip="配置已完成未读快捷键"
              data-operation-description="打开 uTools 全局功能，为“打开并标记第一个 Codex 已完成未读任务”绑定系统级快捷键。"
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

      <article v-if="activeConfigTab === 'tasks'" class="codex-panel codex-settings-section">
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
              <span>完整校对频率</span>
            </span>
            <select
              class="codex-select"
              :value="snapshot.settings.taskRefreshSeconds"
              @change="update({ taskRefreshSeconds: Number(($event.target as HTMLSelectElement).value) as CodexSettings['taskRefreshSeconds'] })"
              title="完整任务校对周期"
              data-operation-tooltip="完整校对频率"
              data-operation-description="用于兜底发现漏事件和核对完整清单；新增任务、待输入与完成事件会触发快速单任务校对，不等待该周期。"
            >
              <option :value="15">15 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option><option :value="0">仅手动</option>
            </select>
          </label>
          <label>
            <span class="codex-label-row">
              <span>进行中离开稳定窗</span>
            </span>
            <select
              class="codex-select"
              :value="snapshot.settings.completionPresentationDelayMs"
              @change="update({ completionPresentationDelayMs: Number(($event.target as HTMLSelectElement).value) as CodexSettings['completionPresentationDelayMs'] })"
              title="进行中状态离开后的展示稳定时间"
              data-operation-tooltip="进行中离开稳定窗"
              data-operation-description="只平滑普通快照确认的完成展示；active 退出后的单任务强证据会立即发布。已停止仍要求 interrupted/failed 与精确 idle/退出证据，其余未确认状态继续显示进行中。"
            >
              <option :value="0">不等待（默认）</option><option :value="500">0.5 秒</option><option :value="1000">1 秒</option><option :value="1500">1.5 秒</option><option :value="2000">2 秒</option><option :value="3000">3 秒</option>
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
                v-for="project in snapshot.taskState.conversations.projects.filter((item) => item.kind === 'project')"
                :key="project.key"
                :value="project.key"
              >{{ project.name }}</option>
            </select>
          </label>
          <div class="codex-readonly-field"><span>真实预检</span><strong>{{ snapshot.taskState.conversations.status === 'error' ? snapshot.taskState.conversations.errorMessage || '任务状态读取失败' : snapshot.taskState.conversations.completeness === 'verified' ? `${snapshot.taskState.conversations.rawSourceCount} 原始 · ${snapshot.taskState.conversations.eligibleSourceCount} 已注册` : '尚未获得完整快照' }}</strong></div>
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
          <span class="codex-tip" role="button" tabindex="0" aria-label="外观配置说明" data-tip="主题预设会同时保存水球与展开卡片；当前页只展示所选目标的预览与控件。">i</span>
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
            <div class="codex-appearance-zone-head"><div><span>01 · 悬浮水球</span><h3 id="water-appearance-title">水球外观</h3></div><span class="codex-tip" role="button" tabindex="0" aria-label="水球外观说明" data-tip="预览与桌面水球共用渲染；可分别控制球体背景、液体、Weekly 进度环、百分比读数和三类数字角标。">i</span></div>
            <div class="codex-water-appearance-preview" :style="waterPreviewStyle" aria-label="与真实悬浮水球一致的颜色部位预览">
              <CodexWaterBall
                :primary="waterPreview.primary"
                :secondary="waterPreview.secondary"
                :state-label="waterPreview.stateLabel"
                :label="waterPreview.ariaLabel"
                :appearance="waterDraft"
                :colors="snapshot.settings.colors"
                decorative
              />
              <b v-if="waterPreviewCounters.input" class="water-preview-counter water-preview-counter--input">{{ codexBadgeText(waterPreviewCounters.input) }}</b>
              <b v-if="waterPreviewCounters.active" class="water-preview-counter water-preview-counter--active">{{ codexBadgeText(waterPreviewCounters.active) }}</b>
              <b v-if="waterPreviewCounters.unread" class="water-preview-counter water-preview-counter--unread">{{ codexBadgeText(waterPreviewCounters.unread) }}</b>
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
              <header><strong>百分比读数</strong><span class="codex-tip" role="button" tabindex="0" aria-label="百分比读数说明" data-tip="独立设置水球百分比的位置、字号、字形和颜色。">i</span></header>
              <label><span>显示位置</span><select class="codex-select" :value="waterDraft.inner.percentPosition" @change="updateWaterDraft('inner', 'percentPosition', ($event.target as HTMLSelectElement).value)"><option value="auto">自动（居中）</option><option value="center">居中</option><option value="bottom-left">左下</option><option value="bottom-right">右下</option></select></label>
              <label class="water-reading-range"><span>文字大小 <strong>{{ waterDraft.inner.percentSize }}px</strong></span><input type="range" min="12" max="32" step="1" :value="waterDraft.inner.percentSize" @input="updateWaterDraft('inner', 'percentSize', Number(($event.target as HTMLInputElement).value))" /></label>
              <label><span>文字样式</span><select class="codex-select" :value="waterDraft.inner.percentTextStyle" @change="updateWaterDraft('inner', 'percentTextStyle', ($event.target as HTMLSelectElement).value)"><option value="regular">常规</option><option value="bold">加粗</option><option value="italic">斜体</option><option value="bold-italic">粗斜体</option></select></label>
              <label class="codex-color-control"><input type="color" :value="waterDraft.inner.percentColor" @input="updateWaterDraft('inner', 'percentColor', ($event.target as HTMLInputElement).value.toUpperCase())" /><span><strong>文字颜色</strong><small>只影响水球百分比</small></span></label>
            </div>
            <div class="codex-counter-colors"><label class="codex-color-control"><input type="color" :value="snapshot.settings.counterColors.input" @input="update({ counterColors: { ...snapshot.settings.counterColors, input: ($event.target as HTMLInputElement).value.toUpperCase() } })" /><span><strong>待输入角标</strong><small>左下数字</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.counterColors.active" @input="update({ counterColors: { ...snapshot.settings.counterColors, active: ($event.target as HTMLInputElement).value.toUpperCase() } })" /><span><strong>进行中角标</strong><small>右下上方数字</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.counterColors.unread" @input="update({ counterColors: { ...snapshot.settings.counterColors, unread: ($event.target as HTMLInputElement).value.toUpperCase() } })" /><span><strong>已未读角标</strong><small>右下角数字</small></span></label></div>
          </section>

          <section v-if="activeConfigTab === 'card'" class="codex-appearance-zone codex-appearance-zone--card" aria-labelledby="card-appearance-title">
            <div class="codex-appearance-zone-head"><div><span>02 · 悬浮展开卡片</span><h3 id="card-appearance-title">展开卡片主题</h3></div><span class="codex-tip" role="button" tabindex="0" aria-label="展开卡片主题说明" data-tip="单独控制展开面板、文字、交互与任务状态；不会读取水球配色。">i</span></div>
            <div class="codex-expanded-card-preview" :style="cardPreviewStyle" aria-label="悬浮展开卡片颜色部位预览">
              <div class="expanded-card-preview-tabs"><b><i>3</i>动态</b><span>已完成</span><span>已隐藏</span><span>项目</span></div>
              <div class="expanded-card-preview-search"><i /><span>搜索会话、别名或项目</span></div>
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
            <div class="codex-appearance-zone-head"><div><span>02 · 状态信号</span><h3 id="signal-appearance-title">额度状态色</h3></div><span class="codex-tip" role="button" tabindex="0" aria-label="额度状态颜色说明" data-tip="用于跟随额度状态的 Weekly 进度和状态强调：充足、提醒、紧张。">i</span></div>
            <div class="codex-signal-controls"><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.healthy" @input="updateColor('healthy', ($event.target as HTMLInputElement).value)" /><span><strong>充足</strong><small>高额度状态</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.warning" @input="updateColor('warning', ($event.target as HTMLInputElement).value)" /><span><strong>提醒</strong><small>中额度状态</small></span></label><label class="codex-color-control"><input type="color" :value="snapshot.settings.colors.critical" @input="updateColor('critical', ($event.target as HTMLInputElement).value)" /><span><strong>紧张</strong><small>低额度状态</small></span></label></div>
          </section>
        </div>
      </article>

      <article v-if="activeConfigTab === 'runtime'" class="codex-panel codex-settings-section">
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
            <span class="codex-tip" role="button" tabindex="0" aria-label="展开面板尺寸说明" :data-tip="snapshot.floatHost.expandedManual ? `按显示器保存${snapshot.floatHost.displayId ? ` · ${snapshot.floatHost.displayId}` : ''}` : '默认宽 360px，高度随内容在 280–460px 间变化'">i</span>
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
            <span class="codex-tip" role="button" tabindex="0" aria-label="跨桌面置顶说明" :data-tip="snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '当前显示器的所有 Space 与全屏 Space 可见' : snapshot.floatHost.workspaceVisibility?.errorCode || '等待悬浮窗宿主核验'">i</span>
          </span>
        </div>
      </article>
    </div>
    </section>
  </section>
</template>
