---
id: eypc-codex-app-server-session-state-survives-exit
status: verified
scope: project
fingerprint: codex-session-exit-left-derived-state__bridge-aliases-cursors-or-controller-inventory-waterlines-survived-restart__old-generation-could-restart-block-or-overwrite-new-session__generation-owned-reset-and-bootstrap
first_seen: 2026-07-19
last_verified: 2026-08-12
review_after: 2027-02-01
evidence:
  - preload/index.js
  - src/runtime/codexController.ts
  - tests/platform/codexAppServerBridge.test.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/platform/companionTaskActionsBridge.test.ts
  - tests/runtime/codexController.test.ts
  - full-verify-722-of-722
  - cold-task-action-preflight-regression
  - ownerless-pending-request-recovery-regression
  - process-navigation-v1-lifecycle-regression
  - inventory-rollout-append-race-regression
tags:
  - codex-companion
  - app-server
  - process-lifecycle
  - generation-guard
  - session-memory
  - controller-lifecycle
  - inventory-baseline
  - action-alias
  - same-key-recovery
---

# Codex Bridge / Controller 退出后遗留会话状态

## Symptom

- 显式关闭会清理匿名动作映射、turn 状态缓存和首次提问分页游标，但子进程异常 `exit/error` 只清 RPC/process 字段。
- 旧 action alias 在进程退出后仍可能短暂有效；被拒绝的后台分页还可能沿用旧 generation 自动拉起新 App Server。
- Controller 停用或关闭任务收件箱后只清投影、不清旧 `lastThreads`、项目库存、来源指纹、Activity generation、active-exit baseline 和 missing-key 候选；停用期间真实归档、删除或项目离库在重开后会被旧基线误判为普通缺行。
- 旧 refresh/activity 请求仍占用 in-flight 标记或在 `finally` 写回时，新一代的立即 bootstrap 可能被阻塞或被旧结果覆盖。
- Host 已把普通 mainHide 视为软生命周期，但 replaceable Renderer 的 `dispose()` 仍调用 provider close；同时任一 Provider 库存有值就被当作全局 ready，使新旧 Renderer/跨来源打开链仍可能清缓存或并发派发。
- V4 Controller 曾把卡片的 10 分钟 `actionAlias` 当成预检前硬身份。任务仍在公共包中时，过期/生命周期重建的 alias 会让手动点击、标题、Enter、紧凑待输入角标和全局入口共同卡在 Host 打开链；删除既有 stale-alias 回归后，整包 fresh 还会跳过目标级预检。
- 第一轮返工仍在 Actions 入口逐字段比较 Renderer 的 target 与 Host 当前 target；同 key 任务只要 alias/revision/phase 任一落后，就在 Provider adapter 前返回 `stale-target`。因此“Controller 不拒绝旧 alias”并不充分，卡片、attention 和全局入口仍会共同失败。
- Host 重建后，独立 App Server 可能仍返回旧 `interrupted`，而同一 rollout 已在持续追加实时事件。若库存扫描先于 `fs.watch` 回调执行，旧 tracker 的 `size/signature` 会直接被刷新为当前值，唯一的 append 边沿因此被当成“已观察”但从未进入运行态归约，页面持续保留 stopped。

## Verified Root Cause

- 正常关闭和非预期退出维护两份不对称清理逻辑。
- 后台扫描的 `finally` 无 generation 所有权判断，旧任务可能覆盖新一轮 running 状态。
- Controller 的功能开关边界只重置了展示结果，没有把 Codex 派生库存、水位、隔离候选、退出基线和循环游标视为同一 runtime session；异步操作也没有独立的 runtime generation/operation owner。
- Renderer 生命周期、Provider 库存 readiness 与 Host 进程导航 ownership 被混为一层；Provider-local singleflight 无法约束另一个 Provider 的打开链。
- 匿名 task key 与短期 capability alias 被当成同一身份。Controller 在 Kernel 有机会按 key 做定向预检前就拒绝旧 alias，Kernel 又以整包 freshness 代替目标存在性/capability/alias freshness，因此没有任何层能恢复仍然存在的同一任务。
- 返工时只把拒绝从 Controller 后移到了 Actions，却仍把 Renderer target 当成权威；Actions 明明持有同 key 的更新 Host target，仍先比较旧字段并拒绝，导致设计目标与最终调用边界不一致。
- rollout tracker 的库存同步同时承担“更新基线”和“处理实时增量”，但既有实现先覆盖基线、后依赖异步 watcher。两条合法触发路径存在竞态，库存路径会吞掉 watcher 尚未归约的活动证据。

