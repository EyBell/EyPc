---
id: eypc-codex-completion-transition-hysteresis
status: candidate
scope: project
fingerprint: codex-ongoing-exit-transition__completed-read-return-was-delayed-and-exception-could-bypass-shared-hold__use-one-controller-owned-interruptible-task-hold-with-immediate-promotion
first_seen: 2026-07-22
last_verified: 2026-07-27
review_after: 2026-08-22
evidence:
  - src/runtime/codexController.ts
  - src/FloatApp.vue
  - tests/runtime/codexController.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - state-transition
  - presentation-hysteresis
  - single-projection
  - archive-capability
  - interaction-continuity
---

# Stabilize Ongoing Exit At The Shared Task Projection

## Symptom

A task alternated visibly between “进行中” and a terminal state, while its archive control could change availability at a different moment. A completed/read task could also return as completed-unread or desktop-live ongoing but remain trapped behind ordinary debounce. The compact ongoing counter had its own two-second timer, but cards, groups, details and action capability consumed the provider projection immediately.

## Wrong Assumption

Delaying one badge count was treated as sufficient transition smoothing. That created multiple clocks for one product state: cards could complete first, the counter could trail later, and adding a shared delay without removing the badge timer would accumulate four seconds. Treating every incoming delta alike also delayed a newly returned unread/ongoing state that must be visible promptly.

## Candidate Root Cause

Temporal normalization lived in one Renderer consumer instead of the snapshot boundary shared by every consumer. The product therefore had no single presented state for the transition from authoritative running to a terminal state, nor a priority route for completed/read → unread/ongoing promotion.

## Evidence

- [codexController.ts](../../../src/runtime/codexController.ts#L1) keeps provider-derived raw conversations separate from the transient presented snapshot, immediately publishes completed-read → completed-unread/desktop-live active, and starts one per-task hold using persisted `completionPresentationDelayMs` (default 1500ms) only after visible running receives completed/completed-unread evidence. RAW-089 makes the deadline start at the real active-exit event; failed/system-error remain ongoing instead of becoming visible terminal states.
- The same Controller projection rebuilds task buckets, hidden/all/completed arrays, project sections, counts and `blocked-active` capability, so a waiting task remains one coherent `ongoing/running/blocked-active` product state.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) removes the independent active-counter timer and consumes the unified snapshot for cards, counters, details and archive controls.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records the interrupt, expiry and no-double-delay acceptance matrix.

## Detection Order

1. Enumerate every visible and actionable consumer of the state transition: buckets, cards, sections, counters, details, previews and destructive actions.
2. Identify whether they consume one shared presented snapshot or keep local timers/optimistic state.
3. Trace the previous raw state and next raw state; immediately publish completed-read → unread/ongoing, then start hysteresis only for a real running-to-terminal transition, never for initial terminal inventory.
4. Verify one fixed deadline: repeated terminal snapshots do not reset it, but a return to running cancels it.
5. Rebuild all derived arrays, project references, counts and capabilities from the held card.
6. Remove downstream timers that would delay the same transition again.

## Prevention Rule

When several UI surfaces must perceive one asynchronous state transition atomically, put interruptible presentation hysteresis at their nearest shared projection owner. Keep provider truth separate, immediately publish priority completed-read → unread/ongoing returns, use one fixed per-entity deadline only for ordinary explicit completed evidence, cancel on contradictory newer truth, and publish every derived surface together. Start that deadline at the real active-exit event. If completion carries finite `targeted-after-exit` provenance from the bounded post-exit reread, publish it directly because the evidence confirmation already supplied the jitter boundary; do not stack the ordinary presentation hold. Never use elapsed time to complete `notLoaded`, `unknown`, `interrupted`, failure or a connector-only record.

## Alternative Route

- Status: `candidate`; implementation is statically inspected and runtime acceptance is pending.
- Preconditions: an authoritative provider state can briefly oscillate at a product transition and multiple consumers must stay coherent.
- Ordered steps: retain raw snapshot; detect the exact active exit; immediately publish ongoing; confirm the newest Turn; bypass the hold for targeted post-exit completion, otherwise create a fixed interruptible completion-only hold from the exit timestamp; derive one presented snapshot including action capability; schedule one expiry notification; remove duplicate consumer timers; clear transient holds on disable/dispose.
- Verification: ordinary snapshot completion remains visible/unarchivable for the configured hold (default 1500ms); targeted post-exit completion publishes immediately; running recovery never flashes completion; explicit completion changes cards, counts and archive ability once; repeated completed snapshots do not extend the window; abnormal/unconfirmed states remain ongoing.
- Applicability boundary: this pattern must not manufacture completion from `notLoaded`, interruption, failure, refresh count or recency. RAW-070's former 60-second interrupted marker is superseded by RAW-089; all non-completed cases remain governed by [codex-cross-process-notloaded-is-not-completion.md](codex-cross-process-notloaded-is-not-completion.md#L1).
- Fallback: if consumers cannot share a projection owner, define an explicit versioned presentation state machine rather than unrelated local timers.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-069 completion-transition stability | User observed ongoing/completed and archive-control flashing and required completion to remain stable for two seconds | Kept a two-second timer only for the compact active count while every other surface switched immediately | Added one Controller-owned interruptible task hold and removed the Renderer timer | candidate; static checks only, user runtime acceptance pending |
| 2026-07-23 | RAW-070 interrupted grace marker | User observed a manually closed temporary task oscillating between ongoing and interrupted instead of settling | Treated every interrupted record as permanently ongoing, so a non-active stale interruption could never settle | Added a bounded 60-second marker only for explicit non-active interrupted evidence, with desktop-live active priority and unknown/notLoaded exclusions | candidate; static checks only, user runtime acceptance pending |
| 2026-07-24 | RAW-080 activity priority and ongoing-exit stabilization | User required completed/read → unread/ongoing to surface immediately and ongoing → exception to use the same configured window as completion | Let ordinary debounce delay priority returns and treated exception outside the shared presentation hold | Added per-key Activity Delta priority release plus one shared terminal hold for completion and exception | candidate; static checks only, user runtime acceptance pending |
| 2026-07-26 | RAW-089 real-time completion confirmation | User required near-real-time status and every abnormal/unconfirmed state to remain ongoing | Generic two-second debounce and exception/interrupted terminal routes delayed or invented product transitions | Removed generic debounce, started the configured hold at active exit, limited terminal presentation to explicit completed evidence | candidate; contracts updated, real transition acceptance pending |
| 2026-07-27 | RAW-092 evidence-sensitive completion timing | User reported completion delay while still requiring transient anomalies to be filtered | Applied the ordinary presentation hold even after a bounded targeted post-exit reread had already confirmed the exact completion | Bypass the hold only for `targeted-after-exit` completed; retain it for ordinary snapshot completion and keep negative states conservative | candidate; Controller contract updated, real completion latency acceptance pending |
