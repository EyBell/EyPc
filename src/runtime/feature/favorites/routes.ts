import type { FeatureRouteContributionV7 } from '../featureModule'
import { disabledOrCurrentRoute, enabledRoute, isFeatureEnabled } from '../featureRouteHelpers'

export const FAVORITES_ROUTES: readonly FeatureRouteContributionV7[] = [
  {
    codePattern: /^eypc-favorite-slot-([1-9]|10)$/,
    toRoute: (match, ctx) => {
      const slot = Number(match.groups?.[0])
      const actionId = `favorites.slot.activate.${slot}`
      return isFeatureEnabled('favorites', ctx.configs)
        ? disabledOrCurrentRoute('favorites', ctx.configs, ctx.currentTab, {
          actionId,
          preserveCurrentTab: true,
          visibilityOwner: 'mainHide'
        })
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId }
    }
  },
  {
    code: 'eypc-favorites',
    toRoute: (_match, ctx) => enabledRoute('favorites', true, ctx.configs)
  },
  {
    code: 'eypc-favorites-quick',
    toRoute: (_match, ctx) => isFeatureEnabled('favorites', ctx.configs)
      ? { tab: 'favorites', focusSearch: true, favoriteQuick: true }
      : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features' }
  }
]
