<script setup lang="ts">
import { computed } from 'vue'
import { renderFeatureHelpMarkdown } from '../help/markdown'
import DialogShell from './DialogShell.vue'

const props = defineProps<{ title: string; markdown: string }>()
const emit = defineEmits<{ close: [] }>()

const html = computed(() => renderFeatureHelpMarkdown(props.markdown))
</script>

<template>
  <DialogShell
      backdrop-class="feature-help-backdrop"
      panel-class="feature-help-dialog"
      label-id="feature-help-title"
      initial-focus-selector=".feature-help-body"
      @close="emit('close')"
    >
      <header class="feature-help-header">
        <h2 id="feature-help-title">{{ title }}操作说明</h2>
        <button type="button" class="feature-help-close" aria-label="关闭操作说明" @click="emit('close')">关闭</button>
      </header>
      <div
        class="feature-help-body"
        tabindex="0"
        aria-label="操作说明正文"
        v-html="html"
      ></div>
      <footer class="feature-help-footer">
        <button type="button" @click="emit('close')">关闭</button>
      </footer>
  </DialogShell>
</template>
