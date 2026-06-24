# uTools 默认窗口 MQTT 再适配计划

Tool: codex

## 实施顺序

1. 在 [tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L108) 先补 RED 契约：record-mode 不再嵌套在筛选组内、发送动作有 `.mqtt-publish-actions`、CSS 含 1100px 中等窄窗断点。
2. 在 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1266) 拆分 MQTT command bar 的三个区域，并在 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1555) 给发送动作按钮增加独立分组。
3. 在 [src/styles/app.css](../../../src/styles/app.css#L3119) 收紧 command bar、方向筛选按钮、record-mode 32px 图标组和 publish action 30px 图标组。
4. 在 [src/styles/app.css](../../../src/styles/app.css#L4018) 增加 1100px 断点：连接摘要和记录视图同排，方向筛选整行铺开，发布标题和动作组各自占行，topic/QoS/retain 保持可见。
5. 更新 [vibe/specs/PROJECT_STATUS.md](../PROJECT_STATUS.md#L1) 和 [vibe/knowledge/technical-details.md](../../knowledge/technical-details.md#L1)，记录当前默认窗口布局契约与验证状态。
6. 运行目标测试、全量测试、类型检查、构建、浏览器 smoke 和文档链接审计。

## 风险控制

- 不改 MQTT runtime、存储、keybinding、平台桥接和 manifest。
- 不新增依赖，不引入动画。
- 不修改端口、收藏、设置页布局。
- 保留 icon-only 按钮的 `title`、`aria-label` 和 `data-mqtt-shortcut-hint`。
