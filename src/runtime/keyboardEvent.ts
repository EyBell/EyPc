import type { AppTabId } from '../domain/types'
import { shortcutFromEvent as shortcutFromKeyboardEvent } from '../domain/shortcuts'
import type { KeybindingContext } from './keybinding/keybindingRuntime'

export type KeyboardInputRole = NonNullable<KeybindingContext['activeInputRole']>

export function shortcutFromEvent(event: KeyboardEvent): string {
  return shortcutFromKeyboardEvent(event)
}

export function shouldEnableShiftPreview(event: KeyboardEvent): boolean {
  return event.shiftKey && !event.ctrlKey && !event.metaKey
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || element.isContentEditable === true || element.getAttribute?.('role') === 'textbox'
}

export function activeInputRoleFromTarget(target: EventTarget | null, activeTab: AppTabId): KeyboardInputRole | undefined {
  const element = target as HTMLElement | null
  const role = element && typeof element.closest === 'function'
    ? element.closest<HTMLElement>('[data-role]')?.dataset.role
    : undefined
  if (role === 'mqtt-connections') return 'mqtt-connections'
  if (role === 'mqtt-subscriptions') return 'mqtt-subscriptions'
  if (role === 'mqtt-topic-filter') return 'mqtt-topic-filter'
  if (role === 'mqtt-publish-options') return 'mqtt-publish-options'
  if (role === 'mqtt-publish-draft') return 'mqtt-publish-draft'
  if (role === 'mqtt-publish-draft-editor') return 'mqtt-publish-draft-editor'
  if (role === 'mqtt-config-subscription-editor') return 'mqtt-config-subscription-editor'
  if (role === 'mqtt-config-publish-editor') return 'mqtt-config-publish-editor'
  if (role === 'mqtt-subscription-editor') return 'mqtt-subscription-editor'
  if (role === 'mqtt-favorite-editor') return 'mqtt-favorite-editor'
  if (!element || !isEditableTarget(element)) return undefined
  if (role === 'port-group-search') return 'port-group-search'
  if (role === 'port-group-editor') return 'port-group-editor'
  if (role === 'port-search') return 'port-search'
  if (role === 'mqtt-search' || role === 'mqtt-record-search' || role === 'mqtt-template-search' || role === 'mqtt-history-search') return 'mqtt-search'
  if (role === 'mqtt-publish-editor') return 'mqtt-publish-editor'
  if (role === 'mqtt-editor') return 'mqtt-editor'
  if (role === 'mqtt-record-editor') return 'mqtt-record-editor'
  if (role === 'favorite-search') return 'favorite-search'
  if (role === 'favorite-group-search') return 'favorite-group-search'
  if (role === 'favorite-editor') return 'favorite-editor'
  if (role === 'favorite-pick-review') return 'favorite-pick-review'
  if (role === 'primary-search') return activeTab === 'ports' ? 'port-search' : activeTab === 'mqtt' ? 'mqtt-search' : 'favorite-search'
  if (activeTab === 'settings') return 'settings'
  return 'other'
}

export function blockHandledShortcutEvent(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}
