# Spec：孤儿 SubagentStop 保守收敛未决 active 子代理

RAW: [raw-requirement.md](raw-requirement.md#L1) · 根因: [error memory](../../../knowledge/error-memory/claude-orphan-active-subagent-pins-family-running.md#L1)

## 为什么钉死

四段链路：上游 id 错位（Stop 的 agent_id ≠ Start 的）→ [events.cjs](../../../../preload/claude/events.cjs#L154) 子分支只认同 id、父 `stop` 不清扫、仅 `session-end` 全量清扫 → active 子代理经 [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L345) 成员化为 turn-running 节点 → [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1364) 任一 live 成员赢得家族相位并以 liveCount>0 抑制归档。

真机队列证实错位类载荷有**双重结构签名**：agent_id 未知 **且 agent_type 缺失**，并总在父 `Stop` 后 2–7 秒到达；合法 stop（含轮转截断孤儿）始终携带 agent_type。收敛规则据此完全源结构化，符合 `EYPC-COMPANION-STATE-SOURCE-001` 的无 TTL 约束。

## 变更点（仅 [reduceQueueEntry](../../../../preload/claude/events.cjs#L139) 子代理分支与 session-end 清扫）

### 1. 孤儿收敛

`subagent-stop` 满足全部四门：① agentId 对该会话从未有 Start/活动/停止记录；② `agentType` 为空；③ `turnOpen !== true`；④ 存在 `active === true` 且 `startedAt ≤ at` 的候选——则关闭其中 startedAt 最早者（并列取 agentId 字典序最小），写 `stoppedAt = at`、`reconciledAt = at`。一条孤儿 stop 至多关闭一个候选。孤儿自身仍按现行为记 inactive 占位。

### 2. 复活边界（防误杀）

同 id 直接证据推翻收敛推断：tool/permission/notification 事件对 `reconciledAt` 非零的子代理重新置 `active=true`、清 `stoppedAt/reconciledAt`（现行仅 `!stoppedAt` 才激活）；同 id `subagent-start` 与观察到的同 id stop 亦清 `reconciledAt`。`session-end` 全量清扫时把所有 `reconciledAt` 清零使其终态化——会话结束后重放的迷路尾事件不能再复活成员。

### 3. 字段边界

`reconciledAt` 只存在于归约器内部状态；[code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L354) 白名单投影（agentId/agentType/active/startedAt/stoppedAt/lastActivityAt）自然丢弃它，不进 Snapshot、不进 Renderer、不改 V7 合同。

## 明确不做

- 不动父相位分支（prompt/stop/stop-failure/session-end 语义、RAW-174 合同）。
- 不动 Kernel V7 `aggregateMemberPhase`、liveCount 归档抑制、code-sessions 成员化。
- 不加 TTL/时效/墙钟推断；无 agentId 的 `subagent-stop` 尾事件维持现状（观测类全部携带合法 id）。
- 不做队列数据迁移——修复对既有队列重放即时生效。

## 验收

- 聚焦测试：`tests/platform/claudeBridge.test.ts`（ordered hook state 新增 5 用例：孤儿收敛+一对一、类型豁免、开 Turn 豁免、同 id 复活、SessionEnd 终态化/空转占位）。
- 下游边界：`tests/platform/companionTaskTopology.test.ts`、`tests/platform/claudePreloadCore.test.ts` 保持全绿。
- 真机队列重放（本地、不入库）：53836e7e 收敛为无 live 成员，其余会话逐条比对无差异。
- `pnpm run sync:preloads` 后 `pnpm run validate:mirrors` 通过。
