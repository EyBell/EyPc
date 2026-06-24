# uTools 默认窗口 MQTT 再适配验证

Tool: codex

## 已运行

- 2026-06-24 RED：`pnpm exec vitest run tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` 失败，原因是 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1278) 中 `.mqtt-record-mode-buttons` 仍嵌套在 `.mqtt-filter-buttons` 内。
- 2026-06-24 PASS：`pnpm exec vitest run tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` 通过：`2 files / 6 tests`。
- 2026-06-24 PASS：`pnpm run test` 通过：`30 files / 224 tests`。Node 仅输出既有 SQLite experimental warning。
- 2026-06-24 PASS：`pnpm run typecheck` 通过。
- 2026-06-24 PASS：`pnpm run build` 通过，包含 `vue-tsc --noEmit`、Vite production build、`scripts/prepare-utools-runtime.mjs` 和 `pnpm run validate:utools`。
- 2026-06-24 PASS：Playwright Chrome smoke 复用既有 `http://127.0.0.1:8092/`，在 760x680、900x680、1200x680 视口下确认 `body` / `documentElement` 无横向溢出，`.mqtt-command-bar`、`.mqtt-filter-buttons`、`.mqtt-record-mode-buttons`、`.mqtt-publish-command-bar`、`.mqtt-publish-command-bar > input` 和 `.mqtt-publish-actions` 全部在 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1266) 的 `.mqtt-message-workspace` 边界内；760px 下发布 topic 输入宽度为 115px。
- 2026-06-24 PASS：`audit_code_links.py` 文档链接审计通过。
- 2026-06-24 RED：紧凑化 follow-up `pnpm exec vitest run tests/domain/mqttPayloadPreview.test.ts tests/ui/mqttPage.test.ts` 失败，原因是缺少 `buildMqttInlinePayloadPreviewSegments`，且 UI 尚未渲染行内 token snippet / alias badge / 固定高度样式。
- 2026-06-24 PASS：紧凑化 follow-up `pnpm exec vitest run tests/domain/mqttPayloadPreview.test.ts tests/ui/mqttPage.test.ts` 通过：`2 files / 7 tests`。
- 2026-06-24 PASS：`pnpm run typecheck` 通过。
- 2026-06-24 PASS：`pnpm run test` 通过：`30 files / 228 tests`。Node 仅输出既有 SQLite experimental warning。
- 2026-06-24 PASS：Playwright Chrome smoke 复用既有 `http://127.0.0.1:8092/`，注入临时浏览器 `localStorage` MQTT fixture 后测得 1000x720 下 `.mqtt-command-bar` 高 37px、`.mqtt-filter-buttons` 高 28px、`.mqtt-record-mode-buttons` 高 26px、消息行高 34px、payload snippet 高 22px、alias badge 高 13px、发布栏高 33px；历史 record item 高 34px；预览浮层为 420px 宽、160px 最小高，payload 区 `overflowY=auto`、字体 12px；700x720 下 command bar 仍为 37px 且 `overflow-x:auto`，record item 仍为 34px。截图见 [../../../output/playwright/mqtt-compact-700.png](../../../output/playwright/mqtt-compact-700.png)。

## 未验证

- MQTT live broker 手工 smoke 不属于本次默认窗口布局适配范围。
