<script setup lang="ts">
import SearchSuggestBox from '../components/SearchSuggestBox.vue'
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
    <div class="list-surface quick-favorite-list" role="listbox">
      <div
        v-for="item in props.snapshot.favoriteItemRows"
        :key="item.id"
        class="favorite-row favorite-item-row quick-favorite-row"
        role="option"
        tabindex="0"
        :aria-selected="props.snapshot.selectedFavoriteIds.includes(item.id)"
        :class="{ focused: props.snapshot.focusedFavoriteId === item.id, selected: props.snapshot.selectedFavoriteIds.includes(item.id) }"
        :style="{ '--node-color': item.color }"
        @click="emit('focus', item.id)"
        @dblclick="emit('dispatch', 'favorites.open', { favoriteId: item.id })"
      >
        <span class="color-dot" />
        <span class="favorite-kind">{{ item.kind === 'folder' ? 'DIR' : 'FILE' }}</span>
        <span class="favorite-name">{{ item.name }}</span>
        <span class="favorite-path">{{ item.path }}</span>
        <span class="favorite-row-actions quick-favorite-row-actions" @click.stop @dblclick.stop>
          <button type="button" title="打开" @click="emit('dispatch', 'favorites.open', { favoriteId: item.id })">开</button>
          <button type="button" title="定位" @click="emit('dispatch', 'favorites.reveal', { favoriteId: item.id })">定</button>
          <button type="button" title="复制路径" @click="emit('dispatch', 'favorites.copyPath', { favoriteId: item.id })">复</button>
        </span>
      </div>
    </div>
  </section>
</template>
