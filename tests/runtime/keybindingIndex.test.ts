import { describe, expect, it } from 'vitest'
import { createKeybindingIndexV7 } from '../../src/runtime/keybinding/keybindingIndex'
import { buildEffectiveKeybindings } from '../../src/runtime/keybinding/keybindingRuntime'

describe('KeybindingIndex V7', () => {
  it('indexes a configuration revision once for resolution, labels, and settings rows', () => {
    const index = createKeybindingIndexV7(7, buildEffectiveKeybindings([
      { commandId: 'search.focus', shortcutIds: ['Ctrl+L'] }
    ]))

    expect(index.revision).toBe(7)
    expect(index.resolve('Ctrl+L', { tab: 'ports', textInputFocused: false })?.actionId).toBe('search.focus')
    expect(index.resolve('Ctrl+F', { tab: 'ports', textInputFocused: false })?.actionId).toBe('ports.search.focus')
    expect(index.labelFor('search.focus')).toBe('c-l')
    expect(index.labelRecord).toBe(index.labelRecord)
    expect(index.labelRecord['search.focus']).toBe('c-l')
    expect(index.shortcutsFor('search.focus')).toEqual(['Ctrl+L'])
    expect(index.rows().find((row) => row.commandId === 'search.focus')?.source).toBe('user')
  })

  it('resolves Favorites modal layers before the ordinary Favorites layer', () => {
    const index = createKeybindingIndexV7(1, buildEffectiveKeybindings())
    const promptContext = {
      tab: 'favorites' as const,
      textInputFocused: true,
      activeInputRole: 'other' as const,
      favoriteRunPromptOpen: true
    }
    expect(index.resolve('Ctrl+Enter', promptContext)?.actionId).toBe('favorites.run.prompt.submit')
    expect(index.resolve('Escape', promptContext)?.actionId).toBe('favorites.run.prompt.cancel')
    expect(index.resolve('Escape', {
      tab: 'favorites',
      textInputFocused: false,
      favoriteSlotManagerOpen: true
    })?.actionId).toBe('favorites.slot.manager.close')

    expect(index.resolve('Ctrl+N', promptContext)).toBeNull()
    expect(index.resolveWithBarrier('Ctrl+N', promptContext)).toMatchObject({
      binding: null,
      consumed: true,
      blockedBy: 'favorites-run-prompt'
    })
    expect(index.resolveWithBarrier('Delete', promptContext)).toMatchObject({
      binding: null,
      consumed: false,
      blockedBy: 'favorites-run-prompt'
    })
  })

  it('filters surface-local commands before choosing a winning chord', () => {
    const index = createKeybindingIndexV7(1, buildEffectiveKeybindings())
    const context = { tab: 'ports' as const, textInputFocused: false }

    expect(index.resolve('Ctrl+W', context, 'main')).toBeNull()
    expect(index.resolve('Ctrl+W', context, 'action')?.actionId).toBe('action.runner.hide')
  })
})
