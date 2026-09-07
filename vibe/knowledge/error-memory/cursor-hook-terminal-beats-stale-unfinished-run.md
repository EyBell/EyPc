---
id: eypc-cursor-hook-terminal-beats-stale-unfinished-run
status: verified
scope: project
fingerprint: cursor-hook-terminal-must-beat-leftover-session-unfinished-runat
first_seen: 2026-09-06
last_verified: 2026-09-06
review_after: 2027-03-06
evidence:
  - user-corrected
  - count-only sqlite diskStatus aborted plus leftover unfinishedRunAt
  - hook fold stop completed then adapter still turn-running
  - focused adapter and cursorAgent tests
tags:
  - companion
  - cursor
  - phase
  - hook
---

# Cursor 钩子终态后会话残留 unfinishedRunAt 不得锁在进行中

## Symptom

Cursor 侧栏已是已完成已读，EyPc 未读为 0，行仍停在「进行中」。磁盘常见 `status=aborted`（不是 `completed`），`unfinishedRunAt` 未清，钩子已折叠 `stop/completed` 且 `turnOpen=false`。09-05「磁盘 completed 才压过陈旧 turnOpen」进不了这条路径。

## Wrong Assumption

会话 `unfinishedRunAt > 0` 永远等于活冷路径，可与 `turnOpen` 并列写成进行中；域函数 `resolveCursorAgentPhase` 已让 `hookPhase` completed/stopped 压过会话残留 `unfinishedRunAt`，适配器不必对齐。

## Verified Root Cause

V7 Cursor 适配器把 `liveCold = 会话 unfinishedRunAt 或分叉 unfinishedRunAt` 放在 `hook.phase` 之前。Cursor 在 Agent 运行时磁盘经常是 `aborted`，stop 之后 sqlite 仍可能留下 `unfinishedRunAt`。钩子终态已到，适配器仍发 `turn-running`，Kernel 把该根任务留在进行中分组和角标里。活分叉仍应使父卡进行中；无钩子且会话 `unfinishedRunAt` 仍在时仍应进行中。

## Correct Detection Order

1. 阻塞待决仍是待输入。
2. 活分叉 `unfinishedRunAt` 使父卡进行中，即使父钩子已终态。
3. 钩子 `phase` 为 `completed`/`stopped` 时，忽略会话残留 `unfinishedRunAt`。
4. 开着的 Turn 仍压过 `aborted`/空磁盘；磁盘 `completed` 且无活分叉时，陈旧 `turnOpen` 不得单独定进行中。

## Prevention Rule

`hook.phase === 'completed' || hook.phase === 'stopped'` 时，不得让会话 `unfinishedRunAt` 单独保持进行中。活分叉除外。不要把这条扩成「磁盘 aborted 一律完成」，也不要用 TTL。

## Latest Applicable Implementation

- 适配器：[preload/companion/evidence-adapter-v7.cjs](../../../preload/companion/evidence-adapter-v7.cjs#L272)
- 域：[src/domain/cursorAgent.ts](../../../src/domain/cursorAgent.ts#L125)
- 回归：[tests/platform/providerEvidenceAdapterV7.test.ts](../../../tests/platform/providerEvidenceAdapterV7.test.ts#L1)、[tests/domain/cursorAgent.test.ts](../../../tests/domain/cursorAgent.test.ts#L42)

## Alternative Route

- Status: `verified`（2026-09-06 聚焦 adapter + cursorAgent）
- Preconditions: Cursor Agent 相位；钩子终态与会话残留 `unfinishedRunAt` 分叉。
- Steps: 活分叉，或（非钩子终态且会话 unfinishedRunAt），或（turnOpen 且磁盘不是 completed）才标 running。
- Verification: 聚焦上述两套件；`aborted` + 开 Turn 仍 running；活分叉 + 父钩子 completed 仍 running。
- Applicability boundary: Cursor 证据适配与域相位。不含 Claude Hook。
- Fallback: 若无钩子的真实进行中被标完成，先核 `unfinishedRunAt` 是否仍在且钩子 `phase` 并非终态，而不是恢复无条件 liveCold 优先。

## Occurrence History

| 日期 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | 侧栏已完成已读仍进行中 | 会话 unfinishedRunAt 压过钩子终态 | 钩子终态忽略会话残留 unfinishedRunAt；活分叉仍 running | 聚焦 adapter + cursorAgent 19/19 通过 |
