<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { KeybindingOverride } from '../domain/types'
import type { ShortcutProfileId, ShortcutProfileMap } from '../domain/types'
import type { RuntimeActionDefinition } from '../runtime/action/types'
import {
  LAYER_PRIORITY,
  SHORTCUT_RESERVATION_RULES,
  buildEffectiveKeybindings,
  buildShortcutCommandRows,
  canWhenClausesOverlap,
  detectShortcutConflicts,
  getShortcutReservationConflicts,
  normalizeShortcutId,
  parseWhenExpression,
  previewKeybindingResolution
} from '../runtime/keybinding/keybindingRuntime'
import type { KeybindingContext, KeybindingDefinition, KeybindingLayerId, ShortcutCommandRow } from '../runtime/keybinding/keybindingRuntime'

type SettingsSectionId = 'global' | 'ports' | 'favorites' | 'settings' | 'layers'

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
}>()
const emit = defineEmits<{
  updateKeybinding: [payload: KeybindingUpdatePayload]
  resetKeybinding: [commandId: string]
}>()

const sections: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'global', label: '全局' },
  { id: 'ports', label: '端口' },
  { id: 'favorites', label: '收藏' },
  { id: 'settings', label: '设置' },
  { id: 'layers', label: '层级规则' }
]

const previewContexts: Array<{ id: string; label: string; context: KeybindingContext }> = [
  { id: 'ports-idle', label: '端口空闲', context: { tab: 'ports', textInputFocused: false, portPane: 'results' } },
  { id: 'ports-drawer', label: '端口抽屉', context: { tab: 'ports', textInputFocused: false, portPane: 'results', portDrawerOpen: true, portDrawerActive: true } },
  { id: 'ports-search', label: '端口搜索', context: { tab: 'ports', textInputFocused: true, activeInputRole: 'port-search', portPane: 'results' } },
  { id: 'confirm', label: '确认弹窗', context: { tab: 'ports', confirmOpen: true, textInputFocused: false, portPane: 'results' } },
  { id: 'settings-record', label: '快捷键录制', context: { tab: 'settings', textInputFocused: true, activeInputRole: 'settings', activeLayers: ['settings-shortcut-record'] } },
  { id: 'settings-idle', label: '设置页', context: { tab: 'settings', textInputFocused: false } }
]

