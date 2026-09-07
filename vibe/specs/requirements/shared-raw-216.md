---
id: eypc-req-shared-raw-216
qualified_source: SPEC-260907-STATUS-OVER-PIN-AND-STALE-CLAUDE-CHILD::RAW-216
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / exact-topology-retracts-absent-children / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-181
    scope: "精确 Hook 拓扑下子代理名单为全家快照；缺席成员必须从 Kernel 私有图撤回，不得靠 live delta 残留抬升根卡 liveCount"
---

# RAW-216 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260907/status-over-pin-and-stale-claude-child/raw-requirement.md#L1)。

Claude 会话 `topologyComplete` 且非 metadata-only 时，该 family 的子代理名单是全家快照。名单里不再出现的私有子节点必须撤回，不得把根卡留在进行中。
