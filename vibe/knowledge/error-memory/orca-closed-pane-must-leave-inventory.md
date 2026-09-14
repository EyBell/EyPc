---
id: eypc-orca-closed-pane-must-leave-inventory
status: verified
scope: project
fingerprint: orca-closed-tab-still-listed__worktree-ps-agent-row-without-terminal-list-pane__join-empty-terminal__drop-unless-live-list-contains-pane
first_seen: 2026-09-14
last_verified: 2026-09-14
review_after: 2027-09-14
evidence:
  - preload/orca/inventory.cjs
  - tests/platform/orcaInventory.test.ts
  - vibe/specs/260913/orca-companion/raw-requirement.md
tags:
  - orca
  - companion-provider
  - inventory
  - membership
---

# Orca 关掉的窗格不得留在 EyPc 清单

## Symptom

在 Orca 窗口里关掉一条对话后，EyPc 浮窗仍列出那张卡。

## Wrong Assumption

`worktree ps` 的 agent 行就是还开着的对话。关标签后 CLI 仍可能留着 agent，库存用空 terminal 对象继续合成卡片。

## Verified Root Cause

`collectSessions` 对找不到的 `paneKey` 写 `byPane.get(paneKey) || {}`。有 tool/prompt 的残留 agent 仍 `hasConversation`，Kernel 完整 membership 快照就会一直挂着。成功的 `terminal list` 不含该窗格才是关掉；列表失败不是「全部关掉」。

## Detection Order

1. 对照 `worktree ps` 的 `paneKey` 和 `terminal list` 的 `tabId:leafId`。
2. list 有、ps 没有：只留 list 里带 `agentIdentity` 的活窗格。
3. ps 有、list 没有：必须丢掉，不得用空 terminal 合成。
4. 两次 `terminal list` 都失败：库存不可用，不得发空快照清掉仍开着的卡。
5. 不要先改 Kernel 删除策略；Codex「一次快照少行不是删除」管的是传输抖动，不是 Orca 关窗格。

## Prevention Rule

一张卡对应一个还在 `terminal list` 里的 Agent 窗格。Orca 关掉的标签不进 EyPc。`worktree ps` 残留行不能单独维持 membership。`terminal list` 成功但为空可以清清单；列表失败必须 `available=false`。

## Alternative Route

- 状态: `verified`
- 前置条件: 库存同时读 `worktree ps` 与 `terminal list`。
- 有序步骤:
  1. `byPane.get(paneKey)` 没有命中就 `continue`。
  2. list 失败则 `available=false`，sessions 为空但不作为完整删除。
  3. 测试：两条 ps agent 只留一条 list 窗格；list timeout 时 available 为假。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts`
- 适用边界: Orca Companion 清单。不改 EyPc 归档主动 `terminal close`。
- 回退: 无。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | Orca 关闭后仍列出 | 用户在 Orca 窗口关掉对话 | 空 terminal 合成残留 agent | ps 与 list 对不上 | 只保留 list 中的窗格 | pending-host |
