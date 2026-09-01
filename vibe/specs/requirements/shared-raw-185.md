---
id: eypc-req-shared-raw-185
qualified_source: SPEC-260828-COMPANION-PIN-WINDOW-EXEMPTION::RAW-185
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending / every-local-pin-displays-in-pinned"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-183
    scope: "按用户原话「如果它属于置顶，也归到置顶里面」纠偏：任何相位的本地置顶根任务都只显示在置顶分组；活动时间窗只淘汰未置顶任务，状态计数与快捷入口仍按真实相位"
  - kind: refines
    target: eypc-req-shared-raw-182
    scope: "层序并集、环冻结、游标归属与角标可达性判据不变；新增其反向不变式——凡进入 cycleKeys 的任务必须在某个动态分组可见，且每个任务恰好出现在一个分组"
---

# RAW-185 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260828/companion-pin-window-exemption/raw-requirement.md#L1)。

活动时间窗对**任何相位的本地置顶任务**一律不适用，窗口只淘汰未置顶的工作。用户进一步明确「如果它属于置顶，也归到置顶里面」，因此任何相位的本地置顶根任务都只显示在顶部置顶分组，不再同时留在待输入、进行中、待继续、已完成未读或已完成分组。显示位置不改变状态权威：角标计数、待输入入口、通用循环与已完成未读入口仍按真实相位计算；只有本就没有状态入口的已完成已读与 `unknown` 置顶项走置顶兜底。由此同时满足：**凡进入 `cycleKeys` 的任务必须在某个动态分组可见**，且**每个任务恰好出现在一个动态分组**。未置顶任务过窗照旧消失，未置顶 `unknown` 仍不进入分组与环。
