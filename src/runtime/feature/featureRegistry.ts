import type { AppTabId } from '../../domain/types'

export interface FeatureDefinition {
  id: AppTabId
  title: string
  description: string
}

export const FEATURES: FeatureDefinition[] = [
  { id: 'ports', title: '端口进程', description: '扫描指定端口进程并安全终止' },
  { id: 'favorites', title: '文件收藏', description: '管理文件和文件夹收藏、标签、分组和颜色' },
  { id: 'settings', title: '设置', description: '管理快捷键和运行时配置' }
]
