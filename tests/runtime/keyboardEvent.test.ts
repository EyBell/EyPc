import { describe, expect, it, vi } from 'vitest'
import { activeInputRoleFromTarget, blockHandledShortcutEvent, isEditableTarget, shortcutFromEvent, shouldEnableShiftPreview } from '../../src/runtime/keyboardEvent'

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

  it('enables shift preview only while Shift is held without command modifiers', () => {
    expect(shouldEnableShiftPreview({
      key: 'Shift',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true
    } as unknown as KeyboardEvent)).toBe(true)
    expect(shouldEnableShiftPreview({
      key: 'F',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true
    } as unknown as KeyboardEvent)).toBe(false)
    expect(shouldEnableShiftPreview({
      key: 'F',
      ctrlKey: false,
      metaKey: true,
      shiftKey: true
    } as unknown as KeyboardEvent)).toBe(false)
    expect(shouldEnableShiftPreview({
      key: 'Control',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true
    } as unknown as KeyboardEvent)).toBe(true)
    expect(shouldEnableShiftPreview({
      key: 'Shift',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    } as unknown as KeyboardEvent)).toBe(false)
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

  it('treats role=textbox nodes as editable targets for global shortcuts', () => {
    const textBox = {
      tagName: 'DIV',
      isContentEditable: false,
      getAttribute: (name: string) => name === 'role' ? 'textbox' : null,
      closest: () => null
    } as unknown as HTMLElement

    expect(isEditableTarget(textBox)).toBe(true)
    expect(activeInputRoleFromTarget(textBox, 'ports')).toBe('other')
  })

  it('detects the MQTT subscription rail as a command-owned focus role', () => {
    const row = {
      tagName: 'BUTTON',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-subscriptions' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(row, 'mqtt')).toBe('mqtt-subscriptions')
  })

  it('detects the MQTT connection rail as a command-owned focus role', () => {
    const row = {
      tagName: 'ARTICLE',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-connections' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(row, 'mqtt')).toBe('mqtt-connections')
  })

  it('detects MQTT subscription editor inputs as the dedicated edit role', () => {
    const input = {
      tagName: 'INPUT',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-subscription-editor' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(input, 'mqtt')).toBe('mqtt-subscription-editor')
  })

  it('detects MQTT config row editors as managed edit roles', () => {
    const subscriptionInput = {
      tagName: 'INPUT',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-config-subscription-editor' } } : null
    } as unknown as HTMLElement
    const publishInput = {
      tagName: 'INPUT',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-config-publish-editor' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(subscriptionInput, 'mqtt')).toBe('mqtt-config-subscription-editor')
    expect(activeInputRoleFromTarget(publishInput, 'mqtt')).toBe('mqtt-config-publish-editor')
  })

  it('detects MQTT publish editor inputs as dedicated editor role', () => {
    const textarea = {
      tagName: 'TEXTAREA',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-publish-editor' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(textarea, 'mqtt')).toBe('mqtt-publish-editor')
  })

  it('detects MQTT topic filter, publish options, and publish history as command focus roles', () => {
    const topicFilterSearch = {
      tagName: 'INPUT',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-topic-filter' } } : null
    } as unknown as HTMLElement
    const publishOptions = {
      tagName: 'BUTTON',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-publish-options' } } : null
    } as unknown as HTMLElement
    const publishHistory = {
      tagName: 'BUTTON',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-publish-draft' } } : null
    } as unknown as HTMLElement
    const publishHistoryEditor = {
      tagName: 'TEXTAREA',
      isContentEditable: false,
      closest: (selector: string) => selector === '[data-role]' ? { dataset: { role: 'mqtt-publish-draft-editor' } } : null
    } as unknown as HTMLElement

    expect(activeInputRoleFromTarget(topicFilterSearch, 'mqtt')).toBe('mqtt-topic-filter')
    expect(activeInputRoleFromTarget(publishOptions, 'mqtt')).toBe('mqtt-publish-options')
    expect(activeInputRoleFromTarget(publishHistory, 'mqtt')).toBe('mqtt-publish-draft')
    expect(activeInputRoleFromTarget(publishHistoryEditor, 'mqtt')).toBe('mqtt-publish-draft-editor')
  })
})
