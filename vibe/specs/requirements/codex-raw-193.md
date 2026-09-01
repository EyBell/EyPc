---
id: eypc-req-codex-raw-193
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-193
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "额外进程已读/未读改为 Host hasUnreadTurn 与 Codex Desktop follow 比对；官方未读原子仍无发言权；相位等其余状态不另做全量对照"
---

# RAW-193 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

额外进程的已读/未读应根据 Codex Desktop 里同一条会话的实时未读比对；相位等其余状态已经可以直接感知，不另做全量对照。
