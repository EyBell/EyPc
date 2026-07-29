# Codex 任务状态收敛计划

Tool: codex
Status: `implemented`

1. 用序列测试复现“完成通过定向核验，后续完整快照反判回进行中”。
2. 完成通过 active-exit 门禁后立即关闭周期并清除 baseline。
3. 跨 preload 发布 Activity/Turn 来源，用真实 activity patch 区分初始 snapshot replay。
4. 提升到 `task-state-v3`，保留一版 degraded 兼容，移除完成展示延迟设置的当前运行形状。
5. 验证 Bridge、Controller、Domain、Renderer 同源包、类型和 preload 镜像。
6. 将当前合同收敛到 Spec/PRD/架构/技术记忆，历史细节仅保留在 raw 与错误记忆。

执行证据见 [verify.md](verify.md#L1)，当前交接见 [handoff.md](handoff.md#L1)。
