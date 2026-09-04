import type { FeatureRouteContributionV7 } from '../featureModule'
import { enabledRoute } from '../featureRouteHelpers'

export const MQTT_ROUTES: readonly FeatureRouteContributionV7[] = [
  {
    code: 'eypc-mqtt',
    toRoute: (_match, ctx) => enabledRoute('mqtt', true, ctx.configs)
  }
]
