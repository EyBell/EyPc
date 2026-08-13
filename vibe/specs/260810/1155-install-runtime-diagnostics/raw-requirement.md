# RAW-159 → RAW-166 — Companion 状态、发布与权威库存恢复

Date: 2026-08-13
Status: `active / RAW-166 increment-automated-verified / rebuilt-artifact-ready / documentation-synchronized / dev-plugin-reload-pending`

## 历史基线

RAW-159 要求把状态、库存、缓存、快捷键、导航、归档和诊断从分布式补丁收敛为单一 Kernel，并已落地无固定任务上限、Codex cursor 全分页、语义 no-op、热缓存、Runtime Identity、十阶段 Codex 归档事务和运行诊断。这些是 RAW-160 的嵌套基础，不得遗漏或回退。

安装宿主随后复现：普通 interrupted 被过宽判为“待继续”；截图时仍运行且尚未生成 Plan 的任务没有稳定显示为进行中；Plan 完成/中断后的角标与循环候选不稳定；Claude 已终止仍可能沿用旧 running；EyPc 归档成功被误解为 Claude 原生侧栏同步；Kernel no-op 也没有阻止每个消费者重复发送/消费。

2026-08-11 对重建前安装包再次核验时复现三项 P0/P1 回归：主任务或 Side Chat 仍真实运行时，旧父级 `idleConfirmed` 可把它投影为待继续；任务 alias 超过 10 分钟或生命周期重建后，卡片点击、标题点击、Enter、紧凑待输入角标和 uTools 全局待输入入口均在同一 Host 打开链前置失败；单数字角标被无明确需求从圆形扩成胶囊。此前“无已知 P0 / full-automated-verified”因此失效，必须按本节 rework 重新接纳。

2026-08-12 安装并核对同构建 1.5.5 后再次复现打开回归：卡片、待输入直接入口和全局入口在 Actions 层统一返回 `stale-target`。根因不是 key 消失，而是 Actions 在进入 Host 同 key 恢复前仍逐字段比较 Renderer 的旧 alias/revision/phase 与进程当前目标；同时 Float 自动焦点被当成公开任务语义回写，每次焦点变化都增加 package revision 并重投影列表，放大 alias 竞态。用户明确否定“点击触发筛选/重分类”，因此下述打开与发布合同以本次纠正为准。

同日真实宿主又确认一项 Codex P0：Codex 原生界面与持久状态已显示任务完成且未读，但 EyPc 在十分钟以上没有收到新的 Codex activity，任务包停留在旧 revision，卡片继续显示进行中且不进入完成未读。Kernel 接受既有事件约 3ms、Float 应用约 624ms，排除 reducer 与渲染慢；根因是原生未读 `fs.watch` 可能丢通知或失效，首次读取仍排在 25ms JavaScript timer 后，错误后只关闭且没有重建，而 Renderer 的 `phaseOnly` 轮询明确不读取持久未读或普通任务最新 Turn。未读变化一旦漏掉，`reconcileLateUnread()` 及终态定向复核便不会启动。实现与验收必须以长期进程 Host 的即时读取、1 秒原生恢复与同一语义提交为准。

## RAW-160 当前要求

