import { commandProfilesFromRecord } from '../../keybinding/commandProfile'
import { createFeatureModuleV7, defaultShouldSubscribeV7 } from '../featureModule'
import { selectPortsRuntimeSliceV7, type PortsRuntimeSliceV7 } from '../featureRuntimeSlices'
import { registerPortsActions, focusPortsSearch } from './actions'
import { PORTS_COMMAND_PROFILES } from './commands'
import { bindPortsPage } from './pageBind'
import { PORTS_ROUTES } from './routes'

const lifecycle = { backgroundPolicy: 'visible-only' as const, startOnVisible: true, retainWhileHidden: true }

export const portsFeatureModuleV7 = createFeatureModuleV7<'ports', PortsRuntimeSliceV7>({
  id: 'ports',
  definition: { id: 'ports', title: '端口进程', description: '扫描指定端口进程并安全终止' },
  lifecycle,
  commands: commandProfilesFromRecord(PORTS_COMMAND_PROFILES),
  routes: PORTS_ROUTES,
  menuKinds: ['row', 'group', 'drawer'],
  diagnosticDomains: ['ports.scan', 'ports.process'],
  selectView: selectPortsRuntimeSliceV7,
  shouldSubscribe: (ctx) => defaultShouldSubscribeV7('ports', lifecycle, ctx),
  registerActions: registerPortsActions,
  focusSearch: focusPortsSearch,
  bindPage: bindPortsPage
})
