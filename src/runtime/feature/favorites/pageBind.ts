import { defineAsyncComponent } from 'vue'
import type { FavoriteDraft, FavoritePickReviewItem } from '../../appRuntime'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { FavoritesRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const FavoritesPage = defineAsyncComponent(() => import('../../../pages/FavoritesPage.vue'))
const QuickFavoritesPage = defineAsyncComponent(() => import('../../../pages/QuickFavoritesPage.vue'))

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' ? value : undefined
}

export function bindFavoritesPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<FavoritesRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setFavoriteSearch: (query: string) => unknown
    setFavoriteGroupSearch: (query: string) => unknown
    focusFavorite: (id: string) => unknown
    focusFavoriteGroup: (id: string) => unknown
    focusFavoriteDirectory: (path: string) => unknown
    toggleFavoriteSelection: (id: string) => unknown
    toggleFavoriteDirectorySelection: (path: string) => unknown
    toggleFavoriteCollapse: (id: string) => unknown
    updateFavoritePickReviewItem: (index: number, input: Partial<Pick<FavoritePickReviewItem, 'kind' | 'path' | 'name' | 'parentId' | 'tagsText' | 'color'>>) => unknown
    updateFavoriteDraft: (input: Partial<Pick<FavoriteDraft, 'kind' | 'name' | 'path' | 'tagsText' | 'color' | 'parentId' | 'runnerEnabled' | 'runnerMode' | 'runnerExecutable' | 'runnerArgsText' | 'runnerCwdMode' | 'runnerCwd' | 'runnerLogPath' | 'activeField'>>) => unknown
    saveFavoriteDraft: (input?: Partial<Pick<FavoriteDraft, 'kind' | 'name' | 'path' | 'tagsText' | 'color' | 'parentId' | 'runnerEnabled' | 'runnerMode' | 'runnerExecutable' | 'runnerArgsText' | 'runnerCwdMode' | 'runnerCwd' | 'runnerLogPath'>>) => unknown
    cancelFavoriteDraft: () => unknown
  }
  const dispatch = (actionId: string, args?: Record<string, unknown>) => {
    if (actionId === 'favorites.search.set') {
      runtime.setFavoriteSearch(stringArg(args, 'query') ?? '')
      return
    }
    if (actionId === 'favorites.groupSearch.set') {
      runtime.setFavoriteGroupSearch(stringArg(args, 'query') ?? '')
      return
    }
    if (actionId === 'favorites.item.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusFavorite(id)
      return
    }
    if (actionId === 'favorites.group.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusFavoriteGroup(id)
      return
    }
    if (actionId === 'favorites.directory.focus') {
      const path = stringArg(args, 'path')
      if (path) runtime.focusFavoriteDirectory(path)
      return
    }
    if (actionId === 'favorites.item.toggle') {
      const id = stringArg(args, 'id')
      if (id) runtime.toggleFavoriteSelection(id)
      return
    }
    if (actionId === 'favorites.directory.toggle') {
      const path = stringArg(args, 'path')
      if (path) runtime.toggleFavoriteDirectorySelection(path)
      return
    }
    if (actionId === 'favorites.group.collapseToggle') {
      const id = stringArg(args, 'id')
      if (id) runtime.toggleFavoriteCollapse(id)
      return
    }
    if (actionId === 'favorites.pickReview.item.update') {
      const index = typeof args?.index === 'number' ? args.index : -1
      if (index < 0) return
      const payload = { ...(args || {}) }
      delete payload.index
      runtime.updateFavoritePickReviewItem(index, payload as Partial<Pick<FavoritePickReviewItem, 'kind' | 'path' | 'name' | 'parentId' | 'tagsText' | 'color'>>)
      return
    }
    if (actionId === 'favorites.draft.update') {
      runtime.updateFavoriteDraft((args ?? {}) as Partial<Pick<FavoriteDraft, 'kind' | 'name' | 'path' | 'tagsText' | 'color' | 'parentId' | 'runnerEnabled' | 'runnerMode' | 'runnerExecutable' | 'runnerArgsText' | 'runnerCwdMode' | 'runnerCwd' | 'runnerLogPath' | 'activeField'>>)
      return
    }
    if (actionId === 'favorites.draft.save') {
      runtime.saveFavoriteDraft((args ?? {}) as Partial<Pick<FavoriteDraft, 'kind' | 'name' | 'path' | 'tagsText' | 'color' | 'parentId' | 'runnerEnabled' | 'runnerMode' | 'runnerExecutable' | 'runnerArgsText' | 'runnerCwdMode' | 'runnerCwd' | 'runnerLogPath'>>)
      return
    }
    if (actionId === 'favorites.draft.cancel') {
      runtime.cancelFavoriteDraft()
      return
    }
    return runtime.dispatch(actionId, args)
  }
  if (input.shell.favoriteQuickMode) {
    return {
      page: QuickFavoritesPage,
      props: {
        snapshot: input.slice.snapshot(),
        showShortcutHints: input.shell.shortcutHints
      },
      on: {
        dispatch
      }
    }
  }
  return {
    page: FavoritesPage,
    props: {
      snapshot: input.slice.snapshot(),
      showShortcutHints: input.shell.shortcutHints
    },
    on: {
      dispatch
    }
  }
}
