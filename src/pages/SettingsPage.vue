<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AppSettings, KeybindingOverride, ShortcutProfileId, ShortcutProfileMap } from '../domain/types'
import type { RuntimeActionDefinition } from '../runtime/action/types'
import {
  LAYER_PRIORITY,
  SHORTCUT_RESERVATION_RULES,
  buildEffectiveKeybindings,
  buildShortcutCommandRows,
  detectShortcutConflicts,
  getShortcutReservationConflicts,
  parseWhenExpression,
  previewKeybindingResolution
} from '../runtime/keybinding/keybindingRuntime'
import type { KeybindingContext, KeybindingDefinition, KeybindingLayerId, ShortcutCommandRow } from '../runtime/keybinding/keybindingRuntime'
import { blockHandledShortcutEvent } from '../runtime/keyboardEvent'
import { formatShortcutLabel, formatShortcutList, normalizeShortcutId, shortcutFromEvent as shortcutFromKeyboardEvent } from '../domain/shortcuts'

type SettingsTabId = 'shortcuts' | 'maintenance'
type ShortcutScopeId = 'all' | 'global' | 'ports' | 'favorites' | 'settings'

interface KeybindingUpdatePayload {
  commandId: string
  shortcutIds?: string[]
  shortcutId?: string
  when?: string
  enabled?: boolean
  disabled?: boolean
  profileId?: ShortcutProfileId
}

const props = defineProps<{
  actions: RuntimeActionDefinition[]
  defaultKeybindings: KeybindingDefinition[]
  overrides: KeybindingOverride[]
  shortcutProfiles?: ShortcutProfileMap
  settings: AppSettings
}>()
const emit = defineEmits<{
  updateKeybinding: [payload: KeybindingUpdatePayload]
  resetKeybinding: [commandId: string]
}>()

const settingTabs: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'shortcuts', label: '快捷键' },
  { id: 'maintenance', label: '维护' }
]

const shortcutScopeOptions: Array<{ id: ShortcutScopeId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'global', label: '全局' },
  { id: 'ports', label: '端口' },
  { id: 'favorites', label: '收藏' },
  { id: 'settings', label: '设置' }
]

const previewContexts: Array<{ id: string; label: string; context: KeybindingContext }> = [
  { id: 'ports-idle', label: '端口空闲', context: { tab: 'ports', textInputFocused: false, portPane: 'results' } },
  { id: 'ports-drawer', label: '端口抽屉', context: { tab: 'ports', textInputFocused: false, portPane: 'results', portDrawerOpen: true, portDrawerActive: true } },
  { id: 'ports-search', label: '端口搜索', context: { tab: 'ports', textInputFocused: true, activeInputRole: 'port-search', portPane: 'results' } },
  { id: 'confirm', label: '确认弹窗', context: { tab: 'ports', confirmOpen: true, textInputFocused: false, portPane: 'results' } },
  { id: 'settings-record', label: '快捷键录制', context: { tab: 'settings', textInputFocused: true, activeInputRole: 'settings', activeLayers: ['settings-shortcut-record'] } },
  { id: 'settings-idle', label: '设置页', context: { tab: 'settings', textInputFocused: false } }
]

const settingsTabId = ref<SettingsTabId>('shortcuts')
const shortcutScopeId = ref<ShortcutScopeId>('all')
const keyword = ref('')
const stateFilter = ref<'all' | 'conflict' | 'user' | 'disabled'>('all')
const selectedCommandId = ref<string | null>(null)
const previewShortcut = ref('c-s-1')
const previewContextId = ref(previewContexts[0].id)
const recordingCommandId = ref<string | null>(null)
const recordDraft = ref('')
const whenCommandId = ref<string | null>(null)
const whenDraft = ref('')

const actionMeta = computed(() => new Map(props.actions.map((action) => [action.id, action])))
const effectiveBindings = computed(() => buildEffectiveKeybindings(props.shortcutProfiles || props.overrides))
const commandRows = computed(() => buildShortcutCommandRows(effectiveBindings.value).map((row) => {
  const action = actionMeta.value.get(row.commandId)
  return {
    ...row,
    title: action?.title || row.title,
    group: action?.group || row.group,
    risk: action?.risk || row.risk
  } satisfies ShortcutCommandRow
}))

const layerRows = computed(() => (Object.entries(LAYER_PRIORITY) as Array<[KeybindingLayerId, number]>)
  .sort((a, b) => b[1] - a[1])
  .map(([id, priority]) => ({ id, priority })))

