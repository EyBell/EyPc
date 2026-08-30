---
id: eypc-companion-plan-lifecycle-and-interrupted-causality
status: verified
scope: project
fingerprint: companion-plan-interrupted__active-or-unexecuted-plan-misclassified__branch-causal-reduction-plus-stable-plan-lifecycle
first_seen: 2026-08-11
last_verified: 2026-08-29
review_after: 2027-02-25
evidence:
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - preload/codex/desktop-activity-aggregation.cjs
  - preload/codex/rollout-evidence.cjs
  - src/domain/companionTaskPackage.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260829/companion-pinned-collapse-plan-input/spec.md
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

An actually running task could disappear from ongoing or become “待继续” before a Plan existed. A completed-but-unexecuted Plan could alternate between waiting, stopped and absent as inventory/refollow snapshots changed. Any new Turn could also erase the completed Plan even when that Turn only refined the Plan. Later recurrences showed that a read Plan could be misclassified as waiting-input without any current request，and that answering/cancelling a real Plan interaction could clear briefly before an older Desktop snapshot restored the stale waiting state. A further recurrence kept an old completed Plan after a newer completed default Turn had already performed structural file mutation，so an actually completed implementation was still projected as artifact-only “待继续”. The latest recurrences accepted and published a new App Server running event promptly，then an older refollowed Desktop waiting shadow rebound over it；ordinary input/approval also moved between running and waiting through a visible completed-unread intermediate frame，while a completed-read task with an on-screen current Plan implementation request was incorrectly left in completed-read instead of waiting-input.

## Wrong Assumption

An exact `interrupted/user-stopped` label was treated as sufficient final state, and both a current Plan interaction and the resulting executable Plan artifact were collapsed into one transient `planReady` flag. Provider phase was reduced before reaching the Kernel，interaction clear returned only a boolean instead of atomically advancing the Shadow/tombstone，and same-epoch arbitration favored the stale waiting sequence. The parent Activity resolver later assumed that any Desktop waiting flag could still veto `appServerActive` even after its caller had already selected the newer App Server sequence；the Kernel's terminal-unread exception was also scoped only to Plan interactions instead of every exact current interaction. The action layer also confused the preferred native execution mechanism with product capability.

## Verified Root Cause

