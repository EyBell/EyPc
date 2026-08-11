---
id: eypc-codex-completion-transition-hysteresis
status: superseded
scope: project
fingerprint: codex-ongoing-exit-transition__completed-read-return-was-delayed-and-exception-could-bypass-shared-hold__use-one-controller-owned-interruptible-task-hold-with-immediate-promotion
first_seen: 2026-07-22
last_verified: 2026-07-30
review_after: 2026-08-30
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

> Superseded by RAW-120 and refined by RAW-160. The elapsed-time hold remains retired；the current shared projection owner is `companion-task-kernel-v4`, not Controller. Exact evidence is reduced once and every consumer applies only a newer semantic package/selector.

## Symptom

A task alternated visibly between “进行中” and a terminal state, while its archive control could change availability at a different moment. A completed/read task could also return as completed-unread or desktop-live ongoing but remain trapped behind ordinary debounce. The compact ongoing counter had its own two-second timer, but cards, groups, details and action capability consumed the provider projection immediately.

## Wrong Assumption

Delaying one badge count was treated as sufficient transition smoothing. That created multiple clocks for one product state: cards could complete first, the counter could trail later, and adding a shared delay without removing the badge timer would accumulate four seconds. Treating every incoming delta alike also delayed a newly returned unread/ongoing state that must be visible promptly.

## Candidate Root Cause

Temporal normalization lived in one Renderer consumer instead of the snapshot boundary shared by every consumer. The product therefore had no single presented state for the transition from authoritative running to a terminal state, nor a priority route for completed/read → unread/ongoing promotion.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) now publishes every accepted completion through one atomic V4 task package and preserves causal active/terminal conflict as the last stable non-terminal state with `verifying`. RAW-120/121 removed the per-task hold, expiry timer, held-card rewrite and normalized `completionPresentationDelayMs` field.
- The same Kernel projection rebuilds task buckets, hidden/all/completed arrays, project sections, counts and capability, so a waiting task remains one coherent product state across every consumer.
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

When several UI surfaces must perceive one asynchronous state transition atomically, keep one shared projection owner, but do not add elapsed-time hysteresis after exact provider evidence has already passed a monotonic Turn revision/status gate. Publish all derived surfaces together; use bounded targeted reads only when evidence is missing or conflicting. Never use elapsed time to complete `notLoaded`, `unknown`, `interrupted`, failure or a connector-only record. Retain inventory/dropout protection separately from task-state presentation.

## Alternative Route

- Status: `candidate`; this historical hold route is superseded and must not be reintroduced without new runtime evidence that exact Turn ordering is insufficient.
- Preconditions: an authoritative provider state can briefly oscillate at a product transition and multiple consumers must stay coherent.
- Ordered steps: retain one Kernel-owned atomic projection; detect the exact active exit; keep the last stable non-terminal state while Turn evidence is missing or conflicts with a replayed active snapshot; confirm the newest Turn through the bounded targeted route; publish every accepted completion exactly once; keep inventory/dropout protection separate; remove duplicate consumer timers and legacy settings controls.
- Verification: ordinary, cached, targeted and full-snapshot completion all publish immediately after the same revision/status gate; running recovery is represented by waiting/inProgress or a newer revision; explicit completion changes cards, counts and archive ability once; abnormal/unconfirmed states remain ongoing.
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
| 2026-07-30 | RAW-120 evidence-only completion | User authorized selectively removing older anomaly filters/debounce once task state could be judged precisely | Retained an ordinary completion hold and duplicate cross-clock gates after direct/cached/targeted/full paths already had exact Turn revision/status evidence | Remove the hold/timer/control and order every accepted completion by provider revision/status; keep evidence-gap and inventory protections | superseded hold; focused code/UI/type verification passed, real uTools acceptance pending |
| 2026-07-30 | RAW-121 accepted-terminal regression | Completion passed the evidence gate but returned to ongoing after later reconciliation | A closed activity epoch retained its exit baseline and allowed an identical full snapshot to be guarded again | Clear the baseline with terminal acceptance and distinguish real activity patches from initial snapshot replay | status-chain regression verified; real host acceptance pending |
