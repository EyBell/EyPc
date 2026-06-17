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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+1', context)?.actionId).toBe('tab.select.ports')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+2', context)?.actionId).toBe('tab.select.favorites')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+3', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', context)?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, textInputFocused: true, activeInputRole: 'port-group-search' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, tab: 'favorites', textInputFocused: true, activeInputRole: 'favorite-search' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, tab: 'settings', textInputFocused: true, activeInputRole: 'settings' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, textInputFocused: true, activeInputRole: 'other' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', { ...context, tab: 'favorites' })?.actionId).toBe('favorites.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+1', { ...context, textInputFocused: true })).toBeNull()
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', context)?.actionId).toBe('ports.groupSearch.focus')
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', context)?.actionId).toBe('ports.groupSearch.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', context)?.actionId).toBe('ports.group.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', context)?.actionId).toBe('ports.group.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', context)?.actionId).toBe('ports.groupDetail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', context)?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', context)?.actionId).toBe('ports.group.focusMatches')
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+1', context)?.actionId).toBe('tab.select.ports')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('ports.drawer.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('ports.drawer.select')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', context)?.actionId).toBe('ports.drawer.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+1', { ...context, portDrawerOpen: false, portDrawerActive: false })?.actionId).toBe('ports.drawer.action.1')
  })

  it('normalizes legacy shortcuts and applies command-level multi-shortcut overrides', () => {
    expect(normalizeShortcutId('ctrl+arrowright')).toBe('Ctrl+ArrowRight')
    expect(normalizeShortcutId('cmd+shift+enter')).toBe('Ctrl+Shift+Enter')
    expect(normalizeShortcutId('a-1')).toBe('Alt+1')
    expect(normalizeShortcutId('c-s-f')).toBe('Ctrl+Shift+F')
    expect(normalizeShortcutId('c-cr')).toBe('Ctrl+Enter')
    expect(normalizeShortcutId('←')).toBe('ArrowLeft')

    const effective = buildEffectiveKeybindings([
      { commandId: 'ports.scan', shortcutIds: ['ctrl+r', 'alt+r'], enabled: true }
    ])

    expect(resolveKeybinding(effective, 'Ctrl+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Alt+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
  })

  it('formats shortcuts as Ez-style short labels for display', async () => {
    const { formatShortcutLabel, formatShortcutList } = await import('../../src/domain/shortcuts')

    expect(formatShortcutLabel('Ctrl+Shift+F')).toBe('c-s-f')
    expect(formatShortcutLabel('Alt+1')).toBe('a-1')
    expect(formatShortcutLabel('Ctrl+Enter')).toBe('c-cr')
    expect(formatShortcutLabel('Shift+Escape')).toBe('s-esc')
    expect(formatShortcutLabel('ArrowLeft')).toBe('←')
    expect(formatShortcutList(['Ctrl+F', 'Ctrl+Shift+F'])).toBe('c-f / c-s-f')
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
      { commandId: 'ports.scan', shortcutIds: ['Ctrl+Delete'], when: "tab == 'ports'", enabled: true }
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
    expect(preview.candidates.map((item) => item.actionId)).not.toContain('tab.select.ports')
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

  it('uses Ctrl+W to toggle the group panel and reuses Ctrl+Left/Right for group drawers', () => {
    const groupContext = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'groups' as const,
      portDrawerOpen: false,
      portDrawerActive: false,
      portDetailOpen: false,
      portDetailActive: false,
      portGroupDetailOpen: false,
      portGroupDetailActive: false
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Alt+1', groupContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+W', groupContext)?.actionId).toBe('ports.groups.togglePanel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', groupContext)?.actionId).toBe('ports.groupDetail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', groupContext)?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', { ...groupContext, portGroupDetailOpen: true, portGroupDetailActive: true })?.actionId).toBe('ports.groupDetail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', { ...groupContext, portGroupDetailOpen: true, portGroupDetailActive: true })?.actionId).toBe('ports.groupDetail.close')
  })

  it('routes port search focus, group search focus, and group focus matches through commands', () => {
    const resultContext = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'results' as const
    }
    const groupContext = {
      ...resultContext,
      portPane: 'groups' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', resultContext)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', groupContext)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', resultContext)?.actionId).toBe('ports.groupSearch.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', groupContext)?.actionId).toBe('ports.group.focusMatches')
  })

  it('maps right-side process kill to delete shortcuts outside search inputs', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'results' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)?.actionId).toBe('ports.kill.confirm')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', context)?.actionId).toBe('ports.kill.confirm')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', context)?.actionId).toBe('ports.kill.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', context)?.actionId).toBe('ports.kill.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', context)).toBeNull()
  })

  it('uses Shift+Arrow for search history candidates and leaves Arrow navigation on lists', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'port-search' as const,
      portPane: 'results' as const,
      searchHistoryOpen: true,
      searchHistoryHasItems: true,
      searchHistorySelectionActive: false
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', context)?.actionId).toBe('list.up')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowDown', context)?.actionId).toBe('search.history.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowUp', context)?.actionId).toBe('search.history.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)?.actionId).toBe('search.history.accept')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', context)?.actionId).toBe('search.history.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', context)).toBeNull()

    const highlighted = { ...context, searchHistorySelectionActive: true }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', highlighted)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', highlighted)?.actionId).toBe('list.up')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowDown', highlighted)?.actionId).toBe('search.history.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowUp', highlighted)?.actionId).toBe('search.history.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', highlighted)?.actionId).toBe('search.history.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', highlighted)?.actionId).toBe('search.history.delete')

    const closedWithMatches = { ...context, searchHistoryOpen: false, searchHistoryHasItems: true }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowDown', closedWithMatches)?.actionId).toBe('search.history.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', closedWithMatches)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', closedWithMatches)?.actionId).toBe('ports.search.blur')
  })

  it('lets Shift+Escape hide the app above every layer and text input', () => {
    const base = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'results' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Escape', base)?.actionId).toBe('app.hide')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Escape', { ...base, confirmOpen: true })?.actionId).toBe('app.hide')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Escape', { ...base, portDrawerOpen: true, portDrawerActive: true })?.actionId).toBe('app.hide')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Escape', { ...base, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('app.hide')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Escape', { ...base, textInputFocused: true, activeInputRole: 'port-group-search', portPane: 'groups' })?.actionId).toBe('app.hide')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Escape', { ...base, textInputFocused: true, activeInputRole: 'port-group-editor', portPane: 'groups' })?.actionId).toBe('app.hide')
  })

  it('allows group search navigation, fold keys, and drawers while blocking unrelated text shortcuts', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'port-group-search' as const,
      portPane: 'groups' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', context)?.actionId).toBe('ports.groupTarget.collapse')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', context)?.actionId).toBe('ports.groupTarget.expand')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', context)?.actionId).toBe('ports.groupDetail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', context)?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', context)).toBeNull()
  })

  it('applies user override, disabled state, and explains conflicts', () => {
    const effective = buildEffectiveKeybindings([
      { commandId: 'ports.scan', shortcutIds: ['Ctrl+R'], source: 'user' },
      { commandId: 'ports.search.focus', shortcutIds: ['Ctrl+F'], source: 'removed', disabled: true }
    ])

    expect(resolveKeybinding(effective, 'Ctrl+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Ctrl+F', { tab: 'ports' })).toBeNull()
    expect(explainKeybinding(effective, 'Ctrl+F', { tab: 'ports' }).level).toBe('blocked')
  })
})
