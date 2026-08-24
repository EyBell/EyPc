---
id: eypc-companion-plan-lifecycle-and-interrupted-causality
status: verified
scope: project
fingerprint: companion-plan-interrupted__active-or-unexecuted-plan-misclassified__branch-causal-reduction-plus-stable-plan-lifecycle
first_seen: 2026-08-11
last_verified: 2026-08-24
review_after: 2026-11-23
evidence:
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - src/domain/companionTaskPackage.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260810/1155-install-runtime-diagnostics/spec.md
tags:
  - companion
  - plan-lifecycle
  - interrupted
  - branch-causality
  - waiting-input
---

# Plan Lifecycle And Interrupted Causality Must Be Separate

## Symptom

An actually running task could disappear from ongoing or become “待继续” before a Plan existed. A completed-but-unexecuted Plan could alternate between waiting, stopped and absent as inventory/refollow snapshots changed. Any new Turn could also erase the completed Plan even when that Turn only refined the Plan. A later recurrence showed two additional errors：after a Plan result was read the card could fall straight to completed instead of waiting-input，and supplementary input could leave the task stuck in waiting-input even though a new Turn was already thinking/running.

## Wrong Assumption

An exact `interrupted/user-stopped` label was treated as sufficient final state, and Plan readiness was inferred as a transient property of the latest Turn rather than a lifecycle with its own revision. The reducer did not distinguish Plan editing from default execution or require every parent/Side Chat branch to be idle. The action layer also confused the preferred native execution mechanism with product capability: failed `collaborationMode/list` or missing model data was interpreted as “Plan cannot execute” instead of selecting the same-task fixed-instruction route.

## Verified Root Cause

Terminal evidence and Plan lifecycle have different causality. A terminal label cannot cross newer real activity or an active sibling branch. Preload's transient parent aggregation was not sufficient evidence ownership: an older parent `idleConfirmed` could remain beside a newer active branch and be reinterpreted as stopped downstream. An unexecuted Plan must survive refresh/refollow、ordinary completion、Plan edits and supplementary/default/interrupted Turns until an exact lifecycle transition clears it。Combining these facts into one parent/latest-Turn flag—or treating generic resolved/completed/default as a clear—made state depend on arrival order and erased the still-visible Plan card.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) stores privacy-safe branch evidence, reduces every branch before parent aggregation and owns `planReady / planLifecycleRevision / paused`.
- [preload/index.js](../../../preload/index.js#L1) supplies exact Turn mode, idle confirmation and targeted Plan interruption evidence without producing final groups.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) publishes the Plan fields and capabilities atomically with phase.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) and [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) cover initial Plan generation, Plan edits, implementation confirmation, ordinary/Plan interruption, active conflict, native default execution, missing native mode/model fallback and expired same-key alias recovery.

## Prevention Rule

Keep a Kernel-private branch ledger, reduce terminal causality per branch, then aggregate the parent. A new active epoch、Turn or waiting instance clears only that branch's older idle evidence；an exact supplementary user message、new Turn or thinking/generating event clears the matching wait and publishes running immediately without requiring an assistant reply。Model Plan lifecycle separately as monotonic `unknown / ready / cleared` with its own sequence：unknown retains the stable state；only a newer exact `cancel / execution-start / archive / removal` clears ready。Generic resolved、ordinary completion、default/supplementary Turn and interrupted labels cannot clear it。Project the display truth table atomically with unread：completed unread Plan → completed-unread；read while card remains → waiting-input；cancel after read → completed；execute → running。Domain and Renderer only consume the Kernel result。Treat native default-mode/model discovery as a route preference，never as the public Plan action capability；never retry an ambiguous `turn/start` or substitute another task/session.

## Detection Order

1. Check every main/Side branch for a newer exact active epoch.
2. Resolve ordinary input/approval before Plan implementation waiting.
3. Read the monotonic Plan state/sequence independently from the latest ordinary Turn；unknown is abstention，not clear.
4. Require the applicable ordinary or Plan-specific idle proof before stopped.
5. Compare the Plan revision and pause receipt independently of phase；require an exact clear reason for `cleared`.
6. Verify the same Snapshot drives dynamic rows、input badge、completed-unread badge、cycle and actions，including the unread/read/cancel/execute truth table.
7. Withhold Plan actions only for lifecycle/activity/pending conflicts; separately test native default mode, missing mode, missing model and expired alias routes.

## Latest Applicable Implementation

- Canonical reducer and Plan receipts: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Provider evidence and targeted reread: [preload/index.js](../../../preload/index.js#L1).
- Public V6 contract: [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1).
- Current requirement/acceptance: [RAW-176 V6 revision](../../../vibe/specs/260823/companion-task-topology-v5/spec.md#L1)；RAW-160 remains historical foundation.

## Alternative Route

- Status: `verified` by the RAW-160 foundation and RAW-176 V6 truth-table/bridge tests.
- Preconditions: exact branch identity, current active/waiting watermarks and Turn mode are available as private evidence.
- Ordered route: normalize evidence → branch causal reducer → monotonic Plan reducer → Kernel parent aggregation → view/capability projector → one semantic Snapshot.
- Verification: initial Plan、Plan edit、completed unread、native read、supplementary Turn、cancel、execution-start、ordinary interruption and Plan interruption produce the V6 truth table with no stale waiting rebound or duplicate group/cycle membership.
- Applicability boundary: Codex/companion canonical state and Plan actions; it does not alter Claude provider-specific terminal parsing.
- Fallback: retain the previous stable non-terminal phase with `verifying` and schedule a task-scoped reread; never guess stopped from time or connector shape.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Running/pre-Plan and unexecuted Plan tasks produced unstable “待继续” state | Broad interrupted terminal plus transient latest-Turn Plan flag | V4 branch causality and persistent Plan lifecycle | affected automation verified; real host pending |
| 2026-08-12 | RAW-160 branch-store rework | Installed host still let a stale parent idle override a newer running main/Side branch | Claimed Kernel-owned branch causality while only Preload retained branch topology；metadata/hydration time could also renew stale state；final review additionally found unknown/new hydration rows could still fabricate running | Publish privacy-safe branch evidence into a Kernel-private store, remove Domain stopped re-arbitration, clear idle on newer active, keep scan/metadata time out of business-state visibility, and make unknown a true no-running abstention | latest affected 545/545 and full 1305/1305 plus build verified; `host-719360…` pending |
| 2026-08-12 | RAW-160 Plan action correction | Plan was detected but pause/execute appeared unavailable when the native Implement Plan/default-mode capability was absent | Product capability was incorrectly coupled to optional App Server mode/model discovery | Make actionable Plan state enable controls; select native default or one same-task fixed-instruction Turn only after confirmation; recover expired alias by the same key | focused bridge regression verified; full gate and development-plugin regression pending |
| 2026-08-23 | RAW-176 V6 | Read Plan fell to completed，supplementary input remained waiting，and generic Turn evidence could erase the still-present Plan card | Boolean/transient Plan readiness plus broad generic clear and split consumer reducers | Monotonic unknown/ready/cleared evidence in sole Kernel；exact four clear reasons；atomic unread/read/cancel/execute projection；new user/Turn/thinking clears waiting immediately | affected automated verification recorded in current Controlled task；real host pending |
