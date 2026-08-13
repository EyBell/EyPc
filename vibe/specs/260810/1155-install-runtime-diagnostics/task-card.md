# RAW-160 → RAW-166 Companion 收敛 — Controlled Task Card

Date: 2026-08-13
Status: `RAW-166 increment-automated-verified / rebuilt-artifact-ready / documentation-synchronized / dev-plugin-reload-pending`
Documentation level: `controlled`

本任务沿用 RAW-159 的 Controlled 任务树和稳定同步组；RAW-159/160 的库存、归档事务、诊断、Runtime Identity、分页和 hidden-Host watcher 成果作为 V4 基础保留。RAW-161 追加 Codex 外部手动归档的原始权威库存恢复，RAW-162 追加 Goal-aware 完成边界，RAW-163 保留 parent-only 打开合同，RAW-164 追加库存 Side Chat 拓扑与全珠子聚合；RAW-165 修复库存终态伪新鲜、跨 transport 分支身份漂移、Side 权威泄漏、注意力优先级、最终推送判定，并用 Claude App 完成/焦点热事件覆盖 LevelDB 落盘延迟。RAW-166 再补齐双向 phase admission、phase/unread/Goal 独立 lane、proposal/final 诊断与全量错误记忆唯一责任路由；均不另建重复任务。

## Task Documentation Sync Group

