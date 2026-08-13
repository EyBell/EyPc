import type { AppTabId, FeatureConfig } from '../../domain/types'

export interface PluginEnterPayload {
  code?: string
}

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
  const favoriteSlotMatch = /^eypc-favorite-slot-([1-9]|10)$/.exec(payload?.code || '')
  if (favoriteSlotMatch) {
    const slot = Number(favoriteSlotMatch[1])
    const actionId = `favorites.slot.activate.${slot}`
    return isFeatureEnabled('favorites', featureConfigs)
      ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId, preserveCurrentTab: true, visibilityOwner: 'mainHide' }
      : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId }
  }
  const slotMatch = /^eypc-window-slot-([1-9]|10)$/.exec(payload?.code || '')
  if (slotMatch) {
    const slot = Number(slotMatch[1])
    return isFeatureEnabled('windows', featureConfigs)
      ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'windows.slot.activate', actionArgs: { slot } }
      : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'windows.slot.activate', actionArgs: { slot } }
  }
  switch (payload?.code) {
    case 'eypc-ports':
      return enabledRoute('ports', true, featureConfigs)
    case 'eypc-mqtt':
      return enabledRoute('mqtt', true, featureConfigs)
    case 'eypc-favorites':
      return enabledRoute('favorites', true, featureConfigs)
    case 'eypc-windows':
      return enabledRoute('windows', true, featureConfigs)
    case 'eypc-codex':
      return enabledRoute('codex', false, featureConfigs)
    case 'eypc-codex-toggle':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.float.toggle', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.float.toggle' }
    case 'eypc-codex-activate':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.float.activate', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.float.activate' }
    case 'eypc-companion-quick':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.quick.activate', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.quick.activate' }
    case 'eypc-codex-input':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.input.open', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.input.open' }
    case 'eypc-codex-completed-unread':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.completed-unread.openFirst', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.completed-unread.openFirst' }
    case 'eypc-codex-task-previous':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.task.previous', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.task.previous' }
    case 'eypc-codex-task-next':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.task.next', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.task.next' }
    case 'eypc-companion-archive':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.task.archiveFocused', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.task.archiveFocused' }
    case 'eypc-codex-action-runner':
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId: 'codex.actionRunner.activate', preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId: 'codex.actionRunner.activate' }
    case 'eypc-codex-action-1':
    case 'eypc-codex-action-2':
    case 'eypc-codex-action-3':
    case 'eypc-codex-action-4':
    case 'eypc-codex-action-5': {
      const slot = Number(String(payload?.code || '').slice(-1))
      const actionId = `codex.action.run.${slot}`
      return isFeatureEnabled('codex', featureConfigs)
        ? { ...restoreCurrentRoute(currentTab, featureConfigs), actionId, preserveCurrentTab: true, visibilityOwner: 'mainHide' }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId }
    }
    case 'eypc-favorites-quick':
      return isFeatureEnabled('favorites', featureConfigs)
        ? { tab: 'favorites', focusSearch: true, favoriteQuick: true }
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
    case 'eypc-settings':
      return { tab: 'settings', focusSearch: false }
    case 'eypc-main':
      return restoreCurrentRoute(currentTab, featureConfigs)
    default:
      return restoreCurrentRoute(currentTab, featureConfigs)
  }
}
