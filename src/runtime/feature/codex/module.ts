import { commandProfilesFromRecord } from '../../keybinding/commandProfile'
import { createFeatureModuleV7, defaultShouldSubscribeV7 } from '../featureModule'
import { selectCodexRuntimeSliceV7, type CodexRuntimeSliceV7 } from '../featureRuntimeSlices'
import { CODEX_COMMAND_PROFILES } from './commands'
import { bindCodexPage } from './pageBind'
import { CODEX_ROUTES } from './routes'

const lifecycle = { backgroundPolicy: 'entry-enabled' as const, startOnVisible: false, retainWhileHidden: true }

export const codexFeatureModuleV7 = createFeatureModuleV7<'codex', CodexRuntimeSliceV7>({
  id: 'codex',
  definition: { id: 'codex', title: 'Codex', description: '启用后首次自动检测 Codex 环境，并配置额度任务悬浮球' },
  lifecycle,
  commands: commandProfilesFromRecord(CODEX_COMMAND_PROFILES),
  routes: CODEX_ROUTES,
  menuKinds: ['task', 'project', 'drawer'],
  diagnosticDomains: ['companion.kernel', 'companion.provider', 'companion.float'],
  selectView: selectCodexRuntimeSliceV7,
  shouldSubscribe: (ctx) => defaultShouldSubscribeV7('codex', lifecycle, ctx),
  bindPage: bindCodexPage
})
