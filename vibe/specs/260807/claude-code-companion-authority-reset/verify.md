# Claude Code Companion 权威重置 — Verification

updated: `2026-08-11`
status: `implementation-landed / RAW-029-focused-verified / native-sidebar-unsupported / quota-host-verified / interactive-host-partial`

## Verification Verdict

- 代码实现、确定性测试与隐私安全的定向本机探针已证明：Code-only/App title、历史 completed 恢复、版本门禁日志、唯一 Hook fallback、精确 LevelDB reader、独立热缓存 lane、quota 阻塞隔离、连续快捷跳转单飞和 no-clone 路径成立。
- watcher wake 只记录 source latency，不再作为最终 UI publish 证据。Controller 自动化从 watcher-shaped state delta 跑到 publish，并在 quota promise 阻塞时验证 100 次状态转换 P95 `<=250ms`。
- 本轮新增的 App quota 权威已在真实加密缓存上返回 HTTP 200，并只投影 5h、全模型周、Fable scoped 周额度及 reset；状态/未读/项目/视觉的确定性链路通过。
- RAW-024 已定位并修复旧任务假 running：父 Turn reducer拒绝 Stop 后 SubagentStop/工具尾事件复活，App terminal 优先同 Turn Hook tail；Claude-only 单项同步与成功打开静默同步复用同一 state/unread singleflight 和 revision 发布链。
- RAW-154 已以 `claude-metadata-archive-v2` 取代历史 Deep Link+AX：唯一私有文件索引、phase/stat/hash 写前门禁、单字段同目录原子事务、语义核验、并发保护和安全回滚均已落地；元数据+私有活动库存双确认即可成功，App 日志不再是硬条件。普通打开会先拒绝已归档/缺失/歧义目标，文件 membership delta 与一秒索引 watchdog 不等待完整库存或额度。
- RAW-027 / Codex RAW-155 已把最终包升级为 V2 membership/phase/unread 独立 lane，并修复 Host/Renderer 单 callback 覆盖、首次 inventory 前订阅造成零目录 watcher、并发 unread generation 颠倒和异步旧整包删除新会话。正常可信 push 不读取 quota/environment/full inventory。
- RAW-028 与 Codex RAW-155 增量的当前影响集为 `9/9` files、`303/303` tests：正常 completion 后 generic session-end 保持 completed，native unread 提升任何非 live history，405 个 Claude sessions 不截断，最终 package 原子更新卡片/Tab/项目/分组/角标，Claude unknown 保持专属分段，确认期间 revision/alias churn 保留，D′ metadata rebase/单次写前重试和脱敏决策日志通过。`pnpm run sync:preloads` 与最终 `pnpm run build` 通过 typecheck、1870 modules、runtime validator；产物身份为 `host-b1ebbac81b95ca4f0405 / renderer-5b82a3734cf73beb8df3`。真实正常完成→未读→已读→新 Prompt 与两次归档自动移除仍 pending。
- **整体仍未验收**：实机 permission/AskUserQuestion/响应、EyPc 点击现有真实未读后的原生移除/同轮不回跳/新 completion 再未读、标题/重启、项目三筛选及最终 uTools 同屏视觉矩阵尚未完整执行。

## Verification Policy Correction

- 旧规划把完整 `test → typecheck → build → verify` 设为默认 closeout ladder，且在没有 provisional impact trace 时已经执行；这是过宽验证，不是当前规则要求。
- 下方全项目结果只作为已经发生的历史证据保留，不再是本任务的当前 gate，也不授权后续重复运行。用户批准或要求实现该旧 plan 不构成独立 full-suite trigger。
- 当前 trace 只保留 Claude 受影响测试/语义/打包边界、定向本机探针和未通过的真实宿主矩阵。规则/Skill/文档纠正使用自己的 focused docs-rules-skills canary，不复跑产品测试。

## Contract Trace

