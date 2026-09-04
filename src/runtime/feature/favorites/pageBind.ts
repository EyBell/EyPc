import { defineAsyncComponent } from 'vue'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { FavoritesRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const FavoritesPage = defineAsyncComponent(() => import('../../../pages/FavoritesPage.vue'))
const QuickFavoritesPage = defineAsyncComponent(() => import('../../../pages/QuickFavoritesPage.vue'))

export function bindFavoritesPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<FavoritesRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setFavoriteSearch: (...args: never[]) => unknown
    setFavoriteGroupSearch: (...args: never[]) => unknown
    focusFavorite: (...args: never[]) => unknown
    focusFavoriteGroup: (...args: never[]) => unknown
    focusFavoriteDirectory: (...args: never[]) => unknown
    toggleFavoriteSelection: (...args: never[]) => unknown
    toggleFavoriteDirectorySelection: (...args: never[]) => unknown
    toggleFavoriteCollapse: (...args: never[]) => unknown
    addFavorite: (...args: never[]) => unknown
    removeFavorite: (...args: never[]) => unknown
    updateFavoritePickReviewItem: (...args: never[]) => unknown
    updateFavoriteDraft: (...args: never[]) => unknown
    saveFavoriteDraft: (...args: never[]) => unknown
    cancelFavoriteDraft: (...args: never[]) => unknown
  }
  if (input.shell.favoriteQuickMode) {
    return {
      page: QuickFavoritesPage,
      props: {
        snapshot: input.slice.snapshot(),
        showShortcutHints: input.shell.shortcutHints
      },
      on: {
        search: runtime.setFavoriteSearch,
        focus: runtime.focusFavorite,
        dispatch: runtime.dispatch
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
      search: runtime.setFavoriteSearch,
      'group-search': runtime.setFavoriteGroupSearch,
      focus: runtime.focusFavorite,
      'focus-group': runtime.focusFavoriteGroup,
      'focus-directory': runtime.focusFavoriteDirectory,
      toggle: runtime.toggleFavoriteSelection,
      'toggle-directory': runtime.toggleFavoriteDirectorySelection,
      collapse: runtime.toggleFavoriteCollapse,
      add: runtime.addFavorite,
      remove: runtime.removeFavorite,
      reorder: ((nodeId: string, parentId: string, beforeNodeId: string) => runtime.dispatch('favorites.reorder', { nodeId, parentId, beforeNodeId })) as (...args: never[]) => unknown,
      'update-pick-review-item': runtime.updateFavoritePickReviewItem,
      'update-favorite-draft': runtime.updateFavoriteDraft,
      'save-favorite-draft': runtime.saveFavoriteDraft,
      'cancel-favorite-draft': runtime.cancelFavoriteDraft,
      dispatch: runtime.dispatch
    }
  }
}
