---
id: eypc-pin-group-is-parking-lot-not-live-status
status: verified
scope: project
fingerprint: pin-display-group-is-parking-lot__live-unread-attention-stay-in-status-groups__pin-is-row-marker
first_seen: 2026-09-07
last_verified: 2026-09-07
review_after: 2027-03-07
evidence:
  - user-stated F-2-a
  - derivedDynamicGroup previously returned pinned for every phase
  - focused kernel group tests
tags:
  - companion
  - pin
  - presentation
---

# 置顶分组是已读完成的泊位，不是进行中/未读的家

## Symptom

置顶的进行中或已完成未读只出现在「置顶」分组，状态分组是空的；角标仍按真实相位计数。看起来像 Float 分发错误或角标与列表不一致。

## Wrong Assumption

用户说「属于置顶就归置顶」之后，任何相位的置顶根任务都必须把**行**搬进置顶分组。角标与列表因此长期双投影：`counts.active` 有数，`groups.active` 没有该行。

## Verified Root Cause

RAW-185 把 `derivedDynamicGroup` 写成 `taskPinned → pinned`。那是当时的显示裁决，不是 Float 再投影。用户 2026-09-07 明确纠偏：进行中、已完成未读和注意力态优先于置顶分组，图钉只留行标记；已完成已读可以留在置顶分组。

## Correct Detection Order

1. 先读 Kernel `dynamicGroup` 与 `localPin`/`providerPin`，不要先改 Float。
2. 活着的状态组有行时，图钉仍可在行上。
3. 只有已完成已读与 `unknown` 才应出现在 `groups.pinned`。

## Prevention Rule

状态组先于置顶泊位。不要为了对齐角标去改 Float 拷贝逻辑。不要撤销活动时间窗对置顶的豁免。

## Latest Applicable Implementation

- 显示分组：[preload/companion/task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L670)
- 环：[preload/companion/task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L646)
- 回归：[tests/platform/companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1678)

## Alternative Route

- Status: `verified`（2026-09-07 Kernel `derivedDynamicGroup`）
- Preconditions: 用户要把进行中/未读从置顶分组拿回状态组，图钉仍可见。
- Steps: 注意力、running、stopped、completed-unread 先入状态组；其余置顶才 `pinned`。
- Verification: `groups.pinned` 只含已完成已读与 unknown；置顶 running 仍在 `groups.active` 且环可达。
- Applicability boundary: Kernel 显示分组。不含 Float 分发、不含取消时间窗豁免。
- Fallback: 若角标有数而状态组无行，先读 `dynamicGroup`，不要改 Float 拷贝。

## Occurrence History

| Date | Task | Trigger | Failed route | Recovery | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-09-07 | F-2-a 置顶让位给状态组 | 用户选 F2a | 把双投影当成分发 bug | Kernel `derivedDynamicGroup` 先按相位分组 | verified |
