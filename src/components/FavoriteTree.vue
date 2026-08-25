<script setup lang="ts">
import { ref } from 'vue'
import { Check, ChevronDown, ChevronRight, File, Folder, FolderTree, MoreHorizontal, Pencil, SquareArrowOutUpRight, X } from '@lucide/vue'
import { favoriteTreeMoveTarget } from '../domain/favorites'
import type { FavoriteNode, FavoriteTreeNode } from '../domain/types'
import type { FavoriteTreeDropPosition } from '../domain/favorites'
import type { FavoriteDraft } from '../runtime/appRuntime'

const props = defineProps<{
  nodes: FavoriteNode[]
  rows: FavoriteTreeNode[]
  selectedIds: string[]
  focusedId: string | null
  collapsedIds: string[]
  renameDraft?: FavoriteDraft | null
  canOpen: boolean
}>()
const emit = defineEmits<{
  focus: [id: string]
  context: [id: string]
  collapse: [id: string]
  action: [id: string, actionId: string]
  updateRename: [value: string]
  saveRename: []
  cancelRename: []
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

function rowDomId(id: string) {
  return `favorite-treeitem-${encodeURIComponent(id).replace(/%/g, '_')}`
}

function rowDoubleClick(row: FavoriteTreeNode) {
  emit('focus', row.node.id)
  if (row.node.kind === 'group') emit('action', row.node.id, 'favorites.group.apply')
  else if (props.canOpen) emit('action', row.node.id, 'favorites.open')
}

function isRenaming(id: string) {
  return props.renameDraft?.mode === 'rename' && props.renameDraft.targetId === id
}
</script>

<template>
  <div
    class="favorite-tree"
    role="tree"
    data-role="favorite-containers"
    tabindex="0"
    aria-label="收藏容器"
    :aria-activedescendant="props.focusedId ? rowDomId(props.focusedId) : undefined"
  >
    <div
      v-for="row in props.rows"
      :key="row.node.id"
      class="favorite-row"
      data-context-menu-target
      role="treeitem"
      tabindex="-1"
      :data-operation-tooltip="`${row.node.kind === 'group' ? '收藏分组' : '收藏目标'} ${row.node.name}`"
      data-operation-description="单击聚焦；双击进入或打开；右键显示相关操作"
      :id="rowDomId(row.node.id)"
      :aria-level="row.depth + 1"
      :aria-selected="props.selectedIds.includes(row.node.id)"
      :aria-expanded="row.children.length ? !props.collapsedIds.includes(row.node.id) : undefined"
      :class="[{ selected: props.selectedIds.includes(row.node.id), focused: props.focusedId === row.node.id }, dragClass(row.node.id)]"
      :style="{ '--depth': row.depth, '--node-color': row.node.color }"
      draggable="true"
      @dragstart="dragId = row.node.id"
      @dragend="clearDropTarget(); dragId = ''"
      @dragover="onDragOver(row, $event)"
      @dragleave="clearDropTarget(row.node.id)"
      @drop="onDrop(row, $event)"
      @click="$emit('focus', row.node.id)"
      @dblclick="rowDoubleClick(row)"
      @contextmenu.prevent="$emit('context', row.node.id)"
    >
      <span class="tree-indent" />
      <button
        v-if="row.children.length"
        type="button"
        class="disclosure"
        tabindex="-1"
        :aria-label="props.collapsedIds.includes(row.node.id) ? `展开 ${row.node.name}` : `折叠 ${row.node.name}`"
        :aria-expanded="!props.collapsedIds.includes(row.node.id)"
        @click.stop="$emit('collapse', row.node.id)"
      >
        <ChevronRight v-if="props.collapsedIds.includes(row.node.id)" :size="14" aria-hidden="true" />
        <ChevronDown v-else :size="14" aria-hidden="true" />
      </button>
      <span v-else class="disclosure-placeholder" aria-hidden="true" />
      <span class="color-dot" />
      <span class="favorite-kind-icon" :title="row.node.kind === 'group' ? '分组' : row.node.kind === 'folder' ? '文件夹' : '文件'">
        <FolderTree v-if="row.node.kind === 'group'" :size="15" aria-hidden="true" />
        <Folder v-else-if="row.node.kind === 'folder'" :size="15" aria-hidden="true" />
        <File v-else :size="15" aria-hidden="true" />
      </span>
      <span class="favorite-name">
        <input
          v-if="isRenaming(row.node.id)"
          class="favorite-inline-rename"
          data-role="favorite-editor"
          data-field="name"
          :value="props.renameDraft?.name"
          aria-label="重命名收藏"
          @click.stop
          @input="emit('updateRename', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent.stop="emit('saveRename')"
          @keydown.escape.prevent.stop="emit('cancelRename')"
        />
        <span v-else>{{ row.node.name }}</span>
      </span>
      <span class="favorite-meta">{{ row.node.tags.map((tag) => `#${tag}`).join(' ') || (row.node.path || '虚拟分组') }}</span>
      <span class="tree-row-actions" @click.stop>
        <button v-if="row.node.kind !== 'group'" type="button" tabindex="-1" aria-label="打开" title="打开" :disabled="!props.canOpen" @click.stop="emit('action', row.node.id, 'favorites.open')"><SquareArrowOutUpRight :size="14" aria-hidden="true" /></button>
        <button v-if="isRenaming(row.node.id)" type="button" tabindex="-1" aria-label="保存重命名" title="保存" @click.stop="emit('saveRename')"><Check :size="14" aria-hidden="true" /></button>
        <button v-if="isRenaming(row.node.id)" type="button" tabindex="-1" aria-label="取消重命名" title="取消" @click.stop="emit('cancelRename')"><X :size="14" aria-hidden="true" /></button>
        <button v-else type="button" tabindex="-1" aria-label="编辑" title="编辑" @click.stop="emit('action', row.node.id, 'favorites.edit')"><Pencil :size="14" aria-hidden="true" /></button>
        <button type="button" tabindex="-1" aria-label="更多动作" title="更多动作" @click.stop="emit('action', row.node.id, 'favorites.drawer.open')"><MoreHorizontal :size="14" aria-hidden="true" /></button>
      </span>
    </div>
  </div>
</template>
