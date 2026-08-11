---
id: eypc-independent-authorities-coupled-by-full-refresh
status: verified
scope: project
fingerprint: companion-materialized-view__independent-inventory-state-unread-quota-presence-authorities-coupled-by-one-full-refresh__slow-or-failed-source-blocks-or-erases-unrelated-state__split-lanes-with-authority-specific-failure-semantics
first_seen: 2026-08-07
last_verified: 2026-08-11
review_after: 2027-02-07
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
  - preload/claude/index.cjs
  - src/runtime/codexController.ts
  - tests/runtime/claudeCompanionController.test.ts
tags:
  - claude-companion
  - materialized-view
  - authority
  - cache
  - failure-isolation
---

# Independent Authorities Must Not Be Coupled By A Full Refresh

## Symptom

Claude 的新任务能出现，但历史状态、已完成未读和既有变更同步慢或错误；任一 watcher 事件都会重新读取库存、LevelDB 和额度。额度慢时状态跟着慢，库存瞬时失败时既有卡片可能被清空，未读失败又可能错误复用旧集合。

## Wrong Assumption

把“最终 UI 需要组合多个来源”误写成“每次变化必须重新读取所有来源”。原子投影需要在 merge/publish 边界一致，不等于所有 authority 要共享同一次 I/O、相同 freshness 或相同失败策略。

## Verified Root Cause

- inventory、phase、unread、quota 和 App presence 的变化频率、成本、身份和失败语义不同，却由同一个 refresh promise 串联。
- 网络 quota await 位于任务状态热路径，使无关网络延迟成为 phase latency 的上界。
- 全量 replacement 没有 authority-owned patch 规则，慢 inventory 可能覆盖更新 state，失败读取可能把最后有效 membership 当成空。
- 页面/打开动作重建缓存，快捷键又重复做窗口枚举，破坏 feature-lifetime 热路径。
- 即使 reader 已分 lane，最终任务包仍可用一个 Provider generation 同时推进 phase/unread，或让异步 callback 捕获旧整包后覆盖新 membership；单 callback 订阅还会让 Renderer 覆盖 Host listener。这些都是“逻辑层的全量替换”，效果与共享 full refresh 相同。

## Detection Order

1. 为每个字段声明唯一 authority、事件类型、freshness、generation 和 failure value。
2. 画出 watcher→reader→merge→publish 的 await graph；任一横跨无关 authority 的 await 都是风险点。
3. 为 membership、state patch、set membership、network snapshot 和 process presence 分别测试失败。
4. 制造慢旧 inventory 与快新 state 的竞态，断言 metadata 可 patch、phase 不回退。
5. 在页面切换、float 隐藏和连续快捷键下记录 reader 调用次数，确认缓存生命周期属于 feature/process 而非 surface。

## Prevention Rule

- 独立 authority 必须有独立 in-flight/pending lane；事件只更新自己拥有的 Map/Set/fields。
- 原子性放在单一 materialized projection/publish，不通过全量 I/O 获得。
- failure semantics 必须按 authority 固定：inventory 保留最后有效 membership；unread 清除确定性为 unknown；quota 只更新自身 diagnostic/retry；presence 失效只触发 open 冷复核。
- live phase 不持久化；重启从真实来源冷启动。快捷键冷启动只预热 tasks，不读取 quota。
- 每条来源的 generation 只在本 authority 内比较，跨层使用 Kernel package revision 与 Float applied revision；读取连续失败时按该 authority 的合同进入 verifying/unknown，不能把“保留最后稳定视图”误写成“永久保留活动态”或伪造终态。
- quota 自己处理启用/唤醒/网络/reset+1 秒唤醒、401/403 凭据变化、429 Retry-After 和其它退避；任何 quota timer 都不能进入 state/inventory 发布链。
- 任务 membership mutation 是第六条轻量 authority：精确 `archived/upsert/remove` delta 只更新已登记匿名任务并立即进入同一个 Kernel reducer/package；它不等待 inventory single-flight，也不得读取 quota/state/unread。完整 inventory 仍负责结构校对，不能成为已验证 mutation 的发布前置。
- 最终 Kernel/Package 也必须按 Provider 分离 membership/phase/unread generation，只推进实际触达 lane；异步结果提交前重取最新包。Bridge subscriber 使用集合多播，state/inventory/unread 的 Host 与 Renderer 不能互相覆盖；并发 unread 读取加入同一 Promise。