1. 唯一数据流为 `Provider 原始事件/库存 → Evidence Adapter → Branch Evidence Store → Canonical Task Reducer → View/Capability Projector → Latest Package Cache → 全部消费者`。
2. 升级 `task-state-v10 / companion-task-kernel-v4 / companion-task-package-v4 / companion-task-actions-v2`；V4 Kernel 缺失或四端 Runtime Identity 不一致时 `reload-required`，不回退旧裁决。
3. 分支先独立按因果顺序裁决，再始终聚合根任务与全部已确认 Side Chat。运行、审批、问题/Plan、Goal、终态继续使用同一因果优先级；不得以主任务“已完成已读”为子分支参与门槛。冲突保留全部相关分支中的最近可信状态并 `verifying`。
4. 首次 Plan 正在生成且尚无完成 Plan 时必须是 running、`planReady=false`；已有 Plan 后继续修改时仍 running 并保留 Plan 生命周期。
5. 完成 Plan 且实施确认未决时是 waiting-input、`planReady=true`；未执行便 exact interrupted 时，只有定向复读确认无更新 Turn/活动/等待才是 stopped。
6. 普通 interrupted 在 idle 复核前保留最后稳定态；确认当前所选范围内分支 idle 后才是普通 stopped。任何 selected-scope active/terminal 冲突不得先发布 stopped。
7. `planReady` 仅由 exact 实施请求或 exact 最新 completed Plan 建立；新 Plan 递增 `planLifecycleRevision`。刷新、重启、refollow、owner 切换或继续 Plan 对话不清除；确切 default/non-Plan 执行、明确放弃、完成、归档或移除才清除。
8. `paused` 是 EyPc 本地持久状态，只存哈希 taskRef、Plan revision、paused 和时间。暂停跨刷新、重启、refollow 和 Plan 继续保持；确切非 Plan 执行开始自动清除。
9. 动态列表保留 `dynamicTaskWindowHours`。普通 stopped 超时退出；唯一窗口例外是 `stopped + planReady + !paused`，但仍服从更大的库存保留范围。
10. waiting Plan 即使不在动态展开范围，也进入待输入角标、Plan/attention 快捷能力和通用 Plan 循环；不新增紧凑 stopped 角标或 stopped 专属快捷键。
11. 通用循环首个非空层保持：普通问题/审批 → waiting Plan 与 stopped Plan-ready → 动态窗口 active → local pin；层内按最近提问、创建时间、匿名 key 稳定排序。paused、普通 hidden 和 archived 全部排除。
12. Plan-ready 使用暂停而非普通隐藏。“已隐藏”页顶部增加“已暂停”；旧 hidden 且仍能证明 Plan-ready 的任务幂等迁移为 paused，无法证明的保持普通 hidden。批量隐藏遇到 Plan-ready 也必须转为 pause。
13. 行内四槽固定为：普通 `顶/隐/归/+`；Plan-ready `顶/暂/归/执`；已暂停 Plan `顶/恢/归/执`。Plan 新会话保留在完整操作抽屉；批量增加暂停/恢复；按钮要有禁用原因、ARIA 和焦点恢复。
14. Execute Plan 只对 Codex、planReady、无真实活动且无其它待决请求的任务开放。原生 `Implement Plan`、default collaboration mode 或当前模型无法确认时，不能据此禁用暂停、恢复或执行；`planImplementation` 只决定普通输入/审批与 Plan 在循环中的优先层，不是菜单能力门禁。按钮可见后仍由第二击 Host 精确复核真实活动和其它待决请求。
15. “执”首次点击只建立 5 秒原位“确”，第二击才执行；身份为 `provider + taskRef + planLifecycleRevision`，phase/revision/alias/activity/pending 变化立即取消；确认状态不增加 package revision。
16. 执行建立 Plan revision single-flight，定向复核并只续签同一匿名 key 后，严格调用一次 open → `thread/resume({threadId, excludeTurns:true})` → `turn/start`。能确认原生 default mode 与当前 model 时附带含 model、reasoning effort 的完整 `collaborationMode`；否则不附带可选 mode 对象，向同一任务发送 Preload 私有固定执行指令。
17. 明确成功不乐观伪造状态，由 exact `turn/started`/响应 Turn 收敛 running 并清除 Plan；超时是 `indeterminate`，只做定向复读且禁止盲目重发。手动执行指令是同一 App Server 任务的一次正式 Turn，不得回退剪贴板、键盘模拟、UI 自动化或替代会话。
18. 状态可反复检查，但只有消费者可见任务语义变化才增加 revision/publishedAt 和发布。纯 observedAt/generation/ACK/因果水位及 UI 焦点变化为完整 no-op；焦点仅更新 Host 私有动作上下文，不回声为公开任务包、不触发筛选/分类/Float 重投影。动态时间只维护一个最近 `nextVisibilityTransitionAt` 计时器。
19. Kernel 提供 `getLatest()` 与 `subscribe(afterRevision)`；Main、Float、Navigation、Actions 各自缓存最后 revision 与 selector 指纹，旧/同 revision 忽略，Renderer detach/Float close/mainHide 不清热缓存。
20. Float 任务包与 quota/settings 分 lane，必须回 `received/applied/rejected` ACK。500ms 未 applied 只重发最新包一次；累计 1 秒且心跳健康才受控重建。相同 revision 保留任务缓存对象引用且不重投影。
21. Claude 新 `session.phase` 优先于旧 `previous.phase`；phase、phaseRevision、statusEnteredAt、unread、capabilities 原子更新，进程 Host 原生 watcher、Node StatWatcher 补漏和打开后定向刷新进入同一 Store。Hook/App-log、任务成员关系与 unread 的首个语义变化均不得经过 `setTimeout/setInterval`；重复尾事件/指纹不通知，部分元数据 JSON 保留最后可信成员关系并由下一次原生回调或 StatWatcher 重试。
22. Claude D′ 归档成功只表示唯一元数据写入、EyPc 活动库存移除和事务复读通过。成功提示必须分别说明“EyPc 已归档并移除”和“Claude 原生侧栏同步未确认，当前不受支持”。
23. 诊断只公开会话期 `h:<hex>` taskRef 和 operationId；不记录原始任务 ID、路径、Plan 内容、执行提示、命令/工具参数、stdout/stderr、凭据或隐藏推理。
24. 静态所有权测试禁止生产模块在 Kernel 外重构 canonical phase、dynamicGroup、cycleTier、counts 或 cycleKeys。
25. 自动化覆盖完整真值表、Side Chat 聚合、暂停迁移/持久化、窗口例外、循环、四槽、Execute Plan、1,000 次 no-op、Float ACK、Claude 状态/归档、240 项分页与旧归档/身份/诊断回归。
26. V4 Kernel 必须维护 Host-only Branch Evidence Store。Host 批量发布匿名父 key、会话期隐私化分支引用、有限 main/side 角色、活动/终态序号、等待类型、分支级 unread 与 idle；原始 thread/branch ID 不进入 Renderer、日志或持久化。Kernel 始终选择根任务与全部已确认 Side Chat，并按真实运行 → 审批 → 普通输入/Plan → Goal → 全范围 exact completed → 全范围终态且分别 idle-confirmed → 保留最近非终态并 `verifying` 聚合。新 active/Turn/更新 waiting 必须清对应旧 idle。
27. `actionAlias` 只作为卡片版本提示，匿名 task key 才是最终目标。若 Host 进程已有该 key，Actions 必须直接采用 Host 当前 target，忽略 Renderer 提示中的旧 alias/revision/phase，不得在 Provider 解析前返回 `stale-target`，也不得触发全库存分类。仅当 Host 当前 target/私有映射确实缺失或能力不可用时，才执行 provider-scoped exact/tasks-only 解析；Host 对 `expired/invalid/stale-alias` 只为同一 key 续签或完整可信盘点并最多重试一次，禁止回退到其它任务，并发恢复共享一次 single-flight。
28. 卡片主体、标题、Enter、紧凑待输入角标与 uTools 全局待输入入口必须统一进入同一个 Kernel/Host 解析函数。打开动作不得先提交 Renderer 分类包或改变筛选/分组；只有 Host 明确打开成功才推进待输入队列或已读状态，失败保持当前位置。
29. 单数字紧凑角标固定 `20×20` 且不使用新增等宽字体或 tabular 数字；两位数及 `99+` 以相同高度和 padding 自然扩宽。颜色、边框、位置、动作不变，设置页预览与真实 Float 使用同一几何合同。
30. 证据不足必须返回 `abstain/unchanged`。已有任务保留最近可信库存语义；没有 prior 的 `unknown` 不进入 active/dynamic，也不得借 Provider 类型、hydration `active`、扫描接收时间或硬编码 previous running 虚构“进行中”。
31. `codex.input.open`、紧凑待输入角标和待输入直接入口只使用全部可见的真实 waiting-input/waiting-approval；没有候选时返回无任务，不回退本地置顶。local pin 只保留在普通 previous/next 循环最后一级。
32. 内部 stopped/可见“待继续”任务可从当前行或完整菜单直接进入归档，不要求先转为 completed。既有两次确认和 Provider 写前精确复核保留；状态已恢复运行、目标变化或能力失效时必须拒绝且保留卡片。
33. Claude Hook/App 日志、已登记任务元数据和未读 LevelDB 监听必须由跨 `mainHide/background-hidden` 保留的进程 Host 持有。正常 native file event 到 Float `applied` 不超过 250ms；丢失目录通知由 1 秒 Node StatWatcher 恢复，端到端不超过 1.25s。当前 Claude App `1.28929.0` 只在固定隐私安全语法和单字段归档结构均验证后纳入白名单；未知版本继续 fail closed。
34. Codex 原生未读状态同样由进程 Host 持有：目录 `fs.watch` 回调直接读取，不能把首次读取放入 Renderer/Preload JavaScript timer；已登记状态文件另以 `fs.watchFile`/stat 最多 1 秒补漏，目录 watcher 报错后自动重建，且必须覆盖原子重写/rename。
35. 持久未读由 `false` 变为 `true` 且任务仍被投影为 active 时，必须立即对同一匿名 key 定向读取最新 Turn。即使旧证据是 exact `turn-started`/active 也不能跳过这次复核；未读本身不得虚构 terminal，较新的正向 Turn/active 序号仍必须拒绝迟到终态。
36. 删除 Renderer 的周期性 `readActivitySnapshot({phaseOnly:true})` 看门狗。Codex 已登记 rollout decision 文件由进程 Host 的原生 watcher 与 1 秒 StatWatcher 恢复；显式兼容 API 可保留，但不得用 Renderer 生命周期承担状态恢复权威。
37. 同一 Provider 事件中的私有 Branch Evidence 与公开 Activity draft 必须先暂存、再由 Kernel 在一个语义事务中提交。一个消费者可见变化最多增加一次 package revision/发布；同值、轮询、重放及 1,000 次恢复信号保持零 revision、零 Renderer/Float 推送。
38. Codex Desktop 手动归档不能依赖 EyPc 自己的 App Server 通知或 Desktop `thread-archived` 广播。进程 Host 必须同时监听精确 `CODEX_HOME/sessions` 与 `archived_sessions` 成员变化；回调只作为唤醒，最终权威是完整分页的 `thread/list archived:false/true` 对照。
39. 正常成员 rename 后立即对照；掉目录通知时由 1 秒 Node StatWatcher 恢复，端到端恢复预算不超过 1.25 秒。watcher error 后必须重建并强制执行一次 Codex provider-scoped tasks-only 对账，不得引入 Renderer interval 或 Controller 周期全库存扫描。
40. 任务从未归档库存消失且精确出现在归档库存时，Host 必须立即发送匿名 `archivedKeys` 并从 Kernel/UI 移除，绕过普通缺行隔离；原始 thread ID、路径、文件内容和清单不得进入 Renderer 或诊断。
41. `recoverDirtyCodexThreadsMissingFromInventory()` 在调用 `thread/read` 前必须排除完整 archived inventory；已归档 dirty 任务禁止重新补回。
42. 插件进入、Desktop IPC 重连和 membership watcher 重建必须各强制一次 Codex tasks-only 对账；相同库存结果保持语义 no-op。
43. EyPc 自己发起的 Codex 归档仍遵守一次 Provider 写、两次库存核验、连接 Desktop ACK 与 Kernel commit 的既有后置条件。membership recovery 必须在本地归档事务期间抑制同目标，不能用外部归档快路旁路失败/不确定时保留卡片的合同；若 Provider 写未完成或权威核验明确目标仍在 unarchived 库存，suppression 必须立即释放，使之后真正的 Desktop 外部归档可被恢复。

