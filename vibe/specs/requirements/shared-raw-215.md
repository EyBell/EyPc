---
id: eypc-req-shared-raw-215
qualified_source: SPEC-260907-STATUS-OVER-PIN-AND-STALE-CLAUDE-CHILD::RAW-215
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / status-groups-beat-pin-parking-lot / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-185
    scope: "纠偏「凡置顶即进置顶分组」：进行中/待输入/待继续/已完成未读显示在状态分组，图钉只留行标记；已完成已读与 unknown 仍停置顶分组；时间窗豁免与角标可达性不变"
  - kind: refines
    target: eypc-req-shared-raw-205
    scope: "Provider 置顶同一谓词；泊位分组只收无状态组的已读完成与 unknown"
---

# RAW-215 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260907/status-over-pin-and-stale-claude-child/raw-requirement.md#L1)。

置顶是行标记。进行中、待输入、待继续、已完成未读优先进入对应状态分组；只有已完成已读与 `unknown` 停在置顶分组。活动时间窗仍对任何置顶豁免。角标、环与专用入口仍按真实相位。
