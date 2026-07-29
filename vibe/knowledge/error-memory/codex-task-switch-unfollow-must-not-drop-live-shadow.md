---
id: eypc-codex-task-switch-unfollow-must-not-drop-live-shadow
status: candidate
scope: project
fingerprint: codex-stopped-or-completed-task-not-synchronized-after-task-switch__desktop-owner-following-false-dropped-or-replayed-live-shadow__task-selection-follow-change-confused-with-client-loss-or-terminal-edge__retain-inventoried-shadow-refollow-and-reconcile-ambiguous-active
first_seen: 2026-07-29
last_verified: 2026-07-29
review_after: 2026-08-29
evidence:
  - preload/index.js
  - public/preload.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/raw-requirement.md
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - stream-owner
  - task-switch
  - stopped
  - completed
  - live-shadow
---

# Task Selection Unfollow Must Not Drop Inventoried Live Authority

## Symptom

An explicitly stopped task appeared ongoing by default. Selecting that stopped task made it display correctly, but selecting a genuinely active task made the stopped task return to the ongoing group and increase the ongoing badge again. The user then confirmed that a task completing on the same selection edge also failed to synchronize.

## Wrong Assumption

The bridge treated every owner `thread-stream-following-changed(following=false)` message as equivalent to the Desktop client disconnecting. In practice, Codex Desktop also changes its followed conversation when the user changes the selected task.

## Candidate Root Cause

The `following=false` branch deleted the previous task's exact `desktop-live idle` shadow and immediately restored connector authority. An interrupted/failed Turn without exact live idle is intentionally conservative, so the domain projector correctly—but undesirably for this false authority loss—returned the task to ongoing. After retaining the shadow, a second race remained: a missed complete notification plus refollowed old active replay left the cached Turn at inProgress, so terminal-active snapshot corroboration never started. The separate `client-status-changed(disconnected/closed)` branch already owns real client loss.

## Evidence

- The user reported the stopped → selected-stopped → selected-active oscillation and the associated badge error.
- The user then reported that completed state also failed to synchronize on task switching; source tracing showed the retained active shadow needed one explicit latest-Turn reconciliation when the complete notification raced with `following=false`.
- [preload/index.js](../../../preload/index.js#L1) handled owner `following=false` by deleting the owned main/Side shadow and publishing connector fallback, while `client-status-changed` separately calls `dropOwner` for a real disconnect.
- [src/domain/codex.ts](../../../src/domain/codex.ts#L1) requires terminal failed/interrupted plus exact desktop-live idle or bridge not-running for `stopped`; connector fallback therefore becomes ongoing by design.
- [public/preload.js](../../../public/preload.js#L1) mirrors the corrected owner-follow behavior.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) now contains both an interrupted + live-idle continuity contract and a missed-completion + stale-active-replay contract requiring one targeted latest-Turn read. It was updated but not executed under the project validation boundary.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the implementation and pending real uTools acceptance.

## Detection Order

1. Compare the stopped task before selection, while selected, and after selecting another task; verify whether the latest Turn stays terminal throughout.
2. Observe owner `following=false` separately from `client-status-changed(disconnected/closed)` and bridge socket state.
3. Trace whether the exact live shadow is deleted before the Controller receives connector fallback.
4. Confirm the domain stopped rule still requires exact idle/not-running and has not independently changed.
5. Check main and Side Chat ownership: a Side stream remains wanted while its parent task is inventoried.
6. After correction, require a targeted `following=true` to the same owner, no connector fallback during selection changes, and normal cleanup on a real client disconnect.

## Prevention Rule

Do not equate a stream owner's task-selection follow change with client loss. For an inventoried main task, or a Side Chat whose parent is inventoried, preserve the last exact owner shadow and targeted-refollow that owner when it announces `following=false`. If the retained shadow is active without a live wait, treat that selection edge as a finite reason to reconcile the latest Turn through the existing bounded reader; do not assume the replacement snapshot or completion notification will both arrive. Revoke live authority only through an independent client disconnect, bridge failure/reset/close, archive or inventory removal. Do not compensate by weakening terminal evidence, adding a Renderer badge correction, or persisting live shadows.

## Latest Applicable Implementation

- The `following=false` handler checks whether the owned main task or Side parent remains inventoried.
- If still wanted and the targeted refollow frame is dispatched, the existing owner shadow/read state stays in place until the replacement snapshot overwrites it.
- If that retained shadow is unwaiting active, the existing bounded latest-Turn reader checks the main/parent task; only fresh completed evidence publishes targeted completion, while inProgress/failure retains conservative activity.
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

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-29 | RAW-116 task-switch owner continuity | A stopped task became correct only while selected and returned to ongoing after selecting an active task | Deleted exact idle on owner `following=false` and restored connector authority | Preserve inventoried owner shadow and targeted-refollow; retain real disconnect cleanup | source/test contract reported; real preload reload and switch acceptance pending |
| 2026-07-29 | RAW-117 task-switch completion reconciliation | A task completing at the same selection edge did not synchronize | Missed complete notification plus refollowed old active snapshot left latest Turn inProgress, so no terminal conflict was known | Reuse bounded latest-Turn verification after successful refollow of an unwaiting active shadow | source/test contract reported; real preload reload and completion-switch acceptance pending |
