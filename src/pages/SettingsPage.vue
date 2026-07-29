<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Ban, Braces, Keyboard, MoreHorizontal, RotateCcw, X } from '@lucide/vue'
import FeatureHelpDialog from '../components/FeatureHelpDialog.vue'
import type { AppSettings, AppTabId, FeatureConfig, KeybindingOverride, MqttStorageStatus, ShortcutProfileId, ShortcutProfileMap } from '../domain/types'
import { getFeatureHelp, hasFeatureHelp, type FeatureHelpDoc } from '../help/guides'
import type { RuntimeActionDefinition } from '../runtime/action/types'
import { featureDefinitionFor } from '../runtime/feature/featureRegistry'
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
type ShortcutScopeId = 'all' | 'global' | 'ports' | 'mqtt' | 'favorites' | 'windows' | 'codex' | 'settings'
type MaintenanceSectionId = 'features' | 'tools' | 'layers' | 'storage' | 'commands' | 'resolution' | 'reservations'

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
  featureConfigs: FeatureConfig[]
  initialMaintenanceSection?: MaintenanceSectionId | null
  settings: AppSettings
  mqttStorageStatus: MqttStorageStatus
}>()
const emit = defineEmits<{
  updateKeybinding: [payload: KeybindingUpdatePayload]
  resetKeybinding: [commandId: string]
  saveShortcutProfiles: [profiles: ShortcutProfileMap]
  saveFeatureConfigs: [configs: FeatureConfig[]]
  updateToolPreviewPrefs: [input: { enabled?: boolean; delayMs?: number }]
}>()

const SHORTCUT_PROFILE_IDS: ShortcutProfileId[] = ['global', 'ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings']

const settingTabs: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'shortcuts', label: '快捷键' },
  { id: 'maintenance', label: '维护' }
]

const shortcutScopeOptions: Array<{ id: ShortcutScopeId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'global', label: '全局' },
  { id: 'ports', label: '端口' },
  { id: 'mqtt', label: 'MQTT' },
  { id: 'favorites', label: '收藏' },
  { id: 'windows', label: '窗口跳转' },
  { id: 'codex', label: 'Codex' },
  { id: 'settings', label: '设置' }
]

const previewContexts: Array<{ id: string; label: string; context: KeybindingContext }> = [
  { id: 'ports-idle', label: '端口空闲', context: { tab: 'ports', textInputFocused: false, portPane: 'results' } },
  { id: 'ports-drawer', label: '端口抽屉', context: { tab: 'ports', textInputFocused: false, portPane: 'results', portDrawerOpen: true, portDrawerActive: true } },
  { id: 'ports-search', label: '端口搜索', context: { tab: 'ports', textInputFocused: true, activeInputRole: 'port-search', portPane: 'results' } },
  { id: 'windows-idle', label: '窗口列表', context: { tab: 'windows', textInputFocused: false } },
  { id: 'windows-editor', label: '窗口编辑', context: { tab: 'windows', textInputFocused: true, activeInputRole: 'window-editor', windowEditorOpen: true } },
  { id: 'confirm', label: '确认弹窗', context: { tab: 'ports', confirmOpen: true, textInputFocused: false, portPane: 'results' } },
  { id: 'settings-record', label: '快捷键录制', context: { tab: 'settings', textInputFocused: true, activeInputRole: 'settings', activeLayers: ['settings-shortcut-record'] } },
  { id: 'settings-idle', label: '设置页', context: { tab: 'settings', textInputFocused: false } }
]

const settingsTabId = ref<SettingsTabId>('shortcuts')
const maintenanceSectionId = ref<MaintenanceSectionId>('features')
const shortcutScopeId = ref<ShortcutScopeId>('all')
const keyword = ref('')
const stateFilter = ref<'all' | 'conflict' | 'user' | 'disabled'>('all')
const selectedCommandId = ref<string | null>(null)
const previewShortcut = ref('c-s-1')
const previewContextId = ref(previewContexts[0].id)
const recordingCommandId = ref<string | null>(null)
const shortcutRecordBaselineIds = ref<string[]>([])
const shortcutRecordActiveIds = ref<string[]>([])
const shortcutRecordPendingIds = ref<string[]>([])
const shortcutRecordCapturedId = ref('')
const shortcutRecordDefaultIds = ref<string[]>([])
const shortcutRecordDirectInput = ref('')
const shortcutRecordEditingIndex = ref(-1)
const shortcutRecordEditingValue = ref('')
const shortcutRecorderRef = ref<HTMLElement | null>(null)
const whenCommandId = ref<string | null>(null)
const whenDraft = ref('')
const shortcutSearchInput = ref<HTMLInputElement | null>(null)
const shortcutModifierHinting = ref(false)
const commandTooltipX = ref(0)
const commandTooltipY = ref(0)
const draftShortcutProfiles = ref<ShortcutProfileMap>(cloneShortcutProfiles(props.shortcutProfiles || props.settings.shortcutProfiles))
const draftFeatureConfigs = ref<FeatureConfig[]>(cloneFeatureConfigs(props.featureConfigs))
const draggingFeatureId = ref<AppTabId | null>(null)
const featureHelpDoc = ref<FeatureHelpDoc | null>(null)
const contextPanel = ref<'detail' | 'actions' | null>(null)
let contextPanelTrigger: HTMLElement | null = null

const actionMeta = computed(() => new Map(props.actions.map((action) => [action.id, action])))
const shortcutDraftDirty = computed(() => JSON.stringify(draftShortcutProfiles.value) !== JSON.stringify(props.shortcutProfiles || props.settings.shortcutProfiles))
const effectiveBindings = computed(() => buildEffectiveKeybindings(draftShortcutProfiles.value, draftFeatureConfigs.value))
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
const storageModeLabel = computed(() => props.mqttStorageStatus.mode === 'sqlite' ? 'SQLite 本机存储' : props.mqttStorageStatus.mode === 'legacy-dbStorage' ? 'uTools dbStorage 降级' : '浏览器 localStorage')
const sqliteStateLabel = computed(() => props.mqttStorageStatus.sqliteAvailable ? '已启用' : '不可用')
const featureDraftDirty = computed(() => JSON.stringify(draftFeatureConfigs.value) !== JSON.stringify(props.featureConfigs))
const featureRows = computed(() => draftFeatureConfigs.value
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((config) => ({
    ...featureDefinitionFor(config.id),
    ...config,
    locked: config.id === 'settings'
  })))

