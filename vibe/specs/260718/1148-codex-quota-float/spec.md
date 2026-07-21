# Codex Companion 真实会话与交互规范

Tool: codex
Date: 2026-07-21
Status: `accepted`
Documentation level: `controlled`
Requirement version: `2026-07-21.3`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Execution Authority

- Control plane: `app-root`；实现、风险判断、真实归档验收和最终接纳均由主线程负责。
- Sidecar: 本次实现阶段已使用两个只读原生 Agent 映射 Host/Renderer seam；所有写入和验收由主线程完成。
- High-risk boundary: 不写 Codex 原生状态文件，不操作用户现有任务，不模拟桌面 UI 删除；真实验收只创建专用临时任务。

## Superseding Decision

本规范取代旧版 recent-100、三页签、顶部样式工具栏和“单额度装饰环”合同。交互修订 3 保留常显短字符与自避让批量栏，重新要求 200ms/500ms 不透明说明卡、Space 选中后下移、单项/批量动作分离、六页签和 200ms 待输入活动通道。保留既有 Codex CLI/App Server 启动、环境诊断、uTools 子窗、显示器几何、macOS all-Spaces、主题、隐私、真实库存和归档安全协议。

## Current Requirement And Implementation Map

| 领域 | 当前合同 | 实现与证据 |
| --- | --- | --- |
| 原生项目状态 | 只读解析 `$CODEX_HOME/.codex-global-state.json` 的项目、项目/置顶顺序、任务归属和 projectless 列表；主文件无效时才用 `.bak` | [preload/index.js](../../../../preload/index.js#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) |
| 完整任务库存 | 完整分页读取 `archived=false`；归属优先 native assignment、Chats、最深有效 cwd，其他任务排除 | [preload/index.js](../../../../preload/index.js#L1)、[codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) |
| 严格时间/完整性 | 最新 Turn 必须存在有效 `startedAt`；滚动窗口 1–365 天、默认 30 天、边界包含；项目指纹变化重试一次，仍变化则不发布伪完整数据 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 六页签与状态优先级 | `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`；动态页按待输入、当前动态、已完成未查看分段；所有任务页按最新提问时间严格倒序 | [codex.ts](../../../../src/domain/codex.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 原生项目视图 | `Pinned / Projects / Chats` 遵循 Codex 原生置顶、项目顺序和归属，不重复任务，并保留空项目 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 本地元数据 | 恢复最后页签/项目折叠，支持别名、本地置顶顺序和“从 EyPc 移除”；搜索词、焦点、选择和确认态不跨重启 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 紧凑水球 | 不再显示悬浮小详情；中心只显示最近重置的真实额度；Weekly 存在时显示 5px 完整轨道与剩余圆弧 | [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 展开布局 | 六页签直接位于顶部，其下依次是统一搜索、服务端真实额度文字和任务内容；删除旧顶部样式/隐藏/刷新/设置/关闭工具栏 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1) |
| 即时活动通道 | App Server 状态通知立即投影，单飞轻量列表正常每 200ms 复核，连续三次失败退避 1s；结构变化才触发完整快照 | [preload/index.js](../../../../preload/index.js#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 选择与快捷键 | 常显短字符固定按钮、同槽确认、Space 新增选择后下移、自避让批量栏、单/批量抽屉、右键、F Quick Jump 与全局卡片激活 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1) |
| 原生归档 | 短期 action alias + 预期版本 + 项目指纹；单条重读后归档并在 false/true 两侧确认；项目归档忽略显示窗口、20 条一批、并发 2、逐项保留失败 | [preload/index.js](../../../../preload/index.js#L1)、[codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) |

## Host Snapshot V2 Contract

- Host V2 只在原生状态解析、完整 `archived=false` 分页、每个候选最新 Turn 和扫描前后项目指纹全部成立时标记 `completeness=verified`。
- 读取项目状态时只 allowlist `local-projects`、项目顺序、置顶顺序、`thread-project-assignments` 和 `projectless-thread-ids`。不得写入该文件，也不得扫描 SQLite、LevelDB、Turn items 或会话正文。
- 项目归属优先级固定为：原生 assignment；原生 projectless → `Chats`；有效项目根的最深 cwd；否则视为 Codex 侧已移除或未注册并排除。
- `thread/list` 使用 `archived=false` 完整翻页，游标异常、循环、超出安全上限均使本次扫描失败。零 Turn 条目计入 `nonConversationCount`，但不进入会话投影。
- 每条候选使用 `thread/turns/list(limit=1, sortDirection=desc, itemsView=notLoaded)`；存在 Turn 却缺少 `startedAt` 时整批失败，不以 `recencyAt` 或 `updatedAt` 回退。
- 扫描开始与结束指纹不同则完整重试一次。第二次仍变化或项目状态不可读时，Controller 保留上一份已验证快照并标记 stale；无旧快照时展示错误空态。
- Renderer 只接收匿名任务/项目 key、短期 action alias、匿名项目描述、原生顺序、统计数和 SHA-256 来源指纹；不接收原始 ID、路径、项目根、cursor 或私有状态对象。

## Conversation Projection V3

- `timeWindowDays` 默认 30，可配置 1–365；边界 `lastTurnStartedAt >= now - days×24h` 包含。
- `全部`：窗口内全部未归档会话；本地隐藏项仍显示隐藏标记。
- `待输入`：窗口内所有 `waiting-input` 会话，包括本地隐藏行；它是快速处理入口，不改变真实归属或隐藏状态。
- `动态`：原 `进行中` 页签的持久化 ID 仍为 `ongoing`，内部依次展示非隐藏的`待输入 / 当前动态 / 已完成未查看`；每段各自保持最近提问时间倒序。
- `已隐藏`：EyPc 本地隐藏的窗口内会话，保留真实状态。
- `已完成`：非隐藏、非 active 且最新 Turn completed。
- `项目`：同一窗口内会话按原生结构投影。`Pinned` 先原生置顶会话，再原生置顶项目，再追加带“本地”标记的 EyPc 置顶项；`Projects` 包含其余原生项目和空项目；`Chats` 只含原生 projectless 会话。
- 所有任务数组以 `lastTurnStartedAt desc`、匿名 key asc 为唯一稳定顺序。搜索匹配别名、原名和项目名，只过滤当前页签，不改变顺序；项目名命中时展示该项目全部窗口内任务。

## UI And Local State

- 第一次使用默认 `动态`（内部稳定 ID `ongoing`）。保存最后页签、项目折叠状态、1–365 天窗口、任务/项目别名、本地置顶顺序和本地移除项目集合。
- 持久化只使用散列任务 key 和稳定项目指纹；不得持久化原始 thread/Turn ID、项目路径、action alias 或任务列表。
- 原生项目/置顶顺序只读。本地置顶可通过操作与 `Alt+↑/↓` 调整；别名只改显示和搜索，排序、归属、归档仍使用真实身份。
- “从 EyPc 移除”只写插件本地抑制状态，并提供“恢复项目”。检测到某项目在 Codex 中 absent→present 后自动清除本地抑制；不得把该操作命名或表现成 Codex 原生删除。
- 水球 pointer enter 直接展开，不再显示迷你详情。中心选择实际 quota 中 `resetAt` 最近的窗口；Weekly 存在时才绘制清晰的 5px 全轨道和剩余百分比圆弧。文字背景透明。
- 展开额度区只渲染 App Server 实际返回的“5 小时限额”和“周限额”。当前只有 Weekly 时，水球和卡片均不得伪造 5 小时额度。
- 收起态左上角仅在非零时以红色文字显示待输入数；右上展示当前动态数，下一行展示已完成未查看数，超过 99 显示 `99+`。待输入仅一项时点击直接打开，多项时点击打开待输入页；悬浮待输入数 200ms 也打开该页。
- 任务整行悬浮 500ms 后显示不透明详情卡，含项目、真实状态、最后提问绝对时间和归档能力；状态按钮与每个短字符操作悬浮 200ms 后显示不透明说明。这些说明由子窗本地渲染，不挂载主程序 `OperationTooltipLayer`，也不使用原生 `title`。

## Selection, Operations And Shortcuts

- 任务行固定显示 `开 / 名 / 顶 / 隐（或显）/ 归`，项目行固定显示 `名 / 顶 / 归 / 移`。每槽点击区至少 32px，不使用圆点、图标、hover 展开、宽度动画或行布局位移；不可用动作仍保留禁用槽位。非破坏性按钮中性、激活置顶强调、归档红色、本地移除橙色。
- Codex 悬浮子窗不挂载 `OperationTooltipLayer`，其水球不再显示额度气泡，也不使用原生 `title`。任务、状态和短字符动作使用子窗自有的不透明延时说明卡；完整 `aria-label`、`aria-pressed` 与键盘焦点环继续存在，主程序其他功能的统一 Tooltip 不受影响。
- 需要确认的动作第一次进入 5 秒待确认态，第二次点击相同位置或再次按相同快捷键才执行；`Escape`、外部点击、切换页签和超时均取消。
- 任务整行左键点击直接打开；只有左侧选择槽、Ctrl/Cmd/Shift 选择或高亮项 Space 才改变选择。Space 新增任务选择后移动高亮并滚动到下一项，取消选择保持原位；项目标题 Space 选择可见子项后也下移。搜索、页签或刷新改变可见集合时清理不可见选择。
- 可见选择达到两项时自动显示 `已选 N / 归 / 操 / 清` 绝对浮动批量栏；锚点在列表下半区时置顶，否则置底，并在选择、焦点、滚动和尺寸变化时重算。批量栏提供滚动安全区，但不改变任务 DOM 顺序、行坐标或列表高度；不足两项即关闭。
- 同一页只有一个高亮项。方向键移动后进入键盘所有权，鼠标静止不改变高亮；鼠标再次实际移动后恢复鼠标所有权。右键与 `Ctrl+→` 打开同一完整操作抽屉；抽屉内上下键只移动动作，Enter 或 `Ctrl+1…9` 执行。
- 单项动作可包含打开、详情、别名、置顶、隐藏和归档；批量动作只包含可逐项定义的归档、隐藏/恢复、置顶/取消置顶和清空选择，不展示打开或编辑别名。
- 默认 Codex 域：`↑/↓`、`Space`、`Enter`、`Ctrl+←/→`、`Delete`、`F2`、`Ctrl+P`、`Alt+↑/↓`、`Ctrl+F`、`Ctrl+R`、`Ctrl+1…9`、`F/Shift+F` 和 `Escape`。全局 `codex.float.activate` 默认 `Ctrl+Alt+Enter`，uTools 静态入口可直接显示、展开并聚焦卡片。输入框保留原生编辑键；冲突只在同一功能域与交互层判定。
- 悬浮子窗口接收 Runtime 已解析命令，而不是自行重新解释平台按键。
- 成功打开完成未查看任务后，Controller 推进当前完成版本的本地已查看水位并立即重新投影；打开失败不得推进。项目折叠先做本地乐观反馈再持久化，指针/焦点离开后的自动收起延迟约 100ms。

## Archive Safety Contract

- 单条归档请求只接受短期 action alias、预期任务 recency/version、最新 Turn `startedAt`/状态和 `sourceFingerprint`。
- Preload 重读项目指纹、thread 身份/状态/recency 和最新 Turn；任何缺失、变化、active、inProgress 或新版本均拒绝。通过后调用 `thread/archive`，再完整确认该 ID 从 `archived=false` 消失且出现在 `archived=true`；失败不从 UI 移除。
- 项目“全部归档”重新扫描该项目全部未归档历史，不受 30 天窗口影响。active 条目跳过；候选按每批 20、并发 2 逐项执行同样的双向验证。部分失败返回逐项匿名结果并保留失败行。
- App Server 没有 conditional archive 原语；重读通过后、写入前新活动开始仍是 provider-level TOCTOU 残余，不能被 UI 描述为原子保证。

## Acceptance Criteria

- 主文件/备份回退、完整分页、指纹重试、归属优先级、移除项目过滤、30 天边界、六页签倒序、200ms 活动通道、搜索、别名、置顶、迁移、快捷键域、二次确认、单/批量动作隔离、批量部分失败与归档双向验证有自动化覆盖。
- 380px 与 330px 宽度、键盘流程、Weekly-only、双额度、无额度、圆环对比、三角标、500/200ms 不透明说明、常显按钮无重叠/横溢、Space 选中后下移、批量栏上下避让且任务行零位移，以及 Pinned/Projects/Chats 顺序完成视觉核验。
- 专用临时任务真实执行 `archive → false/true → unarchive → true/false`，最终再次归档清理；不操作用户现有任务。
- `pnpm test`、`pnpm run typecheck`、`pnpm run build`、uTools runtime validation、真实只读预检、Markdown code-link audit 和 `git diff --check` 全部通过。

## Documentation Impact And Residuals

- Classification: `requirement-canonical + project-current + controlled-task`。
- 同步层：raw/spec/plan/tasks/verify/handoff、[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)、[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1) 和 [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)。
- 保留残余：跨 App Server 的 live authority、归档 TOCTOU、真实 Windows uTools/系统热键、真实 deep link、多显示器/DPI 和 macOS 多 Space 操作。它们不改变本轮真实库存、投影和归档协议验收。
