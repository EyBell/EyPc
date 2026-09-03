# RAW-206：Cursor Plan 模式会话纳入库存并把阻塞待决展示为待输入

Tool: claude · Date: 2026-09-03 · Level: Standard（需求）

spec_id: SPEC-260903-CURSOR-PLAN-MODE-SESSIONS

> 编号说明：本任务在 worktree 上以 RAW-205 起草；合回 `main` 时并行会话已用 RAW-205 登记「置顶双向同步」（`shared-raw-205`），本任务改号 RAW-206，条款内容不变。

## 用户原话

> 核验一下当前 Cursor 相关任务的识别度 为什么正在进行中的 Cursor 任务没有体现在本插件内？进行本机核验 有结果了告知我
> 并且plan模式里面有对话的话 应该也要展示为待输入 可以一键跳转

核验后用户裁决 `F-1-a`：纳入 `plan`（仍排除 chat / ask / edit / subagent / cloud），进行中以钩子 `turnOpen` 为准，冷读 `status=completed` 不压过开着的 Turn。

## 核验证据（只读，本机 Cursor 3.18.25）

1. 截图里那条进行中的会话在 Cursor 库里是 `ec662980-…`（GoNavi 工作区，名字已被会话标题钩子改成「260903-供应商编辑收缩核验计划」），`composerHeaders.value.unifiedMode = plan`。
2. [isInventoryRow](../../../../preload/cursor/inventory.cjs#L107) 只收 `unifiedMode = agent`（[260818 可行性裁决](../../260818/1335-cursor-companion-feasibility/raw-requirement.md#L14)），Plan 会话整条不进库存；钩子队列里它的 `beforeSubmitPrompt(m=plan)` 与 135 条工具事件一直在到达，但没有任务可挂。
3. 该行 `unfinishedRunAt` 为空、磁盘 `status` 在 `completed` / `aborted` 间变化——Plan 模式运行时 Cursor 不写 `unfinishedRunAt`，进行中只能靠钩子 `turnOpen`。
4. Cursor 自己的「需要你决定」标记是 header 的 `hasBlockingPendingActions`：workbench 里 `IXg()` 用它（或待决组里的 `RUN_TERMINAL_COMMAND_V2`、`getIsBlockingUserDecision`）判定会话需要用户处理；Plan 模式的提问走 `AskQuestion` 工具，等待回答期间该标记为真。EyPc 此前把它映射成 `unknown` / `exact:false`。
5. 非归档会话 `unifiedMode` 分布：agent 130、chat 66、plan 8（近 7 天 3 / 0 / 1）。

## 输入规范化边界

只多读 `unifiedMode` 一列（已在白名单 SQL 中）；仍不读对话正文、`conversationState`、`queueItems` 或任何 bubble 内容。

## 规范化需求

1. 库存白名单从 `unifiedMode = agent` 放宽为 `agent | plan`；`chat`、`ask`、`edit`、subagent 与 cloud 行仍排除。库存行携带 `unifiedMode`。
2. 钩子脚本与队列归一器接受 `composer_mode = plan`（保留 `plan` 作为 mode 值），`ask` / `edit` 仍丢弃。
3. `hasBlockingPendingActions = true` 视为精确的 `user-input` 交互：V7 观察 `interactionKind = 'user-input'`、`exact` 不再因它降级；渲染域 `resolveCursorAgentPhase` 把它放在最前，压过开着的 Turn，与 Claude 的待输入同序。仍不发明 `waiting-approval`（Cursor 在这一层不区分审批与提问）。
4. 待输入的一键跳转沿用现有 Cursor deeplink（`cursor://anysphere.cursor-deeplink/agent?id=<composerId>`），不新增打开路径。
5. 进行中：钩子 `turnOpen` 或子跑 / 自身 `unfinishedRunAt` 为准；磁盘 `status` 不压过开着的 Turn（既有规则，本条只确认覆盖 Plan 会话）。

## 需求变更评审

`scanned_owners`：[260818 可行性 raw](../../260818/1335-cursor-companion-feasibility/raw-requirement.md#L14)（只纳 agent）、[260818 spec](../../260818/1335-cursor-companion-feasibility/spec.md#L83)（身份口径）、[PRODUCT_REQUIREMENTS 三来源条款](../../PRODUCT_REQUIREMENTS.md#L238)。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| changed | 库存范围「只纳本机 Agent 模式」 | 扩为 agent + plan；chat / subagent / cloud 排除不变 |
| added | 阻塞待决 = 待输入 | `hasBlockingPendingActions` 从 unknown 改为精确 user-input 交互 |
| unchanged | 不发明 waiting-approval；深链不构成已读；归档只看状态 | 原样 |

`conflict_candidates`：无。`decision_status`：`explicit-current-request`（用户 2026-09-03 裁决 F-1-a 并补充「plan 里有对话展示为待输入、可一键跳转」）。
