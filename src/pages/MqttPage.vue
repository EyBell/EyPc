<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Component, CSSProperties } from 'vue'
import {
  BadgeX,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Clipboard,
  ClipboardList,
  Copy,
  CornerDownLeft,
  Eraser,
  Folder,
  FolderPlus,
  Hash,
  Info,
  LayoutPanelTop,
  Logs,
  MoreHorizontal,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Send,
  Star,
  Trash2,
  Unplug,
  X
} from '@lucide/vue'
import type { AppRuntimeSnapshot, MqttConfigDraft, MqttConnectionGroupDraft, MqttFavoriteDraft, MqttPublishDraftHistoryEditDraft, MqttRecordEditDraft, MqttSubscriptionEditorDraft, MqttSubscriptionEditorField, MqttSubscriptionEditorItem } from '../runtime/appRuntime'
import type { MqttConnectionGroup, MqttMessageRecord, MqttPublishDraft, MqttPublishDraftHistoryEntry, MqttPublishTemplate, MqttQos } from '../domain/types'
import { DEFAULT_MQTT_TOPIC_COLORS, buildMqttWebSocketUrl, mqttEndpointHostPortLabel, mqttPublishTemplateOperationTime, mqttTopicVisualForMessage, normalizeMqttTopicColor } from '../domain/mqtt'
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

type MqttPreviewTarget = { kind: 'message' | 'publish-template' | 'publish-draft-history'; id: string }
type MqttPreviewRecord = MqttMessageRecord | MqttPublishTemplate | MqttPublishDraftHistoryEntry
type MqttCommandTargetKind = NonNullable<AppRuntimeSnapshot['mqttSelectedRecord']>['kind']
type MqttConnectionRow = AppRuntimeSnapshot['mqttConnectionRows'][number]
type MqttConnectionDropPosition = 'before' | 'inside' | 'after'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean; shiftPreview?: boolean }>()
const emit = defineEmits<{
  search: [value: string]
  focusConfig: [id: string]
  focusConnectionGroup: [id: string]
  focusSession: [id: string]
  focusMessage: [id: string]
  focusLog: [id: string]
  updateConfigDraft: [input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>]
  updateConnectionGroupDraft: [input: Partial<Omit<MqttConnectionGroupDraft, 'mode' | 'targetId'>>]
  updateSubscriptionDraft: [input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>]
  updateFavoriteDraft: [input: Partial<Pick<MqttFavoriteDraft, 'title' | 'activeField'>>]
  updateRecordEditDraft: [input: Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>]
  updatePublishDraftHistoryEditDraft: [input: Partial<Pick<MqttPublishDraftHistoryEditDraft, 'title' | 'note' | 'topic' | 'payload' | 'activeField'>>]
  updatePublishDraft: [input: Partial<MqttPublishDraft>]
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

const workbenchRef = ref<HTMLElement | null>(null)
const previewPayloadRef = ref<HTMLElement | null>(null)
const hoverPreviewTarget = ref<MqttPreviewTarget | null>(null)
const hoverPreviewSuspendedByKeyboard = ref(false)
const lastPreviewPointerPosition = ref<{ x: number | null; y: number | null }>({ x: null, y: null })
const shortcutHintEntries = ref<MqttShortcutHintEntry[]>([])
const mqttToolbarSearchOpen = ref(false)
const connectionTreeDragTarget = ref<{ kind: 'group' | 'config'; id: string } | null>(null)
const connectionTreeDropTarget = ref<{ rowId: string; position: MqttConnectionDropPosition } | null>(null)
let shortcutHintFrame: number | null = null

function directionGlyphChildren(variant: 'all' | 'in' | 'out') {
  const strokeAttrs = {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
  if (variant === 'all') {
    return [
      h('path', { ...strokeAttrs, d: 'M4 8h10' }),
      h('path', { ...strokeAttrs, d: 'm10 5 4 3-4 3' }),
      h('path', { ...strokeAttrs, d: 'M20 16H10' }),
      h('path', { ...strokeAttrs, d: 'm14 13-4 3 4 3' }),
      h('circle', { cx: '12', cy: '12', r: '2.4', fill: 'currentColor' })
    ]
  }
  if (variant === 'in') {
    return [
      h('path', { ...strokeAttrs, d: 'M12 4v10' }),
      h('path', { ...strokeAttrs, d: 'm8 10 4 4 4-4' }),
      h('path', { ...strokeAttrs, d: 'M5 15v3h14v-3' })
    ]
  }
  return [
    h('path', { ...strokeAttrs, d: 'M4 12 20 4l-4 16-4-7-8-1Z' }),
    h('path', { ...strokeAttrs, d: 'M12 13 20 4' })
  ]
}

function createMqttDirectionGlyph(variant: 'all' | 'in' | 'out') {
  return defineComponent({
    name: `MqttDirectionGlyph${variant[0].toUpperCase()}${variant.slice(1)}`,
    setup() {
      return () => h(
        'svg',
        {
          class: ['mqtt-direction-glyph', `mqtt-direction-glyph-${variant}`],
          viewBox: '0 0 24 24',
          role: 'img',
          focusable: 'false'
        },
        directionGlyphChildren(variant)
      )
    }
  })
}

const MqttDirectionGlyphAll = createMqttDirectionGlyph('all')
const MqttDirectionGlyphIn = createMqttDirectionGlyph('in')
const MqttDirectionGlyphOut = createMqttDirectionGlyph('out')

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
  groupId: null as string | null,
  password: '',
  subscriptionsText: '',
  subscriptionItems: [] as MqttConfigDraft['subscriptionItems'],
  publishTopic: '',
  publishTopics: [] as string[],
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
  configForm.groupId = draft?.groupId || null
  configForm.password = draft?.password || ''
  configForm.subscriptionsText = draft?.subscriptionsText || ''
  configForm.subscriptionItems = draft?.subscriptionItems?.map((item) => ({ ...item })) || []
  configForm.publishTopic = draft?.publishTopic || ''
  configForm.publishTopics = draft?.publishTopics?.length ? [...draft.publishTopics] : (draft?.publishTopic ? [draft.publishTopic] : [])
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

watch(() => props.snapshot.mqttConnectionGroupDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-mqtt-connection-group-field="${field}"]`)
    const alreadyFocused = document.activeElement === input
    input?.focus()
    if (!alreadyFocused && input instanceof HTMLInputElement) input.select()
  })
})

watch([
  () => props.snapshot.mqttConfigDraft?.activeField,
  () => props.snapshot.mqttConfigDraft?.activeSubscriptionIndex,
  () => props.snapshot.mqttConfigDraft?.activeSubscriptionField,
  () => props.snapshot.mqttConfigDraft?.activePublishIndex
], ([field, activeSubscriptionIndex, activeSubscriptionField, activePublishIndex]) => {
  if (!field) return
  void nextTick(() => {
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null = null
    let selectAll = true
    if (field === 'subscriptions' && typeof activeSubscriptionIndex === 'number') {
      input = document.querySelector<HTMLInputElement>(`[data-mqtt-config-subscription-index="${activeSubscriptionIndex}"][data-mqtt-config-subscription-field="${activeSubscriptionField || 'topic'}"]`)
      selectAll = false
    } else if (field === 'publishTopic') {
      const index = typeof activePublishIndex === 'number' ? activePublishIndex : 0
      input = document.querySelector<HTMLInputElement>(`[data-mqtt-config-publish-index="${index}"][data-mqtt-config-publish-field="topic"]`)
      selectAll = false
    }
    input = input || document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-mqtt-field="${field}"]`)
    const alreadyFocused = document.activeElement === input
    input?.focus()
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      if (selectAll) input.select()
      else if (!alreadyFocused) input.setSelectionRange(input.value.length, input.value.length)
    }
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
    const alreadyFocused = document.activeElement === input
    input?.focus()
    if (!alreadyFocused && (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) input.select()
  })
})

