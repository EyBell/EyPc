import type { AppTabId, FeatureConfig } from '../../domain/types'

export interface PluginEnterPayload {
  code?: string
}

export interface FeatureRoute {
  tab: AppTabId
  focusSearch: boolean
  favoriteQuick?: boolean
  actionId?: string
  hideAfterAction?: boolean
  settingsMaintenanceSection?: 'features'
}

function isFeatureEnabled(tab: AppTabId, configs?: FeatureConfig[]): boolean {
  if (tab === 'settings') return true
  if (!configs) return true
  return configs.find((config) => config.id === tab)?.enabled !== false
}

function enabledRoute(tab: AppTabId, focusSearch: boolean, configs?: FeatureConfig[]): FeatureRoute {
  return isFeatureEnabled(tab, configs)
    ? { tab, focusSearch }
    : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
}

function restoreCurrentRoute(currentTab: AppTabId | null | undefined, featureConfigs?: FeatureConfig[]): FeatureRoute {
  const tab = currentTab || 'ports'
  return enabledRoute(tab, false, featureConfigs)
}

export function routePluginFeature(payload: PluginEnterPayload | null | undefined, featureConfigs?: FeatureConfig[], currentTab?: AppTabId | null): FeatureRoute {
  switch (payload?.code) {
    case 'eypc-ports':
      return enabledRoute('ports', true, featureConfigs)
    case 'eypc-mqtt':
      return enabledRoute('mqtt', true, featureConfigs)
    case 'eypc-favorites':
      return enabledRoute('favorites', true, featureConfigs)
    case 'eypc-codex':
      return enabledRoute('codex', false, featureConfigs)
    case 'eypc-codex-toggle':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.float.toggle', hideAfterAction: true }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.float.toggle' }
    case 'eypc-codex-activate':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.float.activate', hideAfterAction: true }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.float.activate' }
    case 'eypc-codex-input':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.input.open', hideAfterAction: true }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.input.open' }
    case 'eypc-favorites-quick':
      return isFeatureEnabled('favorites', featureConfigs)
        ? { tab: 'favorites', focusSearch: false, favoriteQuick: true }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
    case 'eypc-settings':
      return { tab: 'settings', focusSearch: false }
    case 'eypc-main':
      return restoreCurrentRoute(currentTab, featureConfigs)
    default:
      return restoreCurrentRoute(currentTab, featureConfigs)
  }
}
