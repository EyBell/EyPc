---
id: eypc-codexhost-jump-read-lost-with-roster-timestamp
status: verified
scope: project
fingerprint: codexhost-external-jump-read-flips-back-unread__roster-loss-reseats-statuschangedat-now__opened-read-cleared-as-newer-turn
first_seen: 2026-09-03
last_verified: 2026-09-03
review_after: 2026-12-03
evidence:
  - preload/codex/codexhost-discovery.cjs
  - preload/index.js
  - tests/platform/codexhostDiscovery.test.ts
tags:
  - codexhost
  - unread
  - opened-read
  - persistence
---

# CodexHost 额外进程「跳转已读」被 roster 重落座翻回未读

## 症状

用快捷键或点击把一条 CodexHost 额外进程（Grok / Pi / Claude Code …）跳进 Codex 并读完后，EyPc 有时又把它弹回「已完成未读 · 刚刚」。没有稳定复现步骤，几分钟到几小时不等。

## 错误假设

以为是相位判定链或 Host `hasUnreadTurn` 的比对规则错了（RAW-190 / RAW-193 已反复核对过），或是 Kernel 的 `readAcknowledgements` 失效——后者对 Codex 本来就是死码（`PROVIDER_TRAITS.codex.readAcknowledgements === false`），已读一直由 preload 的 `codexDesktopOpenedReadAcknowledgements` 承载。

## 已验证根因

1. 额外进程没有真实 Turn 时间：`projectHostTurn` 用 discovery 的 `statusChangedAt` 同时充当 `startedAt` / `completedAt`，而 `statusChangedAt` 只在进程内 `externalThreads` 里延续。
2. roster 会整体丢失：会合点解析失败（`ps` / `pgrep` 超时、Host 子进程瞬时缺席）直接 `externalThreads = new Map()`；`resetCodexThreadSessionState` 调 `codexhostResetDiscovery()`；插件重载。下一次成功列表把所有行重新落座为 `firstSeenAt = statusChangedAt = now()`。
3. `codexReconcileDesktopOpenedReadWithTurn` 看到 `currentStartedAt > ack.turnStartedAt`，把跳转已读当成「旧 Turn 的确认」清掉（`task-evidence/opened-read-cleared`），`updatedAt` 同时跳到现在；Host 若仍报 `hasUnreadTurn=true`（Desktop 没消费深链，或尚未处理），行就以「刚刚 · 未读」回来。Host 端只在 Desktop resume / 读内容时清未读，EyPc 没有告知 Host 已读的通道。

## 修复

discovery 持久线程记忆（`eypc/codex/codexhost-thread-memory/v1`，注入 `storage`）：`seatThread` 只在 Host 状态 / attention 真变化时前进 `statusChangedAt`；`honorExternalOpenRead` 把 `readStatusChangedAt` 绑到当时的 `statusChangedAt`；`isExternalOpenedRead` 供 `compareHostDesktopUnread` 与 `sanitizeCodexThreads` 查询；Host unread `false → true` 边沿或状态变化取代已读；归档删记忆；`codexhostResetDiscovery` 不再清记忆。

## 检测顺序

1. 诊断 `task-evidence/opened-read-cleared` 的 `details.caller` 若是 `codexReconcileDesktopOpenedReadWithTurn<scanVerifiedCodexInventory` 而该行没有真的跑新 Turn，就是时间戳重落座，不是相位问题。
2. 看同一时段 `task-recovery/codexhost-discovery` 是否出现 `unavailable`（count 归零）或 `plugin-enter` 冷预检；两者之一之后紧跟 `ok` 即为 roster 重建。
3. 看 Host 真值：`codexhost thread list --all true` 该 id 的 `hasUnreadTurn` 仍为 true 说明 Desktop 没消费深链（结合 RAW-202 冷启动吞链）。

## 预防规则

任何由 EyPc 自己生成的「时间戳」都不能只活在进程内存里再被当成 Turn 因果：要么来自 Host，要么持久化并按真实状态变化推进。让行「消失再出现」的信号（roster 丢失、reset、reload）等价于「新完成」这一假设必须显式否定。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-03 | 额外进程已读弹回核验 | 用户报跳转已读后有时翻回未读 | 先查相位与 Host 比对规则 | 定位 `statusChangedAt` 只活在 roster、重落座即「新 Turn」；持久记忆 + 跳转已读绑定时间戳 | 3 文件 190/190；host reload pending |
