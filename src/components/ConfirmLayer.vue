<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ title: string; detail: string; restoreFocusSelectors?: string[] }>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const dialog = ref<HTMLElement | null>(null)
const trigger = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null

function focusableItems() {
  return dialog.value ? Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')) : []
}

function trapFocus(event: KeyboardEvent) {
  const items = focusableItems()
  if (!items.length) return
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey ? (current <= 0 ? items.length - 1 : current - 1) : (current < 0 || current === items.length - 1 ? 0 : current + 1)
  event.preventDefault()
  items[next]?.focus()
}

onMounted(() => nextTick(() => focusableItems()[0]?.focus()))
onBeforeUnmount(() => nextTick(() => {
  const focusTarget = () => {
    const candidates = (props.restoreFocusSelectors || []).flatMap((selector) => {
      const candidate = document.querySelector<HTMLElement>(selector)
      return candidate ? [candidate] : []
    })
    const fallback = candidates.find((item) => {
      const style = getComputedStyle(item)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }) || candidates[0] || null
    const target = trigger?.isConnected && trigger !== document.body ? trigger : fallback
    target?.focus()
  }
  focusTarget()
  let attempts = 0
  const retry = () => {
    if (document.activeElement && document.activeElement !== document.body) return
    focusTarget()
    attempts += 1
    if ((!document.activeElement || document.activeElement === document.body) && attempts < 4 && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(retry)
    }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(retry)
  else setTimeout(retry, 0)
}))
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <section ref="dialog" class="confirm-layer" role="dialog" aria-modal="true" aria-labelledby="confirm-layer-title" aria-describedby="confirm-layer-detail" @keydown.tab="trapFocus" @keydown.escape.prevent.stop="emit('cancel')">
      <h2 id="confirm-layer-title">{{ title }}</h2>
      <p id="confirm-layer-detail">{{ detail }}</p>
      <div class="confirm-actions">
        <button type="button" @click="$emit('cancel')">取消</button>
        <button type="button" class="danger" @click="$emit('confirm')">确认</button>
      </div>
    </section>
  </div>
</template>
