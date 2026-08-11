---
id: eypc-companion-consumer-cache-and-float-applied-ack
status: verified
scope: project
fingerprint: companion-semantic-noop__consumers-resend-or-assume-float-applied__latest-selector-caches-plus-explicit-applied-ack
first_seen: 2026-08-11
last_verified: 2026-08-11
review_after: 2026-09-11
evidence:
  - preload/companion/task-kernel.cjs
  - preload/companion/navigation.cjs
  - preload/companion/task-actions.cjs
  - preload/index.js
  - preload/float.js
  - src/FloatApp.vue
  - src/runtime/codexController.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/platform/codexFloatWindowBridge.test.ts
tags:
  - companion
  - latest-state-cache
  - semantic-noop
  - float-ack
  - consumer-dedup
---

# Kernel No-op Does Not Prove Consumer Dedup Or Float Application

## Symptom

Repeated equivalent observations could still reach Main, Float, Navigation or Actions, reset a cursor/confirmation, or rerun UI projection. Diagnostics could report a Float snapshot send although the rendered task state was missing.

## Wrong Assumption

Stopping package revision inside the Kernel was considered sufficient for the full chain, and an IPC send was treated as proof that Float applied the package. Consumers had no explicit last-revision/selector cache and Float acknowledgement represented transport rather than application.

## Verified Root Cause

Every process boundary can duplicate, remount or replay independently. Kernel equality prevents creation of a new package, but cannot prove that downstream code ignored an old/same package or that the Float Renderer accepted it. Delivery and application are separate stages.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) exposes `getLatest/subscribe(afterRevision)` and does not publish semantic no-ops.
- [navigation.cjs](../../../preload/companion/navigation.cjs#L1) and [task-actions.cjs](../../../preload/companion/task-actions.cjs#L1) cache selector fingerprints so equal targets do not reset cursor or confirmation.
- [preload/index.js](../../../preload/index.js#L1) tracks sent/current/applied Float revisions and bounds resend/recreate.
- [preload/float.js](../../../preload/float.js#L1) emits `received/applied/rejected`; [FloatApp.vue](../../../src/FloatApp.vue#L1) applies only a newer valid revision and preserves the task-cache reference otherwise.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) keeps the latest canonical package as the task-state authority and reapplies that same revision after a metadata-only refresh, so metadata joins cannot resurrect a Controller-local phase/group decision.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) verifies 1,000 equivalent observations produce zero downstream sync after the initial state; [codexFloatWindowBridge.test.ts](../../../tests/platform/codexFloatWindowBridge.test.ts#L1) covers ACK and recovery.

## Prevention Rule

Use one process latest-state cache, but also give every independent consumer a last package revision and selector fingerprint. Ignore old revisions；for the same revision, retain/reapply the cached canonical package only when joining fresh non-semantic metadata, never rerun state reduction or emit publication. Do not reset navigation or action confirmation when its actual selector is unchanged. Treat Float `received` as delivery only and `applied` as the UI postcondition. Resend the newest package at most once after 500ms; recreate only after two misses totaling one second and a healthy heartbeat.

## Detection Order

1. Count Kernel package revisions for equal evidence.
2. Count Main notify, Float task send/apply, Navigation sync, Actions sync and focus/open independently.
3. Distinguish sent, received and applied Float revisions.
4. Verify remount receives exactly one latest package and ordinary close/hide does not clear it.
5. Confirm quota/settings changes do not resend the task lane.
6. Refresh title/project metadata against the same task revision and require canonical phase、groups、counts and action targets to remain byte-for-byte sourced from the cached package.

## Latest Applicable Implementation

- Latest package owner: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Host task-lane sender/recovery: [preload/index.js](../../../preload/index.js#L1).
- Float receipt/application boundary: [preload/float.js](../../../preload/float.js#L1) and [FloatApp.vue](../../../src/FloatApp.vue#L1).
- Navigation/Action selector caches: [navigation.cjs](../../../preload/companion/navigation.cjs#L1) and [task-actions.cjs](../../../preload/companion/task-actions.cjs#L1).
- Main metadata join: [codexController.ts](../../../src/runtime/codexController.ts#L1) reapplies the cached package after narrow metadata hydration without incrementing or republishing its revision.

## Alternative Route

- Status: `verified` by RAW-160 no-op and Float bridge regressions.
- Preconditions: each consumer can retain its last package revision and a stable selector fingerprint for its own behavior.
- Ordered steps: Kernel semantic compare → latest cache → consumer revision check → selector compare → apply only new semantics → Float applied ACK.
- Verification: after the initial package, 1,000 equivalent observations cause zero package/Main/Float/Nav/Action/focus work；one real selector change publishes exactly once；one lost Float ACK resends only the latest package.
- Applicability boundary: process-local companion package delivery and UI/application acknowledgement; it does not replace Provider evidence ordering.
- Fallback: if applied state is unknown, resend only the latest revision once; never replay every missed snapshot or infer UI state from transport logs.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Repeated checks and Float reconnect made state/shortcut visibility unstable | Kernel-only no-op and send-as-success | Per-consumer latest caches plus explicit applied ACK | affected automation verified; real host pending |