const filteredCommandRows = computed(() => {
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
const primaryShortcutRows = computed(() => filteredCommandRows.value.filter((row) => !isMaintenanceShortcutRow(row)))
const maintenanceShortcutRows = computed(() => filteredCommandRows.value.filter(isMaintenanceShortcutRow))
const filteredRows = computed(() => primaryShortcutRows.value)

const previewResult = computed(() => previewKeybindingResolution(effectiveBindings.value, previewShortcut.value, activePreviewContext.value.context))
const maintenanceSections = computed<Array<{ id: MaintenanceSectionId; label: string; meta: string }>>(() => [
  { id: 'features', label: '功能开关', meta: `${featureRows.value.filter((row) => row.enabled).length}/${featureRows.value.length} 启用` },
  {
    id: 'tools',
    label: '工具系统',
    meta: props.settings.toolPreviewPrefs.hoverPreviewEnabled ? `${props.settings.toolPreviewPrefs.hoverPreviewDelayMs}ms` : '悬浮预览关闭'
  },
  { id: 'layers', label: '层级优先级', meta: `${layerRows.value.length} 层` },
  { id: 'storage', label: '存储状态', meta: storageModeLabel.value },
  { id: 'commands', label: 'Layer Commands', meta: `${maintenanceShortcutRows.value.length} 命令` },
  { id: 'resolution', label: '解析候选', meta: previewResult.value.winner?.actionId || '未命中' },
  { id: 'reservations', label: '保留键与接管层', meta: `${SHORTCUT_RESERVATION_RULES.length} 条规则` }
])
const shortcutRecordMergedIds = computed(() => [...new Set([...shortcutRecordActiveIds.value, ...shortcutRecordPendingIds.value].map(normalizeShortcutId).filter(Boolean))])
const shortcutRecordDirty = computed(() => {
  const current = shortcutRecordCapturedId.value ? [...shortcutRecordMergedIds.value, normalizeShortcutId(shortcutRecordCapturedId.value)].filter(Boolean) : shortcutRecordMergedIds.value
  return !shortcutIdsEqual(current, shortcutRecordBaselineIds.value)
})
const showShortcutRecordDefaultRestore = computed(() => shortcutRecordDefaultIds.value.length > 0 && !shortcutIdsEqual(shortcutRecordMergedIds.value, shortcutRecordDefaultIds.value))
const recordShortcutIds = computed(() => shortcutRecordMergedIds.value)
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

watch(() => props.shortcutProfiles, (profiles) => {
  if (shortcutDraftDirty.value) return
  draftShortcutProfiles.value = cloneShortcutProfiles(profiles || props.settings.shortcutProfiles)
}, { deep: true })

watch(() => props.featureConfigs, (configs) => {
  if (featureDraftDirty.value) return
  draftFeatureConfigs.value = cloneFeatureConfigs(configs)
}, { deep: true })

watch(() => props.initialMaintenanceSection, (section) => {
  if (!section) return
  settingsTabId.value = 'maintenance'
  maintenanceSectionId.value = section
}, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', handleModalEscape, true)
  window.addEventListener('keydown', handleSettingsKeydown, true)
  window.addEventListener('keyup', handleSettingsKeyup, true)
  window.addEventListener('blur', clearSettingsShortcutHints)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleModalEscape, true)
  window.removeEventListener('keydown', handleSettingsKeydown, true)
  window.removeEventListener('keyup', handleSettingsKeyup, true)
  window.removeEventListener('blur', clearSettingsShortcutHints)
})

function matchesShortcutScope(row: ShortcutCommandRow, id: ShortcutScopeId): boolean {
  if (id === 'all') return true
  if (id === 'global') return row.profileId === 'global'
  if (id === 'ports') return row.profileId === 'ports'
  if (id === 'mqtt') return row.profileId === 'mqtt'
  if (id === 'favorites') return row.profileId === 'favorites'
  if (id === 'windows') return row.profileId === 'windows'
  if (id === 'codex') return row.profileId === 'codex'
  return row.profileId === 'settings'
}

function isMaintenanceShortcutRow(row: ShortcutCommandRow): boolean {
  if (row.commandId === 'ports.detail.close') return true
  if (row.commandId.startsWith('confirm.')) return true
  if (row.commandId.endsWith('.close') || row.commandId.endsWith('.cancel') || row.commandId.endsWith('.blur')) return true
  return [
    'port-detail',
    'port-group-detail',
    'port-drawer',
    'settings-shortcut-record',
    'settings-when-edit',
    'ports-search',
    'favorites-search'
  ].includes(row.layer)
}

function parseShortcutList(value: string): string[] {
  return [...new Set(String(value || '').split(/[\n,，]/).map(normalizeShortcutId).filter(Boolean))]
}

function cloneShortcutProfiles(input: ShortcutProfileMap): ShortcutProfileMap {
  const now = Date.now()
  return Object.fromEntries(SHORTCUT_PROFILE_IDS.map((profileId) => {
    const profile = input?.[profileId]
    return [profileId, {
      keybindingOverrides: (profile?.keybindingOverrides || []).map((item) => ({
        ...item,
        shortcutIds: item.shortcutIds ? [...item.shortcutIds] : item.shortcutId ? [item.shortcutId] : []
      })),
      updatedAt: profile?.updatedAt || now
    }]
  })) as ShortcutProfileMap
}

function cloneFeatureConfigs(input: FeatureConfig[]): FeatureConfig[] {
  return input.map((config) => ({
    id: config.id,
    enabled: config.id === 'settings' ? true : config.enabled,
    sortOrder: config.sortOrder
  }))
}

function orderedFeatureConfigs() {
  return featureRows.value.map((row, index) => ({
    id: row.id,
    enabled: row.id === 'settings' ? true : row.enabled,
    sortOrder: index + 1
  }))
}

function setDraftFeatureConfigs(next: FeatureConfig[]) {
  draftFeatureConfigs.value = next.map((config, index) => ({
    ...config,
    enabled: config.id === 'settings' ? true : config.enabled,
    sortOrder: index + 1
  }))
}

function toggleFeature(row: FeatureConfig, enabled: boolean) {
  if (row.id === 'settings') return
  setDraftFeatureConfigs(orderedFeatureConfigs().map((config) => config.id === row.id ? { ...config, enabled } : config))
}

function moveFeature(row: FeatureConfig, direction: 1 | -1) {
  const rows = orderedFeatureConfigs()
  const currentIndex = rows.findIndex((item) => item.id === row.id)
  const nextIndex = Math.min(rows.length - 1, Math.max(0, currentIndex + direction))
  if (currentIndex < 0 || currentIndex === nextIndex) return
  const next = [...rows]
  const [item] = next.splice(currentIndex, 1)
  next.splice(nextIndex, 0, item)
  setDraftFeatureConfigs(next)
}

function onFeatureDragStart(row: FeatureConfig) {
  draggingFeatureId.value = row.id
}

function onFeatureDrop(row: FeatureConfig) {
  const draggingId = draggingFeatureId.value
  draggingFeatureId.value = null
  if (!draggingId || draggingId === row.id) return
  const rows = orderedFeatureConfigs()
  const fromIndex = rows.findIndex((item) => item.id === draggingId)
  const toIndex = rows.findIndex((item) => item.id === row.id)
  if (fromIndex < 0 || toIndex < 0) return
  const next = [...rows]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  setDraftFeatureConfigs(next)
}

