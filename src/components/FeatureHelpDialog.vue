<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { renderFeatureHelpMarkdown } from '../help/markdown'

const props = defineProps<{ title: string; markdown: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const trigger = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null

const html = computed(() => renderFeatureHelpMarkdown(props.markdown))

function focusableItems() {
  if (!dialog.value) return [] as HTMLElement[]
  return Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
}

function trapFocus(event: KeyboardEvent) {
  const items = focusableItems()
  if (!items.length) return
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey
    ? (current <= 0 ? items.length - 1 : current - 1)
    : (current < 0 || current === items.length - 1 ? 0 : current + 1)
  event.preventDefault()
  items[next]?.focus()
}

onMounted(() => nextTick(() => {
  bodyRef.value?.focus()
  if (document.activeElement !== bodyRef.value) focusableItems()[0]?.focus()
}))

onBeforeUnmount(() => nextTick(() => {
  const target = trigger?.isConnected && trigger !== document.body ? trigger : null
  target?.focus()
}))
</script>

<template>
  <div class="modal-backdrop feature-help-backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="feature-help-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-help-title"
      @keydown.tab="trapFocus"
      @keydown.escape.prevent.stop="emit('close')"
    >
      <header class="feature-help-header">
        <h2 id="feature-help-title">{{ title }}操作说明</h2>
        <button type="button" class="feature-help-close" aria-label="关闭操作说明" @click="emit('close')">关闭</button>
      </header>
      <div
        ref="bodyRef"
        class="feature-help-body"
        tabindex="0"
        aria-label="操作说明正文"
        v-html="html"
      ></div>
      <footer class="feature-help-footer">
        <button type="button" @click="emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>
