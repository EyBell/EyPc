# Codex Companion 真实会话与交互规范

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Documentation level: `controlled`
Requirement version: `2026-07-22.9`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
Documentation sync group: `dsg:eypc:WU-CODEX-DESKTOP-LIVE-AUTHORITY`

## Execution Authority

- Control plane: `app-root`；实现与风险边界由主线程负责；本轮所有开发验收、真实外部状态操作和最终接纳由用户负责。
- Sidecar: 历史阶段的只读探索不改变本轮 main-only 写入与用户验收权威。
- High-risk boundary: 除 RAW-052 经二次确认、Codex 进程门禁、alias/指纹/结构校验、原子替换与回滚验证的项目移除外，不写 Codex 原生状态文件；不操作用户现有任务、不自动退出/操作 Codex 桌面 UI、不删除项目目录或会话。本轮不执行真实移除或归档验收。

## Superseding Decision

本规范取代旧版 recent-100、三页签、顶部样式工具栏和“单额度装饰环”合同。RAW-051–058 保留既有额度、操作、配色、桌面状态权威和结构性选择反馈。修订 `2026-07-22.9` 的 RAW-059 增加脱敏的启动发现/手动位置诊断及明确连接器降级，但不改变 Desktop live/read 对 Input、正在进行中和完成未读的唯一权威。Renderer 匿名合同、Host 安全边界、排序和持久化不变。

## Current Requirement And Implementation Map