function openFeatureHelp(id: AppTabId) {
  featureHelpDoc.value = getFeatureHelp(id)
}

function closeFeatureHelp() {
  featureHelpDoc.value = null
}

function saveFeatureDraft() {
  emit('saveFeatureConfigs', orderedFeatureConfigs())
}

function discardFeatureDraft() {
  draftFeatureConfigs.value = cloneFeatureConfigs(props.featureConfigs)
}

function updateToolPreviewPrefs(input: { enabled?: boolean; delayMs?: number }) {
  emit('updateToolPreviewPrefs', input)
}

function shortcutIdsEqual(left: string[], right: string[]) {
  const leftIds = [...new Set(left.map(normalizeShortcutId).filter(Boolean))]
  const rightIds = [...new Set(right.map(normalizeShortcutId).filter(Boolean))]
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index])
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function profileLabel(profileId: ShortcutProfileId) {
  return titleCase(profileId)
}

function profileDescription(profileId: ShortcutProfileId) {
  return profileId === 'global' ? '全局 Profile' : profileId === 'ports' ? '端口 Profile' : profileId === 'mqtt' ? 'MQTT Profile' : profileId === 'favorites' ? '收藏 Profile' : profileId === 'windows' ? '窗口跳转 Profile' : profileId === 'codex' ? 'Codex Profile' : '设置 Profile'
}

function riskLabel(risk: ShortcutCommandRow['risk']) {
  return risk === 'destructive' ? '危险' : risk === 'data-write' ? '写入' : '普通'
}

function riskCode(risk: ShortcutCommandRow['risk']) {
  return risk === 'destructive' ? 'D' : risk === 'data-write' ? 'W' : 'N'
}

function sourceCode(source: ShortcutCommandRow['source']) {
  return source === 'removed' ? 'Off' : source === 'user' ? 'User' : 'Sys'
}

function scopeDisplay(row: ShortcutCommandRow) {
  const priority = LAYER_PRIORITY[row.layer]
  const profileTitle = profileDescription(row.profileId)
  const layerTitle = `${row.layerLabel} / priority ${priority}`
  return {
    profile: profileLabel(row.profileId),
    layer: row.layer,
    profileTitle,
    layerTitle,
    title: `${profileTitle} / ${layerTitle}`
  }
}

function stateDisplay(row: ShortcutCommandRow) {
  const parts = [
    { label: sourceCode(row.source), className: `source-${row.source}`, title: `来源：${row.sourceLabel}` },
    { label: riskCode(row.risk), className: `risk-${row.risk}`, title: `风险：${riskLabel(row.risk)}` }
  ]
  if (row.conflicts.length) parts.push({ label: `C${row.conflicts.length}`, className: 'conflict', title: `冲突：${row.conflicts.length}` })
  if (row.reservationConflicts.length) parts.push({ label: `R${row.reservationConflicts.length}`, className: 'blocked', title: `保留键：${row.reservationConflicts.length}` })
  return {
    parts,
    title: [
      `来源：${row.sourceLabel}`,
      `风险：${riskLabel(row.risk)}`,
      row.conflicts.length ? `冲突：${row.conflicts.length}` : '',
      row.reservationConflicts.length ? `保留键：${row.reservationConflicts.length}` : ''
    ].filter(Boolean).join(' / ')
  }
}

function commandTooltip(row: ShortcutCommandRow) {
  return commandTooltipLines(row).join('\n')
}

function commandTooltipLines(row: ShortcutCommandRow) {
  const action = actionMeta.value.get(row.commandId)
  return [
    row.title,
    row.commandId,
    `group: ${row.group}`,
    action?.description ? `description: ${action.description}` : '',
    `when: ${row.when || 'always'}`,
    `default: ${formatShortcutList(row.defaultShortcutIds) || 'none'}`
  ].filter(Boolean)
}

function shortcutTooltip(row: ShortcutCommandRow) {
  return `当前：${formatShortcutList(row.shortcutIds) || '未绑定'}\n默认：${formatShortcutList(row.defaultShortcutIds) || '无'}`
}

function shortcutCommandTooltipTitle(row: ShortcutCommandRow) {
  return row.title || row.commandId
}

function updateCommandTooltipPosition(event: MouseEvent) {
  commandTooltipX.value = event.clientX
  commandTooltipY.value = event.clientY - 10
}

function focusShortcutSearch() {
  requestAnimationFrame(() => {
    shortcutSearchInput.value?.focus()
    shortcutSearchInput.value?.select()
  })
}

function isConfirmSaveShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return false
  return event.key.toLowerCase() === 's' || event.key === 'Enter'
}

function handleSettingsKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (settingsTabId.value !== 'shortcuts') return
  if (event.ctrlKey || event.metaKey) shortcutModifierHinting.value = true
  if (recordingRow.value || whenRow.value) return
  if (event.key === 'Escape' && contextPanel.value) {
    blockHandledShortcutEvent(event)
    closeContextPanel()
    return
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
    const rowElement = target?.closest<HTMLElement>('.shortcut-compact-row:not(.shortcut-row-head)')
    const fromOpenPanel = Boolean(contextPanel.value && target?.closest('.settings-context-panel'))
    if (!rowElement && !fromOpenPanel) return
    const row = (rowElement ? commandRows.value.find((item) => item.commandId === rowElement.dataset.commandId) : null) || selectedRow.value
    if (!row) return
    blockHandledShortcutEvent(event)
    openContextPanel(event.key === 'ArrowLeft' ? 'detail' : 'actions', row, rowElement || contextPanelTrigger)
    return
  }
  if (isConfirmSaveShortcut(event) && shortcutDraftDirty.value) {
    blockHandledShortcutEvent(event)
    saveShortcutDraft()
    return
  }
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return
  blockHandledShortcutEvent(event)
  focusShortcutSearch()
}

function openContextPanel(panel: 'detail' | 'actions', row: ShortcutCommandRow, trigger?: HTMLElement | null) {
  if (!contextPanel.value) contextPanelTrigger = trigger || document.activeElement as HTMLElement | null
  selectedCommandId.value = row.commandId
  contextPanel.value = panel
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.settings-context-panel button:not([disabled])')?.focus())
}

function closeContextPanel(restoreFocus = true) {
  contextPanel.value = null
  if (!restoreFocus) return
  requestAnimationFrame(() => {
    const target = contextPanelTrigger?.isConnected && contextPanelTrigger !== document.body
      ? contextPanelTrigger
      : document.querySelector<HTMLElement>(`.shortcut-compact-row[data-command-id="${CSS.escape(selectedCommandId.value || '')}"]`)
    target?.focus()
    contextPanelTrigger = null
  })
}

function runContextAction(action: 'record' | 'when' | 'reset' | 'disable') {
  const row = selectedRow.value
  if (!row) return
  if (action === 'record') openRecord(row)
  else if (action === 'when') openWhenEditor(row)
  else if (action === 'reset') resetDraftKeybinding(row.commandId)
  else disableRow(row)
  closeContextPanel(action === 'reset' || action === 'disable')
}

