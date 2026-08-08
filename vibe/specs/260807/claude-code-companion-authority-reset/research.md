# Claude Code Companion 本地通信状态谨慎调研与严格测试通路

updated: `2026-08-08`
evidence_scope: `installed Claude App 1.26832.0 + current EyPc source + privacy-safe local observations`
status: `selected-route-implemented / automated-verified / targeted-host-partial / interactive-host-pending`

## Executive Conclusion

Claude App 内部确实拥有 running、权限等待、AskUserQuestion、完成和 unread 语义，但没有已确认的公开、稳定、完整外部订阅 API。仅靠 official Hooks 无法可靠恢复历史完成，也不能表达全部 App 本地状态；私有 IPC 注入则把 EyPc 绑定到内部 origin/channel，风险高且不可维护。

最终采用用户已选择的组合：**版本门禁私有 App 日志 + official Hooks + App Code 元数据 + 原生 LevelDB unread**。前两者共同提供 live phase，`completedTurns` 提供冷启动历史完成，LevelDB 未读与 phase 正交。库存、状态、未读、额度和 App presence 在 Controller 中是独立热 authority，不能被一轮全量刷新或额度网络串联。

当前实现和定向探针已经证明历史恢复、精确 unread reader、连续快捷跳转/no-clone、lane 隔离和 Claude App 额度主权威。Claude Code 凭据访问额度接口返回 `401`；显式授权后只读 Claude App 当前账号加密缓存得到 `200`，动态解析出 `session`、`weekly_all` 与 `weekly_scoped · Fable` 三个窗口及 reset。最新自然样本包含 3 条 running，原生 unread 30/30 稳定包含 1 条，但没有受控触发 waiting/response，也没有通过 EyPc 消费该未读。因此 permission/AskUserQuestion、EyPc 点击移除/不回跳/新 completion 再未读、项目筛选与 Fable/reset 最终渲染同屏仍是未通过门禁，不得宣称完整验收。

## Local Evidence Boundary

- 安装产物：Claude App `1.26832.0`。日志 parser 对此版本做精确 compatibility gate；其它版本不尝试宽松匹配。
- 所有探针只输出聚合计数、枚举状态、耗时和脱敏错误类别；不输出 local id、CLI id、标题、路径、prompt、工具参数、LevelDB 值、OAuth token 或 response body。
- App Code 元数据、App logs、Local Storage 和 plan history 全程只读。唯一会写用户 Claude 配置的路径仍是用户主动触发的 official Hook/statusline 注册；本轮没有删除、归档、合并或修复会话。
- 私有 App 代码/IPC 只用于确认语义和选择边界，不注入 renderer、不注册私有 channel、不作为生产 transport。

## Baseline That Invalidated The Old Completion Claim

| Observation | Baseline result | Consequence |
| --- | --- | --- |
| New Code task | inventory increased from 24 to 25 | new-task discovery works, but proves only the hot inventory path |
| Historical phase | 25 rows: 17 unknown, 0 completed | Hooks-only cannot restore historical completion |
| Existing changes | title/activity/state updates lagged behind | all-authority refresh and weak evidence merge were incorrect |
| Watcher measurement | 100 callbacks were fast | callback latency did not measure Controller/UI publication |
| Quota | two generic windows, no scoped Fable/Fable 5 | plan history is partial, not a full quota authority |

## Source-by-source Assessment

| Concern | Local source | Proven capability | Risk/freshness | Production decision |
| --- | --- | --- | --- | --- |
| Inventory/title/history | `claude-code-sessions/.../local_*.json` | App local id/title/project/archive/activity/`completedTurns` | file event + bounded rescan | selected |
| Exact live App phase | version-gated `main1.log` / `main.log` templates | local-id send/wait/response/completed/stopping | private syntax; fail closed on version/grammar mismatch | selected primary live evidence |
| Fallback live phase | official Claude Code Hooks | prompt/tool/permission/AskUserQuestion/Stop/SessionEnd | CLI id may be ambiguous across App wrappers | selected only after unique correlation |
| Native unread | Local Storage exact tagged `epitaxy-unread-v1` | App sidebar unread membership | snapshot cadence; reader/format can fail | selected orthogonal authority |
| App presence/open | main App process + Epitaxy local deep link | existing local history navigation | private route, must no-clone test | selected with cache + fail closed |
| Full quota | explicitly authorized Claude App OAuth + authenticated usage `rate_limits` response | dynamic windows/scope/reset | private endpoint/cache shape; fail closed and back off | selected primary quota authority |
| Partial quota | `plan-usage-history.json` | two plain percentages | lacks scoped windows/reset | selected patch only |
| Private IPC injection | internal session manager channels | semantically rich native state | unsupported origin/channel coupling | rejected production route |

## Status Semantics And Priority

