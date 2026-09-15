---
id: eypc-orca-worktree-unread-must-not-fan-out
status: verified
scope: project
fingerprint: orca-worktree-unread-summary__copied-onto-every-agent-card__group-shows-many-completed-unread__attribute-to-newest-finished-pane
first_seen: 2026-09-14
last_verified: 2026-09-15
review_after: 2027-09-14
evidence:
  - preload/orca/inventory.cjs
  - tests/platform/orcaInventory.test.ts
  - vibe/specs/260913/orca-companion/raw-requirement.md
tags:
  - orca
  - companion-provider
  - unread
---

# Orca 工作区未读不得扇出到组内每条对话

## Symptom

Orca 一个工作区里只有一条实际未读对话，EyPc「已完成未读」却把同组多条都标成未读。侧栏里同组其它对话已是普通已完成。

## Wrong Assumption

`orca worktree ps` 的 `unread` 是按会话的。它其实是工作区汇总（`meta.isUnread`）。真正的按窗格未读在 Orca 渲染层 `unreadAgentCompletionPanes[paneKey]`，CLI 不导出。

## Verified Root Cause

库存把 `worktree.unread` 写进该工作树每一个 agent 的 `session.unread`。Kernel 再把每条 `done + unread` 送进已完成未读。组汇总被当成成员状态。后来虽改为只标最新结束的一条，却用含工作区 `lastActivityAt` 的 `lastUpdatedAt` 当结束时间，组内完成项时间被拉平，再按 `paneKey` 字母序选中邻居。

## Detection Order

1. 同一 `worktreeId` 下有多条 `done` 卡同时 `unread=true`，而 Orca 侧栏只有一条未读，就是本条。
2. 先看库存是否把工作树 `unread` 直接抄到每条 session。
3. 点未读卡却进入邻居：先核对同一 `paneKey` 与 handle 的关联，再核对 agent 原生布尔；没有逐窗格证据时不得用 visual layout 顺序或时钟归因。
4. 不要先去改 Kernel 未读合并。CLI `terminal switch` 在 handle 正确时会切到目标标签，根因在归因。

## Prevention Rule

工作树 unread 只是汇总，不得抄到组内每一条。CLI agent 行若带布尔 `unread`，卡片跟窗格，工作区汇总为假不得把仍未读的完成对话打成已读。没有按窗格字段时，只有该工作树恰好一条已完成会话才可吃汇总。多条已完成不得猜最右/最新（会把「清工」标未读、把 KM-8765 放进已完成）。进行中的会话不吃这口汇总未读。宁可少标一条，也不要把已读对话标未读。

Orca 一个 Workspace 窗口里多条 Agent 标签共用工作区 `unread`。橙色标签是渲染层 `unreadAgentCompletionPanes`，正式 1.4.202 CLI 不导出。猜最右侧已完成对话会标错卡。

不得用工作区 `lastActivityAt`、旁边窗格 `lastOutputAt`、`paneKey` 字母序或标签条右端当未读身份。

## Alternative Route

- 状态: `verified`
- 前置条件: 库存按工作树收集 agent 行。
- 有序步骤:
  1. `mergeSession` 不写工作树 unread。
  2. 有 agent.`unread` 布尔时跟窗格。否则仅当该工作树只有一条已完成会话才吃汇总。`lastUpdatedAt` 不得含工作区 `lastActivityAt`。
  3. 测试：多 done 且只有汇总时不猜；每个原生 true/false 各跟本窗格；显式 false 胜过临时账本；打开派发不得清原生 true。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts`
- 适用边界: Orca Companion 卡片未读。不把工作树汇总当成项目未读角标的另一套算法。
- 回退: 缺原生字段时临时账本保留已观测 working → done 的未读；单 done 可用汇总补充。原生 true/false 存在时不被汇总或账本覆盖。

## Occurrence History

以下最新/最右侧归因曾作为尝试，现均 superseded；当前路线以 [Spec](../../specs/260913/orca-companion/spec.md#L1) 与上述 Prevention Rule 为准。2026-09-15 的本地合同测试已覆盖原生接管，真实宿主尚未验收。

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | 工作区未读误扇出 | CodeNote master 四条已完成 | 工作树 unread 抄到每条卡 | CLI agent 无 unread 字段 | 只归因最新结束的一条 | verified |
| 2026-09-14 | 完成窗格未读被标已读 | EyPc 工作树 1 done + 1 working | 汇总 unread=false 整组清零 | Orca Agents 仍按窗格未读 | agent.unread 优先于汇总 | pending-host |
| 2026-09-14 | 已完成未读跳到左侧对话 | CodeNote 最后一格未读，点击进左边 fork 会话 | lastUpdatedAt 吃进工作区 lastActivityAt，平手后按 paneKey 选中邻居 | 同组 lastActivityAt 相同，左侧 paneKey 更大 | 归因改用 stateStartedAt | pending-host |
| 2026-09-14 | Workspace 标签条偏移 | 最后一格金标未读，跳进同窗左侧对话 | 时钟/paneKey 归因不是标签条最右侧完成项 | CLI switch 用对 handle 能切到最后一格 | 有布局时按 tabs 顺序取最右侧 done | pending-host |
