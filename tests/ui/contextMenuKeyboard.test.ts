// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchKeyboardContextMenuV7, isContextMenuShortcutV7 } from '../../src/ui/contextMenuKeyboard'

afterEach(() => { document.body.innerHTML = '' })

describe('keyboard context-menu parity', () => {
  it('recognizes native Menu and unmodified Shift+F10 only', () => {
    expect(isContextMenuShortcutV7(new KeyboardEvent('keydown', { key: 'ContextMenu' }))).toBe(true)
    expect(isContextMenuShortcutV7(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true }))).toBe(true)
    expect(isContextMenuShortcutV7(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, ctrlKey: true }))).toBe(false)
  })

  it('opens the aria-active row and leaves unrelated controls untouched', () => {
    document.body.innerHTML = '<div id="list" tabindex="0" aria-activedescendant="row-2"><div id="row-2" data-context-menu-target></div></div><button id="plain">plain</button>'
    const row = document.getElementById('row-2') as HTMLElement
    const listener = vi.fn((event: Event) => event.preventDefault())
    row.addEventListener('contextmenu', listener)
    ;(document.getElementById('list') as HTMLElement).focus()
    const event = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, cancelable: true })
    expect(dispatchKeyboardContextMenuV7(event)).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)

    ;(document.getElementById('plain') as HTMLElement).focus()
    expect(dispatchKeyboardContextMenuV7(new KeyboardEvent('keydown', { key: 'ContextMenu', cancelable: true }))).toBe(false)
  })
})
