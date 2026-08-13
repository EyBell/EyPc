---
id: eypc-req-codex-raw-081
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-081
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-056-live-input-and-unread-authority"
relations:
  - refines-RAW-056-live-input-and-unread-authority
---

# RAW-081 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Codex Desktop live snapshot/patch 若没有 `hasUnreadTurn`，不得将已经确认的 Codex 持久化未读改写为 `false/unavailable`；明确 live read-state 仍优先，缺失 live 字段时仅回退到最近成功读取的 Codex 持久化 unread 集合，集合不可读则显式 unknown。待输入判定继续只接受 desktop-live `active`，但对协议中仅以分隔符不同表达的已知 user-input / approval request type/method 采用受限归一化，避免漏掉 `request_user_input` 等等价名称；不得从 recency、connector active、`notLoaded` 或普通刷新猜测待输入、未读或完成。`preload/index.js` 与 `public/preload.js` 保持镜像一致。本轮不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作，交付仍由用户验收。
