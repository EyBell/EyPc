---
id: eypc-req-codex-raw-122
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-122
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-081-097-104-121"
relations:
  - refines-RAW-081-097-104-121
---

# RAW-122 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户截图确认 Codex 原生侧已经出现未读蓝点，而 EyPc 仍未进入“已完成未读”。完成前或 refollow 初始 snapshot 的 `hasUnreadTurn=false` 只是该 snapshot 时刻的负值，不得永久压住稍后写入 Codex 原生持久化 unread 集合的正值；`thread-read-state-changed` 与 stream `hasUnreadTurn` patch 属于明确 read-state event，完成后到达的显式 `false` 仍优先并立即收敛为已读。Preload 必须区分 snapshot 与 event unread 证据，并只读监听 `.codex-global-state.json` 所在目录；文件变化经短合并后重新读取原生 unread 集合，以 `readStateOnly` 匿名增量发布，不携带 Activity/Turn、raw ID、正文或路径。持久化正值可覆盖旧 snapshot false，显式 live event false/true 保持最高优先级；Renderer、Controller 状态分组和完成判定不新增轮询或推断。