## Alternative Route

Status: `verified`

Preconditions:

- Bridge 可拆 inventory/state/unread/quota/App presence 端口。
- Kernel V4 是任务快照与消费者 selector 的唯一 materialized owner；Controller 只维护 Provider/显示元数据 lane 并接纳最新包。

Ordered steps:

1. 建立 feature-lifetime inventory Map、state evidence Map、unread Set/unknown、quota snapshot、presence cache 和 target-only mutation generation/tombstone。
2. 为各来源分别注册 watcher/read lane 和单飞；删除共享 full-refresh 回调。
3. inventory 只拥有结构校对/metadata，state 只 patch evidence/phase，unread 只 patch membership，quota/presence 不触碰 task fields；verified mutation 只 upsert/remove exact key 并阻止迟到完整库存复活它。
4. 应用 per-authority generation/evidence barrier、Kernel semantic/package revision 和 Float applied revision，再由 Kernel 一次计算互斥 cards/groups/counts/virtual projects/actions。
5. 测试 quota 阻塞、inventory 失败、state 连续失败降级、unread 失败、slow-inventory/new-state 竞态和旧 Float snapshot 拒绝；再测试 surface 隐藏/快捷键复用。

Verification:

- [Kernel implementation](../../../preload/companion/task-kernel.cjs#L1)、[Controller metadata/evidence join](../../../src/runtime/codexController.ts#L1) 和 [regressions](../../../tests/runtime/claudeCompanionController.test.ts#L1) 证明 quota pending 不阻塞 state/mutation publish、inventory 不被归档事件重读、slow inventory 不回退 state 或复活已移除卡片、多个 upsert 在同一 delta 中不互相丢失，失败语义彼此隔离且等价 selector 不重复发布。

Fallback:

- 某 authority 不能增量观察时，只给该 lane 使用有界 reconciliation；不得把它扩散成全 provider refresh。

Applicability boundary:

- 适用于 EyPc Companion 多来源物化视图。需要跨来源事务写一致性的业务必须另行设计事务边界，不能直接套用此只读状态规则。

## Occurrence History

| Date | Task | Trigger | Failed route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-07 | Claude Companion authority reset | 历史/未读/变更滞后，上一/下一任务缓慢 | 任一 watcher 调 inventory+unread+quota 整轮刷新 | controller call chain + 8s quota behavior | 五条独立热 lane、单调 patch、authority-specific failure | verified |
| 2026-08-07 | Claude quota/state/unread/project follow-up | 进行中不更新、周 reset 刷新错误、未读回跳、Claude 项目不进入项目投影 | authority 有 lane 但缺 source→Controller→Float 完整 revision、state failure retirement 与 quota 生命周期唤醒 | focused generation/revision/read-hint/filter regressions + live quota/state/unread probes | 补齐四条时钟、分层 revision、两轮失败 unknown、同 completion read hint 与虚拟项目投影 | automated/data-host verified; interactive UI pending |
| 2026-08-09 | RAW-154 Claude archive mutation convergence | Claude App 归档后卡片更新依赖慢完整库存，插件归档又被全局 latch/Provider 分支耦合 | 把已验证 membership mutation 当作 inventory refresh 的副作用，并让 quota/state/unread/full inventory 共享完成门槛 | 新增 target-only mutation generation/tombstone 与统一 Controller reducer；exact watcher/1s watchdog 独立发布 | focused mutation、blocked-promise、stale-inventory and multi-upsert tests pass；real host pending |
| 2026-08-10 | RAW-155 / Claude RAW-027 | Claude running→completed-unread 变化消失，延迟期间打开后再也看不到 | Provider 共享 phase/unread generation、Host/Renderer 单 callback 覆盖、异步 unread 持有旧整包 | V2 三 lane generation、多订阅、unread singleflight、latest-package rebase、trusted-push 零全量读取 | focused automated verified；real host pending |
| 2026-08-11 | RAW-160 V4 materialized owner | Claude terminal/new unread and navigation could diverge when Controller/consumers retained independent projections | Treat lane separation plus Controller revision as end-to-end convergence | Kernel V4 atomic reducer/latest cache、per-consumer selector cache、Float applied ACK and same-revision metadata rebase | affected/full automation verified；real host pending |
