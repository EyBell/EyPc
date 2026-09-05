import type { FeatureCommandHintsInputV7 } from '../featureModule'

export function favoritesCommandHints(input: FeatureCommandHintsInputV7): string {
  const { defaultLabel, modifierHint, favoriteQuickMode } = input
  if (favoriteQuickMode) {
    return [
      '快速收藏',
      '↑↓ 移动',
      `${defaultLabel('favorites.open', 'cr')} 打开`,
      `${defaultLabel('favorites.reveal', 'c-cr')} 定位`,
      `${defaultLabel('favorites.copyPath', 'c-c')} 复制路径`,
      `${defaultLabel('favorites.detail.open', 'c-←')} 详情`,
      `${defaultLabel('favorites.drawer.open', 'c-→')} 安全操作`,
      modifierHint
    ].join(' · ')
  }
  return [
    '收藏默认',
    '↑↓ 移动',
    `${defaultLabel('favorites.open', 'cr')} 打开`,
    `${defaultLabel('favorites.target.create', 'c-n')} 新增`,
    `${defaultLabel('favorites.pick.files', 'c-o')} 选文件`,
    `${defaultLabel('favorites.pick.folders', 'c-s-o')} 选文件夹`,
    `${defaultLabel('favorites.reveal', 'c-cr')} 定位`,
    `${defaultLabel('favorites.copyPath', 'c-c')} 复制路径`,
    `${defaultLabel('favorites.detail.open', 'c-←')} 详情`,
    `${defaultLabel('favorites.drawer.open', 'c-→')} 菜单`,
    `${defaultLabel('favorites.pane.toggleNext', 'tab')} 切栏`,
    `${defaultLabel('favorites.save', 'c-s / c-cr')} 保存编辑`,
    `${defaultLabel('favorites.cancel', 'esc')} 取消`,
    modifierHint
  ].join(' · ')
}
