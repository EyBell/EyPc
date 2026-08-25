export const CONTEXT_MENU_TARGET_SELECTOR_V7 = '[data-context-menu-target]'

export function isContextMenuShortcutV7(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey)
}

function activeContextTarget(scope: ParentNode): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (!active) return null
  const activeDescendant = active.getAttribute('aria-activedescendant')
  const descendant = activeDescendant ? document.getElementById(activeDescendant) : null
  const candidate = descendant?.closest<HTMLElement>(CONTEXT_MENU_TARGET_SELECTOR_V7)
    || active.closest<HTMLElement>(CONTEXT_MENU_TARGET_SELECTOR_V7)
    || active.querySelector<HTMLElement>(`${CONTEXT_MENU_TARGET_SELECTOR_V7}[data-context-menu-active="true"]`)
  if (!candidate) return null
  if (scope instanceof Node && !scope.contains(candidate)) return null
  return candidate
}

/** Keyboard parity for native Menu / Shift+F10 without page-level listeners. */
export function dispatchKeyboardContextMenuV7(event: KeyboardEvent, scope: ParentNode = document): boolean {
  if (!isContextMenuShortcutV7(event) || event.isComposing) return false
  const target = activeContextTarget(scope)
  if (!target) return false
  const rect = target.getBoundingClientRect()
  const dispatched = target.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: Math.round(rect.left + Math.min(24, Math.max(1, rect.width / 2))),
    clientY: Math.round(rect.top + Math.min(24, Math.max(1, rect.height / 2)))
  }))
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  return dispatched || event.defaultPrevented
}
