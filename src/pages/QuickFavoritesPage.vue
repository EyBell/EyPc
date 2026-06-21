<script setup lang="ts">
import SearchSuggestBox from '../components/SearchSuggestBox.vue'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()
const emit = defineEmits<{
  search: [value: string]
  focus: [id: string]
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()
</script>

<template>
  <section class="quick-favorites-page">
    <SearchSuggestBox
      :model-value="props.snapshot.state.favoriteSearch"
      role="favorite-search"
      placeholder="搜索文件或文件夹"
      :status="`${props.snapshot.favoriteItemRows.length} 项`"
      @focus="emit('dispatch', 'favorites.search.focus')"
      @update:model-value="emit('search', $event)"
    />
    <div class="list-surface quick-favorite-list" role="listbox">
      <button
        v-for="item in props.snapshot.favoriteItemRows"
        :key="item.id"
        type="button"
        class="favorite-row favorite-item-row"
        :class="{ focused: props.snapshot.focusedFavoriteId === item.id, selected: props.snapshot.selectedFavoriteIds.includes(item.id) }"
        :style="{ '--node-color': item.color }"
        @click="emit('focus', item.id)"
        @dblclick="emit('dispatch', 'favorites.open')"
      >
        <span class="color-dot" />
        <span class="favorite-kind">{{ item.kind === 'folder' ? 'DIR' : 'FILE' }}</span>
        <span class="favorite-name">{{ item.name }}</span>
        <span class="favorite-path">{{ item.path }}</span>
      </button>
    </div>
  </section>
</template>
