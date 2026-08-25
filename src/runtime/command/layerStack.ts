import type { AppTabId } from '../../domain/types'
import type { KeybindingLayerId } from './types'

export interface LayerStackContextV7 {
  tab?: AppTabId
  activeLayers?: readonly KeybindingLayerId[]
  confirmOpen?: boolean
  activeInputRole?: string
  favoriteRunPromptOpen?: boolean
  favoriteSlotManagerOpen?: boolean
  mqttPreviewOpen?: boolean
  mqttDetailOpen?: boolean
  mqttDetailActive?: boolean
  mqttDrawerOpen?: boolean
  mqttDrawerActive?: boolean
  mqttLogDrawerOpen?: boolean
  portGroupDetailOpen?: boolean
  portGroupDetailActive?: boolean
  portDetailOpen?: boolean
  portDetailActive?: boolean
  portDrawerOpen?: boolean
  portDrawerActive?: boolean
  favoriteDrawerOpen?: boolean
  favoriteDrawerActive?: boolean
  favoriteDetailOpen?: boolean
  favoriteDetailActive?: boolean
  favoritePickReviewOpen?: boolean
  portSelectionMode?: boolean
  windowActionsOpen?: boolean
  windowEditorOpen?: boolean
}

export interface LayerStackSnapshotV7 {
  readonly ids: readonly KeybindingLayerId[]
  /** Layers that may currently resolve commands. Lower layers remain observable but cannot execute. */
  readonly interactiveIds: readonly KeybindingLayerId[]
  readonly top: KeybindingLayerId | null
  readonly topInteractive: KeybindingLayerId | null
  readonly modal: KeybindingLayerId | null
  readonly blockingLayer: KeybindingLayerId | null
}

export const LAYER_PRIORITY: Readonly<Record<KeybindingLayerId, number>> = Object.freeze({
  app: 1100,
  confirm: 1000,
  'favorites-run-prompt': 970,
  'settings-shortcut-record': 960,
  'settings-when-edit': 950,
  'codex-model': 951,
  'codex-composer': 950,
  'mqtt-record-editor': 946,
  'mqtt-favorite-editor': 945,
  'mqtt-subscription-editor': 940,
  'mqtt-publish-draft-editor': 934,
  'favorites-slot-manager': 935,
  'mqtt-publish-draft': 933,
  'mqtt-publish-options': 932,
  'mqtt-publish-editor': 931,
  'mqtt-editor': 930,
  'mqtt-connection-group-editor': 930,
  'port-group-editor': 930,
  'favorites-pick-review': 930,
  'favorites-editor': 930,
  'window-editor': 930,
  'codex-inline-editor': 930,
  'mqtt-config-subscription-editor': 929,
  'mqtt-config-publish-editor': 929,
  'codex-quick-jump': 900,
  'codex-preview': 840,
  'port-group-detail': 830,
  'mqtt-drawer': 820,
  'port-drawer': 820,
  'favorites-drawer': 820,
  'window-actions': 820,
  'codex-drawer': 820,
  'mqtt-preview': 980,
  'mqtt-log-drawer': 810,
  'mqtt-detail': 800,
  'port-detail': 800,
  'favorite-detail': 800,
  'codex-detail': 800,
  'mqtt-topic-filter': 700,
  'ports-selection': 700,
  'mqtt-connections': 690,
  'mqtt-subscriptions': 690,
  'mqtt-search': 680,
  'ports-search': 680,
  'favorites-search': 680,
  'windows-search': 680,
  codex: 500,
  settings: 500,
  ports: 500,
  mqtt: 500,
  favorites: 500,
  windows: 500,
  global: 100
})