function handleSettingsKeyup(event: KeyboardEvent) {
  if (event.key === 'Control' || event.key === 'Meta') clearSettingsShortcutHints()
}

function clearSettingsShortcutHints() {
  shortcutModifierHinting.value = false
}

function handleShortcutRecordKeydown(event: KeyboardEvent) {
  blockHandledShortcutEvent(event)
  if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    requestCloseRecord()
    return
  }
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
  const shortcut = shortcutFromKeyboardEvent(event)
  if (!isRecordableShortcutId(shortcut)) return
  shortcutRecordCapturedId.value = shortcut
}

function handleModalEscape(event: KeyboardEvent) {
  if (!recordingRow.value && !whenRow.value) return
  if (event.key === 'Escape') {
    blockHandledShortcutEvent(event)
    if (recordingRow.value) requestCloseRecord()
    else closeWhenEditor()
    return
  }
  if (isConfirmSaveShortcut(event)) {
    blockHandledShortcutEvent(event)
    if (recordingRow.value && recordValidation.value.errors.length === 0) saveRecord()
    else if (whenRow.value && whenValidation.value.errors.length === 0) saveWhen()
  }
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
  if (shortcutIds.some((shortcutId) => !isRecordableShortcutId(shortcutId))) errors.push('不能只绑定修饰键')
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
  closeWhenEditor()
  recordingCommandId.value = row.commandId
  shortcutRecordActiveIds.value = [...row.shortcutIds]
  shortcutRecordBaselineIds.value = [...row.shortcutIds]
  shortcutRecordPendingIds.value = []
  shortcutRecordCapturedId.value = ''
  shortcutRecordDefaultIds.value = [...row.defaultShortcutIds]
  shortcutRecordDirectInput.value = ''
  shortcutRecordEditingIndex.value = -1
  shortcutRecordEditingValue.value = ''
  focusShortcutRecorder()
}

function closeRecord() {
  recordingCommandId.value = null
  shortcutRecordBaselineIds.value = []
  shortcutRecordActiveIds.value = []
  shortcutRecordPendingIds.value = []
  shortcutRecordCapturedId.value = ''
  shortcutRecordDefaultIds.value = []
  shortcutRecordDirectInput.value = ''
  shortcutRecordEditingIndex.value = -1
  shortcutRecordEditingValue.value = ''
}

function saveRecord() {
  const row = recordingRow.value
  if (!row || recordValidation.value.errors.length) return
  applyDraftKeybinding({
    commandId: row.commandId,
    shortcutIds: recordShortcutIds.value,
    when: row.when,
    profileId: row.profileId,
    enabled: true
  })
  closeRecord()
}

function requestCloseRecord() {
  if (!recordingRow.value) return
  if (!shortcutRecordDirty.value) {
    closeRecord()
    return
  }
  const action = confirmDiscardMessage('录制快捷键')
  if (action === 'save') {
    saveRecord()
  } else if (action === 'discard') {
    closeRecord()
  }
}

function confirmDiscardMessage(title: string): 'save' | 'discard' | 'cancel' {
  if (window.confirm(`${title} 已修改，是否保存后关闭？`)) return 'save'
  if (window.confirm('不保存并关闭？')) return 'discard'
  return 'cancel'
}

function focusShortcutRecorder() {
  requestAnimationFrame(() => shortcutRecorderRef.value?.focus())
}

function restoreShortcutRecordToDefault() {
  shortcutRecordActiveIds.value = [...shortcutRecordDefaultIds.value]
  shortcutRecordPendingIds.value = []
  shortcutRecordCapturedId.value = ''
  shortcutRecordDirectInput.value = ''
  shortcutRecordEditingIndex.value = -1
  shortcutRecordEditingValue.value = ''
  focusShortcutRecorder()
}

function removeShortcutRecordActiveId(index: number) {
  shortcutRecordActiveIds.value = shortcutRecordActiveIds.value.filter((_, itemIndex) => itemIndex !== index)
}

function removeShortcutRecordPendingId(index: number) {
  shortcutRecordPendingIds.value = shortcutRecordPendingIds.value.filter((_, itemIndex) => itemIndex !== index)
}

function promoteShortcutRecordCaptured() {
  const shortcut = normalizeShortcutId(shortcutRecordCapturedId.value)
  if (!shortcut || !isRecordableShortcutId(shortcut)) return
  if (!shortcutRecordPendingIds.value.includes(shortcut)) shortcutRecordPendingIds.value = [...shortcutRecordPendingIds.value, shortcut]
  shortcutRecordCapturedId.value = ''
  focusShortcutRecorder()
}

function addShortcutRecordDirectInput() {
  const shortcut = normalizeShortcutId(shortcutRecordDirectInput.value)
  if (!shortcut || !isRecordableShortcutId(shortcut)) return
  if (!shortcutRecordPendingIds.value.includes(shortcut)) shortcutRecordPendingIds.value = [...shortcutRecordPendingIds.value, shortcut]
  shortcutRecordDirectInput.value = ''
  focusShortcutRecorder()
}

function startEditingShortcut(index: number, shortcutId: string) {
  shortcutRecordEditingIndex.value = index
  shortcutRecordEditingValue.value = shortcutId
}

function finishEditingShortcut(index: number) {
  const shortcut = normalizeShortcutId(shortcutRecordEditingValue.value)
  if (!shortcut || !isRecordableShortcutId(shortcut)) {
    cancelEditingShortcut()
    return
  }
  const next = [...shortcutRecordPendingIds.value]
  next[index] = shortcut
  shortcutRecordPendingIds.value = [...new Set(next)]
  cancelEditingShortcut()
}

function cancelEditingShortcut() {
  shortcutRecordEditingIndex.value = -1
  shortcutRecordEditingValue.value = ''
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
  applyDraftKeybinding({
    commandId: row.commandId,
    shortcutIds: row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds,
    when: whenDraft.value,
    profileId: row.profileId,
    enabled: true
  })
  closeWhenEditor()
}

function disableRow(row: ShortcutCommandRow) {
  if (!window.confirm(`确定禁用「${row.title || row.commandId}」的快捷键触发吗？`)) return
  applyDraftKeybinding({
    commandId: row.commandId,
    shortcutIds: row.shortcutIds.length ? row.shortcutIds : row.defaultShortcutIds,
    when: row.when,
    profileId: row.profileId,
    enabled: false,
    disabled: true
  })
}

function resetDraftKeybinding(commandId: string) {
  const next = cloneShortcutProfiles(draftShortcutProfiles.value)
  for (const profileId of SHORTCUT_PROFILE_IDS) {
    next[profileId].keybindingOverrides = next[profileId].keybindingOverrides.filter((item) => item.commandId !== commandId)
    next[profileId].updatedAt = Date.now()
  }
  draftShortcutProfiles.value = next
}

