---
id: eypc-req-claude-raw-016
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-016
status: active
domain: companion-claude
authority: user-stated
---

# RAW-016 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

额度 transport 必须兼容 Node 16，动态保留全部窗口；过期 reset 不得继续显示，补充读取按立即、1 分钟、5 分钟、15 分钟、随后每小时重试，成功后恢复 5 分钟最小刷新间隔。
