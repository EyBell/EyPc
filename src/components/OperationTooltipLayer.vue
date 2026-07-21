<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  suspended?: boolean
  scopeSelector?: string
}>(), {
  suspended: false,
  scopeSelector: '.app-shell'
})

const TOOLTIP_ID = 'eypc-operation-tooltip'
const TARGET_SELECTOR = [
  '[data-operation-tooltip]',
  'button',
  'summary',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="number"]',
  'input[type="range"]',
  'select',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[draggable="true"]'
].join(',')
const HOVER_DELAY_MS = 100
const VIEWPORT_MARGIN = 8
const TOOLTIP_GAP = 7

const visible = ref(false)
const label = ref('')
const detail = ref('')
const shortcut = ref('')
const left = ref(0)
const top = ref(0)
const placement = ref<'above' | 'below'>('above')
const tooltip = ref<HTMLElement | null>(null)

let focusedTarget: HTMLElement | null = null
let hoveredTarget: HTMLElement | null = null
let activeTarget: HTMLElement | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let mutationObserver: MutationObserver | null = null
const suppressedTitles = new Map<HTMLElement, string>()
const describedByBefore = new Map<HTMLElement, string | null>()

function normalizedText(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function operationTarget(value: Element | null) {
  const label = value?.closest<HTMLLabelElement>('label') || null
  const labeledControl = label?.control instanceof HTMLElement && label.control.matches(TARGET_SELECTOR)
    ? label.control
    : null
  if (labeledControl?.closest(props.scopeSelector) && !labeledControl.closest('[data-operation-tooltip-ignore]')) return labeledControl
  const target = value?.closest<HTMLElement>(TARGET_SELECTOR) || null
  if (!target?.closest(props.scopeSelector) || target.closest('[data-operation-tooltip-ignore]')) return null
  return target
}

function titleValue(target: HTMLElement) {
  return normalizedText(target.dataset.operationNativeTitle || target.getAttribute('title'))
}

function targetLabel(target: HTMLElement) {
  return normalizedText(target.dataset.operationTooltip)
    || normalizedText(target.getAttribute('aria-label'))
    || titleValue(target)
    || normalizedText(
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement
        ? target.labels?.[0]?.textContent
        : ''
    )
    || normalizedText(target.getAttribute('placeholder'))
    || normalizedText(target.textContent)
    || '操作'
}

function targetDetail(target: HTMLElement) {
  if (target.matches(':disabled, [aria-disabled="true"]')) {
    return normalizedText(target.dataset.disabledReason) || '当前条件下不可用'
  }
  return normalizedText(target.dataset.operationDescription)
    || (target.matches('[role="option"], [role="treeitem"]') ? '单击聚焦；可使用双击、右键或快捷键执行相关操作' : '')
    || (target.matches('[draggable="true"]') ? '可拖拽调整位置；也可使用行内操作' : '')
}

function targetShortcut(target: HTMLElement) {
  return normalizedText(target.dataset.operationShortcut || target.dataset.mqttShortcutHint)
}

function suppressNativeTitle(target: HTMLElement) {
  const value = target.getAttribute('title')
  if (!value) return
  suppressedTitles.set(target, value)
  target.dataset.operationNativeTitle = value
  target.removeAttribute('title')
}

function suppressTitles(root: ParentNode) {
  if (root instanceof HTMLElement && root.matches(TARGET_SELECTOR)) suppressNativeTitle(root)
  root.querySelectorAll<HTMLElement>(TARGET_SELECTOR).forEach(suppressNativeTitle)
}

function restoreDescribedBy(target: HTMLElement | null) {
  if (!target || !describedByBefore.has(target)) return
  const previous = describedByBefore.get(target)
  if (previous) target.setAttribute('aria-describedby', previous)
  else target.removeAttribute('aria-describedby')
  describedByBefore.delete(target)
}

function describeTarget(target: HTMLElement) {
  if (!describedByBefore.has(target)) describedByBefore.set(target, target.getAttribute('aria-describedby'))
  const ids = new Set(normalizedText(target.getAttribute('aria-describedby')).split(' ').filter(Boolean))
  ids.add(TOOLTIP_ID)
  target.setAttribute('aria-describedby', [...ids].join(' '))
}

function clearHoverTimer() {
  if (!hoverTimer) return
  clearTimeout(hoverTimer)
  hoverTimer = null
}

function hideTooltip() {
  clearHoverTimer()
  restoreDescribedBy(activeTarget)
  activeTarget = null
  visible.value = false
}

async function positionTooltip(target: HTMLElement) {
  await nextTick()
  if (activeTarget !== target || !tooltip.value) return
  const targetRect = target.getBoundingClientRect()
  const tooltipRect = tooltip.value.getBoundingClientRect()
  const preferredLeft = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
  left.value = Math.min(
    Math.max(preferredLeft, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN)
  )
  const above = targetRect.top - tooltipRect.height - TOOLTIP_GAP
  if (above >= VIEWPORT_MARGIN) {
    placement.value = 'above'
    top.value = above
  } else {
    placement.value = 'below'
    top.value = Math.min(
      targetRect.bottom + TOOLTIP_GAP,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN)
    )
  }
}