export const LAYER_LABELS: Readonly<Record<KeybindingLayerId, string>> = Object.freeze({
  app: '应用窗口',
  confirm: '确认层',
  'settings-shortcut-record': '快捷键录制',
  'settings-when-edit': 'When 编辑',
  'favorites-run-prompt': '收藏运行参数',
  'favorites-slot-manager': '收藏文件槽管理',
  'mqtt-editor': 'MQTT 编辑',
  'mqtt-connection-group-editor': 'MQTT 连接分组编辑',
  'mqtt-config-subscription-editor': 'MQTT 配置订阅行',
  'mqtt-config-publish-editor': 'MQTT 配置发布行',
  'mqtt-publish-editor': 'MQTT 发送编辑',
  'mqtt-publish-options': 'MQTT 发送选项',
  'mqtt-publish-draft': 'MQTT 发送草稿',
  'mqtt-publish-draft-editor': 'MQTT 草稿编辑',
  'mqtt-subscription-editor': 'MQTT 订阅编辑',
  'mqtt-favorite-editor': 'MQTT 收藏编辑',
  'mqtt-record-editor': 'MQTT 记录编辑',
  'mqtt-preview': 'MQTT 预览',
  'mqtt-search': 'MQTT 搜索',
  'mqtt-topic-filter': 'MQTT topic 筛选',
  'mqtt-connections': 'MQTT 连接栏',
  'mqtt-subscriptions': 'MQTT 订阅栏',
  'mqtt-drawer': 'MQTT 动作抽屉',
  'mqtt-detail': 'MQTT 详情',
  'mqtt-log-drawer': 'MQTT 日志抽屉',
  'port-group-editor': '端口组编辑',
  'port-group-detail': '端口组详情',
  'port-drawer': '端口动作抽屉',
  'port-detail': '端口详情',
  'favorites-drawer': '收藏动作抽屉',
  'favorite-detail': '收藏详情',
  'favorites-pick-review': '收藏点选审核',
  'ports-selection': '端口多选',
  'ports-search': '端口搜索',
  'favorites-search': '收藏搜索',
  'favorites-editor': '收藏编辑',
  'window-editor': '窗口目标编辑',
  'window-actions': '窗口操作面板',
  'windows-search': '窗口搜索',
  'codex-composer': 'Codex 新会话编辑器',
  'codex-model': 'Codex 模型选择',
  'codex-quick-jump': 'Codex 快捷跳转',
  'codex-preview': 'Codex Shift 预览',
  'codex-inline-editor': 'Codex 行内编辑',
  'codex-drawer': 'Codex 操作抽屉',
  'codex-detail': 'Codex 详情',
  codex: 'Codex',
  settings: '设置',
  ports: '端口',
  mqtt: 'MQTT',
  favorites: '收藏',
  windows: '窗口跳转',
  global: '全局'
})

const MODAL_LAYERS = new Set<KeybindingLayerId>([
  'confirm',
  'favorites-run-prompt',
  'favorites-slot-manager',
  'settings-shortcut-record',
  'settings-when-edit',
  'mqtt-editor',
  'mqtt-connection-group-editor',
  'mqtt-config-subscription-editor',
  'mqtt-config-publish-editor',
  'mqtt-subscription-editor',
  'mqtt-favorite-editor',
  'mqtt-record-editor',
  'mqtt-publish-draft-editor',
  'port-group-editor',
  'favorites-editor',
  'favorites-pick-review',
  'window-editor',
  'codex-composer',
  'codex-model',
  'codex-inline-editor'
])

/**
 * Nested editors remain inside their owning modal transaction. Their row-level
 * layer is intentionally more specific than the parent even when its numeric
 * priority is lower, so both layers can resolve while every unrelated layer is
 * still blocked.
 */
const MODAL_PARENT_V7: Readonly<Partial<Record<KeybindingLayerId, KeybindingLayerId>>> = Object.freeze({
  'mqtt-config-subscription-editor': 'mqtt-editor',
  'mqtt-config-publish-editor': 'mqtt-editor'
})

function isModalAncestorV7(ancestor: KeybindingLayerId, descendant: KeybindingLayerId): boolean {
  let current = MODAL_PARENT_V7[descendant]
  const visited = new Set<KeybindingLayerId>()
  while (current && !visited.has(current)) {
    if (current === ancestor) return true
    visited.add(current)
    current = MODAL_PARENT_V7[current]
  }
  return false
}

function modalLineageV7(modal: KeybindingLayerId): ReadonlySet<KeybindingLayerId> {
  const lineage = new Set<KeybindingLayerId>([modal])
  let current = MODAL_PARENT_V7[modal]
  while (current && !lineage.has(current)) {
    lineage.add(current)
    current = MODAL_PARENT_V7[current]
  }
  return lineage
}

