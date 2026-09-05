import { commandProfilesFromRecord } from '../../keybinding/commandProfile'
import { createFeatureModuleV7, defaultShouldSubscribeV7 } from '../featureModule'
import { selectMqttRuntimeSliceV7, type MqttRuntimeSliceV7 } from '../featureRuntimeSlices'
import { registerMqttActions, enterMqttTab, focusMqttSearch } from './actions'
import { MQTT_COMMAND_PROFILES } from './commands'
import { bindMqttPage } from './pageBind'
import { MQTT_ROUTES } from './routes'

const lifecycle = { backgroundPolicy: 'connected-only' as const, startOnVisible: true, retainWhileHidden: true }
const connectedStates = new Set(['connecting', 'connected', 'reconnecting'])

export const mqttFeatureModuleV7 = createFeatureModuleV7<'mqtt', MqttRuntimeSliceV7>({
  id: 'mqtt',
  definition: { id: 'mqtt', title: 'MQTT', description: '快速连接 MQTT over WebSocket 并归档收发记录' },
  lifecycle,
  commands: commandProfilesFromRecord(MQTT_COMMAND_PROFILES),
  routes: MQTT_ROUTES,
  menuKinds: ['connection', 'subscription', 'record', 'drawer'],
  diagnosticDomains: ['mqtt.connection', 'mqtt.storage'],
  selectView: selectMqttRuntimeSliceV7,
  shouldSubscribe: (ctx) => defaultShouldSubscribeV7('mqtt', lifecycle, ctx, (view) => connectedStates.has(view.mqttConnectionStatus.state)),
  registerActions: registerMqttActions,
  onTabEnter: enterMqttTab,
  focusSearch: focusMqttSearch,
  bindPage: bindMqttPage
})
