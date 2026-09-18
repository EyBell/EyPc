---
id: eypc-orca-claude-done-asterisk-must-not-stay-working
status: verified
scope: project
fingerprint: orca-claude-agents-done__leftover-osc-asterisk-lifts-working__grok-wait-frame-is-not-claude-stop
first_seen: 2026-09-17
last_verified: 2026-09-17
review_after: 2027-09-17
evidence:
  - preload/orca/inventory.cjs
  - tests/platform/orcaInventory.test.ts
  - tests/platform/orcaUnreadBridge.test.ts
  - vibe/specs/260913/orca-companion/spec.md
tags:
  - orca
  - companion-provider
  - claude
  - phase
  - unread
---

# Orca Claude Agents 已完成后残留 OSC ✳ 不得钉进行中

## Symptom

Orca 里 Claude 主轮次已经结束，Agents `state=done`，EyPc 仍显示「进行中」，也不会变成「已完成未读」。同窗格 OSC 标题仍以 `✳` 开头，最后一次 `toolName` 可能还是 Bash。

## Wrong Assumption

凡是 OSC 工作帧（含 `✳`、braille spinner、Claude `. `）都应把 Agents `done` 抬成进行中。这是 Grok「Waiting for response」还停在 `done` 时的正确补丁，不能套到 Claude Stop 之后残留的 `✳`。

## Verified Root Cause

`sessionState` 在 Agents 离开 `working/waiting/blocked` 之后无条件执行 `oscIndicatesWorking(terminalTitle)`。Claude Stop 后窗格 OSC 常留下 `✳ …`，于是投影一直是 `working`。未读桥只认 projected `working → done`，这条完成永远记不上。Grok 的 `⠋ Grok` 仍需要在 Agents `done` 时抬升。

## Detection Order

1. 对照同 pane 的 `agent.state`、`agentType`、`toolName` 与 OSC 前缀类别（`✳` / braille spinner），不要读标题正文。
2. Claude `state=done` + 残留 `✳` → 已完成；不要看 leftover toolName。
3. Grok `state=done` + `⠋` / Waiting for response → 仍进行中。
4. Claude `state=working/waiting/blocked` + OSC → 仍进行中。
5. 不要把本机 Claude App/Hook 卡和 Orca `cc` 卡当成同一条。

## Prevention Rule

OSC 抬升只保留给「Agents 还没承认活回合、但窗格已经在等回复」的 Grok 形态。Claude Agents 已经 `done` 时，残留 `✳` / spinner 不是活回合。无 `worktree.ps` 行的工具栏 OSC 仍可标进行中。

## Alternative Route

- 状态: `verified`
- 前置条件: 能读 `worktree ps` 的 agent 行和同 pane 的 `terminal.title`。
- 有序步骤:
  1. `sessionState` 在 OSC 抬升前排除 `agentType=claude && state=done`。
  2. 工具栏无 ps 行时不要盖 `state: done`，以免把活 OSC 误判成 Claude 终态。
  3. 未读桥继续观察投影后的 `session.state`。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts tests/platform/orcaUnreadBridge.test.ts`
- 适用边界: Orca Companion。不含本机 Claude App/Hook。
- 回退: Claude Agents `done` 即已完成；Grok 等待帧仍可抬升。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-17 | Claude 完成投影 | 用户确认回合已结束、卡片仍进行中 | 无条件 OSC 抬升 | Agents `done`，OSC `✳`，残留 `toolName=Bash`，本机 Claude `running=0` | Claude `done` 忽略残留 OSC | verified |