## RAW-162 Goal-aware 完成边界

44. Cloud 展示的是 Codex 任务目标状态，不是单个 Turn 状态。有当前 Goal 时，任一 `turn/completed` 只关闭该 Goal 的一个执行轮次，不得发布中间 `completed`；只有 Goal status 为 `complete` 且没有因果上更新的 active/waiting Turn 时，任务才进入已完成。
45. Goal `active` 在没有更新输入/审批证据时投影为 running；当前输入/审批仍分别优先为 waiting-input/waiting-approval。Goal `paused / blocked / usageLimited / budgetLimited` 统一投影为 stopped，并显示“待继续”。
46. Goal 证据只存在于 Preload/Kernel 私有路径：冷启动、重连或终态候选通过 `thread/goal/get` 单次补齐，稳态消费 `thread/goal/updated` 与 `thread/goal/cleared`。只保留合法 status、updatedAt、freshness 与会话因果序号；objective、原始 ID、额度和用量不得跨 Bridge 或进入诊断/持久化。
47. Goal RPC 暂时失败时不得降级为 completed：保留最近稳定非终态并标记 verifying；仅在 App Server 明确返回 method-not-found 时，才将当前 Runtime 视为不支持 Goal 并回退既有无 Goal Turn 语义。
48. 查询结果必须以请求基线序号与 `goal.updatedAt` 拒绝迟到覆盖；Goal-only 变化与同一 Host draft 在一次 Kernel 语义事务中提交。Goal 完成后，严格更新的新 Turn 可开启新执行 epoch；旧 complete Goal 不得永久锁死后续运行。
49. 无 Goal 或 Goal 已明确 cleared 的普通会话保留现有 exact Turn 完成语义，不新增公共 TaskPhase、Renderer 字段、顶层 Tab、角标或归档路径。

