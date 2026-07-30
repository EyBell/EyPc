# Codex 任务状态交接

Tool: codex
Date: 2026-07-30
State: `implemented-verified-awaiting-host-acceptance`

## 当前结论

- 完成证据通过后立即从进行中移出，同时清除 active-exit baseline；后续相同完整快照不再反弹。
- 实时增量与完整快照现共用同一个 active-exit 转换器；恢复运行前遗留的相同 interrupted/failed 只能保持 ongoing，不会在 inventory 重建时误入 stopped。
- 非 active 任务收到晚到的 Codex 原生 unread=true 时会唤醒一次有界 latest-Turn 复核；若最新 Turn 已完成，完成和未读在同一路径收敛，无需切换任务。
- Activity 来源已区分 connector、initial snapshot 与真实 patch；Turn 来源已区分 inventory、exact、targeted 和 corroborated。
- 真实 activity patch 可以在旧 completed 元数据仍存在时立即开始新 active 周期；同轮精确 completed 仍立即完成。
- 任务状态语义是 `task-state-v3`；v2/旧 preload 仅标记 degraded，不清空任务。
- `completionPresentationDelayMs` 已从当前设置类型、默认值和规范化输出移除；展示层无独立延迟。

## 验证与已知债务

详细命令与结果见 [verify.md](verify.md#L1)。状态矩阵、typecheck、正式构建、uTools runtime 和 preload 镜像已通过。完整 Codex 文件组另有 5 条既有外观/模型合同失败，属于本次明确非目标且未混入状态修复。

## 真实宿主验收

1. 正常重载 uTools 插件，确认运行中 preload 与 Renderer 同为 v3。
2. 验收普通 active→completed-unread，卡片、角标和归档能力同批更新。
3. 验收 interrupted/failed 后恢复运行再 completed-unread，不得经过 stopped，也不依赖任务切换。
4. 在 completed、stopped 和 active 任务间切换，未选中任务的状态不得改变。
