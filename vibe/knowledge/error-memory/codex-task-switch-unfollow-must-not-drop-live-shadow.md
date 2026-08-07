---
id: eypc-codex-task-switch-unfollow-must-not-drop-live-shadow
status: verified
scope: project
fingerprint: codex-stopped-or-completed-task-not-synchronized-after-task-switch__desktop-owner-following-false-dropped-or-replayed-live-shadow__task-selection-follow-change-confused-with-client-loss-or-terminal-edge__retain-inventoried-shadow-refollow-and-reconcile-ambiguous-active
first_seen: 2026-07-29
last_verified: 2026-08-07
review_after: 2027-02-07
evidence:
  - preload/index.js
  - public/preload.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/raw-requirement.md
  - vibe/specs/260718/1148-codex-quota-float/verify.md
  - current-official-thread-status-cross-check
  - real-ipc-follow-echo-reproduction
  - active-utools-asar-preload-hash-readback
  - current-codex-asar-follow-protocol-inspection
  - bounded-fixed-dist-ipc-probe
tags:
  - codex-companion
  - desktop-ipc
  - stream-owner
  - task-switch
  - stopped
  - completed
  - live-shadow
  - follow-echo
  - protocol-loop
---

# Task Selection Unfollow Must Not Drop Inventoried Live Authority

## 更新引入（2026-08-07）

