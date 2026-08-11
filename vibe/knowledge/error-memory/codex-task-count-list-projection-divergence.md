---
id: eypc-codex-task-count-list-projection-divergence
status: verified
scope: project
fingerprint: codex-task-consumer-projection-split__counts-cards-and-actions-used-different-eligibility__derive-every-consumer-from-one-shared-final-projection
first_seen: 2026-07-19
last_verified: 2026-08-11
review_after: 2026-09-11
evidence:
  - src/domain/codexPresentation.ts
  - src/domain/companionTaskPackage.ts
  - src/runtime/codexController.ts
  - preload/companion/task-kernel.cjs
  - preload/companion/task-actions.cjs
  - preload/companion/navigation.cjs
  - src/FloatApp.vue
  - src/pages/CodexPage.vue
  - tests/domain/codexPresentation.test.ts
  - tests/domain/companionTaskPackage.test.ts
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

## Verified Root Cause

Final product eligibility was not represented by one atomic final projection. Counts, rendered rows, tabs, projects and action keys therefore drifted whenever a consumer added a cap, omitted a state, ignored a newer process package or read an inventory bucket broader than the visible dynamic window. Fixed total-count slices compounded the defect by making correctness depend on list position.

## Evidence

- The first occurrence used a complete group count while a Renderer consumer applied `slice(0, maxTasksPerGroup)`, so the visible list and eligible actions no longer matched the summary.
- RAW-108 added [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1), which derives non-hidden mutually exclusive dynamic groups and compact `{ input, active, unread }` counts from one Controller-stabilized snapshot. RAW-134 makes its hours parameter persistent/configurable with a 24-hour default; [FloatApp.vue](../../../src/FloatApp.vue#L1) and [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) still consume the same package without another state timer.
- RAW-109 source tracing found [codexController.ts](../../../src/runtime/codexController.ts#L1) still rebuilt previous/next candidates from every `bucket='ongoing'` task. The action now consumes the shared active group after the complete input-required collection; only an explicit EyPc-local non-stopped pin may enter the empty-pool fallback.
- RAW-146 found the same split inside the complete input-required exception and temporarily unified first-item behavior under pinned-first display order. RAW-149 supersedes that order only for the two dedicated attention groups: [codex.ts](../../../src/domain/codex.ts#L1) publishes `statusEnteredAt`, [codexController.ts](../../../src/runtime/codexController.ts#L1) owns persistent unseen traversal, and [FloatApp.vue](../../../src/FloatApp.vue#L1) dispatches the shared Controller action instead of reading `[0]`. Generic task cycling and ordinary project/pin presentation remain unchanged.
- RAW-159 makes [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) the V3 atomic final projection for cards, four tabs, projects, dynamic groups, badges, attention/cycle/focus keys and capabilities. [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) publishes canonical membership/phase/tri-state-unread semantics and creates a minimal stable-key card as soon as membership arrives；[codexController.ts](../../../src/runtime/codexController.ts#L1) then performs Codex-only metadata hydration without changing key or duplicating the row.
- RAW-160 supersedes that V3 ownership split：the V4 Kernel now owns phase、Plan lifecycle、visibility、groups/counts、cycle/attention keys and capabilities；Controller only joins narrow display metadata and reapplies the same cached package revision.
- [companionTaskPackage.test.ts](../../../tests/domain/companionTaskPackage.test.ts#L1), [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1), [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) and [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) prove atomic consumer convergence, uncapped pagination, membership-first display and 240-task preservation. The explicit multi-page fixture checks that tasks 41、101 and 201 exist in cards、tabs、badges、shortcut and archive targets.

## Detection Order

1. Name the final user-visible eligibility set, including time window, hidden handling, mutually exclusive states, search behavior and explicit pin exceptions.
2. Compare its row keys, displayed count and every eligible action key, not merely their upstream snapshot or broad bucket names.
3. For every first-item or progressive action, compare the ordered state-instance list—not only the set or count. Every status group and generic cycle tier uses latest-question-first；dedicated attention actions retain Kernel-owned unseen-instance progress and advance only after a successful Host open.
4. Search all consumers for fixed-count `slice`, bounded page-loop constants, independent time comparisons, hidden filters, full-bucket queries, raw `[0]` reads and action-only caches/debounces. Distinguish a protocol page size from a product total-count cap.
5. Check semantic exceptions separately: complete waiting-input/unread collections, dedicated persistent attention progress, generic task cycling and explicitly EyPc-local pinned fallback must not be accidentally collapsed into active-card eligibility.
6. Use fixtures on both sides of each configured time boundary: hidden, exactly/just beyond the selected hours, waiting-input versus active, stopped, completed-unread, ordinary unpinned and explicit local pin.
7. Confirm search remains downstream of counts, action invocation computes from the current stabilized snapshot without a second timer, and hover/focus/ARIA names state the same action that click/keyboard performs.

## Prevention Rule

Define final product eligibility once over the canonical Kernel task and publish cards, tabs, projects, groups, compact counts, accessibility text, previews, archive capability and navigation actions in one package revision. Consumers may search or render that package but must not rebuild state membership or reject it using a second source revision. Never read raw `[0]` or add a product-level fixed-count slice. Every status group and generic cycle tier uses latest-question-first; dedicated waiting-input and completed-unread actions layer only anonymous unseen-instance progress over those canonical groups. Progress advances only after confirmed Host open and is pruned when an instance leaves or changes. Keep hidden-inclusive attention counts, recent active eligibility and explicit local-pin fallback as named package fields. Protocol pagination must traverse to exhaustion with loop detection; it is never a display cap. Do not add a consumer-local timer or debounce to repair projection drift.

## Latest Applicable Implementation

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) owns the V4 atomic projection across card、tab、project、group、badge、action、focus and cycle consumers；[companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) only validates/applies that package and no longer reconstructs canonical phase/group/count/cycle.
- The dynamic active group contains only real active work. Waiting-input/approval are mutually exclusive attention states；ordinary stopped exits at the configured window, while only `stopped + planReady + !paused` bypasses that hour window into “待继续”.
- Input and unread compact counts remain complete over non-hidden inventory and do not gain a stopped counter. A waiting Plan may be outside the expanded dynamic list yet remain in the input badge and Plan cycle. Paused、ordinary hidden and archived tasks are excluded from badges and all shortcut candidates.
- Every status group and generic cycle tier orders stably by latest question/creation/key. Kernel-owned attention progress advances only after confirmed manual/action open；failure keeps progress, equivalent package revisions do not reset it.
- Float cards, badges, summaries/ARIA and settings preview share the projection; attention hints say “最新优先，连续触发依次打开”.
- Kernel persists a maximum of 200 anonymous opened instances per attention kind；new instances preempt, confirmed manual/action opens advance, failed opens do not, and authoritative selector changes prune obsolete instances.
- Previous/next uses the first non-empty canonical tier：ordinary question/approval → waiting Plan plus stopped actionable Plan → windowed active → explicit local pin. Completed-unread remains on its dedicated open-first action；no command changes native unread.
- Only an explicit EyPc-local pin and non-stopped state may enter the fallback when ordinary candidates are empty; native pin is not equivalent.
- Kernel stabilization and latest cache remain upstream；Main/Float/Navigation/Actions keep revision/selector fingerprints and add no Renderer clock. New Codex membership is immediately renderable as a minimal card and then receives narrow metadata hydration without changing the cached canonical revision.
- Claude inventory, Kernel, actions, navigation, mutation and batch paths have no fixed product total-count cap. Codex follows every protocol page cursor and rejects loops.

## Alternative Route

- Status: `verified`; V4 focused regressions retain 240 tasks across three protocol pages, including consumer checks for keys 41、101 and 201, and the full RAW-160 suite/build passed. Real-host interaction remains a separate acceptance gate.
- Preconditions: all consumers receive the same versioned Kernel package and a named selector can express final display/action eligibility.
- Ordered steps: reduce evidence once in Kernel → derive final arrays/counts/cycle keys once → publish only a semantic change → let visual/action consumers use their named selector cache → advance attention progress only after confirmed Host open → remove duplicate filters and raw `[0]` reads.
- Verification: cards/counts agree across jitter and hidden providers; an old task receiving a new approval stays in the recent dynamic projection; waiting approval exits active count; cross-provider attention is newest-first regardless of pin; `1→2→3, new 6→6→4→5`, same-task new state, wrap, reload recovery, manual success and failure paths are locked; ordinary project/pin display and generic cycle remain unchanged; privacy whitelist excludes request payload, path, command, permissions and raw ID.
- Fallback: if an action genuinely needs different eligibility, define and document a separate named domain projection with explicit semantics. Do not silently query a broader inventory bucket.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-19 | Complete group visibility | Count and accessible rows diverged above a former per-group cap | Count used the full group while Renderer sliced rows with `maxTasksPerGroup` | Removed the consumer cap and retained scrolling over the complete bounded source | historical precursor |
| 2026-07-28 | RAW-108 stable status projection | Ongoing badge, dynamic cards and settings preview disagreed on hidden/window/conservative-ongoing eligibility during transport jitter | Each Renderer consumer independently filtered the same stable snapshot | Added one stateless recent-six-hour dynamic projection and routed cards/counts/ARIA/preview through it | candidate; static checks complete, real transition acceptance pending |
| 2026-07-28 | RAW-109 task-cycle eligibility | An unpinned old conservative ongoing task stayed in previous/next after leaving the dynamic active window | Controller action filtered the entire 30-day ongoing bucket instead of the shared active display group | Reused the shared active group after full input-required; retained only explicit EyPc-local non-stopped empty-pool fallback | candidate; source/contracts/static checks complete, real shortcut acceptance pending |
| 2026-08-03 | RAW-146 ordered first-open closeout | Compact input and global input used the same complete count set but could open different tasks; passing UI tests omitted the promised action text | Controller read raw `inputRequired[0]`; Controller/Float kept separate ordering code; single-item and copied-label assertions could not expose divergence | Added one Domain display-order function, routed Controller/Float through it, added later-pinned reverse fixture, corrected hover/focus/ARIA and scanned stale strings | candidate; focused `90/90`, full `752/752`, typecheck/static/docs gates pass; actual host update explicitly excluded |
| 2026-08-08 | RAW-149 newest-first attention progress | Dedicated counters repeatedly opened one pinned/Provider-first task, so newer waits could not preempt and reload forgot unseen older state instances; the real preflight also copied a stale rule that counted approval as active | Reused ordinary display ordering, treated direct-open as stateless, and rebuilt a diagnostic active predicate outside Presentation | Added cross-provider `statusEnteredAt DESC`, versioned anonymous progress capped at 200, confirmed-open/manual-open advancement, failure retention and state-instance pruning; kept generic cycling separate and routed preflight active counts through production Presentation | candidate; affected automated gates and real v6 read-only preflight pass, real non-Full-Access approval lifecycle remains host-pending |
| 2026-08-10 | RAW-155 single final projection | New Codex tasks were absent while badges/cards/tabs could disagree; unknown tasks could fall out of every dynamic group; unread revision could replace a Codex archive completion watermark; fixed task caps silently excluded otherwise valid tasks | Renderer and action consumers rebuilt subsets, gated complete process packages on a second revision and reused one generic revision for unrelated phase/unread/archive meanings | Projected every canonical task atomically, kept Provider-specific unknown visibility, preserved phase-specific archive watermarks, hydrated unknown Codex metadata narrowly, removed product total-count caps and added 2005/405-item regressions | verified; focused `303/303`, typecheck and production/uTools build pass |
| 2026-08-10 | RAW-159 membership-first V3 projection | New Codex membership could wait for title/project while source inventory beyond earlier caps never reached cards or shortcuts | Admission and presentation metadata were coupled; protocol page size leaked into product eligibility | Emit a stable minimal card immediately, hydrate metadata in place, traverse all cursors and derive every consumer from one V3 package | verified by 240-task and membership-first focused regressions; real host pending |
| 2026-08-11 | RAW-160 Kernel V4 projection | Plan window exceptions、pause、attention progress and consumer caches would diverge if Controller/Renderer retained V3 selectors | Patch each missing list/count/action locally | Move canonical state and all selectors to Kernel V4, retain only metadata join in Controller, and add per-consumer revision/fingerprint caches | affected/full automation and build verified; real host pending |
