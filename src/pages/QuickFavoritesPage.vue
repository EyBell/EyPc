<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { AlertTriangle, Copy, File, Files, Folder, LocateFixed, MoreHorizontal, Play, SquareArrowOutUpRight, X } from '@lucide/vue'
import SearchSuggestBox from '../components/SearchSuggestBox.vue'
import { favoritePathIdentityKey } from '../domain/favorites'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; showShortcutHints?: boolean }>()
const emit = defineEmits<{
  search: [value: string]
  focus: [id: string]
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

function ctrlCommandLabel(commandId: string, fallback: string) {
  if (!props.showShortcutHints) return ''
  return (props.snapshot.commandShortcutLabels[commandId] || fallback)
    .split(' / ')
    .filter((label) => label.startsWith('c-'))
    .join(' / ')
}

function rowDomId(id: string) {
  return `quick-favorite-${encodeURIComponent(id).replace(/%/g, '_')}`
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
  return '路径状态未知'
}

function pathStatusIsError(path: string) {
  const status = pathInspection(path)?.status
  return Boolean(status && status !== 'available' && status !== 'unknown')
}

function totalTargets() {
  return props.snapshot.state.favorites.filter((item) => item.kind !== 'group').length
}

function drawerTarget() {
  return props.snapshot.state.favorites.find((item) => item.id === props.snapshot.favoriteDrawer.targetIds[0]) || null
}

function drawerIcon(commandId: string) {
  if (commandId.includes('copyItems')) return Files
  if (commandId.includes('copyPath')) return Copy
  if (commandId.includes('reveal')) return LocateFixed
  return SquareArrowOutUpRight
}

function shortcutNumber(index: number) {
  return index === 9 ? '0' : String(index + 1)
}

function groupBreadcrumb(itemId: string) {
  const byId = new Map(props.snapshot.state.favorites.map((item) => [item.id, item]))
  const names: string[] = []
  let parentId = byId.get(itemId)?.parentId || null
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parentId
  }
  return names.length ? names.join(' / ') : '未分组'
}

function hasCurrentRunner(itemId: string) {
  const item = props.snapshot.state.favorites.find((favorite) => favorite.id === itemId)
  const platform = props.snapshot.favoriteCurrentPlatform
  return Boolean(item && platform && item.runnerByPlatform?.[platform])
}

let panelTrigger: HTMLElement | null = null

function trapPanelFocus(event: KeyboardEvent) {
  const panel = event.currentTarget as HTMLElement | null
  const focusable = panel
    ? Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    : []
  if (!focusable.length) return
  event.stopPropagation()
  const current = document.activeElement as HTMLElement | null
  const index = focusable.indexOf(current || focusable[0])
  const next = event.shiftKey
    ? (index <= 0 ? focusable.length - 1 : index - 1)
    : (index < 0 || index >= focusable.length - 1 ? 0 : index + 1)
  event.preventDefault()
  focusable[next]?.focus()
}

watch(() => [
  props.snapshot.favoriteDrawer.open,
  props.snapshot.favoriteDrawer.active,
  props.snapshot.favoriteDrawer.targetKind,
  props.snapshot.favoriteDrawer.targetIds.join('|')
] as const, ([open, active, targetKind, targetIds], [previousOpen, previousActive, previousTargetKind, previousTargetIds]) => {
  if (open && !previousOpen) {
    panelTrigger = document.activeElement as HTMLElement | null
  }
  if (open && (
    !previousOpen
    || active !== previousActive
    || targetKind !== previousTargetKind
    || targetIds !== previousTargetIds
  )) {
    nextTick(() => document.querySelector<HTMLElement>('.quick-favorite-context-panel button:not([disabled])')?.focus())
  } else if (!open && previousOpen) {
    nextTick(() => {
      const target = panelTrigger?.isConnected && panelTrigger !== document.body
        ? panelTrigger
        : document.querySelector<HTMLElement>('[data-role="favorite-items"]')
      target?.focus()
      panelTrigger = null
    })
  }
})
</script>

