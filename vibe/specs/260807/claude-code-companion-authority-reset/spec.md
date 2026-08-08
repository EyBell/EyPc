# Claude Code Companion 权威重置 — Controlled Specification

spec_id: `SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET`
spec_revision: `5`
status: `integrated-current-authority`
execution_status: `implementation-landed / automated-verified / targeted-host-partial / interactive-host-pending`
raw_sources: `RAW-001..RAW-024`
updated: `2026-08-08`

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
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/claude-session-family-open-route-and-state-authority-conflation.md",
    "vibe/knowledge/error-memory/tests-that-cannot-fail.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/specs/260805/1150-claude-companion-provider/spec.md",
    "vibe/specs/260806/1130-claude-desktop-provider/spec.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/verify.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/unread-authority.md",
    "vibe/specs/260806/2210-claude-quota-all-windows/spec.md"
  ],
  "dependencies": [
    "package.json",
    "preload/claude/app-paths.cjs",
    "preload/claude/app-state.cjs",
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
    "public/claude/app-paths.cjs",
    "public/claude/app-state.cjs",
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
    "tests/domain/companionAggregate.test.ts",
    "tests/domain/companionPresentation.test.ts",
    "tests/platform/claudeAppStateBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/claudeBridgeSafety.test.ts",
    "tests/platform/claudePreloadCore.test.ts",
    "tests/platform/claudeQuotaFallback.test.ts",
    "tests/platform/claudeUnreadBridge.test.ts",
    "tests/runtime/action.test.ts",
    "tests/runtime/claudeCompanionController.test.ts",
    "tests/runtime/claudeCompanionWatcherE2E.test.ts",
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
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/claude-session-family-open-route-and-state-authority-conflation.md",
    "vibe/knowledge/error-memory/tests-that-cannot-fail.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/specs/260805/1150-claude-companion-provider/spec.md",
    "vibe/specs/260806/1130-claude-desktop-provider/spec.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/unread-authority.md",
    "vibe/specs/260806/2147-claude-open-in-desktop-app/verify.md",
    "vibe/specs/260806/2210-claude-quota-all-windows/spec.md",
    "vibe/specs/260807/claude-code-companion-authority-reset",
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
- 私有日志只接受已门禁版本的固定无内容模板：发送、权限请求、AskUserQuestion、按 request id 关联的权限响应、Query completed/Turn succeeded、Stopping/失败。轮转、重复、乱序要去重；版本或语法失配 fail closed。原始行、正文和工具参数不得进入 Renderer 或插件存储。
- official Hooks 是唯一关联 fallback，不是完整单源权威；仅 Hooks 路线已废弃。`PermissionRequest` 与 `AskUserQuestion` 分别进入等待审批/等待输入，响应/后续活动恢复 running，Stop 完成当前 Turn；SessionEnd 不覆盖已有 Stop，idle notification 不产生待输入。
- Hook 状态由纯父 Turn reducer 归并：只有 `UserPromptSubmit` 开启 Turn；`SubagentStart/SubagentStop` 只更新活动水位。`Stop/StopFailure/SessionEnd` 关闭 Turn 后，同 Turn 的子代理、工具或 lifecycle 尾事件不得恢复 running；只有严格更新的新 Prompt Turn 可重新激活。
- 未读持久权威是 Claude App Local Storage 中包含 Chromium string tag 的 `epitaxy-unread-v1` 精确键。V2 reader 在复制 LevelDB 前后核对源指纹，只接纳完整稳定的 `generation/sourceFingerprint` 快照；失败返回 unknown，不能复用旧集合或字节扫描。
- 成功派发精确 Epitaxy local deep link 后，Controller 可为当前 `sessionId + completionEpoch` 建立仅进程内的可撤销已读提示，并在 `0/100/300/1000ms` 重读原生集合。同完成轮次迟到的 unread `true` 不得回跳；新 running/waiting 或更晚真实 completion 会撤销提示。派发失败不建立提示，`ClaudeOpenResult.confirmsRead` 仍为 `false`，且提示不写 App、不持久化、不改变 phase。
- 精确 live running/waiting 优先于 unread；否则 native unread membership 本身可把非 live 历史 unknown/stopped 确认为 `completed-unread`，不要求先有 Hook completed。

### Incremental communication

- Bridge 分离 inventory、`ClaudeCodeStateDeltaV2`、unread、quota、App presence；V2 必须携带 `generation/source/freshness/compatibility`，observation 必须携带 `completedTurns` 与状态证据。Controller 对 state/unread generation、Controller revision 和 Float applied revision 分层拒绝倒退。
- watcher 只刷新自己的 Map/Set 并立即发布。库存失败保留最后有效视图；未读失败变 unknown；quota 网络错误不能延迟状态或库存。禁止“所有 watcher 调同一个 full refresh”。
- App 日志事件即时触发 state hot-read，1 秒恢复轮询兜底；连续两次状态读取失败后，running/waiting 降为 unknown，不能永久卡在进行中。启动、功能启用、恢复可见、聚焦、网络恢复及最早 reset+1 秒分别唤醒额度 lane。
- 状态 delta 与 inventory metadata patch 使用单调 evidence/generation 屏障：慢 inventory 可更新标题，但不能回退更新的 state；state patch 不能删除库存字段。
- 状态版本比较由纯 Domain 统一执行：先比较 source generation，同 generation 再比较 evidence time 与来源权威；App 明确 terminal 优先同 Turn Hook 尾事件，`completedTurns` 只作冷历史佐证。state/unread refresh 共用可加入的 Promise singleflight，手动单项同步、watcher 和打开后同步不得形成第二条读取/发布通道。
- 正常真实事件到最终 Controller publish P95 `<=250ms`；漏事件恢复 `<=1.25s`。watcher callback 延迟不是最终发布延迟，不能作为该 SLO 的替代证据。

### Exact open and shortcut cache

- [open.cjs](../../../../preload/claude/open.cjs#L1) 缓存 Claude 主 App 的 bundle/PID/启动代次；热跳转只做低成本存活检查，缓存失效或冷启动才完整复核。
- 上一个/下一个同步推进物化视图游标，然后异步派发 `claude://claude.ai/epitaxy/<encoded-local-session-id>`。latest-target-wins 单飞队列保证连续按键只打开最终目标。
- Claude 任务的更多操作提供“同步 Claude 状态”：只接受当前未归档 local session 的精确 `{ key, actionAlias }`，并发读取真实 state/unread、合并后最多发布一次，部分失败给出明确反馈。成功打开原任务后执行同一路线的一次静默同步；派发失败不确认已读也不触发同步。
- 禁止 `resume/import`、CLI、终端、标题 AX 点击、自动启动、写未读或创建副本。选取 P95 `<=10ms`，热派发 P95 `<=150ms`，冷校验 P95 `<=1s`。

### Virtual projects, provider capability and visuals

- EyPc 不创建或修改 Codex/Claude 原生项目。虚拟合并先按双方相同规范绝对路径的稳定 project key；否则只在 Codex 与 Claude 两侧规范名称都唯一时合并，重名歧义保持分离。Claude 独有项目进入项目区，共享项目在“全部”只出现一次。
- Projects 子页签为会话级 `全部 / 只显示 Codex / 只显示 Claude`，默认全部。单来源模式同时过滤项目子任务并重算项目/任务数；共享项目只要含所选来源任务就保留。
- Claude 任务只支持精确打开、本地置顶和本地隐藏；归档、移除、移动等 Claude 原生不支持动作禁用并解释，不得误路由到 Codex 动作。
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
- Claude App session、unread、归档、标题和额度数据始终只读；私有 IPC 注入与直接数据库写入均不在生产路线。

### Verification plan preflight

- 在验证命令进入 Agent 自拟或扩写计划前，必须先按本任务各独立变更面建立 provisional `VerificationImpactTrace`，并从真实影响边选择 focused tests、必要语义边界和定向宿主实验。
- 完整 `pnpm run test → typecheck → build → verify` 不是本任务默认 gate。用户批准或要求实现 Agent 首先写入该计划的全量 ladder，不构成独立用户触发；若没有新的全局 testing-owner trigger，计划必须先收窄再执行。
- 本任务剩余验收只包含尚未通过的真实 uTools/Claude 状态、未读与项目筛选 UI 矩阵，以及已通过数据探针但尚未完成的 Fable/reset 最终渲染同屏对照；已通过的定向证据不因规则文档变化重复运行。

## Decision Ledger

| Decision | Selected | Rejected / superseded | Source |
| --- | --- | --- | --- |
| DEC-20260807-01 | 只镜像 App Code 会话；App 标题，空值 `General coding session` | CLI-only、Cowork、混合库存、UUID 标题 | RAW-001/002 |
| DEC-20260807-02 | 已运行 App 的精确 Epitaxy 路由 + presence cache + latest-target-wins | `resume/import`、CLI、AX 标题点击、自动拉起、每次全量枚举 | RAW-004/015 |
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

## Implementation And Acceptance State

生产代码已实现额度权威、状态/未读代际、父 Turn reducer、集中状态选择与版本比较、可加入的 state/unread singleflight、Claude-only 单项同步、会话提示、虚拟项目筛选和归属视觉增量；RAW-024 的聚焦自动化、scoped semantic typecheck、bundle/runtime 资产与匿名本机状态探针均已通过，当前 27 条投影为 0 running / 24 completed / 1 stopped / 2 unknown。此前真实 quota 返回 5h、全模型周与 Fable scoped 周额度及 reset，原生 unread 已稳定读到一条真实 membership。实际旧任务 UI 点击同步、permission/AskUserQuestion/响应、EyPc 点击移除/同轮不回跳/新 completion 再未读、标题/重启和真实项目筛选 UI 矩阵尚未走完，因此任务仍是 `acceptance-pending`，不能恢复旧的整体“完成”声明。详见 [verify.md](verify.md#L1)。
