import type { AppTabId, FeatureConfig, KeybindingOverride, ShortcutProfileId, ShortcutProfileMap } from '../../domain/types'
import { normalizeShortcutId } from '../../domain/shortcuts'
import { visibleFeatures } from '../feature/featureRegistry'

export type KeybindingLayerId =
  | 'app'
  | 'confirm'
  | 'settings-shortcut-record'
  | 'settings-when-edit'
  | 'mqtt-editor'
  | 'mqtt-connection-group-editor'
  | 'mqtt-config-subscription-editor'
  | 'mqtt-config-publish-editor'
  | 'mqtt-publish-editor'
  | 'mqtt-publish-options'
  | 'mqtt-publish-draft'
  | 'mqtt-publish-draft-editor'
  | 'mqtt-subscription-editor'
  | 'mqtt-favorite-editor'
  | 'mqtt-record-editor'
  | 'mqtt-preview'
  | 'mqtt-search'
  | 'mqtt-topic-filter'
  | 'mqtt-connections'
  | 'mqtt-subscriptions'
  | 'mqtt-drawer'
  | 'mqtt-detail'
  | 'mqtt-log-drawer'
  | 'port-group-editor'
  | 'port-group-detail'
  | 'port-drawer'
  | 'port-detail'
  | 'favorites-drawer'
  | 'favorite-detail'
  | 'favorites-pick-review'
  | 'ports-selection'
  | 'ports-search'
  | 'favorites-search'
  | 'favorites-editor'
  | 'codex'
  | 'settings'
  | 'ports'
  | 'mqtt'
  | 'favorites'
  | 'global'

export interface KeybindingContext {
  tab?: AppTabId
  confirmOpen?: boolean
  textInputFocused?: boolean
  activeInputRole?: 'port-search' | 'port-group-search' | 'mqtt-search' | 'mqtt-topic-filter' | 'mqtt-publish-editor' | 'mqtt-publish-options' | 'mqtt-publish-draft' | 'mqtt-publish-draft-editor' | 'mqtt-editor' | 'mqtt-connection-group-editor' | 'mqtt-config-subscription-editor' | 'mqtt-config-publish-editor' | 'mqtt-subscription-editor' | 'mqtt-favorite-editor' | 'mqtt-record-editor' | 'mqtt-connections' | 'mqtt-subscriptions' | 'favorite-search' | 'favorite-group-search' | 'favorite-containers' | 'favorite-items' | 'favorite-directory' | 'favorite-editor' | 'favorite-pick-review' | 'settings' | 'port-group-editor' | 'other'
  portPane?: 'groups' | 'results'
  favoritePane?: 'containers' | 'items' | 'directory'
  favoriteUndoAvailable?: boolean
  mqttPane?: 'connections' | 'subscriptions' | 'messages' | 'publish' | 'publish-records'
  mqttPanelOpen?: boolean
  mqttTargetKind?: 'config' | 'connection-group' | 'subscription' | 'session' | 'message' | 'log' | 'publish-template' | 'publish-draft-history'
  favoriteQuickMode?: boolean
  mqttDrawerOpen?: boolean
  mqttDrawerActive?: boolean
  mqttDetailOpen?: boolean
  mqttDetailActive?: boolean
  mqttLogDrawerOpen?: boolean
  mqttPreviewOpen?: boolean
  portDrawerOpen?: boolean
  portDrawerActive?: boolean
  favoriteDrawerOpen?: boolean
  favoriteDrawerActive?: boolean
  favoriteDetailOpen?: boolean
  favoriteDetailActive?: boolean
  favoritePickReviewOpen?: boolean
  portDetailOpen?: boolean
  portDetailActive?: boolean
  portGroupDetailOpen?: boolean
  portGroupDetailActive?: boolean
  portSelectionMode?: boolean
  activeLayers?: KeybindingLayerId[]
}

export interface KeybindingDefinition {
  actionId: string
  shortcutId: string
  defaultShortcutId: string
  defaultShortcutIds?: string[]
  when: string
  defaultWhen?: string
  source: 'system' | 'user' | 'removed'
  weight: number
  layer: KeybindingLayerId
  group?: string
  title?: string
  description?: string
  risk?: 'normal' | 'data-write' | 'destructive'
  order?: number
  internal?: boolean
  disabled?: boolean
  profileId?: ShortcutProfileId
}

export interface ShortcutCommandRow {
  commandId: string
  title: string
  group: string
  layer: KeybindingLayerId
  layerLabel: string
  risk: 'normal' | 'data-write' | 'destructive'
  shortcutIds: string[]
  defaultShortcutIds: string[]
  when: string
  defaultWhen: string
  source: 'system' | 'user' | 'removed'
  sourceLabel: string
  enabled: boolean
  profileId: ShortcutProfileId
  conflicts: ShortcutConflict[]
  reservationConflicts: ShortcutReservationRule[]
  bindings: KeybindingDefinition[]
}

export interface ShortcutConflict {
  commandId: string
  title: string
  shortcutId: string
  when: string
  layer: KeybindingLayerId
}

export interface ShortcutReservationRule {
  shortcutId: string
  commandId: string
  when: string
  description: string
  layer: KeybindingLayerId
}

interface ShortcutCommandProfile {
  actionId: string
  title: string
  group: string
  layer: KeybindingLayerId
  shortcutIds: string[]
  when: string
  weight: number
  risk?: 'normal' | 'data-write' | 'destructive'
  description?: string
  internal?: boolean
  profileId?: ShortcutProfileId
}

interface ShortcutCommandProfileConfig {
  title: string
  group: string
  layer: KeybindingLayerId
  shortcutIds: readonly string[]
  when: string
  weight: number
  risk?: 'normal' | 'data-write' | 'destructive'
  description?: string
  internal?: boolean
  profileId?: ShortcutProfileId
}

export const LAYER_PRIORITY: Record<KeybindingLayerId, number> = {
  app: 1100,
  confirm: 1000,
  'settings-shortcut-record': 960,
  'settings-when-edit': 950,
  'mqtt-editor': 930,
  'mqtt-connection-group-editor': 930,
  'mqtt-config-subscription-editor': 929,
  'mqtt-config-publish-editor': 929,
  'mqtt-publish-editor': 931,
  'mqtt-publish-options': 932,
  'mqtt-publish-draft': 933,
  'mqtt-publish-draft-editor': 934,
  'mqtt-subscription-editor': 940,
  'mqtt-favorite-editor': 945,
  'mqtt-record-editor': 946,
  'mqtt-preview': 815,
  'mqtt-search': 680,
  'mqtt-topic-filter': 700,
  'mqtt-connections': 690,
  'mqtt-subscriptions': 690,
  'mqtt-drawer': 820,
  'mqtt-detail': 800,
  'mqtt-log-drawer': 810,
  'port-group-editor': 930,
  'port-group-detail': 830,
  'port-drawer': 820,
  'port-detail': 800,
  'favorites-drawer': 820,
  'favorite-detail': 800,
  'favorites-pick-review': 930,
  'ports-selection': 700,
  'ports-search': 680,
  'favorites-search': 680,
  'favorites-editor': 930,
  codex: 500,
  settings: 500,
  ports: 500,
  mqtt: 500,
  favorites: 500,
  global: 100
}

const LAYER_LABELS: Record<KeybindingLayerId, string> = {
  app: '应用窗口',
  confirm: '确认层',
  'settings-shortcut-record': '快捷键录制',
  'settings-when-edit': 'When 编辑',
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
  codex: 'Codex',
  settings: '设置',
  ports: '端口',
  mqtt: 'MQTT',
  favorites: '收藏',
  global: '全局'
}

const SOURCE_WEIGHT = {
  user: 300,
  system: 100,
  removed: 0
}

