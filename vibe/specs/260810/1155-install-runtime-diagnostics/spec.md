# RAW-160 → RAW-166 Companion V4 Unified Runtime Spec

Status: `RAW-166 increment-automated-verified / rebuilt-artifact-ready / documentation-synchronized / dev-plugin-reload-pending`

本规范是当前权威。RAW-159 的 V3 规格作为历史实现基线保留在 Git 与长期任务文档中；与本规范冲突时以 V4 为准。

## 1. Authority Graph

```text
Codex / Claude events, inventory and watcher evidence
  -> Provider Evidence Adapter
  -> Branch Evidence Store
  -> Canonical Task Reducer
  -> View / Capability Projector
  -> Process Latest Package Cache
  -> Main / Float / badges / navigation / actions
```

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 是 `companion-task-kernel-v4` 的唯一状态、私有 Branch Evidence Store、父/Side Chat 聚合、Plan 生命周期、时间窗口、隐藏/暂停、排序、角标与动作能力 owner；[companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) 定义 `companion-task-package-v4` 公共合同。Provider Adapter 只采集拓扑并归一化原始证据；Renderer 只提交配置与操作意图。Controller、Domain、Main 和 Float 不得重新裁决 phase/group/tier/count。

V4 Kernel 缺失、Facade 不完整或 Main/Float/Renderer/Preload Runtime Identity 不一致时进入 `reload-required` 并停止任务动作；不得回退 V3/V1 业务路径。

## 2. Branch Causality And Plan Lifecycle

每个分支先按因果顺序裁决：更新的真实 active、新 Turn 或更新 waiting 清除该分支旧 idle；更新的 unresolved input/approval/Plan 建立 waiting；terminal 仅在无更新 active/waiting 时有效；active/terminal 冲突保留非终态并 `freshness=verifying`。Kernel 随后始终对根任务及全部已确认 Side Chat 应用运行 → 审批 → 普通输入/Plan → Goal → terminal 的聚合；不再用 main completed-read 选择分支范围。Preload 发布的分支引用、角色与 unread evidence 只在 Host/Kernel 会话内存在，公共包只含匿名父 key 和最终聚合结果。

证据不足的 reducer 结果是 `abstain/unchanged`，不是一种可展示 running。已有任务由 [companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) 保留最近可信库存语义且不进入 Kernel 未声明的动态组；没有 metadata/prior 的 unknown 只显示为非活动 attention 占位。新 activity row 以 unknown 为前态；hydration/cold snapshot `active` 必须有 Turn-start、live append、processing、活动事件或等价实时证据才可变为 running。

| 证据 | Canonical 结果 |
| --- | --- |
| 首次 Plan Turn 正在生成，尚无完成 Plan | running；`planReady=false` |
| 已有 Plan 后继续修改且 Turn 运行 | running；保留 `planReady=true` |
| 普通问题或审批 | waiting-input / waiting-approval；高于 Plan 循环层 |
| completed Plan 且 exact 实施确认未决 | waiting-input；`planReady=true`；`planImplementation=true` |
| completed Plan 已确认，但没有专用 Implement Plan 请求 | 保留可信 phase；`planReady=true`、`planImplementation=false`；暂停/恢复/执行能力仍可用 |
| Plan 未执行、exact interrupted、定向复读确认无更新活动/等待 | stopped；保留 `planReady=true` |
| 普通 interrupted，尚未 idle-confirmed | 保留稳定态；`verifying` |
| 普通 interrupted，selected scope 全部 idle-confirmed | ordinary stopped |
| exact default/non-Plan Turn 开始 | running；清除 `planReady/paused` |
| 任一 main/Side running | 父任务 running；潜在 unread 不进入 unread 分组/计数 |
| 无活动分支且任一 main/Side completed-unread | 父任务 completed-unread |
| 全部 main/Side completed-read | 父任务 completed-read |

`CompanionCanonicalTaskV4` 增加 `planReady`、`planLifecycleRevision`、`paused` 与 `open/archive/pause/resume/executePlan` 能力。新 exact Plan 替换旧 Plan 时 revision 单调增加；普通刷新、owner 切换、refollow 和 Plan 修改不清除。完成、归档、移除、明确放弃或 exact default 执行才清除。

