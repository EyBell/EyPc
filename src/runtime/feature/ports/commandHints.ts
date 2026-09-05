import type { FeatureCommandHintsInputV7 } from '../featureModule'

export function portsCommandHints(input: FeatureCommandHintsInputV7): string {
  const { defaultLabel, modifierHint } = input
  return [
    '端口默认',
    `${defaultLabel('ports.scan', 'c-r')} 刷新`,
    `${defaultLabel('ports.pane.toggleNext', 'tab')}/${defaultLabel('ports.pane.togglePrev', 's-tab')} 切栏`,
    '↑↓ 移动',
    `${defaultLabel('ports.detail.open', 'c-←')} 详情`,
    `${defaultLabel('ports.drawer.open', 'c-→')} 菜单`,
    `${defaultLabel('ports.kill.confirm', 'del / backspace')} 终止`,
    `${defaultLabel('ports.group.apply', 'cr')} 筛选组`,
    `${defaultLabel('ports.group.focusMatches', 'c-cr')} 聚焦匹配`,
    `${defaultLabel('ports.group.save', 'c-s / c-cr')} 保存编辑`,
    `${defaultLabel('app.hide', 's-esc')} 隐藏`,
    modifierHint
  ].join(' · ')
}
