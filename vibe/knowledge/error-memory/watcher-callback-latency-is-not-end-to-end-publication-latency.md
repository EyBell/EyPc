---
id: eypc-watcher-callback-latency-is-not-end-to-end-publication-latency
status: verified
scope: project
fingerprint: event-driven-state__watcher-callback-latency-used-as-ui-publication-slo__downstream-refresh-can-block-or-coalesce__measure-authority-event-through-controller-publish-on-one-monotonic-clock
first_seen: 2026-08-07
last_verified: 2026-08-09
review_after: 2027-02-07
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
  - preload/claude/index.cjs
  - src/runtime/codexController.ts
  - tests/runtime/claudeCompanionController.test.ts
  - scripts/probe-claude-code-runtime.mjs
  - tests/platform/codexAppServerBridge.test.ts
  - tests/runtime/codexController.test.ts
tags:
  - claude-companion
  - watcher
  - latency
  - controller
  - verification
  - codex-companion
  - phase-only-watchdog
---

# Watcher Callback Latency Is Not End-to-End Publication Latency

## Symptom

Claude watcher 在 100 次本地事件中很快唤醒，于是旧验收把 append→callback P95 当成“状态已快速同步到卡片”。但 callback 后仍可能进入库存、LevelDB 和额度网络的整轮刷新；最坏情况下额度请求可再阻塞数秒。没有异常文本，错误表现是指标绿色而用户界面仍明显滞后。

## Wrong Assumption

把 source wake 当成 consumer outcome：只要 `fs.watch` 回调及时，就假定 reducer、Controller merge、互斥投影和 Renderer publish 也及时完成。该假设遗漏了 callback 之后的 await、coalescing、全量 I/O、generation barrier 和 publish。

## Verified Root Cause

- 旧 watcher 统一唤醒全量 `refreshClaude()`；callback 只证明“发现了变化”，没有证明对应 authority 已发布。
- quota supplement 可有约 8 秒等待，且与 state refresh 串联；所以 callback 分布与最终 publish 分布没有可推导关系。
- 旧探针的计时终点在 watcher callback，而产品 SLO 的终点应是 Controller 向统一任务快照发出可观察 publish。
- RAW-151 证明同一错误也适用于 Codex：正常 Activity/rollout callback 很快并不能覆盖掉通知；恢复指标必须量到 1 秒 phase-only watchdog 接纳证据并完成 Controller 发布，且全过程不得触发完整库存读取。
- RAW-154 再证明文件 membership mutation 也必须遵守同一边界：Claude App 手动归档或 EyPc D′ 写入的计时终点是 Controller 发布已移除该卡片的新原子任务包，不是 `fs.watch` 回调。精确文件 delta 和一秒索引 watchdog 只能检查已登记目标，且不能等待 quota、state、unread 或完整 inventory。
- RAW-154 返工将终点进一步精确为 `companion-task-package-v1`：事件进入 Kernel 后，任务、分组、三个角标与 `cycleKeys` 必须以同一 revision 发布；随后 Main/Float 都应用该 revision。只量 Controller 回调、只量 package 生成，或只证明其中一个 Renderer 更新，都不能证明用户看到的卡片和快捷键目标已经一致。
- membership-only 事件还可能没有任何“现有任务行”可修改：例如新 Codex 任务只携带 `inventoryChanged`。若 Host 以 `changed === false` 提前返回，watcher 已正确唤醒但专用库存重读从未排队；Renderer 隐藏时只能等恢复扫描。结构变化信号必须独立于现有行变更决定 reconciliation。

## Detection Order

1. 在写性能结论前声明产品起点和终点；当前状态同步应至少区分 authority event accepted → Kernel package publish → Main/Float applied same revision。
2. 所有阶段使用同一 monotonic clock，并区分 source wake、reader completion、merge、publish。
3. 主动阻塞一个无关 authority（例如 quota），验证目标 state lane 仍满足 SLO。
4. 用 watcher-shaped 事件通过真实 facade/Controller，而不是直接调用纯 reducer 后声称端到端。
5. 单独记录漏通知恢复窗口；watcher 正常 P95 不能证明 recovery deadline。

## Prevention Rule

- 任何“实时”“同步延迟”验收必须量到最终 consumer publish；source callback 只能命名为 wake latency。
- 测试至少包含 100 次转换、无关 I/O 阻塞、一次丢通知恢复和零重复 publish/bucket。
- 原子包产品还必须断言任务、卡片分组、角标、attention 与循环目标没有混合 revision；Main 与 Float 的应用延迟应分开记录，不能由同进程 publish 时间代替。
- 对 membership delta 分别覆盖“已有行变化”和“只有库存变化、没有匹配行”两类事件；后者也必须启动任务专用重读，不能依赖 Renderer 或完整业务刷新补救。
- 探针输出字段必须显式标注 `endToEndPublicationMeasuredHere`; 为 false 时不得参与 UI SLO 结论。

