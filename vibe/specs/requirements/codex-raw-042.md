---
id: eypc-req-codex-raw-042
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-042
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / active-guard-refined-by-RAW-068-and-RAW-089"
---

# RAW-042 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

单条真实归档须重读身份、状态、latest Turn、版本和项目指纹，拒绝 active/inProgress/变化证据，写入后同时确认从 `archived=false` 消失并在 `archived=true` 出现。RAW-068 后原始 interrupted 与投影后的 ongoing 同样拒绝；RAW-089 进一步把 Host 单条和项目归档收紧为仅明确 latest-Turn completed 可写，所有其它状态或缺失证据均作为进行中拒绝/跳过。项目批量归档仍忽略 30 天窗口，20 条一批、并发 2、逐项双向验证并保留部分失败；批量真实写入只在另行授权临时项目时执行。
