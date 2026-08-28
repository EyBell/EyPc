---
id: eypc-req-shared-raw-185
qualified_source: SPEC-260828-COMPANION-PIN-WINDOW-EXEMPTION::RAW-185
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending / pin-exempt-in-every-phase"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-183
    scope: "「其余相位留在各自状态组」不变；把活动时间窗豁免从「置顶+已完成+已读」一种相位扩到任何相位的本地置顶任务，并把置顶分组成员扩为「本地置顶且没有自己的状态组（已完成已读 / unknown）」"
  - kind: refines
    target: eypc-req-shared-raw-182
    scope: "层序并集、环冻结、游标归属与角标可达性判据不变；新增其反向不变式——凡进入 cycleKeys 的任务必须在某个动态分组可见，且每个任务恰好出现在一个分组"
---

# RAW-185 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260828/companion-pin-window-exemption/raw-requirement.md#L1)。

活动时间窗对**任何相位的本地置顶任务**一律不适用，窗口只淘汰未置顶的工作——此前只有「置顶 + 已完成 + 已读」一种相位获得豁免，而循环层的置顶判据（`fallback`）从来不查时间窗也不排除 `unknown` 相位，于是一条过窗或状态未知的置顶任务同时「在环里」与「不在任何分组里」，`上一个/下一个` 反复落在列表任何页签都不显示的任务上。`unknown` 相位本身不挣得分组，因此置顶的 `unknown` 任务没有可留守的状态组，直接归入置顶分组，且那是它在动态页的唯一落点。由此确立两条对称不变式：**凡进入 `cycleKeys` 的任务，必须在某个动态分组里看得见**，且**每个任务恰好出现在一个动态分组里**——[RAW-182](shared-raw-182.md#L1) 立的是「角标里有＝循环能到」，这是它的反面。顶部置顶分组的成员、层序并集、环冻结、游标归属与三个角标计数口径均不变；未置顶任务过窗照旧从动态页消失，未置顶的 `unknown` 相位任务仍不进入分组与环。
