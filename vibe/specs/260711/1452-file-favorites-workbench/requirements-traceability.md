# EyPc 文件收藏工作台需求追溯

Tool: codex

本表只映射 [产品需求](../../PRODUCT_REQUIREMENTS.md#L1) 与 [当前规范](spec.md#L1)，不重复需求正文。

| Requirement | Code Boundary | Tests | UI / Host Verification | Status |
| --- | --- | --- | --- | --- |
| 坏图与路径标识 | [favorites.ts](../../../../src/domain/favorites.ts#L1)、[state.ts](../../../../src/domain/state.ts#L1) | [favorites.test.ts](../../../../tests/domain/favorites.test.ts#L1)、[state.test.ts](../../../../tests/domain/state.test.ts#L1) | 异常收藏保留并可通过 `F2` 修正 | verified |
| 结构化动作、能力、检查、符号链接 | [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[preload/index.js](../../../../preload/index.js#L1) | [favoriteFileBridge.test.ts](../../../../tests/platform/favoriteFileBridge.test.ts#L1)、[eypcPlatform.test.ts](../../../../tests/platform/eypcPlatform.test.ts#L1) | 权限拒绝保留已知元数据；特殊/未解析目录项不过度声明；macOS uTools/Windows/Linux real host unverified | verified-with-host-gap |
| 目标优先级、Quick 清理、Escape、撤销 | [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1) | [action.test.ts](../../../../tests/runtime/action.test.ts#L1)、[keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1) | 撤销恢复顺序/折叠/未被替换的上下文；完整页与 Quick 键盘 smoke | verified |
| 紧凑双栏、侧层、状态、ARIA、焦点 | [FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L1)、[QuickFavoritesPage.vue](../../../../src/pages/QuickFavoritesPage.vue#L1)、[FavoriteTree.vue](../../../../src/components/FavoriteTree.vue#L1)、[ConfirmLayer.vue](../../../../src/components/ConfirmLayer.vue#L1)、[app.css](../../../../src/styles/app.css#L1) | [favoritesBehavior.test.ts](../../../../tests/ui/favoritesBehavior.test.ts#L1) | pane DOM focus、触发点消失回退；1180/760/640/420 build-artifact UI；Quick 420 | verified |
| 元数据安全边界 | [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[preload/index.js](../../../../preload/index.js#L1) | remove/count/undo/copy regressions | 未执行且未暴露真实文件变更 | verified |
