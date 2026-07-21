# Codex Companion 真实会话与交互规范

Tool: codex
Date: 2026-07-21
Status: `accepted`
Documentation level: `controlled`
Requirement version: `2026-07-21.5`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Execution Authority

- Control plane: `app-root`；实现、风险判断、真实归档验收和最终接纳均由主线程负责。
- Sidecar: 本次实现阶段已使用两个只读原生 Agent 映射 Host/Renderer seam；所有写入和验收由主线程完成。
- High-risk boundary: 不写 Codex 原生状态文件，不操作用户现有任务，不模拟桌面 UI 删除；真实验收只创建专用临时任务。

## Superseding Decision

本规范取代旧版 recent-100、三页签、顶部样式工具栏和“单额度装饰环”合同。交互修订 5 保留六页签、200ms 活动通道、自避让批量栏、完整操作抽屉和真实归档，新增普通/Spark 额度 V2、`quota-auto`、新会话编辑器、Codex profile `Ctrl+T`、纯 Shift 白名单预览、浮窗本地暂态层，以及水球上半区角标安全/下半区 hover 展开的命中合同；同时删除常显短字符操作轨、普通 hover 详情/说明卡、角标 hover 展开和整行单击打开。保留既有 Codex CLI/App Server 启动、环境诊断、uTools 子窗、显示器几何、macOS all-Spaces、主题、真实库存和归档安全协议。

## Current Requirement And Implementation Map

