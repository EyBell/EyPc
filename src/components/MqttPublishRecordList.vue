<script setup lang="ts">
import {
  CornerDownLeft,
  Info,
  MoreHorizontal,
  Send,
  Star,
  Trash2
} from '@lucide/vue'
import type { MqttMessageRecord, MqttPublishTemplate } from '../domain/types'
import type { MqttRecordListId, MqttRecordListState } from '../runtime/appRuntime'

type PublishRecordRow = MqttMessageRecord | MqttPublishTemplate

const props = defineProps<{
  listId: Extract<MqttRecordListId, 'templates' | 'history'>
  title: string
  search: string
  rows: PublishRecordRow[]
  state: MqttRecordListState
  selectedKind: 'message' | 'publish-template' | null
  selectedId: string | null
  commandTitle: (label: string, commandId: string, fallback: string) => string
  shortcutHintAttr: (commandId: string) => string | undefined
}>()

const emit = defineEmits<{
  search: [query: string]
  focusRow: [row: PublishRecordRow]
  toggleSelect: [row: PublishRecordRow, range: boolean]
  apply: [row: PublishRecordRow]
  repeatSend: [row?: PublishRecordRow]
  favorite: [row: PublishRecordRow]
  preview: [row: PublishRecordRow, event?: MouseEvent]
  closePreview: []
  detail: [row: PublishRecordRow]
  menu: [row: PublishRecordRow]
  rename: [row: MqttPublishTemplate, title: string]
  deleteSelected: []
}>()

function isTemplate(row: PublishRecordRow): row is MqttPublishTemplate {
  return !('direction' in row)
}

function rowKind(row: PublishRecordRow): 'message' | 'publish-template' {
  return isTemplate(row) ? 'publish-template' : 'message'
}

function rowTitle(row: PublishRecordRow) {
  if (isTemplate(row)) return row.title
  return row.title || `${row.direction === 'incoming' ? 'IN' : row.direction === 'outgoing' ? 'OUT' : 'EVENT'} ${row.topic || '(empty topic)'}`
}

function rowMeta(row: PublishRecordRow) {
  const time = new Date(isTemplate(row) ? row.updatedAt : row.timestamp).toLocaleTimeString()
  return isTemplate(row) ? `${row.topic} · QoS ${row.qos}` : `${time} · QoS ${row.qos}`
}

function payloadSnippet(payload: string) {
  return payload.replace(/\s+/g, ' ').trim() || '(empty payload)'
}

function isFocused(row: PublishRecordRow) {
  return props.selectedKind === rowKind(row) && props.selectedId === row.id
}

function previewTargetValue(row: PublishRecordRow) {
  return `${rowKind(row)}:${row.id}`
}

function selected(row: PublishRecordRow) {
  return props.state.selectedIds.includes(row.id)
}
</script>

<template>
  <section class="mqtt-publish-record-list" :class="`mqtt-publish-record-list-${listId}`">
    <header class="mqtt-publish-record-list-header">
      <span class="mqtt-publish-record-list-title">
        <strong>{{ title }}</strong>
        <input
          class="mqtt-template-search"
          :data-role="listId === 'templates' ? 'mqtt-template-search' : 'mqtt-history-search'"
          :value="search"
          :placeholder="`搜索${title}`"
          :aria-label="`搜索${title}`"
          :data-mqtt-shortcut-hint="shortcutHintAttr(listId === 'templates' ? 'mqtt.focus.templates' : 'mqtt.publish.records.toggle')"
          @focus="emit('search', search)"
          @input="emit('search', ($event.target as HTMLInputElement).value)"
        />
      </span>
      <span class="mqtt-publish-record-list-tools">
        <small>{{ rows.length }} 条</small>
        <button
          v-if="state.selectedIds.length"
          type="button"
          class="mqtt-icon-button"
          :title="commandTitle(`重复发送选中${title}`, 'mqtt.record.repeatSend', 'cr')"
          :aria-label="`重复发送选中${title}`"
          @click="emit('repeatSend')"
        >
          <Send class="mqtt-icon" aria-hidden="true" />
        </button>
        <button
          v-if="state.selectedIds.length"
          type="button"
          class="mqtt-icon-button danger"
          :title="commandTitle(`删除选中${title}`, 'mqtt.record.delete', 'del')"
          :aria-label="`删除选中${title}`"
          @click="emit('deleteSelected')"
        >
          <Trash2 class="mqtt-icon" aria-hidden="true" />
        </button>
      </span>
    </header>

    <div class="mqtt-publish-record-list-body">
      <article
        v-for="(row, index) in rows"
        :key="row.id"
        class="mqtt-publish-record-row mqtt-message-row outgoing"
        :class="{ focused: isFocused(row), selected: selected(row), active: index === state.activeIndex }"
        :data-mqtt-preview-target="previewTargetValue(row)"
        @click="emit('focusRow', row)"
        @contextmenu.prevent="emit('menu', row)"
        @mouseenter="emit('preview', row, $event)"
        @mouseleave="emit('closePreview')"
      >
        <input
          class="mqtt-record-checkbox"
          type="checkbox"
          :checked="selected(row)"
          :aria-label="`选择${rowTitle(row)}`"
          @click.stop="emit('toggleSelect', row, $event.shiftKey)"
        />
        <span class="mqtt-template-main">
          <input
            v-if="isTemplate(row)"
            data-role="mqtt-search"
            :value="row.title"
            aria-label="模板名称"
            @click.stop
            @focus="emit('focusRow', row)"
            @change="emit('rename', row, ($event.target as HTMLInputElement).value)"
          />
          <strong v-else>{{ rowTitle(row) }}</strong>
          <small>{{ rowMeta(row) }}</small>
        </span>
        <span class="mqtt-item-payload-snippet">{{ payloadSnippet(row.payload) }}</span>
        <span class="mqtt-message-actions" :aria-label="`${title}操作`">
          <button type="button" class="mqtt-icon-button" title="填入发布" aria-label="填入发布" @click.stop="emit('apply', row)">
            <CornerDownLeft class="mqtt-icon" aria-hidden="true" />
          </button>
          <button type="button" class="mqtt-icon-button" :title="commandTitle('重复发送', 'mqtt.record.repeatSend', 'cr')" aria-label="重复发送" @click.stop="emit('repeatSend', row)">
            <Send class="mqtt-icon" aria-hidden="true" />
          </button>
          <button type="button" class="mqtt-icon-button" :title="commandTitle('收藏/别名', 'mqtt.record.favorite', 'c-d')" aria-label="收藏/别名" @click.stop="emit('favorite', row)">
            <Star class="mqtt-icon" aria-hidden="true" />
          </button>
          <button type="button" class="mqtt-icon-button" :title="commandTitle('预览', 'mqtt.preview.open', 'c-i')" aria-label="预览" @click.stop="emit('preview', row)">
            <Info class="mqtt-icon" aria-hidden="true" />
          </button>
          <button type="button" class="mqtt-icon-button" :title="commandTitle('快捷操作', 'mqtt.drawer.open', 'c-→')" aria-label="快捷操作" @click.stop="emit('menu', row)">
            <MoreHorizontal class="mqtt-icon" aria-hidden="true" />
          </button>
        </span>
      </article>
      <p v-if="!rows.length" class="empty-note">暂无{{ title }}</p>
    </div>
  </section>
</template>