## RAW-163 主任务优先的 Side Chat 展示与打开

本节第 50–53 条的 main-first 展示门槛已由 RAW-164 取代，仅作为需求变化证据保留；第 54–55 条的 parent-only 打开与成功后会话期已读确认继续有效。

50. 主任务是父级卡片的默认状态权威。只要主任务不同时满足“exact completed、unread authority 已知、unread=false”，就必须使用主任务自己的 phase/unread；运行、待输入、待审批、待继续、核验中和已完成未读均不得被 Side Chat 覆盖。
51. 只有主任务已确认 completed 且 unread authority 已知、值为 false，Side Chat 才进入父级展示范围。此时任一子任务 running/waiting 按既有优先级投影到父任务，任一已完成未读子任务把父任务投影为已完成未读。
52. 主任务 completed-unread 与 Side Chat running 并存时，父任务保持主任务的 completed-unread；主任务 interrupted/stopped/waiting/running 与子任务不同状态并存时，也一律保持主任务本身。
53. Branch Evidence 必须携带有限的 `main/side` 角色和分支级 unread known/value，由 Kernel 在同一原子归约内同时选择 phase 与 unread；这些字段不进入公共任务包、日志、持久化或错误副本。
54. 卡片、标题、Enter、紧凑角标、attention、previous/next 和 uTools 全局入口都只打开父级主任务 `codex://threads/<parent>`。不得选择活跃/待输入/未读 Side Chat 作为 Deep-Link 目标，也不得先尝试 Side Chat 再回退主任务。
55. 成功打开主任务后，既有会话期 read acknowledgement 仍可覆盖主任务和已知 Side Chat；失败不清未读，且任何路径都不写 Codex 原生状态。

