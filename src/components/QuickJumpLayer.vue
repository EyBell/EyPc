<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { QuickJumpTarget } from '../domain/quickJump'
import { layoutQuickJumpMarkers } from '../domain/quickJumpLayout'
import type { QuickJumpRect } from '../domain/quickJumpLayout'

interface QuickJumpLayerTarget extends QuickJumpTarget {
  element: HTMLElement
  anchorElement?: HTMLElement
}

interface QuickJumpLayoutItem {
  id: string
  label: string
  left: number
  top: number
  width: number
  height: number
  active: boolean
}

const props = defineProps<{
  targets: QuickJumpLayerTarget[]
  activeTargetId: string | null
}>()

const layoutItems = ref<QuickJumpLayoutItem[]>([])
let frameId = 0

function targetVisible(target: QuickJumpLayerTarget) {
  if (!target.element.isConnected) return false
  const rect = target.element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(target.element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth
}

function quickJumpRect(rect: DOMRect): QuickJumpRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  }
}

function updateLayout() {
  frameId = 0
  const anchors = props.targets
    .filter(targetVisible)
    .map((target) => {
      const markerLabel = target.displayMarker || target.marker
      return {
        id: target.id,
        label: markerLabel,
        targetRect: quickJumpRect(target.element.getBoundingClientRect()),
        anchorRect: target.anchorElement?.isConnected ? quickJumpRect(target.anchorElement.getBoundingClientRect()) : undefined
      }
    })
  const positioned = layoutQuickJumpMarkers(anchors, {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  })
  layoutItems.value = positioned.map((item) => ({
    ...item,
    active: item.id === props.activeTargetId
  }))
}

function scheduleLayout() {
  if (frameId) return
  frameId = requestAnimationFrame(updateLayout)
}

const positionedItems = computed(() => layoutItems.value.map((item) => ({
  ...item,
  style: {
    '--quick-jump-left': `${item.left}px`,
    '--quick-jump-top': `${item.top}px`
  }
})))

watch(() => [props.targets, props.activeTargetId] as const, scheduleLayout, { immediate: true })

onMounted(() => {
  scheduleLayout()
  window.addEventListener('resize', scheduleLayout)
  window.addEventListener('scroll', scheduleLayout, true)
})

onUnmounted(() => {
  if (frameId) cancelAnimationFrame(frameId)
  window.removeEventListener('resize', scheduleLayout)
  window.removeEventListener('scroll', scheduleLayout, true)
})
</script>

<template>
  <div class="quick-jump-top-layer" aria-hidden="true">
    <kbd
      v-for="item in positionedItems"
      :key="item.id"
      class="quick-jump-badge"
      :class="{ active: item.active }"
      :style="item.style"
    >{{ item.label }}</kbd>
  </div>
</template>
