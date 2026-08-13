---
id: eypc-req-claude-raw-012
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-012
status: active
domain: companion-claude
authority: user-stated
---

# RAW-012 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

库存、phase、unread、quota、App presence 是独立增量权威；任一事件不得触发整轮全量刷新，额度网络失败或 8 秒阻塞不得阻塞任务状态发布。