watch(() => props.snapshot.mqttPublishDraftHistoryEditDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-mqtt-publish-draft-field="${field}"]`)
    const alreadyFocused = document.activeElement === input
    input?.focus()
    if (!alreadyFocused && (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) input.select()
  })
})

watch(() => props.snapshot.searchFocusRequestId, () => {
  if (!['mqtt', 'mqtt-templates', 'mqtt-history'].includes(props.snapshot.searchFocusTarget)) return
  mqttToolbarSearchOpen.value = true
})

watch(() => props.snapshot.searchBlurRequestId, () => {
  mqttToolbarSearchOpen.value = false
})

watch(() => props.snapshot.mqttFocusRequestId, () => {
  void nextTick(() => focusMqttRuntimeTarget())
})

let contextPanelTrigger: HTMLElement | null = null

watch(() => props.snapshot.mqttLogDrawer.open ? 'log' : props.snapshot.mqttDrawer.open ? (props.snapshot.mqttDrawer.active ? 'actions' : 'detail') : '', (panel, previous) => {
  if (panel && !previous) contextPanelTrigger = document.activeElement as HTMLElement | null
  if (panel) {
    void nextTick(() => document.querySelector<HTMLElement>('.mqtt-context-panel button:not([disabled]), .mqtt-context-panel[tabindex]')?.focus())
    return
  }
  if (!previous) return
  void nextTick(() => {
    const role = props.snapshot.activeMqttPane === 'connections'
      ? 'mqtt-connections'
      : props.snapshot.activeMqttPane === 'subscriptions'
        ? 'mqtt-subscriptions'
        : props.snapshot.activeMqttPane === 'publish'
          ? 'mqtt-publish-editor'
          : 'mqtt-records'
    const target = contextPanelTrigger?.isConnected && contextPanelTrigger !== document.body
      ? contextPanelTrigger
      : document.querySelector<HTMLElement>(`[data-role="${role}"]`)
    target?.focus()
    contextPanelTrigger = null
  })
})

const activeConfig = computed(() => props.snapshot.mqttActiveConfig)
const subscriptionDraft = computed(() => props.snapshot.mqttSubscriptionDraft)
const recordEditDraft = computed(() => props.snapshot.mqttRecordEditDraft)
const publishDraft = computed(() => props.snapshot.mqttPublishScratch)
const subscriptionColorPalette = DEFAULT_MQTT_TOPIC_COLORS
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
const activeMqttToolbarFilter = computed(() => (
  props.snapshot.activeMqttRecordList === 'templates'
    ? 'favorites'
    : props.snapshot.activeMqttRecordList === 'messages'
      ? props.snapshot.mqttReceiveFilter
      : null
))
const activeMqttInfoIcon = computed(() => {
  if (activeMqttToolbarFilter.value === 'incoming') return 'in'
  if (activeMqttToolbarFilter.value === 'outgoing') return 'out'
  return 'all'
})
const activeMqttInfoTone = computed(() => {
  if (activeMqttToolbarFilter.value === 'incoming') return 'incoming'
  if (activeMqttToolbarFilter.value === 'outgoing') return 'outgoing'
  return 'all'
})
const activePublishRecordListId = computed(() => props.snapshot.activeMqttRecordList === 'history' ? 'history' : 'templates')
const activeRecordListTitle = computed(() => props.snapshot.activeMqttRecordList === 'history' ? '历史' : '收藏')
const activeToolbarSearchValue = computed(() => props.snapshot.activeMqttRecordList === 'history' ? props.snapshot.mqttHistorySearch : props.snapshot.activeMqttRecordList === 'templates' ? props.snapshot.mqttTemplateSearch : props.snapshot.mqttSearch)
const activeToolbarSearchRole = computed(() => props.snapshot.activeMqttRecordList === 'history' ? 'mqtt-history-search' : props.snapshot.activeMqttRecordList === 'templates' ? 'mqtt-template-search' : 'mqtt-record-search')
const activeToolbarSearchPlaceholder = computed(() => props.snapshot.activeMqttRecordList === 'history' ? '搜索历史' : props.snapshot.activeMqttRecordList === 'templates' ? '搜索收藏' : '搜索消息')
const showMqttToolbarSearch = computed(() => mqttToolbarSearchOpen.value || Boolean(activeToolbarSearchValue.value.trim()))
const activeRecordListRows = computed(() => props.snapshot.activeMqttRecordList === 'history' ? props.snapshot.mqttPublishHistoryRows : props.snapshot.mqttPublishTemplateRows)
const activeRecordListState = computed(() => props.snapshot.activeMqttRecordList === 'history' ? props.snapshot.mqttRecordListStates.history : props.snapshot.mqttRecordListStates.templates)
const activeRecordSelectedKind = computed(() => props.snapshot.mqttSelectedRecord?.kind === 'publish-template' ? 'publish-template' : props.snapshot.mqttSelectedRecord?.kind === 'message' ? 'message' : null)
const activeSubscriptionLabel = computed(() => {
  if (!props.snapshot.mqttActiveSubscriptionTopics.length) return '全部 topic'
  if (props.snapshot.mqttActiveSubscriptionTopics.length > 1) return `${props.snapshot.mqttActiveSubscriptionTopics.length} 个订阅`
  const topic = props.snapshot.mqttActiveSubscriptionTopics[0]
  return props.snapshot.mqttSubscriptionRows.find((row) => row.topic === topic)?.displayName || topic
})
const publishOptionRows = computed(() => [
  { id: 'qos0', label: 'QoS 0', active: publishDraft.value.qos === 0 },
  { id: 'qos1', label: 'QoS 1', active: publishDraft.value.qos === 1 },
  { id: 'qos2', label: 'QoS 2', active: publishDraft.value.qos === 2 },
  { id: 'retain', label: 'retain', active: publishDraft.value.retain }
])
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
  if (preview.targetKind === 'publish-draft-history') {
    return props.snapshot.mqttArchive.publishDraftHistory.find((item) => item.id === preview.targetId) || null
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
  if (target.kind === 'publish-draft-history') {
    return props.snapshot.mqttArchive.publishDraftHistory.find((item) => item.id === target.id) || null
  }
  return null
})
const detailSubscription = computed(() => {
  const target = detailTarget.value
  if (target?.kind !== 'subscription') return null
  return props.snapshot.mqttSubscriptionRows.find((row) => row.topic === target.id) || null
})
const detailConfig = computed(() => {
  const target = detailTarget.value
  if (!target) return null
  if (target.kind === 'config') return props.snapshot.state.mqtt.configs.find((item) => item.id === target.id) || null
  return null
})
const detailConnectionGroup = computed(() => {
  const target = detailTarget.value
  if (target?.kind !== 'connection-group') return null
  return props.snapshot.state.mqtt.connectionGroups.find((item) => item.id === target.id) || null
})
const detailConnectionGroupStats = computed(() => {
  const group = detailConnectionGroup.value
  if (!group) return { groups: 0, configs: 0 }
  return {
    groups: props.snapshot.state.mqtt.connectionGroups.filter((item) => item.parentId === group.id).length,
    configs: props.snapshot.state.mqtt.configs.filter((item) => item.groupId === group.id).length
  }
})
const detailLog = computed(() => {
  const target = detailTarget.value
  if (target?.kind !== 'log') return null
  return props.snapshot.mqttLogs.find((item) => item.id === target.id) || selectedLog.value
})
const detailPayloadSegments = computed(() => detailRecord.value ? buildMqttPayloadPreviewSegments(detailRecord.value.payload) : [])
const detailTitle = computed(() => {
  if (detailLog.value) return '日志详情'
  if (detailSubscription.value) return detailSubscription.value.displayName
  if (detailRecord.value && 'direction' in detailRecord.value) return `${directionLabel(detailRecord.value)} ${detailRecord.value.topic || '(empty topic)'}`
  if (detailRecord.value) return detailRecord.value.title || detailRecord.value.topic
  if (detailConnectionGroup.value) return detailConnectionGroup.value.name
  if (detailConfig.value) return detailConfig.value.name
  return 'MQTT 详情'
})
const detailSubtitle = computed(() => {
  if (detailLog.value) return logConfigName(detailLog.value)
  if (detailSubscription.value) return detailSubscription.value.topic
  if (detailRecord.value && 'direction' in detailRecord.value) return formatDateTime(detailRecord.value.timestamp)
  if (detailRecord.value) return formatDateTime(recordTime(detailRecord.value))
  if (detailConnectionGroup.value) return `${detailConnectionGroupStats.value.groups} 个分组 · ${detailConnectionGroupStats.value.configs} 个连接`
  if (detailConfig.value) return detailConfig.value.url || '未配置地址'
  return '当前上下文'
})
const mqttConnectionGroupDepths = computed(() => {
  const map = new Map<string, number>()
  for (const row of props.snapshot.mqttConnectionRows) {
    if (row.kind === 'group') map.set(row.id, row.depth)
  }
  return map
})
const mqttConnectionGroupParentOptions = computed(() => {
  const draft = props.snapshot.mqttConnectionGroupDraft
  return props.snapshot.state.mqtt.connectionGroups.filter((group) => group.id !== draft?.targetId)
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
    subscriptionItems: items.map((item) => ({ topic: item.topic, alias: item.alias, color: item.color })),
    subscriptionsText: items.map((item) => item.topic).join('\n')
  })
}

function focusConfigSubscriptionEditor(index: number, field: MqttSubscriptionEditorField = 'topic') {
  emit('dispatch', 'mqtt.config.subscription.focus', { index, field })
}

function addConfigSubscriptionItem() {
  const nextIndex = configForm.subscriptionItems.length
  syncConfigSubscriptionItems([...configForm.subscriptionItems, { topic: '', alias: '', color: normalizeMqttTopicColor('', nextIndex) }])
  focusConfigSubscriptionEditor(nextIndex, 'topic')
}

function updateConfigSubscriptionItem(index: number, input: Partial<MqttConfigDraft['subscriptionItems'][number]>) {
  syncConfigSubscriptionItems(configForm.subscriptionItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...input } : item))
}

function syncConfigPublishTopics(topics: string[]) {
  updateConfigDraft({
    publishTopic: topics.find((topic) => topic.trim())?.trim() || '',
    publishTopics: topics
  })
}

function focusConfigPublishEditor(index: number) {
  emit('dispatch', 'mqtt.config.publish.focus', { index })
}

function addConfigPublishTopic() {
  const nextIndex = configForm.publishTopics.length
  syncConfigPublishTopics([...configForm.publishTopics, ''])
  focusConfigPublishEditor(nextIndex)
}

function updateConfigPublishTopic(index: number, topic: string) {
  syncConfigPublishTopics(configForm.publishTopics.map((item, itemIndex) => itemIndex === index ? topic : item))
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
  rename: Pencil,
  log: Logs,
  'clear-selected': BadgeX,
  'clear-all': Eraser,
  collapse: ChevronsLeft,
  expand: ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  folder: Folder,
  'folder-plus': FolderPlus,
  delete: Trash2,
  trash: Trash2,
  close: X,
  all: MqttDirectionGlyphAll,
  in: MqttDirectionGlyphIn,
  out: MqttDirectionGlyphOut,
  layout: LayoutPanelTop,
  star: Star,
  'copy-topic': Clipboard,
  'copy-payload': Copy,
  apply: CornerDownLeft,
  send: Send,
  more: MoreHorizontal,
  draft: ClipboardList,
  save: Save,
  refresh: RefreshCw,
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

function commandArgs(kind: MqttCommandTargetKind, id: string, list?: 'messages' | 'templates' | 'history'): Record<string, unknown> {
  return { kind, id, targetKind: kind, targetId: id, ...(list ? { list } : {}) }
}

function updateConfigDraft(input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>) {
  emit('updateConfigDraft', input)
}

function updateConnectionGroupDraft(input: Partial<Omit<MqttConnectionGroupDraft, 'mode' | 'targetId'>>) {
  emit('updateConnectionGroupDraft', input)
}

function connectionGroupOptionLabel(group: MqttConnectionGroup) {
  const depth = mqttConnectionGroupDepths.value.get(group.id) || 0
  return `${'  '.repeat(depth)}${group.name}`
}

function refreshConfigClientId() {
  emit('dispatch', 'mqtt.config.clientId.refresh')
}

function qosFromInput(value: string): MqttQos {
  return value === '1' ? 1 : value === '2' ? 2 : 0
}

function createSubscriptionEditorItem(): MqttSubscriptionEditorItem {
  return {
    id: `mqtt-subscription-ui:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
    topic: '',
    alias: '',
    color: normalizeMqttTopicColor('', subscriptionDraft.value?.items.length || 0)
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

function updateSubscriptionEditorItem(id: string, input: Partial<Pick<MqttSubscriptionEditorItem, 'topic' | 'alias' | 'color'>>) {
  if (!subscriptionDraft.value) return
  updateSubscriptionDraft({
    items: subscriptionDraft.value.items.map((item) => item.id === id ? { ...item, ...input } : item)
  })
}

function focusSubscriptionEditorField(itemId: string, field: MqttSubscriptionEditorField) {
  if (subscriptionDraft.value?.activeItemId === itemId && subscriptionDraft.value.activeField === field) return
  updateSubscriptionDraft({ activeItemId: itemId, activeField: field })
}

function isPlainEscape(event: KeyboardEvent, key: string) {
  return key === 'escape' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
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
  if (isPlainEscape(event, key)) {
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
  if (!command && !event.altKey && !event.shiftKey && (key === 'arrowdown' || key === 'arrowup')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', key === 'arrowdown' ? 'mqtt.subscription.editor.nextRow' : 'mqtt.subscription.editor.prevRow')
    return
  }
  if (command && (key === 'delete' || key === 'backspace')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.subscription.editor.deleteRow')
    return
  }
}

function updateRecordEditDraft(input: Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>) {
  emit('updateRecordEditDraft', input)
}

function updatePublishDraftHistoryEditDraft(input: Partial<Pick<MqttPublishDraftHistoryEditDraft, 'title' | 'note' | 'topic' | 'payload' | 'activeField'>>) {
  emit('updatePublishDraftHistoryEditDraft', input)
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
  if (isPlainEscape(event, key)) {
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
}

function handlePublishDraftHistoryEditorKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (command && (key === 's' || key === 'enter')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.publish.draft.edit.save')
    return
  }
  if (isPlainEscape(event, key)) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.publish.draft.edit.cancel')
    return
  }
  if (key === 'tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', event.shiftKey ? 'mqtt.publish.draft.edit.prevField' : 'mqtt.publish.draft.edit.nextField')
    return
  }
}

function handleConfigRowKeydown(event: KeyboardEvent, key: string, command: boolean) {
  const target = event.target as HTMLElement | null
  const role = target?.closest<HTMLElement>('[data-role]')?.dataset.role
  if (role !== 'mqtt-config-subscription-editor' && role !== 'mqtt-config-publish-editor') return false
  const prefix = role === 'mqtt-config-subscription-editor' ? 'mqtt.config.subscription' : 'mqtt.config.publish'
  if (!command && !event.altKey && !event.shiftKey && (key === 'arrowdown' || key === 'arrowup')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', `${prefix}.${key === 'arrowdown' ? 'nextRow' : 'prevRow'}`)
    return true
  }
  if (command && (key === 'delete' || key === 'backspace')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', `${prefix}.deleteRow`)
    return true
  }
  return false
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
  if (isPlainEscape(event, key)) {
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
  if (handleConfigRowKeydown(event, key, command)) return
}

function handleConnectionGroupEditorKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (command && (key === 's' || key === 'enter')) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.connectionGroup.save')
    return
  }
  if (isPlainEscape(event, key)) {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.connectionGroup.cancel')
    return
  }
  if (key === 'tab') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', event.shiftKey ? 'mqtt.connectionGroup.prevField' : 'mqtt.connectionGroup.nextField')
  }
}

function handleConnectionGroupInlineRenameKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (event.shiftKey && !command && !event.altKey && key === 'escape') return
  if (!command && !event.altKey && !event.shiftKey && key === 'enter') {
    event.preventDefault()
    event.stopPropagation()
    emit('dispatch', 'mqtt.connectionGroup.save')
    return
  }
  handleConnectionGroupEditorKeydown(event)
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

function statusTone(state: AppRuntimeSnapshot['mqttConnectionStatus']['state']) {
  if (state === 'connected') return 'connected'
  if (state === 'error') return 'error'
  return 'idle'
}

function connectionEndpointTitle(config: AppRuntimeSnapshot['mqttActiveConfig']) {
  return config ? mqttEndpointHostPortLabel(config.url) || config.url || '未配置地址' : '未选择配置'
}

function focusMqttRuntimeTarget() {
  const target = props.snapshot.mqttFocusTarget
  let selector = props.snapshot.mqttPublishRecordsOpen ? '.mqtt-publish-record-list' : '.mqtt-message-list'
  if (target === 'topic-filter') selector = props.snapshot.mqttTopicFilterOpen ? '.mqtt-topic-filter-search' : '.mqtt-topic-filter-button'
  if (target === 'publish-topic') selector = '[data-mqtt-publish-field="topic"]'
  if (target === 'publish-payload') selector = '[data-mqtt-publish-field="payload"]'
  if (target === 'publish-options') selector = '.mqtt-publish-options-popover'
  if (target === 'publish-draft') selector = '[data-role="mqtt-publish-draft"]'
  if (target === 'publish-draft-edit-title') selector = '[data-mqtt-publish-draft-field="title"]'
  if (target === 'publish-draft-edit-note') selector = '[data-mqtt-publish-draft-field="note"]'
  if (target === 'publish-draft-edit-topic') selector = '[data-mqtt-publish-draft-field="topic"]'
  if (target === 'publish-draft-edit-payload') selector = '[data-mqtt-publish-draft-field="payload"]'
  if (target === 'connections') selector = '.mqtt-connection-rail'
  if (target === 'subscriptions') selector = '.mqtt-subscription-list'
  const element = document.querySelector<HTMLElement>(selector)
  element?.focus()
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(element.value.length, element.value.length)
  }
}

