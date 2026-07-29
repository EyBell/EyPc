# Codex 任务状态交接

Tool: codex
Date: 2026-07-30
State: `implemented-static-verified-awaiting-host-acceptance`

## 当前结论

- 完成证据通过后立即从进行中移出，同时清除 active-exit baseline；后续相同完整快照不再反弹。
- Activity 来源已区分 connector、initial snapshot 与真实 patch；Turn 来源已区分 inventory、exact、targeted 和 corroborated。
- 真实 activity patch 可以在旧 completed 元数据仍存在时立即开始新 active 周期；同轮精确 completed 仍立即完成。
- 任务状态语义是 `task-state-v3`；v2/旧 preload 仅标记 degraded，不清空任务。
- `completionPresentationDelayMs` 已从当前设置类型、默认值和规范化输出移除；展示层无独立延迟。

## 验证与已知债务

详细命令与结果见 [verify.md](verify.md#L1)。状态链、typecheck 和 preload 镜像已通过；剩余失败集中在旧外观、环境和历史 UI 合同，未纳入本次修复。

## 真实宿主验收

1. 正常重载 uTools 插件，确认运行中 preload 与 Renderer 同为 v3。
2. 验收普通 active→completed，卡片、角标和归档能力同批更新。
3. 验收 interrupted/failed 后恢复运行再 completed，不得长时间停留或反弹到进行中。
4. 在 completed、stopped 和 active 任务间切换，未选中任务的状态不得改变。
