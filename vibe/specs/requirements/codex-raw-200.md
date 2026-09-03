---
id: eypc-req-codex-raw-200
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-200
status: active
domain: companion-codex
authority: user-stated
source_annotations: "host-implemented / focused-automated-verified / host-restart-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "额外进程的 side 子对话运行时主任务必须是进行中；Codex 里归档主对话时 Host 同步归档其 side 子对话"
---

# RAW-200 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

CodexHost 对话里由 side 子对话产生的活动必须算到主任务上：子对话在跑，主任务就是「进行中」，不是「已完成未读」；在 Codex 里归档主对话时，Host 也要把它的 side 子对话一并归档。
