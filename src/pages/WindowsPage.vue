<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AppWindow, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Folder, FolderOpen, Keyboard, LoaderCircle, Pencil, Pin, Power, RefreshCw, ScrollText, ShieldAlert, SquareArrowOutUpRight, Star, X } from '@lucide/vue'
import type { WindowRow } from '../domain/windowTree'
import type { AppRuntimeSnapshot, WindowDraft } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean }>()
const emit = defineEmits<{
  search: [value: string]
  focus: [id: string]
  updateDraft: [value: Partial<WindowDraft>]
  cancelDraft: []
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

const slotRailExpanded = ref(true)
const logRailExpanded = ref(false)
const slotPickerSlot = ref<number | null>(null)

const currentPlatformLabel = computed(() => props.snapshot.windowCapability.platform === 'darwin'
  ? 'macOS'
  : props.snapshot.windowCapability.platform === 'win32'
    ? 'Windows'
    : '当前宿主')

const cacheStatusLabel = computed(() => {
  if (props.snapshot.windowLoading) return '正在加载窗口列表…'
  if (!props.snapshot.windowListLoaded) return '尚未加载 · 手动加载后可用于全局跳转缓存'
  if (!props.snapshot.windowCacheUpdatedAt) return '已缓存'
  const stamp = new Date(props.snapshot.windowCacheUpdatedAt)
  const time = `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
  return `会话缓存 · ${time}`
})

const needsPermission = computed(() => props.snapshot.windowCapability.permission === 'required')
const unsupported = computed(() => !props.snapshot.windowCapability.supported)
const showCapabilityNotice = computed(() => unsupported.value || needsPermission.value)
const showUnloadHint = computed(() => !props.snapshot.windowLoading && !props.snapshot.windowListLoaded && !showCapabilityNotice.value)
const showCandidateHint = computed(() => props.snapshot.windowRebind.phase === 'confirming')
const candidateTarget = computed(() => props.snapshot.windowRebind.targetId
  ? props.snapshot.state.windowTargets.find((target) => target.id === props.snapshot.windowRebind.targetId) || null
  : null)
const candidateTargetLabel = computed(() => candidateTarget.value?.alias || candidateTarget.value?.appName || '原窗口目标')
const candidateTargetLastTitle = computed(() => candidateTarget.value?.lastKnownTitle || '')
const showEmptyHint = computed(() => !props.snapshot.windowLoading && props.snapshot.windowListLoaded && !props.snapshot.windowRows.length && !showCandidateHint.value)
const selectionCount = computed(() => props.snapshot.selectedWindowIds.length)
const windowActivationDiagnostics = computed(() => props.snapshot.windowActivationDiagnostics)
const latestWindowActivationDiagnostic = computed(() => windowActivationDiagnostics.value[0] || null)
const windowOperationTraces = computed(() => props.snapshot.windowOperationTraces)
const canAlwaysOnTop = computed(() => props.snapshot.windowCapability.canAlwaysOnTop === true)
const pageTopmostHint = computed(() => canAlwaysOnTop.value
  ? '页面置顶会让实际窗口保持在普通窗口之上；列表置顶只改变 EyPc 内的排序。'
  : 'macOS 只能展开并前置第三方窗口；EyPc 不会伪造永久页面置顶。')
const multiActions = computed(() => props.snapshot.windowActionsOpen && props.snapshot.windowActionsContext === 'selection')
const groupActions = computed(() => props.snapshot.windowActionsOpen && props.snapshot.windowActionsContext === 'file-manager-group')
const childActions = computed(() => props.snapshot.windowActionsOpen && props.snapshot.windowActionsContext === 'child-window')
const slotActions = computed(() => props.snapshot.windowActionsOpen && props.snapshot.windowActionsContext === 'slot')
const actionSlot = computed(() => props.snapshot.windowActionSlot)
const topLevelWindowCount = computed(() => props.snapshot.windowRows.filter((row) => row.treeLevel === 1).length)
const allActionTargetsPinned = computed(() => {
  const rows = multiActions.value
    ? props.snapshot.windowActionTargets
    : props.snapshot.windowActionTarget
      ? [props.snapshot.windowActionTarget]
      : []
  return rows.length > 0 && rows.every((row) => row.pinned)
})
const pinActionLabel = computed(() => multiActions.value
  ? (allActionTargetsPinned.value ? '批量取消列表置顶' : '批量列表置顶')
  : (allActionTargetsPinned.value ? '取消列表置顶' : '列表置顶'))

const slotTargets = computed(() => {
  const platform = props.snapshot.windowCapability.platform
  const targetsById = new Map(props.snapshot.state.windowTargets.map((target) => [target.id, target]))
  return new Map(props.snapshot.state.windowSlots.flatMap((slot) => {
    const targetId = platform === 'darwin' || platform === 'win32'
      ? slot.targetIdByPlatform[platform]
      : Object.values(slot.targetIdByPlatform).find(Boolean)
    const target = targetId ? targetsById.get(targetId) : null
    return target ? [[slot.slot, target] as const] : []
  }))
})
const assignedSlotCount = computed(() => slotTargets.value.size)

const showLogRail = computed(() => props.snapshot.windowOperationTraceEnabled)

const logBadgeCount = computed(() => windowOperationTraces.value.length)

const logHasBlocking = computed(() => windowOperationTraces.value.some((record) => record.result === 'blocking'))

const bindingSlotAssignedRowId = computed(() => {
  const slot = slotPickerSlot.value
  if (slot == null) return null
  const row = props.snapshot.windowRows.find((r) => r.slotNumbers.includes(slot))
  return row?.id ?? null
})

function rowDomId(id: string) {
  return `window-row-${encodeURIComponent(id).replace(/%/g, '_')}`
}

function commandLabel(commandId: string, fallback: string) {
  return props.showShortcutHints ? props.snapshot.commandShortcutLabels[commandId] || fallback : ''
}

function focus(row: WindowRow) {
  emit('focus', row.id)
}

function activate(row?: WindowRow) {
  emit('dispatch', 'windows.activate', row ? { rowId: row.id } : undefined)
}

function alwaysOnTop(row?: WindowRow) {
  emit('dispatch', 'windows.alwaysOnTop', row ? { rowId: row.id } : undefined)
}

function openActions(row?: WindowRow) {
  if (showCandidateHint.value) return
  emit('dispatch', 'windows.actions.open', row ? { rowId: row.id } : undefined)
}

function toggleFavorite(row?: WindowRow) {
  emit('dispatch', 'windows.favorite.toggle', row ? { rowId: row.id } : undefined)
}

function togglePin(row?: WindowRow) {
  emit('dispatch', 'windows.pin.toggle', row ? { rowId: row.id } : undefined)
}

function closeWindows(force = false) {
  emit('dispatch', force ? 'windows.close.force' : 'windows.close')
}

function edit(row: WindowRow, mode: 'rename' | 'edit') {
  emit('dispatch', mode === 'rename' ? 'windows.rename' : 'windows.edit', { rowId: row.id })
}

function assignSlot(slot: number) {
  const row = props.snapshot.windowActionTarget
  emit('dispatch', 'windows.slot.assign', { slot, ...(row ? { rowId: row.id } : {}) })
}

function configureSlot(slot: number) {
  emit('dispatch', 'windows.slot.configure', { slot })
}

function openSlotActions(slot: number) {
  exitSlotBinding()
  emit('dispatch', 'windows.slot.actions.open', { slot })
}

function activateActionSlot() {
  if (actionSlot.value == null) return
  emit('dispatch', 'windows.slot.activate', { slot: actionSlot.value })
}

function reselectActionSlot() {
  if (actionSlot.value == null) return
  const slot = actionSlot.value
  emit('dispatch', 'windows.actions.close')
  enterSlotBinding(slot)
}

function clearSlot(slot: number) {
  emit('dispatch', 'windows.slot.clear', { slot })
}

function focusSlot(slot: number) {
  emit('dispatch', 'windows.slot.focus', { slot })
}

function slotTargetLabel(slot: number) {
  return slotTargets.value.get(slot)?.alias || '未分配'
}

function slotAssigned(slot: number) {
  return slotTargets.value.has(slot)
}

function slotChipTitle(slot: number) {
  if (slotAssigned(slot)) {
    return `槽 ${slot}：${slotTargetLabel(slot)}（右键打开槽位操作，Shift+点击清除）`
  }
  return `槽 ${slot}：未分配（点击选择窗口）`
}

function toggleSlotRail() {
  slotRailExpanded.value = !slotRailExpanded.value
  if (!slotRailExpanded.value) exitSlotBinding()
}

function onSlotChipPointerDown(slot: number, event: PointerEvent) {
  if (event.button !== 0) return
  if (event.shiftKey) {
    clearSlot(slot)
    exitSlotBinding()
    return
  }
  if (event.altKey) {
    enterSlotBinding(slot)
    return
  }
  if (slotAssigned(slot)) {
    exitSlotBinding()
    focusSlot(slot)
    return
  }
  enterSlotBinding(slot)
}

function enterSlotBinding(slot: number) {
  if (!slotRailExpanded.value) slotRailExpanded.value = true
  slotPickerSlot.value = slot
}

function exitSlotBinding() {
  slotPickerSlot.value = null
}

function assignPickerRow(row: WindowRow) {
  const slot = slotPickerSlot.value
  if (slot == null) return
  if (row.kind === 'child-window') return
  if (row.slotNumbers.includes(slot)) {
    exitSlotBinding()
    return
  }
  emit('dispatch', 'windows.slot.assign', { slot, rowId: row.id })
  exitSlotBinding()
}

function onWindowRowClick(row: WindowRow) {
  if (showCandidateHint.value) {
    focus(row)
    return
  }
  if (slotPickerSlot.value != null) {
    assignPickerRow(row)
    return
  }
  focus(row)
}

function toggleGroup(row: WindowRow) {
  if (!row.expandable) return
  emit('dispatch', 'windows.tree.toggle', { rowId: row.id, expanded: !row.expanded })
}

function onWindowRowDoubleClick(row: WindowRow) {
  if (row.kind === 'file-manager-group' && row.candidate) return
  activate(row)
}

function onWindowRowKeydown(event: KeyboardEvent) {
  if (showCandidateHint.value) return
  if (slotPickerSlot.value == null) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    exitSlotBinding()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    const focusedId = props.snapshot.focusedWindowId
    const row = props.snapshot.windowRows.find((r) => r.id === focusedId)
    if (row) assignPickerRow(row)
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (slotPickerSlot.value == null) return
  const target = event.target as Node | null
  if (target && (target as HTMLElement).closest?.('#window-list')) return
  if (target && (target as HTMLElement).closest?.(`[data-slot-chip="${slotPickerSlot.value}"]`)) return
  exitSlotBinding()
}

function activationEntryLabel(diagnostic: AppRuntimeSnapshot['windowActivationDiagnostics'][number]) {
  return diagnostic.entry === 'slot' ? `全局槽 ${diagnostic.slot || '—'}` : '手动激活'
}

function activationPlatformLabel(diagnostic: AppRuntimeSnapshot['windowActivationDiagnostics'][number]) {
  return diagnostic.platform === 'darwin' ? 'macOS' : diagnostic.platform === 'win32' ? 'Windows' : '当前宿主'
}

function activationStageLabel(diagnostic: AppRuntimeSnapshot['windowActivationDiagnostics'][number]) {
  const labels: Record<string, string> = {
    entry: '入口',
    capability: '能力',
    resolve: '解析',
    refresh: '重扫',
    activate: '激活',
    topmost: '页面置顶',
    visibility: '可见性'
  }
  return labels[diagnostic.stage] || diagnostic.stage
}

function timestampLabel(timestamp: number) {
  const stamp = new Date(timestamp)
  return `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}:${String(stamp.getSeconds()).padStart(2, '0')}`
}

function activationTimestamp(diagnostic: AppRuntimeSnapshot['windowActivationDiagnostics'][number]) {
  return timestampLabel(diagnostic.timestamp)
}

function operationEntryLabel(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  return record.entry === 'slot' ? `全局槽 ${record.slot || '—'}` : '手动操作'
}

function operationTargetLabel(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  return record.targetTitle || '目标尚未解析'
}

function operationPlatformLabel(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  return record.platform === 'darwin' ? 'macOS' : record.platform === 'win32' ? 'Windows' : '当前宿主'
}

function operationKindLabel(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  return record.operation === 'always-on-top' ? '页面置顶' : '展开并前置'
}

function operationResultLabel(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  return record.result === 'success' ? '完成' : record.result === 'target-closed' ? '已确认关闭' : '阻断'
}

function operationStageLabel(stage: AppRuntimeSnapshot['windowOperationTraces'][number]['steps'][number]['stage']) {
  const labels: Record<string, string> = {
    entry: '入口',
    capability: '能力',
    cache: '缓存',
    resolve: '解析',
    refresh: '重扫',
    native: '宿主汇总',
    visibility: '可见性',
    bridge: '桥接',
    target: '目标引用',
    process: '进程',
    restore: '展开',
    foreground: '前置',
    raise: 'Raise',
    verify: '核验',
    topmost: '页面置顶'
  }
  return labels[stage] || stage
}

function operationOutcomeLabel(outcome: AppRuntimeSnapshot['windowOperationTraces'][number]['steps'][number]['outcome']) {
  const labels: Record<string, string> = {
    ok: '成功',
    skipped: '跳过',
    'not-found': '未找到',
    ambiguous: '多候选',
    failed: '失败',
    denied: '被拒绝',
    unsupported: '不支持',
    unavailable: '不可读取'
  }
  return labels[outcome] || outcome
}

function operationDetailLabel(detail: NonNullable<AppRuntimeSnapshot['windowOperationTraces'][number]['steps'][number]['detail']>) {
  const labels: Record<string, string> = {
    'instance-match': '窗口实例精确匹配',
    'instance-mismatch': '窗口实例不一致',
    'identity-unavailable': '实例身份不可用',
    'focus-state-mismatch': '窗口焦点属性未确认',
    'root-family-match': '根窗口族已确认',
    'ax-cg-id-match': 'AX与CG窗口精确匹配',
    'ax-focused-root-window': '根窗口焦点已确认',
    error: '调用异常'
  }
  return labels[detail] || detail
}

const operationCodeMessages: Record<string, string> = {
  'target-closed': '已确认目标窗口已关闭，已清除陈旧引用。',
  'feature-disabled': '窗口跳转功能已关闭。',
  'slot-missing': '窗口槽位不存在。',
  'slot-unassigned': '当前窗口槽尚未分配目标。',
  'capability-read-failed': '无法读取窗口能力。',
  'bridge-stale': '窗口桥接版本与当前界面不一致，请重新连接 preload。',
  'unsupported-host': '当前宿主不支持所需的窗口跳转能力。',
  'permission-required': '需要系统窗口控制权限后才能继续。',
  'refresh-failed': '无法完成窗口实时重扫。',
  'refresh-superseded': '窗口实时重扫被新的请求替代，请重试。',
  'refresh-incomplete': '本次只读取到局部窗口，已保留缓存。',
  'ambiguous-target': '匹配到多个候选窗口，需要明确选择。',
  'rebind-required': '原窗口实例已失效，请明确选择同应用候选；标题仅供辨认。',
  'instance-mismatch': '窗口实例与保存目标不一致，请重新确认。',
  'identity-unavailable': '无法建立稳定的系统窗口实例身份。',
  'focus-denied': '系统拒绝聚焦该窗口。',
  'activation-not-found': '激活时窗口引用已失效。',
  'activation-failed': '宿主未能完成窗口激活。',
  'topmost-unsupported': '当前系统只能前置窗口，不能保持在最上层。',
  'topmost-failed': '宿主未能将页面置顶。',
  'workbench-show-failed': '无法显示窗口工作台以呈现本次阻断原因。',
  'silent-hide-failed': '窗口已激活，但插件窗口未能静默隐藏。',
  'activated': '已成功激活目标窗口。',
  'topmost-enabled': '已成功置顶目标窗口。'
}

function operationTraceSummary(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  const kind = operationKindLabel(record)
  const result = operationResultLabel(record)
  const message = operationCodeMessages[record.code] || record.code
  return `${kind} · ${result}：${message}`
}

function operationTracePlainText(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  const steps = record.steps.map((step, index) => {
    const detail = step.detail ? `:${step.detail}` : ''
    return `#${index + 1} ${step.stage}=${step.outcome}${detail}`
  }).join(' > ')
  const parts = [
    timestampLabel(record.timestamp),
    `目标窗口：${operationTargetLabel(record)}`,
    operationEntryLabel(record),
    operationPlatformLabel(record),
    operationKindLabel(record),
    operationResultLabel(record),
    record.code,
    steps
  ]
  return parts.join(' | ')
}

