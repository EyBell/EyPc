# RAW-181：孤儿 SubagentStop 保守收敛未决 active 子代理

Tool: claude · Date: 2026-08-25 · Level: Standard（需求）

## 用户原话

> EyPc 仓库已核验的缺陷待修复：Claude Code 会话已完成且已读，EyPc 卡片却永久显示「进行中」，且卡死期间该家族归档按钮被 liveCount>0 抑制。……任务：先在真机复现/确认 id 错位载荷形态（hook 队列 …/eypc-claude-events.jsonl，短键 s/e/a/g/t），再设计保守收敛规则（候选：孤儿 SubagentStop 关闭最早未决同会话 active 子代理；或对启动早于当前 Turn 且长期无事件的 active 子代理时效降级），务必保留合法后台子代理（Turn 结束后仍在跑）不被误杀的边界，走仓库标准需求流程（raw-requirement + spec）落地并补测试。修改 canonical preload/ 后跑 pnpm run sync:preloads 同步镜像。

根因证据链：[claude-orphan-active-subagent-pins-family-running](../../../knowledge/error-memory/claude-orphan-active-subagent-pins-family-running.md#L1)（status verified，2026-08-25；本轮撰写时该记录在主检出待提交，落地后链接即生效）。

## 需求变更评审（Requirement Change Review）

`scanned_owners`: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L238) Claude 父 Turn/Stop/SessionEnd 相位契约、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L250) Topology V2 Subagent 生命周期、[vibe/rules/README.md](../../../rules/README.md#L49) `EYPC-COMPANION-STATE-SOURCE-001`（相位纠正必须源结构性、禁止 TTL/时效终态推断）、[claude-raw-174 及其 clause-089…094](../../requirements/claude-raw-174.md#L1) StopFailure 合同、[events.cjs](../../../../preload/claude/events.cjs#L139) 现行归约器。

`visible_changes`:

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| added | RAW-181 孤儿收敛 | 无类型孤儿 SubagentStop 在父 Turn 关闭后一对一关闭最早未决 active 子代理；同 id 直接证据可复活被收敛者 |
| unchanged | 父 Turn 相位契约（RAW-174 系） | 只收敛子代理成员，父相位、StopFailure 水位、SessionEnd 观察门槛全部不动 |
| unchanged | `EYPC-COMPANION-STATE-SOURCE-001` | 用户候选中的「时效降级」违反该规则，弃用；采纳的规则完全由事件结构驱动，无墙钟/TTL 参与 |
| unchanged | Kernel V7 聚合与 liveCount 归档抑制 | 家族解钉由证据侧收敛达成，聚合器不加特判 |

`conflict_candidates`: 用户候选方案二（时效降级）与 `EYPC-COMPANION-STATE-SOURCE-001`「elapsed time never creates a terminal」冲突；用户原话本身以「候选……或……」给出选择权，采纳方案一即无冲突，无需上报裁决。PRD L238「SubagentStop 尾事件不得把旧任务恢复为 running」针对父相位；本条只关闭子代理、复活仅撤销自身推断（恢复的是今日未收敛时本就会显示的 live 成员），不触碰该句。

`decision_status`: `explicit-current-request`

## 真机载荷复现（2026-08-25，队列窗口 13:37:51Z–14:37:14Z，1151 行）

- 载荷短键形态确认：`SubagentStart` / `SubagentStop` 均为 `keys=a,e,g,p,r,s,t`；差异不在键集而在取值。
- **错位类孤儿 stop 共 7 条，7/7 均无 agent_type（g 缺失）且全部在父 `Stop` 后 2–7 秒到达**（55dde45d：13:39:34→+7s、13:43:43→+3s；cb159c47：13:41:37→+4s、13:59:06→+6s、14:34:04→+5s；53836e7e：13:55:16→+4s、14:15:45→+5s）。
- 带 agent_type（g=other）的「孤儿」stop 5 条全部聚在队列窗口起点 4 分钟内——是轮转截断了其 SubagentStart 的合法 stop，不属错位类。
- 文档个例完全命中：53836e7e 会话 `SubagentStart(a8fd658…, other)` 14:09:53 后无同 id stop，父 `Stop` 14:15:45 后 5 秒到达无 Start、无类型的 `SubagentStop(a118fc6…)`。
- 全队列重放对照：按本条规则，仅该一处触发收敛且恰好解钉文档个例；其余 6 条无类型孤儿到达时会话内无未决 active，规则空转（无误伤面）。
- 上游缺陷已于 2026-08-25 报告：<https://github.com/anthropics/claude-code/issues/89555>（关联上游 #27423 stale 关闭的无 Start 孤儿类与 #82249 开放的 Stop 缺失类）。

## 规范化需求

- 携带合法 agentId、**无 agent_type**、且该 id 从未观察到 Start/活动的孤儿 `SubagentStop`，在**父 Turn 已关闭**（`turnOpen !== true`）时，一对一关闭同会话**最早启动**的未决 active 子代理（startedAt 不得晚于该 stop；并列取 agentId 字典序最小），并标记 `reconciledAt`。
- 带 agent_type 的孤儿 stop、同 id 重复 stop、父 Turn 仍开启、或会话内无未决 active 时，一律不收敛，保持现行 inactive 占位行为。
- 被收敛的子代理若随后出现**同 id 直接证据**（tool/permission/notification/Start 事件），立即复活为 active——合法后台子代理即使被误配对也自愈；`SessionEnd` 全量清扫后 `reconciledAt` 终态化，不再复活。
- 不引入任何 TTL/时效/墙钟推断；父相位、StopFailure、SessionEnd、Kernel 聚合与归档抑制逻辑不变。
- canonical 为 [preload/claude/events.cjs](../../../../preload/claude/events.cjs#L1)，改后 `pnpm run sync:preloads` 同步镜像。

## 验收意图

- 重放既有真机队列：53836e7e 家族由 running 收敛为 completed，归档按钮不再被幽灵 live 成员抑制；其余会话状态不变。
- 聚焦自动化：孤儿收敛、类型豁免、开 Turn 豁免、无候选空转、同 id 复活、SessionEnd 终态化各有用例。
- 真后台子代理（Turn 结束后仍产生同 id 事件）在被误配对后下一条自身事件即恢复 active。