## RAW-164 Side Chat 拓扑与 Cloud 状态收敛

56. `thread/list` 与必要的 `thread/read` 必须读取 `sessionId`、`forkedFromId`。只有父任务存在、父子 `sessionId` 均非空且相同、关系无环时才认定为 Side Chat；嵌套 fork 解析到根任务。缺父、跨 session、循环或其它异常关系保持独立顶层任务，不猜测归属。
57. 已确认 Side Chat 只能进入进程私有拓扑与 Branch Evidence，不得产生公共库存顶层行；公共 `companion-task-package-v4` 只包含根任务。Desktop `sideConversation` 判断必须先于 `inventory.has`，避免库存/快照竞态把 child 重新当成 main。
58. Kernel 必须无条件聚合根任务与全部 Side Chat，删除 `mainCompletedRead` 或等价展示门槛。在既有待输入/待审批规则不变的前提下，活动/完成三态固定为 `进行中 > 已完成未读 > 已完成`；任一珠子处于更高优先级时，父任务展示该状态。
59. 有活动珠子时，较低优先级的未读完成证据可以作为私有潜在 unread 保留，但公共视图只能进入 active 分组，`active=1 / unread=0`；活动结束且无其它高优先级证据后，才可进入已完成未读。
60. 有当前 Goal 时，Goal `active` 下任何中间 `turn/completed`（包括 `unread=true`）都不得发布 completed/completed-unread；Goal `verifying` 保留最近可信非终态。只有 Goal `complete` 且不存在因果上更新的 active/waiting 证据时才允许完成，并在该终态上依据最终 unread 区分已完成未读/已完成。Goal 完成后严格更新的新 Turn 仍可开启新的运行 epoch。
61. 旧 unread true/false、旧完整快照、重复 Goal 通知与同一 Turn 元数据补全不得回滚最终状态。成功打开继续只打开 parent，并将当前 Turn 及已知 Side Chat 建立会话期已读确认；失败不清未读。
62. 新增匿名、语义变化才记录的 `side-topology-decision` 与 `parent-state-decision`。前者只记录父任务哈希、根/Side/孤立数量与归并计数；后者只记录最终 phase、unread、reason、分支状态计数及有限 Goal 原因计数。两者不得包含父子原始 ID、标题、正文、路径、Goal 内容、预算或用量。
63. 新增 `runtime-identity-handshake`，只记录非私密 Host/Renderer 实际与期望 artifact hash、Kernel/Package revision，以及 `host-loaded` 或 `reload-required`。构建成功只证明 `artifact-ready`；真实 Host 未报告 `host-loaded` 前，不得用进程启动时间或 Renderer 观察推断已加载当前代码。
64. 待审批、待输入、stopped、parent-only 打开、Turn 绑定已读确认及公共 `companion-task-package-v4` 保持不变。

