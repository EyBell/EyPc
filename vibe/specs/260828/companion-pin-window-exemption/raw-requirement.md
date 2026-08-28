# RAW-185：置顶任务豁免活动时间窗，且循环可达必然列表可见

Tool: claude · Date: 2026-08-28 · Level: Standard（需求）

## 用户原话

> 图 1 里面没有体现图 2 中置顶的 WT-WX 任务，但是「上一个」、「下一个」会在这两个任务里面去循环。
>
> 你核验一下：1. 相关的本地日志；2.「上一个」、「下一个」快捷键触发的缓存列表，看是不是哪个地方有问题。并且这个制定的任务为什么没有展示在悬浮卡片里面？

追加（用户自行定位后）：

> 找到问题了 是因为它超过了这个时间限额 但是它确实是置顶项 那如果他是置顶的话 应该也可以豁免这个时间长度的限额

再追加（看到首版修复后）：

> 重复了 只需要一个置顶归类就行了 位置状态的 如果它属于置顶 也归到置顶里面

## 核验证据

### 1. 本地运行日志

`~/Library/Application Support/uTools/eypc-diagnostics/runtime-1787905299440-1.jsonl`（375 行，进程 76646）。22 条 `task-kernel/shortcut-enter` 全部为 `featureCode: eypc-codex-task-previous`，且**每一条**的 details 都是：

```
"cycleCount":2,"inputCount":0,"completedUnreadCount":3
```

同窗口的 22 条 `navigation/claude-open` 只在两个 `taskRef` 之间交替（`h:d5dd47ae55e119ed` / `h:d0d8ce2c7f6a2e60`），与「只在两个任务里循环」的报告逐条吻合。`completedUnreadCount = 3` 对应 Float 置顶分组里的 3 条（该入口队列为「已完成未读 + 已完成已读的置顶」拼接，未读为 0），因此环里的 2 条**不是**那 3 条置顶项。

### 2. 循环缓存列表的构造

