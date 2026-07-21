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
  ShieldCheck,
  SlidersHorizontal
} from '@lucide/vue'
import CodexStyleSwitch from '../components/CodexStyleSwitch.vue'
import CodexWaterBall from '../components/CodexWaterBall.vue'
import {
  CODEX_THEME_PRESETS,
  codexThemeCssVars,
  codexWaterAppearanceCssVars,
  matchCodexThemePreset,
  resolveCodexSurfaceTheme,
  validateCodexCustomColors,
  validateCodexWaterAppearance
} from '../domain/codexAppearance'
import { buildCodexCompactPresentation, codexBadgeText } from '../domain/codexPresentation'
import type {
  CodexColorSettings,
  CodexCompactField,
  CodexDisplayStyle,
  CodexSettings,
  CodexWaterAppearanceSettings
} from '../domain/codex'
import type { CodexRuntimeView } from '../runtime/codexController'

const props = defineProps<{ snapshot: CodexRuntimeView }>()
const emit = defineEmits<{ dispatch: [actionId: string, args?: Record<string, unknown>] }>()
const colorError = ref('')
const waterAppearanceError = ref('')

function cloneWaterAppearance(value: CodexWaterAppearanceSettings): CodexWaterAppearanceSettings {
  return { inner: { ...value.inner }, outer: { ...value.outer } }
}

const waterDraft = ref<CodexWaterAppearanceSettings>(cloneWaterAppearance(props.snapshot.settings.waterAppearance))

watch(() => props.snapshot.settings.waterAppearance, (value) => {
  waterDraft.value = cloneWaterAppearance(value)
}, { deep: true })

const compactOptions: Array<{ id: CodexCompactField; label: string }> = [
  { id: 'tasks', label: '任务数字' }
]

const preview = computed(() => buildCodexCompactPresentation({
  quota: props.snapshot.quota,
  compactFields: props.snapshot.settings.compactFields,
  conversationInboxEnabled: props.snapshot.settings.conversationInboxEnabled,
  conversations: props.snapshot.conversations
}))
const previewPercent = computed(() => preview.value.primary?.bucket.remainingPercent ?? 0)
const previewTheme = computed(() => resolveCodexSurfaceTheme(
  props.snapshot.settings.displayStyle,
  props.snapshot.settings.colors,
  previewPercent.value
))
const previewStyle = computed<Record<string, string | number>>(() => ({
  ...codexThemeCssVars(previewTheme.value),
  ...codexWaterAppearanceCssVars(waterDraft.value, props.snapshot.settings.colors, previewPercent.value),
  '--preview-level': `${previewPercent.value}%`,
  '--preview-ring': preview.value.secondary?.bucket.remainingPercent ?? 0
}))
const activePreset = computed(() => matchCodexThemePreset(props.snapshot.settings.colors, props.snapshot.settings.waterAppearance))
const ordinaryModels = computed(() => props.snapshot.modelCatalog.models.filter((model) => model.family === 'normal'))
const sparkModels = computed(() => props.snapshot.modelCatalog.models.filter((model) => model.family === 'spark'))
const statusLabel = computed(() => {
  if (props.snapshot.refreshing) return '正在读取 Codex App Server'
  if (props.snapshot.quota.status === 'ok') return 'Codex App Server 已连接'
  if (props.snapshot.quota.status === 'stale') return '连接异常，正在展示上次成功数据'
  if (props.snapshot.quota.status === 'error') return props.snapshot.quota.errorMessage || 'Codex 状态读取失败'
  return '等待首次读取'
})

const runtimeSourceLabels: Record<string, string> = {
  configured: '指定路径',
  volta: 'Volta',
  'npm-global': 'npm 全局安装',
  local: '用户目录',
  homebrew: 'Homebrew',
  nvm: 'NVM',
  path: '系统 PATH',
  unknown: '未识别'
}

