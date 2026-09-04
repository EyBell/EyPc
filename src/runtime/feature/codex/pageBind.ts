import { defineAsyncComponent } from 'vue'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { CodexRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const CodexPage = defineAsyncComponent(() => import('../../../pages/CodexPage.vue'))

export function bindCodexPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<CodexRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  return {
    page: CodexPage,
    props: {
      snapshot: input.slice.snapshot().codex
    },
    on: {
      dispatch: input.runtime.dispatch
    }
  }
}
