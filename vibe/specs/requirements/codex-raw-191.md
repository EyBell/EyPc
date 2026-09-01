---
id: eypc-req-codex-raw-191
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-191
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "Cloud Code / Pi 等外置智能体的提问与提示在插件内投影为待输入；Host attention=input 优先于 approval；Desktop follow 不得剥掉这些 Host waiting flag"
---

# RAW-191 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

通过 Cloud Code 或 Pi 等其他外置智能体发过来的请求和提示信息，在插件内应显示为待输入。
