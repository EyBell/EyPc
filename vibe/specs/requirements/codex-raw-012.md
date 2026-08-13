---
id: eypc-req-codex-raw-012
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-012
status: superseded
domain: companion-codex
authority: user-stated
source_annotations: "superseded-by-RAW-030"
superseded_by: eypc-req-codex-raw-030
supersedes:
  - eypc-req-codex-raw-007
---

# RAW-012 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

`codex.task.open` 只打开任务，绝不改变确认状态。进行中任务只有上游完成后才转入待查看；待查看任务无论打开、刷新、重启或经过旧期限都持续保留，只有单条“确认已查看”或分组“全部确认”可移除。对非 `pending-review` 的确认必须拒绝且不得提前写 receipt；同一任务出现更新的完成时间后需重新进入待查看。
