<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { placeFloatActionHint } from '../ui/tooltipPlacement'

const props = withDefaults(defineProps<{
  suspended?: boolean
  scopeSelector?: string
  automatic?: boolean
}>(), {
  suspended: false,
  scopeSelector: '.app-shell',
  automatic: true
})

const TOOLTIP_ID = 'eypc-operation-tooltip'
const TARGET_SELECTOR = [
  '[data-operation-tooltip]',
  '[data-operation-native-title]',
  '[title]',
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
const SHORTCUT_NAMED_KEY = '(?:[a-z0-9]|f(?:[1-9]|1[0-2])|esc(?:ape)?|enter|return|space|tab|delete|del|backspace|bs|home|end|pageup|pagedown|arrow(?:left|right|up|down)|left|right|up|down|[←→↑↓])'
const SHORTCUT_MODIFIER = '(?:ctrl|control|cmd|command|meta|option|opt|alt|shift|c|s|m|a|⌘|⌥|⌃|⇧)'
const MODIFIER_SHORTCUT_PATTERN = new RegExp(`^(?:${SHORTCUT_MODIFIER}\\s*(?:\\+|-)\\s*)+${SHORTCUT_NAMED_KEY}$`, 'i')
const STANDALONE_SHORTCUT_PATTERN = /^(?:f(?:[1-9]|1[0-2])|esc(?:ape)?|enter|return|space|tab|delete|del|backspace|bs|home|end|pageup|pagedown|[←→↑↓])$/i

const visible = ref(false)
const label = ref('')
const detail = ref('')
const shortcut = ref('')
const left = ref(0)
const top = ref(0)
const arrowLeft = ref(0)
const placement = ref<'above' | 'below'>('above')
const manualKind = ref<'float' | 'compact' | null>(null)
const sticky = ref(false)
const maxWidth = ref('')
const tooltip = ref<HTMLElement | null>(null)

let focusedTarget: Element | null = null
let hoveredTarget: Element | null = null
let activeTarget: Element | null = null
let pendingManualKind: 'float' | 'compact' | null = null
let manualBoundary: Element | null = null
let pointerFocus = false
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let mutationObserver: MutationObserver | null = null
const suppressedTitles = new Map<Element, string>()
const describedByBefore = new Map<Element, string | null>()

function normalizedText(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function operationTarget(value: Element | null) {
  if (!(value instanceof Element)) return null
  const target = value?.closest(TARGET_SELECTOR) || null
  if (target?.closest(props.scopeSelector) && !target.closest('[data-operation-tooltip-ignore]')) return target
  const label = value?.closest<HTMLLabelElement>('label') || null
  const labeledControl = label?.control instanceof HTMLElement && label.control.matches(TARGET_SELECTOR)
    ? label.control
    : null
  if (labeledControl?.closest(props.scopeSelector) && !labeledControl.closest('[data-operation-tooltip-ignore]')) return labeledControl
  return null
}

function titleValue(target: Element) {
  return normalizedText(target.getAttribute('data-operation-native-title') || target.getAttribute('title'))
}

function isShortcutHint(value: string) {
  const candidate = normalizedText(value)
  return MODIFIER_SHORTCUT_PATTERN.test(candidate)
    || STANDALONE_SHORTCUT_PATTERN.test(candidate)
    || /^[⌘⌥⌃⇧]+[a-z0-9]$/i.test(candidate)
}

function parsedTitle(target: Element) {
  const title = titleValue(target)
  const trailingHint = title.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (!trailingHint || !isShortcutHint(trailingHint[2])) return { label: title, shortcut: '' }
  return {
    label: normalizedText(trailingHint[1]) || title,
    shortcut: normalizedText(trailingHint[2])
  }
}

function targetLabel(target: Element) {
  return normalizedText(target.getAttribute('data-operation-tooltip'))
    || normalizedText(target.getAttribute('aria-label'))
    || parsedTitle(target).label
    || normalizedText(
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement
        ? target.labels?.[0]?.textContent
        : ''
    )
    || normalizedText(target.getAttribute('placeholder'))
    || normalizedText(target.textContent)
    || '操作'
}

function targetDetail(target: Element) {
  if (target.matches(':disabled, [aria-disabled="true"]')) {
    return normalizedText(target.getAttribute('data-disabled-reason')) || '当前条件下不可用'
  }
  const ownTitle = parsedTitle(target).label
  const parentLabel = target.closest('label')
  const inheritedTitle = parentLabel && parentLabel !== target ? titleValue(parentLabel) : ''
  return normalizedText(target.getAttribute('data-operation-description'))
    || normalizedText(target.getAttribute('data-tip'))
    || (ownTitle && ownTitle !== targetLabel(target) ? ownTitle : '')
    || (inheritedTitle && inheritedTitle !== targetLabel(target) ? inheritedTitle : '')
    || (target.matches('[role="option"], [role="treeitem"]') ? '单击聚焦；可使用双击、右键或快捷键执行相关操作' : '')
    || (target.matches('[draggable="true"]') ? '可拖拽调整位置；也可使用行内操作' : '')
}

function targetShortcut(target: Element) {
  const explicit = normalizedText(target.getAttribute('data-operation-shortcut') || target.getAttribute('data-mqtt-shortcut-hint'))
  if (explicit) return explicit
  return parsedTitle(target).shortcut
}

function suppressNativeTitle(target: Element) {
  if (!target.closest(props.scopeSelector) || target.closest('[data-operation-tooltip-ignore]')) return
  const value = target.getAttribute('title')
  if (!value) {
    const existing = target.getAttribute('data-operation-native-title')
    if (existing) suppressedTitles.set(target, existing)
    return
  }
  suppressedTitles.set(target, value)
  target.setAttribute('data-operation-native-title', value)
  target.removeAttribute('title')
}

function suppressTitles(root: ParentNode) {
  if (root instanceof Element && root.matches('[title], [data-operation-native-title]')) suppressNativeTitle(root)
  root.querySelectorAll('[title], [data-operation-native-title]').forEach(suppressNativeTitle)
}

function restoreDescribedBy(target: Element | null) {
  if (!target || !describedByBefore.has(target)) return
  const previous = describedByBefore.get(target)
  if (previous) target.setAttribute('aria-describedby', previous)
  else target.removeAttribute('aria-describedby')
  describedByBefore.delete(target)
}

function describeTarget(target: Element) {
  if (!describedByBefore.has(target)) describedByBefore.set(target, target.getAttribute('aria-describedby'))
  const ids = new Set(normalizedText(target.getAttribute('aria-describedby')).split(' ').filter(Boolean))
  ids.add(TOOLTIP_ID)
  target.setAttribute('aria-describedby', [...ids].join(' '))
}

function clearHoverTimer() {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
  pendingManualKind = null
}

function hideTooltip() {
  clearHoverTimer()
  restoreDescribedBy(activeTarget)
  activeTarget = null
  manualKind.value = null
  manualBoundary = null
  sticky.value = false
  maxWidth.value = ''
  visible.value = false
}

async function positionTooltip(target: Element) {
  await nextTick()
  if (activeTarget !== target || !tooltip.value) return
  const targetRect = target.getBoundingClientRect()
  const tooltipRect = tooltip.value.getBoundingClientRect()
  if (manualKind.value === 'compact') {
    const bounds = manualBoundary?.getBoundingClientRect() || targetRect
    maxWidth.value = `${Math.max(1, bounds.width - 10)}px`
    left.value = bounds.left + bounds.width / 2 - Math.min(tooltipRect.width, Math.max(1, bounds.width - 10)) / 2
    top.value = bounds.top + (bounds.height - tooltipRect.height) / 2
    return
  }
  if (manualKind.value === 'float') {
    const bounds = manualBoundary?.getBoundingClientRect()
    const result = placeFloatActionHint({
      anchorLeft: targetRect.left, anchorTop: targetRect.top,
      anchorWidth: targetRect.width, anchorHeight: targetRect.height,
      cardLeft: bounds?.left ?? 0, cardTop: bounds?.top ?? 0,
      cardWidth: bounds?.width ?? 0, cardHeight: bounds?.height ?? 0,
      hintWidth: tooltipRect.width || Math.min(240, Math.max(72, label.value.length * 7 + 16)),
      hintHeight: tooltipRect.height || 28
    })
    left.value = result.left
    top.value = result.top
    arrowLeft.value = result.arrowLeft
    placement.value = result.placement === 'top' ? 'above' : 'below'
    maxWidth.value = `${Math.min(240, result.maxWidth)}px`
    return
  }
  const preferredLeft = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
  const resolvedLeft = Math.min(
    Math.max(preferredLeft, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN)
  )
  left.value = resolvedLeft
  arrowLeft.value = Math.min(
    Math.max(targetRect.left + targetRect.width / 2 - resolvedLeft, 10),
    Math.max(10, tooltipRect.width - 10)
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

function showTooltip(target: Element) {
  if (props.suspended || !target.isConnected) return
  clearHoverTimer()
  if (activeTarget !== target) restoreDescribedBy(activeTarget)
  activeTarget = target
  manualKind.value = null
  maxWidth.value = ''
  label.value = targetLabel(target)
  detail.value = targetDetail(target)
  shortcut.value = targetShortcut(target)
  describeTarget(target)
  visible.value = true
  void positionTooltip(target)
}

function scheduleHover(target: Element | null) {
  clearHoverTimer()
  if (target?.closest('.appearance-studio-stage') && activeTarget !== target) hideTooltip()
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
  if (event.pointerType === 'touch' || event.buttons) return
  const target = operationTarget(document.elementFromPoint(event.clientX, event.clientY))
  if (target === hoveredTarget) return
  const wasPreview = Boolean(hoveredTarget?.closest('.appearance-studio-stage'))
  hoveredTarget = target
  if (!focusedTarget || target?.closest('.appearance-studio-stage')) scheduleHover(target)
  else if (wasPreview) showTooltip(focusedTarget)
}

function onPointerLeave() {
  hoveredTarget = null
  if (focusedTarget) showTooltip(focusedTarget)
  else hideTooltip()
}

function onFocusIn(event: FocusEvent) {
  focusedTarget = operationTarget(event.target as Element | null)
  if (pointerFocus && focusedTarget?.closest('.appearance-studio-stage')) {
    focusedTarget = null
    return
  }
  if (focusedTarget) showTooltip(focusedTarget)
}

function onFocusOut(event: FocusEvent) {
  const next = operationTarget(event.relatedTarget as Element | null)
  if (pointerFocus && next?.closest('.appearance-studio-stage')) {
    focusedTarget = null
    if (hoveredTarget) scheduleHover(hoveredTarget)
    else hideTooltip()
    return
  }
  focusedTarget = next
  if (next) showTooltip(next)
  else if (hoveredTarget) scheduleHover(hoveredTarget)
  else hideTooltip()
}

function onViewportChange() {
  if (activeTarget) void positionTooltip(activeTarget)
}

function onPointerDown() {
  pointerFocus = true
  hoveredTarget = null
  hideTooltip()
}

function onWindowBlur() {
  focusedTarget = null
  hoveredTarget = null
  hideTooltip()
}

function onKeydown(event: KeyboardEvent) {
  pointerFocus = false
  if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') hideTooltip()
}

function showManual(target: Element | null, text: string, options: {
  kind: 'float' | 'compact'
  boundary?: Element | null
  delay?: number
  sticky?: boolean
}) {
  if (!target || !text || (sticky.value && !options.sticky)) return
  clearHoverTimer()
  pendingManualKind = options.kind
  const show = () => {
    pendingManualKind = null
    if (!target.isConnected || props.suspended) return
    if (activeTarget !== target) restoreDescribedBy(activeTarget)
    activeTarget = target
    manualKind.value = options.kind
    manualBoundary = options.boundary || null
    sticky.value = Boolean(options.sticky)
    label.value = text
    detail.value = ''
    shortcut.value = ''
    const boundaryWidth = manualBoundary?.getBoundingClientRect().width || 0
    maxWidth.value = options.kind === 'compact'
      ? `${Math.max(1, boundaryWidth - 10)}px`
      : `${boundaryWidth > 0 ? Math.min(240, Math.max(16, boundaryWidth - 16)) : 240}px`
    describeTarget(target)
    visible.value = true
    void positionTooltip(target)
  }
  if (options.delay) hoverTimer = setTimeout(show, options.delay)
  else show()
}

function hideManual(force = false, kind?: 'float' | 'compact') {
  if (kind && manualKind.value !== kind && pendingManualKind !== kind) return
  if (sticky.value && !force) return
  hideTooltip()
}

function hasStickyHint() { return sticky.value }

defineExpose({
  handleSurfaceKeydown: onKeydown,
  showManual,
  hideManual,
  hasStickyHint
})

watch(() => props.suspended, (suspended) => {
  if (suspended) hideTooltip()
})

onMounted(() => {
  suppressTitles(document)
  mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        if (mutation.attributeName === 'title') suppressNativeTitle(mutation.target)
        if (props.automatic && mutation.target === activeTarget) showTooltip(mutation.target)
        return
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) suppressTitles(node)
      })
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof Element) || node.isConnected) return
        suppressedTitles.delete(node)
        node.querySelectorAll('[data-operation-native-title]').forEach((target) => suppressedTitles.delete(target))
      })
    })
    if (activeTarget && !activeTarget.isConnected) hideTooltip()
  })
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'title',
      'data-operation-tooltip',
      'data-operation-description',
      'data-operation-shortcut',
      'data-mqtt-shortcut-hint',
      'data-disabled-reason',
      'data-tip',
      'aria-label',
      'aria-disabled',
      'disabled'
    ]
  })
  if (props.automatic) {
    window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
    window.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('keydown', onKeydown, true)
  }
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('blur', onWindowBlur)
})

onUnmounted(() => {
  hideTooltip()
  mutationObserver?.disconnect()
  suppressedTitles.forEach((value, target) => {
    if (target.isConnected && !target.hasAttribute('title')) target.setAttribute('title', value)
    target.removeAttribute('data-operation-native-title')
  })
  suppressedTitles.clear()
  window.removeEventListener('pointermove', onPointerMove, true)
  window.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('pointerleave', onPointerLeave)
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('blur', onWindowBlur)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      :id="TOOLTIP_ID"
      ref="tooltip"
      class="operation-tooltip"
      :class="[`operation-tooltip--${placement}`, manualKind ? `operation-tooltip--${manualKind}` : '', { 'operation-tooltip--sticky': sticky }]"
      :style="{ left: `${left}px`, top: `${top}px`, maxWidth: maxWidth || undefined, '--operation-tooltip-arrow-left': `${arrowLeft}px` }"
      role="tooltip"
    >
      <span class="operation-tooltip-label">{{ label }}</span>
      <kbd v-if="shortcut" class="operation-tooltip-shortcut">{{ shortcut }}</kbd>
      <small v-if="detail" class="operation-tooltip-detail">{{ detail }}</small>
    </div>
  </Teleport>
</template>
