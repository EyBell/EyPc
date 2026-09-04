import { FEATURE_MODULE_IDS, type AppTabId, type FeatureConfig, type KeybindingOverride, type ShortcutProfileId, type ShortcutProfileMap } from '../../domain/types'
import { normalizeShortcutId } from '../../domain/shortcuts'
import { createCommandCatalogV7, type CommandCatalogV7 } from '../command/commandCatalog'
import { LAYER_LABELS, LAYER_PRIORITY, resolveLayerStackV7 } from '../command/layerStack'
import type { CommandDescriptorV7, CommandExecutionOwner, CommandSurfaceExecutionOwnersV7, CommandSurfaceIdV7, KeybindingLayerId } from '../command/types'
import { visibleFeatures } from '../feature/featureRegistry'
import { CODEX_COMMAND_PROFILES } from '../feature/codex/commands'
import { FAVORITES_COMMAND_PROFILES } from '../feature/favorites/commands'
import { MQTT_COMMAND_PROFILES } from '../feature/mqtt/commands'
import { PORTS_COMMAND_PROFILES } from '../feature/ports/commands'
import { SETTINGS_COMMAND_PROFILES } from '../feature/settings/commands'
import { WINDOWS_COMMAND_PROFILES } from '../feature/windows/commands'
import type { ShortcutCommandProfileConfig } from './commandProfile'
import { SHELL_COMMAND_PROFILES } from './shellCommandProfiles'

export type { KeybindingLayerId } from '../command/types'
export { LAYER_PRIORITY } from '../command/layerStack'

export interface KeybindingContext {
  tab?: AppTabId
  confirmOpen?: boolean
  textInputFocused?: boolean
  activeInputRole?: 'port-search' | 'port-group-search' | 'mqtt-search' | 'mqtt-topic-filter' | 'mqtt-publish-editor' | 'mqtt-publish-options' | 'mqtt-publish-draft' | 'mqtt-publish-draft-editor' | 'mqtt-editor' | 'mqtt-connection-group-editor' | 'mqtt-config-subscription-editor' | 'mqtt-config-publish-editor' | 'mqtt-subscription-editor' | 'mqtt-favorite-editor' | 'mqtt-record-editor' | 'mqtt-connections' | 'mqtt-subscriptions' | 'favorite-search' | 'favorite-group-search' | 'favorite-containers' | 'favorite-items' | 'favorite-directory' | 'favorite-editor' | 'favorite-pick-review' | 'window-search' | 'window-actions' | 'window-editor' | 'window-list' | 'codex-composer' | 'codex-search' | 'settings' | 'port-group-editor' | 'other'
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
  windowActionsOpen?: boolean
  windowEditorOpen?: boolean
  /** Float 快速筛选模式：`Ctrl+数字` 从抽屉动作改读可见任务编号。 */
  codexQuickMode?: boolean
  codexDrawerActive?: boolean
  favoriteRunPromptOpen?: boolean
  favoriteSlotManagerOpen?: boolean
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
  executionOwner: CommandExecutionOwner
  surfaceExecutionOwners?: CommandSurfaceExecutionOwnersV7
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
  executionOwner?: CommandExecutionOwner
  surfaceExecutionOwners?: CommandSurfaceExecutionOwnersV7
}

const SOURCE_WEIGHT = {
  user: 300,
  system: 100,
  removed: 0
}

export const DEFAULT_SHORTCUT_PROFILES_BY_COMMAND = {
  ...SHELL_COMMAND_PROFILES,
  ...PORTS_COMMAND_PROFILES,
  ...MQTT_COMMAND_PROFILES,
  ...FAVORITES_COMMAND_PROFILES,
  ...WINDOWS_COMMAND_PROFILES,
  ...CODEX_COMMAND_PROFILES,
  ...SETTINGS_COMMAND_PROFILES
} as const satisfies Record<string, ShortcutCommandProfileConfig>