| 领域 | 当前合同 | 实现与证据 |
| --- | --- | --- |
| 原生项目状态 | 日常流程只读解析；RAW-052 项目移除经 Codex 退出、alias/指纹/结构和原子回滚门禁后，仅修改原生项目注册字段 | [preload/index.js](../../../../preload/index.js#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) |
| 完整任务库存 | 完整分页读取 `archived=false`；归属优先 native assignment、Chats、最深有效 cwd，其他任务排除 | [preload/index.js](../../../../preload/index.js#L1)、[codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) |
| 严格时间/完整性 | 最新 Turn 必须存在有效 `startedAt`；滚动窗口 1–365 天、默认 30 天、边界包含；项目指纹变化重试一次，仍变化则不发布伪完整数据 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 六页签与状态优先级 | `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`；动态页按待输入、正在进行中、需关注、宿主状态未知、已完成未读分段；底层数组按最新提问时间倒序，显示层在各页/段内稳定前置置顶项 | [codex.ts](../../../../src/domain/codex.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 原生项目视图 | `Pinned / Projects / Chats` 遵循 Codex 原生置顶、项目顺序和归属，不重复任务，并保留空项目 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 本地元数据 | 恢复最后页签/项目折叠，支持别名、具备即时位置/状态反馈的本地置顶和仅影响项目页的项目隐藏；旧本地移除集合迁移清除 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 额度 V2 与紧凑水球 | 普通 5 小时正余额→普通周正余额→最高正余额 Spark；Spark 显示 `S`，环跟随同池周额度；缺失窗口不伪造 | [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)、[codexNewThread.test.ts](../../../../tests/domain/codexNewThread.test.ts#L1) |
| 水球收起态命中区 | 上半区不因 hover 展开并保留三角标直接点击；角标 hover/focus 200ms 显示作用说明且不展开/切页；下半区 hover 立即展开；触屏不模拟 hover | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 展开布局 | 六页签直接位于顶部，其下依次是统一搜索、服务端真实额度文字和任务内容；删除旧顶部样式/隐藏/刷新/设置/关闭工具栏 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1) |
| 实时状态与未读通道 | macOS Codex Desktop 私有 IPC 提供 live snapshot/patch/request/read-state；App Server 只保留数据/动作连接器职责。普通 watchdog 为 5s，连续三次失败临时 1s；无 live authority 立即显示宿主状态未知 | [preload/index.js](../../../../preload/index.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 启动发现与连接诊断 | 自动枚举受控 macOS/Windows CLI 候选；可选手动位置经同一运行计划核验并只存本机插件 storage；环境快照只传来源/可用性标签，连接器降级明确不授予实时状态权威 | [preload/index.js](../../../../preload/index.js#L1)、[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) |
| 默认模型与新会话 | `quota-auto`、普通首选模型、Spark 自动切换、冻结/刷新确认模型、瞬时 `thread/start → turn/start → Deep Link` 与失败清理 | [codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1)、[preload/index.js](../../../../preload/index.js#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 选择、Shift 与快捷键 | 普通态中部打开、Ctrl/Cmd+中部或 38px 左区选择；选择态左区/中部切换成员并在最后一项移出时退出；行与子按钮分别拥有 Space/Enter | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1) |
| 卡片配对颜色 | 表面/前景使用两个联动二维取色板和标题色卡入口；不可选对比色域可见，选择一侧时另一侧移动到最近可读亮度；有效草稿暂态预览真实悬浮伴侣，取消回滚、确认一次原子提交 | [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1)、[CodexCardColorDialog.vue](../../../../src/components/CodexCardColorDialog.vue#L1)、[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 会话层回退 | 单项 `详情 → 更多操作 → 会话行`，确认态优先；Ctrl 左右切层不改原触发点，批量抽屉一次 Esc 关闭 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 原生归档 | 短期 action alias + 预期版本 + 项目指纹；单条重读后归档并在 false/true 两侧确认；成功后向已连接 Codex Desktop 发送版本化归档通知；项目归档忽略显示窗口并逐项保留失败 | [preload/index.js](../../../../preload/index.js#L1)、[codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) |

## RAW-056 Codex Desktop Live Authority Contract

- 当前临时架构不是“只接宿主、删除插件连接器”：App Server 连接器继续负责额度、模型、库存、创建与持久化归档；Codex Desktop 伴随桥负责跨进程实时状态、未读和桌面侧栏刷新。Easy Agent 后续可在 platform port 后替换这两条通道。
- macOS preload 连接 `~/.codex/ipc/ipc.sock`，使用长度前缀帧与固定版本的 initialize、thread snapshot/patch/follow、request/read-state 和 archive broadcast。连接前校验目录/socket owner 与 mode；握手或消息版本不匹配标记 `incompatible` 并 fail-closed，不尝试猜协议。
- `statusAuthority=desktop-live` 是 `waiting-input / waiting-approval / active` 的唯一来源。Desktop bridge 为 `not-running / incompatible / failed / connecting` 或仅有 connector 状态时，投影必须立刻变为 `unknown`，展示“宿主状态未知”，且 Input/正在进行中角标不得计数。最新 Turn 的 completed/failed/interrupted 仍作为持久化结果展示，但不得被五秒启发或 App Server `active` 覆盖。
- 完成未读要求最新 Turn 为 completed 且 `hasUnreadTurn=true`。live read-state 优先；桌面未连接时允许读取 `.codex-global-state.json` 内 Codex 自身持久化 unread 集合作为 `desktop-persisted`。EyPc 的 open/hide/restore/本地 receipt 不得更改该值，也不得把未读未知伪装成已读。
- Codex Desktop 全量 snapshot 仅在 preload 内瞬时建立 raw ID → 匿名 key 的 live shadow；正文、摘要、Turn items、cwd、路径和 raw ID 必须在边界内丢弃，不进入 Renderer、持久化、日志、文档或错误消息。
- 归档仍先由 App Server 重读与执行 `thread/archive`，再验证 `archived=false` 缺失、`archived=true` 存在。只有验证成功后才发送 `thread-archived` v2；返回值区分 dispatched 与未连接/失败。通知失败不回滚已经确认的上游归档，也不得宣称桌面 UI 已确认刷新。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 接受 Activity Delta V1/V2 以兼容旧 preload：V1 仅标记 connector authority，不能产生实时 Input/active；V2 投影桌面桥与未读权威。普通 watchdog 为 5s，连续三次失败临时改为 1s。

## RAW-059 Launch Discovery And Explicit Connector Fallback Contract

- [preload/index.js](../../../../preload/index.js#L1) 在 macOS/Windows 上只检查受控 CLI 候选；自动命中仅返回脱敏来源标签。用户可在配置页通过本机文件选择或完整路径提供可执行文件，Host 以既有 native/Node-wrapper/shim 运行计划核验后才写入独立的本机插件 storage key。完整路径不进入 Renderer 快照、持久化应用状态、错误、日志或过程文档。
- 手动位置无效时，Host 返回 `manualLaunchPathState=invalid` 并保持显式错误；不会静默改用其他入口。清除手动位置后恢复自动发现。未设置手动位置时，既有 App Server 连接器仍提供额度、模型、库存、创建与已验证归档，并在界面公开“兼容连接器降级/可能延迟”。
- `statusFeedMode=desktop-live` 才允许 Input、正在进行中和已完成未读呈现实时权威。`connector-fallback` 绝不从插件缓存、App Server 活动状态或刷新频率推断三项状态；只显示已知持久化结果与“宿主状态未知”。手动/自动启动方式不改变此状态权威合同。
- Windows 的 CLI 自动发现/手动核验遵循 npm、Volta、NVM、本地和 PATH 的受控规则；`.cmd/.bat` 仍必须解析到已验证 Node/JS 或 bundled native binary。当前 Desktop 私有 IPC 实时桥仅为 macOS canary，Windows 配置页必须明确其实时状态尚不可用。

## RAW-055 Label, Density And Selection Contract

- 任务投影以 `originalName = thread.name || thread.displayName || 兜底` 建立原名，非空本地别名才写入 `alias`；`displayName/name` 均为 `alias || originalName`。列表只渲染一个主标题，原名继续可搜索，并在别名存在时进入详情/Shift 预览。
- 展开态主/次/微型文字为 `12/10/9px`；任务/项目行 `40px`，任务中部 `36px`、项目中部 `38px`；本节的 `26×30px` 左控件已由 RAW-058 改为 `38px` 全高矩形。右侧四槽保持 `24px`、间距 `3px`、操作区 `105px`、内容预留 `114px`。
- `selectedKeys.size === 0` 时，中部打开任务、左槽建立选择；`selectedKeys.size > 0` 时，两区域均切换成员，集合清空即退出选择模式。任务正文内的独立操作按钮继续阻止冒泡并执行自身动作。
- hover、keyboard highlight、selected、selected+highlight、active、selected+active 必须有稳定优先级；左槽同步 `aria-pressed`。不增加持久化字段或新快捷键。

## RAW-057 Explicit Selection Contrast

- `selectedKeys.size > 0` 时在任务收件箱顶部显示模式条，实时显示选择数量及 Esc 退出提示；集合清空时立即移除。
- 选择模式下未选行降至 `.62` 不透明度并降低饱和度，hover 时只恢复到次级层级；选中行保持完整不透明度、`2px` 强调边、`5px` 左轨和更强底色/阴影。
- `aria-pressed=true` 的左控件使用强调色实底，隐藏原任务状态图标并用 `✓` 替代；焦点与 active 继续有独立边界。上述结构线索与文字提示共同承担区分，不允许只靠细微色差。

## RAW-058 Selection, Pin And Counter Feedback Fusion

- 任务行保持 `40px`，左侧选择按钮为宽 `38px`、贴合行左/顶/底且仅保留左圆角的矩形；整块可点击并始终显示任务状态图标。选中按钮使用更强强调底与 `aria-pressed=true`，不再替换为勾选符号。
- 选中行由现有 `accent / running / pending / surface` 组成三色渐变；hover/focus 增强色占比和焦点外框，active 加深并使用内收阴影。选择模式条和未选降权继续有效。
- 无选择时左区选择、中部打开、Ctrl/Cmd+中部选择且不打开；有选择时左区或中部切换成员，最后一项移除即退出。任务行 Space 切换选择；左区按钮及右侧动作按钮的 Space/Enter 由原生按钮拥有，根行不得重复处理。
- 行尾删除“本地顶”。`顶` 固定在 `24px` 槽内：本地置顶使用 `var(--codex-warning)` 文字/边框/轻底；原生置顶只读；未置顶普通。200ms 说明分别表达 EyPc 本地、Codex 原生、未置顶和 Chats 来源。原生/Chats 保持可聚焦并使用 `aria-disabled=true`，点击、Enter、Quick Jump、`Ctrl+P` 与移动快捷键都通过同一只读门禁。
- 紧凑水球/卡片三个角标共用移出展开分支后的不透明说明层和既有视口夹紧。待输入单项、多项、正在进行中和已完成未读均在 hover/focus 200ms 后说明数量与点击作用；离开/失焦立即关闭。角标 hover/focus 不展开、不切页、不触发延时展开，触屏不模拟 hover，点击行为和 ARIA 等价说明保持。

## RAW-051 Card Pair And Session-Layer Contract

- `CodexColorSettings.cardForeground` 是显式持久化字段。旧配置缺失时在深墨 `#07161D` 与浅字 `#F8FCFB` 中按现有可读前景算法选择，避免升级后的视觉突变；三个预设都必须包含该字段并参与完整预设匹配。
- 卡片表面不再有亮度门槛；表面/前景必须达到 `4.5:1`，派生边界与焦点态继续达到 `3:1`。水球仍须满足深色亮度约束。Runtime 更新若只带 `card` 或 `cardForeground`、值畸形或整对低对比，必须在写入前拒绝且不产生部分持久化。
- 配置入口只打开 [CodexCardColorDialog.vue](../../../../src/components/CodexCardColorDialog.vue#L1)。两组颜色必须共享一个草稿、整体验证与确认边界；HEX 无效草稿、ARIA 错误关联、焦点圈定、窄屏/短高度滚动和取消零持久化合同保持。RAW-054 取代本节早期的滑杆-only 与“真实 companion 在确认前不变化”细节。
- “确认并应用”只保存一次完整 colors 对象；取消、Esc、遮罩和组件关闭均不持久化并恢复入口焦点。模态内 Tab/Shift+Tab 圈定，短高度允许纵向滚动且不得横向溢出。
- 单项详情记录原始触发点、目标项和稳定的“查看详情”动作 ID。详情 Esc 或 Header 返回切换到同一目标的更多操作并聚焦该动作；第二次 Esc 关闭并恢复原会话行。直接 `Ctrl+←` 打开详情采用同一栈，`Ctrl+←/→` 切层不得覆盖原触发点。目标失效时退回可见会话行或列表容器；批量抽屉无详情子层。
- 完整 Escape 优先级为：二次确认 → composer/model → Quick Jump → Shift 预览 → 行内编辑 → 详情 → 更多操作 → 多选 → 搜索 → 收起。归档确认存在时第一次 Esc 只取消确认。

## RAW-054 Linked Color Boards And Real-Float Preview

- 每组颜色提供一个固定色相的饱和度/亮度二维取色板、色相滑杆与六位 HEX。两块取色板始终同时可见；低于 `4.5:1` 的候选区域以斜纹弱化，指针或方向键选择一侧时锁定该色，并把另一侧保持色相/饱和度、仅移动到最近满足对比度的亮度。
- 每组标题旁的当前色块是按钮，在所属色板原位展开 12 个命名候选色卡。方向键在色卡间移动并选择，Esc 只关闭色卡层并恢复色块焦点；点击外部同样关闭。选择色卡继续使用同一联动草稿、对比校验和预览事务。
- 每个完整有效草稿通过 `codex.card-colors.preview` 写入 Controller 内存暂态状态并立即更新真实桌面伴侣；预览时即使保存样式为水球，也只临时把伴侣渲染为卡片，不修改保存的样式或颜色。悬浮子窗只显示效果，不包含任何水纹/颜色编辑控件。
- 确认通过 `codex.card-colors.commit` 原子持久化一次完整颜色对象并清除预览；取消、Esc、遮罩与组件卸载通过 `codex.card-colors.cancel` 清除暂态状态，恢复上次保存的样式和颜色。Controller 对预览与提交执行同一完整配对校验，单字段、畸形或低对比请求均不得生效。
- 浏览器矩阵覆盖 `1180×800`、`760×800`、`420×800` 与 `760×420`；窄屏无横向溢出、短高度可滚动，色卡层在 420px 视口内夹紧。选择“薄荷”得到 `#B5E3B5 / #07161D`、对比 `12.81:1`，真实浮窗显示由自动化与暂态快照合同共同覆盖。

## Host Snapshot V2 Contract

- Host V2 只在原生状态解析、完整 `archived=false` 分页、每个候选最新 Turn 和扫描前后项目指纹全部成立时标记 `completeness=verified`。
- 读取项目状态时只 allowlist `local-projects`、项目顺序、置顶顺序、`thread-project-assignments` 和 `projectless-thread-ids`。除 RAW-052 项目移除事务外不得写入该文件，也不得扫描 SQLite、LevelDB、Turn items 或会话正文。
- 项目归属优先级固定为：原生 assignment；原生 projectless → `Chats`；有效项目根的最深 cwd；否则视为 Codex 侧已移除或未注册并排除。
- `thread/list` 使用 `archived=false` 完整翻页，游标异常、循环、超出安全上限均使本次扫描失败。零 Turn 条目计入 `nonConversationCount`，但不进入会话投影。
- 每条候选使用 `thread/turns/list(limit=1, sortDirection=desc, itemsView=notLoaded)`；存在 Turn 却缺少 `startedAt` 时整批失败，不以 `recencyAt` 或 `updatedAt` 回退。
- 扫描开始与结束指纹不同则完整重试一次。第二次仍变化或项目状态不可读时，Controller 保留上一份已验证快照并标记 stale；无旧快照时展示错误空态。
- Renderer 只接收匿名任务/项目 key、短期 action alias、匿名项目描述、原生顺序、统计数和 SHA-256 来源指纹；不接收原始 ID、路径、项目根、cursor 或私有状态对象。

## Conversation Projection V3

- `timeWindowDays` 默认 30，可配置 1–365；边界 `lastTurnStartedAt >= now - days×24h` 包含。
- `全部`：窗口内全部未归档会话；本地隐藏项仍显示隐藏标记。
- `待输入`：窗口内所有 `waiting-input` 会话，包括本地隐藏行；它是快速处理入口，不改变真实归属或隐藏状态。
- `动态`：原 `进行中` 页签的持久化 ID 仍为 `ongoing`，内部依次展示非隐藏的`待输入 / 正在进行中 / 需关注 / 宿主状态未知 / 已完成未读`；每段先稳定展示置顶项，再展示非置顶项，各分区内部保持最近提问时间倒序。只有 `desktop-live` 状态进入前两段，未知不得混入正在进行中。
- `已隐藏`：EyPc 本地隐藏的窗口内会话，保留真实状态。
- `已完成`：非隐藏、非 active 且最新 Turn completed。
- `项目`：同一窗口内会话按原生结构投影。`Pinned` 固定为 EyPc 置顶会话、Codex 原生置顶会话、EyPc 置顶项目、Codex 原生置顶项目；置顶会话从所属项目行中排除，来源由 `顶` 控件和说明表达，不追加行尾文字。`Projects` 包含其余原生项目和空项目；`Chats` 只含原生 projectless 会话，展开任务必须紧随其标题行。
- 紧凑水球的角标 hover/focus 只显示 `待输入 N`、`进行中 N`、`未读 N`；`F` / `Shift+F` / `Ctrl+F` 在 Codex Tab 的任意非编辑内容区域均可进入 Quick Jump（包括多选），编辑控件保留原生文本输入。Codex 会话搜索改用 `Ctrl+Shift+F`。
- 配置页的主题即时同步监听器必须在其依赖的 `activeThemeOption` 初始化之后注册，避免 setup TDZ 阻止页面挂载。
- 普通 `Escape` 继续按浮窗局部层级恢复；`Shift+Escape` 通过宿主 `return-focus` 桥临时隐藏已展开卡片并回退到调用前焦点，不修改 `floatEnabled` 或持久化设置，下一次全局激活可复用同一浮窗。
- 所有底层任务数组以 `lastTurnStartedAt desc`、匿名 key asc 为唯一稳定顺序。任务页签显示时稳定分成置顶/非置顶两区：置顶区优先并遵循 `Pinned` 顺序，非置顶区保持源数组顺序。搜索匹配别名、原名和项目名，只过滤当前页签，不在任一分区内重排；项目名命中时展示该项目全部窗口内任务。

## UI And Local State

- 第一次使用默认 `动态`（内部稳定 ID `ongoing`）。保存最后页签、项目折叠状态、1–365 天窗口、任务/项目别名、本地置顶顺序和项目页隐藏集合。
- 持久化只使用散列任务 key 和稳定项目指纹；不得持久化原始 thread/Turn ID、项目路径、action alias 或任务列表。
- 原生项目/置顶顺序只读。本地置顶可通过操作与 `Alt+↑/↓` 调整；动作完成后的下一份投影必须在所有相关任务/项目卡片上带 `pinSource`，本地 `顶` 保持 `aria-pressed=true` 并使用 warning 状态。任务置顶在当前任务页签/状态段内前置，项目置顶进入 `Pinned`。别名只改显示和搜索，归属、归档仍使用真实身份。
- 旧“从 EyPc 移除/恢复”本地抑制已由 RAW-052 取代。项目“隐/显”是可恢复的本地分组展示状态；项目“移”是经 Host 安全事务执行的真实 Codex 侧栏移除，两者不得混用。
- 水球不再显示迷你详情。收起态上半区是角标安全区，pointer enter/move 不展开；只有指针进入下半区才立即展开。球体显式点击和键盘激活仍可展开，触屏不模拟 hover。中心依次选择普通 5 小时正余额、普通周正余额、最高正余额 Spark；两个普通窗口均无正余额时才展示 Spark。Spark 中心在百分比上方显示 `S`，Weekly 环只跟随当前同一额度池。文字背景透明。
- 展开额度区只渲染 App Server 实际返回的普通与 Spark 窗口。只有 Weekly 时不得伪造 5 小时额度；缺失窗口不视为 0，也不得触发模型自动降级。
- 收起态左上角仅在非零时以红色文字显示 Codex Desktop 权威待输入数；右上展示 desktop-live 正在进行中数，下一行展示 Codex 权威完成未读数，超过 99 显示 `99+`。宿主未知、失败/中断和未读未知均不冒充这三类计数。待输入仅一项时点击直接打开，多项时点击打开待输入页；三个角标都保持直接点击，hover 不切页也不展开。
- 会话行悬停超过 500ms 显示不透明、隐私白名单详情；状态槽和固定短按钮悬停超过 200ms 显示不透明说明。按住纯 Shift 仍可显示不抢焦点的只读预览；悬停会话优先、键盘高亮兜底，Shift+↑/↓ 接管目标，真实鼠标移动后恢复悬停所有权。所有详情只含名称/原名、项目、状态/活动标记、允许的时间/耗时、来源、隐藏/置顶和归档能力；正文、摘要、raw ID、cwd 与路径永不读取或展示。

## Selection, Operations And Shortcuts

- 项目行常显 `顶/移/隐显/+`，任务行常显 `顶/隐显/归/+`，RAW-055 后每槽固定 `24px`、四槽区 `105px`；完整动作仍进入右键或 `Ctrl+→` 抽屉，禁用原因与单项/批量动作边界保持。
- Codex 悬浮子窗不挂载 `OperationTooltipLayer`，水球无额度气泡，也不使用原生 `title`。状态槽与短字符按钮可显示自有的 200ms 不透明说明；其余完整说明存在于操作抽屉、Shift 预览和 ARIA，主程序其他功能的统一 Tooltip 不受影响。
- 需要确认的动作第一次进入 5 秒待确认态，第二次点击相同位置或再次按相同快捷键才执行；`Escape`、外部点击、切换页签和超时均取消。
- 无选择时任务中部单击打开，左侧状态槽、Shift/Ctrl/Cmd 手势或当前高亮项 Space 建立选择；已有任一选择时，中部与左槽都切换当前成员，移出最后一项即退出选择模式。Space 与项目标题行为沿用既有键盘合同。搜索、页签或刷新改变可见集合时清理不可见选择。
- 可见选择达到两项时自动显示 `已选 N / 归 / 操 / 清` 绝对浮动批量栏；锚点在列表下半区时置顶，否则置底，并在选择、焦点、滚动和尺寸变化时重算。批量栏提供滚动安全区，但不改变任务 DOM 顺序、行坐标或列表高度；不足两项即关闭。
- 同一页只有一个高亮项。方向键移动后进入键盘所有权，鼠标静止不改变高亮；鼠标再次实际移动后恢复鼠标所有权。右键未选中任务先改为单选，已选中任务保留多选，右键项目清空任务选择，然后与 `Ctrl+→` 打开同一完整操作抽屉；抽屉内上下键只移动动作，Enter 或 `Ctrl+1…9` 执行。
- 单项动作包含当前上下文可用的新建会话、选择模型新建、打开、详情、别名、置顶、隐藏和归档；批量动作只包含可逐项定义的归档、隐藏/恢复、置顶/取消置顶和清空选择，不展示打开或编辑别名。
- 默认 Codex 域增加 `Ctrl+T`（UI 展示 `c-t`）作为 `codex.thread.createFocused`，并继续拥有 `↑/↓`、`Space`、`Enter`、`Ctrl+←/→`、`Delete`、`F2`、`Ctrl+P`、`Alt+↑/↓`、`Ctrl+F/R`、`Ctrl+1…9`、`F/Shift+F` 和 `Escape`。`Ctrl+T` 出现在设置页并支持改键；冲突只在 Tab、layer 和 `when` 可同时成立时报告。
- 悬浮子窗口接收有效键位与安全 action，但自行按与主窗口一致的 `when`、layer 优先级解析，并维护 `codex-composer` 输入角色和本地暂态层。编辑器、确认、抽屉、预览、Quick Jump 或模型层打开时，彼此按固定 LIFO 隔离；主窗口不接管子窗 DOM 焦点。
- Quick Jump 只收集未被 composer/抽屉/预览/遮罩覆盖、未被裁剪、允许 pointer events、位于视口且命中栈包含自身的目标。会话目标同步唯一高亮，固定操作按钮目标执行相同受门禁动作；打开 Quick Jump 会关闭 Shift 预览。普通标记是深色底、白色粗体和白描边，当前标记是黄色底、深色字和深描边。
- 打开、隐藏、恢复完成任务都不得推进或清除 Codex Desktop 未读；旧 receipt 只参与本地隐藏兼容，不参与 unread 投影。项目折叠先做本地乐观反馈再持久化，指针/焦点离开后的自动收起延迟约 100ms。
- 置顶动作通过既有 `codex.pin.toggle` 持久化后立即重新投影。浮窗桥接若无法送达动作，必须通过 `aria-live` 区域明确提示重新打开 EyPc 后重试，不得静默停留在旧状态。

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
- Preload 重读项目指纹、thread 身份/状态/recency 和最新 Turn；任何缺失、变化、desktop-live active、inProgress 或新版本均拒绝。通过后调用 `thread/archive`，再完整确认该 ID 从 `archived=false` 消失且出现在 `archived=true`；失败不从 UI 移除。
- 双向验证成功后，Preload 向已连接 Codex Desktop 发送版本化 `thread-archived` 通知，使桌面侧栏无需关闭重启即可同步；结果只承诺通知已派发，不宣称桌面 UI 已确认消费。未连接/派发失败会返回同步状态但不撤销已验证归档。
- 项目“全部归档”重新扫描该项目全部未归档历史，不受 30 天窗口影响。active 条目跳过；候选按每批 20、并发 2 逐项执行同样的双向验证。部分失败返回逐项匿名结果并保留失败行。
- App Server 没有 conditional archive 原语；重读通过后、写入前新活动开始仍是 provider-level TOCTOU 残余，不能被 UI 描述为原子保证。

## RAW-052 常显操作与真实项目移除

- RAW-052 建立任务/项目固定四槽、禁用保位、五秒同槽确认和无 hover 扩宽基础；RAW-055 将槽宽收敛为 `24px`、四槽区 `105px`，并把点击改为“无选择时中部打开/左槽选择，已有选择时两处均切换成员”。
- 状态槽及短字符按钮使用悬浮子窗自有、完全不透明、`200ms` 延迟的说明层；不设置原生 `title`，也不挂载主应用 `OperationTooltipLayer`。Quick Jump 普通标记为深色底/白粗字/白描边，激活标记为黄底/深字/深描边，不按序号交替粉紫。
- 项目隐藏只从项目页 `Pinned / Projects / Chats` 投影中移除项目分组，并在“已隐藏项目”恢复区展示；任务页签、计数、排序及任务项目归属不变。状态持久化为 `hiddenProjectKeys`；迁移忽略并清除旧 `removedProjectKeys/removedProjectAbsentKeys`，不会把旧本地选择自动写入 Codex。
- `codex.project.remove` 是 Host 高风险动作，只接收短期项目 alias 与预期 `sourceFingerprint`。Host 先确认 Codex Desktop 未运行，再只读主 `.codex-global-state.json` 并校验 alias、指纹、目标与已知结构；写操作不使用 `.bak` 回退。事务仅删除目标 `local-projects` 项、过滤 `project-order/pinned-project-ids`、必要时清空 `selected-project`，保留 thread assignments、会话、目录和全部未知字段。
- 主文件与 `.bak` 在同目录分别写入并同步临时文件后原子替换；提交前再次检查桌面进程和主文件未变化，提交后重读两份文件验证项目均已消失。任何写入/验证失败恢复旧主/备内容并返回 `write-failed`；运行、陈旧和未来结构分别返回 `codex-running/stale-source/unsupported-schema`；只有双重验证返回 `verified`。Chats 不可移除。成功后清除该项目的本地隐藏、折叠、本地置顶和别名元数据并刷新完整快照。
- 除上述显式二次确认、进程/指纹/结构门禁和可回滚事务外，Codex 全局状态仍绝对只读。项目目录和既有会话永不删除；重新通过 Codex 添加项目后由新的原生注册状态重新投影。

## RAW-052 用户验收覆盖

- 测试契约覆盖四槽字符/固定宽度、二次确认、200ms 不透明说明、项目隐藏不影响任务页、旧本地移除迁移清除、Codex 运行阻止、Host 结果码、限定字段与主/备回滚结构、高对比 Quick Jump。
- 本增量不由 Agent 执行测试、typecheck、build、uTools/runtime、截图、真实预检、真实归档或真实项目移除。交付状态必须保持“未校验，待用户验收”，只有用户验收后才能更新为 accepted。

## RAW-053 置顶反馈修正

- [codex.ts](../../../../src/domain/codex.ts#L1) 在项目分组前统一把原生/本地置顶来源写入每张任务和项目卡片，隐藏项目恢复卡片也保留相同状态；原生置顶仍只读。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 仅在显示层对每个任务页签以及动态页各状态段做稳定置顶分区，不修改 V3 源数组、状态段优先级、搜索结果集合或任务身份。项目置顶继续进入原生结构的 `Pinned`。
- UI 用 `顶` 控件的 `data-pin-source`、warning 状态、`aria-pressed`、200ms 来源说明和明确的桥接失败消息呈现结果；RAW-058 删除行尾来源文字。测试契约覆盖本地置顶投影、当前页首项变化和按钮状态；依用户规则不运行测试或其他门禁。

## Acceptance Criteria

- 主文件/备份回退、完整分页、指纹重试、归属优先级、移除项目过滤、30 天边界、六页签倒序、Desktop IPC live/unread 投影、5s watchdog、无权威降级、打开/隐藏不改未读、归档后桌面通知、普通/Spark 额度优先级、水球命中/角标说明、`quota-auto`、瞬时创建、多选状态机/键盘归属、置顶来源门禁、隐私预览、Quick Jump、二次确认、批量部分失败与归档双向验证均有测试契约；RAW-056 与 RAW-058 契约尚未执行。
- 380px 与 330px 展开态、330px composer/Shift 预览/右键抽屉、104px Spark 水球完成浏览器视觉核验；页面无横向溢出，`S`、模型名称/ID/原因/额度、系统听写输入框、预览内部滚动、Space 选中后下移、批量栏上下避让、任务行零位移及 Pinned/Projects/Chats 顺序均可读。
- 专用临时任务真实执行 `archive → false/true → unarchive → true/false`，最终再次归档清理；不操作用户现有任务。
- RAW-051 及更早版本的历史验收命令与证据保持原记录；RAW-052–053、RAW-055–058 仍按用户独占验收，不能由 RAW-054 的门禁结果替代。RAW-054 已运行聚焦测试、typecheck、build/uTools、浏览器矩阵与全量基线，且未执行真实 Codex 状态写入。

## Documentation Impact And Residuals

- Classification: `requirement-canonical + project-current + controlled-task`。
- 同步层：raw/spec/plan/tasks/verify/handoff、[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)、[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1) 和 [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)。
- 保留残余：Codex Desktop 私有 IPC 版本漂移与当前仅 macOS canary、归档重读到写入之间的 provider TOCTOU、归档通知仅能确认派发不能确认 UI 消费、真实 Windows uTools/系统热键、真实系统听写、真实 `turn/start`/Deep Link、多显示器/DPI 和 macOS 多 Space 操作。RAW-056 未运行任何开发或真实宿主门禁。
