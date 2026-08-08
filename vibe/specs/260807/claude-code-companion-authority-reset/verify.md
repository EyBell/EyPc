# Claude Code Companion 权威重置 — Verification

updated: `2026-08-07`
status: `implementation-landed / automated-verified / quota-host-verified / interactive-host-partial`

## Verification Verdict

- 代码实现、确定性测试与隐私安全的定向本机探针已证明：Code-only/App title、历史 completed 恢复、版本门禁日志、唯一 Hook fallback、精确 LevelDB reader、独立热缓存 lane、quota 阻塞隔离、连续快捷跳转单飞和 no-clone 路径成立。
- watcher wake 只记录 source latency，不再作为最终 UI publish 证据。Controller 自动化从 watcher-shaped state delta 跑到 publish，并在 quota promise 阻塞时验证 100 次状态转换 P95 `<=250ms`。
- 本轮新增的 App quota 权威已在真实加密缓存上返回 HTTP 200，并只投影 5h、全模型周、Fable scoped 周额度及 reset；状态/未读/项目/视觉的确定性链路通过。
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
| Native unread | [unread.cjs](../../../../preload/claude/unread.cjs#L1), [claudeUnreadBridge.test.ts](../../../../tests/platform/claudeUnreadBridge.test.ts#L1) | exact tagged key; copy-before/after fingerprint; V2 generation; failure→unknown; same-completion read hint suppresses late true only after successful exact dispatch; new completion can unread again |
| Independent hot cache | [codexController.ts](../../../../src/runtime/codexController.ts#L1), [claudeCompanionController.test.ts](../../../../tests/runtime/claudeCompanionController.test.ts#L1), [claudeCompanionWatcherE2E.test.ts](../../../../tests/runtime/claudeCompanionWatcherE2E.test.ts#L1) | real `fs.watch` → parser → Bridge V2 → Controller revision → Float applied revision; separate clocks; 1s recovery; two failures→unknown; blocked quota is never awaited; regressions rejected |
| Exact shortcut/open | [open.cjs](../../../../preload/claude/open.cjs#L1), [claudeBridge.test.ts](../../../../tests/platform/claudeBridge.test.ts#L1), [open probe](../../../../scripts/probe-claude-open-runtime.mjs#L1) | process-generation cache; cold discovery hard-bounded to 900ms; latest-target-wins; one Epitaxy final target; no import/launch/read mutation/clone |
| Dynamic quota/reset | [quota.cjs](../../../../preload/claude/quota.cjs#L1), [claude.ts](../../../../src/domain/claude.ts#L1), [claudeQuotaFallback.test.ts](../../../../tests/platform/claudeQuotaFallback.test.ts#L1) | explicit access gate; Claude Safe Storage v10 decrypt; account/org/scope arbitration; current `kind/percent/nested scope` shape; 401 fingerprint wait; 429 Retry-After; reset+1s schedule; scoped window survives partial patch |
| Virtual projects/provider UI | [companionAggregate.ts](../../../../src/domain/companionAggregate.ts#L1), [FloatApp.vue](../../../../src/FloatApp.vue#L1), [codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) | exact-key/unique-name merge; ambiguity separation; Claude-only batches; all/Codex/Claude filter and counts; unsupported Claude actions disabled; text ownership + 8%/12% backgrounds + Tab/ARIA/high-contrast |
| Packaging/IPC | [utools-preload-assets.mjs](../../../../scripts/utools-preload-assets.mjs#L1), [validate-utools-runtime.mjs](../../../../scripts/validate-utools-runtime.mjs#L1) | canonical/public/dist parity; V2 + inventory/unread/quota/presence ports; app-state packaged; no rejected native addon |

## Automated Evidence

- Current RAW-019–023 impact set: quota/state/unread/aggregate/presentation/settings/Controller/watcher/Float tests selected from preload → bridge types → Controller → renderer trace; `16/16` files、`343/343` tests passed, including real-watcher E2E、App OAuth cadence/reset one-shot、stable unread failure→unknown、inventory/state ownership、read-hint/new-completion and provider-capability regressions.
- Final affected `typecheck` and production build passed; Vite transformed 1866 modules, then preload preparation/mirroring and uTools runtime validation passed.
- Final full Vitest: `74/74` files, `1061/1061` tests passed.
- One pre-existing MQTT mega-scenario performs about 32 full App snapshots. Under sustained multi-IDE CPU contention it twice exceeded Vitest's generic 5s default at `5.165s/5.301s`; its per-test timeout is now 10s. Assertions and production code were unchanged, the isolated case passed, and both the final exact `pnpm run test` and `pnpm run verify` passed.
- Final `typecheck`, production build, preload preparation/mirroring and uTools validator all passed.

## Sanitized Local Runtime Results

| Probe | Result | Verdict |
| --- | --- | --- |
| `probe:claude-code` | 30 reads; 26 Code rows; invalid ids 0; extra fields 0; inventory P95 2.03ms; watcher wake P95 73.95ms | inventory/project-key projection passed; watcher is not publish evidence |
| `probe:claude-live-state` | App 1.26832.0 compatible; 12 Hook entries; 26 rows; completedTurns 24; phases 3 running / 17 completed / 4 stopped / 2 unknown; sources 16 App log / 8 Hook / 0 metadata / 2 none | current live/history projection passed; controlled waiting transitions pending |
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

## Interactive Host Matrix

| Step | Expected | Current |
| --- | --- | --- |
| New Code task | same App title/local row → running | inventory discovery observed; running UI not re-executed on final build |
| Permission request | same row → waiting-approval | pending |
| AskUserQuestion | same row → waiting-input | pending |
| Response | same row → running | pending |
| Background complete | same row → completed-unread when native set contains id | pending |
| Open original | exact original row; native set removes id; completed-read | no-clone passed; native unread removal pending |
| Title/activity change | one metadata patch; state/unread preserved | automated passed; real UI pending |
| Restart | history completed restored; no persisted live phase | cold probe passed; real UI pending |
| Quota | 5h/all-model/Fable/Fable 5 + absolute/relative reset/freshness match App | source HTTP 200 and three-window projection passed; final uTools same-screen rendering pending |

## Privacy / Mutation Audit

- Claude App session, title, unread, archive and quota data were not written, deleted, merged or repaired.
- Open probe only navigated an already-running App to an existing Code row and observed no metadata clone.
- Unread reader opened only copied snapshots and removed all temporary directories.
- `_to_delete/` and unrelated dirty-tree changes were preserved.

## Review Closure

- Tool: Codex App Root, with the two earlier read-only repository audits accepted as evidence.
- Review target: Claude Code Companion revision 4 implementation, tests, Controlled package, current project authorities and old-task tombstones.
- Checked: source authority boundaries, event ordering, privacy projection, inventory failure behavior, title-only metadata patches, log version/dedupe behavior, Node 16 transport, per-window quota freshness, keyboard tooltip access, process-generation open cache, mirror/IPC packaging and watcher-to-publish latency.
- P0/P1 open findings: none. Closed findings include inventory failure clearing the hot view, title patch advancing historical completion evidence, implicit global `fetch`, duplicate-log occurrence collapse, per-event App version process reads, unbounded cold presence discovery, snapshot-level quota freshness guessing, repeated post-reset wake-up, stale unread retention after reader failure, inventory resurrecting a retired active state, partial plan data overwriting App-owned windows, and Claude tasks forwarding Codex project actions.
- Historical overreach: the unrelated MQTT mega-scenario entered the run only because the full suite was selected. Its observed timeout and local threshold change are not evidence for Claude Companion and must not justify future full-suite selection.
- Not checked/accepted: actual permission/AskUserQuestion/response sequence, EyPc click→native unread removal→same-round no-return→new completion unread, title/restart UI observation, three project filters on real mixed data and final rendered quota/ownership high-contrast check.

## Acceptance Rule

Code delivery can be handed off with the explicit pending gates above, but the feature/task must not be marked `accepted` or `completed` until the full interactive matrix and live Fable/reset comparison pass. A failure updates this same Controlled task; it cannot silently restore any `ARCH-20260807-*` route.
