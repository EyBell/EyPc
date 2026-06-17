# EyPc Port Tab Interaction Spec

Tool: codex

## Goal

把端口页收敛为键盘优先的清理工作台：`Tab` 在端口页内切换左右栏，`Ctrl+1/2/3` 固定用于全局功能切页。

## Requirements

- 端口页内 `Tab` / `Shift+Tab` 在端口组栏和结果栏之间循环，且切栏后对应栏必须有可操作焦点。
- 非端口页仍保留 `Tab` / `Shift+Tab` 全局页签切换；文本输入聚焦时不抢系统输入行为。
- `Alt+←/→` 继续保留为左右栏直接切换的兼容快捷键。
- `Ctrl+F` 在端口页按当前栏聚焦搜索：结果栏聚焦端口搜索，分组栏聚焦端口组搜索。
- `Escape` 优先关闭确认层，其次关闭端口组编辑层，再清空当前栏搜索。
- 结果栏保持 `Space` 多选、`Enter` 普通终止确认、`Ctrl+Enter` 强杀选中。
- 分组栏保持 `Enter` 应用分组、`Shift+Enter` 普通终止组确认、`Ctrl+Shift+Enter` 强杀当前组。
- 新增或调整的快捷命令必须继续进入设置页，可覆盖、禁用、恢复默认。

## References

- 快捷键默认语义落在 [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L20)。
- 端口页焦点、搜索目标和清理动作落在 [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L103)。
- DOM 搜索目标聚焦落在 [src/App.vue](../../../src/App.vue#L55)。
