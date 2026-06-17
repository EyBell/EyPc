# EyPc Command Soul Shortcuts Spec

Tool: codex

## Goal

固化编辑类 command 语义：`F2` 是完整编辑，`Shift+F2` 是窄重命名，`Ctrl+S` 保存当前编辑层，`Escape` 取消当前编辑层，`Tab` / `Shift+Tab` 只在编辑层内部循环字段。

## Required Behavior

- 端口组 `F2` 打开完整编辑，字段为名称、规则、颜色。
- 端口组 `Shift+F2` 打开重命名，仅更新名称，不改规则和颜色。
- 分组编辑层阻断底层 pane、搜索、抽屉、列表和全局 tab 快捷键。
- 快捷键覆盖按 `global`、`ports`、`favorites`、`settings` profile 持久化，同时保留旧聚合数组兼容。
- 项目规则和 developer soul 必须把该语义作为交互变更检查项。

## Code Anchors

- Keybinding runtime: [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- App runtime: [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Port editor UI: [../../../src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L1).
- Shortcut state: [../../../src/domain/state.ts](../../../src/domain/state.ts#L1).
- Developer soul: [../../knowledge/developer-soul.md](../../knowledge/developer-soul.md#L1).
