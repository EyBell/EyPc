<script setup lang="ts">
import { BookmarkPlus, CircleStop, Info, MoreHorizontal, Zap } from '@lucide/vue'
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
  <div class="list-surface" role="listbox" data-role="port-results-list" tabindex="-1" :aria-activedescendant="focusedId ? `port-row-${focusedId}` : undefined">
    <div
      v-for="item in items"
      :key="item.id"
      class="port-row"
      :id="`port-row-${item.id}`"
      data-context-menu-target
      :data-context-menu-active="focusedId === item.id"
      role="option"
      :aria-selected="selectedIds.includes(item.id)"
      :class="{ selected: selectedIds.includes(item.id), focused: focusedId === item.id, 'selection-hidden': !showSelection }"
      :title="`:${item.port} · ${item.command} · PID ${item.pid} · ${item.address}`"
      data-operation-tooltip="右键打开端口操作菜单"
      @click="$emit('focus', item.id)"
      @dblclick="$emit('toggle', item.id)"
      @contextmenu.prevent="$emit('focus', item.id); $emit('action', item.id, 'ports.drawer.open')"
    >
      <input v-if="showSelection" type="checkbox" :aria-label="`选择 ${item.command} ${item.port}`" :checked="selectedIds.includes(item.id)" @click.stop="$emit('toggle', item.id)" />
      <span class="port-number">:{{ item.port }}</span>
      <span class="port-command">{{ item.command }}</span>
      <span class="port-meta">PID {{ item.pid }}</span>
      <span class="port-inline-actions" @click.stop>
        <button type="button" title="进程详情" aria-label="进程详情" @click="$emit('action', item.id, 'ports.detail.open')"><Info :size="14" aria-hidden="true" /></button>
        <button type="button" title="终止确认" aria-label="终止确认" @click="$emit('action', item.id, 'ports.kill.confirm')"><CircleStop :size="14" aria-hidden="true" /></button>
        <button type="button" class="danger" title="强杀" aria-label="强杀" @click="$emit('action', item.id, 'ports.kill.force')"><Zap :size="14" aria-hidden="true" /></button>
        <button type="button" title="收藏为组" aria-label="收藏为组" @click="$emit('action', item.id, 'ports.group.createFromSelection')"><BookmarkPlus :size="14" aria-hidden="true" /></button>
        <button type="button" title="打开动作抽屉" aria-label="打开动作抽屉" @click="$emit('action', item.id, 'ports.drawer.open')"><MoreHorizontal :size="14" aria-hidden="true" /></button>
      </span>
    </div>
  </div>
</template>
