---
id: eypc-orca-worktree-unread-must-not-fan-out
status: verified
scope: project
fingerprint: orca-worktree-unread-summary__copied-onto-every-agent-card__group-shows-many-completed-unread__attribute-to-newest-finished-pane
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
  - unread
---

# Orca 工作区未读不得扇出到组内每条对话

## Symptom

Orca 一个工作区里只有一条实际未读对话，EyPc「已完成未读」却把同组多条都标成未读。侧栏里同组其它对话已是普通已完成。

## Wrong Assumption

`orca worktree ps` 的 `unread` 是按会话的。它其实是工作区汇总（`meta.isUnread`）。真正的按窗格未读在 Orca 渲染层 `unreadAgentCompletionPanes[paneKey]`，CLI 不导出。

## Verified Root Cause

库存把 `worktree.unread` 写进该工作树每一个 agent 的 `session.unread`。Kernel 再把每条 `done + unread` 送进已完成未读。组汇总被当成成员状态。

## Detection Order

1. 同一 `worktreeId` 下有多条 `done` 卡同时 `unread=true`，而 Orca 侧栏只有一条未读，就是本条。
2. 先看库存是否把工作树 `unread` 直接抄到每条 session。
3. 不要先去改 Kernel 未读合并；那是成员 OR，根因在归因。

## Prevention Rule

工作树 unread 只是汇总。卡片未读只归因到该工作树里最新结束（非 working）的那一条。进行中的会话不吃这口汇总未读。CLI 没有按会话未读时，宁可少标一条，也不要把已读对话标未读。

## Alternative Route

- 状态: `verified`
- 前置条件: 库存按工作树收集 agent 行。
- 有序步骤:
  1. `mergeSession` 不写工作树 unread。
  2. 每个工作树收集完后，只给 `lastUpdatedAt` 最大的非 working 行打 unread。
  3. 测试：四条同组，三条 done 一条 working，工作树 unread=true，只有最新 done 为 true。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts`
- 适用边界: Orca Companion 卡片未读。不把工作树汇总当成项目未读角标的另一套算法。
- 回退: 工作树 unread=false 时组内全部已读。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | 工作区未读误扇出 | CodeNote master 四条已完成 | 工作树 unread 抄到每条卡 | CLI agent 无 unread 字段 | 只归因最新结束的一条 | verified |
