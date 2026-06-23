<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder: string
  role: 'port-search' | 'port-group-search' | 'mqtt-search' | 'favorite-search' | 'favorite-group-search'
  error?: string | null
  status?: string
  shortcutHint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
}>()

const isFiltering = computed(() => props.modelValue.trim().length > 0)
const inlineHint = computed(() => props.error || props.status)

function updateValue(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement | null)?.value || '')
}
</script>

<template>
  <div
    class="search-suggest-box"
    :class="{ filtering: isFiltering, invalid: Boolean(error), 'shortcut-hinting': Boolean(shortcutHint) }"
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
      <span v-if="inlineHint" class="search-status" :class="{ error: Boolean(error) }">
        {{ inlineHint }}
      </span>
    </span>
    <kbd v-if="shortcutHint" class="search-shortcut-hint">{{ shortcutHint }}</kbd>
  </div>
</template>
