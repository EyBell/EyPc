import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBINDINGS,
  buildEffectiveKeybindings,
  buildShortcutCommandRows,
  canWhenClausesOverlap,
  DEFAULT_SHORTCUTS_BY_COMMAND,
  detectShortcutConflicts,
  explainKeybinding,
  getShortcutReservationConflicts,
  normalizeShortcutId,
  previewKeybindingResolution,
  resolveKeybinding
} from '../../src/runtime/keybinding/keybindingRuntime'

describe('keybinding runtime', () => {
  it('scopes the Codex shortcut domain to its own tab and interaction layer', () => {
    const codexContext = { tab: 'codex' as const, confirmOpen: false, textInputFocused: false }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', codexContext)?.actionId).toBe('codex.thread.createFocused')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...codexContext, confirmOpen: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...codexContext, textInputFocused: true, activeInputRole: 'codex-composer' })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...codexContext, tab: 'favorites' })?.actionId).not.toBe('codex.thread.createFocused')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', codexContext)?.actionId).toBe('codex.list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', codexContext)?.actionId).toBe('codex.task.archiveFocused')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', codexContext)?.actionId).toBe('codex.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+9', codexContext)?.actionId).toBe('codex.drawer.select.9')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', codexContext)?.actionId).toBe('codex.quickJump.openForward')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', codexContext)?.actionId).toBe('codex.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', { ...codexContext, textInputFocused: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', { ...codexContext, textInputFocused: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', { ...codexContext, tab: 'mqtt' })).not.toMatchObject({ actionId: 'codex.task.archiveFocused' })

    const rows = buildShortcutCommandRows(DEFAULT_KEYBINDINGS)
    const codexRefresh = rows.find((row) => row.commandId === 'codex.refresh')!
    const codexCreate = rows.find((row) => row.commandId === 'codex.thread.createFocused')!
    expect(codexRefresh.profileId).toBe('codex')
    expect(codexCreate.profileId).toBe('codex')
    expect(codexCreate.defaultShortcutIds).toEqual(['Ctrl+T'])
    expect(codexCreate.conflicts.some((conflict) => conflict.commandId === 'favorites.group.create')).toBe(false)
    expect(rows.find((row) => row.commandId === 'codex.selection.toggle')?.title).toBe('切换当前项选择')
    expect(codexRefresh.conflicts.some((conflict) => conflict.commandId === 'mqtt.connection.connect')).toBe(false)

    const conflicting = buildShortcutCommandRows(buildEffectiveKeybindings([
      { commandId: 'codex.refresh', shortcutIds: ['Ctrl+L'] },
      { commandId: 'codex.search.focus', shortcutIds: ['Ctrl+L'] }
    ]))
    expect(conflicting.find((row) => row.commandId === 'codex.refresh')?.conflicts).toContainEqual(expect.objectContaining({ commandId: 'codex.search.focus', shortcutId: 'Ctrl+L' }))

    const overridden = buildEffectiveKeybindings({
      global: { keybindingOverrides: [], updatedAt: 1 },
      ports: { keybindingOverrides: [], updatedAt: 1 },
      mqtt: { keybindingOverrides: [], updatedAt: 1 },
      favorites: { keybindingOverrides: [], updatedAt: 1 },
      codex: { keybindingOverrides: [{ commandId: 'codex.thread.createFocused', shortcutIds: ['Ctrl+N'], enabled: true }], updatedAt: 1 },
      settings: { keybindingOverrides: [], updatedAt: 1 }
    })
    expect(resolveKeybinding(overridden, 'Ctrl+N', codexContext)?.actionId).toBe('codex.thread.createFocused')
    expect(resolveKeybinding(overridden, 'Ctrl+T', codexContext)?.actionId).not.toBe('codex.thread.createFocused')

    const composerPreview = previewKeybindingResolution(DEFAULT_KEYBINDINGS, 'Ctrl+T', {
      ...codexContext,
      textInputFocused: true,
      activeInputRole: 'codex-composer'
    })
    expect(composerPreview.activeLayers).toContain('codex-composer')
    expect(composerPreview.winner).toBeNull()
  })

  it('resolves default bindings with when context and layer priority', () => {
    const context = { tab: 'ports' as const, confirmOpen: false, textInputFocused: false }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+1', context)?.actionId).toBe('tab.select.ports')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+2', context)?.actionId).toBe('tab.select.mqtt')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+3', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', context)?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, textInputFocused: true, activeInputRole: 'port-group-search' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, tab: 'favorites', textInputFocused: true, activeInputRole: 'favorite-search' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, tab: 'settings', textInputFocused: true, activeInputRole: 'settings' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+S', { ...context, textInputFocused: true, activeInputRole: 'other' })?.actionId).toBe('settings.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+Q', context)?.actionId).toBe('codex.float.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+Q', { ...context, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('codex.float.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+Q', { ...context, tab: 'settings', confirmOpen: true, textInputFocused: true, activeInputRole: 'settings' })?.actionId).toBe('codex.float.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+Enter', context)?.actionId).toBe('codex.float.activate')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+Enter', { ...context, textInputFocused: true, activeInputRole: 'other' })?.actionId).toBe('codex.float.activate')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F', context)?.actionId).toBe('quickJump.openForward')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F', context)?.actionId).toBe('quickJump.openBackward')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F', { ...context, textInputFocused: true })).toBeNull()
    expect(buildShortcutCommandRows(DEFAULT_KEYBINDINGS).find((row) => row.commandId === 'quickJump.openForward')?.defaultShortcutIds).toEqual(['F'])
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', { ...context, tab: 'favorites', favoritePane: 'items' })?.actionId).toBe('favorites.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+1', { ...context, textInputFocused: true })).toBeNull()
  })

  it('preserves native editing keys in settings edit inputs', () => {
    const context = { tab: 'settings' as const, confirmOpen: false, textInputFocused: true, activeInputRole: 'settings' as const }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', context)).toBeNull()
  })

  it('keeps search inputs from owning Tab history behavior', () => {
    const context = { tab: 'ports' as const, confirmOpen: false, textInputFocused: false, portPane: 'results' as const }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', context)?.actionId).toBe('ports.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', { ...context, portPane: 'groups' })?.actionId).toBe('ports.pane.togglePrev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('ports.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', { ...context, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('ports.pane.togglePrev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, textInputFocused: true, activeInputRole: 'port-group-search', portPane: 'groups' })?.actionId).toBe('ports.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', { ...context, textInputFocused: true, activeInputRole: 'port-group-search', portPane: 'groups' })?.actionId).toBe('ports.pane.togglePrev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, tab: 'favorites' })?.actionId).toBe('favorites.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', { ...context, tab: 'favorites' })?.actionId).toBe('favorites.pane.togglePrev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, tab: 'favorites', textInputFocused: true, activeInputRole: 'favorite-search' })?.actionId).toBe('favorites.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...context, tab: 'favorites', textInputFocused: true, activeInputRole: 'favorite-group-search' })?.actionId).toBe('favorites.pane.toggleNext')
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', editorContext)?.actionId).toBe('ports.group.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', editorContext)?.actionId).toBe('ports.group.edit.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', editorContext)?.actionId).toBe('ports.group.edit.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', editorContext)?.actionId).toBe('ports.group.edit.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', editorContext)).toBeNull()
  })

  it('adds Ctrl+Enter as the save shortcut for editable command layers', () => {
    const favoriteEditorContext = {
      tab: 'favorites' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'favorite-editor' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', favoriteEditorContext)?.actionId).toBe('favorites.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', favoriteEditorContext)?.actionId).toBe('favorites.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', favoriteEditorContext)?.actionId).toBe('favorites.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', favoriteEditorContext)?.actionId).toBe('favorites.edit.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', favoriteEditorContext)?.actionId).toBe('favorites.edit.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', favoriteEditorContext)).toBeNull()
    expect(buildShortcutCommandRows(DEFAULT_KEYBINDINGS).find((row) => row.commandId === 'favorites.save')?.defaultShortcutIds).toEqual(['Ctrl+S', 'Ctrl+Enter'])
  })

  it('prioritizes favorite pick-review shortcuts over the base favorites workbench', () => {
    const reviewContext = {
      tab: 'favorites' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'favorite-pick-review' as const,
      favoritePickReviewOpen: true
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', reviewContext)?.actionId).toBe('favorites.pickReview.commit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', reviewContext)?.actionId).toBe('favorites.pickReview.commit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', reviewContext)?.actionId).toBe('favorites.pickReview.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', reviewContext)?.actionId).toBe('favorites.pickReview.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', reviewContext)?.actionId).toBe('favorites.pickReview.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', reviewContext)?.actionId).toBe('favorites.pickReview.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', reviewContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', reviewContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', reviewContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', reviewContext)).toBeNull()
    expect(buildShortcutCommandRows(DEFAULT_KEYBINDINGS).find((row) => row.commandId === 'favorites.pickReview.commit')?.defaultShortcutIds).toEqual(['Ctrl+S', 'Ctrl+Enter'])
  })

  it('maps favorites file-management workbench shortcuts', () => {
    const itemContext = {
      tab: 'favorites' as const,
      confirmOpen: false,
      textInputFocused: false,
      favoritePane: 'items' as const
    }
    const groupContext = {
      ...itemContext,
      favoritePane: 'containers' as const
    }
    const directoryContext = {
      ...itemContext,
      favoritePane: 'directory' as const,
      activeInputRole: 'favorite-directory' as const
    }
    const searchContext = {
      ...itemContext,
      textInputFocused: true,
      activeInputRole: 'favorite-search' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', itemContext)?.actionId).toBe('favorites.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', itemContext)?.actionId).toBe('favorites.groupSearch.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', itemContext)?.actionId).toBe('favorites.target.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+O', itemContext)?.actionId).toBe('favorites.pick.files')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+O', itemContext)?.actionId).toBe('favorites.pick.folders')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', searchContext)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', searchContext)?.actionId).toBe('favorites.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+C', searchContext)?.actionId).toBe('favorites.copyPath')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', searchContext)?.actionId).toBe('favorites.target.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', itemContext)?.actionId).toBe('favorites.reveal')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', itemContext)?.actionId).toBe('favorites.remove')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', itemContext)?.actionId).toBe('favorites.remove.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', groupContext)?.actionId).toBe('favorites.group.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', groupContext)?.actionId).toBe('favorites.group.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+C', itemContext)?.actionId).toBe('favorites.copyItems')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+R', itemContext)?.actionId).toBe('favorites.refresh')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+W', itemContext)?.actionId).toBe('favorites.containers.togglePanel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Z', { ...itemContext, favoriteUndoAvailable: true })?.actionId).toBe('favorites.remove.undo')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Z', itemContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', groupContext)?.actionId).toBe('favorites.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', groupContext)?.actionId).toBe('favorites.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', groupContext)?.actionId).toBe('favorites.group.moveParent')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', itemContext)?.actionId).toBe('favorites.group.moveParent')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', directoryContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', directoryContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', directoryContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', directoryContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', groupContext)?.actionId).toBe('favorites.group.collapse')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', groupContext)?.actionId).toBe('favorites.group.expand')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', { ...itemContext, favoriteQuickMode: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+O', { ...itemContext, favoriteQuickMode: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+O', { ...itemContext, favoriteQuickMode: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', { ...itemContext, favoriteQuickMode: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', { ...itemContext, favoriteQuickMode: true })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...searchContext, favoriteQuickMode: true })).toBeNull()
  })

  it('maps MQTT workbench shortcuts and edit-layer ownership', () => {
    const idleContext = {
      tab: 'mqtt' as const,
      confirmOpen: false,
      textInputFocused: false,
      mqttPane: 'messages' as const,
      mqttPanelOpen: true
    }
    const connectionContext = {
      ...idleContext,
      mqttPane: 'connections' as const
    }
    const connectionRoleContext = {
      ...connectionContext,
      activeInputRole: 'mqtt-connections' as const
    }
    const connectionGroupContext = {
      ...connectionContext,
      mqttTargetKind: 'connection-group' as const
    }
    const connectionGroupRoleContext = {
      ...connectionGroupContext,
      activeInputRole: 'mqtt-connections' as const
    }
    const connectionSearchContext = {
      ...connectionGroupContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-search' as const
    }
    const searchContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-search' as const
    }
    const publishEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-publish-editor' as const
    }
    const topicFilterContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-topic-filter' as const
    }
    const publishOptionsContext = {
      ...idleContext,
      textInputFocused: false,
      activeInputRole: 'mqtt-publish-options' as const
    }
    const publishHistoryContext = {
      ...idleContext,
      textInputFocused: false,
      activeInputRole: 'mqtt-publish-draft' as const
    }
    const publishHistoryEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-publish-draft-editor' as const
    }
    const editorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-editor' as const
    }
    const groupEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-connection-group-editor' as const
    }
    const subscriptionContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-subscriptions' as const
    }
    const subscriptionEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-subscription-editor' as const
    }
    const configSubscriptionEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-config-subscription-editor' as const
    }
    const configPublishEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-config-publish-editor' as const
    }
    const favoriteEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-favorite-editor' as const
    }
    const drawerContext = {
      ...idleContext,
      mqttDrawerOpen: true,
      mqttDrawerActive: true
    }
    const previewContext = {
      ...idleContext,
      mqttPreviewOpen: true
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+R', idleContext)?.actionId).toBe('mqtt.connection.connect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+R', idleContext)?.actionId).toBe('mqtt.connection.disconnect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', idleContext)?.actionId).toBe('mqtt.config.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', idleContext)?.actionId).toBe('mqtt.connectionGroup.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', { ...idleContext, mqttPanelOpen: false })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', { ...idleContext, mqttPanelOpen: false })).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', idleContext)?.actionId).toBe('mqtt.subscription.add')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', { ...idleContext, mqttPane: 'messages' as const })?.actionId).toBe('mqtt.pane.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', { ...idleContext, mqttPane: 'subscriptions' as const })?.actionId).toBe('mqtt.pane.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', subscriptionContext)?.actionId).toBe('mqtt.subscription.toggleSelect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', subscriptionContext)?.actionId).toBe('mqtt.subscription.applyFilter')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', subscriptionContext)?.actionId).toBe('mqtt.subscription.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', { ...subscriptionContext, mqttPane: 'subscriptions' as const })?.actionId).toBe('mqtt.subscription.editor.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', subscriptionContext)?.actionId).toBe('mqtt.subscription.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', subscriptionContext)?.actionId).toBe('mqtt.subscription.deleteSelected')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', idleContext)?.actionId).toBe('mqtt.publish.send')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', idleContext)?.actionId).toBe('mqtt.record.resendDraft')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', idleContext)?.actionId).toBe('mqtt.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+W', idleContext)?.actionId).toBe('mqtt.panel.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+T', idleContext)?.actionId).toBe('mqtt.subscription.panel.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+S', idleContext)?.actionId).toBe('mqtt.layout.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+H', idleContext)?.actionId).toBe('mqtt.publish.draft.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+H', idleContext)?.actionId).toBe('mqtt.publish.draft.saveDraft')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', idleContext)?.actionId).toBe('mqtt.receive.filter.all')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', idleContext)?.actionId).toBe('mqtt.receive.filter.in')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+3', idleContext)?.actionId).toBe('mqtt.receive.filter.out')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', idleContext)?.actionId).toBe('mqtt.topicFilter.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+D', idleContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', idleContext)?.actionId).toBe('mqtt.record.favorite')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+C', idleContext)?.actionId).toBe('mqtt.record.copyPayload')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+C', idleContext)?.actionId).toBe('mqtt.record.copyTopic')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+I', idleContext)?.actionId).toBe('mqtt.preview.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+L', idleContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+L', idleContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+M', idleContext)?.actionId).toBe('mqtt.focus.templates')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+M', idleContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+P', idleContext)?.actionId).toBe('mqtt.focus.publish')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', idleContext)?.actionId).toBe('mqtt.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', idleContext)?.actionId).toBe('mqtt.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', { ...idleContext, mqttDetailOpen: true, mqttDetailActive: true })?.actionId).toBe('mqtt.detail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', { ...idleContext, mqttDrawerOpen: true, mqttDrawerActive: true })?.actionId).toBe('mqtt.drawer.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', searchContext)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', searchContext)?.actionId).toBe('mqtt.receive.filter.all')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', searchContext)?.actionId).toBe('mqtt.receive.filter.in')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+3', searchContext)?.actionId).toBe('mqtt.receive.filter.out')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', searchContext)?.actionId).toBe('mqtt.topicFilter.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', searchContext)?.actionId).toBe('mqtt.publish.send')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', searchContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', searchContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', searchContext)?.actionId).toBe('mqtt.record.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', searchContext)?.actionId).toBe('mqtt.record.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', publishEditorContext)?.actionId).toBe('mqtt.publish.send')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', publishEditorContext)?.actionId).toBe('mqtt.publish.template.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', publishEditorContext)?.actionId).toBe('mqtt.receive.filter.all')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+2', publishEditorContext)?.actionId).toBe('mqtt.receive.filter.in')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+3', publishEditorContext)?.actionId).toBe('mqtt.receive.filter.out')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', publishEditorContext)?.actionId).toBe('mqtt.topicFilter.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+M', publishEditorContext)?.actionId).toBe('mqtt.focus.templates')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+M', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+H', publishEditorContext)?.actionId).toBe('mqtt.publish.draft.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+H', publishEditorContext)?.actionId).toBe('mqtt.publish.draft.saveDraft')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+L', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+L', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+R', publishEditorContext)?.actionId).toBe('mqtt.connection.connect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+R', publishEditorContext)?.actionId).toBe('mqtt.connection.disconnect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+W', publishEditorContext)?.actionId).toBe('mqtt.panel.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+T', publishEditorContext)?.actionId).toBe('mqtt.subscription.panel.toggle')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', publishEditorContext)?.actionId).toBe('mqtt.publish.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', publishEditorContext)?.actionId).toBe('mqtt.publish.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', publishEditorContext)?.actionId).toBe('mqtt.publish.blur')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', publishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', topicFilterContext)?.actionId).toBe('mqtt.topicFilter.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', topicFilterContext)?.actionId).toBe('mqtt.topicFilter.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', topicFilterContext)?.actionId).toBe('mqtt.topicFilter.select')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', topicFilterContext)?.actionId).toBe('mqtt.topicFilter.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+P', topicFilterContext)?.actionId).toBe('mqtt.focus.publish')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', publishOptionsContext)?.actionId).toBe('mqtt.publish.options.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', publishOptionsContext)?.actionId).toBe('mqtt.publish.options.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', publishOptionsContext)?.actionId).toBe('mqtt.publish.options.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', publishOptionsContext)?.actionId).toBe('mqtt.publish.options.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', publishOptionsContext)?.actionId).toBe('mqtt.publish.options.select')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', publishOptionsContext)?.actionId).toBe('mqtt.publish.options.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.apply')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.send')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.toggleSelect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', publishHistoryContext)?.actionId).toBe('mqtt.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', publishHistoryContext)?.actionId).toBe('mqtt.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.favorite')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', publishHistoryContext)?.actionId).toBe('mqtt.publish.draft.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', publishHistoryEditorContext)?.actionId).toBe('mqtt.publish.draft.edit.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', publishHistoryEditorContext)?.actionId).toBe('mqtt.publish.draft.edit.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', publishHistoryEditorContext)?.actionId).toBe('mqtt.publish.draft.edit.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', publishHistoryEditorContext)?.actionId).toBe('mqtt.publish.draft.edit.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', publishHistoryEditorContext)?.actionId).toBe('mqtt.publish.draft.edit.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', publishHistoryEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', publishHistoryEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', publishHistoryEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', publishHistoryEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', publishHistoryEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', idleContext)?.actionId).toBe('mqtt.record.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', idleContext)?.actionId).toBe('mqtt.record.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', connectionContext)?.actionId).toBe('mqtt.config.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', connectionContext)?.actionId).toBe('mqtt.config.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', connectionContext)?.actionId).toBe('mqtt.connectionGroup.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+G', connectionContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', connectionGroupContext)?.actionId).toBe('mqtt.connectionGroup.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', connectionGroupContext)?.actionId).toBe('mqtt.connectionGroup.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', connectionGroupContext)?.actionId).toBe('mqtt.connectionGroup.moveParent')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', connectionRoleContext)?.actionId).toBe('mqtt.connection.toggleSelect')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+C', connectionRoleContext)?.actionId).toBe('mqtt.connection.copyAddress')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', connectionRoleContext)?.actionId).toBe('mqtt.connection.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', connectionRoleContext)?.actionId).toBe('mqtt.connection.deleteSelected')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', connectionRoleContext)?.actionId).toBe('mqtt.connectionGroup.collapse')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', connectionRoleContext)?.actionId).toBe('mqtt.connectionGroup.expand')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', connectionGroupRoleContext)?.actionId).toBe('mqtt.connectionGroup.moveParent')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', connectionRoleContext)?.actionId).toBe('mqtt.connectionGroup.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', connectionRoleContext)?.actionId).toBe('mqtt.config.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+G', connectionRoleContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', connectionRoleContext)?.actionId).toBe('mqtt.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', connectionRoleContext)?.actionId).toBe('mqtt.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', connectionSearchContext)?.actionId).toBe('mqtt.connectionGroup.moveParent')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', connectionSearchContext)?.actionId).toBe('mqtt.connectionGroup.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', connectionSearchContext)?.actionId).toBe('mqtt.config.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Alt+G', connectionSearchContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', idleContext)?.actionId).toBe('mqtt.record.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', editorContext)?.actionId).toBe('mqtt.config.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', editorContext)?.actionId).toBe('mqtt.config.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', editorContext)?.actionId).toBe('mqtt.config.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', editorContext)?.actionId).toBe('mqtt.config.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', editorContext)?.actionId).toBe('mqtt.config.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', groupEditorContext)?.actionId).toBe('mqtt.connectionGroup.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', groupEditorContext)?.actionId).toBe('mqtt.connectionGroup.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', groupEditorContext)?.actionId).toBe('mqtt.connectionGroup.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', groupEditorContext)?.actionId).toBe('mqtt.connectionGroup.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', groupEditorContext)?.actionId).toBe('mqtt.connectionGroup.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+N', groupEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.nextRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.prevRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.deleteRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', subscriptionEditorContext)?.actionId).toBe('mqtt.subscription.editor.deleteRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+L', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', subscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.subscription.nextRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.subscription.prevRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.subscription.deleteRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', configSubscriptionEditorContext)?.actionId).toBe('mqtt.config.subscription.deleteRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', configSubscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', configSubscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', configSubscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', configSubscriptionEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', configPublishEditorContext)?.actionId).toBe('mqtt.config.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', configPublishEditorContext)?.actionId).toBe('mqtt.config.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', configPublishEditorContext)?.actionId).toBe('mqtt.config.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', configPublishEditorContext)?.actionId).toBe('mqtt.config.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', configPublishEditorContext)?.actionId).toBe('mqtt.config.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', configPublishEditorContext)?.actionId).toBe('mqtt.config.publish.nextRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', configPublishEditorContext)?.actionId).toBe('mqtt.config.publish.prevRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', configPublishEditorContext)?.actionId).toBe('mqtt.config.publish.deleteRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', configPublishEditorContext)?.actionId).toBe('mqtt.config.publish.deleteRow')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', configPublishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', configPublishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', configPublishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', configPublishEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+I', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+C', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', editorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+I', searchContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+C', searchContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', favoriteEditorContext)?.actionId).toBe('mqtt.record.favorite.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', favoriteEditorContext)?.actionId).toBe('mqtt.record.favorite.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', favoriteEditorContext)?.actionId).toBe('mqtt.record.favorite.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', favoriteEditorContext)?.actionId).toBe('mqtt.record.favorite.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', favoriteEditorContext)?.actionId).toBe('mqtt.record.favorite.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+C', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', favoriteEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', favoriteEditorContext)).toBeNull()
    const recordEditorContext = {
      ...idleContext,
      textInputFocused: true,
      activeInputRole: 'mqtt-record-editor' as const
    }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+S', recordEditorContext)?.actionId).toBe('mqtt.record.edit.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Enter', recordEditorContext)?.actionId).toBe('mqtt.record.edit.save')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', recordEditorContext)?.actionId).toBe('mqtt.record.edit.cancel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', recordEditorContext)?.actionId).toBe('mqtt.record.edit.nextField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Tab', recordEditorContext)?.actionId).toBe('mqtt.record.edit.prevField')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', recordEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', recordEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', recordEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', recordEditorContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', searchContext)?.actionId).toBe('mqtt.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', searchContext)?.actionId).toBe('mqtt.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', drawerContext)?.actionId).toBe('mqtt.drawer.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+J', drawerContext)?.actionId).toBe('mqtt.drawer.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', drawerContext)?.actionId).toBe('mqtt.drawer.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+K', drawerContext)?.actionId).toBe('mqtt.drawer.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', drawerContext)?.actionId).toBe('mqtt.drawer.select')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', drawerContext)?.actionId).toBe('mqtt.drawer.select.1')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+9', drawerContext)?.actionId).toBe('mqtt.drawer.select.9')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', previewContext)?.actionId).toBe('mqtt.preview.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowUp', previewContext)?.actionId).toBe('mqtt.preview.scroll.up')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowDown', previewContext)?.actionId).toBe('mqtt.preview.scroll.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', previewContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', previewContext)).toBeNull()

    const rows = buildShortcutCommandRows(DEFAULT_KEYBINDINGS)
    expect(rows.find((row) => row.commandId === 'mqtt.connection.connect')?.defaultShortcutIds).toEqual(['Ctrl+R'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.send')?.profileId).toBe('mqtt')
    expect(rows.find((row) => row.commandId === 'mqtt.layout.toggle')?.profileId).toBe('mqtt')
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.toggle')?.defaultShortcutIds).toEqual(['Ctrl+H'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.saveDraft')?.defaultShortcutIds).toEqual(['Ctrl+Shift+H'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.send')?.defaultShortcutIds).toEqual(['Ctrl+Enter'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.toggleSelect')?.defaultShortcutIds).toEqual(['Space'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.rename')?.defaultShortcutIds).toEqual(['F2'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.edit')?.defaultShortcutIds).toEqual(['Shift+F2'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.edit.save')?.defaultShortcutIds).toEqual(['Ctrl+S', 'Ctrl+Enter'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.edit.nextField')?.defaultShortcutIds).toEqual(['Tab'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.draft.delete')?.defaultShortcutIds).toEqual(['Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace'])
    expect(rows.find((row) => row.commandId === 'mqtt.pane.next')?.defaultShortcutIds).toEqual(['Tab'])
    expect(rows.find((row) => row.commandId === 'mqtt.record.favorite')?.defaultShortcutIds).toEqual(['Ctrl+S'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.template.save')?.defaultShortcutIds).toEqual(['Ctrl+S'])
    expect(rows.find((row) => row.commandId === 'mqtt.topicFilter.focus')?.defaultShortcutIds).toEqual(['Ctrl+Shift+F'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.options.open')?.defaultShortcutIds).toEqual([])
    expect(rows.find((row) => row.commandId === 'mqtt.record.favorite.save')?.defaultShortcutIds).toEqual(['Ctrl+S', 'Ctrl+Enter'])
    expect(rows.find((row) => row.commandId === 'mqtt.record.copyPayload')?.defaultShortcutIds).toEqual(['Ctrl+C'])
    expect(rows.find((row) => row.commandId === 'mqtt.preview.open')?.defaultShortcutIds).toEqual(['Ctrl+I'])
    expect(rows.find((row) => row.commandId === 'mqtt.focus.messages')?.defaultShortcutIds).toEqual([])
    expect(rows.find((row) => row.commandId === 'mqtt.focus.templates')?.defaultShortcutIds).toEqual(['Ctrl+M'])
    expect(rows.find((row) => row.commandId === 'mqtt.publish.records.toggle')?.defaultShortcutIds).toEqual([])
    expect(rows.find((row) => row.commandId === 'mqtt.focus.publish')?.defaultShortcutIds).toEqual(['Ctrl+P'])
    expect(rows.find((row) => row.commandId === 'mqtt.record.rename')?.defaultShortcutIds).toEqual(['F2'])
    expect(rows.find((row) => row.commandId === 'mqtt.record.edit')?.defaultShortcutIds).toEqual(['Shift+F2'])
    expect(rows.find((row) => row.commandId === 'mqtt.layout.toggle')?.defaultShortcutIds).toEqual(['Ctrl+Shift+S'])
    expect(rows.find((row) => row.commandId === 'mqtt.preview.scroll.up')?.defaultShortcutIds).toEqual(['Shift+ArrowUp'])
    expect(rows.find((row) => row.commandId === 'mqtt.preview.scroll.down')?.defaultShortcutIds).toEqual(['Shift+ArrowDown'])
    expect(rows.find((row) => row.commandId === 'mqtt.subscription.toggleSelect')?.defaultShortcutIds).toEqual(['Space'])
    expect(rows.find((row) => row.commandId === 'mqtt.subscription.applyFilter')?.defaultShortcutIds).toEqual(['Enter'])
    expect(rows.find((row) => row.commandId === 'mqtt.connection.toggleSelect')?.defaultShortcutIds).toEqual(['Space'])
    expect(rows.find((row) => row.commandId === 'mqtt.connection.copyAddress')?.defaultShortcutIds).toEqual(['Ctrl+C'])
    expect(rows.find((row) => row.commandId === 'mqtt.subscription.copyTopic')?.defaultShortcutIds).toEqual(['Ctrl+C'])
    expect(rows.find((row) => row.commandId === 'mqtt.subscription.editor.save')?.defaultShortcutIds).toEqual(['Ctrl+S', 'Ctrl+Enter'])
    expect(rows.find((row) => row.commandId === 'mqtt.subscription.editor.nextRow')?.defaultShortcutIds).toEqual(['ArrowDown'])
    expect(rows.find((row) => row.commandId === 'mqtt.subscription.editor.deleteRow')?.defaultShortcutIds).toEqual(['Ctrl+Delete', 'Ctrl+Backspace'])
    expect(rows.find((row) => row.commandId === 'mqtt.config.subscription.nextRow')?.defaultShortcutIds).toEqual(['ArrowDown'])
    expect(rows.find((row) => row.commandId === 'mqtt.config.subscription.deleteRow')?.defaultShortcutIds).toEqual(['Ctrl+Delete', 'Ctrl+Backspace'])
    expect(rows.find((row) => row.commandId === 'mqtt.config.publish.nextRow')?.defaultShortcutIds).toEqual(['ArrowDown'])
    expect(rows.find((row) => row.commandId === 'mqtt.config.publish.deleteRow')?.defaultShortcutIds).toEqual(['Ctrl+Delete', 'Ctrl+Backspace'])
  })

  it('prioritizes favorite drawer shortcuts over favorite workbench shortcuts', () => {
    const itemContext = {
      tab: 'favorites' as const,
      confirmOpen: false,
      textInputFocused: false,
      favoritePane: 'items' as const
    }
    const drawerContext = {
      ...itemContext,
      favoriteDrawerOpen: true,
      favoriteDrawerActive: true
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', itemContext)?.actionId).toBe('favorites.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', itemContext)?.actionId).toBe('favorites.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', drawerContext)?.actionId).toBe('favorites.drawer.next')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', drawerContext)?.actionId).toBe('favorites.drawer.prev')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', drawerContext)?.actionId).toBe('favorites.drawer.select')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', drawerContext)?.actionId).toBe('favorites.drawer.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', drawerContext)?.actionId).toBe('favorites.drawer.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', drawerContext)?.actionId).toBe('favorites.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+1', drawerContext)?.actionId).toBe('favorites.drawer.select.1')

    const detailContext = {
      ...itemContext,
      favoriteDetailOpen: true,
      favoriteDetailActive: true
    }
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', detailContext)?.actionId).toBe('favorites.detail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', detailContext)?.actionId).toBe('favorites.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', { ...itemContext, favoriteQuickMode: true })?.actionId).toBe('favorites.drawer.open')
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+G', { ...context, portSelectionMode: true })?.actionId).toBe('ports.group.createFromSelection')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', context)?.actionId).toBe('ports.groupSearch.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', context)?.actionId).toBe('ports.detail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', context)?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Tab', context)?.actionId).toBe('ports.pane.toggleNext')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', context)?.actionId).toBe('ports.kill.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', context)?.actionId).toBe('ports.kill.force')
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+Enter', context)?.actionId).toBe('ports.group.kill.confirm')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F', context)?.actionId).toBe('ports.search.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+F', context)?.actionId).toBe('ports.groupSearch.focus')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Space', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'F2', context)?.actionId).toBe('ports.group.edit')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', context)?.actionId).toBe('ports.group.moveFolder')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+F2', context)?.actionId).toBe('ports.group.rename')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)?.actionId).toBe('ports.group.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', context)?.actionId).toBe('ports.group.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', context)?.actionId).toBe('ports.group.delete.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', context)?.actionId).toBe('ports.group.delete.force')
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
    expect(formatShortcutLabel('Ctrl+G')).toBe('c-g')
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
      mqtt: { keybindingOverrides: [], updatedAt: 1 },
      favorites: { keybindingOverrides: [{ commandId: 'favorites.open', shortcutIds: ['Ctrl+O'], enabled: true }], updatedAt: 1 },
      codex: { keybindingOverrides: [], updatedAt: 1 },
      settings: { keybindingOverrides: [], updatedAt: 1 }
    })

    expect(resolveKeybinding(effective, 'Ctrl+P', { tab: 'ports' })?.actionId).toBe('search.focus')
    expect(resolveKeybinding(effective, 'Alt+R', { tab: 'ports' })?.actionId).toBe('ports.scan')
    expect(resolveKeybinding(effective, 'Ctrl+O', { tab: 'favorites', favoritePane: 'items' })?.actionId).toBe('favorites.open')
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

  it('uses Ctrl+Left for port detail and switches panel sides atomically', () => {
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', { ...context, portDetailOpen: true, portDetailActive: true })?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', { ...context, portDrawerOpen: true, portDrawerActive: true })?.actionId).toBe('ports.detail.open')
  })

  it('uses Ctrl+Shift+W to toggle the group panel and reuses Ctrl+Left/Right for group drawers', () => {
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
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+W', groupContext)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Shift+W', groupContext)?.actionId).toBe('ports.groups.togglePanel')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+F2', groupContext)?.actionId).toBe('ports.group.moveFolder')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowLeft', groupContext)?.actionId).toBe('ports.groupDetail.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', groupContext)?.actionId).toBe('ports.drawer.open')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', { ...groupContext, portGroupDetailOpen: true, portGroupDetailActive: true })?.actionId).toBe('ports.groupDetail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', { ...groupContext, portGroupDetailOpen: true, portGroupDetailActive: true })?.actionId).toBe('ports.groupDetail.close')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+ArrowRight', { ...groupContext, portGroupDetailOpen: true, portGroupDetailActive: true })?.actionId).toBe('ports.drawer.open')
    expect(buildShortcutCommandRows(DEFAULT_KEYBINDINGS).find((row) => row.commandId === 'ports.group.save')?.defaultShortcutIds).toEqual(['Ctrl+S', 'Ctrl+Enter'])
  })

  it('keeps default shortcuts in a command-keyed json map', () => {
    const rows = buildShortcutCommandRows(DEFAULT_KEYBINDINGS)
    expect(DEFAULT_SHORTCUTS_BY_COMMAND['ports.groups.togglePanel']).toEqual(['Ctrl+Shift+W'])
    expect(DEFAULT_SHORTCUTS_BY_COMMAND['ports.groupTarget.toggle']).toEqual([])
    expect(DEFAULT_SHORTCUTS_BY_COMMAND['ports.drawer.select.9']).toEqual(['Ctrl+9'])
    expect(DEFAULT_SHORTCUTS_BY_COMMAND['ports.drawer.action.9']).toEqual(['Ctrl+Alt+9'])
    for (const row of rows) {
      if (row.commandId.startsWith('tab.select.')) continue
      expect(DEFAULT_SHORTCUTS_BY_COMMAND[row.commandId]).toEqual(row.defaultShortcutIds)
    }
  })

  it('creates a port group folder through Ctrl+T from any port work area', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'results' as const,
      portDrawerOpen: false,
      portDrawerActive: false,
      portDetailOpen: false,
      portDetailActive: false,
      portGroupDetailOpen: false,
      portGroupDetailActive: false
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', context)?.actionId).toBe('ports.groupFolder.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...context, portPane: 'groups' })?.actionId).toBe('ports.groupFolder.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...context, textInputFocused: true, activeInputRole: 'port-search' })?.actionId).toBe('ports.groupFolder.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...context, textInputFocused: true, activeInputRole: 'port-group-search', portPane: 'groups' })?.actionId).toBe('ports.groupFolder.create')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+T', { ...context, tab: 'favorites' })?.actionId).toBe('favorites.group.create')
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

  it('maps group and folder deletion to confirmable and force shortcuts', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: false,
      portPane: 'groups' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)?.actionId).toBe('ports.group.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', context)?.actionId).toBe('ports.group.delete')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Delete', context)?.actionId).toBe('ports.group.delete.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Ctrl+Backspace', context)?.actionId).toBe('ports.group.delete.force')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', { ...context, confirmOpen: true })?.actionId).toBe('confirm.accept')
  })

  it('removes search history shortcuts and leaves arrows on lists', () => {
    const context = {
      tab: 'ports' as const,
      confirmOpen: false,
      textInputFocused: true,
      activeInputRole: 'port-search' as const,
      portPane: 'results' as const
    }

    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowDown', context)?.actionId).toBe('list.down')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowUp', context)?.actionId).toBe('list.up')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowDown', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Shift+ArrowUp', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Enter', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Escape', context)?.actionId).toBe('ports.search.blur')
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowLeft', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'ArrowRight', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Delete', context)).toBeNull()
    expect(resolveKeybinding(DEFAULT_KEYBINDINGS, 'Backspace', context)).toBeNull()
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
