---
id: eypc-req-codex-raw-080
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-080
status: active
domain: companion-codex
authority: user-stated
source_annotations: "refined-by-RAW-089 / refines-RAW-079-ordinary-activity-debounce"
relations:
  - refined-by-RAW-089
  - refines-RAW-079-ordinary-activity-debounce
---

# RAW-080 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

普通 Activity Delta 的防抖不得压住新增/回流的重要状态；RAW-089 进一步删除固定 `2000ms` 活动防抖，并取消 failed/system-error 作为可见终态。`completionPresentationDelayMs` 只在明确完成证据出现后承担可配置展示稳定窗，不再承担状态核验或异常分流。
