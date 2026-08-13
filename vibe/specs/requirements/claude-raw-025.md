---
id: eypc-req-claude-raw-025
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-025
status: active
domain: companion-claude
authority: user-stated
---

# RAW-025 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

更新引入（Codex Companion RAW-154）：Claude completed/stopped 任务级归档改为 macOS App `1.26832.0` 门禁下的 D′ 受控静默元数据事务。只允许使用普通库存建立的唯一私有 `sessionId → local_*.json` 索引，写前复核 phase、身份、stat/hash，只把单一目标的 `isArchived` 改为 true，经同目录临时文件核验后原子替换；禁止 Deep Link、AX/JXA、LevelDB、扫改目录和非目标会话。元数据 true + 私有活动库存移除即为成功，App 日志仅作增强证据；安全回滚失败或并发修改不确定时保留卡片。
