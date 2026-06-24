<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Component, CSSProperties } from 'vue'
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BadgeX,
  ChevronsLeft,
  Clipboard,
  Copy,
  CornerDownLeft,
  Eraser,
  Hash,
  History,
  Info,
  LayoutPanelTop,
  Logs,
  MoreHorizontal,
  Pencil,
  Plug,
  Plus,
  Save,
  Send,
  Star,
  Trash2,
  Unplug,
  X
} from '@lucide/vue'
import type { AppRuntimeSnapshot, MqttConfigDraft, MqttFavoriteDraft, MqttRecordEditDraft, MqttSubscriptionEditorDraft, MqttSubscriptionEditorField, MqttSubscriptionEditorItem } from '../runtime/appRuntime'
import type { MqttMessageRecord, MqttPublishDraft, MqttPublishTemplate, MqttQos } from '../domain/types'
import { buildMqttWebSocketUrl } from '../domain/mqtt'
import { buildMqttInlinePayloadPreviewSegments, buildMqttPayloadPreviewSegments } from '../domain/mqttPayloadPreview'
import { layoutShortcutHints } from '../domain/shortcutHintLayout'
import type { ShortcutHintAnchor, ShortcutHintPlacement } from '../domain/shortcutHintLayout'
import MqttPublishRecordList from '../components/MqttPublishRecordList.vue'
import SearchSuggestBox from '../components/SearchSuggestBox.vue'

interface MqttShortcutHintEntry {
  id: string
  label: string
  placement: ShortcutHintPlacement
  style: CSSProperties
}

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean; shiftPreview?: boolean }>()
const emit = defineEmits<{
  search: [value: string]
  focusConfig: [id: string]
  focusSession: [id: string]
  focusMessage: [id: string]
  focusLog: [id: string]
  updateConfigDraft: [input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>]
  updateSubscriptionDraft: [input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>]
  updateFavoriteDraft: [input: Partial<Pick<MqttFavoriteDraft, 'title' | 'activeField'>>]
  updateRecordEditDraft: [input: Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>]
  updatePublishDraft: [input: Partial<MqttPublishDraft>]
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

const workbenchRef = ref<HTMLElement | null>(null)
const previewPayloadRef = ref<HTMLElement | null>(null)
const shortcutHintEntries = ref<MqttShortcutHintEntry[]>([])
let shortcutHintFrame: number | null = null

const configForm = reactive({
  name: '',
  url: '',
  protocol: 'ws' as 'ws' | 'wss',
  host: '',
  port: '',
  path: '',
  ssl: false,
  clientId: '',
  username: '',
  password: '',
  subscriptionsText: '',
  subscriptionItems: [] as MqttConfigDraft['subscriptionItems'],
  publishTopic: '',
  qos: 0 as MqttQos,
  retain: false,
  autoReconnect: true,
  reconnectPeriodMs: 3000,
  connectTimeoutMs: 10000,
  keepaliveSec: 60,
  clean: true,
  reconnectOnConnackError: false,
  resubscribeOnReconnect: true,
  syncRecords: true
})

watch(() => props.snapshot.mqttConfigDraft, (draft) => {
  configForm.name = draft?.name || ''
  configForm.url = draft?.url || ''
  configForm.protocol = draft?.protocol || 'ws'
  configForm.host = draft?.host || ''
  configForm.port = draft?.port || ''
  configForm.path = draft?.path ?? ''
  configForm.ssl = draft?.ssl || false
  configForm.clientId = draft?.clientId || ''
  configForm.username = draft?.username || ''
  configForm.password = draft?.password || ''
  configForm.subscriptionsText = draft?.subscriptionsText || ''
  configForm.subscriptionItems = draft?.subscriptionItems?.map((item) => ({ ...item })) || []
  configForm.publishTopic = draft?.publishTopic || ''
  configForm.qos = draft?.qos || 0
  configForm.retain = draft?.retain || false
  configForm.autoReconnect = draft?.autoReconnect ?? true
  configForm.reconnectPeriodMs = draft?.reconnectPeriodMs || 3000
  configForm.connectTimeoutMs = draft?.connectTimeoutMs || 10000
  configForm.keepaliveSec = draft?.keepaliveSec ?? 60
  configForm.clean = draft?.clean ?? true
  configForm.reconnectOnConnackError = draft?.reconnectOnConnackError || false
  configForm.resubscribeOnReconnect = draft?.resubscribeOnReconnect ?? true
  configForm.syncRecords = draft?.syncRecords ?? true
}, { immediate: true })

watch(() => props.snapshot.mqttConfigDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-mqtt-field="${field}"]`)
    input?.focus()
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.select()
  })
})

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

watch([
  () => props.snapshot.mqttSubscriptionDraft?.activeItemId,
  () => props.snapshot.mqttSubscriptionDraft?.activeField
], ([itemId, field]) => {
  if (!field) return
  void nextTick(() => {
    const fieldSelector = `[data-mqtt-subscription-field="${field}"]`
    const selector = itemId ? `[data-mqtt-subscription-item-id="${cssAttributeValue(itemId)}"]${fieldSelector}` : fieldSelector
    const input = document.querySelector<HTMLInputElement>(selector) || document.querySelector<HTMLInputElement>(fieldSelector)
    const alreadyFocused = document.activeElement === input
    input?.focus()
    if (!alreadyFocused) input?.setSelectionRange(input.value.length, input.value.length)
  })
})

watch(() => props.snapshot.mqttRecordEditDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-mqtt-record-field="${field}"]`)
    input?.focus()
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.select()
  })
})

const activeConfig = computed(() => props.snapshot.mqttActiveConfig)
const subscriptionDraft = computed(() => props.snapshot.mqttSubscriptionDraft)
const favoriteDraft = computed(() => props.snapshot.mqttFavoriteDraft)
const recordEditDraft = computed(() => props.snapshot.mqttRecordEditDraft)
const publishDraft = computed(() => props.snapshot.mqttPublishScratch)
const endpointPreview = computed(() => buildMqttWebSocketUrl(configForm))
const selectedLog = computed(() => props.snapshot.mqttSelectedLog)
const visibleLogs = computed(() => {
  const query = props.snapshot.mqttSearch.trim().toLowerCase()
  return props.snapshot.mqttLogs.filter((log) => {
    if (!query) return true
    return [log.level, log.message, log.detail, logConfigName(log)].join(' ').toLowerCase().includes(query)
  })
})
const directionFilterButtons = computed(() => [
  { id: 'all', commandId: 'mqtt.receive.filter.all', label: '全部', icon: 'all', count: props.snapshot.mqttMessageStats.all },
  { id: 'incoming', commandId: 'mqtt.receive.filter.in', label: '已接收', icon: 'in', count: props.snapshot.mqttMessageStats.incoming },
  { id: 'outgoing', commandId: 'mqtt.receive.filter.out', label: '已发送', icon: 'out', count: props.snapshot.mqttMessageStats.outgoing }
])
const activePublishRecordListId = computed(() => props.snapshot.activeMqttRecordList === 'history' ? 'history' : 'templates')
const activeRecordListTitle = computed(() => props.snapshot.activeMqttRecordList === 'history' ? '历史' : '收藏')
const activeRecordListSearch = computed(() => props.snapshot.activeMqttRecordList === 'history' ? props.snapshot.mqttHistorySearch : props.snapshot.mqttTemplateSearch)
const activeRecordListRows = computed(() => props.snapshot.activeMqttRecordList === 'history' ? props.snapshot.mqttPublishHistoryRows : props.snapshot.mqttPublishTemplateRows)
const activeRecordListState = computed(() => props.snapshot.activeMqttRecordList === 'history' ? props.snapshot.mqttRecordListStates.history : props.snapshot.mqttRecordListStates.templates)
const activeRecordSelectedKind = computed(() => props.snapshot.mqttSelectedRecord?.kind === 'publish-template' ? 'publish-template' : props.snapshot.mqttSelectedRecord?.kind === 'message' ? 'message' : null)
const activeSubscriptionLabel = computed(() => {
  if (!props.snapshot.mqttActiveSubscriptionTopics.length) return '全部 topic'
  if (props.snapshot.mqttActiveSubscriptionTopics.length > 1) return `${props.snapshot.mqttActiveSubscriptionTopics.length} 个订阅`
  const topic = props.snapshot.mqttActiveSubscriptionTopics[0]
  return props.snapshot.mqttSubscriptionRows.find((row) => row.topic === topic)?.displayName || topic
})
const selectedSubscriptionCount = computed(() => props.snapshot.mqttSelectedSubscriptionTopics.length)
const subscriptionQosLabel = computed(() => `QoS ${activeConfig.value?.qos ?? configForm.qos}`)
const previewRecord = computed(() => {
  const preview = props.snapshot.mqttPreview
  if (!preview.open || !preview.targetId) return null
  if (preview.targetKind === 'message') {
    return props.snapshot.mqttArchive.sessions.flatMap((session) => session.messages).find((item) => item.id === preview.targetId) || null
  }
  if (preview.targetKind === 'publish-template') {
    return props.snapshot.mqttArchive.publishTemplates.find((item) => item.id === preview.targetId) || null
  }
  return null
})
const detailTarget = computed(() => {
  const drawer = props.snapshot.mqttDrawer
  if (!drawer.open || drawer.active) return null
  if (drawer.targetKind && drawer.targetId) return { kind: drawer.targetKind, id: drawer.targetId }
  return props.snapshot.mqttSelectedRecord
})
const detailRecord = computed(() => {
  const target = detailTarget.value
  if (!target) return null
  if (target.kind === 'message') {
    return props.snapshot.mqttArchive.sessions.flatMap((session) => session.messages).find((item) => item.id === target.id) || null
  }
  if (target.kind === 'publish-template') {
    return props.snapshot.mqttArchive.publishTemplates.find((item) => item.id === target.id) || null
  }
  return null
})
const detailConfig = computed(() => {
  const target = detailTarget.value
  if (!target) return null
  if (target.kind === 'config') return props.snapshot.state.mqtt.configs.find((item) => item.id === target.id) || null
  return activeConfig.value
})
const detailLog = computed(() => {
  const target = detailTarget.value
  if (target?.kind !== 'log') return null
  return props.snapshot.mqttLogs.find((item) => item.id === target.id) || selectedLog.value
})
const detailPayloadSegments = computed(() => detailRecord.value ? buildMqttPayloadPreviewSegments(detailRecord.value.payload) : [])
const detailTitle = computed(() => {
  if (detailLog.value) return '日志详情'
  if (detailRecord.value && 'direction' in detailRecord.value) return `${directionLabel(detailRecord.value)} ${detailRecord.value.topic || '(empty topic)'}`
  if (detailRecord.value) return detailRecord.value.title || detailRecord.value.topic
  if (detailConfig.value) return detailConfig.value.name
  return 'MQTT 详情'
})
const detailSubtitle = computed(() => {
  if (detailLog.value) return logConfigName(detailLog.value)
  if (detailRecord.value && 'direction' in detailRecord.value) return formatDateTime(detailRecord.value.timestamp)
  if (detailRecord.value) return formatDateTime(detailRecord.value.updatedAt)
  if (detailConfig.value) return detailConfig.value.url || '未配置地址'
  return '当前上下文'
})
const previewPayloadSegments = computed(() => previewRecord.value ? buildMqttPayloadPreviewSegments(previewRecord.value.payload) : [])
const previewDirectionIcon = computed(() => previewRecord.value ? iconComponent(directionIconName(previewRecord.value)) : Hash)
const previewPosition = reactive({
  left: 16,
  top: 16,
  width: 420,
  maxHeight: 360
})
const resizePreviewRatio = ref<{ layout: 'stack' | 'split'; ratio: number } | null>(null)
const previewPositionStyle = computed(() => ({
  '--mqtt-preview-left': `${previewPosition.left}px`,
  '--mqtt-preview-top': `${previewPosition.top}px`,
  '--mqtt-preview-width': `${previewPosition.width}px`,
  '--mqtt-preview-max-height': `${previewPosition.maxHeight}px`
}))
const workspaceLayoutStyle = computed(() => {
  const prefs = props.snapshot.mqttLayoutPrefs
  const stackRatio = resizePreviewRatio.value?.layout === 'stack' ? resizePreviewRatio.value.ratio : prefs.stackReceiveRatio
  const splitRatio = resizePreviewRatio.value?.layout === 'split' ? resizePreviewRatio.value.ratio : prefs.splitReceiveRatio
  return {
    '--mqtt-stack-receive-ratio': String(stackRatio),
    '--mqtt-split-receive-ratio': String(splitRatio)
  } as CSSProperties
})
function syncConfigSubscriptionItems(items: MqttConfigDraft['subscriptionItems']) {
  updateConfigDraft({
    subscriptionItems: items.map((item) => ({ topic: item.topic, alias: item.alias })),
    subscriptionsText: items.map((item) => item.topic).join('\n')
  })
}

