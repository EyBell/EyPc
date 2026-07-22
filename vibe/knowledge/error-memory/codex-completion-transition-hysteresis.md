---
id: eypc-codex-completion-transition-hysteresis
status: candidate
scope: project
fingerprint: codex-completion-transition__ongoing-completed-and-archive-controls-flashed__renderer-counter-only-delay-left-other-projections-immediate__use-one-controller-owned-interruptible-task-hold
first_seen: 2026-07-22
last_verified: 2026-07-22
review_after: 2026-08-22
evidence:
  - src/runtime/codexController.ts
  - src/FloatApp.vue
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - state-transition
  - presentation-hysteresis
  - single-projection
  - archive-capability
  - interaction-continuity
---

# Stabilize Completion At The Shared Task Projection

## Symptom

A task alternated visibly between “进行中” and “已完成”, while its archive control could change availability at a different moment. The compact ongoing counter had its own two-second timer, but cards, groups, details and action capability consumed the provider projection immediately.

## Wrong Assumption

Delaying one badge count was treated as sufficient transition smoothing. That created multiple clocks for one product state: cards could complete first, the counter could trail later, and adding a shared delay without removing the badge timer would accumulate four seconds.

## Candidate Root Cause

Temporal normalization lived in one Renderer consumer instead of the snapshot boundary shared by every consumer. The product therefore had no single presented state for the transition from authoritative running to authoritative completion.

## Evidence

- [codexController.ts](../../../src/runtime/codexController.ts#L1) keeps provider-derived raw conversations separate from the transient presented snapshot, starts one fixed per-task two-second hold only after visible running becomes completed, cancels it if running returns and republishes the latest raw completion once at expiry.
- The same Controller projection rebuilds task buckets, hidden/all/completed arrays, project sections, counts and `blocked-active` capability, so a waiting task remains one coherent `ongoing/running/blocked-active` product state.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) removes the independent active-counter timer and consumes the unified snapshot for cards, counters, details and archive controls.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the interrupt, expiry and no-double-delay acceptance matrix.

## Detection Order

1. Enumerate every visible and actionable consumer of the state transition: buckets, cards, sections, counters, details, previews and destructive actions.
2. Identify whether they consume one shared presented snapshot or keep local timers/optimistic state.
3. Trace the previous raw state and next raw state; start hysteresis only for a real running-to-completed transition, never for initial completed inventory.
4. Verify one fixed deadline: repeated completion snapshots do not reset it, but a return to running cancels it.
5. Rebuild all derived arrays, project references, counts and capabilities from the held card.
6. Remove downstream timers that would delay the same transition again.

## Prevention Rule

When several UI surfaces must perceive one asynchronous state transition atomically, put interruptible presentation hysteresis at their nearest shared projection owner. Keep provider truth separate, use a fixed per-entity deadline, cancel on contradictory newer truth, and publish every derived surface together. Never use the elapsed window as evidence that completion occurred; it may only delay presentation of completion that is already authoritative.

## Alternative Route

- Status: `candidate`; implementation is statically inspected and runtime acceptance is pending.
- Preconditions: an authoritative provider state can briefly oscillate at a product transition and multiple consumers must stay coherent.
- Ordered steps: retain raw snapshot; detect the exact prior/next transition; create a fixed interruptible hold; derive one presented snapshot including action capability; schedule one expiry notification; remove duplicate consumer timers; clear transient holds on disable/dispose.
- Verification: ongoing remains visible and unarchivable for two seconds; running recovery within the window never flashes completed; stable completion changes cards, counts and archive ability once; repeated completed snapshots do not extend the window; initial completed inventory is immediate.
- Applicability boundary: this pattern must not manufacture completion from `notLoaded`, recency, refresh count or elapsed time; those remain governed by [codex-cross-process-notloaded-is-not-completion.md](codex-cross-process-notloaded-is-not-completion.md#L1).
- Fallback: if consumers cannot share a projection owner, define an explicit versioned presentation state machine rather than unrelated local timers.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-069 completion-transition stability | User observed ongoing/completed and archive-control flashing and required completion to remain stable for two seconds | Kept a two-second timer only for the compact active count while every other surface switched immediately | Added one Controller-owned interruptible task hold and removed the Renderer timer | candidate; static checks only, user runtime acceptance pending |