<template>
  <section class="quick-favorites-page">
    <SearchSuggestBox
      :model-value="props.snapshot.state.favoriteSearch"
      role="favorite-search"
      placeholder="搜索文件或文件夹"
      :status="`${props.snapshot.favoriteItemRows.length} 项`"
      :shortcut-hint="ctrlCommandLabel('favorites.search.focus', 'c-f')"
      @focus="emit('dispatch', 'favorites.search.focus')"
      @update:model-value="emit('search', $event)"
    />
    <div
      class="list-surface quick-favorite-list"
      role="grid"
      data-role="favorite-items"
      tabindex="0"
      aria-label="快速收藏结果"
      :aria-activedescendant="props.snapshot.focusedFavoriteId ? rowDomId(props.snapshot.focusedFavoriteId) : undefined"
    >
      <div
        v-for="(item, index) in props.snapshot.favoriteItemRows"
        :key="item.id"
        class="favorite-row favorite-item-row quick-favorite-row"
        role="row"
        tabindex="-1"
        :id="rowDomId(item.id)"
        data-operation-tooltip="双击打开或运行；右键显示安全操作"
        data-operation-shortcut="Ctrl+← / Ctrl+→"
        :aria-selected="props.snapshot.selectedFavoriteIds.includes(item.id)"
        :class="{ focused: props.snapshot.focusedFavoriteId === item.id, selected: props.snapshot.selectedFavoriteIds.includes(item.id), 'path-error': pathStatusIsError(item.path) }"
        :style="{ '--node-color': item.color }"
        @click="emit('focus', item.id)"
        @dblclick="emit('dispatch', 'favorites.open', { favoriteId: item.id })"
        @contextmenu.prevent="emit('focus', item.id); emit('dispatch', 'favorites.drawer.open', { favoriteId: item.id })"
      >
        <kbd v-if="index < 10" class="quick-favorite-number" role="gridcell" :aria-label="`Ctrl+${shortcutNumber(index)} 打开第 ${index + 1} 项`">{{ shortcutNumber(index) }}</kbd>
        <span v-else class="quick-favorite-number-placeholder" role="gridcell" aria-hidden="true" />
        <span class="color-dot" role="gridcell" />
        <span class="favorite-kind-icon" role="gridcell" :title="item.kind === 'folder' ? '文件夹' : '文件'">
          <Folder v-if="item.kind === 'folder'" :size="16" aria-hidden="true" />
          <File v-else :size="16" aria-hidden="true" />
        </span>
        <span class="favorite-primary-copy" role="gridcell">
          <span class="favorite-name">{{ item.name }}</span>
          <span class="favorite-path">{{ item.path }}</span>
          <span class="favorite-breadcrumb">{{ item.kind === 'folder' ? '文件夹' : '文件' }} · {{ groupBreadcrumb(item.id) }}</span>
        </span>
        <span class="favorite-path-state" :class="{ error: pathStatusIsError(item.path) }" role="gridcell"><AlertTriangle v-if="pathStatusIsError(item.path)" :size="13" aria-hidden="true" />{{ pathStatus(item.path) }}</span>
        <span class="favorite-row-actions quick-favorite-row-actions" role="gridcell" @click.stop @dblclick.stop>
          <button type="button" tabindex="-1" :aria-label="hasCurrentRunner(item.id) ? '运行' : '打开'" :title="hasCurrentRunner(item.id) ? '运行自定义运行器' : '系统默认打开'" :disabled="!props.snapshot.favoriteCapabilities.open && !props.snapshot.favoriteCapabilities.run" @click="emit('dispatch', 'favorites.open', { favoriteId: item.id })"><Play v-if="hasCurrentRunner(item.id)" :size="14" aria-hidden="true" /><SquareArrowOutUpRight v-else :size="14" aria-hidden="true" /></button>
          <button type="button" tabindex="-1" aria-label="定位" title="定位" :disabled="!props.snapshot.favoriteCapabilities.reveal" @click="emit('dispatch', 'favorites.reveal', { favoriteId: item.id })"><LocateFixed :size="14" aria-hidden="true" /></button>
          <button type="button" tabindex="-1" aria-label="复制路径" title="复制路径" :disabled="!props.snapshot.favoriteCapabilities.copyPath" @click="emit('dispatch', 'favorites.copyPath', { favoriteId: item.id })"><Copy :size="14" aria-hidden="true" /></button>
          <button type="button" tabindex="-1" aria-label="复制真实项" title="复制真实项" :disabled="!props.snapshot.favoriteCapabilities.copyItems" @click="emit('dispatch', 'favorites.copyItems', { favoriteId: item.id })"><Files :size="14" aria-hidden="true" /></button>
          <button type="button" tabindex="-1" aria-label="更多安全操作" title="更多安全操作" @click="emit('dispatch', 'favorites.drawer.open', { favoriteId: item.id })"><MoreHorizontal :size="14" aria-hidden="true" /></button>
        </span>
      </div>
      <div v-if="totalTargets() === 0" class="favorite-empty-state compact" role="status">
        <Folder :size="22" aria-hidden="true" />
        <strong>还没有文件收藏</strong>
        <p>请在完整收藏页添加文件或文件夹。</p>
      </div>
      <div v-else-if="props.snapshot.favoriteItemRows.length === 0" class="favorite-empty-state compact" role="status">
        <strong>没有匹配结果</strong>
        <p>换一个名称、路径或标签试试。</p>
      </div>
    </div>
    <div
      v-if="props.snapshot.favoriteDrawer.open && !props.snapshot.favoriteDrawer.active"
      class="drawer-overlay drawer-overlay-left"
      @click="emit('dispatch', 'favorites.detail.close')"
    >
      <aside class="port-detail-drawer favorite-detail-drawer quick-favorite-context-panel active" role="dialog" aria-modal="true" aria-label="快速收藏详情" @keydown.tab="trapPanelFocus" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>收藏详情</strong>
            <small>{{ drawerTarget()?.name || '当前收藏' }}</small>
          </span>
          <button type="button" aria-label="关闭详情" title="关闭详情" @click="emit('dispatch', 'favorites.detail.close')"><X :size="15" aria-hidden="true" /></button>
        </header>
        <div v-if="drawerTarget()" class="detail-list">
          <div class="detail-row"><span>类型</span><strong>{{ drawerTarget()?.kind === 'folder' ? '文件夹' : '文件' }}</strong></div>
          <div class="detail-row"><span>名称</span><strong>{{ drawerTarget()?.name }}</strong></div>
          <div class="detail-row"><span>路径</span><strong>{{ drawerTarget()?.path }}</strong></div>
          <div class="detail-row"><span>状态</span><strong>{{ pathStatus(drawerTarget()?.path || '') }}</strong></div>
        </div>
        <p v-else class="empty-note">没有可展示的收藏目标。</p>
        <div class="detail-actions">
          <button type="button" @click="emit('dispatch', 'favorites.drawer.open')">安全操作</button>
          <button type="button" @click="emit('dispatch', 'favorites.detail.close')">关闭</button>
        </div>
      </aside>
    </div>
    <div
      v-if="props.snapshot.favoriteDrawer.open && props.snapshot.favoriteDrawer.active"
      class="drawer-overlay drawer-overlay-right"
      @click="emit('dispatch', 'favorites.drawer.close')"
    >
      <aside class="port-action-drawer favorite-action-drawer quick-favorite-context-panel active" role="dialog" aria-modal="true" aria-label="快速收藏安全操作" @keydown.tab="trapPanelFocus" @click.stop>
        <header class="drawer-header">
          <span>
            <strong>安全操作</strong>
            <small>{{ drawerTarget()?.name || '当前收藏' }}</small>
          </span>
          <button type="button" aria-label="关闭操作" title="关闭操作" @click="emit('dispatch', 'favorites.drawer.close')"><X :size="15" aria-hidden="true" /></button>
        </header>
        <div class="drawer-action-list" role="menu">
          <button
            v-for="(item, index) in props.snapshot.favoriteDrawerItems"
            :key="item.commandId"
            type="button"
            class="drawer-action"
            :class="{ active: props.snapshot.favoriteDrawer.activeIndex === index }"
            :disabled="!item.enabled"
            role="menuitem"
            @click="emit('dispatch', `favorites.drawer.select.${index + 1}`)"
          >
            <span class="drawer-action-icon"><component :is="drawerIcon(item.commandId)" :size="16" aria-hidden="true" /></span>
            <span class="drawer-action-copy"><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
            <kbd>{{ item.shortcutLabel || `c-${index === 9 ? 0 : index + 1}` }}</kbd>
          </button>
        </div>
      </aside>
    </div>
    <p class="favorite-status" role="status" aria-live="polite" aria-atomic="true">{{ props.snapshot.message }}</p>
  </section>
</template>
