---
id: eypc-req-codex-raw-190
qualified_source: SPEC-260901-CODEXHOST-EXTERNAL-COMPLETION::RAW-190
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
---

# RAW-190 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/codexhost-external-completion/raw-requirement.md#L1)。

CodexHost 额外进程在委派 CLI 报告完成后必须离开「进行中」，并按 Host 未读进入「已完成未读」或「已完成」。CLI completed 是这些 id 的精确终态；官方 `notLoaded` 仍不是完成。
