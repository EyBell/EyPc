import { assignQuickJumpMarkers, type QuickJumpTarget } from '../domain/quickJump'
import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from '../domain/quickJumpHitTest'
import type { FeatureTargetRefV7 } from '../runtime/navigation/navigationIntent'

export interface QuickJumpDomTargetV7 extends QuickJumpTarget {
  element: HTMLElement
  target?: FeatureTargetRefV7
}

export interface QuickJumpRegistrationV7 {
  id: string
  label: string
  searchText?: string
  target?: FeatureTargetRefV7
}

export interface QuickJumpCollectOptionsV7 {
  backward?: boolean
  accept?: (element: HTMLElement) => boolean
}

export interface QuickJumpRegistryOptionsV7 {
  surfaceId: string
  root: () => HTMLElement | null
  fallbackSelector?: string
}

export interface QuickJumpRegistryV7 {
  register(element: HTMLElement, target: QuickJumpRegistrationV7): () => void
  collect(options?: QuickJumpCollectOptionsV7): QuickJumpDomTargetV7[]
  clear(): void
}

export const QUICK_JUMP_FALLBACK_SELECTOR_V7 = '[data-quick-jump-target]'

function textAttribute(element: HTMLElement, name: string): string {
  return (element.getAttribute(name) || '').replace(/\s+/g, ' ').trim()
}

export function quickJumpElementLabelV7(element: HTMLElement): string {
  return textAttribute(element, 'data-quick-jump-label')
    || textAttribute(element, 'aria-label')
    || textAttribute(element, 'title')
    || textAttribute(element, 'placeholder')
    || textAttribute(element, 'data-mqtt-shortcut-hint')
    || textAttribute(element, 'data-role')
    || (element.textContent || '').replace(/\s+/g, ' ').trim()
    || (element.tagName === 'BUTTON' ? 'button' : '操作')
}

export function quickJumpElementSearchTextV7(element: HTMLElement): string {
  return [
    textAttribute(element, 'data-quick-jump-search'),
    textAttribute(element, 'data-role'),
    textAttribute(element, 'data-mqtt-shortcut-hint')
  ].filter(Boolean).join(' ')
}

function hiddenStyle(style: CSSStyleDeclaration): boolean {
  return style.display === 'none'
    || style.visibility === 'hidden'
    || (style.opacity.trim() !== '' && Number(style.opacity) === 0)
    || style.pointerEvents === 'none'
}

function clipsChildren(style: CSSStyleDeclaration): boolean {
  return /(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)
}

export function quickJumpVisibleRectV7(element: HTMLElement) {
  const source = element.getBoundingClientRect()
  let left = Math.max(0, source.left)
  let top = Math.max(0, source.top)
  let right = Math.min(window.innerWidth, source.right)
  let bottom = Math.min(window.innerHeight, source.bottom)
  for (let current = element.parentElement; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (hiddenStyle(style)) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    if (!clipsChildren(style)) continue
    const rect = current.getBoundingClientRect()
    left = Math.max(left, rect.left)
    top = Math.max(top, rect.top)
    right = Math.min(right, rect.right)
    bottom = Math.min(bottom, rect.bottom)
  }
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

export function defaultQuickJumpTargetVisibleV7(
  element: HTMLElement,
  options: { allowAriaDisabled?: boolean } = {}
): boolean {
  if (element.matches(':disabled') || element.getAttribute('aria-hidden') === 'true') return false
  if (!options.allowAriaDisabled && element.getAttribute('aria-disabled') === 'true') return false
  if (hiddenStyle(window.getComputedStyle(element))) return false
  const rect = quickJumpVisibleRectV7(element)
  if (rect.width < 6 || rect.height < 6) return false
  if (typeof document.elementsFromPoint !== 'function') return true
  return quickJumpHitTestPoints(rect).some((point) => quickJumpHitStackContainsTarget(element, document.elementsFromPoint(point.x, point.y)))
}

export function createQuickJumpRegistryV7(options: QuickJumpRegistryOptionsV7): QuickJumpRegistryV7 {
  const registrations = new Map<HTMLElement, QuickJumpRegistrationV7>()
  return {
    register(element, target) {
      registrations.set(element, { ...target })
      return () => registrations.delete(element)
    },
    collect(collectOptions = {}) {
      const root = options.root() || document.body
      const fallback = Array.from(root.querySelectorAll<HTMLElement>(options.fallbackSelector || QUICK_JUMP_FALLBACK_SELECTOR_V7))
      const elements = [...registrations.keys(), ...fallback]
      const seen = new Set<HTMLElement>()
      const targets = elements.flatMap((element, index) => {
        if (seen.has(element)) return []
        seen.add(element)
        if (collectOptions.accept && !collectOptions.accept(element)) return []
        const registered = registrations.get(element)
        const label = registered?.label || quickJumpElementLabelV7(element)
        if (!label) return []
        const rect = element.getBoundingClientRect()
        return [{
          id: registered?.id || element.dataset.quickJumpId || `${options.surfaceId}:${index}:${label}:${Math.round(rect.left)}:${Math.round(rect.top)}`,
          label,
          searchText: registered?.searchText || quickJumpElementSearchTextV7(element),
          target: registered?.target,
          element
        }]
      })
      return assignQuickJumpMarkers(collectOptions.backward ? targets.reverse() : targets)
    },
    clear() {
      registrations.clear()
    }
  }
}
