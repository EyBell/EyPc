---
id: eypc-req-codex-raw-193
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-193
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending / provider-owned-read-state (2026-09-03: Codex 已读由 preload 持有，Kernel readAcknowledgements 对 Codex 保持关闭，RAW-203 线程记忆是其持久层)"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "Host hasUnreadTurn 有值时不再跟 Desktop 未读-true 比对；偏差以 Codex APP 已读为准（Desktop follow false 或快捷键跳转）；官方未读原子仍无发言权"
---

# RAW-193 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

Host 已有真实已读/未读时不再跟 Desktop 未读比对；偏差以 Codex APP「已读」为准。快捷键跳进 Codex APP 立即记为已读。相位等其余状态已经可以直接感知。
