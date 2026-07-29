# Codex Companion 真实会话与交互验证记录

Tool: codex
Date: 2026-07-29
Status: `reported-unverified-awaiting-user-acceptance`
Requirement version: `2026-07-29.5`

## RAW-113 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 用户反馈与只读复现 | pass / diagnostic only | 真实浮窗只剩额度读数，三个任务角标与任务状态面全部消失；源码存在 Controller `preload-version-mismatch` 空投影和 Float revision 空投影两条独立清空路径。该观察证明回归与根因，不替代修复后验收。 |
| 原子任务状态包 | implemented / source-reviewed | [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 一次封装稳定会话、互斥动态组、三个紧凑数量、下一次 6 小时边界、revision 与兼容提示；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 只保留内部原始证据快照与唯一 `taskState` 展示包，不再维护并行 `conversations` 展示变量，并让 view/float/actions/cycle 消费同一实例。顶层兼容别名指向包内同一对象且不参与计算。 |
| mixed-version 保留 | implemented / source-reviewed | legacy/future revision 不再清 receipt/hold/baseline、阻断库存/Activity Delta 或发布错误空态；只将包标记 `degraded`。缺包的旧 Controller 快照由唯一领域归一函数一次转换，保留其中仍存在的任务。 |
| Renderer 单向消费 | implemented / source-reviewed | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 已删除 revision 二次清空、独立动态投影和一分钟 clock；[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 设置预览与任务诊断读取 `taskState`；Controller 既有调度 timer 负责包内时间边界。 |
| 回归合同 | updated / not run | 既有 domain/Controller/UI 文件增加原子同源、legacy 保留、角标/卡片/设置预览合同。依用户保留的验收边界，本轮不运行 tests、typecheck、build、uTools 或真实任务操作。 |
| 静态收口 | pass / targeted scope | Renderer/Controller 旧清空与重复投影残留扫描为零；Controller 并行展示变量扫描为零；`preload/index.js` 与 `public/preload.js` 字节一致；限定代码/测试/文档及 CodeNote 派生文件的 `git diff --check` 通过；项目与 CodeNote Markdown 引用审计通过。 |
| 文档与记忆 | updated / historical receipt | RAW/spec/plan/tasks/verify/handoff、产品需求、项目当前态、架构、技术手册、帮助、既有 preload version-skew 错误记忆与 CodeNote 派生理解在 RAW-113 阶段同步为 `2026-07-29.4`；该阶段凭据仅记录当时边界，RAW-114/115 以本文件后续修订及新凭据为准。 |

结论：RAW-113 源码与合同为 `reported`；正常重载后任务面是否整体恢复、当前/降级包是否保留同数以及真实新增/完成切换仍为 `未校验，待用户验收`。

## RAW-112 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 用户现象复现 | pass / read-only debug | 授权的 Computer Use 展开真实浮窗后，紧凑角标与“正在进行中”段同时为 3；当前源码匿名预检也得到三条 `desktop-live active`，所以 RAW-108 同源计数未再次分叉。未记录 raw thread ID、路径或正文。 |
| 根因证据 | pass / read-only source correlation | 三条匿名任务的最新 Turn 均为 `interrupted`、无 waiting flags，但 fresh follow snapshot 每次都把它们声明为 active，且三个 `desktopActiveSince` 在同轮订阅中于约 80ms 内一起重建。首个订阅 snapshot 被误当作新 active transition，解释了“旧两条 + 本次真实任务 = 三条”。 |
| 有界 snapshot 佐证 | implemented / source-reviewed | [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 为 shadow 记录 session-only `activityRevision`。active/no-waiting snapshot 与已知 terminal Turn 冲突时继续先发布 active，并复用既有 3 秒 `[0,300,1000]` 定向读取；只有同一 shadow/父映射和 activity revision 未变化、最终成功读取仍 terminal 时才抑制该 snapshot active并发布 idle + targeted terminal。 |
| 抖动与恢复边界 | preserved / source-reviewed | runtime/request patch 会推进 activity revision 并解除抑制；waiting request、新 inProgress Turn、映射/revision 变化或读取失败都会阻止 terminal 收敛。完整 `turn/started` 恢复真实 active interval，且不会重新安排一次多余 latest-Turn RPC。50ms 结构合并、missing-key 隔离、Controller hold、普通完成窗和 bridge 异常保守 ongoing 均未删除。 |
| 版本门禁 | implemented / source-reviewed | `CODEX_TASK_STATE_REVISION` 由 `task-state-v1` 提升为 `task-state-v2`，Preload/public/domain/test literal 同步；旧 v1 运行链路继续按 RAW-111 隐藏任务投影并要求正常重载，额度/config 不受影响。 |
| 测试合同 | updated / not run | 既有 [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 增加 terminal interrupted + active snapshot 在三次定向读取后收敛、真实新 started Turn 立即恢复且不增加 RPC 的合同；未新增测试模块。依授权未执行 tests、typecheck、build、uTools 或真实 Codex 任务。 |
| 静态核验 | pass | preload/public 镜像一致；旧 `task-state-v1` 代码残留为空；限定范围 `git diff --check` 与 Markdown code-link audit 通过。 |
| 当前运行态 | not accepted | 只读联调用于定位而非验收；运行中的 uTools 尚未由 Agent 自动重启或完成 v2 真实转换验收。需正常重载 EyPc 后观察旧 terminal 任务在有界核验后一次离开进行中，再用可丢弃任务确认 started/completed 快路。 |

结论：RAW-112 已完成源码、测试合同和授权范围内的静态收口，状态为 `reported`；重载后的真实角标、停止/完成和新 Turn 恢复仍为 `未校验，待用户验收`。

## RAW-111 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 运行实例根因 | pass / read-only debug | 授权的 Computer Use 展开浮窗后，角标与“正在进行中”段都为 5，说明 RAW-108 同源投影本身未分叉；同一时刻官方线程只读状态中只有当前任务 active，所列多条旧任务最新 Turn 已 completed，本机当前源码匿名预检为 `ongoing=1 / active=1`。运行进程启动时间早于当前 preload 文件，且浮窗 DevTools 显示 Vite 连接已丢失，证实运行实例仍消费旧 Preload/主 Controller。 |
| Preload/Controller 门禁 | superseded / corrected by RAW-113 | revision 传递与 `legacy` 归一仍保留；不匹配时发布零任务 `preload-version-mismatch`、停止 task/activity lane 的实现已被真实“所有状态消失”反馈否定并删除。当前合同见本文件 RAW-113 原子包与 mixed-version 保留表。 |
| 旧主 Controller 浮窗门禁 | superseded / corrected by RAW-113 | Float 二次 revision 空投影导致双重清空，已删除。旧快照只通过领域 normalizer 一次构造降级包并保留其中仍存在的任务；设置页与浮窗读取同一包。 |
| 抖动/隐私/生命周期 | preserved / source-reviewed | 未新增 timer/debounce，未改 Activity Delta、Projection V3、50ms 合并、3 秒 `[0,300,1000]` 核验、缺失隔离、完成 hold、动作、存储或迁移。revision 不含任务身份或状态。插件不会自动 kill/restart uTools；需用户正常重载。 |
| 测试合同 | superseded / replaced by RAW-113 contract | legacy 归一与 revision 透传继续；任务 lane 拒绝和旧 Controller 角标抑制断言已改为原子包降级保留。依授权仍未执行 tests、typecheck、build 或 uTools 验收。 |
| 静态收口 | historical pass / behavior superseded | RAW-111 当时的 revision/mirror/link 静态检查保留为历史证据，但不能证明空投影产品行为正确；RAW-113 已执行新的包消费与空投影残留检查。 |
| 当前运行态 | not accepted | 当前源码预检的 1 与运行浮窗的 5 已形成根因证据，但旧运行实例未由 Agent 重启，真实浮窗尚未消费本次修复。Computer Use 调试过程中浮窗被显式 toggle 为隐藏；用户需通过原有 EyPc/uTools 显示入口恢复并重载插件后验收。 |

结论：RAW-111 的 mixed-version 根因和 revision 元数据继续有效，首版空投影实现已被 RAW-113 重做；真实角标与状态切换仍为 `未校验，待用户验收`。

## RAW-110 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因与偏好边界 | pass / read-only | 源码与生成 schema 确认 `thread/started` 的 ID 位于 `params.thread.id`，旧 handler 只读顶层 `params.threadId`，导致新任务事件没有 dirty target、事件校对重读全部 latest Turn；已登记任务的 `turn/started` / `turn/completed` 又会丢弃完整 `params.turn`。领域默认值实际为 0ms，但设置页旧标签把 1500ms 标成默认。已有持久化值来源不可区分，未做静默迁移。 |
| 新任务单读 | implemented / source-reviewed | `thread/started` 现在仅在 preload 解析嵌套 raw ID 并标脏该任务；完整库存仍验证项目归属/匿名身份/action alias，但事件 Turn 读取复用其它会话期缓存，只为新增任务发一次 `limit=1` status-only RPC。 |
| 强 Turn 直发 | implemented / source-reviewed | [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 对已登记任务只接受完整且单调更新的 inProgress + startedAt，或 completed + startedAt + completedAt；前者立即更新匿名进行中，后者按当前 Turn/active interval 核验后发布脱敏 `targeted-after-exit`。两者更新 session cache 并取消同任务不再需要的 retry。 |
| 抖动与异常回退 | preserved / source-reviewed | 缺失/畸形/旧通知、未知任务、failed/interrupted 继续标脏并走 50ms urgent 校对；已知 active 仍可执行 3 秒 `[0,300,1000]` 定向 latest-Turn；等待输入/审批优先，raw ID/items/body/error 不跨 preload。Controller hold、缺失隔离、旧 terminal、单调合并和 Renderer 同源投影未放宽。 |
| 设置与迁移 | implemented / source-reviewed | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 将 0ms 标为“不等待（默认）”，1500ms 保留为普通选项；领域默认、选项集合、已有持久化值、存储结构和迁移均未修改。 |
| 测试合同 | updated / not run | 既有 [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 增加嵌套 thread/started ID 只重读新增任务，以及完整 started/completed 立即匿名发布、无额外 latest-Turn RPC、私有 ID/items/path/body 不越界合同；原畸形通知 urgent 回退合同保留。依授权未执行 tests、typecheck、build、uTools 或真实 Codex 操作。 |
| 错误记忆 | reused / no new record | 复用 [codex-completion-transition-hysteresis](../../../../vibe/knowledge/error-memory/codex-completion-transition-hysteresis.md#L1) 与 [codex-fixed-debounce-delays-terminal-confirmation](../../../../vibe/knowledge/error-memory/codex-fixed-debounce-delays-terminal-confirmation.md#L1) 的正向证据/固定延迟边界；本轮是同类延迟的净增量修复，不创建重复错误记忆。 |
| 限定静态验证 | pass | RAW-110 hunk review 确认 direct started/completed 与 unknown/invalid fallback 同时存在且未增加 Renderer timer；canonical/public preload 整体镜像一致，两个 helper 各仅一份，旧 1.5 秒默认标签与私有同步宿主 IPC 残留为零。EyPc 与 CodeNote `git diff --check` 通过，两仓本轮 Markdown 代码链接审计通过；并行 Environment Action、Window Jump 与其它脏写集均保留，不纳入本轮接纳结论。 |

结论：RAW-110 已完成源码、既有测试合同与限定静态收口；真实冷启动新任务、已登记任务 Turn 直发、完成回退与 uTools 数量切换仍为 `reported / 未校验，待用户验收`。

## RAW-109 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 个案与根因 | pass / read-only | 所指任务不是 Codex 原生置顶，底层仍因不确定终态证据保守投影为 ongoing；[codexController.ts](../../../../src/runtime/codexController.ts#L1) 的旧循环直接筛选完整 ongoing 桶，所以任务超过六小时、已离开动态卡片/角标后仍可被前后动作打开。用户随后手动归档只处理该个案。 |
| 普通候选同源 | implemented / source-reviewed | `cycleTasks` 现在依次消费完整 `inputRequired` 与 `projectCodexDynamicStatus(conversations).groups.active`；后者与动态卡片/进行中角标共享最近六小时、非隐藏、`active / waiting-approval / ongoing` 资格。completed-unread 继续只走独立首条动作。 |
| 明确置顶例外 | unchanged / source-reviewed | 普通候选为空时仍只回退 `pinSource='local' && bucket !== 'stopped'` 的当前可打开任务；这是 EyPc 本地明确置顶例外，允许旧/隐藏任务，Codex 原生置顶不参与。 |
| 抖动与协议边界 | unchanged / source-reviewed | 动作触发时从当前 Controller 稳定快照调用同一无状态纯函数；未新增候选缓存、timer 或 debounce，未修改 Preload/Controller 状态协议、完成展示窗、持久化或迁移。 |
| 测试合同 | updated / not run | 既有 Controller 测试新增“超过六小时的保守 ongoing 不参与普通循环，本地置顶后才作为空池回退”，并把受六小时边界影响的旧 fixture 改为相对当前时间；依授权不执行 tests、typecheck、build 或 uTools。 |
| 限定静态验证 | pass | 范围差异确认 RAW-109 生产代码只改 Controller 候选消费；旧 `tasks.filter(task.bucket === 'ongoing')` 动作筛选残留为零；EyPc 与 CodeNote `git diff --check` 通过；两仓本轮 Markdown 代码链接审计通过。并行的 `src/styles/float.css` 修改仍不属于本轮写集，已保留且未改写。 |

结论：RAW-109 已完成源码、既有测试合同与限定静态收口；真实快捷键行为仍为 `reported / 未校验，待用户验收`。

## RAW-108 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 同源展示投影 | implemented / source-reviewed | [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) 新增无状态 `projectCodexDynamicStatus`，只消费 Controller 稳定快照与当前时间，一次生成最近 6 小时、非隐藏的五个互斥状态段、动态总数和 `{ input, active, unread }`。 |
| 状态与数量合同 | implemented / source-reviewed | waiting-input 只进入 input；`active / waiting-approval / ongoing` 同时进入 active；stopped 立即退出；input/unread 保留含隐藏任务的完整集合。active 数严格等于未搜索时“正在进行中”卡片数，隐藏与超过 6 小时任务不计。 |
| 消费者收敛 | implemented / source-reviewed | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 的动态 Tab、状态段、三个角标、提示与主水球 ARIA 共用投影；[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 设置预览复用同一数量，补回保守 ongoing。进行中点击仍只展开。 |
| 抖动边界 | unchanged / source-reviewed | Renderer 未新增 timer/debounce；Preload 的字段白名单、3 秒 `[0,300,1000]` Turn 核验、50ms 合并/补读和 Controller 的 active-exit/旧 terminal/单调证据/缺失隔离/完成 hold/targeted 强证据均未修改。 |
| 测试合同 | updated / not run | 既有 domain/Controller/UI 测试文件增加 active→ongoing→active、targeted completion、6 小时/隐藏/互斥、预览一致、数量化 ARIA 和只展开断言；依用户授权不执行 tests、typecheck、build 或 uTools。 |
| 限定静态验证 | pass | 范围差异确认 RAW-108 增量生产代码只改共享投影及两个 Renderer 消费者，Controller/Preload/协议/设置当时均无改动；Renderer 旧窗口/隐藏/全量计数筛选残留为零；EyPc 与 CodeNote `git diff --check` 通过；`document-code-link-audit` 对该增量 Markdown 文档全部通过。并行出现的 `src/styles/float.css` 修改不属于该增量写集，已保留且未改写。 |
| 真实宿主验收 | not run / user-owned | 只读 Computer Use 观察不能单独证明毫秒抖动；需用户后续验收卡片/角标同步、搜索不改角标及真实状态切换。 |

结论：RAW-108 已按“通信/Controller 稳定一次，Renderer 同源派生”实现；当前为 `reported / 未校验，待用户验收`。

## RAW-106 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 停止态排除 | implemented / source-verified | [codexController.ts](../../../../src/runtime/codexController.ts#L1359) 仅将 `pinSource='local' && bucket !== 'stopped'` 的本地置顶任务作为常规循环为空时的回退候选；常规候选本身也不包含 `stopped`。 |
| 自动化与宿主验收 | not run / user-owned | 项目规则禁止本轮新增或运行测试、typecheck、build、uTools、截图及真实 Codex 操作。需确认已停止且本地置顶的任务不会通过前/后任务快捷键打开。 |

结论：RAW-106 已实现，当前状态为 `未校验，待用户验收`。

## RAW-105 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 回退候选 | refined by RAW-109 / source-verified | [codexController.ts](../../../../src/runtime/codexController.ts#L1) 在当前普通 `inputRequired → recent active` 序列没有可打开任务时，改用当前投影中非 `stopped` 的 `pinSource='local'` 任务；原生置顶未纳入，完成未读保留独立动作。 |
| 顺序与起点 | implemented / source-verified | 回退继续经过既有 `displayOrderedTasks` 与 alias/key 门禁，因此遵从本地置顶稳定显示顺序、去重和可打开边界；无循环游标时，next 取第一项、previous 取末项。 |
| 状态边界 | implemented / source-verified | 回退复用 `cycleTask` 的既有 `openThread` 路径，不确认 completed-unread、不写 receipt、不改变隐藏/页签或 Codex Desktop 状态。 |
| 自动化与宿主验收 | not run / user-owned | 项目规则禁止本轮新增或运行测试、typecheck、build、uTools、截图及真实 Codex 操作。需在没有常规循环候选、但至少有一个 EyPc 本地置顶任务时确认 next 首次打开第一项、previous 首次打开末项，后续回绕。 |

结论：RAW-105 已实现，当前状态为 `未校验，待用户验收`。

## RAW-104 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 问题 | pass / user | 任务已完成但「已完成未读」很久才出现；完成证据有时也偏晚。 |
| 根因 | pass / source-trace | 运行中残留的 live `hasUnreadTurn=false` 在 targeted 完成后仍压过 Codex 持久化未读；假 active 时 verify 又要求 `lastTurnStatus===completed`，完成核验被拖到完整库存。 |
| 完成+未读快路径 | implemented / source-verified | `publishTargetedCompletion` 清掉完成前 live false，立即读持久化未读；3 秒内 `[0,300,1000]` 重试；不发明未读；完成后的显式 live false 不被重试清掉。 |
| 完成核验 | implemented / source-verified | `verifyStaleActive` 允许 active+无 waiting 时核对 latest Turn（含 active 进入瞬间与 `turn/completed`）；不再要求基线已是 completed。 |
| 镜像 | pass / static | `preload/index.js` 与 `public/preload.js` 行为镜像；`node --check` 通过。 |
| 真实宿主验收 | not run / user-owned | 需重载 uTools preload 后，新完成任务应随完成进入「已完成未读」，而不是等下一次完整校对。 |

结论：完成未读与完成证据共用 targeted 快路径。当前状态为 `未校验，待用户验收`。

## RAW-103 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 需求 | pass / user | 明确停止的任务允许真实归档，不再因“未完成”阻断。 |
| 投影 | implemented / source-verified | `explicitlyStopped` 任务 `archiveCapability=allowed`、`canArchive=true`；`revisionAt` 使用 `lastTurnStartedAt` 作为停止版本。 |
| Host 校验 | implemented / source-verified | `evidence: 'stopped'` 接受 latest Turn `failed/interrupted`；仍拒绝 Desktop/runtime `active` 与 `inProgress`。`interrupted` 不再被误判为进行中阻断。 |
| UI | implemented / source-verified | 停止任务「归」槽可点；提示改为可归档；无可归档时文案含已停止。 |
| 真实宿主验收 | not run / user-owned | 需对一条已停止任务执行归档并确认 Codex 侧栏消失。 |

结论：已停止任务可走与已完成相同的真实归档路径。当前状态为 `未校验，待用户验收`。

## RAW-102 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因 | pass / source-trace | 点击/聚焦会短暂清掉 Desktop active，随后又用新的 `desktopActiveSince` 把 active 拉回；若 latest Turn 仍是已完成，新 interval 会盖过完成证据，造成“进行中消失→又出现”。 |
| 假复活过滤 | implemented / source-verified | 领域/Controller：latest Turn 已 `completed` 且无待输入/审批时，若 active interval 不早于该完成（含 remint 到 completedAt 之后），视为被完成证据取代，不再投影为进行中。 |
| 在途核验 | implemented / source-verified | preload 在 `active + completed` 且无 waiting flags 时启动 `verifyStaleActive` latest-Turn 核对：确认仍是 completed 则发完成证据；若发现更新的 `inProgress` 则恢复真实进行中。 |
| 测试合同 | updated / not run | 领域增加 reminted active 被完成取代、waiting-input 仍保留的合同。 |
| 真实宿主验收 | not run / user-owned | 需重载 preload 后点开假进行中任务，确认不再反复复活。 |

结论：完成后的 Desktop active remint 不再把任务拉回进行中；真实新 Turn 仍可通过 inProgress 核验恢复。当前状态为 `未校验，待用户验收`。

## RAW-101 当前交付状态（展示口径由 RAW-108 纠正）

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 历史漂移 | superseded / source-trace | 此处曾把“exact live 决定权威活动”误写为“只有 exact live 才可显示/计数”，并从状态段排除保守 `ongoing`；这会在 active 退出核验、短暂断连和旧 terminal 防闪期间丢失卡片连续性。 |
| RAW-108 分段对齐 | implemented / source-reviewed | 「正在进行中」统一保留最近 6 小时、非隐藏的 `active / waiting-approval / ongoing`；waiting-input 只在待输入，明确 stopped 立即离开。 |
| 动态口径 | implemented / source-reviewed | 动态总数、五个状态段和 active 角标从同一纯投影生成；搜索只过滤展开行，不改变未搜索投影数量。 |
| 预览一致 | implemented / source-reviewed | 浮窗与配置预览使用同一个 `compactCounts.active`，不再分别维护 live-only 与 ongoing-inclusive 过滤。 |
| 真实宿主验收 | not run / user-owned | 需确认 active→ongoing→active 抖动中卡片和角标始终同步保留；明确 stopped/完成证据到达后两者一次切换。 |

结论：exact live 只决定权威活动，保守 ongoing 负责暂态连续；卡片与角标共用同一展示口径。当前状态为 `未校验，待用户验收`。

## RAW-100 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 完成快路径 | implemented / source-verified | active 退出时若已有权威 `completed` 证据（含 Turn 缓存/RPC 结果且 `completedAt` 晚于 active interval），Controller 不再压回 `inProgress`，并立即绕过展示 hold。默认 `completionPresentationDelayMs` 改为 `0`。 |
| 异常过滤 | implemented / source-verified | `failed/interrupted` 仍须 exact live idle 或 bridge `not-running` 才进入已停止；撤销 RAW-099 的 connected 即停规则，避免异常态被过快投影。 |
| 角标语义 | refined by RAW-108 / source-reviewed | `runningCount` 可继续表达领域兼容聚合，但紧凑角标不再直接消费它；角标取最近 6 小时、非隐藏的 `active / waiting-approval / ongoing` 展示段长度，与卡片同源。 |
| 测试合同 | updated / not run | 领域/UI 合同已同步；依项目规则未执行。 |
| 真实宿主验收 | not run / user-owned | 需重载 preload 后验证：完成应几乎即时切换；异常不应误计为进行中。 |

结论：完成快路与当前展示延迟设置保持不变；exact active 保留权威含义，保守 ongoing 继续进入同源进行中卡片与角标。当前状态为 `未校验，待用户验收`。

## RAW-099 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因 | pass / source-trace | Desktop live 已连接时，非 live-active 的 `failed/interrupted` 或无 Turn 结果仍被保守投影为 `ongoing`，导致真实只有 1 条 active 时角标/列表却显示 2 条进行中。 |
| 稳定收敛 | implemented / source-verified | `isExplicitlyStoppedTask`：live-active 永远优先；`completed` 走完成路径；`inProgress` 仍可短暂 ongoing（等首个 live shadow）。其余在 `desktop-live idle`、bridge `not-running`，或 bridge `connected` 时立即落到 `stopped`。 |
| 防抖边界 | implemented / source-verified | bridge `failed/connecting/not-checked` 时仍保持旧保守 ongoing，避免传输抖动误停。Controller active→idle 防闪仍可把未确认终态压回 `inProgress`，确认后再一次切换。 |
| 测试合同 | updated / not run | [codex.test.ts](../../../../tests/domain/codex.test.ts#L1) 增加 connected 下非 active 终态立即 stopped、保留 inProgress 短暂 ongoing、failed bridge 仍保守的合同。依项目规则未执行。 |
| 真实宿主验收 | not run / user-owned | 需确认 Desktop 已连接且只有 1 条真实进行中时，EyPc 进行中计数也为 1；已结束非 completed 项进入“已停止”。 |

结论：exact live-active 决定权威活动；未满足明确停止/完成证据的任务仍以保守 ongoing 保持进行中，Desktop 已连接时只把已确认非 active 终态稳住为已停止。当前状态为 `未校验，待用户验收`。

## RAW-098 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因 | pass / source-trace | 单条归档的 `await archiveThread()` 是异步的；归档期间 Desktop 可能因 conversation state 变化（stream following-changed 或 patch）重新投影该任务，而 structural refresh 重读时该任务也可能尚未从 App Server 库存消失，导致 UI 出现"归档→复活→消失"的抖动。 |
| 乐观隐藏 | implemented / source-verified | Controller 在 `archive()` 发起时立即将该 key 从 `lastThreads` 移除并发布投影，同时将其加入 `archivingKeys` 集合。UI 在归档启动后即不显示该任务。 |
| structural refresh 防护 | implemented / source-verified | 完整库存重建时过滤掉 `archivingKeys` 中的任务，防止 App Server 尚未更新时该任务被加回投影。 |
| 失败恢复 | implemented / source-verified | 归档失败时从 `archivingKeys` 移除，将保存的 optimistic thread 恢复到 `lastThreads`，重新发布投影。 |
| 测试合同 | updated / not run | [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 新增乐观隐藏合同：归档发起后任务立即从投影消失，归档完成后仍不存在。依项目规则未执行。 |
| 限定静态验证 | pass / source-only | Controller 语法通过，`git diff --check` 通过。 |
| 真实宿主验收 | not run / user-owned | 需重载 uTools 插件后归档一条已完成任务，确认无抖动。 |

结论：归档现在采用乐观隐藏策略，发起时立即移除、失败时恢复。中间不会因 Desktop 事件或库存重读产生可见抖动。当前状态为 `未校验，待用户验收`。

## RAW-097 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因 | pass / source-trace | `thread-read-state-changed` 与仅 `hasUnreadTurn` 的 patch 之前把完整当前 activity entry 再次发给 Controller；已读事件因此可能携带残留 status/flags，并把已完成任务重投影为进行中。 |
| unread-only 边界 | implemented / source-verified | preload 为上述两类事件发出 `readStateOnly`：只带匿名 key、`hasUnreadTurn` 与 `unreadAuthority`。主任务和 Side Chat 聚合均适用；包含 runtime/request 的 patch 仍保留完整 activity 语义。 |
| Controller 隔离 | implemented / source-verified | Controller 对 `readStateOnly` 只更新 unread 字段，保留任务的 status、active flags、active interval 与 latest Turn；即使 payload 被附带 active/Turn 字段，也不能重启任务。 |
| 隐私 | pass / source-contract | 新 marker 不携带 raw ID、正文、cwd、路径、private patch 或额外活动数据；仅既有匿名 key 和有限 read-state 字段跨 preload。 |
| 测试合同 | updated / not run | [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 覆盖 malicious activity 字段被 unread-only 忽略；[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 覆盖 direct read-state 与 active shadow 的 hasUnreadTurn-only patch。依项目规则未执行。 |
| 限定静态验证 | pass / source-only | `preload/index.js` 与 `public/preload.js` 字节一致；preload/public/src 不含 `ipcSync`、`invokeSync`、`sendSync` 或 `getAllFeatureHotKey`；目标 `git diff --check` 与 Controlled/canonical/current/error-memory Markdown 代码链接审计通过。未运行 tests、typecheck、build、uTools 或真实阅读操作。 |
| 真实宿主验收 | not run / user-owned | uTools preload 需要重新连接/重载。以一条可丢弃的已完成未读任务在 Codex 中手动阅读后，EyPc 应只从“已完成未读”变为“已完成”，不得进入“进行中”。 |

结论：已读是独立的 read-state 事实，不再允许携带或重放 activity。当前状态为 `未校验，待用户验收`。

## RAW-096 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因 | pass / source-trace | 完整库存每次都会把仍保存的 Desktop `active` shadow 重投影到任务上，但此前没有区分该 shadow 的实际观察区间；若 latest Turn 已在此前之后明确完成，旧 active 仍可在后续每轮扫描中长期压住完成投影。 |
| active interval 边界 | implemented / source-verified | snapshot 建立 active 或 patch 从非 active 进入 active 时，preload 记录一次匿名本机 `desktopActiveSince`；同一 active 的库存重投影不刷新它。离开 active、失去 live authority 或会话重置会清除它；Side Chat 聚合只取仍 active 子流的最新时刻。 |
| 状态优先级 | implemented / source-verified | 只有 latest Turn 明确为 `completed` 且 `completedAt > desktopActiveSince`，才把该旧 live active 视为被更晚完成证据取代。缺时刻、完成时刻不晚于 active、latest Turn 非 completed 或传输不确定时，仍保持 desktop-live active 优先；没有超时、recency 或 connector 推断。 |
| 隐私 | pass / source-contract | 跨 preload 的新增字段只是当前 active interval 的匿名本机时间；raw thread ID、正文、cwd、路径与私有 patch 仍不跨越 Renderer/持久化/日志边界。 |
| 测试合同 | updated / not run | [codex.test.ts](../../../../tests/domain/codex.test.ts#L1) 覆盖“较新 completed 压过旧 active”，[codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 覆盖 V2 active interval 后的较新 completed。依项目规则未执行。 |
| 限定静态验证 | pass / source-only | `preload/index.js` 与 `public/preload.js` 字节一致；preload/public/src 不含 `ipcSync`、`invokeSync`、`sendSync` 或 `getAllFeatureHotKey`；本轮目标 `git diff --check` 与 Controlled/canonical/error-memory Markdown 代码链接审计通过。未运行 tests、typecheck、build、uTools 或真实任务操作。 |
| 真实宿主验收 | not run / user-owned | uTools preload 尚未因本轮源码自动重载；需重新连接/重载插件后验证一个此前错误显示 active、但 latest Turn 已完成的任务会在既有普通完成展示窗后进入已完成，同时新的 active 任务不会被误判完成。 |

结论：Desktop live active 仍是当前执行的最高权威，但它不再因完整库存的重复投影获得伪造的“新鲜度”。只有严格较晚的明确完成可取代该旧 interval；当前状态为 `未校验，待用户验收`。

## RAW-095 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 根因 | pass / source-trace | Desktop `thread-archived` 与 App Server `thread/archived` 先前都只触发普通 `inventoryChanged`。下一份少行库存因此被 RAW-090 当作可能传输缺失，必须等待同一缺失集合跨 `max(15s, taskRefreshSeconds)` 后才移除。 |
| 显式归档快路 | implemented / source-verified | preload 只在当前 raw-thread 映射已存在时取出既有匿名 key，随 Activity Delta V2 的 `archivedKeys` 发送；Controller 只移除当前投影中存在的 key、清理本地 receipt/瞬态展示状态，并请求 50ms urgent 完整复核。 |
| 负向边界 | implemented / source-verified | 未映射、`thread-unarchived`、`thread/deleted`、畸形事件和普通低库存快照均不带移除 key；后者继续严格使用 RAW-090 隔离。若紧急完整复核仍包含该任务，会按已验证库存恢复。 |
| 隐私 | pass / source-contract | raw thread ID 只用于 preload 内查找；跨边界字段仅为已发布的 32 位匿名 key。cwd、正文、路径和私有事件 payload 不进入 Renderer、持久化、日志或过程文档。 |
| 限定静态验证 | pass / source-only | `preload/index.js` 与 `public/preload.js` 字节一致；两者及 `src/` 中不存在 `ipcSync`、`invokeSync`、`sendSync` 或 `getAllFeatureHotKey`；本轮范围 `git diff --check` 通过。 |
| 真实宿主验收 | not run / user-owned | 未重载 uTools preload、未执行真实 Codex 归档，也未运行 tests、typecheck、build、uTools 或截图。Vite HMR 不会重载 preload，需用户重新连接/重载插件后以可丢弃测试任务验收。 |

结论：外部归档不再被当作“普通缺项”而等待 RAW-090 的 15 秒以上隔离；只有已经映射的显式归档事件才会立即隐藏对应任务，并在后台紧急复核。当前状态为 `未校验，待用户验收`。

## RAW-094 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 三分钟真实复现 | pass / local-readonly | 本机当前桥保持 connected；同三条候选的 active 集合在采样中多次退出、5–20 秒后又恢复，完成总数保持不变，排除普通 1500ms 完成展示窗。当前用户消息已经重新激活本任务，因此该任务在采样期 active 属于正确状态。 |
| 根因 | pass / source+runtime | Desktop owner 同时发送 runtime 与大量私有 Turn/工具/正文 patch；旧 `codexApplyDesktopShadowPatch` 对未观察 root 返回失败，`handleStreamState` 因此退订重订。重订期间 live shadow 被清除，随后 owner 的 active snapshot 再覆盖退出证据。 |
| 实现 | implemented / source-verified | 结构正确且路径深度受限的未观察 root 现在返回已消费，仅推进 stream revision；四个受观察 root 继续严格解析，格式损坏、owner/revision 不连续和 frame 版本错误仍触发重订/断开。正文不被读取或投影。 |
| 修正后真实复核 | pass / local-readonly | 使用当前源码的新 bridge 连续 30 秒处理 59 个 patch；`resubscribe=0`、后续 `snapshot=0`，active 集合前后一致。该结果证明 patch churn 不再重置 shadow，不证明这些当前仍为 Desktop `inProgress` 的任务已经完成。 |
| 测试合同 | updated / not run | [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 的 active→idle 场景先注入九层私有 Turn patch，再同批投递 idle/request-clear/read-state；要求零额外 follow、一次定向 latest-Turn 完成读取及正文不外泄。依项目规则未执行。 |
| 运行版本 | reload required / user-owned | uTools Renderer 启动早于当前 `preload.js` 修改，Vite HMR 不重载 preload。源文件已同步，但真实视觉验收前必须在 uTools 开发模式重新连接/重载插件；本轮未杀进程、重启 uTools 或执行构建。 |
| 限定静态验证 | pass / source-only | 两个 preload 通过 Node 语法且字节一致；项目与 CodeNote 目标 diff whitespace、RAW-094 语义锚点和两仓变更文档代码链接审计通过。同步凭据在最终文档收口后签发。 |

结论：已完成任务长期显示进行中的可复现传输原因是未观察私有 patch 触发重订并让旧 active snapshot 复活；当前源码已消除该重订抖动。真实完成切换仍需重载 uTools preload 后验收。

## RAW-093 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 本机协议核验 | pass / local-source | 当前 ChatGPT/Codex Desktop 在 completed Plan Turn 后创建未决 `item/plan/requestImplementation`，加入 `conversationState.requests` 并保持到用户处理；该方法此前不在 EyPc 有限请求映射中。 |
| 待输入语义 | implemented / unverified | 该精确方法映射为 `waitingOnUserInput`。未决请求是明确用户等待证据，即使 runtime 在同一 patch 中已变 idle，也投影为 `desktop-live active + waitingOnUserInput`，优先于 completed 与普通展示窗。 |
| 最快路径 | implemented / unverified | 已登记任务在 Desktop snapshot/patch 到达后直接发匿名 Activity Delta，不触发 App Server latest-Turn/库存读取，不等待 50ms 结构合并、15 秒完整周期或 1500ms 普通完成窗；未登记任务沿用 RAW-092 匿名注册门禁。 |
| 收敛与防误判 | implemented / unverified | 只有有限精确 Plan request 和既有 input/option/setup/approval 请求可产生待输入/审批；请求移除后恢复 runtime/Turn 投影。未知请求、状态异常和传输缺失不猜成待输入，仍按 RAW-089–092 保守处理。 |
| 隐私 | pass / source-contract | request 只投影截断 type/method；计划正文、request ID、raw thread ID 与其它内容不进入 Activity Delta、Renderer、持久化或日志。新增测试用私有 plan body 并断言不会出现在 delta。 |
| 测试合同 | updated / not run | [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 增加 idle runtime + `item/plan/requestImplementation` patch 立即变待输入、零 latest-Turn RPC 与正文不外泄合同；依用户规则未执行。 |
| 限定静态验证 | pass / source-only | 两个 preload 语法通过且镜像字节一致，目标 diff whitespace 检查通过；完整语义与链接审计在文档同步后执行。 |
| 真实宿主验收 | not run / user-owned | 未主动创建 Plan Turn、点击实施/确认，也未运行 tests、typecheck、build、uTools 或截图；状态为 `未校验，待用户验收`。 |

结论：计划已完成但等待确认现在是明确的最快待输入路径，不再先落入完成或因 runtime idle 延迟；真实 Desktop/uTools 转换仍由用户验收。

## RAW-092 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| “两秒缓存”核验 | pass / source-contract | 当前没有统一两秒缓存：`taskRefreshSeconds=15` 是无事件/漏事件的完整校对周期，`completionPresentationDelayMs` 是普通完成展示窗；旧固定 2 秒 Activity 防抖已由 RAW-089 删除。RAW-092 采用 50ms 事件合并 + 会话期 dirty-task 快读，避免用缩短全量轮询换实时性。 |
| 新任务/待输入快路 | implemented / unverified | App Server started/turn/status 事件与未登记 Desktop 主任务 snapshot 发 urgent delta。preload 暂存 live shadow，完整库存建立匿名 key/项目/action alias 后立即复用 waiting-input 状态；不创建无身份占位，不把 raw ID/正文送入 Renderer。 |
| 事件读取范围 | implemented / unverified | 事件到达时只对 dirty 或没有缓存的任务执行 latest-Turn RPC，已验证旧任务使用会话内缓存；无 dirty 的周期校对仍重读所有 eligible Turn，进程退出/会话重置清空 cache/dirty/shadow。桥测试合同断言一次事件库存刷新只增加一个 latest-Turn 读取。 |
| 调度可靠性 | implemented / unverified | urgent 事件用 50ms 短合并，普通结构/缺失复核保持 200ms。若事件发生在完整读取中，Controller 保留 pending/urgent 并在结束后补读；测试合同覆盖 49ms 不读、50ms 触发和 in-flight 后只补一次。 |
| 完成时效 | implemented / unverified | `targeted-after-exit` completed 已经过本轮 active-exit 定向核验，直接清除/绕过 presentation hold 并同步完成卡片、计数和归档能力；普通快照完成仍使用用户配置窗，失败/中断继续按 RAW-091 判定 stopped 或 ongoing。 |
| 负向抖动 | unchanged / protected | 新增 key 可立即接纳；旧 key 缺失仍须同一 missing 集合跨 `max(15s, taskRefreshSeconds)` 连续确认。旧 Turn/完成时间回退不覆盖新证据，无终态证据继续显示进行中，显式验证归档/项目移除仍立即收敛。 |
| 本机只读回归 | pass / real-readonly | 更新后的 preload 通过 30 天匿名预检：Host V2 / completeness verified / Desktop bridge connected；`21 raw = 21 registered`，窗口内仍为 `19 = 14 completed + 2 stopped + 3 ongoing`，其中 `3 active / 0 unconfirmed ongoing`。该结果证明完整库存与分类未回退，不是新任务/完成延迟计时。 |
| 测试合同 | updated / not run | [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 与 [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 已补充事件快读、waiting-input shadow、50ms/in-flight 补读及 strong completion 直发合同；依项目规则未执行。 |
| 限定静态验证 | pass / source-only | 两个 preload 与真实预检脚本通过 `node --check`，preload 镜像字节一致；EyPc/CodeNote `git diff --check`、设计偏好 JSON、urgent/dirty/targeted/测试合同语义搜索及两仓 Markdown 代码链接审计均通过。 |
| 真实宿主验收 | not run / user-owned | 未主动创建/完成/停止任务来计时，也未运行 tests、typecheck、build、uTools 或截图；状态保持 `未校验，待用户验收`。 |

结论：RAW-092 已把“快展示”和“防抖”拆为非对称通道。新增任务、首次待输入和定向完成强证据不等待 15 秒全量周期或 1500ms 普通展示窗；任务消失、证据回退和未知终态仍不会突兀发布。源码、文档与只读库存回归通过，真实转换延迟仍由用户验收。

## RAW-091 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 旧偏差根因 | pass / real-readonly | 匿名聚合读取确认旧 `4 ongoing` 由 `2 desktop-live active + 2 desktop-live idle/latest-Turn interrupted` 组成；偏差来自 RAW-089 把明确停止也过度归一为进行中，不是实际存在四条执行。 |
| 明确停止边界 | implemented / unverified | latest Turn `failed/interrupted` 只有与 exact live `idle` 或 bridge `not-running` 同时成立时投影为 `stopped/stopped/blocked-stopped`。desktop-live active 优先；bridge failed/incompatible/connecting、systemError/notLoaded/inProgress、Turn/live idle 缺失仍保持 ongoing。 |
| 崩溃/主动关闭 | implemented / unverified | Desktop 仍在但会话主动停止或 GPT 执行崩溃，可由 live idle + terminal Turn 成为已停止；Desktop 整体退出/崩溃可由 bridge not-running + terminal Turn 成为已停止。单纯连接失败不冒充进程退出。 |
| 退出防闪 | implemented / unverified | Controller 记录 active-exit 基线；第一份 ordinary idle delta 若只携带 active 前的旧 completed/failed/interrupted，先维持 inProgress/ongoing。preload 的 3 秒有界定向重读携带有限 `targeted-after-exit` 证明，可让同 Turn failed/interrupted 及时收敛为停止；bridge not-running 只可直接确认 failed/interrupted 停止，不能把旧 completed 当新完成。RAW-090 的任务缺行隔离继续独立生效。 |
| UI/计数/动作 | implemented / unverified | 动态页增加中性“已停止”分段，不新增页签；停止任务保留在 all/项目/已隐藏投影，但不进入 ongoing/running、紧凑进行中角标、完成页或前后循环。归档能力为 `blocked-stopped`，提示“会话已停止但未完成，暂不能归档”。 |
| 本机聚合复核 | pass / real-readonly | 纠偏检查点在 18 条窗口输出 `14 completed / 2 stopped / 2 ongoing`，与用户当时确认的 2 条进行中一致。收尾时库存自然增至 19 条，最新输出为 `14 completed / 2 stopped / 3 ongoing`，并进一步拆出 `3 active / 0 unconfirmed ongoing`；新增一条是 exact live active，不是停止项回流或传输不确定。脚本等待 terminal 候选取得 Desktop live 权威后再结算。 |
| 测试合同 | updated / not run | 领域、Controller、UI 和浮窗桥合同覆盖 active-priority、live-idle/not-running 停止、bridge-failed 不确定、退出防闪及归档禁用；依用户验收规则未执行测试。 |
| 限定静态验证 | pass / source-only | EyPc/CodeNote 范围 `git diff --check`、两个 preload `node --check` 与字节镜像、真实预检脚本语法、设计偏好 JSON/interaction-flow ready 回执、状态/证据语义搜索及两仓 Markdown 代码链接审计均通过。 |
| 宿主验收 | not run / user-owned | 未在 uTools 插件内主动停止一条任务或关闭/崩溃 Codex 进程，也未运行 typecheck、build、uTools 或截图；整体仍为 `未校验，待用户验收`。 |

结论：纠偏时本机数据通道把错误的 4 条进行中校正为 2 条进行中、2 条已停止；最新状态因新增一条 exact live active 已自然变为 3 条进行中、2 条已停止。实现覆盖用户补充的 GPT 崩溃、主动停止和关闭路径，同时不会把普通传输异常或任务缺行误判为停止/消失；最终可见效果仍需用户在真实插件内验收。

## RAW-090 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 单次任务缺失 | implemented / unverified | Controller 对比上一份已发布 key 集合；新快照只要缺少任一旧 key，就不替换任务/项目/计数投影，而是保留上一份稳定清单、标记 stale 诊断并发起一次约 200ms 的完整复核。 |
| 消失接纳门禁 | implemented / unverified | missing-key 签名须在至少两份完整快照中连续一致，并已经过 `max(15s, taskRefreshSeconds)` 才会发布数量下降。任务重现、缺失集合改变、中间读取失败/不完整、功能停用或 dispose 会重置候选。 |
| 状态证据单调 | implemented / unverified | Activity Delta 与完整快照共用单调合并：更旧 Turn `startedAt`、同 Turn completed→非 completed、变小的 `completedAt` 或 `updatedAt` 不覆盖已接纳证据；更新 Turn 和 exact desktop-live active 仍立即反馈。 |
| 显式删除快路 | implemented / unverified | Host 已双向验证的单条/项目归档立即移除 key；已验证的原生项目移除立即移除项目与所属任务。两类明确用户动作不进入异常缺失窗。 |
| 测试合同 | updated / not run | [codexController.test.ts](../../../../tests/runtime/codexController.test.ts#L1) 新增任务数保留/跨周期接纳与 Turn 证据不回退合同；依项目规则不执行。 |
| 限定静态验证 | pass / source-only | Scoped `git diff --check`、库存候选/复核/重置/显式删除语义搜索通过；EyPc 与 CodeNote 两个根的 Markdown 代码链接审计均为 `OK`，权威需求与当前 AI 派生理解已复读一致。 |
| 真实传输抖动 | not run / user-owned | 未人为制造 App Server/Desktop bridge 短暂缺行、连接抖动或外部删除；整体仍为 `未校验，待用户验收`。 |

结论：RAW-090 的源码与测试合同已实现。验收时应观察一次短暂任务缺失不会改变数量/分组/操作槽，任务重现时完全无可见跳变；只有连续完整快照跨过一个校对周期都缺少该 key 时，才一次性收敛为真实消失。

## RAW-089 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 本机真实稳态观察 | refined-by-RAW-091 | 初次只读观察曾按 RAW-089 口径得到 4 条进行中；RAW-091 的会话级 live authority 复核证明其中只有 2 条 active，另 2 条是 idle/interrupted 的明确停止。初次 `4 = 4` 仅说明旧投影一致，不再作为正确状态数量证据。 |
| 缓存/周期核验 | refined-by-RAW-092 | 本机持久化设置为 `taskRefreshSeconds=15`、`completionPresentationDelayMs=1500`；固定 2 秒 Activity Delta 防抖已删除。RAW-092 进一步用 50ms 事件合并和 dirty-task 快读取代统一缓存思路；15 秒仍是完整周期，1.5 秒仍只用于普通完成展示。 |
| 定向完成核验 | implemented / unverified | 两个 preload 镜像在 Desktop active 退出后执行单飞、可取消、总计 3 秒有界的 latest-Turn 读取；只传匿名 key、Turn status/时间，失败才触发完整校对。active 前未变化的旧 completed revision 不会被当作本轮完成。测试合同覆盖目标 RPC 与隐私边界。 |
| 实时 Controller 投影 | refined-by-RAW-092 | Controller 删除固定 2 秒 pending/debounce，Activity Delta 立即投影；active→idle 且 Turn 版本未变化时仍为 ongoing。普通 fresh completed 的展示窗从真实退出起算；带 `targeted-after-exit` 的强完成证据由 RAW-092 直接发布，不再等待剩余展示窗。 |
| 异常统一进行中 | implemented / refined-by-RAW-091 | 领域层只有 latest Turn completed 可完成/归档；不具备明确停止组合的 failed/interrupted 及 systemError/notLoaded/inProgress/权威缺失仍统一为 `ongoing/running/blocked-active`。terminal Turn + live idle/not-running 由 RAW-091 投影为已停止；`unknownCount/attentionCount=0` 和 completed-only 归档保持。 |
| 设置语义 | implemented / unverified | `taskRefreshSeconds` 在 UI 标为“完整校对频率”，说明实时状态来自 Desktop push + 单任务核验；`completionPresentationDelayMs` 仅是完成证据成立后的可配置展示稳定窗。 |
| 限定静态验证 | pass / source-only | `node --check` 通过两个 preload，镜像字节一致；设计偏好 JSON 可解析；本轮范围 `git diff --check`、当前状态/归档语义搜索及 Markdown 代码链接审计通过。 |
| 自动化与真实转换 | not run / user-owned | 领域、Controller、preload 测试合同已更新，但依项目规则未执行测试、typecheck、build、uTools、截图或新的真实状态切换。最终状态保持 `未校验，待用户验收`。 |

结论：RAW-089 的实时完成和保守异常回退已实现，并由 RAW-091 修正“明确停止也算进行中”的过度归一化。完成转换仍待真实宿主验收；传输断连继续显示进行中，明确主动停止/崩溃则应在核验后只切换一次“已停止”，两者都不可归档。

## RAW-088 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 主题数量 | implemented / unverified | [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L57) 中 `CODEX_THEME_PRESETS` 现为 12 项。 |
| 海盐材质统一 | implemented / unverified | 全部主题：`palette=gradient`、`outer.style=solid`、`baseOpacity=100`、`glow=soft`、`thickness=5`、`colorMode=quota`；无分段钟表环。 |
| 完整令牌 | implemented / unverified | 每套仍携带 `colors`、`waterAppearance` 与九项 `expandedCardAppearance`；配置页默认样式下拉继续遍历同一数组。 |
| 默认匹配 | implemented / unverified | 海盐预设与 `defaultCodexWaterAppearance` 同构（含环粗细 5），默认加载主题可完整匹配。 |
| 限定静态核验 | pass / source-only | 源文件确认无 `segmented`/`aurora` 预设；未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-088 已实现，当前保持 `未校验，待用户验收`。请在 Codex 配置「水球」页确认默认进入仍是海盐观感，12 项切换均无钟表分段环且球体底色不透明，预览与桌面悬浮球同步。

## 2026-07-24 可选完成修订与运行时视图的类型契约

- 实现：完成未读的显式确认动作先捕获 `completionRevision`，再以原始类型、有限数和正数守卫收窄；只有有效修订才写入本地 receipt，原有不可用提示和打开行为不变。
- 测试契约：任务切换候选的类型现在显式携带有效 `actionAlias`；历史 `taskHotkeys` readback 字段及对应 fixture 已由 RAW-087 删除。
- 静态核验：已完成差异空白检查和调用路径审阅；未运行 TypeScript 类型检查、测试、构建、uTools 或真实 Codex 操作，仍待用户验收。
- Error memory：保留 [typescript-number-isfinite-optional-narrowing.md](../../../knowledge/error-memory/typescript-number-isfinite-optional-narrowing.md#L1)；[codex-float-bridge-mock-contract-drift.md](../../../knowledge/error-memory/codex-float-bridge-mock-contract-drift.md#L1) 中的 task-hotkey fixture 事件已标记为被删除功能取代；新增已验证 [utools-private-sync-ipc-entry-freeze.md](../../../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1)。

## 2026-07-24 uTools 安装路径代码复核

- Review target：本轮 [plugin.json](../../../../public/plugin.json#L1) feature 增量、[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 路由、[preload/index.js](../../../../preload/index.js#L4284) 浮窗装载与 [prepare-utools-runtime.mjs](../../../../scripts/prepare-utools-runtime.mjs#L1) 产物准备。
- Checked：production `dist` 入口为本地静态 `float.html`；manifest/preload 与 canonical 源一致；24 个 feature code 和 52 条指令均唯一；窗口槽位与新增 Codex 指令均有对应路由；preload/float-preload 的静态语法检查通过。
- Findings：P0 无；P1 无。未发现会阻止 uTools 解析 manifest、加载入口或执行 preload 的当前源码缺陷。
- Not checked：未执行 uTools 实际导入/安装写入；若宿主仍拒绝安装，需要其具体错误信息以区分宿主缓存、安装包元数据或版本兼容性。

## RAW-087 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 入口恢复 | pass / user-confirmed | 用户在移除入口快捷键读取后确认 uTools 插件已恢复加载，定位到私有同步宿主 IPC 阻塞而非构建、自动结束或重启问题。 |
| 回读完整删除 | pass / static | [preload/index.js](../../../../preload/index.js#L1) 与 [public/preload.js](../../../../public/preload.js#L1) 不再包含 `getAllFeatureHotKey` 或读取桥；[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1) 与 [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) 不再声明快照/动作。全仓目标源码和测试的 readback 符号搜索为空。 |
| 配置入口 | pass / static | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 与 [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1) 不显示绑定、不提供刷新，只保留官方 uTools 配置跳转。 |
| 顶部分面 | implemented / visual-unverified | Codex 页默认“快捷方式”，六个入口宽屏双列；另有任务、水球、卡片、运行四页。只渲染当前面板，运行诊断不占据默认入口；Tab 支持左右方向键、Home/End，窄屏可横向滚动且快捷入口单列。 |
| 渐进披露 | implemented / visual-unverified | 诊断详情、CLI 连接/降级、外观映射、百分比和尺寸说明进入可聚焦 `i` 提示；关键当前值、状态与动作仍常显。UI 选择遵循本轮 `PreferenceLookupReceipt v2` 与 `distill` 渐进披露规则。 |
| 限定静态核验 | pass with fallback | `node --check` 通过两个 preload；镜像完全一致；Vue SFC parser/compiler 对 Codex/Windows 页通过；Vite middleware 内存转换通过 Codex/Windows 页、Controller、App Runtime、平台类型与 Codex CSS；`git diff --check` 与残余私有 IPC 搜索通过。既有 HTTP 开发端点未运行，改用不监听端口的等价转换；未运行测试、typecheck、build、真实 uTools、截图或 Codex 操作。 |
| 项目规则与错误共识 | pass / documentation | [项目规则](../../../rules/README.md#L1) 固定 `EYPC-UTOOLS-HOST-001`，禁止私有同步宿主 IPC 与任何入口/焦点/可见性/刷新回读，并要求 preload 镜像及静态阻断检查；[已验证错误记忆](../../../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1) 固定症状识别、排查顺序、唯一已验证恢复路线和未来异步例外门槛。该项目本地规则按中央治理边界不写入 CodeNote Rule Task Index。 |

结论：入口卡死根因已经用户确认，RAW-087 的完整删除、配置分面、项目规则和错误共识已静态交付。当前状态为 `入口恢复与规则共识已确认；新布局未校验，待用户验收`。设置或修改任意 Codex/窗口槽 uTools 快捷键后，EyPc 页面都不应读取或回显当前绑定。

## RAW-084 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 全局功能与路由 | implemented / unverified | [plugin.json](../../../../public/plugin.json#L1) 新增两个 `mainHide` 功能；[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1) 分别派发 `codex.task.previous` / `codex.task.next`，feature-disabled 时保持现有设置页回退。 |
| 循环合同 | implemented / unverified | [codexController.ts](../../../../src/runtime/codexController.ts#L1) 依次稳定排序待输入、完整完成未读与进行中任务，按匿名 key 去重并只保留可打开项；首次 next/previous 取首/末，后续按方向回绕。循环指针仅存在 Controller 内存。 |
| 状态边界 | implemented / unverified | 两个动作仅调用既有打开路径，不写完成 revision receipt、不确认 Codex 未读、不改隐藏、页签或任务投影；完成未读显式确认仍只属于原有专用动作。 |
| 可发现性 | implemented / unverified | [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 为前/后任务各提供 uTools 系统级快捷键配置入口；未预设或占用系统组合键。 |
| 限定静态核验 | pass | 目标路径 `git diff --check`、`plugin.json` JSON 解析及 feature → action → Controller 字符串链均通过。未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-084 的历史前后循环已实现，其完成未读/完整 ongoing 序列由 RAW-109 取代。当前真实验收应覆盖完整待输入 → 最近 6 小时非隐藏 active、完成未读不参与、EyPc 本地置顶空池回退及无候选提示。

## RAW-083 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 角标位置 | implemented / unverified | [float.css](../../../../src/styles/float.css#L957) 将待输入放到左下、已完成未读放到最右下角、进行中固定在其上方 `23px`；两种紧凑皮肤共用定位。[codex.css](../../../../src/styles/codex.css#L632) 水球预览角标与控制文案已同步到同一角落几何，避免 RAW-083 后预览仍停在左上/右上。 |
| 主体命中区 | implemented / unverified | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 用同一表面相对纵向比例限定上 `1/3` 展开、下 `1/2` 拖拽；中间 `1/6` 无动作。指针点击复用展开判定，拖动仍使用既有 `5px` 阈值抑制后续点击。 |
| 既有交互边界 | unchanged / unverified | 角标仍是独立原生按钮并保留点击、键盘、200ms 说明和触屏路径；键盘显式激活仍展开，触屏不模拟 hover，未改 Host 拖拽协议、任务投影或持久化。 |
| 静态核对 | pass | `git diff --check`、目标源码/样式定位、偏好索引 JSON 与 `codex-companion + full-ui + task-only` 回执均通过。偏好索引曾因交互标签超过 16 项而阻塞，已收敛为既有稳定标签；未运行测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-083 已实现，当前保持 `未校验，待用户验收`。请确认待输入位于左下、已完成未读位于最右下角、进行中紧邻其上；在主体上方三分之一悬停/点击应展开，在下半区拖动应只移动窗口而不展开，中间区域无动作。再用键盘激活主体与点击三个角标，确认既有动作保持。

## RAW-071 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Requirement and plan gate | complete | RAW-071 reuses the existing Controlled parent and is scoped to the Codex configuration page plus direct color storage/render paths; no Host, preload, database, dependency or external write is included. |
| Preference and method | ready | Full-ui preference receipt has no candidate or authority conflict; project defaults explicitly cover the two unmatched structural categories. The selected external redesign guide is unavailable, so implementation uses the existing Vue/CSS design language. |
| Separated workbench | implemented / unverified | The configuration page now has explicit water-ball, card and status-signal zones. The water zone names and previews base, liquid A/B, Weekly progress/track and all three counters; card surface/foreground controls do not share that zone. |
| Direct color path | implemented / unverified | The settings normalizer retains non-empty stored color strings, the Controller no longer rejects or restores color/water patches, and the active page writes each control immediately to its labeled setting. Quota-mode Weekly progress remains status-derived by design; custom mode uses the dedicated progress color. |
| Static source checks | pass | `git diff --check` and active-path searches confirm no active page/controller reference to the card-color dialog or color/water validation gate. The local Vue SFC parser package is unavailable, so no parser compile was run. |
| Documentation link audit | pass | `audit_code_links.py` reports `Code link audit: OK` across the RAW-071–076 controlled documents, project status and current knowledge/error-memory updates. |
| Verification policy | not run | The user did not select tests. No test file was modified or run, and typecheck/build/uTools/screenshots/real Codex operations remain unexecuted. |

## RAW-072 / RAW-073 / RAW-074 / RAW-075 / RAW-076 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Single water renderer | implemented / unverified | The configuration page and float both mount `CodexWaterBall`. The preview uses the same quota projection, water appearance, colors and visible-counter calculation as the float instead of a second hand-drawn ball. |
| Preserved water motion | implemented / unverified | The shared component keeps the existing three SVG wave layers, refraction, high-light and `static / slow / normal / fast` timing tokens. The preview changes only the component container; it does not replace the ball with a static liquid illustration. |
| Transparent ball base | implemented / unverified | `waterAppearance.inner.baseOpacity` persists `0–100`; at `0` the ball-base layer and its shadow disappear while liquid, ring, reading and counters remain. The water-zone slider changes the same value used by the float. |
| One-to-one controls | implemented / unverified | The water zone names ball base/opacity, liquid A/B, palette, opacity, amplitude, wave speed, Weekly ring/progress/track and all counters. Card surface/foreground remains in its own zone. |
| Expanded-card configuration target | implemented / unverified | The card zone explicitly previews the float after expansion—tabs, search, quota and task surface—not the compact horizontal card. It consumes the same derived card surface/foreground tokens as the expanded float and labels the exact covered regions. |
| Expanded-card theme depth | implemented / unverified | `expandedCardAppearance` persists nine direct tokens for main/raised panel, border, primary/secondary text, accent, focus, running and completed-unread. Built-in and saved themes carry the full object; legacy records receive a compatible default from their existing card values. |
| Actual expanded-card path | implemented / unverified | The Float snapshot carries the same expanded-card object used by the page preview. Once expanded, `FloatApp` selects that resolver regardless of compact water/card style; changing a token no longer depends on or changes water-ball rendering. |
| Static checks | pass | `git diff --check` plus direct-path searches confirm all nine page controls update `expandedCardAppearance`; built-in/saved themes and settings normalization retain it; Controller forwards it; preview and expanded float use `resolveCodexExpandedCardTheme`; no old card color control is active. |
| Verification policy | not run | The user did not select tests. No test file was modified or run, and typecheck/build/uTools/screenshots/real Codex operations remain unexecuted. |

结论：RAW-071–076 已实现，当前保持 `未校验，待用户验收`。请先确认真实水球与配置预览都保留三层波纹、折射和高光，且不再出现底部扁平矩形；再改底色、液体 A/B、波幅/速度、环/轨道，确认配置页与右侧真实水球同时呈现同一效果。展开大卡片后，分别改主面板、内层块、边框、主/次文字、选中、焦点、进行中和完成未读，确认每项只改变标注区域且与水球无关；切换内置主题或保存/重应用主题后，九项令牌应完整保留。将“球体底色透明度”调到 `0%` 时，真实浮窗只去掉底色而液体、Weekly 环、读数和角标保留。

## RAW-082 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 共享动作 | implemented / unverified | 完成未读角标、uTools 功能路由和系统级快捷键配置入口都使用 `codex.completed-unread.openFirst`；待输入继续走既有只打开的 action。 |
| 本地 revision 确认 | implemented / unverified | 首条按完整计数集合、置顶优先和稳定源顺序解析；当前完成 revision 写入 EyPc receipt 后立即重投影为 completed/read，新 revision 仍可重新进入 completed-unread。 |
| 权威边界 | implemented / unverified | 本地确认不写 Codex Desktop 原生 unread，不从 connector/时间生成状态；普通行打开、隐藏、恢复和待输入打开都不确认。 |
| 限定静态校验 | pass | `git diff --check`、`plugin.json` JSON 解析、共享 feature/action/Controller/receipt 字符串链与 Markdown 代码链接审计均通过；不运行用户保留的测试、typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-082 已实现，当前保持 `未校验，待用户验收`。请准备多个完成未读任务（含一个已隐藏和一个置顶项），分别点击水球未读角标及调用“打开并标记第一个 Codex 已完成未读任务”的 uTools 全局功能/快捷键；两条路径都应打开相同首条，并立即让该 revision 在所有 EyPc 视图变为已完成/已读。随后产生更晚的完成 revision，应重新显示未读。待输入角标和待输入全局功能应只打开，不改变其状态。

## RAW-069 / RAW-077 / RAW-078 / RAW-079 / RAW-080 / RAW-081 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 回流优先发布 | implemented / unverified | 已完成且已读任务回流为 completed-unread 或 desktop-live active 时绕过普通 Activity Delta 防抖立即发布，并取消同任务尚未到期的终态 hold；completed-unread 保持其语义，不被归一为 ongoing。 |
| 任务级进行中离开稳定窗 | refined by RAW-089/100/108 / unverified | Controller 只在 visible running 获得 completed/completed-unread 证据时建立 hold；failed/system-error 不再成为可见终态。允许 `0/500/1000/1500/2000/3000ms`，当前代码默认 0ms，既有持久化值保留；RAW-108 未修改。 |
| 可中断与一次性释放 | refined by RAW-089 / unverified | 展示窗内恢复 active/ongoing 会立即取消 hold；completed 证据达到当前配置值后一次性释放完成桶、完成时间、未读和归档能力。异常继续 ongoing。 |
| 全投影一致性 | implemented / unverified | hold 内任务统一为 `ongoing/running/blocked-active`，并重建 ongoing/completed/hidden/all、完成页、项目 section 与计数；卡片、详情、Shift 预览、角标及归档入口消费同一结果。 |
| 双重延迟移除 | implemented / unverified | Float renderer 删除独立进行中角标合并器，角标直接读取 Controller 稳定投影，避免卡片先完成、角标后完成或额外延迟。 |
| 权威与兼容边界 | refined by RAW-089/100 / unverified | 该设置只延迟已由 provider 权威成立的 completed 展示，不从时间推断完成；固定 2 秒 Activity Delta 防抖已删除。当前代码默认与旧缺失配置归一为 0ms，已有用户持久化值保持不变。 |
| 百分比读数独立配置 | implemented / unverified | 位置、字号、常规/加粗/斜体/粗斜体和颜色属于 `waterAppearance.inner`，预览与真实水球共用 `CodexWaterBall`；默认居中、22px、加粗、白色，并随内置/已保存主题持久化。 |
| live 未读缺字段回退 | implemented / unverified | Desktop snapshot/patch 明确给出 `hasUnreadTurn` 时保持 desktop-live 优先；字段缺失时不再写入 `false/unavailable`，而是保留最近成功读取的 Codex persisted unread；持久化集合不可读才显式 unknown。 |
| 待输入请求名归一化 | refined-by-RAW-093 / unverified | 仅对既有 user-input / option-picker / setup / approval / elicitation / permission 已知词做分隔符删除后匹配，因此 `request_user_input` 与既有等价写法同样映射到 `waitingOnUserInput`。RAW-093 仅新增精确 Plan implementation 方法，并允许兼容 Desktop live shadow 的有限未决请求把同批 idle 提升为 active；仍未放宽 connector、`notLoaded`、未知请求或时间推断。 |
| 限定静态校验 | historical pass / refined | RAW-079–081 当时的静态校验保持历史证据；其中“其它非输入 2 秒防抖”和异常终态已由 RAW-089 取代。 |

结论：RAW-079–081 已实现，当前保持 `未校验，待用户验收`。用户应确认当前默认“进行中离开稳定窗”为 0 秒，已有持久化选择在重开后仍保留；若选择非零时长，再以同一任务验证所选时长内卡片、角标和归档入口稳定为进行中且不可归档，窗口结束后仅切换一次。再让已完成且已读任务回流为完成未读或 desktop-live 进行中，确认立即发布且未读不被改写；特别验证 live snapshot/patch 缺少 unread 字段时，既有完成未读不丢失，而实际 read-state 改为已读时仍立即清除。再触发 `request_user_input` 形式的活跃请求，确认待输入角标立即出现。分别修改百分比读数位置、字号、字形和颜色，确认预览与真实悬浮球同步且主题/重开后仍保留。

## RAW-070 当前交付状态（由 RAW-089 取代）

- 历史 60 秒 interrupted 完成推断已删除。RAW-089 规定 interrupted 持续显示进行中，只有 latest Turn 明确 completed 才能生成完成 revision。
- 原 RAW-070 的用户验收项不再适用；当前需验收 interrupted 不会因等待时间变为完成。

静态校验：本轮仅执行 `git diff --check`、`pnpm run typecheck` 和 Markdown 代码链接审计；不执行自动化测试、build、截图、uTools 宿主验收或真实 Codex 操作。

- Error memory: 新增候选 [codex-completion-transition-hysteresis.md](../../../knowledge/error-memory/codex-completion-transition-hysteresis.md#L1)，记录“独立角标延迟无法稳定完整产品状态，完成过渡必须在统一投影层做可中断 hysteresis”；并明确该窗口不是完成证据，不能违反 verified [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1)。

## RAW-068 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 领域归档能力稳定化 | implemented / unverified | 原始 interrupted 仍投影为 `activityState='ongoing'`，并与 desktop-live active 一样得到 `archiveCapability='blocked-active'`、`canArchive=false`；active/interrupted 来源切换不再改变卡片动作能力。 |
| 固定动作槽与衍生入口 | implemented / unverified | 任务行固定 `归` 槽继续保位但始终禁用；操作抽屉、Shift 预览、单项确认和批量候选消费同一 `canArchive`，不再出现可用性闪烁。 |
| Controller 与 Host 二次门禁 | refined by RAW-089 / unverified | Controller 在 blocked capability 处拒绝且只对 completed 发送完成证据；Host 重读仍是最终安全门禁。 |
| 兼容边界 | refined by RAW-089 / unverified | 只有 completed 可验证归档；failed/interrupted/system-error/unknown 全部保持进行中并阻断归档。 |
| 限定静态校验 | pass | `git diff --check`、测试文件零差异、preload/public 镜像一致、可见 interrupted 分支零命中、领域 ongoing capability、Controller 拒绝、Host 单条/项目 interrupted 门禁、版本/事件唯一性、偏好 JSON 与 Markdown 代码链接审计均通过；依用户规则不修改或运行测试，不运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-068 已实现，当前保持 `未校验，待用户验收`。用户应让同一会话经历原始 interrupted 与 desktop-live active 更新，确认页面始终显示“进行中”，固定归档按钮持续禁用且不闪烁，抽屉/Shift 预览/批量归档也不把它列为可归档对象。

- Error memory: 更新候选 [codex-provider-status-display-normalization.md](../../../knowledge/error-memory/codex-provider-status-display-normalization.md#L1)，补充“显示状态与动作 capability 必须在同一投影边界收敛”；同时在 verified [codex-archive-revalidation-fail-open.md](../../../knowledge/error-memory/codex-archive-revalidation-fail-open.md#L1) 记录当前产品对 interrupted 的更窄拒绝规则。新行为仍待用户验收，不提升候选状态，也不改写历史 verified 证据。

## RAW-067 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 候选集合与首条合同 | implemented / unverified | “待输入”读取完整 `inputRequired`；“已完成未读”从 `all` 过滤 `bucket === 'completed-unread'`，因此计数中的已隐藏会话仍可成为候选；两者均使用既有展示排序后只取第一条。 |
| 单条与多条直达 | implemented / unverified | 两类角标只要非零，单条和多条均走相同 `openTask → codex.task.open` 路径，不再因数量大于一而先展开浮窗；第一条不可打开时不跳到后续会话。 |
| 排序与状态边界 | implemented / unverified | 首条按现有 `displayOrderedTasks`：置顶优先，其后保持上游最新 Turn 与匿名 key 的稳定顺序；打开动作不清除未读、不解除隐藏、不切换页签。 |
| 进行中与无计数 | unchanged / unverified | “进行中”继续调用 `requestExpansion(true)`；三个原生按钮仍由各自非零计数控制渲染，零计数不显示。 |
| 提示与可访问性 | implemented / unverified | 保留原生按钮点击、Enter、Space、200ms hover/focus 提示和既有 ARIA 路径；待输入与未读提示分别明确为“待输入 N · 打开第一条”和“未读 N · 打开第一条”。 |
| 限定静态校验 | pass | `git diff --check`、测试目录零差异、偏好 JSON 解析、单条门禁移除、候选源/排序/首条打开/进行中展开/零计数渲染/提示与事件链字符串检查均通过；Markdown code-link audit 为 `OK`，设计偏好回执为 `ready-for-ui-skill`，closeout 只生成 eligible 的 no-write canary candidate。依用户规则未修改或运行测试，未运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-067 已实现，当前保持 `未校验，待用户验收`。用户应分别验证待输入/未读为 1 条、多条以及未读首条已隐藏时都打开排序第一条，同时确认未读、隐藏和当前页签不改变，进行中仍只展开浮窗。

- Error memory: 复用既有 verified [codex-task-count-list-projection-divergence.md](../../../knowledge/error-memory/codex-task-count-list-projection-divergence.md#L1)，确保点击候选与角标计数使用同一完整投影；本轮不新增错误记忆。

## RAW-065 / RAW-066 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Weekly 数据进度环 | implemented / unverified | primary/secondary 存在 Weekly 时渲染同池剩余进度 SVG，支持连续圆环与固定 20 段；无 Weekly 时不渲染外圈。 |
| 普通装饰圈移除 | reworked / unverified | 用户跟进截图证明首轮修正后最外层完整圆仍存在。当前除 `2px inset`、静态 border、inset outline 与装饰 shell 外，已继续删除根容器整圆背景、表面同尺寸外发光及宿主水球按钮的圆形 focus outline；键盘焦点改由中央读数下划线提示，保留轨道仅属于数据进度环。 |
| 环设置与校验 | implemented / unverified | 恢复样式、粗细、颜色模式、进度色、轨道色、光晕设置及 `2–6px`/`3:1` 校验；不恢复轮廓透明度入口，`shellOpacity` 只保留持久化兼容。 |
| interrupted 领域投影 | implemented / unverified | 原始 `CodexTurnStatus='interrupted'` 保留，但卡片投影转换为 `activityState='ongoing'`；running/ongoing 计数包含转换项，attention 只包含 failed/system-error。 |
| 全页面可见语义 | implemented / unverified | 动态、项目、已隐藏卡、角标、详情与 Shift 预览统一显示“进行中”，使用播放图标/running 色；可见状态联合类型、Renderer 分支与 CSS 不再包含 interrupted。 |
| 归档安全 | superseded by RAW-068 | RAW-066 原先按原始 interrupted 保留归档能力的子条款已被 RAW-068 取代；当前投影 ongoing 与 desktop-live active 均稳定阻止归档，Host 单条/项目路径也拒绝或跳过原始 interrupted。 |
| 限定静态校验 | pass | 首轮静态核对未覆盖宿主按钮 focus-visible，已因用户截图失效；本次重新执行 `git diff --check`、测试文件零差异、可见 interrupted 分支/CSS 零命中、Weekly ring/根背景/外发光/focus outline 结构检查、偏好 ready 回执与 Markdown 代码链接审计并通过。未修改或运行测试，未运行 typecheck、build、uTools、截图或真实 Codex 操作。 |

结论：RAW-065 已按用户跟进截图再次修正、RAW-066 的可见状态投影保持实现，其旧归档子条款由 RAW-068 取代；failed、system-error 与 unknown 的旧独立表达又已由 RAW-089 取代，当前均显示进行中并阻断归档。整体仍为 `未校验，待用户验收`。

- Error memory: 新增候选 [codex-water-ring-layer-separation.md](../../../knowledge/error-memory/codex-water-ring-layer-separation.md#L1) 与 [codex-provider-status-display-normalization.md](../../../knowledge/error-memory/codex-provider-status-display-normalization.md#L1)，分别记录视觉层误删，以及 provider 原始状态/动作能力未经完整产品投影便泄漏 UI；未保存原始对话或截图，待用户验收后再决定是否提升为 verified。

## RAW-064 历史交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 异常状态分段收敛 | historical / superseded by RAW-089 | 该阶段保留 failed/system-error 错误表达的合同已被取代；当前全部非 completed 异常/未确认状态统一为进行中。 |
| 未知与紧凑语义 | historical / superseded by RAW-089 | 该阶段的独立“宿主状态未知”与 attention 计数已被删除；当前异常、未知及遗留 unknown/attention 计数全部折叠为进行中。 |
| 无重排选择提示 | implemented / unverified | `选择模式 / 已选 N 项 / Esc 退出` 移入列表舞台底部绝对覆盖层，保留 `role=status`/`aria-live=polite`；选择滚动区预留安全空间，底部批量栏上移避让，顶部批量栏逻辑未改。 |
| 保留交互合同 | implemented / unverified | 38px 左侧选择区、核心选择状态机、Esc/最后一项退出、行/子按钮 Space/Enter 所有权与既有批量动作不变；未新增 API、持久化、runtime action、共享组件或 preload/platform 改动。 |
| 开发与宿主验收 | not run | 依用户规则，未新增或运行测试、typecheck、build、uTools、截图或真实 Codex 操作；本记录不把静态源码复核视为用户验收。 |

结论：RAW-064 的无重排选择提示继续有效；其 failed/system-error/unknown 分组验收已由 RAW-089 取消，当前只需验收这些任务都进入“正在进行中”。选择模式布局、末行滚动、批量栏避让与 Esc 恢复仍待验收。

- Error memory: 已更新既有候选 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1)，加入“瞬时选择提示不得以顶部普通流新增一行、导致密集列表重排”的防复发规则；仍待用户视觉验收，未提升为 verified。

## RAW-063 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 四页签与兼容回退 | implemented / unverified | Float renderer 仅显示 `动态 / 已完成 / 已隐藏 / 项目`；`all/input` 投影保留给角标与统计，旧持久化、旧快照和 `codex.tab.set` 均回退为 `ongoing`。 |
| 6 小时动态流 | implemented / unverified | 动态页和徽标都按最近 6 小时的 `max(lastTurnStartedAt,lastTurnCompletedAt)` 非隐藏集合取数；当前 RAW-064 顺序为待输入、进行中（含三种异常状态）、未知、完成未读、已完成，完成任务仍在窗口内显示。 |
| 行内交互与密度 | implemented / unverified | 标题普通点击直达、Ctrl/Cmd 只选择；元信息行聚焦并高亮以接收 `Ctrl+T`。四按钮固定为 `24px / 2px / 102px`，注册提示只显示“最近 N 天的 M 条”。 |
| 水球收敛 | superseded by RAW-065 | RAW-063 当时移除 Weekly SVG 外环；RAW-065 已恢复数据进度环及其设置，同时删除普通装饰圈。 |
| 状态角标与图片回退 | implemented / unverified | 左下待输入保持完整集合；右下最边角为完成未读、其上为同源最近六小时进行中，且不新增 Renderer 延迟。Controller 可配置完成展示窗当前代码默认 0ms，既有持久化值不变。编辑器支持 PNG/JPEG/WebP 选择、拖放、粘贴与内存预览；当前文本-only App Server 下图片动作仅复制文字并打开 Codex 空白会话，不创建 App Server 空线程。 |
| 静态核对 | pass | `git diff --check` 通过；已复核可见 Tab 仅为四项、旧 all/input 回退路径、6 小时动态筛选、外环 CSS/SVG/设置入口移除和受控/权威文档同步。按用户要求未运行测试、typecheck、build、uTools、截图或真实宿主操作。 |

结论：RAW-063 已实现，状态为 `未校验，待用户验收`。用户验收应确认旧 `all/input` 启动后直接进入动态、四页签无闪现、待输入角标/当前动态分段正常，以及最近 6 小时内完成任务仍可见。

- Error memory: 继续复用 [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1)：只采用 latest Turn 的已证据时间，不以 `updatedAt`、刷新频率或跨进程 `notLoaded` 推断状态；新增候选 [codex-float-bridge-mock-contract-drift.md](../../../knowledge/error-memory/codex-float-bridge-mock-contract-drift.md#L1)，记录必需 `copyText` bridge 能力与完整测试 mock 的同步规则。该 mock 已补齐，但 typecheck 仍由用户执行后才能提升记录状态。

## RAW-059 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 启动位置发现 | implemented / unverified | preload/public preload 自动枚举受控 macOS/Windows CLI 候选，并只向 Renderer 传递来源标签和可用性；无候选时保留现有连接器入口。 |
| 手动 CLI 位置 | implemented / unverified | 配置页可提交完整绝对路径；Host 使用现有 native/Node-wrapper/Windows shim 运行计划核验后，才写入独立本机插件 storage。页面、环境快照、日志和文档均不回显该路径。 |
| 状态权威保护 | implemented / unverified | App Server 成功往返只建立连接证据，不再覆盖 preload 的 runtime/process/Desktop bridge 分类。`desktop-live` 仍是 Input/进行中/完成未读唯一权威；connector fallback 只保留数据与动作，并公开未知/延迟边界。 |
| Windows 提示 | implemented / unverified | UI 说明 npm、Volta、NVM、本地和 PATH 自动发现；`.cmd` 入口仍需通过 Node/JS 或 bundled native 核验。当前实时 Desktop IPC 明确标注为 macOS canary。 |
| 静态核对 | pass | canonical/public preload 字节一致，`git diff --check` 无空白错误；未运行测试、typecheck、build、uTools/runtime、截图、真实预检或真实归档。 |

结论：RAW-059 已实现并保持 `未校验，待用户验收`。尤其需要用户在真实 macOS Codex Desktop 中确认 live status 与归档 UI 即时刷新；Windows 仅可确认 CLI 发现/连接器行为，不能宣称实时 Desktop IPC 已可用。

- Error memory: 未新增。本轮复用现有 [codex-gui-nvm-launcher-path.md](../../../knowledge/error-memory/codex-gui-nvm-launcher-path.md#L1) 的 GUI/NVM/Windows shim 受控启动替代路线，没有发现新的、已验证的失败模式。

## RAW-058 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 多选命中与状态机 | implemented / unverified | 左侧选择区改为 38px 全高矩形并保留状态图标；普通态左区选择、中部打开、Ctrl/Cmd+中部选择，选择态两区切换成员并在最后一项移除时退出。 |
| 选中视觉与键盘归属 | implemented / unverified | 选中行使用 accent/running/pending/surface 三色主题渐变，hover/focus/active 逐级增强；任务行、左按钮和右动作按钮分别拥有 Space/Enter，根行不重复执行子按钮事件。 |
| 置顶来源与门禁 | implemented / unverified | 行尾“本地顶”已移除；本地“顶”使用 warning 色，四类来源由 200ms hover/focus 说明表达。原生/Chats 使用可聚焦 `aria-disabled=true`，点击、Quick Jump 与快捷键复用只读门禁。排序和持久化未改。 |
| 紧凑角标说明 | implemented / refined by RAW-067 | 待输入单/多项、正在进行中、已完成未读角标共享移出展开分支的说明层；200ms 后显示作用，离开/失焦关闭，hover/focus 不展开或切页；待输入与未读点击合同现由 RAW-067 统一为打开完整计数投影中的排序首条。 |
| 自动化契约 | focused pass / full file red | 用户授权后运行多选专项：普通/Cmd 中部与左区状态机、最后一项退出、子按钮 Space/Enter 归属、38px 全高区/状态图标/三色渐变共 `3 / 3` 通过。首次整文件探测为 `21 / 40` 通过、19 失败；失败跨页签、搜索、项目、配置、角标等更广合同，不能宣称 Companion 全绿。 |
| 静态与类型核验 | pass | `git diff --check`、Markdown code-link audit、设计偏好 `ready-for-ui-skill` 复核和用户触发后的 `pnpm run typecheck` 通过；未运行 build、uTools/runtime、截图或真实 Codex 操作。 |

结论：RAW-058 的多选专项自动化为 `3 / 3 passed`，证明触发状态机、最后一项退出、子按钮键盘隔离和视觉结构契约有效；真实视觉与 Codex 跳转仍待用户验收，且 Companion 整文件仍有 19 条非多选专项失败，不能标记整体 accepted。

- Error memory: 更新 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1) 的第二次发生记录，并新增候选 [codex-control-owned-source-feedback.md](../../../knowledge/error-memory/codex-control-owned-source-feedback.md#L1)。两者均待用户验收后再决定是否提升为 verified。
- Typecheck correction: [FloatApp.vue](../../../../src/FloatApp.vue#L1) 的 composer `nextTick` 回调改为一次捕获并判空局部 state，消除两处 TS18047；已记录 verified memory [vue-nexttick-ref-null-narrowing.md](../../../knowledge/error-memory/vue-nexttick-ref-null-narrowing.md#L1)。

## Closeout Static Re-audit (2026-07-22)

- 对当前脏树重新做了源码/规范对照，并修正配色对比度与水球边界、联动取色板与无效色域、四页签/统一搜索、水球外壳透明度，以及桌面补丁未知路径的 fail-closed 分支；图片附件回退保持文本-only App Server 与受限浮窗复制边界。
- 可复现静态检查通过：preload/script `node --check`、`git diff --check`、canonical/public preload 字节一致性和 Markdown code-link audit。
- 依项目规则，本次未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作；整体仍为 `未校验，待用户验收`。

## RAW-057 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 选择模式提示 | implemented / unverified | 任一任务选中后常显“选择模式 / 已选 N 项 / Esc 退出”，数量实时变化，最后一项移出后消失；RAW-064 将其改为列表舞台底部绝对提示，避免顶部普通流重排。 |
| 层级区分 | implemented / unverified | 未选行降至 `.62` 不透明度并降低饱和度；选中行使用 `2px` 强调边、`5px` 左轨、强底色与双层焦点/阴影。 |
| 左侧徽标 | superseded by RAW-058 | RAW-057 的状态图标替换为 `✓` 已由 RAW-058 取代；当前 38px 左侧控件始终保留状态图标，并保留强调 selected/focus/active 边界。 |
| 自动化契约 | updated / not run | UI 测试增加模式条、实时数量、最后一项退出、勾选符号和未选降权断言；依用户规则未执行。 |

结论：RAW-057 为 `未校验，待用户验收`。未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作。

- Error memory: 新增候选 [codex-selection-state-needs-structural-contrast.md](../../../knowledge/error-memory/codex-selection-state-needs-structural-contrast.md#L1)，等待用户视觉验收后再决定是否提升为 verified。

## RAW-056 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| Codex Desktop 伴随桥 | implemented / unverified | Preload 已实现 macOS loopback Unix socket、长度帧、固定版本 initialize/snapshot/patch/follow/request/read-state、断线重连，以及 owner/mode 与协议不兼容 fail-closed；桌面全文快照仅在 preload 内瞬时投影。 |
| Input / 正在进行中 | historical / refined by RAW-089 | `statusAuthority=desktop-live` 仍是 waiting-input/waiting-approval/active 的唯一来源；失去 live authority 后不再显示“宿主状态未知”，而是保持进行中。 |
| 已完成未读 | implemented / unverified | 最新 Turn completed 与 Codex `hasUnreadTurn` 共同决定；live read-state 优先，断线时可用 Codex 自身持久化 unread 集合。EyPc open/hide/restore 与待输入打开均不确认；仅显式完成未读命令在 EyPc 本地确认当前 completion revision。 |
| 归档即时同步 | implemented / unverified | App Server `thread/archive` 及 false/true 双向验证保留；成功后向已连接桌面端派发 `thread-archived` v2。单条/项目结果区分已派发与桌面端未确认即时刷新，通知失败不回滚已验证归档。 |
| 活动与诊断 UI | historical / refined by RAW-089 | 动态页当前只保留待输入、正在进行中、已完成未读与已完成分段；失败、系统错误和宿主未知分段已删除。设置页的连接器/实时桥诊断及 5s→三次失败后 1s watchdog 保留。 |
| 自动化契约 | updated / not run | Domain、Controller、UI、platform/preload 测试契约已更新，并增加私有桌面 socket snapshot/read/archive 通知边界用例；依用户规则未执行。 |
| 真实宿主与写入 | not run | 未运行测试、typecheck、build、uTools/runtime、截图、真实 IPC 预检、真实归档或项目移除；未修改本机 Codex 原生状态。 |

结论：RAW-056 为 `未校验，待用户验收`。实现和测试契约不能替代真实 Codex Desktop 消费与 UI 刷新的用户验收；RAW-054 及更早历史证据不替代本增量验收。

- Error memory: 未新增；现有 [codex-cross-process-notloaded-is-not-completion.md](../../../knowledge/error-memory/codex-cross-process-notloaded-is-not-completion.md#L1) 与 [codex-archive-revalidation-fail-open.md](../../../knowledge/error-memory/codex-archive-revalidation-fail-open.md#L1) 已覆盖本轮“无 live authority 不猜状态”和“归档先双向验证”的复用规则。

## RAW-055 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 名称回退 | implemented / unverified | 有别名时 `alias/displayName/name` 使用别名；无别名时回退原始名称。列表只显示一个主标题，原名仍参与搜索并保留于详情/Shift 预览。 |
| 密度与字号 | implemented / unverified | RAW-055 建立 `12/10/9px`、`24px` 四槽、`105px` 操作区和 `40px` 行；其 `26×30px` 左控件已由 RAW-058 的 38px 全高矩形取代。 |
| 鼠标选择 | implemented / unverified | 普通态中部打开、左槽进入选择；选择态中部与左槽均加入/移出，移出最后一项后集合清空并退出选择模式。独立操作按钮继续阻止冒泡。 |
| 状态反馈 | implemented / unverified | 行和左控件补齐 hover/focus/active/selected 组合、强调边、渐变与光晕；左控件同步 `aria-pressed`，Space/Escape/Delete/F/Shift 继续复用既有可见反馈。 |
| 自动化契约 | updated / not run | Domain/UI 用例已更新名称投影、原名搜索、两态点击、最后一项退出、尺寸和组合状态断言。依用户规则未运行。 |

结论：RAW-055 为 `未校验，待用户验收`。未运行测试、typecheck、build、uTools/runtime、截图或真实 Codex 操作；RAW-054 历史证据不替代本增量验收。

- Error memory: 新增候选 [codex-display-label-fallback-precedence.md](../../../knowledge/error-memory/codex-display-label-fallback-precedence.md#L1)，等待用户验收后再决定是否提升为 verified。

## Review Target

- Requirement: [raw-requirement.md](raw-requirement.md#L1) 的真实项目库存、四页签与旧 all/input 回退、6 小时动态流、Codex Desktop live/unread 权威、无权威未知降级、5s watchdog、归档后桌面通知、普通/Spark 额度 V2、任务/项目常显四槽、即时可见的置顶、项目隐藏/移除、高对比 Quick Jump、联动取色、图片回退与纯 Shift 隐私预览。
- Plan: [plan.md](plan.md#L1) 的 Host V2/Projection V3 匿名边界、App Server 数据/动作连接器、Desktop 伴随桥、Renderer 状态机、测试契约和文档闭环；真实宿主、视觉与开发门禁留给用户验收。
- Implementation: [preload/index.js](../../../../preload/index.js#L1)、[preload/float.js](../../../../preload/float.js#L1)、[codex.ts](../../../../src/domain/codex.ts#L1)、[codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1)、[CodexCardColorDialog.vue](../../../../src/components/CodexCardColorDialog.vue#L1)、[codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1)、[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1)、[codexController.ts](../../../../src/runtime/codexController.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1) 与 [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1)。

## RAW-054 增量验收

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 双取色板与色域 | pass | 表面/前景两个 canvas 同时存在；固定色相下显示饱和度/亮度，低对比区域斜纹弱化。选择任一侧会保持另一侧色相/饱和度并移动到最近满足 `4.5:1` 的亮度。 |
| 原位色卡入口 | pass | 标题当前色块可点击并在所属色板内展开 12 个命名色卡；方向键、Esc、外部点击和焦点恢复已实现。选择“薄荷”得到 `#B5E3B5 / #07161D` 与 `12.81:1`。 |
| 草稿与真实浮窗 | pass | 有效草稿只进入 Controller 暂态预览，真实桌面伴侣实时刷新；保存水球态在预览期间临时显示卡片。取消、Esc、遮罩和卸载清除预览并恢复保存样式/颜色；确认只持久化一次完整配对。 |
| 浮窗职责 | pass | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 不含水纹主/辅色入口、编辑状态或对话框；悬浮子窗只显示效果，水纹设置仍在 Codex 配置页。 |
| 聚焦自动化 | pass | `npx vitest run ... -t "nearest contrast-safe|previews a paired card theme|edits card surface|keeps every color control|keeps invalid HEX"`：`3 files / 5 passed`，覆盖最近安全色、暂态预览/回滚/原子提交、双板/色卡、无原生 `type=color`、无效 HEX 与零浮窗水色控件。 |
| 类型与构建 | pass | `npm run typecheck` passed；`npm run build` passed，包含第二次 typecheck、Vite 双入口生产构建、runtime prepare 与 `validate:utools`。 |
| 浏览器矩阵 | pass | `1180×800`、`760×800`、`420×800` 与 `760×420` 均无页面横向溢出；窄屏单列、短高度可纵向滚动。420px 色卡层位于 `[32, 388]`，12 个选项全部在视口内。既有 8092 开发服务被复用，未停止或重启用户进程。 |
| 全量基线 | accepted-with-baseline | `npm test` 完整运行 `48 files / 496 tests`，结果 `45 files passed / 3 failed`、`486 passed / 10 failed`。RAW-054 新增用例全部通过；失败为重叠脏树中的 1 个 alias 投影、1 个归档 evidence、8 个既有 Codex UI 合同，不归因于本增量且未 reset/改断言。 |

结论：RAW-054 的实现、自动化、生产构建/uTools 与浏览器矩阵形成闭环，增量状态为 `accepted-with-baseline`。未执行真实 Codex 状态写入、归档、项目移除、发布或进程操作；RAW-052–053 的用户独占验收状态不被本节覆盖。

## RAW-052–053 当前交付状态

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 常显操作区 | implemented / unverified | 任务 `顶/隐显/归确/+`、项目 `顶/移确/隐显/+` 已接入固定 `30px` 槽；状态与短字符说明层为自有 200ms 不透明浮层，无原生 `title`。 |
| 项目隐藏 | implemented / unverified | `hiddenProjectKeys/hiddenProjects` 只过滤项目页分组，任务数组和计数保留；旧 removed 字段在归一化时丢弃。 |
| 真实项目移除 | implemented / unverified | Host 接受短期 alias + 指纹，包含桌面进程阻止、主文件-only 校验、限定字段、主/备同步临时写入、原子替换、双重核验、回滚和五种结果码；未对真实状态执行。 |
| Quick Jump | implemented / unverified | 主窗口与悬浮子窗普通标记改为深色/白粗字/白描边，激活标记改为黄色/深色字/深描边，删除粉紫交替。 |
| 置顶反馈 | implemented / unverified | 所有任务/项目卡片统一投影 `native/local` 来源；任务在当前页签/状态段内置顶优先，项目进入 `Pinned`；RAW-058 已把本地来源从行尾文字迁到 warning 色 `顶` 控件及说明，动作桥接失败仍明确提示。 |
| 自动化契约 | updated / not run | Domain、Controller、UI、bridge 和 Quick Jump 测试契约已同步；依项目规则未运行任何测试。 |
| 本机与真实写入 | not run | 未运行 typecheck、build、uTools/runtime、截图、真实 Codex 预检、归档生命周期或项目移除；未修改本机 Codex 全局状态。 |

结论：`未校验，待用户验收`。RAW-054 的通过证据不得用于宣称 RAW-052–053 已 accepted；RAW-051 及更早的通过记录仅保留为历史基线。

## Historical Acceptance Results Through RAW-051

| Check | Result | Evidence / Scope |
| --- | --- | --- |
| 原生状态与项目归属 | pass | 主文件 allowlist、无效主文件才回退 `.bak`、assignment > projectless > 最深 cwd > 排除、原生置顶/项目顺序和空项目均有回归；Renderer 不接收路径或原始身份。 |
| 完整库存与指纹 | pass | `archived=false` 完整翻页、重复 ID 去重、游标循环/无效/安全上限拒绝；扫描前后指纹变化重试一次，再变化拒绝；Controller 首次失败为空态、有已验证快照时 stale 保留。 |
| latest Turn / 30 天 | pass | 每个候选读取最新 Turn；存在 Turn 但缺 `startedAt` 整批失败；零 Turn 排除并统计。30 天边界包含，所有任务页签严格 `lastTurnStartedAt desc`，不以 `updatedAt` 回退。 |
| 六页签与项目结构 | pass | `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目`、动态页`待输入 → 当前动态 → 已完成未查看`优先级、Pinned/Projects/Chats 顺序、不重复任务、空项目和搜索过滤均覆盖。 |
| 本地元数据 | pass | 默认/最后页签、项目折叠、1–365 天窗口、别名、本地置顶顺序、本地移除和 absent→present 自动恢复完成迁移回归；存储不含原始 ID/路径/任务列表。 |
| 选择与确认 | pass | 会话单击只聚焦/选择，双击或 Enter 打开；Ctrl/Cmd/Shift/Space 多选、Space 新增后下移、不可见项清理、右键未选先单选/已选保留多选、项目右键清任务选择与 5 秒二次确认均覆盖。 |
| 快捷键与暂态层 | pass | 设置页可见/可改键 `codex.thread.createFocused` 默认 `Ctrl+T`；Tab、输入角色、layer、`when` 可达冲突隔离，浮窗本地 LIFO、composer 抑制、焦点恢复、唯一高亮所有权和抽屉键盘操作有覆盖。 |
| 单条归档 | pass | exact alias、source fingerprint、thread recency/version/latest Turn 重读，active/inProgress/变化/损坏形状拒绝；`thread/archive` 后同时验证 false 缺席与 true 存在，失败不乐观移除。 |
| 项目归档 | pass | 25 条模拟集成：20 条分批、并发 2；23 条双向归档成功、1 条 active 跳过、1 条验证失败保留，结果逐项返回。显示窗口不参与历史项目扫描。 |
| 额度、Spark 与默认模型 | pass | 普通 5 小时→普通周→最高 Spark 展示优先级、Spark `S`/同池周环、缺失窗口不算 0、任一真实普通窗口为 0 的 `quota-auto` 切换、首选普通模型、最高 Spark 与本次手选均有覆盖。 |
| 新会话编辑器与桥接 | pass | 每次入口均开 editor；目标/模型名与 ID/原因/额度、自动焦点、composition、Ctrl/Cmd+Enter、焦点圈定、冻结后 stale 二次确认、精确模型/cwd/no-fallback、首轮失败清理、清理失败停重试和首轮成功后重试打开均覆盖。 |
| Shift 预览与完整操作 | pass | 项目行只常显 `＋`，任务无 hover/action rail；纯 Shift 目标接管、Alt/Ctrl/Meta 抑制、Shift+↑/↓、鼠标归还、失焦/Escape/切层关闭、翻转夹紧/内滚和隐私字段白名单有覆盖。完整动作集中在右键/Ctrl+右抽屉，禁用原因与危险动作顺序保留。 |
| Quick Jump | pass | composer/抽屉/预览/遮罩互斥，裁剪祖先、pointer-events、视口与命中栈过滤通过；任务目标只聚焦，不绕过双击/Enter 打开合同。 |
| 浮动批量栏 | pass | 两项起显示 `已选 N/归/操/清`；下半区锚点置顶、上半区锚点置底，选择/焦点/滚动/ResizeObserver/窗口 resize 重算。不改变任务 DOM 顺序、行坐标或列表高度；不足两项关闭。 |
| 即时活动与角标 | pass | preload 状态通知立即发匿名 delta，200ms 单飞列表复核，连续三次失败退避 1s，结构变化转完整扫描；待输入/当前动态/完成未查看三角标、红色待输入文字、单待输入点击直开和完成任务成功打开后已查看均覆盖。 |
| 收起水球命中 | pass | 根容器进入与上半区 pointer enter/move 均不展开，角标 hover 250ms 保持稳定且点击仍路由；真实矩形中线以下立即展开，触屏 hover 被抑制，显式点击/键盘路径保持原合同。 |
| 卡片配对颜色 | pass | 旧配置迁移、三个预设、深/浅有效配对、低对比/畸形拒绝、水球深色门禁、HEX/HSL 往返、模态本地草稿、一次完整提交、取消零写入、ARIA 错误关联、焦点圈定/恢复均有聚焦覆盖。 |
| 会话层回退 | pass | 右键抽屉→详情→Esc→同目标抽屉→Esc→原会话行、直接 Ctrl+左打开详情后的同栈回退、确认优先取消、Ctrl 左右保留原触发点与批量抽屉一次关闭均有组件回归。 |
| 环境与隐私 | pass | 既有 GUI/NVM、PAC、mixed preload、macOS workspace、uTools 子窗和环境脱敏矩阵继续通过；新请求只跨散列项目键、短期 alias、指纹、模型 ID 与瞬时提示词。提示词不进入 action/快照/日志/存储/文档/错误记忆/Deep Link/剪贴板；raw ID/cwd/path 仍只在 preload。 |

## Historical Automated Gates Through RAW-051

- Focused gates: [codexNewThread.test.ts](../../../../tests/domain/codexNewThread.test.ts#L1)、[codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1)、[codexFloatWindowBridge.test.ts](../../../../tests/platform/codexFloatWindowBridge.test.ts#L1)、[action.test.ts](../../../../tests/runtime/action.test.ts#L1)、[keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1)、[codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) 与 [quickJump.test.ts](../../../../tests/ui/quickJump.test.ts#L1) passed；新增浮窗请求相关测试确认子 preload 不扩大 Node require allowlist。
- `pnpm test`: `48` files / `473` tests passed；覆盖水球上下半区命中/角标直点、额度/模型/创建/Shift/Quick Jump 增量、活动通道、会话投影、归档与全部既有功能回归。
- `pnpm typecheck`: passed。
- `pnpm build`: passed；Vite 双入口生产构建、canonical/public runtime 同步及 `validate:utools` passed。
- 本机 `codex app-server generate-json-schema --experimental` 确认 `ThreadStartParams` 支持 `model/cwd/allowProviderModelFallback/ephemeral`，`ThreadStartResponse` 顶层必含 `model/cwd/thread`，`TurnStartResponse` 必含 `turn`，`ModelListResponse.data` 与 `rateLimitsByLimitId` 形状均与实现一致。只读 `model/list` 同时确认当前目录含 `gpt-5.3-codex-spark`。
- Browser fixture QA: 380px 与 330px 展开态无横向溢出；330px composer 显示项目、`GPT-5.3-Codex-Spark` 名称/ID、自动原因与 97% Spark 额度，textarea 自动聚焦且按钮完整；330px 纯 Shift 预览和右键完整抽屉自动夹紧、内部可滚且不改变列表；104px compact 显示百分比上方 `S`、97% 与不重叠活动角标。普通 hover/action rail/native `title` 均不存在；既有批量栏避让/零行位移由回归覆盖。修订 5 不改 CSS 或几何尺寸，上下半区行为由注入真实 `94×94` 矩形的组件事件回归验证，未重复截图。

## Real Local Preflight

- 方案前只读基线：2026-07-21 10:03，`54` 条未归档原始任务 → `33` 条有效原生项目任务 → 近 30 天 `27` 条，其中已完成 `24`、进行中 `3`。
- 修订 3 最终生产桥接预检：`node scripts/codex-real-preflight.mjs 30` 返回 Host V2、`completeness=verified`、严格排序通过；动态值为 `54 → 33 → 27`，排除 `21` 条已移除/未注册项目任务，已完成 `25`、进行中 `2`。本机服务端只返回 Weekly `9%`，没有伪造 5 小时窗口。
- 动态数量会随本机任务状态和额度变化；验收固定的是完整分页、项目顺序/归属、严格 Turn 时间、窗口和完整性门禁，而不是某一瞬间数量。
- 原生 Pinned 项目顺序验证为：`km-srm-ref → EyPc → EzDesign → EzAgentPlatform → CodeNote → EzCodexGpt → EyTrade`；其余 Projects 和 Chats 继续按原生状态投影。
- 修订 4 只读额度探针返回两个独立池：普通 `codex` 仅周窗口、`usedPercent=94`；`codex_bengalfox / GPT-5.3-Codex-Spark` 仅周窗口、`usedPercent=2`。该动态值只证明本机可直接区分读取，产品验收固定的是池分类、窗口缺失语义与展示/模型策略，不固定瞬时百分比。

## Real Archive Lifecycle

- [codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) 具有显式 `--create-temp-task` 写入门禁。
- 首次零轮次探针证明 `thread/start` 后没有 Turn 的条目不会进入 `thread/list` 任一分区；该探针已调用归档清理，未操作现有任务。
- 正式专用临时任务创建一轮最小文本 Turn，等待 completed 后验证：初始只在 `archived=false`；归档后只在 `archived=true`；unarchive 后只在 `archived=false`；最终再次归档并确认只在 `archived=true`。
- 真实验收未归档、删除或重命名任何用户现有任务；项目批量归档只执行模拟集成测试。
- 修订 3 没有修改归档实现或接口，因此不重复创建写入型临时任务；沿用同一已通过生命周期证据，本轮只执行真实只读库存预检，用户现有任务保持未操作。

## Findings And Residuals

- P0/P1/P2 source finding: none after reconciliation。
- App Server 没有 conditional archive；重读与写入之间的新活动仍是 provider TOCTOU 残余。
- RAW-056 已接入当前 macOS Codex Desktop 私有 IPC live authority，但尚未做真实宿主验收；协议版本漂移、桌面未运行/不兼容时的未知降级和 Windows 对应通道仍是显式残余。
- 归档刷新通知只确认 frame 已派发，不能证明 Codex Desktop UI 已消费；真实“无需重启即可消失”仍待用户验收。
- 真实 Windows uTools 运行时/系统热键、真实系统听写、真实 `turn/start`/Deep Link、多显示器/DPI 和 macOS 两个普通 Space + 一个全屏 Space 仍是宿主观察项；本轮按计划不创建真实任务。
- Project AI-rule audit 在补充 `EYPC-UTOOLS-HOST-001` 后仍只返回此前已记录的 6 条 adapter/governance baseline 缺口（文档模板合同、模板传播、v3-route、W24/W28/W30），没有新增指向本次宿主边界规则或错误共识的问题。`HEAD` 视图因 `git_view_materialization_failed` 未能生成，因此“未新增”以当前命名问题集合与本文件既有基线记录对照，不宣称完成独立 HEAD 重放。
- Error memory: RAW-051 新增 [codex-coupled-color-editor-atomicity.md](../../../knowledge/error-memory/codex-coupled-color-editor-atomicity.md#L1)，记录“两个独立原生单色选择器不能构成耦合颜色编辑器”的可复用事务规则；此前协议核验记录继续有效。
- 零轮次 list 行为已由预检统计、自动化和真实生命周期记录直接覆盖，不另建错误记忆；它是协议边界而非生产回归。

## Acceptance

- Root decision: RAW-051 requirement、implementation、聚焦自动化、真实浏览器矩阵、生产构建/uTools 与文档/错误记忆形成闭环，增量 accepted；实施前已存在的 9 个失败维持 declared baseline，不作为本增量失败，也未通过 reset 或改写断言掩盖。
- Document impact: `requirement-canonical + project-current + controlled-task + project-memory` synchronized。
- Sidecar: 只读探索结果已由 Root 复核并接纳；最终写集、真实任务门禁、diff、测试和文档由 Root 独占验收。

## Revision 2026-07-22.2 Pending User Validation

- 已实现项目 Tab 的四段置顶顺序、置顶会话去重与 Chats 标题下展开；紧凑角标提示收敛为三个短计数文本。
- 已将 Codex Tab 非编辑区域的 `Ctrl+F` 与 `F` 同步为 Quick Jump，并将会话搜索迁移至 `Ctrl+Shift+F`；多选状态不阻断该入口。
- 已修复配置页即时监听器早于 `activeThemeOption` 初始化造成的 TDZ 挂载异常。
- 未执行测试、类型检查、构建、uTools/runtime、截图或真实 Codex 操作，原因是项目规则将这些验收保留给用户；状态：`未校验，待用户验收`。

## Revision 2026-07-22.3 Pending User Validation

- 已增加 `Shift+Escape → return-focus` 子浮窗桥：只临时隐藏 BrowserWindow 并让宿主恢复之前的窗口焦点，不修改 Companion 开关或持久化状态。
- 已增加渲染与 preload 桥接测试契约；未执行测试、类型检查、构建、uTools/runtime、截图或真实 Codex 操作，状态：`未校验，待用户验收`。

## Revision 2026-07-22.1 Evidence

- Focused increment: `pnpm exec vitest run ... -t <RAW-051 cases>` 通过 `4 files / 11 tests`，覆盖迁移、预设、深浅配对、畸形/低对比拒绝、水球门禁、HEX/HSL、Controller 原子更新、模态事务以及 Esc/focus 栈。
- Full suite: `pnpm test` 运行 `48 files / 487 tests`，结果 `478 passed / 9 failed`。失败集合与实施前聚焦基线一致：8 个位于重叠 Codex UI（旧单击/多选/批量栏/title/quota-auto/Tooltip 文案合同），1 个为归档证据期望 `terminal` 而当前投影为 `unknown`；RAW-051 新增用例无失败。
- `pnpm run build` passed，并在同一命令中通过 `vue-tsc --noEmit`、Vite 双入口生产构建、canonical/public runtime 准备及 `validate:utools`。
- Browser QA: 配对颜色模态在 `1180×760`、`760×760`、`420×760`、`420×480` 均为 `scrollWidth === clientWidth`；宽屏两列、420px 单列，短高度 `clientHeight=462 / scrollHeight=980` 可纵向滚动。每个尺寸都存在两组颜色字段、零个 `type=color`，无文档横向溢出；Console 只有既有 favicon 404。
- Scope: 未增加依赖、未写数据库/权限/外部服务、未发布、未操作 Codex 任务或进程。浏览器开发服务受 120 秒边界控制并已正常结束。

## Revision 2026-07-23.1 Static Verification Pending

- 已核验本机 Codex Desktop 存在真实 Side Chat live stream；Side Chat 未进入普通 inventory，但 snapshot/patch/follow/read-state 可由 preload shadow 通路接收并聚合到主对话。
- 历史实现曾让其它 activity、普通未读和 Side Chat 关系走单一 2 秒稳定窗口；该路径已由 RAW-089 删除。当前 Activity Delta 立即投影，只有 completed 展示保留可配置稳定窗。
- 已实现主对话隐藏导航目标选择与 Deep Link 失败回退逻辑；本轮未执行真实打开动作，因此 Side Chat 直跳仍标记为“未验证”，不写入 publish log 能力承诺。
- 按用户要求仅执行 `git diff --check`、`pnpm run typecheck` 与静态结构核验；不执行自动化测试、build、截图、uTools 宿主验收或额外自动化测试。

## Revision 2026-07-29.5 RAW-114/115 Reported

| Check | Status | Evidence |
|---|---|---|
| Actions/Environment 可见块 | implemented / source-verified | [FloatApp.vue](../../../../src/FloatApp.vue#L1) 不再包含 `float-action-slots`、picker、Environment state/轮询/确认；[float.css](../../../../src/styles/float.css#L1) 仅删除对应 UI 样式，通用 action hint 保留。五个卡内命令转发既有 Controller action。 |
| 自动收缩 | implemented / source-contract | pointer/focus departure 与 window blur 共用 `FLOAT_COLLAPSE_DELAY_MS=220`；blur 清除临时确认/提示并调度收缩，composer/panel/alias/Quick Jump/Shift preview/resize 仍阻断。既有 UI 合同覆盖 pointer 与 blur，但未运行。 |
| 原生状态差异诊断 | observed / non-acceptance | 同时只读观察到 Codex 任务接口为 1 个 active，而插件展开态为 0 动态/0 近期任务。该匿名聚合只用于定位库存注册缺口，不证明修复后的实时性。Codex App 本体因 Computer Use 安全边界不可直接操控。 |
| dirty exact registration | implemented / source-contract | [preload/index.js](../../../../preload/index.js#L1) 对本轮 dirty 且 `thread/list` 缺行的合法 ID 执行一次有界 exact `thread/read`，只有同一 identity/合法状态且通过原生项目、latest Turn、匿名 alias/fingerprint 门禁才进入 inventory；没有占位卡或额外 active count。 |
| pending live shadow | implemented / source-contract | `updateInventory` 只保留从未登记且仍 live active 的 main shadow；已登记后缺失、idle/terminal、归档、断桥/会话清理仍按既有路径清除。测试合同覆盖首次 exact read 错配后 list 追上并恢复 waiting-input，但未运行。 |
| 自动化/构建/宿主 | not run / user-owned | 依本任务授权不运行 tests、typecheck、build、uTools 验收或真实任务状态切换。仅做限定范围差异、残余逻辑、preload 镜像、Markdown 链接与 `git diff --check` 静态核验；最终结果保持 `reported / 未校验，待用户验收`。 |
| 限定静态核验 | pass | Float/CodexPage 不再调用动态投影、窗口计时或状态成员筛选；仅保留标签/图标映射和包内数量读取。Actions/Environment Renderer 状态与专属样式残留为零；`preload/index.js` 与 `public/preload.js` 字节一致；本轮限定代码/测试/文档及 CodeNote 派生文件的 `git diff --check` 和 Markdown 代码链接审计通过。 |
