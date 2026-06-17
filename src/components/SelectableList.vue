<script setup lang="ts">
import type { PortProcess } from '../domain/types'

defineProps<{
  items: PortProcess[]
  selectedIds: string[]
  focusedId: string | null
  showSelection: boolean
}>()
defineEmits<{
  focus: [id: string]
  toggle: [id: string]
  action: [id: string, actionId: string]
}>()
</script>

<template>
  <div class="list-surface" role="listbox">
    <div
      v-for="item in items"
      :key="item.id"
      class="port-row"
      role="option"
      :aria-selected="selectedIds.includes(item.id)"
      :class="{ selected: selectedIds.includes(item.id), focused: focusedId === item.id, 'selection-hidden': !showSelection }"
      @click="$emit('focus', item.id)"
      @dblclick="$emit('toggle', item.id)"
    >
      <input v-if="showSelection" type="checkbox" :checked="selectedIds.includes(item.id)" @click.stop="$emit('toggle', item.id)" />
      <span class="port-number">:{{ item.port }}</span>
      <span class="port-command">{{ item.command }}</span>
      <span class="port-meta">PID {{ item.pid }} · {{ item.address }}</span>
      <span class="port-inline-actions" @click.stop>
        <button type="button" title="进程详情" aria-label="进程详情" @click="$emit('action', item.id, 'ports.detail.open')">详</button>
        <button type="button" title="终止确认" aria-label="终止确认" @click="$emit('action', item.id, 'ports.kill.confirm')">终</button>
        <button type="button" class="danger" title="强杀" aria-label="强杀" @click="$emit('action', item.id, 'ports.kill.force')">杀</button>
        <button type="button" title="收藏为组" aria-label="收藏为组" @click="$emit('action', item.id, 'ports.group.createFromSelection')">组</button>
        <button type="button" title="打开动作抽屉" aria-label="打开动作抽屉" @click="$emit('action', item.id, 'ports.drawer.open')">...</button>
      </span>
    </div>
  </div>
</template>
