---
id: eypc-req-codex-raw-035
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-035
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active"
supersedes:
  - eypc-req-codex-raw-022
  - eypc-req-codex-raw-034
---

# RAW-035 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

任务库存必须先真实读取 Codex 原生项目注册状态，再完整分页读取所有 `archived=false` 任务。归属优先原生 assignment、projectless→Chats、有效项目根最深 cwd；其余视为已从侧栏移除/未注册并排除。项目状态扫描前后必须指纹一致，变化时只完整重试一次。
