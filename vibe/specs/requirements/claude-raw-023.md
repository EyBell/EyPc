---
id: eypc-req-claude-raw-023
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-023
status: active
domain: companion-claude
authority: user-stated
---

# RAW-023 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

原生 unread 仍是持久权威，但成功派发精确 Claude deep link 后允许创建仅进程内、仅同一 `sessionId + completionEpoch` 的可撤销已读提示并立即重读原生集合；同轮迟到 `true` 不得回跳，新运行/等待或更晚完成必须重新允许未读。
