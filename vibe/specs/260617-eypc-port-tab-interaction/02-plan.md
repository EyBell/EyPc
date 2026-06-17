# EyPc Port Tab Interaction Plan

Tool: codex

## Implementation

- 调整 [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L20)：端口页 `Tab` / `Shift+Tab` 命中 `ports.pane.toggleNext` / `ports.pane.togglePrev`，非端口页保留 `tab.next` / `tab.prev`。
- 扩展 [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L10)：snapshot 暴露 `searchFocusTarget`，runtime 注册页内切栏命令并让切栏补齐当前栏焦点。
- 调整 [src/App.vue](../../../src/App.vue#L55) 和 [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L41)：按 `searchFocusTarget` 聚焦端口搜索或端口组搜索。
- 更新 [src/components/CommandHints.vue](../../../src/components/CommandHints.vue#L10) 和 [src/styles/app.css](../../../src/styles/app.css#L130)：同步提示文案并强化 active/focused/selected 视觉层级。

## Verification

- 先补 runtime/keybinding RED 测试，再实现 GREEN。
- 跑 `pnpm run test`、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:utools`。
- 不执行真实进程 kill；真实 kill 仍只允许临时测试进程单独验证。
