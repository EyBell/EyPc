---
id: eypc-req-claude-raw-210
qualified_source: SPEC-260905-COMPANION-STATUS-ARCHIVE-SYNC::RAW-210
status: active
domain: companion-claude
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-174-clause-091
    scope: "唯一关联 live Hook 与 App live-append 同类：未递增的 completedTurns 与 lastActivityAt 不得退休当前 Turn"
---

# RAW-210 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260905/companion-status-archive-sync/raw-requirement.md#L36)。

Cloud Code 本机行在唯一 live Hook 仍为进行中时，不得只因元数据 `completedTurns` / `lastActivityAt` 投影为已完成。
