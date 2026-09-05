import type { AppTabId } from '../../../domain/types'
import type { FeatureActionHostV7 } from '../featureActionHost'
import type { FeatureTabEnterOptionsV7 } from '../featureModule'

export function enterMqttTab(tab: AppTabId, _options: FeatureTabEnterOptionsV7, host: FeatureActionHostV7): void {
  if (tab === 'mqtt') host.ensureMqttArchiveLoaded()
}

export function focusMqttSearch(host: FeatureActionHostV7): boolean {
  host.searchFocusTarget = 'mqtt'
  host.searchFocusRequestId += 1
  host.notify()
  return true
}

export function registerMqttActions(host: FeatureActionHostV7): void {
  const { register, applyMqttPublishDraftHistory, applyMqttPublishTemplate, applyMqttSubscriptionFilter, beginMqttConfigDraft, beginMqttConnectionGroupDraft, beginMqttPublishDraftHistoryEdit, beginMqttRecordEdit, beginMqttSubscriptionDraft, blurMqttPublishEditor, blurSearchFocus, cancelMqttConnectionGroupDraft, cancelMqttFavoriteDraft, cancelMqttPublishDraftHistoryEditDraft, cancelMqttRecordEditDraft, cancelMqttSubscriptionDraft, clearAllMqttSubscriptions, clearCurrentMqttPublishDraftHistory, clearMqttLogs, clearMqttRailSelection, clearMqttRecordList, closeMqttCommandFocusSurfaces, closeMqttDrawer, closeMqttPreview, closeMqttPublishDraftHistory, closeMqttPublishOptions, closeMqttTopicFilter, connectMqtt, copyMqttConnectionAddress, copyMqttRecordAll, copyMqttRecordPayload, copyMqttRecordTopic, copyMqttSubscriptionTopic, copySelectedMqttRecordPayloads, copySelectedMqttRecordTopics, copySelectedMqttRecordsAsMergedJson, deleteFocusedMqttConnection, deleteFocusedMqttSubscription, deleteMqttConfigPublishRow, deleteMqttConfigSubscriptionRow, deleteMqttConnectionGroupById, deleteMqttPublishDraftHistoryEntry, deleteMqttSubscriptionDraftRow, deleteMqttTemplate, deleteSelectedMqttConnections, deleteSelectedMqttLog, deleteSelectedMqttRecord, deleteSelectedMqttSubscriptions, disconnectMqtt, executeMqttDrawerItem, favoriteMqttPublishDraftHistory, fillMqttPublishDraftFromSelection, focusMqttConfigPublishEditor, focusMqttConfigSubscriptionEditor, focusMqttPublishDraftHistory, focusMqttPublishEditor, focusMqttRecordFromArgs, focusMqttRecordList, focusMqttSubscription, focusMqttTopicFilter, moveMqttConfigDraftField, moveMqttConfigPublishRow, moveMqttConfigSubscriptionRow, moveMqttConnectionGroupDraftField, moveMqttConnectionTreeFromArgs, moveMqttDrawer, moveMqttPane, moveMqttPublishDraftHistory, moveMqttPublishDraftHistoryEditField, moveMqttPublishField, moveMqttPublishOptions, moveMqttRecordEditDraftField, moveMqttSubscriptionDraftField, moveMqttSubscriptionDraftRow, moveMqttTopicFilter, mqttFocusedGroupIdFromArgs, mqttPublishTemplateIdFromArgs, mqttSubscriptionTopicFromArgs, notify, openMqttDrawer, openMqttPreview, openMqttPublishOptions, persistMqttLayoutPrefs, refreshMqttConfigClientId, renameMqttTemplate, renameSelectedMqttRecord, repeatMqttPublishRecords, requestMqttFocus, resetMqttLayoutRatio, resizeMqttLayout, saveCurrentMqttPublishDraftHistory, saveCurrentMqttPublishTemplate, saveMqttConfigDraft, saveMqttConnectionGroupDraft, saveMqttFavoriteDraft, saveMqttPublishDraftHistoryEditDraft, saveMqttRecordEditDraft, saveMqttSubscriptionDraft, saveSelectedMqttRecordsAsMergedJson, scrollMqttPreview, selectMqttPublishOption, selectMqttSubscription, selectMqttTopicFilter, sendMqttPublishDraft, sendMqttPublishDraftHistory, sendMqttPublishTemplate, setMqttConnectionGroupCollapsed, setMqttHistorySearch, setMqttPreviewScroll, setMqttTemplateSearch, setMqttTopicFilterSearch, setMqttWorkspaceLayout, toggleMqttConnectionGroupCollapse, toggleMqttConnectionSelection, toggleMqttFollowLatest, toggleMqttPublishDraftHistory, toggleMqttPublishDraftHistorySelection, toggleMqttRecordFavorite, toggleMqttRecordSelectionFromArgs, toggleMqttSubscriptionSelection, updateToolPreviewPrefs, useMqttSubscriptionAsPublishTopic } = host
    register({ id: 'mqtt.connection.connect', title: '连接/重连 MQTT', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'mqtt', run: () => { void connectMqtt(); return true } })
    register({ id: 'mqtt.connection.disconnect', title: '断开 MQTT', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+Shift+R', when: (ctx) => ctx.tab === 'mqtt', run: () => disconnectMqtt() })
    register({ id: 'mqtt.connection.toggleSelect', title: '多选 MQTT 连接', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Space', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttConnectionSelection(args) })
    register({ id: 'mqtt.connection.copyAddress', title: '复制 MQTT 连接地址', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttConnectionAddress(args) })
    register({ id: 'mqtt.connection.delete', title: '删除当前 MQTT 连接', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteFocusedMqttConnection(args) })
    register({ id: 'mqtt.connection.deleteSelected', title: '删除选中 MQTT 连接', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'mqtt', run: () => deleteSelectedMqttConnections() })
    register({ id: 'mqtt.selection.clear', title: '清空 MQTT 多选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttRailSelection() })
    register({ id: 'mqtt.connectionTree.move', title: '移动 MQTT 连接树节点', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => moveMqttConnectionTreeFromArgs(args) })
    register({ id: 'mqtt.connectionGroup.create', title: '新建 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('create', args, ctx) })
    register({ id: 'mqtt.connectionGroup.edit', title: '编辑 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('edit', args, ctx) })
    register({ id: 'mqtt.connectionGroup.rename', title: '重命名 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('rename', args, ctx) })
    register({ id: 'mqtt.connectionGroup.moveParent', title: '移动 MQTT 连接分组父级', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Ctrl+F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConnectionGroupDraft('move-parent', args, ctx) })
    register({ id: 'mqtt.connectionGroup.delete', title: '删除 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => { const id = mqttFocusedGroupIdFromArgs(args); return id ? deleteMqttConnectionGroupById(id) : false } })
    register({ id: 'mqtt.connectionGroup.toggleCollapse', title: '折叠/展开 MQTT 连接分组', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 94, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttConnectionGroupCollapse(args) })
    register({ id: 'mqtt.connectionGroup.collapse', title: '折叠 MQTT 连接分组', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 94, shortcut: 'ArrowLeft', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttConnectionGroupCollapsed(args, true) })
    register({ id: 'mqtt.connectionGroup.expand', title: '展开 MQTT 连接分组', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 94, shortcut: 'ArrowRight', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttConnectionGroupCollapsed(args, false) })
    register({ id: 'mqtt.connectionGroup.save', title: '保存 MQTT 连接分组', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => saveMqttConnectionGroupDraft() })
    register({ id: 'mqtt.connectionGroup.cancel', title: '取消 MQTT 分组编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => cancelMqttConnectionGroupDraft() })
    register({ id: 'mqtt.connectionGroup.nextField', title: 'MQTT 分组编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => moveMqttConnectionGroupDraftField(1) })
    register({ id: 'mqtt.connectionGroup.prevField', title: 'MQTT 分组编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-connection-group-editor'), run: () => moveMqttConnectionGroupDraftField(-1) })
    register({ id: 'mqtt.config.create', title: '新建 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 95, shortcut: 'Ctrl+N', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConfigDraft('create', args, ctx) })
    register({ id: 'mqtt.config.edit', title: '编辑 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConfigDraft('edit', args, ctx) })
    register({ id: 'mqtt.config.rename', title: '重命名 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: (ctx, args) => beginMqttConfigDraft('rename', args, ctx) })
    register({ id: 'mqtt.config.save', title: '保存 MQTT 配置', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => saveMqttConfigDraft() })
    register({ id: 'mqtt.config.cancel', title: '取消 MQTT 编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => { host.mqttConfigDraft = null; notify(); return true } })
    register({ id: 'mqtt.config.clientId.refresh', title: '刷新 MQTT Client ID', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => refreshMqttConfigClientId() })
    register({ id: 'mqtt.config.nextField', title: 'MQTT 编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigDraftField(1) })
    register({ id: 'mqtt.config.prevField', title: 'MQTT 编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigDraftField(-1) })
    register({ id: 'mqtt.config.subscription.focus', title: '聚焦 MQTT 配置订阅行', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => focusMqttConfigSubscriptionEditor(args) })
    register({ id: 'mqtt.config.subscription.nextRow', title: 'MQTT 配置订阅下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigSubscriptionRow(1) })
    register({ id: 'mqtt.config.subscription.prevRow', title: 'MQTT 配置订阅上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigSubscriptionRow(-1) })
    register({ id: 'mqtt.config.subscription.deleteRow', title: '删除 MQTT 配置订阅行', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 99, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => deleteMqttConfigSubscriptionRow(args) })
    register({ id: 'mqtt.config.publish.focus', title: '聚焦 MQTT 配置发布 topic 行', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => focusMqttConfigPublishEditor(args) })
    register({ id: 'mqtt.config.publish.nextRow', title: 'MQTT 配置发布 topic 下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigPublishRow(1) })
    register({ id: 'mqtt.config.publish.prevRow', title: 'MQTT 配置发布 topic 上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: () => moveMqttConfigPublishRow(-1) })
    register({ id: 'mqtt.config.publish.deleteRow', title: '删除 MQTT 配置发布 topic 行', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 99, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.layerIds.includes('mqtt-editor'), run: (_ctx, args) => deleteMqttConfigPublishRow(args) })
    register({ id: 'mqtt.record.rename', title: '编辑 MQTT 记录别名', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => args?.title || args?.note ? renameSelectedMqttRecord({ title: typeof args.title === 'string' ? args.title : undefined, note: typeof args.note === 'string' ? args.note : undefined }) : beginMqttRecordEdit('rename', args) })
    register({ id: 'mqtt.record.edit', title: '完整编辑 MQTT 记录', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => beginMqttRecordEdit('edit', args) })
    register({ id: 'mqtt.record.edit.save', title: '保存 MQTT 记录编辑', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: (_ctx, args) => saveMqttRecordEditDraft(args) })
    register({ id: 'mqtt.record.edit.cancel', title: '取消 MQTT 记录编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: () => cancelMqttRecordEditDraft() })
    register({ id: 'mqtt.record.edit.nextField', title: 'MQTT 记录编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: () => moveMqttRecordEditDraftField(1) })
    register({ id: 'mqtt.record.edit.prevField', title: 'MQTT 记录编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-record-editor'), run: () => moveMqttRecordEditDraftField(-1) })
    register({ id: 'mqtt.record.delete', title: '删除 MQTT 记录', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteSelectedMqttRecord(args) })
    register({ id: 'mqtt.messages.clearAll', title: '清空 MQTT 消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttRecordList('messages') })
    register({ id: 'mqtt.history.clearAll', title: '清空 MQTT 历史', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttRecordList('history') })
    register({ id: 'mqtt.log.delete', title: '删除当前 MQTT 日志', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 93, when: (ctx) => ctx.tab === 'mqtt', run: () => deleteSelectedMqttLog() })
    register({ id: 'mqtt.log.clearCurrentConfig', title: '清空当前连接 MQTT 日志', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttLogs('current') })
    register({ id: 'mqtt.log.clearAll', title: '清空全部 MQTT 日志', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => clearMqttLogs('all') })
    register({ id: 'mqtt.subscription.add', title: '新增 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+T', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttSubscriptionDraft(true) })
    register({ id: 'mqtt.subscription.editor.open', title: '管理 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'mqtt', run: () => beginMqttSubscriptionDraft(false) })
    register({ id: 'mqtt.subscription.editor.save', title: '保存 MQTT 订阅编辑', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => saveMqttSubscriptionDraft() })
    register({ id: 'mqtt.subscription.editor.cancel', title: '取消 MQTT 订阅编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => cancelMqttSubscriptionDraft() })
    register({ id: 'mqtt.subscription.editor.nextField', title: 'MQTT 订阅编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftField(1) })
    register({ id: 'mqtt.subscription.editor.prevField', title: 'MQTT 订阅编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftField(-1) })
    register({ id: 'mqtt.subscription.editor.nextRow', title: 'MQTT 订阅编辑下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftRow(1) })
    register({ id: 'mqtt.subscription.editor.prevRow', title: 'MQTT 订阅编辑上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: () => moveMqttSubscriptionDraftRow(-1) })
    register({ id: 'mqtt.subscription.editor.deleteRow', title: '删除 MQTT 订阅编辑行', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.layerIds.includes('mqtt-subscription-editor'), run: (_ctx, args) => deleteMqttSubscriptionDraftRow(args) })
    register({ id: 'mqtt.pane.next', title: '切换 MQTT 区域', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 93, shortcut: 'Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPane(1) })
    register({ id: 'mqtt.pane.prev', title: '反向切换 MQTT 区域', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 93, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPane(-1) })
    register({ id: 'mqtt.subscription.panel.toggle', title: '折叠/展开 MQTT 订阅栏', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 92, shortcut: 'Ctrl+Shift+T', when: (ctx) => ctx.tab === 'mqtt', run: () => {
      host.mqttSubscriptionPanelOpen = !host.mqttSubscriptionPanelOpen
      closeMqttCommandFocusSurfaces()
      host.activeMqttPane = host.mqttSubscriptionPanelOpen ? 'subscriptions' : 'messages'
      requestMqttFocus(host.mqttSubscriptionPanelOpen ? 'subscriptions' : 'records')
      persistMqttLayoutPrefs()
      notify()
      return true
    } })
    register({ id: 'mqtt.subscription.select', title: '选择 MQTT 订阅筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => selectMqttSubscription(typeof args?.topic === 'string' ? args.topic : null) })
    register({ id: 'mqtt.subscription.focus', title: '聚焦 MQTT 订阅', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => focusMqttSubscription(typeof args?.topic === 'string' ? args.topic : null) })
    register({ id: 'mqtt.subscription.toggleSelect', title: '多选 MQTT 订阅', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Space', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttSubscriptionSelection(mqttSubscriptionTopicFromArgs(args) || undefined) })
    register({ id: 'mqtt.subscription.applyFilter', title: '应用 MQTT 订阅筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: () => applyMqttSubscriptionFilter() })
    register({ id: 'mqtt.subscription.copyTopic', title: '复制 MQTT 订阅 topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttSubscriptionTopic(args) })
    register({ id: 'mqtt.subscription.useAsPublishTopic', title: '填入 MQTT 发布 topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => useMqttSubscriptionAsPublishTopic(args) })
    register({ id: 'mqtt.subscription.delete', title: '删除当前 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteFocusedMqttSubscription(mqttSubscriptionTopicFromArgs(args) || undefined) })
    register({ id: 'mqtt.subscription.deleteSelected', title: '删除选中 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'mqtt', run: () => deleteSelectedMqttSubscriptions() })
    register({ id: 'mqtt.subscription.clearAll', title: '清空 MQTT 订阅', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: () => clearAllMqttSubscriptions() })
    register({ id: 'mqtt.layout.toggle', title: '切换 MQTT 收发布局', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+Shift+S', when: (ctx) => ctx.tab === 'mqtt', run: () => { setMqttWorkspaceLayout(host.mqttWorkspaceLayout === 'stack' ? 'split' : 'stack'); notify(); return true } })
    register({ id: 'mqtt.followLatest.toggle', title: '切换跟随最新消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => toggleMqttFollowLatest() })
    register({ id: 'mqtt.layout.resize', title: '调整 MQTT 收发比例', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => resizeMqttLayout(args) })
    register({ id: 'mqtt.layout.reset', title: '重置 MQTT 收发比例', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => resetMqttLayoutRatio(args) })
    register({ id: 'tool.preview.hover.update', title: '更新工具悬浮预览设置', group: '工具系统', risk: 'normal', scope: 'global', priority: 91, when: () => true, run: (_ctx, args) => updateToolPreviewPrefs(args) })
    register({ id: 'mqtt.log.drawer.open', title: '打开 MQTT 日志抽屉', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => { host.mqttLogDrawer = { open: true }; notify(); return true } })
    register({ id: 'mqtt.log.drawer.close', title: '关闭 MQTT 日志抽屉', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-log-drawer'), run: () => { host.mqttLogDrawer = { open: false }; notify(); return true } })
    register({ id: 'mqtt.receive.filter.all', title: 'MQTT 接收筛选全部', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+1', when: (ctx) => ctx.tab === 'mqtt', run: () => { host.mqttReceiveFilter = 'all'; focusMqttRecordList('messages'); return true } })
    register({ id: 'mqtt.receive.filter.in', title: 'MQTT 接收筛选已接收', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+2', when: (ctx) => ctx.tab === 'mqtt', run: () => { host.mqttReceiveFilter = 'incoming'; focusMqttRecordList('messages'); return true } })
    register({ id: 'mqtt.receive.filter.out', title: 'MQTT 接收筛选已发送', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+3', when: (ctx) => ctx.tab === 'mqtt', run: () => { host.mqttReceiveFilter = 'outgoing'; focusMqttRecordList('messages'); return true } })
    register({ id: 'mqtt.topicFilter.focus', title: '聚焦 MQTT topic 筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttTopicFilter() })
    register({ id: 'mqtt.topicFilter.search.set', title: '更新 MQTT topic 筛选搜索', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttTopicFilterSearch(args) })
    register({ id: 'mqtt.topicFilter.next', title: 'MQTT topic 筛选下移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowDown', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttTopicFilter(1) })
    register({ id: 'mqtt.topicFilter.prev', title: 'MQTT topic 筛选上移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowUp', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttTopicFilter(-1) })
    register({ id: 'mqtt.topicFilter.select', title: '选择 MQTT topic 筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => selectMqttTopicFilter(args) })
    register({ id: 'mqtt.topicFilter.close', title: '关闭 MQTT topic 筛选', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => closeMqttTopicFilter() })
    register({ id: 'mqtt.publish.send', title: '发送 MQTT 消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => sendMqttPublishDraft(args) })
    register({ id: 'mqtt.publish.draft.toggle', title: '打开/关闭 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+H', when: (ctx) => ctx.tab === 'mqtt', run: () => toggleMqttPublishDraftHistory() })
    register({ id: 'mqtt.publish.records.toggle', title: '打开/关闭 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: () => toggleMqttPublishDraftHistory() })
    register({ id: 'mqtt.publish.draft.saveDraft', title: '保存当前 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Ctrl+Shift+H', when: (ctx) => ctx.tab === 'mqtt', run: () => saveCurrentMqttPublishDraftHistory() })
    register({ id: 'mqtt.publish.draft.close', title: '关闭 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => closeMqttPublishDraftHistory() })
    register({ id: 'mqtt.publish.draft.next', title: 'MQTT 发送草稿下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => moveMqttPublishDraftHistory(1) })
    register({ id: 'mqtt.publish.draft.prev', title: 'MQTT 发送草稿上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => moveMqttPublishDraftHistory(-1) })
    register({ id: 'mqtt.publish.draft.apply', title: '应用 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => applyMqttPublishDraftHistory(args) })
    register({ id: 'mqtt.publish.draft.send', title: '发送 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => sendMqttPublishDraftHistory(args) })
    register({ id: 'mqtt.publish.draft.toggleSelect', title: '多选 MQTT 发送草稿', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, shortcut: 'Space', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => toggleMqttPublishDraftHistorySelection(args) })
    register({ id: 'mqtt.publish.draft.focus', title: '聚焦 MQTT 发送草稿项', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 91, when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => focusMqttPublishDraftHistory(args) })
    register({ id: 'mqtt.publish.draft.favorite', title: '收藏 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => favoriteMqttPublishDraftHistory(args) })
    register({ id: 'mqtt.publish.draft.edit', title: '完整编辑 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Shift+F2', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => beginMqttPublishDraftHistoryEdit('edit', args) })
    register({ id: 'mqtt.publish.draft.rename', title: '编辑 MQTT 发送草稿别名', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'F2', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => beginMqttPublishDraftHistoryEdit('rename', args) })
    register({ id: 'mqtt.publish.draft.edit.save', title: '保存 MQTT 发送草稿编辑', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 92, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => saveMqttPublishDraftHistoryEditDraft() })
    register({ id: 'mqtt.publish.draft.edit.cancel', title: '取消 MQTT 发送草稿编辑', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 92, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => cancelMqttPublishDraftHistoryEditDraft() })
    register({ id: 'mqtt.publish.draft.edit.nextField', title: 'MQTT 发送草稿编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 92, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => moveMqttPublishDraftHistoryEditField(1) })
    register({ id: 'mqtt.publish.draft.edit.prevField', title: 'MQTT 发送草稿编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 92, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft-editor'), run: () => moveMqttPublishDraftHistoryEditField(-1) })
    register({ id: 'mqtt.publish.draft.delete', title: '删除 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: (_ctx, args) => deleteMqttPublishDraftHistoryEntry(args) })
    register({ id: 'mqtt.publish.draft.clear', title: '清空 MQTT 发送草稿', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-publish-draft'), run: () => clearCurrentMqttPublishDraftHistory() })
    register({ id: 'mqtt.focus.messages', title: '聚焦 MQTT 消息区', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttRecordList('messages') })
    register({ id: 'mqtt.focus.templates', title: '聚焦 MQTT 收藏区', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+M', when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttRecordList('templates') })
    register({ id: 'mqtt.focus.publish', title: '聚焦 MQTT 发送区', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Ctrl+P', when: (ctx) => ctx.tab === 'mqtt', run: () => focusMqttPublishEditor() })
    register({ id: 'mqtt.publish.blur', title: '退出 MQTT 发送编辑', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => blurMqttPublishEditor() })
    register({ id: 'mqtt.publish.nextField', title: 'MQTT 发送编辑下一个字段', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishField(1) })
    register({ id: 'mqtt.publish.prevField', title: 'MQTT 发送编辑上一个字段', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishField(-1) })
    register({ id: 'mqtt.publish.options.open', title: '编辑 MQTT 发送选项', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: () => openMqttPublishOptions() })
    register({ id: 'mqtt.publish.options.close', title: '关闭 MQTT 发送选项', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => closeMqttPublishOptions() })
    register({ id: 'mqtt.publish.options.next', title: 'MQTT 发送选项下移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowDown', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishOptions(1) })
    register({ id: 'mqtt.publish.options.prev', title: 'MQTT 发送选项上移', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'ArrowUp', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttPublishOptions(-1) })
    register({ id: 'mqtt.publish.options.select', title: '选择 MQTT 发送选项', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => selectMqttPublishOption(args) })
    register({ id: 'mqtt.record.focus', title: '聚焦 MQTT 记录', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => focusMqttRecordFromArgs(args) })
    register({ id: 'mqtt.template.search.set', title: '筛选 MQTT 模板', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttTemplateSearch(args) })
    register({ id: 'mqtt.history.search.set', title: '筛选 MQTT 历史', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => setMqttHistorySearch(args) })
    register({ id: 'mqtt.publish.template.save', title: '保存 MQTT 发送模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => saveCurrentMqttPublishTemplate(args) })
    register({ id: 'mqtt.publish.template.apply', title: '应用 MQTT 发送模板', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => applyMqttPublishTemplate(mqttPublishTemplateIdFromArgs(args)) })
    register({ id: 'mqtt.publish.template.send', title: '直接发送 MQTT 模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => sendMqttPublishTemplate(mqttPublishTemplateIdFromArgs(args)) })
    register({ id: 'mqtt.publish.template.rename', title: '重命名 MQTT 发送模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => renameMqttTemplate(mqttPublishTemplateIdFromArgs(args), args) })
    register({ id: 'mqtt.publish.template.delete', title: '删除 MQTT 发送模板', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => deleteMqttTemplate(mqttPublishTemplateIdFromArgs(args)) })
    register({ id: 'mqtt.record.resendDraft', title: '从记录填充 MQTT 发布草稿', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => fillMqttPublishDraftFromSelection(args) })
    register({ id: 'mqtt.record.repeatSend', title: '重复发送 MQTT 记录', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => repeatMqttPublishRecords(args) })
    register({ id: 'mqtt.record.toggleSelect', title: '多选 MQTT 发送记录', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttRecordSelectionFromArgs(args) })
    register({ id: 'mqtt.record.export.copyMergedJson', title: '全都复制多选 MQTT 融合 JSON', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copySelectedMqttRecordsAsMergedJson(args) })
    register({ id: 'mqtt.record.export.copyTopics', title: '只复制多选 MQTT topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copySelectedMqttRecordTopics(args) })
    register({ id: 'mqtt.record.export.copyPayloads', title: '只复制多选 MQTT payload', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copySelectedMqttRecordPayloads(args) })
    register({ id: 'mqtt.record.export.saveMergedJson', title: '导出多选 MQTT 融合 JSON 文件', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => saveSelectedMqttRecordsAsMergedJson(args) })
    register({ id: 'mqtt.record.copyTopic', title: '复制 MQTT topic', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, shortcut: 'Ctrl+Shift+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttRecordTopic(args) })
    register({ id: 'mqtt.record.copyPayload', title: '复制 MQTT payload', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, shortcut: 'Ctrl+C', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttRecordPayload(args) })
    register({ id: 'mqtt.record.copyAll', title: '全都复制 MQTT 记录', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 89, when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => copyMqttRecordAll(args) })
    register({ id: 'mqtt.record.favorite', title: '收藏/取消收藏 MQTT 消息', group: 'MQTT', risk: 'data-write', scope: 'tab', priority: 89, shortcut: 'Ctrl+S', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => toggleMqttRecordFavorite(args) })
    register({ id: 'mqtt.record.favorite.save', title: '保存 MQTT 消息收藏', group: 'MQTT', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: (_ctx, args) => saveMqttFavoriteDraft(args) })
    register({ id: 'mqtt.record.favorite.cancel', title: '取消 MQTT 消息收藏', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: () => cancelMqttFavoriteDraft() })
    register({ id: 'mqtt.record.favorite.nextField', title: 'MQTT 收藏下一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: () => { if (!host.mqttFavoriteDraft) return false; host.mqttFavoriteDraft = { ...host.mqttFavoriteDraft, activeField: 'title' }; notify(); return true } })
    register({ id: 'mqtt.record.favorite.prevField', title: 'MQTT 收藏上一个字段', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('mqtt-favorite-editor'), run: () => { if (!host.mqttFavoriteDraft) return false; host.mqttFavoriteDraft = { ...host.mqttFavoriteDraft, activeField: 'title' }; notify(); return true } })
    register({ id: 'mqtt.preview.open', title: '打开 MQTT 预览', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 88, shortcut: 'Ctrl+I', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => openMqttPreview(args) })
    register({ id: 'mqtt.preview.close', title: '关闭 MQTT 预览', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: () => closeMqttPreview() })
    register({ id: 'mqtt.preview.scroll.up', title: 'MQTT 预览上滚', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+ArrowUp', when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: () => scrollMqttPreview(-1) })
    register({ id: 'mqtt.preview.scroll.down', title: 'MQTT 预览下滚', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+ArrowDown', when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: () => scrollMqttPreview(1) })
    register({ id: 'mqtt.preview.scroll.set', title: '同步 MQTT 预览滚动', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, when: (ctx) => ctx.layerIds.includes('mqtt-preview'), run: (_ctx, args) => setMqttPreviewScroll(args) })
    register({ id: 'mqtt.search.focus', title: '聚焦 MQTT 搜索', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'mqtt', run: () => {
      host.searchFocusTarget = host.activeMqttRecordList === 'templates'
        ? 'mqtt-templates'
        : host.activeMqttRecordList === 'history'
          ? 'mqtt-history'
          : 'mqtt'
      host.searchFocusRequestId += 1
      notify()
      return true
    } })
    register({ id: 'mqtt.search.blur', title: '退出 MQTT 搜索', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'mqtt', run: () => blurSearchFocus() })
    register({ id: 'mqtt.panel.toggle', title: '折叠/展开 MQTT 侧栏', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 98, shortcut: 'Ctrl+Shift+W', when: (ctx) => ctx.tab === 'mqtt', run: () => {
      host.mqttPanelOpen = !host.mqttPanelOpen
      closeMqttCommandFocusSurfaces()
      host.activeMqttPane = host.mqttPanelOpen ? 'connections' : 'messages'
      requestMqttFocus(host.mqttPanelOpen ? 'connections' : 'records')
      persistMqttLayoutPrefs()
      notify()
      return true
    } })
    register({ id: 'mqtt.detail.open', title: '打开 MQTT 详情', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => openMqttDrawer(false, args) })
    register({ id: 'mqtt.detail.close', title: '关闭 MQTT 详情', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-detail'), run: () => closeMqttDrawer() })
    register({ id: 'mqtt.drawer.open', title: '打开 MQTT 动作抽屉', group: 'MQTT', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'mqtt', run: (_ctx, args) => openMqttDrawer(true, args) })
    register({ id: 'mqtt.drawer.close', title: '关闭 MQTT 动作抽屉', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, when: (ctx) => ctx.layerIds.includes('mqtt-drawer') || ctx.layerIds.includes('mqtt-detail'), run: () => closeMqttDrawer() })
    register({ id: 'mqtt.drawer.next', title: 'MQTT 抽屉内下移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, shortcut: 'ArrowDown', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttDrawer(1) })
    register({ id: 'mqtt.drawer.prev', title: 'MQTT 抽屉内上移', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, shortcut: 'ArrowUp', when: (ctx) => ctx.tab === 'mqtt', run: () => moveMqttDrawer(-1) })
    register({ id: 'mqtt.drawer.select', title: '执行 MQTT 抽屉当前动作', group: 'MQTT', risk: 'normal', scope: 'layer', priority: 90, shortcut: 'Enter', when: (ctx) => ctx.tab === 'mqtt', run: () => executeMqttDrawerItem() })
    for (let index = 1; index <= 9; index += 1) {
      register({
        id: `mqtt.drawer.select.${index}`,
        title: `执行 MQTT 抽屉第 ${index} 个动作`,
        group: 'MQTT',
        risk: 'normal',
        scope: 'layer',
        priority: 80 - index,
        shortcut: `Ctrl+${index}`,
        when: (ctx) => ctx.tab === 'mqtt',
        run: () => executeMqttDrawerItem(index - 1)
      })
      register({
        id: `mqtt.drawer.action.${index}`,
        title: `直接执行第 ${index} 个 MQTT 动作`,
        group: 'MQTT',
        risk: 'normal',
        scope: 'tab',
        priority: 70 - index,
        shortcut: `Ctrl+Alt+${index}`,
        when: (ctx) => ctx.tab === 'mqtt',
        run: () => executeMqttDrawerItem(index - 1, true)
      })
    }
}
