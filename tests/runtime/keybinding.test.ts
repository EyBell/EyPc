import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBINDINGS,
  buildEffectiveKeybindings,
  explainKeybinding,
  resolveKeybinding
} from '../../src/runtime/keybinding/keybindingRuntime'

describe('keybinding runtime', () => {
  it('resolves default bindings with when context and layer priority', () => {
    const context = { tab: 'ports' as const, confirmOpen: false, textInputFocused: false }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('ports.kill.confirm')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', { ...context, tab: 'favorites' })?.actionId).toBe('favorites.open')
  })

  it('applies user override, disabled state, and explains conflicts', () => {
    const effective = buildEffectiveKeybindings([
      { commandId: 'ports.scan', shortcutId: 'Ctrl+R', source: 'user' },
      { commandId: 'search.focus', shortcutId: 'Ctrl+F', source: 'removed', disabled: true }
    ])

    expect(resolveKeybinding(effective, 'Ctrl+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Ctrl+F', { tab: 'ports' })).toBeNull()
    expect(explainKeybinding(effective, 'Ctrl+F', { tab: 'ports' }).level).toBe('blocked')
  })
})
