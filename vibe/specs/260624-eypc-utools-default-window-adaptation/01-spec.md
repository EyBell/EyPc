# uTools 默认窗口 MQTT 再适配需求

Tool: codex

## 目标

- MQTT 默认窗口下顶部 command bar 不裁切记录视图图标，连接摘要、收发筛选、记录视图各自占据稳定区域。
- 发送栏在默认窗口下保留 topic、QoS、retain 和发送/保存模板/发送记录三个 icon-only 命令，不被输入框挤出边界。
- 保留现有 MQTT runtime action、快捷键、ARIA/title、顶层 shortcut hint、连接协议和存储行为。
- 不修改 uTools manifest 尺寸配置，不处理未跟踪文件 `public/preload.cjs`。

## 范围

- 模板结构：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1266) 将 `.mqtt-record-mode-buttons` 从 `.mqtt-filter-buttons` 中拆出为 command bar 第三个区域；[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1555) 为发送区动作按钮新增 `.mqtt-publish-actions`。
- 样式适配：[src/styles/app.css](../../../src/styles/app.css#L3119) 调整 command bar 三列网格、筛选按钮最小宽度和 record-mode 32px 图标组；[src/styles/app.css](../../../src/styles/app.css#L3528) 固定发布动作组宽度；[src/styles/app.css](../../../src/styles/app.css#L4018) 增加 1100px 中等窄窗断点，保留 700px 以下单列兜底。
- 回归测试：[tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L108) 锁定默认窗口布局契约；[tests/ui/searchShortcutHints.test.ts](../../../tests/ui/searchShortcutHints.test.ts#L43) 继续保护顶部 Tab 和 Ctrl/Cmd 浮动提示。

## 验收

- `pnpm exec vitest run tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` 通过，且新增断言先经历 RED。
- `pnpm run test`、`pnpm run typecheck`、`pnpm run build` 通过。
- 浏览器 smoke 在 760x680、900x680、1200x680 视口下确认 MQTT 页无横向裁切，command bar 和 publish bar 按钮在工作区边界内。
- 文档链接审计通过。
