---
id: eypc-req-codex-raw-019
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-019
status: superseded
domain: companion-codex
authority: user-stated
source_annotations: "superseded-by-RAW-028"
superseded_by: eypc-req-codex-raw-028
---

# RAW-019 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

修正状态语义后不能让任务收件箱退化为“全部未知”。跨进程仍不得把 `notLoaded` 或时间新鲜度猜成完成；EyPc 可用 `thread/turns/list(itemsView=notLoaded)` 只读取最近持久化 turn 的状态元数据，并且只有带有效 `completedAt`、没有更新活动覆盖的 `completed` 才能把既有未知活动提升为待查看。`interrupted` 仍可能代表其他进程正在运行，必须保持未知；精确的跨进程运行中、等待输入和等待审批仍需共享 live authority。