| Concern | Evidence | Result |
| --- | --- | --- |
| Code inventory/title/history | [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1), [claudeCode.test.ts](../../../../tests/domain/claudeCode.test.ts#L1) | Code-only; strict id; App title; `completedTurns`; duplicates retained; stale active retired |
| Version-gated App state | [app-state.cjs](../../../../preload/claude/app-state.cjs#L1), [claudeAppStateBridge.test.ts](../../../../tests/platform/claudeAppStateBridge.test.ts#L1) | exact App version/grammar; request-id response; rotation/replay dedupe; incompatible fail closed; no content output |
| Hook fallback and priority | [events.cjs](../../../../preload/claude/events.cjs#L1), [index.cjs](../../../../preload/claude/index.cjs#L1) | exact App event → unique Hook → metadata history → unknown; ambiguity never fans out |
| Old-task terminal reconciliation | [events.cjs](../../../../preload/claude/events.cjs#L1), [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1), [claudeCode.ts](../../../../src/domain/claudeCode.ts#L1) | only Prompt opens parent Turn; Stop closes it; subagent/tool tails cannot revive; generation precedes time; same-Turn App terminal wins |
| Native unread | [unread.cjs](../../../../preload/claude/unread.cjs#L1), [claudeUnreadBridge.test.ts](../../../../tests/platform/claudeUnreadBridge.test.ts#L1) | exact tagged key; copy-before/after fingerprint; V2 generation; failure→unknown; same-completion read hint suppresses late true only after successful exact dispatch; new completion can unread again |
| Independent hot cache | [codexController.ts](../../../../src/runtime/codexController.ts#L1), [claudeCompanionController.test.ts](../../../../tests/runtime/claudeCompanionController.test.ts#L1), [claudeCompanionWatcherE2E.test.ts](../../../../tests/runtime/claudeCompanionWatcherE2E.test.ts#L1) | real `fs.watch` → parser → Bridge V2 → Controller revision → Float applied revision; separate clocks; 1s recovery; two failures→unknown; blocked quota is never awaited; regressions rejected |
| Per-task true sync | [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1), [codexController.ts](../../../../src/runtime/codexController.ts#L1), [FloatApp.vue](../../../../src/FloatApp.vue#L1) | exact current Claude identity; joinable state/unread reads; one publish max; partial failure feedback; successful-open silent sync; no manual completed/read override |
| Exact shortcut/open | [open.cjs](../../../../preload/claude/open.cjs#L1), [claudeBridge.test.ts](../../../../tests/platform/claudeBridge.test.ts#L1), [open probe](../../../../scripts/probe-claude-open-runtime.mjs#L1) | process-generation cache; cold discovery hard-bounded to 900ms; latest-target-wins; one Epitaxy final target; no import/launch/read mutation/clone |
| D′ archive transaction/open preflight | [archive.cjs](../../../../preload/claude/archive.cjs#L1), [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L1), [claudeBridge.test.ts](../../../../tests/platform/claudeBridge.test.ts#L1) | unique indexed target; completed/stopped + version/platform/stat/hash gate; only `isArchived` semantic change; atomic sibling rename; no Deep Link/AX/exec/LevelDB/non-target write; idempotent archived; concurrency-safe rollback classification; archived/missing open rejected; success copy confirms only EyPc removal and marks native sidebar unconfirmed |
| Provider-neutral action/mutation | [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1), [companionTaskActionsBridge.test.ts](../../../../tests/platform/companionTaskActionsBridge.test.ts#L1), [claudeCompanionController.test.ts](../../../../tests/runtime/claudeCompanionController.test.ts#L1) | exhaustive registry; archive never coalesced/replaced; same task joins; providers independent; stale target fails closed; verified removal once; failed/indeterminate retained; five-second exact shortcut identity |
| Dynamic quota/reset | [quota.cjs](../../../../preload/claude/quota.cjs#L1), [claude.ts](../../../../src/domain/claude.ts#L1), [claudeQuotaFallback.test.ts](../../../../tests/platform/claudeQuotaFallback.test.ts#L1) | explicit access gate; Claude Safe Storage v10 decrypt; account/org/scope arbitration; current `kind/percent/nested scope` shape; 401 fingerprint wait; 429 Retry-After; reset+1s schedule; scoped window survives partial patch |
| Virtual projects/provider UI | [companionAggregate.ts](../../../../src/domain/companionAggregate.ts#L1), [FloatApp.vue](../../../../src/FloatApp.vue#L1), [codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) | exact-key/unique-name merge; ambiguity separation; Claude-only batches; all/Codex/Claude filter and counts; unsupported Claude actions disabled; text ownership + 8%/12% backgrounds + Tab/ARIA/high-contrast |
| Packaging/IPC | [utools-preload-assets.mjs](../../../../scripts/utools-preload-assets.mjs#L1), [validate-utools-runtime.mjs](../../../../scripts/validate-utools-runtime.mjs#L1) | canonical/public/dist parity; V2 + inventory/unread/quota/presence ports; app-state packaged; no rejected native addon |

## Automated Evidence

- RAW-027 所属最终影响集为 `19/19` files、`575/575` tests；覆盖 Claude bridge/state/unread、watcher E2E、V2 Kernel/navigation、Controller/Platform/Float/UI，并证明 terminal phase 无需等待完整 inventory 即可更新 Claude 的安全归档能力。`pnpm run typecheck`、Canonical/Public Preload 同步、21 个 JS/CJS/MJS 语法检查、1870-module production/uTools build 和 validator 通过；产物身份为 `host-8dd41fb34ee0eaa27ae3 / renderer-2537cdea077c5e564f7b`。未运行全仓测试，真实 running→completed-unread 仍 pending。
- RAW-154 affected route passed：Domain/Bridge/Dispatcher/Controller/watcher/UI/feature-routing `20/20` files、`550/550` tests；`pnpm run typecheck` pass；`pnpm run build` pass with 1868-module Vite、runtime preparation and uTools validator；canonical/public main/action/Claude mirrors byte-identical，canonical JS/CJS syntax and `git diff --check` pass。No real Claude mutation canary was part of this automated gate；full-repository Vitest/`pnpm run verify` was not triggered。

- RAW-024 focused regression: `claudeBridge + claudeCode Domain + claudeCompanionController + Float UI` 为 `4/4` 文件、`120/120` 测试通过；固定动作注册定向用例 `1/1` 通过（同文件其余 168 项按影响边界跳过）。
- RAW-024 scoped semantic/package boundary: 临时 `vue-tsc` 配置只纳入 `FloatApp.vue / claudeCode.ts / appRuntime.ts / codexController.ts` 并通过；canonical preload 同步、Vite production bundle（1868 modules）、runtime asset preparation 与 uTools validator 均通过。
- Current RAW-019–023 impact set: quota/state/unread/aggregate/presentation/settings/Controller/watcher/Float tests selected from preload → bridge types → Controller → renderer trace; `16/16` files、`343/343` tests passed, including real-watcher E2E、App OAuth cadence/reset one-shot、stable unread failure→unknown、inventory/state ownership、read-hint/new-completion and provider-capability regressions.
- Final affected `typecheck` and production build passed; Vite transformed 1866 modules, then preload preparation/mirroring and uTools runtime validation passed.
- Final full Vitest: `74/74` files, `1061/1061` tests passed.
- One pre-existing MQTT mega-scenario performs about 32 full App snapshots. Under sustained multi-IDE CPU contention it twice exceeded Vitest's generic 5s default at `5.165s/5.301s`; its per-test timeout is now 10s. Assertions and production code were unchanged, the isolated case passed, and both the final exact `pnpm run test` and `pnpm run verify` passed.
- Final `typecheck`, production build, preload preparation/mirroring and uTools validator all passed.

## Sanitized Local Runtime Results

| Probe | Result | Verdict |
| --- | --- | --- |
| `probe:claude-code` | 30 reads; 26 Code rows; invalid ids 0; extra fields 0; inventory P95 2.03ms; watcher wake P95 73.95ms | inventory/project-key projection passed; watcher is not publish evidence |
| `probe:claude-live-state` (2026-08-08 RAW-024 build) | App 1.26832.0 compatible; 12 Hook entries; 27 rows; completedTurns 25; phases 0 running / 24 completed / 1 stopped / 2 unknown; sources 25 App log / 0 Hook / 0 metadata / 2 none | screenshot-era false running is corrected by current App terminals; one ambiguous and one source-less row remain unknown; controlled waiting transitions pending |
| `probe:claude-unread` | actual uTools host 30/30; native set count consistently 1; P95 26.17ms; temp leaks 0 | stable V2 reader and a real unread membership passed; EyPc click/removal/no-return interaction pending |
| `probe:claude-open -- --confirm-app-navigation` | 10 rapid actions → 1 final deep link; presence discovery 1; selection P95 0.03ms; dispatch P95 66.52ms; metadata 25→25, created/removed 0 | performance/no-clone passed |
| `probe:claude-quota` | Claude App v10 cache decrypted only in memory; endpoint HTTP 200; exactly 3 windows: session, weekly_all, weekly_scoped `Fable`; all carry reset; non-window `spend` rejected | App quota authority/Fable/reset source passed; final rendered same-screen check remains in UI matrix |

No probe output contains a session id, title, prompt, tool argument, raw App log line, LevelDB value, response body or credential.

## Superseded Over-Broad Historical Evidence

| Check | Result |
| --- | --- |
| `pnpm run test` | passed — 74 files / 1061 tests |
| `pnpm run typecheck` | passed |
| `pnpm run build` | passed — 1865 modules; preload prepare + uTools validator passed |
| `pnpm run verify` | passed — sync mirrors → 74 files / 1061 tests → typecheck/build/uTools validator |
| preload/public mirror + IPC/static validator | passed through build/verify and `validate:utools` |
| `git diff --check` | passed after final documentation edits |
| documentation-code-link audit | passed for the Controlled package, current authorities, help, error memories and historical tombstones |

Current authority: these rows prove only that the commands previously completed. They do not define future scope; wider reruns require a new impact-trace escalation trigger.

## RAW-029 D-1 / D-2 Focused Verification

| Evidence | Result |
| --- | --- |
| `tests/platform/claudeBridge.test.ts` + `tests/platform/companionTaskActionsBridge.test.ts` + `tests/runtime/claudeCompanionController.test.ts` | passed — 3 files / 100 tests；成功、幂等成功与 Controller 无消息兜底均使用“EyPc 已移除 / Claude 原生侧栏未确认”提示，且既有合同继续断言不调用原生动作、不执行脚本、不写 LevelDB |
| canonical/public/dist packaging boundary | passed — canonical 与 public 镜像一致，两个 CJS 均通过语法检查；typecheck、1870-module production build、runtime preparation 和 uTools validator 通过，产物身份 `host-36616822511986c18f2c / renderer-25da7ef64b81aadc76f8`。首次 validator false-red 固定了旧提示，三段语义锚点同步后最终全绿 |
| installed Claude App `1.26832.0` read-only artifact assessment | native archive mutates the running session-manager object, persists it and emits a same-session `archived` event；D′ writes the metadata file directly and does not enter that chain |
| official external interface assessment | official Desktop Deep Links expose chat/project/Code/Cowork navigation but no local Code archive/refresh；Managed Agents archive targets a different Beta `sessions` resource |
| privacy-safe runtime correlation | D′ target remains metadata-archived, but retained logs contain no matching native archive event；the current Claude process started after the canary, so current sidebar state cannot prove immediate convergence |

Verdict: D-1 is `focused-verified`。D-2 is `unsupported-currently`, not failed implementation：there is no supported entry that can satisfy the native ACK + same-running-process sidebar-removal postcondition。No private IPC、AX/JXA/UI automation、LevelDB write、App restart or additional real Claude mutation was executed。A possible later native whole-object save overwriting direct metadata is recorded only as an inference risk, not an observed incident。

## Interactive Host Matrix

| Step | Expected | Current |
| --- | --- | --- |
| New Code task | same App title/local row → running | inventory discovery observed; running UI not re-executed on final build |
| Permission request | same row → waiting-approval | pending |
| AskUserQuestion | same row → waiting-input | pending |
| Response | same row → running | pending |
| Background complete | same row → completed-unread when native set contains id | pending |
| Delayed completion/open race | a delayed phase/unread publish rebases onto the latest package；opening in Claude during delay may clear unread but must not erase the completed phase or session row | deterministic lane/singleflight/rebase tests pass；real App timing pending |
| Open original | exact original row; native set removes id; completed-read | no-clone passed; native unread removal pending |
| Sync old task | current App terminal/read state replaces stale EyPc running/unread through the existing lane | automated identity/singleflight/partial-failure/open cases pass; real old-task UI sync pending |
| Title/activity change | one metadata patch; state/unread preserved | automated passed; real UI pending |
| Restart | history completed restored; no persisted live phase | cold probe passed; real UI pending |
| Quota | 5h/all-model/Fable/Fable 5 + absolute/relative reset/freshness match App | source HTTP 200 and three-window projection passed; final uTools same-screen rendering pending |
| EyPc D′ archive | one separately authorized disposable completed/stopped target becomes `isArchived=true`; EyPc card removes immediately; no Claude window opens | deterministic transaction tests implemented; **real preload canary executed 2026-08-10 under explicit user authorization** — production `createClaudeBridge` composed with real deps against live App data, one `completed`/`app-log`/`compatible` target archived, `outcome=archived / alreadyArchived=false`, semantic diff exactly one key (`isArchived` false→true) over an unchanged 22-key object, `-rw-------` preserved, zero residual `eypc-*.tmp`, target dropped from active inventory (14→13), re-call idempotent `alreadyArchived=true` with the file hash unchanged, and no Claude window opened. Renderer→Dispatcher→Float card-removal click path in the real uTools host remains pending |
| Claude App manual archive | exact file event removes same EyPc card within 250ms P95; one dropped callback recovers within 1.25s | deterministic exact watcher + watchdog tests implemented; real App observation pending |

## Privacy / Mutation Audit

- Historical probes did not write, delete, merge or repair Claude App session/title/unread/archive/quota data. RAW-154 automation writes only disposable test fixtures。更新引入（2026-08-10）：一次用户显式授权的真实 D′ canary 已执行，唯一写入是单一目标 `local_5d01ce01-…` 的 `isArchived` 字段；写前已对原文件取 SHA-256 备份，事务后语义 diff 证明其余 21 个键与权限位完全未变，未触碰其它会话、标题、未读、额度或 LevelDB。
- The sync action reads only current state/unread and has no phase/read payload; no public preload API, persistence schema or Claude App write was added.
- Production D′ is a narrow explicit exception: one unique indexed `local_*.json` target, `isArchived=true` only, original bytes/mode retained for guarded rollback, no path crosses Bridge, and LevelDB/other sessions/non-target fields remain untouched.
- Open probe only navigated an already-running App to an existing Code row and observed no metadata clone.
- Unread reader opened only copied snapshots and removed all temporary directories.
- `_to_delete/` and unrelated dirty-tree changes were preserved.

## Documentation Receipt

- 历史 revision 5 回执曾以 26 documents / 41 dependencies / 22 validators 命中，随后因共享 provider 文档获得外来 RAW-149 hunk 而正确变为 `scope_changed`；该事实保留为历史，不再冒充当前门禁。
- RAW-154 将清单扩展为 34 documents / 49 dependencies / 31 validators，纳入 Codex v9 任务包、统一 Dispatcher、Claude D′、mutation/shortcut 与新增验证文件。最终复核 33 个变更 Markdown 零断链，`AGENTS.md`/`CLAUDE.md` 工具专属导语不同但共享适配器正文一致，并修正残留的 v8 当前口吻与 interrupted 等 idle 冲突。
- RAW-029 将新增原生侧栏后置条件错误记忆纳入清单，当前 manifest 为 35 documents / 49 dependencies / 31 validators；D-1/D-2 当前权威、Claude/Codex 关联任务、帮助、架构、技术细节与错误索引通过最终代码链接审计和真实 Primary 计数复核。
- 当前私有 `documentation-sync-v2` 回执已按 `requirement-canonical` 影响重新记录；CodeNote 全局规则/Skill 回执仍由其父 Rule Task 独立持有。该回执只证明文档、依赖和验证器在当前工作树一致，不替代 v9 宿主重接入、真实 Float 点击移除、Claude App 手动归档 delta 或其它交互门禁。

## Review Closure

- Tool: Codex App Root, with the two earlier read-only repository audits accepted as evidence.
- Review target: Claude Code Companion revision 5 implementation, tests, Controlled package, current project authorities and old-task linked archives.
- Checked: source authority boundaries, event ordering, privacy projection, inventory failure behavior, title-only metadata patches, log version/dedupe behavior, Node 16 transport, per-window quota freshness, keyboard tooltip access, process-generation open cache, mirror/IPC packaging and watcher-to-publish latency.
- RAW-024 impact-set P0/P1 open findings: none. The project-wide audit still reports the pre-existing adaptive error-index migration debt already present in HEAD; it is outside this change and was not auto-migrated. Closed findings include Stop-tail revival, inventory failure clearing the hot view, title patch advancing historical completion evidence, implicit global `fetch`, duplicate-log occurrence collapse, per-event App version process reads, unbounded cold presence discovery, snapshot-level quota freshness guessing, repeated post-reset wake-up, stale unread retention after reader failure, inventory resurrecting a retired active state, partial plan data overwriting App-owned windows, and Claude tasks forwarding Codex project actions.
- Historical overreach: the unrelated MQTT mega-scenario entered the run only because the full suite was selected. Its observed timeout and local threshold change are not evidence for Claude Companion and must not justify future full-suite selection.
- Not checked/accepted: actual permission/AskUserQuestion/response sequence, EyPc click→native unread removal→same-round no-return→new completion unread, title/restart UI observation, three project filters on real mixed data and final rendered quota/ownership high-contrast check.

## Acceptance Rule

Code delivery can be handed off with the explicit pending gates above, but the feature/task must not be marked `accepted` or `completed` until the full interactive matrix and live Fable/reset comparison pass. A failure updates this same Controlled task; it cannot silently restore any `ARCH-20260807-*` route.
