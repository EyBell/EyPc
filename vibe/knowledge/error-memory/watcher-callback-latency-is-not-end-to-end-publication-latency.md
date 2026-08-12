---
id: eypc-watcher-callback-latency-is-not-end-to-end-publication-latency
status: verified
scope: project
fingerprint: event-driven-state__watcher-callback-latency-used-as-ui-publication-slo__downstream-refresh-can-block-or-coalesce__measure-authority-event-through-controller-publish-on-one-monotonic-clock
first_seen: 2026-08-07
last_verified: 2026-08-12
review_after: 2027-02-07
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
  - preload/claude/index.cjs
  - preload/claude/code-sessions.cjs
  - preload/claude/unread.cjs
  - preload/index.js
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
  - host-stat-recovery
  - persisted-unread
  - authoritative-inventory
  - external-archive
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
- RAW-151 历史上证明同一错误也适用于 Codex：正常 Activity/rollout callback 很快并不能覆盖掉通知；当时以 1 秒 phase-only watchdog量到 Controller 发布。RAW-160 已把这个恢复 owner 迁移到进程 Host 的 native+StatWatcher 链，Renderer interval 不再是现行方案。
- RAW-154 再证明文件 membership mutation 也必须遵守同一边界：Claude App 手动归档或 EyPc D′ 写入的计时终点是 Controller 发布已移除该卡片的新原子任务包，不是 `fs.watch` 回调。精确文件 delta 和一秒索引 watchdog 只能检查已登记目标，且不能等待 quota、state、unread 或完整 inventory。
- RAW-159 首次把终点扩展到 package revision；RAW-160 进一步以 `companion-task-package-v4`、Main/Float/Navigation/Actions 独立 revision/selector cache 和 Float `applied` ACK 取代“Kernel no-op 或 snapshot-send 即完成”的假设。只量 callback、Controller、IPC send 或单个 Renderer 都不能证明角标、循环与 UI 一致；等价 observation 必须是全链零发布，Float 只有 applied 才算消费完成。
- membership-only 事件还可能没有任何“现有任务行”可修改：例如新 Codex 任务只携带 `inventoryChanged`。若 Host 以 `changed === false` 提前返回，watcher 已正确唤醒但专用库存重读从未排队；Renderer 隐藏时只能等恢复扫描。结构变化信号必须独立于现有行变更决定 reconciliation。
- RAW-160 的 Claude 真机时序进一步证明，连 watcher callback 都不能假设会准时发生：Hook 队列已写入，但 process Host 把首通知放在 50ms `setTimeout`、把恢复放在 1s Renderer/Preload `setInterval`；uTools `background-hidden` 节流使 running/completed 分别延迟约 45/93 秒。Consumer 真正开始后 Provider 处理约 5ms，Float 应用约 620ms，因此根因是 timer-owned wake，不是 Provider 计算、额度或筛选。
- 同一轮最终计时器审计发现状态修复后仍残留两条同构路径：Claude 成员文件先经短 timer，未读 LevelDB 也以 timer 合并/恢复。它们会让卡片加入/移除和已读角标在隐藏 Host 下再次漂移。当前四条文件 authority 均改为首次 native callback 同步处理；已登记目标用 1 秒 StatWatcher 恢复，部分 JSON 保留最后可信成员关系，同值指纹不通知。
- 随后的 Codex 真机证据暴露了另一条同构但更隐蔽的失败：原生状态文件已经包含完成未读，EyPc 却在十分钟以上没有收到新 activity，任务包停在旧 revision。Codex native unread 的目录 `fs.watch` 首读还排在 25ms timer 后，错误后只关闭；既无重建，也无 `watchFile/stat` 补漏。Renderer `phaseOnly` 轮询即使仍运行也明确不读取 persisted unread 或普通任务 latest Turn，因此事件漏失后 `reconcileLateUnread()` 和终态复核都不会启动。
- 当前 Codex 修复把 unread 与已登记 rollout decision 一并交给进程 Host：native callback 立即读取，per-file 1 秒 StatWatcher 补漏，目录 watcher error 后重建，原子 rename 受覆盖。persisted unread false→true 且任务仍 active 时强制同 key latest-Turn 复核；旧 exact active/turn-started 不能跳过，更新正向 evidence sequence 仍拒绝迟到 terminal。
- RAW-161 再次证明“归档 RPC 成功”与“EyPc 已消费成员变化”是两个终点：Codex Desktop 在自己的 App Server 连接上完成归档并移动文件时，EyPc 可能收不到 Desktop `thread-archived` 或自有 App Server `thread/archived` 通知。没有权威清单恢复时，Kernel 可无限保留旧成员。正确终点是进程 Host 完整对照 `thread/list archived:false/true` 后发布匿名 `archivedKeys`，并由同 revision 消费者移除卡片。

