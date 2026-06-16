<script setup lang="ts">
import type { FavoriteTreeNode } from '../domain/types'

defineProps<{
  rows: FavoriteTreeNode[]
  selectedIds: string[]
  focusedId: string | null
  collapsedIds: string[]
}>()
defineEmits<{
  focus: [id: string]
  toggle: [id: string]
  collapse: [id: string]
  reorder: [nodeId: string, parentId: string | null, beforeNodeId: string | null]
}>()

let dragId = ''
</script>

<template>
  <div class="favorite-tree" role="tree">
    <button
      v-for="row in rows"
      :key="row.node.id"
      type="button"
      class="favorite-row"
      :class="{ selected: selectedIds.includes(row.node.id), focused: focusedId === row.node.id }"
      :style="{ '--depth': row.depth, '--node-color': row.node.color }"
      draggable="true"
      @dragstart="dragId = row.node.id"
      @dragover.prevent
      @drop.prevent="$emit('reorder', dragId, row.node.parentId, row.node.id)"
      @click="$emit('focus', row.node.id)"
    >
      <input type="checkbox" :checked="selectedIds.includes(row.node.id)" @click.stop="$emit('toggle', row.node.id)" />
      <span class="tree-indent" />
      <span class="disclosure" @click.stop="$emit('collapse', row.node.id)">{{ row.children.length ? (collapsedIds.includes(row.node.id) ? '▸' : '▾') : '' }}</span>
      <span class="color-dot" />
      <span class="favorite-name">{{ row.node.name }}</span>
      <span class="favorite-meta">{{ row.node.kind }} · {{ row.node.tags.map((tag) => `#${tag}`).join(' ') }}</span>
    </button>
  </div>
</template>
