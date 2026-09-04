import { defineAsyncComponent } from 'vue'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { PortsRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const PortsPage = defineAsyncComponent(() => import('../../../pages/PortsPage.vue'))

export function bindPortsPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<PortsRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setPortSearch: (query: string) => void
    setPortGroupSearch: (query: string) => void
    scanPorts: () => unknown
    focusPort: (...args: never[]) => unknown
    togglePortSelection: (...args: never[]) => unknown
    focusPortGroup: (...args: never[]) => unknown
    focusPortGroupTarget: (...args: never[]) => unknown
    movePortGroupToFolder: (...args: never[]) => unknown
    updatePortGroupDraft: (...args: never[]) => unknown
    savePortGroupDraft: (...args: never[]) => unknown
    cancelPortGroupDraft: (...args: never[]) => unknown
  }
  return {
    page: PortsPage,
    props: {
      snapshot: input.slice.snapshot(),
      shiftPreview: input.shell.shiftPreview,
      showShortcutHints: input.shell.shortcutHints
    },
    on: {
      search: runtime.setPortSearch,
      'group-search': runtime.setPortGroupSearch,
      scan: runtime.scanPorts,
      focus: runtime.focusPort,
      toggle: runtime.togglePortSelection,
      'focus-group': runtime.focusPortGroup,
      'focus-group-target': runtime.focusPortGroupTarget,
      'move-group-to-folder': runtime.movePortGroupToFolder,
      'update-group-draft': runtime.updatePortGroupDraft,
      'save-group-draft': runtime.savePortGroupDraft,
      'cancel-group-draft': runtime.cancelPortGroupDraft,
      dispatch: runtime.dispatch
    }
  }
}
