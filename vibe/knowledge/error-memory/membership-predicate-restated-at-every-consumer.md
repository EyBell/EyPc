---
id: eypc-membership-predicate-restated-at-every-consumer
status: verified
scope: project
fingerprint: one-set-membership-condition-hand-written-at-each-consumer-instead-of-read-from-a-single-owner__widening-the-set-updates-some-copies__a-missed-copy-produces-no-type-or-test-error__the-set-means-different-things-to-badge-list-ring-and-entry
first_seen: 2026-08-28
last_verified: 2026-09-15
review_after: 2027-03-15
evidence:
  - preload/companion/task-kernel.cjs
  - tests/platform/companionTaskKernel.test.ts
  - preload/companion/navigation.cjs
  - tests/platform/companionNavigationBridge.test.ts
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

- 当前 Kernel 分别拥有状态资格与展示分组：`derivedDynamicGroup` 回答显示位置，`derivedAttentionState` / `derivedCycleTier` 决定状态资格。Navigation 只读已生成的 `views.cycleKeys`，不能把当前卡片的 `views.groups` 当成循环候选。旧版「全部读 dynamicGroup」建议不再适用，见 [RAW-215](../../specs/requirements/shared-raw-215.md#L1)。
- 判断是否该收归：若一个条件表达式在文件里出现两次以上，或它同时决定「显示在哪」和「快捷键能否到达」，它就必须有 owner。
- 同类先例已经存在：[task-phase.cjs](../../../preload/task-phase.cjs#L1) 正是为消灭同一份相位词汇的多处手写而建；`unread` 与 `input` 这两支当时没被收进去，本记录补上。
- 不变式要穿过消费者：除了验证 Kernel 候选，还要在直接打开、状态分组变化、冻结期间刷新后派发上一／下一，核对目标仍来自状态候选并能跨来源到达。只检查 Snapshot 数组不能发现 Navigation 二次改写。

## Latest Applicable Implementation

Kernel 通过 `buildViews` 生成状态候选与展示分组；Navigation 保留环顺序、在途游标与派发职责，不再通过展示分组重选成员。Kernel `focusedKey` 接收所有成功派发的打开结果；环外打开不接管循环游标。[本次任务与验证](../../specs/260915/companion-cycle-authority/task-card.md#L1)。

## Alternative Route

1. 前置条件：Kernel 分组和计数正确，快捷键实际选中集合不同。
2. 依次核对匿名导航诊断、Kernel `cycleKeys`、Navigation 首次及冻结期间采用的数组、打开回执对游标的影响。
3. 用混合来源、环内／环外卡片及双向连续跳转回归验证；生产构建与真实宿主验收分别报告。
4. 适用边界：通用任务循环，不适用于列表焦点移动或专用未读入口。证据不足时保留现状，继续定位实际选中集合。
5. 状态：`verified`（自动化）；真实新产物 `host-not-retested`。

## Occurrence History

| 日期 | 触发与失败路线 | 恢复与证据 | 结果 |
| --- | --- | --- | --- |
| 2026-09-15 | 展示正确，导航用已完成展示组替换状态候选，连续跳至 Orca | 移除分组接管；导航红绿回归与 Kernel 混合来源双向回归，见任务卡 | 140 项通过；新宿主未验收 |

## Related

- [parked-item-inherits-fresh-item-invalidation](parked-item-inherits-fresh-item-invalidation.md#L1) —— 本记录导致的那次复发，症状与修复记在该叶子的 `Occurrence History`。
- [ring-reachability-outlives-list-visibility](ring-reachability-outlives-list-visibility.md#L1) —— 同一对判据的另一种失配：可达性与可见性各自推导，豁免只补了一侧。
