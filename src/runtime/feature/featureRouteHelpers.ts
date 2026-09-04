import type { AppTabId, FeatureConfig } from '../../domain/types'

export interface FeatureRoute {
  tab: AppTabId
  focusSearch: boolean
  favoriteQuick?: boolean
  actionId?: string
  actionArgs?: Record<string, unknown>
  hideAfterAction?: boolean
  preserveCurrentTab?: boolean
  visibilityOwner?: 'renderer' | 'mainHide'
  settingsMaintenanceSection?: 'features'
}

export function isFeatureEnabled(tab: AppTabId, configs?: FeatureConfig[], alwaysEnabled = false): boolean {
  if (alwaysEnabled || tab === 'settings') return true
  if (!configs) return true
  return configs.find((config) => config.id === tab)?.enabled !== false
}

export function enabledRoute(tab: AppTabId, focusSearch: boolean, configs?: FeatureConfig[]): FeatureRoute {
  return isFeatureEnabled(tab, configs)
    ? { tab, focusSearch }
    : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
}

export function restoreCurrentRoute(currentTab: AppTabId | null | undefined, featureConfigs?: FeatureConfig[]): FeatureRoute {
  const tab = currentTab || 'ports'
  return enabledRoute(tab, false, featureConfigs)
}

export function disabledOrCurrentRoute(
  tab: AppTabId,
  configs: FeatureConfig[] | undefined,
  currentTab: AppTabId | null | undefined,
  extra: Partial<FeatureRoute>
): FeatureRoute {
  if (isFeatureEnabled(tab, configs)) {
    return { ...restoreCurrentRoute(currentTab, configs), ...extra }
  }
  return { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', ...extra }
}
