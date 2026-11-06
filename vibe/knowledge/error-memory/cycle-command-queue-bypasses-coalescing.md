---
id: eypc-cycle-command-queue-bypasses-coalescing
status: verified
scope: project
fingerprint: companion-cycle-gateway-awaits-previous-open__navigation-cannot-coalesce__leave-cycle-selection-to-navigation
first_seen: 2026-10-26
last_verified: 2026-10-26
review_after: 2027-01-26
evidence:
  - preload/companion/task-kernel.cjs
  - preload/companion/navigation.cjs
  - tests/platform/companionTaskKernel.test.ts
  - vibe/specs/261026/task-cycle-freeze/task-card.md
tags:
  - companion-cycle
  - command-queue
  - coalescing
---

# 外层 cycle 串行队列阻断末次合并

## Symptom

上一／下一连续触发后持续逐个打开窗口。进行中任务打开后仍留在环内，积压动作不会因打开而自然消失。

## Wrong Assumption

Navigation 已实现末次合并，就能覆盖所有入口；遗漏了上游 Gateway 会等待每次打开结束，后续按键尚未到达 Navigation。

## Verified Root Cause

`dispatchCommand` 把全部 cycle 放进同一个 `@cycle` Promise 链。固定入口跨四来源的双向匿名回放中，首个打开挂起时继续触发 49 次，旧实现最终派发 50 次；改由 Navigation 及时接收选择后只派发首个和最终 2 次，最大打开并发仍为 1。

## Correct Detection Order

1. 从固定 `handleEnter` 入口回放到 Gateway、Navigation、Adapter，不能只测 Navigation 本身。
2. 挂起首个打开，再发送同向／反向按键，核对逻辑游标、末次目标、派发次数和打开并发。
3. 核对重复 operationId、首个失败、普通同 key 命令的保留行为。

## Prevention Rule

cycle 选择由唯一 Navigation 管理，不在上游等待前次打开；实际打开仍全局串行。Gateway 保留 operationId 去重、版本检查以及非 cycle 命令的逐 key 串行。不能以删除按键方向推进或丢弃最后意图来减少调用。

## Latest Applicable Implementation

[Gateway](../../../preload/companion/task-kernel.cjs#L1)、[导航](../../../preload/companion/navigation.cjs#L1)、[回归](../../../tests/platform/companionTaskKernel.test.ts#L1)、[任务](../../specs/261026/task-cycle-freeze/task-card.md#L1)。

## Alternative Route

- Status: verified（离线回放）；宿主整体卡死的唯一因果未确认。
- Preconditions: cycle 进入当前 V7 Gateway，Navigation 拥有候选与唯一打开队列。
- Ordered steps: Gateway 校验／去重 → cycle 及时进入 Navigation → 每次推进逻辑游标 → 合并到末次目标 → 打开串行执行。
- Verification: 双向 50→2；跨来源、混合方向、去重、首个失败及普通同 key 串行回归。
- Applicability boundary: 普通 cycle；attention 专用入口和修改命令不据此取消串行。
- Fallback: 无合格目标或版本失效继续按原结果拒绝，不新增来源刷新或邻居替换。

## Occurrence History

| Date | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-10-26 | 进行中任务上一／下一触发链排查 | 在 Gateway 串行等待打开 | cycle 选择交还 Navigation | 固定入口回放先红后绿；真实宿主待验 |