function focusConfigSubscriptionTopic(index: number) {
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-mqtt-config-subscription-index="${index}"][data-mqtt-config-subscription-field="topic"]`)
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  })
}

function addConfigSubscriptionItem() {
  const nextIndex = configForm.subscriptionItems.length
  syncConfigSubscriptionItems([...configForm.subscriptionItems, { topic: '', alias: '' }])
  focusConfigSubscriptionTopic(nextIndex)
}

function updateConfigSubscriptionItem(index: number, input: Partial<MqttConfigDraft['subscriptionItems'][number]>) {
  syncConfigSubscriptionItems(configForm.subscriptionItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...input } : item))
}

function removeConfigSubscriptionItem(index: number) {
  syncConfigSubscriptionItems(configForm.subscriptionItems.filter((_, itemIndex) => itemIndex !== index))
}

function commandLabel(commandId: string, fallback: string) {
  return props.snapshot.commandShortcutLabels[commandId] || fallback
}

function ctrlCommandLabel(commandId: string) {
  if (!props.showShortcutHints) return ''
  return (props.snapshot.commandShortcutLabels[commandId] || '')
    .split(' / ')
    .filter((label) => label.startsWith('c-'))
    .join(' / ')
}

function commandTitle(label: string, commandId: string, fallback = '') {
  const shortcut = props.snapshot.commandShortcutLabels[commandId] || fallback
  return shortcut ? `${label} (${shortcut})` : label
}

function visibleCommandHint(commandId: string) {
  return ctrlCommandLabel(commandId)
}

function shortcutHintAttr(commandId: string) {
  return visibleCommandHint(commandId) || undefined
}

function clearShortcutHintFrame() {
  if (shortcutHintFrame !== null) window.cancelAnimationFrame(shortcutHintFrame)
  shortcutHintFrame = null
}

function scheduleShortcutHintPositionUpdate() {
  if (typeof window === 'undefined') return
  clearShortcutHintFrame()
  shortcutHintFrame = window.requestAnimationFrame(updateShortcutHintPositions)
}

function updateShortcutHintPositions() {
  shortcutHintFrame = null
  if (!props.showShortcutHints || !workbenchRef.value) {
    shortcutHintEntries.value = []
    return
  }

  const anchors = Array.from(workbenchRef.value.querySelectorAll<HTMLElement>('[data-mqtt-shortcut-hint]')).flatMap<ShortcutHintAnchor>((anchor, index) => {
    const label = anchor.dataset.mqttShortcutHint?.trim()
    const rect = anchor.getBoundingClientRect()
    if (!label || rect.width <= 0 || rect.height <= 0 || !isVisibleShortcutHintAnchor(anchor)) return []
    return {
      id: `${index}:${label}:${Math.round(rect.left)}:${Math.round(rect.top)}`,
      label,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
  })
  shortcutHintEntries.value = layoutShortcutHints(anchors, {
    width: window.innerWidth || 760,
    height: window.innerHeight || 560
  }).map((entry) => ({
    id: entry.id,
    label: entry.label,
    placement: entry.placement,
    style: {
      '--mqtt-shortcut-left': `${entry.left}px`,
      '--mqtt-shortcut-top': `${entry.top}px`
    } as CSSProperties
  }))
}

function isVisibleShortcutHintAnchor(anchor: HTMLElement) {
  let current: HTMLElement | null = anchor
  while (current && current !== workbenchRef.value) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') <= 0.05) return false
    current = current.parentElement
  }
  return true
}

const mqttIconComponents: Record<string, Component> = {
  add: Plus,
  connect: Plug,
  disconnect: Unplug,
  edit: Pencil,
  log: Logs,
  'clear-selected': BadgeX,
  'clear-all': Eraser,
  collapse: ChevronsLeft,
  delete: Trash2,
  trash: Trash2,
  close: X,
  all: ArrowLeftRight,
  in: ArrowLeft,
  out: ArrowRight,
  layout: LayoutPanelTop,
  star: Star,
  'copy-topic': Clipboard,
  'copy-payload': Copy,
  apply: CornerDownLeft,
  send: Send,
  more: MoreHorizontal,
  history: History,
  save: Save,
  detail: Info,
  plug: Plug,
  unplug: Unplug,
  copy: Copy,
  clear: Eraser,
  number: Hash
}

function iconComponent(name: string): Component {
  return mqttIconComponents[name] || Hash
}

const MqttIcon = defineComponent({
  props: {
    name: { type: String, required: true }
  },
  setup(iconProps) {
    return () => h(iconComponent(iconProps.name), { class: 'mqtt-icon', 'aria-hidden': 'true' })
  }
})

function commandArgs(kind: 'message' | 'publish-template', id: string, list?: 'messages' | 'templates' | 'history'): Record<string, unknown> {
  return { kind, id, targetKind: kind, targetId: id, ...(list ? { list } : {}) }
}

function updateConfigDraft(input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>) {
  emit('updateConfigDraft', input)
}

function qosFromInput(value: string): MqttQos {
  return value === '1' ? 1 : value === '2' ? 2 : 0
}

function createSubscriptionEditorItem(): MqttSubscriptionEditorItem {
  return {
    id: `mqtt-subscription-ui:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
    topic: '',
    alias: ''
  }
}

function updateSubscriptionDraft(input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>) {
  emit('updateSubscriptionDraft', input)
}

function addSubscriptionEditorItem() {
  if (!subscriptionDraft.value) return
  const item = createSubscriptionEditorItem()
  updateSubscriptionDraft({ items: [...subscriptionDraft.value.items, item], activeItemId: item.id, activeField: 'topic' })
}

function updateSubscriptionEditorItem(id: string, input: Partial<Pick<MqttSubscriptionEditorItem, 'topic' | 'alias'>>) {
  if (!subscriptionDraft.value) return
  updateSubscriptionDraft({
    items: subscriptionDraft.value.items.map((item) => item.id === id ? { ...item, ...input } : item)
  })
}

function removeSubscriptionEditorItem(id: string) {
  if (!subscriptionDraft.value) return
  updateSubscriptionDraft({
    items: subscriptionDraft.value.items.filter((item) => item.id !== id)
  })
}

function focusSubscriptionEditorField(itemId: string, field: MqttSubscriptionEditorField) {
  if (subscriptionDraft.value?.activeItemId === itemId && subscriptionDraft.value.activeField === field) return
  updateSubscriptionDraft({ activeItemId: itemId, activeField: field })
}

function handleSubscriptionEditorKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (command && (key === 's' || key === 'enter')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.subscription.editor.save')
    return
  }
  if (key === 'escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.subscription.editor.cancel')
    return
  }
  if (key === 'tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', event.shiftKey ? 'mqtt.subscription.editor.prevField' : 'mqtt.subscription.editor.nextField')
    return
  }
  event.stopPropagation()
}

function handleFavoriteEditorKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (command && (key === 's' || key === 'enter')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.record.favorite.save')
    return
  }
  if (key === 'escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.record.favorite.cancel')
    return
  }
  if (key === 'tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', event.shiftKey ? 'mqtt.record.favorite.prevField' : 'mqtt.record.favorite.nextField')
    return
  }
  event.stopPropagation()
}

function updateRecordEditDraft(input: Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>) {
  emit('updateRecordEditDraft', input)
}

function handleRecordEditorKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (command && (key === 's' || key === 'enter')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.record.edit.save')
    return
  }
  if (key === 'escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.record.edit.cancel')
    return
  }
  if (key === 'tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', event.shiftKey ? 'mqtt.record.edit.prevField' : 'mqtt.record.edit.nextField')
    return
  }
  event.stopPropagation()
}

function handleConfigEditorKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (command && (key === 's' || key === 'enter')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.config.save')
    return
  }
  if (key === 'escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.config.cancel')
    return
  }
  if (key === 'tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', event.shiftKey ? 'mqtt.config.prevField' : 'mqtt.config.nextField')
    return
  }
  event.stopPropagation()
}

function statusLabel(state: AppRuntimeSnapshot['mqttConnectionStatus']['state']) {
  const labels: Record<AppRuntimeSnapshot['mqttConnectionStatus']['state'], string> = {
    idle: 'idle',
    connecting: 'connecting',
    connected: 'connected',
    reconnecting: 'reconnecting',
    disconnected: 'disconnected',
    error: 'error'
  }
  return labels[state]
}

function selectRecord(kind: 'config' | 'session' | 'message' | 'log', id: string, list: 'messages' | 'history' = 'messages') {
  if (kind === 'config') emit('focusConfig', id)
  if (kind === 'session') emit('focusSession', id)
  if (kind === 'message') emit('dispatch', 'mqtt.record.focus', commandArgs('message', id, list))
  if (kind === 'log') emit('focusLog', id)
}

function recordSelected(kind: 'config' | 'session' | 'message' | 'log' | 'publish-template', id: string) {
  return props.snapshot.mqttSelectedRecord?.kind === kind && props.snapshot.mqttSelectedRecord.id === id
}

