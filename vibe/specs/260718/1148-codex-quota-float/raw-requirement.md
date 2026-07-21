# Codex 额度悬浮球与任务收件箱需求记录

Tool: codex
Date: 2026-07-21
Spec: [spec.md](spec.md#L1)
Source format: `chat-requirement-summary`
Capture fidelity: `normalized-material-requirement`
Privacy boundary: `no-verbatim-prompt-or-transcript`

## Material Requirement Facts

- `RAW-001` (`active`): EyPc 新增独立 Codex 配置 Tab；总设置可启停整个 Codex 功能，Codex Tab 内可独立控制桌面悬浮组件显示。
- `RAW-002` (`refined-by-RAW-040`): 悬浮组件支持水球和卡片样式；早期选择水球中心显示 5 小时额度、外环显示 Weekly，当前真实额度选择与 Weekly 环规则由 RAW-040 收敛。
- `RAW-003` (`active`, `refined-by-RAW-040`): 额度读取只使用本机 Codex App Server，展示实际返回的 5 小时/Weekly 剩余额度与重置时间；不得伪造缺失窗口。
- `RAW-004` (`active`): 使用真正的 uTools 桌面悬浮子窗口，不引入 Tauri、Rust、独立 Electron 安装包、多 Provider、历史图表、自动更新或复杂动画。
- `RAW-005` (`superseded-by-RAW-028`): 悬浮组件自动加载最近 Codex 对话，区分正在进行的对话与已经完成但尚未确认/查看的对话。
- `RAW-006` (`superseded-by-RAW-032`): 任务入口采用 `D1`：水球显示进行中/待查看数量角标，点击展开卡片后分组展示最近任务。
- `RAW-007` (`superseded-by-RAW-012`): 早期 `E1` 选择曾要求成功跳转后自动确认；用户后续明确纠正为打开与确认完全分离，因此该行为不再生效。
- `RAW-008` (`active`, `refined-by-RAW-023`): 内容粒度采用 `F1`：只展示任务名称、状态和必要时间元数据，不展示对话正文或摘要；RAW-023 后续明确了创建、首次提问、最近开始、运行耗时和完成时间的允许范围。
- `RAW-009` (`active`): 设计需预留迁移到 EzAgentPlatform 的 Provider、任务快照、动作分发和悬浮宿主边界，但本轮 EyPc 保持独立可运行。
- `RAW-010` (`active`): 真实 uTools 宿主中若 Codex App Server 启动后立即退出并使额度为空，应视为宿主兼容缺陷；插件不能假定 GUI 进程继承终端的 Node/NVM PATH。
- `RAW-011` (`active`): Clash 系统代理已开启但使用 PAC 时，真实 uTools 中的 Codex App Server 网络读取仍可能超时；EyPc 应兼容这种 GUI/PAC 环境，而不是要求用户关闭 PAC、修改全局网络设置或把代理凭据写入插件。
- `RAW-012` (`superseded-by-RAW-030`): `codex.task.open` 只打开任务，绝不改变确认状态。进行中任务只有上游完成后才转入待查看；待查看任务无论打开、刷新、重启或经过旧期限都持续保留，只有单条“确认已查看”或分组“全部确认”可移除。对非 `pending-review` 的确认必须拒绝且不得提前写 receipt；同一任务出现更新的完成时间后需重新进入待查看。
- `RAW-013` (`active`): 水球采用深海高对比皮肤，卡片采用纸白深墨的真实横向皮肤，展开面板跟随当前皮肤；配置 Tab 和展开 Header 使用位置、顺序、尺寸均稳定的顶部 `水球 / 卡片` 切换，收起态不放切换按钮。
- `RAW-014` (`active`, `refined-by-RAW-040`): 水球/横卡共用额度投影并按实际字段自适应；展开高度在 `280–460px` 自适应，任务列表是唯一滚动区；水纹与主题继续遵循 reduced-motion 和对比合同，紧凑额度选择由 RAW-040 更新。
- `RAW-015` (`superseded-by-RAW-028`): 任务状态必须准确区分等待输入、等待审批、无等待标记的正在进行、需要关注、跨进程状态未知和已完成待查看；输入与审批标记可以同时存在。跨进程 `notLoaded`/最近活动不得因刷新次数或等待时间自动变成完成、待查看或可确认；后续 RAW-019 只增加不读取 items 的持久化 `completed + completedAt` 窄例外。
- `RAW-016` (`active`): Codex 功能启用后，EyPc 第一次启动需要在 macOS 与 Windows 上自动核查系统、受控 Codex CLI/运行环境、相关进程和本地配置；加载不到时，Codex 配置页必须分项显示原因与可执行的处理提示，并允许重新检测。
- `RAW-017` (`active`): 增加一个统一的 Codex 悬浮球显示/隐藏动作。插件窗口内提供默认快捷键，系统级全局快捷键通过独立 uTools 功能入口绑定；配置页必须显示当前使用方式并能直接跳转到 uTools 快捷键设置。
- `RAW-018` (`active`): 配置页不能在额度、配置与 App Server 已成功读取时仍显示“当前系统/CLI 不支持”。uTools 若暂时保留旧 preload，新增环境核查接口缺失只能作为兼容降级，成功的 App Server 连接必须成为更高优先级的可用性证据。
- `RAW-019` (`superseded-by-RAW-028`): 修正状态语义后不能让任务收件箱退化为“全部未知”。跨进程仍不得把 `notLoaded` 或时间新鲜度猜成完成；EyPc 可用 `thread/turns/list(itemsView=notLoaded)` 只读取最近持久化 turn 的状态元数据，并且只有带有效 `completedAt`、没有更新活动覆盖的 `completed` 才能把既有未知活动提升为待查看。`interrupted` 仍可能代表其他进程正在运行，必须保持未知；精确的跨进程运行中、等待输入和等待审批仍需共享 live authority。
- `RAW-020` (`superseded-by-RAW-032`): 展开面板默认继续按内容使用 `360×280–460px`，但锁定展开后允许拖拽或键盘调整宽高；最小 `340×280px`、最大为当前显示器工作区四周各减 `12px`。尺寸按显示器最多保存 8 条，收起态保持固定尺寸，位置重置与当前显示器尺寸重置必须互不影响；取消缩放恢复起始 bounds 且不保存。
- `RAW-021` (`active`, `refined-by-RAW-032-and-RAW-040`): 水球配置拆为共享水纹与 Weekly 环；水纹保留配色、透明度、波幅、运动和 reduced-motion，Weekly 存在时的完整轨道/剩余圆弧由 RAW-040 最终定义。
- `RAW-022` (`superseded-by-RAW-035-and-RAW-036`): 删除活动设置中的每组任务条数和定时保留配置；旧版 recent-100/partial 合同已由完整分页、原生项目过滤和滚动时间窗口取代。
- `RAW-023` (`active`): 任务行增加任务创建时间、首次提问时间、最近一次提问开始、最近运行耗时和具体完成时间。只有权威 running 在展开态实时计时；后台首问分页只读取 `itemsView=notLoaded` 的时间/游标元数据，raw thread/turn ID、cursor、cwd 和正文不得进入 Renderer、存储、日志或文档。
- `RAW-024` (`superseded-by-RAW-032`): 浮窗展开必须使用显式目标状态而不是盲目 toggle：悬停只临时展开，点击展开面板或锁定按钮后保持展开，手动收起不能被残留 hover 立即反弹。水球只保留水平周期波形，不得通过整体旋转制造虚假水纹；Codex 配置页的首个顶部操作直接控制悬浮组件显示/隐藏，不保留下方重复开关。
- `RAW-025` (`superseded-by-RAW-029-and-RAW-030`): 任务行保持紧凑，创建/首次/最近/耗时/完成时间通过 hover/focus Tooltip 查看。所有可见任务都可本地隐藏到 Header 的“已隐藏”区并释放，隐藏与释放都不修改 Codex；待查看任务隐藏后仍保持未处理计数，且行内原有 `确认已查看` 不得因新增隐藏/归档动作消失。
- `RAW-026` (`superseded-by-RAW-031`): 已完成待查看 receipt 不得因读失败、移出最近 100 条、Codex 已归档或重启而丢失。EyPc 应分页恢复未归档历史与归档来源，只在内存中保留 raw ID/cursor/action alias。可定位且状态未变化的待查看任务提供真正 Codex 归档；叉号需原位二次确认，归档前重读线程身份、允许状态、recency 与 newest completed turn，任一字段缺失/变化都拒绝，成功后同时确认该 revision。
- `RAW-027` (`active`): 额度/config 与任务读取使用独立的 App Server 请求参数和结果处理；一侧结构化失败不得把另一侧成功结果标为失败或丢弃。
- `RAW-028` (`active`): 任务快照升级为三种业务桶 `ongoing / completed-unread / completed`，并保留 `active / waiting-input / waiting-approval / failed / interrupted / system-error / unknown` 活动副状态。只有当前 App Server 明确返回的 `Thread.status=active` 才是权威进行中；最新 Turn 的 `completed` 直接形成完成版本，不再要求 `completedAt` 追平可能晚更新的线程元数据。失败、中断、系统错误、未加载或超时必须显示准确副标签，不伪装成完成或仍在运行。
- `RAW-029` (`superseded-by-RAW-037`): 旧版任务区域为三个 Tab；当前五页签、搜索和纯最近提问时间倒序由 RAW-037 定义。
- `RAW-030` (`active`): 删除单条/批量“确认已查看”。本地不存在 Codex 原生 unread 字段，“完成未查看”只表示 EyPc 尚未查看当前完成版本；隐藏完成未查看任务同时推进已查看水位，打开任务不自动推进。新完成版本会自动解除旧隐藏并重新进入完成未查看；旧 pending receipt 迁为未查看，旧确认 receipt 迁为已完成，其余历史完成建立已查看基线。
- `RAW-031` (`active`, `refined-by-RAW-042`): 归档是上游状态，所有 archived 任务不进入普通快照；单条和项目归档的双向验证、批次与失败保留由 RAW-042 完整定义。
- `RAW-032` (`active`, `refined-by-RAW-037-RAW-044`): 删除 Pin、确认已查看和手动收缩按钮；自动收缩、受限 resize、水纹和对比基础继续有效，展开顶部布局、水球额度与当前操作交互由 RAW-037–RAW-044 更新。Codex 悬浮子窗的视觉 Tooltip 已由 RAW-044 取消。
- `RAW-033` (`active`): macOS 悬浮子窗必须始终置顶并在固定显示器的所有普通 Space 与全屏 Space 可见；创建、显示器迁移和窗口重建后重新应用并在 Codex 配置页展示脱敏诊断。Windows/Linux 不得伪报该 macOS 能力。
- `RAW-034` (`superseded-by-RAW-035-and-RAW-036`): 旧版 recent-100 对每行做最新 Turn 解析；当前改为完整分页和整批完整性门禁，严格时间合同由 RAW-035/036 定义。
- `RAW-035` (`active`): 任务库存必须先真实读取 Codex 原生项目注册状态，再完整分页读取所有 `archived=false` 任务。归属优先原生 assignment、projectless→Chats、有效项目根最深 cwd；其余视为已从侧栏移除/未注册并排除。项目状态扫描前后必须指纹一致，变化时只完整重试一次。
- `RAW-036` (`active`): 时间窗口位于 Codex 设置，默认 30 天、可填 1–365 天、滚动边界包含；最近提问时间严格取最新 Turn `startedAt`，不以 `updatedAt` 回退。存在 Turn 却缺时间、分页失败或项目状态不可解析时整批失败，保留上一份已验证 stale 快照或展示错误空态。
- `RAW-037` (`active`): 展开卡片顶部直接放 `全部 / 进行中 / 已隐藏 / 已完成 / 项目` 五页签，删除旧顶部样式/隐藏/刷新/设置/关闭按钮；其下为统一搜索、真实额度文字和任务内容。所有任务页签严格按最近提问时间倒序，搜索只过滤当前页签且不改顺序。
- `RAW-038` (`active`): 项目页模拟 Codex 原生 `Pinned / Projects / Chats`：先原生置顶会话与项目，再追加 EyPc 本地置顶；其余项目遵循 project-order 且保留空项目，Chats 只含原生 projectless 会话，任何任务不得重复。
- `RAW-039` (`active`): 默认页签是进行中并持久化最后页签/项目折叠；任务和项目支持本地别名、搜索、EyPc 置顶排序和明确命名的“从 EyPc 移除/恢复”。只保存散列任务 key 和稳定项目指纹，不保存原始 ID、路径或任务列表；搜索词、选择、焦点和确认态不跨重启。
- `RAW-040` (`active`): 水球悬浮直接展开，不先显示迷你详情。中心只显示最近重置的真实额度百分比，文字背景透明；Weekly 存在时使用明显的 5px 完整轨道与剩余圆弧。展开卡片只展示服务端实际返回的 5 小时/周限额；只有 Weekly 时不得伪造 5 小时额度。
- `RAW-041` (`active`, `interaction-superseded-by-RAW-044`): 本条建立的 5 秒同位二次确认、点击/Ctrl/Shift 多选、Delete、方向键、详情/操作抽屉、别名、本地置顶、搜索、Ctrl+1…9 和独立 Codex 快捷键域继续有效；彩色点式操作区、hover 展开及 Space 自动下移已由 RAW-044 取代。
- `RAW-042` (`active`): 单条真实归档须重读身份、状态、latest Turn、版本和项目指纹，拒绝 active/inProgress/变化证据，写入后同时确认从 `archived=false` 消失并在 `archived=true` 出现。项目全部归档忽略 30 天窗口，跳过 active，20 条一批、并发 2、逐项双向验证并保留部分失败；批量真实写入只在另行授权临时项目时执行。
- `RAW-043` (`active`): Host Snapshot 升级 V2、Renderer 会话投影升级 V3；归档接口只接受短期 action alias、预期版本和来源指纹。Codex 原生状态文件始终只读；不扫描 SQLite/LevelDB/正文，不让 raw ID、路径或私有状态进入 Renderer。
- `RAW-044` (`active`): 任务行常显固定槽位短字符 `开 / 名 / 顶 / 隐（或显）/ 归`，项目行常显 `名 / 顶 / 归 / 移`；不再使用彩色圆点、图标、hover 展开、宽度动画或视觉 Tooltip，归档/移除仍在原槽 5 秒内切换为 `确`。Codex 悬浮球、项目、任务和操作按钮均无视觉 Tooltip 或原生 `title`，但保留完整 ARIA；主应用其他功能的统一 Tooltip 不变。Space 只切换当前任务或项目可见子项的选择，焦点与滚动保持原位。至少两项可见选择时显示绝对浮动批量栏 `已选 N / 归 / 操 / 清`，按焦点或最后选中项所在列表半区自动在顶部/底部避让，不改变任务 DOM 顺序、行坐标或列表高度。

## Latest Superseding Requirement Map

| 主题 | 当前唯一合同 | 来源 |
| --- | --- | --- |
| 真实库存 | 原生项目注册 + 完整未归档分页 + 固定归属优先级 + 指纹一致 | `RAW-035`、`RAW-043` |
| 时间与完整性 | 1–365 天滚动窗口；latest Turn `startedAt`；整批 fail-closed | `RAW-036` |
| 列表与项目 | 五页签、统一搜索、纯最近提问倒序、Pinned/Projects/Chats | `RAW-037`、`RAW-038` |
| 本地整理 | 页签/折叠持久化、别名、本地置顶、明确 EyPc 本地移除 | `RAW-039` |
| 额度与水球 | 最近重置真实额度、Weekly 完整轨道/圆弧、缺失窗口不伪造 | `RAW-040` |
| 批量交互 | 常显短字符固定按钮、同位二次确认、Space 原位选择、两项起自动浮动批量栏、Codex 独立快捷键域 | `RAW-041`、`RAW-044` |
| 原生归档 | 单条和项目逐项双向验证；active 拒绝；部分失败保留 | `RAW-042` |
| 隐私 | 原生状态只读；Renderer/持久化不含 raw ID、路径或正文 | `RAW-043` |

## Historical Consolidated Map Through RAW-034

| 需求主题 | 用户目标 | 截至 RAW-034 的当时约束 | 来源 |
| --- | --- | --- | --- |
| 产品入口与启停 | 在 EyPc 中提供独立 Codex 配置功能，而不是另装桌面应用 | 总设置控制模块启停；Codex Tab 只负责配置，悬浮组件可单独显示/隐藏；不引入 Tauri、Rust 或独立 Electron 安装包 | `RAW-001`、`RAW-004` |
| 额度与配置 | 随时看到 5 小时、Weekly、重置时间、套餐及 Codex 配置 | 数据只来自本机 Codex App Server；失败保留最近成功额度，不采用 `auth.json + wham/usage` 私有接口 | `RAW-003`、`RAW-010`、`RAW-011` |
| 收起展示 | 水球与横卡都能低打扰表达额度和任务信号 | 水球双额度为中心 5h + 外环 Weekly，只保留一个进行中计数；按任务优先级使用彩色渐变、折射高光和三层水波；横卡按可见字段重排 | `RAW-002`、`RAW-013`、`RAW-014`、`RAW-032` |
| 分层水球 | 水纹保持单纯波浪，同时允许更高级的配色和外环变化 | 内层使用三层水平纯波浪与折射高光，开放 palette/透明度/波幅/四档速度；外层 Weekly 环开放连续/固定分段、粗细、颜色和光晕 | `RAW-021`、`RAW-032` |
| 展开与尺寸 | 浮窗移出后自动收缩，同时保留按显示器调整宽高 | 删除 Pin 和手动收缩控件；鼠标离开或交互焦点结束约 `220ms` 自动收缩，resize 不依赖 Pin，自动/手动尺寸继续受显示器工作区约束 | `RAW-014`、`RAW-032` |
| 最近任务 | 像 Codex Pets 一样优先看到进行中和完成未查看任务 | 最近 100 条未归档任务全部解析最新 Turn；归档任务完全过滤；三个 Tab 由同一比较器按业务桶与最近提问时间排序，partial cursor 明示仍有更多 | `RAW-028`、`RAW-029`、`RAW-031`、`RAW-034` |
| 状态语义 | 准确区分运行、等待、失败、中断、系统错误、未知、完成未查看和完成 | 只有同一 App Server 的 `active` 是权威运行证据；最新 Turn 的 completed/failed/interrupted 分别保留真实含义，`systemError/notLoaded/超时` 诚实降级且不得凭时间猜状态 | `RAW-028`、`RAW-034` |
| 打开、已查看、隐藏与归档 | 打开任务不应让它消失，并允许本地整理或显式上游归档 | `open` 不推进水位；隐藏完成未查看即标记 EyPc 已查看；删除独立确认动作；除权威 active 外均可二次核验后真实归档，归档成功或上游已归档后立即过滤 | `RAW-029`、`RAW-030`、`RAW-031` |
| 时间信息 | 能看出首次提问、最新一轮及完成所花时间，同时保持列表紧凑 | 最近提问时间只取最新 Turn `startedAt` 并用于统一倒序；创建、首次、运行耗时和完成时间进入 hover/focus Tooltip，任何时间都不得反推状态 | `RAW-008`、`RAW-023`、`RAW-029`、`RAW-034` |
| 首启诊断与兼容 | macOS/Windows 首次使用时自动发现依赖，失败时给出可执行提示 | 分项核查系统、CLI/运行时、相关进程、配置和 App Server；兼容 GUI/NVM PATH、本地静态 PAC 与 mixed-preload，成功连接证据高于旧能力缺失 | `RAW-010`、`RAW-011`、`RAW-016`、`RAW-018` |
| 快速显隐 | 用一个一致入口快速显示/隐藏悬浮组件 | EyPc 内快捷键、独立 uTools 全局功能和 Codex 页顶部第一操作共用显隐能力；配置页不重复放置下方开关 | `RAW-017`、`RAW-024` |
| 桌面可见性 | 固定到显示器后在该显示器的所有桌面持续可见 | macOS 始终置顶并启用所有普通/全屏 Space 可见，重建与显示器迁移后重施；设置页展示脱敏能力诊断 | `RAW-033` |
| 隐私与平台迁移 | 以后可迁移到 Easy Agent，同时不暴露对话内容和内部标识 | Renderer/存储不接收正文、摘要、raw thread/turn ID、cursor、cwd 或凭据；保留版本化 snapshot、匿名任务 key、短期 action alias 和 floating host 替换边界 | `RAW-008`、`RAW-009`、`RAW-023` |
| 明确非目标 | 保持插件轻量且聚焦 | 不做多 Provider、历史图表、自动更新、复杂动画、全文任务浏览或本轮全历史分页 | `RAW-004` |

## Capture Boundary

- Included: 早期 A1/B1/C1、D1/E1/F1 和 V2 演进事实；最新 RAW-035–044 对真实项目库存、完整分页、严格 Turn 时间、30 天窗口、五页签、项目结构、本地元数据、真实额度、常显操作按钮、原位多选/浮动批量栏、双向归档与隐私边界的最终纠正；同时保留环境诊断、宿主兼容、自动收缩、主题与 macOS all-Spaces 基础合同。
- Excluded: 原始 Prompt、对话转录、凭据、线程正文、Agent 推理、工具输出、命令和日志。
