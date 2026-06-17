# EyPc Layered Shortcuts Settings Spec

Tool: codex

## Goal

把快捷键从平面绑定升级为 `command + layer + when + priority + source` 解析模型，并让设置页能维护每个主功能 tab 的 command profile、绑定来源、冲突、保留键和解析结果。

## Requirements

- 每个 command 以 `commandId` 为稳定覆盖键，支持多个 `shortcutIds`、`enabled`、`when` 和旧 `shortcutId` 兼容。
- `Escape` 先由交互层回退：确认弹窗、设置录制、when 编辑、端口组编辑、抽屉、详情、多选、搜索/过滤，空闲时仍消费为 no-op。
- 设置页保留总控入口，但按 `全局 / 端口 / 收藏 / 设置 / 层级规则` 维护 profile。
- 设置页必须显示 command id、layer、when、当前绑定、默认绑定、来源、风险、冲突、保留键和解析预览。
- 录制弹窗和 when 编辑弹窗是高优先级局部交互层，保存前校验 assignable、冲突和保留键。

## Code Anchors

- Keybinding runtime: [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- App runtime Esc stack and persistence: [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Settings UI: [../../../src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1).
- State normalization: [../../../src/domain/state.ts](../../../src/domain/state.ts#L1).
- Keybinding types: [../../../src/domain/types.ts](../../../src/domain/types.ts#L1).
