import { describe, expect, it } from 'vitest'
import { allFeatures, visibleFeatures } from '../../src/runtime/feature/featureRegistry'
import { routePluginFeature } from '../../src/runtime/feature/featureRouting'

describe('uTools feature routing', () => {
  it('keeps MQTT as the third default feature tab order', () => {
    expect(allFeatures().map((feature) => ({ id: feature.id, enabled: feature.enabled }))).toEqual([
      { id: 'ports', enabled: true },
      { id: 'favorites', enabled: false },
      { id: 'mqtt', enabled: true },
      { id: 'settings', enabled: true }
    ])
  })

  it('routes plugin feature code to tab and search focus intent', () => {
    expect(routePluginFeature({ code: 'eypc-main' })).toEqual({ tab: 'ports', focusSearch: false })
    expect(routePluginFeature({ code: 'eypc-ports' })).toEqual({ tab: 'ports', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-mqtt' })).toEqual({ tab: 'mqtt', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites' })).toEqual({ tab: 'favorites', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites-quick' })).toEqual({ tab: 'favorites', focusSearch: true, favoriteQuick: true })
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
      { id: 'settings' as const, enabled: true, sortOrder: 4 }
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
  })
})