## Detection Order

1. 在写性能结论前声明产品起点和终点；当前状态同步应至少区分 authority event accepted → Kernel package publish → Main/Float applied same revision。
2. 所有阶段使用同一 monotonic clock，并区分 source wake、reader completion、merge、publish。
3. 主动阻塞一个无关 authority（例如 quota），验证目标 state lane 仍满足 SLO。
4. 用 watcher-shaped 事件通过真实 facade/Controller，而不是直接调用纯 reducer 后声称端到端。
5. 单独记录漏通知恢复窗口；watcher 正常 P95 不能证明 recovery deadline。

## Prevention Rule

- 任何“实时”“同步延迟”验收必须量到最终 consumer publish；source callback 只能命名为 wake latency。
- 任何长期 Host 文件 authority 的首个语义状态变化不得经过 `setTimeout/setInterval`。进程 Host 应在 Node native file callback 立即 drain/read；每个已登记文件用 `fs.watchFile`/等价原生 watcher补漏，目录 watcher 报错必须有可观测重建。Renderer interval 不能作为恢复权威。
- 测试至少包含 100 次转换、无关 I/O 阻塞、一次丢通知恢复和零重复 publish/bucket。
- 原子包产品还必须断言任务、卡片分组、角标、attention 与循环目标没有混合 revision；Main 与 Float 的应用延迟应分开记录，不能由同进程 publish 时间代替。
- 对 membership delta 分别覆盖“已有行变化”和“只有库存变化、没有匹配行”两类事件；后者也必须启动任务专用重读，不能依赖 Renderer 或完整业务刷新补救。
- 对可由其它客户端修改的归档成员关系，push 只能作为快路。Host 必须监听精确未归档/归档 membership roots，并以完整双清单对照作为恢复 authority；已确认 archived 的 key 直接发送 tombstone，dirty exact-read recovery 必须先减去 archived inventory。插件进入、连接重建和 watcher 重建均执行一次 provider-scoped 对账。
- 探针输出字段必须显式标注 `endToEndPublicationMeasuredHere`; 为 false 时不得参与 UI SLO 结论。

## Alternative Route

Status: `verified`

Preconditions:

- 状态 Bridge 能发布独立 delta，并携带 generation/source/freshness/compatibility。
- Controller 有可观察 publish hook，测试能冻结 quota promise。

Ordered steps:

1. 让 process-lifetime state、membership、unread 与 rollout watcher 在首个 native file callback 立即读取/发布各自 delta；用 Node StatWatcher 承担已登记目标的一秒漏通知恢复，并在目录 watcher error 后自动重建。
2. Controller 在 state lane 内应用单调 evidence/generation 后立即 publish。
3. 同时让 quota promise 保持 pending，执行 100 次 state transition。
4. 计算 event acceptance→publish 的 monotonic P95，并断言 inventory/quota 不被目标事件重读。
5. 抑制一次 watcher wake，由 1 秒 recovery 恢复，断言总时限 `<=1.25s`。

Verification:

