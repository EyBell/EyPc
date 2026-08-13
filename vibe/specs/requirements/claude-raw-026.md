---
id: eypc-req-claude-raw-026
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-026
status: active
domain: companion-claude
authority: user-stated
---

# RAW-026 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

Claude 文件 watcher 必须按已登记的精确文件发布 Provider-neutral membership mutation delta，正常变化至 Controller 原子任务包 P95 不超过 250ms；丢 callback 时一秒 watchdog 只检查私有索引并在 1.25 秒内恢复。该通路不等待 quota/state/unread/完整 inventory。普通打开在 Deep Link 前复核唯一目标仍存在且未归档；统一任务 Dispatcher 和五秒二次确认快捷调用不得把 archive 退化为 open。