function focusConfigAndDispatch(configId: string, actionId: string) {
  emit('focusConfig', configId)
  emit('dispatch', actionId)
}

function selectLog(id: string) {
  selectRecord('log', id)
}

function openLog(id?: string) {
  if (id) selectLog(id)
  emit('dispatch', 'mqtt.log.drawer.open')
}

function selectMessageAndDispatch(message: MqttMessageRecord, actionId: string, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', actionId, commandArgs('message', message.id, list))
}

function applyMessage(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectMessageAndDispatch(message, 'mqtt.record.resendDraft', list)
}

function sendMessageAgain(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', 'mqtt.publish.send', commandArgs('message', message.id, list))
}

function previewMessage(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  updatePreviewPosition(findPreviewTarget('message', message.id))
  emit('dispatch', 'mqtt.preview.open', { ...commandArgs('message', message.id, list), source: 'keyboard' })
}

function favoriteMessage(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', 'mqtt.record.favorite', commandArgs('message', message.id, list))
}

function copyMessageTopic(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', 'mqtt.record.copyTopic', commandArgs('message', message.id, list))
}

function copyMessagePayload(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', 'mqtt.record.copyPayload', commandArgs('message', message.id, list))
}

function openMessageDetail(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', 'mqtt.detail.open', commandArgs('message', message.id, list))
}

function openMessageMenu(message: MqttMessageRecord, list: 'messages' | 'history' = 'messages') {
  selectRecord('message', message.id, list)
  emit('dispatch', 'mqtt.drawer.open', commandArgs('message', message.id, list))
}

function applyTemplate(template: MqttPublishTemplate) {
  selectTemplate(template)
  emit('dispatch', 'mqtt.publish.template.apply', commandArgs('publish-template', template.id, 'templates'))
}

function sendTemplate(template: MqttPublishTemplate) {
  selectTemplate(template)
  emit('dispatch', 'mqtt.publish.template.send', commandArgs('publish-template', template.id, 'templates'))
}

function selectTemplate(template: MqttPublishTemplate) {
  emit('dispatch', 'mqtt.record.focus', commandArgs('publish-template', template.id, 'templates'))
}

function previewTemplate(template: MqttPublishTemplate) {
  selectTemplate(template)
  updatePreviewPosition(findPreviewTarget('publish-template', template.id))
  emit('dispatch', 'mqtt.preview.open', { ...commandArgs('publish-template', template.id, 'templates'), source: 'keyboard' })
}

function renameTemplate(template: MqttPublishTemplate, title: string) {
  emit('dispatch', 'mqtt.publish.template.rename', { id: template.id, title })
}

function deleteTemplate(template: MqttPublishTemplate) {
  selectTemplate(template)
  emit('dispatch', 'mqtt.publish.template.delete', commandArgs('publish-template', template.id, 'templates'))
}

function favoriteTemplate(template: MqttPublishTemplate) {
  selectTemplate(template)
  emit('dispatch', 'mqtt.record.favorite', commandArgs('publish-template', template.id, 'templates'))
}

function openTemplateDetail(template: MqttPublishTemplate) {
  selectTemplate(template)
  emit('dispatch', 'mqtt.detail.open', commandArgs('publish-template', template.id, 'templates'))
}

function openTemplateMenu(template: MqttPublishTemplate) {
  selectTemplate(template)
  emit('dispatch', 'mqtt.drawer.open', commandArgs('publish-template', template.id, 'templates'))
}

type PublishRecordRow = MqttMessageRecord | MqttPublishTemplate

function isPublishTemplate(row: PublishRecordRow): row is MqttPublishTemplate {
  return !('direction' in row)
}

function publishRecordArgs(row: PublishRecordRow, list: 'templates' | 'history') {
  return isPublishTemplate(row)
    ? commandArgs('publish-template', row.id, 'templates')
    : commandArgs('message', row.id, list)
}

function focusPublishRecord(row: PublishRecordRow, list: 'templates' | 'history') {
  if (isPublishTemplate(row)) selectTemplate(row)
  else selectRecord('message', row.id, 'history')
}

function togglePublishRecord(row: PublishRecordRow, list: 'templates' | 'history', range: boolean) {
  emit('dispatch', 'mqtt.record.toggleSelect', { ...publishRecordArgs(row, list), list, range })
}

function searchPublishRecords(list: 'templates' | 'history', query: string) {
  emit('dispatch', list === 'templates' ? 'mqtt.template.search.set' : 'mqtt.history.search.set', { query })
}

function applyPublishRecord(row: PublishRecordRow, list: 'templates' | 'history') {
  if (isPublishTemplate(row)) applyTemplate(row)
  else applyMessage(row, 'history')
}

function repeatPublishRecord(row: PublishRecordRow | undefined, list: 'templates' | 'history') {
  emit('dispatch', 'mqtt.record.repeatSend', row ? publishRecordArgs(row, list) : { list })
}

function deletePublishRecords(list: 'templates' | 'history') {
  emit('dispatch', 'mqtt.record.delete', { list })
}

function favoritePublishRecord(row: PublishRecordRow, list: 'templates' | 'history') {
  if (isPublishTemplate(row)) favoriteTemplate(row)
  else favoriteMessage(row, 'history')
}

function previewPublishRecord(row: PublishRecordRow, list: 'templates' | 'history', event?: MouseEvent) {
  if (isPublishTemplate(row)) {
    if (event) {
      schedulePreview('publish-template', row.id, event)
      return
    }
    selectTemplate(row)
    updatePreviewPosition(findPreviewTarget('publish-template', row.id))
    emit('dispatch', 'mqtt.preview.open', { ...commandArgs('publish-template', row.id, 'templates'), source: 'keyboard' })
    return
  }
  if (event) {
    schedulePreview('message', row.id, event)
    return
  }
  selectRecord('message', row.id, 'history')
  updatePreviewPosition(findPreviewTarget('message', row.id))
  emit('dispatch', 'mqtt.preview.open', { ...commandArgs('message', row.id, 'history'), source: 'keyboard' })
}

function detailPublishRecord(row: PublishRecordRow, list: 'templates' | 'history') {
  if (isPublishTemplate(row)) openTemplateDetail(row)
  else openMessageDetail(row, 'history')
}

function menuPublishRecord(row: PublishRecordRow, list: 'templates' | 'history') {
  if (isPublishTemplate(row)) openTemplateMenu(row)
  else openMessageMenu(row, 'history')
}

function renamePublishTemplate(row: MqttPublishTemplate, title: string) {
  renameTemplate(row, title)
}

function messageTitle(message: MqttMessageRecord) {
  return message.title || `${message.direction === 'incoming' ? 'IN' : message.direction === 'outgoing' ? 'OUT' : 'EVENT'} ${message.topic || '(empty topic)'}`
}

function messageAlias(message: MqttMessageRecord) {
  return message.title?.trim() || ''
}

function payloadSnippet(payload: string) {
  return payload.replace(/\s+/g, ' ').trim() || '(empty payload)'
}

function payloadSnippetSegments(payload: string) {
  return buildMqttInlinePayloadPreviewSegments(payload)
}

function templateTopicSummary(template: MqttPublishTemplate) {
  return template.title.trim() === template.topic.trim() ? '' : template.topic
}

function directionLabel(message: MqttMessageRecord | MqttPublishTemplate) {
  if ('direction' in message) {
    if (message.direction === 'incoming') return 'IN'
    if (message.direction === 'outgoing') return 'OUT'
    return 'EVENT'
  }
  return 'TPL'
}

function directionIconName(message: MqttMessageRecord | MqttPublishTemplate) {
  if ('direction' in message) {
    if (message.direction === 'incoming') return 'in'
    if (message.direction === 'outgoing') return 'out'
  }
  return 'all'
}

function recordTime(record: MqttMessageRecord | MqttPublishTemplate) {
  return 'timestamp' in record ? record.timestamp : record.updatedAt
}

function logConfigName(log: AppRuntimeSnapshot['mqttLogs'][number]) {
  return props.snapshot.state.mqtt.configs.find((config) => config.id === log.connectionId)?.name || '未关联连接'
}

function formatTime(value: number) {
  return value ? new Date(value).toLocaleTimeString() : ''
}

function formatDateTime(value: number) {
  return value ? new Date(value).toLocaleString() : ''
}

function updateProtocol(value: 'ws' | 'wss') {
  updateConfigDraft({ protocol: value, ssl: value === 'wss' })
}

function updateSsl(value: boolean) {
  updateConfigDraft({ ssl: value, protocol: value ? 'wss' : 'ws' })
}

function subscriptionTitle(row: AppRuntimeSnapshot['mqttSubscriptionRows'][number]) {
  return row.alias ? `${row.alias} · ${row.topic}` : row.topic
}

function selectSubscription(topic: string) {
  emit('dispatch', 'mqtt.subscription.select', { topic })
}

function focusSubscription(topic: string) {
  emit('dispatch', 'mqtt.subscription.focus', { topic })
}

function deleteSubscription(topic: string) {
  focusSubscription(topic)
  emit('dispatch', 'mqtt.subscription.delete', { topic })
}

let previewTimer: number | null = null
let previewCloseTimer: number | null = null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampLayoutRatio(value: number) {
  return clamp(value, 0.28, 0.72)
}

function maxPreviewPayloadScroll() {
  const element = previewPayloadRef.value
  return element ? Math.max(0, element.scrollHeight - element.clientHeight) : 0
}

function clampPreviewPayloadScroll(value: number) {
  return clamp(Number.isFinite(value) ? value : 0, 0, maxPreviewPayloadScroll())
}

function applyPreviewPayloadScroll() {
  const element = previewPayloadRef.value
  if (!element || !props.snapshot.mqttPreview.open) return
  const scrollTop = clampPreviewPayloadScroll(props.snapshot.mqttPreview.scrollTop)
  if (Math.abs(element.scrollTop - scrollTop) > 0.5) element.scrollTop = scrollTop
  if (Math.abs(props.snapshot.mqttPreview.scrollTop - scrollTop) > 0.5) {
    emit('dispatch', 'mqtt.preview.scroll.set', { scrollTop })
  }
}

function syncPreviewScroll() {
  const element = previewPayloadRef.value
  if (!element || !props.snapshot.mqttPreview.open) return
  const scrollTop = clampPreviewPayloadScroll(element.scrollTop)
  if (Math.abs(props.snapshot.mqttPreview.scrollTop - scrollTop) > 0.5) {
    emit('dispatch', 'mqtt.preview.scroll.set', { scrollTop })
  }
}

function previewTargetValue(kind: 'message' | 'publish-template', id: string) {
  return `${kind}:${id}`
}

function findPreviewTarget(kind: 'message' | 'publish-template' | null, id: string | null): HTMLElement | null {
  if (!kind || !id) return null
  const target = previewTargetValue(kind, id)
  return Array.from(document.querySelectorAll<HTMLElement>('[data-mqtt-preview-target]'))
    .find((element) => element.dataset.mqttPreviewTarget === target) || null
}

