---
id: eypc-claude-orphan-active-subagent-pins-family-running
status: verified
scope: project
fingerprint: claude-completed-read-session-stuck-running__subagent-stop-id-mismatch-orphan-active__no-sweep-on-parent-stop-no-child-timeout
first_seen: 2026-08-25
last_verified: 2026-08-25
review_after: 2026-11-25
evidence:
  - preload/claude/events.cjs
  - preload/claude/code-sessions.cjs
  - preload/claude/scripts.cjs
  - preload/companion/task-kernel.cjs
tags:
  - claude-companion
  - subagent
  - topology
  - phase
---

# 孤儿 active 子代理把已完成会话钉死在「进行中」

## 症状

一条 Claude Code 会话在 App 内已完成且已读，EyPc 却持续显示「进行中」，新一轮提问/完成也不能纠正；卡死期间该家族的归档按钮被禁用（liveCount>0 抑制 archive）。约 `dynamicTaskWindowHours`（内核默认 48h）无新活动后卡片从动态视图**直接消失**，相位从未被纠正为已完成。

## 错误假设

以为父 Turn 的 `stop` 会收敛整卡状态；实际子代理活动独立成员化，任一 live 成员在聚合里压过父级 completed。

## 已验证根因

四段链路叠加（2026-08-25 实测个例：会话 22:09:53 `SubagentStart(A)` 后 A 的 `SubagentStop` 永未到达，父 `Stop` 22:15:45 后 ~5s 出现携带**不同 agentId** 的无 Start 孤儿 `SubagentStop(B)`）：

1. **上游 id 错位**：Claude Code 自身 hook 载荷在部分子代理上 `SubagentStop` 携带与 `SubagentStart` 不同的 `agent_id`；EyPc hook 脚本对两类事件用同一 `first_value agent_id` 提取（[scripts.cjs](../../../preload/claude/scripts.cjs#L77-L79)），捕获对称，错位非 EyPc 造成。
2. **归约器无兜底**：[events.cjs](../../../preload/claude/events.cjs#L154-L183) 子分支只认同 id 事件；父 `stop`（[#L196-L201](../../../preload/claude/events.cjs#L196-L201)）不清扫 active 子代理，仅 `session-end`（[#L225-L229](../../../preload/claude/events.cjs#L225-L229)）全量清扫；孤儿 Stop 只生成 inactive 占位，不关闭未决 active。子代理无任何时效降级。
3. **证据成员化**：correlation 非 none/ambiguous 即附带 subagents（[code-sessions.cjs](../../../preload/claude/code-sessions.cjs#L345-L366)）；active 子代理映射为 `turn-running` 成员节点且 `dynamicEligible` 恒真。
4. **聚合无时效**：[task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1364-L1375) 任一 live 成员赢得家族相位，无新旧比较；`liveCount>0` 同时禁用归档（[#L1406](../../../preload/companion/task-kernel.cjs#L1406)）。

队列轮转不清态（内存 Map 与文件偏移分离，仅 close 重置）；重载后从文件重放会**重建**幽灵。`degradeStuckClaudeActivity` 只降级 live 父相位且从不触及 subagents。

## 检测顺序

1. 在 hook 队列（`…/uTools/claude-companion/eypc-claude-events.jsonl`，短键 s/e/a/g/t）按会话统计每个 agentId 的 `SubagentStart`/`SubagentStop` 计数，找 start>stop 的滞留者与无 Start 的孤儿 Stop。
2. 对照 App 日志确认父 Turn 已正常 `Stop`（排除真活动）。
3. 确认展示层相位来自家族聚合而非父行本身（kernel aggregateMemberPhase）。

## 解除路径（当前代码下）

- 在 Claude App 内关闭/结束该会话：`SessionEnd` hook 事件全量清扫 active 子代理（持久，追加进队列）。首选。
- 在 App 内归档该会话（`isArchived` 使证据整族清空）。EyPc 侧归档因 live 抑制不可用。
- 被动：最后活动 + 动态窗后卡片消失（隐藏而非纠正）。

## 预防规则

已实施（RAW-181，2026-08-25，worktree 分支 `claude/cranky-kowalevski-3f7f83` 提交 `3e9ae19`，待融合主线）：归约器对**无 agent_type** 的孤儿 `SubagentStop` 在父 Turn 关闭后一对一关闭最早未决 active 子代理并标 `reconciledAt`；同 id 直接证据复活被收敛者，`SessionEnd` 终态化；带类型孤儿、开 Turn 到达、重复 stop、无候选一律保持 inactive 占位。时效降级候选因 `EYPC-COMPANION-STATE-SOURCE-001` 禁 TTL 被弃用。真机复现确认错位类载荷 7/7 缺 agent_type 且在父 `Stop` 后 2–7 秒到达；上游缺陷已报告：<https://github.com/anthropics/claude-code/issues/89555>。详见 [RAW-181 spec](../../specs/260825/2242-claude-orphan-subagent-reconcile/spec.md#L1)（任务在 worktree 分支，融合前此链接在主线不可解析）。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-25 | 状态消退慢核验（追加症状） | 用户报已完成已读会话持续显示进行中 | 假设父 Stop 应收敛整卡 | 队列级实证 id 错位孤儿 active + 四段链路核验（对抗核验 CONFIRMED） | verified（根因）/ 修复待需求裁决 |
| 2026-08-25 | RAW-181 孤儿收敛落地（worktree cranky-kowalevski-3f7f83） | 用户指令修复本缺陷 | — | 真机队列签名核验（7/7 无类型孤儿在父 Stop 后 2–7 秒）+ 源结构收敛 + 同 id 复活边界 + 真机重放仅目标家族解钉 | 已实施待融合主线；上游 issue #89555 已提交 |
