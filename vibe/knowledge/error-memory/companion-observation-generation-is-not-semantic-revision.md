---
id: eypc-companion-observation-generation-is-not-semantic-revision
status: verified
scope: project
fingerprint: companion-high-frequency-ui-refresh__provider-observation-generation-used-as-package-semantic-revision__separate-ordering-watermarks-and-publish-only-real-semantic-deltas
first_seen: 2026-08-10
last_verified: 2026-08-10
review_after: 2026-09-10
evidence:
  - preload/companion/task-kernel.cjs
  - src/domain/companionTaskPackage.ts
  - src/runtime/codexController.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/runtime/codexController.test.ts
  - vibe/specs/260810/1155-install-runtime-diagnostics/spec.md
  - vibe/specs/260810/1155-install-runtime-diagnostics/verify.md
tags:
  - companion
  - state-kernel
  - semantic-revision
  - no-op
  - ui-publication
---

# Provider Observation Generation Is Not UI Semantic Revision

## Symptom

Task cards, counters and focus traffic refreshed at high frequency even when the task's visible phase, unread state, membership and capabilities had not changed. Character badges appeared to jitter and equivalent focus semantics were resent.

## Wrong Assumption

Every newer Provider observation or lane generation was treated as a new package meaning. This correctly rejected transport reordering but incorrectly turned polling, replay and equivalent snapshots into UI updates.

## Verified Root Cause

Ordering identity and product meaning shared one revision path. Source generations leaked into package equality, so an equivalent observation increased package revision and triggered Float publication, Renderer notification, badge recomputation and focus dispatch.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) stores observation/source-lane generations privately and compares canonical membership、phase、tri-state unread、freshness、visibility、capability and required metadata before advancing semantic/package revision.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) builds every consumer from the canonical semantic state rather than source generations.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) identifies focus only by provider+taskKey and accepts no-op packages without downstream work.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) submits 1,000 equivalent observations and proves zero task/package revision growth, Float publication and focus action after the first accepted state.

## Detection Order

1. Compare before/after canonical membership, phase, unread, freshness, visibility, capability and required metadata.
2. Separately inspect observationGeneration/sourceLaneGenerations for transport order; never infer user-visible change from them alone.
3. Count task semanticRevision, packageRevision, Float snapshot, Renderer notification, badge computation and focus dispatch for an equivalent replay.
4. Confirm debug contains one no-op reason while info has no repeated state/package noise.
5. Test focus with equal provider+taskKey and different revision; it must no-op.

## Prevention Rule

Use observation generations only to reject stale/duplicate evidence. Advance semanticRevision and packageRevision only when canonical product meaning changes. An equivalent observation must be a complete no-op across Kernel, package, Float, Renderer, badges and focus, with debug-only diagnostics. UI layout stability such as fixed badge width may remove visual reflow, but must never replace semantic no-op or delay a real state transition.

## Latest Applicable Implementation

- Same-tick evidence uses one microtask merge and one next-frame atomic package at most.
- Trusted evidence is not debounce-delayed; only unknown may enter a bounded 250ms verification window.
- `sourceGenerations/sourceLaneGenerations` remain available in debug logs but are excluded from semantic equality.
- Focus identity is provider+taskKey; destructive action concurrency uses separate capability/revision watermarks.
- Badge digits use stable width/tabular numerals after the semantic update path is already deduplicated.

## Alternative Route

- Status: `verified` by the 1,000-observation regression and focused Controller tests.
- Preconditions: canonical state can be normalized before publication and source ordering metadata remains private.
- Ordered steps: normalize → reject stale generation → compare semantic fields → emit debug no-op or advance one revision → atomically publish consumers.
- Verification: first observation publishes once; next 999 equivalent observations publish zero times and produce no info noise or focus action. A real phase/unread/membership/capability change publishes exactly once.
- Fallback: when equality cannot be established, preserve the last complete package and mark only the affected task verifying; do not publish a synthetic semantic change.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-10 | RAW-159 high-frequency state refresh | Equivalent Provider semantics repeatedly refreshed task UI and focus | Source generation participated in semantic package identity | Split observation and semantic revisions; added complete no-op and 1,000-event regression | verified automated; real installed timing pending |
