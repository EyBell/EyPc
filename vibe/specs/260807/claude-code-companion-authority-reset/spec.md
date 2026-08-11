# Claude Code Companion 权威重置 — Controlled Specification

spec_id: `SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET`
spec_revision: `8`
status: `integrated-current-authority`
execution_status: `implementation-landed / RAW-029-focused-verified / native-sidebar-unsupported / interactive-host-pending`
raw_sources: `RAW-001..RAW-029`
updated: `2026-08-11`

## Authority

- 用户事实：[raw-requirement.md](raw-requirement.md#L1)
- 执行计划：[plan.md](plan.md#L1)
- 技术调研与严格测试通路：[research.md](research.md#L1)
- 产品权威：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
- 当前状态：[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)
- 验证与未完成门禁：[verify.md](verify.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:claude-code-authority-reset-v1`
- Group owner: this `spec.md`
- Scope: 本任务包、Claude 当前产品/架构/帮助、项目验证规则/适配器、既有错误记忆的本次 occurrence 及被直接取代的历史任务提示；全局规则/Skill 由 CodeNote 同一父 Rule Task 独立持有。
- Shared-file ownership: 只修改 Claude Companion 独立段落；保留其它功能与用户脏改动。
- Sidecars: `Newton` / `Godel` 仅作只读增量审计；App Root 接纳证据并独占写入、验证和文档收口。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:claude-code-authority-reset-v1",
  "group_owner": "vibe/specs/260807/claude-code-companion-authority-reset/spec.md",
  "documents": [
    "AGENTS.md",
    "CLAUDE.md",
    "vibe/rules/README.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/raw-requirement.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/spec.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/plan.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/tasks.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/research.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/verify.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/handoff.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/claude-metadata-archive-does-not-prove-native-sidebar-convergence.md",
    "vibe/knowledge/error-memory/codex-provider-status-display-normalization.md",
    "vibe/knowledge/error-memory/claude-session-family-open-route-and-state-authority-conflation.md",
    "vibe/knowledge/error-memory/tests-that-cannot-fail.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/specs/260805/1150-claude-companion-provider/spec.md",
    "vibe/specs/260806/1130-claude-desktop-provider/spec.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/verify.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/unread-authority.md",
    "vibe/specs/260806/2210-claude-quota-all-windows/spec.md",
    "vibe/specs/260718/1148-codex-quota-float/raw-requirement.md",
    "vibe/specs/260718/1148-codex-quota-float/spec.md",
    "vibe/specs/260718/1148-codex-quota-float/plan.md",
    "vibe/specs/260718/1148-codex-quota-float/tasks.md",
    "vibe/specs/260718/1148-codex-quota-float/verify.md",
    "vibe/specs/260718/1148-codex-quota-float/handoff.md"
  ],
  "dependencies": [
    "package.json",
    "preload/claude/app-paths.cjs",
    "preload/claude/app-state.cjs",
    "preload/claude/archive.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/claude/environment.cjs",
    "preload/claude/events.cjs",
    "preload/claude/index.cjs",
    "preload/claude/open.cjs",
    "preload/claude/plan-usage.cjs",
    "preload/claude/quota.cjs",
    "preload/claude/scripts.cjs",
    "preload/claude/unread.cjs",
    "preload/index.js",
    "preload/companion/navigation.cjs",
    "preload/companion/task-actions.cjs",
    "public/claude/app-paths.cjs",
    "public/claude/app-state.cjs",
    "public/claude/archive.cjs",
    "public/claude/code-sessions.cjs",
    "public/claude/environment.cjs",
    "public/claude/events.cjs",
    "public/claude/index.cjs",
    "public/claude/open.cjs",
    "public/claude/plan-usage.cjs",
    "public/claude/quota.cjs",
    "public/claude/scripts.cjs",
    "public/claude/unread.cjs",
    "public/preload.js",
    "public/companion/navigation.cjs",
    "public/companion/task-actions.cjs",
    "public/plugin.json",
    "src/domain/claude.ts",
    "src/domain/claudeCode.ts",
    "src/domain/codex.ts",
    "src/domain/companionAggregate.ts",
    "src/domain/companionPresentation.ts",
    "src/domain/companionProvider.ts",
    "src/FloatApp.vue",
    "src/pages/CodexPage.vue",
    "src/runtime/appRuntime.ts",
    "src/runtime/codexController.ts",
    "src/runtime/feature/featureRouting.ts",
    "src/platform/eypcPlatform.ts",
    "src/styles/float.css",
    "scripts/prepare-utools-runtime.mjs",
    "scripts/sync-utools-preloads.mjs",
    "scripts/utools-preload-assets.mjs",
    "scripts/validate-utools-runtime.mjs"
  ],
  "validators": [
    "tests/domain/claude.test.ts",
    "tests/domain/claudeCode.test.ts",
    "tests/domain/codex.test.ts",
    "tests/domain/codexPresentation.test.ts",
    "tests/domain/companionAggregate.test.ts",
    "tests/domain/companionPresentation.test.ts",
    "tests/domain/companionProvider.test.ts",
    "tests/integration/appPluginEnter.test.ts",
    "tests/integration/featureRouting.test.ts",
    "tests/platform/claudeAppStateBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/claudeBridgeSafety.test.ts",
    "tests/platform/claudePreloadCore.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/platform/companionNavigationBridge.test.ts",
    "tests/platform/companionTaskActionsBridge.test.ts",
    "tests/platform/eypcPlatform.test.ts",
    "tests/platform/claudeQuotaFallback.test.ts",
    "tests/platform/claudeUnreadBridge.test.ts",
    "tests/runtime/action.test.ts",
    "tests/runtime/claudeCompanionController.test.ts",
    "tests/runtime/claudeCompanionWatcherE2E.test.ts",
    "tests/runtime/codexController.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "scripts/probe-claude-code-runtime.mjs",
    "scripts/probe-claude-live-state-runtime.mjs",
    "scripts/probe-claude-open-runtime.mjs",
    "scripts/probe-claude-quota-cache-runtime.mjs",
    "scripts/probe-claude-quota-runtime.mjs",
    "scripts/probe-claude-unread-key-runtime.mjs",
    "scripts/probe-claude-unread-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "AGENTS.md",
    "CLAUDE.md",
    "vibe/rules/README.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/claude-session-family-open-route-and-state-authority-conflation.md",
    "vibe/knowledge/error-memory/tests-that-cannot-fail.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/claude-metadata-archive-does-not-prove-native-sidebar-convergence.md",
    "vibe/knowledge/error-memory/codex-provider-status-display-normalization.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/specs/260805/1150-claude-companion-provider/spec.md",
    "vibe/specs/260806/1130-claude-desktop-provider/spec.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/unread-authority.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/verify.md",
    "vibe/specs/260806/2210-claude-quota-all-windows/spec.md",
    "vibe/specs/260807/claude-code-companion-authority-reset",
    "vibe/specs/260718/1148-codex-quota-float",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md"
  ]
}
```

## Current Contract

### Inventory, identity and materialized lifetime

- 唯一可见库存是 Claude App `claude-code-sessions/<org>/<user>/local_<uuid>.json` 的 Code 会话；不得并入 `local-agent-mode-sessions`、`~/.claude/projects` CLI-only 会话、Cowork 或云端索引。
- 主键使用 App `local_<uuid>`；显示名使用 App `title`，空值固定为 `General coding session`。`completedTurns`、归档、项目和活动时间均为白名单元数据；UUID 不得成为可见标题。
- App 已有重复包装行全部保留。共享 `cliSessionId` 的 Hook 只有在唯一相关时才更新一个本地行；歧义证据保持 `unknown`，不得一对多扇出。
- Claude 功能启用期间，Controller 持续维护进程级 `inventory / phase / unread / quota / appPresence` 物化视图。切页、悬浮窗显隐和快捷键不得清空；进程重启后从真实来源冷启动，不持久化旧 live phase。

### State and unread

- `phase = running | waiting-approval | waiting-input | completed | stopped | unknown` 与 `unread = unread | read | unknown` 正交。可见分组互斥：等待→「待确认」，running→「进行中」，completed+native unread→「已完成未读」，其余 completed→「已完成」。
- 生产状态优先级固定为：
  1. 版本门禁私有 App 日志中的 App local id 精确事件；
  2. 可唯一映射的官方 Hook；
  3. 冷启动时 `completedTurns > 0` 且无更新 active 证据的历史 completed；
  4. 证据缺失、歧义或活跃进程冲突时 unknown。
- 私有日志只接受已门禁版本的固定无内容模板：发送、权限请求、AskUserQuestion、按 request id 关联的权限响应、Query completed/Turn succeeded、Stopping/失败。通用 `Stopping session` 只产生 session-end；同 Turn 已有成功 Stop/Result 时保持 completed，只有无成功结果的 session-end 或显式 failed/interrupted 才进入 stopped。轮转、重复、乱序要去重；版本或语法失配 fail closed。原始行、正文和工具参数不得进入 Renderer 或插件存储。
- official Hooks 是唯一关联 fallback，不是完整单源权威；仅 Hooks 路线已废弃。`PermissionRequest` 与 `AskUserQuestion` 分别进入等待审批/等待输入，响应/后续活动恢复 running，Stop 完成当前 Turn；SessionEnd 不覆盖已有 Stop，idle notification 不产生待输入。
- Hook 状态由纯父 Turn reducer 归并：只有 `UserPromptSubmit` 开启 Turn；`SubagentStart/SubagentStop` 只更新活动水位。`Stop/StopFailure/SessionEnd` 关闭 Turn 后，同 Turn 的子代理、工具或 lifecycle 尾事件不得恢复 running；只有严格更新的新 Prompt Turn 可重新激活。
- 未读持久权威是 Claude App Local Storage 中包含 Chromium string tag 的 `epitaxy-unread-v1` 精确键。V2 reader 在复制 LevelDB 前后核对源指纹，只接纳完整稳定的 `generation/sourceFingerprint` 快照；失败返回 unknown，不能复用旧集合或字节扫描。
- 成功派发精确 Epitaxy local deep link 后，Controller 可为当前 `sessionId + completionEpoch` 建立仅进程内的可撤销已读提示，并在 `0/100/300/1000ms` 重读原生集合。同完成轮次迟到的 unread `true` 不得回跳；新 running/waiting 或更晚真实 completion 会撤销提示。派发失败不建立提示，`ClaudeOpenResult.confirmsRead` 仍为 `false`，且提示不写 App、不持久化、不改变 phase。
- 精确 live running/waiting 优先于 unread；否则 native unread membership 本身可把非 live 历史 unknown/stopped 确认为 `completed-unread`，不要求先有 Hook completed。原生 unread 清除只把 completed-unread 变为 completed，不得降为 stopped/unknown；只有更新的新 Prompt/live phase 可恢复 running。

### Incremental communication

- 最终进程权威现使用 `companion-task-kernel-v3 / companion-task-package-v3`：Claude membership、phase、unread 行为保持三条独立语义 lane，observation generation 只做排序，semantic revision 只在真实变化时推进。慢 inventory/异步 unread 仍须基于最新包重放，不能删除其间新增会话；Main/Float 不得以第二套 source revision 忽略完整包。RAW-159 不改变 Claude 状态或归档副作用。
- [index.cjs](../../../../preload/claude/index.cjs#L1) 对 state/inventory/unread 提供 Host+Renderer 多订阅；任一消费者 detach 不影响另一消费者。[code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1) 即使在 watcher 先于首个 inventory 建立时，也会在冷 inventory 发现目录后动态安装 watcher。[unread.cjs](../../../../preload/claude/unread.cjs#L1) 合并并发读取，避免相同源状态产生彼此颠倒的 generation。
- Bridge 分离 inventory、`ClaudeCodeStateDeltaV2`、unread、quota、App presence；V2 必须携带 `generation/source/freshness/compatibility`，observation 必须携带 `completedTurns` 与状态证据。Controller 对 state/unread generation、Controller revision 和 Float applied revision 分层拒绝倒退。
- watcher 只刷新自己的 Map/Set 并立即发布。库存失败保留最后有效视图；未读失败变 unknown；quota 网络错误不能延迟状态或库存。禁止“所有 watcher 调同一个 full refresh”。
- App 日志事件即时触发 state hot-read，1 秒恢复轮询兜底；连续两次状态读取失败后，running/waiting 降为 unknown，不能永久卡在进行中。启动、功能启用、恢复可见、聚焦、网络恢复及最早 reset+1 秒分别唤醒额度 lane。
- 状态 delta 与 inventory metadata patch 使用单调 evidence/generation 屏障：慢 inventory 可更新标题，但不能回退更新的 state；state patch 不能删除库存字段。
- 状态版本比较由纯 Domain 统一执行：先比较 source generation，同 generation 再比较 evidence time 与来源权威；App 明确 terminal 优先同 Turn Hook 尾事件，`completedTurns` 只作冷历史佐证。state/unread refresh 共用可加入的 Promise singleflight，手动单项同步、watcher 和打开后同步不得形成第二条读取/发布通道。
- 正常真实事件到最终 Controller publish P95 `<=250ms`；漏事件恢复 `<=1.25s`。watcher callback 延迟不是最终发布延迟，不能作为该 SLO 的替代证据。
- 正常可信 push 直接进入对应 lane，不读取 quota、environment 或 full inventory；完整 inventory 仅允许冷启动、重连或明确 membership gap，并只读取 Claude。定向“同步 Claude 状态”仍复用 state/unread singleflight，不形成全 authority refresh。
- Claude inventory、Kernel、Actions、Navigation、mutation 与 batch 消费者不得设置固定总任务数上限；数量增长不能改变卡片、角标或动作资格。明确 phase/unread/membership 立即发布，只有 unknown 允许一次最多 250ms 的稳定窗，不新增 Renderer debounce。

### Exact open and shortcut cache

- [open.cjs](../../../../preload/claude/open.cjs#L1) 缓存 Claude 主 App 的 bundle/PID/启动代次；热跳转只做低成本存活检查，缓存失效或冷启动才完整复核。
- RAW-152 后，上一个/下一个的跨来源物化游标由版本门禁的 Preload 进程桥拥有；RAW-155 已用 leading-immediate 取代固定 75ms 等待：所有启用 Provider 库存 settled 后才 ready，第一下立即派发，只有打开仍 in-flight 时后续按键保留一个最终 trailing 目标，卡片/manual/attention 可取消未派发 trailing，Codex/Claude 打开共享最大并发 1。Claude provider-local opener 仍只异步派发 `claude://claude.ai/epitaxy/<encoded-local-session-id>`；普通 Renderer remount 只 detach，来源变化、功能停用或进程退出清理。
- Claude 任务的更多操作提供“同步 Claude 状态”：只接受当前未归档 local session 的精确 `{ key, actionAlias }`，并发读取真实 state/unread、合并后最多发布一次，部分失败给出明确反馈。成功打开原任务后执行同一路线的一次静默同步；派发失败不确认已读也不触发同步。
- 禁止 `resume/import`、CLI、终端、标题 AX 点击、自动启动、写未读或创建副本。选取 P95 `<=10ms`，热派发 P95 `<=150ms`，冷校验 P95 `<=1s`。

### Virtual projects, provider capability and visuals

- EyPc 不创建或修改 Codex/Claude 原生项目。虚拟合并先按双方相同规范绝对路径的稳定 project key；否则只在 Codex 与 Claude 两侧规范名称都唯一时合并，重名歧义保持分离。Claude 独有项目进入项目区，共享项目在“全部”只出现一次。
- Projects 子页签为会话级 `全部 / 只显示 Codex / 只显示 Claude`，默认全部。单来源模式同时过滤项目子任务并重算项目/任务数；共享项目只要含所选来源任务就保留。
- 更新引入（Codex Companion RAW-154，取代 RAW-150 的 Claude 执行路线）：Claude 任务继续支持精确打开、本地置顶和本地隐藏，并允许仅限 macOS Claude `1.26832.0` 的 completed/stopped 任务级 D′ 静默归档。普通库存读取只在 Preload 内建立唯一 `sessionId → local_*.json` 索引；mutation 不重新扫目录。写前必须重读 compatible phase、精确 App-local 身份及文件 stat/hash；事务保留原始字节/权限，只把解析对象的 `isArchived` 改为 true，写入同目录唯一临时文件并核验其它字段语义不变后原子替换。RAW-155 增量允许过期索引安全 rebase 到当前仍唯一的同一目标，以容忍 title/focus/activity 普通元数据变化；只对写前 `source-changed` 在精确重读 phase 后重试一次，写后并发绝不重试或覆盖。元数据 true 且私有活动库存移除即可 `archived`，插件包立即移除并自动刷新；该成功只确认 EyPc 侧归档与移除，不确认 Claude 原生侧栏。成功提示固定明确为 EyPc 已完成、Claude 原生侧栏可能仍待刷新且尚未确认同步。固定语法 App 日志只作增强证据；已归档幂等成功，安全恢复失败或 Claude 并发修改不确定时返回 `indeterminate`，`failed/indeterminate` 均保留卡片。归档路径禁止 Deep Link、AX/JXA、LevelDB、扫改目录和非目标会话；项目级归档、移除和移动仍禁用并解释。
- 五秒归档确认的稳定 identity 是 Provider+task+terminalEpoch。revision、unread、focus 与临时 alias 变化不取消；第二次操作从当前包取最新目标并重做 capability/Provider 核验。任务消失、terminal epoch 或 capability 变化才取消。
- 普通打开在派发 Deep Link 前必须通过同一私有索引重读：已归档、缺失或身份不唯一返回 `state-changed`，不得重新打开旧会话。精确文件 watcher 只重读已登记目标并发布单调 membership mutation delta；一秒 watchdog 只核验索引候选。该通路独立于 quota、state、unread 与完整 inventory Promise，正常发布 P95 ≤250ms，漏 callback 恢复 ≤1.25s。
- “同步 Claude 状态”是 Claude-only 的实时只读 capability；Codex 行不显示。它不能人工指定 completed/read，也不能修改 Claude App。
- 每条任务和项目固定显示文本化“归属 Codex/Claude/共享”；文字、图标、ARIA 名称共同表达来源。来源背景使用现有 token 的 8% 普通/12% 悬停选中混色，状态图标与左侧标记继续只表达任务状态；Tab 保留原生键盘、焦点和 `aria-selected` 语义。

### Quota

- `claudeAppQuotaAccess` 是默认关闭的显式授权；旧 `claudeQuotaFallback=true` 迁移为已授权。macOS 只读 Claude App `oauth:tokenCacheV2` 并使用 Claude 专属 Safe Storage Keychain 项在内存解密；同组织多 scope 选择唯一最小权限 token，跨组织/账号无法唯一确认时失败关闭。密钥、明文缓存和令牌不记录、不返回、不持久化。
- Node 16 使用显式 HTTPS transport，不依赖全局 `fetch`。动态 `limits[]` 同时兼容 `kind/percent/scope.model.display_name` 与旧字段，映射 `session → five_hour`、`weekly_all → seven_day`、`weekly_scoped → seven_day_<stable-scope>`；UI 使用上游 Fable/Fable 5 名称，不使用固定模型白名单，`spend` 等非额度元数据不得进入窗口。
- plan history 只更新它真实拥有的两个百分比；不能删除 scoped 窗口、reset、source 或 freshness。缺失/过期 reset 或缺少 scoped weekly 时触发单飞 supplement。
- App OAuth 是额度/reset 主来源，statusline 与 plan history 仅逐窗补充且不能抹除 App scoped/reset。过期 reset 清空而不是继续显示；401/403 等待凭据缓存指纹变化并显示不可用，429 遵循 Retry-After，其它失败按 1 分钟、5 分钟、15 分钟、随后每小时退避并保留标为可能过期的最后成功值；成功后恢复 5 分钟最小刷新间隔。
- 周限额 chip 显示剩余百分比；200ms 悬停/聚焦展示绝对 reset、相对距离和 freshness；`<=20%` warning、`<=10%` danger，不新增系统通知。

### Privacy and mutation boundary

- 唯一显式写入用户 Claude 安装的是用户主动注册的 official Hooks/statusline；保留现有配置并可清洁卸载。
- 原始 App 日志、Hook payload 内容、对话正文、工具参数、凭证、LevelDB 值和会话身份不得进入探针输出或 Renderer。
- Claude App session identity、unread、标题与额度始终只读。更新引入（RAW-154）只增加一个版本门禁、唯一索引目标、可核验/可回滚的 `isArchived` D′ 事务例外；禁止目录扫描写、LevelDB/数据库写、其它字段或其它会话修改。私有 IPC 注入和 Deep Link+AX 归档均不在生产路线。

### Verification plan preflight

- 在验证命令进入 Agent 自拟或扩写计划前，必须先按本任务各独立变更面建立 provisional `VerificationImpactTrace`，并从真实影响边选择 focused tests、必要语义边界和定向宿主实验。
- 完整 `pnpm run test → typecheck → build → verify` 不是本任务默认 gate。用户批准或要求实现 Agent 首先写入该计划的全量 ladder，不构成独立用户触发；若没有新的全局 testing-owner trigger，计划必须先收窄再执行。
- 本任务剩余验收只包含尚未通过的真实 uTools/Claude 状态、未读与项目筛选 UI 矩阵，以及已通过数据探针但尚未完成的 Fable/reset 最终渲染同屏对照；已通过的定向证据不因规则文档变化重复运行。

## Decision Ledger

| Decision | Selected | Rejected / superseded | Source |
| --- | --- | --- | --- |
| DEC-20260807-01 | 只镜像 App Code 会话；App 标题，空值 `General coding session` | CLI-only、Cowork、混合库存、UUID 标题 | RAW-001/002 |
| DEC-20260807-02 | 已运行 App 的精确 Epitaxy 路由 + presence cache；跨 Provider latest-target/并发由 `companion-navigation-v1` 上层统一 | `resume/import`、CLI、AX 标题点击、自动拉起、每次全量枚举、Provider 各自独立通用循环 | RAW-004/015、Codex RAW-152 |
| DEC-20260807-03 | 版本门禁 App 日志 + 唯一 Hook + Code metadata history | Hooks-only、私有 IPC 注入、mtime/audit 猜测、latest-event | RAW-003/013/014 |
| DEC-20260807-04 | 原生 LevelDB 是持久权威；稳定 V2 快照 + 同完成轮次可撤销会话提示 | 持久 EyPc 回执、无界乐观已读、字节扫描、上次集合 | RAW-006/023 |
| DEC-20260807-05 | 重复 App 行严格保留；歧义 unknown | 自动隐藏/合并/删除或一对多扇出 | RAW-005 |
| DEC-20260807-06 | 进程级全局物化视图 + 五条独立增量 lane | 页面级缓存、全量刷新、quota 串联状态、持久化 live phase | RAW-011/012 |
| DEC-20260807-07 | Node HTTPS 动态 N-window + reset freshness + 长期退避 | 固定两窗、全局 fetch、三次进程期上限、过期 reset | RAW-007/016 |
| DEC-20260807-08 | 完整宿主矩阵通过后才能完成；当前仅实现落地 | 以新任务热路径或单一 watcher 指标代替总验收 | RAW-010/017 |
| DEC-20260807-09 | 当前文档统一重置，旧路线仅作 superseded 历史证据 | 冲突需求继续进入当前权威 | RAW-008/009 |
| DEC-20260807-10 | provisional impact trace 先于 plan 命令；独立变更只跑 focused evidence | 固定全量 ladder、用 plan approval 自举 full-suite trigger | RAW-018 |
| DEC-20260807-11 | 显式授权的 Claude App 加密缓存 + 动态 limits 是 quota/reset 主权威 | Claude Code 凭据、固定窗口、App history 冒充完整额度 | RAW-019 |
| DEC-20260807-12 | 只读 EyPc 虚拟项目；路径优先、双方名称唯一兜底、三态来源筛选 | 写原生项目、单边名称猜合并、只把 Claude 任务塞进数组 | RAW-021 |
| DEC-20260807-13 | 所有行文本化归属 + 8%/12% 来源背景 + provider capability | 只靠颜色、隐藏来源、把 Claude 动作误派到 Codex | RAW-022 |
| DEC-20260808-14 | 父 Turn reducer + 集中来源/版本选择 + 同 lane 单项真实同步 | Stop 后尾事件复活、人工完成/已读覆盖、第二条刷新通道 | RAW-024 |
| DEC-20260809-15 | D′ 单目标 `isArchived` 事务 + 元数据/活动库存双确认 + 并发安全回滚 | Deep Link+AX 归档、App 日志硬门禁、LevelDB/目录/非目标写入 | RAW-025、Codex RAW-154 |
| DEC-20260809-16 | 统一任务 Dispatcher + 精确 membership delta/一秒索引 watchdog + open 归档前复核 | Provider-specific Controller 分支、完整库存阻塞移除、已归档会话仍被 Deep Link 打开 | RAW-026、Codex RAW-154 |
| DEC-20260810-17 | V2 membership/phase/unread 独立 lane + 多订阅 + 动态 watcher + unread singleflight + push-first | 共享 generation、单 callback 覆盖、预订阅零 watcher、正常事件全 authority refresh | RAW-027、Codex RAW-155 |
| DEC-20260811-18 | D′ 成功只确认 EyPc 归档/移除并明确提示 Claude 侧栏未确认；原生及时收敛仅接受受支持入口 + 同会话原生 ACK + 运行中侧栏 1.25 秒内移除 | 用元数据/LevelDB、私有 IPC、AX/JXA/UI 自动化、重启或事后视觉结果冒充原生收敛 | RAW-029 |

## Archive Tombstones

| Archive | Removed active route/conclusion | Replacement | Restoration gate |
| --- | --- | --- | --- |
| ARCH-20260807-01 | CLI/Cowork/mixed inventory | DEC-01 | 新的明确用户选择 |
| ARCH-20260807-02 | `resume/import` 是精确历史打开 | DEC-02 | Epitaxy no-clone 失败且用户重选 |
| ARCH-20260807-03 | WAL/`.ldb` 字节扫描或旧集合是精确未读 | DEC-04 | 不可恢复；只能选择新的真实权威 |
| ARCH-20260807-04 | latest Hook / Hooks-only 可完整表达 App 状态 | DEC-03 | 新版本官方外部状态 API 出现并重新调研 |
| ARCH-20260807-05 | watcher callback P95 等于 UI publish P95 | DEC-06/08 | 只有端到端同钟测试可替代 |
| ARCH-20260807-06 | 任一事件执行 inventory+unread+quota 全刷新 | DEC-06 | 不得恢复独立权威串联 |
| ARCH-20260807-07 | 三次额度尝试或两窗口 history 足够 | DEC-07 | 上游公开合同明确收敛且产品需求变更 |
| ARCH-20260807-08 | “实现已完成” | DEC-08 | uTools/Claude 全矩阵和 Fable 同屏验收通过 |
| ARCH-20260807-09 | 完整 `test → typecheck → build → verify` 是每轮/本任务默认完成门禁 | DEC-10 | 仅有新的独立用户要求、发布策略或 impact evidence trigger 才可恢复对应 wider suite |
| ARCH-20260808-10 | 任意 Stop 后活动事件都可把父任务恢复 running | DEC-14 | 只有新的父 Turn 权威合同与对应反例验收后才可替代 |
| ARCH-20260809-11 | Claude 打开会话后用 AX 点 Archive，并把 App 日志作为硬成功条件 | DEC-15 | 只有 D′ 被真实反例证伪且用户重新选择副作用路线 |
| ARCH-20260809-12 | Claude 手动/插件归档等待完整库存刷新后再收敛卡片 | DEC-16 | 不得恢复跨独立 authority 的阻塞刷新 |
| ARCH-20260811-13 | D′ 元数据成功和 EyPc 库存移除等同于 Claude 原生侧栏已同步 | DEC-18 | 只有 Claude 提供受支持的原生归档入口，并通过同会话 ACK 与运行中 1.25 秒侧栏移除验收后才可替代 |

## Implementation And Acceptance State

生产代码已实现额度权威、状态/未读代际、父 Turn reducer、集中状态选择与版本比较、可加入的 state/unread singleflight、Claude-only 单项同步、会话提示、虚拟项目筛选和归属视觉增量；RAW-152 将通用前后任务提升为跨 Provider 进程级导航仲裁，RAW-154 再用 `companion-task-actions-v1` 统一 open/archive/close 分发，并落地 D′ 单目标元数据事务、归档前 open preflight、精确 membership delta 和进程级五秒归档确认。RAW-024 的聚焦自动化与既有宿主证据保持有效；RAW-154 自动化/构建证据在本轮 [verify.md](verify.md#L1) 收口。此前真实 quota 返回 5h、全模型周与 Fable scoped 周额度及 reset，原生 unread 已稳定读到一条真实 membership。更新引入（2026-08-10）：真实 D′ canary 已在用户显式授权下执行并通过——目标是用户指定的真实 completed 会话（非可丢弃夹具），生产 Bridge 单目标事务成功、语义 diff 仅 `isArchived`、幂等重入不改字节，证据见 [verify.md](verify.md#L94)。更新引入（2026-08-11）：D-1 的成功/幂等/Controller 兜底提示已改为明确区分 EyPc 移除与 Claude 原生侧栏未确认；D-2 只读核验证明当前 D′ 绕过 Claude 原生内存 mutation/`archived` 事件链，官方公开入口也没有本地 Code 归档，因此当前结论为 `unsupported`，没有接入私有 IPC、AX/JXA、UI 自动化或 LevelDB 写入。跨来源快速连按、手动 App 归档即时移除、旧任务 UI 点击同步、permission/AskUserQuestion/响应、EyPc 点击移除/同轮不回跳/新 completion 再未读、标题/重启和真实项目筛选 UI 矩阵仍未走完，因此任务仍是 `acceptance-pending`。
