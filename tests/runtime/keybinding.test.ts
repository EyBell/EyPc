import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBINDINGS,
  buildEffectiveKeybindings,
  buildShortcutCommandRows,
  canWhenClausesOverlap,
  detectShortcutConflicts,
  explainKeybinding,
  getShortcutReservationConflicts,
  normalizeShortcutId,
  previewKeybindingResolution,
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

  it('uses command-soul edit shortcuts and blocks lower layers inside editors', () => {
    const groupsContext = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'groups' as const
    }
    const editorContext = {
      ...groupsContext,
      textInputFocused: true,
      activeInputRole: 'port-group-editor' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', groupsContext)?.actionId).toBe('ports.group.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', groupsContext)?.actionId).toBe('ports.group.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', editorContext)?.actionId).toBe('ports.group.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', editorContext)?.actionId).toBe('ports.group.edit.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', editorContext)?.actionId).toBe('ports.group.edit.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', editorContext)?.actionId).toBe('ports.group.edit.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', editorContext)).toBeNull()
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

  it('normalizes legacy shortcuts and applies command-level multi-shortcut overrides', () => {
    expect(normalizeShortcutId('ctrl+arrowright')).toBe('Ctrl+ArrowRight')
    expect(normalizeShortcutId('cmd+shift+enter')).toBe('Ctrl+Shift+Enter')

    const effective = buildEffectiveKeybindings([
      { commandId: 'ports.scan', shortcutIds: ['ctrl+r', 'alt+r'], enabled: true }
    ])

    expect(resolveKeybinding(effective, 'Ctrl+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Alt+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
  })

  it('merges profile shortcut overrides while preserving global defaults', () => {
    const effective = buildEffectiveKeybindings({
      global: { keybindingOverrides: [{ commandId: 'search.focus', shortcutIds: ['Ctrl+P'], enabled: true }], updatedAt: 1 },
      ports: { keybindingOverrides: [{ commandId: 'ports.scan', shortcutIds: ['Alt+R'], enabled: true }], updatedAt: 1 },
      favorites: { keybindingOverrides: [{ commandId: 'favorites.open', shortcutIds: ['Ctrl+O'], enabled: true }], updatedAt: 1 },
      settings: { keybindingOverrides: [], updatedAt: 1 }
    })

    expect(resolveKeybinding(effective, 'Ctrl+P', { tab: 'ports' })?.actionId).toBe('search.focus')
    expect(resolveKeybinding(effective, 'Alt+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Ctrl+O', { tab: 'favorites' })?.actionId).toBe('favorites.open')
    expect(buildShortcutCommandRows(effective).find((row) => row.commandId === 'ports.scan')?.profileId).toBe('ports')
  })

  it('detects conflicts only when shortcut and when clauses can overlap', () => {
    expect(canWhenClausesOverlap("tab == 'ports' && portDrawerActive", "tab == 'ports' && !portDrawerActive")).toBe(false)
    expect(canWhenClausesOverlap("tab == 'ports' && portDrawerActive", "tab == 'ports' && portDrawerOpen")).toBe(true)

    const rows = buildShortcutCommandRows(buildEffectiveKeybindings([
      { commandId: 'ports.scan', shortcutIds: ['Ctrl+1'], when: "tab == 'ports' && !portDrawerActive", enabled: true }
    ]))
    const scan = rows.find((row) => row.commandId === 'ports.scan')
    expect(scan?.conflicts).toEqual([])

    const conflictingRows = buildShortcutCommandRows(buildEffectiveKeybindings([
      { commandId: 'ports.scan', shortcutIds: ['Ctrl+Enter'], when: "tab == 'ports'", enabled: true }
    ]))
    const conflict = detectShortcutConflicts(conflictingRows.find((row) => row.commandId === 'ports.scan')!, conflictingRows)
    expect(conflict.some((item) => item.commandId === 'ports.kill.force')).toBe(true)
  })

  it('reports reserved shortcuts and previews layer resolution candidates', () => {
    const reserved = getShortcutReservationConflicts('Escape', { commandId: 'ports.scan', when: "tab == 'ports' && portDrawerActive" })
    expect(reserved[0]).toMatchObject({ commandId: 'ports.drawer.close' })

    const preview = previewKeybindingResolution(DEFAULT_KEYBINDINGS, 'Ctrl+1', {
      tab: 'ports',
      textInputFocused: false,
      portDrawerOpen: true,
      portDrawerActive: true
    })
    expect(preview.winner?.actionId).toBe('ports.drawer.select.1')
    expect(preview.candidates.map((item) => item.actionId)).toContain('tab.select.ports')
    expect(preview.candidates[0].layer).toBe('port-drawer')
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
      { commandId: 'ports.scan', shortcutIds: ['Ctrl+R'], source: 'user' },
      { commandId: 'search.focus', shortcutIds: ['Ctrl+F'], source: 'removed', disabled: true }
    ])

    expect(resolveKeybinding(effective, 'Ctrl+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Ctrl+F', { tab: 'ports' })).toBeNull()
    expect(explainKeybinding(effective, 'Ctrl+F', { tab: 'ports' }).level).toBe('blocked')
  })
})
