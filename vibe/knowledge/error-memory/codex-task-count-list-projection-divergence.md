---
id: eypc-codex-task-count-list-projection-divergence
status: candidate
scope: project
fingerprint: codex-task-consumer-projection-split__counts-cards-and-actions-used-different-eligibility__derive-every-consumer-from-one-shared-final-projection
first_seen: 2026-07-19
last_verified: 2026-08-08
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
- A compact waiting-input counter and task cycle applied pinned-first display ordering, while the global waiting-input command opened raw `inputRequired[0]`; the same count could therefore open a different task. Its hover/focus and ARIA text also omitted “打开第一条”, while passing UI tests asserted that stale copy.
- Later, dedicated waiting-input and completed-unread shortcuts kept reopening a single pinned/Provider-first item. Newer state instances could not preempt, and reloading lost awareness of older unseen items even though the count remained correct.

## Wrong Assumption

Sharing one upstream snapshot was treated as sufficient even when each list, counter or command rebuilt its own final subset. A consumer-local `slice`, hidden/window filter or broad bucket query was assumed to be harmless because it did not alter provider state.

The same mistake also applies to order and action semantics: sharing the complete key set is insufficient when consumers choose its first item with different comparators, or when tests validate only one candidate and copy the current label instead of the product contract.

## Candidate Root Cause

Final product eligibility was not represented by one reusable pure projection. Counts, rendered rows and action keys therefore drifted whenever a consumer added a cap, omitted a conservative state, included hidden rows or read an inventory bucket broader than the visible dynamic window.

## Evidence

