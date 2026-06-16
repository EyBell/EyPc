import type { AppTabId } from '../../domain/types'

export interface PluginEnterPayload {
  code?: string
}

export interface FeatureRoute {
  tab: AppTabId
  focusSearch: boolean
}

export function routePluginFeature(payload: PluginEnterPayload | null | undefined): FeatureRoute {
  switch (payload?.code) {
    case 'eypc-ports':
      return { tab: 'ports', focusSearch: true }
    case 'eypc-favorites':
      return { tab: 'favorites', focusSearch: true }
    case 'eypc-settings':
      return { tab: 'settings', focusSearch: false }
    case 'eypc-main':
    default:
      return { tab: 'ports', focusSearch: false }
  }
}
