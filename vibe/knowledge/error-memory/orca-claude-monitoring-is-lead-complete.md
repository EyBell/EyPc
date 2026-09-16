---
id: eypc-orca-claude-monitoring-is-lead-complete
status: verified
scope: project
fingerprint: orca-claude-stop-stays-working-monitoring__osc-asterisk-keeps-running__sibling-worktree-unread__fold-lead-complete-to-done
first_seen: 2026-09-16
last_verified: 2026-09-16
review_after: 2027-09-16
evidence:
  - preload/orca/inventory.cjs
  - preload/orca/unread-bridge.cjs
  - tests/platform/orcaInventory.test.ts
  - tests/platform/orcaUnreadBridge.test.ts
  - vibe/specs/260913/orca-companion/spec.md
tags:
  - orca
  - companion-provider
  - unread
  - claude
  - phase
---

# Orca Claude 主轮次结束后 CLI 仍是 working

## Symptom

Orca 里 Claude Agent 已经结束，EyPc 仍停在进行中，已完成未读进不来。同工作区若还有一条已完成的 Cursor/Grok，工作区汇总未读会落到那条旁路卡上。Grok 同一套库存和未读中转是通的。

## Wrong Assumption

`worktree ps` 的 `agent.state === 'working'` 对所有 Agent 都等于前景还在跑。Grok 的 Stop 就是 `done`，Claude 也一样。OSC 工作帧只用于把过早的 `done` 抬成进行中，不会把已经结束的主轮次钉死。

## Verified Root Cause

Orca Claude 的 Stop 在还有后台 shell / cron 时对外仍是 `state=working` + `workingMode=monitoring`，完成通知靠内部 `turnCompletedAt`。正式 CLI 不导出 `unread` / `turnCompletedAt`。EyPc 把任何 `working` 收成进行中，OSC `✳` 再加一层工作帧。本地未读账本只认 projected `working → done`，于是 Claude 永远进不了已完成未读。工作区 `unread=true` 且只有旁路窗格是 `done` 时，汇总落到那条旁路卡。

## Detection Order

1. 对照同 pane 的 `agent.state`、`workingMode`、`turnCompletedAt`、`unread` 与 OSC 前缀。
2. `working` + `monitoring`（或 `turnCompletedAt` / 窗格 `unread=true`）而用户已看到主回复结束，就是本条。
3. 不要先改 Kernel 未读合并，也不要把 Claude Orca 窗格当成 Claude App Provider。
4. 同工作区另一条 `done` 突然变成已完成未读，先看工作区汇总是否在 Claude 仍 `working` 时被归因。

## Prevention Rule

主轮次结束信号：`workingMode=monitoring`、正数 `turnCompletedAt`、或窗格 `unread=true` → 已完成，压过 `state=working` 和 OSC 工作帧。`waiting` / `blocked` 与中断仍优先。前景 `working` 不加这些字段时保持进行中。未读中转看投影后的 `done`，因此 `working → monitoring` 也记账。多条已完成不得把工作区汇总猜到旁路卡。

## Alternative Route

- 状态: `verified`
- 前置条件: 能读 `worktree ps` 的 agent 行和同 pane 的 `terminal.title`。
- 有序步骤:
  1. `sessionState` 在 `waiting`/`blocked` 之后、OSC 工作帧之前检查 `leadTurnCompleted`。
  2. 未读桥观察投影后的 `session.state`，不要再读原始 `agent.state`。
  3. 测试：`working+monitoring` + `✳` → `done`；同组 Cursor `done` 不得因工作区汇总变未读；曾观测 working 再 monitoring → Claude 未读。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts tests/platform/orcaUnreadBridge.test.ts`
- 适用边界: Orca Companion。Claude App Provider 仍走 App 日志/Hook。
- 回退: 前景 `working` 且无 monitoring / turnCompletedAt / unread 仍是进行中。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 | 核验 Orca Claude 未读 | 用户确认 Claude 任务已结束 | 只信 `agent.state` 和 OSC 工作帧 | CLI `working+monitoring`，OSC `✳`，无 unread 字段；EyPc 投影 Claude 进行中、Cursor 未读 | 主轮次结束信号折成 done | verified |
