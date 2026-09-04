---
id: eypc-req-shared-raw-208
qualified_source: SPEC-260904-COMPANION-DISPLAY-CLOCK::RAW-208
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / display-clock-fallback"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-206
    scope: "行上时钟在 Turn 关闭后回退完成/活动时间；Cursor Cloud Agent 排除不变"
---

# RAW-208 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260904/companion-display-clock/raw-requirement.md#L1)。

任务行相对时间在 Turn 关闭后仍可读：回退完成或最近活动时间，入站 0 不得清掉已有时钟。不改变相位。Cursor Cloud Agent 仍排除。
