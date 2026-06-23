import { describe, expect, it, vi } from 'vitest'
import { activeInputRoleFromTarget, blockHandledShortcutEvent, shortcutFromEvent } from '../../src/runtime/keyboardEvent'

describe('keyboard event runtime', () => {
  it('normalizes Escape and blocks host propagation after runtime handles it', () => {
    const event = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as KeyboardEvent

    expect(shortcutFromEvent(event)).toBe('Escape')

    blockHandledShortcutEvent(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('normalizes Alt number shortcuts without requiring Ctrl', () => {
    const event = {
      key: '1',
      ctrlKey: false,
      metaKey: false,
      altKey: true,
      shiftKey: false
    } as unknown as KeyboardEvent

    expect(shortcutFromEvent(event)).toBe('Alt+1')
  })

  it('normalizes multi-modifier shortcuts from keyboard events', () => {
    const event = {
      key: 'F',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true
    } as unknown as KeyboardEvent

    expect(shortcutFromEvent(event)).toBe('Ctrl+Shift+F')
  })

  it('uses physical key code when Alt changes the typed character', () => {
    const event = {
      key: 'ß',
      code: 'KeyS',
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false
    } as unknown as KeyboardEvent

    expect(shortcutFromEvent(event)).toBe('Ctrl+Alt+S')
  })

  it('detects the MQTT subscription rail as a command-owned focus role', () => {
    const row = {
      tagName: 'BUTTON',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-subscriptions' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(row, 'mqtt')).toBe('mqtt-subscriptions')
  })

  it('detects MQTT subscription editor inputs as the dedicated edit role', () => {
    const input = {
      tagName: 'INPUT',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-subscription-editor' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(input, 'mqtt')).toBe('mqtt-subscription-editor')
  })
})
