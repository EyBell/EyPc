# Codex Companion 当前规范

Tool: codex
Date: 2026-07-30
Status: `implemented-unverified-awaiting-host-acceptance`
Documentation level: `controlled`
Requirement version: `2026-07-30.12`

Raw source: [raw-requirement.md](raw-requirement.md#L1)

Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

Documentation sync group: `dsg:eypc:WU-CODEX-DESKTOP-LIVE-AUTHORITY`

## 第一性目标

Codex 任务的卡片、分组、角标和归档能力必须在同一份 Controller 原子包中反映真实状态。已接受的完成立即发布且不得反弹；真实新活动立即恢复 active；证据不足时才保守 ongoing。

## 证据合同

- Activity 来源为 `connector / initial-snapshot / activity-event`，并携带会话期 revision；Preload 内真实 Desktop patch 与精确 App Server active 另共享一个不出 Host 的单调 evidence sequence，用于判断跨来源先后。
- Turn 来源为 `inventory / turn-started / turn-completed / targeted-after-exit / snapshot-corroborated`。
- `readStateOnly` 只能修改 unread；不得重放 Activity 或 Turn。
- Unread 区分初始 snapshot 与明确 read-state event。Codex 原生持久化 `true` 可覆盖完成前旧 snapshot `false`；完成后的明确 live event `false/true` 仍最高优先。
- 精确 `turn/completed` 统一关闭完成前 unread false 周期，即使旧待输入/审批 flag 尚未排空；完成后新到达的明确 read-state event 可重新声明已读。
- Preload 只读监听 Codex 原生状态文件变化，经短合并后仅发布匿名 `readStateOnly` 增量，不把文件路径或私有内容送入 Renderer。
- 原生 unread 首次观测或从非 true 变为 `true` 时，若 latest Turn 尚未确认 completed，非 active 任务启动一次普通有界复核；无 waiting flag、无精确 `turn-started` 的可疑 active 启动 `verifyStaleActive`。会话期观测水位防止相同 true 轮询重复重启；unread 只唤醒取证，不直接改变 Activity 或发明完成。
- Codex 原生 read-state 是未读的唯一权威。完成未读角标与全局命令只打开第一条；旧 `completedUnreadAcknowledged*` 输入只作忽略式迁移，不能压住原生 unread。
- raw thread/Turn ID、正文、cwd、路径和私有 patch 值不跨越 preload。
- `desktopActiveSince` 只作 v2 兼容输入，不与 provider 时间比较；`completionPresentationDelayMs` 已退出当前设置形状。

## 唯一状态优先级

1. exact live 待输入/审批请求进入 `waiting-input / waiting-approval`。
2. 真实 Desktop activity patch、精确 App Server `active` 或精确/new `inProgress` 建立 live active；`app-server-live` 覆盖旧 initial/refollow idle 和更早的 idle activity event，并携带私有建立水位跨 inventory 重建保留。Desktop 非 active 只有其真实 patch 水位严格更晚时才可撤销；read-state-only、Side Chat 聚合或 inventory 重放旧 shadow 不能撤销。
3. 精确、定向或佐证 completed 立即进入 `completed`；普通 inventory completed 只有在没有更强 live active 时成立。精确通知和 snapshot 佐证都允许缺失 `completedAt`，confirmed provenance 写回会话期 inventory。
4. `failed/interrupted` 只有相对当前 active-exit baseline 前进并经退出后定向证据确认，或与 Desktop 明确 `not-running` 共同出现时进入 `stopped`；缺失 Turn outcome 永不构成停止。
5. 不完整、乱序、断连或互相冲突的证据保持 `ongoing`。

真实 activity patch 开启新周期时，旧 terminal 元数据不能压住 active。实时 delta 与完整 snapshot 复用同一个 active-exit 转换器，转换器自身识别 confirmed provenance，不依赖入口额外传参；未前进的旧 completed/interrupted/failed 统一保持 ongoing 并保留 baseline。终态通过门禁后关闭该周期，相同后续快照不得把完成反判为 inProgress，也不得把旧中断误判为 stopped。

## 稳定性与兼容

- 首次 active snapshot 与 terminal Turn 冲突时，复用 `[0,300,1000]` 单任务佐证；真实 patch、等待请求或新 Turn 立即取消抑制。
- 同 revision 的精确 started/定向 inProgress 是状态前进，只有严格更旧的 `startedAt` 被拒绝；不再使用 completed shape、跨时钟或 completedAt 必填阻断 live 事件。
- 单任务 Turn 复核只合并兼容模式；相同 active snapshot 复用一个 `[0,300,1000]` 周期。新 unread 事件、任务切换歧义、Activity epoch/映射或复核模式变化才取消旧复核并由新周期接管，旧异步结果不得清除或回写新周期。
- Activity Delta 每次发布递增 generation，完整 snapshot 携带已组装库存的 generation 屏障；严格更旧增量不得覆盖 snapshot。
- 完整 inventory 重建保留更强的精确 inProgress、confirmed terminal 与同 revision provenance。未知 key 只触发 urgent 结构复核，已知条目仍即时应用。
- 完整 inventory 同时保留 `app-server-live` 私有 evidence sequence；该序号不进入 Activity Delta、Host Snapshot、Renderer、存储或日志。
- 50/200ms 结构合并、5s/1s watchdog、15s 完整校对和 missing-key 隔离只保护证据/库存，不延迟已确认完成；missing-key 只保留缺失行，同批仍存在的任务状态立即发布。
- `task-state-v3` 是当前语义。v2/旧来源仍读取并发布 degraded 原子包，不清空任务或停止订阅。
- 旧 runtime/float `conversations` 别名只作一版兼容；当前消费者以 `taskState` 为权威。

## 残留矩阵收口

- 新会话模型仲裁与 RAW-046 对齐：普通 5 小时或周窗口只要实际返回 0 就切最高可用 Spark；缺失窗口不等于 0。普通池说明/读数先取正值 5 小时，再取周额度，不再把“普通周额度”误写为唯一门槛。
- 外观遵循 RAW-071 的独立 token 直存直渲；旧格式、对比度、配对色域、自动调色、Controller 暂态预览/提交/回滚 Action 均不是现行路径，兼容校验函数只返回非阻断结果。
- MQTT/Quick Jump 静态合同只核验对应 media/function 边界，允许等价格式化；跨区块或跨函数正则不能作为行为失败。
- 全量失败必须按真实缺陷、过期契约或测试误报归因并清零，不再以“既有/已知失败”作为交付状态。

## 非目标与风险门禁

- 不重做外观展示形式、项目移除或整个 EyPc 架构；仅清除已确认的旧外观门禁和模型策略偏差。
- 未授权真实 Codex/uTools 写操作；除已定义的项目移除事务外，Codex 原生状态保持只读。
- 实现接受仍需用户重载真实 uTools 并验收 stopped↔active、普通/中断恢复 active→completed-unread 及任务切换。
