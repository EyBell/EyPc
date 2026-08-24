---
id: eypc-companion-consumer-cache-and-float-applied-ack
status: verified
scope: project
fingerprint: companion-semantic-noop__consumers-resend-or-assume-float-applied__latest-selector-caches-plus-explicit-applied-ack
first_seen: 2026-08-11
last_verified: 2026-08-24
review_after: 2026-11-23
evidence:
  - preload/companion/task-kernel.cjs
  - preload/companion/navigation.cjs
  - preload/companion/task-actions.cjs
  - preload/index.js
  - preload/float.js
  - src/FloatApp.vue
  - src/domain/companionTaskPackage.ts
  - src/runtime/codexController.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/platform/codexFloatWindowBridge.test.ts
  - tests/runtime/codexController.test.ts
tags:
  - companion
  - latest-state-cache
  - semantic-noop
  - float-ack
  - consumer-dedup
  - sole-state-owner
  - previous-next
---

# Kernel No-op Does Not Prove Consumer Dedup Or Float Application

## Symptom

Repeated equivalent observations could still reach Main, Float, Navigation or Actions, reset a cursor/confirmation, or rerun UI projection. Diagnostics could report a Float snapshot send although the rendered task state was missing. A later recurrence left Provider/Renderer shadow reducers and counts alive beside the Kernel, while the Float sender treated a missing applied ACK as permission to recreate an otherwise healthy window after about one second；the resulting cache lag looked like a two-second debounce and previous/next could crash during recreation. Final V6 review found one subtler shadow path：when the public Kernel phase was `unknown`, the Renderer projector reused the Provider inventory card's former bucket、activity、unread and archive state.

## Wrong Assumption

Stopping package revision inside the Kernel was considered sufficient for the full chain, and an IPC send was treated as proof that Float applied the package. Consumers had no explicit last-revision/selector cache and Float acknowledgement represented transport rather than application. The corrective attempt then overreached in the other direction：an absent ACK was treated as proof that a live window was broken, even though a delayed Renderer application、base/task lane skew or test scheduling can all delay ACK without invalidating the window.

## Verified Root Cause

