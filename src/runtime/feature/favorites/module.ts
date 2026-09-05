import { commandProfilesFromRecord } from '../../keybinding/commandProfile'
import { createFeatureModuleV7, defaultShouldSubscribeV7 } from '../featureModule'
import { selectFavoritesRuntimeSliceV7, type FavoritesRuntimeSliceV7 } from '../featureRuntimeSlices'
import { registerFavoritesActions } from './actions'
import { FAVORITES_COMMAND_PROFILES } from './commands'
import { bindFavoritesPage } from './pageBind'
import { FAVORITES_ROUTES } from './routes'

const lifecycle = { backgroundPolicy: 'on-demand' as const, startOnVisible: true, retainWhileHidden: true }

export const favoritesFeatureModuleV7 = createFeatureModuleV7<'favorites', FavoritesRuntimeSliceV7>({
  id: 'favorites',
  definition: { id: 'favorites', title: '文件收藏', description: '管理文件和文件夹收藏、标签、分组和颜色' },
  lifecycle,
  commands: commandProfilesFromRecord(FAVORITES_COMMAND_PROFILES),
  routes: FAVORITES_ROUTES,
  menuKinds: ['favorite', 'directory', 'drawer'],
  diagnosticDomains: ['favorites.open', 'favorites.runner'],
  selectView: selectFavoritesRuntimeSliceV7,
  shouldSubscribe: (ctx) => defaultShouldSubscribeV7('favorites', lifecycle, ctx),
  registerActions: registerFavoritesActions,
  bindPage: bindFavoritesPage,
  confirmRestoreFocusSelectors: (snapshot) => [...new Set([
    `[data-role="favorite-${snapshot.activeFavoritePane}"]`,
    '[data-role="favorite-items"]',
    '.favorite-add-button',
    '[data-role="favorite-containers"]'
  ])]
})
