<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { AlertTriangle, Check, Copy, File, Files, Folder, FolderPlus, FolderTree, LocateFixed, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RefreshCw, SquareArrowOutUpRight, Trash2, X } from '@lucide/vue'
import SearchSuggestBox from '../components/SearchSuggestBox.vue'
import FavoriteTree from '../components/FavoriteTree.vue'
import { favoritePathIdentityKey, inferFavoriteNameFromPath } from '../domain/favorites'
import type { AppRuntimeSnapshot, FavoriteDraft, FavoritePickReviewItem } from '../runtime/appRuntime'
import type { FavoriteKind, FavoriteNode } from '../domain/types'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean }>()
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

function ctrlCommandLabel(commandId: string, fallback: string) {
  if (!props.showShortcutHints) return ''
  return (props.snapshot.commandShortcutLabels[commandId] || fallback)
    .split(' / ')
    .filter((label) => label.startsWith('c-'))
    .join(' / ')
}

function kindName(kind: FavoriteKind) {
  if (kind === 'group') return '分组'
  return kind === 'folder' ? '文件夹' : '文件'
}

function rowDomId(id: string) {
  return `favorite-row-${encodeURIComponent(id).replace(/%/g, '_')}`
}

function directoryDomId(path: string) {
  return `favorite-directory-${encodeURIComponent(favoritePathIdentityKey(path)).replace(/%/g, '_')}`
}

function pathInspection(path: string) {
  return props.snapshot.favoritePathInspections[favoritePathIdentityKey(path)]
}

function pathStatus(path: string) {
  const inspection = pathInspection(path)
  if (!props.snapshot.favoriteCapabilities.inspectPaths) return '状态未知'
  if (!inspection) return '检查中'
  if (inspection.status === 'available') return '可用'
  if (inspection.status === 'missing') return '路径不存在'
  if (inspection.status === 'permission-denied') return '没有访问权限'
  if (inspection.status === 'offline') return '路径离线'
  if (inspection.status === 'invalid') return '路径无效'
  return '状态未知'
}

function pathStatusIsError(path: string) {
  const status = pathInspection(path)?.status
  return Boolean(status && status !== 'available' && status !== 'unknown')
}

function isRenaming(id: string) {
  return props.snapshot.activeFavoritePane === 'items' && props.snapshot.favoriteDraft?.mode === 'rename' && props.snapshot.favoriteDraft.targetId === id
}

function favoriteDoubleClick(item: FavoriteNode) {
  if (item.kind === 'group') {
    emit('focusGroup', item.id)
    emit('dispatch', 'favorites.group.apply', { favoriteId: item.id })
    return
  }
  emit('dispatch', 'favorites.open', { favoriteId: item.id })
}