## RAW-165 实时 Cloud 因果与 Claude 热未读

65. `thread/list`、`thread/read` 或 `thread/turns/list` 读取成功只证明“本次库存读取成功”，不能证明返回的 terminal 在因果上比已接纳的实时 active/waiting 更新。库存终态不得使用本地扫描时刻生成更高 terminal sequence；只有真实 terminal event 或具备可比较 Provider Turn epoch 的定向终态证据可关闭实时分支。
66. 同一 Provider 分支的私有引用必须只由稳定 parent/branch 身份决定，不得把 connector、Desktop、App Server 等 transport lane 编入分支身份。完整快照进入 Kernel 时必须按稳定分支引用与上一证据逐分支合并；父级 observation generation 只排序传输批次，不能替代分支因果水位。
67. Kernel 必须拒绝 inventory-only 或较旧 terminal 覆盖更新的 running、waiting-input 或 waiting-approval；同一/更新 Turn epoch 的真实 terminal 仍可即时完成。冷启动仅有库存终态时可作为 sequence 0 的基线展示，但不能关闭另一条实时 live edge。
68. 跨分支父级注意力优先级固定为 `waiting-approval > waiting-input（含 Plan） > running > Goal > terminal`。主任务待输入/审批不得被普通 Side Chat running 覆盖；注意力解除后的更新 running 才恢复进行中。
69. Side Chat 的 App Server live authority 只能归属该 Side 分支，不得通过父级 aggregate authority 泄漏到 main 并虚构主任务 running。公共父状态仍由全部稳定分支证据一次归约。
70. Host 状态提议发给 Kernel 后，诊断中的 `accepted` 必须以最终 canonical package 与提议语义一致为准；若 Kernel 因更强证据保留/改判，应记录匿名 `superseded`，不得把“已发送/已消费”误报为状态已接受。诊断只保留时间戳、计数和会话期哈希引用，不含原始身份或内容。
71. Claude App 已门禁的精确 completion 与 `[CCD] LocalSessions.setFocusedSession: sessionId=<local_id|null>` live append 共同形成 process-private hot unread overlay：聚焦任务完成立即保持已读，非聚焦任务完成立即未读，聚焦到任务立即清除该热未读；新 running 开启新交互并清除旧 completion hint。
72. Claude LevelDB `epitaxy-unread-v1` 继续作为 cold-start/recovery 持久基线；更新的 hot hint 可覆盖落盘延迟。只有已观察到该会话的相反持久边缘、随后事件后的新鲜快照再次匹配，才确认追平；上一 completion 遗留的相同布尔值不能冒充本轮追平。cold replay 不得凭历史 focus/completion 行伪造未读；同秒事件由单调 hint revision 排序，而不是只比较墙钟时间。
73. 当前全局 focused-session 信号不能证明“多窗格中可见但未聚焦”的本地会话已经被人阅读，因此不得宣称 Claude 原生未读在该边界上完全等价。该限制不允许引入第三方 UI 注入、AX/JXA、私有 IPC、LevelDB 写入或内容推断。
74. 本增量不新增“已完成，未读核验中”或其它可见状态，不增加 60 秒等待，不提高轮询频率。正常路径由原生实时事件驱动；现有 1 秒 StatWatcher 只保留为丢通知恢复。
75. 自动化必须覆盖 inventory terminal 与实时 active/waiting 竞态、transport 切换、Side authority 隔离、注意力优先级、最终 canonical 推送判断、Claude focused/unfocused completion、focus 清除、同秒事件及持久快照迟到回滚。真实 uTools 接纳仍要求当前身份 `host-loaded` 后观察 Cloud/Claude 事件至 Float `applied`。