const activePreviewContext = computed(() => previewContexts.find((item) => item.id === previewContextId.value) || previewContexts[0])
const selectedRow = computed(() => commandRows.value.find((row) => row.commandId === selectedCommandId.value) || filteredRows.value[0] || null)
const recordingRow = computed(() => recordingCommandId.value ? commandRows.value.find((row) => row.commandId === recordingCommandId.value) || null : null)
const whenRow = computed(() => whenCommandId.value ? commandRows.value.find((row) => row.commandId === whenCommandId.value) || null : null)
const storageModeLabel = computed(() => props.settings.preferSqlite ? 'SQLite 预留模式' : 'uTools dbStorage')
const sqliteStateLabel = computed(() => props.settings.preferSqlite ? '预留请求已记录' : '未启用')

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return commandRows.value.filter((row) => {
    if (!matchesShortcutScope(row, shortcutScopeId.value)) return false
    if (stateFilter.value === 'conflict' && !row.conflicts.length && !row.reservationConflicts.length) return false
    if (stateFilter.value === 'user' && row.source !== 'user') return false
    if (stateFilter.value === 'disabled' && row.enabled) return false
    if (!query) return true
    return [
      row.commandId,
      row.title,
      row.group,
      row.layer,
      row.when,
      row.defaultWhen,
      row.shortcutIds.join(' '),
      row.defaultShortcutIds.join(' ')
    ].join(' ').toLowerCase().includes(query)
  })
})

const previewResult = computed(() => previewKeybindingResolution(effectiveBindings.value, previewShortcut.value, activePreviewContext.value.context))
const recordShortcutIds = computed(() => parseShortcutList(recordDraft.value))
const recordValidation = computed(() => validateCandidate(recordingRow.value, recordShortcutIds.value, recordingRow.value?.when || ''))
const whenValidation = computed(() => validateWhenDraft(whenRow.value, whenDraft.value))

watch(filteredRows, (rows) => {
  if (!rows.length) {
    selectedCommandId.value = null
    return
  }
  if (!selectedCommandId.value || !rows.some((row) => row.commandId === selectedCommandId.value)) {
    selectedCommandId.value = rows[0].commandId
  }
}, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', handleModalEscape, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleModalEscape, true)
})

function matchesShortcutScope(row: ShortcutCommandRow, id: ShortcutScopeId): boolean {
  if (id === 'all') return true
  if (id === 'global') return row.profileId === 'global'
  if (id === 'ports') return row.profileId === 'ports'
  if (id === 'favorites') return row.profileId === 'favorites'
  return row.profileId === 'settings'
}

function parseShortcutList(value: string): string[] {
  return [...new Set(String(value || '').split(/[\n,，]/).map(normalizeShortcutId).filter(Boolean))]
}

function captureShortcut(event: KeyboardEvent) {
  blockHandledShortcutEvent(event)
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
  const shortcut = shortcutFromKeyboardEvent(event)
  if (shortcut === 'Escape') {
    closeRecord()
    return
  }
  recordDraft.value = shortcut
}

function handleModalEscape(event: KeyboardEvent) {
  if (!recordingRow.value && !whenRow.value) return
  if (event.key === 'Escape') {
    blockHandledShortcutEvent(event)
    if (recordingRow.value) closeRecord()
    else closeWhenEditor()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    blockHandledShortcutEvent(event)
    if (recordingRow.value && recordValidation.value.errors.length === 0) saveRecord()
    else if (whenRow.value && whenValidation.value.errors.length === 0) saveWhen()
  }
}

function updateRecordDraft(event: Event) {
  recordDraft.value = (event.target as HTMLInputElement | null)?.value || ''
}

function validateCandidate(row: ShortcutCommandRow | null, shortcutIds: string[], when: string) {
  if (!row) return { errors: ['未选中命令'], conflicts: [], reservations: [] }
  const errors: string[] = []
  try {
    if (when.trim()) parseWhenExpression(when)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'when 表达式无效')
  }
  if (!shortcutIds.length) errors.push('至少需要一个快捷键')
  if (shortcutIds.includes('*')) errors.push('通配阻断键仅允许系统层声明，不能手动绑定')
  const candidate = { ...row, shortcutIds, when, enabled: true }
  const conflicts = detectShortcutConflicts(candidate, commandRows.value)
  const reservations = shortcutIds.flatMap((shortcutId) => getShortcutReservationConflicts(shortcutId, { commandId: row.commandId, when }))
  if (conflicts.length) errors.push('与同层可重叠命令冲突')
  if (reservations.length) errors.push('命中保留键规则')
  return { errors, conflicts, reservations }
}

