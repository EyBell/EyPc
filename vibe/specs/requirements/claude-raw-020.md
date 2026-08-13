---
id: eypc-req-claude-raw-020
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-020
status: active
domain: companion-claude
authority: user-stated
---

# RAW-020 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

inventory、live-state、unread、quota 使用独立时钟；App 日志事件即时 hot-read，1 秒恢复轮询兜底，source generation → Controller revision → Float applied revision 全链拒绝倒退，连续状态失败两轮后活动态降为 unknown。