function openTopicFilter() {
  emit('dispatch', 'mqtt.topicFilter.focus')
}

function updateTopicFilterSearch(value: string) {
  emit('dispatch', 'mqtt.topicFilter.search.set', { query: value })
}

function selectTopicFilter(topic: string) {
  emit('dispatch', 'mqtt.topicFilter.select', { topic })
}

function selectPublishOption(option: string) {
  emit('dispatch', 'mqtt.publish.options.select', { option })
}

function publishDraftHistoryRowArgs(row: MqttPublishDraftHistoryEntry): Record<string, unknown> {
  return { kind: 'publish-draft-history', id: row.id, targetKind: 'publish-draft-history', targetId: row.id }
}

function publishDraftHistoryTitle(row: MqttPublishDraftHistoryEntry) {
  return row.title.trim() || row.topic || '(empty topic)'
}

function publishDraftHistorySourceLabel(row: MqttPublishDraftHistoryEntry) {
  return row.source === 'manual' ? '手动' : '覆盖前'
}

function applyPublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.apply', publishDraftHistoryRowArgs(row))
}

function sendPublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.send', publishDraftHistoryRowArgs(row))
}

function favoritePublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.favorite', publishDraftHistoryRowArgs(row))
}

function focusPublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.focus', publishDraftHistoryRowArgs(row))
}

function previewPublishDraftHistory(row: MqttPublishDraftHistoryEntry, event?: MouseEvent) {
  focusPublishDraftHistory(row)
  schedulePreview('publish-draft-history', row.id, event)
}

function togglePublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.toggleSelect', publishDraftHistoryRowArgs(row))
}

function openPublishDraftHistoryDetail(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.detail.open', publishDraftHistoryRowArgs(row))
}

function openPublishDraftHistoryMenu(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.drawer.open', publishDraftHistoryRowArgs(row))
}

function renamePublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.rename', publishDraftHistoryRowArgs(row))
}

function editPublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.edit', publishDraftHistoryRowArgs(row))
}

function deletePublishDraftHistory(row: MqttPublishDraftHistoryEntry) {
  emit('dispatch', 'mqtt.publish.draft.delete', publishDraftHistoryRowArgs(row))
}

function publishDraftHistorySelected(row: MqttPublishDraftHistoryEntry) {
  return props.snapshot.mqttPublishDraftHistorySelectedIds.includes(row.id)
}

function detailRecordCommandArgs(): Record<string, unknown> {
  const target = detailTarget.value
  const record = detailRecord.value
  if (!target || !record) return {}
  if (target.kind === 'publish-draft-history') return { kind: 'publish-draft-history', id: record.id, targetKind: 'publish-draft-history', targetId: record.id }
  return commandArgs(target.kind === 'publish-template' ? 'publish-template' : 'message', record.id)
}

function selectRecord(kind: 'config' | 'connection-group' | 'subscription' | 'session' | 'message' | 'log', id: string, list: 'messages' | 'history' = 'messages') {
  if (kind === 'config') emit('focusConfig', id)
  if (kind === 'connection-group') emit('focusConnectionGroup', id)
  if (kind === 'subscription') emit('dispatch', 'mqtt.subscription.focus', { topic: id })
  if (kind === 'session') emit('focusSession', id)
  if (kind === 'message') emit('dispatch', 'mqtt.record.focus', commandArgs('message', id, list))
  if (kind === 'log') emit('focusLog', id)
}

function recordSelected(kind: 'config' | 'connection-group' | 'subscription' | 'session' | 'message' | 'log' | 'publish-template', id: string) {
  return props.snapshot.mqttSelectedRecord?.kind === kind && props.snapshot.mqttSelectedRecord.id === id
}

function connectionSelected(id: string) {
  return props.snapshot.mqttSelectedConfigIds.includes(id)
}

function focusConfigAndDispatch(configId: string, actionId: string) {
  emit('focusConfig', configId)
  emit('dispatch', actionId, commandArgs('config', configId))
}

function connectionRowArgs(row: MqttConnectionRow): Record<string, unknown> {
  const kind: MqttCommandTargetKind = row.kind === 'group' ? 'connection-group' : 'config'
  return commandArgs(kind, row.id)
}

function connectionTreeTargetArgs(row: MqttConnectionRow, prefix = 'target'): Record<string, unknown> {
  return {
    [`${prefix}Kind`]: row.kind,
    [`${prefix}Id`]: row.id
  }
}

function selectConnectionRow(row: MqttConnectionRow) {
  if (row.kind === 'group') selectRecord('connection-group', row.id)
  else selectRecord('config', row.id)
}

function focusConnectionRow(row: MqttConnectionRow) {
  if (row.kind === 'group') emit('focusConnectionGroup', row.id)
  else emit('focusConfig', row.id)
}

function openConnectionRowMenu(row: MqttConnectionRow) {
  selectConnectionRow(row)
  emit('dispatch', 'mqtt.drawer.open', connectionRowArgs(row))
}

function openConnectionGroupMenu(row: MqttConnectionRow) {
  openConnectionRowMenu(row)
}

function focusConnectionRowAndDispatch(row: MqttConnectionRow, actionId: string) {
  focusConnectionRow(row)
  emit('dispatch', actionId, connectionRowArgs(row))
}

function openConnectionMenu(config: AppRuntimeSnapshot['state']['mqtt']['configs'][number]) {
  selectRecord('config', config.id)
  emit('dispatch', 'mqtt.drawer.open', commandArgs('config', config.id))
}

function toggleConnectionSelection(configId: string) {
  emit('dispatch', 'mqtt.connection.toggleSelect', commandArgs('config', configId))
}

function toggleConnectionGroup(row: MqttConnectionRow) {
  if (row.kind !== 'group') return
  emit('dispatch', row.collapsed ? 'mqtt.connectionGroup.expand' : 'mqtt.connectionGroup.collapse', connectionRowArgs(row))
}

function connectionTreeDropPosition(event: DragEvent, row: MqttConnectionRow): MqttConnectionDropPosition {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  if (!rect) return row.kind === 'group' ? 'inside' : 'after'
  const y = event.clientY - rect.top
  if (y < rect.height * 0.28) return 'before'
  if (y > rect.height * 0.72) return 'after'
  return row.kind === 'group' ? 'inside' : 'after'
}