export const DEFAULT_SHORTCUTS_BY_COMMAND: Record<string, string[]> = Object.fromEntries(
  Object.entries(DEFAULT_SHORTCUT_PROFILES_BY_COMMAND).map(([commandId, profile]) => [commandId, [...profile.shortcutIds]])
)

const DEFAULT_COMMAND_PROFILES: ShortcutCommandProfile[] = Object.entries(DEFAULT_SHORTCUT_PROFILES_BY_COMMAND).map(([actionId, profile]) => ({
  actionId,
  ...profile,
  shortcutIds: [...profile.shortcutIds]
}))

interface CommandExecutionPolicyV7 {
  executionOwner: CommandExecutionOwner
  surfaceExecutionOwners?: CommandSurfaceExecutionOwnersV7
}

/**
 * Declarative execution manifest. Command ids absent from the manifest are
 * runtime actions; exceptions are exact entries, never prefix/name guesses.
 */
export const COMMAND_EXECUTION_POLICY_V7: Readonly<Record<string, CommandExecutionPolicyV7>> = Object.freeze({
  'action.runner.hide': { executionOwner: 'action-local' },
  'tab.next': { executionOwner: 'shell' },
  'tab.prev': { executionOwner: 'shell' },
  'list.up': { executionOwner: 'shell' },
  'list.down': { executionOwner: 'shell' },
  'list.pageUp': { executionOwner: 'shell' },
  'list.pageDown': { executionOwner: 'shell' },
  'list.toggleSelection': { executionOwner: 'shell' },
  'windows.list.up': { executionOwner: 'shell' },
  'windows.list.down': { executionOwner: 'shell' },
  'windows.list.pageUp': { executionOwner: 'shell' },
  'windows.list.pageDown': { executionOwner: 'shell' },
  'quickJump.openForward': {
    executionOwner: 'main-quick-jump',
    surfaceExecutionOwners: { float: 'float-local', action: 'action-local' }
  },
  'quickJump.openBackward': {
    executionOwner: 'main-quick-jump',
    surfaceExecutionOwners: { float: 'float-local', action: 'action-local' }
  },
  'codex.quickJump.openForward': {
    executionOwner: 'main-quick-jump',
    surfaceExecutionOwners: { float: 'float-local' }
  },
  ...Object.fromEntries([
    'codex.float.activate',
    'codex.quickJump.openTasks',
    'codex.list.up',
    'codex.list.down',
    'codex.selection.toggle',
    'codex.task.openFocused',
    'codex.detail.open',
    'codex.drawer.open',
    'codex.task.archiveFocused',
    'codex.alias.edit',
    'codex.pin.toggleFocused',
    'codex.pin.moveUp',
    'codex.pin.moveDown',
    'codex.search.focus',
    'codex.thread.createFocused',
    'codex.quick.activate',
    'codex.layer.cancel',
    ...Array.from({ length: 10 }, (_, index) => `codex.quick.open.${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `codex.task.openIndex.${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `codex.drawer.select.${index + 1}`)
  ].map((commandId) => [commandId, {
    executionOwner: 'runtime-action' as const,
    surfaceExecutionOwners: { float: 'float-local' as const }
  }]))
})

function executionPolicyForProfile(profile: ShortcutCommandProfile): CommandExecutionPolicyV7 {
  return COMMAND_EXECUTION_POLICY_V7[profile.actionId] || {
    executionOwner: profile.executionOwner || 'runtime-action',
    surfaceExecutionOwners: profile.surfaceExecutionOwners
  }
}

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
    weight: 100,
    executionOwner: 'shell'
    }]
  })
}