RAW-147 将正向 follower 公告回声归入本记录，因为它与 task-selection unfollow 共享同一个 stream-follow 所有权边界。本记录是该协议回声的唯一主记录；[pending user request](codex-pending-user-request-overrides-idle-runtime.md#L1) 只引用“正向公告不是状态快照”这一前提，不重复保存回声根因、修复或验收路线。本更新取代任何把 `following=true` 描述为 owner acknowledgement、快照确认或重报请求的旧表述。

## Symptom

An explicitly stopped task appeared ongoing by default. Selecting that stopped task made it display correctly, but selecting a genuinely active task made the stopped task return to the ongoing group and increase the ongoing badge again. The user then confirmed that a task completing on the same selection edge also failed to synchronize.

## Wrong Assumption

The bridge treated every owner `thread-stream-following-changed(following=false)` message as equivalent to the Desktop client disconnecting. In practice, Codex Desktop also changes its followed conversation when the user changes the selected task.

## Candidate Root Cause

The `following=false` branch deleted the previous task's exact `desktop-live idle` shadow and immediately restored connector authority. An interrupted/failed Turn without exact live idle is intentionally conservative, so the domain projector correctly—but undesirably for this false authority loss—returned the task to ongoing. After retaining the shadow, a second race remained: a missed complete notification plus refollowed old active replay left the cached Turn at inProgress, so terminal-active snapshot corroboration never started. A third regression then rejected a complete, exact `turn/completed` event when the provider's second-granular `completedAt` did not strictly exceed the millisecond local active-observation time. The final reproduced boundary was a resumed interrupted Turn that kept the same `startedAt`: if the intermediate inProgress event was missed, both direct completion and refollow latest-Turn freshness rejected current completed because the cache was still interrupted; terminal snapshot settlement could also emit idle/completed without `targeted-after-exit`, allowing Controller to guard it back to ongoing. The separate `client-status-changed(disconnected/closed)` branch already owns real client loss.

## Verified Runtime Root Cause (2026-08-07)

The positive follow path has a separate protocol loop. Current Codex package inspection shows that `thread-stream-following-changed(following=true)` announces the sender's own follower state; it is not a request for the receiver to announce again. The former branch now represented by the no-reply boundary at [preload/index.js](../../../preload/index.js#L3519) treated every positive peer announcement as a fresh request and sent the same positive frame back to its source. With two old EyPc followers connected, each new announcement triggered the other and the broker carried an unbounded follower-to-follower echo. A bounded real-IPC probe observed 32,329 targeted positive echoes in 250ms and about 368,000 in 2.5s, while receiving no `thread-stream-state-changed` snapshot.

The loop explains both latency modes. The task remains admitted to inventory, but its exact live/request authority never arrives, so the Controller's 5-second activity read only replays the same connector state. A later full reconciliation may recover a structurally persisted `request_user_input` on the configured task interval; if no safe persisted decision is available, the task remains conservatively ongoing and never reaches waiting-input.

## Evidence

- The user reported the stopped → selected-stopped → selected-active oscillation and the associated badge error.
- The user then reported that completed state also failed to synchronize on task switching; source tracing showed the retained active shadow needed one explicit latest-Turn reconciliation when the complete notification raced with `following=false`.
- After the first correction, the user reported that completed state now did not update at all and identified the previous-day code as good. History comparison isolated the new direct completion path's provider-time versus local-time comparison; the prior path used a targeted Turn reread and had no such direct-event gate.
- The user then reported that completion still stayed ongoing for three to five minutes and identified that the task had previously been interrupted. Focused RED tests reproduced both exact-notification and task-switch refollow failure with one unchanged `startedAt` and an interrupted cache.
- [preload/index.js](../../../preload/index.js#L1) handled owner `following=false` by deleting the owned main/Side shadow and publishing connector fallback, while `client-status-changed` separately calls `dropOwner` for a real disconnect.
- [src/domain/codex.ts](../../../src/domain/codex.ts#L1) requires terminal failed/interrupted plus exact desktop-live idle or bridge not-running for `stopped`; connector fallback therefore becomes ongoing by design.
- [public/preload.js](../../../public/preload.js#L1) mirrors the corrected owner-follow behavior.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) contains interrupted + live-idle continuity, recovered same-revision exact completion and task-switch stale-active replay contracts; the two RAW-119 bridge contracts were executed and passed. [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) also passed the targeted recovered-revision atomic projection contract.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the implementation and pending real uTools acceptance.
- The current Codex app task API reported two active tasks in the EyPc workspace. Their anonymous hashes were present in all 25 EyPc inventory/activity rows, but both remained `connector + notLoaded`; live-epoch diagnostics stayed zero. This rules out inventory loss.
- Both active uTools renderers load a v5 main preload, so the former “installed v4 ASAR” explanation is no longer applicable. After RAW-147, canonical/public/dist are synchronized to a newer source while the running ASAR remains pre-RAW-147; host behavior cannot be accepted until a normal reload.
- [FakeCodexDesktopSocket](../../../tests/platform/codexAppServerBridge.test.ts#L270) historically responded to a positive follow with a state snapshot and never injected a targeted positive peer announcement. The green suite therefore could not detect the real follower loop. The RAW-147 regression now distinguishes the one legitimate `thread-stream-following-status-requested` response from a positive announcement that must produce zero writes.

## Detection Order

1. Compare the stopped task before selection, while selected, and after selecting another task; verify whether the latest Turn stays terminal throughout.
2. Observe owner `following=false` separately from `client-status-changed(disconnected/closed)` and bridge socket state.
3. Trace whether the exact live shadow is deleted before the Controller receives connector fallback.
4. Confirm the domain stopped rule still requires exact idle/not-running and has not independently changed.
5. Check main and Side Chat ownership: a Side stream remains wanted while its parent task is inventoried.
6. After correction, require a targeted `following=true` to the same owner, no connector fallback during selection changes, and normal cleanup on a real client disconnect.
7. Count incoming and outgoing control methods without retaining identities. A connected bridge with rapidly increasing `thread-stream-following-changed` and zero `thread-stream-state-changed` is a protocol loop, not a slow provider.
8. Distinguish a positive follower-state announcement from `thread-stream-following-status-requested`; only the latter is a request that may need one response.
9. Make the transport double inject a targeted positive peer announcement before accepting follow/refollow coverage, and assert that it causes no additional write.

## Prevention Rule

Do not equate a stream owner's task-selection follow change with client loss. For an inventoried main task, or a Side Chat whose parent is inventoried, preserve the last exact owner shadow and targeted-refollow that owner when it announces `following=false`. If the retained shadow is active without a live wait, treat that selection edge as a finite reason to reconcile the latest Turn through the existing bounded reader; do not assume the replacement snapshot or completion notification will both arrive. A complete exact `turn/completed` event is ordered by the Turn's revision, not by provider-versus-local clock order, and a same-revision non-completed → completed result must be accepted when resume preserved `startedAt` and the inProgress signal was missed. Same-revision started may recover interrupted/failed but must never regress completed. Any settled completed active snapshot must publish targeted provenance after idle so Controller does not reapply the stale-terminal guard. Revoke live authority only through an independent client disconnect, bridge failure/reset/close, archive or inventory removal. Do not compensate by adding a Renderer badge correction or persisting live shadows.

A positive `thread-stream-following-changed(following=true)` describes the sender's follower state, not a fresh request. Never answer it with another positive follow frame. Re-announce only for `thread-stream-following-status-requested`; follow/refollow writes must stay bounded per peer/thread intent, and real transport coverage must prove a peer announcement produces zero writes—never an unbounded control-message exchange.

## Latest Applicable Implementation

- RAW-147 removes the positive-follow echo branch at [preload/index.js](../../../preload/index.js#L3519). The handler now consumes peer announcements, while the separate [status-request branch](../../../preload/index.js#L3437) still emits one targeted reply.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L3163) first reproduces the extra write, then proves an explicit status request adds exactly one targeted follow and a subsequent positive peer announcement adds zero.

- The `following=false` handler checks whether the owned main task or Side parent remains inventoried.
- If still wanted and the targeted refollow frame is dispatched, the existing owner shadow/read state stays in place until the replacement snapshot overwrites it.
- If that retained shadow is unwaiting active, the existing bounded latest-Turn reader checks the main/parent task; only fresh completed evidence publishes targeted completion, while inProgress/failure retains conservative activity.
- A full exact completion notification bypasses that reread once its Turn revision is new, completes the currently known inProgress Turn, or advances a same-revision interrupted/failed cache to completed; `desktopActiveSince` cannot veto it because it is a local observation timestamp with different precision/order.
- The bounded refollow reader applies the same recovered-revision rule, and completed terminal-snapshot settlement always appends `targeted-after-exit` after its idle delta.
- Activity Delta v3 distinguishes connector, initial snapshot and real activity patch; a real patch opens a new epoch even if old completed metadata remains. Once a terminal result is accepted, Controller clears the exit baseline so later inventory cannot reopen the closed epoch.
- Live-unread-only events without a shadow retain the existing owner-stop cleanup behavior.
- `dropOwner`, archive, inventory update, reset and close retain the existing complete authority cleanup.
- No raw task identity, private state or new protocol field crosses preload.

## Alternative Route

- Status: `candidate`; source and both test-contract reviews are complete, but the real uTools stopped/completed task-switch transitions have not been accepted.
- Preconditions: a compatible connected Desktop owner, an inventoried main task or inventoried Side parent, and an existing exact owner shadow.
- Ordered steps: retain the shadow; send targeted `following=true` to that owner; if the retained state is unwaiting active, launch the existing bounded latest-Turn reconciliation; accept the replacement snapshot normally; let independent disconnect/archive/inventory/bridge paths revoke authority.
- Verification: switch at least twice between one exact stopped task and one genuinely active task; then complete a disposable task while switching away. The stopped task never enters ongoing, fresh completion leaves ongoing within the bounded reader, and a full Desktop exit still drops live authority through the existing path.
- Applicability boundary: does not preserve never-inventoried terminal shadows, archived tasks, removed inventory rows or authority from a disconnected owner.
- Fallback: if targeted refollow cannot be dispatched, use the existing connector fallback and conservative ongoing rule; never infer stopped from terminal Turn alone.

### Positive-follow echo route

- Status: `candidate`; the source fix, regression and bounded packaged-source probe pass, but all running uTools followers have not yet reloaded and the live transition acceptance remains pending.
- Preconditions: a connected compatible owner and an inventoried task.
- Ordered steps: send the initial/refollow intent once; consume positive follower announcements without replying; answer only an explicit following-status request once; accept only state/read/terminal events as task evidence; use bounded structural reconciliation when the owner cannot provide a snapshot.
- Verification: packaged-source IPC traffic is bounded and peer announcements cause no recursive writes; after every old follower reloads, require an owner state snapshot and current active/waiting transitions reaching the atomic task package without waiting for the full inventory interval.
- Applicability boundary: does not weaken owner-disconnect, archive, generation, identity, persisted-decision or conservative connector rules.
- Fallback: when no owner snapshot arrives after a bounded follower announcement, stop retrying the same positive control frame and retain connector/persisted-decision fallback with a visible degraded diagnostic.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-29 | RAW-116 task-switch owner continuity | A stopped task became correct only while selected and returned to ongoing after selecting an active task | Deleted exact idle on owner `following=false` and restored connector authority | Preserve inventoried owner shadow and targeted-refollow; retain real disconnect cleanup | source/test contract reported; real preload reload and switch acceptance pending |
| 2026-07-29 | RAW-117 task-switch completion reconciliation | A task completing at the same selection edge did not synchronize | Missed complete notification plus refollowed old active snapshot left latest Turn inProgress, so no terminal conflict was known | Reuse bounded latest-Turn verification after successful refollow of an unwaiting active shadow | source/test contract reported; real preload reload and completion-switch acceptance pending |
| 2026-07-29 | RAW-118 exact completion time ordering | The latest implementation stopped updating completed state; the previous-day baseline was reported good | Direct completion compared second-granular provider `completedAt` with millisecond local `desktopActiveSince`, rejecting short Turns or post-completion active replay before Turn freshness | Remove the cross-clock gate; retain same/newer Turn monotonicity and immediate anonymous targeted completion | source/test contract reported; real preload reload and fast-completion acceptance pending |
| 2026-07-29 | RAW-119 recovered terminal revision | A previously interrupted task remained ongoing three to five minutes after completion | Resume kept the same startedAt while inProgress was missed; direct/refollow freshness required newer startedAt or cached inProgress, and terminal settlement could omit targeted provenance | Accept same-revision non-completed → completed, constrain started recovery, and always append targeted completion; bridge 34/34 plus Controller 1/1 focused tests pass | focused path verified; real preload reload and task acceptance pending |
| 2026-07-30 | RAW-121 task-state provenance and epoch closure | Completed/stopped state could still change after task switching or full reconciliation | Snapshot replay, real activity and closed-exit baselines were not represented as distinct lifecycle evidence | Carry finite activity/Turn origins, let real patches open epochs and clear the baseline on accepted terminal | automated bridge/domain/controller coverage passed; real task-switch acceptance pending |
| 2026-08-07 | RAW-147 active→waiting optimization | Codex recognized active workspace tasks while EyPc retained connector/notLoaded and waiting transitions were slow or absent | Positive peer follower announcements were echoed as fresh requests; the fake socket returned a snapshot without exercising that announcement | Removed the echo, kept explicit status-request response, added RED/GREEN regression, rebuilt all Preload mirrors and ran a bounded packaged-source IPC probe | source/build verified; running uTools reload and live transition acceptance pending |
