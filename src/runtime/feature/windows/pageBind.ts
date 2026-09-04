import { defineAsyncComponent } from 'vue'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { WindowsRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const WindowsPage = defineAsyncComponent(() => import('../../../pages/WindowsPage.vue'))

export function bindWindowsPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<WindowsRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setWindowSearch: (...args: never[]) => unknown
    focusWindow: (...args: never[]) => unknown
    updateWindowDraft: (...args: never[]) => unknown
    cancelWindowDraft: (...args: never[]) => unknown
  }
  return {
    page: WindowsPage,
    props: {
      snapshot: input.slice.snapshot(),
      showShortcutHints: input.shell.shortcutHints
    },
    on: {
      search: runtime.setWindowSearch,
      focus: runtime.focusWindow,
      'update-draft': runtime.updateWindowDraft,
      'cancel-draft': runtime.cancelWindowDraft,
      dispatch: runtime.dispatch
    }
  }
}
