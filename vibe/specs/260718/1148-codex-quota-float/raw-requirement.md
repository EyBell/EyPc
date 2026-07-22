# Codex 额度悬浮球与任务收件箱需求记录

Tool: codex
Date: 2026-07-22
Requirement version: `2026-07-22.10`
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
- `RAW-013` (`active`, `appearance-refined-by-RAW-051-and-RAW-054`): 水球采用深海高对比皮肤；早期“卡片必须纸白深墨”的硬限制由 RAW-051 修订为显式表面色/前景色配对与对比度约束，RAW-054 再补齐真实联动取色板与桌面悬浮伴侣暂态预览。真实横向皮肤、展开面板跟随当前皮肤及稳定的 `水球 / 卡片` 切换继续有效。
- `RAW-014` (`active`, `refined-by-RAW-040`): 水球/横卡共用额度投影并按实际字段自适应；展开高度在 `280–460px` 自适应，任务列表是唯一滚动区；水纹与主题继续遵循 reduced-motion 和对比合同，紧凑额度选择由 RAW-040 更新。
- `RAW-015` (`superseded-by-RAW-028`): 任务状态必须准确区分等待输入、等待审批、无等待标记的正在进行、需要关注、跨进程状态未知和已完成待查看；输入与审批标记可以同时存在。跨进程 `notLoaded`/最近活动不得因刷新次数或等待时间自动变成完成、待查看或可确认；后续 RAW-019 只增加不读取 items 的持久化 `completed + completedAt` 窄例外。
- `RAW-016` (`active`): Codex 功能启用后，EyPc 第一次启动需要在 macOS 与 Windows 上自动核查系统、受控 Codex CLI/运行环境、相关进程和本地配置；加载不到时，Codex 配置页必须分项显示原因与可执行的处理提示，并允许重新检测。
- `RAW-017` (`active`): 增加一个统一的 Codex 悬浮球显示/隐藏动作。插件窗口内提供默认快捷键，系统级全局快捷键通过独立 uTools 功能入口绑定；配置页必须显示当前使用方式并能直接跳转到 uTools 快捷键设置。
- `RAW-018` (`active`): 配置页不能在额度、配置与 App Server 已成功读取时仍显示“当前系统/CLI 不支持”。uTools 若暂时保留旧 preload，新增环境核查接口缺失只能作为兼容降级，成功的 App Server 连接必须成为更高优先级的可用性证据。
- `RAW-019` (`superseded-by-RAW-028`): 修正状态语义后不能让任务收件箱退化为“全部未知”。跨进程仍不得把 `notLoaded` 或时间新鲜度猜成完成；EyPc 可用 `thread/turns/list(itemsView=notLoaded)` 只读取最近持久化 turn 的状态元数据，并且只有带有效 `completedAt`、没有更新活动覆盖的 `completed` 才能把既有未知活动提升为待查看。`interrupted` 仍可能代表其他进程正在运行，必须保持未知；精确的跨进程运行中、等待输入和等待审批仍需共享 live authority。
- `RAW-020` (`superseded-by-RAW-032`): 展开面板默认继续按内容使用 `360×280–460px`，但锁定展开后允许拖拽或键盘调整宽高；最小 `340×280px`、最大为当前显示器工作区四周各减 `12px`。尺寸按显示器最多保存 8 条，收起态保持固定尺寸，位置重置与当前显示器尺寸重置必须互不影响；取消缩放恢复起始 bounds 且不保存。
- `RAW-021` (`active`, `refined-by-RAW-032-RAW-040-and-RAW-063`): 水球配置拆为共享水纹与外层兼容字段；水纹保留配色、透明度、波幅、运动和 reduced-motion。RAW-063 移除 Weekly SVG 外环和其可见配置入口，但保留外层持久化字段以兼容旧配置。
- `RAW-022` (`superseded-by-RAW-035-and-RAW-036`): 删除活动设置中的每组任务条数和定时保留配置；旧版 recent-100/partial 合同已由完整分页、原生项目过滤和滚动时间窗口取代。
- `RAW-023` (`active`): 任务行增加任务创建时间、首次提问时间、最近一次提问开始、最近运行耗时和具体完成时间。只有权威 running 在展开态实时计时；后台首问分页只读取 `itemsView=notLoaded` 的时间/游标元数据，raw thread/turn ID、cursor、cwd 和正文不得进入 Renderer、存储、日志或文档。
- `RAW-024` (`superseded-by-RAW-032`): 浮窗展开必须使用显式目标状态而不是盲目 toggle：悬停只临时展开，点击展开面板或锁定按钮后保持展开，手动收起不能被残留 hover 立即反弹。水球只保留水平周期波形，不得通过整体旋转制造虚假水纹；Codex 配置页的首个顶部操作直接控制悬浮组件显示/隐藏，不保留下方重复开关。
- `RAW-025` (`superseded-by-RAW-029-and-RAW-030`): 任务行保持紧凑，创建/首次/最近/耗时/完成时间通过 hover/focus Tooltip 查看。所有可见任务都可本地隐藏到 Header 的“已隐藏”区并释放，隐藏与释放都不修改 Codex；待查看任务隐藏后仍保持未处理计数，且行内原有 `确认已查看` 不得因新增隐藏/归档动作消失。
- `RAW-026` (`superseded-by-RAW-031`): 已完成待查看 receipt 不得因读失败、移出最近 100 条、Codex 已归档或重启而丢失。EyPc 应分页恢复未归档历史与归档来源，只在内存中保留 raw ID/cursor/action alias。可定位且状态未变化的待查看任务提供真正 Codex 归档；叉号需原位二次确认，归档前重读线程身份、允许状态、recency 与 newest completed turn，任一字段缺失/变化都拒绝，成功后同时确认该 revision。
- `RAW-027` (`active`): 额度/config 与任务读取使用独立的 App Server 请求参数和结果处理；一侧结构化失败不得把另一侧成功结果标为失败或丢弃。
- `RAW-028` (`active`, `live-authority-refined-by-RAW-056`): 任务快照升级为三种业务桶 `ongoing / completed-unread / completed`，并保留 `active / waiting-input / waiting-approval / failed / interrupted / system-error / unknown` 活动副状态。RAW-056 将实时权威从独立 App Server 更正为 Codex Desktop 伴随桥；最新 Turn 的 `completed` 仍直接形成完成版本，不要求 `completedAt` 追平可能晚更新的线程元数据。失败、中断、系统错误、未加载或超时必须显示准确副标签，不伪装成完成或仍在运行。
- `RAW-029` (`superseded-by-RAW-037`): 旧版任务区域为三个 Tab；当前五页签、搜索和纯最近提问时间倒序由 RAW-037 定义。
- `RAW-030` (`superseded-by-RAW-056`): 删除单条/批量“确认已查看”的交互继续有效；其“EyPc 本地完成版本水位决定未读、打开/隐藏推进已查看”的语义由 RAW-056 完全取代。旧 receipt 仅保留一版迁移/本地隐藏兼容，永远不得成为 Codex 未读权威。
- `RAW-031` (`active`, `refined-by-RAW-042-and-RAW-056`): 归档是上游状态，所有 archived 任务不进入普通快照；单条和项目归档的双向验证、批次与失败保留由 RAW-042 完整定义，RAW-056 在持久化验证成功后补充 Codex Desktop 即时归档通知。
- `RAW-032` (`active`, `refined-by-RAW-037-RAW-045`): 删除 Pin、确认已查看和手动收缩按钮；自动收缩、受限 resize、水纹和对比基础继续有效，展开顶部布局、水球额度与当前操作交互由 RAW-037–RAW-045 更新。RAW-045 重新引入 Codex 子窗内自有的不透明延时说明卡，但仍不挂载主应用 Tooltip 层，也不使用原生 `title`。
- `RAW-033` (`active`): macOS 悬浮子窗必须始终置顶并在固定显示器的所有普通 Space 与全屏 Space 可见；创建、显示器迁移和窗口重建后重新应用并在 Codex 配置页展示脱敏诊断。Windows/Linux 不得伪报该 macOS 能力。
- `RAW-034` (`superseded-by-RAW-035-and-RAW-036`): 旧版 recent-100 对每行做最新 Turn 解析；当前改为完整分页和整批完整性门禁，严格时间合同由 RAW-035/036 定义。
- `RAW-035` (`active`): 任务库存必须先真实读取 Codex 原生项目注册状态，再完整分页读取所有 `archived=false` 任务。归属优先原生 assignment、projectless→Chats、有效项目根最深 cwd；其余视为已从侧栏移除/未注册并排除。项目状态扫描前后必须指纹一致，变化时只完整重试一次。
- `RAW-036` (`active`): 时间窗口位于 Codex 设置，默认 30 天、可填 1–365 天、滚动边界包含；最近提问时间严格取最新 Turn `startedAt`，不以 `updatedAt` 回退。存在 Turn 却缺时间、分页失败或项目状态不可解析时整批失败，保留上一份已验证 stale 快照或展示错误空态。
- `RAW-037` (`active`, `refined-by-RAW-045-RAW-053-and-RAW-063`): 展开卡片顶部直接放任务页签，删除旧顶部样式/隐藏/刷新/设置/关闭按钮；其下为统一搜索、真实额度文字和任务内容。RAW-063 以四个可见页签 `动态 / 已完成 / 已隐藏 / 项目` 覆盖旧六页签约定；底层数组、`all/inputRequired` 兼容投影与最近 Turn 排序仍保留，搜索只过滤当前可见页签且不改源顺序。RAW-053 的显示层置顶分区继续有效。
- `RAW-038` (`active`): 项目页模拟 Codex 原生 `Pinned / Projects / Chats`：先原生置顶会话与项目，再追加 EyPc 本地置顶；其余项目遵循 project-order 且保留空项目，Chats 只含原生 projectless 会话，任何任务不得重复。
- `RAW-039` (`active`, `project-removal-refined-by-RAW-052`, `pin-feedback-refined-by-RAW-053`): 默认页签是进行中并持久化最后页签/项目折叠；任务和项目支持本地别名、搜索与 EyPc 置顶排序。旧“从 EyPc 移除/恢复”本地抑制语义由 RAW-052 取代；置顶的即时可见反馈由 RAW-053 补齐。只保存散列任务 key 和稳定项目指纹，不保存原始 ID、路径或任务列表；搜索词、选择、焦点和确认态不跨重启。
- `RAW-040` (`active`, `interaction-refined-by-RAW-050-and-RAW-063`): 水球不先显示迷你详情；早期整球悬浮直接展开合同由 RAW-050 收敛为上下半区命中。中心只显示最近重置的真实额度百分比，文字背景透明；RAW-063 移除外层 Weekly 轨道/剩余圆弧。展开卡片仍只展示服务端实际返回的 5 小时/周限额；只有 Weekly 时不得伪造 5 小时额度。
- `RAW-041` (`active`, `interaction-superseded-by-RAW-044`): 本条建立的 5 秒同位二次确认、点击/Ctrl/Shift 多选、Delete、方向键、详情/操作抽屉、别名、本地置顶、搜索、Ctrl+1…9 和独立 Codex 快捷键域继续有效；彩色点式操作区、hover 展开及 Space 自动下移已由 RAW-044 取代。
- `RAW-042` (`active`): 单条真实归档须重读身份、状态、latest Turn、版本和项目指纹，拒绝 active/inProgress/变化证据，写入后同时确认从 `archived=false` 消失并在 `archived=true` 出现。项目全部归档忽略 30 天窗口，跳过 active，20 条一批、并发 2、逐项双向验证并保留部分失败；批量真实写入只在另行授权临时项目时执行。
- `RAW-043` (`active`, `native-state-exception-refined-by-RAW-052`): Host Snapshot 升级 V2、Renderer 会话投影升级 V3；归档接口只接受短期 action alias、预期版本和来源指纹。除 RAW-052 的显式项目移除事务外，Codex 原生状态文件始终只读；不扫描 SQLite/LevelDB/正文，不让 raw ID、路径或私有状态进入 Renderer。
- `RAW-044` (`superseded-by-RAW-052`): 本条首次引入固定短字符槽和自避让批量栏；其旧字符集合、项目移除语义和选择细节均由 RAW-052 取代。彩色点、hover 展开、宽度动画及推动列表行仍保持禁止。
- `RAW-045` (`active`, `live-channel-superseded-by-RAW-056`, `interaction-refined-by-RAW-048-through-RAW-050-and-RAW-063`): 计数、高亮所有权、完整抽屉、全局激活和约 100ms 自动收起继续有效；六页签的可见导航由 RAW-063 收敛为四页签。其 App Server 状态通知、`200ms thread/list` 轮询、`当前动态/已完成未查看`分组和打开后推进本地已查看水位由 RAW-056 取代。
- `RAW-046` (`active`, `water-display-refined-by-RAW-063`): 额度与默认模型升级为 V2。EyPc 从本机 `account/rateLimits/read.rateLimitsByLimitId` 分离普通 `codex` 与 `GPT-5.3-Codex-Spark`（当前 `codex_bengalfox`）额度。水球按“普通 5 小时正余额 → 普通周正余额 → 最高正余额 Spark”选择；两个普通窗口均无正余额时才展示 Spark，并在百分比上方显示 `S`，但 RAW-063 不再绘制同池周额度外环。新会话模型策略固定为 `quota-auto`：任一实际返回的普通窗口为 0 时使用最高可用 Spark；缺失窗口不等于 0；Spark 模型或额度不可用时要求手选。`newThreadPreferredModel` 只影响普通阶段，弹窗临时选择不持久化。
- `RAW-047` (`active`): 点击项目 `＋`、Codex 域 `Ctrl+T`（展示 `c-t`）或右键“新建会话”每次都打开独立新会话编辑器。编辑器展示目标项目、冻结后的模型名称/ID、选择原因与对应额度，原生多行文本框自动聚焦并兼容系统听写；Enter 换行、Ctrl/Cmd+Enter 提交、Tab 在弹层内循环、Escape 清空临时草稿并恢复触发点。提交支持“发送并打开”和“仅创建空会话”；额度/目录/项目指纹变化时刷新说明并要求再次确认。文本模式专用瞬时桥接以精确 cwd/模型、`allowProviderModelFallback=false` 调用 `thread/start`，校验响应顶层 actual model/cwd 后才调用 `turn/start` 与线程 Deep Link。首轮失败清理零轮会话并保留内存草稿，清理不确定时停止自动重试；首轮成功但 Deep Link 失败只提供短期重试打开。文本提示词不得进入通用 action、快照、日志、存储、错误记忆、Deep Link 或剪贴板；图片回退由受限浮窗 IPC 仅复制用户文字并打开空白 Codex 会话，图片/预览 URL 仍只留内存，成功/取消/关闭后立即清除 EyPc 副本。
- `RAW-048` (`active`, `row-and-hover-refined-by-RAW-052`): 新会话归属、右键目标同步、单/批量抽屉边界、危险动作顺序、纯 Shift 隐私白名单及悬停/键盘所有权继续有效；其“单击选择/双击打开、项目只常显 +、无普通 hover 卡片”已由 RAW-052 取代。
- `RAW-049` (`active`, `escape-refined-by-RAW-051`, `quick-jump-refined-by-RAW-052`): 跨 Tab 迁移只复用交互合同，不复制业务内容。Codex 浮窗独立维护输入角色与暂态层；`Ctrl+T` 是可在设置页改键的 Codex profile 命令，按与主窗口相同的 `when`、layer 优先级和冲突可达性解析。Escape 总体恢复顺序与可聚焦层触发点恢复继续有效；RAW-051 进一步把单项层拆为 `详情 → 更多操作 → 关闭`。Quick Jump 的覆盖、裁剪、pointer、视口和命中栈过滤继续有效；RAW-052 改为行标记同步唯一高亮、固定操作按钮标记执行同一受门禁动作，并采用深色/白字普通态与黄色/深字激活态。允许迁移 MQTT 的本地状态机、预览定位/夹紧/内滚、Esc 内向恢复、禁用原因/`aria-live`，以及 Ports/Favorites 的“右键先同步目标再开完整抽屉”；明确拒绝 MQTT payload/提示词/正文预览、草稿历史/自动持久化/静默失败、主窗口 Tooltip/ConfirmLayer、原生 `title` 和主窗口焦点所有权。
- `RAW-050` (`active`): 收起态水球使用上下半区命中：指针进入或停留在上半区不得自动展开，三个数字角标保持直接可点击且 hover 不触发延时展开；只有指针进入下半区才立即展开卡片。球体显式点击与键盘激活继续可展开，触屏不通过 hover 自动展开；命中判定使用真实球面矩形与中线，不增加遮罩或改变角标布局。
- `RAW-051` (`active`, `color-interaction-refined-by-RAW-054`): Codex 配置页必须用一个模态事务同时编辑卡片表面色与文字/图标前景色；两组均使用常显 H/S/L 与六位 HEX 文本，不使用两个原生单色选择器。RAW-054 取代本条“仅滑杆编辑、草稿只影响模态预览”的交互细节，其整对 `4.5:1`、派生态 `3:1`、旧配置迁移、Controller 原子校验、取消零持久化、水球深色约束和会话层 Esc 回退合同继续有效。删除误加在浮窗中的水纹主色/辅色编辑器。会话层回退明确为二次确认 → composer/model → Quick Jump → Shift 预览 → 行内编辑 → 详情 → 更多操作 → 多选 → 搜索 → 收起：详情第一次 Esc 返回同一目标的更多操作并聚焦“查看详情”，第二次 Esc 关闭并恢复原会话行；`Ctrl+←/→` 不覆盖原始触发点，批量抽屉无详情子层并一次 Esc 关闭。
- `RAW-052` (`active`, `supersedes-RAW-039-local-remove-and-RAW-048-row-actions`): 会话行左键直接打开，只有左侧状态/选择槽点击或当前高亮项 `Space` 才切换选择；`Space` 新增选择后自动下移。任务行固定常显 `顶 / 隐（显）/ 归（确）/ +`，项目行固定常显 `顶 / 移（确）/ 隐（显）/ +`，每槽 `30px`、禁用保位、无宽度动画。状态槽和四个短字符按钮使用子窗自有、完全不透明的 `200ms` 说明层且不得设置原生 `title`；完整动作仍由右键/`Ctrl+→` 抽屉提供。项目“隐/显”只控制项目页分组，所属任务继续出现在其他任务页签和计数中；持久化 `hiddenProjectKeys`，升级时丢弃旧 `removedProjectKeys/removedProjectAbsentKeys` 而不自动修改 Codex。项目“移”必须真正模拟当前 Codex 桌面端 Remove：Renderer 只提交短期项目 alias 与 `sourceFingerprint`；Host 在 Codex Desktop 仍运行时返回 `codex-running` 并零写入，只从主 `.codex-global-state.json` 的 `local-projects/project-order/pinned-project-ids` 移除项目并在需要时清空 `selected-project`，保留 assignments、会话、目录和未知字段；主文件/`.bak` 同步临时写入、原子替换、双重重读核验，失败回滚并返回 `stale-source/unsupported-schema/write-failed`，成功返回 `verified`。Chats 不可移除。成功后清理该项目的 EyPc 隐藏/折叠/本地置顶/别名元数据。Quick Jump 普通标记统一深色底、白色粗体与白描边，当前标记黄色底、深色字与深描边，删除粉紫交替。未说明的视觉细节沿用项目现有权威，不重复确认；本项目开发验收由用户负责，Agent 只更新测试契约，不运行测试、类型、构建、uTools、截图、真实预检、归档或项目移除，交付固定为“未校验，待用户验收”。
- `RAW-053` (`active`, `pin-feedback-refines-RAW-037-and-RAW-039`): 用户反馈“置顶没有效果”。置顶必须在动作后的下一份投影中产生即时、可辨识的反馈：所有任务/项目卡片都要一致投影 `native/local` 置顶来源，本地置顶显示“本地顶”且按钮维持 `aria-pressed=true`；项目置顶进入项目页 `Pinned`，任务置顶在每个任务页签及动态页各状态段内稳定排到非置顶项之前。置顶区与非置顶区内部继续保持既有本地置顶顺序/最近提问顺序，搜索只过滤不另行重排；底层 V3 任务数组仍按 latest Turn 时间排序。浮窗动作桥接未送达时必须给出明确错误，不能静默表现为无效。仍遵循用户独占验收规则，不运行任何开发门禁。
- `RAW-054` (`active`, `refines-RAW-051-color-interaction`): 配对颜色模态必须提供两个同时可见的二维取色板，而非只提供滑杆；每个取色板以固定色相显示饱和度/亮度平面，低于 `4.5:1` 的不可选色域以斜纹弱化。选择一侧时锁定该色并把另一侧在保持色相/饱和度的前提下移动到最近的可读亮度；HEX、色相滑杆和取色板继续双向同步。每组标题旁的当前色块是可点击入口，在原位置展开 12 个可选色卡，支持方向键选择与 Esc 关闭；选择色卡走同一联动草稿事务。每个有效草稿都通过 Controller 暂态状态实时展示到真实桌面悬浮伴侣；已保存为水球时预览期间临时显示卡片。预览不得持久化，确认只原子保存一次完整颜色对象；取消、Esc、遮罩或组件卸载清除暂态状态并恢复上次保存的样式和颜色。桌面 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 只消费预览结果，不放置水纹或颜色编辑控件；水纹设置仍只属于 Codex 配置页。
- `RAW-055` (`active`, `refines-RAW-039-alias-and-RAW-052-row-interaction`, `density-refined-by-RAW-063`): 任务/项目列表主标题只显示一个名称：存在本地别名时显示别名，否则显示原始名称；原始名称仍参与搜索，并在存在别名时保留于详情和 Shift 预览。展开态主/次/微型文字采用 `12/10/9px` 层级，右侧四槽为 `24px`、间距 `2px`、操作区 `102px`，任务/项目行最小高度 `40px`。未进入选择模式时，任务标题点击打开 Codex 对应任务，左侧点击进入选择；一旦已有任一选中项，左侧和任务核心点击均切换该任务加入/移出，移出最后一项即退出选择模式。选中态必须有清晰渐变、强调边、光晕、hover/focus/active 组合反馈及 `aria-pressed`，键盘 Space/Escape/Delete/F/Shift 继续复用同一可见状态。开发验收继续由用户负责，本轮只更新测试契约，不运行测试、类型、构建、uTools、截图或真实 Codex 操作。
- `RAW-056` (`active`, `supersedes-RAW-030-unread-and-RAW-045-live-channel`): Easy Agent 尚未实现时，EyPc 采用双通道临时适配：Codex App Server 继续负责额度、模型、库存、创建和可验证的持久化归档；macOS 本机 Codex Desktop 私有 IPC 伴随桥只负责实时 `Input / 正在进行中 / 已完成未读` 权威及归档后的侧栏刷新通知。只有桌面桥 `connected` 的 live snapshot/patch/request/read-state 才能产生 `waiting-input / waiting-approval / active`；桥未运行、连接失败或协议不兼容时立即降级为“宿主状态未知”，不得用 App Server 状态、本地缓存、五秒启发或刷新频率猜测，也不得计入 Input/进行中角标。完成未读只由“最新 Turn 已完成 + Codex 自身 `hasUnreadTurn`”成立；桌面未连接时可读取 Codex Desktop 持久化 unread 集合作为 `desktop-persisted` 权威，但 EyPc 打开、隐藏或恢复任务均不得更改它。桌面全量会话快照可在 preload 内瞬时用于状态投影，但正文、摘要、raw ID、cwd/路径不得进入 Renderer、存储、日志或文档；socket 目录/文件 owner 与 mode 必须安全，协议版本不匹配 fail-closed。归档仍先走 App Server `thread/archive` 并完成 `archived=false/true` 双向验证，随后向已连接桌面端发送版本化 `thread-archived` 通知；通知失败不回滚已验证的持久化归档，但 UI 必须区分“已通知刷新”和“桌面端未确认即时刷新”。普通活动 watchdog 改为 `5s`，连续三次失败时临时 `1s`；Easy Agent 后续可替换当前两条 provider 通道而不改 Renderer 匿名投影。开发验收仍由用户负责，本轮不运行测试、类型、构建、uTools、截图、真实预检、真实归档或项目移除。
- `RAW-057` (`active`, `selection-contrast-refines-RAW-055`): 用户验收指出 RAW-055 的多选视觉仍不够明显。进入选择模式后必须常显“选择模式 / 已选 N 项 / Esc 退出”状态条；未选任务行整体降低不透明度与饱和度，选中行使用 `2px` 强调边、`5px` 左强调轨、更高比例强调底色和双层焦点/阴影。左侧已选控件不再保留易混淆的状态图标，改为强调色实底与明确勾选符号。选择态与非选择态、选中与未选中不得只靠同色系轻微色差区分。
- `RAW-058` (`active`, `refines-RAW-050-RAW-053-and-RAW-057`): 多选入口改为任务行左侧 `38px`、贯穿 `40px` 行高的矩形状态区，始终显示状态图标；选中行使用现有 `accent/running/pending/surface` 三色主题渐变，hover/focus/active 逐级增强，未选行继续降权。普通态左区选择、中部打开，Ctrl/Cmd+中部只选择；选择态左区与中部都切换成员，最后一项移除即退出。任务行 Space 切换选择，左区按钮和右侧动作按钮保留原生 Space/Enter 所有权且只执行一次。行尾不再展示“本地顶”；`顶` 控件以 warning 色表示 EyPc 本地置顶，并用 200ms hover/focus 说明表达本地、Codex 原生、未置顶与 Chats 来源。原生/Chats 使用可聚焦 `aria-disabled=true`，点击、Enter、Quick Jump 和快捷键统一经过只读门禁。水球三个数字角标使用共享不透明说明层，200ms 后展示数量/点击作用；hover/focus 不展开、不切页、不触发延时展开，点击合同、位置和计数来源不变。只更新测试契约和文档，不运行测试、类型、构建、uTools、截图或真实 Codex 操作。
- `RAW-059` (`active`, `refines-RAW-016-and-RAW-056`): Easy Agent 完成前，Input、正在进行中与已完成未读仍只以 Codex Desktop 的 live/read authority 为准；手动选择或自动发现 CLI 只影响 App Server 启动，绝不把插件缓存提升为状态权威。配置页必须自动诊断 macOS/Windows 受控候选，并允许用户通过本机文件选择或完整路径可选地保存一个本机插件存储中的 CLI 可执行文件绝对路径；完整路径不回显、不进入环境快照、日志或文档。手动位置先经受控运行计划核验，失败必须明确提示并允许恢复自动发现。未设置手动位置时继续使用自动发现与既有本地 App Server 连接器，并明确提示连接可能有延迟；该降级仅保留额度、库存、创建和已验证归档，Input/进行中/完成未读仍显示未知而不是由缓存补猜。Windows 继续支持 npm/Volta/NVM/本地/PATH 的 CLI 发现及 shim 核验，但当前私有 Desktop IPC 实时桥仅是 macOS canary，Windows 不得伪报同等实时能力。开发验收仍由用户负责，本轮不运行测试、类型、构建、uTools、真实预检或真实归档。
- `RAW-063` (`active`, `supersedes-visible-six-tab-and-weekly-ring-details`): 悬浮卡片的可见导航固定为 `动态 / 已完成 / 已隐藏 / 项目`；`全部`、`待输入`不显示、不可路由。底层 `all` 与 `inputRequired` 投影继续保留给注册提示、紧凑待输入角标和单条直开，旧持久化/快照/`codex.tab.set` 的 `all/input` 必须规范化到稳定 ID `ongoing`，不得闪现隐藏页。动态页只展示最近 6 小时内 `max(lastTurnStartedAt,lastTurnCompletedAt)` 有活动的非隐藏任务，依次为待输入、正在进行中、需关注、宿主状态未知、已完成未读、已完成；完成任务在窗口内仍可见，`updatedAt` 不得作为状态或活动时间回退。普通点击标题直达会话，Ctrl/Cmd 标题点击只选择；项目/状态/分钟元信息行只聚焦并高亮，以继承 `Ctrl+T` 项目上下文。四个常显操作维持 `24px / 2px / 102px`。注册提示只显示“最近 N 天的 M 条”。移除水球 Weekly SVG 外环和无效配置入口，保留内部水球、百分比、角标、展开额度及旧外层持久化字段兼容。开发验收仍由用户负责，本轮不改测试也不运行测试、类型、构建、uTools 或真实宿主操作。