- Group key: `dsg:eypc:install-runtime-diagnostics-v2`（稳定键不随协议升级改名）
- Group owner: this `task-card.md`
- Scope: Codex/Claude 任务证据、事件时因果合并、进程 Host native watcher/StatWatcher 恢复、Codex 未归档/归档库存成员对照、`sessionId/forkedFromId` Side Chat 拓扑、私有全分支聚合与单事务发布、Claude 完成/焦点热未读、Canonical 状态、Plan 生命周期、暂停/恢复/执行、同 key parent-only 打开与 alias 恢复、时间窗口、角标几何/循环、Latest Package 缓存、Float applied ACK、归档结果与运行身份诊断。
- Shared-file ownership: 保留同一工作树内全部用户修改；不触碰用户的 `_to_delete/`。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:install-runtime-diagnostics-v2",
  "group_owner": "vibe/specs/260810/1155-install-runtime-diagnostics/task-card.md",
  "documents": [
    "AGENTS.md",
    "CLAUDE.md",
    "vibe/rules/documentation.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/task-card.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/raw-requirement.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/spec.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/plan.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/tasks.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/verify.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/handoff.md",
    "vibe/specs/260718/1148-codex-quota-float/raw-requirement.md",
    "vibe/specs/260718/1148-codex-quota-float/spec.md",
    "vibe/specs/260718/1148-codex-quota-float/plan.md",
    "vibe/specs/260718/1148-codex-quota-float/tasks.md",
    "vibe/specs/260718/1148-codex-quota-float/verify.md",
    "vibe/specs/260718/1148-codex-quota-float/handoff.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/rules/README.md",
    "vibe/knowledge/error-memory.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/chromium-placeholder-window-title-noise.md",
    "vibe/knowledge/error-memory/codex-completion-transition-hysteresis.md",
    "vibe/knowledge/error-memory/codex-turn-completion-is-not-goal-completion.md",
    "vibe/knowledge/error-memory/codex-preload-capability-version-skew.md",
    "vibe/knowledge/error-memory/codex-app-server-session-state-survives-exit.md",
    "vibe/knowledge/error-memory/codex-provider-status-display-normalization.md",
    "vibe/knowledge/error-memory/codex-stale-live-active-needs-completion-order.md",
    "vibe/knowledge/error-memory/codex-stale-live-unread-false-blocks-completion-unread.md",
    "vibe/knowledge/error-memory/codex-water-preview-renderer-divergence.md",
    "vibe/knowledge/error-memory/codex-task-count-list-projection-divergence.md",
    "vibe/knowledge/error-memory/codex-task-state-version-skew-must-degrade-atomically.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "vibe/knowledge/error-memory/companion-consumer-cache-and-float-applied-ack.md",
    "vibe/knowledge/error-memory/claude-generic-session-end-must-not-overwrite-completion.md",
    "vibe/knowledge/error-memory/claude-new-phase-must-outrank-previous-cache.md",
    "vibe/knowledge/error-memory/companion-observation-generation-is-not-semantic-revision.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/knowledge/error-memory/error-memory-flat-index-lacks-primary-ownership.md",
    "vibe/knowledge/error-memory/fixed-field-projection-drops-declared-data.md",
    "vibe/knowledge/error-memory/tri-state-collapsed-to-boolean-hides-remedy.md",
    "vibe/knowledge/error-memory/utools-macos-cross-api-window-title-mismatch.md",
    "vibe/knowledge/error-memory/utools-mainhide-window-activation-diagnostics.md",
    "vibe/knowledge/error-memory/utools-onpluginout-hidden-vs-process-exit.md",
    "vibe/knowledge/error-memory/utools-window-target-auto-rebind-after-restart.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/modules/engineering-contracts.md",
    "vibe/knowledge/error-memory/modules/interaction-and-favorites.md",
    "vibe/knowledge/error-memory/modules/runtime-and-packaging.md",
    "vibe/knowledge/error-memory/modules/window-jump-and-native-host.md",
    "vibe/knowledge/error-memory/utools-developer-tools-project-list-loading.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/knowledge/computer-use/sessions/2026-08-12-raw-160-companion-regression.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/raw-requirement.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/spec.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/plan.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/tasks.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/verify.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/handoff.md",
    "src/help/guides/codex.md",
    "src/help/guides/settings.md"
  ],
  "dependencies": [
    "package.json",
    "preload/claude/archive.cjs",
    "preload/claude/app-state.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/claude/events.cjs",
    "preload/claude/index.cjs",
    "preload/claude/unread.cjs",
    "preload/index.js",
    "preload/float.js",
    "preload/companion/navigation.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/task-kernel.cjs",
    "src/domain/codex.ts",
    "src/domain/codexPresentation.ts",
    "src/domain/companionProvider.ts",
    "src/domain/companionTaskPackage.ts",
    "src/platform/eypcPlatform.ts",
    "src/runtime/appRuntime.ts",
    "src/runtime/codexController.ts",
    "src/App.vue",
    "src/FloatApp.vue",
    "src/pages/CodexPage.vue",
    "src/main.ts",
    "src/float-main.ts",
    "src/styles/companion-counter.css",
    "src/styles/codex.css",
    "src/styles/float.css",
    "scripts/utools-runtime-identity.mjs"
  ],
  "validators": [
    "scripts/validate-error-memory.mjs",
    "tests/domain/claude.test.ts",
    "tests/domain/claudeCode.test.ts",
    "tests/domain/codex.test.ts",
    "tests/domain/codexEnvironmentPresentation.test.ts",
    "tests/domain/codexPresentation.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/integration/appPluginEnter.test.ts",
    "tests/integration/featureRouting.test.ts",
    "tests/platform/claudeAppStateBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/claudeUnreadBridge.test.ts",
    "tests/platform/claudePreloadCore.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/platform/codexFloatWindowBridge.test.ts",
    "tests/platform/companionTaskActionsBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/companionNavigationBridge.test.ts",
    "tests/platform/eypcPlatform.test.ts",
    "tests/platform/runtimeIdentity.test.ts",
    "tests/platform/runtimeDiagnostics.test.ts",
    "tests/platform/runtimeDiagnosticsProbe.test.ts",
    "tests/platform/runtimeDiagnosticsLevelContract.test.ts",
    "tests/platform/processBridge.test.ts",
    "tests/runtime/claudeCompanionController.test.ts",
    "tests/runtime/claudeCompanionWatcherE2E.test.ts",
    "tests/runtime/codexController.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "scripts/validate-utools-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "preload",
    "public",
    "scripts",
    "src",
    "tests",
    "vibe/specs/260810/1155-install-runtime-diagnostics",
    "vibe/specs/260718/1148-codex-quota-float",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge",
    "vibe/rules/README.md"
  ]
}
```

## Requirement Change Review

| 类型 | 旧条款或缺口 | RAW-160 当前处置 |
| --- | --- | --- |
| supersede | 任意 exact interrupted 立即 stopped | 普通中断须 idle 复核；Plan 中断须确认无更新 Turn、活动或等待；冲突时保留稳定态并 `verifying` |
| supersede | 任意新 Turn 清除 Plan | 只有确切非 Plan/default 执行 Turn、明确放弃、完成、归档或移除清除 `planReady` |
| supersede | Plan-ready 使用普通隐藏 | 使用持久化 Plan 暂停；旧隐藏且仍可证明 Plan-ready 的任务幂等迁移 |
| supersede | stopped 全部退出通用循环 | 仅 `stopped + planReady + !paused` 进入既有 Plan 层并突破动态小时窗口 |
| supersede | Kernel no-op 足以阻止重复 UI | Kernel、Host、Main、Float、Navigation、Actions 各自缓存 revision/selector 指纹 |
| supersede | Float snapshot-send 即 UI 已更新 | 使用 `received/applied/rejected` ACK；500ms 重发一次，1s 后按健康心跳受控重建 |
| supersede | Renderer/Controller/Preload 分别裁决状态，且 Preload 的临时父投影被误当成完整分支裁决 | Preload 只采集拓扑和原始证据并向私有 Branch Evidence Store 发布；V4 Kernel 独占父聚合、phase、Plan、分组、计数、循环、可见性与能力；Domain 只投影 |
| supersede | `unknown` 或新 hydration-only `active` 保守回退为 Codex running/verifying | `unknown` 是 abstain：保留可信库存语义且不进入动态组；没有实时 Turn/增量/processing 证据的新任务不得继承 running 前态 |
| supersede | 卡片 `actionAlias/revision/phase` 是打开前的硬身份，任一落后即由 Actions 拒绝 | Renderer target 只作版本提示；Host 已持有同 key 时直接使用进程当前 target，不读库存、不比较旧字段、不返回 `stale-target`；仅 Host 目标/私有映射缺失或能力不可用时定向解析并只恢复同 key |
| supersede | Renderer 焦点属于公开任务包语义，点击/聚焦可推进 package revision | 焦点只属于 Host 私有动作上下文；更新焦点不得发布任务包、触发筛选/分类或重投影 Float |
| supersede | 单数字角标 `min-width:26px` 加等宽/tabular 数字 | 恢复 `20×20` 单数字圆形；两位数及 `99+` 自然扩宽，预览与 Float 使用同一几何合同 |
| supersede | `codex.input.open` 无待输入候选时回退到本地置顶 | 待输入直接入口只使用全部可见的真实输入/审批候选；本地置顶仅保留在普通前后循环最后一级 |
| supersede | 原生 `Implement Plan` 请求、default collaboration mode 或当前 model 不可得时禁用 Plan 暂停/执行 | 已确认完成的 actionable Plan 始终可暂停/恢复/执行；`planImplementation` 只决定循环优先层，不是菜单能力门禁。第二次确认时 Host 仍精读活动/其它待决请求；原生 default 路径不可得则向同一任务发送一次私有固定执行指令 |
| supersede | Claude Hook/App 日志、任务成员关系与未读首变化依赖 timer，漏通知依赖隐藏 Renderer 的 interval | 进程 Host 在 native file callback 同步 drain/read；已登记任务文件与 LevelDB 文件由 Node `fs.watchFile` 以 1 秒恢复，Controller 不再轮询；部分 JSON 保留最后可信成员关系，语义相同零 revision/零 Float 推送 |
| supersede | Codex native unread 只用可能丢失/失效的目录 `fs.watch`，首读经 25ms timer；Renderer `phaseOnly` 轮询被误当成恢复兜底 | 进程 Host 立即读取目录回调，已登记 state/rollout 文件用 1 秒 StatWatcher 补漏，watcher error 自动重建；Renderer 不再周期轮询 phase |
| supersede | exact active/turn-started 可让 persisted unread true 跳过终态复核 | unread false→true 对仍 active 的同 key 强制 latest-Turn 复核；未读不直接推 terminal，较新正向 evidence sequence 拒绝迟到结果 |
| supersede | 私有 Branch Evidence 与同源公开 Activity 各自发布，单个 Provider event 可产生两次 revision | Branch Evidence deferred staging，与匹配 Host draft 在一个 Kernel 语义事务中提交；一次变化最多一次 revision，同值恢复信号零推送 |
| supersede | Claude App 状态/归档仅允许 `1.26832.0` | 固定隐私安全日志语法与单字段元数据事务均经核验后允许 `1.28929.0`；未知相邻版本继续 fail closed |
| add | Plan 生命周期 | `planReady / planLifecycleRevision / paused`，并明确生成、修改、确认、中断、执行与清除因果 |
| add | Plan 操作 | 四槽 `顶/暂/归/执`、`顶/恢/归/执`，批量暂停/恢复和抽屉内新会话 |
| add | 安全执行原 Plan | Actions v2 两击确认、single-flight、同 key alias 恢复、open→resume→单次 start、原生 default 优先/同任务固定指令兜底、indeterminate 定向复读 |
| add | Claude 状态新证据优先 | 新 `session.phase` 与 phaseRevision/statusEnteredAt/unread/capabilities 原子更新，旧缓存不得反压 |
| add | Codex Desktop 外部归档无广播恢复 | Host 同时监听精确 `sessions/archived_sessions` 成员目录；快路或 1 秒 StatWatcher 唤醒后完整对照 `thread/list archived:false/true`，确认目标只在 archived 库存即发送 `archivedKeys` 并立即移除 |
| supersede | 缺失脏任务可直接 `thread/read` 补回 | dirty recovery 先减去完整 archived 库存；已归档任务不得再被读回活动库存 |
| add | 生命周期强制对账 | 插件进入、Desktop IPC 重连与 membership watcher 重建均执行一次 Codex provider-scoped tasks-only 对账 |
| add | 待继续直接归档 | stopped 不需伪改 completed；行内/菜单直接进入既有两次确认，Provider 写前复核恢复运行/目标变化 |
| retain | RAW-159 基础 | 无固定库存上限、Codex 全分页、归档事务、Runtime Identity、诊断、semantic no-op 均保留并升级 |
| retain | Claude 归档成功边界 | 只确认 EyPc 元数据与活动库存收敛；提示明确原生侧栏未确认/当前不支持 |
| exclude | 强制 Claude 原生侧栏同步 | 禁止 AX/JXA、私有 IPC、LevelDB 写入、重启与 UI 自动化 |

### RAW-162 Goal-aware Completion Boundary

| 类型 | 旧条款或缺口 | RAW-162 当前处置 |
| --- | --- | --- |
| supersede | Codex 每个 exact `turn/completed` 都代表整个 Cloud 任务完成；更新 Turn 可再恢复 running | 有当前 Goal 时，Turn 只是 Goal 内部执行轮次；只有 Goal `complete` 才能发布任务 completed |
| add | App Server Goal 状态未进入 Companion Evidence | Preload 只在进程内保留 Goal status、updatedAt 与因果序号，通过 Kernel 私有 Branch Evidence 原子裁决 |
| add | paused/blocked/usageLimited/budgetLimited 没有稳定 Cloud 映射 | 统一映射内部 `stopped`，可见为“待继续” |
| retain | 无 Goal 的普通会话完成语义 | Goal 明确不存在或协议明确不支持时，继续按 latest Turn outcome 裁决 |
| exclude | 把 Goal objective、原始 thread/turn ID、额度或用量公开给 Renderer/诊断 | 这些字段不进入缓存投影、公共包、日志、收据或错误记忆 |

Decision source: 用户在 2026-08-12 明确选择“目标完成”为完成边界，并选择所有非完成但不可继续运行的 Goal 状态显示“待继续”；无未决分支。

### RAW-163 Main-first Side Chat Projection And Parent-only Open

| 类型 | 旧条款或缺口 | RAW-163 当前处置 |
| --- | --- | --- |
| supersede | 任一 Side Chat active/waiting/unread 无条件覆盖父任务 | main 非 completed-read 时只采用 main；main completed-read 后才聚合全部分支 |
| add | main 已读、Side Chat 已完成未读时父卡片没有明确合同 | 父任务进入 completed-unread，计数/分组/attention 同一 Kernel package 收敛 |
| supersede | main interrupted/stopped/completed-unread 可被 Side running 改成 running | main 自身不是 completed-read，故保持 main phase/unread |
| supersede | 打开时按 Side Chat 活跃优先级选 Deep Link，失败再回 parent | Electron/uTools 路径都固定打开 parent；无 Side Chat 首试与回退文案 |
| retain | 成功打开后的会话期 read acknowledgement | 仍覆盖 parent 与已知 Side Chat；失败不清未读，不写 Codex 原生状态 |

Decision source: 用户在 2026-08-12 明确要求“主任务非已完成已读时以主任务为核心；已完成已读后跟随 Side Chat；跳转只到主任务”；无未决分支。

### RAW-164 Side Chat Topology, All-bead Priority And Cloud Stability

| 类型 | 旧条款或缺口 | RAW-164 当前处置 |
| --- | --- | --- |
| supersede | RAW-163 仅在 main completed-read 后聚合 Side Chat | 根任务与全部已确认 Side Chat 始终进入 Kernel；任一珠子 running 优先于 completed-unread，completed-unread 优先于 completed |
| add | `thread/list` 中的 fork 被当成独立公共任务 | 以同一 `sessionId + forkedFromId + existing parent` 建立私有拓扑，嵌套解析到根；异常关系保持独立，公共包只发布根 |
| add | 活动珠子与完成未读并存时分组/计数边界不明确 | 父任务只进入 active，潜在 unread 私有保留；活动结束后才显露 completed-unread |
| retain | Goal status 是 Cloud 完成边界 | active/verifying Goal 抑制中间 Turn terminal；complete 后才按最终 unread 完成，严格更新的新 Turn 可开启新 epoch |
| add | 只能从进程时间推断是否加载新 Host | 增加语义去重的 `runtime-identity-handshake`，真实 `host-loaded` 成为实机验收前置门禁 |
| retain | 所有入口只打开 parent，成功打开后建立 Turn 绑定已读确认 | 不恢复 Side Chat Deep Link，不写 Codex 原生状态 |

Decision source: 用户在 2026-08-12 最新纠正中明确要求“所有珠子取最高优先级：进行中 > 已完成未读 > 已完成”，并要求核验日志、解决 Cloud 已完成未读漂移及新描述触发刷新；该决策取代 RAW-163 的 main-first 展示条款，无未决分支。

### RAW-165 Realtime Causality, Attention And Claude Hot Unread

| 类型 | 旧条款或缺口 | RAW-165 当前处置 | 受影响 owner |
| --- | --- | --- | --- |
| supersede | 库存 RPC 成功与本地扫描 sequence 被当成 terminal 因果新鲜度 | 读取成功只表示 observation；真实 terminal event 或可比较同一/更新 Turn epoch 才关闭 live | Codex Evidence Adapter、Kernel branch merge |
| supersede | branch ref 包含 transport lane，父 generation 可覆盖分支事件时 | branch ref 只由 parent/branch 决定；父 generation 只排序传输，完整快照逐分支合并 | Preload private branch store、Kernel |
| supersede | 普通 Side running 可覆盖 main waiting，Side App Server authority 可泄漏到 main | `approval > input/Plan > running > Goal > terminal`，authority 严格分支本地 | Kernel parent reducer、Preload evidence builder |
| supersede | Host 提议一经发送即记 accepted | 提交后比较最终 canonical package；冲突记匿名 superseded | Host diagnostics、Kernel package |
| add | Claude completion/focus 已实时可见，但 unread 只等 LevelDB 落盘 | exact live completion/focus 热覆盖；LevelDB 是 cold/recovery baseline，上一轮同值不得冒充追平 | Claude App state、Claude unread bridge |
| retain | 无第三方注入、无 App 存储写、无新状态、无长等待 | 不新增“未读核验中”、60 秒 hold 或轮询；多窗格 visible-but-unfocused 保持能力边界 | 产品/帮助/验收 |

Decision source: 用户在 2026-08-13 明确要求接入实时 Cloud 状态、核验并修复 Codex 更新/推送判断，同时否定 Claude 新增状态与 60 秒等待；随后明确追问 Claude 是否可实时确定。当前无未决实现分支；真实 Host reload 仍是独立接纳门禁。

### RAW-166 Global Error Resolution And Unified Judgement

| 类型 | 旧条款或缺口 | RAW-166 当前处置 | 受影响 owner |
| --- | --- | --- | --- |
| fix | 只阻止旧 terminal 覆盖 live，未阻止后到旧 live 清除新 waiting 或重开新 terminal | phase admission 双向比较 Turn epoch/event sequence；真实更新 Turn 才推进 | Kernel Branch Evidence Store |
| fix | 接受 phase 时整包替换分支，隐式清除未观察的 unread/Goal | phase、unread、Goal 独立选择并重新 normalize derived fields | Kernel branch merge |
| unify | Adapter proposal 在 Kernel 裁决前被记录为 accepted | Adapter 只 proposed；Codex/Claude Provider event 在 canonical commit 后判定 accepted/superseded/ignored/queued | Host diagnostics |
| govern | 99 条错误记录由扁平索引散列，Primary owner、生命周期和重复路径不可机器核验 | root→七责任模块→leaf；唯一 Primary、有限 Related、图 validator、candidate 只告警、superseded 逻辑归档 | Error-memory index/validator |
| resolve | RAW-163 main-first 展示条款仍残留在 current PRD，与 RAW-164 all-bead 冲突 | 按用户已明确的 RAW-164 决策删除 current 残留；RAW-163 parent-only 打开继续保留 | Requirement/spec/architecture |
| retain | 实时展示不应靠新状态或长等待 | 不新增状态、20/60 秒前置 hold 或更高轮询；真实事件即时发布，后采样仅验无回弹 | Runtime/Host acceptance |

Decision source: 用户在 2026-08-13 要求全量梳理错误集合、归档失效/重复路线、核验整体改造质量、统一结构化判断，并要求任何未决判断冲突必须提醒。RAW-163/164 冲突已有明确历史决策，因此直接消解；当前未发现需要新增用户选择的产品语义冲突。

RAW-142、RAW-150 与 RAW-159 仅上述冲突条款被取代；其余已验证基础和历史事实保留。

## 2026-08-11—12 Installed-host Regression Rework

- 先前的 `full-automated-verified / artifact-ready` 被真实 uTools 连续复现的缺陷否定，历史 gate 现记为 `host-reproduced-failure / rework`：运行分支被旧 idle 错判待继续、旧 alias 令全部待输入入口不可打开、单数字角标被无需求改成胶囊、Claude hidden-Host timer 延迟，以及 Codex 原生完成未读未进入 Host。
- 1.5.4 已精确加载 `host-fc14212e36723e3b4fbe / renderer-4dfbb00a631314bc45f5`，真实复现“主任务 API 仍 active、Float 却归为待继续”，否定第一份重建包。修复主任务新 Turn/active 撤销旧 idle 后，1.5.5 又精确加载 `host-6a76cc45575078bc2ced / renderer-0fa112cd0697e912ea85`；卡片、待输入和全局入口在同一 Actions 链重复返回 `stale-target`，Float 焦点回声同时连续推进 package revision，故 1.5.5 也被拒绝。
- 当前源码已完成私有 Branch Evidence Store、主任务 active 快路、Host 当前目标优先的同 key 打开、焦点零公开发布、abstain 无改判、精确待输入候选集和 `20×20` 角标合同；Controller 打开前也不再主动同步/重分类任务包。
- 随后真实日志定位出独立 P0：Claude Hook 已及时写队列，但隐藏 Host 的 50ms/1s JavaScript timers 分别让 running/completed 延迟约 45/93 秒；实际处理仅约 5ms。当前源码已把 Hook、App-log、任务成员关系与未读的首事件改为进程 Node native callback 即时 drain/read，已登记目标由 1 秒 StatWatcher 恢复，移除 Controller phase interval，并适配经固定语法/结构核验的 Claude App `1.28929.0`。部分元数据 JSON 写入不会把任务误删，重复指纹不会发布。Host→Kernel→Float applied 自动化锁定正常 `≤250ms`、漏通知 `≤1.25s`，stopped 直接归档也已覆盖真实 UI 派发和 Provider 复核。
- Codex 随后又以真实宿主日志确认 P0：原生状态已完成未读，但 Host 十分钟以上无新 activity，任务包停在旧 revision；Kernel/Float 接受既有事件很快，故不是 reducer/渲染慢。根因是 native unread `fs.watch` 可丢失/失效、首读仍经 timer、error 后不重建；Renderer `phaseOnly` 明确不读 persisted unread/latest Turn，无法补救。当前源码改为 Host 即时 callback、已登记文件 1 秒 StatWatcher、error 重建与原子 rename；unread true 强制同 key Turn 复核，并把 Branch/public evidence 合并为一次语义提交。
- RAW-160 全量构建身份为 `host-252d34393f05b238e278 / renderer-ff8fbe75184168a9e150`；前序影响选择矩阵 `20/20` 文件、`547/547` 项保留，最新 Codex 核心 `3/3` 文件、`221/221` 项，扩展 `15/15` 文件、`433/433` 项，全量 `83/83` 文件、`1328/1328` 项。RAW-161 当前身份见下节；1.5.4、1.5.5、`host-7d…`、旧开发 Host 与历史测试都不能替代当前开发模式重载后的验收。

## 2026-08-12 RAW-161 External Codex Archive Recovery

- 真实 Codex 日志已证明 Desktop 原生 `thread/archive` 成功，而 EyPc 未收到兼容广播；旧 Kernel 因此继续保留任务。这不是筛选残影，而是权威库存恢复缺失。
- [preload/index.js](../../../../preload/index.js#L1) 现在由进程 Host 精确监听 `CODEX_HOME/sessions` 与 `archived_sessions`。目录 rename 立即对照未归档/归档全分页库存；目录通知丢失时，1 秒 `fs.watchFile` StatWatcher 在 `≤1.25s` 恢复同一对照；watcher error 会重建并强制 tasks-only 对账。
- 仅当目标从未归档库存消失且明确出现在归档库存时，Host 才清理私有 shadow/cache 并发布匿名 `archivedKeys`，绕过普通缺行隔离；原始 ID、路径和清单内容不跨 Preload。
- 插件进入与 Desktop IPC 重连也强制执行一次 provider-scoped tasks-only 对账。EyPc 自己发起的归档仍受原双库存核验、Desktop ACK 与第二次核验事务保护，membership watcher 不旁路该后置条件。
- dirty-thread 恢复在 `thread/read` 前排除 archived inventory，禁止把已归档任务补回。
- 当前增量验证为 Codex Bridge `131/131`；focused recovery `5/5` 覆盖 4 条新增外部归档/漏通知/dirty archived/suppression-release 回归和既有 local indeterminate transaction guard，并通过 typecheck、1871-module production build、Preload 镜像/语法、uTools validator 与 diff 检查。当前构建身份为 `host-78205ae167fc7b27c653 / renderer-9c35abd09a8a390040c5`；此前 `host-252d… / renderer-ff8…` 是 RAW-160 全量基线，不是本增量待加载身份。

## 2026-08-12 RAW-162 Goal-aware Completion Stability

- 真实匿名发布链已把问题定位为 Host 状态误判而非 Float 闪烁：同一长期任务在 Goal 未完成时发布过 `running → completed → running`。RAW-162 因此以 Goal status 取代单 Turn outcome 作为有 Goal 会话的完成边界。
- [preload/index.js](../../../../preload/index.js#L1) 现在只在进程内缓存有限 Goal status、updatedAt、freshness 与因果序号；冷启动/重连按既有并发上限读取，updated/cleared 实时更新，任何 active/未知过期 Goal 下的终态候选都先 single-flight 补读，Goal 完成通知漏失也不会永久卡在 running。暂时失败和真实 5 秒 RPC timeout 都保留稳定非终态为 `verifying`；只有明确 method-not-found 才兼容回退。
- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 在私有 Branch Store 内让 active Goal 跨自动 Turns 保持 running，四类非活动状态进入 stopped/“待继续”，complete 单次完成；严格更新的新 Turn 可取代旧非活动 Goal 开启新 epoch，同精度时间戳由更大流序号裁决，Goal cleared 会释放 Goal 来源的 running/待继续权威并回到 Turn 语义；任一分支 Goal 未知时不会被另一个 complete 分支提前完成。
- Goal-only 变化使用受限的私有证据强制提交，不再被相同公开线程指纹吞掉；Branch Evidence 与 Host draft 仍只形成一个原子 task-package。公共 Activity、Main、Float、诊断和错误记忆没有 Goal objective、原始 ID、额度或用量字段。
- 受影响完整测试为 7 个文件、333 项：Bridge `138/138`、Kernel `39/39`、Controller+Task Package `62/62`、Float Bridge+Presentation `89/89`、Runtime Identity `5/5`；typecheck、1871-module build、canonical/public/dist Preload、uTools validator 通过。当前构建身份为 `host-c36f104c3a4cd42e77c2 / renderer-27b635545542097fd7b1`。未重载开发插件，真实跨两个自动 Turn canary 仍待用户门禁。

## 2026-08-12 RAW-163 Main-first Side Chat Projection And Parent-only Open

- [preload/index.js](../../../../preload/index.js#L1) 以既有缓存/实时 unread authority 为每个私有 main/Side 分支提供有限角色和 unread evidence；子分支不借用父级 connector unread，原始 parent/child ID 不跨 Host。
- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 先判断 main 是否 completed-read。否则 selected scope 只有 main；满足门槛后才按既有因果顺序聚合全部分支，并将 phase/unread 在同一 canonical task 提交。
- `openCodexThread` 删除 Side Chat 活跃优先级与 fallback，只对 parent 构造 Deep Link。成功打开仍保留 parent+known Side 的会话期已读提示。
- Bridge+Kernel `177/177` 通过，包含四组主/子状态优先级、canonical view/count 收敛、隐私字段和 active Side 仍只开 parent；canonical/public 语法与镜像、typecheck、1871-module build、uTools validator 通过。当前身份为 `host-2c01a8beb95919a22af5 / renderer-cc3ff8f60b7179ed599f`。
- 15 份改动 Markdown 的 code-link、当前合同残留、diff 与 documentation sync group 审计已收口；项目 broad rule baseline 仍为 137 项既有债务，本轮 RAW-163/owner/源码关键词命中 0 项。

## 2026-08-12 RAW-164 Side Chat And Cloud State Convergence

- [preload/index.js](../../../../preload/index.js#L1) 现在从 App Server 库存建立私有 Side Chat 拓扑：同 session 的有效 fork 解析到根，分页乱序由完整库存后统一裁决，异常/缺父关系保持独立；根任务独占公共行，child 只形成私有 Branch Evidence。Desktop side 判定优先于 inventory membership，运行事件、快照、重连和归档不会重新制造 child 顶层行。
- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 删除 main completed-read 门槛并始终聚合全部珠子。running 压过 completed-unread，completed-unread 压过 completed；活动时 unread 仅作潜在证据，公共 active/unread 分组与计数互斥。
- Goal active/verifying 继续阻止中间 Turn completed/completed-unread；Goal complete 后按最终 unread 单次落位。旧 unread、旧完整快照、重复 Goal 通知和同 Turn 补全不能回滚成功打开后的 completed-read。
- 新增语义去重的匿名 `side-topology-decision`、`parent-state-decision` 与 `runtime-identity-handshake`，均不记录原始 ID、标题、正文、路径、Goal 内容、预算或用量。
- Bridge、Kernel 与 Runtime Diagnostics 定向矩阵共 `189/189` 通过；最终复核额外锁定 Desktop-only Side 的父/子 Turn 已读绑定，以及库存归类后清理旧 child action alias，避免旁路打开 Side。canonical/public 语法与镜像、typecheck、1871-module production build、runtime validator 和 diff 检查通过。RAW-164 artifact 为 `host-251a728efafbf4c7f7d6 / renderer-a671d108ff9d315b7ea4`；其 Host gate 已由 RAW-165 当前 identity 取代。
- 17 份改动 Markdown 的 code-link 与当前合同残留审计通过；项目级规则审计保留 133 项既有 broad debt，按 RAW-164、当前任务树、Companion module 与本轮状态错误记忆过滤为 0 项。`51 documents / 26 dependencies / 28 validators` 同步组和 final receipt 已按本任务 owner 收口。

## 2026-08-13 RAW-165 Realtime Cloud And Claude Hot Unread

- [preload/index.js](../../../../preload/index.js#L1) 不再把库存读取成功当作 terminal 因果更新，branch ref 跨 connector/Desktop/App Server 稳定，Side live authority 不泄漏到 main；Host 提议只在最终 Kernel canonical task 一致时记为 accepted。
- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 按稳定分支引用和 Turn epoch 合并完整快照；父 generation 仅排序传输，旧/inventory terminal 不覆盖更新 live/waiting。父级优先级现为 approval → input/Plan → running → Goal → terminal。
- [app-state.cjs](../../../../preload/claude/app-state.cjs#L1) 与 [index.cjs](../../../../preload/claude/index.cjs#L1) 用 exact live completion/focus 建立热未读覆盖，LevelDB 仅作 cold/recovery baseline；不增加新可见状态、60 秒等待、轮询或第三方 UI/存储写入。
- 最终受影响 8 文件、`364/364` 测试，Preload 同步/镜像/语法、typecheck、1871-module build 与 uTools validator 通过。当前 artifact 为 `host-649d5936516471adcf60 / renderer-7aa872e3d99f003ac3a0`；开发插件未重载，真实事件→Float applied 验收待宿主门禁。
- 文档同步组现为 `51 documents / 27 dependencies / 28 validators`；本节与 RAW-165 的 spec/plan/tasks/verify/handoff、项目状态、架构、帮助和既有错误记忆共同收口。

## 2026-08-13 RAW-166 Global Error Resolution And Bidirectional Causality

- 全量盘点 99 条 leaf：69 verified、21 candidate、9 superseded、0 retired；无重复 id/fingerprint。三个旧 `archived` 状态已归一为 superseded，重复的 stale-live active 路线逻辑归档到当前 Provider 状态 owner；不移动/删除任何历史文件。
- [error-memory root](../../../knowledge/error-memory/README.md#L1) 收敛为七个责任模块，所有 leaf 恰一个 Primary、最多两个 Related；[validator](../../../../scripts/validate-error-memory.mjs#L1) 验证生命周期、唯一 identity/fingerprint、断链、根模块覆盖、路由环和索引规模。`pnpm-store-build-policy-mismatch` 作为 overdue candidate 仅告警并保留，不自动升格或退役。
- Kernel 新增双向 phase admission 与三条独立 evidence lane，诊断统一 proposal/final 语义；RED 回归证明并修复“旧 live 反压新 waiting/terminal”和“phase 更新擦除 unread/Goal”。
- Current PRD 的 RAW-163 main-first 残留已按用户既有 RAW-164 all-bead 决策修正；parent-only open 保留。当前 conflict register 无需用户新增选择。
- 继续全局复核又删除了公共任务层重复的时间戳门禁，让 Branch Evidence 的 Turn epoch/真实事件序号成为唯一 phase 裁决；Claude 日志轮转/截断只恢复状态不制造热未读。
- 11 个影响测试文件 `457/457`、Preload 镜像/语法、typecheck、1871-module production build、Runtime Identity、uTools validator 与 99-leaf error-memory validator 通过；artifact 为 `host-6ac8de6597dcf0dd644c / renderer-6e677d084be49c8c7878`。同步组为 `66 documents / 28 dependencies / 29 validators`，code-link/rule/diff 审计通过；99 个结构化叶子外的 2 条 legacy compound 仅作 Historical/Migration Source。真实 Host 仍未 `host-loaded`。

## Acceptance Boundary

1. 按当前 `VerificationImpactTrace` 覆盖受影响 Kernel、Bridge、Controller、Domain、Float、Feature Routing、Runtime Identity，连同语义类型检查、生产构建、Preload 镜像、uTools validator、静态所有权和文档链接审计；更宽套件只有满足 testing owner 的独立升级触发才运行。
2. 用户最新指定本轮不再做离线包/安装宿主验收；同一源码由 uTools 开发模式插件加载并由 `runtime-identity-handshake` 报告 `host-loaded` 后，完成 UI、动作、日志与 20 秒双快照回归，未完成前状态保持 `dev-plugin-reload-pending`。
3. 当前用户授权仅覆盖 `EyPc-Regression-<run-id>-*` 无副作用测试任务中的安全 Turn/Plan 与可恢复清理；不得对既有用户任务执行“执”或 Claude 归档。

详细合同见 [raw requirement](raw-requirement.md#L1)、[spec](spec.md#L1)、[tasks](tasks.md#L1)、[verification](verify.md#L1) 和 [handoff](handoff.md#L1)。
