# MQTT 记录模式与快捷键整合计划

## 实施顺序

1. 先更新目标测试，覆盖新布局、新快捷键、搜索高亮、记录编辑、抽屉动作。
2. 在 [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L1) 增加消息记录字段更新 helper，避免修改 archive 结构。
3. 在 [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) 增加 `mqttRecordEditDraft`，把收藏/历史切换改为消息区记录模式，不再使用底部 `publish-records` 面板。
4. 在 [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1) 拆分连接区和记录区的 `F2/Shift+F2`，并改布局快捷键为 `Ctrl+Shift+S`。
5. 在 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1) 移除旧跳转条和底部双列记录区，改为上方单记录列表和记录编辑弹层。
6. 在 [src/styles/app.css](../../../src/styles/app.css#L1) 删除旧跳转条/双列网格样式，补记录模式按钮和记录编辑弹层。
7. 更新项目中台、架构记忆、技术记忆，并把旧过程文档标记为 superseded。

## 风险控制

- 不修改 MQTT broker 连接协议和发送路径。
- 不新增依赖，不迁移存储 schema。
- 旧任务文档不删除，只从当前权威入口移除。
- CodeNote 母版仅写跨项目快捷键原则，项目细节只留在 EyPc 文档。