## Latest Superseding Requirement Map

| 主题 | 当前唯一合同 | 来源 |
| --- | --- | --- |
| 真实库存 | 原生项目注册 + 完整未归档分页 + 固定归属优先级 + 指纹一致 | `RAW-035`、`RAW-043` |
| 时间与完整性 | 1–365 天滚动窗口；latest Turn `startedAt`；整批 fail-closed | `RAW-036` |
| 列表与项目 | 四个可见页签；动态页最近 6 小时的六段优先级；统一搜索、底层最近 Turn 开始时间倒序、显示层置顶优先、Pinned/Projects/Chats；`all/inputRequired` 仅作兼容投影 | `RAW-037`、`RAW-038`、`RAW-045`、`RAW-053`、`RAW-056`、`RAW-063` |
| 实时状态与未读 | Codex Desktop live IPC 是 Input/进行中唯一权威；完成未读使用 Codex 自身 unread；无 live authority 即显示宿主状态未知且不计数；CLI 手动/自动发现不改变该边界 | `RAW-056`、`RAW-059` |
| 本地整理 | 页签/折叠持久化、别名优先且无别名回退原名、置顶来源由“顶”控件及说明表达、项目分组隐藏；旧本地移除迁移丢弃 | `RAW-039`、`RAW-052`、`RAW-053`、`RAW-055`、`RAW-058` |
| 真实项目移除 | Codex 退出门禁、短期 alias/指纹、主文件限定字段、主/备原子写入与回滚核验；不删目录/会话 | `RAW-052` |
| 额度、水球与模型 | 普通 5 小时→普通周→Spark；Spark `S`；无 Weekly 外环；上半区角标安全且提供 200ms 作用说明、下半区 hover 展开；缺失窗口不等于 0；`quota-auto` 与本次手选 | `RAW-040`、`RAW-046`、`RAW-050`、`RAW-058`、`RAW-063` |
| 卡片颜色 | 两个联动二维取色板、同位置色卡入口、受限色域、真实悬浮伴侣暂态预览/取消回滚、整对原子提交与旧配置迁移 | `RAW-013`、`RAW-051`、`RAW-054` |
| 新会话与瞬时桥接 | 每次打开编辑器；冻结/刷新确认模型；精确 `thread/start → turn/start → Deep Link`；提示词零持久化 | `RAW-047` |
| 选择、右键与 Shift | 普通态中部打开、Ctrl/Cmd+中部或 38px 左区进入选择；选择态左区与中部均切换成员，最后一项移出即退出；子按钮拥有原生 Space/Enter | `RAW-041`、`RAW-045`、`RAW-052`、`RAW-055`、`RAW-058` |
| 快捷键与层级恢复 | `Ctrl+T` Codex profile、浮窗本地 layer/input-role、`详情 → 更多操作 → 关闭` Escape LIFO、原触发点恢复、Quick Jump 可见性/遮挡过滤 | `RAW-049`、`RAW-051` |
| 原生归档 | 单条和项目逐项双向验证；desktop-live active 拒绝；部分失败保留；验证后通知桌面端即时刷新 | `RAW-042`、`RAW-056` |
| 隐私 | 除真实项目移除限定事务外原生状态只读；桌面快照仅在 preload 瞬时投影，Renderer/持久化/日志不含 raw ID、路径或正文 | `RAW-043`、`RAW-052`、`RAW-056` |
| 启动发现与降级 | 自动扫描受控平台候选；可选手动 CLI 位置仅保存在本机插件存储且不回显；无手动位置使用旧 App Server 连接器并公开延迟/未知状态边界 | `RAW-016`、`RAW-056`、`RAW-059` |

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

- Included: 早期 A1/B1/C1、D1/E1/F1 和 V2 演进事实；最新 RAW-035–063 对真实项目库存、完整分页、严格 Turn 时间、30 天窗口、四个可见页签与 6 小时动态流、Codex Desktop 实时状态/未读权威、项目结构、本地元数据、控件化置顶来源、真实项目移除事务、普通/Spark 额度、无外环水球与角标说明、`quota-auto`、瞬时新会话、常显四槽/两态选择、纯 Shift 预览、浮窗暂态层、高对比 Quick Jump、双向归档/桌面刷新通知与隐私边界的最终纠正；同时保留环境诊断、宿主兼容、自动收缩、主题与 macOS all-Spaces 基础合同。
- Excluded: 原始 Prompt、对话转录、凭据、线程正文、Agent 推理、工具输出、命令和日志。
