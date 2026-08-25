---
id: eypc-req-codex-raw-181
qualified_source: SPEC-260825-CODEX-SIDE-RELOAD-RECOVERY::RAW-181
status: active
domain: companion-codex
authority: user-stated
source_annotations: "error-memory-prevention-rule + option-A-adjudicated + C2-closed"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-090
    scope: "Host preload 侧新增有界 side→parent 恢复提示持久化（仅 threadId/parentThreadId/observedAt，上限 200、TTL 48h）；Controller 稳定清单与候选仍不持久化，Renderer 仍不见原始 ID"
---

# RAW-181 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260825/codex-side-reload-recovery/raw-requirement.md#L1)。

Desktop Side→parent 关系以有界提示持久化（仅 ID+observedAt，上限 200、TTL 48h），重载后恢复并复用既有 follow + 定向 latest-Turn 校验；提示本身不产生任何状态，严格法定人数清退原样适用且清退同步删除持久化条目。库存 Side 行 idle/notLoaded + fresh inProgress turn 判活（缓存不作数），并记诊断。取代 PRD「topology 只在进程内 / 动态任务状态不持久化」中恢复提示部分；live phase、unread、cycle 位置维持进程内。
