---
id: eypc-req-codex-raw-203
qualified_source: SPEC-260903-CODEXHOST-READ-MEMORY-AND-CLAUDE-QUOTA-ORG::RAW-203
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / thread-memory / persisted-jump-read"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-193
    scope: "跳转即已读改为持久记忆：绑定跳转时的 Host statusChangedAt，跨会合点丢失 / 会话重置 / 插件重载生效；只被 Host 状态变化或 Host unread false→true 边沿取代"
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "Host hasUnreadTurn 仍是权威；本条只补 EyPc 自己的跳转已读与 statusChangedAt 延续，不改 Host 与 Desktop 的比对规则"
---

# RAW-203 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260903/codexhost-read-memory-and-claude-quota-org/raw-requirement.md#L1)。

额外进程的 `statusChangedAt` 与 EyPc 跳转已读存进插件存储（`eypc/codex/codexhost-thread-memory/v1`），roster 丢失、会话重置或插件重载后同一条已完成行不再刷新成「刚刚 · 未读」；已读只被 Host 状态 / attention 变化或 Host unread `false → true` 边沿取代，归档删除记忆。