export function buildCommandCatalogV7(featureConfigs?: FeatureConfig[]): CommandCatalogV7 {
  const profiles = [...DEFAULT_COMMAND_PROFILES, ...featureTabProfiles(featureConfigs)]
  const descriptors: CommandDescriptorV7[] = profiles.map((profile) => {
    const executionPolicy = executionPolicyForProfile(profile)
    return {
    id: profile.actionId,
    title: profile.title,
    group: profile.group,
    description: profile.description,
    risk: profile.risk || 'normal',
    executionOwner: executionPolicy.executionOwner,
    surfaceExecutionOwners: executionPolicy.surfaceExecutionOwners,
    profileId: profile.profileId || profileIdForCommand(profile.actionId),
    defaultBindings: [{
      shortcutIds: [...profile.shortcutIds],
      layer: profile.layer,
      when: profile.when,
      weight: profile.weight
    }]
    }
  })
  return createCommandCatalogV7(descriptors)
}

export const SHORTCUT_RESERVATION_RULES: ShortcutReservationRule[] = [
  { shortcutId: 'Shift+Escape', commandId: 'app.hide', when: 'true', description: '全局立即隐藏插件窗口', layer: 'app' },
  { shortcutId: 'Ctrl+Alt+Enter', commandId: 'codex.float.activate', when: 'true', description: '显示、展开并进入 Codex 卡片', layer: 'app' },
  { shortcutId: 'Ctrl+Alt+Q', commandId: 'codex.float.toggle', when: 'true', description: '立即显示或隐藏 Codex 悬浮球', layer: 'app' },
  { shortcutId: 'Ctrl+Alt+K', commandId: 'codex.quick.activate', when: 'true', description: '展开动态列表并进入快速筛选模式', layer: 'app' },
  { shortcutId: 'Ctrl+T', commandId: 'codex.thread.createFocused', when: "tab == 'codex' && !confirmOpen && !textInputFocused", description: '在当前高亮会话或项目中新建会话', layer: 'codex' },
  { shortcutId: 'Ctrl+Shift+1', commandId: 'codex.action.run.1', when: "tab == 'codex' && !textInputFocused && !confirmOpen", description: '执行 Environment Action 槽 1', layer: 'codex' },
  { shortcutId: 'Ctrl+Shift+2', commandId: 'codex.action.run.2', when: "tab == 'codex' && !textInputFocused && !confirmOpen", description: '执行 Environment Action 槽 2', layer: 'codex' },
  { shortcutId: 'Ctrl+Shift+3', commandId: 'codex.action.run.3', when: "tab == 'codex' && !textInputFocused && !confirmOpen", description: '执行 Environment Action 槽 3', layer: 'codex' },
  { shortcutId: 'Ctrl+Shift+4', commandId: 'codex.action.run.4', when: "tab == 'codex' && !textInputFocused && !confirmOpen", description: '执行 Environment Action 槽 4', layer: 'codex' },
  { shortcutId: 'Ctrl+Shift+5', commandId: 'codex.action.run.5', when: "tab == 'codex' && !textInputFocused && !confirmOpen", description: '执行 Environment Action 槽 5', layer: 'codex' },
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
  { shortcutId: 'ArrowRight', commandId: 'windows.tree.expand', when: "tab == 'windows' && !windowEditorOpen && !windowActionsOpen", description: '展开文件管理器父节点或进入首个子窗口', layer: 'windows' },
  { shortcutId: 'ArrowLeft', commandId: 'windows.tree.collapse', when: "tab == 'windows' && !windowEditorOpen && !windowActionsOpen", description: '收起文件管理器父节点或返回父节点', layer: 'windows' },
  { shortcutId: 'Ctrl+ArrowRight', commandId: 'windows.actions.open', when: "tab == 'windows' && !windowEditorOpen", description: '打开窗口操作面板', layer: 'windows' },
  { shortcutId: 'ArrowUp', commandId: 'windows.list.up', when: "tab == 'windows' && !windowEditorOpen", description: '窗口列表上移', layer: 'windows' },
  { shortcutId: 'ArrowDown', commandId: 'windows.list.down', when: "tab == 'windows' && !windowEditorOpen", description: '窗口列表下移', layer: 'windows' },
  { shortcutId: 'Ctrl+Delete', commandId: 'windows.close', when: "tab == 'windows' && !windowEditorOpen", description: '关闭窗口（先正常关闭）', layer: 'windows' },
  { shortcutId: 'Ctrl+Backspace', commandId: 'windows.close', when: "tab == 'windows' && !windowEditorOpen", description: '关闭窗口（先正常关闭）', layer: 'windows' },
  { shortcutId: 'ArrowLeft', commandId: 'windows.actions.close', when: "tab == 'windows' && windowActionsOpen", description: '从窗口操作面板返回列表', layer: 'window-actions' },
  { shortcutId: 'Ctrl+ArrowLeft', commandId: 'windows.actions.close', when: "tab == 'windows' && windowActionsOpen", description: '从窗口操作面板返回列表', layer: 'window-actions' },
  { shortcutId: 'Tab', commandId: 'windows.layer.toggle', when: "tab == 'windows' && !windowEditorOpen", description: '切换窗口列表和操作面板', layer: 'windows' },
  { shortcutId: 'Shift+Tab', commandId: 'windows.layer.togglePrev', when: "tab == 'windows' && !windowEditorOpen", description: '反向切换窗口列表和操作面板', layer: 'windows' },
  { shortcutId: 'Space', commandId: 'list.toggleSelection', when: "tab == 'windows' && !windowEditorOpen", description: '窗口列表多选并下移', layer: 'windows' },
  ...Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1
    return {
      shortcutId: slot === 10 ? 'Ctrl+0' : `Ctrl+${slot}`,
      commandId: `windows.slot.assign.${slot}`,
      when: "tab == 'windows' && !windowEditorOpen",
      description: `分配当前窗口到槽 ${slot}`,
      layer: 'windows' as const
    }
  }),
  { shortcutId: 'Escape', commandId: 'windows.editor.cancel', when: "activeInputRole == 'window-editor'", description: '取消窗口目标编辑', layer: 'window-editor' },
  { shortcutId: 'Ctrl+S', commandId: 'windows.editor.save', when: "activeInputRole == 'window-editor'", description: '保存窗口目标编辑', layer: 'window-editor' },
  { shortcutId: 'Enter', commandId: 'windows.editor.save', when: "activeInputRole == 'window-editor'", description: '保存窗口目标编辑', layer: 'window-editor' },
  { shortcutId: 'Tab', commandId: 'windows.editor.nextField', when: "activeInputRole == 'window-editor'", description: '窗口目标编辑字段循环', layer: 'window-editor' },
  { shortcutId: 'Shift+Tab', commandId: 'windows.editor.prevField', when: "activeInputRole == 'window-editor'", description: '窗口目标编辑反向字段循环', layer: 'window-editor' },
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
  return [...resolveLayerStackV7(context).interactiveIds]
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
  if (shortcutId === 'Ctrl+Alt+S' || shortcutId === 'Ctrl+Alt+Q' || shortcutId === 'Ctrl+Alt+Enter' || shortcutId === 'Ctrl+Alt+K') return false
  if (context.activeInputRole === 'mqtt-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-connection-group-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-config-subscription-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Ctrl+Delete', 'Ctrl+Backspace', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-config-publish-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Ctrl+Delete', 'Ctrl+Backspace', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-editor') return !['Ctrl+S', 'Ctrl+Enter', 'Ctrl+Alt+S', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Shift+F', 'Ctrl+P', 'Ctrl+H', 'Ctrl+Shift+H', 'Ctrl+Shift+O', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-subscription-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Ctrl+Delete', 'Ctrl+Backspace', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-favorite-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-record-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-draft-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'port-group-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'window-editor') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-pick-review') return !['Ctrl+Alt+S', 'Ctrl+S', 'Ctrl+Enter', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Escape', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'codex-composer') return !['Ctrl+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Shift+Escape'].includes(shortcutId)
  // 会话搜索框和 ports/favorites/mqtt/windows 的搜索框同构：可以边打字边导航。
  // 这条白名单必须只对 `codex-search` 生效，绝不能扩散到 `codex-composer`。
  if (context.activeInputRole === 'codex-search') return !['ArrowUp', 'ArrowDown', 'Shift+ArrowUp', 'Shift+ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+0', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9', 'Alt+0', 'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9', 'Escape', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'port-search') return !['ArrowUp', 'ArrowDown', 'Shift+ArrowUp', 'Shift+ArrowDown', 'ArrowLeft', 'ArrowRight', 'Ctrl+K', 'Ctrl+J', 'Space', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+W', 'Ctrl+Shift+W', 'Ctrl+T', 'Ctrl+G', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'port-group-search') return !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Ctrl+K', 'Ctrl+J', 'Tab', 'Shift+Tab', 'Enter', 'Shift+Enter', 'Ctrl+Enter', 'Ctrl+Shift+Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+W', 'Ctrl+T', 'Ctrl+G', 'Ctrl+Shift+W', 'F2', 'Ctrl+F2', 'Shift+F2', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+Enter', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+N', 'Ctrl+G', 'Ctrl+T', 'Ctrl+Shift+T', 'Ctrl+Shift+S', 'Ctrl+H', 'Ctrl+Shift+H', 'Ctrl+Shift+L', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+Shift+M', 'Ctrl+M', 'Ctrl+Shift+W', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Ctrl+Delete', 'Ctrl+Backspace', 'F2', 'Shift+F2', 'Ctrl+F2', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-topic-filter') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter', 'Escape', 'Ctrl+P', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Shift+M', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-options') return !['ArrowUp', 'ArrowDown', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'Ctrl+P', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Shift+M', 'Ctrl+Shift+F', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-publish-draft') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter', 'Ctrl+Enter', 'Space', 'Escape', 'Ctrl+S', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'F2', 'Shift+F2', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Ctrl+H', 'Ctrl+Shift+H', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+M', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-connections') return !['Space', 'Ctrl+C', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'ArrowLeft', 'ArrowRight', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'F2', 'Shift+F2', 'Ctrl+F2', 'Ctrl+N', 'Ctrl+G', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'mqtt-subscriptions') return !['Space', 'Enter', 'Ctrl+Enter', 'Ctrl+C', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Ctrl+T', 'Ctrl+Shift+T', 'F2', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Shift+ArrowUp', 'Shift+ArrowDown', 'ArrowLeft', 'ArrowRight', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+Enter', 'Ctrl+C', 'Ctrl+Shift+C', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+R', 'Ctrl+Shift+W', 'Ctrl+N', 'Ctrl+O', 'Ctrl+Shift+O', 'Ctrl+G', 'Ctrl+T', 'Ctrl+0', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+Z', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'favorite-group-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'ArrowLeft', 'ArrowRight', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight', 'Tab', 'Shift+Tab', 'Enter', 'Ctrl+F', 'Ctrl+Shift+F', 'Ctrl+R', 'Ctrl+Shift+W', 'Ctrl+N', 'Ctrl+O', 'Ctrl+Shift+O', 'Ctrl+0', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9', 'Delete', 'Backspace', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+G', 'Ctrl+T', 'Ctrl+Z', 'F2', 'Shift+F2', 'Ctrl+F2', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  if (context.activeInputRole === 'window-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'ArrowRight', 'Ctrl+ArrowRight', 'ArrowLeft', 'Ctrl+ArrowLeft', 'Tab', 'Shift+Tab', 'Enter', 'Space', 'Ctrl+F', 'Ctrl+R', 'Ctrl+Delete', 'Ctrl+Backspace', 'Ctrl+0', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9', 'Escape', 'Ctrl+Alt+S', 'Shift+Escape'].includes(shortcutId)
  return !['Ctrl+S', 'Ctrl+Enter'].includes(shortcutId)
}