| Priority | Evidence | Result | Guard |
| --- | --- | --- | --- |
| 1 | compatible App log row with exact local id | running / waiting-approval / waiting-input / completed / stopped | fixed grammar only; request-id links permission response; dedupe rotation/replay |
| 2 | official Hook uniquely correlated to one App row | same phase set | duplicate CLI relation cannot fan out |
| 3 | `completedTurns > 0` and no newer active evidence | historical completed | only cold/history fallback; stale active is retired |
| 4 | missing, ambiguous or conflicting active evidence | unknown | process existence alone cannot guess phase |

`unread` is not another phase. Exact live running/waiting wins. For non-live history, membership in the App native unread set can itself establish `completed-unread`; this fixes the old circular requirement that a task first be Hook-completed before native unread could matter. A parse/copy/open failure returns unread unknown and cannot reuse the previous set.

## Old-task Terminal Reconciliation And Per-task Sync

- 本轮旧任务假 running 的决定性序列是 `UserPromptSubmit → Stop → SubagentStop`（并可继续带 PostTool/SessionEnd 尾事件）。旧 fold 把未单列的尾事件统一解释成 running，实际错误在父 Turn 生命周期，不在轮询频率。
- 候选 1“人工标完成/已读”被拒绝：它会制造第二权威且无法区分新 Turn。候选 2“点击后单独读取真实来源”被保留，但必须加入现有 state/unread lane，不能另建 refresh 通道。候选 3“只提高全量轮询”被拒绝：错误 reducer 会更快重放错误状态。
- 选定路线把 `UserPromptSubmit` 定为唯一 Turn-open 事件；subagent start/stop 只推进活动水位。App terminal 对同 Turn Hook tail 有权威优先，严格更新的新 Prompt 才可重新激活。`completedTurns` 保持冷历史 fallback。
- 状态包比较固定为 source generation → evidence time → source authority，避免新 generation 的纠错因较旧事件时间被拒绝。Controller 的 state/unread Promise 可由 watcher、单项操作与打开后同步共同加入，并通过最终 revision 去重最多一次发布。
- “同步 Claude 状态”只匹配当前未归档 `local_*` session 的精确 key/alias；部分 state/unread 失败分别反馈，unread 失败保持 unknown。成功 deep-link 派发后静默同步仍保留原有 read hint 与四次原生复读；失败派发不触发任何确认。

## Private Log Grammar And Privacy Gate