function validateWhenDraft(row: ShortcutCommandRow | null, when: string) {
  if (!row) return { errors: ['未选中命令'], conflicts: [], reservations: [] }
  const errors: string[] = []
  try {
    if (when.trim()) parseWhenExpression(when)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'when 表达式无效')
  }
  if (errors.length) return { errors, conflicts: [], reservations: [] }
  return validateCandidate(row, row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds, when)
}

function openRecord(row: ShortcutCommandRow) {
  recordingCommandId.value = row.commandId
  recordDraft.value = (row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds).map(formatShortcutLabel).join(', ')
}

function closeRecord() {
  recordingCommandId.value = null
  recordDraft.value = ''
}

function saveRecord() {
  const row = recordingRow.value
  if (!row || recordValidation.value.errors.length) return
  emit('updateKeybinding', {
    commandId: row.commandId,
    shortcutIds: recordShortcutIds.value,
    when: row.when,
    profileId: row.profileId,
    enabled: true
  })
  closeRecord()
}

function openWhenEditor(row: ShortcutCommandRow) {
  whenCommandId.value = row.commandId
  whenDraft.value = row.when
}

function closeWhenEditor() {
  whenCommandId.value = null
  whenDraft.value = ''
}

function applyWhenPreset(value: string) {
  whenDraft.value = value
}

function saveWhen() {
  const row = whenRow.value
  if (!row || whenValidation.value.errors.length) return
  emit('updateKeybinding', {
    commandId: row.commandId,
    shortcutIds: row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds,
    when: whenDraft.value,
    profileId: row.profileId,
    enabled: true
  })
  closeWhenEditor()
}

function disableRow(row: ShortcutCommandRow) {
  emit('updateKeybinding', {
    commandId: row.commandId,
    shortcutIds: row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds,
    when: row.when,
    profileId: row.profileId,
    enabled: false,
    disabled: true
  })
}

function profileLabel(profileId: ShortcutProfileId) {
  return profileId === 'global' ? '全局 Profile' : profileId === 'ports' ? '端口 Profile' : profileId === 'favorites' ? '收藏 Profile' : '设置 Profile'
}

function riskLabel(risk: ShortcutCommandRow['risk']) {
  return risk === 'destructive' ? '危险' : risk === 'data-write' ? '写入' : '普通'
}
</script>