async function copyOperationTracePlainText(record: AppRuntimeSnapshot['windowOperationTraces'][number]) {
  const text = operationTracePlainText(record)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {}
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

function rowStatus(row: WindowRow) {
  if (row.kind === 'file-manager-group') {
    if (row.unavailable) return '当前无可用窗口'
    return `${row.childCount} 个窗口`
  }
  if (row.kind === 'child-window') {
    if (row.cached) return '缓存子窗口'
    if (row.live?.focused) return '当前子窗口'
    if (row.live?.minimized) return '已最小化'
    return row.live?.canClose ? '可精确打开/关闭' : '可精确打开'
  }
  if (row.candidate) {
    if (row.cached) return '缓存候选 · 待确认'
    if (row.live?.focused) return '前台 · 待确认'
    if (row.live?.minimized) return '已最小化 · 待确认'
    return '待确认'
  }
  if (row.ambiguous) return '多个匹配'
  if (row.unavailable) return props.snapshot.windowListLoaded ? '当前不可用' : '待加载'
  if (row.cached) return '缓存保留'
  if (row.live?.minimized) return '已最小化'
  if (row.live?.focused) return '前台'
  if (row.slotNumbers.length && !row.favorite) return '稳定槽'
  return row.favorite ? '已收藏' : '实时窗口'
}

function statusClass(row: WindowRow) {
  return {
    unavailable: row.unavailable,
    cached: row.cached,
    ambiguous: row.ambiguous,
    focused: Boolean(row.live?.focused && !row.cached)
  }
}

/** Compact list/action labels keep the full identity only for hover Tooltip. */
function rowIdentityLabel(row: WindowRow) {
  const parts: string[] = []
  if (row.displayName) parts.push(row.displayName)
  if (row.title && row.title !== row.displayName) parts.push(row.title)
  if (row.appName && row.appName !== row.displayName && row.appName !== row.title) parts.push(row.appName)
  if (row.live?.platform === 'win32' && row.live.nativeRef) parts.push(`HWND ${row.live.nativeRef}`)
  if (row.kind === 'file-manager-group') parts.push(`${row.childCount} 个独立主窗口`)
  if (row.kind === 'child-window') parts.push('真实子窗口')
  return parts.join(' · ') || '窗口'
}

function actionTargetsFullLabel(rows: readonly WindowRow[]) {
  return rows.map((row) => row.displayName).filter(Boolean).join('、') || '窗口'
}

function actionTargetsShortLabel(rows: readonly WindowRow[]) {
  if (!rows.length) return '选择列表项后可操作'
  if (rows.length <= 2) return actionTargetsFullLabel(rows)
  return `${rows[0].displayName}、${rows[1].displayName} 等 ${rows.length} 个`
}

function updateDraft(field: 'alias', event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('updateDraft', { alias: value })
}

watch(logHasBlocking, (blocking) => {
  if (showLogRail.value && blocking) logRailExpanded.value = true
}, { immediate: true })

watch(showCandidateHint, (active) => {
  if (active) exitSlotBinding()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <section class="windows-page" aria-label="窗口跳转">
    <div class="window-toolbar" aria-label="窗口工具条">
      <div
        class="window-toolbar-meta"
        :title="`${currentPlatformLabel} · ${cacheStatusLabel}`"
        :data-operation-tooltip="`${currentPlatformLabel} · ${cacheStatusLabel}`"
      >
        <strong>窗口跳转</strong>
        <small>{{ currentPlatformLabel }} · {{ cacheStatusLabel }}</small>
      </div>
      <div class="window-search-row">
        <AppWindow :size="16" aria-hidden="true" />
        <input
          data-role="window-search"
          class="primary-search"
          type="search"
          role="searchbox"
          placeholder="搜索别名、窗口标题或应用名"
          :disabled="showCandidateHint"
          :aria-disabled="showCandidateHint"
          :value="snapshot.state.windowSearch"
          :aria-activedescendant="snapshot.focusedWindowId ? rowDomId(snapshot.focusedWindowId) : undefined"
          aria-controls="window-list"
          @input="$emit('search', ($event.target as HTMLInputElement).value)"
        />
        <kbd v-if="commandLabel('windows.search.focus', 'c-f')">{{ commandLabel('windows.search.focus', 'c-f') }}</kbd>
      </div>
      <button
        type="button"
        class="window-load-button"
        :class="{ spinning: snapshot.windowLoading }"
        :disabled="snapshot.windowLoading"
        :aria-label="snapshot.windowListLoaded ? '刷新窗口列表' : '加载窗口列表'"
        :title="snapshot.windowListLoaded ? '刷新窗口列表' : '加载窗口列表'"
        data-quick-jump-target
        :data-quick-jump-label="snapshot.windowListLoaded ? '刷新窗口列表' : '加载窗口列表'"
        @click="$emit('dispatch', 'windows.refresh')"
      >
        <RefreshCw :size="15" />
        <span>{{ snapshot.windowListLoaded ? '刷新' : '加载' }}</span>
        <kbd v-if="commandLabel('windows.refresh', 'c-r')">{{ commandLabel('windows.refresh', 'c-r') }}</kbd>
      </button>
    </div>

    <section v-if="showCapabilityNotice" class="window-capability-notice" role="status">
      <ShieldAlert :size="20" />
      <div>
        <strong>{{ needsPermission ? '需要 macOS 窗口权限' : '当前宿主不支持窗口跳转' }}</strong>
        <p>{{ snapshot.windowCapability.reason || '窗口能力会在支持的 uTools preload 中可用。' }}</p>
      </div>
      <div class="window-notice-actions">
        <button v-if="needsPermission" type="button" @click="$emit('dispatch', 'windows.permission.settings')">打开系统设置</button>
        <button type="button" @click="$emit('dispatch', 'windows.refresh')">授权后重试</button>
      </div>
    </section>

    <p
      id="window-status-band"
      v-else
      class="window-status-band"
      :aria-live="latestWindowActivationDiagnostic?.level === 'blocking' && !showCandidateHint && !snapshot.windowLoading ? 'assertive' : 'polite'"
      :role="latestWindowActivationDiagnostic?.level === 'blocking' && !showCandidateHint && !snapshot.windowLoading ? 'alert' : undefined"
    >
      <LoaderCircle v-if="snapshot.windowLoading" :size="14" class="spinning" />
      <template v-else-if="showCandidateHint">正在为「{{ candidateTargetLabel }}」重新选择窗口。<template v-if="candidateTargetLastTitle">上次标题「{{ candidateTargetLastTitle }}」；</template>原窗口实例已失效，下方标题与状态仅供人工辨认。按 Enter 确认，或按 Escape 取消并返回原目标。</template>
      <template v-else-if="latestWindowActivationDiagnostic">{{ latestWindowActivationDiagnostic.message }}</template>
      <template v-else-if="showUnloadHint">列表未加载。手动加载后写入会话缓存；全局槽位会先静默解析，缓存未命中时自动重扫一次，仅失败才展开本页。</template>
      <template v-else-if="showEmptyHint">没有匹配窗口。请调整搜索词，或重新加载列表。</template>
      <template v-else>{{ topLevelWindowCount }} 个主项目 · {{ snapshot.windowRows.length }} 个可见树节点 · 仅展示可验证的用户窗口 · {{ snapshot.windowCapability.canList ? '按需扫描' : '等待授权' }}</template>
    </p>

    <div class="windows-body">
      <aside
        v-if="!showCandidateHint"
        class="window-slot-rail"
        :class="{ expanded: slotRailExpanded, 'picker-open': slotPickerSlot != null }"
        aria-label="稳定快捷槽"
      >
        <button
          type="button"
          class="window-rail-toggle"
          :aria-expanded="slotRailExpanded"
          :aria-label="slotRailExpanded ? '收起稳定槽' : '展开稳定槽'"
          :title="slotRailExpanded ? '收起稳定槽' : '展开稳定槽'"
          data-role="window-slot-rail-toggle"
          @click="toggleSlotRail"
        >
          <Keyboard :size="14" aria-hidden="true" />
          <span v-if="!slotRailExpanded" class="window-rail-toggle-label">槽</span>
          <span v-if="!slotRailExpanded && assignedSlotCount" class="window-rail-badge">{{ assignedSlotCount }}</span>
          <ChevronLeft v-if="slotRailExpanded" :size="14" aria-hidden="true" />
          <ChevronRight v-else :size="14" aria-hidden="true" />
        </button>
        <div class="window-slot-rail-body" v-show="slotRailExpanded">
          <p class="window-slot-rail-hint">全局静默跳转 · Ctrl+1…0 分配</p>
          <div class="window-slot-rail-list" role="list">
            <button
              v-for="slot in 10"
              :key="slot"
              type="button"
              class="window-slot-chip"
              :class="{ assigned: slotAssigned(slot), picking: slotPickerSlot === slot }"
              :data-slot-chip="slot"
              role="listitem"
              :title="slotChipTitle(slot)"
              :data-operation-tooltip="slotChipTitle(slot)"
              data-quick-jump-target
              :data-quick-jump-label="`窗口槽 ${slot}`"
              @pointerdown="onSlotChipPointerDown(slot, $event)"
              @contextmenu.prevent="openSlotActions(slot)"
            >
              <kbd>{{ slot }}</kbd>
              <span>{{ slotTargetLabel(slot) }}</span>
            </button>
          </div>
        </div>
      </aside>

      <div class="window-workbench" :class="{ 'has-actions': snapshot.windowActionsOpen, 'candidate-mode': showCandidateHint }">
        <section class="window-list-panel" aria-label="窗口列表">
          <div
            v-if="slotPickerSlot != null"
            class="window-slot-binding-hint"
            data-role="window-slot-binding-hint"
            role="status"
          >
            请点击选择窗口绑定到槽 {{ slotPickerSlot }} · Esc 取消
          </div>
          <div
            id="window-list"
            data-role="window-list"
            class="window-list"
            role="tree"
            tabindex="0"
            :aria-multiselectable="showCandidateHint ? undefined : true"
            :aria-describedby="showCandidateHint ? 'window-status-band' : undefined"
            :aria-activedescendant="snapshot.focusedWindowId ? rowDomId(snapshot.focusedWindowId) : undefined"
            @keydown="onWindowRowKeydown"
          >
            <div
              v-for="row in snapshot.windowRows"
              :id="rowDomId(row.id)"
              :key="row.id"
              class="window-row"
              :class="{ active: row.focused, selected: row.selected, favorite: row.favorite, pinned: row.pinned, unavailable: row.unavailable, cached: row.cached, candidate: row.candidate, binding: slotPickerSlot != null, 'binding-assigned': bindingSlotAssignedRowId === row.id, 'file-manager-group': row.kind === 'file-manager-group', 'tree-level-2': row.treeLevel === 2 }"
              role="treeitem"
              :aria-level="row.treeLevel"
              :aria-expanded="row.expandable ? row.expanded : undefined"
              :aria-disabled="row.kind === 'file-manager-group' && row.candidate ? true : undefined"
              :aria-selected="row.kind === 'window' && !showCandidateHint ? row.selected : undefined"
              :data-operation-tooltip="rowIdentityLabel(row)"
              :data-operation-description="row.kind === 'file-manager-group' ? '单击聚焦；双击或 Enter 激活最近主窗口；左右方向键展开或收起；右键打开操作' : row.kind === 'child-window' ? '单击聚焦；双击或 Enter 精确激活该子窗口；右键打开精确操作' : row.candidate ? '单击聚焦；双击或按 Enter 确认换绑；按 Escape 取消' : '单击聚焦；双击或 Enter 激活主窗口当前子窗口；左右方向键展开或收起；右键打开操作'"
              :data-quick-jump-target="true"
              :data-quick-jump-label="`${row.displayName} ${row.appName}`"
              :data-quick-jump-search="`${row.title} ${row.appName}`"
              @click="onWindowRowClick(row)"
              @dblclick="onWindowRowDoubleClick(row)"
              @contextmenu.prevent="openActions(row)"
            >
              <button
                v-if="row.expandable"
                type="button"
                class="window-tree-toggle"
                tabindex="-1"
                :disabled="row.candidate"
                :aria-label="row.expanded ? `收起 ${row.displayName}` : `展开 ${row.displayName}`"
                :aria-expanded="row.expanded"
                aria-controls="window-list"
                @click.stop="toggleGroup(row)"
                @dblclick.stop
              >
                <ChevronDown v-if="row.expanded" :size="14" aria-hidden="true" />
                <ChevronRight v-else :size="14" aria-hidden="true" />
              </button>
              <span v-else class="window-tree-spacer" aria-hidden="true"></span>
              <span class="window-row-leading" aria-hidden="true">
                <Check v-if="bindingSlotAssignedRowId === row.id" :size="15" class="binding-checkmark" />
                <FolderOpen v-else-if="row.kind === 'file-manager-group' && row.expanded" :size="15" />
                <Folder v-else-if="row.kind === 'file-manager-group'" :size="15" />
                <AppWindow v-else-if="row.candidate" :size="15" />
                <Star v-else-if="row.favorite" :size="15" fill="currentColor" />
                <AppWindow v-else :size="15" />
              </span>
              <span class="window-row-copy">
                <strong>{{ row.displayName }}</strong>
                <small>{{ row.appName }}</small>
              </span>
              <span class="window-row-trailing">
                <span v-if="!row.candidate && row.pinned" class="window-pin-badge" aria-label="已在列表置顶"><Pin :size="11" aria-hidden="true" />列表置顶</span>
                <span v-if="!row.candidate && row.slotNumbers.length" class="window-slot-badges" :aria-label="`槽位 ${row.slotNumbers.join('、')}`">
                  <kbd v-for="slot in row.slotNumbers" :key="slot">{{ slot }}</kbd>
                </span>
                <span class="window-status" :class="statusClass(row)">{{ rowStatus(row) }}</span>
              </span>
            </div>
            <p v-if="!snapshot.windowRows.length && !snapshot.windowLoading" class="empty-state">
              {{ showCandidateHint ? '当前没有可确认的同应用窗口。可刷新重试，或按 Escape 返回原目标。' : showUnloadHint ? '尚未加载实时窗口。可先查看已保存的收藏与稳定槽，再点击加载。' : '没有匹配窗口。请刷新、调整搜索词，或在授权后重试。' }}
            </p>
            <p v-if="selectionCount && !showCandidateHint" class="window-selection-cue" aria-live="polite">已选 {{ selectionCount }} · Esc 清空 · Space 切换并下移</p>
          </div>
        </section>

        <aside v-if="snapshot.windowActionsOpen && !showCandidateHint" data-role="window-actions" class="window-actions-panel" aria-label="窗口操作面板">
          <header>
            <div>
              <p class="eyebrow">{{ slotActions ? `稳定槽 ${actionSlot || '—'}` : groupActions ? '文件管理器父节点' : childActions ? '指定子窗口' : multiActions ? `已选 ${snapshot.windowActionTargets.length} 个窗口` : '当前主窗口' }}</p>
              <h3
                class="window-actions-title"
                :title="multiActions ? undefined : (snapshot.windowActionTarget ? rowIdentityLabel(snapshot.windowActionTarget) : undefined)"
                :data-operation-tooltip="multiActions ? undefined : (snapshot.windowActionTarget ? rowIdentityLabel(snapshot.windowActionTarget) : undefined)"
              >{{ slotActions && actionSlot ? slotTargetLabel(actionSlot) : multiActions ? '批量操作' : (snapshot.windowActionTarget?.displayName || '未选择') }}</h3>
              <p
                class="window-actions-subtitle"
                :title="multiActions
                  ? actionTargetsFullLabel(snapshot.windowActionTargets)
                  : (snapshot.windowActionTarget ? rowIdentityLabel(snapshot.windowActionTarget) : undefined)"
                :data-operation-tooltip="multiActions
                  ? actionTargetsFullLabel(snapshot.windowActionTargets)
                  : (snapshot.windowActionTarget ? rowIdentityLabel(snapshot.windowActionTarget) : undefined)"
              >{{ slotActions
                ? '激活、重新选择、清除或配置该槽位'
                : multiActions
                ? actionTargetsShortLabel(snapshot.windowActionTargets)
                : (snapshot.windowActionTarget?.appName || '选择列表项后可操作') }}</p>
            </div>
            <button type="button" class="icon-button" aria-label="返回窗口列表" @click="$emit('dispatch', 'windows.actions.close')"><X :size="16" /></button>
          </header>

          <div class="window-primary-actions">
            <button v-if="slotActions" type="button" :disabled="!actionSlot || !slotAssigned(actionSlot || 0)" @click="activateActionSlot"><SquareArrowOutUpRight :size="15" />激活槽位</button>
            <button v-if="slotActions" type="button" :disabled="!actionSlot" @click="reselectActionSlot"><AppWindow :size="15" />重新选择目标</button>
            <button v-if="slotActions" type="button" :disabled="!actionSlot || !slotAssigned(actionSlot || 0)" @click="actionSlot && clearSlot(actionSlot)"><X :size="15" />清除槽位</button>
            <button v-if="slotActions" type="button" :disabled="!actionSlot" @click="actionSlot && configureSlot(actionSlot)"><Keyboard :size="15" />打开 uTools 快捷键设置</button>
            <button v-if="!multiActions && !slotActions" type="button" :disabled="!snapshot.windowActionTarget" @click="activate(snapshot.windowActionTarget || undefined)"><SquareArrowOutUpRight :size="15" />{{ groupActions ? '激活最近主窗口' : childActions ? '精确打开子窗口' : '打开当前子窗口' }}</button>
            <button v-if="groupActions" type="button" :disabled="!snapshot.windowActionTarget" @click="snapshot.windowActionTarget && toggleGroup(snapshot.windowActionTarget)"><ChevronDown v-if="snapshot.windowActionTarget?.expanded" :size="15" /><ChevronRight v-else :size="15" />{{ snapshot.windowActionTarget?.expanded ? '收起子窗口' : '展开子窗口' }}</button>
            <button
              v-if="!multiActions && !groupActions && !childActions && !slotActions"
              type="button"
              class="window-page-topmost"
              :disabled="!snapshot.windowActionTarget || !canAlwaysOnTop"
              :title="canAlwaysOnTop ? '将实际窗口保持在其他普通窗口上方' : 'macOS 只能展开并前置，不能将第三方窗口保持在最上层'"
              @click="alwaysOnTop(snapshot.windowActionTarget || undefined)"
            ><Pin :size="15" />页面置顶</button>
            <button v-if="!slotActions && !childActions" type="button" :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget" @click="toggleFavorite(multiActions ? undefined : (snapshot.windowActionTarget || undefined))"><Star :size="15" />{{ multiActions ? '批量收藏' : (snapshot.windowActionTarget?.favorite ? '取消收藏' : '收藏') }}</button>
            <button
              v-if="!slotActions && !childActions"
              type="button"
              :class="{ pinned: allActionTargetsPinned }"
              :aria-pressed="allActionTargetsPinned"
              :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget"
              @click="togglePin(multiActions ? undefined : (snapshot.windowActionTarget || undefined))"
            ><Pin :size="15" />{{ pinActionLabel }}</button>
            <button v-if="!groupActions && !slotActions" type="button" :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget || (childActions && snapshot.windowActionTarget.live?.canClose !== true)" @click="closeWindows(false)"><Power :size="15" />{{ childActions ? '精确关闭子窗口' : '关闭窗口' }}</button>
            <button v-if="!groupActions && !childActions && !slotActions" type="button" class="danger" :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget" @click="closeWindows(true)"><Power :size="15" />强制关闭</button>
            <button v-if="!multiActions && !childActions && !slotActions" type="button" :disabled="!snapshot.windowActionTarget" @click="snapshot.windowActionTarget && edit(snapshot.windowActionTarget, 'rename')"><Pencil :size="15" />编辑别名</button>
            <button v-if="!multiActions && !groupActions && !childActions && !slotActions" type="button" :disabled="!snapshot.windowActionTarget" @click="snapshot.windowActionTarget && edit(snapshot.windowActionTarget, 'edit')"><Pencil :size="15" />完整编辑</button>
            <button v-if="!multiActions && !groupActions && !slotActions && snapshot.windowActionTarget?.live?.platform === 'win32'" type="button" @click="$emit('dispatch', 'windows.hwnd.copy', { rowId: snapshot.windowActionTarget?.id })"><Copy :size="15" />复制 HWND</button>
            <kbd v-if="!groupActions && !slotActions && commandLabel('windows.close', 'c-del')" class="window-actions-chord">{{ commandLabel('windows.close', 'c-del') }}</kbd>
          </div>
          <p v-if="!multiActions && !groupActions && !childActions && !slotActions" class="window-topmost-note" role="status">{{ pageTopmostHint }}</p>

          <section v-if="!multiActions && !childActions && !slotActions" class="window-slot-section" aria-label="稳定快捷槽分配">
            <div class="window-slot-heading">
              <div><Keyboard :size="15" /><strong>分配稳定槽</strong></div>
              <small>Ctrl+1…0 · 改别名不改 uTools 绑定</small>
            </div>
            <div class="window-slot-grid">
              <div v-for="slot in 10" :key="slot" class="window-slot-row">
                <div><kbd>{{ slot }}</kbd><span>{{ slotTargetLabel(slot) }}</span></div>
                <div>
                  <button type="button" :disabled="!snapshot.windowActionTarget" :title="`将当前窗口分配到槽 ${slot}`" @click="assignSlot(slot)">分配</button>
                  <button type="button" :disabled="!slotAssigned(slot)" :title="`清除槽 ${slot} 当前平台关联`" @click="clearSlot(slot)">清除</button>
                  <button type="button" :title="`在 uTools 中设置 EyPc 窗口槽 ${slot}`" @click="configureSlot(slot)">设置</button>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <aside
        v-if="!showCandidateHint && showLogRail"
        class="window-log-rail"
        :class="{ expanded: logRailExpanded, blocking: logHasBlocking }"
        aria-label="窗口日志"
      >
        <button
          type="button"
          class="window-rail-toggle"
          :aria-expanded="logRailExpanded"
          :aria-label="logRailExpanded ? '收起日志' : '展开日志'"
          :title="logRailExpanded ? '收起日志' : '展开日志'"
          data-role="window-log-rail-toggle"
          @click="logRailExpanded = !logRailExpanded"
        >
          <ScrollText :size="14" aria-hidden="true" />
          <span v-if="!logRailExpanded" class="window-rail-toggle-label">日志</span>
          <span v-if="!logRailExpanded && logBadgeCount" class="window-rail-badge" :class="{ blocking: logHasBlocking }">{{ logBadgeCount }}</span>
          <ChevronRight v-if="logRailExpanded" :size="14" aria-hidden="true" />
          <ChevronLeft v-else :size="14" aria-hidden="true" />
        </button>
        <div class="window-log-rail-body" v-show="logRailExpanded">
          <section v-if="windowActivationDiagnostics.length && !snapshot.windowOperationTraceEnabled" class="window-activation-diagnostics" aria-label="本次窗口激活诊断">
            <div
              v-if="latestWindowActivationDiagnostic"
              class="window-activation-diagnostics-summary"
              :class="latestWindowActivationDiagnostic.level"
              :role="latestWindowActivationDiagnostic.level === 'blocking' ? 'alert' : 'status'"
            >
              <strong>{{ latestWindowActivationDiagnostic.level === 'blocking' ? '窗口激活被阻断' : '已确认目标关闭' }}</strong>
              <span>{{ latestWindowActivationDiagnostic.message }}</span>
            </div>
            <ol class="window-activation-diagnostics-list">
              <li
                v-for="diagnostic in windowActivationDiagnostics"
                :key="diagnostic.id"
                :class="diagnostic.level"
                :role="diagnostic.level === 'blocking' ? 'alert' : 'status'"
              >
                <div>
                  <span>{{ activationTimestamp(diagnostic) }}</span>
                  <span>{{ activationEntryLabel(diagnostic) }}</span>
                  <span>{{ activationPlatformLabel(diagnostic) }} · {{ activationStageLabel(diagnostic) }}</span>
                  <code>{{ diagnostic.code }}</code>
                </div>
                <p>{{ diagnostic.message }}</p>
              </li>
            </ol>
            <button type="button" data-role="window-activation-diagnostics-clear" @click="$emit('dispatch', 'windows.activation.diagnostics.clear')">清空本次记录</button>
          </section>

          <section v-if="snapshot.windowOperationTraceEnabled" class="window-operation-trace" role="status" aria-label="开发窗口操作追踪" data-role="window-operation-trace">
            <header>
              <div>
                <strong>开发窗口操作追踪</strong>
                <p>仅开发环境显示；含已授权目标标题，其余字段保持脱敏。侧栏展开查看，不占用主列表高度。</p>
              </div>
              <button v-if="windowOperationTraces.length" type="button" data-role="window-operation-trace-clear" @click="$emit('dispatch', 'windows.operation.traces.clear')">清空开发记录</button>
            </header>
            <p v-if="!windowOperationTraces.length" class="window-operation-trace-empty">尚无本次窗口操作记录。</p>
            <ol v-else class="window-operation-trace-list">
              <li v-for="record in windowOperationTraces" :key="record.id" :class="record.result">
                <div class="window-operation-trace-meta">
                  <span>{{ timestampLabel(record.timestamp) }}</span>
                  <span>目标窗口：{{ operationTargetLabel(record) }}</span>
                  <span>{{ operationEntryLabel(record) }}</span>
                  <span>{{ operationPlatformLabel(record) }}</span>
                  <span>{{ operationKindLabel(record) }} · {{ operationResultLabel(record) }}</span>
                  <button type="button" data-role="window-operation-trace-copy" @click="copyOperationTracePlainText(record)">复制详情</button>
                </div>
                <p class="window-operation-trace-summary" data-role="window-operation-trace-summary">{{ operationTraceSummary(record) }}</p>
              </li>
            </ol>
          </section>

          <p v-if="!snapshot.windowOperationTraceEnabled && !windowActivationDiagnostics.length" class="window-log-rail-empty">暂无诊断或操作记录。</p>
        </div>
      </aside>
    </div>

    <section v-if="snapshot.windowDraft" data-role="window-editor" class="window-editor-layer" aria-label="窗口目标编辑">
      <header>
        <div>
          <p class="eyebrow">{{ snapshot.windowDraft.mode === 'rename' ? '仅 EyPc 别名' : '窗口目标' }}</p>
          <h3>{{ snapshot.windowDraft.mode === 'rename' ? '编辑窗口别名' : '完整编辑窗口目标' }}</h3>
        </div>
        <button type="button" class="icon-button" aria-label="取消窗口编辑" @click="$emit('cancelDraft')"><X :size="16" /></button>
      </header>
      <label>
        <span>EyPc 别名</span>
        <input data-field="alias" type="text" :value="snapshot.windowDraft.alias" @input="updateDraft('alias', $event)" />
      </label>
      <label v-if="snapshot.windowDraft.mode === 'edit'">
        <span>当前/上次窗口标题</span>
        <input data-field="lastKnownTitle" type="text" :value="snapshot.windowDraft.lastKnownTitle" readonly aria-readonly="true" />
      </label>
      <p class="window-editor-meta">应用：{{ snapshot.windowDraft.appName }} · 标题仅用于展示、搜索与人工辨认，不参与窗口身份判断。</p>
      <footer>
        <button type="button" @click="$emit('cancelDraft')">取消</button>
        <button type="button" class="primary" @click="$emit('dispatch', 'windows.editor.save')">保存 <kbd>{{ commandLabel('windows.editor.save', 'c-s / ↵') }}</kbd></button>
      </footer>
    </section>
  </section>
</template>