## Alternative Route

Status: `verified`

Preconditions:

- 状态 Bridge 能发布独立 delta，并携带 generation/source/freshness/compatibility。
- Controller 有可观察 publish hook，测试能冻结 quota promise。

Ordered steps:

1. 让 state watcher 只读取/发布 state delta。
2. Controller 在 state lane 内应用单调 evidence/generation 后立即 publish。
3. 同时让 quota promise 保持 pending，执行 100 次 state transition。
4. 计算 event acceptance→publish 的 monotonic P95，并断言 inventory/quota 不被目标事件重读。
5. 抑制一次 watcher wake，由 1 秒 recovery 恢复，断言总时限 `<=1.25s`。

Verification:

- [Claude Controller regression](../../../tests/runtime/claudeCompanionController.test.ts#L1) 在 blocked quota 下通过状态转换门禁，并验证精确 archive/upsert/remove mutation 不等待完整库存；[Claude Bridge regression](../../../tests/platform/claudeBridge.test.ts#L1) 覆盖精确目标文件 callback 与一次丢通知的一秒索引恢复；[Codex Controller regression](../../../tests/runtime/codexController.test.ts#L1) 在 `taskRefreshSeconds=0/86400`、非 Codex Tab、隐藏 Float 与阻塞完整读取下量取 100 轮双向发布；[Codex Bridge regression](../../../tests/platform/codexAppServerBridge.test.ts#L1) 丢弃 rollout 文件通知后由 phase-only watchdog 恢复，且 inventory/unread 读取为零。[probe](../../../scripts/probe-claude-code-runtime.mjs#L1) 仅报告 watcher wake，并明确不把它标成端到端。

Fallback:

- 无法观测最终 publish 时，将性能状态记为 `not-measured`，不得用 callback、纯 reducer 或文件 mtime 代替。

Applicability boundary:

- 适用于 EyPc 事件驱动的 provider/Controller/UI 状态链；不把网络服务端确认或操作系统实际绘制时间自动纳入，除非产品 SLO 明确要求。

## Occurrence History

| Date | Task | Trigger | Failed route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-07 | Claude Companion authority reset | 用户观察状态同步仍慢并要求 Codex 同构通信 | 以 100 次 watcher callback P95 作为 UI publish P95 | old probe boundary + coupled refresh call chain | 重命名 source metric，新增 blocked-quota Controller E2E regression | verified |
| 2026-08-08 | Codex RAW-151 bidirectional waiting lane | 用户确认进入与退出待输入都慢，并允许该通路脱离用户库存频率 | 只验正常 callback 或 reducer，不验掉通知后的最终发布 | Activity/rollout callback drop + phase-only watchdog + Controller publish | 100 轮 P95≤250ms；单次掉通知≤1.25s；无完整库存读取 | automated-verified / host-pending |
| 2026-08-09 | RAW-154 Claude archive membership delta | 用户观察 Claude App 已归档后插件卡片仍慢，且旧插件归档只打开会话 | 把文件 watcher 当完成点，或等待完整库存 single-flight 才移除卡片 | exact indexed file event → Provider mutation delta → Controller atomic package；drop callback → 1s indexed watchdog | deterministic callback/drop/blocked-inventory contracts pass；real App manual archive and D′ canary pending |
| 2026-08-09 | RAW-154 unified package rework | 卡片列表正确但 previous/next 无反应，且 Cloud 状态变化仍有体感延迟 | 分别量 watcher/Controller/Float，允许角标和循环缓存用不同 revision | event → Kernel `companion-task-package-v1` → Main/Float same-revision application；无关 quota/environment/inventory/unread 阻塞 | 100-revision coherence、Main/Float ≤50ms 与热/冷聚焦合同通过；真实 uTools P95 pending |
| 2026-08-09 | RAW-154 membership-only Host reconciliation | 新 Codex 任务事件到达但当前包没有对应行，隐藏 Renderer 时新任务可能延迟加入 | `changed === false` 提前返回并漏掉 `inventoryChanged` 专用重读 | 真实 App Server Preload + process Kernel，无 Renderer，发送仅结构变化事件 | Host 无条件按 membership 信号排队 tasks-only reconciliation；最终 12 文件 485/485 | automated-verified / host-pending |