function startConnectionTreeDrag(event: DragEvent, row: MqttConnectionRow) {
  connectionTreeDragTarget.value = { kind: row.kind, id: row.id }
  connectionTreeDropTarget.value = null
  event.dataTransfer?.setData('text/plain', `${row.kind}:${row.id}`)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function handleConnectionTreeDragOver(event: DragEvent, row: MqttConnectionRow) {
  const moving = connectionTreeDragTarget.value
  if (!moving || (moving.kind === row.kind && moving.id === row.id)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  connectionTreeDropTarget.value = { rowId: row.rowId, position: connectionTreeDropPosition(event, row) }
}

function dropConnectionTreeRow(event: DragEvent, row: MqttConnectionRow) {
  const moving = connectionTreeDragTarget.value
  if (!moving) return
  event.preventDefault()
  const position = connectionTreeDropTarget.value?.rowId === row.rowId ? connectionTreeDropTarget.value.position : connectionTreeDropPosition(event, row)
  emit('dispatch', 'mqtt.connectionTree.move', {
    movingKind: moving.kind,
    movingId: moving.id,
    ...connectionTreeTargetArgs(row),
    position
  })
  connectionTreeDragTarget.value = null
  connectionTreeDropTarget.value = null
}

function clearConnectionTreeDragState() {
  connectionTreeDragTarget.value = null
  connectionTreeDropTarget.value = null
}

function selectLog(id: string) {
  selectRecord('log', id)
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

function searchActiveRecordList(query: string) {
  if (props.snapshot.activeMqttRecordList === 'templates') {
    searchPublishRecords('templates', query)
    return
  }
  if (props.snapshot.activeMqttRecordList === 'history') {
    searchPublishRecords('history', query)
    return
  }
  emit('search', query)
}

function closeToolbarSearchIfEmpty() {
  if (!activeToolbarSearchValue.value.trim()) mqttToolbarSearchOpen.value = false
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

function messageAlias(message: MqttMessageRecord) {
  return message.title?.trim() || ''
}

function messageRouteLabel(message: MqttMessageRecord) {
  return messageAlias(message) || mqttTopicVisual(message.topic).alias || message.topic || '(empty topic)'
}

function mqttTopicVisual(topic: string) {
  return mqttTopicVisualForMessage(topic, activeConfig.value)
}

function topicVisualStyle(topic: string) {
  return { '--mqtt-topic-color': mqttTopicVisual(topic).color } as CSSProperties
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

function directionLabel(message: MqttPreviewRecord) {
  if ('source' in message) return 'DRAFT'
  if ('direction' in message) {
    if (message.direction === 'incoming') return 'IN'
    if (message.direction === 'outgoing') return 'OUT'
    return 'EVENT'
  }
  return 'TPL'
}

function directionAccessibleLabel(message: MqttPreviewRecord) {
  if ('source' in message) return '草稿'
  if ('direction' in message) {
    if (message.direction === 'incoming') return '接收消息'
    if (message.direction === 'outgoing') return '发送消息'
    return '事件消息'
  }
  return '收藏消息'
}

function directionIconName(message: MqttPreviewRecord) {
  if ('source' in message) return 'draft'
  if ('direction' in message) {
    if (message.direction === 'incoming') return 'in'
    if (message.direction === 'outgoing') return 'out'
  }
  return 'all'
}

function recordTime(record: MqttPreviewRecord) {
  if ('timestamp' in record) return record.timestamp
  if ('source' in record) return record.updatedAt
  return mqttPublishTemplateOperationTime(record)
}

function logConfigName(log: AppRuntimeSnapshot['mqttLogs'][number]) {
  return props.snapshot.state.mqtt.configs.find((config) => config.id === log.connectionId)?.name || '未关联连接'
}

function padDateTimePart(value: number) {
  return String(value).padStart(2, '0')
}

function formatTime(value: number) {
  return formatCompactDateTime(value).time
}

function formatDateTime(value: number) {
  return formatFullDateTime(value)
}

function isSameCalendarDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function formatCompactDateTime(value: number) {
  if (!value) return { date: '', time: '', full: '', iso: '', isToday: false }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: '', time: '', full: '', iso: '', isToday: false }
  const now = new Date()
  const isToday = isSameCalendarDate(date, now)
  const monthDay = [date.getMonth() + 1, date.getDate()].map(padDateTimePart).join('-')
  const dayLabel = isToday ? '' : date.getFullYear() === now.getFullYear() ? monthDay : `${date.getFullYear()}-${monthDay}`
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(padDateTimePart).join(':')
  return {
    date: dayLabel,
    time,
    full: [dayLabel, time].filter(Boolean).join(' '),
    iso: date.toISOString(),
    isToday
  }
}

function formatFullDateTime(value: number) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index === 0 ? String(part) : padDateTimePart(part))
    .join('-')
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(padDateTimePart).join(':')
  return `${day} ${time}`
}

function formatPublishDraftHistoryTime(value: number) {
  return formatDateTime(value)
}

function messageHoverTitle(message: MqttMessageRecord) {
  const flags = [`QoS ${message.qos}`]
  if (message.retain) flags.push('retain')
  return [
    message.topic || '(empty topic)',
    flags.join(' · '),
    formatDateTime(message.timestamp)
  ].filter(Boolean).join('\n')
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

function openSubscriptionMenu(topic: string) {
  selectRecord('subscription', topic)
  emit('dispatch', 'mqtt.drawer.open', commandArgs('subscription', topic))
}

function copySubscriptionTopic(topic: string) {
  selectRecord('subscription', topic)
  emit('dispatch', 'mqtt.subscription.copyTopic', commandArgs('subscription', topic))
}

function useSubscriptionTopic(topic: string) {
  selectRecord('subscription', topic)
  emit('dispatch', 'mqtt.subscription.useAsPublishTopic', commandArgs('subscription', topic))
}

function configSubscriptionRowFocused(index: number) {
  const draft = props.snapshot.mqttConfigDraft
  return draft?.activeField === 'subscriptions' && draft.activeSubscriptionIndex === index
}

function configPublishRowFocused(index: number) {
  const draft = props.snapshot.mqttConfigDraft
  return draft?.activeField === 'publishTopic' && draft.activePublishIndex === index
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

function handlePreviewWheel(event: WheelEvent) {
  const element = previewPayloadRef.value
  if (!element || !props.snapshot.mqttPreview.open) return
  clearPreviewCloseTimer()
  const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  const wheelDelta = event.deltaMode === 1
    ? rawDelta * 16
    : event.deltaMode === 2
      ? rawDelta * element.clientHeight
      : rawDelta
  const scrollTop = clampPreviewPayloadScroll(element.scrollTop + wheelDelta)
  if (Math.abs(element.scrollTop - scrollTop) > 0.5) element.scrollTop = scrollTop
  if (Math.abs(props.snapshot.mqttPreview.scrollTop - scrollTop) > 0.5) {
    emit('dispatch', 'mqtt.preview.scroll.set', { scrollTop })
  }
}

function previewTargetValue(kind: MqttPreviewTarget['kind'], id: string) {
  return `${kind}:${id}`
}

function findPreviewTarget(kind: MqttPreviewTarget['kind'] | null, id: string | null): HTMLElement | null {
  if (!kind || !id) return null
  const target = previewTargetValue(kind, id)
  return Array.from(document.querySelectorAll<HTMLElement>('[data-mqtt-preview-target]'))
    .find((element) => element.dataset.mqttPreviewTarget === target) || null
}

function previewTargetFromElement(element: EventTarget | null): MqttPreviewTarget | null {
  const target = element instanceof HTMLElement
    ? element.closest<HTMLElement>('[data-mqtt-preview-target]')?.dataset.mqttPreviewTarget || ''
    : ''
  const separatorIndex = target.indexOf(':')
  if (separatorIndex <= 0) return null
  const kind = target.slice(0, separatorIndex)
  const id = target.slice(separatorIndex + 1)
  if ((kind === 'message' || kind === 'publish-template' || kind === 'publish-draft-history') && id) return { kind, id }
  return null
}

function samePreviewTarget(left: MqttPreviewTarget | null, right: MqttPreviewTarget | null) {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id)
}

function targetInsidePublishDraftHistoryPopover(element: EventTarget | null) {
  return element instanceof HTMLElement && Boolean(element.closest('.mqtt-publish-draft-popover'))
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

function openPreviewForTarget(target: MqttPreviewTarget, source: 'hover' | 'shift', anchor?: HTMLElement | null) {
  if (source === 'shift') {
    clearPreviewTimer()
    clearPreviewCloseTimer()
  }
  updatePreviewPosition(anchor || findPreviewTarget(target.kind, target.id))
  const args = source === 'shift'
    ? { ...commandArgs(target.kind, target.id), source: 'shift' }
    : { ...commandArgs(target.kind, target.id), source: 'hover' }
  emit('dispatch', 'mqtt.preview.open', args)
}

function schedulePreview(kind: MqttPreviewTarget['kind'], id: string, event?: MouseEvent) {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  const target = { kind, id }
  hoverPreviewTarget.value = target
  const anchor = event?.currentTarget instanceof HTMLElement ? event.currentTarget : findPreviewTarget(kind, id)
  if (props.shiftPreview) {
    if (!hoverPreviewSuspendedByKeyboard.value) openShiftPreviewForTarget(target, anchor)
    return
  }
  if (kind === 'publish-draft-history') return
  if (props.snapshot.mqttConfigDraft || props.snapshot.mqttConnectionGroupDraft || props.snapshot.mqttSubscriptionDraft || props.snapshot.mqttFavoriteDraft) return
  if (!props.snapshot.toolPreviewPrefs.hoverPreviewEnabled) return
  previewTimer = window.setTimeout(() => {
    openPreviewForTarget(target, 'hover', anchor)
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
  return { kind: selected.kind, id: selected.id }
}

function activePublishDraftHistoryPreviewTarget(): MqttPreviewTarget | null {
  if (!props.snapshot.mqttPublishDraftHistoryOpen) return null
  const row = props.snapshot.mqttPublishDraftHistoryRows[props.snapshot.mqttPublishDraftHistoryActiveIndex]
  return row ? { kind: 'publish-draft-history', id: row.id } : null
}

function activeShiftPreviewTarget() {
  const draftTarget = activePublishDraftHistoryPreviewTarget()
  if (draftTarget) return draftTarget
  return !hoverPreviewSuspendedByKeyboard.value && hoverPreviewTarget.value
    ? hoverPreviewTarget.value
    : selectedPreviewTarget()
}

function openShiftPreviewForTarget(target: MqttPreviewTarget | null = activeShiftPreviewTarget(), anchor?: HTMLElement | null) {
  if (!props.shiftPreview || !target) {
    if (props.snapshot.mqttPreview.source === 'shift') emit('dispatch', 'mqtt.preview.close')
    return false
  }
  const previewNeedsShiftSource = props.snapshot.mqttPreview.source !== 'shift'
  if (
    props.snapshot.mqttPreview.open &&
    !previewNeedsShiftSource &&
    props.snapshot.mqttPreview.targetKind === target.kind &&
    props.snapshot.mqttPreview.targetId === target.id
  ) {
    updatePreviewPosition(findPreviewTarget(target.kind, target.id))
    return true
  }
  openPreviewForTarget(target, 'shift', anchor)
  return true
}

function handlePreviewPointerMove(event: MouseEvent) {
  const position = { x: event.clientX, y: event.clientY }
  const moved = lastPreviewPointerPosition.value.x !== position.x || lastPreviewPointerPosition.value.y !== position.y
  lastPreviewPointerPosition.value = position
  if (!moved) return
  hoverPreviewSuspendedByKeyboard.value = false
  const target = previewTargetFromElement(event.target)
  if (targetInsidePublishDraftHistoryPopover(event.target)) {
    clearPreviewTimer()
    if (target) {
      hoverPreviewTarget.value = target
      if (props.shiftPreview) openShiftPreviewForTarget(target)
      return
    }
    hoverPreviewTarget.value = null
    if (props.snapshot.mqttPreview.source === 'hover') emit('dispatch', 'mqtt.preview.close')
    if (props.shiftPreview) openShiftPreviewForTarget(activePublishDraftHistoryPreviewTarget())
    return
  }
  if (target) {
    hoverPreviewTarget.value = target
    if (props.shiftPreview) openShiftPreviewForTarget(target)
  }
}

function enterPublishDraftHistoryPopover() {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  if (props.snapshot.mqttPreview.source === 'hover') emit('dispatch', 'mqtt.preview.close')
}

function handlePublishDraftHistoryPointerMove(event: MouseEvent) {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  hoverPreviewSuspendedByKeyboard.value = false
  const target = previewTargetFromElement(event.target)
  if (target?.kind === 'publish-draft-history') {
    hoverPreviewTarget.value = target
    if (props.shiftPreview) openShiftPreviewForTarget(target)
    return
  }
  hoverPreviewTarget.value = null
  if (props.snapshot.mqttPreview.source === 'hover') emit('dispatch', 'mqtt.preview.close')
  if (props.shiftPreview) openShiftPreviewForTarget(activePublishDraftHistoryPreviewTarget())
}

function handlePublishDraftHistoryOutsidePointerdown(event: PointerEvent) {
  if (!props.snapshot.mqttPublishDraftHistoryOpen || props.snapshot.mqttPublishDraftHistoryEditDraft) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target && target.closest('.mqtt-publish-draft-anchor')) return
  emit('dispatch', 'mqtt.publish.draft.close')
}

function handlePublishOptionsOutsidePointerdown(event: PointerEvent) {
  if (!props.snapshot.mqttPublishOptionsOpen) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target && target.closest('.mqtt-publish-options-anchor')) return
  emit('dispatch', 'mqtt.publish.options.close')
}

watch(() => props.shiftPreview ? '1' : '0', () => {
  if (!props.shiftPreview) {
    hoverPreviewSuspendedByKeyboard.value = false
    if (props.snapshot.mqttPreview.source === 'shift') emit('dispatch', 'mqtt.preview.close')
    return
  }
  void nextTick(() => {
    openShiftPreviewForTarget()
  })
})

watch(() => [
  props.snapshot.mqttSelectedRecord?.kind || '',
  props.snapshot.mqttSelectedRecord?.id || ''
].join(':'), () => {
  if (!props.shiftPreview) return
  const target = selectedPreviewTarget()
  if (target && hoverPreviewTarget.value && !samePreviewTarget(target, hoverPreviewTarget.value)) {
    hoverPreviewSuspendedByKeyboard.value = true
  }
  void nextTick(() => {
    openShiftPreviewForTarget(target || activeShiftPreviewTarget())
  })
})

watch(() => [
  props.snapshot.mqttPublishDraftHistoryOpen ? '1' : '0',
  props.snapshot.mqttPublishDraftHistoryActiveIndex,
  props.snapshot.mqttPublishDraftHistoryRows.map((row) => row.id).join(',')
].join(':'), () => {
  if (!props.shiftPreview || !props.snapshot.mqttPublishDraftHistoryOpen) return
  hoverPreviewSuspendedByKeyboard.value = true
  void nextTick(() => {
    openShiftPreviewForTarget(activePublishDraftHistoryPreviewTarget())
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
  props.snapshot.mqttPublishDraftHistoryOpen,
  props.snapshot.mqttWorkspaceLayout,
  props.snapshot.mqttLayoutPrefs.stackReceiveRatio,
  props.snapshot.mqttLayoutPrefs.splitReceiveRatio,
  props.snapshot.mqttReceiveFilter,
  props.snapshot.mqttTemplateSearch,
  props.snapshot.activeMqttRecordList,
  props.snapshot.mqttMessageRows.length,
  props.snapshot.mqttPublishTemplateRows.length,
  props.snapshot.mqttPublishHistoryRows.length,
  props.snapshot.mqttPublishDraftHistoryRows.length,
  props.snapshot.mqttSelectedSubscriptionTopics.length,
  Boolean(props.snapshot.mqttConfigDraft),
  Boolean(props.snapshot.mqttConnectionGroupDraft),
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
  document.addEventListener('pointerdown', handlePublishDraftHistoryOutsidePointerdown, true)
  document.addEventListener('pointerdown', handlePublishOptionsOutsidePointerdown, true)
})

onUnmounted(() => {
  clearPreviewTimer()
  clearPreviewCloseTimer()
  clearShortcutHintFrame()
  window.removeEventListener('resize', handlePreviewViewportChange)
  window.removeEventListener('scroll', handlePreviewViewportChange, true)
  window.removeEventListener('resize', handleShortcutHintViewportChange)
  window.removeEventListener('scroll', handleShortcutHintViewportChange, true)
  document.removeEventListener('pointerdown', handlePublishDraftHistoryOutsidePointerdown, true)
  document.removeEventListener('pointerdown', handlePublishOptionsOutsidePointerdown, true)
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
      aria-label="展开连接栏"
      @click="emit('dispatch', 'mqtt.panel.toggle')"
    >
      <span class="group-panel-toggle-icon" aria-hidden="true"></span>
    </button>

    <aside v-if="props.snapshot.mqttPanelOpen" class="mqtt-connection-rail" tabindex="-1">
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
          @update:model-value="emit('search', $event)"
        />
        <button type="button" class="mqtt-icon-button add-folder-button" :title="commandTitle('新建连接', 'mqtt.config.create', 'c-n')" aria-label="新建连接" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.config.create')" @click="emit('dispatch', 'mqtt.config.create', { groupId: null })">
          <MqttIcon name="add" />
        </button>
        <button type="button" class="mqtt-icon-button add-folder-button" :title="commandTitle('新建分组', 'mqtt.connectionGroup.create', 'c-g')" aria-label="新建分组" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connectionGroup.create')" @click="emit('dispatch', 'mqtt.connectionGroup.create', { parentId: null })">
          <MqttIcon name="folder-plus" />
        </button>
      </div>

      <div class="mqtt-config-list mqtt-connection-tree" role="tree" data-role="mqtt-connections">
        <article
          v-for="row in props.snapshot.mqttConnectionRows"
          :key="row.rowId"
          class="mqtt-connection-row"
          :class="[
            row.kind === 'group' ? 'mqtt-connection-group-row' : 'mqtt-config-card',
            {
              active: row.active,
              focused: row.focused,
              selected: row.kind === 'config' && connectionSelected(row.id),
              'drop-before': connectionTreeDropTarget?.rowId === row.rowId && connectionTreeDropTarget.position === 'before',
              'drop-inside': connectionTreeDropTarget?.rowId === row.rowId && connectionTreeDropTarget.position === 'inside',
              'drop-after': connectionTreeDropTarget?.rowId === row.rowId && connectionTreeDropTarget.position === 'after'
            }
          ]"
          data-role="mqtt-connections"
          tabindex="0"
          role="treeitem"
          draggable="true"
          :data-operation-tooltip="`${row.kind === 'group' ? '连接分组' : 'MQTT 连接'} ${row.name}`"
          data-operation-description="单击聚焦；右键显示相关操作；可拖拽调整层级"
          :style="{ '--tree-depth': row.depth, '--group-color': row.kind === 'group' ? row.color : undefined }"
          :aria-level="row.depth + 1"
          :aria-expanded="row.kind === 'group' ? !row.collapsed : undefined"
          :aria-selected="row.focused || row.active"
          :data-quick-jump-label="row.name"
          :data-quick-jump-search="row.config?.url || row.name"
          @click="selectConnectionRow(row)"
          @focus="focusConnectionRow(row)"
          @contextmenu.prevent="row.kind === 'group' ? openConnectionGroupMenu(row) : row.config && openConnectionMenu(row.config)"
          @dragstart="startConnectionTreeDrag($event, row)"
          @dragover="handleConnectionTreeDragOver($event, row)"
          @dragleave="connectionTreeDropTarget = null"
          @drop="dropConnectionTreeRow($event, row)"
          @dragend="clearConnectionTreeDragState"
          @keydown.space.prevent.stop="row.kind === 'config' && toggleConnectionSelection(row.id)"
          @keydown.delete.prevent.stop="emit('dispatch', row.kind === 'group' ? 'mqtt.connectionGroup.delete' : 'mqtt.connection.delete', connectionRowArgs(row))"
          @keydown.backspace.prevent.stop="emit('dispatch', row.kind === 'group' ? 'mqtt.connectionGroup.delete' : 'mqtt.connection.delete', connectionRowArgs(row))"
          @keydown.left.exact.prevent.stop="row.kind === 'group' && emit('dispatch', 'mqtt.connectionGroup.collapse', connectionRowArgs(row))"
          @keydown.right.exact.prevent.stop="row.kind === 'group' && emit('dispatch', 'mqtt.connectionGroup.expand', connectionRowArgs(row))"
        >
          <template v-if="row.kind === 'group' && row.group">
            <header class="mqtt-connection-group-header">
              <button type="button" class="mqtt-icon-button mqtt-tree-disclosure" :title="row.collapsed ? '展开分组' : '折叠分组'" :aria-label="row.collapsed ? '展开分组' : '折叠分组'" @click.stop="toggleConnectionGroup(row)">
                <MqttIcon :name="row.collapsed ? 'chevron-right' : 'chevron-down'" />
              </button>
              <span class="mqtt-connection-group-title">
                <input
                  v-if="props.snapshot.mqttConnectionGroupDraft?.mode === 'rename' && props.snapshot.mqttConnectionGroupDraft.targetId === row.id"
                  class="mqtt-connection-group-inline-rename"
                  data-role="mqtt-connection-group-editor"
                  data-mqtt-connection-group-field="name"
                  :value="props.snapshot.mqttConnectionGroupDraft.name"
                  :aria-label="`重命名分组 ${row.name}`"
                  @click.stop
                  @dblclick.stop
                  @focus="updateConnectionGroupDraft({ activeField: 'name' })"
                  @input="updateConnectionGroupDraft({ name: ($event.target as HTMLInputElement).value })"
                  @keydown="handleConnectionGroupInlineRenameKeydown"
                />
                <strong v-else class="mqtt-connection-address-title" :title="row.name">{{ row.name }}</strong>
              </span>
              <small class="mqtt-connection-group-count">{{ row.childCount }} 项</small>
            </header>
            <div class="mqtt-config-actions mqtt-connection-group-actions">
              <button type="button" class="mqtt-icon-button" :title="commandTitle('新建子分组', 'mqtt.connectionGroup.create', 'c-g')" aria-label="新建子分组" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connectionGroup.create')" @click.stop="emit('dispatch', 'mqtt.connectionGroup.create', { parentId: row.id })">
                <MqttIcon name="folder-plus" />
              </button>
              <button type="button" class="mqtt-icon-button" :title="commandTitle('重命名分组', 'mqtt.connectionGroup.rename', 's-f2')" aria-label="重命名分组" @click.stop="focusConnectionRowAndDispatch(row, 'mqtt.connectionGroup.rename')">
                <MqttIcon name="rename" />
              </button>
              <button type="button" class="mqtt-icon-button" :title="commandTitle('分组更多操作', 'mqtt.drawer.open', 'c-→')" aria-label="分组更多操作" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.drawer.open')" @click.stop="openConnectionGroupMenu(row)">
                <MqttIcon name="more" />
              </button>
            </div>
          </template>
          <template v-else-if="row.config">
          <header>
            <span>
              <strong class="mqtt-connection-address-title" :title="connectionEndpointTitle(row.config)">{{ row.config.name }}</strong>
              <small>{{ row.config.url || '未配置服务器地址' }}</small>
            </span>
            <em>{{ row.config.autoReconnect ? `重连 ${row.config.reconnectPeriodMs}ms` : '手动重连' }}</em>
          </header>
          <div class="mqtt-config-actions">
            <button type="button" class="mqtt-icon-button" :title="commandTitle('连接', 'mqtt.connection.connect', 'c-r')" aria-label="连接" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connection.connect')" @click.stop="focusConfigAndDispatch(row.config.id, 'mqtt.connection.connect')">
              <MqttIcon name="connect" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('断开', 'mqtt.connection.disconnect', 'c-s-r')" aria-label="断开" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connection.disconnect')" @click.stop="focusConfigAndDispatch(row.config.id, 'mqtt.connection.disconnect')">
              <MqttIcon name="disconnect" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('快捷操作', 'mqtt.drawer.open', 'c-→')" aria-label="连接快捷操作" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.drawer.open')" @click.stop="openConnectionMenu(row.config)">
              <MqttIcon name="more" />
            </button>
          </div>
          </template>
        </article>
        <p v-if="!props.snapshot.mqttConnectionRows.length" class="empty-note">暂无 MQTT 连接配置</p>
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
          role="option"
          tabindex="0"
          :data-operation-tooltip="`订阅 ${row.displayName}`"
          data-operation-description="单击聚焦；双击编辑；右键显示相关操作"
          :aria-selected="row.selected || row.focused || row.active"
          :class="{ active: row.active, selected: row.selected && !row.active, focused: row.focused }"
          :title="subscriptionTitle(row)"
          :data-quick-jump-label="row.displayName"
          :data-quick-jump-search="row.topic"
          @click.stop="selectSubscription(row.topic)"
          @contextmenu.prevent="openSubscriptionMenu(row.topic)"
          @dblclick.stop="emit('dispatch', 'mqtt.subscription.editor.open')"
          @focus="focusSubscription(row.topic)"
        >
          <span v-if="row.unreadCount" class="mqtt-subscription-unread">{{ row.unreadCount }}</span>
          <span class="mqtt-subscription-main">
            <strong>{{ row.displayName }}</strong>
            <small class="mqtt-subscription-route">{{ row.topic }}</small>
          </span>
          <span class="mqtt-subscription-row-actions" aria-label="订阅操作">
            <button type="button" class="mqtt-icon-button mqtt-subscription-copy" title="复制 topic" aria-label="复制订阅 topic" @click.stop="copySubscriptionTopic(row.topic)">
              <MqttIcon name="copy-topic" />
            </button>
            <button type="button" class="mqtt-icon-button mqtt-subscription-apply" title="填入发布" aria-label="填入发布 topic" @click.stop="useSubscriptionTopic(row.topic)">
              <MqttIcon name="apply" />
            </button>
            <button type="button" class="mqtt-icon-button mqtt-subscription-more" :title="commandTitle('快捷操作', 'mqtt.drawer.open', 'c-→')" aria-label="订阅快捷操作" @click.stop="openSubscriptionMenu(row.topic)">
              <MqttIcon name="more" />
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

    <main class="mqtt-message-workspace" :class="{ 'mqtt-workspace-split': props.snapshot.mqttWorkspaceLayout === 'split' }" @mousemove.passive="handlePreviewPointerMove">
      <header class="mqtt-workspace-toolbar mqtt-command-bar">
        <span class="mqtt-connection-summary">
          <span
            class="mqtt-status-indicator"
            :title="`${statusLabel(props.snapshot.mqttConnectionStatus.state)} · ${props.snapshot.mqttConnectionStatus.detail}`"
            :aria-label="`连接状态 ${statusLabel(props.snapshot.mqttConnectionStatus.state)}`"
          >
            <span class="mqtt-status-rect" :class="`mqtt-status-${statusTone(props.snapshot.mqttConnectionStatus.state)}`"></span>
          </span>
          <span class="mqtt-workspace-title">
            <span
              v-if="activeMqttToolbarFilter && activeMqttToolbarFilter !== 'favorites'"
              class="mqtt-workspace-filter-mark"
              :class="`mqtt-workspace-filter-mark-${activeMqttInfoTone}`"
              :title="directionFilterButtons.find((item) => item.id === activeMqttToolbarFilter)?.label || '全部'"
              aria-hidden="true"
            >
              <MqttIcon :name="activeMqttInfoIcon" />
            </span>
            <strong class="mqtt-connection-address-title" :title="connectionEndpointTitle(activeConfig)">{{ activeConfig?.name || '未选择配置' }}</strong>
            <small>{{ props.snapshot.mqttConnectionStatus.detail }}</small>
            <span class="mqtt-topic-filter">
              <button
                type="button"
                class="mqtt-topic-filter-button"
                data-role="mqtt-topic-filter"
                :class="{ active: props.snapshot.mqttTopicFilterOpen || props.snapshot.mqttActiveSubscriptionTopics.length }"
                :title="commandTitle('topic 筛选', 'mqtt.topicFilter.focus', 'c-s-f')"
                :aria-expanded="props.snapshot.mqttTopicFilterOpen"
                :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.topicFilter.focus')"
                @click="openTopicFilter"
              >
                {{ activeSubscriptionLabel }}
              </button>
              <div
                v-if="props.snapshot.mqttTopicFilterOpen"
                class="mqtt-topic-filter-menu"
                data-role="mqtt-topic-filter"
                tabindex="-1"
              >
                <input
                  class="mqtt-topic-filter-search"
                  data-role="mqtt-topic-filter"
                  :value="props.snapshot.mqttTopicFilterQuery"
                  placeholder="搜索别名/topic"
                  autocomplete="off"
                  @input="updateTopicFilterSearch(($event.target as HTMLInputElement).value)"
                />
                <button
                  v-for="option in props.snapshot.mqttTopicFilterOptions"
                  :key="option.topic || '__all__'"
                  type="button"
                  class="mqtt-topic-filter-option"
                  data-role="mqtt-topic-filter"
                  :class="{ active: option.active, highlighted: option.highlighted, 'mqtt-topic-filter-clear': !option.topic }"
                  :style="{ '--mqtt-topic-color': option.color }"
                  :title="option.topic || option.label"
                  @click="selectTopicFilter(option.topic)"
                >
                  <span>{{ option.label }}</span>
                  <small v-if="option.topic">{{ option.topic }}</small>
                </button>
                <p v-if="!props.snapshot.mqttTopicFilterOptions.some((option) => option.topic)" class="empty-note">暂无匹配 topic</p>
              </div>
            </span>
          </span>
        </span>
        <span class="mqtt-record-toolbar-slot" :class="{ searching: showMqttToolbarSearch }">
          <input
            v-if="showMqttToolbarSearch"
            class="mqtt-record-toolbar-search"
            :data-role="activeToolbarSearchRole"
            :value="activeToolbarSearchValue"
            :placeholder="activeToolbarSearchPlaceholder"
            :aria-label="activeToolbarSearchPlaceholder"
            :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.search.focus')"
            autocomplete="off"
            @input="searchActiveRecordList(($event.target as HTMLInputElement).value)"
            @blur="closeToolbarSearchIfEmpty"
          />
          <span v-else class="mqtt-filter-buttons mqtt-compact-filter-buttons" aria-label="收发筛选">
            <button
              v-for="item in directionFilterButtons"
              :key="item.id"
              type="button"
              class="mqtt-filter-button mqtt-icon-button"
              :class="[{ active: activeMqttToolbarFilter === item.id }, `mqtt-filter-button-${item.id}`]"
              :title="commandTitle(item.label, item.commandId)"
              :aria-label="`${item.label} ${item.count} 条`"
              :aria-pressed="activeMqttToolbarFilter === item.id"
              :data-mqtt-shortcut-hint="shortcutHintAttr(item.commandId)"
              @click="emit('dispatch', item.commandId)"
            >
              <component :is="iconComponent(item.icon)" class="mqtt-icon" aria-hidden="true" />
            </button>
          </span>
        </span>
        <span class="mqtt-record-mode-buttons" aria-label="记录视图">
          <button
            type="button"
            class="mqtt-filter-button mqtt-icon-button"
            :class="{ active: activeMqttToolbarFilter === 'favorites' }"
            :title="commandTitle('收藏', 'mqtt.focus.templates', 'c-m')"
            aria-label="显示收藏"
            :aria-pressed="activeMqttToolbarFilter === 'favorites'"
            :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.focus.templates')"
            @click="emit('dispatch', 'mqtt.focus.templates')"
          >
            <MqttIcon name="star" />
          </button>
          <button type="button" class="mqtt-filter-button mqtt-icon-button" :title="commandTitle('布局', 'mqtt.layout.toggle', 'c-s-s')" aria-label="切换布局" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.layout.toggle')" @click="emit('dispatch', 'mqtt.layout.toggle')">
            <MqttIcon name="layout" />
          </button>
        </span>
      </header>

      <div
        v-if="props.snapshot.mqttConnectionGroupDraft && props.snapshot.mqttConnectionGroupDraft.mode !== 'rename'"
        class="drawer-overlay drawer-overlay-right mqtt-config-drawer-overlay mqtt-connection-group-editor-modal"
        role="presentation"
        data-role="mqtt-connection-group-editor"
        @click="emit('dispatch', 'mqtt.connectionGroup.cancel')"
        @keydown="handleConnectionGroupEditorKeydown"
      >
        <aside
          class="mqtt-config-editor mqtt-config-drawer mqtt-connection-group-editor"
          role="dialog"
          aria-modal="true"
          :aria-label="props.snapshot.mqttConnectionGroupDraft.mode === 'create' ? '新建 MQTT 连接分组' : '编辑 MQTT 连接分组'"
          data-role="mqtt-connection-group-editor"
          @click.stop
        >
          <header>
            <span>
              <strong>{{ props.snapshot.mqttConnectionGroupDraft.mode === 'create' ? '新建分组' : props.snapshot.mqttConnectionGroupDraft.mode === 'move-parent' ? '移动父级' : '编辑分组' }}</strong>
              <small>{{ props.snapshot.mqttConnectionGroupDraft.mode === 'move-parent' ? '父级分组' : '连接树层级' }}</small>
            </span>
            <span class="mqtt-editor-actions">
              <button type="button" class="mqtt-icon-button" :title="commandTitle('取消', 'mqtt.connectionGroup.cancel', 'esc')" aria-label="取消分组编辑" @click="emit('dispatch', 'mqtt.connectionGroup.cancel')">
                <MqttIcon name="close" />
              </button>
              <button type="button" class="mqtt-icon-button" :title="commandTitle('保存分组', 'mqtt.connectionGroup.save', 'c-s')" aria-label="保存分组" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.connectionGroup.save')" @click="emit('dispatch', 'mqtt.connectionGroup.save')">
                <MqttIcon name="save" />
              </button>
            </span>
          </header>
          <div class="mqtt-config-drawer-grid">
            <label v-if="props.snapshot.mqttConnectionGroupDraft.mode !== 'move-parent'">
              分组名称
              <input
                data-role="mqtt-connection-group-editor"
                data-mqtt-connection-group-field="name"
                :value="props.snapshot.mqttConnectionGroupDraft.name"
                @focus="updateConnectionGroupDraft({ activeField: 'name' })"
                @input="updateConnectionGroupDraft({ name: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label v-if="props.snapshot.mqttConnectionGroupDraft.mode !== 'move-parent'">
              颜色
              <input
                type="color"
                data-role="mqtt-connection-group-editor"
                data-mqtt-connection-group-field="color"
                :value="props.snapshot.mqttConnectionGroupDraft.color"
                @focus="updateConnectionGroupDraft({ activeField: 'color' })"
                @input="updateConnectionGroupDraft({ color: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label>
              父级分组
              <select
                data-role="mqtt-connection-group-editor"
                data-mqtt-connection-group-field="parent"
                :value="props.snapshot.mqttConnectionGroupDraft.parentId || ''"
                @focus="updateConnectionGroupDraft({ activeField: 'parent' })"
                @change="updateConnectionGroupDraft({ parentId: ($event.target as HTMLSelectElement).value || null })"
              >
                <option value="">根级</option>
                <option v-for="group in mqttConnectionGroupParentOptions" :key="group.id" :value="group.id">{{ connectionGroupOptionLabel(group) }}</option>
              </select>
            </label>
          </div>
        </aside>
      </div>

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
                    所属分组
                    <select data-mqtt-field="groupId" data-role="mqtt-editor" :value="configForm.groupId || ''" @change="updateConfigDraft({ groupId: ($event.target as HTMLSelectElement).value || null })">
                      <option value="">根级</option>
                      <option v-for="group in props.snapshot.state.mqtt.connectionGroups" :key="group.id" :value="group.id">{{ connectionGroupOptionLabel(group) }}</option>
                    </select>
                  </label>
                  <label>
                    Client ID
                    <span class="mqtt-client-id-row">
                      <input data-mqtt-field="clientId" data-role="mqtt-editor" :value="configForm.clientId" @input="updateConfigDraft({ clientId: ($event.target as HTMLInputElement).value })" />
                      <button type="button" class="mqtt-icon-button" title="随机刷新 Client ID" aria-label="随机刷新 Client ID" @click="refreshConfigClientId">
                        <MqttIcon name="refresh" />
                      </button>
                    </span>
                  </label>
                  <section class="mqtt-endpoint-compact-row mqtt-config-wide" aria-label="服务器连接地址">
                    <label class="mqtt-protocol-field">
                      协议
                      <select data-mqtt-field="protocol" data-role="mqtt-editor" :value="configForm.protocol" @change="updateProtocol(($event.target as HTMLSelectElement).value === 'wss' ? 'wss' : 'ws')">
                        <option value="ws">ws://</option>
                        <option value="wss">wss://</option>
                      </select>
                    </label>
                    <label class="mqtt-host-field">
                      服务器地址
                      <input data-mqtt-field="host" data-role="mqtt-editor" :value="configForm.host" placeholder="ainongyun.net" @input="updateConfigDraft({ host: ($event.target as HTMLInputElement).value })" />
                    </label>
                    <label class="mqtt-port-field">
                      端口
                      <input data-mqtt-field="port" data-role="mqtt-editor" type="number" :value="configForm.port" placeholder="8083" @input="updateConfigDraft({ port: ($event.target as HTMLInputElement).value })" />
                    </label>
                    <label class="mqtt-path-field">
                      Path
                      <input data-mqtt-field="path" data-role="mqtt-editor" :value="configForm.path" placeholder="/" @input="updateConfigDraft({ path: ($event.target as HTMLInputElement).value })" />
                    </label>
                  </section>
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
                  <section class="mqtt-subscription-summary mqtt-config-wide">
                    <header>
                      <span>
                        <strong>订阅</strong>
                        <small>{{ configForm.subscriptionItems.length }} 条</small>
                      </span>
                      <button type="button" class="mqtt-icon-button" title="+ 添加订阅" aria-label="+ 添加订阅" @click="addConfigSubscriptionItem">
                        <MqttIcon name="add" />
                      </button>
                    </header>
                    <div class="mqtt-config-subscription-list">
                      <article
                        v-for="(item, index) in configForm.subscriptionItems"
                        :key="`${index}:${item.topic}:${item.alias}:${item.color}`"
                        class="mqtt-config-subscription-row"
                        :class="{ focused: configSubscriptionRowFocused(index) }"
                      >
                        <input
                          data-role="mqtt-config-subscription-editor"
                          :data-mqtt-config-subscription-index="index"
                          data-mqtt-config-subscription-field="alias"
                          :value="item.alias"
                          placeholder="订阅别名"
                          aria-label="订阅别名"
                          @focus="emit('dispatch', 'mqtt.config.subscription.focus', { index, field: 'alias' })"
                          @input="updateConfigSubscriptionItem(index, { alias: ($event.target as HTMLInputElement).value })"
                        />
                        <input
                          data-role="mqtt-config-subscription-editor"
                          data-mqtt-field="subscriptions"
                          :data-mqtt-config-subscription-index="index"
                          data-mqtt-config-subscription-field="topic"
                          :value="item.topic"
                          placeholder="plc/+/status"
                          aria-label="订阅 topic"
                          @focus="emit('dispatch', 'mqtt.config.subscription.focus', { index, field: 'topic' })"
                          @input="updateConfigSubscriptionItem(index, { topic: ($event.target as HTMLInputElement).value })"
                        />
                        <span class="mqtt-topic-color-control" aria-label="订阅 topic 颜色">
                          <button
                            v-for="color in subscriptionColorPalette"
                            :key="color"
                            type="button"
                            class="mqtt-topic-color-swatch"
                            :class="{ active: normalizeMqttTopicColor(item.color, index).toLowerCase() === color.toLowerCase() }"
                            :style="{ '--mqtt-topic-color': color }"
                            :title="`使用 ${color}`"
                            :aria-label="`使用 topic 颜色 ${color}`"
                            @click="updateConfigSubscriptionItem(index, { color })"
                          ></button>
                          <input
                            class="mqtt-topic-color-input"
                            data-role="mqtt-config-subscription-editor"
                            :data-mqtt-config-subscription-index="index"
                            data-mqtt-config-subscription-field="color"
                            :value="normalizeMqttTopicColor(item.color, index)"
                            placeholder="#111111"
                            aria-label="自定义 topic 颜色"
                            @focus="emit('dispatch', 'mqtt.config.subscription.focus', { index, field: 'color' })"
                            @input="updateConfigSubscriptionItem(index, { color: ($event.target as HTMLInputElement).value })"
                          />
                        </span>
                        <button type="button" class="mqtt-icon-button danger" title="删除订阅" aria-label="删除订阅" @click="emit('dispatch', 'mqtt.config.subscription.deleteRow', { index, field: 'topic' })">
                          <MqttIcon name="delete" />
                        </button>
                      </article>
                      <p v-if="!configForm.subscriptionItems.length" class="empty-note">暂无订阅 topic，可在这里添加</p>
                    </div>
                  </section>
                  <section class="mqtt-config-publish-summary mqtt-config-wide">
                    <header>
                      <span>
                        <strong>默认发布</strong>
                        <small>{{ configForm.publishTopics.filter((topic) => topic.trim()).length }} 个候选</small>
                      </span>
                      <button type="button" class="mqtt-icon-button" title="+ 添加发布 topic" aria-label="+ 添加发布 topic" @click="addConfigPublishTopic">
                        <MqttIcon name="add" />
                      </button>
                    </header>
                    <div class="mqtt-config-publish-list">
                      <article
                        v-for="(topic, index) in configForm.publishTopics"
                        :key="`${index}:${topic}`"
                        class="mqtt-config-publish-row"
                        :class="{ focused: configPublishRowFocused(index) }"
                      >
                        <span class="mqtt-config-publish-default">{{ index === 0 ? '默认' : index + 1 }}</span>
                        <input
                          data-role="mqtt-config-publish-editor"
                          :data-mqtt-field="index === 0 ? 'publishTopic' : undefined"
                          :data-mqtt-config-publish-index="index"
                          data-mqtt-config-publish-field="topic"
                          :value="topic"
                          placeholder="plc/czz060301/set"
                          aria-label="发布 topic"
                          @focus="emit('dispatch', 'mqtt.config.publish.focus', { index })"
                          @input="updateConfigPublishTopic(index, ($event.target as HTMLInputElement).value)"
                        />
                        <button type="button" class="mqtt-icon-button danger" title="删除发布 topic" aria-label="删除发布 topic" @click="emit('dispatch', 'mqtt.config.publish.deleteRow', { index })">
                          <MqttIcon name="delete" />
                        </button>
                      </article>
                      <p v-if="!configForm.publishTopics.length" class="empty-note">暂无默认发布 topic，可在这里添加</p>
                    </div>
                  </section>
                  <section class="mqtt-config-options-panel mqtt-config-wide" aria-label="连接选项">
                    <label class="mqtt-config-qos-field">
                      QoS
                      <select data-mqtt-field="qos" data-role="mqtt-editor" :value="String(configForm.qos)" @change="updateConfigDraft({ qos: qosFromInput(($event.target as HTMLSelectElement).value) })">
                        <option value="0">QoS 0</option>
                        <option value="1">QoS 1</option>
                        <option value="2">QoS 2</option>
                      </select>
                    </label>
                    <label>
                      reconnectPeriodMs
                      <input data-mqtt-field="reconnectPeriodMs" data-role="mqtt-editor" type="number" min="500" max="60000" :value="configForm.reconnectPeriodMs" @input="updateConfigDraft({ reconnectPeriodMs: Number(($event.target as HTMLInputElement).value) })" />
                    </label>
                    <label>
                      connectTimeoutMs
                      <input data-mqtt-field="connectTimeoutMs" data-role="mqtt-editor" type="number" min="3000" max="60000" :value="configForm.connectTimeoutMs" @input="updateConfigDraft({ connectTimeoutMs: Number(($event.target as HTMLInputElement).value) })" />
                    </label>
                    <label>
                      keepaliveSec
                      <input data-mqtt-field="keepaliveSec" data-role="mqtt-editor" type="number" min="0" max="300" :value="configForm.keepaliveSec" @input="updateConfigDraft({ keepaliveSec: Number(($event.target as HTMLInputElement).value) })" />
                    </label>
                    <div class="mqtt-config-checkbox-grid">
                      <label class="checkbox-line">
                        <input data-mqtt-field="retain" data-role="mqtt-editor" type="checkbox" :checked="configForm.retain" @change="updateConfigDraft({ retain: ($event.target as HTMLInputElement).checked })" />
                        retain
                      </label>
                      <label class="checkbox-line">
                        <input data-mqtt-field="autoReconnect" data-role="mqtt-editor" type="checkbox" :checked="configForm.autoReconnect" @change="updateConfigDraft({ autoReconnect: ($event.target as HTMLInputElement).checked })" />
                        自动重连
                      </label>
                      <label class="checkbox-line">
                        <input data-mqtt-field="clean" data-role="mqtt-editor" type="checkbox" :checked="configForm.clean" @change="updateConfigDraft({ clean: ($event.target as HTMLInputElement).checked })" />
                        clean
                      </label>
                      <label class="checkbox-line">
                        <input data-mqtt-field="reconnectOnConnackError" data-role="mqtt-editor" type="checkbox" :checked="configForm.reconnectOnConnackError" @change="updateConfigDraft({ reconnectOnConnackError: ($event.target as HTMLInputElement).checked })" />
                        Connack 错误重连
                      </label>
                      <label class="checkbox-line">
                        <input data-mqtt-field="resubscribeOnReconnect" data-role="mqtt-editor" type="checkbox" :checked="configForm.resubscribeOnReconnect" @change="updateConfigDraft({ resubscribeOnReconnect: ($event.target as HTMLInputElement).checked })" />
                        重连后重订阅
                      </label>
                      <label class="checkbox-line">
                        <input data-mqtt-field="storage" data-role="mqtt-editor" type="checkbox" :checked="configForm.syncRecords" @change="updateConfigDraft({ syncRecords: ($event.target as HTMLInputElement).checked })" />
                        本地归档
                      </label>
                    </div>
                  </section>
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
            :rows="activeRecordListRows"
            :state="activeRecordListState"
            :selected-kind="activeRecordSelectedKind"
            :selected-id="props.snapshot.mqttSelectedRecord?.id || null"
            :topic-visual="mqttTopicVisual"
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
          <div
            v-else
            class="mqtt-message-list mqtt-message-stream"
            tabindex="-1"
            :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.focus.messages')"
            @click.self="emit('dispatch', 'mqtt.focus.messages')"
          >
            <article
              v-for="message in props.snapshot.mqttMessageRows"
              :key="message.id"
              class="mqtt-message-row"
              role="option"
              tabindex="-1"
              :class="{ focused: recordSelected('message', message.id), selected: props.snapshot.mqttRecordListStates.messages.selectedIds.includes(message.id), incoming: message.direction === 'incoming', outgoing: message.direction === 'outgoing' }"
              :data-mqtt-preview-target="previewTargetValue('message', message.id)"
              :data-quick-jump-label="messageRouteLabel(message)"
              :data-quick-jump-search="`${message.topic} ${payloadSnippet(message.payload)}`"
              :aria-selected="recordSelected('message', message.id) || props.snapshot.mqttRecordListStates.messages.selectedIds.includes(message.id)"
              :style="topicVisualStyle(message.topic)"
              @click="selectRecord('message', message.id, 'messages')"
              @dblclick.stop="emit('dispatch', 'mqtt.record.toggleSelect', { ...commandArgs('message', message.id, 'messages'), list: 'messages', range: ($event as MouseEvent).shiftKey })"
              @contextmenu.prevent="openMessageMenu(message, 'messages')"
              @mouseenter="schedulePreview('message', message.id, $event)"
              @mouseleave="closeHoverPreview"
            >
              <div class="mqtt-message-bubble" :class="message.direction === 'outgoing' ? 'mqtt-message-bubble-out' : 'mqtt-message-bubble-in'">
                <span class="mqtt-message-direction" :class="`mqtt-message-direction-${directionLabel(message).toLowerCase()}`" :title="directionAccessibleLabel(message)" :aria-label="directionAccessibleLabel(message)">
                  <MqttIcon :name="directionIconName(message)" />
                </span>
                <span class="mqtt-message-route">
                  <strong :title="messageHoverTitle(message)">{{ messageRouteLabel(message) }}</strong>
                </span>
                <span class="mqtt-message-flags" :title="messageHoverTitle(message)" aria-label="消息元信息">
                  <time
                    v-for="timeParts in [formatCompactDateTime(message.timestamp)]"
                    :key="`time:${message.id}`"
                    class="mqtt-message-time-badge"
                    :class="{ 'is-today': timeParts.isToday, 'has-date': timeParts.date }"
                    :datetime="timeParts.iso"
                    :title="timeParts.full"
                    :aria-label="timeParts.full"
                  >
                    <span v-if="timeParts.date" class="mqtt-message-time-part mqtt-message-time-date">{{ timeParts.date }}</span>
                    <span class="mqtt-message-time-part mqtt-message-time-clock">{{ timeParts.time }}</span>
                  </time>
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
            <input
              data-role="mqtt-publish-editor"
              data-mqtt-publish-field="topic"
              :value="publishDraft.topic || activeConfig?.publishTopic || ''"
              placeholder="发布 topic"
              @input="emit('updatePublishDraft', { topic: ($event.target as HTMLInputElement).value })"
            />
            <span class="mqtt-publish-options-anchor">
              <button
                type="button"
                class="mqtt-icon-button mqtt-publish-options-button"
                data-role="mqtt-publish-editor"
                :title="commandTitle('发送选项', 'mqtt.publish.options.open')"
                aria-label="发送选项"
                :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.options.open')"
                @click="emit('dispatch', 'mqtt.publish.options.open')"
              >
                <MqttIcon name="more" />
              </button>
              <div
                v-if="props.snapshot.mqttPublishOptionsOpen"
                class="mqtt-publish-options-popover"
                data-role="mqtt-publish-options"
                tabindex="-1"
              >
                <button
                  v-for="(option, index) in publishOptionRows"
                  :key="option.id"
                  type="button"
                  class="mqtt-publish-option-row"
                  data-role="mqtt-publish-options"
                  :class="{ active: option.active, highlighted: props.snapshot.mqttPublishOptionsActiveIndex === index }"
                  @click="selectPublishOption(option.id)"
                >
                  <span>{{ option.label }}</span>
                  <b v-if="option.active">✓</b>
                </button>
              </div>
            </span>
            <span class="mqtt-publish-actions" aria-label="发送操作">
              <button type="button" class="mqtt-icon-button" :title="commandTitle('发送 MQTT 消息', 'mqtt.publish.send', 'c-cr')" aria-label="发送 MQTT 消息" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.send')" @click="emit('dispatch', 'mqtt.publish.send')">
                <MqttIcon name="send" />
              </button>
              <span class="mqtt-publish-draft-anchor">
                <button
                  type="button"
                  class="mqtt-icon-button mqtt-publish-draft-button"
                  data-role="mqtt-publish-editor"
                  :title="commandTitle('发送草稿', 'mqtt.publish.draft.toggle', 'c-h')"
                  aria-label="发送草稿"
                  :aria-expanded="props.snapshot.mqttPublishDraftHistoryOpen"
                  :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.draft.toggle')"
                  @click="emit('dispatch', 'mqtt.publish.draft.toggle')"
                >
                  <MqttIcon name="draft" />
                </button>
                <div
                  v-if="props.snapshot.mqttPublishDraftHistoryOpen"
                  class="mqtt-publish-draft-popover"
                  data-role="mqtt-publish-draft"
                  tabindex="-1"
                  aria-label="发送草稿"
                  @mouseenter="enterPublishDraftHistoryPopover"
                  @mousemove.passive="handlePublishDraftHistoryPointerMove"
                >
                  <header class="mqtt-publish-draft-head">
                    <span>
                      <strong>草稿</strong>
                      <small>{{ props.snapshot.mqttPublishDraftHistoryRows.length }} 条</small>
                    </span>
                    <span class="mqtt-publish-draft-actions">
                      <button type="button" class="mqtt-icon-button" :title="commandTitle('保存当前草稿', 'mqtt.publish.draft.saveDraft', 'c-s-h')" aria-label="保存当前草稿" @click="emit('dispatch', 'mqtt.publish.draft.saveDraft')">
                        <MqttIcon name="save" />
                      </button>
                      <button type="button" class="mqtt-icon-button danger" title="清空草稿" aria-label="清空草稿" @click="emit('dispatch', 'mqtt.publish.draft.clear')">
                        <MqttIcon name="clear-all" />
                      </button>
                      <button type="button" class="mqtt-icon-button" title="关闭草稿" aria-label="关闭草稿" @click="emit('dispatch', 'mqtt.publish.draft.close')">
                        <MqttIcon name="close" />
                      </button>
                    </span>
                  </header>
                  <div class="mqtt-publish-draft-list">
                    <article
                      v-for="(row, index) in props.snapshot.mqttPublishDraftHistoryRows"
                      :key="row.id"
                      class="mqtt-publish-draft-row"
                      data-role="mqtt-publish-draft"
                      role="option"
                      tabindex="-1"
                      :data-mqtt-preview-target="previewTargetValue('publish-draft-history', row.id)"
                      :data-quick-jump-label="publishDraftHistoryTitle(row)"
                      data-operation-tooltip="右键打开草稿操作"
                      data-operation-shortcut="Ctrl+→"
                      :data-quick-jump-search="`${row.topic} ${payloadSnippet(row.payload)}`"
                      :aria-selected="publishDraftHistorySelected(row) || index === props.snapshot.mqttPublishDraftHistoryActiveIndex"
                      :class="{ active: index === props.snapshot.mqttPublishDraftHistoryActiveIndex, selected: publishDraftHistorySelected(row) }"
                      :title="`${row.topic}\n${row.payload}`"
                      @mouseenter="previewPublishDraftHistory(row, $event)"
                      @click="focusPublishDraftHistory(row)"
                      @contextmenu.prevent="openPublishDraftHistoryMenu(row)"
                    >
                      <button
                        type="button"
                        class="mqtt-publish-draft-check"
                        :class="{ checked: publishDraftHistorySelected(row) }"
                        :aria-pressed="publishDraftHistorySelected(row)"
                        :title="commandTitle('多选草稿', 'mqtt.publish.draft.toggleSelect', 'space')"
                        aria-label="多选草稿"
                        @click.stop="togglePublishDraftHistory(row)"
                      >
                        <span aria-hidden="true">{{ publishDraftHistorySelected(row) ? '✓' : '' }}</span>
                      </button>
                      <span class="mqtt-publish-draft-main">
                        <strong>{{ publishDraftHistoryTitle(row) }}</strong>
                        <small>{{ row.topic }}</small>
                        <code>{{ payloadSnippet(row.payload) }}</code>
                      </span>
                      <span class="mqtt-publish-draft-meta">
                        <small>{{ publishDraftHistorySourceLabel(row) }}</small>
                        <small>QoS {{ row.qos }}{{ row.retain ? ' · retain' : '' }}</small>
                        <time :datetime="String(row.updatedAt)">{{ formatPublishDraftHistoryTime(row.updatedAt) }}</time>
                      </span>
                      <span class="mqtt-publish-draft-row-actions" aria-label="草稿操作">
                        <button type="button" class="mqtt-icon-button" :title="commandTitle('详情草稿', 'mqtt.detail.open', 'c-←')" aria-label="详情草稿" @click.stop="openPublishDraftHistoryDetail(row)">
                          <MqttIcon name="detail" />
                        </button>
                        <button type="button" class="mqtt-icon-button" :title="commandTitle('草稿操作', 'mqtt.drawer.open', 'c-→')" aria-label="草稿操作" @click.stop="openPublishDraftHistoryMenu(row)">
                          <MqttIcon name="more" />
                        </button>
                        <button type="button" class="mqtt-icon-button" title="应用草稿" aria-label="应用草稿" @click.stop="applyPublishDraftHistory(row)">
                          <MqttIcon name="apply" />
                        </button>
                        <button type="button" class="mqtt-icon-button" :title="commandTitle('发送草稿', 'mqtt.publish.draft.send', 'c-cr')" aria-label="发送草稿" @click.stop="sendPublishDraftHistory(row)">
                          <MqttIcon name="send" />
                        </button>
                        <button type="button" class="mqtt-icon-button" title="收藏草稿" aria-label="收藏草稿" @click.stop="favoritePublishDraftHistory(row)">
                          <MqttIcon name="star" />
                        </button>
                        <button type="button" class="mqtt-icon-button" :title="commandTitle('草稿别名', 'mqtt.publish.draft.rename', 'f2')" aria-label="草稿别名" @click.stop="renamePublishDraftHistory(row)">
                          <MqttIcon name="edit" />
                        </button>
                        <button type="button" class="mqtt-icon-button" :title="commandTitle('完整编辑草稿', 'mqtt.publish.draft.edit', 's-f2')" aria-label="完整编辑草稿" @click.stop="editPublishDraftHistory(row)">
                          <MqttIcon name="edit" />
                        </button>
                        <button type="button" class="mqtt-icon-button danger" title="删除草稿" aria-label="删除草稿" @click.stop="deletePublishDraftHistory(row)">
                          <MqttIcon name="delete" />
                        </button>
                      </span>
                    </article>
                    <p v-if="!props.snapshot.mqttPublishDraftHistoryRows.length" class="empty-note">暂无发送草稿</p>
                  </div>
                </div>
              </span>
            </span>
          </header>
          <textarea
            class="mqtt-payload-input"
            data-role="mqtt-publish-editor"
            data-mqtt-publish-field="payload"
            :value="publishDraft.payload"
            rows="8"
            placeholder="payload"
            @input="emit('updatePublishDraft', { payload: ($event.target as HTMLTextAreaElement).value })"
          ></textarea>

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
            v-for="(item, index) in props.snapshot.mqttSubscriptionDraft.items"
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
            <span class="mqtt-topic-color-control" aria-label="订阅 topic 颜色">
              <button
                v-for="color in subscriptionColorPalette"
                :key="color"
                type="button"
                class="mqtt-topic-color-swatch"
                :class="{ active: normalizeMqttTopicColor(item.color, index).toLowerCase() === color.toLowerCase() }"
                :style="{ '--mqtt-topic-color': color }"
                :title="`使用 ${color}`"
                :aria-label="`使用 topic 颜色 ${color}`"
                @click="updateSubscriptionEditorItem(item.id, { color })"
              ></button>
              <input
                class="mqtt-topic-color-input"
                data-role="mqtt-subscription-editor"
                :data-mqtt-subscription-item-id="item.id"
                data-mqtt-subscription-field="color"
                :value="normalizeMqttTopicColor(item.color, index)"
                placeholder="#111111"
                aria-label="自定义 topic 颜色"
                @focus="focusSubscriptionEditorField(item.id, 'color')"
                @input="updateSubscriptionEditorItem(item.id, { color: ($event.target as HTMLInputElement).value })"
              />
            </span>
            <span>QoS {{ activeConfig?.qos ?? configForm.qos }}</span>
	            <button type="button" class="mqtt-icon-button danger" title="删除" aria-label="删除" @click="emit('dispatch', 'mqtt.subscription.editor.deleteRow', { itemId: item.id })">
	              <MqttIcon name="delete" />
	            </button>
          </article>
          <p v-if="!props.snapshot.mqttSubscriptionDraft.items.length" class="empty-note">暂无订阅 topic</p>
        </div>
      </section>
    </div>

    <div
      v-if="props.snapshot.mqttPublishDraftHistoryEditDraft"
      class="modal-backdrop mqtt-publish-draft-edit-modal"
      role="presentation"
      data-role="mqtt-publish-draft-editor"
      @click="emit('dispatch', 'mqtt.publish.draft.edit.cancel')"
      @keydown="handlePublishDraftHistoryEditorKeydown"
    >
      <section class="mqtt-record-editor mqtt-publish-draft-edit-card" role="dialog" aria-modal="true" aria-label="编辑发送草稿" data-role="mqtt-publish-draft-editor" @click.stop>
        <header>
          <span>
            <strong>{{ props.snapshot.mqttPublishDraftHistoryEditDraft.mode === 'rename' ? '草稿别名' : '编辑草稿' }}</strong>
            <small>{{ props.snapshot.mqttPublishDraftHistoryEditDraft.mode === 'rename' ? '别名 / 备注' : 'topic / payload' }}</small>
          </span>
          <span class="mqtt-editor-actions">
            <button type="button" class="mqtt-icon-button" :title="commandTitle('取消', 'mqtt.publish.draft.edit.cancel', 'esc')" aria-label="取消草稿编辑" @click="emit('dispatch', 'mqtt.publish.draft.edit.cancel')">
              <MqttIcon name="close" />
            </button>
            <button type="button" class="mqtt-icon-button" :title="commandTitle('保存草稿', 'mqtt.publish.draft.edit.save', 'c-s')" aria-label="保存草稿编辑" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.publish.draft.edit.save')" @click="emit('dispatch', 'mqtt.publish.draft.edit.save')">
              <MqttIcon name="save" />
            </button>
          </span>
        </header>
        <template v-if="props.snapshot.mqttPublishDraftHistoryEditDraft.mode === 'rename'">
          <label>
            别名
            <input
              data-role="mqtt-publish-draft-editor"
              data-mqtt-publish-draft-field="title"
              :value="props.snapshot.mqttPublishDraftHistoryEditDraft.title"
              placeholder="草稿别名"
              @focus="updatePublishDraftHistoryEditDraft({ activeField: 'title' })"
              @input="updatePublishDraftHistoryEditDraft({ title: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label>
            备注
            <textarea
              data-role="mqtt-publish-draft-editor"
              data-mqtt-publish-draft-field="note"
              :value="props.snapshot.mqttPublishDraftHistoryEditDraft.note"
              rows="4"
              placeholder="草稿备注"
              @focus="updatePublishDraftHistoryEditDraft({ activeField: 'note' })"
              @input="updatePublishDraftHistoryEditDraft({ note: ($event.target as HTMLTextAreaElement).value })"
            ></textarea>
          </label>
        </template>
        <template v-else>
          <label>
            topic
            <input
              data-role="mqtt-publish-draft-editor"
              data-mqtt-publish-draft-field="topic"
              :value="props.snapshot.mqttPublishDraftHistoryEditDraft.topic"
              placeholder="topic"
              @focus="updatePublishDraftHistoryEditDraft({ activeField: 'topic' })"
              @input="updatePublishDraftHistoryEditDraft({ topic: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label>
            payload
            <textarea
              data-role="mqtt-publish-draft-editor"
              data-mqtt-publish-draft-field="payload"
              :value="props.snapshot.mqttPublishDraftHistoryEditDraft.payload"
              rows="9"
              placeholder="payload"
              @focus="updatePublishDraftHistoryEditDraft({ activeField: 'payload' })"
              @input="updatePublishDraftHistoryEditDraft({ payload: ($event.target as HTMLTextAreaElement).value })"
            ></textarea>
          </label>
        </template>
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
      <aside class="mqtt-log-drawer mqtt-context-panel" aria-label="MQTT 错误日志" @click.stop>
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
            data-operation-tooltip="右键打开日志操作"
            data-operation-shortcut="Ctrl+→"
            @click="selectLog(log.id)"
            @contextmenu.prevent="selectLog(log.id); emit('dispatch', 'mqtt.drawer.open', commandArgs('log', log.id))"
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
      <aside class="port-detail-drawer mqtt-detail-drawer mqtt-context-panel" aria-label="MQTT 详情抽屉" @click.stop>
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
            <dd>{{ formatDateTime(recordTime(detailRecord)) }}</dd>
          </dl>
          <div class="mqtt-detail-actions">
            <button v-if="detailTarget?.kind !== 'publish-draft-history'" type="button" class="mqtt-icon-button" :title="commandTitle('预览', 'mqtt.preview.open', 'c-i')" aria-label="预览详情记录" :data-mqtt-shortcut-hint="shortcutHintAttr('mqtt.preview.open')" @click="emit('dispatch', 'mqtt.preview.open', { ...detailRecordCommandArgs(), source: 'keyboard' })">
              <MqttIcon name="detail" />
            </button>
            <button type="button" class="mqtt-icon-button" title="复制 topic" aria-label="复制 topic" @click="emit('dispatch', 'mqtt.record.copyTopic', detailRecordCommandArgs())">
              <MqttIcon name="copy-topic" />
            </button>
            <button type="button" class="mqtt-icon-button" title="复制 payload" aria-label="复制 payload" @click="emit('dispatch', 'mqtt.record.copyPayload', detailRecordCommandArgs())">
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
        <section v-else-if="detailSubscription" class="mqtt-log-detail">
          <dl>
            <dt>订阅</dt>
            <dd>{{ detailSubscription.displayName }}</dd>
            <dt>topic</dt>
            <dd>{{ detailSubscription.topic }}</dd>
            <dt>QoS</dt>
            <dd>{{ detailSubscription.qos }}</dd>
            <dt>未读</dt>
            <dd>{{ detailSubscription.unreadCount }}</dd>
          </dl>
          <div class="mqtt-detail-actions">
            <button type="button" class="mqtt-icon-button" title="复制 topic" aria-label="复制订阅 topic" @click="emit('dispatch', 'mqtt.subscription.copyTopic', commandArgs('subscription', detailSubscription.topic))">
              <MqttIcon name="copy-topic" />
            </button>
            <button type="button" class="mqtt-icon-button" title="填入发布" aria-label="填入发布 topic" @click="emit('dispatch', 'mqtt.subscription.useAsPublishTopic', commandArgs('subscription', detailSubscription.topic))">
              <MqttIcon name="apply" />
            </button>
          </div>
        </section>
        <section v-else-if="detailConnectionGroup" class="mqtt-log-detail">
          <dl>
            <dt>分组</dt>
            <dd>{{ detailConnectionGroup.name }}</dd>
            <dt>父级</dt>
            <dd>{{ props.snapshot.state.mqtt.connectionGroups.find((group) => group.id === detailConnectionGroup?.parentId)?.name || '根级' }}</dd>
            <dt>子分组</dt>
            <dd>{{ detailConnectionGroupStats.groups }} 个</dd>
            <dt>连接</dt>
            <dd>{{ detailConnectionGroupStats.configs }} 个</dd>
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
      <aside class="port-detail-drawer mqtt-action-drawer mqtt-context-panel active" aria-label="MQTT 动作抽屉" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>快捷操作</strong>
            <small>{{ props.snapshot.mqttDrawer.targetKind || '当前上下文' }}</small>
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
            class="drawer-action mqtt-drawer-action"
            :class="{ active: index === props.snapshot.mqttDrawer.activeIndex, danger: item.risk === 'destructive' || item.commandId.includes('delete') }"
            :disabled="!item.enabled"
            :title="item.description || item.title"
            :aria-label="item.title"
            role="menuitem"
            @click="emit('dispatch', item.commandId, item.args)"
          >
            <span class="drawer-action-icon mqtt-drawer-action-icon">
              <component :is="iconComponent(item.icon)" class="mqtt-icon" aria-hidden="true" />
            </span>
            <span class="drawer-action-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <kbd>{{ item.shortcutLabel || '未绑定' }}</kbd>
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
      @wheel.prevent.stop="handlePreviewWheel"
    >
      <header>
        <span class="mqtt-preview-direction" :class="`mqtt-preview-direction-${directionLabel(previewRecord).toLowerCase()}`" :title="directionAccessibleLabel(previewRecord)" :aria-label="directionAccessibleLabel(previewRecord)">
          <component :is="previewDirectionIcon" class="mqtt-icon" aria-hidden="true" />
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
