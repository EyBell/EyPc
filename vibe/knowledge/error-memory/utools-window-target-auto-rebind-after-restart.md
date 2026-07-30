---
id: eypc-utools-window-target-auto-rebind-after-restart
status: archived
scope: project-pointer
fingerprint: persisted-window-slot-native-ref-expires-after-restart__exact-title-drift-misses-same-logical-window__safe-complete-inventory-auto-rebind
first_seen: 2026-07-29
last_verified: 2026-07-30
review_after: superseded by WJ-19 explicit instance rebind
evidence:
  - src/domain/windows.ts
  - src/domain/state.ts
  - src/runtime/appRuntime.ts
  - tests/domain/windows.test.ts
  - tests/domain/state.test.ts
  - tests/runtime/action.test.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - windows
  - persistence
  - rebind
  - pointer
---

# Automatic Restart Rebinding (Historical; Superseded by WJ-19)

> WJ-19 keeps the logical target but forbids title-derived automatic replacement after the native instance lifecycle ends. The earlier scoring design remains historical evidence only.

## Symptom

A stable slot remains persisted, but after reboot or application restart its PID/native reference no longer exists. If the same logical Rider/browser window has a changed active file or page title, exact-title recovery reports it unavailable or closed and the user must bind the slot again.

## Wrong Assumption

Persisting a native reference plus one exact title is sufficient across process lifetimes. The opposite shortcut—choosing the only or first window from the same application—is also unsafe when browsers and IDEs own several similar windows.

## Verified Root Cause

PID, HWND and macOS CG window references are process/session identities and routinely change after restart. The previous Runtime recovery accepted only exact app/title equality; its same-PID fallback could not help after PID replacement. The logical target often remains identifiable from stable project/site segments, but common application-name suffixes and sibling windows make application-only or title-substring matching ambiguous.

## Detection Order

1. Validate platform and exact application identity before considering title evidence.
2. Prefer the retained native reference, then an exact current or previously verified title.
3. Permit similarity ranking only from a complete inventory; remove the already-mandatory app label from title evidence.
4. Require a shared meaningful anchor and a high score. When several same-app windows exist, also require a stricter score and clear runner-up margin.
5. Treat weak, tied, multiple, or partial-inventory results as confirmation/blocking; never choose the first candidate.
6. Persist the new reference/title/history only after native activation reports success.

## Prevention Rule

Model a fixed slot as a persisted logical target whose `lastInstanceId` refers only to one OS-window lifecycle. When that instance disappears, a complete inventory may show all same-app candidates but must not choose even a sole candidate automatically. Only explicit confirmation plus successful native activation may atomically update instance/native/application/title metadata. Partial inventories retain the old binding; title history and similarity scoring do not exist.

Cross-project uTools authority belongs under CodeNote [`error-memory`](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/README.md#L1). That owner directory already contains unrelated dirty/untracked work, so WJ-17 does not overwrite it; owner merge remains pending.

## Alternative Route

- Status: `archived / superseded-by-WJ-19`
- Preconditions: a persisted target's native reference is stale; list capability is healthy; a complete current inventory is available.
- Steps: exact instance lookup → one bounded refresh → explicit selection among all same-app candidates → native activation → success-only persisted replacement.
- Verification: close/recreate one fixed target, require explicit confirmation even with one candidate, verify Escape focus return and success-only backfill; equal-title siblings never auto-match.
- Applicability boundary: replacement of an already user-bound logical window. It does not launch a closed application, background-poll windows, change real titles, or authorize Space/display identity persistence.
- Fallback: retain the binding and show confirmation/blocking diagnostics.

## Occurrence History

| Date | Task | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-29 | EyPc WJ-17 | User required fixed windows to survive reboot/reopen without manual rebinding | exact title plus stale native reference; same-PID fallback cannot cross restart | complete-inventory exact-app high-confidence unique replacement with success-only learning | historical implementation; superseded by WJ-19 |
| 2026-07-30 | EyPc WJ-19 | Browser Tab/title changes must not invalidate a window, and a closed instance must never title-rebind | title similarity conflated logical intent with native identity | lifecycle instance ID plus explicit candidate confirmation | source/contracts updated; host acceptance pending |