- Accepted semantic classes are deliberately narrow: sending message; permission request; AskUserQuestion; permission response linked by request id; Query completed/Turn succeeded; Stopping/failure.
- The reader tails bounded files, handles rotation/truncation, removes duplicate/out-of-order repeats and publishes only sanitized state observations.
- Unknown syntax is ignored. Unsupported App version makes the entire log source incompatible; it does not fall through to a best-effort regex.
- Raw lines, prompt fragments, tool arguments and response text never leave [app-state.cjs](../../../../preload/claude/app-state.cjs#L1) and are never persisted by EyPc.

## Native Unread Experiment

- The true Local Storage key is not just the visible suffix. The exact bytes include the Chromium storage origin prefix, NUL separator and string type tag before `epitaxy-unread-v1`.
- The production reader uses strict key equality. A fixture with a suffix lure proves a similarly named key cannot be accepted.
- App Local Storage is copied into a fresh private `0700` directory; only the copy is opened with uTools' own host-signed `leveldown`, then database and directory are always closed/removed.
- Actual uTools host result after final build: 30/30 reads, P95 `26.17ms`, leaked snapshots `0`. The native set consistently contained one row, proving exact readable membership and cleanup; the required EyPc click→native removal→no-return interaction remains separate.
- Rejected routes: bundled native addon (host signature mismatch), WAL/`.ldb` byte scanning (not a real database read), last-known set, EyPc open receipt, direct App database write.

## Global Cache And Incremental Communication

- Feature enablement owns the lifetime; page/float visibility does not. The same Controller materialized maps feed cards, badges and shortcuts.
- Inventory owns membership and metadata; state delta patches only evidence/phase; unread owns native membership; quota owns windows; App presence owns process identity. Each has its own in-flight/pending lane.
- Evidence generation and timestamps are monotonic per authority. A slow inventory read may patch a title but cannot regress a newer state delta; a state delta cannot erase metadata.
- Inventory failure retains the last valid materialized inventory. Unread failure deliberately clears certainty to unknown. Quota failure affects only quota diagnostics and retry schedule.
- A deterministic Controller test blocks quota for 8 seconds while running 100 state transitions and requires final publish P95 `<=250ms`; inventory is not reread. A separate 1-second recovery watcher bounds missed notifications to `<=1.25s`.
- This is the measurement boundary: fs watcher wake time is only source wake latency; acceptance requires event→reader→Controller merge→publish measured on one monotonic clock.

## Exact Open And Shortcut Route

- Selected route: `claude://claude.ai/epitaxy/<localSessionId>` for a canonical existing App local id.
- Presence caches bundle id, main PID and start token. Warm checks use low-cost liveness; full process/window discovery runs only on cold start or invalidation.
- Shortcut selection reads the materialized view synchronously, advances the cursor, then enters a latest-target-wins singleflight queue. Ten rapid invocations must emit only the final target.
- Actual probe: ten rapid shortcuts → one final deep link; presence inventory reads `1`; selection P95 `0.03ms`; dispatch P95 `66.52ms`; metadata before/after `25/25`, created `0`, removed `0`.
- Rejected: `claude://resume` / `importCliSession`, CLI/terminal resume, title-based accessibility click, auto-launch and open-as-read mutation.

## Quota Route And Current Boundary

- Node 16 has no guaranteed global `fetch`; [quota.cjs](../../../../preload/claude/quota.cjs#L1) therefore uses explicit HTTPS with timeout, abort and bounded response size.
- 显式 `claudeAppQuotaAccess` 授权后，macOS 只读 Claude App `oauth:tokenCacheV2`，通过 Claude 专属 Safe Storage Keychain 项在内存解密；账号/组织不能唯一确认即失败关闭。凭据、密钥和缓存明文不进入日志、诊断、Renderer 或持久化。
- 当前上游真实形状为 `limits[].kind/percent/scope.model.display_name`；投影同时兼容旧字段，并按动态 key 保留窗口。Window label/source/updatedAt/freshness/reset 均逐窗口保存；Fable/Fable 5 不进入硬编码白名单。
- plan history currently provides only two unscoped values. It may patch those percentages but cannot delete a retained scoped window or reset.
- Expired/implausible reset becomes null. 启用、启动、唤醒、聚焦、网络恢复与最早 reset+1 秒触发独立 quota lane；正常间隔遵循 `quotaRefreshSeconds`。401/403 等待凭据缓存指纹变化，429 遵循 Retry-After，其它错误按 1m → 5m → 15m → hourly 退避并保留标记为可能过期的最后成功值。
- 隐私安全实机探针已证明：Claude Code 凭据路线返回 `401`，Claude App 加密缓存路线返回 `200`；结果严格为 5h、全模型周、`Fable` scoped 周三个窗口，均包含 reset，`spend` 未进入额度投影。数据权威门禁已通过；uTools 最终渲染的同屏视觉对照仍属于交互验收。

## User Choices And Rejected Alternatives

| Area | User-selected route | Alternatives examined and rejected |
| --- | --- | --- |
| Sessions | App Code metadata only | CLI-only, Cowork, mixed desktop inventory |
| Titles | App title + human blank fallback | UUID/unique encoding |
| State | version-gated App log + unique Hooks + metadata history | Hooks-only, private IPC injection, mtime/audit, latest event |
| Unread | exact native LevelDB snapshot | EyPc receipt, no unread, byte scan, stale set |
| Opening | cached exact Epitaxy existing-history deep link | resume/import, CLI, AX title, auto-launch |
| Cache | feature-lifetime process materialized view, independent lanes | page cache, per-open enumeration, full refresh |
| Quota | Node HTTPS dynamic windows + long-lived backoff | global fetch, fixed two fields, only three process attempts |
| Completion | full interactive matrix before accepted | new-task success or watcher callback benchmark as proxy |

## Strict Local Test Route

### Gate A — deterministic state fixtures

1. Code metadata fixtures include Code/Cowork/CLI-only/archived/duplicate/mismatched id/`completedTurns`; assert only canonical Code rows, App titles, duplicate preservation and history completion.
2. App log fixtures cover supported/unsupported versions, each fixed template, permission request-id response, rotation, duplicate and out-of-order rows; assert privacy-safe output and fail closed.
3. Hook fixtures cover unique, direct local and ambiguous duplicate relation; ambiguity stays unknown and cannot update multiple rows.
4. State priority fixtures assert new live evidence beats history, stale active loses to newer completed metadata, active conflict stays unknown and unread promotes only non-live history.
5. Ordered Hook fixtures replay Prompt→Stop→SubagentStop/PostTool/SessionEnd, subagent events without a parent Turn and a strictly newer Prompt; same-Turn App terminal must defeat Hook tail activity.

### Gate B — incremental Controller path

1. Send real watcher-shaped inventory/state/unread events through Bridge facades into Controller publish; assert one authority changes per event.
2. Block quota for 8 seconds and run 100 state transitions; require publish P95 `<=250ms`, no inventory reread and no missing notification.
3. Suppress one source notification; require recovery `<=1.25s` with no duplicate card/bucket.
4. Race slow inventory with a newer state delta; title patch survives and phase never regresses. Inventory failure retains the view; unread failure becomes unknown.
5. Run two concurrent per-task sync requests; require one state read, one unread read and at most one publication. Reject mismatched identity without reads, report partial failures, and prove successful open syncs silently while failed dispatch performs zero sync.

### Gate C — exact unread host lane

1. Test exact tagged key, suffix lure, absent/malformed values, compacted tables, WAL, concurrent copy churn and reader load failure.
2. Assert original DB is never opened, snapshot mode is `0700`, all result ids are legal and every exit removes the temp directory.
3. Execute at least 30 prepared uTools/Electron reads; require 30 successes, P95 `<50ms`, zero leak and no fallback reader.
4. During interactive acceptance, observe one real Claude native unread marker enter and leave together with `epitaxy-unread-v1`; mismatch keeps unread unknown and reopens this same research task.

### Gate D — shortcut/no-clone lane

1. Pure tests allow only canonical local ids and Epitaxy URL; reject App not-running/unknown and all import/launch paths.
2. Ten rapid previous/next actions must leave cache cursor and the one final dispatched URL on the same target; selection `<=10ms`, warm dispatch P95 `<=150ms`, cold validation P95 `<=1s`.
3. Compare App metadata set before/after; require no created/removed row and no source metadata mutation.

### Gate E — quota lane

1. Feed two, three, Fable/Fable 5 and unknown future windows; assert dynamic labels, ordering, source/freshness and reset parsing.
2. Merge a newer two-window plan sample over scoped/full snapshots; scoped window/reset survives, expired reset clears.
3. Simulate timeout/HTTP errors and verify immediate/1m/5m/15m/hourly schedule, singleflight and successful 5m reset.
4. With actual App/account,先用隐私安全探针核对 5h、全模型周、Fable/Fable 5、absolute reset、relative distance 和 freshness，再在 uTools 最终渲染同屏对照；当前数据探针已通过，最终 UI 对照仍待执行。

### Gate F — impact-selected project evidence and interactive matrix

1. Build/reconcile the provisional `VerificationImpactTrace`, then run only affected Claude tests, the semantic/build boundary actually reached by the diff, preload/public mirror and IPC static validation when their inputs changed, plus `git diff --check` and affected document-code-link audit. A repository-wide suite requires a new recorded escalation trigger; plan approval is not one.
2. Reload actual uTools plugin; execute new→running, permission→waiting-approval, AskUserQuestion→waiting-input, response→running, background completion→completed-unread, open original→completed-read, title/activity patch and process restart history recovery.
3. Assert same App local identity, no duplicate visible bucket, no session clone, no App write and end-to-end latency targets.
4. Only after Gate F and Gate E live quota pass may `PROJECT_STATUS` change to accepted/completed.

## Executed Sanitized Evidence

| Gate | Result | Status |
| --- | --- | --- |
| Inventory/state sources | RAW-024 build: 27 Code rows; 25 rows with completedTurns; phases 0 running / 24 completed / 1 stopped / 2 unknown; sources 25 App log / 0 Hook / 2 none | old false-running projection corrected; one ambiguous and one source-less row remain unknown; controlled waiting/response matrix pending |
| Code reader/watcher | 30 inventory reads; invalid ids 0; extra fields 0; inventory P95 2.03ms; watcher wake P95 73.95ms | reader passed; watcher metric is not E2E publish |
| Native unread | uTools host 30/30; P95 26.17ms; leaks 0; current native set consistently 1 | reader plus real membership passed; EyPc click/removal/no-return pending |
| Shortcut/open | 10 rapid actions → 1 final dispatch; selection P95 0.03ms; dispatch P95 66.52ms; 25/25 metadata, clones 0 | passed |
| Quota | Claude Code credential HTTP 401；显式授权的 Claude App v10 加密缓存 HTTP 200；session / weekly_all / weekly_scoped `Fable` 三窗及 reset，`spend` 排除 | data authority/Fable/reset passed; final rendered same-screen check pending |
| Project automation | history/log/unread/lane/race/blocked-quota/singleflight focused regressions passed; the historical 74-file ladder also ran but is superseded as a default requirement and must not be repeated without a new impact trigger | see [verify.md](verify.md#L1) |

## Reuse And Re-research Boundary

未来从本文件继续，不重新选择已拒绝路线。只有这些事实变化才重开技术路线：Claude App 版本/日志 grammar 变化、官方 Hook contract 变化、Code metadata family 变化、exact LevelDB key/backend 变化、Epitaxy no-clone 失败、uTools host reader 失效、usage endpoint 或公开 quota contract 变化。单一 UI 症状只能触发同一 Gate 的复核，不能恢复 Hooks-only、私有 IPC 注入、字节扫描、import 或全量刷新。
