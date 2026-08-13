---
id: eypc-req-codex-raw-015
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-015
status: superseded
domain: companion-codex
authority: user-stated
source_annotations: "superseded-by-RAW-028"
superseded_by: eypc-req-codex-raw-028
---

# RAW-015 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

任务状态必须准确区分等待输入、等待审批、无等待标记的正在进行、需要关注、跨进程状态未知和已完成待查看；输入与审批标记可以同时存在。跨进程 `notLoaded`/最近活动不得因刷新次数或等待时间自动变成完成、待查看或可确认；后续 RAW-019 只增加不读取 items 的持久化 `completed + completedAt` 窄例外。
