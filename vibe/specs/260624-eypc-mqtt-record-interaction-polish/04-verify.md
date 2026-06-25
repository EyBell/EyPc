# MQTT 消息记录交互细化验证记录

## 自动验证

- 2026-06-24 RED: `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/domain/mqtt.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` failed as expected，覆盖缺失 `mqtt-publish-editor`、旧 `Ctrl+D` 收藏、空别名归一化、自动别名弹窗、原始消息编辑覆盖、多选和 topic 颜色能力。
- 2026-06-24 PASS: `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/domain/mqtt.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` passed: `5 files / 121 tests`。
- 2026-06-24 PASS: `pnpm run typecheck` passed.
- 2026-06-24 PASS: `pnpm run test` passed: `30 files / 230 tests`；Node 仅输出既有 SQLite experimental warning。
- 2026-06-24 PASS: `pnpm run build` passed，包含 `vue-tsc --noEmit`、Vite production build、uTools runtime asset preparation 和 `validate:utools`。
- 2026-06-24 PASS: final runtime wording regression `pnpm exec vitest run tests/runtime/action.test.ts` passed: `1 file / 77 tests`。
- 2026-06-24 RED: topic alias full-label follow-up `pnpm exec vitest run tests/ui/mqttPage.test.ts` failed as expected on old `.mqtt-topic-alias-badge` and missing `messageRouteLabel` / `rowRouteLabel` route-label helpers.
- 2026-06-24 RED: topic visual domain follow-up `pnpm exec vitest run tests/domain/mqtt.test.ts` failed as expected because `mqttTopicVisualForMessage` still returned the old truncated `aliasPreview`.
- 2026-06-24 PASS: topic alias follow-up targeted suite `pnpm exec vitest run tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/domain/mqtt.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` passed: `5 files / 121 tests`。
- 2026-06-24 PASS: topic alias follow-up `pnpm run typecheck` passed.
- 2026-06-24 PASS: topic alias follow-up `pnpm run build` passed，包含 `vue-tsc --noEmit`、Vite production build、uTools runtime asset preparation 和 `validate:utools`。
- 2026-06-24 PASS: topic alias follow-up full regression `pnpm run test` passed: `30 files / 230 tests`；Node 仅输出既有 SQLite experimental warning。
- 2026-06-24 RED: 顶部搜索/按钮统一 follow-up `pnpm vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` failed as expected，覆盖缺失顶部 `mqtt-record-toolbar-slot`、消息 `mqttSearch` 过滤和搜索态 `Ctrl+Delete` 强制删除。
- 2026-06-24 PASS: 顶部搜索/按钮统一 targeted suite `pnpm vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` passed: `3 files / 106 tests`。
- 2026-06-24 PASS: 顶部搜索/按钮统一 full regression `pnpm run test` passed: `30 files / 231 tests`；Node 仅输出既有 SQLite experimental warning。
- 2026-06-24 PASS: 顶部搜索/按钮统一 `pnpm run typecheck` passed.
- 2026-06-24 PASS: 顶部搜索/按钮统一 `pnpm run build` passed，包含 `vue-tsc --noEmit`、Vite production build、uTools runtime asset preparation 和 `validate:utools`。

## 浏览器烟测

- 2026-06-24 PASS: `pnpm run dev` 启动 `http://127.0.0.1:8092/`，Playwright CLI 打开 MQTT 页。
- 2026-06-24 PASS: 默认 1280px 浏览器宽度下，顶部记录视图按钮为 `显示收藏`、`切换布局`，发送操作为 `发送 MQTT 消息`、`保存模板`，4 个发布编辑控件均带 `data-role="mqtt-publish-editor"`，页面无横向溢出。
- 2026-06-24 PASS: 新建连接抽屉添加订阅后，订阅行渲染 5 个默认色板，hex 输入接受 `#111111`，配置抽屉无横向溢出。
- 2026-06-24 PASS: topic alias follow-up Playwright smoke confirmed `.mqtt-topic-alias-badge` no longer exists in MQTT DOM and the page has no horizontal overflow. The opened dev browser had no message rows, so full alias row text is covered by source/UI/domain tests.
- 2026-06-24 NOTE: Playwright 控制台唯一错误是 dev server 未提供 `/favicon.ico` 的 404，与 MQTT 改动无关。
- 2026-06-24 NOTE: 顶部搜索/按钮统一 follow-up 未新增浏览器烟测；顶部搜索槽迁移、内部 header/search 移除、按钮尺寸和搜索态删除由 UI/runtime/action tests 覆盖。

## 未覆盖

- 未连接真实 MQTT broker；实时消息收发和 broker 侧 QoS/retain 行为仍沿用 [../2606231645-eypc-mqtt-websocket-tab/04-verify.md](../2606231645-eypc-mqtt-websocket-tab/04-verify.md#L1) 的 live smoke gate。