Every process boundary can duplicate, remount or replay independently. Kernel equality prevents creation of a new Snapshot, but cannot prove that downstream code ignored an old/same Snapshot or that the Float Renderer accepted it. Delivery and application are separate stages；delivery uncertainty is also not lifecycle failure. V5 still allowed source-specific Controller materialization and an ACK-timeout recreate path, so the package could be correct while a consumer showed an older source cache or disappeared during navigation. `unknown` is also a real Kernel decision, not permission for a consumer to ask another source for a fallback classification；using inventory semantics at that branch silently restores a second reducer.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) exposes `getLatest/subscribe(afterRevision)` and does not publish semantic no-ops.
- [navigation.cjs](../../../preload/companion/navigation.cjs#L1) and [task-actions.cjs](../../../preload/companion/task-actions.cjs#L1) cache selector fingerprints so equal targets do not reset cursor or confirmation.
- [preload/index.js](../../../preload/index.js#L1) tracks sent/current/applied Float revisions and bounds resend/recreate.
- [preload/float.js](../../../preload/float.js#L1) emits `received/applied/rejected`; [FloatApp.vue](../../../src/FloatApp.vue#L1) applies only a newer valid revision and preserves the task-cache reference otherwise.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) keeps the latest canonical package as the task-state authority and reapplies that same revision after a metadata-only refresh, so metadata joins cannot resurrect a Controller-local phase/group decision.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) strips the private task alias and maps Kernel `unknown` to one neutral non-actionable presentation without consulting inventory bucket、activity、unread or archive fields.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) verifies rapid atomic revisions and semantic no-ops；[codexFloatWindowBridge.test.ts](../../../tests/platform/codexFloatWindowBridge.test.ts#L1) covers one resend and proves a healthy late-ACK window is not recreated；[codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) verifies Main consumes V6 Kernel snapshots directly.

## Prevention Rule

Use one process latest-state cache and make it the only task-state reducer. Provider adapters submit evidence；Topology owns membership only；Main、Float、pages、badges、Navigation and Actions consume the public Kernel Snapshot and keep only their applied revision/selector cursor。Ignore old revisions；for the same revision, retain/reapply the cached canonical Snapshot only when joining fresh non-semantic metadata, never rerun phase/unread/Plan/count reduction or emit publication。If the Kernel publishes `unknown`, render one neutral non-actionable state and retain metadata only；never revive phase、group、unread or capability from inventory。Do not expose a Provider-specific sync action or task watcher in Renderer。Treat Float `received` as delivery only and `applied` as the UI postcondition；resend the newest Snapshot at most once after 500ms，then record bounded diagnostics。Never recreate a healthy window solely because applied ACK is late or absent；window lifecycle recovery needs independent health/failure evidence.

## Detection Order

1. Count Kernel package revisions for equal evidence.
2. Count Main notify, Float task send/apply, Navigation sync, Actions sync and focus/open independently.
3. Distinguish sent, received and applied Float revisions.
4. Verify remount receives exactly one latest package and ordinary close/hide does not clear it.
5. Confirm quota/settings changes do not resend the task lane.
6. Refresh title/project metadata against the same task revision and require canonical phase、groups、counts and action targets to remain byte-for-byte sourced from the cached Snapshot.
7. Search Controller/AppRuntime/UI for Provider-specific task watchers、sync actions、status reducers or count caches；none may be callable on the current V6 task path.
8. Advance ACK timers with a healthy Float and require one resend、zero recreate；test lifecycle failure separately.
9. Feed an `unknown` canonical task over an inventory card containing stale running、stopped、unread and archive semantics；require the projected card to remain neutral and alias-free.

## Latest Applicable Implementation

- Latest Snapshot and sole reducer owner: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Host task-lane sender/recovery: [preload/index.js](../../../preload/index.js#L1).
- Float receipt/application boundary: [preload/float.js](../../../preload/float.js#L1) and [FloatApp.vue](../../../src/FloatApp.vue#L1).
- Navigation/Action selector caches: [navigation.cjs](../../../preload/companion/navigation.cjs#L1) and [task-actions.cjs](../../../preload/companion/task-actions.cjs#L1).
- Main metadata join: [codexController.ts](../../../src/runtime/codexController.ts#L1) projects the cached V6 Snapshot after narrow metadata hydration without incrementing or republishing its revision；the removed `codex.claude.task.sync` action cannot reintroduce a Provider path.

## Alternative Route

- Status: `verified` by RAW-160 no-op plus RAW-176 V6 consumer/Float regressions.
- Preconditions: each consumer can retain its last package revision and a stable selector fingerprint for its own behavior.
- Ordered steps: Provider evidence → membership-only Topology → Kernel semantic compare → latest Snapshot → consumer revision check → selector compare → apply only new semantics → Float applied ACK/diagnostic.
- Verification: equivalent evidence causes zero Snapshot/Main/Float/Nav/Action/focus work；100 rapid real transitions each publish one atomic revision；one real selector change publishes exactly once；one lost Float ACK resends only the latest Snapshot and does not recreate a healthy window.
- Applicability boundary: process-local companion package delivery and UI/application acknowledgement; it does not replace Provider evidence ordering.
- Fallback: if applied state is unknown, resend only the latest revision once and retain the live window；never replay every missed Snapshot、infer UI state from transport logs or recreate without independent lifecycle failure.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Repeated checks and Float reconnect made state/shortcut visibility unstable | Kernel-only no-op and send-as-success | Per-consumer latest caches plus explicit applied ACK | affected automation verified; real host pending |
| 2026-08-23 | RAW-176 V6 | Status badges lagged around two seconds，multi-Agent rows kept stale Provider state，and previous/next could crash | V5 retained Renderer/provider task caches and recreated a healthy Float after ACK timeout | Evidence-only adapters、membership-only Topology、Kernel V6 sole Snapshot、no Provider task sync action、one resend with zero healthy recreate | focused/full automated verification recorded in current Controlled task；real host pending |
| 2026-08-24 | RAW-176 V6 closeout | Public `unknown` still inherited an inventory card's former status and task alias | Treating Kernel abstention as permission for Renderer fallback | Neutral alias-free `unknown` projection plus regression; verified archive cleanup also stopped mutating Provider caches in Controller | focused/full automated verification recorded；real host pending |