const diagnostic = computed(() => {
  const environment = props.snapshot.environment
  const legacyBridgePending = environment.platform !== 'unsupported'
    && environment.runtimeState === 'missing'
    && environment.runtimeSource === 'unknown'
    && environment.processState === 'unknown'
    && environment.configState === 'unknown'
    && environment.connectionState === 'not-checked'
  if (environment.checking) return { tone: 'checking', title: '正在核查 Codex 环境', detail: '正在识别系统、Codex 运行环境、相关进程与本地配置。' }
  // A successful App Server round-trip is stronger evidence than a legacy
  // preload's missing inspection capability. Keep mixed-version hosts usable.
  if (environment.connectionState === 'connected') return { tone: 'ready', title: 'Codex 环境与配置已就绪', detail: '只读 App Server 已连接；额度、公开配置和任务状态可以按当前设置刷新。' }
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
  return [
    { label: '系统', value: platform },
    { label: 'Codex CLI', value: runtime },
    { label: '相关进程', value: process },
    { label: '本地配置', value: config },
    { label: 'App Server', value: connection }
  ]
})

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

function applyPreset(preset: typeof CODEX_THEME_PRESETS[number]) {
  colorError.value = ''
  waterAppearanceError.value = ''
  waterDraft.value = cloneWaterAppearance(preset.waterAppearance)
  update({ colors: { ...preset.colors }, waterAppearance: cloneWaterAppearance(preset.waterAppearance) })
}

