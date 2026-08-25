<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  as?: string
  initialFocusSelector?: string
  restoreFocusSelectors?: string[]
}>(), {
  as: 'div',
  initialFocusSelector: '',
  restoreFocusSelectors: () => []
})

const emit = defineEmits<{ escape: [] }>()
const root = ref<HTMLElement | null>(null)
const trigger = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

function focusableItems(): HTMLElement[] {
  return root.value ? Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
}

function trapFocus(event: KeyboardEvent): void {
  const items = focusableItems()
  if (!items.length) return
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey
    ? (current <= 0 ? items.length - 1 : current - 1)
    : (current < 0 || current === items.length - 1 ? 0 : current + 1)
  event.preventDefault()
  items[next]?.focus()
}

function restoreFocus(): void {
  const candidates = props.restoreFocusSelectors.flatMap((selector) => {
    const candidate = document.querySelector<HTMLElement>(selector)
    return candidate ? [candidate] : []
  })
  const visibleFallback = candidates.find((candidate) => {
    const style = getComputedStyle(candidate)
    return style.display !== 'none' && style.visibility !== 'hidden'
  }) || candidates[0] || null
  const target = trigger?.isConnected && trigger !== document.body ? trigger : visibleFallback
  target?.focus()
}

onMounted(() => nextTick(() => {
  const initial = props.initialFocusSelector
    ? root.value?.querySelector<HTMLElement>(props.initialFocusSelector) || null
    : null
  ;(initial || focusableItems()[0] || root.value)?.focus()
}))

onBeforeUnmount(() => nextTick(() => {
  restoreFocus()
  let attempts = 0
  const retry = () => {
    if (document.activeElement && document.activeElement !== document.body) return
    restoreFocus()
    attempts += 1
    if (attempts < 4 && (!document.activeElement || document.activeElement === document.body) && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(retry)
    }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(retry)
}))
</script>

<template>
  <component
    :is="props.as"
    ref="root"
    @keydown.tab="trapFocus"
    @keydown.escape.prevent.stop="emit('escape')"
  >
    <slot />
  </component>
</template>