export const DEFAULT_SHORTCUT_PROFILES_BY_COMMAND = {
  'app.hide': { title: '隐藏插件窗口', group: '全局', layer: 'app', shortcutIds: ['Shift+Escape'], when: 'true', weight: 1000 },
  'confirm.cancel': { title: '关闭确认弹窗', group: '全局', layer: 'confirm', shortcutIds: ['Escape'], when: 'confirmOpen', weight: 400 },
  'confirm.accept': { title: '确认当前弹窗', group: '全局', layer: 'confirm', shortcutIds: ['Enter'], when: 'confirmOpen', weight: 400, risk: 'data-write' },
  'tab.next': { title: '下一个主 Tab', group: '全局', layer: 'global', shortcutIds: ['Tab'], when: "tab != 'ports' && !textInputFocused", weight: 100 },
  'tab.prev': { title: '上一个主 Tab', group: '全局', layer: 'global', shortcutIds: ['Shift+Tab'], when: "tab != 'ports' && !textInputFocused", weight: 100 },
  'search.focus': { title: '聚焦搜索', group: '全局', layer: 'global', shortcutIds: ['Ctrl+F'], when: '!confirmOpen', weight: 100 },
  'settings.open': { title: '打开设置', group: '全局', layer: 'global', shortcutIds: ['Ctrl+Alt+S'], when: '!confirmOpen', weight: 100 },
  'codex.float.toggle': { title: '显示/隐藏 Codex 悬浮球', group: 'Codex', layer: 'app', shortcutIds: ['Ctrl+Alt+Q'], when: 'true', weight: 1000, description: '插件窗口激活时立即切换；系统级快捷键请在 uTools 全局功能中绑定。', profileId: 'codex' },
  'codex.float.activate': { title: '进入 Codex 卡片', group: 'Codex', layer: 'app', shortcutIds: ['Ctrl+Alt+Enter'], when: 'true', weight: 1001, description: '显示并展开悬浮卡片，直接进入会话选择和完整操作。', profileId: 'codex' },
  'codex.refresh': { title: '刷新 Codex 状态', group: 'Codex', layer: 'codex', shortcutIds: ['Ctrl+R'], when: "tab == 'codex'", weight: 100, profileId: 'codex' },
  'codex.list.up': { title: '会话焦点上移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['ArrowUp'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.list.down': { title: '会话焦点下移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['ArrowDown'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.selection.toggle': { title: '切换当前项选择', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Space'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.task.openFocused': { title: '打开任务或展开项目', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Enter'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.detail.open': { title: '查看当前项详情', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.drawer.open': { title: '打开批量与完整操作', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.task.archiveFocused': { title: '归档选中或当前任务', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Delete'], when: "tab == 'codex' && !textInputFocused", weight: 140, risk: 'destructive', profileId: 'codex' },
  'codex.alias.edit': { title: '编辑当前项别名', group: 'Codex 会话', layer: 'codex', shortcutIds: ['F2'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.pin.toggleFocused': { title: '切换当前项 EyPc 置顶', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+P'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.pin.moveUp': { title: '本地置顶项上移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Alt+ArrowUp'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.pin.moveDown': { title: '本地置顶项下移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Alt+ArrowDown'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.search.focus': { title: '聚焦会话搜索', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+F'], when: "tab == 'codex'", weight: 150, profileId: 'codex' },
  'codex.layer.cancel': { title: '取消当前交互层', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Escape'], when: "tab == 'codex'", weight: 150, profileId: 'codex' },
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`codex.drawer.select.${index + 1}`, { title: `执行操作抽屉第 ${index + 1} 项`, group: 'Codex 会话', layer: 'codex', shortcutIds: [`Ctrl+${index + 1}`], when: "tab == 'codex' && !textInputFocused", weight: 120 - index, profileId: 'codex' as const }])),
  'quickJump.openForward': { title: '快捷跳转', group: '全局', layer: 'global', shortcutIds: ['F'], when: '!confirmOpen && !textInputFocused', weight: 120 },
  'quickJump.openBackward': { title: '反向快捷跳转', group: '全局', layer: 'global', shortcutIds: ['Shift+F'], when: '!confirmOpen && !textInputFocused', weight: 120 },
  'list.up': { title: '列表上移', group: '全局', layer: 'global', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: '!mqttPreviewOpen && (!textInputFocused || activeInputRole == "port-search" || activeInputRole == "port-group-search" || activeInputRole == "mqtt-search" || activeInputRole == "favorite-search" || activeInputRole == "favorite-group-search")', weight: 100 },
  'list.down': { title: '列表下移', group: '全局', layer: 'global', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: '!mqttPreviewOpen && (!textInputFocused || activeInputRole == "port-search" || activeInputRole == "port-group-search" || activeInputRole == "mqtt-search" || activeInputRole == "favorite-search" || activeInputRole == "favorite-group-search")', weight: 100 },
  'list.pageUp': { title: '列表上翻页', group: '全局', layer: 'global', shortcutIds: ['Alt+U'], when: '!textInputFocused', weight: 100 },
  'list.pageDown': { title: '列表下翻页', group: '全局', layer: 'global', shortcutIds: ['Alt+E'], when: '!textInputFocused', weight: 100 },
  'list.toggleSelection': { title: '切换选择', group: '全局', layer: 'global', shortcutIds: ['Space'], when: '!textInputFocused || activeInputRole == "port-search"', weight: 100 },
  'ports.workspace.reset': { title: '重置端口工作区', group: '端口', layer: 'ports', shortcutIds: ['Escape'], when: "tab == 'ports'", weight: 90 },
  'ports.selection.clear': { title: '清空端口多选', group: '端口', layer: 'ports-selection', shortcutIds: ['Escape'], when: "tab == 'ports' && portSelectionMode", weight: 300 },
  'ports.kill.confirm': { title: '终止选中进程', group: '端口', layer: 'ports', shortcutIds: ['Delete', 'Backspace'], when: "tab == 'ports' && portPane != 'groups' && !textInputFocused", weight: 120, risk: 'data-write' },
  'ports.kill.force': { title: '强杀选中进程', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'ports' && portPane != 'groups' && (!textInputFocused || activeInputRole == 'port-search')", weight: 120, risk: 'destructive' },
  'ports.scan': { title: '刷新端口', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+R'], when: "tab == 'ports'", weight: 100 },
  'ports.groups.togglePanel': { title: '展开/收起端口组栏', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Shift+W'], when: "tab == 'ports' && !confirmOpen && (!textInputFocused || activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 135 },
  'ports.search.focus': { title: '聚焦端口搜索', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+F'], when: "tab == 'ports' && !confirmOpen", weight: 140 },
  'ports.groupSearch.focus': { title: '聚焦端口组搜索', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Shift+F'], when: "tab == 'ports' && !confirmOpen", weight: 140 },
  'ports.search.blur': { title: '退出端口搜索焦点', group: '端口', layer: 'ports-search', shortcutIds: ['Escape'], when: "tab == 'ports' && (activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 500 },
  'ports.pane.toggleNext': { title: '切换端口栏', group: '端口', layer: 'ports', shortcutIds: ['Tab'], when: "tab == 'ports' && (!textInputFocused || activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 130 },
  'ports.pane.togglePrev': { title: '反向切换端口栏', group: '端口', layer: 'ports', shortcutIds: ['Shift+Tab'], when: "tab == 'ports' && (!textInputFocused || activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 130 },
  'ports.pane.groups': { title: '聚焦端口组栏', group: '端口', layer: 'ports', shortcutIds: ['Alt+ArrowLeft'], when: "tab == 'ports' && !textInputFocused", weight: 110 },
  'ports.pane.results': { title: '聚焦端口结果栏', group: '端口', layer: 'ports', shortcutIds: ['Alt+ArrowRight'], when: "tab == 'ports' && !textInputFocused", weight: 110 },
  'ports.group.edit.cancel': { title: '取消端口组编辑', group: '端口', layer: 'port-group-editor', shortcutIds: ['Escape'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400 },
  'ports.group.save': { title: '保存端口组编辑', group: '端口', layer: 'port-group-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400, risk: 'data-write' },
  'ports.group.edit.nextField': { title: '编辑层下一个字段', group: '端口', layer: 'port-group-editor', shortcutIds: ['Tab'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400 },
  'ports.group.edit.prevField': { title: '编辑层上一个字段', group: '端口', layer: 'port-group-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400 },
  'ports.group.apply': { title: '应用端口组过滤', group: '端口', layer: 'ports', shortcutIds: ['Enter'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130 },
  'ports.group.focusMatches': { title: '聚焦组内端口', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Enter'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 131 },
  'ports.group.kill.confirm': { title: '终止当前端口组', group: '端口', layer: 'ports', shortcutIds: ['Shift+Enter'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'data-write' },
  'ports.group.kill.force': { title: '强杀当前端口组', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Shift+Enter'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'destructive' },
  'ports.group.rename': { title: '重命名端口组', group: '端口', layer: 'ports', shortcutIds: ['Shift+F2'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'data-write' },
  'ports.group.moveFolder': { title: '变更端口组分组夹', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+F2'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'data-write' },
  'ports.group.edit': { title: '编辑端口组', group: '端口', layer: 'ports', shortcutIds: ['F2', 'Ctrl+E'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'data-write' },
  'ports.group.delete': { title: '删除端口组/夹', group: '端口', layer: 'ports', shortcutIds: ['Delete', 'Backspace'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'data-write' },
  'ports.group.delete.force': { title: '强制删除端口组/夹', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130, risk: 'destructive' },
  'ports.groupFolder.create': { title: '新增分组夹', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+T'], when: "tab == 'ports' && (!textInputFocused || activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 129, risk: 'data-write' },
  'ports.group.createFromSelection': { title: '选中端口收藏为组', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+G'], when: "tab == 'ports' && (!textInputFocused || activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 120, risk: 'data-write' },
  'ports.groupTarget.toggle': { title: '折叠/展开端口组夹', group: '端口', layer: 'ports', shortcutIds: [], when: "tab == 'ports' && portPane == 'groups' && !portDrawerActive && !portGroupDetailActive && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 132 },
  'ports.groupTarget.collapse': { title: '折叠端口组夹', group: '端口', layer: 'ports', shortcutIds: ['ArrowLeft'], when: "tab == 'ports' && portPane == 'groups' && !portDrawerActive && !portGroupDetailActive && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 132 },
  'ports.groupTarget.expand': { title: '展开端口组夹', group: '端口', layer: 'ports', shortcutIds: ['ArrowRight'], when: "tab == 'ports' && portPane == 'groups' && !portDrawerActive && !portGroupDetailActive && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 132 },
  'ports.groupDetail.open': { title: '打开端口组详情抽屉', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'ports' && portPane == 'groups' && !confirmOpen && !portGroupDetailActive && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 131 },
  'ports.groupDetail.close': { title: '关闭端口组详情抽屉', group: '端口', layer: 'port-group-detail', shortcutIds: ['ArrowRight', 'Escape'], when: "tab == 'ports' && portGroupDetailActive", weight: 400 },
  'ports.drawer.open': { title: '打开端口动作抽屉', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'ports' && !confirmOpen && !portDrawerActive && (!textInputFocused || activeInputRole == 'port-search' || activeInputRole == 'port-group-search')", weight: 130 },
  'ports.drawer.close': { title: '关闭端口动作抽屉', group: '端口', layer: 'port-drawer', shortcutIds: ['ArrowLeft', 'Escape'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.detail.open': { title: '打开端口详情抽屉', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'ports' && portPane != 'groups' && !confirmOpen && !portDetailActive && (!textInputFocused || activeInputRole == 'port-search')", weight: 130 },
  'ports.detail.close': { title: '关闭端口详情抽屉', group: '端口', layer: 'port-detail', shortcutIds: ['ArrowRight', 'Escape'], when: "tab == 'ports' && portDetailActive", weight: 400 },
  'ports.drawer.next': { title: '抽屉内下移', group: '端口', layer: 'port-drawer', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.prev': { title: '抽屉内上移', group: '端口', layer: 'port-drawer', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.select': { title: '执行抽屉当前动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Enter'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'favorites.pane.toggleNext': { title: '切换收藏栏', group: '收藏', layer: 'favorites', shortcutIds: ['Tab'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 130 },
  'favorites.pane.togglePrev': { title: '反向切换收藏栏', group: '收藏', layer: 'favorites', shortcutIds: ['Shift+Tab'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 130 },
  'favorites.search.focus': { title: '聚焦收藏搜索', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+F'], when: "tab == 'favorites' && !confirmOpen", weight: 140 },
  'favorites.groupSearch.focus': { title: '聚焦收藏分组搜索', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Shift+F'], when: "tab == 'favorites' && !favoriteQuickMode && !confirmOpen", weight: 140 },
  'favorites.group.apply': { title: '应用收藏分组', group: '收藏', layer: 'favorites', shortcutIds: ['Enter'], when: "tab == 'favorites' && favoritePane == 'containers' && (!textInputFocused || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers')", weight: 130 },
  'favorites.target.create': { title: '新增收藏目标', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+N'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search')", weight: 129, risk: 'data-write' },
  'favorites.pick.files': { title: '选择文件并进入收藏审核', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+O'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search')", weight: 129, risk: 'data-write' },
  'favorites.pick.folders': { title: '选择文件夹并进入收藏审核', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Shift+O'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search')", weight: 128, risk: 'data-write' },
  'favorites.group.create': { title: '新增收藏分组', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+G', 'Ctrl+T'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items')", weight: 129, risk: 'data-write' },
  'favorites.group.moveParent': { title: '移动收藏父级', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+F2'], when: "tab == 'favorites' && (favoritePane == 'containers' || favoritePane == 'items') && (!textInputFocused || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items')", weight: 130, risk: 'data-write' },
  'favorites.group.collapse': { title: '折叠收藏分组', group: '收藏', layer: 'favorites', shortcutIds: ['ArrowLeft'], when: "tab == 'favorites' && favoritePane == 'containers' && (!textInputFocused || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers')", weight: 132 },
  'favorites.group.expand': { title: '展开收藏分组', group: '收藏', layer: 'favorites', shortcutIds: ['ArrowRight'], when: "tab == 'favorites' && favoritePane == 'containers' && (!textInputFocused || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers')", weight: 132 },
  'favorites.open': { title: '打开收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Enter'], when: "tab == 'favorites' && (favoritePane == 'items' || favoritePane == 'directory') && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 120 },
  'favorites.reveal': { title: '定位收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Enter'], when: "tab == 'favorites' && (favoritePane == 'items' || favoritePane == 'directory') && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 120 },
  'favorites.copyPath': { title: '复制收藏路径', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+C'], when: "tab == 'favorites' && (favoritePane == 'items' || favoritePane == 'directory') && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 121 },
  'favorites.copyItems': { title: '复制真实文件或文件夹', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Shift+C'], when: "tab == 'favorites' && (favoritePane == 'items' || favoritePane == 'directory') && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 122 },
  'favorites.refresh': { title: '刷新目录和路径状态', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+R'], when: "tab == 'favorites' && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory')", weight: 125 },
  'favorites.containers.togglePanel': { title: '展开或收起收藏容器栏', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Shift+W'], when: "tab == 'favorites' && !favoriteQuickMode && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items')", weight: 125 },
  'favorites.remove.undo': { title: '撤销移出收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Z'], when: "tab == 'favorites' && !favoriteQuickMode && favoriteUndoAvailable && !textInputFocused", weight: 126, risk: 'data-write' },
  'favorites.remove': { title: '移出收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Delete', 'Backspace'], when: "tab == 'favorites' && !favoriteQuickMode && (favoritePane == 'containers' || favoritePane == 'items') && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items')", weight: 120, risk: 'data-write' },
  'favorites.remove.force': { title: '直接移出收藏元数据', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'favorites' && !favoriteQuickMode && (favoritePane == 'containers' || favoritePane == 'items') && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-items')", weight: 120, risk: 'destructive' },
  'favorites.edit': { title: '编辑收藏', group: '收藏', layer: 'favorites', shortcutIds: ['F2'], when: "tab == 'favorites' && !favoriteQuickMode && (favoritePane == 'containers' || favoritePane == 'items') && (!textInputFocused || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items')", weight: 120, risk: 'data-write' },
  'favorites.rename': { title: '重命名收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Shift+F2'], when: "tab == 'favorites' && !favoriteQuickMode && (favoritePane == 'containers' || favoritePane == 'items') && (!textInputFocused || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-containers' || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-items')", weight: 120, risk: 'data-write' },
  'favorites.save': { title: '保存收藏编辑', group: '收藏', layer: 'favorites-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'favorites' && activeInputRole == 'favorite-editor'", weight: 400, risk: 'data-write' },
  'favorites.edit.nextField': { title: '收藏编辑下一个字段', group: '收藏', layer: 'favorites-editor', shortcutIds: ['Tab'], when: "tab == 'favorites' && activeInputRole == 'favorite-editor'", weight: 400 },
  'favorites.edit.prevField': { title: '收藏编辑上一个字段', group: '收藏', layer: 'favorites-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'favorites' && activeInputRole == 'favorite-editor'", weight: 400 },
  'favorites.pickReview.commit': { title: '保存点选收藏', group: '收藏', layer: 'favorites-pick-review', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'favorites' && (favoritePickReviewOpen || activeInputRole == 'favorite-pick-review')", weight: 420, risk: 'data-write' },
  'favorites.pickReview.cancel': { title: '取消点选收藏', group: '收藏', layer: 'favorites-pick-review', shortcutIds: ['Escape'], when: "tab == 'favorites' && (favoritePickReviewOpen || activeInputRole == 'favorite-pick-review')", weight: 420 },
  'favorites.pickReview.next': { title: '点选审核下一个项目', group: '收藏', layer: 'favorites-pick-review', shortcutIds: ['Tab', 'ArrowDown'], when: "tab == 'favorites' && (favoritePickReviewOpen || activeInputRole == 'favorite-pick-review')", weight: 410 },
  'favorites.pickReview.prev': { title: '点选审核上一个项目', group: '收藏', layer: 'favorites-pick-review', shortcutIds: ['Shift+Tab', 'ArrowUp'], when: "tab == 'favorites' && (favoritePickReviewOpen || activeInputRole == 'favorite-pick-review')", weight: 410 },
  'favorites.search.blur': { title: '退出收藏搜索焦点', group: '收藏', layer: 'favorites-search', shortcutIds: ['Escape'], when: "tab == 'favorites' && (activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search')", weight: 500 },
  'favorites.cancel': { title: '取消收藏编辑', group: '收藏', layer: 'favorites-editor', shortcutIds: ['Escape'], when: "tab == 'favorites' && activeInputRole == 'favorite-editor'", weight: 400 },
  'favorites.detail.open': { title: '打开收藏详情', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'favorites' && !confirmOpen && !favoriteDetailActive && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory' || activeInputRole == 'favorite-containers')", weight: 130 },
  'favorites.detail.close': { title: '关闭收藏详情', group: '收藏', layer: 'favorite-detail', shortcutIds: ['ArrowRight', 'Escape'], when: "tab == 'favorites' && favoriteDetailActive", weight: 400 },
  'favorites.drawer.open': { title: '打开收藏动作抽屉', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'favorites' && !confirmOpen && !favoriteDrawerActive && (!textInputFocused || activeInputRole == 'favorite-search' || activeInputRole == 'favorite-group-search' || activeInputRole == 'favorite-items' || activeInputRole == 'favorite-directory' || activeInputRole == 'favorite-containers')", weight: 130 },
  'favorites.drawer.close': { title: '关闭收藏动作抽屉', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['ArrowLeft', 'Escape'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.next': { title: '收藏抽屉内下移', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.prev': { title: '收藏抽屉内上移', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select': { title: '执行收藏抽屉当前动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Enter'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'ports.drawer.select.1': { title: '执行抽屉第 1 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+1'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.1': { title: '直接执行第 1 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+1'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.2': { title: '执行抽屉第 2 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+2'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.2': { title: '直接执行第 2 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+2'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.3': { title: '执行抽屉第 3 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+3'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.3': { title: '直接执行第 3 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+3'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.4': { title: '执行抽屉第 4 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+4'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.4': { title: '直接执行第 4 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+4'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.5': { title: '执行抽屉第 5 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+5'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.5': { title: '直接执行第 5 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+5'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.6': { title: '执行抽屉第 6 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+6'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.6': { title: '直接执行第 6 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+6'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.7': { title: '执行抽屉第 7 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+7'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.7': { title: '直接执行第 7 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+7'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.8': { title: '执行抽屉第 8 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+8'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.8': { title: '直接执行第 8 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+8'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'ports.drawer.select.9': { title: '执行抽屉第 9 个动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Ctrl+9'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  'ports.drawer.action.9': { title: '直接执行第 9 个端口动作', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Alt+9'], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 },
  'mqtt.connection.connect': { title: '连接/重连 MQTT', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+R'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 150, profileId: 'mqtt' },
  'mqtt.connection.disconnect': { title: '断开 MQTT', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+R'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 150, profileId: 'mqtt' },
  'mqtt.config.create': { title: '新建 MQTT 连接配置', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+N'], when: "tab == 'mqtt' && mqttPanelOpen && !confirmOpen && (activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-connections' || (!textInputFocused && (!activeInputRole || activeInputRole == 'mqtt-subscriptions')))", weight: 140, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connectionGroup.create': { title: '新建 MQTT 连接分组', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+G'], when: "tab == 'mqtt' && mqttPanelOpen && !confirmOpen && (activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-connections' || (!textInputFocused && (!activeInputRole || activeInputRole == 'mqtt-subscriptions')))", weight: 141, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.pane.next': { title: '切换 MQTT 区域', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Tab'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 151, profileId: 'mqtt' },
  'mqtt.pane.prev': { title: '反向切换 MQTT 区域', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 151, profileId: 'mqtt' },
  'mqtt.config.edit': { title: '编辑 MQTT 连接配置', group: 'MQTT', layer: 'mqtt', shortcutIds: ['F2'], when: "tab == 'mqtt' && mqttPane == 'connections' && mqttTargetKind != 'connection-group' && !confirmOpen && !textInputFocused", weight: 140, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.config.rename': { title: '重命名 MQTT 连接配置', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Shift+F2'], when: "tab == 'mqtt' && mqttPane == 'connections' && mqttTargetKind != 'connection-group' && !confirmOpen && !textInputFocused", weight: 140, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connectionGroup.edit': { title: '编辑 MQTT 连接分组', group: 'MQTT', layer: 'mqtt', shortcutIds: ['F2'], when: "tab == 'mqtt' && mqttPane == 'connections' && mqttTargetKind == 'connection-group' && !confirmOpen && !textInputFocused", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connectionGroup.rename': { title: '重命名 MQTT 连接分组', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Shift+F2'], when: "tab == 'mqtt' && mqttPane == 'connections' && mqttTargetKind == 'connection-group' && !confirmOpen && !textInputFocused", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connectionGroup.moveParent': { title: '移动 MQTT 连接分组父级', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+F2'], when: "tab == 'mqtt' && mqttPane == 'connections' && mqttTargetKind == 'connection-group' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-connections')", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connection.toggleSelect': { title: '多选 MQTT 连接', group: 'MQTT', layer: 'mqtt-connections', shortcutIds: ['Space'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connections'", weight: 430, profileId: 'mqtt' },
  'mqtt.connection.copyAddress': { title: '复制 MQTT 连接地址', group: 'MQTT', layer: 'mqtt-connections', shortcutIds: ['Ctrl+C'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connections'", weight: 430, profileId: 'mqtt' },
  'mqtt.connection.delete': { title: '删除当前 MQTT 连接', group: 'MQTT', layer: 'mqtt-connections', shortcutIds: ['Delete', 'Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connections'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connection.deleteSelected': { title: '删除选中 MQTT 连接', group: 'MQTT', layer: 'mqtt-connections', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connections'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connectionGroup.collapse': { title: '折叠 MQTT 连接分组', group: 'MQTT', layer: 'mqtt-connections', shortcutIds: ['ArrowLeft'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connections'", weight: 430, profileId: 'mqtt' },
  'mqtt.connectionGroup.expand': { title: '展开 MQTT 连接分组', group: 'MQTT', layer: 'mqtt-connections', shortcutIds: ['ArrowRight'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connections'", weight: 430, profileId: 'mqtt' },
  'mqtt.connectionGroup.save': { title: '保存 MQTT 连接分组', group: 'MQTT', layer: 'mqtt-connection-group-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connection-group-editor'", weight: 420, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.connectionGroup.cancel': { title: '取消 MQTT 分组编辑', group: 'MQTT', layer: 'mqtt-connection-group-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connection-group-editor'", weight: 420, profileId: 'mqtt' },
  'mqtt.connectionGroup.nextField': { title: 'MQTT 分组编辑下一个字段', group: 'MQTT', layer: 'mqtt-connection-group-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connection-group-editor'", weight: 420, profileId: 'mqtt' },
  'mqtt.connectionGroup.prevField': { title: 'MQTT 分组编辑上一个字段', group: 'MQTT', layer: 'mqtt-connection-group-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-connection-group-editor'", weight: 420, profileId: 'mqtt' },
  'mqtt.config.save': { title: '保存 MQTT 配置编辑', group: 'MQTT', layer: 'mqtt-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'mqtt' && (activeInputRole == 'mqtt-editor' || activeInputRole == 'mqtt-config-subscription-editor' || activeInputRole == 'mqtt-config-publish-editor')", weight: 420, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.config.cancel': { title: '取消 MQTT 配置编辑', group: 'MQTT', layer: 'mqtt-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && (activeInputRole == 'mqtt-editor' || activeInputRole == 'mqtt-config-subscription-editor' || activeInputRole == 'mqtt-config-publish-editor')", weight: 420, profileId: 'mqtt' },
  'mqtt.config.nextField': { title: 'MQTT 编辑下一个字段', group: 'MQTT', layer: 'mqtt-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && (activeInputRole == 'mqtt-editor' || activeInputRole == 'mqtt-config-subscription-editor' || activeInputRole == 'mqtt-config-publish-editor')", weight: 420, profileId: 'mqtt' },
  'mqtt.config.prevField': { title: 'MQTT 编辑上一个字段', group: 'MQTT', layer: 'mqtt-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && (activeInputRole == 'mqtt-editor' || activeInputRole == 'mqtt-config-subscription-editor' || activeInputRole == 'mqtt-config-publish-editor')", weight: 420, profileId: 'mqtt' },
  'mqtt.config.subscription.nextRow': { title: 'MQTT 配置订阅下一行', group: 'MQTT', layer: 'mqtt-config-subscription-editor', shortcutIds: ['ArrowDown'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-config-subscription-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.config.subscription.prevRow': { title: 'MQTT 配置订阅上一行', group: 'MQTT', layer: 'mqtt-config-subscription-editor', shortcutIds: ['ArrowUp'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-config-subscription-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.config.subscription.deleteRow': { title: '删除 MQTT 配置订阅行', group: 'MQTT', layer: 'mqtt-config-subscription-editor', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-config-subscription-editor'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.config.publish.nextRow': { title: 'MQTT 配置发布下一行', group: 'MQTT', layer: 'mqtt-config-publish-editor', shortcutIds: ['ArrowDown'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-config-publish-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.config.publish.prevRow': { title: 'MQTT 配置发布上一行', group: 'MQTT', layer: 'mqtt-config-publish-editor', shortcutIds: ['ArrowUp'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-config-publish-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.config.publish.deleteRow': { title: '删除 MQTT 配置发布行', group: 'MQTT', layer: 'mqtt-config-publish-editor', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-config-publish-editor'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.rename': { title: '编辑 MQTT 记录别名', group: 'MQTT', layer: 'mqtt', shortcutIds: ['F2'], when: "tab == 'mqtt' && mqttPane != 'connections' && !confirmOpen && !textInputFocused", weight: 135, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.edit': { title: '完整编辑 MQTT 记录', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Shift+F2'], when: "tab == 'mqtt' && mqttPane != 'connections' && !confirmOpen && !textInputFocused", weight: 135, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.edit.save': { title: '保存 MQTT 记录编辑', group: 'MQTT', layer: 'mqtt-record-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-record-editor'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.edit.cancel': { title: '取消 MQTT 记录编辑', group: 'MQTT', layer: 'mqtt-record-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-record-editor'", weight: 450, profileId: 'mqtt' },
  'mqtt.record.edit.nextField': { title: 'MQTT 记录编辑下一个字段', group: 'MQTT', layer: 'mqtt-record-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-record-editor'", weight: 450, profileId: 'mqtt' },
  'mqtt.record.edit.prevField': { title: 'MQTT 记录编辑上一个字段', group: 'MQTT', layer: 'mqtt-record-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-record-editor'", weight: 450, profileId: 'mqtt' },
  'mqtt.record.delete': { title: '删除 MQTT 记录', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 135, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.subscription.add': { title: '新增 MQTT 订阅', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+T'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 134, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.subscription.editor.open': { title: '管理 MQTT 订阅', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['F2'], when: "tab == 'mqtt' && mqttPane == 'subscriptions' && activeInputRole == 'mqtt-subscriptions' && !confirmOpen", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.subscription.editor.save': { title: '保存 MQTT 订阅编辑', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.subscription.editor.cancel': { title: '取消 MQTT 订阅编辑', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, profileId: 'mqtt' },
  'mqtt.subscription.editor.nextField': { title: 'MQTT 订阅编辑下一个字段', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, profileId: 'mqtt' },
  'mqtt.subscription.editor.prevField': { title: 'MQTT 订阅编辑上一个字段', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, profileId: 'mqtt' },
  'mqtt.subscription.editor.nextRow': { title: 'MQTT 订阅编辑下一行', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['ArrowDown'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, profileId: 'mqtt' },
  'mqtt.subscription.editor.prevRow': { title: 'MQTT 订阅编辑上一行', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['ArrowUp'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, profileId: 'mqtt' },
  'mqtt.subscription.editor.deleteRow': { title: '删除 MQTT 订阅编辑行', group: 'MQTT', layer: 'mqtt-subscription-editor', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscription-editor'", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.favorite.save': { title: '保存 MQTT 收藏别名', group: 'MQTT', layer: 'mqtt-favorite-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-favorite-editor'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.favorite.cancel': { title: '取消 MQTT 收藏别名', group: 'MQTT', layer: 'mqtt-favorite-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-favorite-editor'", weight: 450, profileId: 'mqtt' },
  'mqtt.record.favorite.nextField': { title: 'MQTT 收藏别名下一个字段', group: 'MQTT', layer: 'mqtt-favorite-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-favorite-editor'", weight: 450, profileId: 'mqtt' },
  'mqtt.record.favorite.prevField': { title: 'MQTT 收藏别名上一个字段', group: 'MQTT', layer: 'mqtt-favorite-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-favorite-editor'", weight: 450, profileId: 'mqtt' },
  'mqtt.subscription.panel.toggle': { title: '折叠/展开 MQTT 订阅栏', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+T'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 139, profileId: 'mqtt' },
  'mqtt.subscription.toggleSelect': { title: '多选 MQTT 订阅', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['Space'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 430, profileId: 'mqtt' },
  'mqtt.subscription.applyFilter': { title: '应用 MQTT 订阅筛选', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 430, profileId: 'mqtt' },
  'mqtt.subscription.copyTopic': { title: '复制 MQTT 订阅 topic', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['Ctrl+C'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 430, profileId: 'mqtt' },
  'mqtt.subscription.useAsPublishTopic': { title: '填入 MQTT 发布 topic', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 430, profileId: 'mqtt' },
  'mqtt.subscription.delete': { title: '删除当前 MQTT 订阅', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['Delete', 'Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.subscription.deleteSelected': { title: '删除选中 MQTT 订阅', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.subscription.clearAll': { title: '清空 MQTT 订阅', group: 'MQTT', layer: 'mqtt-subscriptions', shortcutIds: [], when: "tab == 'mqtt' && activeInputRole == 'mqtt-subscriptions'", weight: 420, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.layout.toggle': { title: '切换 MQTT 收发布局', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+S'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 138, profileId: 'mqtt' },
  'mqtt.log.drawer.open': { title: '打开 MQTT 日志抽屉', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen && !mqttLogDrawerOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 137, profileId: 'mqtt' },
  'mqtt.log.drawer.close': { title: '关闭 MQTT 日志抽屉', group: 'MQTT', layer: 'mqtt-log-drawer', shortcutIds: ['Escape'], when: "tab == 'mqtt' && mqttLogDrawerOpen", weight: 410, profileId: 'mqtt' },
  'mqtt.receive.filter.all': { title: 'MQTT 接收筛选全部', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+1'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 136, profileId: 'mqtt' },
  'mqtt.receive.filter.in': { title: 'MQTT 接收筛选已接收', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+2'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 136, profileId: 'mqtt' },
  'mqtt.receive.filter.out': { title: 'MQTT 接收筛选已发送', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+3'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 136, profileId: 'mqtt' },
  'mqtt.topicFilter.focus': { title: '聚焦 MQTT topic 筛选', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+F'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 137, profileId: 'mqtt' },
  'mqtt.topicFilter.next': { title: 'MQTT topic 筛选下移', group: 'MQTT', layer: 'mqtt-topic-filter', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-topic-filter'", weight: 430, profileId: 'mqtt' },
  'mqtt.topicFilter.prev': { title: 'MQTT topic 筛选上移', group: 'MQTT', layer: 'mqtt-topic-filter', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-topic-filter'", weight: 430, profileId: 'mqtt' },
  'mqtt.topicFilter.select': { title: '选择 MQTT topic 筛选', group: 'MQTT', layer: 'mqtt-topic-filter', shortcutIds: ['Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-topic-filter'", weight: 430, profileId: 'mqtt' },
  'mqtt.topicFilter.close': { title: '关闭 MQTT topic 筛选', group: 'MQTT', layer: 'mqtt-topic-filter', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-topic-filter'", weight: 430, profileId: 'mqtt' },
  'mqtt.topicFilter.search.set': { title: '更新 MQTT topic 筛选搜索', group: 'MQTT', layer: 'mqtt-topic-filter', shortcutIds: [], when: "tab == 'mqtt'", weight: 120, profileId: 'mqtt' },
  'mqtt.publish.send': { title: '发送 MQTT 消息', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Enter'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor')", weight: 150, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.toggle': { title: '打开/关闭 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+H'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-publish-draft')", weight: 137, profileId: 'mqtt' },
  'mqtt.publish.draft.saveDraft': { title: '保存当前 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+H'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-publish-draft')", weight: 137, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.records.toggle': { title: '打开/关闭 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen", weight: 100, profileId: 'mqtt' },
  'mqtt.focus.messages': { title: '聚焦 MQTT 消息区', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen", weight: 120, profileId: 'mqtt' },
  'mqtt.focus.templates': { title: '聚焦 MQTT 收藏区', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+M'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options' || activeInputRole == 'mqtt-publish-draft')", weight: 136, profileId: 'mqtt' },
  'mqtt.focus.publish': { title: '聚焦 MQTT 发送区', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+P'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options')", weight: 136, profileId: 'mqtt' },
  'mqtt.publish.blur': { title: '退出 MQTT 发送编辑', group: 'MQTT', layer: 'mqtt-publish-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-editor'", weight: 430, internal: true, profileId: 'mqtt' },
  'mqtt.publish.nextField': { title: 'MQTT 发送编辑下一个字段', group: 'MQTT', layer: 'mqtt-publish-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.publish.prevField': { title: 'MQTT 发送编辑上一个字段', group: 'MQTT', layer: 'mqtt-publish-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.publish.options.open': { title: '编辑 MQTT 发送选项', group: 'MQTT', layer: 'mqtt-publish-editor', shortcutIds: [], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-editor'", weight: 430, profileId: 'mqtt' },
  'mqtt.publish.options.close': { title: '关闭 MQTT 发送选项', group: 'MQTT', layer: 'mqtt-publish-options', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-options'", weight: 440, profileId: 'mqtt' },
  'mqtt.publish.options.next': { title: 'MQTT 发送选项下移', group: 'MQTT', layer: 'mqtt-publish-options', shortcutIds: ['ArrowDown', 'Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-options'", weight: 440, profileId: 'mqtt' },
  'mqtt.publish.options.prev': { title: 'MQTT 发送选项上移', group: 'MQTT', layer: 'mqtt-publish-options', shortcutIds: ['ArrowUp', 'Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-options'", weight: 440, profileId: 'mqtt' },
  'mqtt.publish.options.select': { title: '选择 MQTT 发送选项', group: 'MQTT', layer: 'mqtt-publish-options', shortcutIds: ['Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-options'", weight: 440, profileId: 'mqtt' },
  'mqtt.publish.draft.close': { title: '关闭 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, profileId: 'mqtt' },
  'mqtt.publish.draft.next': { title: 'MQTT 发送草稿下移', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, profileId: 'mqtt' },
  'mqtt.publish.draft.prev': { title: 'MQTT 发送草稿上移', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, profileId: 'mqtt' },
  'mqtt.publish.draft.apply': { title: '应用 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, profileId: 'mqtt' },
  'mqtt.publish.draft.send': { title: '发送 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.toggleSelect': { title: '多选 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Space'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, profileId: 'mqtt' },
  'mqtt.publish.draft.favorite': { title: '收藏 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Ctrl+S'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.focus': { title: '聚焦 MQTT 发送草稿项', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: [], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 440, profileId: 'mqtt' },
  'mqtt.publish.draft.edit': { title: '完整编辑 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Shift+F2'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.rename': { title: '编辑 MQTT 发送草稿别名', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['F2'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.edit.save': { title: '保存 MQTT 发送草稿编辑', group: 'MQTT', layer: 'mqtt-publish-draft-editor', shortcutIds: ['Ctrl+S', 'Ctrl+Enter'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft-editor'", weight: 460, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.edit.cancel': { title: '取消 MQTT 发送草稿编辑', group: 'MQTT', layer: 'mqtt-publish-draft-editor', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft-editor'", weight: 460, profileId: 'mqtt' },
  'mqtt.publish.draft.edit.nextField': { title: 'MQTT 发送草稿编辑下一个字段', group: 'MQTT', layer: 'mqtt-publish-draft-editor', shortcutIds: ['Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft-editor'", weight: 460, profileId: 'mqtt' },
  'mqtt.publish.draft.edit.prevField': { title: 'MQTT 发送草稿编辑上一个字段', group: 'MQTT', layer: 'mqtt-publish-draft-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft-editor'", weight: 460, profileId: 'mqtt' },
  'mqtt.publish.draft.delete': { title: '删除 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: ['Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 450, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.draft.clear': { title: '清空 MQTT 发送草稿', group: 'MQTT', layer: 'mqtt-publish-draft', shortcutIds: [], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-draft'", weight: 440, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.template.save': { title: '保存 MQTT 发送模板', group: 'MQTT', layer: 'mqtt-publish-editor', shortcutIds: ['Ctrl+S'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-publish-editor'", weight: 430, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.template.apply': { title: '应用 MQTT 发送模板', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen", weight: 120, profileId: 'mqtt' },
  'mqtt.publish.template.send': { title: '直接发送 MQTT 模板', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen", weight: 120, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.template.rename': { title: '重命名 MQTT 发送模板', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen", weight: 120, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.publish.template.delete': { title: '删除 MQTT 发送模板', group: 'MQTT', layer: 'mqtt', shortcutIds: [], when: "tab == 'mqtt' && !confirmOpen", weight: 120, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.resendDraft': { title: '从 MQTT 记录填充发布草稿', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Enter'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 130, profileId: 'mqtt' },
  'mqtt.record.favorite': { title: '收藏/取消收藏 MQTT 消息', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+S'], when: "tab == 'mqtt' && !confirmOpen && !textInputFocused", weight: 132, risk: 'data-write', profileId: 'mqtt' },
  'mqtt.record.copyTopic': { title: '复制 MQTT topic', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+C'], when: "tab == 'mqtt' && !confirmOpen && !textInputFocused", weight: 132, profileId: 'mqtt' },
  'mqtt.record.copyPayload': { title: '复制 MQTT payload', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+C'], when: "tab == 'mqtt' && !confirmOpen && !textInputFocused", weight: 132, profileId: 'mqtt' },
  'mqtt.preview.open': { title: '打开 MQTT 预览', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+I'], when: "tab == 'mqtt' && !confirmOpen && !textInputFocused", weight: 131, profileId: 'mqtt' },
  'mqtt.search.focus': { title: '聚焦 MQTT 搜索', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+F'], when: "tab == 'mqtt' && !confirmOpen", weight: 151, profileId: 'mqtt' },
  'mqtt.search.blur': { title: '退出 MQTT 搜索焦点', group: 'MQTT', layer: 'mqtt-search', shortcutIds: ['Escape'], when: "tab == 'mqtt' && activeInputRole == 'mqtt-search'", weight: 500, profileId: 'mqtt' },
  'mqtt.panel.toggle': { title: '折叠/展开 MQTT 侧栏', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Shift+W'], when: "tab == 'mqtt' && !confirmOpen && (!textInputFocused || activeInputRole == 'mqtt-search' || activeInputRole == 'mqtt-publish-editor' || activeInputRole == 'mqtt-topic-filter' || activeInputRole == 'mqtt-publish-options')", weight: 140, profileId: 'mqtt' },
  'mqtt.detail.open': { title: '打开 MQTT 详情', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'mqtt' && !confirmOpen && !mqttDetailActive && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 130, profileId: 'mqtt' },
  'mqtt.detail.close': { title: '关闭 MQTT 详情', group: 'MQTT', layer: 'mqtt-detail', shortcutIds: ['ArrowRight', 'Escape'], when: "tab == 'mqtt' && mqttDetailActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.open': { title: '打开 MQTT 动作抽屉', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'mqtt' && !confirmOpen && !mqttDrawerActive && (!textInputFocused || activeInputRole == 'mqtt-search')", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.close': { title: '关闭 MQTT 动作抽屉', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['ArrowLeft', 'Escape'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.next': { title: 'MQTT 抽屉内下移', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.prev': { title: 'MQTT 抽屉内上移', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.select': { title: '执行 MQTT 抽屉当前动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Enter'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.preview.close': { title: '关闭 MQTT 预览', group: 'MQTT', layer: 'mqtt-preview', shortcutIds: ['Escape'], when: "tab == 'mqtt' && mqttPreviewOpen", weight: 410, profileId: 'mqtt' },
  'mqtt.preview.scroll.up': { title: 'MQTT 预览上滚', group: 'MQTT', layer: 'mqtt-preview', shortcutIds: ['Shift+ArrowUp'], when: "tab == 'mqtt' && mqttPreviewOpen", weight: 410, profileId: 'mqtt' },
  'mqtt.preview.scroll.down': { title: 'MQTT 预览下滚', group: 'MQTT', layer: 'mqtt-preview', shortcutIds: ['Shift+ArrowDown'], when: "tab == 'mqtt' && mqttPreviewOpen", weight: 410, profileId: 'mqtt' },
  'mqtt.drawer.select.1': { title: '执行 MQTT 抽屉第 1 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+1'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.1': { title: '直接执行第 1 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+1'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.2': { title: '执行 MQTT 抽屉第 2 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+2'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.2': { title: '直接执行第 2 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+2'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.3': { title: '执行 MQTT 抽屉第 3 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+3'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.3': { title: '直接执行第 3 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+3'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.4': { title: '执行 MQTT 抽屉第 4 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+4'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.4': { title: '直接执行第 4 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+4'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.5': { title: '执行 MQTT 抽屉第 5 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+5'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.5': { title: '直接执行第 5 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+5'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.6': { title: '执行 MQTT 抽屉第 6 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+6'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.6': { title: '直接执行第 6 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+6'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.7': { title: '执行 MQTT 抽屉第 7 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+7'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.7': { title: '直接执行第 7 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+7'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.8': { title: '执行 MQTT 抽屉第 8 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+8'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.8': { title: '直接执行第 8 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+8'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'mqtt.drawer.select.9': { title: '执行 MQTT 抽屉第 9 个动作', group: 'MQTT', layer: 'mqtt-drawer', shortcutIds: ['Ctrl+9'], when: "tab == 'mqtt' && mqttDrawerActive", weight: 420, profileId: 'mqtt' },
  'mqtt.drawer.action.9': { title: '直接执行第 9 个 MQTT 动作', group: 'MQTT', layer: 'mqtt', shortcutIds: ['Ctrl+Alt+9'], when: "tab == 'mqtt' && !mqttDrawerActive && !textInputFocused", weight: 130, profileId: 'mqtt' },
  'favorites.drawer.select.1': { title: '执行收藏抽屉第 1 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+1'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.2': { title: '执行收藏抽屉第 2 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+2'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.3': { title: '执行收藏抽屉第 3 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+3'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.4': { title: '执行收藏抽屉第 4 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+4'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.5': { title: '执行收藏抽屉第 5 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+5'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.6': { title: '执行收藏抽屉第 6 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+6'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.7': { title: '执行收藏抽屉第 7 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+7'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.8': { title: '执行收藏抽屉第 8 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+8'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 },
  'favorites.drawer.select.9': { title: '执行收藏抽屉第 9 个动作', group: '收藏', layer: 'favorites-drawer', shortcutIds: ['Ctrl+9'], when: "tab == 'favorites' && favoriteDrawerActive", weight: 400 }
} as const satisfies Record<string, ShortcutCommandProfileConfig>

export const DEFAULT_SHORTCUTS_BY_COMMAND: Record<string, string[]> = Object.fromEntries(
  Object.entries(DEFAULT_SHORTCUT_PROFILES_BY_COMMAND).map(([commandId, profile]) => [commandId, [...profile.shortcutIds]])
)

const DEFAULT_COMMAND_PROFILES: ShortcutCommandProfile[] = Object.entries(DEFAULT_SHORTCUT_PROFILES_BY_COMMAND).map(([actionId, profile]) => ({
  actionId,
  ...profile,
  shortcutIds: [...profile.shortcutIds]
}))

function featureTabProfiles(featureConfigs?: FeatureConfig[]): ShortcutCommandProfile[] {
  return visibleFeatures(featureConfigs).flatMap((feature) => {
    if (feature.shortcutCommandId !== `tab.select.${feature.id}`) return []
    return [{
    actionId: feature.shortcutCommandId,
    title: `切到${feature.title}`,
    group: '全局',
    layer: 'global',
    shortcutIds: [feature.shortcutId],
    when: '!textInputFocused',
    weight: 100
    }]
  })
}

export const SHORTCUT_RESERVATION_RULES: ShortcutReservationRule[] = [
  { shortcutId: 'Shift+Escape', commandId: 'app.hide', when: 'true', description: '全局立即隐藏插件窗口', layer: 'app' },
  { shortcutId: 'Ctrl+Alt+Enter', commandId: 'codex.float.activate', when: 'true', description: '显示、展开并进入 Codex 卡片', layer: 'app' },
  { shortcutId: 'Ctrl+Alt+Q', commandId: 'codex.float.toggle', when: 'true', description: '立即显示或隐藏 Codex 悬浮球', layer: 'app' },
  { shortcutId: 'Escape', commandId: 'confirm.cancel', when: 'confirmOpen', description: '关闭确认弹窗，不穿透到底层', layer: 'confirm' },
  { shortcutId: 'Escape', commandId: 'ports.group.edit.cancel', when: "activeInputRole == 'port-group-editor'", description: '取消端口组编辑', layer: 'port-group-editor' },
  { shortcutId: 'Escape', commandId: 'ports.search.blur', when: "activeInputRole == 'port-search' || activeInputRole == 'port-group-search'", description: '退出端口搜索输入焦点', layer: 'ports-search' },
  { shortcutId: 'Ctrl+S', commandId: 'ports.group.save', when: "activeInputRole == 'port-group-editor'", description: '保存端口组编辑', layer: 'port-group-editor' },
  { shortcutId: 'Ctrl+Enter', commandId: 'ports.group.save', when: "activeInputRole == 'port-group-editor'", description: '保存端口组编辑', layer: 'port-group-editor' },
  { shortcutId: 'Tab', commandId: 'ports.group.edit.nextField', when: "activeInputRole == 'port-group-editor'", description: '编辑层内字段循环，不切换底层 pane', layer: 'port-group-editor' },
  { shortcutId: 'Shift+Tab', commandId: 'ports.group.edit.prevField', when: "activeInputRole == 'port-group-editor'", description: '编辑层内反向字段循环，不切换底层 pane', layer: 'port-group-editor' },
  { shortcutId: 'Escape', commandId: 'ports.drawer.close', when: 'portDrawerActive', description: '关闭端口动作抽屉', layer: 'port-drawer' },
  { shortcutId: 'Escape', commandId: 'favorites.drawer.close', when: 'favoriteDrawerActive', description: '关闭收藏动作抽屉', layer: 'favorites-drawer' },
  { shortcutId: 'Escape', commandId: 'ports.detail.close', when: 'portDetailActive', description: '关闭端口详情抽屉', layer: 'port-detail' },
  { shortcutId: 'Escape', commandId: 'ports.groupDetail.close', when: 'portGroupDetailActive', description: '关闭端口组详情抽屉', layer: 'port-group-detail' },
  { shortcutId: 'Escape', commandId: 'ports.selection.clear', when: 'portSelectionMode', description: '清空端口多选', layer: 'ports-selection' },
  { shortcutId: 'Space', commandId: 'mqtt.connection.toggleSelect', when: "activeInputRole == 'mqtt-connections'", description: 'MQTT 连接栏切换多选', layer: 'mqtt-connections' },
  { shortcutId: 'Ctrl+C', commandId: 'mqtt.connection.copyAddress', when: "activeInputRole == 'mqtt-connections'", description: 'MQTT 连接栏复制连接地址', layer: 'mqtt-connections' },
  { shortcutId: 'Delete', commandId: 'mqtt.connection.delete', when: "activeInputRole == 'mqtt-connections'", description: 'MQTT 连接栏删除当前连接', layer: 'mqtt-connections' },
  { shortcutId: 'ArrowLeft', commandId: 'mqtt.connectionGroup.collapse', when: "activeInputRole == 'mqtt-connections'", description: 'MQTT 连接树折叠分组', layer: 'mqtt-connections' },
  { shortcutId: 'ArrowRight', commandId: 'mqtt.connectionGroup.expand', when: "activeInputRole == 'mqtt-connections'", description: 'MQTT 连接树展开分组', layer: 'mqtt-connections' },
  { shortcutId: 'Escape', commandId: 'mqtt.connectionGroup.cancel', when: "activeInputRole == 'mqtt-connection-group-editor'", description: '取消 MQTT 连接分组编辑', layer: 'mqtt-connection-group-editor' },
  { shortcutId: 'Ctrl+S', commandId: 'mqtt.connectionGroup.save', when: "activeInputRole == 'mqtt-connection-group-editor'", description: '保存 MQTT 连接分组', layer: 'mqtt-connection-group-editor' },
  { shortcutId: 'Ctrl+Enter', commandId: 'mqtt.connectionGroup.save', when: "activeInputRole == 'mqtt-connection-group-editor'", description: '保存 MQTT 连接分组', layer: 'mqtt-connection-group-editor' },
  { shortcutId: 'Tab', commandId: 'mqtt.connectionGroup.nextField', when: "activeInputRole == 'mqtt-connection-group-editor'", description: 'MQTT 分组编辑字段循环', layer: 'mqtt-connection-group-editor' },
  { shortcutId: 'Shift+Tab', commandId: 'mqtt.connectionGroup.prevField', when: "activeInputRole == 'mqtt-connection-group-editor'", description: 'MQTT 分组编辑反向字段循环', layer: 'mqtt-connection-group-editor' },
  { shortcutId: 'Space', commandId: 'mqtt.subscription.toggleSelect', when: "activeInputRole == 'mqtt-subscriptions'", description: 'MQTT 订阅栏切换多选', layer: 'mqtt-subscriptions' },
  { shortcutId: 'Enter', commandId: 'mqtt.subscription.applyFilter', when: "activeInputRole == 'mqtt-subscriptions'", description: 'MQTT 订阅栏应用筛选，不触发记录重发', layer: 'mqtt-subscriptions' },
  { shortcutId: 'Ctrl+C', commandId: 'mqtt.subscription.copyTopic', when: "activeInputRole == 'mqtt-subscriptions'", description: 'MQTT 订阅栏复制 topic', layer: 'mqtt-subscriptions' },
  { shortcutId: 'Ctrl+Enter', commandId: 'mqtt.subscription.useAsPublishTopic', when: "activeInputRole == 'mqtt-subscriptions'", description: 'MQTT 订阅栏把 topic 填入发布编辑', layer: 'mqtt-subscriptions' },
  { shortcutId: 'Delete', commandId: 'mqtt.subscription.delete', when: "activeInputRole == 'mqtt-subscriptions'", description: 'MQTT 订阅栏删除当前订阅', layer: 'mqtt-subscriptions' },
  { shortcutId: 'Escape', commandId: 'mqtt.subscription.editor.cancel', when: "activeInputRole == 'mqtt-subscription-editor'", description: '取消 MQTT 订阅编辑', layer: 'mqtt-subscription-editor' },
  { shortcutId: 'Ctrl+S', commandId: 'mqtt.subscription.editor.save', when: "activeInputRole == 'mqtt-subscription-editor'", description: '保存 MQTT 订阅编辑', layer: 'mqtt-subscription-editor' },
  { shortcutId: 'Ctrl+Enter', commandId: 'mqtt.subscription.editor.save', when: "activeInputRole == 'mqtt-subscription-editor'", description: '保存 MQTT 订阅编辑', layer: 'mqtt-subscription-editor' },
  { shortcutId: 'Tab', commandId: 'mqtt.subscription.editor.nextField', when: "activeInputRole == 'mqtt-subscription-editor'", description: 'MQTT 订阅编辑字段循环', layer: 'mqtt-subscription-editor' },
  { shortcutId: 'Shift+Tab', commandId: 'mqtt.subscription.editor.prevField', when: "activeInputRole == 'mqtt-subscription-editor'", description: 'MQTT 订阅编辑反向字段循环', layer: 'mqtt-subscription-editor' },
  { shortcutId: 'Escape', commandId: 'mqtt.record.favorite.cancel', when: "activeInputRole == 'mqtt-favorite-editor'", description: '取消 MQTT 收藏别名编辑', layer: 'mqtt-favorite-editor' },
  { shortcutId: 'Ctrl+S', commandId: 'mqtt.record.favorite.save', when: "activeInputRole == 'mqtt-favorite-editor'", description: '保存 MQTT 收藏别名', layer: 'mqtt-favorite-editor' },
  { shortcutId: 'Ctrl+Enter', commandId: 'mqtt.record.favorite.save', when: "activeInputRole == 'mqtt-favorite-editor'", description: '保存 MQTT 收藏别名', layer: 'mqtt-favorite-editor' },
  { shortcutId: 'Tab', commandId: 'mqtt.record.favorite.nextField', when: "activeInputRole == 'mqtt-favorite-editor'", description: 'MQTT 收藏别名编辑字段循环', layer: 'mqtt-favorite-editor' },
  { shortcutId: 'Shift+Tab', commandId: 'mqtt.record.favorite.prevField', when: "activeInputRole == 'mqtt-favorite-editor'", description: 'MQTT 收藏别名编辑反向字段循环', layer: 'mqtt-favorite-editor' },
  { shortcutId: 'Escape', commandId: 'mqtt.drawer.close', when: 'mqttDrawerActive', description: '关闭 MQTT 动作抽屉', layer: 'mqtt-drawer' },
  { shortcutId: 'Enter', commandId: 'mqtt.drawer.select', when: 'mqttDrawerActive', description: '执行 MQTT 抽屉当前动作', layer: 'mqtt-drawer' },
  { shortcutId: 'Escape', commandId: 'mqtt.preview.close', when: 'mqttPreviewOpen', description: '关闭 MQTT 只读预览', layer: 'mqtt-preview' },
  { shortcutId: 'Tab', commandId: 'ports.pane.toggleNext', when: "tab == 'ports'", description: '端口页切换左右聚焦区域', layer: 'ports' },
  { shortcutId: 'Shift+Tab', commandId: 'ports.pane.togglePrev', when: "tab == 'ports'", description: '端口页反向切换左右聚焦区域', layer: 'ports' },
  { shortcutId: 'Tab', commandId: 'favorites.pane.toggleNext', when: "tab == 'favorites'", description: '收藏页切换分组和目标区域', layer: 'favorites' },
  { shortcutId: 'Shift+Tab', commandId: 'favorites.pane.togglePrev', when: "tab == 'favorites'", description: '收藏页反向切换分组和目标区域', layer: 'favorites' },
  { shortcutId: 'Tab', commandId: 'mqtt.pane.next', when: "tab == 'mqtt'", description: 'MQTT 页切换连接、订阅、消息和发布区域', layer: 'mqtt' },
  { shortcutId: 'Shift+Tab', commandId: 'mqtt.pane.prev', when: "tab == 'mqtt'", description: 'MQTT 页反向切换连接、订阅、消息和发布区域', layer: 'mqtt' },
  { shortcutId: 'Escape', commandId: 'favorites.cancel', when: "activeInputRole == 'favorite-editor'", description: '取消收藏编辑', layer: 'favorites-editor' },
  { shortcutId: 'Ctrl+S', commandId: 'favorites.save', when: "activeInputRole == 'favorite-editor'", description: '保存收藏编辑', layer: 'favorites-editor' },
  { shortcutId: 'Ctrl+Enter', commandId: 'favorites.save', when: "activeInputRole == 'favorite-editor'", description: '保存收藏编辑', layer: 'favorites-editor' },
  { shortcutId: 'Escape', commandId: 'favorites.pickReview.cancel', when: "favoritePickReviewOpen || activeInputRole == 'favorite-pick-review'", description: '取消点选收藏审核，不穿透到底层', layer: 'favorites-pick-review' },
  { shortcutId: 'Ctrl+S', commandId: 'favorites.pickReview.commit', when: "favoritePickReviewOpen || activeInputRole == 'favorite-pick-review'", description: '保存点选收藏审核', layer: 'favorites-pick-review' },
  { shortcutId: 'Ctrl+Enter', commandId: 'favorites.pickReview.commit', when: "favoritePickReviewOpen || activeInputRole == 'favorite-pick-review'", description: '保存点选收藏审核', layer: 'favorites-pick-review' },
  { shortcutId: 'Tab', commandId: 'favorites.pickReview.next', when: "favoritePickReviewOpen || activeInputRole == 'favorite-pick-review'", description: '审核层内切到下一个待保存路径', layer: 'favorites-pick-review' },
  { shortcutId: 'Shift+Tab', commandId: 'favorites.pickReview.prev', when: "favoritePickReviewOpen || activeInputRole == 'favorite-pick-review'", description: '审核层内切到上一个待保存路径', layer: 'favorites-pick-review' },
  { shortcutId: 'Ctrl+Shift+W', commandId: 'ports.groups.togglePanel', when: "tab == 'ports'", description: '展开或收起端口组栏', layer: 'ports' },
  { shortcutId: 'Ctrl+T', commandId: 'ports.groupFolder.create', when: "tab == 'ports'", description: '新增分组夹并聚焦端口组栏', layer: 'ports' },
  { shortcutId: 'Ctrl+F2', commandId: 'ports.group.moveFolder', when: "tab == 'ports' && portPane == 'groups'", description: '变更当前端口组所在分组夹', layer: 'ports' },
  { shortcutId: 'Enter', commandId: 'ports.drawer.select', when: 'portDrawerActive', description: '执行抽屉当前动作', layer: 'port-drawer' },
  { shortcutId: 'Enter', commandId: 'favorites.drawer.select', when: 'favoriteDrawerActive', description: '执行收藏抽屉当前动作', layer: 'favorites-drawer' },
  { shortcutId: 'Space', commandId: 'list.toggleSelection', when: "tab == 'ports'", description: '端口列表多选', layer: 'ports' }
]

export { normalizeShortcutId }

type WhenNode =
  | { type: 'literal'; value: boolean | string }
  | { type: 'identifier'; name: string }
  | { type: 'not'; expr: WhenNode }
  | { type: 'and' | 'or' | 'compare'; op?: '==' | '!='; left: WhenNode; right: WhenNode }

const TOKEN_PATTERN = /\s*(&&|\|\||==|!=|!|\(|\)|true\b|false\b|'[^']*'|"[^"]*"|[A-Za-z_][A-Za-z0-9_.-]*)\s*/gy

function tokenizeWhen(input: string): string[] {
  const source = String(input || '').trim()
  if (!source) return []
  const tokens: string[] = []
  let index = 0
  while (index < source.length) {
    TOKEN_PATTERN.lastIndex = index
    const match = TOKEN_PATTERN.exec(source)
    if (!match || match.index !== index) throw new SyntaxError(`Unexpected token near "${source.slice(index)}"`)
    tokens.push(match[1])
    index = TOKEN_PATTERN.lastIndex
  }
  return tokens
}

export function parseWhenExpression(input: string): WhenNode {
  const tokens = tokenizeWhen(input)
  let index = 0
  const peek = () => tokens[index]
  const consume = (expected?: string) => {
    const token = tokens[index]
    if (expected && token !== expected) throw new SyntaxError(`Expected "${expected}" but found "${token || 'end'}"`)
    index += 1
    return token
  }
  const primary = (): WhenNode => {
    const token = peek()
    if (!token) throw new SyntaxError('Unexpected end of when expression')
    if (token === '(') {
      consume('(')
      const node = or()
      consume(')')
      return node
    }
    if (token === 'true' || token === 'false') {
      consume()
      return { type: 'literal', value: token === 'true' }
    }
    if (token.startsWith("'") || token.startsWith('"')) {
      consume()
      return { type: 'literal', value: token.slice(1, -1) }
    }
    consume()
    return { type: 'identifier', name: token }
  }
  const unary = (): WhenNode => peek() === '!' ? (consume('!'), { type: 'not', expr: unary() }) : primary()
  const compare = (): WhenNode => {
    let left = unary()
    while (peek() === '==' || peek() === '!=') {
      const op = consume() as '==' | '!='
      left = { type: 'compare', op, left, right: unary() }
    }
    return left
  }
  const and = (): WhenNode => {
    let left = compare()
    while (peek() === '&&') {
      consume('&&')
      left = { type: 'and', left, right: compare() }
    }
    return left
  }
  const or = (): WhenNode => {
    let left = and()
    while (peek() === '||') {
      consume('||')
      left = { type: 'or', left, right: and() }
    }
    return left
  }
  const ast = or()
  if (index < tokens.length) throw new SyntaxError(`Unexpected token "${peek()}"`)
  return ast
}

function valueOf(node: WhenNode, context: KeybindingContext): unknown {
  switch (node.type) {
    case 'literal': return node.value
    case 'identifier': return context[node.name as keyof KeybindingContext] ?? false
    case 'not': return !Boolean(valueOf(node.expr, context))
    case 'and': return Boolean(valueOf(node.left, context)) && Boolean(valueOf(node.right, context))
    case 'or': return Boolean(valueOf(node.left, context)) || Boolean(valueOf(node.right, context))
    case 'compare': {
      const left = valueOf(node.left, context)
      const right = valueOf(node.right, context)
      return node.op === '==' ? left === right : left !== right
    }
  }
}

export function evaluateWhenExpression(when: string, context: KeybindingContext): boolean {
  if (!when.trim()) return true
  return Boolean(valueOf(parseWhenExpression(when), context))
}

interface LiteralSet {
  positive: Set<string>
  negative: Set<string>
  equals: Map<string, Set<string>>
  notEquals: Map<string, Set<string>>
}

function emptyLiteralSet(): LiteralSet {
  return { positive: new Set(), negative: new Set(), equals: new Map(), notEquals: new Map() }
}

function cloneLiteralSet(set: LiteralSet): LiteralSet {
  return {
    positive: new Set(set.positive),
    negative: new Set(set.negative),
    equals: new Map([...set.equals.entries()].map(([key, values]) => [key, new Set(values)])),
    notEquals: new Map([...set.notEquals.entries()].map(([key, values]) => [key, new Set(values)]))
  }
}

function addMapSet(map: Map<string, Set<string>>, key: string, value: string) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key)!.add(value)
}

function mergeLiteralSets(left: LiteralSet, right: LiteralSet): LiteralSet {
  const merged = cloneLiteralSet(left)
  right.positive.forEach((item) => merged.positive.add(item))
  right.negative.forEach((item) => merged.negative.add(item))
  right.equals.forEach((values, key) => values.forEach((value) => addMapSet(merged.equals, key, value)))
  right.notEquals.forEach((values, key) => values.forEach((value) => addMapSet(merged.notEquals, key, value)))
  return merged
}

function literalSetsForNode(node: WhenNode | null): LiteralSet[] {
  if (!node) return [emptyLiteralSet()]
  if (node.type === 'and') return literalSetsForNode(node.left).flatMap((left) => literalSetsForNode(node.right).map((right) => mergeLiteralSets(left, right)))
  if (node.type === 'or') return [...literalSetsForNode(node.left), ...literalSetsForNode(node.right)]
  if (node.type === 'identifier') {
    const set = emptyLiteralSet()
    set.positive.add(node.name)
    return [set]
  }
  if (node.type === 'not' && node.expr.type === 'identifier') {
    const set = emptyLiteralSet()
    set.negative.add(node.expr.name)
    return [set]
  }
  if (node.type === 'compare' && node.left.type === 'identifier' && node.right.type === 'literal' && typeof node.right.value === 'string') {
    const set = emptyLiteralSet()
    addMapSet(node.op === '==' ? set.equals : set.notEquals, node.left.name, node.right.value)
    return [set]
  }
  return [emptyLiteralSet()]
}

export function getWhenLiteralSets(when: string): LiteralSet[] {
  if (!when.trim()) return [emptyLiteralSet()]
  return literalSetsForNode(parseWhenExpression(when))
}

function setsContradict(left: LiteralSet, right: LiteralSet): boolean {
  for (const item of left.positive) if (left.negative.has(item) || right.negative.has(item)) return true
  for (const item of right.positive) if (right.negative.has(item) || left.negative.has(item)) return true
  for (const [key, leftValues] of left.equals.entries()) {
    const rightValues = right.equals.get(key)
    if (rightValues && ![...leftValues].some((value) => rightValues.has(value))) return true
  }
  for (const [key, values] of left.equals.entries()) {
    const rightNot = right.notEquals.get(key)
    if (rightNot && [...values].every((value) => rightNot.has(value))) return true
  }
  for (const [key, values] of right.equals.entries()) {
    const leftNot = left.notEquals.get(key)
    if (leftNot && [...values].every((value) => leftNot.has(value))) return true
  }
  return false
}

export function canWhenClausesOverlap(leftWhen: string, rightWhen: string): boolean {
  const leftSets = getWhenLiteralSets(leftWhen)
  const rightSets = getWhenLiteralSets(rightWhen)
  return leftSets.some((left) => rightSets.some((right) => !setsContradict(left, right)))
}

function activeLayers(context: KeybindingContext): KeybindingLayerId[] {
  if (context.activeLayers?.length) return [...new Set<KeybindingLayerId>([...context.activeLayers, 'app', 'global'])]
  const layers: KeybindingLayerId[] = ['app', 'global']
  if (context.tab) layers.push(context.tab)
  if (context.confirmOpen) layers.push('confirm')
  if (context.activeInputRole === 'mqtt-editor') layers.push('mqtt-editor')
  if (context.activeInputRole === 'mqtt-connection-group-editor') layers.push('mqtt-connection-group-editor')
  if (context.activeInputRole === 'mqtt-config-subscription-editor') layers.push('mqtt-editor', 'mqtt-config-subscription-editor')
  if (context.activeInputRole === 'mqtt-config-publish-editor') layers.push('mqtt-editor', 'mqtt-config-publish-editor')
  if (context.activeInputRole === 'mqtt-publish-editor') layers.push('mqtt-publish-editor')
  if (context.activeInputRole === 'mqtt-publish-options') layers.push('mqtt-publish-options')
  if (context.activeInputRole === 'mqtt-publish-draft') layers.push('mqtt-publish-draft')
  if (context.activeInputRole === 'mqtt-publish-draft-editor') layers.push('mqtt-publish-draft-editor')
  if (context.activeInputRole === 'mqtt-subscription-editor') layers.push('mqtt-subscription-editor')
  if (context.activeInputRole === 'mqtt-favorite-editor') layers.push('mqtt-favorite-editor')
  if (context.activeInputRole === 'mqtt-record-editor') layers.push('mqtt-record-editor')
  if (context.mqttPreviewOpen) layers.push('mqtt-preview')
  if (context.activeInputRole === 'port-group-editor') layers.push('port-group-editor')
  if (context.activeInputRole === 'favorite-editor') layers.push('favorites-editor')
  if (context.activeInputRole === 'favorite-pick-review' || context.favoritePickReviewOpen) layers.push('favorites-pick-review')
  if (context.mqttDetailOpen || context.mqttDetailActive) layers.push('mqtt-detail')
  if (context.mqttDrawerOpen || context.mqttDrawerActive) layers.push('mqtt-drawer')
  if (context.mqttLogDrawerOpen) layers.push('mqtt-log-drawer')
  if (context.portGroupDetailOpen || context.portGroupDetailActive) layers.push('port-group-detail')
  if (context.portDetailOpen || context.portDetailActive) layers.push('port-detail')
  if (context.portDrawerOpen || context.portDrawerActive) layers.push('port-drawer')
  if (context.favoriteDrawerOpen || context.favoriteDrawerActive) layers.push('favorites-drawer')
  if (context.favoriteDetailOpen || context.favoriteDetailActive) layers.push('favorite-detail')
  if (context.portSelectionMode) layers.push('ports-selection')
  if (context.activeInputRole === 'port-search' || context.activeInputRole === 'port-group-search') layers.push('ports-search')
  if (context.activeInputRole === 'mqtt-search') layers.push('mqtt-search')
  if (context.activeInputRole === 'mqtt-topic-filter') layers.push('mqtt-topic-filter')
  if (context.activeInputRole === 'mqtt-connections') layers.push('mqtt-connections')
  if (context.activeInputRole === 'mqtt-subscriptions') layers.push('mqtt-subscriptions')
  if (context.activeInputRole === 'favorite-search' || context.activeInputRole === 'favorite-group-search') layers.push('favorites-search')
  return [...new Set(layers)]
}

function contextWithLayerFlags(context: KeybindingContext): KeybindingContext {
  const next = { ...context }
  for (const layer of activeLayers(context)) {
    ;(next as Record<string, unknown>)[layer.replace(/-/g, '_')] = true
  }
  return next
}

function shouldBlockTextInputShortcut(shortcutId: string, context: KeybindingContext): boolean {
  if (!context.textInputFocused || shortcutId === 'Escape' || shortcutId === 'Shift+Escape') return false
  if (shortcutId === 'Ctrl+Alt+S' || shortcutId === 'Ctrl+Alt+Q' || shortcutId === 'Ctrl+Alt+Enter') return false
  if (context.activeInputRole === 'mqtt-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-connection-group-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-config-subscription-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Ctrl+Delete', 'Ctrl+Backspace', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-config-publish-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Ctrl+Delete', 'Ctrl+Backspace', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-editor') return !['Ctrl+S', 'Ctrl+Enter', 'Ctrl+Alt+S', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Shift+F', 'Ctrl+P', 'Ctrl+H', 'Ctrl+Shift+H', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-subscription-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Ctrl+Delete', 'Ctrl+Backspace', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-favorite-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-record-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-draft-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'port-group-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-pick-review') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'port-search') return !['ArrowUp', 'ArrowDown', 'Shift+ArrowUp', 'Shift+ArrowDown', 'ArrowLeft', 'ArrowRight', 'Ctrl+K', 'Ctrl+J', 'Space', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+W', 'Ctrl+Shift+W', 'Ctrl+T', 'Ctrl+G', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'port-group-search') return !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Ctrl+K', 'Ctrl+J', 'Tab', 'Shift+Tab', 'Enter', 'Shift+Enter', 'Ctrl+Enter', 'Ctrl+Shift+Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+W', 'Ctrl+T', 'Ctrl+G', 'Ctrl+Shift+W', 'F2', 'Ctrl+F2', 'Shift+F2', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+Enter', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+N', 'Ctrl+G', 'Ctrl+T', 'Ctrl+Shift+T', 'Ctrl+Shift+S', 'Ctrl+H', 'Ctrl+Shift+H', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+Shift+M', 'Ctrl+M', 'Ctrl+Shift+W', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Ctrl+Delete', 'Ctrl+Backspace', 'F2', 'Shift+F2', 'Ctrl+F2', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-topic-filter') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter', 'Escape', 'Ctrl+P', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Shift+M', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-options') return !['ArrowUp', 'ArrowDown', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'Ctrl+P', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Shift+M', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-draft') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter', 'Ctrl+Enter', 'Space', 'Escape', 'Ctrl+S', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'F2', 'Shift+F2', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Ctrl+H', 'Ctrl+Shift+H', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-connections') return !['Space', 'Ctrl+C', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'ArrowLeft', 'ArrowRight', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'F2', 'Shift+F2', 'Ctrl+F2', 'Ctrl+N', 'Ctrl+G', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-subscriptions') return !['Space', 'Enter', 'Ctrl+Enter', 'Ctrl+C', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Ctrl+T', 'Ctrl+Shift+T', 'F2', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Shift+ArrowUp', 'Shift+ArrowDown', 'ArrowLeft', 'ArrowRight', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+Enter', 'Ctrl+C', 'Ctrl+Shift+C', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+R', 'Ctrl+Shift+W', 'Ctrl+N', 'Ctrl+O', 'Ctrl+Shift+O', 'Ctrl+G', 'Ctrl+T', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+Z', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-group-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'ArrowLeft', 'ArrowRight', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+R', 'Ctrl+Shift+W', 'Ctrl+N', 'Ctrl+O', 'Ctrl+Shift+O', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+G', 'Ctrl+T', 'Ctrl+Z', 'F2', 'Shift+F2', 'Ctrl+F2', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  return !['Ctrl+S', 'Ctrl+Enter'].includes(shortcutId)
}

function profileIdForCommand(commandId: string): ShortcutProfileId {
  if (commandId.startsWith('ports.')) return 'ports'
  if (commandId.startsWith('mqtt.')) return 'mqtt'
  if (commandId.startsWith('favorites.')) return 'favorites'
  if (commandId.startsWith('codex.')) return 'codex'
  if (commandId.startsWith('settings.')) return 'settings'
  return 'global'
}

function makeBindings(profiles: ShortcutCommandProfile[]): KeybindingDefinition[] {
  return profiles.flatMap((profile, profileIndex) => (profile.shortcutIds.length ? profile.shortcutIds : ['']).map((shortcutId, shortcutIndex) => ({
    actionId: profile.actionId,
    shortcutId: normalizeShortcutId(shortcutId),
    defaultShortcutId: normalizeShortcutId(profile.shortcutIds[0] || shortcutId),
    defaultShortcutIds: profile.shortcutIds.map(normalizeShortcutId),
    when: profile.when,
    defaultWhen: profile.when,
    source: 'system' as const,
    weight: profile.weight,
    layer: profile.layer,
    group: profile.group,
    title: profile.title,
    description: profile.description,
    risk: profile.risk || 'normal',
    internal: profile.internal,
    profileId: profile.profileId || profileIdForCommand(profile.actionId),
    order: profileIndex * 100 + shortcutIndex
  })))
}

export function buildDefaultKeybindings(featureConfigs?: FeatureConfig[]): KeybindingDefinition[] {
  return makeBindings([...DEFAULT_COMMAND_PROFILES, ...featureTabProfiles(featureConfigs)])
}

export const DEFAULT_KEYBINDINGS: KeybindingDefinition[] = buildDefaultKeybindings()

function defaultBindingsFor(commandId: string, defaultBindings = DEFAULT_KEYBINDINGS): KeybindingDefinition[] {
  return defaultBindings.filter((item) => item.actionId === commandId)
}

function flattenOverrides(input: KeybindingOverride[] | ShortcutProfileMap = []): Array<KeybindingOverride & { profileId?: ShortcutProfileId }> {
  if (Array.isArray(input)) return input
  return (['global', 'ports', 'mqtt', 'favorites', 'codex', 'settings'] as ShortcutProfileId[]).flatMap((profileId) =>
    (input[profileId]?.keybindingOverrides || []).map((override) => ({ ...override, profileId }))
  )
}

export function buildEffectiveKeybindings(overrides: KeybindingOverride[] | ShortcutProfileMap = [], featureConfigs?: FeatureConfig[]): KeybindingDefinition[] {
  const defaultBindings = featureConfigs ? buildDefaultKeybindings(featureConfigs) : DEFAULT_KEYBINDINGS
  const disabledCommands = new Set<string>()
  const userBindings: KeybindingDefinition[] = []
  for (const override of flattenOverrides(overrides)) {
    const defaults = defaultBindingsFor(override.commandId, defaultBindings)
    if (!defaults.length) continue
    disabledCommands.add(override.commandId)
    const overrideShortcutValues = override.shortcutIds?.length ? override.shortcutIds : override.shortcutId ? [override.shortcutId] : []
    const shortcutIds = overrideShortcutValues.map(normalizeShortcutId).filter(Boolean)
    const enabled = override.enabled !== false && override.disabled !== true && override.source !== 'removed'
    if (!enabled) {
      userBindings.push({
        ...defaults[0],
        shortcutId: shortcutIds[0] || defaults[0].shortcutId,
        when: override.when || defaults[0].when,
        source: 'removed',
        weight: override.weight || 300,
        disabled: true,
        profileId: override.profileId || defaults[0].profileId || profileIdForCommand(override.commandId)
      })
      continue
    }
    for (const shortcutId of shortcutIds) {
      userBindings.push({
        ...defaults[0],
        shortcutId,
        defaultShortcutId: defaults[0].defaultShortcutId,
        defaultShortcutIds: defaults[0].defaultShortcutIds,
        when: override.when || defaults[0].when,
        source: 'user',
        weight: override.weight || 300,
        disabled: false,
        profileId: override.profileId || defaults[0].profileId || profileIdForCommand(override.commandId)
      })
    }
  }
  return [...defaultBindings.map((item) => ({ ...item, disabled: disabledCommands.has(item.actionId) ? true : item.disabled })), ...userBindings]
}

function whenSpecificity(when: string): number {
  try {
    return getWhenLiteralSets(when).reduce((max, set) => Math.max(max, set.positive.size + set.negative.size + set.equals.size + set.notEquals.size), 0)
  } catch {
    return 0
  }
}

function score(binding: KeybindingDefinition, context: KeybindingContext): number {
  const layerScore = activeLayers(context).includes(binding.layer) ? LAYER_PRIORITY[binding.layer] * 10000 : -1000000
  return layerScore + SOURCE_WEIGHT[binding.source] * 100 + binding.weight + whenSpecificity(binding.when) - (binding.order || 0) / 10000
}

function sortedCandidates(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext): KeybindingDefinition[] {
  const normalized = normalizeShortcutId(shortcutId)
  const resolvedContext = contextWithLayerFlags(context)
  if (shouldBlockTextInputShortcut(normalized, resolvedContext)) return []
  const layers = activeLayers(resolvedContext)
  return bindings
    .filter((item) => layers.includes(item.layer))
    .filter((item) => item.shortcutId === normalized || item.shortcutId === '*')
    .filter((item) => {
      try {
        return evaluateWhenExpression(item.when, resolvedContext)
      } catch {
        return false
      }
    })
    .sort((a, b) => score(b, resolvedContext) - score(a, resolvedContext))
}

export function resolveKeybinding(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext): KeybindingDefinition | null {
  const winner = sortedCandidates(bindings, shortcutId, context)[0]
  return winner && !winner.disabled && winner.source !== 'removed' ? winner : null
}

export function previewKeybindingResolution(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext) {
  const candidates = sortedCandidates(bindings, shortcutId, context)
  const winner = candidates.find((item) => !item.disabled && item.source !== 'removed') || null
  return {
    key: normalizeShortcutId(shortcutId),
    winner,
    candidates,
    activeLayers: activeLayers(context).sort((a, b) => LAYER_PRIORITY[b] - LAYER_PRIORITY[a])
  }
}

export function getShortcutReservationConflicts(shortcutId: string, options: { commandId?: string; when?: string } = {}): ShortcutReservationRule[] {
  const normalized = normalizeShortcutId(shortcutId)
  const optionIdentifiers = new Set((options.when || '').match(/[A-Za-z_][A-Za-z0-9_.-]*/g) || [])
  return SHORTCUT_RESERVATION_RULES
    .filter((rule) => normalizeShortcutId(rule.shortcutId) === normalized)
    .filter((rule) => rule.commandId !== options.commandId)
    .filter((rule) => canWhenClausesOverlap(options.when || '', rule.when))
    .sort((a, b) => {
      const aScore = (a.when.match(/[A-Za-z_][A-Za-z0-9_.-]*/g) || []).filter((item) => optionIdentifiers.has(item)).length
      const bScore = (b.when.match(/[A-Za-z_][A-Za-z0-9_.-]*/g) || []).filter((item) => optionIdentifiers.has(item)).length
      return bScore - aScore || LAYER_PRIORITY[b.layer] - LAYER_PRIORITY[a.layer]
    })
}

export function detectShortcutConflicts(row: ShortcutCommandRow, rows: ShortcutCommandRow[]): ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = []
  for (const other of rows) {
    if (other.commandId === row.commandId || !other.enabled) continue
    for (const shortcutId of row.shortcutIds) {
      if (!other.shortcutIds.includes(shortcutId)) continue
      if (other.layer !== row.layer && LAYER_PRIORITY[other.layer] !== LAYER_PRIORITY[row.layer]) continue
      if (!canWhenClausesOverlap(row.when, other.when)) continue
      conflicts.push({ commandId: other.commandId, title: other.title, shortcutId, when: other.when, layer: other.layer })
    }
  }
  return conflicts
}

export function buildShortcutCommandRows(bindings: KeybindingDefinition[]): ShortcutCommandRow[] {
  const groups = new Map<string, KeybindingDefinition[]>()
  for (const binding of bindings) {
    if (binding.internal) continue
    if (!groups.has(binding.actionId)) groups.set(binding.actionId, [])
    groups.get(binding.actionId)!.push(binding)
  }
  const rows = [...groups.entries()].map(([commandId, commandBindings]) => {
    const active = commandBindings.filter((item) => !item.disabled && item.source !== 'removed')
    const first = commandBindings[0]
    const shortcutIds = [...new Set(active.map((item) => item.shortcutId).filter(Boolean))]
    const defaultShortcutIds = [...new Set((first.defaultShortcutIds?.length ? first.defaultShortcutIds : [first.defaultShortcutId]).filter(Boolean))]
    const when = active[0]?.when || first.when
    const source = commandBindings.some((item) => item.source === 'removed') && !active.length ? 'removed' : active.some((item) => item.source === 'user') ? 'user' : 'system'
    const row: ShortcutCommandRow = {
      commandId,
      title: first.title || commandId,
      group: first.group || '未分组',
      layer: first.layer,
      layerLabel: LAYER_LABELS[first.layer],
      risk: first.risk || 'normal',
      shortcutIds,
      defaultShortcutIds,
      when,
      defaultWhen: first.defaultWhen || first.when,
      source,
      sourceLabel: source === 'removed' ? '已禁用' : source === 'user' ? '用户' : '系统',
      enabled: source !== 'removed' && shortcutIds.length > 0,
      profileId: first.profileId || profileIdForCommand(commandId),
      conflicts: [],
      reservationConflicts: [],
      bindings: commandBindings
    }
    row.reservationConflicts = row.shortcutIds.flatMap((shortcutId) => getShortcutReservationConflicts(shortcutId, { commandId, when: row.when }))
    return row
  }).sort((a, b) => a.group.localeCompare(b.group) || a.commandId.localeCompare(b.commandId))
  for (const row of rows) row.conflicts = detectShortcutConflicts(row, rows)
  return rows
}

export function explainKeybinding(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext) {
  const preview = previewKeybindingResolution(bindings, shortcutId, context)
  if (preview.candidates[0]?.disabled || preview.candidates[0]?.source === 'removed') {
    return { key: preview.key, winner: null, level: 'blocked' as const, reason: '用户禁用了该快捷键', candidates: preview.candidates }
  }
  return {
    key: preview.key,
    winner: preview.winner?.actionId ?? null,
    level: preview.winner ? (preview.winner.source === 'user' ? 'override' as const : 'ok' as const) : 'unmatched' as const,
    reason: preview.winner ? (preview.winner.source === 'user' ? '用户快捷键覆盖默认绑定' : '默认快捷键生效') : '未匹配快捷键',
    candidates: preview.candidates
  }
}
