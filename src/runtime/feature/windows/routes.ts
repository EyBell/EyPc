import type { FeatureRouteContributionV7 } from '../featureModule'
import { disabledOrCurrentRoute, enabledRoute, isFeatureEnabled } from '../featureRouteHelpers'

export const WINDOWS_ROUTES: readonly FeatureRouteContributionV7[] = [
  {
    codePattern: /^eypc-window-slot-([1-9]|10)$/,
    toRoute: (match, ctx) => {
      const slot = Number(match.groups?.[0])
      const extra = { actionId: 'windows.slot.activate', actionArgs: { slot } }
      return isFeatureEnabled('windows', ctx.configs)
        ? disabledOrCurrentRoute('windows', ctx.configs, ctx.currentTab, extra)
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', ...extra }
    }
  },
  {
    code: 'eypc-windows',
    toRoute: (_match, ctx) => enabledRoute('windows', true, ctx.configs)
  }
]
