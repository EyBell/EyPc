# Codex Companion 真实会话与交互交接

Tool: codex
Date: 2026-07-29
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-29.2`

## Result

- RAW-111 解释了“当前源码应为 1、运行浮窗仍为 5”的最后一层问题：Computer Use 确认角标与展开卡片内部一致，但官方线程只读状态和 [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 都表明旧任务已经完成、当前只剩 1 条 active；运行 uTools 的 Preload/主 Controller 早于当前文件，而浮窗 Renderer 更新较新。现在 [codex.ts](../../../../src/domain/codex.ts#L1) 的无隐私 `CODEX_TASK_STATE_REVISION` 贯穿 Preload capability、production adapter、Controller 和浮窗快照：旧 Preload 时 Controller 清空任务数字但保留额度，旧主 Controller 时新浮窗也自行抑制三个角标并提示重载。该门禁不改任何抖动计时或任务状态语义，必须正常重载 uTools 插件后才会恢复真实数字。
- RAW-063 已将展开任务导航收敛为 `动态 / 已完成 / 已隐藏 / 项目`。`all/inputRequired` 仍是底层兼容投影，但 `all/input` 的旧页签持久化、旧快照和外部设置均直接回落到 `ongoing`，不会再短暂显示“全部”或“待输入”。
- RAW-089 将未知/传输异常收敛为进行中；RAW-091 再把 terminal Turn + exact live idle/not-running 的明确停止拆出为“已停止”。当前动态页顺序是待输入、正在进行中、已停止、已完成未读、已完成；bridge failed、系统错误、notLoaded、inProgress 与权威缺失仍显示“进行中”。标题普通点击直达，Ctrl/Cmd 标题点击选择，元信息行只聚焦高亮以继承 `Ctrl+T` 的项目上下文。
- RAW-108 把上述状态段与角标收敛为一个 Renderer 展示投影：[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 从 Controller 稳定快照一次生成最近 6 小时、非隐藏的互斥动态段和 active 数；`active / waiting-approval / ongoing` 都进入“正在进行中”，waiting-input 不重复，stopped 立即离开。浮窗动态 Tab、状态段、三个角标、主水球摘要及设置页预览共用这一结果；搜索只过滤展开行，隐藏/超过 6 小时任务不进入 active，待输入/完成未读仍使用含隐藏的完整集合。
- RAW-109 将“上一个/下一个 Codex 任务”的普通候选同步到这份展示资格：[codexController.ts](../../../../src/runtime/codexController.ts#L1) 依次使用完整待输入与最近 6 小时、非隐藏 active 组，不再读取整个 30 天 ongoing 桶。完成未读保留独立首条动作；只有普通池为空且用户明确在 EyPc 本地置顶时，非停止的旧/隐藏任务才可作为回退。所指旧任务已由用户主动归档，但修复不依赖归档。
- RAW-110 缩短正向状态路径：[preload/index.js](../../../../preload/index.js#L1) 与 public 镜像从 `thread/started.params.thread.id` 精确标脏全新任务，安全库存登记因此只重读该任务的 latest Turn；对已登记任务则直接消费完整更新的 inProgress，并把完整、新鲜且单调的 completed Turn只按状态/开始/完成时间发布为匿名 `targeted-after-exit`，不再等待额外 RPC。未知/畸形/旧或非目标通知仍走 50ms dirty-task / 3 秒定向核验，待输入优先和全部防抖/隐私门禁不变。
- RAW-065 已恢复仅由 Weekly 数据驱动的 SVG 进度环及连续/20 段、粗细、颜色和光晕设置。用户跟进截图暴露的最外层完整圆来自宿主水球按钮 focus outline，并被根整圆背景与同尺寸外发光强化；当前连同 inset、border、inset outline 与 shell 一并删除，键盘焦点改为中央读数下划线。无 Weekly 时不显示任何外圈；历史 `shellOpacity` 只保留持久化兼容。
- RAW-066 保留上游 interrupted 原始证据；RAW-089 把不确定异常统一为进行中，RAW-091 只在同一任务同时具备 live idle/not-running 明确停止证据时投影“已停止”。进行中角标不再计算这些停止项；动态/项目/已隐藏卡、详情与 Shift 预览统一消费同一桶，`attentionCount/unknownCount` 固定为 0。
- RAW-082 收敛 RAW-067 的完成未读路径：水球完成未读角标与 `eypc-codex-completed-unread` uTools 全局功能/快捷键共同调用 `codex.completed-unread.openFirst`，都按完整计数集合的置顶优先/稳定源顺序取第一条，立即仅在 EyPc 本地确认该任务当前完成 revision 后打开。该 revision 在全部 EyPc 视图立即变为 completed/read，后续完成 revision 自动重新未读；不写 Codex Desktop 原生 unread。待输入继续使用完整 `inputRequired` 只打开第一条，不改状态；进行中角标仍只展开。
- RAW-083 调整紧凑悬浮窗空间合同：待输入在左下，已完成未读占据最右下角、进行中位于其上方；主体上方三分之一才会通过 hover/点击展开，下半区才会开始拖拽，中间三分之一不产生动作。计数按钮、键盘显式展开、触屏 hover 抑制和 Host 拖拽协议保持不变。
- RAW-084/105/106 的两个 uTools 前后任务功能由 RAW-109 细化：普通循环现在依次使用完整待输入与同源最近 6 小时、非隐藏 active 组，按匿名 key 去重并回绕；完成未读保留独立首条动作，不进入通用循环。普通池为空时，当前非停止态的 EyPc 本地置顶任务仍以相同稳定显示顺序回退，原生置顶和已停止任务不参与。循环游标只留在内存，通用命令只打开任务、不改隐藏/页签或 Codex Desktop unread；配置页分别提供 uTools 绑定入口。
- RAW-087 取代 RAW-085/086：用户确认移除入口读取后 uTools 恢复加载，现已删除全部宿主快捷键回读、私有同步 IPC、运行时快照和 Codex/窗口页反馈；所有入口只打开官方 uTools 配置。Codex 配置页默认显示置顶“快捷方式”Tab，另分“任务 / 水球 / 卡片 / 运行”，只渲染当前面板并将详细说明收进可聚焦信息按钮。项目规则 `EYPC-UTOOLS-HOST-001` 与已验证错误共识已固定，后续 preload/Renderer 变更必须保持入口零同步宿主依赖。
- RAW-088 将内置外观主题固定为 12 套，并统一模仿默认海盐材质：`gradient` 液体、实体圆环（无分段钟表环）、球体底色不透明、软光晕与额度环色。十二套仅以色相区分（海盐/石墨/靛砂/极光夜/琥珀雾/霓虹潮/绯焰/翠璃/紫电/日曜/冰棱/玫璃），配置下拉与预览/真实浮窗共用同一预设表。
- RAW-068 让投影 ongoing 与 desktop-live active 共用稳定的 `blocked-active`；RAW-091 的 stopped 使用 `blocked-stopped`。RAW-089 的 completed-only 归档门禁不变：固定 `归` 槽保持可见但禁用，停止任务给出“会话已停止但未完成”的精确原因，抽屉、Shift 预览、确认和批量候选共用同一 capability。
- `completionPresentationDelayMs` 继续允许 `0 / 500 / 1000 / 1500 / 2000 / 3000ms`，当前代码默认值为 `0ms`，配置页已纠正为“不等待（默认）”；已有用户持久化值保持不变。它只平滑普通快照确认的 completed，RAW-110 的完整 Turn 通知和既有 active-exit 定向强证据均立即发布；Renderer 没有独立角标延迟。
- RAW-089 删除固定 2 秒 Activity Delta 防抖。Desktop active 退出立即投影为进行中，同时在 preload 对该任务做总计 3 秒有界的 latest-Turn 核验；Controller 和 Preload 都拒绝把 active 前未变化的旧 completed revision 当成本轮完成。成功随脱敏 delta 发布，失败才触发完整库存校对。`taskRefreshSeconds=15` 是新任务、项目变化和漏事件的完整校对周期，不是实时状态缓存。
- RAW-090 不再把单次完整快照中的任务缺行立即发布为任务消失。Controller 保留上一份内存稳定清单、标记 stale 诊断并自动完整复核；只有同一 missing-key 集合在至少两份完整快照中连续成立且经过 `max(15s, taskRefreshSeconds)` 后，才一次性接纳数量下降。期间重现、候选集改变或中间读失败都会重置。
- RAW-091 修正旧 `4 ongoing` 偏差：本机匿名会话级复核证明纠偏检查点实际是 `2 active + 2 live-idle/interrupted`。领域/Controller/浮窗现在增加独立 stopped 桶；active 永远优先，active→idle 首个携带旧 terminal 的 ordinary delta 先保持进行中，退出后定向重读用有限证据标记确认同 Turn 停止，通常无需等 15 秒完整校对；bridge not-running + failed/interrupted 可直接停止。纠偏预检为 `18 = 14 completed + 2 stopped + 2 ongoing`；收尾时库存新增一条 exact active，最新为 `19 = 14 + 2 + 3`，其中 `3 active / 0 unconfirmed ongoing`。
- RAW-092 把正向时效与负向稳定拆开：started/turn/未知任务/Desktop 未登记主任务事件发 urgent delta，Controller 50ms 合并并在读取中事件到达时补读；preload 的事件库存读只重读 dirty/无缓存任务，普通 15 秒周期仍全量。未登记 Desktop shadow 在完整库存建立匿名身份后直接发布首次待输入；`targeted-after-exit` completed 强证据直接完成，不再叠加普通配置展示窗。任务缺行、状态回退、无证据停止/完成仍按 RAW-090/091 保守处理。
- RAW-093 将“计划已完成但等待确认/实施”明确归入待输入。本机 Desktop 的未决 `item/plan/requestImplementation` 现在直接映射为 `waitingOnUserInput`；即使同批 runtime 已 idle，也由未决请求立即覆盖为 desktop-live active。已登记任务不发库存 RPC、不等待 50ms/15 秒或普通完成展示窗；请求移除后按最新 runtime/Turn 收敛，未知请求不扩大推断。
- RAW-094 修正“任务已结束但仍显示进行中”的 live shadow 重订抖动：Desktop 的 Turn/工具/正文等未观察私有 patch 现在只推进 revision，不再清空 shadow 后重新订阅；四个状态相关 root 仍严格校验。三分钟修正前采样复现 active 退出/复活，当前源码 30 秒处理 59 patch 且零重订/零替换 snapshot。运行中的 uTools preload 不受 Vite HMR 更新，真实视觉验收前需重新连接/重载插件。
- RAW-095 修正“在 Codex 外部归档后 EyPc 不消失”：Desktop `thread-archived` 和 App Server `thread/archived` 仅在 preload 已有当前映射时携带既有匿名 key。Controller 立即移除该精确投影与本地 receipt、清理瞬态状态，并排队 50ms urgent 完整复核；未映射、unarchive、delete、畸形事件与普通缺项不移除，继续保留 RAW-090 的跨周期隔离。
- RAW-096 修正“任务已完成却仍长期显示进行中”的旧 live shadow 优先级：每段 Desktop-live active 只在进入该段时记录匿名本机观察时刻，完整库存重投影不刷新它。latest Turn 明确 `completed` 且 `completedAt` 严格晚于该时刻时，领域与 Controller 让较新完成证据取代旧 shadow；没有时刻、较早完成、非 completed 或传输不确定仍保留 active。没有新增超时、recency 或 connector 完成推断。
- RAW-097 修正“在 Codex 中手动阅读后已完成任务变进行中”：Desktop direct read-state 与只含 `hasUnreadTurn` 的 patch 现在只发送匿名 key、已读值与 read authority，并标为 `readStateOnly`；Controller 只更新未读，忽略其中任何 status、active flags、active interval 或 Turn 字段。实际 runtime/request 改变仍通过完整 live delta，因此新任务不会被压制。
- Activity Delta 与完整快照现在共用单调 latest-Turn 合并：更旧 `startedAt`、同 Turn completed→异常回退、`completedAt` 回退和 `updatedAt` 变小都不覆盖新证据。已验证的归档/项目移除仍立即收敛，不被误当成传输抖动。该稳定状态只留当前 Controller 内存，不持久化任务列表。
- RAW-081 修正 Desktop live shadow 的缺字段处理：snapshot/patch 未带 `hasUnreadTurn` 时不再把最近成功读取的 Codex persisted unread 覆盖为 unknown/false；明确 live read-state 仍优先，持久化 unread 集合不可读才降为 unknown。已知等待输入/审批请求的 type/method 在只删除分隔符后匹配，因此 `request_user_input` 等同义命名不会漏掉；RAW-093 进一步允许兼容 Desktop live shadow 中的有限未决请求把同批 idle 提升为 active，connector/未知请求仍不能产生待输入。
- RAW-079 同时将水球百分比读数独立配置为位置、字号、字形和颜色；默认居中、22px、加粗、白色。配置页预览和桌面水球共用 `CodexWaterBall` 与同一持久化水球对象，内置/已保存主题一并带走。
- RAW-070 的 60 秒 interrupted 完成推断已由 RAW-089 删除；interrupted 不会凭时间完成。它在传输/权威不确定时保持进行中，在 RAW-091 的 terminal + live idle/not-running 明确组合下显示已停止。
- RAW-071 将 Codex 配置页重构为水球、卡片和状态信号三个独立外观区。水球区直接标出底色、液体 A/B、Weekly 进度/轨道和三个角标；卡片表面/前景只在卡片区；状态色只在状态信号区。颜色立即保存并直接渲染，存储、派生和 Controller 均不再因格式、对比度、联动色域或自动调整恢复旧值。quota 模式下 Weekly 进度色仍按当前状态色派生，切到自定义模式才使用专用进度色。
- RAW-072/073/074 将配置页和真实浮窗收敛到同一个 `CodexWaterBall`：两端共同消费同一额度投影、液体/环设置和颜色。共享组件保留既有三层 SVG 水波、折射、高光及 motion 时序，不再用静态液体层替换；由简化层引入的底部矩形已移除。球体底色新增 `0%–100%` 透明度；`0%` 只去除球体底色及其阴影，液体、Weekly 环、读数和可点击角标保持。
- RAW-075 将“卡片”区明确为悬浮展开卡片：预览展示页签、搜索、额度和任务区，并使用真实展开卡片相同的 card surface/foreground token；两个控件清楚标明表面与文字/图标分别影响的区域，不再以收起态横向小卡片代指。
- RAW-076 进一步将展开大卡片的主题从两个笼统颜色提升为九项独立令牌：主/内层面板、边框、主/次文字、选中、焦点、进行中和完成未读。它们随内置和保存主题持久化；浮窗展开时直接读取同一对象，不再受收起态水球或小卡片皮肤影响。
- 四个短字符动作保持 `24px`，间距收敛为 `2px`、轨宽 `102px`；注册提示只保留“最近 N 天的 M 条”。

- Easy Agent 完成前采用双通道临时适配：Codex App Server 继续提供额度、模型、库存、创建和持久化动作；macOS Codex Desktop 私有 IPC 伴随桥提供 `Input / 正在进行中 / 已完成未读` 实时权威及归档后桌面侧栏刷新通知。当前不能删除插件内 App Server 连接器。
- CLI 启动采用受控自动发现，配置页可选地保存一个经运行计划核验的本机手动 CLI 位置；完整路径不回显或跨 Renderer。未设置手动位置时保留现有 App Server 连接器并公开可能延迟。该降级不使用插件缓存猜测 Input、正在进行中或已完成未读；Windows 只提供 CLI 发现/连接器，Desktop IPC 实时桥仍为 macOS canary。
- Codex Companion 已从 recent-100 近似库存升级为真实原生项目库存：只读解析 Codex 项目注册状态，完整分页读取未归档任务，并用 assignment、Chats、最深 cwd 的固定优先级过滤已移除/未注册项目。
- Host Snapshot V2 只有在项目指纹、完整分页和每条 latest Turn `startedAt` 全部有效时才发布 `verified`；中途项目变化重试一次，失败保留上一份已验证 stale 快照或展示错误空态。
- 会话投影 V3 使用默认 30 天、可配置 1–365 天的滚动窗口，边界包含。底层任务数组均按最新提问时间严格倒序；显示层在每个任务页签及动态页各状态段内把置顶项稳定前置，置顶/非置顶分区内部仍保留原顺序，搜索只过滤不重排。
- 项目页按 Codex 原生 `Pinned / Projects / Chats` 结构展示，不重复任务并保留空项目；原生顺序只读，本地置顶进入 `Pinned` 并可排序。行尾不再追加“本地顶”；任务/项目的 `顶` 控件统一表达来源与按下状态，本地使用 warning 色，原生/Chats 可聚焦但由 `aria-disabled` 只读门禁阻止点击、Quick Jump 和快捷键动作。
- 任务和项目支持本地别名；列表有别名只显示别名、无别名显示原始名称，不再用缺失展示字段制造“未命名任务”。原名仍可搜索，并在存在别名时保留于详情和 Shift 预览。最后页签和项目折叠跨重启恢复，搜索词、选择、焦点和确认态不跨重启。
- 旧“从 EyPc 移除/恢复”本地抑制已删除。项目“隐/显”只控制项目页分组，任务仍在其他会话页签；旧 removed 集合升级时直接丢弃，不自动修改 Codex。
- 展开卡片的第一行就是四页签，其下依次为统一搜索、服务端真实额度文字和内容；旧水球/卡片切换、隐藏、刷新、设置、关闭工具栏已从展开面板删除。
- 水球不再先弹出迷你详情：上半区 hover 不展开，三个数字角标可直接点击，并在 hover/focus 200ms 后通过共享不透明层说明数量与点击作用；说明不会展开或切页。指针进入下半区才立即展开。球体显式点击/键盘激活仍有效，触屏不模拟 hover；键盘聚焦以中央读数下划线提示，不绘制外部整圆。额度按普通 5 小时正余额、普通周正余额、最高正余额 Spark 选择；两个普通窗口均无正余额时显示 Spark，百分比上方出现 `S`。存在 Weekly 读数时绘制同池剩余进度环，无 Weekly 时无外圈；根背景透明、表面无同尺寸外发光，普通装饰圆环永不显示。缺失窗口不伪造也不等于 0。
- 默认模型策略是 `quota-auto`：普通阶段使用配置的 `newThreadPreferredModel`，否则用目录默认/首个非 Spark；任一真实返回的普通窗口为 0 时切换最高可用 Spark，Spark 不可用则要求手选。本次手选不持久化。
- 点击项目 `＋`、`Ctrl+T` 或右键新建每次打开新会话编辑器，显示目标项目、模型名称/ID、选择原因和额度。原生 textarea 支持系统听写；Enter 换行、Ctrl/Cmd+Enter 提交、Tab 圈定、Escape 清稿并恢复触发点。冻结选择在额度/目录/项目变化后会刷新并要求再次确认。
- 左下待输入角标仍按完整集合更新；右下最边角的完成未读经同一首条解析立即在 EyPc 本地确认当前 completion revision 后打开，进行中位于其上方并保持只展开行为。三个数字、主水球 ARIA 与设置预览消费同一展示投影；active 只统计最近 6 小时、非隐藏的 `active / waiting-approval / ongoing`，不再维护全窗口/隐藏计数或自己的延迟窗口。图片可由文件选择、拖放或提示词框粘贴进入临时编辑器预览。
- 专用瞬时桥接以精确项目 cwd/模型和 `allowProviderModelFallback=false` 创建线程，校验响应顶层实际模型/cwd 后才发送首轮并打开线程 Deep Link。首轮失败清理零轮线程，清理不确定时停重试；首轮成功但打开失败只保留短期重试打开。除用户触发的图片回退复制外，提示词不进入通用 action、快照、日志、存储、文档、错误记忆、Deep Link 或剪贴板。
- 当前 App Server 只声明文本输入；带图片时不建 App Server 线程，而是通过受限浮窗 IPC 复制首轮文字、打开 Codex 空白会话，由用户手动粘贴图片并选择模型。该用户触发的剪贴板回退是提示词唯一允许的复制路径。
- 任务行常显 `顶/隐显/归确/+`，项目行常显 `顶/移确/隐显/+`，每个动作缩为 `24px`、间距 `2px`、四槽区 `102px` 且禁用保位；任务/项目行最小高度 `40px`，展开态信息使用 `12/10/9px` 层级。右键/Ctrl+右完整抽屉继续提供完整单项/批量动作。
- Codex 悬浮子窗不挂载主应用 Tooltip，也不设置原生 `title`；水球保持无额度气泡。状态槽和短字符按钮使用子窗自有、完全不透明的 200ms 说明层；按住纯 Shift 继续显示白名单只读预览，正文、摘要、raw ID、cwd 或路径永不进入展示。
- 未进入选择模式时，会话中部左键打开 Codex，Ctrl/Cmd+中部只选择，左侧 38px 全高矩形选择区建立选择；已有任一选中项后，中部和左区均切换当前任务加入/移出，移出最后一项即退出。`选择模式 / 已选 N 项 / Esc 退出` 现在绝对悬浮在列表舞台底部，非普通流元素；滚动区预留底部安全空间，若批量栏置底则其上移避让，故提示的出现/消失不会改变列表顶部、可视高度或任务行坐标。未选行降权，选中行使用 accent/running/pending/surface 三色主题渐变及强化 hover/focus/active；左区始终显示任务状态图标并同步 `aria-pressed`。任务行、左区按钮和右动作按钮分别拥有 Space/Enter，不重复触发。
- 只有 Codex Desktop `desktop-live` snapshot/patch/request/read-state 才能产生待输入、等待审批或权威 active；其它来源不得伪造 live authority。桥失败、连接中或协议不兼容时任务以保守 ongoing 保持“进行中”；桥明确 `not-running` 且 latest Turn 为 failed/interrupted 时才是“已停止”。普通 watchdog 为 5s，连续三次失败临时改为 1s；进行中角标严格统计最近 6 小时、非隐藏的 `active / waiting-approval / ongoing` 展示段。
- 同页只有一个高亮项，方向键和真实鼠标移动按所有权切换；Shift+↑/↓ 只更新高亮/预览，不改变多选。右键未选先单选、已选保留多选，项目右键清任务选择。`Ctrl+T` 是设置页可改键的 Codex profile 命令；浮窗本地解析 `when`/layer、维护 `codex-composer` 输入角色和 Escape LIFO。Quick Jump 过滤裁剪、遮挡、pointer-events、视口与命中栈，会话标记只聚焦。`codex.float.activate`/uTools 入口继续直接显示、展开并聚焦卡片。
- 完成未读由最新 Turn completed 与 Codex 自身 `hasUnreadTurn` 共同决定；live read-state 优先，桌面断线时可读取 Codex 持久化 unread 集合。EyPc 打开、隐藏或恢复任务都不会确认/清除未读；旧 receipt 只保留本地隐藏迁移。项目折叠乐观反馈，自动收起约 100ms。
- 置顶动作会立即重新投影：任务在当前页签/状态段内移动到非置顶项之前，项目进入 `Pinned`；若浮窗动作桥接未送达，会明确提示重新打开 EyPc，不再静默表现为无效。
- 单条原生归档重读身份、状态、版本、latest Turn 和项目指纹，只允许同一明确 completed revision；任何其它或变化证据均拒绝。写入后同时核验 false 缺席与 true 存在，再向已连接 Codex Desktop 派发 `thread-archived` v2。项目“归档已完成任务”忽略 30 天窗口，20 条一批、并发 2，只处理重读仍为 completed 的条目，其余全部作为进行中跳过并逐项双向验证/通知。
- 项目批量归档只做模拟集成测试。真实验收只使用专用临时任务完成 archive/unarchive 双向核验并最终归档清理；现有任务未被操作。
- RAW-051/054 的配对卡片模态、受限色域和真实悬浮暂态预览仅保留历史证据；它们不再属于当前配置页或当前保存路径。
- 会话层现在按 `详情 → 更多操作 → 会话行` 回退。详情 Header 返回同一目标动作，更多操作 Header 关闭；确认态优先取消，Ctrl 左右不覆盖原触发点，批量抽屉保持单层。
- 项目 `移`现在是真实 Codex 侧栏移除：App Server 没有对应 RPC，Host 仅在 Codex Desktop 已退出、短期 alias/项目指纹/主状态结构全部一致时，修改 `local-projects/project-order/pinned-project-ids/selected-project`，同步原子替换主文件和 `.bak` 并双重核验；失败回滚。不会删除磁盘目录、assignments 或既有会话。成功后清理该项目的 EyPc 隐藏/折叠/本地置顶/别名元数据。
- Quick Jump 普通 F 标记为深色底、白色粗体和白描边；当前目标为黄色底、深色字和深描边，不再交替浅粉/浅紫。

## User Acceptance

- RAW-111 为 `未校验，待用户验收`：先在 uTools 中正常重新加载 EyPc 插件，再通过既有显示入口恢复浮窗。重载完成后，当前只有一条 active 时紧凑进行中角标和展开“正在进行中”必须同时为 1，先前已完成的旧任务不得保留在该段；若只更新了 Renderer 或 Preload/主 Controller 仍旧，三个任务角标必须全部隐藏并显示“任务状态版本已过期/重新加载”提示，不能继续显示历史数字。随后按 RAW-110 新建并完成一条测试任务，确认数字与卡片一次同步切换。
- RAW-110 为 `未校验，待用户验收`：重载 uTools preload 后，在长时间空闲后新建一条任务，安全库存登记应只读取该新任务的 latest Turn，不再随任务池规模全量重读；对一条已进入稳定库存的任务发起新 Turn，完整 started 通知应让进行中卡片/角标同步出现且无额外 RPC。再让任务自然完成，完整完成通知应让卡片、角标、完成分段和归档能力一次同步切换，不等待普通稳定窗或额外 RPC。制造短暂 active→ongoing→active、缺字段/旧完成通知或桥断连时仍须保守进行中。若保存了 1.5 秒等普通完成平滑档，该选择应保留；“不等待”只影响普通快照完成。
- RAW-109 为 `未校验，待用户验收`：准备一条超过 6 小时、非隐藏、未在 EyPc 本地置顶且因传输不确定仍为保守 ongoing 的任务，前后任务快捷键不得打开它；动态进行中卡片与角标也均不包含它。再明确执行 EyPc 本地置顶并确保普通候选为空，它才可进入回退循环。完成未读任务继续只由自己的首条动作处理，不应出现在通用前后循环。
- RAW-108 为 `未校验，待用户验收`：在真实任务经历 active→短暂 ongoing→active 时，最近 6 小时“正在进行中”卡片和角标必须始终同步且数量相同；targeted completed 或明确 stopped 到达后两者及归档能力一次切换。搜索不得改变紧凑数字，隐藏/超过 6 小时任务不得进入 active；待输入/完成未读仍包含隐藏。配置水球预览、按钮提示与 ARIA 应显示相同数字，进行中点击只展开。
- RAW-089/091/092 为 `未校验，待用户验收`：新建一条直接进入待输入的任务，确认它无需等待 15 秒完整周期；让一条真实任务自然完成，确认 active 退出后先稳定为进行中、定向 completed 到达后立即且只切换一次已完成；再主动停止一条任务并关闭一次 Codex，确认 terminal + live idle/not-running 只切换一次已停止。单纯断连/bridge failed、缺 Turn 或临时缺行必须继续显示进行中且不让任务消失。
- RAW-095 为 `未校验，待用户验收`：重新连接/重载 uTools 插件后，只用可丢弃的已完成测试任务在 Codex 中执行归档。EyPc 中同一任务应立即消失，不等待正常 15 秒缺项隔离；随后紧急完整复核不得复活一个确已归档的任务。未知/畸形归档事件、unarchive 或普通低库存不得删除其它可见任务。
- RAW-096 为 `未校验，待用户验收`：重新连接/重载 uTools 插件后，找到一条 EyPc 当前显示进行中但 Codex latest Turn 已明确完成的任务；它应在既有普通完成展示窗后离开“正在进行中”并进入“已完成”。随后在同一任务/会话发起新的实际 active，确认它仍保持进行中。缺少 active interval 时刻、桥断连或非 completed Turn 不得被猜成完成。
- RAW-097 为 `未校验，待用户验收`：重新连接/重载 uTools 插件后，选一条可丢弃的“已完成未读”任务，在 Codex Desktop 中手动打开/阅读使其变已读。EyPc 必须只收敛为“已完成”，计数相应减少，不能进入“正在进行中”；随后开始一条真实任务，确认其完整 runtime/request delta 仍立即显示进行中。
- RAW-071 为 `未校验，待用户验收`：请先改水球底色，确认最大水球的底面立即变化并在关闭/重开配置页后保留；再分别改液体 A/B、Weekly 环进度/轨道和三个角标，确认只有预览中标明的部位变化。然后改卡片表面/前景与状态信号，确认不会连带改变水球。若 Weekly 环仍显示状态色，请将环颜色模式切到“自定义”再改专用进度色。
- RAW-072/073/074 为 `未校验，待用户验收`：配置页预览与右侧真实水球必须保留同一水波、折射、高光、底色、液体、进度环、读数位置和当前计数，且无底部扁平矩形。分别修改底色、透明度、液体 A/B、波幅/速度、环/轨道与角标，确认只影响配置标明的部位；将“球体底色透明度”调为 `0%` 后，真实浮窗只去除球体背景，液体、Weekly 环、读数和角标仍显示。恢复到 `100%` 后两边同时恢复底色。
- RAW-075 为 `未校验，待用户验收`：卡片区必须明确展示悬浮展开态而非收起横卡；分别修改“展开卡片表面”与“展开文字 / 图标”，确认真实展开卡片的背景/页签/搜索/任务区与标题/数字/标签/状态图标相应变化，且不改变水球区颜色。
- RAW-076 为 `未校验，待用户验收`：展开浮窗后，逐项修改主面板、内层块、边框、主/次文字、选中、焦点、进行中和完成未读；每项应只改变其标签指出的大卡片部位，水球不变。切换内置主题、保存主题、重开设置页后，九项配置均应继续存在并直接驱动展开态。
- RAW-079/080 中完成展示窗与水球读数配置仍待验收；其“失败/系统错误到期显示异常”和“其它状态使用 2 秒防抖”已由 RAW-089 取代，不再作为验收项。
- RAW-081 为 `未校验，待用户验收`：保持一条已完成未读任务，令随后 Desktop snapshot/patch 不含 `hasUnreadTurn`，确认该任务仍显示完成未读；再发送明确 read-state 已读，确认它立即离开完成未读。触发以 `request_user_input`、`request-user-input` 或现有驼峰写法表达的 desktop-live active 请求，确认都立即进入待输入；connector、`notLoaded` 或时间变化不得伪造待输入。
- RAW-082 为 `未校验，待用户验收`：对多个完成未读任务（含已隐藏及置顶第一条）分别点击未读角标和调用新的 uTools 全局功能/快捷键，确认两条路径打开相同首条，并使该任务在 EyPc 角标、列表、项目视图和详情中立即成为已完成/已读；新的完成 revision 应重新未读。待输入角标及其全局功能必须只打开而不改状态。
- RAW-083 为 `未校验，待用户验收`：确认待输入角标在左下、已完成未读在最右下角、进行中紧邻其上；配置页水球预览角标须与真实浮窗同一角落。仅在紧凑主体上方三分之一悬停或点击时展开，在下半区拖动只移动窗口而不展开，中间三分之一不做动作。再验证键盘展开和三个角标按钮保持既有行为。
- RAW-084/105/106 的历史验收序列由 RAW-109 取代；当前按本节首条 RAW-109 验收普通待输入→最近 active 与本地置顶空池回退。完成未读不应由这两个通用命令打开或确认，隐藏/页签保持不变且无候选时显示明确提示。
- RAW-087 为 `部分已验收 / 布局待用户验收`：用户已确认删除入口读取后 EyPc 可加载。请确认默认进入“快捷方式”、六个入口以双列紧凑显示，五个顶部 Tab 可点击并用左右方向键/Home/End 切换；任务、水球、卡片、运行只显示当前配置，信息按钮可由鼠标与键盘获得说明。设置任意 Codex/窗口槽快捷键后页面不得读取或回显当前绑定，也不得再次卡住入口。
- RAW-088 为 `未校验，待用户验收`：确认默认进入仍为海盐观感；12 项主题均使用实体圆环、球体底色不透明；切换色相后预览与桌面悬浮球同步，无钟表分段环。
- RAW-068 为 `未校验，待用户验收`：请让同一任务经历原始 interrupted 与 desktop-live active 更新，确认角标、卡片和详情始终显示“进行中”，任务行固定归档按钮持续禁用且不闪烁；操作抽屉、Shift 预览、单项确认和批量归档也不应把它视为可归档对象。
- RAW-067 为 `未校验，待用户验收`：请分别以待输入/完成未读一条、多条和包含已隐藏条目的状态点击角标，确认都打开同一计数集合中置顶优先、其后稳定排序的第一条，浮窗不先展开或切页；完成未读仍保持未读，已隐藏任务仍保持隐藏，进行中角标继续展开。
- RAW-065/066 的水球与 interrupted 投影仍待验收；其中 failed/system-error/unknown 显示不变的旧条款已由 RAW-089 取代。
- RAW-064 的选择提示布局仍待验收；失败/系统错误/宿主未知的独立可见表达已由 RAW-089 取代。
- RAW-063 为 `未校验，待用户验收`：请确认旧 `all/input` 持久化状态启动后立即进入动态、四页签无闪现、待输入角标与当前动态分段正常、6 小时内完成任务可见、标题/元信息行交互及 2px/102px 操作轨；其无 Weekly 外环条款由 RAW-065 取代。
- RAW-059 为 `未校验，待用户验收`：请在真实 macOS Codex Desktop 中确认手动/自动 CLI 位置切换、Desktop live authority 与归档后的侧栏刷新；Windows 只验证受控 CLI 发现与 connector fallback，不能验收实时桥。
- RAW-058 多选专项自动化 `3 / 3` 通过：覆盖触发状态机、最后一项退出、子按钮键盘归属及 38px/状态图标/三色渐变结构；真实视觉/Codex 跳转仍待验收。首次 Companion 整文件探测仍有 19 条更广失败，未宣称整体通过。
- RAW-057 为 `未校验，待用户验收`：显著选择模式条、未选降权、选中粗边/左轨和勾选徽标已同步，未运行开发门禁。
- RAW-056 为 `未校验，待用户验收`：桌面伴随桥、权威状态/未读、保守降级、归档刷新通知、诊断和测试契约已同步；可见 unknown 降级已由 RAW-089 改为进行中。
- RAW-055 为 `未校验，待用户验收`：代码、测试契约和过程文档已同步，但按用户规则未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。
- 整体结论仍为：`未校验，待用户验收`。RAW-091/092 的 30 天历史检查点保留 `14 completed / 2 stopped / 3 ongoing`、`3 active / 0 unconfirmed ongoing`；RAW-094 当前一日预检为 `4 completed / 1 stopped / 3 ongoing`，三条 ongoing 均有 exact Desktop live active。修正前的三分钟采样复现同一 active 集合反复退出/复活且 completed 数量不变；当前源码 30 秒处理 59 patch、0 重订、0 替换 snapshot。RAW-095 已把外部显式归档映射为匿名 key 的立即移除和 urgent 复核，不再受普通缺项隔离；仅完成 preload 重载后的真实归档可确认宿主消费。preload 镜像、同步 IPC 残余搜索和本轮范围 diff whitespace 已通过；未运行测试合同、typecheck、build、uTools、截图或任何真实归档/停止/崩溃转换。既有 RAW-065–094 历史证据保持原状态。
- RAW-054 配色增量为 `accepted-with-baseline`：聚焦 `5 / 5`、typecheck、生产 build/uTools 和 `1180/760/420px` 加短高度浏览器矩阵通过；全量 `486 / 496` 保留 10 个重叠脏树基线失败，RAW-054 新增用例全部通过。
- 用户可在 uTools + Codex Desktop 中重点检查：Input/正在进行中随宿主实际状态即时变化；完成后按 Codex 自身未读显示；EyPc 打开/隐藏不消除未读；主动停止/GPT 崩溃或 Desktop 退出且存在 terminal Turn 时显示已停止，普通传输断连仍保持进行中；归档后 Codex 侧栏无需重启即消失。既有置顶、四槽、项目隐藏、200ms 说明和 F 标记仍需回归。
- 真实项目移除验收必须先完全退出 Codex，再对可恢复的临时项目执行；重新打开 Codex 后项目应从侧栏消失，目录和既有会话仍在。Codex 运行时点击应返回阻止提示且状态文件零变化。
- RAW-054 与历史证据均记录在 [verify.md](verify.md#L1)，但不构成 RAW-052–053 的通过证据。

## Privacy And Compatibility

- [preload/index.js](../../../../preload/index.js#L1) 是原始项目状态、Codex Desktop snapshot、thread/Turn ID、cwd 与 action alias 的唯一进程内边界；桌面 snapshot 的正文/摘要只为协议消费而瞬时存在，状态投影后立即丢弃。Renderer 和持久化层只接收匿名键、权威枚举、项目描述、顺序和短期动作别名。
- 不读取 Codex SQLite/LevelDB，不把正文、摘要、raw ID、cwd/路径写入 Renderer、存储、日志或文档，也不自动操作 Codex 桌面 UI。除经二次确认和完整门禁的项目移除事务外，不写 `.codex-global-state.json`；unread fallback 只读 Codex 自身持久化集合。
- Host V2 旧字段和 Activity Delta V1 保留一版数据兼容；V1 只能成为 connector authority。RAW-111 后，生产 uTools 的任务展示还要求端到端 `taskStateRevision` 精确一致，旧实例只能继续读取额度/config，不能发布历史任务数字。未来 Easy Agent 可替换 App Server + Desktop bridge provider/floating host，而不改变 Renderer 四个可见页签、兼容投影、匿名状态、本地元数据、`quota-auto` 或瞬时新会话合同。

## Residual Boundary

- 当前 macOS 已实现 Codex Desktop 私有 IPC live authority，但真实宿主消费尚未验收；私有协议版本漂移、socket 权限不满足、Codex 未运行/不兼容时必须维持未知，Windows 对应实时通道仍待后续 provider。
- `thread-archived` 只能确认 frame 已派发，不能证明桌面 UI 已消费；“归档后无需重启即可同步”需要用户在真实 Codex Desktop 中验收。
- `thread/read`/latest Turn 复核与 `thread/archive` 之间没有条件写原语，仍有 provider-level TOCTOU。
- 真实 Windows uTools 发现/系统热键、真实系统听写、真实 `turn/start`/deep link、多显示器/DPI、macOS 两个普通 Space 和一个全屏 Space 仍是宿主验收残余。
