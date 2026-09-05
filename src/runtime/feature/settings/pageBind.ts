import { defineAsyncComponent } from 'vue'
import type { AppState, FeatureConfig, ShortcutProfileMap } from '../../../domain/types'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { SettingsRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const SettingsPage = defineAsyncComponent(() => import('../../../pages/SettingsPage.vue'))

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' ? value : undefined
}

export function bindSettingsPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<SettingsRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    saveShortcutProfiles: (profiles: ShortcutProfileMap) => unknown
    saveFeatureConfigs: (configs: FeatureConfig[]) => unknown
    setSettingsPath: (tabId: AppState['settingsTabId'], sectionId: AppState['settingsMaintenanceSectionId']) => unknown
  }
  const dispatch = (actionId: string, args?: Record<string, unknown>) => {
    if (actionId === 'settings.path.set') {
      const tabId = stringArg(args, 'tabId')
      const sectionId = stringArg(args, 'sectionId')
      if (tabId === 'shortcuts' || tabId === 'maintenance') {
        if (sectionId) runtime.setSettingsPath(tabId, sectionId as AppState['settingsMaintenanceSectionId'])
      }
      return
    }
    if (actionId === 'settings.shortcutProfiles.save') {
      const profiles = args?.profiles
      if (profiles && typeof profiles === 'object') runtime.saveShortcutProfiles(profiles as ShortcutProfileMap)
      return
    }
    if (actionId === 'settings.featureConfigs.save') {
      const configs = args?.configs
      if (Array.isArray(configs)) runtime.saveFeatureConfigs(configs as FeatureConfig[])
      return
    }
    return runtime.dispatch(actionId, args)
  }
  const snapshot = input.slice.snapshot()
  return {
    page: SettingsPage,
    props: {
      overrides: snapshot.state.settings.keybindingOverrides,
      shortcutProfiles: snapshot.state.settings.shortcutProfiles,
      featureConfigs: snapshot.state.settings.featureConfigs,
      initialMaintenanceSection: input.shell.initialMaintenanceSection,
      persistedSettingsTabId: snapshot.state.settingsTabId,
      persistedMaintenanceSectionId: snapshot.state.settingsMaintenanceSectionId,
      settings: snapshot.state.settings,
      runtimeDiagnostics: snapshot.runtimeDiagnostics,
      mqttStorageStatus: snapshot.mqttStorageStatus,
      windowActivationDiagnostics: snapshot.windowActivationDiagnostics,
      windowOperationTraceEnabled: snapshot.windowOperationTraceEnabled,
      windowOperationTraces: snapshot.windowOperationTraces
    },
    on: {
      dispatch
    }
  }
}
