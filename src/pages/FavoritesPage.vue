<script setup lang="ts">
import { reactive } from 'vue'
import SearchBox from '../components/SearchBox.vue'
import FavoriteTree from '../components/FavoriteTree.vue'
import type { FavoriteKind, FavoriteNode } from '../domain/types'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()
const emit = defineEmits<{
  search: [value: string]
  focus: [id: string]
  toggle: [id: string]
  collapse: [id: string]
  add: [value: Pick<FavoriteNode, 'kind' | 'path' | 'name' | 'parentId' | 'tags' | 'color'>]
  remove: []
  reorder: [nodeId: string, parentId: string | null, beforeNodeId: string | null]
  dispatch: [actionId: string]
}>()

const draft = reactive({
  kind: 'folder' as FavoriteKind,
  path: '',
  name: '',
  tags: '',
  color: '#2F80ED',
  parentId: ''
})

function addFavorite() {
  emit('add', {
    kind: draft.kind,
    path: draft.path,
    name: draft.name,
    parentId: draft.parentId || null,
    tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
    color: draft.color
  })
  draft.path = ''
  draft.name = ''
  draft.tags = ''
}
</script>

<template>
  <section class="page-grid">
    <aside class="side-panel">
      <h2>新增收藏</h2>
      <label>
        类型
        <select v-model="draft.kind">
          <option value="folder">文件夹</option>
          <option value="file">文件</option>
          <option value="group">分组</option>
        </select>
      </label>
      <label>
        名称
        <input v-model="draft.name" placeholder="显示名称" />
      </label>
      <label v-if="draft.kind !== 'group'">
        路径
        <input v-model="draft.path" placeholder="/Users/me/project" />
      </label>
      <label>
        标签
        <input v-model="draft.tags" placeholder="code, docs" />
      </label>
      <label>
        颜色
        <input v-model="draft.color" type="color" />
      </label>
      <button type="button" @click="emit('dispatch', 'favorites.pickAndAdd')">选择路径</button>
      <button type="button" @click="addFavorite">添加</button>
    </aside>
    <section class="main-panel">
      <div class="toolbar">
        <SearchBox
          :model-value="props.snapshot.state.favoriteSearch"
          placeholder="搜索文件名、路径、标签"
          :history="props.snapshot.state.favoriteSearchHistory"
          @update:model-value="emit('search', $event)"
        />
        <div class="toolbar-actions">
          <button type="button" @click="emit('dispatch', 'favorites.open')">打开</button>
          <button type="button" @click="emit('dispatch', 'favorites.reveal')">定位</button>
          <button type="button" @click="emit('dispatch', 'favorites.copyPath')">复制路径</button>
          <button type="button" class="danger" @click="emit('remove')">移除</button>
        </div>
      </div>
      <FavoriteTree
        :rows="props.snapshot.favoriteRows"
        :selected-ids="props.snapshot.selectedFavoriteIds"
        :focused-id="props.snapshot.focusedFavoriteId"
        :collapsed-ids="props.snapshot.collapsedFavoriteIds"
        @focus="emit('focus', $event)"
        @toggle="emit('toggle', $event)"
        @collapse="emit('collapse', $event)"
        @reorder="(nodeId, parentId, beforeNodeId) => emit('reorder', nodeId, parentId, beforeNodeId)"
      />
    </section>
  </section>
</template>
