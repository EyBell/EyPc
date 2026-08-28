# RAW-182：快捷键任务循环的顺序稳定性与角标可达性

Tool: claude · Date: 2026-08-27 · Level: Standard（需求）

## 用户原话

> 优化一下快捷键触发的对应缓存池任务的执行顺序。
>
> 目前在执行过程中，发现存在以下问题：
> 1. 执行顺序可能会有跳动或变化。
> 2. 有时会出现任务丢失的情况：即使数字角标里有该任务，但在切换上一个或下一个任务时，会丢失跳转能力。
>
> 需要去核验一下整体的规则，以及全局缓存的能力。

后续两轮授权：先实现游标自愈与打开落游标（D-1/D-2），再实现层排他取消、环冻结与角标同源，并「自动加序号」补本条登记。

## 核验证据（只读，来源为本仓源码）

四条独立成因，全部由源码原文确认，不是推测：

1. **层排他**：[buildViews](../../../../preload/companion/task-kernel.cjs#L707) 只取 `attention → plan → active → fallback` 的**首个非空层**并 `break`。任一任务进入 `waiting-input`，环即从 N 条 `active` 坍缩成 1 条 `attention`，用户正在遍历的环在两次按键之间被整体替换。
2. **排序是活的**：`compareByLatestQuestion` 按 `lastQuestionAt` 倒序，每次发布重排；而**打开动作本身**会改变该字段，所以一次成功跳转就足以让下一次按键的下标含义变化。
3. **游标只在 `targets` 里自愈**：[navigation.sync](../../../../preload/companion/navigation.cjs#L268) 原先只在任务离开全量 `targets` 时清游标。游标留在 `targets` 却离开 `cycleKeys` 时既不清也不修，`indexOf` 恒为 `-1`，每次按键静默回落环首，用户位置丢失。
4. **角标与环不同源**：`counts.unread` 计入 `completed && unread`，而 `derivedCycleTier` 对该状态恒返回 `none`——角标数得到、循环永远到不了；`counts.input` / `counts.active` 又不过滤 `capabilities.open`，环却过滤。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md#L250](../../PRODUCT_REQUIREMENTS.md#L250)（通用循环层选择与候选来源）、[PRODUCT_REQUIREMENTS.md#L293](../../PRODUCT_REQUIREMENTS.md#L293)（进程游标与尾随合并）、[PRODUCT_REQUIREMENTS.md#L239](../../PRODUCT_REQUIREMENTS.md#L239)（角标以根任务状态为准）、[codex-raw-155](../../requirements/codex-raw-155.md#L1)（`attention → Plan → active → local pin` 分层）、[codex-raw-181](../../requirements/codex-raw-181.md#L1)（cycle 位置维持进程内）。

`visible_changes`：

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | 「首个非空层」（PRD L250 / RAW-155） | 层序保留为**优先级顺序**，取消其**排他性**：环是全部层按序拼接的并集，层内仍按最近提问时间倒序。冷游标下第一次按键仍落在最紧急任务，其余任务不再不可达 |
| changed | 通用循环候选集（PRD L250） | 新增 `unread` 层（位于 `active` 与 `fallback` 之间），使已完成未读根任务可被通用循环到达；其专用入口与独立未打开进度不变 |
| added | 一次连续 walk 的环冻结 | 一次 walk 持有它开始时的环 `CYCLE_WALK_HOLD_MS`（4 秒，按键续期），期间发布重排不改变正在遍历的环；walk 失效后下一次按键采纳最新环 |
| added | 游标出环自愈 | 游标仍在 `targets` 却离开环时，按旧环次序就近改锚到幸存邻居并记录改锚侧，使前后方向仍分别解析为原后继与原前驱 |
| changed | 在途连按合并语义（PRD L293） | 原实现在途期间每次按键都从**未推进**的已确认游标重算，因而全部选中同一目标，5 连按只前进 1 格。改为按逻辑游标累进：N 次按键前进 N 格、只派发最终尾随目标；推进后回到正在打开的目标时不重复调用 Provider。这是把 "final trailing target" 落到字面，而非新增语义 |
| changed | 游标提交口径（PRD L293） | 进程游标不再为循环按键独占：任意一次落在环内的确认打开都接管游标；落在环外的打开不提交，避免造出不可达位置 |
| changed | 角标计数口径（PRD L239） | 三个角标统一加 `capabilities.open` 过滤，与环使用同一判据，使「角标里有」等价于「循环能到」 |
| unchanged | cycle 位置只在进程内（RAW-181） | 游标、环与冻结窗口全部为进程内状态，不落盘 |
| unchanged | 专用入口独立进度（PRD L250） | `attentionSeen` 未被触碰；待输入/已完成未读入口的未打开进度与游标互不影响 |

`decision`：`explicit-current-request`（用户两轮明确授权实现，并授权自动分配本条编号）。

`residual_tradeoff`：walk 进行中新到达的待输入任务要等本次 walk 失效（≥4 秒无按键）才进入环。这是「遍历中途不被换环」的直接代价，已在产品文档写明。

## 验证

聚焦自动化：`tests/platform/` 全量 + companion 域投影 `761/761`；新增/更新断言覆盖层序并集、unread 可循环、环冻结与失效后采纳、游标出环改锚双向、环内/环外打开的游标归属。构建门禁 `pnpm run build`（含 `validate:contracts`、`vue-tsc`、`validate:utools`）通过。合流后全仓聚焦复测 `1209/1209`（88 文件）。

**真机验收（2026-08-27，用户执行）：** 用户在真实 uTools 宿主试用后确认「测试可以了」，本条 `host-pending` 关闭为 `host-accepted-2026-08-27`。验收覆盖前后任务切换的顺序稳定性与连按手感；未逐项回报单条指标，故此处只记录用户的整体接受结论，不代为宣称分项数据。
