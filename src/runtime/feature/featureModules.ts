/** FeatureModuleV7 注册表：六个贡献包，Shell 只组装。 */
import type { AppTabId } from '../../domain/types'
import { FEATURE_MODULE_IDS } from '../../domain/types'
import type { FeatureModuleV7 } from './featureModule'
import { portsFeatureModuleV7 } from './ports/module'
import { mqttFeatureModuleV7 } from './mqtt/module'
import { favoritesFeatureModuleV7 } from './favorites/module'
import { windowsFeatureModuleV7 } from './windows/module'
import { codexFeatureModuleV7 } from './codex/module'
import { settingsFeatureModuleV7 } from './settings/module'

const modulesById = {
  ports: portsFeatureModuleV7,
  mqtt: mqttFeatureModuleV7,
  favorites: favoritesFeatureModuleV7,
  windows: windowsFeatureModuleV7,
  codex: codexFeatureModuleV7,
  settings: settingsFeatureModuleV7
} as const satisfies Record<AppTabId, FeatureModuleV7>

export const FEATURE_MODULES_V7: readonly FeatureModuleV7[] = Object.freeze(
  FEATURE_MODULE_IDS.map((id) => modulesById[id])
)

const featureModuleById = new Map(FEATURE_MODULES_V7.map((module) => [module.id, module]))

export function featureModuleV7(id: AppTabId): FeatureModuleV7 {
  const module = featureModuleById.get(id)
  if (!module) throw new Error(`Unknown FeatureModuleV7: ${id}`)
  return module
}