- [Claude Controller regression](../../../tests/runtime/claudeCompanionController.test.ts#L1) 验证 quota/full inventory 不阻塞状态；[Claude Bridge regression](../../../tests/platform/claudeBridge.test.ts#L1)、[unread regression](../../../tests/platform/claudeUnreadBridge.test.ts#L1) 与 [watcher E2E](../../../tests/runtime/claudeCompanionWatcherE2E.test.ts#L1) 覆盖多订阅、动态目录、singleflight 和最终发布；[Codex Bridge regression](../../../tests/platform/codexAppServerBridge.test.ts#L1) 覆盖 exact interrupted、同代次独立 lane 与 membership-only 恢复。[runtime diagnostics regression](../../../tests/platform/runtimeDiagnostics.test.ts#L1) 证明日志只保留脱敏端到端耗时/结果。

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
| 2026-08-09 | RAW-154 unified package rework | 卡片列表正确但 previous/next 无反应，且 Cloud 状态变化仍有体感延迟 | 分别量 watcher/Controller/Float，允许角标和循环缓存用不同 revision | 当时以 V1 package 建立同 revision 终点；其共享 lane generation/首键等待已由 RAW-155 V2 取代 | historical automated baseline；real uTools pending |
| 2026-08-09 | RAW-154 membership-only Host reconciliation | 新 Codex 任务事件到达但当前包没有对应行，隐藏 Renderer 时新任务可能延迟加入 | `changed === false` 提前返回并漏掉 `inventoryChanged` 专用重读 | 真实 App Server Preload + process Kernel，无 Renderer，发送仅结构变化事件 | Host 无条件按 membership 信号排队 tasks-only reconciliation；最终 12 文件 485/485 | automated-verified / host-pending |
| 2026-08-10 | RAW-155 end-to-end lane publication | Claude callback 已发生但 running→completed-unread 未展示；前后任务第一下仍慢 | 单 callback/共享 generation/固定首键等待只测 wake 或最终尾目标 | event → V2 touched lane → same package revision → Main/Float；navigation leading dispatch；JSONL 记录端到端耗时/缓存/结果 | focused automated verified；installed-host P95 pending |
| 2026-08-12 | RAW-160 hidden Host timer regression | Hook 已及时写队列，但隐藏 uTools Host 约 45 秒后才 running、约 93 秒后才 completed；同类审计又发现 membership/unread timer | 首变化经 timer，漏通知依赖 Renderer interval；旧 App 版本门禁同时关闭独立日志通道 | Hook/App-log/membership/unread 首 native callback 同步处理；已登记目标 1s `fs.watchFile` recovery；部分 JSON 保留、同值不通知；适配 1.28929.0 固定语法；Host→Kernel→Float applied 测试 | focused gate passed；normal ≤250ms，drop recovery ≤1.25s；final full gate recorded in RAW-160 verify |
| 2026-08-12 | RAW-160 Codex completed-unread recovery | 原生状态已完成未读，Host 十分钟以上无新 activity，卡片仍进行中且包 revision 不变 | `fs.watch` 可丢失/失效且首读经 timer；error 关闭不重建；Renderer phase-only poll 排除 unread/latest Turn | Host immediate read + 1s per-file StatWatcher + error rebuild/atomic rename；unread true 强制同 key Turn 复核 | core 221、expanded 433、full 1328 passed；current-identity dev reload pending |
| 2026-08-12 | RAW-161 Codex external archive membership | Desktop 原生 `thread/archive` 与文件移动成功，但 EyPc 未收到兼容广播，Kernel 总数与 archivedCount 不变 | 把两个可能丢失的 archive push 当成成员恢复权威；dirty recovery 还可能把 archived 线程读回 | exact sessions/archived roots + 1s StatWatcher → full archived:false/true compare → urgent anonymous `archivedKeys`；dirty recovery subtracts archived；local indeterminate suppression remains transaction-scoped | focused 5/5（4 new + local transaction guard）、affected Bridge 131/131、type/build/mirror/runtime passed；current-identity host acceptance pending |