function focusFavoriteRow(item: FavoriteNode) {
  if (item.kind === 'group') emit('focusGroup', item.id)
  else emit('focus', item.id)
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

function favoriteDetailRows() {
  if (props.snapshot.favoriteDrawer.targetKind === 'directory') {
    return [
      ['类型', '实际目录项'],
      ['数量', String(props.snapshot.favoriteDrawer.targetIds.length)],
      ['路径', props.snapshot.favoriteDrawer.targetIds.join('\n')]
    ]
  }
  const target = props.snapshot.state.favorites.find((item) => item.id === props.snapshot.favoriteDrawer.targetIds[0])
  if (!target) return []
  return [
    ['类型', kindName(target.kind)],
    ['名称', target.name],
    ['路径', target.path || '虚拟分组'],
    ['标签', target.tags.join('、') || '无'],
    ['父级', parentName(target.parentId)]
  ]
}

function drawerIcon(commandId: string) {
  if (commandId.includes('copyItems')) return Files
  if (commandId.includes('copyPath')) return Copy
  if (commandId.includes('reveal')) return LocateFixed
  if (commandId.endsWith('.open')) return SquareArrowOutUpRight
  if (commandId.includes('remove')) return Trash2
  if (commandId.includes('edit') || commandId.includes('rename')) return Pencil
  if (commandId.includes('create') || commandId.includes('add')) return Plus
  return MoreHorizontal
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
  emit('dispatch', 'favorites.drawer.open', { favoriteId: id })
}

function openDirectoryContextMenu(path: string) {
  emit('focusDirectory', path)
  emit('dispatch', 'favorites.drawer.open', { directoryPaths: [path] })
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

function trapFocus(event: KeyboardEvent) {
  const layer = event.currentTarget as HTMLElement | null
  const focusable = layer ? Array.from(layer.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((item) => !item.hasAttribute('hidden')) : []
  if (!focusable.length) return
  event.stopPropagation()
  const current = document.activeElement as HTMLElement | null
  const index = focusable.indexOf(current || focusable[0])
  const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index < 0 || index >= focusable.length - 1 ? 0 : index + 1)
  event.preventDefault()
  focusable[next]?.focus()
}

let drawerTrigger: HTMLElement | null = null
let reviewTrigger: HTMLElement | null = null
let editorTrigger: HTMLElement | null = null
let renameTrigger: HTMLElement | null = null

function activePaneOwner(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-role="favorite-${props.snapshot.activeFavoritePane}"]`)
}

function restoreTrigger(trigger: HTMLElement | null, fallback?: () => HTMLElement | null) {
  nextTick(() => {
    const candidate = trigger?.isConnected && trigger !== document.body ? trigger : fallback?.() || activePaneOwner()
    candidate?.focus()
  })
}

watch(() => [
  props.snapshot.favoriteDrawer.open,
  props.snapshot.favoriteDrawer.active,
  props.snapshot.favoriteDrawer.targetKind,
  props.snapshot.favoriteDrawer.targetIds.join('|')
] as const, ([open, active, targetKind, targetIds], [previousOpen, previousActive, previousTargetKind, previousTargetIds]) => {
  if (open && !previousOpen) {
    drawerTrigger = document.activeElement as HTMLElement | null
  }
  if (open && (
    !previousOpen
    || active !== previousActive
    || targetKind !== previousTargetKind
    || targetIds !== previousTargetIds
  )) {
    nextTick(() => document.querySelector<HTMLElement>('.favorite-context-panel button:not([disabled])')?.focus())
  } else if (!open && previousOpen) {
    restoreTrigger(drawerTrigger)
    drawerTrigger = null
  }
})

watch(() => Boolean(props.snapshot.favoritePickReview), (open, previous) => {
  if (open && !previous) reviewTrigger = document.activeElement as HTMLElement | null
  else if (!open && previous) {
    restoreTrigger(reviewTrigger, () => document.querySelector<HTMLElement>('.favorite-add-button'))
    reviewTrigger = null
  }
})

watch(() => Boolean(props.snapshot.favoriteDraft && props.snapshot.favoriteDraft.mode !== 'rename'), (open, previous) => {
  if (open && !previous) editorTrigger = document.activeElement as HTMLElement | null
  else if (!open && previous) {
    restoreTrigger(editorTrigger, () => document.querySelector<HTMLElement>('.favorite-add-button'))
    editorTrigger = null
  }
})

function focusFavoriteDraftField() {
  const draft = props.snapshot.favoriteDraft
  if (!draft) return
  const field = draft.activeField
  if (draft.mode === 'rename') {
    const paneRole = props.snapshot.activeFavoritePane === 'containers' ? 'favorite-containers' : 'favorite-items'
    document.querySelector<HTMLElement>(`[data-role="${paneRole}"] [data-role="favorite-editor"][data-field="${field}"]`)?.focus()
    return
  }
  document.querySelector<HTMLElement>(`[data-role="favorite-editor"] [data-field="${field}"]`)?.focus()
}

watch(() => props.snapshot.favoriteDraft?.mode === 'rename', (open, previous) => {
  if (open && !previous) {
    renameTrigger = document.activeElement as HTMLElement | null
    nextTick(focusFavoriteDraftField)
  } else if (!open && previous) {
    restoreTrigger(renameTrigger)
    renameTrigger = null
  }
})

function adaptContainerPanel() {
  const narrow = window.innerWidth <= 720
  if (narrow && !containerViewportWasNarrow && props.snapshot.favoriteContainerPanelOpen) emit('dispatch', 'favorites.containers.togglePanel')
  containerViewportWasNarrow = narrow
}

let containerViewportWasNarrow = false

onMounted(() => {
  adaptContainerPanel()
  window.addEventListener('resize', adaptContainerPanel)
})

onBeforeUnmount(() => window.removeEventListener('resize', adaptContainerPanel))

watch(() => props.snapshot.favoriteDraft?.activeField, () => {
  nextTick(focusFavoriteDraftField)
})

watch(() => props.snapshot.favoriteContainerPanelOpen, (open, previous) => {
  if (open === previous) return
  nextTick(() => {
    const target = open
      ? document.querySelector<HTMLElement>('[data-role="favorite-containers"]')
      : document.querySelector<HTMLElement>('button[aria-label="打开容器栏"]')
    target?.focus()
  })
})

watch(() => props.snapshot.favoritePaneFocusRequestId, (requestId, previous) => {
  if (requestId === previous) return
  nextTick(() => activePaneOwner()?.focus())
})

function addMenuButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('#favorite-add-menu [role="menuitem"]:not([disabled])'))
}

function handleAddMenuKeydown(event: KeyboardEvent) {
  const buttons = addMenuButtons()
  if (!buttons.length) return
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  let next = current
  if (event.key === 'ArrowDown') next = (current + 1 + buttons.length) % buttons.length
  else if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = buttons.length - 1
  else if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    emit('dispatch', 'favorites.addMenu.close')
    nextTick(() => document.querySelector<HTMLElement>('.favorite-add-button')?.focus())
    return
  } else return
  event.preventDefault()
  buttons[next]?.focus()
}

watch(() => props.snapshot.favoriteAddMenuOpen, (open, previous) => {
  if (open && !previous) nextTick(() => addMenuButtons()[0]?.focus())
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
  <section class="page-grid favorites-workbench" :class="{ 'containers-open': props.snapshot.favoriteContainerPanelOpen, 'containers-collapsed': !props.snapshot.favoriteContainerPanelOpen }">
    <aside class="side-panel favorite-groups-panel" :class="{ active: props.snapshot.activeFavoritePane === 'containers' }" aria-label="收藏容器栏">
      <header class="favorite-container-toolbar">
        <button type="button" aria-label="收起容器栏" title="收起容器栏" @click="emit('dispatch', 'favorites.containers.togglePanel')"><PanelLeftClose :size="16" aria-hidden="true" /></button>
        <button type="button" aria-label="新建分组" title="新建分组" @click="emit('dispatch', 'favorites.group.create')"><FolderPlus :size="16" aria-hidden="true" /><span>新建分组</span></button>
      </header>
      <div class="pane-search">
        <SearchSuggestBox
          :model-value="props.snapshot.favoriteGroupSearch"
          role="favorite-group-search"
          placeholder="搜索容器"
          :status="`${props.snapshot.favoriteContainerRows.length} 节点`"
          :shortcut-hint="ctrlCommandLabel('favorites.groupSearch.focus', 'c-s-f')"
          @focus="emit('dispatch', 'favorites.groupSearch.focus')"
          @update:model-value="emit('groupSearch', $event)"
        />
      </div>

      <FavoriteTree
        :nodes="props.snapshot.state.favorites"
        :rows="props.snapshot.favoriteContainerRows"
        :selected-ids="props.snapshot.selectedFavoriteGroupId ? [props.snapshot.selectedFavoriteGroupId] : []"
        :focused-id="props.snapshot.focusedFavoriteGroupId"
        :collapsed-ids="props.snapshot.state.collapsedFavoriteGroupIds"
        :rename-draft="props.snapshot.activeFavoritePane === 'containers' ? props.snapshot.favoriteDraft : null"
        :can-open="props.snapshot.favoriteCapabilities.open"
        @focus="emit('focusGroup', $event)"
        @context="openFavoriteContextMenu"
        @action="dispatchFavoriteTreeAction"
        @update-rename="updateDraft({ name: $event })"
        @save-rename="emit('saveFavoriteDraft')"
        @cancel-rename="emit('cancelFavoriteDraft')"
        @collapse="emit('collapse', $event)"
        @reorder="(nodeId, parentId, beforeNodeId) => emit('reorder', nodeId, parentId, beforeNodeId)"
      />
      <p v-if="props.snapshot.state.favorites.length > 0 && props.snapshot.favoriteContainerRows.length === 0" class="empty-note favorite-container-empty">没有匹配的容器。</p>
    </aside>

    <section class="main-panel favorite-items-panel" :class="{ active: props.snapshot.activeFavoritePane !== 'containers' }">
      <div class="toolbar favorite-main-toolbar">
        <div class="favorite-search-cluster">
          <button v-if="!props.snapshot.favoriteContainerPanelOpen" type="button" aria-label="打开容器栏" title="打开容器栏" @click="emit('dispatch', 'favorites.containers.togglePanel')"><PanelLeftOpen :size="16" aria-hidden="true" /></button>
          <SearchSuggestBox
            :model-value="props.snapshot.state.favoriteSearch"
            role="favorite-search"
            placeholder="搜索名称、路径、标签"
            :status="`${virtualRows().length} 收藏`"
            :shortcut-hint="ctrlCommandLabel('favorites.search.focus', 'c-f')"
            @focus="emit('dispatch', 'favorites.search.focus')"
            @update:model-value="emit('search', $event)"
          />
        </div>
        <div class="toolbar-actions favorite-add-anchor">
          <button type="button" aria-label="刷新目录和路径状态" title="刷新目录和路径状态" @click="emit('dispatch', 'favorites.refresh')"><RefreshCw :size="16" aria-hidden="true" /></button>
          <button type="button" class="favorite-add-button" aria-haspopup="menu" :aria-expanded="props.snapshot.favoriteAddMenuOpen" aria-controls="favorite-add-menu" @click="emit('dispatch', 'favorites.addMenu.toggle')"><Plus :size="16" aria-hidden="true" /><span>添加</span></button>
          <div v-if="props.snapshot.favoriteAddMenuOpen" id="favorite-add-menu" class="favorite-add-menu" role="menu" aria-label="添加收藏" @keydown="handleAddMenuKeydown">
            <button type="button" role="menuitem" tabindex="-1" :disabled="!props.snapshot.favoriteCapabilities.pickFiles" @click="emit('dispatch', 'favorites.pick.files')"><File :size="15" aria-hidden="true" />选择文件</button>
            <button type="button" role="menuitem" tabindex="-1" :disabled="!props.snapshot.favoriteCapabilities.pickFolders" @click="emit('dispatch', 'favorites.pick.folders')"><Folder :size="15" aria-hidden="true" />选择文件夹</button>
            <button type="button" role="menuitem" tabindex="-1" @click="emit('dispatch', 'favorites.target.create')"><Pencil :size="15" aria-hidden="true" />手动添加</button>
            <button type="button" role="menuitem" tabindex="-1" @click="emit('dispatch', 'favorites.group.create')"><FolderPlus :size="15" aria-hidden="true" />新建分组</button>
          </div>
        </div>
      </div>

      <div class="favorite-container-summary">
        <div>
          <strong>{{ containerTitle() }}</strong>
          <small>{{ containerSubtitle() }}</small>
        </div>
      </div>

      <div
        class="list-surface favorite-path-list favorite-item-list"
        role="grid"
        data-role="favorite-items"
        tabindex="0"
        aria-label="收藏列表"
        aria-multiselectable="true"
        :aria-activedescendant="props.snapshot.focusedFavoriteId ? rowDomId(props.snapshot.focusedFavoriteId) : undefined"
      >
        <section class="favorite-virtual-section" role="rowgroup">
          <header>
            <strong>收藏路径</strong>
          </header>
          <div
            v-for="item in virtualRows()"
            :key="item.id"
            class="favorite-row favorite-item-row"
            role="row"
            tabindex="-1"
            :id="rowDomId(item.id)"
            :aria-selected="props.snapshot.selectedFavoriteIds.includes(item.id)"
            :class="{ selected: props.snapshot.selectedFavoriteIds.includes(item.id), focused: props.snapshot.focusedFavoriteId === item.id, 'path-error': item.kind !== 'group' && pathStatusIsError(item.path) }"
            :style="{ '--node-color': item.color }"
            data-operation-tooltip="双击打开；右键显示收藏操作"
            data-operation-shortcut="Ctrl+← / Ctrl+→"
            draggable="true"
            @dragstart="$event.dataTransfer?.setData('text/plain', item.id)"
            @dragover.prevent
            @drop.prevent="emit('reorder', $event.dataTransfer?.getData('text/plain') || item.id, selectedParentId(), item.id)"
            @click="focusFavoriteRow(item)"
            @dblclick="favoriteDoubleClick(item)"
            @contextmenu.prevent="openFavoriteContextMenu(item.id)"
          >
            <span role="gridcell"><input type="checkbox" tabindex="-1" :aria-label="`选择 ${item.name}`" :checked="props.snapshot.selectedFavoriteIds.includes(item.id)" @click.stop="emit('toggle', item.id)" /></span>
            <span class="color-dot" role="gridcell" />
            <span class="favorite-kind-icon" role="gridcell" :title="kindName(item.kind)">
              <FolderTree v-if="item.kind === 'group'" :size="16" aria-hidden="true" />
              <Folder v-else-if="item.kind === 'folder'" :size="16" aria-hidden="true" />
              <File v-else :size="16" aria-hidden="true" />
            </span>
            <span class="favorite-primary-copy" role="gridcell">
              <input
                v-if="isRenaming(item.id)"
                class="favorite-inline-rename"
                data-role="favorite-editor"
                data-field="name"
                :value="props.snapshot.favoriteDraft?.name"
                aria-label="重命名收藏"
                @click.stop
                @input="updateDraft({ name: ($event.target as HTMLInputElement).value })"
                @keydown.enter.prevent.stop="emit('saveFavoriteDraft')"
                @keydown.escape.prevent.stop="emit('cancelFavoriteDraft')"
              />
              <span v-else class="favorite-name">{{ item.name }}</span>
              <span class="favorite-path">{{ item.path || '虚拟分组' }}</span>
            </span>
            <span class="favorite-meta" role="gridcell">{{ item.tags.map((tag) => `#${tag}`).join(' ') }}</span>
            <span v-if="item.kind !== 'group'" class="favorite-path-state" :class="{ error: pathStatusIsError(item.path) }" role="gridcell">
              <AlertTriangle v-if="pathStatusIsError(item.path)" :size="13" aria-hidden="true" />{{ pathStatus(item.path) }}
            </span>
            <span v-else class="favorite-path-state" role="gridcell">虚拟</span>
            <span class="favorite-row-actions" role="gridcell" @click.stop>
              <button v-if="item.kind !== 'group'" type="button" tabindex="-1" aria-label="打开" title="打开" :disabled="!props.snapshot.favoriteCapabilities.open" @click="dispatchFavoriteRowAction(item, 'favorites.open')"><SquareArrowOutUpRight :size="14" aria-hidden="true" /></button>
              <button v-if="item.kind !== 'group'" type="button" tabindex="-1" aria-label="定位" title="定位" :disabled="!props.snapshot.favoriteCapabilities.reveal" @click="dispatchFavoriteRowAction(item, 'favorites.reveal')"><LocateFixed :size="14" aria-hidden="true" /></button>
              <button v-if="item.kind !== 'group'" type="button" tabindex="-1" aria-label="复制路径" title="复制路径" :disabled="!props.snapshot.favoriteCapabilities.copyPath" @click="dispatchFavoriteRowAction(item, 'favorites.copyPath')"><Copy :size="14" aria-hidden="true" /></button>
              <button v-if="isRenaming(item.id)" type="button" tabindex="-1" aria-label="保存重命名" title="保存" @click="emit('saveFavoriteDraft')"><Check :size="14" aria-hidden="true" /></button>
              <button v-if="isRenaming(item.id)" type="button" tabindex="-1" aria-label="取消重命名" title="取消" @click="emit('cancelFavoriteDraft')"><X :size="14" aria-hidden="true" /></button>
              <button v-else type="button" tabindex="-1" aria-label="更多动作" title="更多动作" @click="dispatchFavoriteRowAction(item, 'favorites.drawer.open')"><MoreHorizontal :size="14" aria-hidden="true" /></button>
              <button type="button" tabindex="-1" class="danger" aria-label="移出收藏元数据" title="移出收藏元数据" @click="dispatchFavoriteRowAction(item, 'favorites.remove')"><Trash2 :size="14" aria-hidden="true" /></button>
            </span>
          </div>
          <div v-if="props.snapshot.state.favorites.length === 0" class="favorite-empty-state favorite-main-empty" role="status">
            <Folder :size="24" aria-hidden="true" />
            <strong>开始建立文件收藏</strong>
            <p>使用右上角“添加”选择文件、文件夹，或手动输入绝对路径。</p>
            <button type="button" @click="emit('dispatch', 'favorites.addMenu.toggle')"><Plus :size="15" aria-hidden="true" />添加第一个收藏</button>
          </div>
          <p v-else-if="virtualRows().length === 0" class="empty-note" role="status">没有匹配的收藏路径。</p>
        </section>
      </div>

      <section class="favorite-directory-panel" :class="{ active: props.snapshot.activeFavoritePane === 'directory' }" aria-labelledby="favorite-directory-title">
        <header>
          <span>
            <strong id="favorite-directory-title">一级目录</strong>
            <small v-if="props.snapshot.selectedFavoriteContainer?.kind === 'folder'">{{ props.snapshot.selectedFavoriteContainer.path }}</small>
            <small v-else>选择文件夹收藏后显示一层实际内容</small>
          </span>
          <span class="toolbar-actions">
            <button type="button" aria-label="刷新目录" title="刷新目录" :disabled="!props.snapshot.favoriteCapabilities.listDirectory" @click="emit('dispatch', 'favorites.refresh')"><RefreshCw :size="14" aria-hidden="true" /></button>
            <button type="button" :disabled="props.snapshot.selectedFavoriteDirectoryPaths.length === 0" @click="emit('dispatch', 'favorites.directory.addSelected')"><Plus :size="14" aria-hidden="true" />收藏选中</button>
          </span>
        </header>
        <div
          v-if="props.snapshot.selectedFavoriteContainer?.kind === 'folder'"
          class="favorite-directory-section"
          role="grid"
          data-role="favorite-directory"
          tabindex="0"
          aria-label="实际一级目录"
          aria-multiselectable="true"
          :aria-busy="props.snapshot.favoriteDirectoryLoading"
          :aria-activedescendant="props.snapshot.focusedFavoriteDirectoryPath ? directoryDomId(props.snapshot.focusedFavoriteDirectoryPath) : undefined"
        >
          <div v-if="props.snapshot.favoriteDirectoryLoading" class="favorite-directory-state loading" role="status">
            <span class="favorite-skeleton" /><span class="favorite-skeleton short" />
            <span>正在读取一级目录…</span>
          </div>
          <div v-else-if="props.snapshot.favoriteDirectoryError" class="favorite-directory-state error" role="alert">
            <AlertTriangle :size="16" aria-hidden="true" />
            <span>{{ props.snapshot.favoriteDirectoryError }}</span>
            <button type="button" @click="emit('dispatch', 'favorites.refresh')">重试</button>
          </div>
          <template v-else>
          <div
            v-for="entry in props.snapshot.favoriteDirectoryEntries"
            :key="entry.path"
            class="favorite-row favorite-directory-row"
            role="row"
            tabindex="-1"
            :id="directoryDomId(entry.path)"
            :aria-selected="entry.selected"
            :class="{ selected: entry.selected, focused: entry.focused, favorited: entry.favorited }"
            data-operation-tooltip="双击打开；右键显示目录项操作"
            data-operation-shortcut="Ctrl+← / Ctrl+→"
            @click="emit('focusDirectory', entry.path)"
            @dblclick="emit('dispatch', 'favorites.directory.open', { directoryPaths: [entry.path] })"
            @contextmenu.prevent="openDirectoryContextMenu(entry.path)"
          >
            <span role="gridcell"><input type="checkbox" tabindex="-1" :aria-label="`选择 ${entry.name}`" :checked="entry.selected" @click.stop="emit('toggleDirectory', entry.path)" /></span>
            <span class="favorite-kind-icon" role="gridcell" :title="kindName(entry.kind)"><Folder v-if="entry.kind === 'folder'" :size="16" aria-hidden="true" /><File v-else :size="16" aria-hidden="true" /></span>
            <span class="favorite-primary-copy" role="gridcell"><span class="favorite-name">{{ entry.name }}</span><span class="favorite-path">{{ entry.path }}</span></span>
            <span class="favorite-meta" role="gridcell">{{ entry.isSymbolicLink ? `符号链接 → ${entry.linkTargetKind || '未知'}` : entry.favorited ? '已收藏' : '实际项' }}</span>
            <span class="favorite-row-actions" role="gridcell" @click.stop>
              <button type="button" tabindex="-1" aria-label="打开" title="打开" :disabled="!props.snapshot.favoriteCapabilities.open" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.open')"><SquareArrowOutUpRight :size="14" aria-hidden="true" /></button>
              <button type="button" tabindex="-1" aria-label="定位" title="定位" :disabled="!props.snapshot.favoriteCapabilities.reveal" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.reveal')"><LocateFixed :size="14" aria-hidden="true" /></button>
              <button type="button" tabindex="-1" aria-label="复制路径" title="复制路径" :disabled="!props.snapshot.favoriteCapabilities.copyPath" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.copyPath')"><Copy :size="14" aria-hidden="true" /></button>
              <button type="button" tabindex="-1" aria-label="复制真实项" title="复制真实项" :disabled="!props.snapshot.favoriteCapabilities.copyItems" @click="dispatchDirectoryRowAction(entry.path, 'favorites.copyItems')"><Files :size="14" aria-hidden="true" /></button>
              <button type="button" tabindex="-1" aria-label="收藏此项" title="收藏此项" @click="dispatchDirectoryRowAction(entry.path, 'favorites.directory.addSelected')"><Plus :size="14" aria-hidden="true" /></button>
              <button type="button" tabindex="-1" aria-label="更多动作" title="更多动作" @click="openDirectoryContextMenu(entry.path)"><MoreHorizontal :size="14" aria-hidden="true" /></button>
            </span>
          </div>
          <p v-if="props.snapshot.favoriteDirectoryEntries.length === 0" class="empty-note" role="status">当前目录为空。</p>
          </template>
        </div>
        <p v-else class="empty-note">当前容器不是文件夹；仍可使用其虚拟子项。</p>
      </section>
    </section>

    <div
      v-if="props.snapshot.favoriteDrawer.open && !props.snapshot.favoriteDrawer.active"
      class="drawer-overlay drawer-overlay-left"
      @click="emit('dispatch', 'favorites.detail.close')"
    >
      <aside
        class="port-detail-drawer favorite-context-panel favorite-detail-drawer active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorite-detail-title"
        @keydown.tab="trapFocus"
        @click.stop
      >
        <header class="drawer-header">
          <span>
            <strong id="favorite-detail-title">收藏详情</strong>
            <small>{{ drawerTitle() }}</small>
          </span>
          <button type="button" aria-label="关闭详情" title="关闭详情" @click="emit('dispatch', 'favorites.detail.close')"><X :size="15" aria-hidden="true" /></button>
        </header>
        <div class="detail-list">
          <div v-for="row in favoriteDetailRows()" :key="row[0]" class="detail-row">
            <span>{{ row[0] }}</span>
            <strong>{{ row[1] }}</strong>
          </div>
        </div>
        <div class="detail-actions">
          <button type="button" @click="emit('dispatch', 'favorites.drawer.open')">打开操作菜单</button>
          <button type="button" @click="emit('dispatch', 'favorites.detail.close')">关闭</button>
        </div>
      </aside>
    </div>

    <div
      v-if="props.snapshot.favoriteDrawer.open && props.snapshot.favoriteDrawer.active"
      class="drawer-overlay drawer-overlay-right"
      @click="emit('dispatch', 'favorites.drawer.close')"
    >
      <aside
        class="port-action-drawer favorite-context-panel favorite-action-drawer"
        :class="{ active: props.snapshot.favoriteDrawer.active }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorite-drawer-title"
        aria-describedby="favorite-drawer-description"
        @keydown.tab="trapFocus"
        @click.stop
      >
        <header class="drawer-header">
          <span>
            <strong id="favorite-drawer-title">{{ drawerTitle() }}</strong>
            <small id="favorite-drawer-description">{{ drawerSubtitle() }}</small>
          </span>
          <span class="drawer-header-actions">
            <button type="button" aria-label="关闭抽屉" title="关闭抽屉" @click="emit('dispatch', 'favorites.drawer.close')"><X :size="15" aria-hidden="true" /></button>
          </span>
        </header>
        <div class="drawer-action-list">
          <button
            v-for="(item, index) in props.snapshot.favoriteDrawerItems"
            :key="item.commandId"
            type="button"
            class="drawer-action"
            :class="{ active: props.snapshot.favoriteDrawer.activeIndex === index, danger: item.risk === 'destructive' }"
            :disabled="!item.enabled"
            @click="emit('dispatch', `favorites.drawer.select.${index + 1}`)"
          >
            <span class="drawer-action-icon"><component :is="drawerIcon(item.commandId)" :size="16" aria-hidden="true" /></span>
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
      <form class="favorite-pick-review confirm-layer" data-role="favorite-pick-review" role="dialog" aria-modal="true" aria-labelledby="favorite-review-title" @keydown.tab="trapFocus" @submit.prevent="emit('dispatch', 'favorites.pickReview.commit')">
        <header class="review-header">
          <div>
            <h2 id="favorite-review-title">{{ reviewTitle() }}</h2>
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
            <span class="favorite-kind-icon" :title="kindName(item.kind)"><Folder v-if="item.kind === 'folder'" :size="16" aria-hidden="true" /><File v-else :size="16" aria-hidden="true" /></span>
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
            <input class="review-color" data-field="color" type="color" :value="item.color" :aria-label="`设置 ${item.name} 的颜色`" @input="updateReview(index, { color: ($event.target as HTMLInputElement).value })" />
          </section>
        </div>
        <div class="dialog-actions">
          <button type="button" @click="emit('dispatch', 'favorites.pickReview.cancel')">取消</button>
          <button type="submit">保存收藏</button>
        </div>
      </form>
    </div>

    <div v-if="props.snapshot.favoriteDraft && props.snapshot.favoriteDraft.mode !== 'rename'" class="modal-backdrop" @click.self="emit('cancelFavoriteDraft')">
      <form class="favorite-editor confirm-layer" data-role="favorite-editor" role="dialog" aria-modal="true" aria-labelledby="favorite-editor-title" @keydown.tab="trapFocus" @submit.prevent="emit('saveFavoriteDraft')">
        <h2 id="favorite-editor-title">{{ props.snapshot.favoriteDraft.mode === 'create-group' ? '新建分组' : props.snapshot.favoriteDraft.mode === 'create-target' ? '新增目标' : props.snapshot.favoriteDraft.mode === 'move-parent' ? '移动父级' : '编辑收藏' }}</h2>
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
            <button type="button" aria-label="选择文件路径" :disabled="!props.snapshot.favoriteCapabilities.pickFiles" @click="emit('dispatch', 'favorites.draft.pickPath', { kind: 'file' })"><File :size="14" aria-hidden="true" />文件</button>
            <button type="button" aria-label="选择文件夹路径" :disabled="!props.snapshot.favoriteCapabilities.pickFolders" @click="emit('dispatch', 'favorites.draft.pickPath', { kind: 'folder' })"><Folder :size="14" aria-hidden="true" />文件夹</button>
          </span>
        </label>
        <label v-if="props.snapshot.favoriteDraft.kind !== 'group' && (props.snapshot.favoriteDraft.mode === 'edit' || props.snapshot.favoriteDraft.mode === 'create-target')">
          标签
          <input data-field="tags" :value="props.snapshot.favoriteDraft.tagsText" @input="updateDraft({ tagsText: ($event.target as HTMLInputElement).value })" />
        </label>
        <label v-if="props.snapshot.favoriteDraft.mode !== 'move-parent'">
          颜色
          <input data-field="color" type="color" aria-label="收藏颜色" :value="props.snapshot.favoriteDraft.color" @input="updateDraft({ color: ($event.target as HTMLInputElement).value })" />
        </label>
        <label>
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
    <p class="favorite-status" role="status" aria-live="polite" aria-atomic="true">{{ props.snapshot.message }}</p>
  </section>
</template>
