---
id: eypc-req-claude-raw-015
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-015
status: active
domain: companion-claude
authority: user-stated
---

# RAW-015 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

上一个/下一个只读取全局物化视图，缓存 Claude 主进程身份并用 latest-target-wins 单飞派发 Epitaxy deep link；连续操作不得乱序、自动启动 App、修改未读或产生会话副本。
