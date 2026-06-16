<script setup lang="ts">
defineProps<{
  modelValue: string
  placeholder: string
  error?: string | null
  history?: string[]
}>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="search-box">
    <input
      data-role="primary-search"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" class="field-error">{{ error }}</p>
    <div v-if="history?.length" class="history-row">
      <button v-for="item in history.slice(0, 6)" :key="item" type="button" @click="$emit('update:modelValue', item)">
        {{ item }}
      </button>
    </div>
  </div>
</template>
