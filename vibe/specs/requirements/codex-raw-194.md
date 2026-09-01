---
id: eypc-req-codex-raw-194
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-194
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "插件重启后必须重新枚举 Host 已有额外进程，包括已完成/空闲；不得只在新建或变为进行中时才可见"
---

# RAW-194 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

重启插件后仍应读到 CodexHost 里已有的额外进程任务；不能只在新增或改为进行中时才出现。
