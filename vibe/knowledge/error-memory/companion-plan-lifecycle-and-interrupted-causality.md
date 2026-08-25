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

An actually running task could disappear from ongoing or become “待继续” before a Plan existed. A completed-but-unexecuted Plan could alternate between waiting, stopped and absent as inventory/refollow snapshots changed. Any new Turn could also erase the completed Plan even when that Turn only refined the Plan. Later recurrences showed that a read Plan could be misclassified as waiting-input without any current request，and that answering/cancelling a real Plan interaction could clear briefly before an older Desktop snapshot restored the stale waiting state.

## Wrong Assumption

An exact `interrupted/user-stopped` label was treated as sufficient final state, and both a current Plan interaction and the resulting executable Plan artifact were collapsed into one transient `planReady` flag. Provider phase was reduced before reaching the Kernel，interaction clear returned only a boolean instead of atomically advancing the Shadow/tombstone，and same-epoch arbitration favored the stale waiting sequence. The action layer also confused the preferred native execution mechanism with product capability.

## Verified Root Cause

Terminal、interaction and Plan-artifact evidence have different causality. A terminal label cannot cross newer real activity or an active sibling branch. Interaction `resolve/cancel/execution-started` must close one exact instance and advance its sequence/tombstone atomically；otherwise an older request-set snapshot can cross the clear boundary. An executable Plan artifact must survive refresh/refollow and ordinary completion until an exact artifact transition changes it，but its mere availability means `stopped/待继续`，not waiting-input. Request disappearance closes only the interaction and cannot prove the artifact was cancelled. Combining these facts into one parent/latest-Turn flag—or allowing Provider/Controller/UI to reduce them again—makes state depend on arrival order.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) stores privacy-safe branch evidence, reduces every branch before parent aggregation and owns interaction instances、clear/tombstones、plan-artifact and pause state.
- [preload/index.js](../../../preload/index.js#L1) supplies exact Turn mode, idle confirmation and targeted Plan interruption evidence without producing final groups.
- [companion-v7.schema.json](../../../contracts/companion-v7.schema.json#L1) defines `InteractionEvidenceV7` and `PlanArtifactEvidenceV7` separately and generates both TS/CJS contracts.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) and [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) cover reply/cancel/execute、request removal、stale replay、new instance、Plan edits、ordinary/Plan interruption、active conflict and execution fallback.

## Prevention Rule

Keep one Kernel-private branch ledger and seven independent evidence lanes. Resolve/cancel/execute one interaction instance and advance its Shadow sequence/tombstone in the same transaction；a new Turn or current activity crosses the older waiting barrier immediately，and only a genuinely new interaction instance may wait again. Model the Plan artifact independently as `unknown / available / executing / consumed / cancelled / removed`。Project atomically with unread：terminal unread → completed-unread；read + current interaction → waiting-input/approval；read + artifact only → stopped/待继续；artifact cancelled/removed with no interaction → completed-read；execute/new activity → running。Domain and every surface only consume the Kernel result。Treat native default-mode/model discovery as a route preference，never as the public Plan action capability；never retry an ambiguous `turn/start` or substitute another task/session.

## Detection Order

1. Check every main/Side branch for a newer exact active epoch.
2. Resolve the exact current interaction instance before considering any Plan artifact.
3. Read interaction sequence/tombstone and Plan-artifact state/revision independently；unknown is abstention，not clear.
4. Require artifact availability with no current interaction before stopped/待继续.
5. Require both interaction closure and explicit artifact `cancelled/removed` before concluding an entire Plan was cancelled.
6. Verify the same Snapshot drives dynamic rows、input badge、completed-unread badge、cycle and actions，including unread/reply/cancel/execute/stale-replay truth tables.
7. Withhold Plan actions only for lifecycle/activity/pending conflicts; separately test native default mode, missing mode, missing model and expired alias routes.

## Latest Applicable Implementation

- Canonical reducer and Plan receipts: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Provider evidence and targeted reread: [preload/index.js](../../../preload/index.js#L1).
- Public V7 contract: [companion-v7.schema.json](../../../contracts/companion-v7.schema.json#L1) and generated [companionContractsV7.ts](../../../src/domain/generated/companionContractsV7.ts#L1).
- Current requirement/acceptance: [RAW-179 V7](../../../vibe/specs/260824/eypc-v7-global-refactor/spec.md#L1)；RAW-160/176 remain historical foundations.

## Alternative Route

- Status: `automated-verified / real-host-pending` by RAW-179 V7 truth-table、stale-replay and bridge tests.
- Preconditions: exact branch identity, current active/waiting watermarks and Turn mode are available as private evidence.
- Ordered route: normalize raw evidence → interaction reducer + artifact reducer → branch causal reducer → Kernel parent aggregation → one presentation Snapshot.
- Verification: opened、reply、request removal、cancel interaction、cancel entire Plan、execution-start、completed unread、native read、supplementary Turn、ordinary interruption、Plan interruption、stale replay and new instance produce the V7 truth table with no rebound or duplicate membership.
- Applicability boundary: Codex/companion canonical state and Plan actions; it does not alter Claude provider-specific terminal parsing.
- Fallback: retain the previous stable non-terminal phase with `verifying` and schedule a task-scoped reread; never guess stopped from time or connector shape.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Running/pre-Plan and unexecuted Plan tasks produced unstable “待继续” state | Broad interrupted terminal plus transient latest-Turn Plan flag | V4 branch causality and persistent Plan lifecycle | affected automation verified; real host pending |
| 2026-08-12 | RAW-160 branch-store rework | Installed host still let a stale parent idle override a newer running main/Side branch | Claimed Kernel-owned branch causality while only Preload retained branch topology；metadata/hydration time could also renew stale state；final review additionally found unknown/new hydration rows could still fabricate running | Publish privacy-safe branch evidence into a Kernel-private store, remove Domain stopped re-arbitration, clear idle on newer active, keep scan/metadata time out of business-state visibility, and make unknown a true no-running abstention | latest affected 545/545 and full 1305/1305 plus build verified; `host-719360…` pending |
| 2026-08-12 | RAW-160 Plan action correction | Plan was detected but pause/execute appeared unavailable when the native Implement Plan/default-mode capability was absent | Product capability was incorrectly coupled to optional App Server mode/model discovery | Make actionable Plan state enable controls; select native default or one same-task fixed-instruction Turn only after confirmation; recover expired alias by the same key | focused bridge regression verified; full gate and development-plugin regression pending |
| 2026-08-23 | RAW-176 V6 | Read Plan fell to completed，supplementary input remained waiting，and generic Turn evidence could erase the still-present Plan card | Boolean/transient Plan readiness plus broad generic clear and split consumer reducers | Monotonic unknown/ready/cleared evidence in sole Kernel；exact four clear reasons；atomic unread/read/cancel/execute projection；new user/Turn/thinking clears waiting immediately | affected automated verification recorded in current Controlled task；real host pending |
| 2026-08-24 | RAW-179 V7 | Two completed/read tasks remained or rebounded to waiting-input after reply/cancel；historical completed Plan was treated as a live request | Current interaction and executable Plan artifact shared one `planReady` semantic；resolve was not an atomic Shadow transition；Provider/Kernel/consumer reductions allowed an old snapshot to win | Separate Interaction/PlanArtifact lanes；atomic clear/tombstone；artifact-only maps to stopped；same-revision conflict quarantine；Main/Float consume one V7 projection | focused state/bridge/stale-replay automation and architecture review pass；real uTools 300ms/30s acceptance pending |
