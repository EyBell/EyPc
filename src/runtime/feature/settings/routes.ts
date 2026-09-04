import type { FeatureRouteContributionV7 } from '../featureModule'

export const SETTINGS_ROUTES: readonly FeatureRouteContributionV7[] = [
  {
    code: 'eypc-settings',
    toRoute: () => ({ tab: 'settings', focusSearch: false })
  }
]
