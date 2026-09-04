import { defineAsyncComponent } from 'vue'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { SettingsRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const SettingsPage = defineAsyncComponent(() => import('../../../pages/SettingsPage.vue'))

export function bindSettingsPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<SettingsRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    updateKeybinding: (...args: never[]) => unknown
    resetKeybinding: (...args: never[]) => unknown
    saveShortcutProfiles: (...args: never[]) => unknown
    saveFeatureConfigs: (...args: never[]) => unknown
    setSettingsPath: (...args: never[]) => unknown
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
      'update-keybinding': runtime.updateKeybinding,
      'reset-keybinding': runtime.resetKeybinding,
      'save-shortcut-profiles': runtime.saveShortcutProfiles,
      'save-feature-configs': runtime.saveFeatureConfigs,
      'update-tool-preview-prefs': ((payload: Record<string, unknown>) => runtime.dispatch('tool.preview.hover.update', payload)) as (...args: never[]) => unknown,
      'update-settings-path': runtime.setSettingsPath,
      dispatch: runtime.dispatch
    }
  }
}
