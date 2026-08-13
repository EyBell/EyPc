import { describe, expect, it } from 'vitest'
import { allFeatures, visibleFeatures } from '../../src/runtime/feature/featureRegistry'
import { routePluginFeature } from '../../src/runtime/feature/featureRouting'

describe('uTools feature routing', () => {
  it('keeps the default feature tab order with the disabled window workbench before Codex', () => {
    expect(allFeatures().map((feature) => ({ id: feature.id, enabled: feature.enabled }))).toEqual([
      { id: 'ports', enabled: true },
      { id: 'favorites', enabled: false },
      { id: 'mqtt', enabled: true },
      { id: 'windows', enabled: false },
      { id: 'codex', enabled: true },
      { id: 'settings', enabled: true }
    ])
  })

  it('routes plugin feature code to tab and search focus intent', () => {
    expect(routePluginFeature({ code: 'eypc-main' })).toEqual({ tab: 'ports', focusSearch: false })
    expect(routePluginFeature({ code: 'eypc-ports' })).toEqual({ tab: 'ports', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-mqtt' })).toEqual({ tab: 'mqtt', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites' })).toEqual({ tab: 'favorites', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites-quick' })).toEqual({ tab: 'favorites', focusSearch: true, favoriteQuick: true })
    for (let slot = 1; slot <= 10; slot += 1) {
      expect(routePluginFeature({ code: `eypc-favorite-slot-${slot}` }, undefined, 'mqtt')).toEqual({
        tab: 'mqtt',
        focusSearch: false,
        actionId: `favorites.slot.activate.${slot}`,
        preserveCurrentTab: true,
        visibilityOwner: 'mainHide'
      })
    }
    expect(routePluginFeature({ code: 'eypc-windows' })).toEqual({ tab: 'windows', focusSearch: true })
    for (let slot = 1; slot <= 10; slot += 1) {
      expect(routePluginFeature({ code: `eypc-window-slot-${slot}` }, undefined, 'mqtt')).toEqual({
        tab: 'mqtt',
        focusSearch: false,
        actionId: 'windows.slot.activate',
        actionArgs: { slot }
      })
    }
    expect(routePluginFeature({ code: 'eypc-codex' })).toEqual({ tab: 'codex', focusSearch: false })
    expect(routePluginFeature({ code: 'eypc-codex-toggle' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.float.toggle',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-codex-activate' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.float.activate',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-companion-quick' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.quick.activate',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-codex-input' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.input.open',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-codex-completed-unread' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.completed-unread.openFirst',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-codex-task-previous' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.task.previous',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-codex-task-next' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.task.next',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-companion-archive' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.task.archiveFocused',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    expect(routePluginFeature({ code: 'eypc-codex-action-runner' }, undefined, 'mqtt')).toEqual({
      tab: 'mqtt',
      focusSearch: false,
      actionId: 'codex.actionRunner.activate',
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    for (let slot = 1; slot <= 5; slot += 1) {
      expect(routePluginFeature({ code: `eypc-codex-action-${slot}` }, undefined, 'mqtt')).toEqual({
        tab: 'mqtt',
        focusSearch: false,
        actionId: `codex.action.run.${slot}`,
        preserveCurrentTab: true,
        visibilityOwner: 'mainHide'
      })
    }
    expect(routePluginFeature({ code: 'eypc-settings' })).toEqual({ tab: 'settings', focusSearch: false })
    expect(routePluginFeature({ code: 'unknown' })).toEqual({ tab: 'ports', focusSearch: false })
  })

  it('keeps the last concrete page route when entering through the main window', () => {
    const featureConfigs = [
      { id: 'ports' as const, enabled: true, sortOrder: 1 },
      { id: 'mqtt' as const, enabled: true, sortOrder: 2 },
      { id: 'favorites' as const, enabled: true, sortOrder: 3 },
      { id: 'settings' as const, enabled: true, sortOrder: 4 }
    ]

    expect(routePluginFeature({ code: 'eypc-main' }, featureConfigs, 'mqtt')).toEqual({ tab: 'mqtt', focusSearch: false })
    expect(routePluginFeature({ code: 'unknown' }, featureConfigs, 'favorites')).toEqual({ tab: 'favorites', focusSearch: false })
    expect(routePluginFeature(null, featureConfigs, 'settings')).toEqual({ tab: 'settings', focusSearch: false })
    expect(routePluginFeature({ code: 'eypc-main' }, [
      { id: 'ports' as const, enabled: true, sortOrder: 1 },
      { id: 'mqtt' as const, enabled: false, sortOrder: 2 },
      { id: 'settings' as const, enabled: true, sortOrder: 3 }
    ], 'mqtt')).toEqual({ tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' })
  })

  it('keeps tab shortcut numbers based on the visible feature order', () => {
    expect(visibleFeatures([
      { id: 'ports', title: '端口进程', description: '', enabled: false },
      { id: 'mqtt', title: 'MQTT', description: '' },
      { id: 'favorites', title: '文件收藏', description: '' },
      { id: 'settings', title: '设置', description: '' }
    ]).map((feature) => ({ id: feature.id, shortcutId: feature.shortcutId, commandId: feature.shortcutCommandId }))).toEqual([
      { id: 'mqtt', shortcutId: 'Ctrl+Shift+1', commandId: 'tab.select.mqtt' },
      { id: 'favorites', shortcutId: 'Ctrl+Shift+2', commandId: 'tab.select.favorites' },
      { id: 'settings', shortcutId: 'Ctrl+Alt+S', commandId: 'settings.open' }
    ])
  })

  it('routes disabled feature entries to settings feature maintenance', () => {
    const featureConfigs = [
      { id: 'ports' as const, enabled: true, sortOrder: 1 },
      { id: 'mqtt' as const, enabled: false, sortOrder: 2 },
      { id: 'favorites' as const, enabled: false, sortOrder: 3 },
      { id: 'windows' as const, enabled: false, sortOrder: 4 },
      { id: 'codex' as const, enabled: false, sortOrder: 5 },
      { id: 'settings' as const, enabled: true, sortOrder: 6 }
    ]

    expect(routePluginFeature({ code: 'eypc-mqtt' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features'
    })
    expect(routePluginFeature({ code: 'eypc-favorites' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features'
    })
    expect(routePluginFeature({ code: 'eypc-favorites-quick' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features'
    })
    expect(routePluginFeature({ code: 'eypc-favorite-slot-1' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features',
      actionId: 'favorites.slot.activate.1'
    })
    expect(routePluginFeature({ code: 'eypc-windows' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features'
    })
    expect(routePluginFeature({ code: 'eypc-window-slot-1' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features',
      actionId: 'windows.slot.activate',
      actionArgs: { slot: 1 }
    })
    expect(routePluginFeature({ code: 'eypc-codex-toggle' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features',
      actionId: 'codex.float.toggle'
    })
    expect(routePluginFeature({ code: 'eypc-codex-activate' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features',
      actionId: 'codex.float.activate'
    })
    expect(routePluginFeature({ code: 'eypc-companion-quick' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features',
      actionId: 'codex.quick.activate'
    })
    expect(routePluginFeature({ code: 'eypc-companion-archive' }, featureConfigs)).toEqual({
      tab: 'settings',
      focusSearch: false,
      settingsMaintenanceSection: 'features',
      actionId: 'codex.task.archiveFocused'
    })
  })
})
