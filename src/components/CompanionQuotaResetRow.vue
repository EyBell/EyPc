<script setup lang="ts">
import { companionResetAccessibleText, type CompanionResetButton } from '../domain/companionPresentation'
import { COMPANION_QUOTA_CATEGORY_CODES } from '../domain/companionQuota'

defineProps<{ items: readonly CompanionResetButton[]; compact?: boolean }>()
const emit = defineEmits<{ hint: [event: Event, text: string]; clear: []; refresh: []; activate: [] }>()

function stateText(item: CompanionResetButton) {
  return [item.stale ? '上次数据' : '', item.partial ? '部分数据' : ''].filter(Boolean).join('·')
}

function hintText(item: CompanionResetButton) {
  return [item.detail, stateText(item)].filter(Boolean).join('\n')
}
</script>

<template>
  <span v-if="items.length" class="companion-reset-row" :class="{ 'companion-reset-row--compact': compact }" @click="$emit('activate')">
    <button
      v-for="item in items"
      :key="item.category"
      type="button"
      class="companion-reset-button"
      :data-operation-tooltip="item.label"
      data-operation-shortcut=""
      data-operation-preserve-lines
      :data-operation-description="hintText(item)"
      :aria-label="companionResetAccessibleText(item)"
      @pointerenter="emit('hint', $event, hintText(item))"
      @pointerleave="emit('clear')"
      @focus="emit('hint', $event, hintText(item))"
      @blur="emit('clear')"
      @click="emit('refresh')"
      @keydown.enter.prevent="emit('refresh')"
      @keydown.space.prevent="emit('refresh')"
    >
      <b class="companion-reset-name">{{ item.label }}</b>
      <b v-if="compact" class="companion-reset-short-name" aria-hidden="true">{{ COMPANION_QUOTA_CATEGORY_CODES[item.category].toUpperCase() }}</b>
      <span>{{ item.summary }}</span>
      <em v-if="item.stale || item.partial">{{ compact ? '!' : stateText(item) }}</em>
    </button>
  </span>
</template>
