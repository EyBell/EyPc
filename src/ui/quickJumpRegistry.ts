import { inject, type InjectionKey, type ObjectDirective } from 'vue'
import { assignQuickJumpMarkers, type QuickJumpTarget } from '../domain/quickJump'
import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from '../domain/quickJumpHitTest'
import type { AppTabId } from '../domain/types'
import type { ActionMenuItemV7 } from '../runtime/action/actionMenu'
import { createNavigationIntentV7, featureTargetRefForCommandV7, type FeatureTargetRefV7, type NavigationIntentV7 } from '../runtime/navigation/navigationIntent'

interface QuickJumpInvocationV7 {
  intent: NavigationIntentV7
  args?: Record<string, unknown>
  dispatch?: (commandId: string, args: Record<string, unknown>) => unknown
}

export interface QuickJumpDomTargetV7 extends QuickJumpTarget {
  element: HTMLElement
  target?: FeatureTargetRefV7
  invocation?: QuickJumpInvocationV7
}

export interface QuickJumpRegistrationV7 {
  id: string
  label: string
  searchText?: string
  target?: FeatureTargetRefV7
  invocation?: QuickJumpInvocationV7
}

export interface QuickJumpCollectOptionsV7 {
  backward?: boolean
  domOrder?: boolean
  accept?: (element: HTMLElement) => boolean
}

export interface QuickJumpRegistryOptionsV7 {
  surfaceId: string
  root: () => HTMLElement | null
  fallbackSelector?: string
}

export interface QuickJumpRegistryV7 {
  register(element: HTMLElement, target: QuickJumpRegistrationV7): () => void
  registrationFor(element: HTMLElement): QuickJumpRegistrationV7 | undefined
  collect(options?: QuickJumpCollectOptionsV7): QuickJumpDomTargetV7[]
  clear(): void
}

export const QUICK_JUMP_FALLBACK_SELECTOR_V7 = '[data-quick-jump-target]'
export const quickJumpRegistryKeyV7: InjectionKey<QuickJumpRegistryV7> = Symbol('quick-jump-registry-v7')

export function quickJumpCommandTargetV7(input: {
  featureId: AppTabId
  commandId: string
  args?: Record<string, unknown>
  label: string
  searchText?: string
  target?: Pick<FeatureTargetRefV7, 'key' | 'kind' | 'keys'>
  occurrence?: string
  disposition?: NavigationIntentV7['disposition']
  dispatch?: QuickJumpInvocationV7['dispatch']
}): QuickJumpRegistrationV7 {
  const target = input.target
    ? { ...input.target, featureId: input.featureId, surfaceId: 'main' as const }
    : featureTargetRefForCommandV7(input)
  const intent = createNavigationIntentV7({
    commandId: input.commandId,
    target,
    source: 'quick-jump',
    disposition: input.disposition ?? 'focus'
  })
  return {
    id: JSON.stringify([target.featureId, target.kind, target.key, target.keys, input.commandId, input.occurrence]),
    label: input.label,
    searchText: input.searchText,
    target: intent.target,
    invocation: { intent, args: input.args, dispatch: input.dispatch }
  }
}

export function quickJumpMenuTargetV7(
  item: ActionMenuItemV7,
  dispatch?: QuickJumpInvocationV7['dispatch']
): QuickJumpRegistrationV7 | null {
  if (!item.target) return null
  return quickJumpCommandTargetV7({
    featureId: item.target.featureId,
    target: item.target,
    commandId: item.commandId,
    args: item.args,
    label: item.title,
    searchText: item.description,
    occurrence: 'drawer',
    disposition: item.navigationIntent?.disposition ?? 'execute',
    dispatch
  })
}

export function useQuickJumpTargetV7(): ObjectDirective<HTMLElement, QuickJumpRegistrationV7 | null> {
  const registry = inject(quickJumpRegistryKeyV7, null)
  if (!registry) return {}
  const disposals = new WeakMap<HTMLElement, () => void>()

  function unregister(element: HTMLElement) {
    disposals.get(element)?.()
    disposals.delete(element)
  }

  const update = (element: HTMLElement, { value }: { value: QuickJumpRegistrationV7 | null }) => {
    unregister(element)
    if (value) disposals.set(element, registry.register(element, value))
  }

  return { mounted: update, updated: update, beforeUnmount: unregister }
}

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
      const registration = { ...target }
      registrations.set(element, registration)
      return () => {
        if (registrations.get(element) === registration) registrations.delete(element)
      }
    },
    registrationFor(element) {
      return registrations.get(element)
    },
    collect(collectOptions = {}) {
      const root = options.root() || document.body
      const fallback = Array.from(root.querySelectorAll<HTMLElement>(options.fallbackSelector || QUICK_JUMP_FALLBACK_SELECTOR_V7))
      const elements = [...registrations.keys(), ...fallback]
      const seen = new Set<HTMLElement>()
      const targets = elements.flatMap((element, index) => {
        if (seen.has(element) || !root.contains(element)) return []
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
          invocation: registered?.invocation,
          element
        }]
      })
      if (collectOptions.domOrder) {
        targets.sort((left, right) =>
          left.element.compareDocumentPosition(right.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
      }
      return assignQuickJumpMarkers(collectOptions.backward ? targets.reverse() : targets)
    },
    clear() {
      registrations.clear()
    }
  }
}
