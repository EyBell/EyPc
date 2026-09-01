---
id: eypc-req-codex-raw-195
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-195
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "进行中的额外进程变为 Host completed+unread 时必须进入已完成未读；Desktop live inProgress 不得压住 Host 已确认终态"
---

# RAW-195 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

之前进行中、后来变成已完成未读的额外进程，插件也必须感知到这次切换。
