# RAW-159 → RAW-161 — Companion 状态、发布与权威库存恢复

Date: 2026-08-12
Status: `active / rework-implemented / increment-automated-verified / dev-plugin-reload-pending`

## 历史基线

RAW-159 要求把状态、库存、缓存、快捷键、导航、归档和诊断从分布式补丁收敛为单一 Kernel，并已落地无固定任务上限、Codex cursor 全分页、语义 no-op、热缓存、Runtime Identity、十阶段 Codex 归档事务和运行诊断。这些是 RAW-160 的嵌套基础，不得遗漏或回退。

安装宿主随后复现：普通 interrupted 被过宽判为“待继续”；截图时仍运行且尚未生成 Plan 的任务没有稳定显示为进行中；Plan 完成/中断后的角标与循环候选不稳定；Claude 已终止仍可能沿用旧 running；EyPc 归档成功被误解为 Claude 原生侧栏同步；Kernel no-op 也没有阻止每个消费者重复发送/消费。

2026-08-11 对重建前安装包再次核验时复现三项 P0/P1 回归：主任务或 Side Chat 仍真实运行时，旧父级 `idleConfirmed` 可把它投影为待继续；任务 alias 超过 10 分钟或生命周期重建后，卡片点击、标题点击、Enter、紧凑待输入角标和 uTools 全局待输入入口均在同一 Host 打开链前置失败；单数字角标被无明确需求从圆形扩成胶囊。此前“无已知 P0 / full-automated-verified”因此失效，必须按本节 rework 重新接纳。

2026-08-12 安装并核对同构建 1.5.5 后再次复现打开回归：卡片、待输入直接入口和全局入口在 Actions 层统一返回 `stale-target`。根因不是 key 消失，而是 Actions 在进入 Host 同 key 恢复前仍逐字段比较 Renderer 的旧 alias/revision/phase 与进程当前目标；同时 Float 自动焦点被当成公开任务语义回写，每次焦点变化都增加 package revision 并重投影列表，放大 alias 竞态。用户明确否定“点击触发筛选/重分类”，因此下述打开与发布合同以本次纠正为准。

同日真实宿主又确认一项 Codex P0：Codex 原生界面与持久状态已显示任务完成且未读，但 EyPc 在十分钟以上没有收到新的 Codex activity，任务包停留在旧 revision，卡片继续显示进行中且不进入完成未读。Kernel 接受既有事件约 3ms、Float 应用约 624ms，排除 reducer 与渲染慢；根因是原生未读 `fs.watch` 可能丢通知或失效，首次读取仍排在 25ms JavaScript timer 后，错误后只关闭且没有重建，而 Renderer 的 `phaseOnly` 轮询明确不读取持久未读或普通任务最新 Turn。未读变化一旦漏掉，`reconcileLateUnread()` 及终态定向复核便不会启动。实现与验收必须以长期进程 Host 的即时读取、1 秒原生恢复与同一语义提交为准。

## RAW-160 当前要求

1. 唯一数据流为 `Provider 原始事件/库存 → Evidence Adapter → Branch Evidence Store → Canonical Task Reducer → View/Capability Projector → Latest Package Cache → 全部消费者`。
2. 升级 `task-state-v10 / companion-task-kernel-v4 / companion-task-package-v4 / companion-task-actions-v2`；V4 Kernel 缺失或四端 Runtime Identity 不一致时 `reload-required`，不回退旧裁决。
3. 分支先独立按因果顺序裁决，父任务再聚合。任一真实运行优先；否则审批、问题或 Plan 实施确认；只有全部分支终止且终态满足复核才 completed/stopped；冲突保留非终态并 `verifying`。
4. 首次 Plan 正在生成且尚无完成 Plan 时必须是 running、`planReady=false`；已有 Plan 后继续修改时仍 running 并保留 Plan 生命周期。
5. 完成 Plan 且实施确认未决时是 waiting-input、`planReady=true`；未执行便 exact interrupted 时，只有定向复读确认无更新 Turn/活动/等待才是 stopped。
6. 普通 interrupted 在 idle 复核前保留最后稳定态；确认全部分支 idle 后才是普通 stopped。任何 active/terminal 冲突不得先发布 stopped。
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
26. V4 Kernel 必须维护 Host-only Branch Evidence Store。Host 批量发布匿名父 key、会话期隐私化分支引用、活动/终态序号、等待类型与分支级 idle；原始 thread/branch ID 不进入 Renderer、日志或持久化。聚合固定为真实运行 → 审批 → 普通输入/Plan → 全分支 exact completed → 全分支终态且分别 idle-confirmed → 保留最近非终态并 `verifying`。新 active/Turn/更新 waiting 必须清对应旧 idle。
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

## 冲突与非目标

- RAW-142 的“任意新 Turn 清除 Plan”、RAW-150/154 的“exact interrupted 立即 stopped”、RAW-159 的“只在 Kernel no-op 即完成消费去重”和旧 Actions/Package 版本被 RAW-160 对应条款取代。
- 强制 Claude 原生侧栏同步不是产品能力合同；过去偶发同步只作为 Claude 自身刷新观察。
- 当前用户已授权只在 `EyPc-Regression-<run-id>-*` 无副作用测试任务中启动安全 Codex Turn/Plan 并做可恢复清理；不得触碰既有用户任务。真实 Claude D′ 归档不属于该授权。

## 验收要求

- 按 `VerificationImpactTrace` 选择的受影响状态/打开/UI 矩阵、语义 typecheck、Preload 镜像、production build、Runtime Identity、uTools validator、静态所有权、文档链接与规则一致性通过；本轮用户已独立要求中央缺陷逃逸后的全仓升级门禁，历史全量绿灯仍不能覆盖真实宿主回归。
- uTools 开发模式必须在重新加载当前 Preload 身份后验证 Plan 尚未生成、Plan 完成、Plan 中断跨窗口、暂停跨重启、Claude running→terminal、通用循环与 Float ACK 恢复；自动化不能替代该门禁，也不得用旧开发 Host 的 UI 观察接纳新源码。
