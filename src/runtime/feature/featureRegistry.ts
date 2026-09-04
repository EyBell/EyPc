/** 六 Tab 的产品名、说明与默认开关；每个 id 必须有对应 src/help/guides/{id}.md。定义正文在各 FeatureModule，这里只派生。 */
import type { AppTabId, FeatureConfig } from '../../domain/types'
import { FEATURE_MODULES_V7 } from './featureModules'

export interface FeatureDefinition {
  id: AppTabId
  title: string
  description: string
  enabled?: boolean
}

export interface VisibleFeatureDefinition extends FeatureDefinition {
  shortcutId: string
  shortcutCommandId: string
}

/** Each entry requires a matching `src/help/guides/{id}.md` (EYPC-FEATURE-HELP-001). */
export const FEATURES: FeatureDefinition[] = FEATURE_MODULES_V7.map((module) => module.definition)

export const DEFAULT_FEATURE_CONFIGS: FeatureConfig[] = [
  { id: 'ports', enabled: true, sortOrder: 1 },
  { id: 'favorites', enabled: false, sortOrder: 2 },
  { id: 'mqtt', enabled: true, sortOrder: 3 },
  { id: 'windows', enabled: false, sortOrder: 4 },
  { id: 'codex', enabled: true, sortOrder: 5 },
  { id: 'settings', enabled: true, sortOrder: 6 }
]

const featureMeta = new Map(FEATURES.map((feature) => [feature.id, feature]))

function isFeatureConfig(value: FeatureDefinition | FeatureConfig): value is FeatureConfig {
  return typeof (value as FeatureConfig).sortOrder === 'number'
}

export function featureDefinitionFor(id: AppTabId): FeatureDefinition {
  return featureMeta.get(id) || { id, title: id, description: '' }
}

export function allFeatures(configs: FeatureConfig[] = DEFAULT_FEATURE_CONFIGS): FeatureDefinition[] {
  return configs
    .map((config) => ({ ...featureDefinitionFor(config.id), enabled: config.enabled, sortOrder: config.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...feature }) => feature)
}

export function visibleFeatures(features: Array<FeatureDefinition | FeatureConfig> = DEFAULT_FEATURE_CONFIGS): VisibleFeatureDefinition[] {
  let visibleShortcutIndex = 0
  const normalized = features
    .map((feature, index) => {
      if (!isFeatureConfig(feature)) return { ...feature, sortOrder: index + 1 }
      return { ...featureDefinitionFor(feature.id), enabled: feature.enabled, sortOrder: feature.sortOrder }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return normalized
    .filter((feature) => feature.enabled !== false)
    .map((feature) => {
      if (feature.id === 'settings') {
        return { ...feature, shortcutId: 'Ctrl+Alt+S', shortcutCommandId: 'settings.open' }
      }
      visibleShortcutIndex += 1
      return { ...feature, shortcutId: `Ctrl+Shift+${visibleShortcutIndex}`, shortcutCommandId: `tab.select.${feature.id}` }
    })
}
