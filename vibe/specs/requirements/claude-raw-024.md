---
id: eypc-req-claude-raw-024
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-024
status: active
domain: companion-claude
authority: user-stated
---

# RAW-024 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

修正旧 Claude 任务在 `Stop` 后因 `SubagentStop`/工具尾事件长期假 running：只有新 `UserPromptSubmit` 可开启父 Turn，App 明确终态优先同 Turn Hook 尾事件。增加 Claude-only“同步 Claude 状态”与成功打开后的单项静默 state/unread 同步；必须复用同一 singleflight/revision 发布链，不提供人工完成/已读覆盖，不新增公共 preload、持久化 schema 或 Claude App 写入。相关旧文档采用链接式逻辑归档并同步全局规则；当前不得物理迁移。
