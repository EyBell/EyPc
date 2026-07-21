import type { AppTabId, FeatureConfig } from '../../domain/types'

export interface FeatureDefinition {
  id: AppTabId
  title: string
  description: string
  enabled?: boolean
}

export interface VisibleFeatureDefinition extends FeatureDefinition {
  shortcutId: string
  shortcutCommandId: string
}

export const FEATURES: FeatureDefinition[] = [
  { id: 'ports', title: '端口进程', description: '扫描指定端口进程并安全终止' },
  { id: 'mqtt', title: 'MQTT', description: '快速连接 MQTT over WebSocket 并归档收发记录' },
  { id: 'favorites', title: '文件收藏', description: '管理文件和文件夹收藏、标签、分组和颜色' },
  { id: 'codex', title: 'Codex', description: '启用后首次自动检测 Codex 环境，并配置额度悬浮球与任务收件箱' },
  { id: 'settings', title: '设置', description: '管理快捷键和运行时配置' }
]

export const DEFAULT_FEATURE_CONFIGS: FeatureConfig[] = [
  { id: 'ports', enabled: true, sortOrder: 1 },
  { id: 'favorites', enabled: false, sortOrder: 2 },
  { id: 'mqtt', enabled: true, sortOrder: 3 },
  { id: 'codex', enabled: true, sortOrder: 4 },
  { id: 'settings', enabled: true, sortOrder: 5 }
]

const featureMeta = new Map(FEATURES.map((feature) => [feature.id, feature]))

function isFeatureConfig(value: FeatureDefinition | FeatureConfig): value is FeatureConfig {
  return typeof (value as FeatureConfig).sortOrder === 'number'
}

export function featureDefinitionFor(id: AppTabId): FeatureDefinition {
  return featureMeta.get(id) || { id, title: id, description: '' }
}

export function allFeatures(configs: FeatureConfig[] = DEFAULT_FEATURE_CONFIGS): FeatureDefinition[] {
  return configs
    .map((config) => ({ ...featureDefinitionFor(config.id), enabled: config.enabled, sortOrder: config.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...feature }) => feature)
}

export function visibleFeatures(features: Array<FeatureDefinition | FeatureConfig> = DEFAULT_FEATURE_CONFIGS): VisibleFeatureDefinition[] {
  let visibleShortcutIndex = 0
  const normalized = features
    .map((feature, index) => {
      if (!isFeatureConfig(feature)) return { ...feature, sortOrder: index + 1 }
      return { ...featureDefinitionFor(feature.id), enabled: feature.enabled, sortOrder: feature.sortOrder }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return normalized
    .filter((feature) => feature.enabled !== false)
    .map((feature) => {
      if (feature.id === 'settings') {
        return { ...feature, shortcutId: 'Ctrl+Alt+S', shortcutCommandId: 'settings.open' }
      }
      visibleShortcutIndex += 1
      return { ...feature, shortcutId: `Ctrl+Shift+${visibleShortcutIndex}`, shortcutCommandId: `tab.select.${feature.id}` }
    })
}