function profileIdForCommand(commandId: string): ShortcutProfileId {
  if (commandId.startsWith('ports.')) return 'ports'
  if (commandId.startsWith('mqtt.')) return 'mqtt'
  if (commandId.startsWith('favorites.')) return 'favorites'
  if (commandId.startsWith('windows.')) return 'windows'
  if (commandId.startsWith('codex.')) return 'codex'
  if (commandId.startsWith('settings.')) return 'settings'
  return 'global'
}

function makeBindings(profiles: ShortcutCommandProfile[]): KeybindingDefinition[] {
  return profiles.flatMap((profile, profileIndex) => {
    const executionPolicy = executionPolicyForProfile(profile)
    return (profile.shortcutIds.length ? profile.shortcutIds : ['']).map((shortcutId, shortcutIndex) => ({
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
    executionOwner: executionPolicy.executionOwner,
    surfaceExecutionOwners: executionPolicy.surfaceExecutionOwners,
    order: profileIndex * 100 + shortcutIndex
    }))
  })
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
  return (['global', ...FEATURE_MODULE_IDS] as ShortcutProfileId[]).flatMap((profileId) =>
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

const EXECUTION_OWNERS_BY_SURFACE_V7: Readonly<Record<CommandSurfaceIdV7, ReadonlySet<CommandExecutionOwner>>> = Object.freeze({
  main: new Set<CommandExecutionOwner>(['runtime-action', 'shell', 'main-quick-jump']),
  float: new Set<CommandExecutionOwner>(['runtime-action', 'shell', 'float-local']),
  action: new Set<CommandExecutionOwner>(['runtime-action', 'shell', 'action-local'])
})

export function keybindingExecutionOwnerForSurfaceV7(
  binding: Pick<KeybindingDefinition, 'executionOwner' | 'surfaceExecutionOwners'>,
  surfaceId: CommandSurfaceIdV7
): CommandExecutionOwner {
  return binding.surfaceExecutionOwners?.[surfaceId] || binding.executionOwner
}

export function keybindingAvailableOnSurfaceV7(
  binding: Pick<KeybindingDefinition, 'executionOwner' | 'surfaceExecutionOwners'>,
  surfaceId: CommandSurfaceIdV7
): boolean {
  return EXECUTION_OWNERS_BY_SURFACE_V7[surfaceId].has(keybindingExecutionOwnerForSurfaceV7(binding, surfaceId))
}

function sortedCandidates(
  bindings: KeybindingDefinition[],
  shortcutId: string,
  context: KeybindingContext,
  surfaceId: CommandSurfaceIdV7
): KeybindingDefinition[] {
  const normalized = normalizeShortcutId(shortcutId)
  const resolvedContext = contextWithLayerFlags(context)
  // A modal barrier has already removed every lower feature layer. Its own
  // user-rebound commands must remain resolvable while an input has focus.
  if (!resolveLayerStackV7(resolvedContext).blockingLayer && shouldBlockTextInputShortcut(normalized, resolvedContext)) return []
  const layers = activeLayers(resolvedContext)
  return bindings
    .filter((item) => keybindingAvailableOnSurfaceV7(item, surfaceId))
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

export function resolveKeybinding(
  bindings: KeybindingDefinition[],
  shortcutId: string,
  context: KeybindingContext,
  surfaceId: CommandSurfaceIdV7 = 'main'
): KeybindingDefinition | null {
  const winner = sortedCandidates(bindings, shortcutId, context, surfaceId)[0]
  return winner && !winner.disabled && winner.source !== 'removed' ? winner : null
}

export function previewKeybindingResolution(
  bindings: KeybindingDefinition[],
  shortcutId: string,
  context: KeybindingContext,
  surfaceId: CommandSurfaceIdV7 = 'main'
) {
  const candidates = sortedCandidates(bindings, shortcutId, context, surfaceId)
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
