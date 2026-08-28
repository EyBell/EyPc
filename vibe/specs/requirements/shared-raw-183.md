---
id: eypc-req-shared-raw-183
qualified_source: SPEC-260827-COMPANION-PINNED-PARKING::RAW-183
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-accepted-2026-08-27 / pin-as-fast-access-lane"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-182
    scope: "循环环的层序并集不变（含 local pin 层），只把已完成且已读的置顶任务排除出环；环冻结、游标归属、角标可达性判据均不变"
  - kind: refines
    target: eypc-req-codex-raw-155
    scope: "local pin 层保留，仅已完成且已读的置顶任务改由动态页签置顶分组与已完成未读专用入口承载；其余层序与层内最近提问时间倒序不变"
---

# RAW-183 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260827/companion-pinned-parking/raw-requirement.md#L1)。

本地置顶的语义确立为「移出当前工作流、暂存待查」。动态页签新增最顶部 `pinned` 分组，收录「本地置顶 + 已完成 + 已读」的根任务并**豁免活动时间窗**——此前置顶一条已完成已读任务并不能阻止它过窗消失，置顶等于无效；置顶但处于其他相位的任务仍留在各自状态组。置顶**不改变**任务在其自身状态所应得的任何入口：置顶的待输入、进行中、待继续、已完成未读任务照旧参与通用「上一个/下一个」循环与「待输入」专用入口，`local pin` 层也继续兜住本就不属于前四层的置顶任务。唯一的例外是**已完成且已读**的置顶任务——它本无任何快捷键可达，故退出通用循环，改由「已完成未读」专用入口承载：队列为「已完成未读 + 已完成已读的置顶项」按序拼接，先清未读积压再走置顶，未读为空时按键即直接循环置顶项。置顶组是位置而非角标，三个角标计数口径不变。置顶状态与项目页签既有 `pinned` 分区互不影响。
