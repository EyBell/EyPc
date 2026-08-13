---
id: eypc-req-codex-raw-095
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-095
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-090-and-RAW-092"
relations:
  - refines-RAW-090-and-RAW-092
---

# RAW-095 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

来自已连接 Codex 通道的明确 `thread-archived` 事件，若能在 preload 内对应到当前已发布任务，只能把既有匿名 task key 作为 Activity Delta V2 的归档提示交给 Controller；Controller 必须立即移除该精确 key 并发起 urgent 完整复核，不再把它当作普通缺项而等待 `max(15s, taskRefreshSeconds)` 隔离。无法对应、`thread-unarchived`、删除或畸形事件不得伪造移除，只触发普通复核；raw thread ID、cwd、正文和其它私有字段不得跨 preload 边界。普通快照缺项的 RAW-090 防抖保持不变。