function applyDraftKeybinding(payload: KeybindingUpdatePayload) {
  const shortcutIds = (payload.shortcutIds?.length ? payload.shortcutIds : payload.shortcutId ? [payload.shortcutId] : [])
    .map(normalizeShortcutId)
    .filter(Boolean)
  const isDisabled = payload.disabled === true || payload.enabled === false
  const profileId = payload.profileId || inferShortcutProfileId(payload.commandId)
  const next = cloneShortcutProfiles(draftShortcutProfiles.value)
  for (const id of SHORTCUT_PROFILE_IDS) {
    next[id].keybindingOverrides = next[id].keybindingOverrides.filter((item) => item.commandId !== payload.commandId)
  }
  next[profileId].keybindingOverrides.push({
    commandId: payload.commandId,
    shortcutId: shortcutIds[0],
    shortcutIds,
    when: payload.when,
    enabled: !isDisabled,
    source: isDisabled ? 'removed' : 'user',
    disabled: isDisabled
  })
  next[profileId].updatedAt = Date.now()
  draftShortcutProfiles.value = next
}

function inferShortcutProfileId(commandId: string): ShortcutProfileId {
  if (commandId.startsWith('ports.')) return 'ports'
  if (commandId.startsWith('mqtt.')) return 'mqtt'
  if (commandId.startsWith('favorites.')) return 'favorites'
  if (commandId.startsWith('windows.')) return 'windows'
  if (commandId.startsWith('codex.')) return 'codex'
  if (commandId.startsWith('settings.')) return 'settings'
  return 'global'
}

function saveShortcutDraft() {
  emit('saveShortcutProfiles', cloneShortcutProfiles(draftShortcutProfiles.value))
}

function discardShortcutDraft() {
  draftShortcutProfiles.value = cloneShortcutProfiles(props.shortcutProfiles || props.settings.shortcutProfiles)
}

function isRecordableShortcutId(shortcutId: string) {
  const normalized = normalizeShortcutId(shortcutId)
  if (!normalized || normalized === '*') return false
  return !['Ctrl', 'Alt', 'Shift'].includes(normalized)
}

</script>