## RAW-166 全局错误消解与双向因果门禁

76. Kernel 的同分支 phase admission 必须双向比较可比 Turn epoch、真实 event sequence 与有限 attention rank：旧 terminal 不能关闭更新 live；同样，后到传输批次中的旧 live 不能清除更新 waiting 或重开更新 terminal。真实更新 Turn 仍立即进入新 epoch，不增加时间等待。
77. Branch Evidence 的 phase、unread 与 Goal 是三条独立证据 lane。只观察 phase 的事件不得把既有 unread/Goal 归零，只观察 unread/Goal 的事件也不得改写 phase；每次 lane 合并后统一重新计算 derived branch fields，禁止用整包替换制造隐式否定。
78. Evidence Adapter 只记录 `state-proposal/proposed`。Codex activity、Claude phase、Claude unread 与 Claude inventory 只有在 Kernel 提交后逐字段匹配 canonical package，才可记录 `accepted`；被更强证据改判为 `superseded`，无有效目标或语义变化为 `ignored/queued`。Float `applied` 仍只表示 canonical package 被消费。
79. 错误记忆采用唯一 `README → responsibility module → leaf` Primary 路由。每条 leaf 只能有一个 Primary owner、最多两个 Related；candidate 不自动作为修复权威，superseded/retired 仅逻辑归档，不物理删除历史证据。重复 fingerprint、无效状态/日期、断链、孤立 owner、路由环和超限索引必须由仓库 validator 拒绝。
80. 全量盘点必须保留一份当前可执行路径：先按现行 requirement/spec/architecture 判断，再按模块定位 verified leaf，最后以复现和回归更新同一 fingerprint。已完全失效或被当前合同替代的修复路线转为 superseded/retired；不得因为文字相似而合并不同证据边界。
81. 判断合同冲突必须进入显式 conflict register。已经有更新用户决策的冲突按最新明确决策消解并同步所有 current authority；没有明确决策且会改变产品语义的冲突必须停止选择并提醒用户，不能由实现者暗自择一。本轮 RAW-163 main-first 展示条款已由用户明确的 RAW-164 all-bead 规则取代，parent-only 打开条款继续保留。
82. 本增量不移动/删除历史 error-memory 文件，不触碰 `_to_delete/`，不把 overdue candidate 自动升级、合并或退役。自动化必须覆盖双向 phase 顺序、三 lane 正交合并、proposal/final 诊断，以及 99 条 leaf 的身份、生命周期、唯一 Primary、路由完整性和无环性。

