<script setup lang="ts">
import { computed } from 'vue'
import { AppWindow, Copy, Keyboard, LoaderCircle, Pencil, Pin, Power, RefreshCw, ShieldAlert, SquareArrowOutUpRight, Star, X } from '@lucide/vue'
import type { AppRuntimeSnapshot, WindowDraft, WindowRow } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean }>()
const emit = defineEmits<{
  search: [value: string]
  focus: [id: string]
  updateDraft: [value: Partial<WindowDraft>]
  cancelDraft: []
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

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
const showCandidateHint = computed(() => Boolean(props.snapshot.windowCandidateTargetId))
const showEmptyHint = computed(() => !props.snapshot.windowLoading && props.snapshot.windowListLoaded && !props.snapshot.windowRows.length && !showCandidateHint.value)
const selectionCount = computed(() => props.snapshot.selectedWindowIds.length)
const windowActivationDiagnostics = computed(() => props.snapshot.windowActivationDiagnostics)
const latestWindowActivationDiagnostic = computed(() => windowActivationDiagnostics.value[0] || null)
const windowOperationTraces = computed(() => props.snapshot.windowOperationTraces)
const canAlwaysOnTop = computed(() => props.snapshot.windowCapability.canAlwaysOnTop === true)
const pageTopmostHint = computed(() => canAlwaysOnTop.value
  ? '页面置顶会让实际窗口保持在普通窗口之上；列表置顶只改变 EyPc 内的排序。'
  : 'macOS 只能展开并前置第三方窗口；EyPc 不会伪造永久页面置顶。')
const multiActions = computed(() => props.snapshot.windowActionsOpen && props.snapshot.windowActionsMode === 'multi')
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

function clearSlot(slot: number) {
  emit('dispatch', 'windows.slot.clear', { slot })
}

function focusSlot(slot: number) {
  emit('dispatch', 'windows.slot.focus', { slot })
}

function slotTargetLabel(slot: number) {
  const platform = props.snapshot.windowCapability.platform
  if (platform !== 'darwin' && platform !== 'win32') {
    const anyId = Object.values(props.snapshot.state.windowSlots.find((item) => item.slot === slot)?.targetIdByPlatform || {}).find(Boolean)
    return props.snapshot.state.windowTargets.find((target) => target.id === anyId)?.alias || '未分配'
  }
  const targetId = props.snapshot.state.windowSlots.find((item) => item.slot === slot)?.targetIdByPlatform[platform]
  return props.snapshot.state.windowTargets.find((target) => target.id === targetId)?.alias || '未分配'
}

function slotAssigned(slot: number) {
  return slotTargetLabel(slot) !== '未分配'
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
    native: '宿主调用',
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

function rowStatus(row: WindowRow) {
  if (row.ambiguous) return '多个匹配'
  if (row.unavailable) return props.snapshot.windowListLoaded ? '当前不可用' : '待加载'
  if (row.live?.minimized) return '已最小化'
  if (row.live?.focused) return '前台'
  if (row.slotNumbers.length && !row.favorite) return '稳定槽'
  return row.favorite ? '已收藏' : '实时窗口'
}

function statusClass(row: WindowRow) {
  return {
    unavailable: row.unavailable,
    ambiguous: row.ambiguous,
    focused: row.live?.focused
  }
}

function updateDraft(field: 'alias' | 'titleLocator', event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('updateDraft', field === 'alias' ? { alias: value } : { titleLocator: value })
}
</script>

<template>
  <section class="windows-page" aria-label="窗口跳转">
    <div class="window-toolbar" aria-label="窗口工具条">
      <div class="window-toolbar-meta">
        <p class="eyebrow">{{ currentPlatformLabel }} · 手动加载</p>
        <strong>窗口跳转</strong>
        <small>{{ cacheStatusLabel }}</small>
      </div>
      <div class="window-search-row">
        <AppWindow :size="16" aria-hidden="true" />
        <input
          data-role="window-search"
          class="primary-search"
          type="search"
          role="searchbox"
          placeholder="搜索别名、窗口标题或应用名"
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

    <section class="window-slot-strip" aria-label="稳定快捷槽">
      <div class="window-slot-strip-heading">
        <Keyboard :size="14" aria-hidden="true" />
        <strong>稳定槽</strong>
        <small>全局快捷键静默跳转；仅丢失/多候选时展开本页</small>
      </div>
      <div class="window-slot-chips">
        <button
          v-for="slot in 10"
          :key="slot"
          type="button"
          class="window-slot-chip"
          :class="{ assigned: slotAssigned(slot) }"
          :title="slotAssigned(slot) ? `槽 ${slot}：${slotTargetLabel(slot)}（右键打开快捷键设置，Shift+点击清除）` : `槽 ${slot}：未分配`"
          data-quick-jump-target
          :data-quick-jump-label="`窗口槽 ${slot}`"
          @click="($event.shiftKey ? clearSlot(slot) : focusSlot(slot))"
          @contextmenu.prevent="configureSlot(slot)"
        >
          <kbd>{{ slot }}</kbd>
          <span>{{ slotTargetLabel(slot) }}</span>
        </button>
      </div>
    </section>

    <section v-if="showCapabilityNotice" class="window-capability-notice" role="status">
      <ShieldAlert :size="20" />
      <div>
        <strong>{{ needsPermission ? '需要 macOS 辅助功能权限' : '当前宿主不支持窗口跳转' }}</strong>
        <p>{{ snapshot.windowCapability.reason || '窗口能力会在支持的 uTools preload 中可用。' }}</p>
      </div>
      <div class="window-notice-actions">
        <button v-if="needsPermission" type="button" @click="$emit('dispatch', 'windows.permission.settings')">打开系统设置</button>
        <button type="button" @click="$emit('dispatch', 'windows.refresh')">授权后重试</button>
      </div>
    </section>

    <p v-else class="window-status-band" aria-live="polite">
      <LoaderCircle v-if="snapshot.windowLoading" :size="14" class="spinning" />
      <template v-else-if="showCandidateHint">已进入多候选筛选：选择正确窗口后按 Enter；Escape 返回完整列表。</template>
      <template v-else-if="showUnloadHint">列表未加载。手动加载后写入会话缓存；全局槽位会先静默解析，缓存未命中时自动重扫一次，仅失败才展开本页。</template>
      <template v-else-if="showEmptyHint">没有匹配窗口。请调整搜索词，或重新加载列表。</template>
      <template v-else>{{ snapshot.windowRows.length }} 个可见项目 · 列表置顶优先 · 按应用排序 · {{ snapshot.windowCapability.canList ? '按需扫描' : '等待授权' }}</template>
    </p>

    <section v-if="windowActivationDiagnostics.length" class="window-activation-diagnostics" aria-label="本次窗口激活诊断">
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
          <p>仅开发环境显示；记录已脱敏，不含窗口标题、应用名、PID、句柄或原生引用。</p>
        </div>
        <button v-if="windowOperationTraces.length" type="button" data-role="window-operation-trace-clear" @click="$emit('dispatch', 'windows.operation.traces.clear')">清空开发记录</button>
      </header>
      <p v-if="!windowOperationTraces.length" class="window-operation-trace-empty">尚无本次窗口操作记录。</p>
      <ol v-else class="window-operation-trace-list">
        <li v-for="record in windowOperationTraces" :key="record.id" :class="record.result">
          <div class="window-operation-trace-meta">
            <span>{{ timestampLabel(record.timestamp) }}</span>
            <span>{{ operationEntryLabel(record) }}</span>
            <span>{{ operationPlatformLabel(record) }}</span>
            <span>{{ operationKindLabel(record) }} · {{ operationResultLabel(record) }}</span>
            <code>{{ record.code }}</code>
          </div>
          <ul aria-label="已脱敏操作步骤">
            <li v-for="(step, index) in record.steps" :key="`${record.id}:${index}:${step.stage}:${step.outcome}`">
              {{ operationStageLabel(step.stage) }}：{{ operationOutcomeLabel(step.outcome) }}
            </li>
          </ul>
        </li>
      </ol>
    </section>

    <div class="window-workbench" :class="{ 'has-actions': snapshot.windowActionsOpen }">
      <section class="window-list-panel" aria-label="窗口列表">
        <div
          id="window-list"
          data-role="window-list"
          class="window-list"
          role="listbox"
          tabindex="0"
          aria-multiselectable="true"
          :aria-activedescendant="snapshot.focusedWindowId ? rowDomId(snapshot.focusedWindowId) : undefined"
        >
          <div
            v-for="row in snapshot.windowRows"
            :id="rowDomId(row.id)"
            :key="row.id"
            class="window-row"
            :class="{ active: row.focused, selected: row.selected, favorite: row.favorite, pinned: row.pinned, unavailable: row.unavailable }"
            role="option"
            :aria-selected="row.selected || row.focused"
            :data-quick-jump-target="true"
            :data-quick-jump-label="`${row.displayName} ${row.appName}`"
            :data-quick-jump-search="`${row.title} ${row.appName}`"
            @click="focus(row)"
            @dblclick="activate(row)"
            @contextmenu.prevent="openActions(row)"
          >
            <span class="window-row-leading" aria-hidden="true">
              <Star v-if="row.favorite" :size="15" fill="currentColor" />
              <AppWindow v-else :size="15" />
            </span>
            <span class="window-row-copy">
              <strong>{{ row.displayName }}</strong>
              <small>{{ row.appName }}<template v-if="row.title"> · {{ row.title }}</template></small>
            </span>
            <span class="window-row-trailing">
              <span v-if="row.pinned" class="window-pin-badge" aria-label="已在列表置顶"><Pin :size="11" aria-hidden="true" />列表置顶</span>
              <span v-if="row.slotNumbers.length" class="window-slot-badges" :aria-label="`槽位 ${row.slotNumbers.join('、')}`">
                <kbd v-for="slot in row.slotNumbers" :key="slot">{{ slot }}</kbd>
              </span>
              <span class="window-status" :class="statusClass(row)">{{ rowStatus(row) }}</span>
              <span v-if="row.live?.platform === 'win32'" class="window-hwnd">HWND {{ row.live.nativeRef }}</span>
            </span>
          </div>
          <p v-if="!snapshot.windowRows.length && !snapshot.windowLoading" class="empty-state">
            {{ showUnloadHint ? '尚未加载实时窗口。可先查看已保存的收藏与稳定槽，再点击加载。' : '没有匹配窗口。请刷新、调整搜索词，或在授权后重试。' }}
          </p>
          <p v-if="selectionCount" class="window-selection-cue" aria-live="polite">已选 {{ selectionCount }} · Esc 清空 · Space 切换并下移</p>
        </div>
      </section>

      <aside v-if="snapshot.windowActionsOpen" data-role="window-actions" class="window-actions-panel" aria-label="窗口操作面板">
        <header>
          <div>
            <p class="eyebrow">{{ multiActions ? `已选 ${snapshot.windowActionTargets.length} 个窗口` : '当前窗口' }}</p>
            <h3>{{ multiActions ? '批量操作' : (snapshot.windowActionTarget?.displayName || '未选择') }}</h3>
            <p>{{ multiActions ? snapshot.windowActionTargets.map((row) => row.displayName).join('、') : (snapshot.windowActionTarget?.appName || '选择列表项后可操作') }}</p>
          </div>
          <button type="button" class="icon-button" aria-label="返回窗口列表" @click="$emit('dispatch', 'windows.actions.close')"><X :size="16" /></button>
        </header>

        <div class="window-primary-actions">
          <button v-if="!multiActions" type="button" :disabled="!snapshot.windowActionTarget" @click="activate(snapshot.windowActionTarget || undefined)"><SquareArrowOutUpRight :size="15" />展开并前置</button>
          <button
            v-if="!multiActions"
            type="button"
            class="window-page-topmost"
            :disabled="!snapshot.windowActionTarget || !canAlwaysOnTop"
            :title="canAlwaysOnTop ? '将实际窗口保持在其他普通窗口上方' : 'macOS 只能展开并前置，不能将第三方窗口保持在最上层'"
            @click="alwaysOnTop(snapshot.windowActionTarget || undefined)"
          ><Pin :size="15" />页面置顶</button>
          <button type="button" :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget" @click="toggleFavorite(multiActions ? undefined : (snapshot.windowActionTarget || undefined))"><Star :size="15" />{{ multiActions ? '批量收藏' : (snapshot.windowActionTarget?.favorite ? '取消收藏' : '收藏') }}</button>
          <button
            type="button"
            :class="{ pinned: allActionTargetsPinned }"
            :aria-pressed="allActionTargetsPinned"
            :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget"
            @click="togglePin(multiActions ? undefined : (snapshot.windowActionTarget || undefined))"
          ><Pin :size="15" />{{ pinActionLabel }}</button>
          <button type="button" :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget" @click="closeWindows(false)"><Power :size="15" />关闭窗口</button>
          <button type="button" class="danger" :disabled="multiActions ? !snapshot.windowActionTargets.length : !snapshot.windowActionTarget" @click="closeWindows(true)"><Power :size="15" />强制关闭</button>
          <button v-if="!multiActions" type="button" :disabled="!snapshot.windowActionTarget" @click="snapshot.windowActionTarget && edit(snapshot.windowActionTarget, 'rename')"><Pencil :size="15" />编辑别名</button>
          <button v-if="!multiActions" type="button" :disabled="!snapshot.windowActionTarget" @click="snapshot.windowActionTarget && edit(snapshot.windowActionTarget, 'edit')"><Pencil :size="15" />完整编辑</button>
          <button v-if="!multiActions && snapshot.windowActionTarget?.live?.platform === 'win32'" type="button" @click="$emit('dispatch', 'windows.hwnd.copy', { rowId: snapshot.windowActionTarget?.id })"><Copy :size="15" />复制 HWND</button>
          <kbd v-if="commandLabel('windows.close', 'c-del')">{{ commandLabel('windows.close', 'c-del') }}</kbd>
        </div>
        <p v-if="!multiActions" class="window-topmost-note" role="status">{{ pageTopmostHint }}</p>

        <section v-if="!multiActions" class="window-slot-section" aria-label="稳定快捷槽分配">
          <div class="window-slot-heading">
            <div><Keyboard :size="15" /><strong>分配稳定槽</strong></div>
            <small>改别名不会改变 uTools 绑定</small>
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

    <section v-if="snapshot.windowDraft" data-role="window-editor" class="window-editor-layer" aria-label="窗口目标编辑">
      <header>
        <div>
          <p class="eyebrow">{{ snapshot.windowDraft.mode === 'rename' ? '仅 EyPc 别名' : '窗口定位条件' }}</p>
          <h3>{{ snapshot.windowDraft.mode === 'rename' ? '编辑窗口别名' : '完整编辑窗口目标' }}</h3>
        </div>
        <button type="button" class="icon-button" aria-label="取消窗口编辑" @click="$emit('cancelDraft')"><X :size="16" /></button>
      </header>
      <label>
        <span>EyPc 别名</span>
        <input data-field="alias" type="text" :value="snapshot.windowDraft.alias" @input="updateDraft('alias', $event)" />
      </label>
      <label v-if="snapshot.windowDraft.mode === 'edit'">
        <span>标题定位条件</span>
        <input data-field="titleLocator" type="text" :value="snapshot.windowDraft.titleLocator" @input="updateDraft('titleLocator', $event)" />
      </label>
      <p class="window-editor-meta">应用：{{ snapshot.windowDraft.appName }} · 此处不会修改真实窗口标题。</p>
      <footer>
        <button type="button" @click="$emit('cancelDraft')">取消</button>
        <button type="button" class="primary" @click="$emit('dispatch', 'windows.editor.save')">保存 <kbd>{{ commandLabel('windows.editor.save', 'c-s / ↵') }}</kbd></button>
      </footer>
    </section>
  </section>
</template>
