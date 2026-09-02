---
id: eypc-req-codex-raw-199
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-199
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-restart-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "额外进程的归档必须真实到达 CodexHost：走 Host 委派 CLI，而不是插件私有的官方 app-server"
---

# RAW-199 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

插件里对额外进程（含未命名会话）点归档，必须真实触发 CodexHost 的归档，并体现在 Codex 的展示里。