<template>
  <section class="settings-page">
    <div class="settings-shell-header">
      <div class="settings-sub-tabs" role="tablist" aria-label="设置分类">
        <button
          v-for="item in settingTabs"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="settingsTabId === item.id"
          :class="{ active: settingsTabId === item.id }"
          @click="settingsTabId = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div v-if="settingsTabId === 'shortcuts'" class="shortcut-settings-layout">
      <div class="shortcut-strip">
        <select v-model="shortcutScopeId" aria-label="快捷键范围">
          <option v-for="item in shortcutScopeOptions" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
        <input v-model="keyword" placeholder="搜索 command、layer、when、快捷键" />
        <select v-model="stateFilter" aria-label="筛选状态">
          <option value="all">全部状态</option>
          <option value="conflict">冲突/保留</option>
          <option value="user">用户覆盖</option>
          <option value="disabled">已禁用</option>
        </select>
        <span class="shortcut-strip-meta">{{ filteredRows.length }} / {{ commandRows.length }}</span>
      </div>

      <div class="shortcut-preview-strip">
        <span v-if="selectedRow" class="preview-selected" :title="`${selectedRow.title} · ${selectedRow.commandId}`">
          {{ selectedRow.title }}
          <small>{{ selectedRow.commandId }}</small>
        </span>
        <input v-model="previewShortcut" aria-label="解析预览快捷键" placeholder="例如 c-s-1" />
        <select v-model="previewContextId" aria-label="解析预览上下文">
          <option v-for="item in previewContexts" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
        <span class="preview-hit" :title="previewResult.activeLayers.join(' > ')">
          命中 {{ previewResult.winner?.actionId || '未命中' }}
        </span>
        <span class="preview-layer">层 {{ previewResult.activeLayers.join(' > ') || 'none' }}</span>
      </div>

      <div class="shortcut-table" role="table">
        <div class="shortcut-compact-row shortcut-row-head" role="row">
          <span>命令</span>
          <span>作用域</span>
          <span>快捷键</span>
          <span>When</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        <div
          v-for="row in filteredRows"
          :key="row.commandId"
          class="shortcut-compact-row"
          role="row"
          tabindex="0"
          :class="{ selected: selectedRow?.commandId === row.commandId, disabled: !row.enabled }"
          @click="selectedCommandId = row.commandId"
          @keydown.enter.prevent="selectedCommandId = row.commandId"
        >
          <span class="command-cell" :title="`${row.title} · ${row.commandId}`">
            <strong>{{ row.title }}</strong>
            <small>{{ row.commandId }}</small>
          </span>
          <span class="scope-cell">
            <em class="status-badge">{{ profileLabel(row.profileId) }}</em>
            <em class="layer-chip">{{ row.layerLabel }}</em>
          </span>
          <span class="shortcut-cell">
            <span class="kbd-list">
              <kbd v-for="shortcut in row.shortcutIds" :key="shortcut">{{ formatShortcutLabel(shortcut) }}</kbd>
              <em v-if="!row.shortcutIds.length">未绑定</em>
            </span>
            <small>默认 {{ formatShortcutList(row.defaultShortcutIds) || '无' }}</small>
          </span>
          <span class="when-cell" :title="row.when || 'always'">
            <small>{{ row.when || 'always' }}</small>
          </span>
          <span class="state-cell">
            <em class="status-badge" :class="`source-${row.source}`">{{ row.sourceLabel }}</em>
            <em class="status-badge" :class="`risk-${row.risk}`">{{ riskLabel(row.risk) }}</em>
            <em v-if="row.conflicts.length" class="status-badge conflict">冲突 {{ row.conflicts.length }}</em>
            <em v-if="row.reservationConflicts.length" class="status-badge blocked">保留 {{ row.reservationConflicts.length }}</em>
          </span>
          <span class="row-actions">
            <button type="button" aria-label="录制快捷键" title="录制快捷键" @click.stop="openRecord(row)">键</button>
            <button type="button" aria-label="编辑 When" title="编辑 When" @click.stop="openWhenEditor(row)">W</button>
            <button type="button" aria-label="恢复默认快捷键" title="恢复默认快捷键" @click.stop="emit('resetKeybinding', row.commandId)">复</button>
            <button type="button" class="danger" aria-label="禁用快捷键" title="禁用快捷键" @click.stop="disableRow(row)">禁</button>
          </span>
        </div>
      </div>
    </div>

    <div v-else class="settings-maintenance">
      <div class="maintenance-grid">
        <div class="settings-subpanel">
          <h3>层级优先级</h3>
          <div v-for="layer in layerRows" :key="layer.id" class="layer-rule-row">
            <span>{{ layer.id }}</span>
            <strong>{{ layer.priority }}</strong>
          </div>
        </div>
        <div class="settings-subpanel">
          <h3>存储状态</h3>
          <div class="maintenance-row">
            <span>当前存储</span>
            <strong>{{ storageModeLabel }}</strong>
            <small>运行时仍通过 uTools dbStorage 持久化插件状态。</small>
          </div>
          <div class="maintenance-row">
            <span>SQLite</span>
            <strong>{{ sqliteStateLabel }}</strong>
            <small>preferSqlite: {{ String(props.settings.preferSqlite) }} · 当前仅只读展示。</small>
          </div>
        </div>
        <div class="settings-subpanel reservation-panel">
          <h3>保留键与接管层</h3>
          <div v-for="rule in SHORTCUT_RESERVATION_RULES" :key="`${rule.commandId}-${rule.shortcutId}-${rule.when}`" class="reservation-row">
            <kbd>{{ formatShortcutLabel(rule.shortcutId) }}</kbd>
            <span>
              <strong>{{ rule.commandId }}</strong>
              <small>{{ rule.layer }} · {{ rule.when || 'always' }}</small>
              <small>{{ rule.description }}</small>
            </span>
          </div>
        </div>
        <div class="settings-subpanel">
          <h3>解析候选</h3>
          <div class="preview-controls">
            <input v-model="previewShortcut" placeholder="例如 c-s-1" />
            <select v-model="previewContextId">
              <option v-for="item in previewContexts" :key="item.id" :value="item.id">{{ item.label }}</option>
            </select>
          </div>
          <div class="preview-result">
            <span>Active layers</span>
            <p>{{ previewResult.activeLayers.join(' > ') }}</p>
            <span>命中</span>
            <p>{{ previewResult.winner?.actionId || '未命中或被输入层阻断' }}</p>
          </div>
          <div class="candidate-list">
            <div v-for="candidate in previewResult.candidates" :key="`${candidate.actionId}-${candidate.shortcutId}-${candidate.layer}`" class="candidate-row">
              <strong>{{ candidate.actionId }}</strong>
              <small>{{ candidate.layer }} · {{ candidate.source }} · {{ candidate.when || 'always' }}</small>
            </div>
            <p v-if="!previewResult.candidates.length" class="empty-note">没有候选；可能被当前输入层阻断或没有绑定。</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="recordingRow" class="modal-backdrop" @keydown.esc.stop.prevent="closeRecord">
      <section class="shortcut-modal" role="dialog" aria-modal="true" @keydown.stop>
        <header>
          <span>
            <strong>录制快捷键</strong>
            <small>{{ recordingRow.commandId }}</small>
          </span>
          <button type="button" @click="closeRecord">关闭</button>
        </header>
        <label class="shortcut-recorder">
          <span>按下新快捷键，或用逗号分隔多个绑定</span>
          <input :value="recordDraft" placeholder="点击后按键" @input="updateRecordDraft" @keydown="captureShortcut" />
        </label>
        <div class="shortcut-modal-grid">
          <p>当前：{{ formatShortcutList(recordingRow.shortcutIds) || '未绑定' }}</p>
          <p>默认：{{ formatShortcutList(recordingRow.defaultShortcutIds) || '无' }}</p>
          <p>when：{{ recordingRow.when || 'always' }}</p>
        </div>
        <div v-if="recordValidation.errors.length" class="validation-box danger">
          <strong>不能保存</strong>
          <small v-for="item in recordValidation.errors" :key="item">{{ item }}</small>
        </div>
        <div v-if="recordValidation.conflicts.length" class="validation-box">
          <strong>冲突命令</strong>
          <small v-for="item in recordValidation.conflicts" :key="`${item.commandId}-${item.shortcutId}`">{{ formatShortcutLabel(item.shortcutId) }} · {{ item.commandId }} · {{ item.when }}</small>
        </div>
        <div v-if="recordValidation.reservations.length" class="validation-box">
          <strong>保留键</strong>
          <small v-for="item in recordValidation.reservations" :key="`${item.commandId}-${item.shortcutId}-${item.when}`">{{ formatShortcutLabel(item.shortcutId) }} · {{ item.description }} · {{ item.layer }}</small>
        </div>
        <footer class="confirm-actions">
          <button type="button" @click="closeRecord">取消</button>
          <button type="button" :disabled="recordValidation.errors.length > 0" @click="saveRecord">保存</button>
        </footer>
      </section>
    </div>

    <div v-if="whenRow" class="modal-backdrop" @keydown.esc.stop.prevent="closeWhenEditor">
      <section class="shortcut-modal" role="dialog" aria-modal="true" @keydown.stop>
        <header>
          <span>
            <strong>编辑 when</strong>
            <small>{{ whenRow.commandId }}</small>
          </span>
          <button type="button" @click="closeWhenEditor">关闭</button>
        </header>
        <div class="when-presets">
          <button type="button" @click="applyWhenPreset('')">always</button>
          <button type="button" @click="applyWhenPreset(`tab == 'ports' && !textInputFocused`)">端口空闲</button>
          <button type="button" @click="applyWhenPreset(`tab == 'ports' && portDrawerActive`)">端口抽屉</button>
          <button type="button" @click="applyWhenPreset(`tab == 'settings'`)">设置页</button>
        </div>
        <textarea v-model="whenDraft" rows="4" placeholder="支持 &&、||、!、括号、==、!=" />
        <div v-if="whenValidation.errors.length" class="validation-box danger">
          <strong>不能保存</strong>
          <small v-for="item in whenValidation.errors" :key="item">{{ item }}</small>
        </div>
        <div v-if="whenValidation.conflicts.length" class="validation-box">
          <strong>修改后冲突</strong>
          <small v-for="item in whenValidation.conflicts" :key="`${item.commandId}-${item.shortcutId}`">{{ formatShortcutLabel(item.shortcutId) }} · {{ item.commandId }} · {{ item.when }}</small>
        </div>
        <footer class="confirm-actions">
          <button type="button" @click="closeWhenEditor">取消</button>
          <button type="button" :disabled="whenValidation.errors.length > 0" @click="saveWhen">保存</button>
        </footer>
      </section>
    </div>
  </section>
</template>
