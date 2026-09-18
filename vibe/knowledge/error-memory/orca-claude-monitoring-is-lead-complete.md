---
id: eypc-orca-claude-monitoring-is-lead-complete
status: verified
scope: project
fingerprint: orca-claude-stop-stays-working-monitoring__osc-asterisk-keeps-running__sibling-worktree-unread__fold-lead-complete-to-done
first_seen: 2026-09-16
last_verified: 2026-09-17
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

1. 对照同 pane 的 `agent.state`、`workingMode`、`toolName`、`turnCompletedAt`、`unread` 与 OSC 前缀。
2. `working/waiting/blocked` → 进行中，不要看 monitoring 或 turnCompletedAt。
3. 插件在已完成已读与进行中之间来回切，先查 phase-transition 是否随工具间隙振荡。
4. 不要先改 Kernel 未读合并，也不要把 Claude Orca 窗格当成 Claude App Provider。
5. 同工作区另一条 `done` 突然变成已完成未读，先看工作区汇总是否在 Claude 仍 `working` 时被归因。

## Prevention Rule

Agents 仍为 `working` / `waiting` / `blocked` 时，`workingMode=monitoring` 与 `turnCompletedAt` 一律不是 lead-complete。工具间隙的 monitoring 会把卡片折成已完成，快捷打开变成已读，下一工具再拉回进行中。已完成未读只在 projected `session.state` 进入 `done` 后记账。`unread=true` 只在已非活状态时作为完成未读。Grok 的 OSC 等待帧仍可把真正 `done` 的窗格抬回进行中；Claude Agents 已是 `done` 时，残留 `✳` 不得再抬升，见 [Claude leftover OSC](orca-claude-done-asterisk-must-not-stay-working.md#L1)。

## Alternative Route

- 状态: `verified`
- 前置条件: 能读 `worktree ps` 的 agent 行和同 pane 的 `terminal.title`。
- 有序步骤:
  1. `sessionState` 在 `waiting`/`blocked` 之后、OSC 工作帧之前检查 `leadTurnCompleted`。
  2. 未读桥观察投影后的 `session.state`，不要再读原始 `agent.state`。
  3. 测试：`working+monitoring`（有无 toolName）+ `✳` → `working`；`working+turnCompletedAt` → `working`；曾观测 working 再 Agents `done` → Claude 未读；monitoring 期间不得标未读。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts tests/platform/orcaUnreadBridge.test.ts`
- 适用边界: Orca Companion。Claude App Provider 仍走 App 日志/Hook。
- 回退: Grok Agents `done` 且无工作帧才是已完成；Claude Agents `done` 即使残留 `✳` 也是已完成。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 | 核验 Orca Claude 未读 | 用户确认 Claude 任务已结束 | 只信 `agent.state` 和 OSC 工作帧 | CLI `working+monitoring`，OSC `✳`，无 unread 字段；EyPc 投影 Claude 进行中、Cursor 未读 | 主轮次结束信号折成 done | verified |
| 2026-09-16 | 实时核验进行中漏检 | 侧栏仍是 Bash/grep 数小时，插件进行中没有该卡 | 无 `toolName` 也把 `monitoring` 收成 done | CLI `working+monitoring`、`toolName=Bash`、OSC 工作帧 | 在途 toolName 短路 lead-complete | superseded |
| 2026-09-16 | 已读误判 | 最新包仍显示已完成已读 | 工具间隙无 toolName 仍按 monitoring 收成 done，打开变已读 | 已加载 host-3511f71c…；phase-transition completed↔running 振荡 | 活状态一律不 lead-complete | verified |
