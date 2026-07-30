# Codex Companion 当前规范

Tool: codex
Date: 2026-07-30
Status: `implemented-static-verified-awaiting-host-acceptance`
Documentation level: `controlled`
Requirement version: `2026-07-30.6`

Raw source: [raw-requirement.md](raw-requirement.md#L1)

Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

Documentation sync group: `dsg:eypc:WU-CODEX-DESKTOP-LIVE-AUTHORITY`

## 第一性目标

Codex 任务的卡片、分组、角标和归档能力必须在同一份 Controller 原子包中反映真实状态。已接受的完成立即发布且不得反弹；真实新活动立即恢复 active；证据不足时才保守 ongoing。

## 证据合同

- Activity 来源为 `connector / initial-snapshot / activity-event`，并携带会话期 revision。
- Turn 来源为 `inventory / turn-started / turn-completed / targeted-after-exit / snapshot-corroborated`。
- `readStateOnly` 只能修改 unread；不得重放 Activity 或 Turn。
- Unread 区分初始 snapshot 与明确 read-state event。Codex 原生持久化 `true` 可覆盖完成前旧 snapshot `false`；完成后的明确 live event `false/true` 仍最高优先。
- 精确 `turn/completed` 统一关闭完成前 unread false 周期，即使旧待输入/审批 flag 尚未排空；完成后新到达的明确 read-state event 可重新声明已读。
- Preload 只读监听 Codex 原生状态文件变化，经短合并后仅发布匿名 `readStateOnly` 增量，不把文件路径或私有内容送入 Renderer。
- raw thread/Turn ID、正文、cwd、路径和私有 patch 值不跨越 preload。
- `desktopActiveSince` 只作 v2 兼容输入，不与 provider 时间比较；`completionPresentationDelayMs` 已退出当前设置形状。

## 唯一状态优先级

1. exact live 待输入/审批请求进入 `waiting-input / waiting-approval`。
2. 真实 Desktop activity patch、精确 App Server `active` 或精确/new `inProgress` 建立 live active；`app-server-live` 覆盖旧 initial/refollow idle，并跨 inventory 重建保留到后续明确终止。
3. 精确、定向或佐证 completed 立即进入 `completed`；普通 inventory completed 只有在没有更强 live active 时成立，精确通知允许缺失 `completedAt`。
4. `failed/interrupted + exact idle` 或 Desktop `not-running` 进入 `stopped`。
5. 不完整、乱序、断连或互相冲突的证据保持 `ongoing`。

真实 activity patch 开启新周期时，旧 completed 元数据不能压住 active。完成通过 active-exit 门禁后必须清除该 baseline，相同后续快照不得把 completed 改回 inProgress。

## 稳定性与兼容

- 首次 active snapshot 与 terminal Turn 冲突时，复用 `[0,300,1000]` 单任务佐证；真实 patch、等待请求或新 Turn 立即取消抑制。
- 同 revision 的精确 started/定向 inProgress 是状态前进，只有严格更旧的 `startedAt` 被拒绝；不再使用 completed shape、跨时钟或 completedAt 必填阻断 live 事件。
- 50/200ms 结构合并、5s/1s watchdog、15s 完整校对和 missing-key 隔离只保护证据/库存，不延迟已确认完成。
- `task-state-v3` 是当前语义。v2/旧来源仍读取并发布 degraded 原子包，不清空任务或停止订阅。
- 旧 runtime/float `conversations` 别名只作一版兼容；当前消费者以 `taskState` 为权威。

## 非目标与风险门禁

- 不重做外观、模型选择、项目移除或整个 EyPc 架构。
- 未授权真实 Codex/uTools 写操作；除已定义的项目移除事务外，Codex 原生状态保持只读。
- 实现接受仍需用户重载真实 uTools 并验收 stopped↔active、普通/中断恢复 active→completed 及任务切换。