Terminal、interaction and Plan-artifact evidence have different causality. A terminal label cannot cross newer real activity or an active sibling branch. Interaction `resolve/cancel/execution-started` must close one exact instance and advance its sequence/tombstone atomically；otherwise an older request-set snapshot can cross the clear boundary. Every exact current input/approval/Plan interaction owns waiting presentation before the settled terminal read/unread lane，whereas a causally newer running event owns the direct reverse transition；completed-unread is a settled backlog state，not a transition frame. Once the unified sequence has selected App Server running，parent aggregation may use only connector-owned waiting flags and must ignore older Desktop/refollow flags and timestamps. An executable Plan artifact must survive refresh/refollow and ordinary completion until an exact artifact transition changes it，but its mere availability means `stopped/待继续`，not waiting-input. A later default Turn is ambiguous because it may only refine or discuss the Plan；however，a later `fileChange` item or `patch_apply_begin/end` event is high-confidence structural evidence that implementation execution has started and must consume the older artifact. Bare Plan request-array disappearance closes neither the current Plan interaction nor its artifact；matching terminal evidence or a causally newer execution edge is required. Combining these facts into one parent/latest-Turn flag—or allowing Provider/Controller/UI to reduce them again—makes state depend on arrival order.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) stores privacy-safe branch evidence, reduces every branch before parent aggregation and owns interaction instances、clear/tombstones、plan-artifact and pause state.
- [desktop-activity-aggregation.cjs](../../../preload/codex/desktop-activity-aggregation.cjs#L1) aggregates main/Side activity after causal source selection and prevents older Desktop waiting shadows from decorating a newer App Server running epoch.
- [preload/index.js](../../../preload/index.js#L1) supplies exact Turn mode, idle confirmation and targeted Plan interruption evidence without producing final groups.
- [rollout-evidence.cjs](../../../preload/codex/rollout-evidence.cjs#L1) retains a Plan across supplementary default Turns but emits a monotonic `execution-start` clear only after later structural file mutation.
- [companion-v7.schema.json](../../../contracts/companion-v7.schema.json#L1) defines `InteractionEvidenceV7` and `PlanArtifactEvidenceV7` separately and generates both TS/CJS contracts.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) and [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) cover reply/cancel/execute、request removal、stale replay、new instance、Plan edits、ordinary/Plan interruption、active conflict and execution fallback.

## Prevention Rule

Keep one Kernel-private branch ledger and seven independent evidence lanes. Resolve/cancel/execute one interaction instance and advance its Shadow sequence/tombstone in the same transaction；a new Turn or current activity crosses the older waiting barrier immediately，and only a genuinely new interaction instance may wait again. Treat `appServerActive` entering the pure parent resolver as already causally adjudicated：derive its waiting state only from connector-owned flags，never union older Desktop shadows back in. Model the Plan artifact independently as `unknown / available / executing / consumed / cancelled / removed`。Do not use “any later default Turn” as an execution boundary：retain across read-only command、reasoning and Plan discussion，but consume on later structured `fileChange` or `patch_apply` evidence. Project atomically with terminal state：terminal + any exact current input/approval/Plan interaction → waiting-input/approval regardless of current read value，while unread remains latent when present；terminal unread with no current interaction → completed-unread；read + artifact only → stopped/待继续；artifact cancelled/removed with no interaction → completed-read；execute/new activity → running。Domain and every surface only consume the Kernel result。Treat native default-mode/model discovery as a route preference，never as the public Plan action capability；never retry an ambiguous `turn/start` or substitute another task/session.

## Detection Order

1. Check every main/Side branch for a newer exact active epoch and verify that an App Server winner does not inherit older Desktop waiting flags.
2. Resolve every exact current input/approval/Plan interaction instance before terminal state，without using unread=true as an eligibility gate；a completed-read task may still be waiting-input.
3. Read interaction sequence/tombstone and Plan-artifact state/revision independently；unknown is abstention，not clear.
4. Require artifact availability with no current interaction before stopped/待继续.
5. Require both interaction closure and explicit artifact `cancelled/removed` before concluding an entire Plan was cancelled.
6. For a prior Plan plus later default Turn，inspect item/event types rather than message bodies：read-only command/refinement retains the artifact；`fileChange` or `patch_apply` consumes it as `execution-start`.
7. Verify the same Snapshot drives dynamic rows、input badge、completed-unread badge、cycle and actions，including direct running↔ordinary input/approval/Plan transitions、unread/reply/cancel/execute and stale-refollow truth tables.
8. Withhold Plan actions only for lifecycle/activity/pending conflicts; separately test native default mode, missing mode, missing model and expired alias routes.

## Latest Applicable Implementation

- Canonical reducer and Plan receipts: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Provider evidence and targeted reread: [preload/index.js](../../../preload/index.js#L1)；causal parent aggregation: [desktop-activity-aggregation.cjs](../../../preload/codex/desktop-activity-aggregation.cjs#L1)；Rollout Evidence V3 structural execution boundary: [rollout-evidence.cjs](../../../preload/codex/rollout-evidence.cjs#L1).
- Public V7 contract: [companion-v7.schema.json](../../../contracts/companion-v7.schema.json#L1) and generated [companionContractsV7.ts](../../../src/domain/generated/companionContractsV7.ts#L1).
- Current requirement/acceptance: [RAW-189](../../../vibe/specs/260829/companion-pinned-collapse-plan-input/spec.md#L1)；[RAW-179 V7](../../../vibe/specs/260824/eypc-v7-global-refactor/spec.md#L1) and RAW-160/176 remain foundations.

## Alternative Route

- Status: `automated-verified / real-host-pending` by RAW-179 V7 truth-table、stale-replay and bridge tests.
- Preconditions: exact branch identity, current active/waiting watermarks and Turn mode are available as private evidence.
- Ordered route: normalize raw evidence → interaction reducer + artifact reducer → branch causal reducer → Kernel parent aggregation → one presentation Snapshot.
- Verification: opened、reply、request removal、cancel interaction、cancel entire Plan、execution-start、completed unread、native read、supplementary read-only default Turn、later `fileChange`/`patch_apply`、direct running↔ordinary input/approval/Plan transitions、causally newer App Server running、stale Desktop refollow and new instance produce the V7 truth table with no rebound、intermediate completed-unread or duplicate membership.
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
| 2026-08-29 | RAW-189 | A prior completed Plan survived a newer completed implementation Turn；current requests disappeared during replacement；a newer running event then rebounded to waiting，and ordinary waiting transitions exposed completed-unread as an intermediate frame | Plan retention treated later Turns alike；request disappearance raced lifecycle evidence；parent aggregation re-unioned older Desktop waiting after App Server won；Kernel's unread exception was Plan-only | Structural execution clear；causal request retention；App Server winner uses connector flags only；every exact current interaction directly owns waiting before latent unread | focused Kernel/bridge/companion/preload regression and build verified；new artifact real uTools timing、visual and hotkey acceptance pending |
| 2026-08-29 | RAW-189 follow-up | A completed-read task still showed a current Plan implementation prompt but remained in completed-read | Regression matrix emphasized terminal unread and did not state the completed-read case at the Kernel boundary | Add completed-read + exact Plan interaction coverage；interaction owns waiting regardless of unread value，then a newer Turn returns directly to running | focused Kernel regression verified；real Host still requires loading the new artifact |
