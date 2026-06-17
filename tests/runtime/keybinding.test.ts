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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', context)?.actionId).toBe('tab.select.ports')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', context)?.actionId).toBe('tab.select.favorites')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+3', context)?.actionId).toBe('tab.select.settings')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('ports.kill.confirm')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', { ...context, tab: 'favorites' })?.actionId).toBe('favorites.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', { ...context, textInputFocused: true })).toBeNull()
  })

  it('uses Tab for port pane cycling without stealing text input focus', () => {
    const context = { tab: 'ports' as const, confirmOpen: false, textInputFocused: false, portPane: 'results' as const }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', context)?.actionId).toBe('ports.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', { ...context, portPane: 'groups' })?.actionId).toBe('ports.pane.togglePrev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, textInputFocused: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, tab: 'favorites' })?.actionId).toBe('tab.next')
  })

  it('keeps result-list shortcuts active while the port search input is focused', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'port-search' as const,
      portPane: 'results' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+J', context)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', context)?.actionId).toBe('list.up')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', context)?.actionId).toBe('list.toggleSelection')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('ports.kill.confirm')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', context)?.actionId).toBe('ports.kill.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', context)?.actionId).toBe('ports.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', context)?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', context)).toBeNull()
  })

  it('keeps group-list navigation active while the port group search input is focused', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'port-group-search' as const,
      portPane: 'groups' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+K', context)?.actionId).toBe('list.up')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('ports.group.apply')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', context)).toBeNull()
  })

  it('prioritizes drawer shortcuts over global tab selection while the drawer is open', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portDrawerOpen: true,
      portDrawerActive: true,
      portPane: 'results' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', context)?.actionId).toBe('ports.drawer.select.1')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', context)?.actionId).toBe('ports.drawer.select.2')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('ports.drawer.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('ports.drawer.select')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', context)?.actionId).toBe('ports.drawer.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+1', { ...context, portDrawerOpen: false, portDrawerActive: false })?.actionId).toBe('ports.drawer.action.1')
  })

  it('uses Ctrl+Left for port detail and lets active drawers close before navigation', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'results' as const,
      portDetailOpen: false,
      portDetailActive: false,
      portDrawerOpen: false,
      portDrawerActive: false
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', context)?.actionId).toBe('ports.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', { ...context, portDetailOpen: true, portDetailActive: true })?.actionId).toBe('ports.detail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', { ...context, portDetailOpen: true, portDetailActive: true })?.actionId).toBe('ports.detail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', { ...context, portDrawerOpen: true, portDrawerActive: true })?.actionId).toBe('ports.drawer.close')
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
