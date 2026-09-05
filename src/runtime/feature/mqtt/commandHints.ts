import type { FeatureCommandHintsInputV7 } from '../featureModule'

export function mqttCommandHints(input: FeatureCommandHintsInputV7): string {
  const { defaultLabel, modifierHint } = input
  return [
    'MQTT 默认',
    '↑↓ 移动',
    `${defaultLabel('mqtt.pane.next', 'tab')}/${defaultLabel('mqtt.pane.prev', 's-tab')} 切区`,
    `${defaultLabel('mqtt.detail.open', 'c-←')} 详情`,
    `${defaultLabel('mqtt.drawer.open', 'c-→')} 菜单`,
    `${defaultLabel('mqtt.subscription.editor.open', 'f2')} 编辑订阅`,
    `${defaultLabel('mqtt.connection.connect', 'c-r')} 连接`,
    modifierHint
  ].join(' · ')
}
