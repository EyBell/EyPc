# Codex Companion 真实会话与交互规范

Tool: codex
Date: 2026-07-22
Status: `reported-unverified-awaiting-user-acceptance`
Documentation level: `controlled`
Requirement version: `2026-07-29.5`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
Documentation sync group: `dsg:eypc:WU-CODEX-DESKTOP-LIVE-AUTHORITY`

## Execution Authority

- Control plane: `app-root`；实现与风险边界由主线程负责；本轮所有开发验收、真实外部状态操作和最终接纳由用户负责。
- Sidecar: 历史阶段的只读探索不改变本轮 main-only 写入与用户验收权威。
- High-risk boundary: 除 RAW-052 经二次确认、Codex 进程门禁、alias/指纹/结构校验、原子替换与回滚验证的项目移除外，不写 Codex 原生状态文件；不操作用户现有任务、不自动退出/操作 Codex 桌面 UI、不删除项目目录或会话。本轮不执行真实移除或归档验收。

## Superseding Decision

本规范取代旧版 recent-100、三页签、顶部样式工具栏和“单额度装饰环”合同。RAW-051–059 保留既有额度、操作、配色、桌面状态权威和结构性选择反馈；RAW-063/064 保留四个可见页签、最近 6 小时动态流、标题/元信息分流、无“需关注”分段和无重排选择提示。修订 `2026-07-22.12` 追加 RAW-065/066：恢复数据驱动的 Weekly 进度环并删除普通装饰圈，同时把上游 `interrupted` 在领域卡片投影层转换为可见 `ongoing`。修订 `2026-07-22.13` 追加 RAW-067：待输入与完成未读角标统一直开各自完整计数集合中展示排序第一条，进行中角标保持展开。修订 `2026-07-22.14` 追加 RAW-068：投影后的 ongoing 统一阻断归档，消除 active/interrupted 来源切换造成的归档控件闪烁，并在 Host 单条/项目归档重读中拒绝或跳过 interrupted。修订 `2026-07-22.15` 追加 RAW-069：任务从进行中转为完成时由 Controller 统一保持进行中 2 秒，窗口内恢复运行则取消，连续完成满 2 秒才同步发布完成状态、角标和归档能力；修订 `2026-07-23.1` 追加 RAW-070 interrupted 宽限；修订 `2026-07-24.1`–`.6` 追加 RAW-071–076 外观工作台与主题持久化；修订 `2026-07-24.7` 追加 RAW-077：展示窗暂为 700ms；修订 `2026-07-24.8` 追加 RAW-078：默认改为 1500ms；修订 `2026-07-24.9` 追加 RAW-079：展示稳定窗改为默认 1500ms 的持久化配置，并为水球百分比读数增加独立位置、字号、字形和颜色配置；修订 `2026-07-24.10` 追加 RAW-080：已完成已读回流到未读/进行中立即发布，进行中离开到完成或异常按同一配置稳定；修订 `2026-07-24.11` 追加 RAW-081：live snapshot 缺少未读字段时保留可信持久化 unread，且待输入的有限 request 名称归一化不放宽 desktop-live active 权威；修订 `2026-07-24.12` 追加 RAW-082：已完成未读角标与 uTools 全局功能共用“打开并仅本地确认当前完成 revision”的动作，待输入仍只打开；修订 `2026-07-24.14` 追加 RAW-084：两个 uTools 全局任务循环命令按待输入→完成未读→进行中、置顶优先稳定去重的序列前后回绕，只打开任务且不改变任何未读或任务状态；修订 `2026-07-24.15` 追加 RAW-085：配置页只回显两个循环命令当前的宿主绑定，并在进入、返回或手动刷新后重读，未绑定和不可读均不猜测。Renderer 匿名合同、Host 原始状态、安全边界、计数来源、底层稳定排序和兼容持久化不变。

修订 `2026-07-24.16` 追加 RAW-086：为消除 uTools 入口对未公开同步宿主 IPC 的依赖，快捷键回显改为仅由用户点击“刷新”触发；应用启动、Codex 页面挂载、焦点恢复和可见性恢复均不读取。RAW-085 的过滤、回显和只读边界保持不变。

修订 `2026-07-24.17` 追加 RAW-087：用户确认删除入口读取后 uTools 已恢复加载，因此完全删除快捷键回读桥、类型、运行时快照及 Codex/窗口页回显；所有快捷键入口只保留官方配置跳转。同时把 Codex 配置页收敛为顶部五 Tab，默认双列快捷方式，任务、水球、卡片和运行按需单页渲染，冗长说明进入可聚焦信息按钮。RAW-085/086 的回读合同被本条取代。

修订 `2026-07-26.1` 追加 RAW-088：内置外观主题扩展为 12 套，并统一为默认「海盐」材质语言——实体圆环、不透明球体底色、gradient 液体与软光晕；十二套仅以色相区分。

修订 `2026-07-26.2` 追加 RAW-089：只有 latest Turn 的明确 completed 证据才退出“进行中”；所有异常、权威缺失和未确认状态统一显示“进行中”并阻断归档。Desktop active 退出后触发单任务 3 秒有界核验，删除固定 2 秒 Activity 防抖；15 秒设置只承担完整库存校对。

修订 `2026-07-26.3` 追加 RAW-090：单次完整快照缺少已展示任务时不立即减少数量，而是保留上一份稳定清单并复核；同一缺失集合须跨至少一个完整校对周期连续成立才接纳。latest-Turn 和更新时间证据保持单调，防止传输回退导致分组、排序与数量突变。

修订 `2026-07-27.1` 追加 RAW-091：明确区分“传输不确定”和“会话已停止”。failed/interrupted 只有与 exact desktop-live idle 或 Desktop bridge `not-running` 同时成立时才进入独立已停止桶；active 优先，bridge failed/缺证据继续进行中。active 退出先防旧 terminal delta 闪变，再由定向或完整核验发布最终停止。

修订 `2026-07-27.2` 追加 RAW-092：新增任务、首次待输入和强完成证据走事件驱动快路；结构事件使用 50ms 短合并与读取中补读，preload 只对事件标脏或无缓存任务读取 latest Turn，普通 15 秒周期仍完整校对。`targeted-after-exit` completed 直接发布；missing-key、无证据终态及状态回退继续稳定/保守处理。

修订 `2026-07-27.3` 追加 RAW-093：本机 Desktop 的计划完成待确认以未决 `item/plan/requestImplementation` 表达；该有限请求直接作为 `waitingOnUserInput` 权威，即使 runtime 已变 idle 也立即进入待输入，不等待库存、15 秒周期或完成展示窗。

修订 `2026-07-27.4` 追加 RAW-094：Desktop 全量会话 stream 中未被 Companion 观察的私有 patch 只推进 revision，不再触发退订重订；状态相关 patch 因此不会被重订窗口吞掉，也不会被旧 active snapshot 反复覆盖。

修订 `2026-07-27.5` 追加 RAW-095：兼容 Codex 通道的明确 `thread-archived` 事件若能在 preload 内映射为当前库存的匿名 key，Activity Delta V2 会将该 key 标为已归档；Controller 立即从共享投影移除该 key 并排队 urgent 完整复核。未映射、unarchive、delete 或畸形事件不触发移除，普通快照缺项仍受 RAW-090 隔离。

修订 `2026-07-27.6` 追加 RAW-096：每段 Desktop-live active 附带匿名本机观察时刻。只有 latest Turn 的明确 `completedAt` 晚于该时刻，才把旧 active shadow 视为被更晚完成证据取代；无时刻、较早完成或非 completed 仍保留 live active 优先。不使用超时或 recency 推断完成。

修订 `2026-07-27.7` 追加 RAW-097：Desktop read-state 及仅 `hasUnreadTurn` patch 是 unread-only delta，只允许修改已读投影，不能借当前 shadow 重发 activity 并把完成任务变为进行中。

修订 `2026-07-27.8` 追加 RAW-105：当前循环的待输入/完成未读/进行中候选全部为空时，EyPc 本地置顶任务作为回退循环集合，按既有稳定显示顺序从第一项开始；原生置顶不参与。

修订 `2026-07-27.9` 追加 RAW-106：停止任务不得进入前/后任务循环，即使它是 EyPc 本地置顶的回退项。

修订 `2026-07-27.10` 追加 RAW-107：`hideAfterAction=true` 的全局任务循环快捷键不得调用 `setTab`，`syncActivation(false)` 时必须清空 `conversations`，防止缓存任务列表中的 `actionAlias` 失效导致崩溃。

修订 `2026-07-28.1` 追加 RAW-108：Renderer 从 Controller 已稳定化快照建立一个无状态、最近 6 小时、非隐藏的动态展示投影；动态状态段、进行中角标、主水球摘要和设置预览共用该投影。权威 live active 与保守 ongoing 的职责分离：前者判定真实活动，后者在 active 退出核验、短暂断连或证据暂缺时维持展示连续；明确 stopped 立即离开进行中。Preload/Controller 的通信抖动保护和完成展示窗均不改动。

修订 `2026-07-28.2` 追加 RAW-109：前/后任务普通候选不再读取整个 30 天 ongoing 桶，而是完整待输入后复用 RAW-108 最近 6 小时、非隐藏 active 组；完成未读保留独立动作。普通池为空时既有非 stopped EyPc 本地置顶回退不变，因此旧/隐藏任务只有用户明确本地置顶后才可进入动作循环。

修订 `2026-07-29.1` 追加 RAW-110：`thread/started.params.thread.id` 正确标脏新任务，使验证库存只重读其 latest Turn 并复用其它缓存；已登记任务的完整新鲜 `turn/started` 直接更新 inProgress，完整单调的 `turn/completed` 直接收敛为脱敏 `targeted-after-exit`，不再先丢弃 Turn 元数据并等待额外 RPC。未知新任务仍完成安全登记，不完整、旧或非完成通知继续走 50ms/3 秒保守核验。代码默认稳定窗保持 0ms，设置页纠正默认项标识，既有持久化选择不迁移。

修订 `2026-07-29.2` 追加 RAW-111：真实运行实例的角标/卡片 5 条与当前源码只读预检 1 条不一致，证实 uTools 旧 Preload/主 Controller 与较新浮窗 Renderer 的版本偏斜。任务状态链新增统一 revision；任一边界缺失/不匹配时任务投影 fail-closed 为空并提示重载，额度/config 继续独立可用，版本一致后恢复 RAW-108 同源投影。

修订 `2026-07-29.3` 追加 RAW-112：版本一致后仍有 terminal 任务被首次 Desktop follow snapshot 重放为 active，并在每次订阅时重建活动区间。首次 snapshot 不再等同于已观察到的 active 转换；它与既有 terminal Turn 冲突时复用 `[0,300,1000]` 定向核验，只有 activity revision 未变化且最终读取仍为 terminal 才抑制这次未佐证 active。真实 activity patch、等待请求或新 inProgress Turn 立即恢复 active，读取失败仍保守进行中；任务状态合同提升到 `task-state-v2`。

修订 `2026-07-29.4` 追加 RAW-113：RAW-111 的 mixed-version 空投影造成真实状态整体消失，现被原子任务状态包取代。Controller 从稳定会话一次发布 `conversations + dynamic groups + compact counts + compatibility + nextTransitionAt`，并以既有调度器维护 6 小时边界；浮窗、设置预览和前后任务只读该包。缺失/不匹配 revision 仅将包标记为 `degraded` 并建议重载，继续读取/订阅并保留任务，不再由 Controller/Renderer 双重清空。

修订 `2026-07-29.5` 追加 RAW-114/115：展开浮窗删除 Actions/Environment 可见块及 Renderer 第二套目标、选择与确认状态，pointer/focus departure 和 window blur 共用约 220ms 自动收缩；五个命令只转发 Controller。Preload 对本轮 dirty 且暂未进入完整 `thread/list` 的任务执行一次有界 exact read，仍经完整原生归属、latest Turn、匿名化与指纹门禁后才进入同一个原子任务状态包；从未登记且仍 live active 的 shadow 可跨首次滞后扫描等待安全登记，不增加占位卡或独立角标通道。

