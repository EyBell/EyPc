---
id: eypc-cursor-disk-completed-stale-hook-turnopen
status: verified
scope: project
fingerprint: cursor-disk-completed-stale-hook-turnopen-must-not-stay-running
first_seen: 2026-09-05
last_verified: 2026-09-05
review_after: 2027-03-05
evidence:
  - user-corrected
  - WAL-aware cold sqlite diskStatus completed
  - focused adapter and cursorAgent tests
tags:
  - companion
  - cursor
  - phase
  - hook
---

# Cursor 磁盘已完成后陈旧 hook.turnOpen 不得锁在进行中

## Symptom

Cursor 会话磁盘 `status=completed`，冷路径没有 `unfinishedRunAt` / 活分叉，钩子队列末事件已是 `stop`/`completed`，EyPc 仍显示进行中。若该行同时被陈旧 `providerPin` 钉在置顶分组，会看起来像状态也对不上。

## Wrong Assumption

无条件「Hook Turn beats disk」：`hook.turnOpen === true` 永远压过磁盘终态。

## Verified Root Cause

V7 Cursor 适配器把 `turnOpen` 与冷路径 `unfinishedRunAt` 并列写成进行中；域函数 `resolveCursorAgentPhase` 同样先看 `hookTurnOpen`。进程内钩子折叠若没吃到 `stop`（队列旋转、漏事件或未折叠），`turnOpen` 会停在 true，即使 sqlite 已 completed。活的冷路径标记仍应保持进行中；`diskStatus=aborted` 时开着的 Turn 仍应是进行中。

## Correct Detection Order

1. 先看冷 sqlite：`diskStatus`、`unfinishedRunAt`、分叉 `unfinishedRunAt`、`hasBlockingPendingActions`。
2. 再看钩子折叠：`turnOpen` / `phase`。磁盘 completed 且没有活的冷路径时，单独的 `turnOpen` 不能定进行中。
3. 阻塞待决仍是待输入（interaction），不要和 activity kind 混成「必须 running」。
4. 不要把置顶分组独占显示（RAW-185）当成相位判断。

## Prevention Rule

`diskStatus === 'completed'` 且没有会话/分叉冷路径进行中证据时，不得让 `hook.turnOpen` 或 `hookPhase === 'running'` 单独保持进行中。`aborted` 与空/`none` 磁盘上的开 Turn 仍是进行中。不要把 `hasPendingPlan` 并进这条。

## Latest Applicable Implementation

- 适配器：[preload/companion/evidence-adapter-v7.cjs](../../../preload/companion/evidence-adapter-v7.cjs#L272)
- 域：[src/domain/cursorAgent.ts](../../../src/domain/cursorAgent.ts#L125)
- 回归：[tests/platform/providerEvidenceAdapterV7.test.ts](../../../tests/platform/providerEvidenceAdapterV7.test.ts#L1)、[tests/domain/cursorAgent.test.ts](../../../tests/domain/cursorAgent.test.ts#L42)

## Alternative Route

- Status: `verified`（2026-09-05 聚焦 adapter + cursorAgent 通过）
- Preconditions: Cursor Agent 相位；磁盘 completed 与陈旧开 Turn 分叉。
- Steps: 活冷路径或（`turnOpen` 且磁盘不是 completed）才标 running；否则落到磁盘 completed。
- Verification: 聚焦上述两套件；`aborted` + `turnOpen` 仍 running。
- Applicability boundary: Cursor 证据适配与域相位。不含 Claude Hook、不含队列旋转扩容。
- Fallback: 若 Plan 模式进行中被误标完成，先核磁盘是否真是 completed，而不是恢复无条件 turnOpen 优先。

## Occurrence History

| 日期 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-09-05 | 磁盘已完成仍进行中 | turnOpen 无条件压过磁盘 | 仅非 completed 磁盘允许 turnOpen 单独定 running | 聚焦测试绿 |
