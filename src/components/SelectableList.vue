<script setup lang="ts">
import type { PortProcess } from '../domain/types'

defineProps<{
  items: PortProcess[]
  selectedIds: string[]
  focusedId: string | null
}>()
defineEmits<{ focus: [id: string]; toggle: [id: string] }>()
</script>

<template>
  <div class="list-surface" role="listbox">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="port-row"
      :class="{ selected: selectedIds.includes(item.id), focused: focusedId === item.id }"
      @click="$emit('focus', item.id)"
      @dblclick="$emit('toggle', item.id)"
    >
      <input type="checkbox" :checked="selectedIds.includes(item.id)" @click.stop="$emit('toggle', item.id)" />
      <span class="port-number">:{{ item.port }}</span>
      <span class="port-command">{{ item.command }}</span>
      <span class="port-meta">PID {{ item.pid }} · {{ item.address }}</span>
    </button>
  </div>
</template>
