<script setup lang="ts">
import { computed, nextTick, reactive, watch } from 'vue'
import type { AppRuntimeSnapshot, MqttConfigDraft } from '../runtime/appRuntime'
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

const activeConfig = computed(() => props.snapshot.mqttActiveConfig)
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
          <button type="button" :title="`新增订阅 ${commandLabel('mqtt.subscription.add', 'c-t')}`" @click="emit('dispatch', 'mqtt.subscription.add')">+</button>
          <button type="button" :title="`收起订阅栏 ${commandLabel('mqtt.subscription.panel.toggle', 'c-s-t')}`" @click="emit('dispatch', 'mqtt.subscription.panel.toggle')">‹</button>
        </span>
      </header>

      <button
        type="button"
        class="mqtt-subscription-row mqtt-subscription-all"
        :class="{ active: !props.snapshot.mqttActiveSubscriptionTopic }"
        @click="emit('dispatch', 'mqtt.subscription.select', { topic: '' })"
      >
        <span>
          <strong>全部 topic</strong>
          <small>清除订阅筛选</small>
        </span>
        <em>{{ props.snapshot.mqttReceiveFilter === 'incoming' ? 'IN' : props.snapshot.mqttReceiveFilter === 'outgoing' ? 'OUT' : 'ALL' }}</em>
      </button>

      <article
        v-for="row in props.snapshot.mqttSubscriptionRows"
        :key="row.topic"
        class="mqtt-subscription-row"
        :class="{ active: row.active }"
      >
        <button type="button" class="mqtt-subscription-main" @click="emit('dispatch', 'mqtt.subscription.select', { topic: row.topic })">
          <span>
            <strong>{{ row.topic }}</strong>
            <small>QoS {{ row.qos }}</small>
          </span>
          <em v-if="row.unreadCount">未读 {{ row.unreadCount }}</em>
          <em v-else>未读 0</em>
        </button>
        <input
          data-role="mqtt-search"
          :value="row.note"
          placeholder="备注"
          @click.stop
          @input="emit('dispatch', 'mqtt.subscription.note', { topic: row.topic, note: ($event.target as HTMLInputElement).value })"
        />
      </article>
      <p v-if="activeConfig && !props.snapshot.mqttSubscriptionRows.length" class="empty-note">暂无订阅 topic</p>
      <p v-if="!activeConfig" class="empty-note">先选择或创建连接</p>
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
          <label class="mqtt-config-wide">
            默认订阅 topics
            <textarea data-mqtt-field="subscriptions" data-role="mqtt-editor" rows="3" :value="configForm.subscriptionsText" @input="updateConfigDraft({ subscriptionsText: ($event.target as HTMLTextAreaElement).value })"></textarea>
          </label>
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
              <small>{{ receiveFilterLabel }} · {{ props.snapshot.mqttActiveSubscriptionTopic || '全部 topic' }}</small>
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
