---
id: eypc-codex-task-count-list-projection-divergence
status: candidate
scope: project
fingerprint: codex-task-consumer-projection-split__counts-cards-and-actions-used-different-eligibility__derive-every-consumer-from-one-shared-final-projection
first_seen: 2026-07-19
last_verified: 2026-07-28
review_after: 2026-08-28
evidence:
  - src/domain/codexPresentation.ts
  - src/runtime/codexController.ts
  - src/FloatApp.vue
  - src/pages/CodexPage.vue
  - tests/domain/codexPresentation.test.ts
  - tests/runtime/codexController.test.ts
  - tests/ui/codexCompanion.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - projection
  - task-count
  - action-eligibility
  - time-window
  - single-source
---

# Derive Codex Cards, Counts And Actions From One Final Projection

## Symptom

- A status summary could report more tasks than the expanded list exposed because one consumer truncated an otherwise complete group.
- Later, the dynamic active cards and badge correctly excluded hidden or older-than-six-hour tasks, while previous/next still opened an unpinned old task because its action pool independently consumed the full 30-day conservative `ongoing` bucket.
- Millisecond transport jitter made the split especially confusing: the stable Controller snapshot was coherent, but downstream consumers applied different eligibility rules to it.

## Wrong Assumption

Sharing one upstream snapshot was treated as sufficient even when each list, counter or command rebuilt its own final subset. A consumer-local `slice`, hidden/window filter or broad bucket query was assumed to be harmless because it did not alter provider state.

## Candidate Root Cause

Final product eligibility was not represented by one reusable pure projection. Counts, rendered rows and action keys therefore drifted whenever a consumer added a cap, omitted a conservative state, included hidden rows or read an inventory bucket broader than the visible dynamic window.

## Evidence

- The first occurrence used a complete group count while a Renderer consumer applied `slice(0, maxTasksPerGroup)`, so the visible list and eligible actions no longer matched the summary.
- RAW-108 added [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1), which derives non-hidden mutually exclusive dynamic groups and compact `{ input, active, unread }` counts from one Controller-stabilized snapshot. RAW-134 makes its hours parameter persistent/configurable with a 24-hour default; [FloatApp.vue](../../../src/FloatApp.vue#L1) and [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) still consume the same package without another state timer.
- RAW-109 source tracing found [codexController.ts](../../../src/runtime/codexController.ts#L1) still rebuilt previous/next candidates from every `bucket='ongoing'` task. The action now consumes the shared active group after the complete input-required collection; only an explicit EyPc-local non-stopped pin may enter the empty-pool fallback.
- Existing contracts in [codexPresentation.test.ts](../../../tests/domain/codexPresentation.test.ts#L1), [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) and [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) cover shared counts/cards and old conservative-ongoing action exclusion. They were updated but intentionally not executed under the current verification boundary.

## Detection Order

1. Name the final user-visible eligibility set, including time window, hidden handling, mutually exclusive states, search behavior and explicit pin exceptions.
2. Compare its row keys, displayed count and every eligible action key, not merely their upstream snapshot or broad bucket names.
3. Search all consumers for `slice`, independent time comparisons, hidden filters, full-bucket queries and action-only caches/debounces.
4. Check semantic exceptions separately: complete waiting-input/unread collections, dedicated completed-unread open-first action and explicitly EyPc-local pinned fallback must not be accidentally collapsed into active-card eligibility.
5. Use fixtures on both sides of each configured time boundary: hidden, exactly/just beyond the selected hours, waiting-input versus active, stopped, completed-unread, ordinary unpinned and explicit local pin.
6. Confirm search remains downstream of counts and that action invocation computes from the current stabilized snapshot without a second timer.

## Prevention Rule

Define final product eligibility once as a stateless pure projection over the stabilized Controller snapshot. Cards, compact counts, summaries, accessibility text, previews and generic navigation actions must consume the relevant arrays from that projection rather than repeat time/hidden/state filtering. Keep explicit semantic exceptions named and narrow: waiting-input and completed-unread may retain complete hidden-inclusive counts and dedicated first-item actions; previous/next may use complete waiting-input plus the shared recent active group; only an explicit EyPc-local non-stopped pin may bypass an empty ordinary action pool. Pagination or source completeness must change the source contract, never be approximated by a downstream cap. Do not add a consumer-local timer or debounce to repair projection drift.

## Latest Applicable Implementation

- [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1) owns configured recent-hours, non-hidden dynamic grouping and compact counts; `dynamicTaskWindowHours` defaults to 24 and is normalized in the Codex settings domain.
- The active group contains only `active / waiting-approval / ongoing`; waiting-input is mutually exclusive and stopped exits immediately.
- Input and unread compact counts remain complete and hidden-inclusive; search filters expanded rows only.
- Float cards, badges, summaries/ARIA and settings preview share the projection.
- Previous/next ordinary candidates are complete input-required followed by the shared active group. Completed-unread remains on its dedicated open-first action; no command changes native unread.
- Only an explicit EyPc-local pin and non-stopped state may enter the fallback when ordinary candidates are empty; native pin is not equivalent.
- Communication/Controller stabilization remains upstream and unchanged; the shared projection is stateless and adds no clock.

## Alternative Route

- Status: `candidate`; source, contracts and automated verification are synchronized, while real-host acceptance remains pending.
- Preconditions: all consumers receive the same versioned, Controller-stabilized conversation snapshot and a pure projection can express final display eligibility.
- Ordered steps: derive final arrays once; expose explicit counts; make every visual consumer use them; make generic action pools reuse the same active array; preserve separately named full-collection/dedicated-action/local-pin exceptions; remove duplicate filters and timers.
- Verification: cards and active badge have identical keys/counts across jitter; an unpinned task just beyond the configured hours is absent from both active display and previous/next; editing the hours immediately changes both through the same package; local pin restores only the documented empty-pool fallback; completed-unread stays outside generic cycling; search never changes compact counts.
- Fallback: if an action genuinely needs different eligibility, define and document a separate named domain projection with explicit semantics. Do not silently query a broader inventory bucket.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-19 | Complete group visibility | Count and accessible rows diverged above a former per-group cap | Count used the full group while Renderer sliced rows with `maxTasksPerGroup` | Removed the consumer cap and retained scrolling over the complete bounded source | candidate; existing contracts retained |
| 2026-07-28 | RAW-108 stable status projection | Ongoing badge, dynamic cards and settings preview disagreed on hidden/window/conservative-ongoing eligibility during transport jitter | Each Renderer consumer independently filtered the same stable snapshot | Added one stateless recent-six-hour dynamic projection and routed cards/counts/ARIA/preview through it | candidate; static checks complete, real transition acceptance pending |
| 2026-07-28 | RAW-109 task-cycle eligibility | An unpinned old conservative ongoing task stayed in previous/next after leaving the dynamic active window | Controller action filtered the entire 30-day ongoing bucket instead of the shared active display group | Reused the shared active group after full input-required; retained only explicit EyPc-local non-stopped empty-pool fallback | candidate; source/contracts/static checks complete, real shortcut acceptance pending |
