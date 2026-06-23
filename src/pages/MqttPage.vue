<script setup lang="ts">
import { computed, nextTick, reactive, watch } from 'vue'
import type { AppRuntimeSnapshot, MqttConfigDraft, MqttSubscriptionEditorDraft, MqttSubscriptionEditorField, MqttSubscriptionEditorItem } from '../runtime/appRuntime'
import type { MqttMessageRecord, MqttPublishDraft, MqttPublishTemplate, MqttQos } from '../domain/types'
import { buildMqttWebSocketUrl } from '../domain/mqtt'
import SearchSuggestBox from '../components/SearchSuggestBox.vue'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean }>()
const emit = defineEmits<{
  search: [value: string]
  focusConfig: [id: string]
  focusSession: [id: string]
  focusMessage: [id: string]
  focusLog: [id: string]
  updateConfigDraft: [input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>]
  updateSubscriptionDraft: [input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>]
  updatePublishDraft: [input: Partial<MqttPublishDraft>]
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

const configForm = reactive({
  name: '',
  url: '',
  protocol: 'ws' as 'ws' | 'wss',
  host: '',
  port: '',
  path: '/',
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
  configForm.path = draft?.path || '/'
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

watch(() => props.snapshot.mqttSubscriptionDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-mqtt-subscription-field="${field}"]`)
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  })
})

const activeConfig = computed(() => props.snapshot.mqttActiveConfig)
const subscriptionDraft = computed(() => props.snapshot.mqttSubscriptionDraft)
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
const receiveFilterLabel = computed(() => {
  if (props.snapshot.mqttReceiveFilter === 'all') return '全部'
  if (props.snapshot.mqttReceiveFilter === 'outgoing') return '已发送'
  return '已接收'
})
const activeSubscriptionLabel = computed(() => {
  if (!props.snapshot.mqttActiveSubscriptionTopics.length) return '全部 topic'
  if (props.snapshot.mqttActiveSubscriptionTopics.length > 1) return `${props.snapshot.mqttActiveSubscriptionTopics.length} 个订阅`
  const topic = props.snapshot.mqttActiveSubscriptionTopics[0]
  return props.snapshot.mqttSubscriptionRows.find((row) => row.topic === topic)?.displayName || topic
})
const selectedSubscriptionCount = computed(() => props.snapshot.mqttSelectedSubscriptionTopics.length)
const configSubscriptionSummaryRows = computed(() => {
  const config = activeConfig.value
  if (config) {
    return config.subscriptions.map((topic) => ({
      topic,
      alias: config.subscriptionAliases[topic] || '',
      displayName: config.subscriptionAliases[topic] || topic,
      qos: config.qos
    }))
  }
  return configForm.subscriptionItems.map((item) => ({
    topic: item.topic,
    alias: item.alias,
    displayName: item.alias || item.topic,
    qos: configForm.qos
  }))
})

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

function updateConfigDraft(input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>) {
  emit('updateConfigDraft', input)
}

function qosFromInput(value: string): MqttQos {
  return value === '1' ? 1 : value === '2' ? 2 : 0
}

function createSubscriptionEditorItem(): MqttSubscriptionEditorItem {
  return {
    id: `mqtt-subscription-ui:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
    topic: '#',
    alias: ''
  }
}

function updateSubscriptionDraft(input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>) {
  emit('updateSubscriptionDraft', input)
}

function addSubscriptionEditorItem() {
  if (!subscriptionDraft.value) return
  updateSubscriptionDraft({ items: [...subscriptionDraft.value.items, createSubscriptionEditorItem()], activeField: 'topic' })
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

function focusSubscriptionEditorField(field: MqttSubscriptionEditorField) {
  updateSubscriptionDraft({ activeField: field })
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

function selectRecord(kind: 'config' | 'session' | 'message' | 'log', id: string) {
  if (kind === 'config') emit('focusConfig', id)
  if (kind === 'session') emit('focusSession', id)
  if (kind === 'message') emit('focusMessage', id)
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

function selectMessageAndDispatch(message: MqttMessageRecord, actionId: string) {
  selectRecord('message', message.id)
  emit('dispatch', actionId)
}

function applyMessage(message: MqttMessageRecord) {
  selectMessageAndDispatch(message, 'mqtt.record.resendDraft')
}

function sendMessageAgain(message: MqttMessageRecord) {
  selectRecord('message', message.id)
  emit('dispatch', 'mqtt.record.resendDraft')
  emit('dispatch', 'mqtt.publish.send')
}

function applyTemplate(template: MqttPublishTemplate) {
  emit('dispatch', 'mqtt.publish.template.apply', { id: template.id })
}

function sendTemplate(template: MqttPublishTemplate) {
  emit('dispatch', 'mqtt.publish.template.send', { id: template.id })
}

function renameTemplate(template: MqttPublishTemplate, title: string) {
  emit('dispatch', 'mqtt.publish.template.rename', { id: template.id, title })
}

function deleteTemplate(template: MqttPublishTemplate) {
  emit('dispatch', 'mqtt.publish.template.delete', { id: template.id })
}

function messageTitle(message: MqttMessageRecord) {
  return message.title || `${message.direction === 'incoming' ? 'IN' : message.direction === 'outgoing' ? 'OUT' : 'EVENT'} ${message.topic || '(empty topic)'}`
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
</script>

<template>
  <section
    class="mqtt-workbench-grid"
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
        <button type="button" class="add-folder-button" :title="`新建连接 ${commandLabel('mqtt.config.create', 'c-n')}`" @click="emit('dispatch', 'mqtt.config.create')">+</button>
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
            <button type="button" @click.stop="focusConfigAndDispatch(config.id, 'mqtt.connection.connect')">
              连接
              <kbd>{{ commandLabel('mqtt.connection.connect', 'c-r') }}</kbd>
            </button>
            <button type="button" @click.stop="focusConfigAndDispatch(config.id, 'mqtt.connection.disconnect')">
              断开
              <kbd>{{ commandLabel('mqtt.connection.disconnect', 'c-s-r') }}</kbd>
            </button>
            <button type="button" @click.stop="focusConfigAndDispatch(config.id, 'mqtt.config.edit')">
              配置
              <kbd>{{ commandLabel('mqtt.config.edit', 'f2') }}</kbd>
            </button>
            <button type="button" @click.stop="emit('focusConfig', config.id); openLog()">
              日志
              <kbd>{{ commandLabel('mqtt.log.drawer.open', 'c-l') }}</kbd>
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
      @click="emit('dispatch', 'mqtt.subscription.panel.toggle')"
    >
      订阅
    </button>

    <aside v-if="props.snapshot.mqttSubscriptionPanelOpen" class="mqtt-subscription-rail">
      <header class="mqtt-rail-title">
        <span>
          <strong>订阅</strong>
          <small>{{ activeConfig?.name || '未选择连接' }}</small>
        </span>
        <span class="mqtt-rail-actions">
          <button type="button" class="mqtt-subscription-add" :title="`新增订阅 ${commandLabel('mqtt.subscription.add', 'c-t')}`" @click="emit('dispatch', 'mqtt.subscription.add')">+ 添加订阅</button>
          <button v-if="selectedSubscriptionCount" type="button" :title="`清理选中 ${commandLabel('mqtt.subscription.deleteSelected', 'c-del')}`" @click="emit('dispatch', 'mqtt.subscription.deleteSelected')">清理选中</button>
          <button v-if="activeConfig?.subscriptions.length" type="button" title="清空全部订阅" @click="emit('dispatch', 'mqtt.subscription.clearAll')">清空全部</button>
          <button type="button" :title="`收起订阅栏 ${commandLabel('mqtt.subscription.panel.toggle', 'c-s-t')}`" @click="emit('dispatch', 'mqtt.subscription.panel.toggle')">‹</button>
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
          <span class="mqtt-subscription-accent" aria-hidden="true"></span>
          <span class="mqtt-subscription-main">
            <strong>{{ row.displayName }}</strong>
            <small v-if="row.alias">{{ row.topic }}</small>
          </span>
          <button type="button" class="mqtt-subscription-edit" title="编辑订阅" @click.stop="emit('dispatch', 'mqtt.subscription.editor.open')">编辑</button>
          <button type="button" class="mqtt-subscription-delete" title="清理订阅" @click.stop="deleteSubscription(row.topic)">×</button>
          <em v-if="row.unreadCount">未读 {{ row.unreadCount }}</em>
          <em v-else>未读 0</em>
          <b>QoS {{ row.qos }}</b>
        </article>
        <p v-if="activeConfig && !props.snapshot.mqttSubscriptionRows.length" class="empty-note">暂无订阅 topic</p>
        <p v-if="!activeConfig" class="empty-note">先选择或创建连接</p>
      </div>
    </aside>

    <main class="mqtt-message-workspace" :class="{ 'mqtt-workspace-split': props.snapshot.mqttWorkspaceLayout === 'split' }">
      <header class="mqtt-workspace-toolbar">
        <span class="mqtt-status" :class="`mqtt-status-${props.snapshot.mqttConnectionStatus.state}`">
          {{ statusLabel(props.snapshot.mqttConnectionStatus.state) }}
        </span>
        <span class="mqtt-workspace-title">
          <strong>{{ activeConfig?.name || '未选择配置' }}</strong>
          <small>{{ props.snapshot.mqttConnectionStatus.detail }}</small>
        </span>
        <span class="mqtt-filter-buttons" aria-label="收发筛选">
          <button type="button" :class="{ active: props.snapshot.mqttReceiveFilter === 'all' }" @click="emit('dispatch', 'mqtt.receive.filter.all')">
            全部
            <kbd>{{ commandLabel('mqtt.receive.filter.all', 'c-1') }}</kbd>
          </button>
          <button type="button" :class="{ active: props.snapshot.mqttReceiveFilter === 'incoming' }" @click="emit('dispatch', 'mqtt.receive.filter.in')">
            已接收
            <kbd>{{ commandLabel('mqtt.receive.filter.in', 'c-2') }}</kbd>
          </button>
          <button type="button" :class="{ active: props.snapshot.mqttReceiveFilter === 'outgoing' }" @click="emit('dispatch', 'mqtt.receive.filter.out')">
            已发送
            <kbd>{{ commandLabel('mqtt.receive.filter.out', 'c-3') }}</kbd>
          </button>
        </span>
        <button type="button" @click="emit('dispatch', 'mqtt.layout.toggle')">
          布局
          <kbd>{{ commandLabel('mqtt.layout.toggle', 'c-s-l') }}</kbd>
        </button>
      </header>

      <section v-if="props.snapshot.mqttConfigDraft" class="mqtt-config-editor" data-role="mqtt-editor">
        <header>
          <span>
            <strong>{{ props.snapshot.mqttConfigDraft.mode === 'create' ? '新建连接配置' : props.snapshot.mqttConfigDraft.mode === 'rename' ? '重命名记录' : '编辑连接配置' }}</strong>
            <small>{{ endpointPreview || '连接地址会按字段自动组装' }}</small>
          </span>
          <span class="mqtt-editor-actions">
            <button type="button" @click="emit('dispatch', 'mqtt.config.cancel')">取消</button>
            <button type="button" @click="emit('dispatch', 'mqtt.config.save')">
              保存
              <kbd>{{ commandLabel('mqtt.config.save', 'c-s') }}</kbd>
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
                <strong>订阅摘要</strong>
                <small>{{ configSubscriptionSummaryRows.length }} 条 · QoS {{ activeConfig?.qos ?? configForm.qos }}</small>
              </span>
              <button type="button" :disabled="!activeConfig" @click="emit('dispatch', 'mqtt.subscription.editor.open')">管理订阅</button>
            </header>
            <div class="mqtt-subscription-summary-list">
              <article
                v-for="item in configSubscriptionSummaryRows"
                :key="item.topic"
                class="mqtt-subscription-summary-row"
                :title="item.alias ? `${item.alias} · ${item.topic}` : item.topic"
              >
                <strong>{{ item.displayName }}</strong>
                <small v-if="item.alias">{{ item.topic }}</small>
                <span>QoS {{ item.qos }}</span>
              </article>
              <p v-if="!configSubscriptionSummaryRows.length" class="empty-note">{{ activeConfig ? '暂无订阅 topic' : '保存连接后可管理订阅' }}</p>
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
      </section>

      <section v-else class="mqtt-workspace-body">
        <section class="mqtt-receive-panel">
          <header class="mqtt-panel-title">
            <span>
              <strong>接收</strong>
              <small>{{ receiveFilterLabel }} · {{ activeSubscriptionLabel }}</small>
            </span>
            <small>{{ props.snapshot.mqttMessageRows.length }} 条</small>
          </header>
          <div class="mqtt-message-list">
            <article
              v-for="message in props.snapshot.mqttMessageRows"
              :key="message.id"
              class="mqtt-message-row"
              :class="{ focused: recordSelected('message', message.id), incoming: message.direction === 'incoming', outgoing: message.direction === 'outgoing' }"
              @click="selectRecord('message', message.id)"
            >
              <span class="mqtt-message-meta">
                <strong>{{ messageTitle(message) }}</strong>
                <small>{{ formatTime(message.timestamp) }} · QoS {{ message.qos }}</small>
              </span>
              <code>{{ message.topic }}</code>
              <pre>{{ message.payload }}</pre>
              <span class="group-actions">
                <button type="button" @click.stop="applyMessage(message)">
                  应用
                  <kbd>{{ commandLabel('mqtt.record.resendDraft', 'cr') }}</kbd>
                </button>
                <button type="button" @click.stop="sendMessageAgain(message)">
                  发送
                  <kbd>{{ commandLabel('mqtt.publish.send', 'c-cr') }}</kbd>
                </button>
                <button type="button" @click.stop="selectMessageAndDispatch(message, 'mqtt.drawer.open')">
                  更多
                  <kbd>{{ commandLabel('mqtt.drawer.open', 'c-→') }}</kbd>
                </button>
              </span>
            </article>
            <p v-if="!props.snapshot.mqttMessageRows.length" class="empty-note">暂无收发记录</p>
          </div>
        </section>

        <section class="mqtt-send-panel">
          <header class="mqtt-panel-title">
            <span>
              <strong>发送</strong>
              <small>{{ activeConfig?.syncRecords === false ? '记录仅当前运行内存' : '发送后归档历史' }}</small>
            </span>
            <button type="button" @click="emit('dispatch', 'mqtt.publish.records.toggle')">
              发送记录
              <kbd>{{ commandLabel('mqtt.publish.records.toggle', 'c-h') }}</kbd>
            </button>
          </header>
          <div class="mqtt-publish-row">
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
            <button type="button" @click="emit('dispatch', 'mqtt.publish.send')">
              发送
              <kbd>{{ commandLabel('mqtt.publish.send', 'c-cr') }}</kbd>
            </button>
          </div>
          <textarea class="mqtt-payload-input" data-role="mqtt-search" :value="publishDraft.payload" rows="8" placeholder="payload" @input="emit('updatePublishDraft', { payload: ($event.target as HTMLTextAreaElement).value })"></textarea>
          <div class="mqtt-send-actions">
            <button type="button" @click="emit('dispatch', 'mqtt.publish.template.save', { title: publishDraft.topic || '未命名模板' })">保存模板</button>
            <button type="button" @click="emit('dispatch', 'mqtt.publish.records.toggle')">{{ props.snapshot.mqttPublishRecordsOpen ? '收起记录' : '展开记录' }}</button>
          </div>

          <section v-if="props.snapshot.mqttPublishRecordsOpen" class="mqtt-publish-records">
            <header>
              <strong>模板</strong>
              <small>{{ props.snapshot.mqttPublishTemplateRows.length }} 条</small>
            </header>
            <article
              v-for="template in props.snapshot.mqttPublishTemplateRows"
              :key="template.id"
              class="mqtt-publish-record-row"
              :class="{ focused: recordSelected('publish-template', template.id) }"
            >
              <input
                data-role="mqtt-search"
                :value="template.title"
                aria-label="模板名称"
                @change="renameTemplate(template, ($event.target as HTMLInputElement).value)"
              />
              <code>{{ template.topic }}</code>
              <span>
                <button type="button" @click="applyTemplate(template)">
                  应用
                  <kbd>{{ commandLabel('mqtt.record.resendDraft', 'cr') }}</kbd>
                </button>
                <button type="button" @click="sendTemplate(template)">
                  发送
                  <kbd>{{ commandLabel('mqtt.publish.send', 'c-cr') }}</kbd>
                </button>
                <button type="button" class="danger" @click="deleteTemplate(template)">删除</button>
              </span>
            </article>
            <p v-if="!props.snapshot.mqttPublishTemplateRows.length" class="empty-note">暂无模板</p>

            <header>
              <strong>历史</strong>
              <small>{{ props.snapshot.mqttPublishHistoryRows.length }} 条</small>
            </header>
            <article
              v-for="message in props.snapshot.mqttPublishHistoryRows"
              :key="message.id"
              class="mqtt-publish-record-row"
              :class="{ focused: recordSelected('message', message.id) }"
            >
              <span>
                <strong>{{ message.title || message.topic }}</strong>
                <small>{{ formatTime(message.timestamp) }} · QoS {{ message.qos }}</small>
              </span>
              <code>{{ message.payload }}</code>
              <span>
                <button type="button" @click="applyMessage(message)">应用</button>
                <button type="button" @click="sendMessageAgain(message)">发送</button>
              </span>
            </article>
            <p v-if="!props.snapshot.mqttPublishHistoryRows.length" class="empty-note">暂无发送历史</p>
          </section>
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
            <button type="button" @click="addSubscriptionEditorItem">+ 添加订阅</button>
            <button type="button" @click="emit('dispatch', 'mqtt.subscription.editor.cancel')">取消</button>
            <button type="button" @click="emit('dispatch', 'mqtt.subscription.editor.save')">
              保存
              <kbd>{{ commandLabel('mqtt.subscription.editor.save', 'c-s') }}</kbd>
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
              data-mqtt-subscription-field="alias"
              :value="item.alias"
              placeholder="订阅别名"
              @focus="focusSubscriptionEditorField('alias')"
              @input="updateSubscriptionEditorItem(item.id, { alias: ($event.target as HTMLInputElement).value })"
            />
            <input
              data-role="mqtt-subscription-editor"
              data-mqtt-subscription-field="topic"
              :value="item.topic"
              placeholder="plc/+/status"
              @focus="focusSubscriptionEditorField('topic')"
              @input="updateSubscriptionEditorItem(item.id, { topic: ($event.target as HTMLInputElement).value })"
            />
            <span>QoS {{ activeConfig?.qos ?? configForm.qos }}</span>
            <button type="button" class="danger" @click="removeSubscriptionEditorItem(item.id)">删除</button>
          </article>
          <p v-if="!props.snapshot.mqttSubscriptionDraft.items.length" class="empty-note">暂无订阅 topic</p>
        </div>
      </section>
    </div>

    <div v-if="props.snapshot.mqttLogDrawer.open" class="drawer-overlay drawer-overlay-left" role="presentation" @click="emit('dispatch', 'mqtt.log.drawer.close')">
      <aside class="mqtt-log-drawer" aria-label="MQTT 错误日志" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>错误日志</strong>
            <small>{{ visibleLogs.length }} 条</small>
          </span>
          <button type="button" @click="emit('dispatch', 'mqtt.log.drawer.close')">x</button>
        </header>
        <div class="mqtt-log-actions">
          <button type="button" @click="emit('dispatch', 'mqtt.log.clearCurrentConfig')">清空本连接</button>
          <button type="button" @click="emit('dispatch', 'mqtt.log.clearAll')">清空全部</button>
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
            <button type="button" @click.stop="emit('focusLog', log.id); emit('dispatch', 'mqtt.log.delete')">清理</button>
          </article>
          <p v-if="!visibleLogs.length" class="empty-note">暂无错误日志</p>
        </div>
        <section v-if="selectedLog" class="mqtt-log-detail">
          <header>
            <strong>日志详情</strong>
            <button type="button" @click="emit('dispatch', 'mqtt.log.delete')">清理当前日志</button>
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

    <div v-if="props.snapshot.mqttDrawer.open" class="drawer-overlay drawer-overlay-right" role="presentation" @click="emit('dispatch', 'mqtt.drawer.close')">
      <aside class="port-detail-drawer" :class="{ active: props.snapshot.mqttDrawer.active }" aria-label="MQTT 动作抽屉" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>{{ selectedLog ? '日志详情' : 'MQTT 记录' }}</strong>
            <small>{{ selectedLog ? logConfigName(selectedLog) : props.snapshot.mqttSelectedRecord?.kind || '当前上下文' }}</small>
          </span>
          <button type="button" @click="emit('dispatch', 'mqtt.drawer.close')">x</button>
        </header>
        <section v-if="selectedLog" class="mqtt-log-detail">
          <dl>
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
        <div class="detail-actions">
          <template v-if="selectedLog">
            <button type="button" class="danger" @click="emit('dispatch', 'mqtt.log.delete')">清理当前日志</button>
            <button type="button" @click="emit('dispatch', 'mqtt.log.clearCurrentConfig')">清空本连接</button>
            <button type="button" @click="emit('dispatch', 'mqtt.log.clearAll')">清空全部</button>
          </template>
          <template v-else>
            <button type="button" @click="emit('dispatch', 'mqtt.record.rename', { title: '已命名记录' })">重命名</button>
            <button type="button" @click="emit('dispatch', 'mqtt.record.resendDraft')">填入发布</button>
            <button type="button" class="danger" @click="emit('dispatch', 'mqtt.record.delete')">删除</button>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>