[buildViews](../../../../preload/companion/task-kernel.cjs#L731)：`cycleKeys` = 可见且 `capabilities.open` 且 `cycleTier !== 'none'` 的任务，按层序拼接。两个派生函数对同一条任务给出了**互相矛盾**的判定：

- [derivedCycleTier](../../../../preload/companion/task-kernel.cjs#L597)：`if (task.localPin && !(task.phase === 'completed' && !task.unread)) return 'fallback'` —— 置顶项进入 `fallback` 层，**从不查活动时间窗，也不排除 `unknown` 相位**。
- [derivedDynamicGroup](../../../../preload/companion/task-kernel.cjs#L616)（改动前）：`if (!task.dynamicEligible && !(stopped && planReady)) return 'none'` 以及 `if (task.phase === 'unknown') return 'none'` —— 同一条置顶项**既被时间窗淘汰，也被 unknown 相位淘汰**。

于是「置顶 + 非（已完成已读）」的任务同时满足「在环里」与「不在任何分组里」，`上一个/下一个` 一直落在一条列表任何页签都不显示的任务上。

### 3. 涉事任务的真实数据

`~/Library/Application Support/Claude/claude-code-sessions/<org>/<user>/local_8311dc39-….json`（`title` 为 `260826-WT-WX-稍后读内容库调研`）：`createdAt = 1787703790547`（2026-08-26），首次触发按键时刻 `1787905363174`，相距约 **56 小时**，超过 [dynamicTaskWindowHours 默认 48](../../../../preload/companion/task-kernel.cjs#L813) 的窗口 → `dynamicEligible = false`。用户截图同时显示该行相位为「状态未知」。**两条淘汰路径同时成立**，因此只补时间窗豁免仍不足以让它出现。

补充（澄清，非缺陷）：该会话的 `isStarred: true` 是 Claude App 自己的 Pinned，EyPc 全仓无 `isStarred` 读取，两套置顶互不同步；EyPc 侧的置顶是本地偏好，正是它让这条任务进了 `fallback` 层。

### 4. Float 的「状态未知」分区本就存在

[FloatApp.vue](../../../../src/FloatApp.vue#L464)：`const unknownTasks = statusGroups.stopped.filter((task) => task.companionPhase === 'unknown')`，并渲染 `{ key: 'unknown', title: '状态未知' }` 分组。没有任何 `unknown` 相位任务能进入 `stopped` 组，该分区因此是永远为空的死代码。首版修复曾试图用它承载置顶的 `unknown` 任务，被用户以「重复」否决；最终方案让置顶分组独占该落点，该分区回到恒空。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md#L250](../../PRODUCT_REQUIREMENTS.md#L250)（置顶语义与时间窗豁免）、[PRODUCT_REQUIREMENTS.md#L251](../../PRODUCT_REQUIREMENTS.md#L251)（循环层序并集）、[shared-raw-183](../../requirements/shared-raw-183.md#L1)（置顶＝暂存待查）、[shared-raw-182](../../requirements/shared-raw-182.md#L1)（层序并集与角标可达性）、[codex-raw-155](../../requirements/codex-raw-155.md#L1)（层序）。

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | 时间窗豁免范围（PRD L250 / RAW-183） | 由「仅置顶且已完成已读」扩为**任何相位的本地置顶任务**。窗口只淘汰未置顶的工作 |
| added | `unknown` 相位置顶项的落点 | `unknown` 自身不挣得分组，置顶的 `unknown` 任务因而没有可留守的状态组，直接归入置顶分组 |
| added | 对称不变式 | 凡进入 `cycleKeys` 的任务必须在某个动态分组可见。RAW-182 立的是「角标里有＝循环能到」，这是它的反面 |
| added | 单一落点不变式 | 每个任务恰好出现在一个动态分组里。首版把置顶的 `unknown` 放进 stopped 组，用户当场看到同一条任务出现两次，「重复」正是置顶要消除的东西 |
| changed | 置顶分组成员（RAW-183） | 由「本地置顶 + 已完成 + 已读」扩为「本地置顶且没有属于自己的状态组」，即再加上 `unknown` 相位；有自己状态组的置顶项仍留在各自状态组 |
| unchanged | 层序与退出规则（RAW-182/183） | 层序并集、环冻结、游标归属不变；只有已完成已读的置顶项退出通用循环 |
| unchanged | 角标计数口径 | 置顶是位置不是角标，三个计数不变 |
| unchanged | 未置顶任务的时间窗 | 未置顶任务过窗照旧从动态页消失；未置顶的 `unknown` 相位任务仍不进入任何分组与环 |

`decision`：`explicit-current-request`（用户明确要求置顶豁免时间窗；`unknown` 落点与不变式是让该要求真正生效所必需的最小补齐，已在本文件写明）。

`residual_tradeoff`：置顶一条永不过期的任务，会让它长期占据动态页与通用循环的一个位置——这正是「暂存待查」的定义，取消置顶即可移除。「状态未知」分组自此可能出现内容（此前恒空），但仅限置顶项。

## 实现

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L616) `derivedDynamicGroup`：

```js
if (!task.localPin && !task.dynamicEligible && !(task.phase === 'stopped' && task.planReady)) return 'none'
if (task.phase === 'running') return 'active'
if (task.phase === 'unknown') return task.localPin ? 'pinned' : 'none'
```

首版曾把这条写成 `? 'stopped'`，让 Float 已有却一直为空的「状态未知」分区来承载。用户立刻指出那是重复：同一条置顶任务在动态页出现了两次。`unknown` 没有属于自己的状态组，所以置顶分组就是它的唯一落点——这也顺带把「每个任务恰好一个分组」补成了显式不变式。Float 的「状态未知」分区因此重新回到恒空状态（渲染层未改动，`if (!tasks.length) return []` 使它不产生任何行）。

[scheduleVisibilityTransition](../../../../preload/companion/task-kernel.cjs#L1178) 跳过置顶任务：窗口不再对它作判定，那个到期时刻也就不再是一次需要唤醒的可见性切换。

## 验证

见收尾回复的核验状态。