## 3. Views, Windows, Cycles And Pause

- 动态列表仍受 `dynamicTaskWindowHours` 控制；普通 stopped 超时退出。
- 唯一窗口例外是 `phase=stopped && planReady && !paused`；它进入待继续分组及分组计数，但不新增紧凑 stopped 角标。
- waiting Plan 可退出动态展开列表，但仍进入待输入角标、Plan 能力和通用 Plan 循环。
- 通用循环取首个非空层：普通 input/approval；exact Plan implementation 或 stopped Plan-ready；动态窗口 active；local pin。每层按最近提问、创建时间、匿名 key 排序。
- 待输入直接入口与 `codex.input.open` 只使用全部可见的真实 input/approval 候选；为空时返回 unavailable，不回退 local pin。local pin 仅属于上一条普通循环的最后一级。
- paused、ordinary hidden、archived 从全部角标和快捷候选移除。

Plan pause receipt 只持久化哈希 taskRef、Plan revision、paused 和时间。已隐藏页先渲染“已暂停”，再渲染普通隐藏；旧 hidden Plan 执行幂等迁移，先成功写 pause receipt 后再清 hidden，清理失败时回滚 pause。普通/批量隐藏遇到 Plan-ready 统一转换为 pause。

任务四槽为普通 `顶/隐/归/+`、Plan-ready `顶/暂/归/执`、paused Plan `顶/恢/归/执`。新会话能力留在抽屉；批量提供暂停/恢复；[FloatApp.vue](../../../../src/FloatApp.vue#L1) 使用同一 package capability 并保留 ARIA、禁用原因和焦点恢复。

## 4. Actions V2 And Execute Plan

[task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1) 是 `companion-task-actions-v2` 唯一 Dispatcher。pause/resume/execute 使用 Plan revision single-flight；已确认完成且处于 waiting-input/stopped/completed 的 Codex Plan 保留暂停/恢复/执行菜单。`planImplementation` 只把 exact 实施请求放入 Plan 循环层；没有专用 `Implement Plan` 弹窗不能禁用菜单。第二次确认时 Host 精读最新 Turn、真实活动与其它 pending 后才允许执行；default collaboration mode 与当前 model 仅优化原生执行路径。

首次点击“执”只建立 5 秒确认；第二击才执行。确认 identity 包含 provider、匿名 task key、Plan revision、action alias、phase 与 paused；任何相关 selector 变化取消。确认缓存独立于 package revision。

[preload/index.js](../../../../preload/index.js#L1) 只在第二次确认后以有界超时探测并按 App Server 连接缓存 `collaborationMode/list`，执行顺序固定为：

1. 建立 single-flight/operationId，按匿名 key 续签当前 alias，并定向复核 task、Plan revision、active/pending；过期或旧 alias 不得跳到其它任务。
2. 打开原 Codex 任务；失败则停止。
3. `thread/resume({ threadId, excludeTurns: true })`，不覆盖 cwd/model/权限。
4. 从私有线程状态取当前 model 与 reasoning effort；若 default mode 与 model 均可确认，选择原生 default 路径，否则选择同任务固定执行指令路径。
5. 仅调用一次 `turn/start`：原生路径传入完整 `{mode:'default', settings:{model, reasoning_effort, developer_instructions:null}}`；兼容路径省略可选 `collaborationMode`。两者都只使用 Preload 私有固定指令。
6. 明确响应或 exact Turn evidence 才收敛为 running 并清 Plan；不得乐观改包。

明确失败保留 Plan 并返回阶段原因；超时为 `indeterminate`，定向复读匹配新 Turn，禁止自动重发。原生模式探测失败只降级到同任务 App Server Turn，不禁用菜单；无剪贴板、键盘模拟、UI 自动化或替代会话回退。

普通打开同样由 Kernel/Host 单链所有：卡片携带的 `actionAlias/revision/phase` 只是版本提示，最终目标始终是匿名父 key。Host Actions 已持有该 key 时必须采用当前进程 parent target，不能因 Renderer 提示落后而前置 `stale-target`；这一路径不做库存读取或重分类。仅当当前 target/私有映射缺失或能力不可用时，才合并执行 provider-scoped exact/tasks-only 解析。Host 优先从仍可信的私有映射续签，否则读取完整可信库存；只发布并最多重试同一 parent key 一次，不选择其它任务或 Side Chat。卡片、标题、Enter、紧凑角标、attention 与 uTools 全局入口都复用此函数；Deep Link 固定为父任务，且仅 Host 成功结果推进队列/已读。

## 5. Semantic Publication And Latest-State Consumption

Kernel 的语义指纹覆盖 phase/freshness/unread、Plan fields、membership/visibility/capability/action token、groups/counts/cycle/attention/sort 和必要展示元数据。observedAt、acceptedAt、producer generation 与内部因果水位不参与包相等。

等价 evidence 不增加 task/package revision，不更新 publishedAt，不调用 listener，不推 Main/Float，不同步 Navigation/Actions，也不引发 badge/open。Renderer 焦点只同步 Host 私有 Actions 上下文：不进入 semantic package fingerprint，不增加 revision，不回推 Renderer/Float，不触发筛选或分类。动态时间只维护最近一个 `nextVisibilityTransitionAt` 单次计时器。

Kernel 暴露 `getLatest()` 和 `subscribe(afterRevision, listener)`；Main、Float、Navigation、Actions 分别缓存 package revision 与 selector fingerprint。remount 只补发一个最新包，同/旧 revision 忽略；mainHide、Float close 与 Renderer detach 不清缓存。相同 navigation targets 不重置游标；相同 action selector 不取消确认。

Float task lane 独立于 quota/settings，ACK 为 `received/applied/rejected`。Host 在 500ms 未 applied 时只重发最新包一次，累计 1 秒且心跳健康才受控重建；Float 对同 revision 不替换 task cache 引用、不重新执行 Vue 投影。

[preload/index.js](../../../../preload/index.js#L1) 还持有 Codex 原生未读与 rollout-decision 的进程级恢复链。目录 `fs.watch` 的首个回调直接读取；每个已登记状态/rollout 文件另用 1 秒 `fs.watchFile` StatWatcher 补漏，目录 watcher 报错后由 Host 自动重建，原子 rename 与普通写入等价。Renderer Controller 不再周期调用 `readActivitySnapshot({phaseOnly:true})`；该显式 API 只保留兼容/定向读取，不承担恢复权威。

持久未读从 false 变为 true 且当前任务仍为 active 时，Host 必须对同一匿名 key 强制定向读取 latest Turn；旧 exact `turn-started`/active 不能阻断该核验。未读只触发核验而不直接推导 terminal，结果仍受正向 evidence sequence 约束：核验期间到达的更新 active/Turn 会丢弃迟到终态。私有 Branch Evidence 先以 deferred 方式写入 Store，再与同一 Host Activity draft 一次提交；因此一个 Provider 语义变化最多形成一个 package revision，而 1,000 次同值 StatWatcher/重放信号形成零额外发布。

## 6. Claude State, Hidden Host And Archive Result

[events.cjs](../../../../preload/claude/events.cjs#L1)、[app-state.cjs](../../../../preload/claude/app-state.cjs#L1)、[code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1) 与 [unread.cjs](../../../../preload/claude/unread.cjs#L1) 由进程生命周期 Host 订阅。Hook/App-log、任务成员关系与未读的首个文件回调立即同步 drain/read；不以 JavaScript timer 合并真实首变化。重复/无内容尾事件和同值 LevelDB 指纹在 source 与 package semantic fingerprint 两层消重；部分元数据 JSON 保留最后可信任务，等待下一原生回调/StatWatcher。目录 `fs.watch` 是快路，已登记目标的 1 秒 `fs.watchFile` StatWatcher 是隐藏 Main 时仍有效的漏通知恢复；Renderer Controller 不再另设 phase 轮询。Host package 直达 Float task lane，并以 applied ACK 作为终点：正常不超过 250ms，掉目录通知恢复不超过 1.25s。

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 的 Claude evidence reducer 让本次 `session.phase` 在因果上新于旧 cache 时优先；延迟旧 inventory 不能覆盖更新事件。phase、phaseRevision、statusEnteredAt、unread 和 capabilities 作为同一 accepted snapshot 更新。Claude App `1.26832.0` 与经当前本机固定语法核验的 `1.28929.0` 可提供 App-log 状态；cold replay 的普通 running/waiting 仍 abstain，只有 live append/Hook/exact terminal 可改变实时状态。

[archive.cjs](../../../../preload/claude/archive.cjs#L1) 的 D′ 后置条件不变：唯一目标元数据 `isArchived=true`、活动库存移除、事务复读通过。`1.28929.0` 的实际元数据键/类型经只读核验保持单字段事务合同，并由隔离夹具验证 stopped 直接归档；未知版本仍拒绝。成功结果明确为“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。”；不以侧栏视觉作为合同，不增加 AX/JXA、私有 IPC、LevelDB 写、重启或 UI 自动化。

Codex/Claude 的 stopped 均可从任务行直接进入归档，但仍执行既有两次确认与 Provider 精确复核；恢复运行或目标变化时拒绝，不能先把 stopped 伪改成 completed。

## 7. Privacy, Compatibility And Static Ownership

- task package、Renderer、pause receipt 与错误记忆不包含原始 task ID、路径、Plan 正文或执行提示。
- 诊断 taskRef 为进程会话期 `h:<hex>`；operationId 只关联阶段，不暴露内容。
- `scripts/validate-utools-runtime.mjs` 与测试锁定 V10/V4/Actions v2、Execute 协议、Float ACK、Claude 文案和四端 Runtime Identity。
- 静态架构测试禁止 Kernel 外生产代码重新构造 canonical phase、dynamicGroup、cycleTier、counts 或 cycleKeys。
- 紧凑角标几何合同为单数字 `20×20`、两位数/`99+` 自然扩宽，不新增等宽/tabular 数字；设置预览与 Float 共享相同高度、最小宽度、padding 与圆角。

## 8. RAW-161 Authoritative Codex Membership Recovery

[preload/index.js](../../../../preload/index.js#L1) 在进程 Host 中持有两个精确 membership root watcher：`CODEX_HOME/sessions` 与 `CODEX_HOME/archived_sessions`。`fs.watch` 的 rename 是即时唤醒，两个 root 的 1 秒 `fs.watchFile` 是掉通知恢复；错误会关闭失效 watcher、重建并强制 Codex tasks-only 对账。Controller 不新增周期库存 timer。

每次唤醒都并行完成 `thread/list archived:false` 与 `thread/list archived:true` 的全 cursor 对照。只有匿名 key 当前仍在 Kernel/Activity inventory、raw ID 不再位于未归档清单且明确位于归档清单时，Host 才清理 waiting/shadow/unread/action/Turn cache 并发布 urgent `archivedKeys`；这个精确后置条件绕过普通 missing-row quarantine。新增、无法分类的缺失或两边同时出现只触发 Codex provider-scoped tasks-only 对账，不猜测归档。

dirty recovery 仅对“不在未归档且不在归档库存”的 dirty raw ID 执行 `thread/read`。插件进入、Desktop IPC 重连和 watcher 重建强制一次 tasks-only 对账。EyPc 本地归档事务用进程私有 suppression 保护目标，直到原严格事务 commit、再次确认其仍未归档或会话重置；外部 recovery 不能把一次本地 indeterminate 写乐观提交。

## 9. RAW-162 Goal-aware Completion Authority

Codex Goal status 是长期任务的完成边界，Turn outcome 只描述该任务内的一轮执行。Preload 通过 App Server `thread/goal/get`、`thread/goal/updated` 与 `thread/goal/cleared` 建立 process-only Goal Evidence；Evidence 只含枚举 status、updatedAt、freshness 与会话因果序号，并按分支进入 Kernel 私有 Store。Goal-only 变化使用现有 deferred Branch Evidence + Host draft 原子提交，不增加公共 TaskPhase 或 Renderer 字段。

Kernel 聚合顺序扩展为：更新真实 running → approval → input → 当前 active Goal → 任一未知/过期 Goal 保留稳定非终态并 verifying → 当前 paused/blocked/usageLimited/budgetLimited Goal → 当前 complete Goal → 无 Goal 时的既有 Turn terminal。active Goal 跨任意数量的 `turn/completed → turn/started` 保持非完成；四类不可继续状态投影为 stopped/“待继续”；complete 仅在没有因果更新 active/waiting 或未知 Goal 分支时进入 completed。

Goal 查询以发起时 evidence baseline 和 `goal.updatedAt` 防止迟到结果覆盖实时通知。暂时失败保留最近稳定非终态并标记 verifying；只有 method-not-found 建立 runtime-level unsupported，回退无 Goal Turn 语义。Goal complete 之后若出现严格更新的新 Turn，该非活动 Goal epoch 被视为已取代；后续终态候选重新 single-flight 读取 Goal，避免旧 complete 永久锁死，也避免漏掉新 active Goal。

## 10. RAW-163 Branch Role And Parent-only Open Baseline

[preload/index.js](../../../../preload/index.js#L1) 在既有隐私化 Branch Evidence 中补充有限的 `branchKind=main|side`、`unreadKnown` 与 `hasUnreadTurn`。主分支 unread 使用自己的 Desktop/native observation；子分支不借用父级 connector unread。原始 parent/child ID 仍只存在于 Preload 映射中。

RAW-163 曾要求 main completed-read 后才开放全分支；该展示门槛已由 RAW-164 取代，不再是当前归约合同。RAW-163 引入的有限 branch role/unread evidence 仍作为全部珠子聚合的私有输入。

打开动作不再计算 Side Chat navigation priority。[preload/index.js](../../../../preload/index.js#L1) 对 Electron 与 uTools fallback 都只构造父任务 `codex://threads/<parent>`；没有 Side Chat 首试或失败回退。成功后仍由既有 preload-session acknowledgement 将父任务和已知 Side Chat 标记为本会话已读，失败不改变未读。

## 11. RAW-164 Side Topology, All-bead Priority And Runtime Identity

[preload/index.js](../../../../preload/index.js#L1) 从完整分页的 `thread/list` 与必要的 `thread/read` 读取 `sessionId/forkedFromId`，在父任务存在、同一非空 session、无环时把 fork 解析到根；缺父、跨 session、循环等异常关系保持独立。根任务进入公共库存，Side Chat 只进入进程私有 relation/Branch Evidence。Desktop `sideConversation` 判定先于 inventory membership，避免运行事件先到、快照后到或重连时把 child 重建为顶层 main。

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 对根与所有 Side Chat 无条件聚合。在既有 input/approval/Plan/Goal 因果规则之下，活动/完成三态固定为 running → completed-unread → completed。活动期间可保留较低优先级 unread 证据，但 canonical views 只产生一个 active 行并保持 unread count 为零；活动退出后才显露完成未读。Goal active/verifying 继续抑制中间 Turn terminal，Goal complete 才按最终 unread 完成；严格更新的新 Turn 可以合法开启新 epoch。

Host 只在语义变化时记录三类匿名诊断：`side-topology-decision` 记录哈希 parent 及 root/side/orphan/merge 计数，`parent-state-decision` 记录最终 phase/unread/reason 与有限分支/Goal 计数，`runtime-identity-handshake` 记录非私密实际/期望 Host/Renderer hash、Kernel/Package revision 与 `host-loaded/reload-required`。任何事件都不得含原始 parent/child ID、标题、正文、路径、Goal 内容、预算或用量。只有真实 uTools Host 报告 `host-loaded` 才能接纳已加载身份；production build 仅为 `artifact-ready`。

## 12. RAW-165 Event-time Causality And Claude Hot Unread

[preload/index.js](../../../../preload/index.js#L1) 将 branch identity 固定为 parent/branch，而不是 transport lane。实时 App Server/desktop 事件携带分支 live/terminal Turn epoch；成功返回的库存只提供 observation，不再用扫描时刻生成 terminal sequence。cold inventory terminal 可作为 sequence 0 基线，但只要同分支存在更新的 live/waiting，库存结果就不能关闭该分支。Side Chat 的 App Server authority 只写对应 Side，不再借父级聚合 authority 污染 main。

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 在完整快照到达时先按稳定 branch ref 与上一分支合并。父级 observation generation 仅拒绝旧传输批次；同分支 phase 由可比较 Turn epoch/真实 event sequence 裁决。inventory-only 或更旧 terminal 保留更新的 running/waiting，真实同一或更新 Turn terminal 仍即时接受。父级注意力顺序为 approval → input/Plan → running → Goal → terminal；因此任一待审批/待输入分支先于普通 Side running 展示。

Host push diagnostics 在 Kernel 提交后读取最终 canonical task 再分类：相同语义才是 `accepted`，更强证据导致改判为 `superseded`，无变化为 `ignored`。记录仅包含匿名 taskRef、有限状态/计数和 `providerReceivedAt → hostCommittedAt → canonicalPublishedAt` 时间戳，不含 raw ID、正文、命令、工具参数或输出。

[app-state.cjs](../../../../preload/claude/app-state.cjs#L1) 只接受已门禁 Claude App 的 exact completion 与 `[CCD] LocalSessions.setFocusedSession: sessionId=<local_id|null>` live append，并折叠为 process-private hot unread hint：focused completion 为 read，unfocused completion 为 unread，focus 到会话立即 read，新 running 清旧 completion hint。cold replay 只恢复当前 focus，不从旧日志制造 unread；同秒事件使用单调 hint revision。

[index.cjs](../../../../preload/claude/index.cjs#L1) 将 LevelDB exact unread 当作 cold/recovery baseline，与更新 hot hint 合并；只有先观察到该会话的相反持久边缘、再由事件后的新鲜快照匹配，才确认追平，上一 completion 遗留的同值不能释放本轮 hint。迟到 true/false 因而不能回滚更新的焦点/完成边缘。App watcher 同时唤醒 state 与 unread lane，unread-only 订阅也不依赖 Renderer 或 state subscriber。全局 focus 不能证明多窗格 visible-but-unfocused 已读，因此该边界保持明确限制，不扩大到 UI 注入、LevelDB 写或内容推断。

本增量不增加新的公共 phase、可见“核验中”状态、60 秒延迟或更高轮询频率；正常路径为实时事件，既有 1 秒 StatWatcher 只承担丢通知恢复。

## 13. RAW-166 Bidirectional Admission、Independent Lanes And Error Resolution

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 对 phase evidence 使用单一双向 admission：先比较可比 Turn epoch，再比较 phase event sequence；缺少更新因果水位时只允许同 epoch 的 attention 单调提升。该规则同时覆盖 live↔live、live↔terminal 和 terminal↔terminal，杜绝“更新 transport generation”替代“更新 Provider event”的两种方向错误。

分支合并不再整包覆盖。phase source 由上述 admission 选择；unread 仅在 incoming 明确 observed 时推进；Goal 仅按 Goal sequence/updatedAt 或显式 none-clear 推进。合并后重新 normalize 一次，统一计算 idle/terminal/live/waiting 等派生字段。公共包仍由一个 Kernel 事务生成，不增加第二 reducer 或 Renderer 修正。

[preload/index.js](../../../../preload/index.js#L1) 把 Adapter 日志限定为 proposal；Provider 级结果在 canonical commit 后按提议字段逐项比较，并统一使用 `accepted/superseded/ignored/queued`。该诊断合同同时适用于 Codex activity 和 Claude phase/unread/inventory，禁止把“读取成功、已发送或 Float applied”误称为提议已接受。

[error-memory index](../../../knowledge/error-memory/README.md#L1) 是唯一错误路由入口：七个责任模块只链接 leaf，不复制当前合同；leaf 恰有一个 Primary owner，candidate 不自动召回，superseded/retired 保留逻辑历史。[validator](../../../../scripts/validate-error-memory.mjs#L1) 验证元数据、唯一 identity/fingerprint、索引规模、断链、唯一 Primary、Related 上限、根模块覆盖和路由无环。产品/状态判断仍以 requirement → spec → architecture → verified error leaf 为权威顺序。

冲突处置只有两种：若已有更新且明确的用户决策，则同步删除 current authority 中的旧规则并保留历史标注；若不存在明确决策且选择会改变产品语义，则记录冲突并请求用户决断。本轮已按 RAW-164 all-bead 决策清除 current PRD 中残留的 RAW-163 main-first 展示门槛；parent-only open 未冲突并继续有效。
