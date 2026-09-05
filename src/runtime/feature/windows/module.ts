import { commandProfilesFromRecord } from '../../keybinding/commandProfile'
import { createFeatureModuleV7, defaultShouldSubscribeV7 } from '../featureModule'
import { selectWindowsRuntimeSliceV7, type WindowsRuntimeSliceV7 } from '../featureRuntimeSlices'
import { registerWindowsActions } from './actions'
import { WINDOWS_COMMAND_PROFILES } from './commands'
import { bindWindowsPage } from './pageBind'
import { WINDOWS_ROUTES } from './routes'

const lifecycle = { backgroundPolicy: 'visible-only' as const, startOnVisible: true, retainWhileHidden: true }

export const windowsFeatureModuleV7 = createFeatureModuleV7<'windows', WindowsRuntimeSliceV7>({
  id: 'windows',
  definition: { id: 'windows', title: '窗口跳转', description: '收藏桌面窗口、配置稳定槽位并安全跳转' },
  lifecycle,
  commands: commandProfilesFromRecord(WINDOWS_COMMAND_PROFILES),
  routes: WINDOWS_ROUTES,
  menuKinds: ['window', 'multi-selection'],
  diagnosticDomains: ['windows.discovery', 'windows.activation'],
  selectView: selectWindowsRuntimeSliceV7,
  shouldSubscribe: (ctx) => defaultShouldSubscribeV7('windows', lifecycle, ctx),
  registerActions: registerWindowsActions,
  bindPage: bindWindowsPage
})
