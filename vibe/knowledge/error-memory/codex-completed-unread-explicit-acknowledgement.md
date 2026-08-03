---
id: eypc-codex-completed-unread-explicit-acknowledgement
status: superseded
scope: project
fingerprint: codex-task-open-read-acknowledgement__persistent-completion-receipt-conflicts-with-native-unread-but-open-only-misses-plugin-navigation__shared-host-accepted-open-creates-turn-bound-session-false__failure-or-explicit-rejection-does-not
first_seen: 2026-07-24
last_verified: 2026-08-03
review_after: 2026-10-24
evidence:
  - user-correction
  - static-source-review
  - controlled-requirement-raw-082
  - controlled-requirement-raw-128
  - controlled-requirement-raw-138
  - successful-host-open-session-read-regression
  - failed-and-unconfirmed-open-no-ack-regression
  - real-utools-correct-preload-open-ack
  - cold-task-action-preflight-regression
  - mainhide-bridge-rebuild-read-ack-regression
  - accepted-utools-fallback-read-ack-regression
  - same-turn-id-completion-enrichment-regression
tags:
  - codex-companion
  - completed-unread
  - local-receipt
  - global-shortcut
  - interaction-command
---

# Persistent Completed-Unread Acknowledgement (Superseded)

## Current Resolution

RAW-128 permanently supersedes the persisted completion-revision receipt described in the historical sections below. RAW-138 adds a narrower replacement: every plugin task-open entry uses one Host Deep-Link path, and a successful Electron open publishes a session-only exact read false for the parent and known Side Chats. RAW-139 protects access to that path across uTools lifecycle boundaries: `mainHide` owns visibility, cold shortcuts wait for tasks-only inventory, and stale card aliases rebuild only from the same anonymous task key. RAW-140 corrects the remaining lifetime error: the acknowledgement belongs to the current preload process and completion epoch, not to one replaceable Desktop Bridge instance, so ordinary mainHide/pluginOut connection close, IPC reset, resubscribe and refollow preserve it. RAW-144 closes two final edges: uTools `shellOpenExternal` exposes only accepted/rejected dispatch, so every non-`false` dispatch uses the same boundary; and the process hint is bound to a concrete internal Turn ID, so late `completedAt` enrichment for that same Turn cannot release it. Failure/explicit rejection does nothing. EyPc still writes neither Codex native unread nor a persistent acknowledgement, and a different Turn/active epoch or explicit removal clears the older session false.

## Symptom

The completed-unread compact counter could open the first task without changing its EyPc status. After the persistent receipt was removed, the same gap affected generic cards and task shortcuts whenever Codex did not deliver a read event back to the connected plugin.

## Wrong Assumption

Either every open must remain navigation-only until a provider event arrives, or every attempted open may be treated as acknowledgement.

## Root Cause

The original design incorrectly solved immediate UI feedback with a persisted completion-revision receipt, which could later mask Codex-native unread true. Removing that receipt fixed authority conflicts but left a missing fact: EyPc itself knows when its Host successfully opens a task, while App Server does not replay read state and the exact Desktop read event may occur outside the plugin connection window. RAW-138 then stored the replacement inside `CodexDesktopCompanionBridge.liveUnread`; ordinary `onPluginOut(false)` and IPC reset correctly destroyed that transport object, but accidentally destroyed the user-confirmed product fact too. The safe acknowledgement is success-gated and preload-session-only, shared by all task-open routes and independent of an individual Bridge connection.

## Correct Detection Order

1. Resolve the task using the existing card/counter/shortcut candidate rules. If lifecycle cleanup left the inventory empty, first perform one serialized tasks-only preflight; if a card alias is stale, rebuild it only from the same anonymous task key.
2. Wait for the Electron Deep-Link operation to resolve successfully; if Side Chat direct-open fails but parent fallback succeeds, acknowledge the parent fallback only. On uTools fallback, treat only an explicit `false` return as rejection; other returns mean the host accepted dispatch.
3. On accepted success, publish read false for the parent, actual target and known Side Chat relations through the anonymous `readStateOnly` path. Retain a bounded process hint only when the current latest Turn has valid timing, and prefer its sanitized internal Turn ID.
4. On failure or explicit rejection, preserve unread.
5. Do not clear the hint for ordinary Bridge close/reset/resubscribe/refollow, same-Turn replay or a later `completedAt` correction. Clear it for an exact new live epoch, a different Turn ID/startedAt found by bootstrap, explicit removal or process end.
6. Write no receipt or Codex native state.

## Prevention Rule

Do not restore the local completion-revision acknowledgement and do not acknowledge before the Host accepts navigation. Electron completion and uTools non-rejected dispatch are the two supported acceptance signals. All plugin task-open surfaces must share that boundary. `mainHide` routes must not add a Renderer hide that can terminate the preflight, and alias recovery must never fall back to a different task. The acknowledgement stays in bounded preload-process memory outside the replaceable Bridge, is created only for a concrete Turn, overrides replay/time enrichment for the same Turn, does not mutate native state, and is invalidated by a different Turn/active epoch or explicit removal. Legacy acknowledgement fields remain ignored migration input.