function updateColor(key: keyof CodexColorSettings, value: string) {
  const candidate = { ...props.snapshot.settings.colors, [key]: value.toUpperCase() }
  const validation = validateCodexCustomColors(candidate)
  if (!validation.valid) {
    colorError.value = validation.message
    return
  }
  const waterValidation = validateCodexWaterAppearance(candidate, waterDraft.value)
  if (!waterValidation.valid) {
    colorError.value = waterValidation.message
    return
  }
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
  const validation = validateCodexWaterAppearance(props.snapshot.settings.colors, waterDraft.value)
  if (!validation.valid) {
    waterAppearanceError.value = validation.message
    waterDraft.value = cloneWaterAppearance(props.snapshot.settings.waterAppearance)
    return
  }
  waterAppearanceError.value = ''
  update({ waterAppearance: cloneWaterAppearance(waterDraft.value) })
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`
}

function formatTime(value: number | null | undefined) {
  if (!value) return '未提供'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value)
}
</script>

<template>
  <section class="codex-config-page" aria-label="Codex Companion 配置">
    <header class="codex-config-hero">
      <div class="codex-hero-copy">
        <span class="codex-eyebrow"><Bot :size="15" /> Codex Companion</span>
        <h1>额度悬浮与任务桌宠</h1>
        <p>只读取额度、公开配置和任务状态；不读取、保存或展示对话正文。</p>
      </div>
      <div class="codex-hero-actions">
        <button
          type="button"
          class="codex-float-toggle"
          :class="{ active: snapshot.settings.floatEnabled }"
          :aria-pressed="snapshot.settings.floatEnabled"
          @click="update({ floatEnabled: !snapshot.settings.floatEnabled })"
        >
          <EyeOff v-if="snapshot.settings.floatEnabled" :size="15" aria-hidden="true" />
          <Eye v-else :size="15" aria-hidden="true" />
          {{ snapshot.settings.floatEnabled ? '隐藏桌面悬浮' : '显示桌面悬浮' }}
        </button>
        <span class="codex-status-pill" :class="snapshot.quota.status">{{ statusLabel }}</span>
        <CodexStyleSwitch :model-value="snapshot.settings.displayStyle" @update:model-value="changeStyle" />
        <button type="button" class="primary" :disabled="snapshot.refreshing" @click="$emit('dispatch', 'codex.refresh')">
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
      <button type="button" class="secondary" :disabled="snapshot.refreshing || snapshot.environment.checking" @click="$emit('dispatch', 'codex.refresh')">
        <RefreshCw :size="14" :class="{ spinning: snapshot.refreshing || snapshot.environment.checking }" />重新检测
      </button>
    </section>

    <div class="codex-workbench">
      <aside class="codex-panel codex-preview-panel">
        <div class="codex-panel-title">
          <div><Eye :size="17" /><strong>真实收起预览</strong></div>
          <span>{{ snapshot.settings.displayStyle === 'water' ? '94px 水球' : '156×82 横卡' }}</span>
        </div>

        <div class="codex-preview-stage" :style="previewStyle">
          <div
            class="codex-preview-compact"
            :class="snapshot.settings.displayStyle === 'water' ? 'water-preview' : 'card-preview'"
            :aria-label="preview.ariaLabel"
          >
            <template v-if="snapshot.settings.displayStyle === 'water'">
              <CodexWaterBall
                :primary="preview.primary"
                :secondary="preview.secondary"
                :state-label="preview.stateLabel"
                :label="preview.ariaLabel"
                :appearance="waterDraft"
                :colors="snapshot.settings.colors"
                decorative
                :task-counts="preview.showTasks ? { running: preview.ongoingCount, pending: preview.pendingCount, unknown: preview.unknownCount } : undefined"
              />
            </template>

            <template v-else>
              <div class="codex-preview-card-primary" :class="{ empty: !preview.primary }">
                <span>{{ preview.primary?.longLabel || 'Codex' }}</span>
                <strong>{{ preview.primary ? `${preview.primary.bucket.remainingPercent}%` : preview.stateLabel }}</strong>
                <small>{{ snapshot.quota.plan || '额度助手' }}</small>
              </div>
              <div class="codex-preview-card-detail">
                <template v-if="preview.secondary">
                  <div><span>Weekly</span><strong>{{ formatPercent(preview.secondary.bucket.remainingPercent) }}</strong></div>
                  <b><i :style="{ width: `${preview.secondary.bucket.remainingPercent}%` }" /></b>
                </template>
                <div v-if="preview.showTasks" class="preview-task-counts">
                  <span v-if="preview.ongoingCount" class="running" :title="`${preview.ongoingCount} 个进行中或等待操作任务`"><i />{{ codexBadgeText(preview.ongoingCount) }} 进行/等待</span>
                  <span v-if="preview.unknownCount" class="unknown"><i />{{ codexBadgeText(preview.unknownCount) }} 状态未知</span>
                  <span v-if="preview.pendingCount" class="pending"><i />{{ codexBadgeText(preview.pendingCount) }} 待查看</span>
                  <small v-if="!preview.ongoingCount && !preview.unknownCount && !preview.pendingCount">任务已清空</small>
                </div>
                <small v-else-if="!preview.secondary">{{ preview.stateLabel || '点击展开' }}</small>
              </div>
            </template>
          </div>
        </div>

        <div class="codex-preview-meta">
          <div><span>5 小时</span><strong>{{ formatPercent(snapshot.quota.short?.remainingPercent) }}</strong><small>{{ formatTime(snapshot.quota.short?.resetAt) }} 重置</small></div>
          <div><span>Weekly</span><strong>{{ formatPercent(snapshot.quota.weekly?.remainingPercent) }}</strong><small>{{ formatTime(snapshot.quota.weekly?.resetAt) }} 重置</small></div>
        </div>

        <div class="codex-preview-note">
          <ShieldCheck :size="15" />
          <span>预览与真实浮窗共用最近重置额度、Weekly 圆环和任务数字投影。</span>
        </div>
      </aside>

      <div class="codex-settings-stack">
        <article class="codex-panel codex-settings-section">
          <div class="codex-panel-title"><div><LayoutDashboard :size="17" /><strong>显示</strong></div></div>
          <div class="codex-hotkey-row">
            <Keyboard :size="17" aria-hidden="true" />
            <span><strong>快速显示 / 隐藏</strong><small>插件内：⌘⌥Q（macOS）或 Ctrl+Alt+Q（Windows）；系统级快捷键由 uTools 管理。</small></span>
            <button type="button" class="secondary" @click="$emit('dispatch', 'codex.hotkey.configure')">配置系统级快捷键</button>
          </div>
        </article>

        <article class="codex-panel codex-settings-section">
          <div class="codex-panel-title"><div><SlidersHorizontal :size="17" /><strong>内容</strong></div></div>
          <fieldset class="codex-fieldset">
            <legend>水球补充读数</legend>
            <div class="codex-check-grid">
              <label v-for="item in compactOptions" :key="item.id">
                <input type="checkbox" :checked="snapshot.settings.compactFields.includes(item.id)" @change="toggleField(snapshot.settings.compactFields, item.id, ($event.target as HTMLInputElement).checked, 'compactFields')" />
                {{ item.label }}
              </label>
            </div>
            <small>中心始终展示服务端窗口中最先重置的真实额度；Weekly 存在时外环表达其剩余比例。展开卡片只列出服务端实际返回的额度窗口。</small>
          </fieldset>
        </article>

        <article class="codex-panel codex-settings-section">
          <div class="codex-panel-title"><div><BellRing :size="17" /><strong>任务</strong></div><span>手动确认</span></div>
          <label class="codex-switch-row">
            <span><strong>显示任务状态</strong><small>等待操作、权威进行中、跨端状态未知与已完成待查看</small></span>
            <input type="checkbox" :checked="snapshot.settings.conversationInboxEnabled" @change="update({ conversationInboxEnabled: ($event.target as HTMLInputElement).checked })" />
            <i />
          </label>
          <div class="codex-form-grid">
            <label><span>刷新频率</span><select :value="snapshot.settings.taskRefreshSeconds" @change="update({ taskRefreshSeconds: Number(($event.target as HTMLSelectElement).value) as CodexSettings['taskRefreshSeconds'] })"><option :value="15">15 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option><option :value="0">仅手动</option></select></label>
            <label><span>时间窗口（天）</span><input type="number" min="1" max="365" :value="snapshot.settings.timeWindowDays" @change="update({ timeWindowDays: Number(($event.target as HTMLInputElement).value) })" /><small>按最后一轮提问时间滚动筛选，边界包含在内。</small></label>
            <div class="codex-readonly-field"><span>真实预检</span><strong>{{ snapshot.conversations.completeness === 'verified' ? `${snapshot.conversations.rawSourceCount} 原始 · ${snapshot.conversations.eligibleSourceCount} 已注册` : '尚未获得完整快照' }}</strong></div>
          </div>
          <div class="codex-retention-readonly"><Check :size="15" /><span><strong>持续保留至手动确认</strong><small>打开、刷新或重启都不会清除待查看任务。</small></span></div>
          <div class="codex-privacy-note">所有页签按最新 Turn.startedAt 严格倒序。已归档任务不进入列表；原生项目注册状态、置顶和顺序只读，别名、隐藏、置顶与“从 EyPc 移除”仅保存在插件本地。</div>
        </article>

        <article class="codex-panel codex-settings-section">
          <div class="codex-panel-title"><div><Palette :size="17" /><strong>主题</strong></div><span>{{ activePreset ? '预设' : '安全自定义' }}</span></div>
          <div class="codex-preset-grid">
            <button v-for="preset in CODEX_THEME_PRESETS" :key="preset.id" type="button" :class="{ active: activePreset === preset.id }" @click="applyPreset(preset)">
              <span class="preset-swatches"><i :style="{ background: preset.colors.water }" /><i :style="{ background: preset.colors.card }" /><i :style="{ background: preset.colors.healthy }" /></span>
              <span><strong>{{ preset.label }}</strong><small>{{ preset.description }}</small></span>
              <Check v-if="activePreset === preset.id" :size="15" />
            </button>
          </div>
          <div class="codex-color-grid">
            <label><input type="color" :value="snapshot.settings.colors.water" @input="updateColor('water', ($event.target as HTMLInputElement).value)" /><span>水球深海</span></label>
            <label><input type="color" :value="snapshot.settings.colors.card" @input="updateColor('card', ($event.target as HTMLInputElement).value)" /><span>卡片纸面</span></label>
            <label><input type="color" :value="snapshot.settings.colors.healthy" @input="updateColor('healthy', ($event.target as HTMLInputElement).value)" /><span>充足</span></label>
            <label><input type="color" :value="snapshot.settings.colors.warning" @input="updateColor('warning', ($event.target as HTMLInputElement).value)" /><span>提醒</span></label>
            <label><input type="color" :value="snapshot.settings.colors.critical" @input="updateColor('critical', ($event.target as HTMLInputElement).value)" /><span>紧张</span></label>
          </div>
          <p v-if="colorError" class="codex-color-error" role="alert">{{ colorError }}；已保留上一次有效配置。</p>
          <p v-else class="codex-color-help">自定义颜色会先校验：必要文字至少 4.5:1，焦点、进度和关键边界至少 3:1。</p>

          <div class="codex-water-settings">
            <fieldset class="codex-fieldset water-settings-group">
              <legend>内层水纹</legend>
              <label><span>配色</span><select :value="waterDraft.inner.palette" @change="updateWaterDraft('inner', 'palette', ($event.target as HTMLSelectElement).value); commitWaterAppearance()"><option value="solid">纯色</option><option value="gradient">渐变</option><option value="aurora">高级炫彩</option></select></label>
              <div class="water-color-pair">
                <label><input type="color" :value="waterDraft.inner.colorA" @input="updateWaterDraft('inner', 'colorA', ($event.target as HTMLInputElement).value.toUpperCase())" @change="commitWaterAppearance" /><span>主色</span></label>
                <label><input type="color" :value="waterDraft.inner.colorB" @input="updateWaterDraft('inner', 'colorB', ($event.target as HTMLInputElement).value.toUpperCase())" @change="commitWaterAppearance" /><span>辅色</span></label>
              </div>
              <label class="water-range"><span>透明度 <strong>{{ waterDraft.inner.opacity }}%</strong></span><input type="range" min="40" max="95" step="1" :value="waterDraft.inner.opacity" @input="updateWaterDraft('inner', 'opacity', Number(($event.target as HTMLInputElement).value))" @change="commitWaterAppearance" /></label>
              <label class="water-range"><span>波幅 <strong>{{ waterDraft.inner.amplitude }}px</strong></span><input type="range" min="4" max="12" step="1" :value="waterDraft.inner.amplitude" @input="updateWaterDraft('inner', 'amplitude', Number(($event.target as HTMLInputElement).value))" @change="commitWaterAppearance" /></label>
              <label><span>水纹速度</span><select :value="waterDraft.inner.motion" @change="updateWaterDraft('inner', 'motion', ($event.target as HTMLSelectElement).value); commitWaterAppearance()"><option value="static">静态</option><option value="slow">慢</option><option value="normal">正常</option><option value="fast">快</option></select></label>
            </fieldset>

            <fieldset class="codex-fieldset water-settings-group">
              <legend>外层 Weekly 环</legend>
              <label><span>环样式</span><select :value="waterDraft.outer.style" @change="updateWaterDraft('outer', 'style', ($event.target as HTMLSelectElement).value); commitWaterAppearance()"><option value="solid">连续</option><option value="segmented">固定分段</option></select></label>
              <label class="water-range"><span>粗细 <strong>{{ waterDraft.outer.thickness }}px</strong></span><input type="range" min="2" max="6" step="1" :value="waterDraft.outer.thickness" @input="updateWaterDraft('outer', 'thickness', Number(($event.target as HTMLInputElement).value))" @change="commitWaterAppearance" /></label>
              <label><span>进度颜色</span><select :value="waterDraft.outer.colorMode" @change="updateWaterDraft('outer', 'colorMode', ($event.target as HTMLSelectElement).value); commitWaterAppearance()"><option value="quota">跟随额度状态</option><option value="custom">自定义</option></select></label>
              <div class="water-color-pair">
                <label v-if="waterDraft.outer.colorMode === 'custom'"><input type="color" :value="waterDraft.outer.progressColor" @input="updateWaterDraft('outer', 'progressColor', ($event.target as HTMLInputElement).value.toUpperCase())" @change="commitWaterAppearance" /><span>进度色</span></label>
                <label><input type="color" :value="waterDraft.outer.trackColor" @input="updateWaterDraft('outer', 'trackColor', ($event.target as HTMLInputElement).value.toUpperCase())" @change="commitWaterAppearance" /><span>轨道色</span></label>
              </div>
              <label><span>光晕</span><select :value="waterDraft.outer.glow" @change="updateWaterDraft('outer', 'glow', ($event.target as HTMLSelectElement).value); commitWaterAppearance()"><option value="off">关闭</option><option value="soft">柔和</option><option value="strong">明显</option></select></label>
              <small>外环跟随水球当前展示的额度家族：普通阶段使用普通 Weekly，Spark 阶段切换到 Spark Weekly；对应 Weekly 缺失时不伪造圆环。</small>
            </fieldset>
          </div>
          <p v-if="waterAppearanceError" class="codex-color-error" role="alert">{{ waterAppearanceError }}；已恢复上一次有效水球配置。</p>
        </article>

        <article class="codex-panel codex-settings-section">
          <div class="codex-panel-title"><div><CircleGauge :size="17" /><strong>刷新与 Codex 配置</strong></div></div>
          <div class="codex-config-facts">
            <div><span>套餐</span><strong>{{ snapshot.quota.plan || '未提供' }}</strong></div>
            <div><span>模型</span><strong>{{ snapshot.config.model || '未提供' }}</strong></div>
            <div><span>Reasoning</span><strong>{{ snapshot.config.reasoningEffort || '未提供' }}</strong></div>
            <div><span>Service tier</span><strong>{{ snapshot.config.serviceTier || '未提供' }}</strong></div>
          </div>
          <div class="codex-form-grid refresh-grid">
            <label><span>额度刷新</span><select :value="snapshot.settings.quotaRefreshMinutes" @change="update({ quotaRefreshMinutes: Number(($event.target as HTMLSelectElement).value) as CodexSettings['quotaRefreshMinutes'] })"><option :value="5">5 分钟</option><option :value="10">10 分钟</option><option :value="15">15 分钟</option><option :value="30">30 分钟</option><option :value="0">仅手动</option></select></label>
            <label><span>新会话普通模型</span><select :value="snapshot.settings.newThreadPreferredModel" :disabled="!ordinaryModels.length" @change="update({ newThreadPreferredModel: ($event.target as HTMLSelectElement).value })"><option value="">目录默认非 Spark 模型</option><option v-for="model in ordinaryModels" :key="model.id" :value="model.id">{{ model.displayName }} · {{ model.id }}</option></select><small>策略固定为 quota-auto；普通窗口返回 0 时自动改用最高可用 Spark，本项不覆盖 Spark 阶段。</small></label>
            <button type="button" class="secondary" @click="$emit('dispatch', 'codex.float.position.reset')"><RotateCcw :size="14" />重置浮窗位置</button>
          </div>
          <div class="codex-privacy-note">动态模型目录：{{ snapshot.modelCatalog.status === 'ok' ? `${snapshot.modelCatalog.models.length} 个可用（Spark ${sparkModels.length}）` : snapshot.modelCatalog.status === 'stale' ? '正在使用上次目录' : '尚未读取' }}。弹窗内临时改选只影响本次会话。</div>
          <div class="codex-size-summary">
            <span>
              <strong>{{ snapshot.floatHost.expandedManual ? `展开面板：${snapshot.floatHost.expandedWidth} × ${snapshot.floatHost.expandedHeight}` : '展开面板：内容自适应' }}</strong>
              <small>{{ snapshot.floatHost.expandedManual ? `按显示器保存${snapshot.floatHost.displayId ? ` · ${snapshot.floatHost.displayId}` : ''}` : '默认宽 360px，高度随内容在 280–460px 间变化' }}</small>
            </span>
            <button type="button" class="secondary" :disabled="!snapshot.floatHost.expandedManual" @click="$emit('dispatch', 'codex.float.size.reset', { displayId: snapshot.floatHost.displayId })"><RotateCcw :size="14" />恢复自适应尺寸</button>
          </div>
          <div class="codex-size-summary codex-workspace-diagnostic">
            <span>
              <strong>{{ snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '跨桌面置顶：已启用' : snapshot.floatHost.workspaceVisibility?.supported ? '跨桌面置顶：核验失败' : '跨桌面置顶：当前平台不支持' }}</strong>
              <small>{{ snapshot.floatHost.workspaceVisibility?.allWorkspaces && snapshot.floatHost.workspaceVisibility?.visibleOnFullScreen ? '当前显示器的所有 Space 与全屏 Space 可见' : snapshot.floatHost.workspaceVisibility?.errorCode || '等待悬浮窗宿主核验' }}</small>
            </span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
