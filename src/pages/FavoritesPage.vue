<script setup lang="ts">
import { nextTick, watch } from 'vue'
import SearchSuggestBox from '../components/SearchSuggestBox.vue'
import FavoriteTree from '../components/FavoriteTree.vue'
import { inferFavoriteNameFromPath } from '../domain/favorites'
import type { AppRuntimeSnapshot, FavoriteDraft, FavoritePickReviewItem } from '../runtime/appRuntime'
import type { FavoriteKind, FavoriteNode } from '../domain/types'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()
const emit = defineEmits<{
  search: [value: string]
  groupSearch: [value: string]
  focus: [id: string]
  focusGroup: [id: string]
  focusDirectory: [path: string]
  toggle: [id: string]
  toggleDirectory: [path: string]
  collapse: [id: string]
  reorder: [nodeId: string, parentId: string | null, beforeNodeId: string | null]
  updatePickReviewItem: [index: number, value: Partial<FavoritePickReviewItem>]
  updateFavoriteDraft: [value: Partial<FavoriteDraft>]
  saveFavoriteDraft: [value?: Partial<FavoriteDraft>]
  cancelFavoriteDraft: []
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

function selectedParentId() {
  return props.snapshot.selectedFavoriteGroupId || props.snapshot.focusedFavoriteGroupId || null
}

function commandLabel(commandId: string, fallback: string) {
  return props.snapshot.commandShortcutLabels[commandId] || fallback
}

function kindLabel(kind: FavoriteKind) {
  if (kind === 'group') return 'GROUP'
  return kind === 'folder' ? 'DIR' : 'FILE'
}

function kindName(kind: FavoriteKind) {
  if (kind === 'group') return '分组'
  return kind === 'folder' ? '文件夹' : '文件'
}

function virtualRows() {
  return props.snapshot.selectedFavoriteContainer && !props.snapshot.state.favoriteSearch
    ? props.snapshot.favoriteVirtualChildRows
    : props.snapshot.favoriteItemRows
}

function containerTitle() {
  return props.snapshot.selectedFavoriteContainer?.name || '全部收藏'
}

function containerSubtitle() {
  const container = props.snapshot.selectedFavoriteContainer
  if (!container) return '根级与搜索结果'
  if (container.kind === 'folder') return container.path || '文件夹容器'
  if (container.kind === 'file') return container.path || '文件容器'
  return '虚拟分组'
}

function drawerTitle() {
  if (props.snapshot.favoriteDrawer.targetKind === 'directory') return `实际目录项 ${props.snapshot.favoriteDrawer.targetIds.length}`
  const target = props.snapshot.state.favorites.find((item) => item.id === props.snapshot.favoriteDrawer.targetIds[0])
  return target?.name || '收藏动作'
}

function drawerSubtitle() {
  if (props.snapshot.favoriteDrawer.targetKind === 'directory') return props.snapshot.favoriteDrawer.targetIds.join(' / ')
  const target = props.snapshot.state.favorites.find((item) => item.id === props.snapshot.favoriteDrawer.targetIds[0])
  return target?.path || '虚拟元数据'
}

function parentName(parentId: string | null) {
  if (!parentId) return '根级'
  return props.snapshot.state.favorites.find((item) => item.id === parentId)?.name || '根级'
}

function reviewTitle() {
  const review = props.snapshot.favoritePickReview
  if (!review) return ''
  return review.kind === 'folder' ? '确认收藏文件夹' : '确认收藏文件'
}

function openFavoriteContextMenu(id: string) {
  const item = props.snapshot.state.favorites.find((node) => node.id === id)
  if (item?.kind === 'group') emit('focusGroup', id)
  else emit('focus', id)
  emit('dispatch', 'favorites.drawer.open')
}

function openDirectoryContextMenu(path: string) {
  emit('focusDirectory', path)
  emit('dispatch', 'favorites.drawer.open')
}

function dispatchFavoriteRowAction(item: FavoriteNode, actionId: string) {
  if (item.kind === 'group') emit('focusGroup', item.id)
  else emit('focus', item.id)
  emit('dispatch', actionId, { favoriteId: item.id })
}

function dispatchFavoriteTreeAction(id: string, actionId: string) {
  const item = props.snapshot.state.favorites.find((node) => node.id === id)
  if (item) dispatchFavoriteRowAction(item, actionId)
}

function dispatchDirectoryRowAction(path: string, actionId: string) {
  emit('focusDirectory', path)
  emit('dispatch', actionId, { directoryPaths: [path] })
}

function inferNameFromPath(event: ClipboardEvent) {
  const path = event.clipboardData?.getData('text/plain')?.trim()
  const draft = props.snapshot.favoriteDraft
  if (!path || !draft || draft.name.trim()) return
  emit('updateFavoriteDraft', { name: inferFavoriteNameFromPath(path) })
}

function updateDraft(value: Partial<FavoriteDraft>) {
  emit('updateFavoriteDraft', value)
}

function updateReview(index: number, value: Partial<FavoritePickReviewItem>) {
  emit('updatePickReviewItem', index, value)
}

watch(() => props.snapshot.favoriteDraft?.activeField, () => {
  nextTick(() => {
    const field = props.snapshot.favoriteDraft?.activeField
    if (!field) return
    document.querySelector<HTMLElement>(`[data-role="favorite-editor"] [data-field="${field}"]`)?.focus()
  })
})

watch(() => props.snapshot.favoritePickReview?.activeIndex, () => {
  nextTick(() => {
    const index = props.snapshot.favoritePickReview?.activeIndex
    if (index === undefined) return
    document.querySelector<HTMLElement>(`[data-role="favorite-pick-review"] [data-review-index="${index}"] [data-field="name"]`)?.focus()
  })
})
</script>

<template>
  <section class="page-grid favorites-workbench">
    <aside class="side-panel favorite-groups-panel">
      <div class="pane-search">
        <SearchSuggestBox
          :model-value="props.snapshot.favoriteGroupSearch"
          role="favorite-group-search"
          placeholder="搜索容器"
          :status="`${props.snapshot.favoriteContainerRows.length} 节点`"
          @focus="emit('dispatch', 'favorites.groupSearch.focus')"
          @update:model-value="emit('groupSearch', $event)"
        />
      </div>

      <div class="favorite-command-strip compact-actions">
        <button type="button" @click="emit('dispatch', 'favorites.pick.files')">选择文件</button>
        <button type="button" @click="emit('dispatch', 'favorites.pick.folders')">选择文件夹</button>
        <button type="button" @click="emit('dispatch', 'favorites.target.create')">手动添加</button>
        <button type="button" @click="emit('dispatch', 'favorites.group.create')">新建分组</button>
      </div>

      <div v-if="props.snapshot.state.favorites.length === 0" class="favorite-empty-state">
        <strong>初始化收藏</strong>
        <p>从一个文件、文件夹或分组开始。</p>
        <div class="toolbar-actions compact-actions">
          <button type="button" @click="emit('dispatch', 'favorites.pick.files')">选择文件</button>
          <button type="button" @click="emit('dispatch', 'favorites.pick.folders')">选择文件夹</button>
          <button type="button" @click="emit('dispatch', 'favorites.target.create')">手动添加</button>
          <button type="button" @click="emit('dispatch', 'favorites.group.create')">新建分组</button>
        </div>
      </div>

      <FavoriteTree
        :nodes="props.snapshot.state.favorites"
        :rows="props.snapshot.favoriteContainerRows"
        :selected-ids="props.snapshot.selectedFavoriteGroupId ? [props.snapshot.selectedFavoriteGroupId] : []"
        :focused-id="props.snapshot.focusedFavoriteGroupId"
        :collapsed-ids="props.snapshot.state.collapsedFavoriteGroupIds"
        @focus="emit('focusGroup', $event)"
        @toggle="emit('focusGroup', $event)"
        @context="openFavoriteContextMenu"
        @action="dispatchFavoriteTreeAction"
        @collapse="emit('collapse', $event)"
        @reorder="(nodeId, parentId, beforeNodeId) => emit('reorder', nodeId, parentId, beforeNodeId)"
      />
    </aside>

    <section class="main-panel favorite-items-panel">
      <div class="toolbar favorite-main-toolbar">
        <SearchSuggestBox
          :model-value="props.snapshot.state.favoriteSearch"
          role="favorite-search"
          placeholder="搜索名称、路径、标签"
          :status="`${virtualRows().length} 收藏`"
          @focus="emit('dispatch', 'favorites.search.focus')"
          @update:model-value="emit('search', $event)"
        />
        <div class="toolbar-actions">
          <button type="button" @click="emit('dispatch', 'favorites.pick.files')">文件</button>
          <button type="button" @click="emit('dispatch', 'favorites.pick.folders')">文件夹</button>
          <button type="button" @click="emit('dispatch', 'favorites.target.create')">手填</button>
        </div>
      </div>

      <div class="favorite-container-summary">
        <div>
          <strong>{{ containerTitle() }}</strong>
          <small>{{ containerSubtitle() }}</small>
        </div>
        <span>{{ virtualRows().length }} 项</span>
      </div>

      <div class="list-surface favorite-path-list favorite-item-list" role="listbox">
        <section class="favorite-virtual-section">
          <header>
            <strong>收藏路径</strong>
            <small>{{ virtualRows().length }}</small>
          </header>
          <div
            v-for="item in virtualRows()"
            :key="item.id"
            class="favorite-row favorite-item-row"
            role="option"
            tabindex="0"
            :class="{ selected: props.snapshot.selectedFavoriteIds.includes(item.id), focused: props.snapshot.focusedFavoriteId === item.id || props.snapshot.focusedFavoriteGroupId === item.id }"
            :style="{ '--node-color': item.color }"
            draggable="true"
            @dragstart="$event.dataTransfer?.setData('text/plain', item.id)"
            @dragover.prevent
            @drop.prevent="emit('reorder', $event.dataTransfer?.getData('text/plain') || item.id, selectedParentId(), item.id)"
            @click="emit('focus', item.id)"
            @dblclick="emit('dispatch', 'favorites.open', { favoriteId: item.id })"
            @contextmenu.prevent="openFavoriteContextMenu(item.id)"
          >
            <input type="checkbox" :checked="props.snapshot.selectedFavoriteIds.includes(item.id)" @click.stop="emit('toggle', item.id)" />
            <span class="color-dot" />
            <span class="favorite-kind">{{ kindLabel(item.kind) }}</span>
            <span class="favorite-name">{{ item.name }}</span>
            <span class="favorite-path">{{ item.path || '虚拟分组' }}</span>
            <span class="favorite-meta">{{ item.tags.map((tag) => `#${tag}`).join(' ') }}</span>
            <span class="favorite-row-actions" @click.stop>
              <button v-if="item.kind !== 'group'" type="button" title="打开" @click="dispatchFavoriteRowAction(item, 'favorites.open')">开</button>
              <button v-if="item.kind !== 'group'" type="button" title="定位" @click="dispatchFavoriteRowAction(item, 'favorites.reveal')">定</button>
              <button v-if="item.kind !== 'group'" type="button" title="复制路径" @click="dispatchFavoriteRowAction(item, 'favorites.copyPath')">复</button>
              <button type="button" title="更多动作" @click="dispatchFavoriteRowAction(item, 'favorites.drawer.open')">...</button>
              <button type="button" class="danger" title="移除收藏元数据" @click="dispatchFavoriteRowAction(item, 'favorites.remove')">删</button>
            </span>
          </div>
          <p v-if="virtualRows().length === 0" class="empty-note">没有匹配的收藏路径。</p>
        </section>
      </div>

      <details class="favorite-advanced-panel">
        <summary>
          <span>目录与虚拟子项</span>
          <small>{{ props.snapshot.favoriteDirectoryError || `${props.snapshot.favoriteDirectoryEntries.length} 实际项` }}</small>
          <button type="button" @click.prevent.stop="emit('dispatch', 'favorites.directory.addSelected')">收藏选中实际项</button>
        </summary>
        <section v-if="props.snapshot.selectedFavoriteContainer?.kind === 'folder'" class="favorite-directory-section">
          <div
            v-for="entry in props.snapshot.favoriteDirectoryEntries"
            :key="entry.path"
            class="favorite-row favorite-directory-row"
            role="option"
            tabindex="0"
            :class="{ selected: entry.selected, focused: entry.focused, favorited: entry.favorited }"
            @click="emit('focusDirectory', entry.path)"
            @dblclick="emit('dispatch', 'favorites.directory.open', { directoryPaths: [entry.path] })"
            @contextmenu.prevent="openDirectoryContextMenu(entry.path)"
          >
            <input type="checkbox" :checked="entry.selected" @click.stop="emit('toggleDirectory', entry.path)" />
            <span class="favorite-kind">{{ kindLabel(entry.kind) }}</span>
            <span class="favorite-name">{{ entry.name }}</span>
            <span class="favorite-path">{{ entry.path }}</span>
            <span class="favorite-meta">{{ entry.favorited ? '已收藏' : '实际' }}</span>
            <span class="favorite-row-actions" @click.stop>
              <button type="button" title="打开" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.open')">开</button>
              <button type="button" title="定位" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.reveal')">定</button>
              <button type="button" title="复制路径" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.copyPath')">复</button>
              <button type="button" title="收藏此项" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.addSelected')">藏</button>
              <button type="button" title="更多动作" @click="openDirectoryContextMenu(entry.path)">...</button>
            </span>
          </div>
          <p v-if="props.snapshot.favoriteDirectoryEntries.length === 0" class="empty-note">{{ props.snapshot.favoriteDirectoryError || '当前目录没有可显示的一层内容。' }}</p>
        </section>
        <p v-else class="empty-note">选择文件夹收藏后显示一层实际目录。</p>
      </details>
    </section>

    <div
      v-if="props.snapshot.favoriteDrawer.open"
      class="drawer-overlay drawer-overlay-right"
      @click="emit('dispatch', 'favorites.drawer.close')"
    >
      <aside
        class="port-action-drawer favorite-action-drawer"
        :class="{ active: props.snapshot.favoriteDrawer.active }"
        role="menu"
        @click.stop
      >
        <header class="drawer-header">
          <span>
            <strong>{{ drawerTitle() }}</strong>
            <small>{{ drawerSubtitle() }}</small>
          </span>
          <span class="drawer-header-actions">
            <button type="button" title="关闭抽屉" @click="emit('dispatch', 'favorites.drawer.close')">x</button>
          </span>
        </header>
        <div class="drawer-action-list" role="menu">
          <button
            v-for="(item, index) in props.snapshot.favoriteDrawerItems"
            :key="item.commandId"
            type="button"
            class="drawer-action"
            :class="{ active: props.snapshot.favoriteDrawer.activeIndex === index, danger: item.risk === 'destructive' }"
            :disabled="!item.enabled"
            @click="emit('dispatch', `favorites.drawer.select.${index + 1}`)"
          >
            <span class="drawer-action-icon">{{ item.icon }}</span>
            <span class="drawer-action-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <kbd>{{ item.shortcutLabel || commandLabel(`favorites.drawer.select.${index + 1}`, `c-${index + 1}`) }}</kbd>
          </button>
        </div>
      </aside>
    </div>

    <div v-if="props.snapshot.favoritePickReview" class="modal-backdrop" @click.self="emit('dispatch', 'favorites.pickReview.cancel')">
      <form class="favorite-pick-review confirm-layer" data-role="favorite-pick-review" @submit.prevent="emit('dispatch', 'favorites.pickReview.commit')">
        <header class="review-header">
          <div>
            <h2>{{ reviewTitle() }}</h2>
            <small>{{ props.snapshot.favoritePickReview.items.length }} 项，父级 {{ parentName(props.snapshot.favoritePickReview.parentId) }}</small>
          </div>
          <kbd>{{ commandLabel('favorites.pickReview.commit', 'c-s') }}</kbd>
        </header>
        <div class="favorite-pick-review-list">
          <section
            v-for="(item, index) in props.snapshot.favoritePickReview.items"
            :key="item.id"
            class="favorite-pick-review-row"
            :class="{ active: props.snapshot.favoritePickReview.activeIndex === index }"
            :data-review-index="index"
            @focusin="updateReview(index, {})"
          >
            <span class="favorite-kind">{{ kindLabel(item.kind) }}</span>
            <label>
              名称
              <input data-field="name" :value="item.name" @input="updateReview(index, { name: ($event.target as HTMLInputElement).value })" />
            </label>
            <label>
              路径
              <input data-field="path" :value="item.path" readonly />
            </label>
            <label>
              父级
              <select data-field="parent" :value="item.parentId || ''" @change="updateReview(index, { parentId: ($event.target as HTMLSelectElement).value || null })">
                <option value="">根级</option>
                <option v-for="group in props.snapshot.favoriteParentOptions" :key="group.id" :value="group.id">{{ group.name }} - {{ kindName(group.kind) }}</option>
              </select>
            </label>
            <label>
              标签
              <input data-field="tags" :value="item.tagsText" placeholder="逗号分隔" @input="updateReview(index, { tagsText: ($event.target as HTMLInputElement).value })" />
            </label>
            <input class="review-color" data-field="color" type="color" :value="item.color" @input="updateReview(index, { color: ($event.target as HTMLInputElement).value })" />
          </section>
        </div>
        <div class="dialog-actions">
          <button type="button" @click="emit('dispatch', 'favorites.pickReview.cancel')">取消</button>
          <button type="submit">保存收藏</button>
        </div>
      </form>
    </div>

    <div v-if="props.snapshot.favoriteDraft" class="modal-backdrop" @click.self="emit('cancelFavoriteDraft')">
      <form class="favorite-editor confirm-layer" data-role="favorite-editor" @submit.prevent="emit('saveFavoriteDraft')">
        <h2>{{ props.snapshot.favoriteDraft.mode === 'create-group' ? '新建分组' : props.snapshot.favoriteDraft.mode === 'create-target' ? '新增目标' : props.snapshot.favoriteDraft.mode === 'rename' ? '重命名收藏' : props.snapshot.favoriteDraft.mode === 'move-parent' ? '移动分组' : '编辑收藏' }}</h2>
        <label v-if="(props.snapshot.favoriteDraft.mode === 'edit' || props.snapshot.favoriteDraft.mode === 'create-target') && props.snapshot.favoriteDraft.kind !== 'group'">
          类型
          <select data-field="kind" :value="props.snapshot.favoriteDraft.kind" @change="updateDraft({ kind: ($event.target as HTMLSelectElement).value as FavoriteKind })">
            <option value="folder">文件夹</option>
            <option value="file">文件</option>
          </select>
        </label>
        <label v-if="props.snapshot.favoriteDraft.mode !== 'move-parent'">
          名称
          <input data-field="name" :value="props.snapshot.favoriteDraft.name" @input="updateDraft({ name: ($event.target as HTMLInputElement).value })" />
        </label>
        <label v-if="props.snapshot.favoriteDraft.kind !== 'group' && (props.snapshot.favoriteDraft.mode === 'edit' || props.snapshot.favoriteDraft.mode === 'create-target')">
          路径
          <span class="favorite-path-picker">
            <input data-field="path" :value="props.snapshot.favoriteDraft.path" @input="updateDraft({ path: ($event.target as HTMLInputElement).value })" @paste="inferNameFromPath" />
            <button type="button" @click="emit('dispatch', 'favorites.draft.pickPath', { kind: 'file' })">文件</button>
            <button type="button" @click="emit('dispatch', 'favorites.draft.pickPath', { kind: 'folder' })">文件夹</button>
          </span>
        </label>
        <label v-if="props.snapshot.favoriteDraft.kind !== 'group' && (props.snapshot.favoriteDraft.mode === 'edit' || props.snapshot.favoriteDraft.mode === 'create-target')">
          标签
          <input data-field="tags" :value="props.snapshot.favoriteDraft.tagsText" @input="updateDraft({ tagsText: ($event.target as HTMLInputElement).value })" />
        </label>
        <label v-if="props.snapshot.favoriteDraft.mode !== 'rename' && props.snapshot.favoriteDraft.mode !== 'move-parent'">
          颜色
          <input data-field="color" type="color" :value="props.snapshot.favoriteDraft.color" @input="updateDraft({ color: ($event.target as HTMLInputElement).value })" />
        </label>
        <label v-if="props.snapshot.favoriteDraft.mode !== 'rename'">
          父节点
          <select data-field="parent" :value="props.snapshot.favoriteDraft.parentId || ''" @change="updateDraft({ parentId: ($event.target as HTMLSelectElement).value || null })">
            <option value="">根级</option>
            <option v-for="group in props.snapshot.favoriteParentOptions" :key="group.id" :value="group.id">{{ group.name }} - {{ kindName(group.kind) }}</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button type="button" @click="emit('cancelFavoriteDraft')">取消</button>
          <button type="submit">保存</button>
        </div>
      </form>
    </div>
  </section>
</template>
