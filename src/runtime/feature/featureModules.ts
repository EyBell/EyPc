/** FeatureModuleV7 注册表：生命周期、命令、层、帮助 id，以及每 Tab 的 RuntimeSlice 工厂。 */
import type { AppTabId } from '../../domain/types'
import type { FeatureModuleV7 } from './featureModule'
import { FEATURES } from './featureRegistry'
import { buildCommandCatalogV7 } from '../keybinding/keybindingRuntime'
import { createRuntimeSliceV7 } from '../runtimeSlice'
import {
  selectCodexRuntimeSliceV7,
  selectFavoritesRuntimeSliceV7,
  selectMqttRuntimeSliceV7,
  selectPortsRuntimeSliceV7,
  selectSettingsRuntimeSliceV7,
  selectWindowsRuntimeSliceV7
} from './featureRuntimeSlices'

const lifecycleByFeature: Record<AppTabId, FeatureModuleV7['lifecycle']> = {
  ports: { backgroundPolicy: 'visible-only', startOnVisible: true, retainWhileHidden: true },
  mqtt: { backgroundPolicy: 'connected-only', startOnVisible: true, retainWhileHidden: true },
  favorites: { backgroundPolicy: 'on-demand', startOnVisible: true, retainWhileHidden: true },
  windows: { backgroundPolicy: 'visible-only', startOnVisible: true, retainWhileHidden: true },
  codex: { backgroundPolicy: 'entry-enabled', startOnVisible: false, retainWhileHidden: true },
  settings: { backgroundPolicy: 'on-demand', startOnVisible: true, retainWhileHidden: false }
}

const selectorsByFeature: Record<AppTabId, FeatureModuleV7['selectView']> = {
  ports: selectPortsRuntimeSliceV7,
  mqtt: selectMqttRuntimeSliceV7,
  favorites: selectFavoritesRuntimeSliceV7,
  windows: selectWindowsRuntimeSliceV7,
  codex: selectCodexRuntimeSliceV7,
  settings: selectSettingsRuntimeSliceV7
}

const menuKindsByFeature: Record<AppTabId, readonly string[]> = {
  ports: ['row', 'group', 'drawer'],
  mqtt: ['connection', 'subscription', 'record', 'drawer'],
  favorites: ['favorite', 'directory', 'drawer'],
  windows: ['window', 'multi-selection'],
  codex: ['task', 'project', 'drawer'],
  settings: ['command', 'feature']
}

const diagnosticDomainsByFeature: Record<AppTabId, readonly string[]> = {
  ports: ['ports.scan', 'ports.process'],
  mqtt: ['mqtt.connection', 'mqtt.storage'],
  favorites: ['favorites.open', 'favorites.runner'],
  windows: ['windows.discovery', 'windows.activation'],
  codex: ['companion.kernel', 'companion.provider', 'companion.float'],
  settings: ['runtime.settings', 'runtime.diagnostics']
}

const commandCatalog = buildCommandCatalogV7()

export const FEATURE_MODULES_V7: readonly FeatureModuleV7[] = Object.freeze(FEATURES.map((definition) => {
  const commands = commandCatalog.all().filter((command) => command.profileId === definition.id)
  const layers = [...new Set(commands.flatMap((command) => command.defaultBindings.map((binding) => binding.layer)))]
  const selectView = selectorsByFeature[definition.id]
  return Object.freeze({
    id: definition.id,
    definition,
    lifecycle: lifecycleByFeature[definition.id],
    commands: Object.freeze(commands),
    layers: Object.freeze(layers.length ? layers : [definition.id]),
    menuKinds: Object.freeze([...menuKindsByFeature[definition.id]]),
    helpGuideId: definition.id,
    diagnosticDomains: Object.freeze([...diagnosticDomainsByFeature[definition.id]]),
    selectView,
    createSlice(source: Parameters<FeatureModuleV7['createSlice']>[0]) {
      return createRuntimeSliceV7({
        id: `feature:${definition.id}`,
        readSource: source.readSnapshot,
        select: selectView,
        subscribeSource: (listener) => source.subscribeDomain(definition.id, listener)
      })
    }
  })
}))

const featureModuleById = new Map(FEATURE_MODULES_V7.map((module) => [module.id, module]))

export function featureModuleV7(id: AppTabId): FeatureModuleV7 {
  const module = featureModuleById.get(id)
  if (!module) throw new Error(`Unknown FeatureModuleV7: ${id}`)
  return module
}