- The first occurrence used a complete group count while a Renderer consumer applied `slice(0, maxTasksPerGroup)`, so the visible list and eligible actions no longer matched the summary.
- RAW-108 added [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1), which derives non-hidden mutually exclusive dynamic groups and compact `{ input, active, unread }` counts from one Controller-stabilized snapshot. RAW-134 makes its hours parameter persistent/configurable with a 24-hour default; [FloatApp.vue](../../../src/FloatApp.vue#L1) and [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) still consume the same package without another state timer.
- RAW-109 source tracing found [codexController.ts](../../../src/runtime/codexController.ts#L1) still rebuilt previous/next candidates from every `bucket='ongoing'` task. The action now consumes the shared active group after the complete input-required collection; only an explicit EyPc-local non-stopped pin may enter the empty-pool fallback.
- RAW-146 found the same split inside the complete input-required exception and temporarily unified first-item behavior under pinned-first display order. RAW-149 supersedes that order only for the two dedicated attention groups: [codex.ts](../../../src/domain/codex.ts#L1) publishes `statusEnteredAt`, [codexController.ts](../../../src/runtime/codexController.ts#L1) owns persistent unseen traversal, and [FloatApp.vue](../../../src/FloatApp.vue#L1) dispatches the shared Controller action instead of reading `[0]`. Generic task cycling and ordinary project/pin presentation remain unchanged.
- Existing contracts in [codexPresentation.test.ts](../../../tests/domain/codexPresentation.test.ts#L1), [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) and [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) cover shared counts/cards and old conservative-ongoing action exclusion. They were updated but intentionally not executed under the current verification boundary.

## Detection Order

1. Name the final user-visible eligibility set, including time window, hidden handling, mutually exclusive states, search behavior and explicit pin exceptions.
2. Compare its row keys, displayed count and every eligible action key, not merely their upstream snapshot or broad bucket names.
3. For every first-item or progressive action, compare the ordered state-instance list—not only the set or count. Dedicated attention actions require newest `statusEnteredAt` first across providers and pins; generic display/cycle fixtures retain their own pinned-first contract.
4. Search all consumers for `slice`, independent time comparisons, hidden filters, full-bucket queries, raw `[0]` reads and action-only caches/debounces.
5. Check semantic exceptions separately: complete waiting-input/unread collections, dedicated persistent attention progress, generic task cycling and explicitly EyPc-local pinned fallback must not be accidentally collapsed into active-card eligibility.
6. Use fixtures on both sides of each configured time boundary: hidden, exactly/just beyond the selected hours, waiting-input versus active, stopped, completed-unread, ordinary unpinned and explicit local pin.
7. Confirm search remains downstream of counts, action invocation computes from the current stabilized snapshot without a second timer, and hover/focus/ARIA names state the same action that click/keyboard performs.

## Prevention Rule

Define final product eligibility once over the stabilized Controller snapshot. Cards, compact counts, summaries, accessibility text, previews and navigation actions must consume the relevant arrays from that projection rather than repeat time/hidden/state filtering. Never read raw `[0]` in a consumer. Name ordering by use case: ordinary display and generic task cycling retain their pinned-first contract, while waiting-input and completed-unread use global `statusEnteredAt DESC` and Controller-owned persistent unseen progress. Progress is keyed only by anonymous task key plus state time, advances only after confirmed Host open (manual row opens included), resets after all current instances have been visited, and is pruned when an instance leaves or changes. Keep hidden-inclusive attention counts, recent active eligibility and explicit local-pin fallback separate. Action hints and ARIA must describe the exact click/keyboard effect. Pagination or source completeness must change the source contract, never be approximated by a downstream cap. Do not add a consumer-local timer or debounce to repair projection drift.

## Latest Applicable Implementation

- [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1) owns configured recent-hours, non-hidden dynamic grouping and compact counts; `dynamicTaskWindowHours` defaults to 24 and is normalized in the Codex settings domain.
- The active group contains only `active / ongoing`; waiting-input and waiting-approval are mutually exclusive attention states and stopped exits immediately.
- Input and unread compact counts remain complete and hidden-inclusive; search filters expanded rows only. Foreign-provider hidden attention rows contribute to the same global counts.
- Ordinary lists and generic previous/next retain their established display/cycle order. Dedicated waiting-input and completed-unread actions instead sort state instances by `statusEnteredAt DESC`, independent of pins and Provider grouping.
- Float cards, badges, summaries/ARIA and settings preview share the projection; attention hints say “最新优先，连续触发依次打开”.
- Controller persists a maximum of 200 anonymous opened instances per attention kind; new instances preempt, confirmed manual/action opens advance, failed opens do not, and authoritative group changes prune obsolete instances.
- Previous/next ordinary candidates are complete input-required followed by the shared active group. Completed-unread remains on its dedicated open-first action; no command changes native unread.
- Only an explicit EyPc-local pin and non-stopped state may enter the fallback when ordinary candidates are empty; native pin is not equivalent.
- Communication/Controller stabilization remains upstream and unchanged; the shared projection is stateless and adds no clock.

## Alternative Route

- Status: `candidate`; source, contracts and focused automated verification are synchronized, while real-host approval lifecycle acceptance remains pending.
- Preconditions: all consumers receive the same versioned, Controller-stabilized conversation snapshot and a pure projection can express final display eligibility.
- Ordered steps: derive final arrays once; expose explicit counts and status-entry time; make visual consumers use them; keep generic action pools on their named projection; route both dedicated attention actions and manual opens through one Controller progress owner; remove duplicate filters and Renderer `[0]` reads.
- Verification: cards/counts agree across jitter and hidden providers; an old task receiving a new approval stays in the recent dynamic projection; waiting approval exits active count; cross-provider attention is newest-first regardless of pin; `1→2→3, new 6→6→4→5`, same-task new state, wrap, reload recovery, manual success and failure paths are locked; ordinary project/pin display and generic cycle remain unchanged; privacy whitelist excludes request payload, path, command, permissions and raw ID.
- Fallback: if an action genuinely needs different eligibility, define and document a separate named domain projection with explicit semantics. Do not silently query a broader inventory bucket.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-19 | Complete group visibility | Count and accessible rows diverged above a former per-group cap | Count used the full group while Renderer sliced rows with `maxTasksPerGroup` | Removed the consumer cap and retained scrolling over the complete bounded source | candidate; existing contracts retained |
| 2026-07-28 | RAW-108 stable status projection | Ongoing badge, dynamic cards and settings preview disagreed on hidden/window/conservative-ongoing eligibility during transport jitter | Each Renderer consumer independently filtered the same stable snapshot | Added one stateless recent-six-hour dynamic projection and routed cards/counts/ARIA/preview through it | candidate; static checks complete, real transition acceptance pending |
| 2026-07-28 | RAW-109 task-cycle eligibility | An unpinned old conservative ongoing task stayed in previous/next after leaving the dynamic active window | Controller action filtered the entire 30-day ongoing bucket instead of the shared active display group | Reused the shared active group after full input-required; retained only explicit EyPc-local non-stopped empty-pool fallback | candidate; source/contracts/static checks complete, real shortcut acceptance pending |
| 2026-08-03 | RAW-146 ordered first-open closeout | Compact input and global input used the same complete count set but could open different tasks; passing UI tests omitted the promised action text | Controller read raw `inputRequired[0]`; Controller/Float kept separate ordering code; single-item and copied-label assertions could not expose divergence | Added one Domain display-order function, routed Controller/Float through it, added later-pinned reverse fixture, corrected hover/focus/ARIA and scanned stale strings | candidate; focused `90/90`, full `752/752`, typecheck/static/docs gates pass; actual host update explicitly excluded |
| 2026-08-08 | RAW-149 newest-first attention progress | Dedicated counters repeatedly opened one pinned/Provider-first task, so newer waits could not preempt and reload forgot unseen older state instances; the real preflight also copied a stale rule that counted approval as active | Reused ordinary display ordering, treated direct-open as stateless, and rebuilt a diagnostic active predicate outside Presentation | Added cross-provider `statusEnteredAt DESC`, versioned anonymous progress capped at 200, confirmed-open/manual-open advancement, failure retention and state-instance pruning; kept generic cycling separate and routed preflight active counts through production Presentation | candidate; affected automated gates and real v6 read-only preflight pass, real non-Full-Access approval lifecycle remains host-pending |
