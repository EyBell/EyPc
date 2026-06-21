<script setup lang="ts">
import { ref } from 'vue'
import { favoriteTreeMoveTarget } from '../domain/favorites'
import type { FavoriteNode, FavoriteTreeNode } from '../domain/types'
import type { FavoriteTreeDropPosition } from '../domain/favorites'

const props = defineProps<{
  nodes: FavoriteNode[]
  rows: FavoriteTreeNode[]
  selectedIds: string[]
  focusedId: string | null
  collapsedIds: string[]
}>()
const emit = defineEmits<{
  focus: [id: string]
  toggle: [id: string]
  context: [id: string]
  collapse: [id: string]
  action: [id: string, actionId: string]
  reorder: [nodeId: string, parentId: string | null, beforeNodeId: string | null]
}>()

let dragId = ''
const dropTarget = ref<{ id: string; position: FavoriteTreeDropPosition } | null>(null)

function dropPosition(event: DragEvent): FavoriteTreeDropPosition {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return 'inside'
  const ratio = (event.clientY - rect.top) / rect.height
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

function dragClass(id: string) {
  if (dropTarget.value?.id !== id) return null
  return `drop-${dropTarget.value.position}`
}

function onDragOver(row: FavoriteTreeNode, event: DragEvent) {
  event.preventDefault()
  if (!dragId || dragId === row.node.id) {
    dropTarget.value = null
    return
  }
  const position = dropPosition(event)
  dropTarget.value = favoriteTreeMoveTarget(props.nodes, dragId, row.node.id, position)
    ? { id: row.node.id, position }
    : null
}

function onDrop(row: FavoriteTreeNode, event: DragEvent) {
  event.preventDefault()
  const position = dropTarget.value?.id === row.node.id ? dropTarget.value.position : dropPosition(event)
  const target = dragId ? favoriteTreeMoveTarget(props.nodes, dragId, row.node.id, position) : null
  if (target) emit('reorder', dragId, target.parentId, target.beforeNodeId)
  dropTarget.value = null
  dragId = ''
}

function clearDropTarget(id?: string) {
  if (!id || dropTarget.value?.id === id) dropTarget.value = null
}
</script>

<template>
  <div class="favorite-tree" role="tree">
    <div
      v-for="row in props.rows"
      :key="row.node.id"
      class="favorite-row"
      role="treeitem"
      tabindex="0"
      :class="[{ selected: props.selectedIds.includes(row.node.id), focused: props.focusedId === row.node.id }, dragClass(row.node.id)]"
      :style="{ '--depth': row.depth, '--node-color': row.node.color }"
      draggable="true"
      @dragstart="dragId = row.node.id"
      @dragend="clearDropTarget(); dragId = ''"
      @dragover="onDragOver(row, $event)"
      @dragleave="clearDropTarget(row.node.id)"
      @drop="onDrop(row, $event)"
      @click="$emit('focus', row.node.id)"
      @contextmenu.prevent="$emit('context', row.node.id)"
    >
      <input type="checkbox" :checked="props.selectedIds.includes(row.node.id)" @click.stop="$emit('toggle', row.node.id)" />
      <span class="tree-indent" />
      <span class="disclosure" @click.stop="$emit('collapse', row.node.id)">{{ row.children.length ? (props.collapsedIds.includes(row.node.id) ? '▸' : '▾') : '' }}</span>
      <span class="color-dot" />
      <span class="favorite-name">{{ row.node.name }}</span>
      <span class="favorite-meta">{{ row.node.kind }} · {{ row.node.tags.map((tag) => `#${tag}`).join(' ') }}</span>
      <span class="tree-row-actions" @click.stop>
        <button v-if="row.node.kind !== 'group'" type="button" title="打开" @click.stop="emit('action', row.node.id, 'favorites.open')">开</button>
        <button type="button" title="编辑" @click.stop="emit('action', row.node.id, 'favorites.edit')">编</button>
        <button type="button" title="更多动作" @click.stop="emit('action', row.node.id, 'favorites.drawer.open')">...</button>
      </span>
    </div>
  </div>
</template>
