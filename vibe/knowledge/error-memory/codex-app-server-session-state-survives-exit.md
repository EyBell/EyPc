---
id: eypc-codex-app-server-session-state-survives-exit
status: verified
scope: project
fingerprint: codex-session-exit-left-derived-state__bridge-aliases-cursors-or-controller-inventory-waterlines-survived-restart__old-generation-could-restart-block-or-overwrite-new-session__generation-owned-reset-and-bootstrap
first_seen: 2026-07-19
last_verified: 2026-08-03
review_after: 2027-02-01
evidence:
  - preload/index.js
  - src/runtime/codexController.ts
  - tests/platform/codexAppServerBridge.test.ts
  - tests/runtime/codexController.test.ts
  - full-verify-722-of-722
  - cold-task-action-preflight-regression
tags:
  - codex-companion
  - app-server
  - process-lifecycle
  - generation-guard
  - session-memory
  - controller-lifecycle
  - inventory-baseline
---

# Codex Bridge / Controller 退出后遗留会话状态

## Symptom

- 显式关闭会清理匿名动作映射、turn 状态缓存和首次提问分页游标，但子进程异常 `exit/error` 只清 RPC/process 字段。
- 旧 action alias 在进程退出后仍可能短暂有效；被拒绝的后台分页还可能沿用旧 generation 自动拉起新 App Server。
- Controller 停用或关闭任务收件箱后只清投影、不清旧 `lastThreads`、项目库存、来源指纹、Activity generation、active-exit baseline 和 missing-key 候选；停用期间真实归档、删除或项目离库在重开后会被旧基线误判为普通缺行。
- 旧 refresh/activity 请求仍占用 in-flight 标记或在 `finally` 写回时，新一代的立即 bootstrap 可能被阻塞或被旧结果覆盖。

## Verified Root Cause

- 正常关闭和非预期退出维护两份不对称清理逻辑。
- 后台扫描的 `finally` 无 generation 所有权判断，旧任务可能覆盖新一轮 running 状态。
- Controller 的功能开关边界只重置了展示结果，没有把 Codex 派生库存、水位、隔离候选、退出基线和循环游标视为同一 runtime session；异步操作也没有独立的 runtime generation/operation owner。

## Prevention Rule

- 正常关闭、启动失败和非预期 `exit/error` 必须共用一个会话重置函数，统一清 alias、raw-ID 状态缓存、raw-ID/cursor 首问缓存与 capability，并递增 generation。
- 每个异步扫描在 await、catch 和 finally 都校验自己捕获的 generation；旧扫描不得创建新进程、写回缓存或清除新扫描状态。
- 子进程异常结束后旧 alias 立即失效；只有新的显式读取可以建立新会话。
- Controller 停用或任务收件箱关闭时必须先递增 runtime generation、解除旧 in-flight 所有权并清空所有 Codex 派生任务/项目库存、来源/Activity 水位、active-exit baseline、missing-key 状态与任务循环游标；设置、别名、本地置顶、隐藏和折叠等 EyPc 自有状态必须保留。
- 新一代启用后必须立即执行额度、配置、完整库存和 latest-Turn bootstrap；每个 refresh/activity continuation 在写回与 `finally` 前校验捕获的 runtime generation 和 operation owner，旧会话不能阻挡或清除新会话。
- 清空旧库存不能让显式用户命令失效：若 `mainHide` 全局任务入口在停用边界后到达且当前库存为空，Controller 接纳该命令并串行执行一次 tasks-only action preflight，再从新一代投影解析目标。它不能恢复旧库存，也不能把冷缓存为空误报成最终“无任务”。

## Regression Evidence

- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) 持有后台 `limit=50` 请求后触发异常退出，断言旧 alias 失效、旧分页不自动 spawn、新读取才建立第二个子进程。
- [preload/index.js](../../../preload/index.js#L1) 的正常关闭和异常退出共同调用同一会话重置函数。
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) 持有第一代异步读取并停用/重启，断言第二代 bootstrap 不等待旧请求；同时覆盖停用期间归档、删除、项目离库、新任务加入、保留任务项目归属与原生置顶变化，以及 `taskRefreshSeconds=0` 的缺行自动闭合。
- [codexController.ts](../../../src/runtime/codexController.ts#L1) 以 runtime generation 和 operation owner 保护 activity/refresh 写回，并在每次停用时清除 Codex 派生基线。
- RAW-139 Controller 回归在非 Codex Tab/Float 关闭的冷态触发 completed-unread、input 与 cycle，证明只读取 tasks、不读取 quota/config，并在新库存发布后打开；卡片旧 alias 只按同一 key 重建。

## Detection Order

1. 枚举正常 close、初始化失败、`error`、`exit` 和 RPC overflow 等终止路径。
2. 对比每条路径是否清理相同的敏感内存和 capability。
3. 在异步后台任务 await 边界核对 generation，并检查 finally 是否有所有权保护。
4. 用挂起请求制造进程退出，观察是否出现无用户触发的新 spawn。
5. 对 Controller 分别执行 feature disable/enable 与 inbox disable/enable；核对投影、库存、来源指纹、Activity generation、active-exit baseline、missing-key timer/candidate 和任务游标是否同批清空。
6. 在第一代 refresh/activity 仍挂起时启用第二代，确认新 bootstrap 已发出，再释放旧请求并确认它不能写回或清除第二代 in-flight 状态。
7. 在停用清空后直接触发一个全局任务命令，确认它等待 tasks-only preflight 后执行一次；连续命令保持顺序，失败不能回退旧库存或其它任务。

## Alternative Route

- Status: `verified`.
- Preconditions: App Server or Controller runtime session owns aliases, raw-ID caches, background pagination, task/project inventory, evidence waterlines or in-flight reads when initialization, `error`, `exit`, explicit close or feature/inbox disable ends that session.
- Ordered steps: increment the owning generation; detach old operation ownership; run the appropriate shared reset; invalidate session-only aliases/caches/cursors or Controller-derived inventory/waterlines while retaining EyPc-owned persistent settings; start the new Controller bootstrap immediately; let every pending continuation compare its captured generation and operation owner before spawn, writeback or cleanup.
- Verification: bridge contracts hold background paging across process exit and reject old aliases; Controller contracts hold an old async read across disable/enable, prove immediate second-generation bootstrap, reconstruct off-period inventory changes, and reject the released old result.
- Applicability boundary: in-process App Server and Controller-derived session state. It does not authorize killing Codex Desktop, clearing persisted plugin settings or replaying actions that the user did not explicitly trigger；显式冷启动命令自己的最小 preflight 属于同一次动作。
- Fallback: if generation ownership is uncertain, discard the continuation and require a new explicit read.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19 | App Server lifecycle cleanup | Unexpected child exit left aliases/cursors and a pending scan from the old session | Maintain separate close and exit cleanup | Bridge process-exit regression | Share one generation-owned reset and guard asynchronous continuations | verified by existing bridge regression contract |
| 2026-08-01 | RAW-137 interruption recovery | Controller disable/enable retained old inventory/source/evidence baselines and an old async owner | Clear only the visible projection and rely on the next ordinary poll | Controller interruption/inventory matrix | Reset all Codex-derived runtime baselines, immediately bootstrap under a new generation, and self-schedule missing-key closure | verified again by RAW-138 full verify 722/722 on 2026-08-03; real-host interruption acceptance pending |
| 2026-08-03 | RAW-139 cold task entry | Correct RAW-137 cleanup left no inventory when a `mainHide` task shortcut was synchronously consumed before bootstrap | Treat empty cold projection as final “no task” and hide the Renderer again | Source call chain, uTools lifecycle evidence and Controller/App route regressions | Keep the reset, but serialize the explicit command behind tasks-only preflight; let `mainHide` alone own visibility | focused 141/141 and full verify 730/730; rebuilt cold-host acceptance pending |
