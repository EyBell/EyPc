---
id: eypc-concat-breaks-downstream-merge-sorted-precondition
status: verified
scope: project
fingerprint: two-individually-sorted-runs-concatenated__downstream-two-way-merge-requires-sorted-additions__precondition-undocumented-at-call-site__cards-land-in-wrong-order
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - src/domain/companionAggregate.ts
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
tags:
  - aggregation
  - ordering
  - implicit-precondition
---

# Concat Breaks A Downstream Merge's Sorted Precondition

> **Current implementation note (2026-08-07).** 下文 CLI/desktop 拼接器已删除；有序归并前提仍为 verified，因为 [companionAggregate.ts](../../../src/domain/companionAggregate.ts#L1) 仍消费有序 additions。当前 Claude 只有 Code inventory，不能据此恢复双 lane。

## Symptom

新建的桌面会话卡片排在很旧的 CLI 卡片后面；「上一个/下一个任务」循环序跟着错位。
两段数据各自看都是按时间降序的，肉眼审查发现不了问题。

## Wrong Assumption

以为"两个各自有序的数组拼起来交给下游"是安全的——下游反正会排序。

## Verified Root Cause

下游 `companionAggregate.mergeByRecency` 不是排序，是**二路归并**：它假定 `additions` 已按
`activityAt` 降序，然后与目标数组做一次线性交错。这个前提写在函数注释里，**没有写在调用点**，
也没有运行时校验。

`combineClaudeLaneCards` 返回 `[...cliCards, ...desktopCards]`——两段各自有序，拼接后整体无序，
前提被打破。改动前 additions 只有 CLI 一段、天然有序，所以这是本轮新引入的回归。

## Detection Order

1. 顺序类缺陷先查"谁在排序"：`sort` 还是 `merge`。归并对输入有前提，排序没有。
2. 顺序断言不能只断言最终元素顺序，要断言**归并键序列本身单调**（用下游同一个键表达式）。
3. 构造：一条很旧的 A 段元素 + 一条很新的 B 段元素，断言新的排前面。

## Prevention Rule

- 拼接两段数据前，先确认下游是排序还是归并；是归并就必须**在本层归并**，用与下游**逐字一致**
  的键表达式（本仓 `laneActivityAt` 复制 `companionAggregate` 的 `activityAt` 并注明 `@see`）。
- 隐式前提要么写进调用点，要么变成断言。本仓的回归测试断言"合并结果按归并键降序"，
  而不是只断言两个 alias 的顺序——后者换个 fixture 就失效。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核发现；改为本层二路归并并补单调性断言 |