<template>
  <section
    class="settings-page"
    :style="{ '--shortcut-tooltip-x': `${commandTooltipX}px`, '--shortcut-tooltip-y': `${commandTooltipY}px` }"
    @keydown.capture="handleSettingsKeydown"
  >
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
        <span class="settings-shortcut-search-wrap" :class="{ hinting: shortcutModifierHinting }">
          <input ref="shortcutSearchInput" v-model="keyword" data-role="settings-shortcut-search" placeholder="搜索 command、layer、when、快捷键" />
          <kbd class="settings-search-shortcut-hint">c-f</kbd>
        </span>
        <select v-model="stateFilter" aria-label="筛选状态">
          <option value="all">全部状态</option>
          <option value="conflict">冲突/保留</option>
          <option value="user">用户覆盖</option>
          <option value="disabled">已禁用</option>
        </select>
        <span class="shortcut-strip-meta">{{ primaryShortcutRows.length }} / {{ commandRows.length }}</span>
        <span class="shortcut-draft-actions">
          <button type="button" :disabled="!shortcutDraftDirty" @click="discardShortcutDraft">放弃</button>
          <button type="button" :disabled="!shortcutDraftDirty" @click="saveShortcutDraft">保存</button>
        </span>
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
          v-for="row in primaryShortcutRows"
          :key="row.commandId"
          class="shortcut-compact-row"
          role="row"
          tabindex="0"
          :data-command-id="row.commandId"
          data-operation-tooltip="右键打开命令操作"
          data-operation-shortcut="Ctrl+→"
          :class="{ selected: selectedRow?.commandId === row.commandId, disabled: !row.enabled }"
          @click="selectedCommandId = row.commandId"
          @keydown.enter.prevent="selectedCommandId = row.commandId"
          @contextmenu.prevent="openContextPanel('actions', row, $event.currentTarget as HTMLElement)"
        >
          <span class="command-cell" :aria-label="commandTooltip(row)" @mousemove="updateCommandTooltipPosition">
            <strong class="command-tooltip-trigger">{{ row.commandId }}</strong>
            <span class="shortcut-command-tooltip" role="tooltip">
              <strong>{{ shortcutCommandTooltipTitle(row) }}</strong>
              <small v-for="line in commandTooltipLines(row).slice(1)" :key="line">{{ line }}</small>
            </span>
          </span>
          <span class="scope-cell" :title="scopeDisplay(row).title" @mousemove="updateCommandTooltipPosition">
            <em class="status-badge shortcut-label" :title="scopeDisplay(row).profileTitle">
              {{ scopeDisplay(row).profile }}
              <span class="shortcut-label-tooltip" role="tooltip" aria-hidden="true">{{ scopeDisplay(row).profileTitle }}</span>
            </em>
            <em class="layer-chip shortcut-label" :title="scopeDisplay(row).layerTitle">
              {{ scopeDisplay(row).layer }}
              <span class="shortcut-label-tooltip" role="tooltip" aria-hidden="true">{{ scopeDisplay(row).layerTitle }}</span>
            </em>
          </span>
          <span class="shortcut-cell" :title="shortcutTooltip(row)">
            <span class="kbd-list">
              <kbd v-for="shortcut in row.shortcutIds" :key="shortcut">{{ formatShortcutLabel(shortcut) }}</kbd>
              <em v-if="!row.shortcutIds.length">未绑定</em>
            </span>
          </span>
          <span class="when-cell" :title="row.when || 'always'">
            <small>{{ row.when || 'always' }}</small>
          </span>
          <span class="state-cell" :title="stateDisplay(row).title" @mousemove="updateCommandTooltipPosition">
            <em v-for="item in stateDisplay(row).parts" :key="item.label" class="status-badge shortcut-label" :class="item.className" :title="item.title">
              {{ item.label }}
              <span class="shortcut-label-tooltip" role="tooltip" aria-hidden="true">{{ item.title }}</span>
            </em>
          </span>
          <span class="row-actions">
            <button type="button" aria-label="录制快捷键" title="录制快捷键" @click.stop="openRecord(row)"><Keyboard :size="14" aria-hidden="true" /></button>
            <button type="button" aria-label="编辑 When" title="编辑 When" @click.stop="openWhenEditor(row)"><Braces :size="14" aria-hidden="true" /></button>
            <button type="button" aria-label="恢复默认快捷键" title="恢复默认快捷键" @click.stop="resetDraftKeybinding(row.commandId)"><RotateCcw :size="14" aria-hidden="true" /></button>
            <button type="button" class="danger" aria-label="禁用快捷键" title="禁用快捷键" @click.stop="disableRow(row)"><Ban :size="14" aria-hidden="true" /></button>
          </span>
        </div>
      </div>
    </div>

    <div v-else class="settings-maintenance">
      <nav class="maintenance-section-nav" aria-label="维护区域">
        <button
          v-for="section in maintenanceSections"
          :key="section.id"
          type="button"
          :class="{ active: maintenanceSectionId === section.id }"
          @click="maintenanceSectionId = section.id"
        >
          <strong>{{ section.label }}</strong>
          <small>{{ section.meta }}</small>
        </button>
      </nav>

      <section class="maintenance-center">
        <header class="maintenance-center-header">
          <span v-if="maintenanceSectionId === 'features'">
            <strong>功能开关</strong>
            <small>控制顶层功能是否启用，并决定主 Tab 与 Ctrl+Shift 数字顺序</small>
          </span>
          <span v-else-if="maintenanceSectionId === 'tools'">
            <strong>工具系统</strong>
            <small>跨工具共享的交互偏好，当前用于悬浮预览</small>
          </span>
          <span v-else-if="maintenanceSectionId === 'layers'">
            <strong>层级优先级</strong>
            <small>{{ layerRows.length }} 个快捷键接管层，数值越大优先级越高</small>
          </span>
          <span v-else-if="maintenanceSectionId === 'storage'">
            <strong>存储状态</strong>
            <small>{{ storageModeLabel }} · {{ sqliteStateLabel }}</small>
          </span>
          <span v-else-if="maintenanceSectionId === 'commands'">
            <strong>Layer Commands</strong>
            <small>{{ maintenanceShortcutRows.length }} 个维护命令，可录制、编辑 When、恢复或禁用</small>
          </span>
          <span v-else-if="maintenanceSectionId === 'resolution'">
            <strong>解析候选</strong>
            <small>{{ previewResult.winner?.actionId || '未命中或被输入层阻断' }}</small>
          </span>
          <span v-else>
            <strong>保留键与接管层</strong>
            <small>{{ SHORTCUT_RESERVATION_RULES.length }} 条保留键规则</small>
          </span>
        </header>

        <div v-if="maintenanceSectionId === 'features'" class="maintenance-panel-body maintenance-feature-body">
          <div class="feature-maintenance-toolbar">
            <span>{{ featureRows.filter((row) => row.enabled).length }} 个功能启用</span>
            <span class="shortcut-draft-actions">
              <button type="button" :disabled="!featureDraftDirty" @click="discardFeatureDraft">放弃</button>
              <button type="button" :disabled="!featureDraftDirty" @click="saveFeatureDraft">保存</button>
            </span>
          </div>
          <div class="feature-maintenance-list" role="table">
            <div class="feature-config-row feature-config-head" role="row">
              <span>功能</span>
              <span>启用</span>
              <span>排序</span>
              <span>状态</span>
            </div>
            <div
              v-for="row in featureRows"
              :key="row.id"
              class="feature-config-row"
              role="row"
              draggable="true"
              :class="{ disabled: !row.enabled, dragging: draggingFeatureId === row.id }"
              @dragstart="onFeatureDragStart(row)"
              @dragend="draggingFeatureId = null"
              @dragover.prevent
              @drop.prevent="onFeatureDrop(row)"
            >
              <span class="feature-config-main">
                <span class="feature-config-copy">
                  <strong>{{ row.title }}</strong>
                  <small>{{ row.description }}</small>
                </span>
                <button
                  type="button"
                  class="feature-help-trigger"
                  :disabled="!hasFeatureHelp(row.id)"
                  :aria-label="`查看${row.title}操作说明`"
                  :title="hasFeatureHelp(row.id) ? '操作说明' : '暂无操作说明'"
                  @click.stop="openFeatureHelp(row.id)"
                >说明</button>
              </span>
              <span class="feature-config-toggle">
                <input
                  type="checkbox"
                  :checked="row.enabled"
                  :disabled="row.locked"
                  :aria-label="`${row.title}启用状态`"
                  @change="toggleFeature(row, ($event.target as HTMLInputElement).checked)"
                />
              </span>
              <span class="feature-config-order">
                <button type="button" title="上移" :disabled="row.sortOrder === 1" @click="moveFeature(row, -1)">↑</button>
                <button type="button" title="下移" :disabled="row.sortOrder === featureRows.length" @click="moveFeature(row, 1)">↓</button>
              </span>
              <span class="feature-config-state">
                <em class="status-badge" :class="row.enabled ? 'source-user' : 'source-removed'">{{ row.enabled ? 'On' : 'Off' }}</em>
                <em v-if="row.locked" class="status-badge">Locked</em>
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="maintenanceSectionId === 'tools'" class="maintenance-panel-body maintenance-tool-body">
          <div class="settings-subpanel">
            <h3>预览行为</h3>
            <div class="maintenance-row tool-preview-row">
              <span>悬浮预览</span>
              <label class="tool-preview-toggle">
                <input
                  type="checkbox"
                  aria-label="悬浮预览"
                  :checked="props.settings.toolPreviewPrefs.hoverPreviewEnabled"
                  @change="updateToolPreviewPrefs({ enabled: ($event.target as HTMLInputElement).checked })"
                />
                <strong>{{ props.settings.toolPreviewPrefs.hoverPreviewEnabled ? '已启用' : '已关闭' }}</strong>
              </label>
              <small>控制工具列表项的鼠标悬浮只读预览；键盘预览不受影响。</small>
            </div>
            <div class="maintenance-row tool-preview-row">
              <span>预览延迟</span>
              <label class="tool-preview-delay">
                <input
                  type="number"
                  aria-label="悬浮预览延迟"
                  min="0"
                  max="5000"
                  step="100"
                  :disabled="!props.settings.toolPreviewPrefs.hoverPreviewEnabled"
                  :value="props.settings.toolPreviewPrefs.hoverPreviewDelayMs"
                  @change="updateToolPreviewPrefs({ delayMs: Number(($event.target as HTMLInputElement).value) })"
                />
                <small>ms</small>
              </label>
              <small>默认 500ms，范围 0 到 5000ms。</small>
            </div>
          </div>
        </div>

        <div v-else-if="maintenanceSectionId === 'layers'" class="maintenance-panel-body maintenance-layer-body">
          <div class="settings-subpanel">
            <h3>层级优先级</h3>
            <div v-for="layer in layerRows" :key="layer.id" class="layer-rule-row">
              <span>{{ layer.id }}</span>
              <strong>{{ layer.priority }}</strong>
            </div>
          </div>
        </div>

        <div v-else-if="maintenanceSectionId === 'storage'" class="maintenance-panel-body maintenance-storage-body">
          <div class="settings-subpanel">
            <h3>存储状态</h3>
            <div class="maintenance-row">
              <span>当前存储</span>
              <strong>{{ storageModeLabel }}</strong>
              <small>MQTT 连接历史、收发记录和收藏模板优先写入本机 SQLite。</small>
            </div>
            <div class="maintenance-row">
              <span>SQLite</span>
              <strong>{{ sqliteStateLabel }}</strong>
              <small>{{ props.mqttStorageStatus.dbPath || props.mqttStorageStatus.lastError || '当前环境使用降级存储。' }}</small>
            </div>
            <div class="maintenance-row">
              <span>迁移</span>
              <strong>{{ props.mqttStorageStatus.migratedLegacyArchive ? '已导入旧 archive' : '无需迁移或尚未触发' }}</strong>
              <small>旧 dbStorage archive 会保留为备份，不在迁移时删除。</small>
            </div>
          </div>
        </div>

        <div v-else-if="maintenanceSectionId === 'commands'" class="maintenance-panel-body maintenance-command-body">
          <div class="shortcut-table shortcut-table-embedded maintenance-command-table" role="table">
            <div class="shortcut-compact-row shortcut-row-head" role="row">
              <span>Command</span>
              <span>Scope</span>
              <span>Shortcut</span>
              <span>When</span>
              <span>Status</span>
              <span>Ops</span>
            </div>
            <div
              v-for="row in maintenanceShortcutRows"
              :key="`maintenance-${row.commandId}`"
              class="shortcut-compact-row"
              role="row"
              tabindex="0"
              :data-command-id="row.commandId"
              data-operation-tooltip="右键打开命令操作"
              data-operation-shortcut="Ctrl+→"
              :class="{ selected: selectedRow?.commandId === row.commandId, disabled: !row.enabled }"
              @click="selectedCommandId = row.commandId"
              @keydown.enter.prevent="selectedCommandId = row.commandId"
              @contextmenu.prevent="openContextPanel('actions', row, $event.currentTarget as HTMLElement)"
            >
              <span class="command-cell" :aria-label="commandTooltip(row)" @mousemove="updateCommandTooltipPosition">
                <strong class="command-tooltip-trigger">{{ row.commandId }}</strong>
                <span class="shortcut-command-tooltip" role="tooltip">
                  <strong>{{ shortcutCommandTooltipTitle(row) }}</strong>
                  <small v-for="line in commandTooltipLines(row).slice(1)" :key="line">{{ line }}</small>
                </span>
              </span>
              <span class="scope-cell" :title="scopeDisplay(row).title" @mousemove="updateCommandTooltipPosition">
                <em class="status-badge shortcut-label" :title="scopeDisplay(row).profileTitle">
                  {{ scopeDisplay(row).profile }}
                  <span class="shortcut-label-tooltip" role="tooltip" aria-hidden="true">{{ scopeDisplay(row).profileTitle }}</span>
                </em>
                <em class="layer-chip shortcut-label" :title="scopeDisplay(row).layerTitle">
                  {{ scopeDisplay(row).layer }}
                  <span class="shortcut-label-tooltip" role="tooltip" aria-hidden="true">{{ scopeDisplay(row).layerTitle }}</span>
                </em>
              </span>
              <span class="shortcut-cell" :title="shortcutTooltip(row)">
                <span class="kbd-list">
                  <kbd v-for="shortcut in row.shortcutIds" :key="shortcut">{{ formatShortcutLabel(shortcut) }}</kbd>
                  <em v-if="!row.shortcutIds.length">未绑定</em>
                </span>
              </span>
              <span class="when-cell" :title="row.when || 'always'">
                <small>{{ row.when || 'always' }}</small>
              </span>
              <span class="state-cell" :title="stateDisplay(row).title" @mousemove="updateCommandTooltipPosition">
                <em v-for="item in stateDisplay(row).parts" :key="item.label" class="status-badge shortcut-label" :class="item.className" :title="item.title">
                  {{ item.label }}
                  <span class="shortcut-label-tooltip" role="tooltip" aria-hidden="true">{{ item.title }}</span>
                </em>
              </span>
              <span class="row-actions">
                <button type="button" aria-label="录制快捷键" title="录制快捷键" @click.stop="openRecord(row)"><Keyboard :size="14" aria-hidden="true" /></button>
                <button type="button" aria-label="编辑 When" title="编辑 When" @click.stop="openWhenEditor(row)"><Braces :size="14" aria-hidden="true" /></button>
                <button type="button" aria-label="恢复默认快捷键" title="恢复默认快捷键" @click.stop="resetDraftKeybinding(row.commandId)"><RotateCcw :size="14" aria-hidden="true" /></button>
                <button type="button" class="danger" aria-label="禁用快捷键" title="禁用快捷键" @click.stop="disableRow(row)"><Ban :size="14" aria-hidden="true" /></button>
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="maintenanceSectionId === 'resolution'" class="maintenance-panel-body maintenance-resolution-body">
          <div class="maintenance-preview-strip">
            <span v-if="selectedRow" class="preview-selected" :title="commandTooltip(selectedRow)">
              {{ selectedRow.commandId }}
              <small>{{ shortcutCommandTooltipTitle(selectedRow) }}</small>
            </span>
            <span class="preview-hit" :title="previewResult.activeLayers.join(' > ')">
              命中 {{ previewResult.winner?.actionId || '未命中' }}
            </span>
            <span class="preview-layer">层 {{ previewResult.activeLayers.join(' > ') || 'none' }}</span>
          </div>
          <div class="preview-controls">
            <input v-model="previewShortcut" placeholder="例如 c-s-1" />
            <select v-model="previewContextId" aria-label="预览上下文">
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

        <div v-else class="maintenance-panel-body maintenance-reservation-body">
          <div v-for="rule in SHORTCUT_RESERVATION_RULES" :key="`${rule.commandId}-${rule.shortcutId}-${rule.when}`" class="reservation-row">
            <kbd>{{ formatShortcutLabel(rule.shortcutId) }}</kbd>
            <span>
              <strong>{{ rule.commandId }}</strong>
              <small>{{ rule.layer }} · {{ rule.when || 'always' }}</small>
              <small>{{ rule.description }}</small>
            </span>
          </div>
        </div>
      </section>
    </div>

    <div v-if="contextPanel === 'detail' && selectedRow" class="drawer-overlay drawer-overlay-left" @click="closeContextPanel()">
      <aside class="port-detail-drawer settings-context-panel active" aria-label="快捷键命令详情" @click.stop>
        <header class="drawer-header">
          <span><strong>命令详情</strong><small>{{ selectedRow.title }}</small></span>
          <button type="button" aria-label="关闭详情" title="关闭详情" @click="closeContextPanel()"><X :size="15" aria-hidden="true" /></button>
        </header>
        <div class="detail-list">
          <div class="detail-row"><span>Command</span><strong>{{ selectedRow.commandId }}</strong></div>
          <div class="detail-row"><span>Layer</span><strong>{{ selectedRow.layerLabel }}</strong></div>
          <div class="detail-row"><span>Shortcut</span><strong>{{ formatShortcutList(selectedRow.shortcutIds) || '未绑定' }}</strong></div>
          <div class="detail-row"><span>When</span><strong>{{ selectedRow.when || 'always' }}</strong></div>
          <div class="detail-row"><span>状态</span><strong>{{ selectedRow.enabled ? '启用' : '禁用' }}</strong></div>
        </div>
        <div class="detail-actions">
          <button type="button" @click="openContextPanel('actions', selectedRow)"><MoreHorizontal :size="14" aria-hidden="true" /> 操作菜单</button>
          <button type="button" @click="closeContextPanel()">关闭</button>
        </div>
      </aside>
    </div>

    <div v-if="contextPanel === 'actions' && selectedRow" class="drawer-overlay drawer-overlay-right" @click="closeContextPanel()">
      <aside class="port-action-drawer settings-context-panel active" aria-label="快捷键命令操作" @click.stop>
        <header class="drawer-header">
          <span><strong>命令操作</strong><small>{{ selectedRow.commandId }}</small></span>
          <button type="button" aria-label="关闭菜单" title="关闭菜单" @click="closeContextPanel()"><X :size="15" aria-hidden="true" /></button>
        </header>
        <div class="drawer-action-list" role="menu">
          <button type="button" class="drawer-action" role="menuitem" @click="runContextAction('record')"><Keyboard :size="16" aria-hidden="true" /><span class="drawer-action-copy"><strong>录制快捷键</strong><small>为当前命令录制一个或多个组合键。</small></span></button>
          <button type="button" class="drawer-action" role="menuitem" @click="runContextAction('when')"><Braces :size="16" aria-hidden="true" /><span class="drawer-action-copy"><strong>编辑 When</strong><small>调整命令在何种上下文生效。</small></span></button>
          <button type="button" class="drawer-action" role="menuitem" @click="runContextAction('reset')"><RotateCcw :size="16" aria-hidden="true" /><span class="drawer-action-copy"><strong>恢复默认</strong><small>移除当前用户覆盖。</small></span></button>
          <button type="button" class="drawer-action danger" role="menuitem" @click="runContextAction('disable')"><Ban :size="16" aria-hidden="true" /><span class="drawer-action-copy"><strong>禁用快捷键</strong><small>保留命令但停止快捷键触发。</small></span></button>
        </div>
      </aside>
    </div>

    <div v-if="recordingRow" class="modal-backdrop" @keydown.esc.stop.prevent="requestCloseRecord">
      <section class="shortcut-modal shortcut-record-modal" role="dialog" aria-modal="true" @keydown.stop>
        <header>
          <span>
            <strong>录制快捷键</strong>
            <small>{{ recordingRow.commandId }}</small>
          </span>
          <span class="confirm-actions shortcut-record-actions">
            <button type="button" @click="requestCloseRecord">取消</button>
            <button type="button" :disabled="recordValidation.errors.length > 0" @click="saveRecord">保存</button>
          </span>
        </header>
        <div class="shortcut-record-scroll">
          <div class="shortcut-record-head shortcut-record-head--command">
            <span class="shortcut-record-head-main">
              <strong class="shortcut-record-command">{{ shortcutCommandTooltipTitle(recordingRow) }}</strong>
              <small class="shortcut-record-command-id">{{ recordingRow.commandId }}</small>
            </span>
            <span class="shortcut-record-head-defaults">
              <small class="shortcut-record-default-label">默认值</small>
              <kbd v-for="shortcut in shortcutRecordDefaultIds" :key="shortcut" class="shortcut-record-default-value">{{ formatShortcutLabel(shortcut) }}</kbd>
              <button v-if="showShortcutRecordDefaultRestore" type="button" class="shortcut-record-default-reset" @click="restoreShortcutRecordToDefault">恢复默认</button>
            </span>
          </div>
          <div class="shortcut-record-panels">
            <div class="shortcut-record-panel shortcut-record-panel--current">
              <strong class="shortcut-record-panel-label">当前绑定</strong>
              <div v-if="shortcutRecordActiveIds.length" class="shortcut-record-key-list">
                <span v-for="(shortcut, index) in shortcutRecordActiveIds" :key="`active-${shortcut}-${index}`" class="shortcut-record-key-row">
                  <kbd>{{ formatShortcutLabel(shortcut) }}</kbd>
                  <button type="button" class="shortcut-record-key-remove" @click="removeShortcutRecordActiveId(index)">×</button>
                </span>
              </div>
              <small v-else class="shortcut-record-key-empty">暂无绑定</small>
            </div>
            <div class="shortcut-record-panel shortcut-record-panel--pending">
              <strong class="shortcut-record-panel-label">待绑定</strong>
              <div v-if="shortcutRecordPendingIds.length" class="shortcut-record-key-list">
                <span v-for="(shortcut, index) in shortcutRecordPendingIds" :key="`pending-${shortcut}-${index}`" class="shortcut-record-key-row">
                  <input
                    v-if="shortcutRecordEditingIndex === index"
                    v-model="shortcutRecordEditingValue"
                    @blur="finishEditingShortcut(index)"
                    @keydown.enter.prevent="finishEditingShortcut(index)"
                    @keydown.esc.prevent="cancelEditingShortcut"
                  />
                  <kbd v-else @click="startEditingShortcut(index, shortcut)">{{ formatShortcutLabel(shortcut) }}</kbd>
                  <button type="button" class="shortcut-record-key-remove" @click="removeShortcutRecordPendingId(index)">×</button>
                </span>
              </div>
              <small v-else class="shortcut-record-key-empty">录制后点 ✓ 添加</small>
            </div>
          </div>
          <div ref="shortcutRecorderRef" class="shortcut-record-capture-row shortcut-recorder" tabindex="0" @keydown.stop.prevent="handleShortcutRecordKeydown">
            <span class="shortcut-record-capture-hint">按下快捷键录制</span>
            <span v-if="shortcutRecordCapturedId" class="shortcut-record-capture-staging">
              <kbd>{{ formatShortcutLabel(shortcutRecordCapturedId) }}</kbd>
            </span>
            <button v-if="shortcutRecordCapturedId" type="button" class="shortcut-record-capture-confirm" @click="promoteShortcutRecordCaptured">✓</button>
          </div>
          <div class="shortcut-record-direct-input-row">
            <span class="shortcut-record-capture-hint">或直接录入</span>
            <input v-model="shortcutRecordDirectInput" placeholder="如 c-s-z 或 Ctrl+Shift+Z" @keydown.enter.prevent="addShortcutRecordDirectInput" />
            <button type="button" @click="addShortcutRecordDirectInput">添加</button>
          </div>
          <div class="shortcut-modal-grid">
            <p>合并：{{ formatShortcutList(shortcutRecordMergedIds) || '未绑定' }}</p>
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
        </div>
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

    <FeatureHelpDialog
      v-if="featureHelpDoc"
      :title="featureHelpDoc.title"
      :markdown="featureHelpDoc.markdown"
      @close="closeFeatureHelp"
    />
  </section>
</template>
