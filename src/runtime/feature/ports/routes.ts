import type { FeatureRouteContributionV7 } from '../featureModule'
import { enabledRoute } from '../featureRouteHelpers'

export const PORTS_ROUTES: readonly FeatureRouteContributionV7[] = [
  {
    code: 'eypc-ports',
    toRoute: (_match, ctx) => enabledRoute('ports', true, ctx.configs)
  }
]
