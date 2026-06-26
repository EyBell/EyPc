<script setup lang="ts">
import { buildMqttInlinePayloadPreviewSegments } from '../domain/mqttPayloadPreview'
import { mqttPublishTemplateOperationTime, type MqttTopicVisual } from '../domain/mqtt'
import type { MqttMessageRecord, MqttPublishTemplate } from '../domain/types'
import type { MqttRecordListId, MqttRecordListState } from '../runtime/appRuntime'

type PublishRecordRow = MqttMessageRecord | MqttPublishTemplate

const props = defineProps<{
  listId: Extract<MqttRecordListId, 'templates' | 'history'>
  title: string
  rows: PublishRecordRow[]
  state: MqttRecordListState
  selectedKind: 'message' | 'publish-template' | null
  selectedId: string | null
  topicVisual: (topic: string) => MqttTopicVisual
}>()

const emit = defineEmits<{
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
  const time = new Date(isTemplate(row) ? mqttPublishTemplateOperationTime(row) : row.timestamp).toLocaleTimeString()
  return `${time} · QoS ${row.qos}`
}

function rowTopic(row: PublishRecordRow) {
  return row.topic || '(empty topic)'
}

function rowAlias(row: PublishRecordRow) {
  const title = row.title?.trim() || ''
  if (!title) return ''
  return title === row.topic.trim() ? '' : title
}

function rowRouteLabel(row: PublishRecordRow) {
  return rowAlias(row) || props.topicVisual(row.topic).alias || rowTopic(row)
}

function rowStyle(row: PublishRecordRow) {
  return { '--mqtt-topic-color': props.topicVisual(row.topic).color }
}

function payloadSnippet(payload: string) {
  return payload.replace(/\s+/g, ' ').trim() || '(empty payload)'
}

function payloadSnippetSegments(payload: string) {
  return buildMqttInlinePayloadPreviewSegments(payload)
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
  <section class="mqtt-publish-record-list" :class="`mqtt-publish-record-list-${listId}`" tabindex="-1">
    <div class="mqtt-publish-record-list-body">
      <article
        v-for="(row, index) in rows"
        :key="row.id"
        class="mqtt-publish-record-row mqtt-message-row outgoing"
        role="option"
        tabindex="-1"
        :class="{ focused: isFocused(row), selected: selected(row), active: index === state.activeIndex }"
        :data-mqtt-preview-target="previewTargetValue(row)"
        :data-quick-jump-label="rowRouteLabel(row)"
        :data-quick-jump-search="`${rowTopic(row)} ${payloadSnippet(row.payload)}`"
        :aria-selected="selected(row) || isFocused(row)"
        :style="rowStyle(row)"
        @click="emit('focusRow', row)"
        @dblclick="emit('toggleSelect', row, $event.shiftKey)"
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
        <span class="mqtt-template-main mqtt-message-route">
          <strong data-quick-jump-anchor :title="rowTopic(row)">{{ rowRouteLabel(row) }}</strong>
          <small class="mqtt-topic-meta">{{ rowMeta(row) }}</small>
        </span>
        <span class="mqtt-item-payload-snippet" :title="payloadSnippet(row.payload)">
          <template v-for="(segment, index) in payloadSnippetSegments(row.payload)" :key="`${index}:${segment.kind}:${segment.text}`">
            <span class="mqtt-preview-token" :class="`mqtt-preview-token-${segment.kind}`">{{ segment.text }}</span>
          </template>
        </span>
      </article>
      <p v-if="!rows.length" class="empty-note">暂无{{ title }}</p>
    </div>
  </section>
</template>
