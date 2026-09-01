---
id: eypc-req-codex-raw-192
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-192
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "Host list 保留 creating|running|completed|failed|interrupted 全集合；interrupted/failed 映射待继续，creating 映射进行中，不得再折叠成 running/completed"
---

# RAW-192 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

按原始 Companion 分组（待输入 / 待确认 / 进行中 / 待继续 / 已完成未读 / 已完成）对照 CodexHost 真实状态，一一区分和补充。
