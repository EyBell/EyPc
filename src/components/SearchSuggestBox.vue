<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SearchHistoryTarget } from '../domain/searchHistory'
import type { SearchHistoryState } from '../runtime/appRuntime'

const props = defineProps<{
  modelValue: string
  placeholder: string
  role: 'port-search' | 'port-group-search' | 'favorite-search'
  target: SearchHistoryTarget
  historyState: SearchHistoryState
  error?: string | null
  status?: string
  shortcutHint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  accept: [payload: { target: SearchHistoryTarget; value: string }]
  delete: [payload: { target: SearchHistoryTarget; value: string }]
}>()

const hasFocus = ref(false)
const isActiveTarget = computed(() => props.historyState.target === props.target)
const isOpen = computed(() => isActiveTarget.value && props.historyState.open)
const historyItems = computed(() => hasFocus.value && isOpen.value && props.modelValue.trim() ? props.historyState.items : [])
const activeIndex = computed(() => isActiveTarget.value ? props.historyState.activeIndex : -1)
const isFiltering = computed(() => props.modelValue.trim().length > 0)
const inlineHint = computed(() => props.error || (historyItems.value.length ? 's-↑↓ · cr' : props.status))

function updateValue(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement | null)?.value || '')
}

function acceptHistory(value: string) {
  emit('update:modelValue', value)
  emit('accept', { target: props.target, value })
}

function deleteHistory(value: string) {
  emit('delete', { target: props.target, value })
}

function leaveBox() {
  window.setTimeout(() => {
    hasFocus.value = false
  }, 0)
}
</script>

<template>
  <div
    class="search-suggest-box"
    :class="{ active: isOpen, filtering: isFiltering, invalid: Boolean(error), 'shortcut-hinting': Boolean(shortcutHint) }"
    @focusin="hasFocus = true"
    @focusout="leaveBox"
  >
    <input
      :data-role="role"
      class="suggest-input"
      :value="modelValue"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="emit('focus')"
      @input="updateValue"
    />
    <span v-if="inlineHint" class="search-meta">
      <span v-if="inlineHint" class="search-status" :class="{ error: Boolean(error), hint: Boolean(historyItems.length && !error) }">
        {{ inlineHint }}
      </span>
    </span>
    <kbd v-if="shortcutHint" class="search-shortcut-hint">{{ shortcutHint }}</kbd>
    <div v-if="historyItems.length" class="search-history-menu" role="listbox">
      <div
        v-for="(item, index) in historyItems"
        :key="item"
        class="search-history-item"
        :class="{ active: index === activeIndex }"
        role="option"
        tabindex="-1"
        :aria-selected="index === activeIndex"
        @mousedown.prevent="acceptHistory(item)"
      >
        <span>{{ item }}</span>
        <button
          type="button"
          class="history-delete"
          title="删除历史"
          @mousedown.prevent.stop="deleteHistory(item)"
        >
          x
        </button>
      </div>
    </div>
  </div>
</template>
