import type { AppTabId, FeatureConfig } from '../../domain/types'

export interface PluginEnterPayload {
  code?: string
}

export interface FeatureRoute {
  tab: AppTabId
  focusSearch: boolean
  favoriteQuick?: boolean
  settingsMaintenanceSection?: 'features'
}

function isFeatureEnabled(tab: AppTabId, configs?: FeatureConfig[]): boolean {
  if (!configs) return true
  return configs.find((config) => config.id === tab)?.enabled !== false
}

function enabledRoute(tab: AppTabId, focusSearch: boolean, configs?: FeatureConfig[]): FeatureRoute {
  return isFeatureEnabled(tab, configs)
    ? { tab, focusSearch }
    : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
}

export function routePluginFeature(payload: PluginEnterPayload | null | undefined, featureConfigs?: FeatureConfig[]): FeatureRoute {
  switch (payload?.code) {
    case 'eypc-ports':
      return enabledRoute('ports', true, featureConfigs)
    case 'eypc-favorites':
      return enabledRoute('favorites', true, featureConfigs)
    case 'eypc-favorites-quick':
      return isFeatureEnabled('favorites', featureConfigs)
        ? { tab: 'favorites', focusSearch: true, favoriteQuick: true }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
    case 'eypc-settings':
      return { tab: 'settings', focusSearch: false }
    case 'eypc-main':
    default:
      return { tab: 'ports', focusSearch: false }
  }
}