## 冲突与非目标

- RAW-142 的“任意新 Turn 清除 Plan”、RAW-150/154 的“exact interrupted 立即 stopped”、RAW-159 的“只在 Kernel no-op 即完成消费去重”和旧 Actions/Package 版本被 RAW-160 对应条款取代。RAW-163 第 50–53 条的 main-first 展示门槛由 RAW-164 取代；RAW-164 的普通 `running > completed-unread` 只描述完成面，RAW-165 将注意力状态提升到 running 之前；RAW-163 的 parent-only 打开与成功后已读确认保留。
- 强制 Claude 原生侧栏同步不是产品能力合同；RAW-165 只对精确 completion/focus 可观察边界提供实时热覆盖，多窗格可见但未聚焦仍保留明确能力边界。
- 当前用户已授权只在 `EyPc-Regression-<run-id>-*` 无副作用测试任务中启动安全 Codex Turn/Plan 并做可恢复清理；不得触碰既有用户任务。真实 Claude D′ 归档不属于该授权。

## 验收要求

- 按 `VerificationImpactTrace` 选择的受影响状态/打开/UI 矩阵、语义 typecheck、Preload 镜像、production build、Runtime Identity、uTools validator、静态所有权、文档链接与规则一致性通过；本轮用户已独立要求中央缺陷逃逸后的全仓升级门禁，历史全量绿灯仍不能覆盖真实宿主回归。
- uTools 开发模式必须在重新加载当前 Preload 身份后验证 Plan 尚未生成、Plan 完成、Plan 中断跨窗口、暂停跨重启、Claude running→terminal、通用循环与 Float ACK 恢复；自动化不能替代该门禁，也不得用旧开发 Host 的 UI 观察接纳新源码。
- RAW-162 按当前 `VerificationImpactTrace` 运行 Goal/Turn、Kernel、Bridge、Controller、Float、镜像、类型和生产构建边界；没有新的 testing-owner 全仓升级触发，因此不重复 RAW-160 的仓库全量套件。开发插件重载后的长期 Goal 跨至少两个自动 Turn canary 是独立宿主门禁。
- RAW-164 按当时 `VerificationImpactTrace` 运行 Bridge、Kernel、Runtime Diagnostics 定向矩阵、canonical/public 语法与镜像、typecheck、1871-module production build 和 uTools validator；没有新的 testing-owner 全仓升级触发。其 20 秒窗口是历史 RAW-164 后置无回弹采样，已被 RAW-165/166 取代为“首个可信事件立即更新，后续样本只验证无回弹”，不得作为展示或接纳前置等待。
- RAW-165 按最终受影响边界运行 Codex Bridge、Kernel、Runtime Diagnostics、Claude App State/Bridge/Unread、Controller 与 UI 定向矩阵，以及 canonical/public 镜像、语法、typecheck、1871-module production build 和 uTools validator。开发插件重载后只按真实事件到 Float `applied` 的链路验收，不加入 60 秒观望期或新可见状态。
- RAW-166 按当前影响图运行 Kernel、Codex/Claude Bridge、Task Package/Controller、Runtime Diagnostics 定向矩阵，执行 error-memory graph validator、Preload 同步/镜像/语法、typecheck、production build、Runtime Identity、uTools validator、文档 code-link/规则一致性和同步组审计。真实 Host 只核验新 artifact 下的事件→canonical→Float 链，不重新引入 20/60 秒产品等待。
