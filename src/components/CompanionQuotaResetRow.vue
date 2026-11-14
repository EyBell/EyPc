<script setup lang="ts">
import { companionResetAccessibleText, type CompanionResetButton } from '../domain/companionPresentation'

defineProps<{ items: readonly CompanionResetButton[] }>()
const emit = defineEmits<{ hint: [event: Event, text: string]; clear: []; refresh: []; activate: [] }>()

function hintText(item: CompanionResetButton) {
  const marks = [item.stale ? '上次数据' : '', item.partial ? '部分数据' : ''].filter(Boolean).join('·')
  return [item.detail, marks].filter(Boolean).join('·')
}
</script>

<template>
  <span v-if="items.length" class="companion-reset-row" @click="$emit('activate')">
    <button
      v-for="item in items"
      :key="item.category"
      type="button"
      class="companion-reset-button"
      :data-operation-tooltip="item.label"
      :data-operation-description="hintText(item)"
      :aria-label="companionResetAccessibleText(item)"
      @pointerenter="emit('hint', $event, hintText(item))"
      @pointerleave="emit('clear')"
      @focus="emit('hint', $event, hintText(item))"
      @blur="emit('clear')"
      @click="emit('refresh')"
      @keydown.enter.prevent="emit('refresh')"
      @keydown.space.prevent="emit('refresh')"
    ><b>{{ item.label }}</b><span>{{ item.summary }}</span><em v-if="item.stale || item.partial">{{ [item.stale ? '上次数据' : '', item.partial ? '部分数据' : ''].filter(Boolean).join('·') }}</em></button>
  </span>
</template>
