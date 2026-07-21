# Codex 任务计数与列表投影口径分裂

Last verified: 2026-07-19
Scope: `project / Codex Companion task projection`

## Symptom

- 状态摘要显示某组有 10 条，但展开列表只能访问 5 条。
- 配置中的“每组展示数”看似可调，实际把完整读取结果截断为另一套 UI 数据，导致用户无法核对任务。

## Root Cause

- 计数来自完整分组数组，列表在另一个消费者中执行 `slice(0, maxTasksPerGroup)`。
- `maxTasksPerGroup` 成为只影响一个视图的无权威配置，计数、批量动作和可见列表因此不再共享同一最终投影。

## Prevention Rule

- 先在 [codex.ts](../../../src/domain/codex.ts#L628) 形成最终 `ongoing` / `pending` 数组，再由这些数组同时派生计数、列表与 eligible action keys。
- 不在 Renderer 或分组组件执行隐藏截断；当前 `thread/list(limit=100)` 范围内全部可访问，空间不足只滚动任务列表。
- 若上游返回 cursor，显式展示 `partial/sourceCount`，不要用消费者截断伪装完整结果。
- 任何未来分页都必须改变 source contract，而不是重新引入每组展示上限。

## Regression Evidence

- [codex.test.ts](../../../tests/domain/codex.test.ts#L1) 固定“10 条 unknown 计数 10、列表 10”与无消费者上限。
- [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) 固定配置页无 `maxTasksPerGroup` 且完整列表由滚动容器承载。

## Detection Order

1. 对比 `sourceCount`、每组数组长度和展示计数。
2. 全仓搜索 `slice`、`maxTasksPerGroup`、分页/虚拟列表消费者。
3. 核对批量动作的 eligible keys 是否来自同一最终数组。
4. 用超过 5 条的单组 fixture 同时断言计数与可访问 DOM 行数。
