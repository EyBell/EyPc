---
id: eypc-membership-predicate-restated-at-every-consumer
status: verified
scope: project
fingerprint: one-set-membership-condition-hand-written-at-each-consumer-instead-of-read-from-a-single-owner__widening-the-set-updates-some-copies__a-missed-copy-produces-no-type-or-test-error__the-set-means-different-things-to-badge-list-ring-and-entry
first_seen: 2026-08-28
last_verified: 2026-08-28
review_after: 2027-02-28
evidence:
  - preload/companion/task-kernel.cjs
  - tests/platform/companionTaskKernel.test.ts
tags:
  - codex-companion
  - kernel-package
  - membership
  - single-owner
---

# 一个集合的成员判据被每个消费者各自手写，扩大集合时漏掉的那份不会报错

## Symptom

用户先报「同样在置顶下，某条任务用『已完成未读』快捷键循环不到」。修好后同日再问「未读和已完成未读是不是重复定义了」——这一问直接命中根因：修复只改了当时找到的判据，另一份拷贝没改，缺陷换个位置继续存在（遍历跳回队首、队尾不达）。

## Wrong Assumption

**「把这个集合的成员条件改对，功能就修好了。」** 前提是「这个集合的成员条件」只有一处。实际上 `completed && unread` 在 Kernel 里被手写了 4 份（环层、分组、角标、入口），取反的第 5 份用于遍历进度身份；`isAttentionTaskPhase(phase)` 同样被复述 2 份。改了其中一份，其余静默保持旧语义。

## Verified Root Cause

同一个集合在四个消费者眼里有四份独立定义，彼此没有 owner 关系：

- `derivedCycleTier` —— 环层
- `derivedDynamicGroup` —— 列表分组
- `views.counts.*` —— 角标
- `views.attentionKeys.*` —— 专用入口

加上 `attentionInstance` 里取反的一份，用于判断「这是不是泊位项」。

把入口的置顶支路从 `completed && !unread` 放宽到「整个置顶分组」时，只有那一处改了。`attentionInstance` 仍按旧条件识别泊位项，于是新纳入的 `unknown` 置顶落回 `max(statusEnteredAt, terminalAt, turnStartedAt)` 生命周期锚点——聚合根上这三个字段都是 `max(成员)`，子任务一动就抬升，已访问记录失效，遍历跳回队首。

关键性质：**漏掉的拷贝不产生任何编译或测试信号**。类型一致、拷贝各自自洽，只是它们对「这个集合是什么」的答案不再相同。

## Evidence Boundary

- 拷贝份数由源码逐行确认，不是估计。
- 漏改的后果已用反向红测证明：还原 `attentionInstance` 的旧判据后，连按两次入口的实际结果是 `['codex-a', 'codex-a']`（重开队首），修复后为 `['codex-a', 'codex-b']`。
- **未做端到端真机复现**。生产触发链（子任务活动抬升聚合根字段）与 [parked-item-inherits-fresh-item-invalidation](parked-item-inherits-fresh-item-invalidation.md#L1) 的证据边界相同，仍属代码阅读推断。

## Correct Detection Order

1. 改一个集合的成员定义前，**先把该集合的全部判据搜出来**，按消费者列清单（分组、计数、循环、入口、去重键、进度键），再动手。
2. 搜索用**语义**而不是字段名：同一集合可能有两个名字（这里 `unread` 与 `completedUnread`），只搜名字会漏。可靠的做法是搜条件表达式本身。
3. 改完后逐项确认「这份拷贝现在还成立吗」，包括取反形式与用于键构造的形式——后者最容易被当成无关代码。

## Prevention Rule

**一个集合只能有一个 owner，其余消费者读它的结论，不复述它的条件。**

- 本项目的 owner 是 `derivedDynamicGroup`：它回答「这条任务属于哪个显示分组」。角标、环层、专用入口、进度身份一律读 `dynamicGroup === '...'`，不再写相位条件。
- 判断是否该收归：若一个条件表达式在文件里出现两次以上，或它同时决定「显示在哪」和「快捷键能否到达」，它就必须有 owner。
- 同类先例已经存在：[task-phase.cjs](../../../preload/task-phase.cjs#L1) 正是为消灭同一份相位词汇的多处手写而建；`unread` 与 `input` 这两支当时没被收进去，本记录补上。
- 不变式要能被测试表达：断言「角标 = 分组去掉不可打开的」「入口 = 分组按序拼接」，这类关系在拷贝漂移时会红；只断言某个具体集合的内容不会。

## Latest Applicable Implementation

`derivedDynamicGroup` 是唯一定义处。`derivedCycleTier`、`views.counts.input/active/unread`、`views.attentionKeys.input/completedUnread` 与 `attentionInstance` 全部改读 `dynamicGroup`。单一 owner 不变式由[聚焦测试](../../../tests/platform/companionTaskKernel.test.ts#L1065)守护：全相位 × 置顶 × 未读 × 可打开的矩阵下，角标必须等于其分组中可打开的条数，入口必须等于对应分组按序拼接；测试自带非空断言，避免全绿于空集。

## Related

- [parked-item-inherits-fresh-item-invalidation](parked-item-inherits-fresh-item-invalidation.md#L1) —— 本记录导致的那次复发，症状与修复记在该叶子的 `Occurrence History`。
- [ring-reachability-outlives-list-visibility](ring-reachability-outlives-list-visibility.md#L1) —— 同一对判据的另一种失配：可达性与可见性各自推导，豁免只补了一侧。
