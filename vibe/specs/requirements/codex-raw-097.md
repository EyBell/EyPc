---
id: eypc-req-codex-raw-097
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-097
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-081-and-RAW-096"
relations:
  - refines-RAW-081-and-RAW-096
---

# RAW-097 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Codex Desktop 的 `thread-read-state-changed`，以及只修改 `hasUnreadTurn` 的 stream patch，只是已读/未读证据，绝不是 activity authority。preload 必须把它标为 V2 `readStateOnly`，并且只跨越匿名 key、`hasUnreadTurn` 与 `unreadAuthority`；不得随这种 delta 重发 status、active flags、`desktopActiveSince` 或 latest-Turn 字段。Controller 收到 `readStateOnly` 时只能更新 unread，必须保留当前状态、active interval 和 latest Turn。手动在 Codex 阅读完成任务只能从“已完成未读”收敛为“已完成”，不得变成“进行中”；实际 runtime/request activity 更新仍走完整 live delta。raw thread ID、正文、cwd、路径与私有 patch 值不得跨 preload。