function updatePreviewPosition(anchor?: HTMLElement | null) {
  if (typeof window === 'undefined') return
  const margin = 8
  const gap = 10
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720
  const width = Math.min(420, Math.max(160, viewportWidth - margin * 2))
  const maxHeight = Math.min(360, Math.max(160, viewportHeight - margin * 2))
  const fallback = document.querySelector<HTMLElement>('.mqtt-message-workspace')
  const rect = (anchor || fallback)?.getBoundingClientRect()
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  let left = rect ? rect.right + gap : maxLeft
  if (left + width > viewportWidth - margin && rect) left = rect.left - width - gap
  if (left < margin && rect) left = rect.left
  const top = rect ? rect.top : margin
  previewPosition.width = width
  previewPosition.maxHeight = maxHeight
  previewPosition.left = clamp(left, margin, maxLeft)
  previewPosition.top = clamp(top, margin, Math.max(margin, viewportHeight - maxHeight - margin))
}

function clearPreviewTimer() {
  if (previewTimer !== null) window.clearTimeout(previewTimer)
  previewTimer = null
}

function clearPreviewCloseTimer() {
  if (previewCloseTimer !== null) window.clearTimeout(previewCloseTimer)
  previewCloseTimer = null
}

function schedulePreview(kind: 'message' | 'publish-template', id: string, event?: MouseEvent) {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  if (props.snapshot.mqttConfigDraft || props.snapshot.mqttSubscriptionDraft || props.snapshot.mqttFavoriteDraft) return
  if (!props.snapshot.toolPreviewPrefs.hoverPreviewEnabled) return
  const anchor = event?.currentTarget instanceof HTMLElement ? event.currentTarget : findPreviewTarget(kind, id)
  previewTimer = window.setTimeout(() => {
    updatePreviewPosition(anchor)
    emit('dispatch', 'mqtt.preview.open', { ...commandArgs(kind, id), source: 'hover' })
  }, props.snapshot.toolPreviewPrefs.hoverPreviewDelayMs)
}

function keepHoverPreview() {
  clearPreviewCloseTimer()
}

function closeHoverPreview() {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  previewCloseTimer = window.setTimeout(() => {
    if (props.snapshot.mqttPreview.source === 'hover') emit('dispatch', 'mqtt.preview.close')
  }, 120)
}

function selectedPreviewTarget() {
  const selected = props.snapshot.mqttSelectedRecord
  if (!selected || (selected.kind !== 'message' && selected.kind !== 'publish-template')) return null
  return selected
}

watch(() => [
  props.shiftPreview ? '1' : '0',
  props.snapshot.mqttSelectedRecord?.kind || '',
  props.snapshot.mqttSelectedRecord?.id || ''
].join(':'), () => {
  const target = selectedPreviewTarget()
  if (!props.shiftPreview || !target) {
    if (props.snapshot.mqttPreview.source === 'shift') emit('dispatch', 'mqtt.preview.close')
    return
  }
  if (props.snapshot.mqttConfigDraft || props.snapshot.mqttSubscriptionDraft || props.snapshot.mqttFavoriteDraft) return
  if (
    props.snapshot.mqttPreview.open &&
    props.snapshot.mqttPreview.source !== 'shift' &&
    props.snapshot.mqttPreview.targetKind === target.kind &&
    props.snapshot.mqttPreview.targetId === target.id
  ) {
    updatePreviewPosition(findPreviewTarget(target.kind, target.id))
    return
  }
  void nextTick(() => {
    updatePreviewPosition(findPreviewTarget(target.kind, target.id))
    emit('dispatch', 'mqtt.preview.open', { ...commandArgs(target.kind, target.id), source: 'shift' })
  })
})

