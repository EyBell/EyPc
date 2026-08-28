---
id: eypc-ring-reachability-outlives-list-visibility
status: verified
scope: project
fingerprint: two-sibling-predicates-derive-reachability-and-visibility-from-the-same-task__one-consults-the-activity-window-and-the-other-never-did__an-exemption-added-to-only-the-visibility-side-for-only-one-phase__shortcut-cycles-onto-a-task-no-tab-can-show
first_seen: 2026-08-28
last_verified: 2026-08-28
review_after: 2027-02-28
evidence:
  - vibe/specs/260828/companion-pin-window-exemption/raw-requirement.md
  - vibe/specs/requirements/shared-raw-185.md
  - preload/companion/task-kernel.cjs
  - src/FloatApp.vue
  - tests/platform/companionTaskKernel.test.ts
tags:
  - codex-companion
  - local-pin
  - navigation
  - projection
---

# 可达性与可见性由两个兄弟判据各自推导，豁免只补了一侧

## Symptom

用户报告：「上一个／下一个」反复在两条任务之间循环，其中一条在悬浮卡片的任何页签里都找不到。

运行日志把症状钉死得很干净：22 条 `task-kernel/shortcut-enter` 每一条都是 `"cycleCount":2`，同窗口 22 条 `navigation/claude-open` 只在两个 `taskRef` 之间交替。环确实只有两个成员，而列表只显示得出其中一个。

## Wrong Assumption

**「置顶的时间窗豁免已经做过了，这条一定是别的成因。」**

上一轮（[本地偏好在某个消费视图里从未被读取](local-preference-inert-in-one-consumer-view.md#L1)）修的是同一个字段、同一个窗口，并留下了断言。那次的豁免写在 `derivedDynamicGroup` 里，但只覆盖「置顶 + 已完成 + 已读」这**一种相位**——因为当时的产品语义只谈这一种。于是「置顶豁免时间窗」被记成了已完成事项。

真正没人看的是它的兄弟函数：`derivedCycleTier` 判置顶时**从来就没查过时间窗，也没排除 `unknown` 相位**。两个函数各自都自洽，只有把它们并排读才看得见矛盾。

## Verified Root Cause

同一条任务，两个派生判据给出方向相反的结论（[task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L597)）：

- `derivedCycleTier`：`task.localPin && !(completed && !unread)` → `fallback`。**不查 `dynamicEligible`，不排除 `unknown`** ⇒ 在环里。
- `derivedDynamicGroup`（改动前）：`!dynamicEligible → 'none'`，且 `phase === 'unknown' → 'none'` ⇒ 不在任何分组里。

涉事任务两条淘汰路径同时成立：`createdAt` 距按键 56 小时，超过 48 小时默认窗口；相位又是 `unknown`。**只补时间窗豁免仍然修不好**——这正是「先按用户给出的成因下手」会漏掉的一半。

同一处还暴露出 Float 的「状态未知」分区（`statusGroups.stopped.filter(phase === 'unknown')`）自诞生起就是死代码：没有任何 `unknown` 任务能进入 `stopped` 组。分区存在这件事本身，说明 Kernel 侧那条 `unknown → 'none'` 与渲染侧的意图早已脱节。

**首版修复顺手用了这个死分区，结果换来一次「重复」返工。** 把置顶的 `unknown` 任务路由进 `stopped` 组，它就同时出现在置顶分组之外的第二个位置；用户看到的是同一条任务列了两遍。补落点这件事只解决了「看得见」，没有约束「只看得见一次」——**可见性缺口的修法必须同时回答落点是哪一个，而不只是有没有落点**。

## Cost

用户被一条看不见的任务反复劫持快捷键。全套自动化全绿：两个函数各自都有测试，没有任何一条断言同时约束它们。

## Correct Detection Order

症状是「A 能到 B 看不到」（或反过来）时：

1. **先把两侧的判据并排列出来**，逐个条件对齐，而不是先读日志找证据。这里 `grep -n "derivedCycleTier\|derivedDynamicGroup"` 就够，两个函数相距 19 行。
2. **枚举差集，不要只验证用户给出的那一条成因。** 用户已定位「超过时间窗」，但 `unknown` 相位是第二条独立路径；只修第一条，界面不会有任何变化，且看起来像修复失败。
3. **日志用来确认症状边界，不用来找根因。** `cycleCount` 与 `completedUnreadCount` 一眼定住「环里有几条、置顶入口有几条」，把搜索面从全量任务缩到两条；根因仍在源码的判据比对里。

## Rule

**成对的判据必须共享同一个门禁，并由一条同时约束两侧的断言钉住。**

- 只要一个字段同时决定「快捷键能到」和「列表看得见」，就存在**成对**的不变式：**凡进入 `cycleKeys` 的任务必须在某个动态分组里可见**，且**每个任务恰好出现在一个分组里**。只补前一条会把漏项修成重复项——补落点时必须同时回答「唯一落点是哪一个」，现成的空分区看着顺手，未必就是那一个。它是 [RAW-182](../../specs/requirements/shared-raw-182.md#L1)「角标里有＝循环能到」的反面，两条都要有断言。本轮的[不变式断言](../../../tests/platform/companionTaskKernel.test.ts#L1010)对 5 个相位 × 置顶 × 未读的全组合求 `cycleKeys − ⋃groups`，要求为空。
- 给某个字段加豁免时，**先搜出该字段的全部判据点再动手**，并明确写下豁免适用的相位集合。「只对当前需求提到的那一种相位生效」是缺省行为，不是显式决定——把它当成显式决定写进条款，下一次就不会以为「已经做过了」。
- **渲染侧存在一个永远为空的分区，是上游判据漏了一条分支的现成线索——但它是线索，不是答案。** 发现死分区先反查上游为什么喂不进来；确认漏项后，落点仍要按语义选，不能因为「这里正好空着」就往里填。本轮那条 `unknown` 的正解是置顶分组，不是那个空分区。

## Boundary

本记录针对**两个并行判据对同一门禁不一致**。它与[本地偏好在某个消费视图里从未被读取](local-preference-inert-in-one-consumer-view.md#L1)不同：那条是某个视图完全没读这个字段，修法是补上读取；本条是两侧都读了、但门禁条件不一致，修法是让门禁一致并加对称断言。也不同于[消费者投影分裂](codex-task-count-list-projection-divergence.md#L1)：那条讲多个消费者应从同一份最终投影派生，本条讲的是同一层里两个兄弟判据本身的条件不齐。