const sectionId = ref<SettingsSectionId>('global')
const keyword = ref('')
const stateFilter = ref<'all' | 'conflict' | 'user' | 'disabled'>('all')
const selectedCommandId = ref<string | null>(null)
const previewShortcut = ref('Ctrl+1')
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

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return commandRows.value.filter((row) => {
    if (!matchesSection(row, sectionId.value)) return false
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

function matchesSection(row: ShortcutCommandRow, id: SettingsSectionId): boolean {
  if (id === 'layers') return false
  if (id === 'global') return row.profileId === 'global'
  if (id === 'ports') return row.profileId === 'ports'
  if (id === 'favorites') return row.profileId === 'favorites'
  return row.profileId === 'settings'
}

function parseShortcutList(value: string): string[] {
  return [...new Set(String(value || '').split(/[\n,，]/).map(normalizeShortcutId).filter(Boolean))]
}

function shortcutFromEvent(event: KeyboardEvent): string {
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Tab: 'Tab',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Delete: 'Delete',
    Backspace: 'Backspace'
  }
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const key = keyMap[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  return normalizeShortcutId([...parts, key].join('+'))
}

function captureShortcut(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
  const shortcut = shortcutFromEvent(event)
  if (shortcut === 'Escape') {
    closeRecord()
    return
  }
  recordDraft.value = shortcut
}

function handleModalEscape(event: KeyboardEvent) {
  if (!recordingRow.value && !whenRow.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (recordingRow.value) closeRecord()
    else closeWhenEditor()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
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
  recordDraft.value = (row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds).join(', ')
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

function isWhenOverlapping(row: ShortcutCommandRow, target: ShortcutCommandRow) {
  return canWhenClausesOverlap(row.when, target.when)
}
</script>

<template>
  <section class="settings-page">
    <div class="settings-shell-header">
      <div class="segmented-control">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          :class="{ active: sectionId === item.id }"
          @click="sectionId = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="settings-toolbar">
        <input v-model="keyword" placeholder="搜索 command、layer、when、快捷键" />
        <select v-model="stateFilter" aria-label="筛选状态">
          <option value="all">全部状态</option>
          <option value="conflict">冲突/保留</option>
          <option value="user">用户覆盖</option>
          <option value="disabled">已禁用</option>
        </select>
      </div>
    </div>

    <div v-if="sectionId === 'layers'" class="layer-rules-panel">
      <div class="layer-rules-grid">
        <div class="settings-subpanel">
          <h3>层级优先级</h3>
          <div v-for="layer in layerRows" :key="layer.id" class="layer-rule-row">
            <span>{{ layer.id }}</span>
            <strong>{{ layer.priority }}</strong>
          </div>
        </div>
        <div class="settings-subpanel">
          <h3>保留键与接管层</h3>
          <div v-for="rule in SHORTCUT_RESERVATION_RULES" :key="`${rule.commandId}-${rule.shortcutId}-${rule.when}`" class="reservation-row">
            <kbd>{{ normalizeShortcutId(rule.shortcutId) }}</kbd>
            <span>
              <strong>{{ rule.commandId }}</strong>
              <small>{{ rule.layer }} · {{ rule.when || 'always' }}</small>
              <small>{{ rule.description }}</small>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="shortcut-settings-layout">
      <div class="shortcut-table" role="table">
        <div class="shortcut-row shortcut-row-head" role="row">
          <span>命令</span>
          <span>层 / when</span>
          <span>当前 / 默认</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        <div
          v-for="row in filteredRows"
          :key="row.commandId"
          class="shortcut-row"
          role="row"
          tabindex="0"
          :class="{ selected: selectedRow?.commandId === row.commandId, disabled: !row.enabled }"
          @click="selectedCommandId = row.commandId"
          @keydown.enter.prevent="selectedCommandId = row.commandId"
        >
          <span class="command-cell">
            <strong>{{ row.title }}</strong>
            <small>{{ row.commandId }}</small>
            <span class="badge-row">
              <em class="status-badge">{{ row.group }}</em>
              <em class="status-badge">{{ profileLabel(row.profileId) }}</em>
              <em class="status-badge" :class="`risk-${row.risk}`">{{ riskLabel(row.risk) }}</em>
            </span>
          </span>
          <span class="when-cell">
            <em class="layer-chip">{{ row.layerLabel }}</em>
            <small>{{ row.when || 'always' }}</small>
          </span>
          <span class="shortcut-cell">
            <span class="kbd-list">
              <kbd v-for="shortcut in row.shortcutIds" :key="shortcut">{{ shortcut }}</kbd>
              <em v-if="!row.shortcutIds.length">未绑定</em>
            </span>
            <small>默认 {{ row.defaultShortcutIds.join(' / ') || '无' }}</small>
          </span>
          <span class="state-cell">
            <em class="status-badge" :class="`source-${row.source}`">{{ row.sourceLabel }}</em>
            <em v-if="row.conflicts.length" class="status-badge conflict">冲突 {{ row.conflicts.length }}</em>
            <em v-if="row.reservationConflicts.length" class="status-badge blocked">保留 {{ row.reservationConflicts.length }}</em>
          </span>
          <span class="row-actions">
            <button type="button" @click.stop="openRecord(row)">录制</button>
            <button type="button" @click.stop="openWhenEditor(row)">when</button>
            <button type="button" @click.stop="emit('resetKeybinding', row.commandId)">默认</button>
            <button type="button" class="danger" @click.stop="disableRow(row)">禁用</button>
          </span>
        </div>
      </div>

      <aside class="shortcut-inspector">
        <template v-if="selectedRow">
          <div class="settings-subpanel">
            <h3>{{ selectedRow.title }}</h3>
            <p class="inspector-id">{{ selectedRow.commandId }}</p>
            <dl class="compact-meta">
              <div><dt>Layer</dt><dd>{{ selectedRow.layer }} · {{ LAYER_PRIORITY[selectedRow.layer] }}</dd></div>
              <div><dt>Profile</dt><dd>{{ profileLabel(selectedRow.profileId) }}</dd></div>
              <div><dt>When</dt><dd>{{ selectedRow.when || 'always' }}</dd></div>
              <div><dt>Source</dt><dd>{{ selectedRow.sourceLabel }}</dd></div>
            </dl>
          </div>

          <div class="settings-subpanel">
            <h3>解析预览</h3>
            <div class="preview-controls">
              <input v-model="previewShortcut" placeholder="例如 Ctrl+1" />
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

          <div v-if="selectedRow.conflicts.length || selectedRow.reservationConflicts.length" class="settings-subpanel">
            <h3>冲突与阻断</h3>
            <div v-for="conflict in selectedRow.conflicts" :key="`${conflict.commandId}-${conflict.shortcutId}`" class="issue-row">
              <strong>{{ conflict.shortcutId }} · {{ conflict.commandId }}</strong>
              <small>{{ conflict.layer }} · when 可重叠</small>
            </div>
            <div v-for="rule in selectedRow.reservationConflicts" :key="`${rule.commandId}-${rule.shortcutId}-${rule.when}`" class="issue-row blocked">
              <strong>{{ rule.shortcutId }} · {{ rule.commandId }}</strong>
              <small>{{ rule.description }} · {{ rule.layer }}</small>
            </div>
          </div>

          <div class="settings-subpanel">
            <h3>候选关系</h3>
            <div
              v-for="row in commandRows.filter((item) => item.commandId !== selectedRow?.commandId && item.shortcutIds.some((shortcut) => selectedRow?.shortcutIds.includes(shortcut))).slice(0, 8)"
              :key="row.commandId"
              class="candidate-row"
            >
              <strong>{{ row.commandId }}</strong>
              <small>{{ row.layer }} · {{ isWhenOverlapping(selectedRow, row) ? 'when 可重叠' : 'when 互斥' }}</small>
            </div>
          </div>
        </template>
      </aside>
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
          <p>当前：{{ recordingRow.shortcutIds.join(' / ') || '未绑定' }}</p>
          <p>默认：{{ recordingRow.defaultShortcutIds.join(' / ') || '无' }}</p>
          <p>when：{{ recordingRow.when || 'always' }}</p>
        </div>
        <div v-if="recordValidation.errors.length" class="validation-box danger">
          <strong>不能保存</strong>
          <small v-for="item in recordValidation.errors" :key="item">{{ item }}</small>
        </div>
        <div v-if="recordValidation.conflicts.length" class="validation-box">
          <strong>冲突命令</strong>
          <small v-for="item in recordValidation.conflicts" :key="`${item.commandId}-${item.shortcutId}`">{{ item.shortcutId }} · {{ item.commandId }} · {{ item.when }}</small>
        </div>
        <div v-if="recordValidation.reservations.length" class="validation-box">
          <strong>保留键</strong>
          <small v-for="item in recordValidation.reservations" :key="`${item.commandId}-${item.shortcutId}-${item.when}`">{{ item.shortcutId }} · {{ item.description }} · {{ item.layer }}</small>
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
          <small v-for="item in whenValidation.conflicts" :key="`${item.commandId}-${item.shortcutId}`">{{ item.shortcutId }} · {{ item.commandId }} · {{ item.when }}</small>
        </div>
        <footer class="confirm-actions">
          <button type="button" @click="closeWhenEditor">取消</button>
          <button type="button" :disabled="whenValidation.errors.length > 0" @click="saveWhen">保存</button>
        </footer>
      </section>
    </div>
  </section>
</template>
