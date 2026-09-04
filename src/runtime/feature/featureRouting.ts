/** 把 uTools feature code（含 mainHide 槽位）映射成 Tab 或 Runtime Action，不在这里执行副作用。 */
import type { AppTabId, FeatureConfig } from '../../domain/types'
import { CODEX_ROUTES } from './codex/routes'
import { FAVORITES_ROUTES } from './favorites/routes'
import type { FeatureRouteContributionV7, FeatureRouteContextV7 } from './featureModule'
import type { FeatureRoute } from './featureRouteHelpers'
import { restoreCurrentRoute } from './featureRouteHelpers'
import { MQTT_ROUTES } from './mqtt/routes'
import { PORTS_ROUTES } from './ports/routes'
import { SETTINGS_ROUTES } from './settings/routes'
import { WINDOWS_ROUTES } from './windows/routes'

export type { FeatureRouteContextV7 } from './featureModule'
export { disabledOrCurrentRoute, enabledRoute, isFeatureEnabled, restoreCurrentRoute } from './featureRouteHelpers'
export type { FeatureRoute } from './featureRouteHelpers'

export interface PluginEnterPayload {
  code?: string
}

const FEATURE_ROUTES_V7: readonly FeatureRouteContributionV7[] = [
  ...FAVORITES_ROUTES,
  ...WINDOWS_ROUTES,
  ...PORTS_ROUTES,
  ...MQTT_ROUTES,
  ...CODEX_ROUTES,
  ...SETTINGS_ROUTES
]

export function claimedPluginFeatureCodes(routes: readonly FeatureRouteContributionV7[] = FEATURE_ROUTES_V7): string[] {
  const codes: string[] = []
  for (const route of routes) {
    if (route.code) codes.push(route.code)
  }
  return codes
}

export function routeClaimsPluginCode(code: string, routes: readonly FeatureRouteContributionV7[] = FEATURE_ROUTES_V7): boolean {
  for (const route of routes) {
    if (route.code && route.code === code) return true
    if (route.codePattern && route.codePattern.test(code)) return true
  }
  return false
}

function matchFeatureRoute(code: string, ctx: FeatureRouteContextV7): FeatureRoute | null {
  for (const route of FEATURE_ROUTES_V7) {
    if (route.code && route.code === code) {
      return route.toRoute({ code }, ctx)
    }
    if (route.codePattern) {
      const matched = route.codePattern.exec(code)
      if (matched) return route.toRoute({ code, groups: matched.slice(1) }, ctx)
    }
  }
  return null
}

export function routePluginFeature(payload: PluginEnterPayload | null | undefined, featureConfigs?: FeatureConfig[], currentTab?: AppTabId | null): FeatureRoute {
  const code = payload?.code || ''
  const ctx: FeatureRouteContextV7 = { configs: featureConfigs, currentTab }
  if (!code || code === 'eypc-main') return restoreCurrentRoute(currentTab, featureConfigs)
  return matchFeatureRoute(code, ctx) || restoreCurrentRoute(currentTab, featureConfigs)
}