| 领域 | 当前合同 | 实现与证据 |
| --- | --- | --- |
| 原生项目状态 | 只读解析 `$CODEX_HOME/.codex-global-state.json` 的项目、项目/置顶顺序、任务归属和 projectless 列表；主文件无效时才用 `.bak` | [preload/index.js](../../../../preload/index.js#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) |
| 完整任务库存 | 完整分页读取 `archived=false`；归属优先 native assignment、Chats、最深有效 cwd，其他任务排除 | [preload/index.js](../../../../preload/index.js#L1)、[codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) |
| 严格时间/完整性 | 最新 Turn 必须存在有效 `startedAt`；滚动窗口 1–365 天、默认 30 天、边界包含；项目指纹变化重试一次，仍变化则不发布伪完整数据 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 六页签与状态优先级 | `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`；动态页按待输入、当前动态、已完成未查看分段；所有任务页按最新提问时间严格倒序 | [codex.ts](../../../../src/domain/codex.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 原生项目视图 | `Pinned / Projects / Chats` 遵循 Codex 原生置顶、项目顺序和归属，不重复任务，并保留空项目 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 本地元数据 | 恢复最后页签/项目折叠，支持别名、本地置顶顺序和“从 EyPc 移除”；搜索词、焦点、选择和确认态不跨重启 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 额度 V2 与紧凑水球 | 普通 5 小时正余额→普通周正余额→最高正余额 Spark；Spark 显示 `S`，环跟随同池周额度；缺失窗口不伪造 | [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)、[codexNewThread.test.ts](../../../../tests/domain/codexNewThread.test.ts#L1) |
| 水球收起态命中区 | 上半区不因 hover 展开并保留三角标直接点击；下半区 hover 立即展开；显式点击/键盘激活仍有效，触屏不模拟 hover；横向卡片保留表面 hover 展开 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 展开布局 | 六页签直接位于顶部，其下依次是统一搜索、服务端真实额度文字和任务内容；删除旧顶部样式/隐藏/刷新/设置/关闭工具栏 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1) |
| 即时活动通道 | App Server 状态通知立即投影，单飞轻量列表正常每 200ms 复核，连续三次失败退避 1s；结构变化才触发完整快照 | [preload/index.js](../../../../preload/index.js#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 默认模型与新会话 | `quota-auto`、普通首选模型、Spark 自动切换、冻结/刷新确认模型、瞬时 `thread/start → turn/start → Deep Link` 与失败清理 | [codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1)、[preload/index.js](../../../../preload/index.js#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 选择、Shift 与快捷键 | 单击选择、双击/Enter 打开、项目仅 `＋`、右键完整抽屉、纯 Shift 白名单预览、浮窗本地 layer/input-role、可改键 `Ctrl+T` 与过滤后的 Quick Jump | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1) |
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
- 水球不再显示迷你详情。收起态上半区是角标安全区，pointer enter/move 不展开；只有指针进入下半区才立即展开。球体显式点击和键盘激活仍可展开，触屏不模拟 hover。中心依次选择普通 5 小时正余额、普通周正余额、最高正余额 Spark；两个普通窗口均无正余额时才展示 Spark。Spark 中心在百分比上方显示 `S`，Weekly 环只跟随当前同一额度池。文字背景透明。
- 展开额度区只渲染 App Server 实际返回的普通与 Spark 窗口。只有 Weekly 时不得伪造 5 小时额度；缺失窗口不视为 0，也不得触发模型自动降级。
- 收起态左上角仅在非零时以红色文字显示待输入数；右上展示当前动态数，下一行展示已完成未查看数，超过 99 显示 `99+`。待输入仅一项时点击直接打开，多项时点击打开待输入页；三个角标都保持直接点击，hover 不切页也不展开。
- 普通 hover 不显示任务详情或操作 Tooltip。按住纯 Shift 才显示不抢焦点的只读预览；悬停会话优先、键盘高亮兜底，Shift+↑/↓ 接管目标，真实鼠标移动后恢复悬停所有权。预览只含名称/原名、项目、状态/活动标记、允许的时间/耗时、来源、隐藏/置顶和归档能力；正文、摘要、raw ID、cwd 与路径永不读取或展示。

## Selection, Operations And Shortcuts

- 项目行只常显 `＋`，每次都打开新会话编辑器；任务行不常显操作轨。新建、选模新建、打开、详情、别名、置顶、隐藏、归档和项目操作统一进入右键或 `Ctrl+→` 的完整抽屉；禁用原因常显，危险动作置后并沿用二次确认。
- Codex 悬浮子窗不挂载 `OperationTooltipLayer`，水球无额度气泡，也不使用原生 `title`。完整说明只存在于操作抽屉、Shift 预览和 ARIA；主程序其他功能的统一 Tooltip 不受影响。
- 需要确认的动作第一次进入 5 秒待确认态，第二次点击相同位置或再次按相同快捷键才执行；`Escape`、外部点击、切换页签和超时均取消。
- 任务整行单击只聚焦/选择，双击或 Enter 打开；Shift+点击执行范围选择，Ctrl/Cmd 点击切换选择。Space 新增任务选择后移动高亮并滚动到下一项，取消选择保持原位；项目标题 Space 选择可见子项后也下移。搜索、页签或刷新改变可见集合时清理不可见选择。
- 可见选择达到两项时自动显示 `已选 N / 归 / 操 / 清` 绝对浮动批量栏；锚点在列表下半区时置顶，否则置底，并在选择、焦点、滚动和尺寸变化时重算。批量栏提供滚动安全区，但不改变任务 DOM 顺序、行坐标或列表高度；不足两项即关闭。
- 同一页只有一个高亮项。方向键移动后进入键盘所有权，鼠标静止不改变高亮；鼠标再次实际移动后恢复鼠标所有权。右键未选中任务先改为单选，已选中任务保留多选，右键项目清空任务选择，然后与 `Ctrl+→` 打开同一完整操作抽屉；抽屉内上下键只移动动作，Enter 或 `Ctrl+1…9` 执行。
- 单项动作包含当前上下文可用的新建会话、选择模型新建、打开、详情、别名、置顶、隐藏和归档；批量动作只包含可逐项定义的归档、隐藏/恢复、置顶/取消置顶和清空选择，不展示打开或编辑别名。
- 默认 Codex 域增加 `Ctrl+T`（UI 展示 `c-t`）作为 `codex.thread.createFocused`，并继续拥有 `↑/↓`、`Space`、`Enter`、`Ctrl+←/→`、`Delete`、`F2`、`Ctrl+P`、`Alt+↑/↓`、`Ctrl+F/R`、`Ctrl+1…9`、`F/Shift+F` 和 `Escape`。`Ctrl+T` 出现在设置页并支持改键；冲突只在 Tab、layer 和 `when` 可同时成立时报告。
- 悬浮子窗口接收有效键位与安全 action，但自行按与主窗口一致的 `when`、layer 优先级解析，并维护 `codex-composer` 输入角色和本地暂态层。编辑器、确认、抽屉、预览、Quick Jump 或模型层打开时，彼此按固定 LIFO 隔离；主窗口不接管子窗 DOM 焦点。
- Quick Jump 只收集未被 composer/抽屉/预览/遮罩覆盖、未被裁剪、允许 pointer events、位于视口且命中栈包含自身的目标。会话目标只移动焦点，不绕过双击/Enter 打开合同；打开 Quick Jump 会关闭 Shift 预览。
- 成功打开完成未查看任务后，Controller 推进当前完成版本的本地已查看水位并立即重新投影；打开失败不得推进。项目折叠先做本地乐观反馈再持久化，指针/焦点离开后的自动收起延迟约 100ms。

## New Thread Composer And Transient Bridge

- 点击项目 `＋`、`Ctrl+T` 或右键新建动作每次都打开 editor；默认目标来自当前高亮会话/项目，没有上下文时为 Chats。弹层显示项目、模型名称与 ID、自动选择原因及对应额度，多行原生文本框自动聚焦并保留系统听写所有权。
- `quota-auto` 在普通阶段使用 `newThreadPreferredModel`，否则选择目录默认/首个非 Spark 模型；任一实际普通窗口为 0 时选择最高可用 Spark，缺失窗口不算 0。模型或 Spark 额度不可用时进入手动选择；本次手选不写配置。
- 模型在编辑器打开时冻结。提交前额度、目录或项目指纹变化时返回新的安全上下文，刷新模型说明并要求用户再次确认，不用旧选择静默提交。
- 编辑器内 Enter 换行，Ctrl/Cmd+Enter 发送，Tab/Shift+Tab 只在弹层内循环，Escape 取消并恢复触发点。操作为“发送并打开”“仅创建空会话”“取消”；错误区显示结构化原因、是否可重试、显式空白 Codex 入口或短期“重试打开”。
- Renderer 请求只含散列项目键、短期项目 alias、项目/上下文指纹、精确模型 ID、模式和瞬时提示词。Preload 在内存中解析 cwd/raw thread ID；以 `allowProviderModelFallback=false` 调用 `thread/start`，校验响应顶层实际 `model/cwd` 后才调用 `turn/start`，最后 Deep Link 仅含 thread ID。
- 首轮失败归档清理本次零轮线程并保留 editor 内存草稿；清理未确认时禁止自动重试。首轮已启动但 Deep Link 失败不得归档运行任务，只返回短期重试打开 alias。App Server 不可用时不复制或编码提示词，只能由用户显式打开 Codex 空白页手动处理。
- 提示词不得进入通用 Runtime action、快照、日志、localStorage、项目文档、错误记忆、Deep Link 或剪贴板；成功、取消、关闭与组件卸载均立即清除 EyPc 副本。

## Archive Safety Contract

- 单条归档请求只接受短期 action alias、预期任务 recency/version、最新 Turn `startedAt`/状态和 `sourceFingerprint`。
- Preload 重读项目指纹、thread 身份/状态/recency 和最新 Turn；任何缺失、变化、active、inProgress 或新版本均拒绝。通过后调用 `thread/archive`，再完整确认该 ID 从 `archived=false` 消失且出现在 `archived=true`；失败不从 UI 移除。
- 项目“全部归档”重新扫描该项目全部未归档历史，不受 30 天窗口影响。active 条目跳过；候选按每批 20、并发 2 逐项执行同样的双向验证。部分失败返回逐项匿名结果并保留失败行。
- App Server 没有 conditional archive 原语；重读通过后、写入前新活动开始仍是 provider-level TOCTOU 残余，不能被 UI 描述为原子保证。

## Acceptance Criteria

- 主文件/备份回退、完整分页、指纹重试、归属优先级、移除项目过滤、30 天边界、六页签倒序、200ms 活动通道、普通/Spark 额度优先级、水球上半区不展开/角标直点/下半区展开、`quota-auto`、模型冻结/临时覆盖、瞬时创建失败清理、`Ctrl+T` 隔离、composer 焦点圈定、纯 Shift 白名单预览、Quick Jump 遮挡过滤、二次确认、单/批量动作隔离、批量部分失败与归档双向验证有自动化覆盖。
- 380px 与 330px 展开态、330px composer/Shift 预览/右键抽屉、104px Spark 水球完成浏览器视觉核验；页面无横向溢出，`S`、模型名称/ID/原因/额度、系统听写输入框、预览内部滚动、Space 选中后下移、批量栏上下避让、任务行零位移及 Pinned/Projects/Chats 顺序均可读。
- 专用临时任务真实执行 `archive → false/true → unarchive → true/false`，最终再次归档清理；不操作用户现有任务。
- `pnpm test`、`pnpm run typecheck`、`pnpm run build`、uTools runtime validation、真实只读预检、Markdown code-link audit 和 `git diff --check` 全部通过。

## Documentation Impact And Residuals

- Classification: `requirement-canonical + project-current + controlled-task`。
- 同步层：raw/spec/plan/tasks/verify/handoff、[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)、[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1) 和 [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)。
- 保留残余：跨 App Server 的 live authority、归档 TOCTOU、真实 Windows uTools/系统热键、真实系统听写、真实 `turn/start`/Deep Link、多显示器/DPI 和 macOS 多 Space 操作。它们不改变本轮本机 schema/额度读取、自动化、浏览器视觉、真实库存、投影和归档协议验收。