## Latest Applicable Implementation

[codex.ts](../../../src/domain/codex.ts#L1) ignores legacy completion acknowledgements during receipt normalization. [codexController.ts](../../../src/runtime/codexController.ts#L1), [FloatApp.vue](../../../src/FloatApp.vue#L1), [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1), [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) and [plugin.json](../../../public/plugin.json#L1) converge card/counter/shortcut entry points on the same open action. [preload/index.js](../../../preload/index.js#L1) owns the confirmed-success session acknowledgement and new-completion cleanup. The acceptance boundary is in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Alternative Route

- Status: `verified` for the RAW-140/144 preload-session replacement; the persistent RAW-082 route remains superseded.
- Preconditions: any plugin task card, completed-unread counter, waiting-input counter or task-navigation shortcut reaches the shared Host open action.
- Ordered steps: resolve the target; attempt the Deep Link; accept Electron success or non-rejected uTools dispatch; require a concrete Turn for the process hint; republish the parent aggregate; retain it across routine Bridge teardown and same-Turn enrichment; remove it only at a different Turn/active epoch or explicit deletion.
- Verification: successful parent/Side Chat/uTools fallback open, failed open, initially unavailable Bridge, IPC reset/refollow, mainHide close/rebuild, same-Turn timestamp enrichment, older full-snapshot reverse race and new-Turn release contracts pass.
- Applicability boundary: EyPc's current preload process only; it neither asserts that Codex persisted the read nor fabricates an unknown transient Side Chat.
- Fallback: if the Host cannot confirm success, return the existing failed/dispatched result and preserve unread.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex quota/task companion | User clarified completed-unread click/global semantics and exempted waiting-input | Reused generic open-only handling for both statuses | User correction and RAW-082 scope | Added a shared explicit local-revision acknowledgement action; kept waiting-input open-only | candidate pending runtime acceptance |
| 2026-07-30 | RAW-128 global state-chain audit | Native unread true could be hidden by an EyPc-only acknowledgement | Treated a local presentation receipt as an equal unread authority | Domain/Controller regression and full-chain source audit | Removed the write/projection override; completed-unread command is open-only and native read-state is sole authority | superseded; automated matrix verified, real host reload pending |
| 2026-08-03 | RAW-138 repeated completed-unread mismatch | Successful plugin navigation had no acknowledgement when Codex read events were missed or not replayed | Kept every task-open path open-only after removing the unsafe persistent receipt | User requirement, active extension/plugin timing and Bridge/Controller regression | Added one success-gated, session-only Host acknowledgement for all task-open paths; preserved failure/no-confirmation and new-completion reset | automated verified 722/722; rebuilt host reload/acceptance pending |
| 2026-08-03 | RAW-139 host correction | uTools retained an older float/preload while the latest ASAR was installed; after correct activation the card acknowledgement worked, but cold global actions still read an intentionally cleared inventory and Renderer hid a `mainHide` route again | Assumed installed version implied active child version and consumed synchronous commands before bootstrap | Real float URL/version/hash, Codex route log, 2→1 plugin counter, source trace and focused regressions | Assigned visibility solely to `mainHide`, serialized empty-inventory commands behind tasks-only preflight, and rebuilt/retried aliases only for the same key | current 1.2.33 card host-confirmed; RAW-139 focused 141/141 and full verify 730/730, rebuilt cold-host acceptance pending |
| 2026-08-03 | RAW-140 shortcut acknowledgement rebound | Completed-unread shortcut showed read immediately, then returned to unread after normal mainHide lifecycle | Stored a user-confirmed completion fact only in `CodexDesktopCompanionBridge.liveUnread`, which routine pluginOut/reset/rebuild correctly clears | User shortcut reproduction plus a failing `desktop-live=false → desktop-persisted=true` IPC reset contract | Moved a bounded identity/revision hint to preload-process scope, made same completion replay subordinate, and released only on new Turn/removal | Bridge 70/70, focused 144/144 and full verify 733/733 pass; rebuilt host acceptance pending |
| 2026-08-03 | RAW-144 fallback/Turn-identity hardening | uTools fallback could open without marking read; an already-read task could recur when the same Turn later gained a larger completedAt | Treated fallback dispatch as unconfirmed and used timestamps rather than stable Turn identity for the process hint | Source trace plus accepted-fallback, same-ID enrichment and delayed-full-snapshot regressions | Acknowledge non-rejected uTools dispatch, reject unbound hints, bind to internal Turn ID and keep the generation barrier | affected-suite 301/301 plus type/preload checks pass; real host pending |
