---
id: eypc-req-claude-raw-019
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-019
status: active
domain: companion-claude
authority: user-stated
---

# RAW-019 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

Claude App 当前账号的加密 OAuth 缓存是额度与 reset 的主权威；必须显式授权、只读解密、动态解析 `session / weekly_all / weekly_scoped`，多账号无法唯一仲裁时失败关闭，令牌不得离开请求闭包或进入诊断。
