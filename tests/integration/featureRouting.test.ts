import { describe, expect, it } from 'vitest'
import { visibleFeatures } from '../../src/runtime/feature/featureRegistry'
import { routePluginFeature } from '../../src/runtime/feature/featureRouting'

describe('uTools feature routing', () => {
  it('routes plugin feature code to tab and search focus intent', () => {
    expect(routePluginFeature({ code: 'eypc-main' })).toEqual({ tab: 'ports', focusSearch: false })
    expect(routePluginFeature({ code: 'eypc-ports' })).toEqual({ tab: 'ports', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites' })).toEqual({ tab: 'favorites', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites-quick' })).toEqual({ tab: 'favorites', focusSearch: true, favoriteQuick: true })
    expect(routePluginFeature({ code: 'eypc-settings' })).toEqual({ tab: 'settings', focusSearch: false })
    expect(routePluginFeature({ code: 'unknown' })).toEqual({ tab: 'ports', focusSearch: false })
  })

  it('keeps tab shortcut numbers based on the visible feature order', () => {
    expect(visibleFeatures([
      { id: 'ports', title: '端口进程', description: '', enabled: false },
      { id: 'favorites', title: '文件收藏', description: '' },
      { id: 'settings', title: '设置', description: '' }
    ]).map((feature) => ({ id: feature.id, shortcutId: feature.shortcutId, commandId: feature.shortcutCommandId }))).toEqual([
      { id: 'favorites', shortcutId: 'Ctrl+Shift+1', commandId: 'tab.select.favorites' },
      { id: 'settings', shortcutId: 'Ctrl+Alt+S', commandId: 'settings.open' }
    ])
  })

  it('routes disabled feature entries to settings feature maintenance', () => {
    const featureConfigs = [
      { id: 'ports' as const, enabled: true, sortOrder: 1 },
      { id: 'favorites' as const, enabled: false, sortOrder: 2 },
      { id: 'settings' as const, enabled: true, sortOrder: 3 }
    ]

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
