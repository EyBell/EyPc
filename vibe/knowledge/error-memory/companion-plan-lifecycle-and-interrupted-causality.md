---
id: eypc-companion-plan-lifecycle-and-interrupted-causality
status: verified
scope: project
fingerprint: companion-plan-interrupted__active-or-unexecuted-plan-misclassified__branch-causal-reduction-plus-stable-plan-lifecycle
first_seen: 2026-08-11
last_verified: 2026-08-12
review_after: 2026-09-11
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

An actually running task could disappear from ongoing or become “待继续” before a Plan existed. A completed-but-unexecuted Plan could alternate between waiting, stopped and absent as inventory/refollow snapshots changed. Any new Turn could also erase the completed Plan even when that Turn only refined the Plan. A separately verified regression then rendered a correctly detected Plan with disabled pause/execute controls merely because the App Server did not expose native `Implement Plan`/default-mode metadata, even though sending an implementation instruction to that same task remained valid.

## Wrong Assumption

An exact `interrupted/user-stopped` label was treated as sufficient final state, and Plan readiness was inferred as a transient property of the latest Turn rather than a lifecycle with its own revision. The reducer did not distinguish Plan editing from default execution or require every parent/Side Chat branch to be idle. The action layer also confused the preferred native execution mechanism with product capability: failed `collaborationMode/list` or missing model data was interpreted as “Plan cannot execute” instead of selecting the same-task fixed-instruction route.

## Verified Root Cause

Terminal evidence and Plan lifecycle have different causality. A terminal label cannot cross newer real activity or an active sibling branch. Preload's transient parent aggregation was not sufficient evidence ownership: an older parent `idleConfirmed` could remain beside a newer active branch and be reinterpreted as stopped downstream. An unexecuted Plan must survive refresh/refollow and Plan edits, but clear on exact default execution. Combining these facts into one parent/latest-Turn flag made state depend on arrival order.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) stores privacy-safe branch evidence, reduces every branch before parent aggregation and owns `planReady / planLifecycleRevision / paused`.
- [preload/index.js](../../../preload/index.js#L1) supplies exact Turn mode, idle confirmation and targeted Plan interruption evidence without producing final groups.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) publishes the Plan fields and capabilities atomically with phase.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) and [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) cover initial Plan generation, Plan edits, implementation confirmation, ordinary/Plan interruption, active conflict, native default execution, missing native mode/model fallback and expired same-key alias recovery.

## Prevention Rule

Keep a Kernel-private branch ledger, reduce terminal causality per branch, then aggregate the parent. A new active epoch、Turn or waiting instance clears only that branch's older idle evidence. Ordinary interrupted may become stopped only after every terminal branch is independently idle-confirmed. Unexecuted Plan interrupted additionally requires targeted proof of no newer Turn, activity or pending request. Persist Plan readiness across Plan edits, refresh, restart and refollow; clear it only for exact non-Plan execution, explicit abandonment, completion, archive or removal. Domain and Renderer must only project the Kernel result. Treat native default-mode/model discovery as a route preference, never as the public Plan action capability: after two-click confirmation, renew only the same anonymous key, prefer native default mode, otherwise send the private fixed implementation instruction once to that same task. Never retry an ambiguous `turn/start` or substitute another task/session.

## Detection Order

1. Check every main/Side branch for a newer exact active epoch.
2. Resolve ordinary input/approval before Plan implementation waiting.
3. Identify whether the latest exact Turn is Plan editing or default execution.
4. Require the applicable ordinary or Plan-specific idle proof before stopped.
5. Compare the Plan revision and pause receipt independently of phase.
6. Verify the same package drives dynamic rows, input badge, cycle and actions.
7. Withhold Plan actions only for lifecycle/activity/pending conflicts; separately test native default mode, missing mode, missing model and expired alias routes.

## Latest Applicable Implementation

- Canonical reducer and Plan receipts: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Provider evidence and targeted reread: [preload/index.js](../../../preload/index.js#L1).
- Public V4 contract: [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1).
- Current requirement/acceptance: [RAW-160 spec](../../../vibe/specs/260810/1155-install-runtime-diagnostics/spec.md#L1).

## Alternative Route

- Status: `verified` by the RAW-160 truth-table and bridge tests.
- Preconditions: exact branch identity, current active/waiting watermarks and Turn mode are available as private evidence.
- Ordered route: normalize evidence → branch causal reducer → parent aggregation → Plan lifecycle reducer → view/capability projector → one semantic package.
- Verification: initial Plan, Plan edit, implementation wait, ordinary interruption, Plan interruption and default execution produce the RAW-160 truth table with no duplicate group/cycle membership.
- Applicability boundary: Codex/companion canonical state and Plan actions; it does not alter Claude provider-specific terminal parsing.
- Fallback: retain the previous stable non-terminal phase with `verifying` and schedule a task-scoped reread; never guess stopped from time or connector shape.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Running/pre-Plan and unexecuted Plan tasks produced unstable “待继续” state | Broad interrupted terminal plus transient latest-Turn Plan flag | V4 branch causality and persistent Plan lifecycle | affected automation verified; real host pending |
| 2026-08-12 | RAW-160 branch-store rework | Installed host still let a stale parent idle override a newer running main/Side branch | Claimed Kernel-owned branch causality while only Preload retained branch topology；metadata/hydration time could also renew stale state；final review additionally found unknown/new hydration rows could still fabricate running | Publish privacy-safe branch evidence into a Kernel-private store, remove Domain stopped re-arbitration, clear idle on newer active, keep scan/metadata time out of business-state visibility, and make unknown a true no-running abstention | latest affected 545/545 and full 1305/1305 plus build verified; `host-719360…` pending |
| 2026-08-12 | RAW-160 Plan action correction | Plan was detected but pause/execute appeared unavailable when the native Implement Plan/default-mode capability was absent | Product capability was incorrectly coupled to optional App Server mode/model discovery | Make actionable Plan state enable controls; select native default or one same-task fixed-instruction Turn only after confirmation; recover expired alias by the same key | focused bridge regression verified; full gate and development-plugin regression pending |
