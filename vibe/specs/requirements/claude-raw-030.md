---
id: eypc-req-claude-raw-030
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-030
status: active
domain: companion-claude
authority: user-stated
---

# RAW-030 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

更新引入（Codex Companion RAW-160）：修复 Claude 实际终止但 EyPc 仍显示 running。当前 `session.phase` 的较新因果事件必须优先于 `previous.phase`，延迟的旧 inventory/cache generation 不得覆盖 watcher/打开后定向刷新；phase、phaseRevision、statusEnteredAt、unread 与 capabilities 原子更新，并仅在消费者 selector 变化时发布。D′ 成功文案进一步固定为“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。”