## Current Requirement And Implementation Map

| 领域 | 当前合同 | 实现与证据 |
| --- | --- | --- |
| 原生项目状态 | 日常流程只读解析；RAW-052 项目移除经 Codex 退出、alias/指纹/结构和原子回滚门禁后，仅修改原生项目注册字段 | [preload/index.js](../../../../preload/index.js#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) |
| 完整任务库存 | 完整分页读取 `archived=false`；归属优先 native assignment、Chats、最深有效 cwd，其他任务排除。新快照缺少已发布 key 时先保留上一份内存稳定清单，跨一个完整校对周期的连续同集合确认后才接纳消失；仅当前已映射的明确归档事件携带匿名 key 立即移除并 urgent 复核 | [preload/index.js](../../../../preload/index.js#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) |
| 严格时间/完整性 | 最新 Turn 必须存在有效 `startedAt`；滚动窗口 1–365 天、默认 30 天、边界包含；时间窗口资格取最新 Turn 开始/完成活动但不以 `updatedAt` 回退；项目指纹变化重试一次，仍变化则不发布伪完整数据。已接纳的 Turn `startedAt`/completed outcome/`completedAt` 和任务 `updatedAt` 不允许被更旧快照回退 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 四页签与状态优先级 | 可见页签为 `动态 / 已完成 / 已隐藏 / 项目`；Controller 原子任务状态包把最近 6 小时、非隐藏任务互斥分为待输入、正在进行中、已停止、已完成未读、已完成，并同时携带动态总数、三个紧凑数量与下一次纯时间边界。已由真实 patch/Turn 佐证的 Desktop-live active 仍优先；首次 follow snapshot 与既有 terminal Turn 冲突时先保守 ongoing，经 activity revision 未变的有界定向核验后才收敛为 idle。latest Turn completed 的 `completedAt` 晚于既有 active 区间时进入完成；failed/interrupted + exact live idle/not-running 进入已停止；其它异常/权威缺失以保守 `ongoing` 继续进入正在进行中；搜索只过滤列表，不改包内数量；Renderer 不再单独投影或计时，`all/inputRequired` 只保留兼容投影 | [preload/index.js](../../../../preload/index.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 原生项目视图 | `Pinned / Projects / Chats` 遵循 Codex 原生置顶、项目顺序和归属，不重复任务，并保留空项目 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 本地元数据 | 恢复最后页签/项目折叠，支持别名、具备即时位置/状态反馈的本地置顶和仅影响项目页的项目隐藏；旧本地移除集合迁移清除 | [codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 额度 V2 与紧凑水球 | 普通 5 小时正余额→普通周正余额→最高正余额 Spark；Spark 显示 `S`；存在 Weekly 时显示同池剩余进度环，无 Weekly 时无外圈，且始终不显示普通装饰圆环 | [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)、[codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) |
| 配置导航与外观 | 顶部 `快捷方式 / 任务 / 水球 / 卡片 / 运行` 五 Tab 默认进入双列快捷方式，只渲染当前分面；诊断、降级和部位说明进入可聚焦信息按钮。水球/状态信号与展开卡片分页，但继续共享真实组件、主题对象与直通持久化；内置主题共 12 套 | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)、[codex.css](../../../../src/styles/codex.css#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L57) |
| 宿主快捷键边界 | 前/后任务、待输入、完成未读、悬浮入口和窗口槽只通过官方设置跳转；preload/Renderer/运行时均不读取或回显宿主绑定，不调用私有同步快捷键 IPC | [preload/index.js](../../../../preload/index.js#L1)、[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) |
| 水球收起态命中区与全局功能 | 上半区不因 hover 展开并保留三角标直接点击；待输入/完成未读取完整集合（含隐藏），进行中严格等于 Controller 原子包里最近 6 小时、非隐藏的 `active / waiting-approval / ongoing` 卡片数。主水球摘要、按钮 ARIA、说明、设置预览和前后任务 active 组读取同一包；零值隐藏、超过 99 显示 `99+`。待输入只打开第一条，完成未读角标和 uTools 全局功能均打开并本地确认第一条当前完成 revision，进行中只展开；普通候选为空时仅非 stopped EyPc 本地置顶任务按稳定显示顺序回退，原生置顶不参与；`hideAfterAction=true` 时不调用 `setTab`，`syncActivation(false)` 时清空 `conversations` 防止缓存失效崩溃 | [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1)、[App.vue](../../../../src/App.vue#L1) |
| 展开布局 | 四页签直接位于顶部，其下依次是统一搜索、服务端真实额度文字和任务内容；删除旧顶部样式/隐藏/刷新/设置/关闭工具栏 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1) |
| 实时状态与未读通道 | macOS Codex Desktop 私有 IPC 提供 live snapshot/patch/request/read-state；已登记任务的完整新鲜 App Server `turn/started` 可直接更新匿名 inProgress，完整单调的 `turn/completed` 可直接推送脱敏完成强证据；未知任务及不完整/旧通知回退到库存登记与事件校对。Desktop active 退出，或首次 follow snapshot active 与既有 terminal Turn 冲突时，复用 3 秒单任务 latest-Turn 核验；后者只在 activity revision 未变化、无等待标记且最终读取仍 terminal 时抑制该 snapshot active。固定 2 秒活动防抖已删除，无 live authority 或读取失败保持“进行中” | [preload/index.js](../../../../preload/index.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) |
| 启动发现与连接诊断 | 自动枚举受控 macOS/Windows CLI 候选；可选手动位置经同一运行计划核验并只存本机插件 storage；环境快照只传来源/可用性标签，连接器降级明确不授予实时状态权威 | [preload/index.js](../../../../preload/index.js#L1)、[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) |
| 默认模型与新会话 | `quota-auto`、普通首选模型、Spark 自动切换、冻结/刷新确认模型、瞬时 `thread/start → turn/start → Deep Link` 与失败清理 | [codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1)、[preload/index.js](../../../../preload/index.js#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1) |
| 选择、Shift 与快捷键 | 普通态中部打开、Ctrl/Cmd+中部或 38px 左区选择；选择态左区/中部切换成员并在最后一项移出时退出；模式提示固定在列表舞台底部且不重排，行与子按钮分别拥有 Space/Enter | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1) |
| 卡片颜色 | 卡片表面与文字/图标前景只在卡片区独立调整并即时预览；旧联动二维取色板/确认事务仅保留历史证据 | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) |
| 会话层回退 | 单项 `详情 → 更多操作 → 会话行`，确认态优先；Ctrl 左右切层不改原触发点，批量抽屉一次 Esc 关闭 | [FloatApp.vue](../../../../src/FloatApp.vue#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) |
| 原生归档 | 短期 action alias + 预期版本 + 项目指纹；投影后的 ongoing（含原始 interrupted）稳定不可归档，单条 Host 重读拒绝 interrupted、项目归档跳过 interrupted；其余候选归档后在 false/true 两侧确认并向已连接 Codex Desktop 发送版本化通知，项目逐项保留失败 | [codex.ts](../../../../src/domain/codex.ts#L1)、[preload/index.js](../../../../preload/index.js#L1)、[codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) |

## RAW-108 Stable Renderer Status Projection

- [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 的 `projectCodexDynamicStatus` 是唯一动态展示投影。输入只允许 Controller 已稳定化的 `ConversationSnapshotV2` 与当前时间；函数不缓存、不延迟、不读取 raw Desktop/App Server 状态，也不改变 Projection V3。
- 投影先排除隐藏及最近 Turn 活动早于 6 小时的任务，再把 `waiting-input`、`active / waiting-approval / ongoing`、`stopped`、`completed-unread`、`completed` 放入五个互斥状态段。紧凑 active 数量直接取 active 段长度，因此未搜索卡片与角标不会再漂移；搜索留在 [FloatApp.vue](../../../../src/FloatApp.vue#L1) 的行渲染层，只减少展开列表结果。
- `input` 与 `unread` 数量分别取完整 `inputRequired` 与完整完成未读集合，包含隐藏任务；waiting-input 不重复进入 active。`buildCodexCompactPresentation` 只消费显式 `{ input, active, unread }`，所以主水球 ARIA 与三个独立按钮报告相同数字。[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 的水球预览复用同一投影，保守 `ongoing` 不再遗漏。
- exact Desktop live 仍是 active/input/approval 的权威来源；`ongoing` 是 Controller 在退出核验、bridge failed、暂缺权威、旧 terminal 防闪或完成 hold 期间已经稳定发布的保守展示状态。Renderer 不重新判断这些证据，也不增加角标专属 timer/debounce。`stopped`、completed/completed-unread 到达同一稳定快照时，卡片、角标和归档能力一次切换。
- 本轮不修改 `completionPresentationDelayMs` 的默认值、已保存值或选项，不修改 Preload/Controller 协议、动作 ID、存储、迁移或错误记忆。既有测试文件补充序列合同但不执行；交付保持 `reported / 未校验，待用户验收`。

## RAW-110 Direct Started/Completed Turn Evidence

- `thread/started` 按当前 App Server schema 从 `params.thread.id` 取得 raw identity，只在 preload 内标为 dirty。完整库存仍重新读取原生项目注册、未归档分页和归属，但 latest-Turn lane 对其它已缓存任务复用会话期结果，只为新增任务发 status-only RPC；匿名 key、项目和 action alias 建立后才发布卡片。
- 已登记任务的 App Server `turn/started` 只在 `status=inProgress` 且 `startedAt` 晚于当前 latest Turn 时直接更新同一 session cache 和匿名 Activity Delta，取消旧完成 retry/未读 refresh，使保守进行中卡片与角标不等待 latest-Turn RPC。相同 inProgress 通知幂等；旧修订回退。全新未知任务仍必须由完整库存建立项目归属、匿名 key 与 action alias。
- App Server `turn/completed` 通知只在已登记任务、`status=completed`、`startedAt/completedAt` 都有效且证据相对当前 latest Turn 与 Desktop active interval 单调更新时进入快路。[preload/index.js](../../../../preload/index.js#L1) 复用 latest-Turn sanitizer，只缓存和发送状态/时间；raw thread/Turn ID、items、正文与错误内容留在 preload。
- 新鲜通知更新同一 session-only Turn cache，取消同任务尚未执行的定向 latest-Turn retry，并立即发出 `lastTurnEvidence=targeted-after-exit` 的匿名 Activity Delta。Controller 已有强证据合同因此绕过普通 `completionPresentationDelayMs`，卡片、角标、归档能力和无障碍摘要从同一稳定快照一次切换。未决 input/approval 仍优先，完成证据只在请求解除后恢复其正常投影。
- 缺 Turn、缺时间、旧修订、未知任务、failed/interrupted 或 active interval 晚于完成时间时，通知不授予新的状态权威：继续标脏并请求 50ms urgent 完整校对；已知 active 仍可使用 3 秒 `[0,300,1000]` 定向 latest-Turn 核验。只有 Desktop active→idle 的路径也保持该有界核验，因此跨进程通知缺失不会被误判完成。
- `completionPresentationDelayMs` 的领域默认值保持 `0ms`，设置页只纠正“不等待（默认）”标签；所有已有持久化值与 `500–3000ms` 可选平滑档保持不变，不新增迁移、Renderer timer、Controller debounce、协议字段或动作。本轮只补充既有 bridge 测试合同，不执行测试、typecheck、build、uTools 或真实 Codex 操作；状态为 `reported / 未校验，待用户验收`。

## RAW-111 End-to-End Task-State Revision Guard

- [codex.ts](../../../../src/domain/codex.ts#L1) 定义无身份、无状态数据的 `CODEX_TASK_STATE_REVISION`。当前 [preload/index.js](../../../../preload/index.js#L1) 与 public 镜像通过 `codex.taskStateRevision` 暴露同值；[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1) 把旧 Preload 的缺失值显式归一为 `legacy`，避免能力缺失继续伪装成兼容。
- RAW-111 首版要求 Controller 与 Float 分别在 mismatch 时清空任务；真实反馈证明这会把一个兼容诊断扩大为“所有任务状态消失”。该清空行为、`preload-version-mismatch` 错误空态、停止任务读取/订阅和 Float 二次拒绝均由 RAW-113 明确废止。
- revision 现在只描述任务证据来源语义。mixed-version 继续读取/订阅并保留 Controller 原子任务状态包，在包内标记 `degraded` 和建议重载；额度/config lane 仍独立，插件不自动结束或重启 uTools。
- 既有 platform/Controller/UI 合同改为验证 legacy 归一、原子包保留和 current revision 透传；依授权不执行 tests、typecheck、build 或 uTools 验收。只读 Computer Use/线程工具/本机预检用于定位，不能替代重载后的真实状态切换验收。

## RAW-112 Initial Active Snapshot Corroboration

- Desktop follow 的首个 `snapshot` 是当前私有状态的重放，不等同于 bridge 已观察到一次新的 inactive→active 转换。授权的只读联调中，三条匿名任务都由 fresh follow snapshot 投影为 `desktop-live active`，却各自带有明确最新 `interrupted` Turn；它们的 `desktopActiveSince` 在同一轮订阅中于毫秒级一起新建，解释了旧两条加上本次真实任务变成三条。
- [preload/index.js](../../../../preload/index.js#L1) 为 shadow 维护仅进程内的 `activityRevision`。首次 snapshot 为 active、没有等待输入/审批标记，且库存已知 latest Turn 为 completed/failed/interrupted 时，仍先发布 active 以维持保守连续，再复用既有 `[0,300,1000]`、3 秒上限的单任务 latest-Turn 读取；相同 terminal 只有在最后一次成功读取后才足以证明它不是本轮新 Turn。
- 收敛前必须同时满足：shadow/父任务映射仍是原对象、`activityRevision` 未变化、活动仍为无 waiting flags 的 active、最新读取是同一或更新 terminal Turn。满足后只给该 shadow 设置进程内 `suppressUncorroboratedActive`，清除本轮误建的 interval，重算为 `desktop-live idle`；completed 复用现有 targeted 完成/未读路径，failed/interrupted 复用现有 stopped 强证据路径，所以 Controller、卡片、角标和归档能力一次切换。
- runtime/request activity patch 会推进 `activityRevision` 并取消抑制；完整更新的 `turn/started` 会取消核验、恢复 shadow active、重建真实 interval，并且不再安排额外 latest-Turn RPC。更新的 inProgress、等待请求、revision/映射变化、读取异常或 bridge 失败也都阻止 terminal 收敛，继续遵循保守 ongoing。
- 本轮不增加 Renderer/Controller timer、通用 debounce 或超时终态推断，不改变 50ms 结构合并、missing-key 隔离、完成展示窗、Activity Delta、Projection V3、动作、存储或迁移。`CODEX_TASK_STATE_REVISION` 提升为 `task-state-v2`；旧 v1 来源按 RAW-113 保留任务包并标记降级，不再清空。既有 bridge 测试文件补充 terminal snapshot 抖动与真实新 Turn 恢复合同，但依授权不执行。

## RAW-113 Atomic Task-State Package

- [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 是任务展示状态的唯一领域封装：`CodexTaskStatePackageV1` 同时携带 Controller 已稳定会话、最近 6 小时互斥动态组、`input / active / unread` 紧凑数量、下一次时间边界、当前/来源 revision、兼容等级与提示。纯构造函数不缓存、不延迟、不读取原始通信状态。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 在每次稳定会话发布、完成 hold 释放、状态更新和停用清理时原子替换该包；`view()` 与 `floatSnapshot()` 发布同一实例，前后任务只读包内 active 组。最近任务跨过 6 小时时复用 Controller 既有调度 timer 重建包并通知，不新增角标专用 timer。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 删除 revision 空快照、独立动态投影和一分钟状态 clock，只从 `taskState` 读取会话、状态组和数量。[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 的水球预览也只读同一包。顶层 `conversations` 保留一版兼容别名；缺少包的旧 Controller 快照只通过领域 `normalizeCodexTaskStatePackage` 一次转换为降级包，不在组件中复制筛选逻辑。
- `legacy` 或未来来源 revision 不再阻止 inventory/Activity Delta 读取、轮询或订阅，不删除 receipt、hold、active-exit 或来源基线。只要旧快照仍有任务，卡片和角标继续显示并在摘要/ARIA 中附带“状态已保留，建议重载”；已被旧 Controller 清空的数据不能由 Renderer 猜回，需正常重载后重新读取。
- RAW-112 的 initial snapshot 佐证、RAW-089–110 的证据优先与抖动保护、Projection V3、动作 ID、存储、隐私和完成配置全部保持不变。既有 domain/Controller/UI 测试文件补原子同源与 mixed-version 保留合同但按授权不执行，状态为 `reported / 未校验，待用户验收`。

## RAW-056 Codex Desktop Live Authority Contract

- 当前临时架构不是“只接宿主、删除插件连接器”：App Server 连接器继续负责额度、模型、库存、创建与持久化归档；Codex Desktop 伴随桥负责跨进程实时状态、未读和桌面侧栏刷新。Easy Agent 后续可在 platform port 后替换这两条通道。
- macOS preload 连接 `~/.codex/ipc/ipc.sock`，使用长度前缀帧与固定版本的 initialize、thread snapshot/patch/follow、request/read-state 和 archive broadcast。连接前校验目录/socket owner 与 mode；握手或消息版本不匹配标记 `incompatible` 并 fail-closed，不尝试猜协议。
- `statusAuthority=desktop-live` 是 `waiting-input / waiting-approval / active` 的唯一来源。Desktop bridge 为 `not-running / incompatible / failed / connecting` 或仅有 connector 状态时，不得由五秒启发或 App Server `active` 覆盖；RAW-089 要求产品投影保持 `ongoing`，不显示 unknown。latest Turn 的 completed/failed/interrupted 仍保留为 Host 原始证据，但只有 completed 能进入完成桶；其余值只供诊断并统一阻断归档。
- 完成未读要求最新 Turn 为 completed 且 `hasUnreadTurn=true`。live read-state 优先；桌面未连接时允许读取 `.codex-global-state.json` 内 Codex 自身持久化 unread 集合作为 `desktop-persisted`。EyPc 的 open/hide/restore/本地 receipt 不得更改该值，也不得把未读未知伪装成已读。
- Codex Desktop 全量 snapshot 仅在 preload 内瞬时建立 raw ID → 匿名 key 的 live shadow；正文、摘要、Turn items、cwd、路径和 raw ID 必须在边界内丢弃，不进入 Renderer、持久化、日志、文档或错误消息。
- 归档仍先由 App Server 重读与执行 `thread/archive`，再验证 `archived=false` 缺失、`archived=true` 存在。只有验证成功后才发送 `thread-archived` v2；返回值区分 dispatched 与未连接/失败。通知失败不回滚已经确认的上游归档，也不得宣称桌面 UI 已确认刷新。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 接受 Activity Delta V1/V2 以兼容旧 preload：V1 仅标记 connector authority，不能产生实时 Input/active；V2 投影桌面桥与未读权威。普通 watchdog 为 5s，连续三次失败临时改为 1s。

## RAW-059 Launch Discovery And Explicit Connector Fallback Contract

- [preload/index.js](../../../../preload/index.js#L1) 在 macOS/Windows 上只检查受控 CLI 候选；自动命中仅返回脱敏来源标签。用户可在配置页通过本机文件选择或完整路径提供可执行文件，Host 以既有 native/Node-wrapper/shim 运行计划核验后才写入独立的本机插件 storage key。完整路径不进入 Renderer 快照、持久化应用状态、错误、日志或过程文档。
- 手动位置无效时，Host 返回 `manualLaunchPathState=invalid` 并保持显式错误；不会静默改用其他入口。清除手动位置后恢复自动发现。保存/清除位置不强制中断已有 App Server，新的启动计划在下一次连接启动时生效。未设置手动位置时，既有 App Server 连接器仍提供额度、模型、库存、创建与已验证归档，并在界面公开“兼容连接器降级/可能延迟”。
- `statusFeedMode=desktop-live` 才允许 Input、等待审批与 active 子状态呈现实时权威。`connector-fallback` 绝不从插件缓存、App Server 活动状态或刷新频率推断完成；只显示已知 completed 结果，其余任务统一为“进行中”。手动/自动启动方式不改变此状态权威合同。
- Windows 的 CLI 自动发现/手动核验遵循 npm、Volta、NVM、本地和 PATH 的受控规则；`.cmd/.bat` 仍必须解析到已验证 Node/JS 或 bundled native binary。当前 Desktop 私有 IPC 实时桥仅为 macOS canary，Windows 配置页必须明确其实时状态尚不可用。

## RAW-063 Float Convergence And Recent-Task Flow

- [codex.ts](../../../../src/domain/codex.ts#L1) 保留完整 `CodexTaskTab` 兼容集合和 `all/inputRequired` 数据投影，但定义可见页签为 `ongoing / completed / hidden / projects`。旧持久化 `lastTaskTab=all/input`、旧投影快照及外部 `codex.tab.set` 的 `all/input` 统一归一为 `ongoing`；Float renderer 也把未知旧值回落到动态页，因此启动与异步快照不应短暂展示隐藏页。
- 常规投影的滚动窗口活动时间为权威 latest Turn 的 `max(startedAt, completedAt)`，并继续要求 `startedAt` 存在；完成时间只有 latest Turn 明确 completed 时才参与。浮窗展示投影在此基础上固定再过滤最近 6 小时、非隐藏任务，包含完成未读与已完成，并同时生成动态总数、状态段和 active 数量。`updatedAt` 只保留排序并列/展示用途，绝不替代 Turn 时间或状态依据。
- `FloatApp` 只渲染四个页签并按待输入、正在进行中、已停止、已完成未读、已完成顺序分段。RAW-089 取代 failed/system-error/unknown 的原有错误文本、告警图标、颜色和独立分段；未满足停止证据者以保守 `ongoing` 进入正在进行中。紧凑待输入角标继续从完整 `inputRequired` 取数；RAW-067 将其统一为直开显示排序第一条，完成未读同样使用完整集合。RAW-108 后进行中角标不再读取 Controller 聚合计数字段，而是直接取同一展示投影 active 段长度。
- 标题普通点击直接发送打开会话，Ctrl/Cmd 点击仅切换选择；元信息行点击只设置任务高亮并把焦点交给行容器，供 `Ctrl+T` 等 Codex profile 快捷键继承所属项目。行尾四按钮固定为 `24px` 槽、`2px` 间距、`102px` 轨宽。
- 已验证快照的注册提示只显示 `最近 {N} 天的 {M} 条`，不再显示原始或已注册来源计数。RAW-063 当时移除 Weekly 环的决定已由 RAW-065 取代；内部液面、百分比、状态角标、展开额度和外层兼容对象继续保留。
- 本轮不新增或修改测试代码，也不运行测试、类型检查、构建、uTools、截图或真实宿主操作；验收由用户执行。

## RAW-064 Status Consolidation And Non-Reflow Selection Hint

- Renderer 取消“需关注”和“宿主状态未知”分段；RAW-089 后 failed、interrupted、system-error、unknown 以及其它未确认状态都使用“正在进行中”分段、标签、图标和计数。只有等待输入、等待审批与完成保留独立产品语义。
- `selectedKeys.size > 0` 时的 `选择模式 / 已选 N 项 / Esc 退出` 保持 `role=status` 与 `aria-live=polite`，但置于 `.float-task-list-stage` 的绝对底部覆盖层，`pointer-events:none`，不进入普通流、不增加卡片或滚动区高度、不移动任务行坐标。
- 选择滚动区以底部 padding/scroll padding 为悬浮提示保留可访问空间；底部批量工具栏同时出现时上移到提示上方并共享安全区，顶部批量工具栏逻辑保持。既有 38px 左区、核心选择状态机、Esc/最后一项退出和行/子按钮 Space/Enter 所有权不改。
- 不新增公共 API、持久化字段、运行时 action、共享组件或 preload/platform 改动；不新增或运行测试、类型检查、构建、uTools、截图或真实 Codex 操作，用户独占验收。

## RAW-065 Weekly Progress Ring Without Decorative Rim

- [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 只在 primary 或 secondary 存在 `kind=weekly` 时渲染 SVG 进度环；连续模式使用同池 Weekly 剩余百分比计算圆弧，分段模式固定 20 段并按每 5% 激活一段。无 Weekly 时不渲染任何外圈。
- 水球表面删除 `2px inset`、静态 border、inset outline 与装饰 shell；保留的 track/value/segment 都属于数据进度环，不得再以无数据含义的普通圆环代替。
- [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) 继续发出环粗细、进度色、轨道色和光晕 CSS tokens；RAW-071 覆盖此前 `2–6px` 与 `3:1` 色彩门禁，颜色不再被格式、对比度或自动调整拦截。[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 在水球区直接显示并更新样式、粗细、颜色模式、进度色、轨道色和光晕；`shellOpacity` 只为旧持久化对象兼容而保留。

## RAW-066 Provider Interrupted To Visible Ongoing Projection

- [codex.ts](../../../../src/domain/codex.ts#L1) 保留 Host/Turn 的 `CodexTurnStatus='interrupted'`，但 `taskActivityState()` 在领域卡片投影时返回 `ongoing`；Renderer 内存快照的 `CodexTaskActivityState` 不再包含 `interrupted`，且任务列表不持久化，因此无需迁移。
- `runningCount/ongoingCount` 保留为领域兼容聚合，RAW-089 后 `attentionCount/unknownCount` 固定为 0；RAW-108 后 Renderer 角标不再直接消费这些全窗口聚合值，而从同一最近 6 小时展示投影取得 active 段长度。保守 ongoing 的卡片、详情与 Shift 预览仍统一显示“进行中”，使用播放图标与 running 色。
- 本条原先只规范 interrupted；RAW-089 将同一投影扩大到 failed、system-error、unknown 与所有未确认状态，并把归档能力统一为 `blocked-active`。

## RAW-067 Compact Counter First-Task Activation

- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 以一个紧凑角标目标解析器统一候选来源：待输入候选使用 `ConversationSnapshotV2.inputRequired`；完成未读候选使用 `all.filter(bucket === 'completed-unread')`，因此包含计数中的已隐藏会话。两类候选均通过现有 `displayOrderedTasks` 稳定分区，置顶优先，其后保持源数组的 latest Turn/匿名 key 顺序。
- RAW-082 后待输入将排序首条交给现有 `openTask → codex.task.open`，不确认；完成未读则将同一排序首条交给 `codex.completed-unread.openFirst`，在 EyPc 本地确认当前 completion revision 后打开。不先展开浮窗、不切换页签、不解除隐藏，也不因首条不可打开而跳到后续项。“进行中”继续只调用既有展开路径。
- 待输入与未读的 200ms hover/focus 说明及按钮 ARIA 在原数量后明确“打开第一条”；角标数字、位置、颜色、计数来源、原生点击/Enter/Space、触屏与上/下半区命中合同不变。不新增公共 API、类型、持久化字段、Runtime action、依赖或测试改动。

## RAW-068 Stable Ongoing Archive Capability

- [codex.ts](../../../../src/domain/codex.ts#L1) 以领域投影后的 `activityState` 计算归档能力：desktop-live active 或 `activityState='ongoing'` 都得到 `archiveCapability='blocked-active'` 与 `canArchive=false`。原始 interrupted 因此与 active 共用同一产品状态和动作能力，来源在两者之间切换不会再改变固定归档槽的可用性。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 继续常显固定 `归` 槽，但任务行、抽屉、Shift 预览、批量候选和确认入口只消费稳定的 `canArchive`；投影 ongoing 的控件始终禁用并说明“任务仍在进行中，暂不能归档”，不插拔槽位、不改变布局，也不出现可归档闪烁。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 仅为明确 completed 任务发送 `evidence='completed'`；其余投影 ongoing 在 Controller 门禁处直接拒绝。[preload/index.js](../../../../preload/index.js#L1) 保留 Host 重读作为最终安全门禁。
- completed 保留可验证归档能力；failed/interrupted/system-error/unknown/inProgress/notLoaded 与权威缺失全部不可归档。没有新增外部 API、Runtime action、持久化字段、迁移或依赖。

## RAW-082 Explicit Completed-Unread Acknowledgement

- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 的完成未读角标改为派发 `codex.completed-unread.openFirst`；[plugin.json](../../../../public/plugin.json#L1) 的 `eypc-codex-completed-unread` uTools 全局功能和 [featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 同样派发该 action。配置页通过同一功能说明跳转到 uTools 系统级快捷键设置，未声称已自动注册快捷键。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 与 Float 使用相同的置顶优先、稳定展示顺序解析首条完成未读任务；Controller 为该任务当前 `completionRevision` 写入本地 receipt 并立刻重新投影，因此角标、列表、项目视图、详情和 action 结果同时成为 completed/read。该写入只代表用户触发的 EyPc 本地确认，绝不写 Codex Desktop 或由时间/connector 推断原生未读；后续较新的 completion revision 自动重新未读。
- 待输入角标与 `eypc-codex-input` 继续沿用 `openTask → codex.task.open`，不写 receipt，也不因“可能尚未输入”而改变状态。普通任务行打开同样不确认未读。依用户规则不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作。

## RAW-069 / RAW-077 / RAW-078 / RAW-079 / RAW-080 Interruptible Ongoing-Exit Presentation Hold

- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 同时维护 provider-derived 原始会话快照与 Renderer 展示快照。已完成且已读回流为 completed-unread 或 desktop-live active 时立即发布。只有同一任务从 visible running 获得明确 latest-Turn completed 证据时，才按持久化 `completionPresentationDelayMs` 建立展示窗；允许 `0 / 500 / 1000 / 1500 / 2000 / 3000ms`，当前代码默认 `0ms` 且已有用户值原样保留，其中 `0` 直接发布。RAW-089 后 failed/system-error 等异常不再建立终态 hold，而是继续保持 ongoing。
- 展示窗内任务以最新原始卡片为底，移除 completion/unread/完成时间展示字段，并统一覆盖为 `bucket='ongoing'`、`activityState='ongoing'`、`state='running'`、`archiveCapability='blocked-active'`、`canArchive=false`。Controller 同步重建 ongoing/completed/hidden/all、完成页、项目卡、Pinned/Projects/Chats section 与全部计数，因此卡片、分组、详情、Shift 预览、三个角标和归档入口不会各自切换。
- 窗口内原始任务回到 active/ongoing 时立即删除 hold 并保持进行中；只有 completed 证据持续到截止时间，定时器才一次性发布 completed/completed-unread 及对应能力。截止时间从 Desktop active 退出事件起算，目标 Turn 核验耗时不会再叠加一份完整展示窗。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 进行中角标直接读取统一快照。配置页以“进行中离开稳定窗”将该延迟直接写入持久化设置；该值只延迟已成立的完成展示，不作为缓存、状态核验或完成推断。

## RAW-070 Interrupted Grace To Completion Marker（由 RAW-089 取代）

- RAW-089 删除 interrupted 的 60 秒完成推断。interrupted 永久保持 ongoing，直到 latest Turn 明确返回 completed；elapsed time、`updatedAt`、刷新次数和连接状态均不能生成 completion revision。

## RAW-071 Appearance Workbench And Direct Color Application

- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 将外观配置重构为三个有标题、部位说明和实时预览的独立区域：水球（底色、液体层、Weekly 环和角标）、卡片（表面及文字/图标前景）和状态信号（充足、提醒、紧张）。页面保留现有连接、显示、任务、刷新和模型操作，但不再以“手动配色”把水球与卡片的控制混在同一网格。
- 水球预览必须可见地标出底色、液体 A/B、进度环、轨道和三个角标；卡片预览只使用卡片表面/前景与状态信号。预设与主题保存继续作用于完整颜色和水球外观快照，单个颜色控件则只更新它标明的部位。
- [codex.ts](../../../../src/domain/codex.ts#L1) 对已存在的颜色字符串只保留原值，不再因十六进制格式而替换为默认值；[codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) 不再调整用户给定颜色以满足对比度；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 不再拒绝或回滚颜色/水球外观 patch。原生 `input[type=color]` 仍提供浏览器自身可选值范围；外部无效 CSS 值不应被悄悄替换，应保持为原始配置且仅可能由浏览器 CSS 解析决定是否可视。
- RAW-051/054 的“卡片配对、有效色域、最近可读亮度、一次确认”和它们的验证门禁仅作为历史实现证据保留；本条覆盖其当前产品合同。不得新增依赖、外部写入、数据库变更或新的运行时动作。

## RAW-072 Preview-Authoritative Water Rendering

- [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 以配置页预览的球体构图为唯一视觉实现，并被配置页与真实浮窗共同使用；球体底色、液体 A/B、Weekly 环/轨道和角标位置/颜色不得分别维护。
- 配置页不以“示意”代替真实效果；真实浮窗也不保留旧水面、折射、光环或数字布局而覆盖用户已确认的预览。数据含义、Weekly-only 显示条件和三个角标动作保持原合同。

## RAW-073 Transparent Water Base

- [codex.ts](../../../../src/domain/codex.ts#L1) 在水球外观中持久化球体底色透明度，默认 `100%`，并允许 `0%`。该值不修改 `colors.water` 本身。
- [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 将底色与其透明度独立作用于球体表面；液体、数据环、读数和角标不跟随底色透明度消失。[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 在水球区公开同一控件与真实渲染预览。

## RAW-074 Preserve Layered Water Motion

- [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 保留既有三层液体、折射、高光与 `static / slow / normal / fast` 运动路径；共享预览只改变承载位置，不能替换该视觉/运动实现。
- 去除本轮简化引入的底部平铺矩形层。水球区控件按真实层一一归属：球体底色/透明度、液体 A/B、配色、透明度、波幅、速度、Weekly 环样式/进度/轨道及角标色。

## RAW-075 Expanded Float Card Configuration

- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 的卡片区以展开后的悬浮卡片为预览目标：页签、搜索、额度和任务区均可见，避免把收起态横向卡片误认为配置对象。
- 卡片预览通过 [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) 的 `card` surface theme token 着色；“展开卡片表面”与“展开文字 / 图标”分别说明其覆盖范围，且不会与水球或状态信号控件混合。

## RAW-076 Expanded Card Theme Tokens

- [codex.ts](../../../../src/domain/codex.ts#L1) 在设置与已保存主题中持久化 `expandedCardAppearance`：主面板、内层块、边框、主/次文字、选中、焦点、进行中、完成未读九项直接令牌；缺失的历史主题按其已有卡片颜色补齐，保持兼容。
- [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L57) 提供 12 套内置主题（含 7 套高饱和炫彩），每套同一完整令牌集，并由唯一的 expanded-card resolver 同时服务预览与运行态；它不对用户提交的令牌做格式、对比度或色域回滚。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 在浮窗展开时无条件选择 expanded-card theme，不依赖水球或紧凑卡片的当前显示样式；收起态仍保持自己的紧凑皮肤。
- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 按面板层次、文字层级、交互强调、任务状态分组展示九项控件及真实大卡片预览，控件只改标记的令牌，不影响水球区或状态信号区。

## RAW-055 Label, Density And Selection Contract

- 任务投影以 `originalName = thread.name || thread.displayName || 兜底` 建立原名，非空本地别名才写入 `alias`；`displayName/name` 均为 `alias || originalName`。列表只渲染一个主标题，原名继续可搜索，并在别名存在时进入详情/Shift 预览。
- 展开态主/次/微型文字为 `12/10/9px`；任务/项目行 `40px`，任务中部 `36px`、项目中部 `38px`；本节的 `26×30px` 左控件已由 RAW-058 改为 `38px` 全高矩形。RAW-063 将右侧四槽收敛为 `24px`、间距 `2px`、操作区 `102px`、内容预留 `111px`。
- `selectedKeys.size === 0` 时，中部打开任务、左槽建立选择；`selectedKeys.size > 0` 时，两区域均切换成员，集合清空即退出选择模式。任务正文内的独立操作按钮继续阻止冒泡并执行自身动作。
- hover、keyboard highlight、selected、selected+highlight、active、selected+active 必须有稳定优先级；左槽同步 `aria-pressed`。不增加持久化字段或新快捷键。

## RAW-057 Explicit Selection Contrast

- `selectedKeys.size > 0` 时模式条实时显示选择数量及 Esc 退出提示；RAW-064 将其从任务收件箱顶部的普通流位置移至列表舞台底部绝对覆盖层，集合清空时立即移除且列表不重排。
- 选择模式下未选行降至 `.62` 不透明度并降低饱和度，hover 时只恢复到次级层级；选中行保持完整不透明度、`2px` 强调边、`5px` 左轨和更强底色/阴影。
- RAW-057 原先以 `aria-pressed=true` 的强调色实底和 `✓` 替换状态图标；该图标替换细节已由 RAW-058 取代，当前左控件始终保留任务状态图标。焦点与 active 继续有独立边界，上述结构线索与文字提示共同承担区分，不允许只靠细微色差。

## RAW-058 Selection, Pin And Counter Feedback Fusion

- 任务行保持 `40px`，左侧选择按钮为宽 `38px`、贴合行左/顶/底且仅保留左圆角的矩形；整块可点击并始终显示任务状态图标。选中按钮使用更强强调底与 `aria-pressed=true`，不再替换为勾选符号。
- 选中行由现有 `accent / running / pending / surface` 组成三色渐变；hover/focus 增强色占比和焦点外框，active 加深并使用内收阴影。选择模式条和未选降权继续有效。
- 无选择时左区选择、中部打开、Ctrl/Cmd+中部选择且不打开；有选择时左区或中部切换成员，最后一项移除即退出。任务行 Space 切换选择；左区按钮及右侧动作按钮的 Space/Enter 由原生按钮拥有，根行不得重复处理。
- 行尾删除“本地顶”。`顶` 固定在 `24px` 槽内：本地置顶使用 `var(--codex-warning)` 文字/边框/轻底；原生置顶只读；未置顶普通。200ms 说明分别表达 EyPc 本地、Codex 原生、未置顶和 Chats 来源。原生/Chats 保持可聚焦并使用 `aria-disabled=true`，点击、Enter、Quick Jump、`Ctrl+P` 与移动快捷键都通过同一只读门禁。
- 紧凑水球/卡片三个角标共用移出展开分支后的不透明说明层和既有视口夹紧。待输入单项、多项、正在进行中和已完成未读均在 hover/focus 200ms 后说明数量与点击作用；离开/失焦立即关闭。角标 hover/focus 不展开、不切页、不触发延时展开，触屏不模拟 hover。RAW-082 后待输入说明/ARIA仍为“打开第一条”，完成未读明确为打开并在 EyPc 本地标记首条；进行中仍保持原展开行为。

## RAW-051 Card Pair And Session-Layer Contract

> 状态：其中的配色、联动、验证、预览和确认事务已由 RAW-071 完整取代；下列配色文字只保留为历史证据。会话层回退条款仍有效。

- `CodexColorSettings.cardForeground` 是显式持久化字段。旧配置缺失时在深墨 `#07161D` 与浅字 `#F8FCFB` 中按现有可读前景算法选择，避免升级后的视觉突变；三个预设都必须包含该字段并参与完整预设匹配。
- 卡片表面不再有亮度门槛；表面/前景必须达到 `4.5:1`，派生边界与焦点态继续达到 `3:1`。水球仍须满足深色亮度约束。Runtime 更新若只带 `card` 或 `cardForeground`、值畸形或整对低对比，必须在写入前拒绝且不产生部分持久化。
- 配置入口只打开 [CodexCardColorDialog.vue](../../../../src/components/CodexCardColorDialog.vue#L1)。两组颜色必须共享一个草稿、整体验证与确认边界；HEX 无效草稿、ARIA 错误关联、焦点圈定、窄屏/短高度滚动和取消零持久化合同保持。RAW-054 取代本节早期的滑杆-only 与“真实 companion 在确认前不变化”细节。
- “确认并应用”只保存一次完整 colors 对象；取消、Esc、遮罩和组件关闭均不持久化并恢复入口焦点。模态内 Tab/Shift+Tab 圈定，短高度允许纵向滚动且不得横向溢出。
- 单项详情记录原始触发点、目标项和稳定的“查看详情”动作 ID。详情 Esc 或 Header 返回切换到同一目标的更多操作并聚焦该动作；第二次 Esc 关闭并恢复原会话行。直接 `Ctrl+←` 打开详情采用同一栈，`Ctrl+←/→` 切层不得覆盖原触发点。目标失效时退回可见会话行或列表容器；批量抽屉无详情子层。
- 完整 Escape 优先级为：二次确认 → composer/model → Quick Jump → Shift 预览 → 行内编辑 → 详情 → 更多操作 → 多选 → 搜索 → 收起。归档确认存在时第一次 Esc 只取消确认。

## RAW-054 Linked Color Boards And Real-Float Preview

> 状态：本节的色板、色域、配对校验、暂态预览和原子确认均为历史证据，不能作为当前外观实现路线；当前合同见 RAW-071。

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

- `timeWindowDays` 默认 30，可配置 1–365；候选仍要求有效 `lastTurnStartedAt`，滚动窗口资格取 `max(lastTurnStartedAt,lastTurnCompletedAt)` 且边界包含；`updatedAt` 不得作为时间或状态回退。
- 可见页签固定为 `动态 / 已完成 / 已隐藏 / 项目`。`all` 和 `inputRequired` 继续作为底层兼容投影，供注册提示和紧凑角标首条直开使用，但不得单独渲染或路由。
- `动态`：稳定持久化 ID 仍为 `ongoing`，只展示最近 6 小时有上述 Turn 活动的非隐藏任务，依次为 `待输入 / 正在进行中 / 已完成未读 / 已完成`。只有 `desktop-live` 能产生待输入、等待审批或 active；failed/interrupted/systemError/unknown/notLoaded/inProgress/权威缺失全部投影为 ongoing，不冒充 live authority，但必须进入正在进行中。每段先稳定展示置顶项，再展示非置顶项，各分区内部保持最新 Turn `startedAt` 倒序。
- `已隐藏`：EyPc 本地隐藏的窗口内会话，保留真实状态。
- `已完成`：非隐藏、非 active 且最新 Turn completed。
- `项目`：同一窗口内会话按原生结构投影。`Pinned` 固定为 EyPc 置顶会话、Codex 原生置顶会话、EyPc 置顶项目、Codex 原生置顶项目；置顶会话从所属项目行中排除，来源由 `顶` 控件和说明表达，不追加行尾文字。`Projects` 包含其余原生项目和空项目；`Chats` 只含原生 projectless 会话，展开任务必须紧随其标题行。
- 紧凑水球的角标 hover/focus 显示 `待输入 N · 打开第一条`、`进行中 N`、`未读 N · 打开第一条`；`F` / `Shift+F` / `Ctrl+F` 在 Codex Tab 的任意非编辑内容区域均可进入 Quick Jump（包括多选），编辑控件保留原生文本输入。Codex 会话搜索改用 `Ctrl+Shift+F`。
- 配置页的主题即时同步监听器必须在其依赖的 `activeThemeOption` 初始化之后注册，避免 setup TDZ 阻止页面挂载。
- 普通 `Escape` 继续按浮窗局部层级恢复；`Shift+Escape` 通过宿主 `return-focus` 桥临时隐藏已展开卡片并回退到调用前焦点，不修改 `floatEnabled` 或持久化设置，下一次全局激活可复用同一浮窗。
- 所有底层任务数组以 `lastTurnStartedAt desc`、匿名 key asc 为唯一稳定顺序。任务页签显示时稳定分成置顶/非置顶两区：置顶区优先并遵循 `Pinned` 顺序，非置顶区保持源数组顺序。搜索匹配别名、原名和项目名，只过滤当前可见页签，不在任一分区内重排；项目名命中时展示该项目全部窗口内任务。

## UI And Local State

- 第一次使用默认 `动态`（内部稳定 ID `ongoing`）。保存最后页签、项目折叠状态、1–365 天窗口、任务/项目别名、本地置顶顺序和项目页隐藏集合；旧 `lastTaskTab=all/input`、旧快照和 `codex.tab.set` 的这两个目标均规范化为 `ongoing`，不改变其余四个页签的持久化行为。
- 持久化只使用散列任务 key 和稳定项目指纹；不得持久化原始 thread/Turn ID、项目路径、action alias 或任务列表。
- 原生项目/置顶顺序只读。本地置顶可通过操作与 `Alt+↑/↓` 调整；动作完成后的下一份投影必须在所有相关任务/项目卡片上带 `pinSource`，本地 `顶` 保持 `aria-pressed=true` 并使用 warning 状态。任务置顶在当前任务页签/状态段内前置，项目置顶进入 `Pinned`。别名只改显示和搜索，归属、归档仍使用真实身份。
- 旧“从 EyPc 移除/恢复”本地抑制已由 RAW-052 取代。项目“隐/显”是可恢复的本地分组展示状态；项目“移”是经 Host 安全事务执行的真实 Codex 侧栏移除，两者不得混用。
- 水球不再显示迷你详情或普通装饰圆环。水球根容器透明，表面只保留内部深度阴影，不绘制 inset、静态 border、inset outline、装饰 shell 或同尺寸外发光；宿主水球按钮的 focus-visible 不绘制外部整圆，改为百分比读数下划线。收起态上半区是角标安全区，pointer enter/move 不展开；只有指针进入下半区才立即展开。球体显式点击和键盘激活仍可展开，触屏不模拟 hover。中心依次选择普通 5 小时正余额、普通周正余额、最高正余额 Spark；两个普通窗口均无正余额时才展示 Spark。Spark 百分比上方显示 `S`，文字背景透明。百分比读数的位置、字号、字形和颜色独立持久化，配置页预览与真实水球共用同一组件/对象；存在 Weekly 读数时显示同池剩余进度环及其配置；无 Weekly 时没有任何外圈。历史 `shellOpacity` 只保留持久化兼容且不再有入口。
- 展开额度区只渲染 App Server 实际返回的普通与 Spark 窗口。只有 Weekly 时不得伪造 5 小时额度；缺失窗口不视为 0，也不得触发模型自动降级。
- 收起态左下角仅在非零时显示完整 `inputRequired` 数；右下最边角展示完整完成未读数（超过 99 显示 `99+`），其上方展示同一动态投影中最近 6 小时、非隐藏的 `active / waiting-approval / ongoing` 数。waiting-input 只计入输入，明确 stopped 不计入进行中；异常、权威缺失和未确认状态若已由 Controller 稳定投影为保守 ongoing，仍与对应“正在进行中”卡片同计数。待输入无论一项或多项都只打开完整计数集合中展示排序第一条；完成未读角标或全局功能打开同样的第一条并本地确认其当前 completion revision；进行中仍只展开浮窗。
- 会话行悬停超过 500ms 显示不透明、隐私白名单详情；状态槽和固定短按钮悬停超过 200ms 显示不透明说明。按住纯 Shift 仍可显示不抢焦点的只读预览；悬停会话优先、键盘高亮兜底，Shift+↑/↓ 接管目标，真实鼠标移动后恢复悬停所有权。所有详情只含名称/原名、项目、状态/活动标记、允许的时间/耗时、来源、隐藏/置顶和归档能力；正文、摘要、raw ID、cwd 与路径永不读取或展示。

## Selection, Operations And Shortcuts

- 项目行常显 `顶/移/隐显/+`，任务行常显 `顶/隐显/归/+`，每槽固定 `24px`、间距 `2px`、四槽区 `102px`；完整动作仍进入右键或 `Ctrl+→` 抽屉。投影 ongoing 的 `归` 槽保位且稳定禁用，抽屉、批量候选与 Shift 预览使用同一 capability，不因 active/interrupted 来源切换改变可用性。
- Codex 悬浮子窗不挂载 `OperationTooltipLayer`，水球无额度气泡，也不使用原生 `title`。状态槽与短字符按钮可显示自有的 200ms 不透明说明；其余完整说明存在于操作抽屉、Shift 预览和 ARIA，主程序其他功能的统一 Tooltip 不受影响。
- 需要确认的动作第一次进入 5 秒待确认态，第二次点击相同位置或再次按相同快捷键才执行；`Escape`、外部点击、切换页签和超时均取消。
- 无选择时任务标题普通单击直达会话，Ctrl/Cmd 标题点击只选择；左侧状态槽、Shift/Ctrl/Cmd 手势或当前高亮项 Space 建立选择。项目/状态/分钟元信息行只设置唯一高亮和 DOM 焦点，以继承 `Ctrl+T` 的项目上下文；已有任一选择时，任务核心与左槽都切换当前成员，移出最后一项即退出选择模式。Space 与项目标题行为沿用既有键盘合同。搜索、页签或刷新改变可见集合时清理不可见选择。
- 可见选择达到两项时自动显示 `已选 N / 归 / 操 / 清` 绝对浮动批量栏；锚点在列表下半区时置顶，否则置底，并在选择、焦点、滚动和尺寸变化时重算。批量栏提供滚动安全区，但不改变任务 DOM 顺序、行坐标或列表高度；不足两项即关闭。
- 同一页只有一个高亮项。方向键移动后进入键盘所有权，鼠标静止不改变高亮；鼠标再次实际移动后恢复鼠标所有权。右键未选中任务先改为单选，已选中任务保留多选，右键项目清空任务选择，然后与 `Ctrl+→` 打开同一完整操作抽屉；抽屉内上下键只移动动作，Enter 或 `Ctrl+1…9` 执行。
- 单项动作包含当前上下文可用的新建会话、选择模型新建、打开、详情、别名、置顶、隐藏和归档；批量动作只包含可逐项定义的归档、隐藏/恢复、置顶/取消置顶和清空选择，不展示打开或编辑别名。
- 默认 Codex 域增加 `Ctrl+T`（UI 展示 `c-t`）作为 `codex.thread.createFocused`，并继续拥有 `↑/↓`、`Space`、`Enter`、`Ctrl+←/→`、`Delete`、`F2`、`Ctrl+P`、`Alt+↑/↓`、`Ctrl+F/R`、`Ctrl+1…9`、`F/Shift+F` 和 `Escape`。`Ctrl+T` 出现在设置页并支持改键；冲突只在 Tab、layer 和 `when` 可同时成立时报告。
- 悬浮子窗口接收有效键位与安全 action，但自行按与主窗口一致的 `when`、layer 优先级解析，并维护 `codex-composer` 输入角色和本地暂态层。编辑器、确认、抽屉、预览、Quick Jump 或模型层打开时，彼此按固定 LIFO 隔离；主窗口不接管子窗 DOM 焦点。
- Quick Jump 只收集未被 composer/抽屉/预览/遮罩覆盖、未被裁剪、允许 pointer events、位于视口且命中栈包含自身的目标。会话目标同步唯一高亮，固定操作按钮目标执行相同受门禁动作；打开 Quick Jump 会关闭 Shift 预览。普通标记是深色底、白色粗体和白描边，当前标记是黄色底、深色字和深描边。
- 打开、隐藏、恢复完成任务都不得推进或清除 Codex Desktop 未读；旧 receipt 只参与本地隐藏兼容，不参与 unread 投影。项目折叠先做本地乐观反馈再持久化，指针/焦点离开或窗口失焦后的自动收起延迟约 220ms。
- 置顶动作通过既有 `codex.pin.toggle` 持久化后立即重新投影。浮窗桥接若无法送达动作，必须通过 `aria-live` 区域明确提示重新打开 EyPc 后重试，不得静默停留在旧状态。

## New Thread Composer And Transient Bridge

- 点击项目 `＋`、`Ctrl+T` 或右键新建动作每次都打开 editor；默认目标来自当前高亮会话/项目，没有上下文时为 Chats。弹层显示项目、模型名称与 ID、自动选择原因及对应额度，多行原生文本框自动聚焦并保留系统听写所有权。
- `quota-auto` 在普通阶段使用 `newThreadPreferredModel`，否则选择目录默认/首个非 Spark 模型；任一实际普通窗口为 0 时选择最高可用 Spark，缺失窗口不算 0。模型或 Spark 额度不可用时进入手动选择；本次手选不写配置。
- 模型在编辑器打开时冻结。提交前额度、目录或项目指纹变化时返回新的安全上下文，刷新模型说明并要求用户再次确认，不用旧选择静默提交。
- 编辑器内 Enter 换行，Ctrl/Cmd+Enter 发送，Tab/Shift+Tab 只在弹层内循环，Escape 取消并恢复触发点。支持在提示词框粘贴、文件选择或拖放一张 PNG/JPEG/WebP 参考图；附件仅保留在编辑器内存与预览 URL，取消/关闭即清除。已有文字或图片时只显示“发送并打开”，纯空编辑器才允许“仅创建空会话”。
- Renderer 请求只含散列项目键、短期项目 alias、项目/上下文指纹、精确模型 ID、模式和瞬时提示词。Preload 在内存中解析 cwd/raw thread ID；以 `allowProviderModelFallback=false` 调用 `thread/start`，校验响应顶层实际 `model/cwd` 后才调用 `turn/start`，最后 Deep Link 仅含 thread ID。
- 首轮失败归档清理本次零轮线程并保留 editor 内存草稿；清理未确认时禁止自动重试。首轮已启动但 Deep Link 失败不得归档运行任务，只返回短期重试打开 alias。文本模式下 App Server 不可用时不复制或编码提示词，只能由用户显式打开 Codex 空白页手动处理；图片模式遵循下方 RAW-063 的受限文字复制回退。
- 当前 App Server 模型目录仅声明文本输入，图片提交不得调用 `thread/start` 或 `turn/start`；浮窗受限 IPC 只复制用户的文字提示词后打开 Codex 空白会话，用户自行粘贴图片并选择模型。图片、提示词和预览 URL均不进入通用 Runtime action、快照、日志、localStorage、项目文档、错误记忆或 Deep Link；复制仅发生在该用户触发的图片回退动作中，成功、取消、关闭与组件卸载均立即清除 EyPc 副本。

## Archive Safety Contract

- 单条归档请求只接受短期 action alias、预期任务 recency/version、最新 Turn `startedAt`/状态和 `sourceFingerprint`。
- Preload 重读项目指纹、thread 身份/状态/recency 和最新 Turn；请求与重读都必须是同一明确 `completed` revision，任何缺失、变化、desktop-live active、非 completed 或新版本均拒绝。通过后调用 `thread/archive`，再完整确认该 ID 从 `archived=false` 消失且出现在 `archived=true`；失败不从 UI 移除。
- 双向验证成功后，Preload 向已连接 Codex Desktop 发送版本化 `thread-archived` 通知，使桌面侧栏无需关闭重启即可同步；结果只承诺通知已派发，不宣称桌面 UI 已确认消费。未连接/派发失败会返回同步状态但不撤销已验证归档。
- 项目“归档已完成任务”重新扫描该项目全部未归档历史，不受 30 天窗口影响。只有最新 Turn 明确 `completed` 的条目进入候选，其它状态、缺失 Turn 与 malformed 证据全部作为进行中跳过；候选按每批 20、并发 2 逐项执行同样的双向验证。部分失败返回逐项匿名结果并保留失败行。
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

- 主文件/备份回退、完整分页、指纹重试、归属优先级、移除项目过滤、30 天边界、四页签与旧 all/input 回退、6 小时动态流、Desktop IPC live/unread 投影、5s watchdog、打开/隐藏不改未读、归档后桌面通知、普通/Spark 额度优先级、仅 Weekly 数据环且无装饰圈的水球命中/角标说明、`quota-auto`、瞬时创建、多选状态机/键盘归属、无重排底部选择提示、置顶来源门禁、隐私预览、Quick Jump、二次确认、批量部分失败与归档双向验证均有历史测试合同。RAW-089 新增/更新领域、Controller 与 preload 定向核验测试合同，但依项目规则不执行；真实状态切换仍由用户验收。
- 380px 与 330px 展开态、330px composer/Shift 预览/右键抽屉、104px Spark 水球完成浏览器视觉核验；页面无横向溢出，`S`、模型名称/ID/原因/额度、系统听写输入框、预览内部滚动、Space 选中后下移、批量栏上下避让、任务行零位移及 Pinned/Projects/Chats 顺序均可读。
- 专用临时任务真实执行 `archive → false/true → unarchive → true/false`，最终再次归档清理；不操作用户现有任务。
- RAW-051/054 的历史验收命令与证据保持原记录，但不能验证 RAW-071；当前外观仅由用户按三个独立区域逐项验收。RAW-052–053、RAW-055–058 仍按用户独占验收，不能由历史 RAW-054 门禁结果替代。

## Documentation Impact And Residuals

- Classification: `requirement-canonical + project-current + controlled-task`。
- 同步层：raw/spec/plan/tasks/verify/handoff、[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)、[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)、[technical-details.md](../../../knowledge/technical-details.md#L1)、[developer-soul.md](../../../knowledge/developer-soul.md#L1)、[design-preferences.json](../../../knowledge/design-preferences.json#L1)、provider 状态投影与归档重读错误记忆，以及 [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)。
- 保留残余：Codex Desktop 私有 IPC 版本漂移与当前仅 macOS canary、归档重读到写入之间的 provider TOCTOU、归档通知仅能确认派发不能确认 UI 消费、真实 Windows uTools/系统热键、真实系统听写、真实 `turn/start`/Deep Link、多显示器/DPI 和 macOS 多 Space 操作。RAW-056 未运行任何开发或真实宿主门禁。

## RAW-069 主对话状态主体化与 Side Chat 实时输入

- Renderer 只接收主对话的匿名 activity key；Side Chat 仅在 preload 内作为 live shadow 保存，并依据 `forkedFromId`、`sideConversationParentNavigationPath` 聚合到主对话，不进入普通任务库存、任务卡或持久化。
- `waitingOnUserInput` 的进入和退出立即更新主对话的 `inputRequired`、`inputRequiredCount`、角标和任务投影；已完成且已读回流为 completed-unread 或 desktop-live active 同样立即发布。RAW-089 删除其它 Activity Delta 的固定 2 秒 Controller 防抖：每个脱敏 delta 立即进入统一投影，异常仍为进行中。
- 明确完成转换交由既有完成稳定器处理，截止时间从真实 active 退出事件起算；Desktop IPC 失联、协议不兼容、功能关闭、dispose 和归档立即清理或降级为进行中，不等待窗口。
- 主对话打开动作在 preload 内解析隐藏导航目标，按待输入、待审批、进行中和 revision 选择 Side Chat；直跳能力必须经过本机真实 Deep Link/已验证私有 IPC 验证，失败时回退主对话，不向 Renderer 暴露原始 ID。

## RAW-083 紧凑悬浮窗角标与命中区

- 待输入角标固定到紧凑水球/卡片的左下；已完成未读固定到最右下角，进行中在其上方形成稳定右下纵列，分别保留自身颜色、计数、200ms 隐私安全说明、点击动作和键盘可达性。
- 紧凑主体的 hover 与指针点击仅在上方三分之一触发展开；下半区绝不触发展开，并是唯一可启动窗口拖拽的区域；中间三分之一保持惰性。角标自身仍是独立交互控件，不成为拖拽起点。
- 显式键盘激活继续展开，触屏不模拟 hover；拖动超过既有阈值仍抑制后续点击展开。该细化不修改额度读数、任务投影、Host 拖拽协议、持久化配置或外部服务。

## RAW-084 全局前后任务循环

- [plugin.json](../../../../public/plugin.json#L1) 注册“上一个 Codex 任务”与“下一个 Codex 任务”两个 `mainHide` uTools 全局功能；[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 只将它们路由至 `codex.task.previous` / `codex.task.next`，并复用现有 feature-disabled 回退。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 以非持久化匿名 key 记住本次循环位置。候选序列优先依次拼接 `inputRequired`、完整 `completed-unread` 和 `ongoing`，每段使用现有置顶优先/稳定显示顺序并按 key 去重；`stopped` 永远不参与循环。若该常规序列为空，回退为当前投影内非 `stopped` 且 `pinSource='local'` 的 EyPc 本地置顶任务，仍按同一显示顺序和 key 去重，原生置顶不参与回退。首次 next/previous 分别选择首项/末项，之后按方向回绕。只接受当前具有 action alias 的任务，候选为空或动作失效时给出明确消息。
- 两个命令只能调用既有打开路径：不派发 completed-unread acknowledgement、不写 EyPc receipt、不改隐藏、选中、页签或 Codex Desktop 原生 unread。设置页为两个功能各自调用现有 uTools 全局快捷键配置入口；不默认占用系统组合键。

## RAW-087 宿主快捷键边界与配置分面

- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 已删除 `getAllFeatureHotKey` 私有同步 IPC、快捷键过滤器和 Renderer 读取桥；保留的 `configureHotkey` 只调用官方 `redirectHotKeySetting`。窗口能力不再声明可读取快捷键。
- [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) 与 [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) 已删除 readback 类型、任务/窗口快照、刷新动作及进入窗口页后的读取。Codex 和窗口槽页不再显示“当前绑定/未配置/无法读取”。
- [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 默认展示顶部“快捷方式”Tab，并以双列压缩六个入口；“任务 / 水球 / 卡片 / 运行”只渲染各自配置。运行诊断从默认入口移至运行页，诊断详情、CLI 降级、外观部位、百分比与窗口尺寸说明进入键盘可聚焦的 `i` 提示。
- 用户已确认移除入口回读后插件恢复加载。当前完整删除与分面布局通过私有 IPC 残余搜索、preload 语法/镜像和 Vue SFC 静态编译；真实布局仍等待用户在 uTools 中验收。

## RAW-089 实时完成核验与异常统一进行中

- [preload/index.js](../../../../preload/index.js#L1) 在 Codex Desktop 主任务或聚合 Side Chat 从 active 退出时立即发送状态 delta，并对该 raw thread 启动单飞 latest-Turn 核验。核验只调用 `thread/turns/list(limit=1, sortDirection=desc, itemsView=notLoaded)`，总期限 3 秒，重试间隔为即时、300ms、1000ms；任务恢复 active、库存替换、连接重置或 dispose 时取消。若 active 前已有 completed revision，相同旧 revision 不得作为本轮完成；只有更新的 Turn，或已知 inProgress Turn 的同 revision completed，才可放行。成功只向 Activity Delta V2 发送匿名 key、Turn status 与毫秒时间，正文/raw ID/cursor 不越过 preload；失败发 `inventoryChanged=true` 进入完整校对。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 立即合并每个 Activity Delta，不再维护固定 2 秒 pending/debounce 队列。active→idle 但 Turn 版本未变化时先强制维持 ongoing；fresh latest-Turn completed 到达后，`completionPresentationDelayMs` 从该退出时刻起算，若核验耗时已覆盖稳定窗则立即完成，不再叠加等待。
- [codex.ts](../../../../src/domain/codex.ts#L1) 只允许 latest Turn completed 生成 completion revision 和归档能力。除 RAW-091 的明确停止组合外，failed/interrupted/systemError/notLoaded/inProgress/authority loss/Turn 缺失统一投影为 `ongoing/running/blocked-active`；interrupted 不再按 60 秒生成完成版本。`unknownCount/attentionCount` 固定为 0，所有 ongoing 桶都进入进行中计数。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 删除“宿主状态未知”分段和失败/系统错误/未知标签与图标；完成桶优先显示“已完成”，其它非等待状态统一“进行中”。遗留快照中的 unknown/attention 计数也在紧凑投影中折叠进 ongoing。[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 将 `taskRefreshSeconds` 标为“完整校对频率”，明确它用于新任务、项目变化与漏事件；实时状态不等待该周期。
- 现有持久化值核验为 `taskRefreshSeconds=15`、`completionPresentationDelayMs=1500`：前者保留为低频结构校对，后者保留为用户可配置的完成展示稳定窗；不存在“全量任务每 2 秒缓存/扫描”合同。本轮已更新测试合同但不运行测试、typecheck、build、uTools、截图或新的真实状态切换；实现状态为 `reported / 未校验，待用户验收`。

## RAW-090 异常快照隔离与任务数稳定

- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 把“任务出现在上一份稳定清单、但缺少于新的完整快照”视为库存消失候选，不立即替换 `lastThreads`。首次缺失保留上一份展示、将会话诊断标记为 stale，并在约 200ms 后发起一次完整复核；数量、分组、排序和固定操作槽在候选期间保持不变。
- 候选以排序后的匿名 missing-key 集合为签名。任务重现、缺失集合改变、中间校对失败/不完整、功能停用或 Controller dispose 都会取消/重置候选。只有同一集合在至少两份完整快照中连续缺失，且经过 `max(15s, taskRefreshSeconds)`，才一次性接纳新数量。新任务但没有旧 key 缺失的快照仍可正常接纳。
- 同一任务的 latest Turn 使用单调证据合并：更旧 `startedAt`、同 Turn 的 completed→非 completed、回退的 `completedAt` 和变小的 `updatedAt` 不能覆盖已接纳证据。更新 `startedAt` 或明确 desktop-live active 仍立即进入新一轮进行中，不因库存稳定窗延迟实时反馈。
- 插件自身已验证的单条/项目归档在 Controller 内立即移除已归档 key；已验证的原生项目移除立即移除该项目与所属任务，两者都不会被误当成传输缺失。候选与稳定清单只存于当前 Controller 内存，不持久化任务列表或 raw identity。
- [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 新增“首次/立即复核缺失不减计数、跨完整周期后接纳”与“latest-Turn 证据不回退”合同。依项目规则只更新合同，不执行测试、typecheck、build、uTools或真实传输抖动验收。

## RAW-091 明确停止与异常进行中的边界

- [codex.ts](../../../../src/domain/codex.ts#L1) 增加 `stopped/stopped/blocked-stopped` 投影。优先级固定为：exact desktop-live active → completed Turn → failed/interrupted Turn + exact desktop-live idle 或 bridge `not-running` → conservative ongoing。bridge `failed/incompatible/connecting`、`notLoaded/systemError/inProgress`、Turn 缺失或没有会话级 idle 权威均不得产生停止。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 把 active 退出基线从“只防旧 completed”扩展为“防全部旧 terminal outcome”：第一份 ordinary idle delta 若仍携带 active 前的 failed/interrupted/completed，先改投影为 inProgress/ongoing；preload 的退出后定向读取以 `targeted-after-exit` 脱敏证据标记确认同 Turn terminal，因此无需等待 15 秒完整校对即可发布停止。Desktop bridge 明确 `not-running` + failed/interrupted 是进程退出强证据，可直接停止；旧 completed 仍不能借 not-running 越过新鲜度门禁。任务数缺行继续由 RAW-090 的 missing-key 隔离处理，两条机制互不替代。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 在动态流增加“已停止”分段及中性停止图标/颜色；停止任务保留在项目页、已隐藏页和完整 `all` 投影，但不进入 `ongoingCount/runningCount`、进行中角标、完成页或前/后任务循环。归档槽持续禁用，抽屉与 Controller 均提示“会话已停止但未完成，暂不能归档”。[preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 的自适应高度计入停止段，保持镜像一致。
- [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 的只读匿名聚合等待每个 terminal 候选取得 Desktop live 权威后再结算。纠偏检查点为 `18 = 14 completed + 2 stopped + 2 ongoing`；旧规则的 `4 ongoing` 实际由 `2 active + 2 idle/interrupted` 组成。收尾时库存自然新增一条任务，最新复核为 `19 = 14 completed + 2 stopped + 3 ongoing`，其中 `3 active / 0 unconfirmed ongoing`，说明新增量是 exact live active 而非旧误判回归。该证据验证聚合分类和本机数据通道，不等同于 uTools 插件视觉、主动停止或进程崩溃验收。
- [codex.test.ts](../../../../tests/domain/codex.test.ts#L1)、[codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) 与 [codexFloatWindowBridge.test.ts](../../../../tests/platform/codexFloatWindowBridge.test.ts#L1) 已更新停止/不确定/active-priority/归档禁用合同。依用户验收规则不执行测试、typecheck、build、uTools 或截图，交付仍为 `reported / 未校验，待用户验收`。

## RAW-092 正向事件快路与负向抖动隔离

- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 维护进程内 latest-Turn 缓存和 raw-thread dirty generation。`thread/started`、`turn/started`、`turn/completed`、未知 status 及未登记 Desktop 主任务 snapshot 标记 dirty 并发送匿名 `inventoryRefreshPriority=urgent`；事件触发的库存读只重读 dirty/无缓存任务，普通无 dirty 的周期读仍重读全部 eligible Turn。缓存、dirty ID 与暂存 shadow 均随 App Server 会话清理，不进入 Renderer 或持久化。
- 未登记 Desktop 主任务 snapshot 先暂存在 preload；完整库存确认该 raw thread 属于允许项目并建立匿名 key、项目投影和短期 action alias 后，`updateInventory` 立即复用暂存 live request/status 发布待输入。若完整库存不接纳该任务，shadow 被丢弃，不制造占位任务。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 将 urgent 结构事件以 50ms 合并，普通结构/缺失复核仍为 200ms；事件在完整读取进行中到达时保留 pending/urgent 标记，并在当前读取结束后补读一次。新快照只有增加而无旧 key 缺失时立即接纳；减少仍由 RAW-090 的跨周期门禁处理。
- active 退出后的 `targeted-after-exit` completed 是本轮 Turn 的强证据，Controller 清除/跳过该任务的 presentation hold 并同步发布卡片、计数与归档能力。没有该 provenance 的普通快照完成仍按 `completionPresentationDelayMs` 平滑，停止态仍遵守 RAW-091，所有未确认异常继续显示进行中。
- [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 增加事件快读只读取一个 Turn、未登记 waiting-input shadow 匿名注册合同；[codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 增加 50ms 合并、读取中补读和 targeted completion 绕过展示窗合同。依用户规则仅更新合同，不执行测试、typecheck、build、uTools、截图或真实状态切换。

## RAW-093 计划完成待确认即时进入待输入

- 本机当前 ChatGPT/Codex Desktop 在计划 Turn 完成后创建未决 `item/plan/requestImplementation`，写入 `conversationState.requests` 并保持到用户处理。它不是 ordinary completed 的展示提示，而是明确需要用户选择是否实施计划的输入请求。
- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 仅对该精确方法增加 `waitingOnUserInput` 映射，并让未决请求优先于同批次的 idle runtime。已登记任务直接发送匿名 Activity Delta，Controller 既有 live-active 优先级会同步更新待输入卡片、计数与打开目标；不触发库存 RPC，也不叠加 50ms 结构窗或完成展示窗。
- 请求移除后，投影重新服从最新 Desktop runtime 与 Turn 证据；异常、缺失或无法识别的请求不会猜成待输入。未登记任务继续使用 RAW-092 的 preload-only shadow 和完整库存匿名注册，不放宽任务身份/项目边界。
- preload 只保留截断后的 request type/method 以判定有限枚举；计划正文、request ID、raw thread ID 和其它内容不进入 Activity Delta、Renderer、持久化、日志或文档。[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 增加 idle runtime + Plan implementation request 立即投影待输入且零 latest-Turn RPC 的合同，依用户规则不执行测试或真实计划确认。

## RAW-094 私有 patch 不得重置实时状态 shadow

- Desktop owner 会把整份私有会话状态的增量送入同一 stream，除 runtime/request/read-state 外还包含 Turn、工具、reasoning、文件变更与正文路径。Companion 不读取这些内容，但必须接受其结构化 envelope 并推进 stream revision；忽略内容不等于协议失败。
- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 先验证 patch operation 与有限路径深度，再只处理 `threadRuntimeStatus / requests / hasUnreadTurn / resumeState`。其它 root 直接返回“已消费但无投影变化”；受观察 root 自身格式损坏、owner/revision 不连续或 frame 不兼容仍按既有规则重订/断开。
- 这条边界避免工具/Turn 私有 patch 把 live shadow 删除成 connector fallback，再由旧 active snapshot 恢复，从而让已结束任务持续显示进行中。它不引入活跃超时、不以最后 patch 时间猜完成，也不改变任务库存；真正的 idle/completed、待输入和停止仍按 RAW-089–093 的证据优先级发布。
- [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 将 active→idle 合同扩展为“同批先出现深层私有 Turn patch”，并断言不发生 follow 重订、仍只做一次定向 latest-Turn 读取且正文不越界。测试依项目规则不执行。
- 本机真实只读对照先连续三分钟复现 active 集合在非 active 与旧 active snapshot 间反复切换；应用修正后的独立 30 秒 bridge 读取处理 59 个 patch、0 次重订、0 个替换 snapshot，active 集合保持稳定。该证据验证重订抖动被消除，不代替真实完成后的 uTools 视觉验收；已启动的 uTools preload 还需重载才能消费新代码。

## RAW-095 外部显式归档即时收敛

- 外部 Codex 归档是已知单任务变化，不等同于一份完整库存暂时少行。此前 Desktop `thread-archived` 和 App Server `thread/archived` 只触发普通 `inventoryChanged`，使下一份少行库存被 RAW-090 按 `max(15s, taskRefreshSeconds)` 隔离，造成归档任务仍长期可见。
- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 只在当前 preload 映射已存在时，将该 raw thread 对应的既有匿名 key 写入 Activity Delta V2 `archivedKeys`，并把结构刷新标为 urgent。`thread-unarchived`、`thread/deleted`、未映射或畸形事件不携带删除 key，仍仅请求普通复核。
- [codex.ts](../../../../src/domain/codex.ts#L1) 允许 V2 delta 可选携带匿名 `archivedKeys`；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 只删除当前 `lastThreads` 中存在的 key，同时清除对应 receipt、完成展示 hold 和 active-exit 瞬态状态，立即发布投影并以 50ms urgent 读取完整库存。普通 snapshot 的 missing-key 路径不变，紧急复核若重新含有该 key 则按已验证库存恢复。
- raw thread ID 只用于 preload 内查找；跨 preload 边界只有已发布的匿名 key。cwd、正文、路径和私有 archive payload 不进入 Renderer、持久化、日志或文档。本轮不运行测试、typecheck、build、uTools 或真实归档；运行中的 preload 需用户重载后以可丢弃任务验收。

## RAW-096 较新完成证据不得被旧 live active shadow 压住

- `desktop-live active` 是强实时证据，但它必须属于当前 active interval。preload 在 snapshot 首次发现 active、或 runtime/request 从非 active 进入 active 时只记录一次匿名本机 `desktopActiveSince`；同一 interval 的后续完整库存刷新只复用该值，不能把旧 shadow 每 15 秒重新变“更晚”。离开 active、失去 Desktop authority、session 重置或 archive 时清除该时刻。
- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 仅把这个时间和已发布匿名 key、状态/有限 flags 一起写入 V2 delta/Host snapshot。Side Chat 聚合只有仍 active 的 own/child shadow 才贡献时刻，取其中最新的 active interval；raw thread ID、revision、请求/Turn 正文、cwd、路径和私有 patch 值不跨 preload。
- [codex.ts](../../../../src/domain/codex.ts#L1) 与 [codexController.ts](../../../../src/runtime/codexController.ts#L1) 只在 latest Turn 明确 `completed` 且有效 `completedAt > desktopActiveSince` 时，把该 active 判为已被更晚完成证据取代。没有 active 时刻、完成时间不晚于它、没有 completed 状态、或任何异常/权限缺失时仍沿用 RAW-089–094 的 active/ongoing/stopped 边界；不引入活跃超时、recency 推断或全量轮询缩短。
- [codex.test.ts](../../../../tests/domain/codex.test.ts#L1)、[codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 与 [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 补充“较新完成压过早期 active observation”、Controller V2 合并和匿名时间投影合同。本轮依项目规则不执行测试、typecheck、build、uTools、截图或真实 Codex 状态操作；preload 重载后的真实视觉验收仍归用户。

## RAW-097 已读事件不得重放 activity

- `thread-read-state-changed` 和仅变更 `hasUnreadTurn` 的 Desktop patch 都只能发布 `readStateOnly` V2 entry：匿名 key、`hasUnreadTurn` 和 `unreadAuthority` 是唯一允许字段。预加载仍在本地维护完整 shadow，但该事件本身不得把 status、flags、active interval 或 latest Turn 带进 Renderer。
- [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 对主任务和聚合 Side Chat 都使用同一 unread-only 形状；包含 runtime/request 变化的 patch 仍发布完整 activity，避免把真正开始的任务压成完成。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 在 V2 `readStateOnly` 时只替换 `hasUnreadTurn/unreadAuthority`，保留 status、active flags、`desktopActiveSince` 和 latest Turn；因此 native 已读只能令 `completed-unread → completed`。测试合同覆盖 malicious full-status 字段被忽略、无 stream shadow 的 read-state 以及 active shadow 的仅 unread patch。测试不执行，真实 preload-reloaded 验收归用户。

## RAW-107 全局任务循环快捷键与缓存失效防护

- [App.vue](../../../../src/App.vue#L1) 的 `applyPluginRoute` 在 `route.hideAfterAction === true` 时不得调用 `runtime.setTab(route.tab)`。`hideAfterAction=true` 意味着应用窗口在动作派发后立即隐藏，切换页签会触发 `codexController.syncActivation(false)`，进而调用 `options.platform.codex.close()` 清除 preload 中的 `codexThreadActions` Map。如果 `cycleTask` 此时仍持有缓存任务列表，其中的 `actionAlias` 已全部失效，`openCodexThread` 会因找不到 alias 而失败甚至崩溃。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 的 `syncActivation` 在 `shouldRun()` 返回 `false` 时，除了既有的清理定时器、重置状态和调用 `close()` 外，必须同时将 `conversations` 重置为 `emptyConversationSnapshot()`。这确保 `cycleTask` 在非活跃状态下读取到空任务列表，显示"当前没有可切换的 Codex 任务"提示，而不是尝试用已失效的 `actionAlias` 打开陈旧任务。
- [featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 的 `eypc-codex-task-previous` 和 `eypc-codex-task-next` 路由继续设置 `hideAfterAction: true`，因为这两个全局快捷键的设计意图是在后台快速切换任务而不显示应用窗口。该修复不改变路由配置，只确保 `applyPluginRoute` 在 `hideAfterAction` 时不执行不必要的页签切换。
- [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 新增回归测试：`syncActivation(false)` 清空 `conversations` 后，`cycleTask` 不再调用 `openThread`。该测试验证缓存失效防护的正确性，确保未来变更不会重新引入崩溃。

## RAW-108 角标与动态卡片同源展示投影

- [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 从 Controller 已稳定化的 `ConversationSnapshotV1` 无状态派生最近 6 小时、非隐藏的互斥 input/active/stopped/unread/completed 动态组；active 只含 `active / waiting-approval / ongoing`。紧凑 input/unread 继续读取含隐藏任务的完整集合，active 数严格等于未搜索的 active 组长度。
- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 的动态状态段、动态总数、三个角标、提示与水球 ARIA，以及 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 的设置预览共同消费该投影。搜索只过滤已展开行，进行中角标只展开；Renderer 不增加 timer 或 debounce。
- Preload/Controller 的状态白名单、时间排序、3 秒定向 Turn 核验、50ms 结构合并、active-exit 基线、旧 terminal 防闪、单调证据、任务缺失隔离、可中断完成展示窗和 targeted 强证据快路保持不变。

## RAW-109 前后任务候选复用六小时 active 资格

- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 的 `cycleTasks` 不再从 30 天库存直接筛选整个 `bucket='ongoing'`。普通候选先取完整 `inputRequired`，再取 `projectCodexDynamicStatus(conversations).groups.active`，因此超过 6 小时、隐藏、waiting-input、stopped、completed-unread 与 completed 都不会仅凭保守 ongoing 留在普通前后循环。
- 完成未读继续由 `codex.completed-unread.openFirst` 独立处理，不进入通用前后循环。普通候选为空时，既有 `pinSource='local' && bucket !== 'stopped'` 回退保持不变；这是用户在 EyPc 内明确置顶后的例外，原生置顶不参与。
- 该动作在触发时读取当前稳定会话快照并调用同一纯函数，不增加候选缓存、定时器、第二重防抖、协议字段或持久化。所指旧任务已由用户手动归档；归档只收敛个案，候选资格修复防止同类旧保守 ongoing 再进入普通动作池。
- [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 在既有模块增加旧保守 ongoing 被排除、EyPc 本地置顶后才作为空池回退的合同，并将既有循环 fixture 改成六小时内的相对时间。依授权不执行测试、typecheck、build、uTools 或真实任务操作。

## RAW-114 Expanded Float Surface And Collapse

- [FloatApp.vue](../../../../src/FloatApp.vue#L1) 不再导入或维护 Float 专属 Environment Action 状态，不渲染 Actions 卡槽、Environment picker 或 Setup 提示；卡内 `codex.action.run.1…5` 仅转发既有 Runtime 命令。Host/Controller 的全局 Action 读取、执行、Serve 会话和 Git Push 确认边界不变。
- 展开卡在 pointer/focus departure 或 window blur 后统一进入约 `220ms` 收缩调度；blur 同时清除仅属浮窗的二次确认与提示。composer、详情/抽屉、别名编辑、Quick Jump、Shift 预览和 resize 继续拥有交互阻断，已删除的 Environment picker/confirm 不再形成不可见粘滞状态。
- [float.css](../../../../src/styles/float.css#L1) 删除仅服务于上述可见卡槽/选择层的样式；通用任务动作提示 `.float-action-hint` 保留。Renderer 没有新增 interval、debounce 或持久化。

## RAW-115 Exact Registration Before Atomic Publication

- [preload/index.js](../../../../preload/index.js#L1) 在 verified inventory scan 中先读取完整未归档 `thread/list`，再只对本轮 dirty 且缺行的至多一个既有并发批次执行有界 `thread/read(includeTurns=false)`。响应必须返回同一 raw identity 和 allowlist 内的合法 connector 状态；随后仍经过原生项目归属、latest Turn 严格时间、匿名 key、action alias 和 registry fingerprint 前后校验。任何私有正文、raw identity 或 cwd 都不得越过 Preload。
- 未登记 main shadow 若在首次滞后扫描时仍是 live active，`updateInventory` 不再把它当成已验证删除。精确读取成功后它与普通 inventory row 合并，Desktop shadow 在同一次更新中覆盖 connector 状态并进入 Controller；若第一次读取失败/错配，则 shadow 只在 Preload 会话内保留，等待真实 `thread/list` 后续追上。曾经已登记后又消失的任务仍走原有退订/删除与 Controller missing-key 隔离，不能借此复活归档任务。
- Controller 与 Renderer 不接收额外“未知 active 数”或占位卡。新任务完成安全登记后只通过现有 `CodexTaskStatePackageV1` 同时改变动态卡片、状态段、三个角标、ARIA、水球摘要和前后任务候选；登记前所有表面保持同一旧原子包。50ms structural coalescing、读取中补读、3 秒 Turn 定向核验、terminal 抖动保护及普通 15 秒完整校对均不变。
- 源码合同新增在现有 [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1)：覆盖 `thread/list` 尚未出现但 exact read 已可用，以及 exact read 首次错配后 live shadow 保留、后续 list 注册仍恢复 waiting-input。依用户门禁，本轮不执行测试、typecheck、build、uTools 或真实状态切换。
