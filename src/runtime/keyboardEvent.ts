import type { AppTabId } from '../domain/types'
import { shortcutFromEvent as shortcutFromKeyboardEvent } from '../domain/shortcuts'
import type { KeybindingContext } from './keybinding/keybindingRuntime'

export type KeyboardInputRole = NonNullable<KeybindingContext['activeInputRole']>

export function shortcutFromEvent(event: KeyboardEvent): string {
  return shortcutFromKeyboardEvent(event)
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || element.isContentEditable === true
}

export function activeInputRoleFromTarget(target: EventTarget | null, activeTab: AppTabId): KeyboardInputRole | undefined {
  const element = target as HTMLElement | null
  if (!element || !isEditableTarget(element)) return undefined
  const role = typeof element.closest === 'function'
    ? element.closest<HTMLElement>('[data-role]')?.dataset.role
    : undefined
  if (role === 'port-group-search') return 'port-group-search'
  if (role === 'port-group-editor') return 'port-group-editor'
  if (role === 'port-search') return 'port-search'
  if (role === 'favorite-search') return 'favorite-search'
  if (role === 'favorite-group-search') return 'favorite-group-search'
  if (role === 'favorite-editor') return 'favorite-editor'
  if (role === 'favorite-pick-review') return 'favorite-pick-review'
  if (role === 'primary-search') return activeTab === 'ports' ? 'port-search' : 'favorite-search'
  if (activeTab === 'settings') return 'settings'
  return 'other'
}

export function blockHandledShortcutEvent(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}
