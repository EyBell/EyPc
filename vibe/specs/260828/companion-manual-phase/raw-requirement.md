# RAW-187：状态未知任务允许手动指定状态

Tool: claude · Date: 2026-08-28 · Level: Standard（需求）

## 用户原话

> 优化一下状态图标位置的点击效果：1. 触发机制：点击时不要单单触发多选效果，而是可以直接触发状态更新。2. 状态更新逻辑：(a) 在状态未知的情况下，可以手动将其更新为其他正常状态。(b) 如果后续仍保持未知状态，则一直使用这个手动指定的正常状态。(c) 如果后续变成了其他正常状态，则不再以手动指定的这个状态为准。

> 操作交互方式变一下 CTRL+点击可以去切换这个状态 , 普通点击的逻辑不变

> 不光是这个CTRL 要自动根据系统 保留我的这种兼容操作 command/ctrl

## 用户裁决

| 问题 | 选项 | 裁决 |
| --- | --- | --- |
| 手动状态是否跨重启保留 | 进程内 / 持久化 | **持久化保留**（需修订 PRD L267 登记条款） |
| 目标状态怎么选 | 菜单 / 循环 / 固定 | **弹出菜单** |
| 触发方式 | 普通点击改状态 / 修饰键改状态 | **修饰键改状态，普通点击维持多选**（第二条消息推翻首轮选择） |
| 修饰键 | 仅 Ctrl / 按系统适配 | **Cmd 与 Ctrl 同时接受** |

## 核验证据（只读，来源为本仓源码）

1. Cmd/Ctrl+点击在 Float 行里**已有既定语义**——追加多选：[FloatApp.vue#L1811](../../../../src/FloatApp.vue#L1811) 行主体、[#L1820](../../../../src/FloatApp.vue#L1820) 标题、[#L1784](../../../../src/FloatApp.vue#L1784) 状态按钮走的 `selectTask`。因此本条存在真实手势冲突，已把冲突面收窄到「状态未知行的状态图标」这一处。
2. 分组由 Kernel 的 `taskPackage.views.groups` 决定，不是渲染层投影。覆盖若只落在投影层，会得到「图标变了但仍留在原分组」的分裂（同 [ring-reachability-outlives-list-visibility](../../../knowledge/error-memory/ring-reachability-outlives-list-visibility.md#L1)）。故覆盖落在 Kernel 的 `finalizeTask`——每个任务的必经点。
3. 跨平台不按系统分支：仓库既有惯例是 `ctrlKey || metaKey` 双收。外接 PC 键盘、远程会话改写修饰键、平台探测出错三种情况下，分支实现都会让手势静默失效，双收不会。
4. `preload/index.js` 有入口预算棘轮，且 **HEAD 已超标**（14036 行 > 预算 13935，+101）；本轮不擅自改预算数字。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md#L267](../../PRODUCT_REQUIREMENTS.md#L267)（唯一可持久化的任务侧本地配置）、[shared-raw-185](../../requirements/shared-raw-185.md#L1)（置顶与状态未知的落点）、[claude-raw-007](../../requirements/claude-raw-007.md#L1)。

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| changed | **PRD L267 可持久化本地配置** | 由「置顶、隐藏、折叠、alias」四项扩为五项，新增手动指定相位。这是用户明确裁决的条款变更，非实现顺带 |
| added | 手动相位的适用条件 | 仅 `unknown` 行可指定；已有真实证据的行由 Kernel 直接拒绝（`errorCode: phase-known`），不允许伪造状态 |
| added | 退休语义（episode 判据） | 手动值只在**设定时所处的那一段未知**内有效：`statusEnteredAt <= manualPhaseSetAt`。任务离开未知再回来即失效，不复活旧答案，且热路径无写入、无需清理 |
| added | 证据推理与展示分离 | 新增 `canonicalPhase` 保存证据原值；一切**关于证据**的判断（首推 unknown 宽限窗）读它，`phase` 只承载展示口径 |
| added | 手势 | `Cmd/Ctrl+点击`状态未知行的状态图标打开状态菜单；其余点击与其余行为一律不变 |
| unchanged | 多选 | 行主体、标题的追加多选与 `Space` 入口逐字不变 |

`decision`：`explicit-current-request`。

`residual_tradeoff`：状态未知行的状态图标上，`Cmd/Ctrl+点击`不再追加多选——那一处让位给状态菜单。该行的多选仍可用 `Space`、右键抽屉、以及行主体/标题的 `Cmd/Ctrl+点击`，因此入口未丢，但肌肉记忆在这个 14px 控件上确实改变了。已知相位的行完全不受影响。

## 实现

- [task-phase.cjs#L36](../../../../preload/task-phase.cjs#L36)：`MANUAL_TASK_PHASES` 由 `TASK_PHASES` 派生，排除 `unknown`。
- [task-kernel.cjs#L674](../../../../preload/companion/task-kernel.cjs#L674)：`canonicalPhase` 保值 + episode 判据下的单点应用；[#L1713](../../../../preload/companion/task-kernel.cjs#L1713) 宽限窗改读 `canonicalPhase`；新增 `set-manual-phase` 命令（先持久化后打补丁）。
- [index.js](../../../../preload/index.js#L10555)：持久化回灌与写入；两个草稿构造点透传 `manualPhase / manualPhaseSetAt`。
- [commandModifier.ts](../../../../src/ui/commandModifier.ts#L1)：`hasCommandModifier` 具名 owner，双键接受。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1289)：状态选项并入既有抽屉菜单；状态图标手势与提示文案。
- [codexController.ts#L2326](../../../../src/runtime/codexController.ts#L2326) 与 [appRuntime.ts#L9533](../../../../src/runtime/appRuntime.ts#L9533)：动作与命令派发。

## 验证

见收尾回复的核验状态。
