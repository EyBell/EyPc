# MQTT 记录模式与快捷键整合需求

## 目标

- MQTT 消息工作区去掉顶部冗余跳转按钮，不再显示“消息/发送/日志”快捷芯片。
- `全部/收/发` 筛选右侧只保留记录模式图标：收藏、历史、布局。
- 收藏或历史被选中时，替代上方消息区展示单一记录列表；发送区保留在下方，不再渲染底部收藏/历史双列区域。
- `Ctrl+F` 聚焦当前可见列表搜索：消息、收藏、历史分别聚焦自身搜索输入。
- 搜索收藏/历史后默认高亮第一条可见记录，删除后沿用 EzClipboard 式锚点恢复。
- MQTT 连接/断开为功能 tab 全局命令，不要求左侧连接行高亮；连接配置编辑仅在连接区高亮时触发。
- 记录高亮时 `F2` 编辑别名/标题，`Shift+F2` 完整编辑 topic、payload、QoS、retain；连接区保留 `F2` 配置编辑和 `Shift+F2` 配置重命名。
- 布局默认快捷键改为 `Ctrl+Shift+S`，释放与功能 tab 的快捷键冲突。
- `Ctrl+ArrowRight` 动作抽屉按当前类型展示可用命令：消息可收藏、编辑、清理；历史可重发、收藏、清理；收藏可编辑、发送、删除。

## 范围

- Runtime、快捷键和搜索焦点：[src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)、[src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1)、[src/App.vue](../../../src/App.vue#L1)。
- UI 和样式：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)、[src/components/MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L1)、[src/styles/app.css](../../../src/styles/app.css#L1)。
- MQTT archive 更新：[src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L1)。
- 回归测试：[tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1)、[tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1)、[tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1)。

## 验收

- 顶部 command bar 不包含旧 `mqtt-jump-strip`。
- 收藏/历史只在上方消息区单列表展示，页面不包含旧 `mqtt-publish-record-grid`。
- `Ctrl+Shift+S` 触发布局切换，`Ctrl+Shift+L` 不再触发默认 MQTT 布局命令。
- 记录区 `F2` 打开 `mqttRecordEditDraft.mode = rename`，`Shift+F2` 打开 `mode = edit`；连接区仍打开 `mqttConfigDraft`。
- 目标测试、类型检查、构建、文档链接审计通过。
