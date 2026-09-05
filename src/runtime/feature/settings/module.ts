import { commandProfilesFromRecord } from '../../keybinding/commandProfile'
import { createFeatureModuleV7, defaultShouldSubscribeV7 } from '../featureModule'
import { selectSettingsRuntimeSliceV7, type SettingsRuntimeSliceV7 } from '../featureRuntimeSlices'
import { registerSettingsActions } from './actions'
import { SETTINGS_COMMAND_PROFILES } from './commands'
import { bindSettingsPage } from './pageBind'
import { SETTINGS_ROUTES } from './routes'

const lifecycle = { backgroundPolicy: 'on-demand' as const, startOnVisible: true, retainWhileHidden: false }

export const settingsFeatureModuleV7 = createFeatureModuleV7<'settings', SettingsRuntimeSliceV7>({
  id: 'settings',
  definition: { id: 'settings', title: '设置', description: '管理快捷键和运行时配置' },
  lifecycle,
  commands: commandProfilesFromRecord(SETTINGS_COMMAND_PROFILES),
  routes: SETTINGS_ROUTES,
  menuKinds: ['command', 'feature'],
  diagnosticDomains: ['runtime.settings', 'runtime.diagnostics'],
  alwaysEnabled: true,
  selectView: selectSettingsRuntimeSliceV7,
  shouldSubscribe: (ctx) => defaultShouldSubscribeV7('settings', lifecycle, ctx),
  registerActions: registerSettingsActions,
  bindPage: bindSettingsPage
})