watch(() => [
  props.snapshot.mqttSelectedRecord?.kind || '',
  props.snapshot.mqttSelectedRecord?.id || '',
  props.snapshot.activeMqttRecordList
].join(':'), () => {
  void nextTick(() => {
    const target = selectedPreviewTarget()
    if (!target) return
    findPreviewTarget(target.kind, target.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})

function resizeMqttLayout(event: PointerEvent) {
  const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const body = handle?.closest<HTMLElement>('.mqtt-workspace-body')
  if (!body) return
  const layout = props.snapshot.mqttWorkspaceLayout
  const rect = body.getBoundingClientRect()
  const updateRatio = (clientX: number, clientY: number) => {
    const raw = layout === 'split'
      ? (clientX - rect.left) / Math.max(1, rect.width)
      : (clientY - rect.top) / Math.max(1, rect.height)
    resizePreviewRatio.value = { layout, ratio: clampLayoutRatio(raw) }
  }
  updateRatio(event.clientX, event.clientY)
  const onMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault()
    updateRatio(moveEvent.clientX, moveEvent.clientY)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    const ratio = resizePreviewRatio.value?.ratio
    resizePreviewRatio.value = null
    if (typeof ratio === 'number') emit('dispatch', 'mqtt.layout.resize', { layout, receiveRatio: ratio })
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

function resetMqttLayout() {
  emit('dispatch', 'mqtt.layout.reset', { layout: props.snapshot.mqttWorkspaceLayout })
}

watch(() => [
  props.snapshot.mqttPreview.open,
  props.snapshot.mqttPreview.targetKind,
  props.snapshot.mqttPreview.targetId
].join(':'), () => {
  if (!props.snapshot.mqttPreview.open) return
  void nextTick(() => {
    updatePreviewPosition(findPreviewTarget(props.snapshot.mqttPreview.targetKind, props.snapshot.mqttPreview.targetId))
    applyPreviewPayloadScroll()
  })
})

watch(() => [
  props.snapshot.mqttPreview.open,
  props.snapshot.mqttPreview.targetKind,
  props.snapshot.mqttPreview.targetId,
  props.snapshot.mqttPreview.scrollTop,
  previewRecord.value?.payload.length || 0
].join(':'), () => {
  if (!props.snapshot.mqttPreview.open) return
  void nextTick(() => {
    applyPreviewPayloadScroll()
  })
})

watch(() => [
  props.showShortcutHints,
  props.snapshot.mqttPanelOpen,
  props.snapshot.mqttSubscriptionPanelOpen,
  props.snapshot.mqttPublishRecordsOpen,
  props.snapshot.mqttWorkspaceLayout,
  props.snapshot.mqttLayoutPrefs.stackReceiveRatio,
  props.snapshot.mqttLayoutPrefs.splitReceiveRatio,
  props.snapshot.mqttReceiveFilter,
  props.snapshot.mqttTemplateSearch,
  props.snapshot.activeMqttRecordList,
  props.snapshot.mqttMessageRows.length,
  props.snapshot.mqttPublishTemplateRows.length,
  props.snapshot.mqttPublishHistoryRows.length,
  props.snapshot.mqttSelectedSubscriptionTopics.length,
  Boolean(props.snapshot.mqttConfigDraft),
  Boolean(props.snapshot.mqttSubscriptionDraft),
  Boolean(props.snapshot.mqttFavoriteDraft),
  Object.entries(props.snapshot.commandShortcutLabels).map(([id, label]) => `${id}:${label}`).join('|')
].join('|'), () => {
  if (!props.showShortcutHints) {
    shortcutHintEntries.value = []
    clearShortcutHintFrame()
    return
  }
  void nextTick(scheduleShortcutHintPositionUpdate)
}, { immediate: true })

function handlePreviewViewportChange() {
  if (!props.snapshot.mqttPreview.open) return
  updatePreviewPosition(findPreviewTarget(props.snapshot.mqttPreview.targetKind, props.snapshot.mqttPreview.targetId))
}

function handleShortcutHintViewportChange() {
  if (!props.showShortcutHints) return
  scheduleShortcutHintPositionUpdate()
}

function handleShortcutHintPointerChange() {
  if (!props.showShortcutHints) return
  scheduleShortcutHintPositionUpdate()
}

onMounted(() => {
  window.addEventListener('resize', handlePreviewViewportChange)
  window.addEventListener('scroll', handlePreviewViewportChange, true)
  window.addEventListener('resize', handleShortcutHintViewportChange)
  window.addEventListener('scroll', handleShortcutHintViewportChange, true)
})

onUnmounted(() => {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  clearShortcutHintFrame()
  window.removeEventListener('resize', handlePreviewViewportChange)
  window.removeEventListener('scroll', handlePreviewViewportChange, true)
  window.removeEventListener('resize', handleShortcutHintViewportChange)
  window.removeEventListener('scroll', handleShortcutHintViewportChange, true)
})
</script>

<template>
  <section
    ref="workbenchRef"
    class="mqtt-workbench-grid"
    @pointermove="handleShortcutHintPointerChange"
    @focusin="handleShortcutHintPointerChange"
    :class="{
      'mqtt-connections-collapsed': !props.snapshot.mqttPanelOpen,
      'mqtt-subscriptions-collapsed': !props.snapshot.mqttSubscriptionPanelOpen,
      'mqtt-workspace-split': props.snapshot.mqttWorkspaceLayout === 'split'
    }"
  >
    <button
      v-if="!props.snapshot.mqttPanelOpen"
      type="button"
      class="mqtt-panel-toggle mqtt-rail-trigger mqtt-rail-trigger-left"
      :title="`展开连接栏 ${commandLabel('mqtt.panel.toggle', 'c-s-w')}`"
      @click="emit('dispatch', 'mqtt.panel.toggle')"
    >
      <span class="group-panel-toggle-icon" aria-hidden="true"></span>
    </button>

    <aside v-if="props.snapshot.mqttPanelOpen" class="mqtt-connection-rail">
      <div class="mqtt-rail-head">
        <button
          type="button"
          class="mqtt-panel-toggle group-panel-toggle group-panel-toggle-inline"
          :title="`收起连接栏 ${commandLabel('mqtt.panel.toggle', 'c-s-w')}`"
          @click="emit('dispatch', 'mqtt.panel.toggle')"
        >
          <span class="group-panel-toggle-icon" aria-hidden="true"></span>
        </button>
        <SearchSuggestBox
          :model-value="props.snapshot.mqttSearch"
          role="mqtt-search"
          placeholder="搜索连接、日志、消息"
          :shortcut-hint="ctrlCommandLabel('mqtt.search.focus')"
          @focus="emit('dispatch', 'mqtt.search.focus')"
          @update:model-value="emit('search', $event)"
        />
        <button type="button" class="mqtt-icon-button add-folder-button" :title="commandTitle('新建连接', 'mqtt.config.create', 'c-n')" aria-label="新建连接" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.config.create')" @click="emit('dispatch', 'mqtt.config.create')">
          <MqttIcon name="add" />
        </button>
      </div>

      <div class="mqtt-config-list">
        <article
          v-for="config in props.snapshot.state.mqtt.configs"
          :key="config.id"
          class="mqtt-config-card"
          :class="{ active: activeConfig?.id === config.id, focused: recordSelected('config', config.id) }"
          @click="selectRecord('config', config.id)"
        >
          <header>
            <span>
              <strong>{{ config.name }}</strong>
              <small>{{ config.url || '未配置服务器地址' }}</small>
            </span>
            <em>{{ config.autoReconnect ? `重连 ${config.reconnectPeriodMs}ms` : '手动重连' }}</em>
          </header>
          <div class="mqtt-config-actions">
            <button type="button" class="mqtt-icon-button" :title="commandTitle('连接', 'mqtt.connection.connect', 'c-r')" aria-label="连接" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connection.connect')" @click.stop="focusConfigAndDispatch(config.id, 'mqtt.connection.connect')">
              <MqttIcon name="connect" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('断开', 'mqtt.connection.disconnect', 'c-s-r')" aria-label="断开" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connection.disconnect')" @click.stop="focusConfigAndDispatch(config.id, 'mqtt.connection.disconnect')">
              <MqttIcon name="disconnect" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('配置', 'mqtt.config.edit', 'f2')" aria-label="配置" @click.stop="focusConfigAndDispatch(config.id, 'mqtt.config.edit')">
              <MqttIcon name="edit" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('日志', 'mqtt.log.drawer.open', 'c-l')" aria-label="日志" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.log.drawer.open')" @click.stop="emit('focusConfig', config.id); openLog()">
              <MqttIcon name="log" />
            </button>
          </div>
        </article>
        <p v-if="!props.snapshot.state.mqtt.configs.length" class="empty-note">暂无 MQTT 连接配置</p>
      </div>
    </aside>

    <button
      v-if="!props.snapshot.mqttSubscriptionPanelOpen"
      type="button"
      class="mqtt-panel-toggle mqtt-rail-trigger mqtt-rail-trigger-subscription"
      :title="`展开订阅栏 ${commandLabel('mqtt.subscription.panel.toggle', 'c-s-t')}`"
      aria-label="展开订阅栏"
      @click="emit('dispatch', 'mqtt.subscription.panel.toggle')"
    >
      <span class="mqtt-collapsed-logo mqtt-collapsed-logo-subscription" aria-hidden="true">
        <MqttIcon name="collapse" />
      </span>
    </button>

    <aside v-if="props.snapshot.mqttSubscriptionPanelOpen" class="mqtt-subscription-rail">
      <header class="mqtt-rail-title">
        <span class="mqtt-subscription-title-line">
          <strong>订阅</strong>
          <small>{{ activeConfig?.name || '未选择连接' }}</small>
          <b>{{ subscriptionQosLabel }}</b>
        </span>
        <span class="mqtt-rail-actions">
          <button type="button" class="mqtt-icon-button mqtt-subscription-add" :title="commandTitle('新增订阅', 'mqtt.subscription.add', 'c-t')" aria-label="新增订阅" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.subscription.add')" @click="emit('dispatch', 'mqtt.subscription.add')">
            <MqttIcon name="add" />
          </button>
          <button v-if="selectedSubscriptionCount" type="button" class="mqtt-icon-button" :title="commandTitle('清理选中', 'mqtt.subscription.deleteSelected', 'c-del')" aria-label="清理选中订阅" @click="emit('dispatch', 'mqtt.subscription.deleteSelected')">
            <MqttIcon name="clear-selected" />
          </button>
          <button v-if="activeConfig?.subscriptions.length" type="button" class="mqtt-icon-button" title="清空全部订阅" aria-label="清空全部订阅" @click="emit('dispatch', 'mqtt.subscription.clearAll')">
            <MqttIcon name="clear-all" />
          </button>
          <button type="button" class="mqtt-icon-button" :title="commandTitle('收起订阅栏', 'mqtt.subscription.panel.toggle', 'c-s-t')" aria-label="收起订阅栏" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.subscription.panel.toggle')" @click="emit('dispatch', 'mqtt.subscription.panel.toggle')">
            <MqttIcon name="collapse" />
          </button>
        </span>
      </header>

      <div
        class="mqtt-subscription-list"
        data-role="mqtt-subscriptions"
        tabindex="0"
        @click="emit('dispatch', 'mqtt.subscription.select', { topic: '' })"
        @keydown.space.prevent.stop="emit('dispatch', 'mqtt.subscription.toggleSelect')"
        @keydown.enter.prevent.stop="emit('dispatch', 'mqtt.subscription.applyFilter')"
        @keydown.delete.prevent.stop="emit('dispatch', 'mqtt.subscription.delete')"
        @keydown.backspace.prevent.stop="emit('dispatch', 'mqtt.subscription.delete')"
      >
        <article
          v-for="row in props.snapshot.mqttSubscriptionRows"
          :key="row.topic"
          class="mqtt-subscription-row"
          data-role="mqtt-subscriptions"
          tabindex="0"
          :class="{ active: row.active, selected: row.selected && !row.active, focused: row.focused }"
          :title="subscriptionTitle(row)"
          @click.stop="selectSubscription(row.topic)"
          @dblclick.stop="emit('dispatch', 'mqtt.subscription.editor.open')"
          @focus="focusSubscription(row.topic)"
        >
          <span v-if="row.unreadCount" class="mqtt-subscription-unread">{{ row.unreadCount }}</span>
          <span class="mqtt-subscription-main">
            <strong>{{ row.displayName }}</strong>
            <small class="mqtt-subscription-route">{{ row.topic }}</small>
          </span>
          <span class="mqtt-subscription-row-actions" aria-label="订阅操作">
            <button type="button" class="mqtt-icon-button mqtt-subscription-edit" title="编辑订阅" aria-label="编辑订阅" @click.stop="emit('dispatch', 'mqtt.subscription.editor.open')">
              <MqttIcon name="edit" />
            </button>
            <button type="button" class="mqtt-icon-button mqtt-subscription-delete" title="清理订阅" aria-label="清理订阅" @click.stop="deleteSubscription(row.topic)">
              <MqttIcon name="close" />
            </button>
            <span v-if="props.showShortcutHints" class="mqtt-subscription-shortcut-popover" role="tooltip">
              <small>新增 {{ commandLabel('mqtt.subscription.add', 'c-t') }}</small>
              <small>编辑 双击 / F2</small>
              <small>删除 Delete / {{ commandLabel('mqtt.subscription.deleteSelected', 'c-del') }}</small>
            </span>
          </span>
        </article>
        <p v-if="activeConfig && !props.snapshot.mqttSubscriptionRows.length" class="empty-note">暂无订阅 topic</p>
        <p v-if="!activeConfig" class="empty-note">先选择或创建连接</p>
      </div>
    </aside>

    <main class="mqtt-message-workspace" :class="{ 'mqtt-workspace-split': props.snapshot.mqttWorkspaceLayout === 'split' }">
      <header class="mqtt-workspace-toolbar mqtt-command-bar">
        <span class="mqtt-connection-summary">
          <span class="mqtt-status" :class="`mqtt-status-${props.snapshot.mqttConnectionStatus.state}`">
            {{ statusLabel(props.snapshot.mqttConnectionStatus.state) }}
          </span>
          <span class="mqtt-workspace-title">
            <strong>{{ activeConfig?.name || '未选择配置' }}</strong>
            <small>{{ props.snapshot.mqttConnectionStatus.detail }}</small>
            <small class="mqtt-topic-filter-chip">topic: {{ activeSubscriptionLabel }}</small>
          </span>
        </span>
        <span class="mqtt-filter-buttons" aria-label="收发筛选">
          <button
            v-for="item in directionFilterButtons"
            :key="item.id"
            type="button"
            class="mqtt-filter-button mqtt-icon-button"
            :class="{ active: props.snapshot.mqttReceiveFilter === item.id }"
            :title="commandTitle(item.label, item.commandId)"
            :aria-label="item.label"
            :data-mqtt-shortcut-hint="shortcutHintAttr(item.commandId)"
            @click="emit('dispatch', item.commandId)"
          >
            <component :is="iconComponent(item.icon)" class="mqtt-icon" aria-hidden="true" />
            <small class="mqtt-stat-count">{{ item.count }} 条</small>
          </button>
        </span>
        <span class="mqtt-record-mode-buttons" aria-label="记录视图">
          <button type="button" class="mqtt-filter-button mqtt-icon-button" :class="{ active: props.snapshot.activeMqttRecordList === 'templates' }" :title="commandTitle('收藏', 'mqtt.focus.templates', 'c-s-m')" aria-label="显示收藏" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.focus.templates')" @click="emit('dispatch', 'mqtt.focus.templates')">
            <MqttIcon name="star" />
          </button>
          <button type="button" class="mqtt-filter-button mqtt-icon-button" :class="{ active: props.snapshot.activeMqttRecordList === 'history' }" :title="commandTitle('历史', 'mqtt.publish.records.toggle', 'c-h')" aria-label="显示历史" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.records.toggle')" @click="emit('dispatch', 'mqtt.publish.records.toggle')">
            <MqttIcon name="history" />
          </button>
          <button type="button" class="mqtt-filter-button mqtt-icon-button" :title="commandTitle('布局', 'mqtt.layout.toggle', 'c-s-s')" aria-label="切换布局" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.layout.toggle')" @click="emit('dispatch', 'mqtt.layout.toggle')">
            <MqttIcon name="layout" />
          </button>
        </span>
      </header>

      <div
        v-if="props.snapshot.mqttConfigDraft"
        class="drawer-overlay drawer-overlay-right mqtt-config-drawer-overlay"
        role="presentation"
        data-role="mqtt-editor"
        @click="emit('dispatch', 'mqtt.config.cancel')"
        @keydown="handleConfigEditorKeydown"
      >
        <aside
          class="mqtt-config-editor mqtt-config-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="props.snapshot.mqttConfigDraft.mode === 'create' ? '新建 MQTT 连接配置' : '编辑 MQTT 连接配置'"
          data-role="mqtt-editor"
          @click.stop
        >
        <header>
          <span>
            <strong>{{ props.snapshot.mqttConfigDraft.mode === 'create' ? '新建连接配置' : props.snapshot.mqttConfigDraft.mode === 'rename' ? '重命名记录' : '编辑连接配置' }}</strong>
            <small>{{ endpointPreview || '连接地址会按字段自动组装' }}</small>
          </span>
          <span class="mqtt-editor-actions">
            <button type="button" class="mqtt-icon-button" title="取消" aria-label="取消" @click="emit('dispatch', 'mqtt.config.cancel')">
              <MqttIcon name="close" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('保存', 'mqtt.config.save', 'c-s')" aria-label="保存" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.config.save')" @click="emit('dispatch', 'mqtt.config.save')">
              <MqttIcon name="save" />
            </button>
          </span>
        </header>
        <div class="mqtt-config-grid">
          <label>
            名称
            <input data-mqtt-field="name" data-role="mqtt-editor" :value="configForm.name" @input="updateConfigDraft({ name: ($event.target as HTMLInputElement).value })" />
          </label>
          <label>
            Client ID
            <input data-mqtt-field="clientId" data-role="mqtt-editor" :value="configForm.clientId" @input="updateConfigDraft({ clientId: ($event.target as HTMLInputElement).value })" />
          </label>
          <label class="mqtt-config-wide">
            服务器地址
            <span class="mqtt-endpoint-row">
              <select data-mqtt-field="protocol" data-role="mqtt-editor" :value="configForm.protocol" @change="updateProtocol(($event.target as HTMLSelectElement).value === 'wss' ? 'wss' : 'ws')">
                <option value="ws">ws://</option>
                <option value="wss">wss://</option>
              </select>
              <input data-mqtt-field="host" data-role="mqtt-editor" :value="configForm.host" placeholder="ainongyun.net" @input="updateConfigDraft({ host: ($event.target as HTMLInputElement).value })" />
            </span>
          </label>
          <label>
            端口
            <input data-mqtt-field="port" data-role="mqtt-editor" type="number" :value="configForm.port" placeholder="8083" @input="updateConfigDraft({ port: ($event.target as HTMLInputElement).value })" />
          </label>
          <label>
            Path
            <input data-mqtt-field="path" data-role="mqtt-editor" :value="configForm.path" placeholder="/" @input="updateConfigDraft({ path: ($event.target as HTMLInputElement).value })" />
          </label>
          <p class="mqtt-endpoint-preview mqtt-config-wide">
            <span>当前连接地址</span>
            <code>{{ endpointPreview || '未配置服务器地址' }}</code>
          </p>
          <label>
            username
            <input data-mqtt-field="username" data-role="mqtt-editor" :value="configForm.username" @input="updateConfigDraft({ username: ($event.target as HTMLInputElement).value })" />
          </label>
          <label>
            本机暂存 password/token
            <input data-mqtt-field="password" data-role="mqtt-editor" type="password" :value="configForm.password" @input="updateConfigDraft({ password: ($event.target as HTMLInputElement).value })" />
          </label>
          <label class="checkbox-line">
            <input type="checkbox" :checked="configForm.ssl" @change="updateSsl(($event.target as HTMLInputElement).checked)" />
            SSL/TLS
          </label>
          <label>
            默认发布 topic
            <input data-mqtt-field="publishTopic" data-role="mqtt-editor" :value="configForm.publishTopic" @input="updateConfigDraft({ publishTopic: ($event.target as HTMLInputElement).value })" />
          </label>
          <section class="mqtt-subscription-summary mqtt-config-wide">
            <header>
              <span>
                <strong>订阅</strong>
                <small>{{ configForm.subscriptionItems.length }} 条 · QoS {{ configForm.qos }}</small>
              </span>
              <button type="button" class="mqtt-icon-button" title="+ 添加订阅" aria-label="+ 添加订阅" @click="addConfigSubscriptionItem">
                <MqttIcon name="add" />
              </button>
            </header>
            <div class="mqtt-config-subscription-list">
              <article
                v-for="(item, index) in configForm.subscriptionItems"
                :key="`${index}:${item.topic}:${item.alias}`"
                class="mqtt-config-subscription-row"
              >
                <input
                  data-role="mqtt-editor"
                  :data-mqtt-config-subscription-index="index"
                  data-mqtt-config-subscription-field="alias"
                  :value="item.alias"
                  placeholder="订阅别名"
                  aria-label="订阅别名"
                  @input="updateConfigSubscriptionItem(index, { alias: ($event.target as HTMLInputElement).value })"
                />
                <input
                  data-role="mqtt-editor"
                  data-mqtt-field="subscriptions"
                  :data-mqtt-config-subscription-index="index"
                  data-mqtt-config-subscription-field="topic"
                  :value="item.topic"
                  placeholder="plc/+/status"
                  aria-label="订阅 topic"
                  @input="updateConfigSubscriptionItem(index, { topic: ($event.target as HTMLInputElement).value })"
                />
                <span>QoS {{ configForm.qos }}</span>
                <button type="button" class="mqtt-icon-button danger" title="删除订阅" aria-label="删除订阅" @click="removeConfigSubscriptionItem(index)">
                  <MqttIcon name="delete" />
                </button>
              </article>
              <p v-if="!configForm.subscriptionItems.length" class="empty-note">暂无订阅 topic，可在这里添加</p>
            </div>
          </section>
          <label>
            QoS
            <select data-mqtt-field="qos" data-role="mqtt-editor" :value="String(configForm.qos)" @change="updateConfigDraft({ qos: qosFromInput(($event.target as HTMLSelectElement).value) })">
              <option value="0">QoS 0</option>
              <option value="1">QoS 1</option>
              <option value="2">QoS 2</option>
            </select>
          </label>
          <label class="checkbox-line">
            <input type="checkbox" :checked="configForm.retain" @change="updateConfigDraft({ retain: ($event.target as HTMLInputElement).checked })" />
            retain
          </label>
          <label class="checkbox-line">
            <input type="checkbox" :checked="configForm.autoReconnect" @change="updateConfigDraft({ autoReconnect: ($event.target as HTMLInputElement).checked })" />
            autoReconnect
          </label>
          <label>
            reconnectPeriodMs
            <input data-mqtt-field="connection" data-role="mqtt-editor" type="number" min="500" max="60000" :value="configForm.reconnectPeriodMs" @input="updateConfigDraft({ reconnectPeriodMs: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label>
            connectTimeoutMs
            <input data-role="mqtt-editor" type="number" min="3000" max="60000" :value="configForm.connectTimeoutMs" @input="updateConfigDraft({ connectTimeoutMs: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label>
            keepaliveSec
            <input data-role="mqtt-editor" type="number" min="0" max="300" :value="configForm.keepaliveSec" @input="updateConfigDraft({ keepaliveSec: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="checkbox-line">
            <input type="checkbox" :checked="configForm.clean" @change="updateConfigDraft({ clean: ($event.target as HTMLInputElement).checked })" />
            clean
          </label>
          <label class="checkbox-line">
            <input type="checkbox" :checked="configForm.reconnectOnConnackError" @change="updateConfigDraft({ reconnectOnConnackError: ($event.target as HTMLInputElement).checked })" />
            reconnectOnConnackError
          </label>
          <label class="checkbox-line">
            <input type="checkbox" :checked="configForm.resubscribeOnReconnect" @change="updateConfigDraft({ resubscribeOnReconnect: ($event.target as HTMLInputElement).checked })" />
            resubscribeOnReconnect
          </label>
          <label class="checkbox-line" data-mqtt-field="storage">
            <input type="checkbox" :checked="configForm.syncRecords" @change="updateConfigDraft({ syncRecords: ($event.target as HTMLInputElement).checked })" />
            syncRecords
          </label>
        </div>
        </aside>
      </div>

      <section class="mqtt-workspace-body" :style="workspaceLayoutStyle">
        <section class="mqtt-receive-panel">
          <MqttPublishRecordList
            v-if="props.snapshot.activeMqttRecordList !== 'messages'"
            class="mqtt-record-mode-panel"
            :list-id="activePublishRecordListId"
            :title="activeRecordListTitle"
            :search="activeRecordListSearch"
            :rows="activeRecordListRows"
            :state="activeRecordListState"
            :selected-kind="activeRecordSelectedKind"
            :selected-id="props.snapshot.mqttSelectedRecord?.id || null"
            :command-title="commandTitle"
            :shortcut-hint-attr="shortcutHintAttr"
            @search="(query) => searchPublishRecords(activePublishRecordListId, query)"
            @focus-row="(row) => focusPublishRecord(row, activePublishRecordListId)"
            @toggle-select="(row, range) => togglePublishRecord(row, activePublishRecordListId, range)"
            @apply="(row) => applyPublishRecord(row, activePublishRecordListId)"
            @repeat-send="(row) => repeatPublishRecord(row, activePublishRecordListId)"
            @favorite="(row) => favoritePublishRecord(row, activePublishRecordListId)"
            @preview="(row, event) => previewPublishRecord(row, activePublishRecordListId, event)"
            @close-preview="closeHoverPreview"
            @detail="(row) => detailPublishRecord(row, activePublishRecordListId)"
            @menu="(row) => menuPublishRecord(row, activePublishRecordListId)"
            @rename="(row, title) => renamePublishTemplate(row, title)"
            @delete-selected="deletePublishRecords(activePublishRecordListId)"
          />
          <div v-else class="mqtt-message-list mqtt-message-stream" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.focus.messages')">
            <article
              v-for="message in props.snapshot.mqttMessageRows"
              :key="message.id"
              class="mqtt-message-row"
              :class="{ focused: recordSelected('message', message.id), incoming: message.direction === 'incoming', outgoing: message.direction === 'outgoing' }"
              :data-mqtt-preview-target="previewTargetValue('message', message.id)"
              @click="selectRecord('message', message.id, 'messages')"
              @contextmenu.prevent="openMessageMenu(message, 'messages')"
              @mouseenter="schedulePreview('message', message.id, $event)"
              @mouseleave="closeHoverPreview"
            >
              <div class="mqtt-message-bubble" :class="message.direction === 'outgoing' ? 'mqtt-message-bubble-out' : 'mqtt-message-bubble-in'">
                <span class="mqtt-message-direction" :class="`mqtt-message-direction-${directionLabel(message).toLowerCase()}`">
                  <MqttIcon :name="directionIconName(message)" />
                  <b>{{ directionLabel(message) }}</b>
                  <small>{{ formatTime(message.timestamp) }}</small>
                </span>
                <span class="mqtt-message-route">
                  <small v-if="messageAlias(message)" class="mqtt-topic-alias-badge">{{ messageAlias(message) }}</small>
                  <strong>{{ message.topic || '(empty topic)' }}</strong>
                  <small class="mqtt-topic-meta">{{ messageTitle(message) }}</small>
                </span>
                <span class="mqtt-message-flags">
                  <small>QoS {{ message.qos }}</small>
                  <small v-if="message.retain">retain</small>
                </span>
                <span class="mqtt-item-payload-snippet" :title="payloadSnippet(message.payload)">
                  <template v-for="(segment, index) in payloadSnippetSegments(message.payload)" :key="`${index}:${segment.kind}:${segment.text}`">
                    <span class="mqtt-preview-token" :class="`mqtt-preview-token-${segment.kind}`">{{ segment.text }}</span>
                  </template>
                </span>
                <span class="mqtt-message-actions" aria-label="消息操作">
                  <button type="button" class="mqtt-icon-button" :title="commandTitle('预览消息', 'mqtt.preview.open', 'c-i')" aria-label="预览消息" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.preview.open')" @click.stop="previewMessage(message, 'messages')">
                    <MqttIcon name="detail" />
                  </button>
                  <button type="button" class="mqtt-icon-button" :title="commandTitle('详情消息', 'mqtt.detail.open', 'c-←')" aria-label="详情消息" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.detail.open')" @click.stop="openMessageDetail(message, 'messages')">
                    <MqttIcon name="log" />
                  </button>
                  <button type="button" class="mqtt-icon-button" :title="commandTitle('快捷操作', 'mqtt.drawer.open', 'c-→')" aria-label="快捷操作" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.drawer.open')" @click.stop="openMessageMenu(message, 'messages')">
                    <MqttIcon name="more" />
                  </button>
                </span>
              </div>
            </article>
            <p v-if="!props.snapshot.mqttMessageRows.length" class="empty-note">暂无收发记录</p>
          </div>
        </section>

        <div
          class="mqtt-workspace-resizer"
          role="separator"
          :aria-orientation="props.snapshot.mqttWorkspaceLayout === 'split' ? 'vertical' : 'horizontal'"
          title="拖拽调整收发区域比例，双击恢复默认"
          @pointerdown.prevent="resizeMqttLayout"
          @dblclick.prevent="resetMqttLayout"
        ></div>

        <section class="mqtt-send-panel">
          <header class="mqtt-publish-command-bar" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.focus.publish')">
            <span class="mqtt-publish-title">
              <strong>发送</strong>
              <small>本机历史</small>
            </span>
            <input data-role="mqtt-search" :value="publishDraft.topic || activeConfig?.publishTopic || ''" placeholder="发布 topic" @input="emit('updatePublishDraft', { topic: ($event.target as HTMLInputElement).value })" />
            <select :value="String(publishDraft.qos)" @change="emit('updatePublishDraft', { qos: qosFromInput(($event.target as HTMLSelectElement).value) })">
              <option value="0">QoS 0</option>
              <option value="1">QoS 1</option>
              <option value="2">QoS 2</option>
            </select>
            <label class="checkbox-line">
              <input type="checkbox" :checked="publishDraft.retain" @change="emit('updatePublishDraft', { retain: ($event.target as HTMLInputElement).checked })" />
              retain
            </label>
            <span class="mqtt-publish-actions" aria-label="发送操作">
              <button type="button" class="mqtt-icon-button" :title="commandTitle('发送 MQTT 消息', 'mqtt.publish.send', 'c-cr')" aria-label="发送 MQTT 消息" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.send')" @click="emit('dispatch', 'mqtt.publish.send')">
                <MqttIcon name="send" />
              </button>
              <button type="button" class="mqtt-icon-button" title="保存模板" aria-label="保存模板" @click="emit('dispatch', 'mqtt.publish.template.save', { title: publishDraft.topic || '未命名模板' })">
                <MqttIcon name="star" />
              </button>
              <button type="button" class="mqtt-icon-button" :title="commandTitle('发送记录', 'mqtt.publish.records.toggle', 'c-h')" aria-label="发送记录" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.records.toggle')" @click="emit('dispatch', 'mqtt.publish.records.toggle')">
                <MqttIcon name="history" />
              </button>
            </span>
          </header>
          <textarea class="mqtt-payload-input" data-role="mqtt-search" :value="publishDraft.payload" rows="8" placeholder="payload" @input="emit('updatePublishDraft', { payload: ($event.target as HTMLTextAreaElement).value })"></textarea>

        </section>
      </section>
    </main>

    <div
      v-if="props.snapshot.mqttSubscriptionDraft"
      class="modal-backdrop mqtt-subscription-modal"
      role="presentation"
      data-role="mqtt-subscription-editor"
      @click="emit('dispatch', 'mqtt.subscription.editor.cancel')"
      @keydown="handleSubscriptionEditorKeydown"
    >
      <section class="mqtt-subscription-editor" role="dialog" aria-modal="true" aria-label="订阅管理" data-role="mqtt-subscription-editor" @click.stop>
        <header>
          <span>
            <strong>订阅管理</strong>
            <small>{{ activeConfig?.name || '当前连接' }} · QoS {{ activeConfig?.qos ?? configForm.qos }}</small>
          </span>
          <span class="mqtt-editor-actions">
            <button type="button" class="mqtt-icon-button" title="+ 添加订阅" aria-label="+ 添加订阅" @click="addSubscriptionEditorItem">
              <MqttIcon name="add" />
            </button>
            <button type="button" class="mqtt-icon-button" title="取消" aria-label="取消" @click="emit('dispatch', 'mqtt.subscription.editor.cancel')">
              <MqttIcon name="close" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('保存', 'mqtt.subscription.editor.save', 'c-s')" aria-label="保存" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.subscription.editor.save')" @click="emit('dispatch', 'mqtt.subscription.editor.save')">
              <MqttIcon name="save" />
            </button>
          </span>
        </header>
        <div class="mqtt-subscription-editor-list">
          <article
            v-for="item in props.snapshot.mqttSubscriptionDraft.items"
            :key="item.id"
            class="mqtt-subscription-editor-row"
          >
            <input
              data-role="mqtt-subscription-editor"
              :data-mqtt-subscription-item-id="item.id"
              data-mqtt-subscription-field="alias"
              :value="item.alias"
              placeholder="订阅别名"
              @focus="focusSubscriptionEditorField(item.id, 'alias')"
              @input="updateSubscriptionEditorItem(item.id, { alias: ($event.target as HTMLInputElement).value })"
            />
            <input
              data-role="mqtt-subscription-editor"
              :data-mqtt-subscription-item-id="item.id"
              data-mqtt-subscription-field="topic"
              :value="item.topic"
              placeholder="plc/+/status"
              @focus="focusSubscriptionEditorField(item.id, 'topic')"
              @input="updateSubscriptionEditorItem(item.id, { topic: ($event.target as HTMLInputElement).value })"
            />
            <span>QoS {{ activeConfig?.qos ?? configForm.qos }}</span>
            <button type="button" class="mqtt-icon-button danger" title="删除" aria-label="删除" @click="removeSubscriptionEditorItem(item.id)">
              <MqttIcon name="delete" />
            </button>
          </article>
          <p v-if="!props.snapshot.mqttSubscriptionDraft.items.length" class="empty-note">暂无订阅 topic</p>
        </div>
      </section>
    </div>

    <div
      v-if="favoriteDraft"
      class="modal-backdrop mqtt-favorite-modal"
      role="presentation"
      data-role="mqtt-favorite-editor"
      @click="emit('dispatch', 'mqtt.record.favorite.cancel')"
      @keydown="handleFavoriteEditorKeydown"
    >
      <section class="mqtt-favorite-editor" role="dialog" aria-modal="true" aria-label="收藏消息" data-role="mqtt-favorite-editor" @click.stop>
        <header>
          <span>
            <strong>收藏消息</strong>
            <small>保存为发送模板，可快速浏览和重发</small>
          </span>
          <span class="mqtt-editor-actions">
            <button type="button" class="mqtt-icon-button" :title="commandTitle('取消', 'mqtt.record.favorite.cancel', 'esc')" aria-label="取消收藏" @click="emit('dispatch', 'mqtt.record.favorite.cancel')">
              <MqttIcon name="close" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('保存收藏', 'mqtt.record.favorite.save', 'c-s')" aria-label="保存收藏" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.record.favorite.save')" @click="emit('dispatch', 'mqtt.record.favorite.save')">
              <MqttIcon name="save" />
            </button>
          </span>
        </header>
        <label>
          别名
          <input
            data-role="mqtt-favorite-editor"
            :value="favoriteDraft.title"
            placeholder="用于快速重发的名称"
            @focus="emit('updateFavoriteDraft', { activeField: 'title' })"
            @input="emit('updateFavoriteDraft', { title: ($event.target as HTMLInputElement).value })"
          />
        </label>
      </section>
    </div>

    <div
      v-if="recordEditDraft"
      class="modal-backdrop mqtt-record-edit-modal"
      role="presentation"
      data-role="mqtt-record-editor"
      @click="emit('dispatch', 'mqtt.record.edit.cancel')"
      @keydown="handleRecordEditorKeydown"
    >
      <section class="mqtt-record-editor" role="dialog" aria-modal="true" :aria-label="recordEditDraft.mode === 'rename' ? '编辑 MQTT 记录别名' : '完整编辑 MQTT 记录'" data-role="mqtt-record-editor" @click.stop>
        <header>
          <span>
            <strong>{{ recordEditDraft.mode === 'rename' ? '记录别名' : '完整编辑' }}</strong>
            <small>{{ recordEditDraft.targetKind === 'publish-template' ? '收藏模板' : '消息记录' }}</small>
          </span>
          <span class="mqtt-editor-actions">
            <button type="button" class="mqtt-icon-button" :title="commandTitle('取消', 'mqtt.record.edit.cancel', 'esc')" aria-label="取消记录编辑" @click="emit('dispatch', 'mqtt.record.edit.cancel')">
              <MqttIcon name="close" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('保存记录', 'mqtt.record.edit.save', 'c-s')" aria-label="保存记录编辑" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.record.edit.save')" @click="emit('dispatch', 'mqtt.record.edit.save')">
              <MqttIcon name="save" />
            </button>
          </span>
        </header>
        <label>
          别名
          <input
            data-role="mqtt-record-editor"
            data-mqtt-record-field="title"
            :value="recordEditDraft.title"
            placeholder="记录别名"
            @focus="updateRecordEditDraft({ activeField: 'title' })"
            @input="updateRecordEditDraft({ title: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label>
          备注
          <input
            data-role="mqtt-record-editor"
            data-mqtt-record-field="note"
            :value="recordEditDraft.note"
            placeholder="记录备注"
            @focus="updateRecordEditDraft({ activeField: 'note' })"
            @input="updateRecordEditDraft({ note: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <template v-if="recordEditDraft.mode === 'edit'">
          <label>
            topic
            <input
              data-role="mqtt-record-editor"
              data-mqtt-record-field="topic"
              :value="recordEditDraft.topic"
              placeholder="topic"
              @focus="updateRecordEditDraft({ activeField: 'topic' })"
              @input="updateRecordEditDraft({ topic: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label>
            payload
            <textarea
              data-role="mqtt-record-editor"
              data-mqtt-record-field="payload"
              :value="recordEditDraft.payload"
              rows="8"
              placeholder="payload"
              @focus="updateRecordEditDraft({ activeField: 'payload' })"
              @input="updateRecordEditDraft({ payload: ($event.target as HTMLTextAreaElement).value })"
            ></textarea>
          </label>
          <div class="mqtt-record-editor-inline">
            <label>
              QoS
              <select
                data-role="mqtt-record-editor"
                data-mqtt-record-field="qos"
                :value="String(recordEditDraft.qos)"
                @focus="updateRecordEditDraft({ activeField: 'qos' })"
                @change="updateRecordEditDraft({ qos: qosFromInput(($event.target as HTMLSelectElement).value) })"
              >
                <option value="0">QoS 0</option>
                <option value="1">QoS 1</option>
                <option value="2">QoS 2</option>
              </select>
            </label>
            <label class="checkbox-line">
              <input
                data-role="mqtt-record-editor"
                data-mqtt-record-field="retain"
                type="checkbox"
                :checked="recordEditDraft.retain"
                @focus="updateRecordEditDraft({ activeField: 'retain' })"
                @change="updateRecordEditDraft({ retain: ($event.target as HTMLInputElement).checked })"
              />
              retain
            </label>
          </div>
        </template>
      </section>
    </div>

    <div v-if="props.snapshot.mqttLogDrawer.open" class="drawer-overlay drawer-overlay-left" role="presentation" @click="emit('dispatch', 'mqtt.log.drawer.close')">
      <aside class="mqtt-log-drawer" aria-label="MQTT 错误日志" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>错误日志</strong>
            <small>{{ visibleLogs.length }} 条</small>
          </span>
          <button type="button" class="mqtt-icon-button" title="关闭日志" aria-label="关闭日志" @click="emit('dispatch', 'mqtt.log.drawer.close')">
            <MqttIcon name="close" />
          </button>
        </header>
        <div class="mqtt-log-actions">
          <button type="button" class="mqtt-icon-button" title="清空本连接" aria-label="清空本连接" @click="emit('dispatch', 'mqtt.log.clearCurrentConfig')">
            <MqttIcon name="clear" />
          </button>
          <button type="button" class="mqtt-icon-button" title="清空全部" aria-label="清空全部" @click="emit('dispatch', 'mqtt.log.clearAll')">
            <MqttIcon name="clear-all" />
          </button>
        </div>
        <div class="mqtt-log-list">
          <article
            v-for="log in visibleLogs"
            :key="log.id"
            class="mqtt-log-row"
            :class="[`mqtt-log-${log.level}`, { focused: recordSelected('log', log.id) }]"
            @click="selectLog(log.id)"
          >
            <span>{{ log.level }}</span>
            <small>{{ formatTime(log.timestamp) }}</small>
            <strong>{{ log.message }}</strong>
            <code>{{ log.detail || logConfigName(log) }}</code>
            <button type="button" class="mqtt-icon-button" title="清理日志" aria-label="清理日志" @click.stop="emit('focusLog', log.id); emit('dispatch', 'mqtt.log.delete')">
              <MqttIcon name="delete" />
            </button>
          </article>
          <p v-if="!visibleLogs.length" class="empty-note">暂无错误日志</p>
        </div>
        <section v-if="selectedLog" class="mqtt-log-detail">
          <header>
            <strong>日志详情</strong>
            <button type="button" class="mqtt-icon-button" title="清理当前日志" aria-label="清理当前日志" @click="emit('dispatch', 'mqtt.log.delete')">
              <MqttIcon name="delete" />
            </button>
          </header>
          <dl>
            <dt>连接</dt>
            <dd>{{ logConfigName(selectedLog) }}</dd>
            <dt>级别</dt>
            <dd>{{ selectedLog.level }}</dd>
            <dt>时间</dt>
            <dd>{{ formatDateTime(selectedLog.timestamp) }}</dd>
            <dt>消息</dt>
            <dd>{{ selectedLog.message }}</dd>
            <dt>详情</dt>
            <dd>{{ selectedLog.detail || '无' }}</dd>
          </dl>
        </section>
      </aside>
    </div>

    <div v-if="props.snapshot.mqttDrawer.open && !props.snapshot.mqttDrawer.active" class="drawer-overlay drawer-overlay-left" role="presentation" @click="emit('dispatch', 'mqtt.detail.close')">
      <aside class="port-detail-drawer mqtt-detail-drawer" aria-label="MQTT 详情抽屉" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>{{ detailTitle }}</strong>
            <small>{{ detailSubtitle }}</small>
          </span>
          <button type="button" class="mqtt-icon-button" title="关闭详情" aria-label="关闭详情" @click="emit('dispatch', 'mqtt.detail.close')">
            <MqttIcon name="close" />
          </button>
        </header>
        <section v-if="detailRecord" class="mqtt-detail-body">
          <dl class="mqtt-detail-grid">
            <dt>topic</dt>
            <dd>{{ detailRecord.topic || '(empty topic)' }}</dd>
            <dt>QoS</dt>
            <dd>{{ detailRecord.qos }}</dd>
            <dt>retain</dt>
            <dd>{{ detailRecord.retain ? 'true' : 'false' }}</dd>
            <dt>time</dt>
            <dd>{{ 'timestamp' in detailRecord ? formatDateTime(detailRecord.timestamp) : formatDateTime(detailRecord.updatedAt) }}</dd>
          </dl>
          <div class="mqtt-detail-actions">
            <button type="button" class="mqtt-icon-button" :title="commandTitle('预览', 'mqtt.preview.open', 'c-i')" aria-label="预览详情记录" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.preview.open')" @click="emit('dispatch', 'mqtt.preview.open', { ...commandArgs(detailTarget?.kind === 'publish-template' ? 'publish-template' : 'message', detailRecord.id), source: 'keyboard' })">
              <MqttIcon name="detail" />
            </button>
            <button type="button" class="mqtt-icon-button" title="复制 topic" aria-label="复制 topic" @click="emit('dispatch', 'mqtt.record.copyTopic', commandArgs(detailTarget?.kind === 'publish-template' ? 'publish-template' : 'message', detailRecord.id))">
              <MqttIcon name="copy-topic" />
            </button>
            <button type="button" class="mqtt-icon-button" title="复制 payload" aria-label="复制 payload" @click="emit('dispatch', 'mqtt.record.copyPayload', commandArgs(detailTarget?.kind === 'publish-template' ? 'publish-template' : 'message', detailRecord.id))">
              <MqttIcon name="copy-payload" />
            </button>
          </div>
          <div class="mqtt-preview-payload mqtt-detail-payload">
            <template v-for="(segment, index) in detailPayloadSegments" :key="`detail:${index}:${segment.kind}:${segment.text}`">
              <br v-if="segment.kind === 'newline'" />
              <span v-else class="mqtt-preview-token" :class="`mqtt-preview-token-${segment.kind}`">{{ segment.text }}</span>
            </template>
          </div>
        </section>
        <section v-else-if="detailLog" class="mqtt-log-detail">
          <dl>
            <dt>级别</dt>
            <dd>{{ detailLog.level }}</dd>
            <dt>时间</dt>
            <dd>{{ formatDateTime(detailLog.timestamp) }}</dd>
            <dt>消息</dt>
            <dd>{{ detailLog.message }}</dd>
            <dt>详情</dt>
            <dd>{{ detailLog.detail || '无' }}</dd>
          </dl>
        </section>
        <section v-else-if="detailConfig" class="mqtt-log-detail">
          <dl>
            <dt>连接</dt>
            <dd>{{ detailConfig.name }}</dd>
            <dt>URL</dt>
            <dd>{{ detailConfig.url || '未配置' }}</dd>
            <dt>状态</dt>
            <dd>{{ statusLabel(props.snapshot.mqttConnectionStatus.state) }}</dd>
            <dt>订阅</dt>
            <dd>{{ detailConfig.subscriptions.length }} 条</dd>
            <dt>记录</dt>
            <dd>{{ detailConfig.syncRecords ? '归档' : '内存' }}</dd>
          </dl>
        </section>
        <p v-else class="empty-note">当前没有可展示的 MQTT 详情</p>
      </aside>
    </div>

    <div v-if="props.snapshot.mqttDrawer.open && props.snapshot.mqttDrawer.active" class="drawer-overlay drawer-overlay-right" role="presentation" @click="emit('dispatch', 'mqtt.drawer.close')">
      <aside class="port-detail-drawer mqtt-action-drawer active" aria-label="MQTT 动作抽屉" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>快捷操作</strong>
            <small>{{ props.snapshot.mqttSelectedRecord?.kind || '当前上下文' }}</small>
          </span>
          <button type="button" class="mqtt-icon-button" title="关闭抽屉" aria-label="关闭抽屉" @click="emit('dispatch', 'mqtt.drawer.close')">
            <MqttIcon name="close" />
          </button>
        </header>
        <div class="detail-actions mqtt-drawer-action-list">
          <button
            v-for="(item, index) in props.snapshot.mqttDrawerItems"
            :key="`${item.commandId}:${index}`"
            type="button"
            class="mqtt-drawer-action"
            :class="{ active: index === props.snapshot.mqttDrawer.activeIndex, danger: item.risk === 'destructive' || item.commandId.includes('delete') }"
            :disabled="!item.enabled"
            :title="item.description || item.title"
            :aria-label="item.title"
            @click="emit('dispatch', item.commandId, item.args)"
          >
            <component :is="iconComponent(item.icon)" class="mqtt-icon" aria-hidden="true" />
            <span>{{ item.title }}</span>
            <kbd v-if="item.shortcutLabel">{{ item.shortcutLabel }}</kbd>
          </button>
          <p v-if="!props.snapshot.mqttDrawerItems.length" class="empty-note">当前没有可执行动作</p>
        </div>
      </aside>
    </div>

    <aside
      v-if="props.snapshot.mqttPreview.open && previewRecord"
      class="mqtt-preview-layer"
      :style="previewPositionStyle"
      role="region"
      :aria-label="commandTitle('MQTT 消息预览', 'mqtt.preview.open', 'c-i')"
      @mouseenter="keepHoverPreview"
      @mouseleave="closeHoverPreview"
    >
      <header>
        <span class="mqtt-preview-direction" :class="`mqtt-preview-direction-${directionLabel(previewRecord).toLowerCase()}`">
          <component :is="previewDirectionIcon" class="mqtt-icon" aria-hidden="true" />
          <b>{{ directionLabel(previewRecord) }}</b>
        </span>
        <strong class="mqtt-preview-topic">{{ previewRecord.topic || '(empty topic)' }}</strong>
        <time class="mqtt-preview-time" :datetime="String(recordTime(previewRecord))">{{ formatDateTime(recordTime(previewRecord)) }}</time>
        <button type="button" class="mqtt-icon-button" title="关闭预览" aria-label="关闭预览" @click="emit('dispatch', 'mqtt.preview.close')">
          <MqttIcon name="close" />
        </button>
      </header>
      <div ref="previewPayloadRef" class="mqtt-preview-payload" tabindex="0" aria-label="预览内容" @scroll.passive="syncPreviewScroll">
        <div class="mqtt-preview-payload-content">
          <template v-for="(segment, index) in previewPayloadSegments" :key="`${index}:${segment.kind}:${segment.text}`">
            <br v-if="segment.kind === 'newline'" />
            <span v-else class="mqtt-preview-token" :class="`mqtt-preview-token-${segment.kind}`">{{ segment.text }}</span>
          </template>
        </div>
      </div>
    </aside>
  </section>

  <Teleport to="body">
    <div v-if="shortcutHintEntries.length" class="mqtt-shortcut-top-layer" aria-hidden="true">
      <kbd
        v-for="entry in shortcutHintEntries"
        :key="entry.id"
        class="mqtt-shortcut-badge"
        :class="`mqtt-shortcut-badge-${entry.placement}`"
        :style="entry.style"
      >
        {{ entry.label }}
      </kbd>
    </div>
  </Teleport>
</template>