export function resolveLayerStackV7(context: LayerStackContextV7): LayerStackSnapshotV7 {
  const layers = new Set<KeybindingLayerId>(['app', 'global'])
  if (context.tab) layers.add(context.tab)
  for (const layer of context.activeLayers || []) layers.add(layer)
  if (context.confirmOpen) layers.add('confirm')
  if (context.favoriteRunPromptOpen) layers.add('favorites-run-prompt')
  if (context.favoriteSlotManagerOpen) layers.add('favorites-slot-manager')

  const role = context.activeInputRole
  if (role === 'mqtt-editor') layers.add('mqtt-editor')
  if (role === 'mqtt-connection-group-editor') layers.add('mqtt-connection-group-editor')
  if (role === 'mqtt-config-subscription-editor') { layers.add('mqtt-editor'); layers.add('mqtt-config-subscription-editor') }
  if (role === 'mqtt-config-publish-editor') { layers.add('mqtt-editor'); layers.add('mqtt-config-publish-editor') }
  if (role === 'mqtt-publish-editor') layers.add('mqtt-publish-editor')
  if (role === 'mqtt-publish-options') layers.add('mqtt-publish-options')
  if (role === 'mqtt-publish-draft') layers.add('mqtt-publish-draft')
  if (role === 'mqtt-publish-draft-editor') layers.add('mqtt-publish-draft-editor')
  if (role === 'mqtt-subscription-editor') layers.add('mqtt-subscription-editor')
  if (role === 'mqtt-favorite-editor') layers.add('mqtt-favorite-editor')
  if (role === 'mqtt-record-editor') layers.add('mqtt-record-editor')
  if (role === 'port-group-editor') layers.add('port-group-editor')
  if (role === 'favorite-editor') layers.add('favorites-editor')
  if (role === 'window-editor' || context.windowEditorOpen) layers.add('window-editor')
  if (role === 'window-actions' || context.windowActionsOpen) layers.add('window-actions')
  if (role === 'favorite-pick-review' || context.favoritePickReviewOpen) layers.add('favorites-pick-review')
  if (role === 'codex-composer') layers.add('codex-composer')
  if (context.mqttPreviewOpen) layers.add('mqtt-preview')
  if (context.mqttDetailOpen || context.mqttDetailActive) layers.add('mqtt-detail')
  if (context.mqttDrawerOpen || context.mqttDrawerActive) layers.add('mqtt-drawer')
  if (context.mqttLogDrawerOpen) layers.add('mqtt-log-drawer')
  if (context.portGroupDetailOpen || context.portGroupDetailActive) layers.add('port-group-detail')
  if (context.portDetailOpen || context.portDetailActive) layers.add('port-detail')
  if (context.portDrawerOpen || context.portDrawerActive) layers.add('port-drawer')
  if (context.favoriteDrawerOpen || context.favoriteDrawerActive) layers.add('favorites-drawer')
  if (context.favoriteDetailOpen || context.favoriteDetailActive) layers.add('favorite-detail')
  if (context.portSelectionMode) layers.add('ports-selection')
  if (role === 'port-search' || role === 'port-group-search') layers.add('ports-search')
  if (role === 'mqtt-search') layers.add('mqtt-search')
  if (role === 'mqtt-topic-filter') layers.add('mqtt-topic-filter')
  if (role === 'mqtt-connections') layers.add('mqtt-connections')
  if (role === 'mqtt-subscriptions') layers.add('mqtt-subscriptions')
  if (role === 'favorite-search' || role === 'favorite-group-search') layers.add('favorites-search')
  if (role === 'window-search') layers.add('windows-search')

  const ids = Object.freeze([...layers].sort((left, right) => LAYER_PRIORITY[right] - LAYER_PRIORITY[left]))
  const activeModals = ids.filter((id) => MODAL_LAYERS.has(id))
  const leafModals = activeModals.filter((candidate) =>
    !activeModals.some((other) => candidate !== other && isModalAncestorV7(candidate, other))
  )
  const modal = leafModals[0] || null
  const modalLineage = modal ? modalLineageV7(modal) : new Set<KeybindingLayerId>()
  const interactiveIds = Object.freeze(modal
    ? ids.filter((id) => id === 'app' || modalLineage.has(id) || (
      !MODAL_LAYERS.has(id) && LAYER_PRIORITY[id] > LAYER_PRIORITY[modal]
    ))
    : [...ids])
  const topInteractive = (modal && interactiveIds.includes(modal) ? modal : null)
    || interactiveIds.find((id) => id !== 'app' && id !== 'global')
    || interactiveIds.find((id) => id === 'app')
    || interactiveIds[0]
    || null
  return Object.freeze({
    ids,
    interactiveIds,
    top: topInteractive,
    topInteractive,
    modal,
    blockingLayer: modal
  })
}