function showTooltip(target: HTMLElement) {
  if (props.suspended || !target.isConnected) return
  clearHoverTimer()
  if (activeTarget !== target) restoreDescribedBy(activeTarget)
  activeTarget = target
  label.value = targetLabel(target)
  detail.value = targetDetail(target)
  shortcut.value = targetShortcut(target)
  describeTarget(target)
  visible.value = true
  void positionTooltip(target)
}

function scheduleHover(target: HTMLElement | null) {
  clearHoverTimer()
  if (!target || props.suspended) {
    if (!focusedTarget) hideTooltip()
    return
  }
  hoverTimer = setTimeout(() => {
    hoverTimer = null
    showTooltip(target)
  }, HOVER_DELAY_MS)
}

function onPointerMove(event: PointerEvent) {
  const target = operationTarget(document.elementFromPoint(event.clientX, event.clientY))
  if (target === hoveredTarget) return
  hoveredTarget = target
  if (!focusedTarget) scheduleHover(target)
}

function onPointerLeave() {
  hoveredTarget = null
  if (!focusedTarget) hideTooltip()
}

function onFocusIn(event: FocusEvent) {
  focusedTarget = operationTarget(event.target as Element | null)
  if (focusedTarget) showTooltip(focusedTarget)
}

function onFocusOut(event: FocusEvent) {
  const next = operationTarget(event.relatedTarget as Element | null)
  focusedTarget = next
  if (next) showTooltip(next)
  else if (hoveredTarget) scheduleHover(hoveredTarget)
  else hideTooltip()
}

function onViewportChange() {
  if (activeTarget) void positionTooltip(activeTarget)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') hideTooltip()
}

watch(() => props.suspended, (suspended) => {
  if (suspended) hideTooltip()
})

onMounted(() => {
  suppressTitles(document)
  mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        suppressNativeTitle(mutation.target)
        return
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) suppressTitles(node)
      })
    })
  })
  mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
  document.addEventListener('pointerleave', onPointerLeave)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  hideTooltip()
  mutationObserver?.disconnect()
  suppressedTitles.forEach((value, target) => {
    if (target.isConnected && !target.hasAttribute('title')) target.setAttribute('title', value)
    delete target.dataset.operationNativeTitle
  })
  suppressedTitles.clear()
  window.removeEventListener('pointermove', onPointerMove, true)
  document.removeEventListener('pointerleave', onPointerLeave)
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      :id="TOOLTIP_ID"
      ref="tooltip"
      class="operation-tooltip"
      :class="`operation-tooltip--${placement}`"
      :style="{ left: `${left}px`, top: `${top}px` }"
      role="tooltip"
    >
      <span class="operation-tooltip-label">{{ label }}</span>
      <kbd v-if="shortcut" class="operation-tooltip-shortcut">{{ shortcut }}</kbd>
      <small v-if="detail" class="operation-tooltip-detail">{{ detail }}</small>
    </div>
  </Teleport>
</template>
