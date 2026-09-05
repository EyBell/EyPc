import { defineAsyncComponent } from 'vue'
import type { WindowDraft } from '../../appRuntime'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { WindowsRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const WindowsPage = defineAsyncComponent(() => import('../../../pages/WindowsPage.vue'))

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' ? value : undefined
}

export function bindWindowsPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<WindowsRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setWindowSearch: (query: string) => unknown
    focusWindow: (id: string) => unknown
    updateWindowDraft: (input: Partial<Pick<WindowDraft, 'alias' | 'activeField'>>) => unknown
    cancelWindowDraft: () => unknown
  }
  const dispatch = (actionId: string, args?: Record<string, unknown>) => {
    if (actionId === 'windows.search.set') {
      runtime.setWindowSearch(stringArg(args, 'query') ?? '')
      return
    }
    if (actionId === 'windows.item.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusWindow(id)
      return
    }
    if (actionId === 'windows.draft.update') {
      runtime.updateWindowDraft((args ?? {}) as Partial<Pick<WindowDraft, 'alias' | 'activeField'>>)
      return
    }
    if (actionId === 'windows.draft.cancel') {
      runtime.cancelWindowDraft()
      return
    }
    return runtime.dispatch(actionId, args)
  }
  return {
    page: WindowsPage,
    props: {
      snapshot: input.slice.snapshot(),
      showShortcutHints: input.shell.shortcutHints
    },
    on: {
      dispatch
    }
  }
}