## Prevention Rule

- 正常关闭、启动失败和非预期 `exit/error` 必须共用一个会话重置函数，统一清 alias、raw-ID 状态缓存、raw-ID/cursor 首问缓存与 capability，并递增 generation。
- 每个异步扫描在 await、catch 和 finally 都校验自己捕获的 generation；旧扫描不得创建新进程、写回缓存或清除新扫描状态。
- 子进程异常结束后旧 alias 立即失效；只有新的显式读取或同一次用户打开动作触发的受控 tasks-only 预检可以建立新会话。
- 公共卡片 key 是精确目标身份，Renderer 的 `actionAlias/revision/phase` 只是版本提示。Controller 和 Actions 都不得用旧字段拒绝一个 Host 已持有的同 key：Actions 必须直接采用当前 Host target，且不得为此读取库存或触发分类。
- 只有 Host target/私有映射确实缺失或当前 capability 不可用时，才进入 provider-scoped exact/tasks-only 恢复。Host 只允许对同一 key 恢复/重试一次：优先从仍可信的私有注册映射续签，否则读取完整可信库存；绝不选择其它任务。并发缺失请求共享一个 single-flight，Host 未确认成功不得推进 attention/read progress。
- Controller 停用或任务收件箱关闭时必须先递增 runtime generation、解除旧 in-flight 所有权并清空所有 Codex 派生任务/项目库存、来源/Activity 水位、active-exit baseline、missing-key 状态与任务循环游标；设置、别名、本地置顶、隐藏和折叠等 EyPc 自有状态必须保留。
- 新一代启用后必须立即执行额度、配置、完整库存和 latest-Turn bootstrap；每个 refresh/activity continuation 在写回与 `finally` 前校验捕获的 runtime generation 和 operation owner，旧会话不能阻挡或清除新会话。
- 清空旧库存不能让显式用户命令失效：若 `mainHide` 全局任务入口在停用边界后到达且当前库存为空，Controller 接纳该命令并串行执行一次 tasks-only action preflight，再从新一代投影解析目标。它不能恢复旧库存，也不能把冷缓存为空误报成最终“无任务”。
- 区分显式停用/kill 与普通宿主隐藏/Renderer remount：前者关闭 App Server、Desktop bridge 和进程导航；后者只释放 Renderer-local timer/listener/lease，保留有界 Host session、alias/latest-Turn 与 ready navigation snapshot。新 Renderer 在全部启用 Provider 库存 settled 前不得以空 bootstrap 覆盖该 snapshot。App Server latest/full Turn 不能替代 pending-request 权威。
- 跨 Provider 通用导航必须由一个 Host 进程 owner 串行派发；每个键可推进游标，但 bounded trailing window 只派发最终目标。显式行/attention 打开优先于尚未派发的通用目标，且 Provider-local opener 不能绕过全局并发 1。
- 同一 rollout candidate 的既有 tracker 在库存扫描推进 `size/signature` 前，必须先以 `emit:false` 归约未消费的文件变化；append 决定是否采纳 runtime 边沿，语义指纹决定是否发布。冷历史、等值重扫和普通打开不能仅凭文件存在或 mtime 推导为 active。

## Regression Evidence

- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) 持有后台 `limit=50` 请求后触发异常退出，断言旧 alias 失效、旧分页不自动 spawn、新读取才建立第二个子进程。
- [preload/index.js](../../../preload/index.js#L1) 的正常关闭和异常退出共同调用同一会话重置函数。
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) 持有第一代异步读取并停用/重启，断言第二代 bootstrap 不等待旧请求；同时覆盖停用期间归档、删除、项目离库、新任务加入、保留任务项目归属与缺行固定隔离窗闭合。
- [codexController.ts](../../../src/runtime/codexController.ts#L1) 以 runtime generation 和 operation owner 保护 activity/refresh 写回，并在每次停用时清除 Codex 派生基线。
- RAW-139 Controller 回归在非 Codex Tab/Float 关闭的冷态触发 completed-unread、input 与 cycle，证明只读取 tasks、不读取 quota/config，并在新库存发布后打开；卡片旧 alias 只按同一 key 重建。
- RAW-141 Bridge/Controller 回归证明普通 pluginOut 仍保持 Desktop socket/follow，库存重建后重新发布此前精确观察的 Plan；kill 会关闭 socket。当前真实 ownerless input 另由安全 rollout 回退恢复，App Server latest Turn 单独不足以证明或解除等待。
- RAW-160 rework 回归覆盖 Renderer 旧 alias/revision/phase 仍按 Host 同 key 当前 target 打开、生命周期重建后的两个并发缺失请求共享一次解析、私有映射直接续签不做全扫、目标消失时 fail closed、不跨任务回退；Controller card/input/cycle 动作还断言打开前 package revision 不变。
- rollout 竞态回归先以旧 `interrupted` 建立 tracker，再追加 `task_started + reasoning`，刻意让完整库存刷新先于 watcher；断言同 key 立即恢复 `active/inProgress` 且旧 idle 不再成立，随后仅经库存刷新追加 `task_complete` 又精确回到 completed。

## Detection Order

1. 枚举正常 close、初始化失败、`error`、`exit` 和 RPC overflow 等终止路径。
2. 对比每条路径是否清理相同的敏感内存和 capability。
3. 在异步后台任务 await 边界核对 generation，并检查 finally 是否有所有权保护。
4. 用挂起请求制造进程退出，观察是否出现无用户触发的新 spawn。
5. 对 Controller 分别执行 feature disable/enable 与 inbox disable/enable；核对投影、库存、来源指纹、Activity generation、active-exit baseline、missing-key timer/candidate 和任务游标是否同批清空。
6. 在第一代 refresh/activity 仍挂起时启用第二代，确认新 bootstrap 已发出，再释放旧请求并确认它不能写回或清除第二代 in-flight 状态。
7. 在停用清空后直接触发一个全局任务命令，确认它等待 tasks-only preflight 后执行一次；连续命令保持顺序，失败不能回退旧库存或其它任务。
8. 分别触发非 kill plugin hiding、显式 feature disable 与 kill；前者应保持 Desktop observer/有限 request shadow，后两者应完全关闭。库存重建必须接受新 snapshot/Turn 并清除已过期 shadow，而不能用旧 App Server terminal 覆盖仍未决的精确请求。
9. 分别阻塞 Codex/Claude 库存并触发通用循环，确认只有两条启用 lane 都 settled 后才派发；随后跨 Renderer remount 连按并插入一次手动打开，确认 retained snapshot 未被空投影覆盖、无重复 payload、最大并发为 1。
10. 保留一张超过 10 分钟或生命周期重建前的卡片，分别从行、标题、Enter、紧凑角标与全局入口打开；若 Host 仍有 key，确认直接使用 Host 当前 target、零库存读取、零 `stale-target`；若 Host 已无 target，确认一次合并解析只恢复同 key，目标消失或失败时零 fallback 且 attention/read 不推进。
11. 在旧 terminal rollout 上追加实时事件，同时让完整库存扫描先于文件 watcher；确认扫描先归约 append 再推进 tracker 基线，并验证重复库存/phase-only 读取不增加语义 revision。

## Alternative Route

- Status: `verified` for lifecycle and same-key alias recovery automation；rebuilt-host long-duration acceptance remains pending.
- Preconditions: App Server or Controller runtime session owns aliases, raw-ID caches, background pagination, task/project inventory, evidence waterlines or in-flight reads when initialization, `error`, `exit`, explicit close or feature/inbox disable ends that session.
- Ordered steps: increment the owning generation; detach old operation ownership; run the appropriate shared reset; invalidate session-only aliases/caches/cursors or Controller-derived inventory/waterlines while retaining EyPc-owned persistent settings; start the new Controller bootstrap immediately; let every pending continuation compare its captured generation and operation owner before spawn, writeback or cleanup.
- Verification: bridge contracts hold background paging across process exit；Actions accepts any stale Renderer target when the Host still owns the same key，while a truly missing Host target uses one controlled exact renewal；Controller contracts hold old async reads across disable/enable and dispatch actions without a pre-open package sync。
- Applicability boundary: in-process App Server and Controller-derived session state. It does not authorize killing Codex Desktop, clearing persisted plugin settings or replaying actions that the user did not explicitly trigger；显式冷启动命令自己的最小 preflight 属于同一次动作。
- Soft-lifecycle boundary: ordinary non-kill hiding may preserve bounded process-owned App Server aliases/latest-Turn material and a versioned navigation snapshot when hot global shortcuts are an explicit product contract. It does not persist those facts across process exit, authorize stale semantic restoration after feature/inbox disable, or let a partial Provider inventory overwrite the atomic current view.
- Fallback: if generation ownership is uncertain, discard the continuation and require a new explicit read.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19 | App Server lifecycle cleanup | Unexpected child exit left aliases/cursors and a pending scan from the old session | Maintain separate close and exit cleanup | Bridge process-exit regression | Share one generation-owned reset and guard asynchronous continuations | verified by existing bridge regression contract |
| 2026-08-01 | RAW-137 interruption recovery | Controller disable/enable retained old inventory/source/evidence baselines and an old async owner | Clear only the visible projection and rely on the next ordinary poll | Controller interruption/inventory matrix | Reset all Codex-derived runtime baselines, immediately bootstrap under a new generation, and self-schedule missing-key closure | verified again by RAW-138 full verify 722/722 on 2026-08-03; real-host interruption acceptance pending |
| 2026-08-03 | RAW-139 cold task entry | Correct RAW-137 cleanup left no inventory when a `mainHide` task shortcut was synchronously consumed before bootstrap | Treat empty cold projection as final “no task” and hide the Renderer again | Source call chain, uTools lifecycle evidence and Controller/App route regressions | Keep the reset, but serialize the explicit command behind tasks-only preflight; let `mainHide` alone own visibility | focused 141/141 and full verify 730/730; rebuilt cold-host acceptance pending |
| 2026-08-03 | RAW-141 ownerless pending request | Ordinary non-kill plugin exit closed Desktop observation, while new follower and App Server could not reconstruct the current request | Treat every pluginOut as a full bridge close and assume refollow/latest Turn is complete state | Current live socket/follower/App Server/rollout evidence plus Bridge lifecycle regression | Keep Desktop observer and finite observed request shadows across non-kill hiding; explicit disable/kill still performs full reset; use safe rollout only for exact ordinary input | focused 170/170, full workspace 737/737 and isolated commit 711/711 plus type/build/runtime gates pass; rebuilt uTools display pending |
| 2026-08-09 | RAW-152 cross-provider navigation | Codex/Claude previous-next could accept a partial cache, overlap provider opens and lose process cache on Renderer disposal although single-card clicks were exact | Kept cursor/readiness in Renderer and relied on separate provider-local singleflight | Controller/Preload call-chain plus blocked-lane, max-concurrency, remount, retained-card and hot-entry regressions | Added process owner and concurrency one；RAW-155 later replaced fixed coalescing with immediate first dispatch plus in-flight final trailing | automated verified；real rapid-switch acceptance pending |
| 2026-08-12 | RAW-160 stale-alias open regression | Visible waiting-input task could not be opened by click, Enter or global/compact entry after alias expiry or lifecycle rebuild | Controller rejected `(key, alias)` before Kernel resolution and Kernel trusted package-level freshness | V4 call-chain plus expired/concurrent/disappeared-target regressions | Make key authoritative, alias a hint, and move same-key recovery into Host | first rework automated green but invalidated by installed 1.5.5 |
| 2026-08-12 | RAW-160 1.5.5 Actions recurrence | Exact 1.5.5 Host logged repeated `stale-target` for card、attention and global sources despite the task key remaining registered | Actions still compared Renderer alias/revision/phase against the newer Host target before calling the adapter | Clean installed diagnostics plus direct Actions/Controller call-chain review | Resolve current Host target by key first；only a missing Host target enters provider-scoped recovery；remove Controller pre-open package sync | affected 545/545 + full 1305/1305 + build verified；`host-719360…` acceptance pending |
| 2026-08-12 | RAW-160 rollout 实时状态复发 | 同一会话 rollout 持续追加且桌面列表为 active，EyPc 独立 App Server 仍保留旧 interrupted | 库存刷新先覆盖 tracker 的 size/signature，吞掉尚未被 watcher 归约的 append | 脱敏真实会话尾部事件、App 列表与独立 App Server 三方交叉证据；库存先行回归先红后绿 | 既有 tracker 在推进基线前先无发布地归约未消费变化；active 与随后 completed 共用同一因果路径 | Bridge 124/124、关联 Kernel/Domain 91/91、canonical/public syntax+mirror verified；重建宿主验收 pending |
