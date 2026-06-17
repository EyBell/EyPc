# EyPc Layered Shortcuts Settings Plan

Tool: codex

## Plan

1. 扩展 keybinding runtime：补 layer priority、command profiles、shortcut normalization、when parser、reservation rules、conflict detection、解析预览。
2. 扩展状态兼容：旧 `shortcutId` 读取为新 `shortcutIds`，保留禁用和恢复默认行为。
3. 调整 app runtime：`Esc` 返回具体 command id，`updateKeybinding` 支持命令级覆盖 payload。
4. 重做设置页：分区总控、命令表、检查器、录制弹窗、when 编辑、层级规则页。
5. 补测试和验证：运行目标单测、全量测试、typecheck、build、uTools validation。

## Risks

- `when` overlap 只能做静态保守判断，不等价于完整 SAT 求解。
- 设置页弹窗的局部阻断依赖 Vue 事件 `stop/prevent`，全局运行时不直接感知设置页内部弹窗状态。
- 保留键被设计为保存前阻断，已有旧状态如果带保留键会在设置页显示风险但不自动删除。
