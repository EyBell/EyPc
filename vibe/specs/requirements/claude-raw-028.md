---
id: eypc-req-claude-raw-028
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-028
status: active
domain: companion-claude
authority: user-stated
---

# RAW-028 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

修复正常回复被通用 `Stopping session` 降为待继续、原生未读无法恢复完成态、Claude 库存固定数量截断、归档二次确认消失和普通元数据变化导致归档偶发失败。通用 session-end 不覆盖同 Turn 成功 Stop/Result；live 状态优先，否则原生 unread 将任何非 live 历史恢复为 completed-unread，清除 unread 只回 completed，新 Prompt 才恢复 running。最终 V3 任务包原子更新卡片/Tab/项目/分组/角标/动作；Claude inventory 不设固定总数上限。归档确认绑定 Provider+task+terminalEpoch，revision/unread/focus/alias churn 不取消；Claude D′ 行为在 RAW-159 中保持不变。
