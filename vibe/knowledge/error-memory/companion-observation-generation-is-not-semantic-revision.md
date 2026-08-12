---
id: eypc-companion-observation-generation-is-not-semantic-revision
status: verified
scope: project
fingerprint: companion-high-frequency-ui-refresh__provider-observation-generation-used-as-package-semantic-revision__separate-ordering-watermarks-and-publish-only-real-semantic-deltas
first_seen: 2026-08-10
last_verified: 2026-08-12
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

Task cards and counters refreshed at high frequency even when the task's visible phase, unread state, membership and capabilities had not changed. In 1.5.5, merely focusing/opening a card wrote `focusedKey` back through Kernel configuration, advanced package revision and reprojected the Float list；the row could look briefly correct and then be regrouped by the following package.

## Wrong Assumption

Every newer Provider observation、lane generation or Renderer focus change was treated as a new package meaning. This correctly retained transport/action context but incorrectly turned polling、replay and pointer/keyboard focus into UI updates.

## Verified Root Cause

Ordering/action context and product meaning shared one revision path. Source generations initially leaked into package equality；the first RAW-160 rework then left `focusedKey` inside the semantic package fingerprint/configure publication path。The later Codex audit found a second split-commit variant：Host published private Branch Evidence immediately and then synchronously emitted the matching public Activity draft，so one Provider event could advance the package twice even though it represented one user-visible transition。

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) stores observation/source-lane generations privately and compares canonical membership、phase、tri-state unread、freshness、visibility、capability and required metadata before advancing semantic/package revision.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) builds every consumer from the canonical semantic state rather than source generations.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) submits focus as private action context and dispatches card/input/cycle actions without first synchronizing/reclassifying the task package.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) submits 1,000 equivalent observations and then 100 focus changes；both prove zero task/package revision growth and zero public publication after the first accepted state，while the Host retains the latest focused key.
- The same Kernel regression stages private Branch Evidence with deferred publication，submits the matching Host draft，and proves exactly one package revision/listener publication for the combined semantic change.

## Detection Order

1. Compare before/after canonical membership, phase, unread, freshness, visibility, capability and required metadata.
2. Separately inspect observationGeneration/sourceLaneGenerations for transport order; never infer user-visible change from them alone.
3. Count task semanticRevision, packageRevision, Float snapshot, Renderer notification, badge computation and focus dispatch for an equivalent replay.
4. Confirm debug contains one no-op reason while info has no repeated state/package noise.
5. Change Renderer focus repeatedly without changing task semantics；Host Actions context must follow the latest key，while package revision、publishedAt、listener count、Main/Float projection and grouping remain unchanged.

## Prevention Rule

Use observation generations only to reject stale/duplicate evidence. Advance semanticRevision and packageRevision only when canonical product meaning changes. Evidence fragments produced by one source callback must be staged and committed as one semantic transaction；a private Branch update may not publish before its matching public draft。Renderer focus is Host action context，not task meaning；a focus-only update may retarget Actions but must not emit a task package or trigger filtering/classification。An equivalent observation must be a complete no-op across Kernel、package、Float、Renderer and badges，with debug-only diagnostics.

RAW-160 adds the downstream half of this rule: Kernel no-op alone cannot prove consumer deduplication or Float application. Main、Float、Navigation and Actions keep independent latest revision/selector caches, and Float requires an explicit applied ACK. See [consumer cache and Float applied ACK](companion-consumer-cache-and-float-applied-ack.md#L1).

## Latest Applicable Implementation

- Same-source Branch evidence uses deferred staging；the matching Host draft performs one synchronous atomic Kernel commit and at most one public package revision.
- Trusted evidence is not debounce-delayed; only unknown may enter a bounded 250ms verification window.
- `sourceGenerations/sourceLaneGenerations` remain available in debug logs but are excluded from semantic equality.
- Focus identity is provider+taskKey but remains outside semantic equality；destructive action concurrency uses separate capability/revision watermarks.
- Badge geometry uses the shared single-digit `20×20` contract with natural multi-digit width；typography changes are not a substitute for semantic deduplication.

## Alternative Route

- Status: `verified` by the 1,000-observation regression and focused Controller tests.
- Preconditions: canonical state can be normalized before publication and source ordering metadata remains private.
- Ordered steps: normalize → reject stale generation → stage same-source private evidence → compare the combined semantic fields → emit debug no-op or advance one revision → atomically publish consumers.
- Verification: first observation publishes once；next 999 equivalent observations and 100 focus-only updates publish zero additional task packages。A real phase/unread/membership/capability change publishes exactly once，and Actions still sees the latest private focus target.
- Fallback: when equality cannot be established, preserve the last complete package and mark only the affected task verifying; do not publish a synthetic semantic change.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-10 | RAW-159 high-frequency state refresh | Equivalent Provider semantics repeatedly refreshed task UI and focus | Source generation participated in semantic package identity | Split observation and semantic revisions; added complete no-op and 1,000-event regression | verified automated; real installed timing pending |
| 2026-08-11 | RAW-160 consumer application audit | Kernel no-op did not prove Main/Float/Navigation/Actions had not replayed state | Consumer revisions and applied state were implicit | Added per-consumer selector caches and Float applied ACK; retained the 1,000-event Kernel invariant | verified automated; real host pending |
| 2026-08-12 | RAW-160 1.5.5 focus echo | Clicking/focusing briefly showed the expected list and then tasks were regrouped；package revisions advanced without task-state change | `focusedKey` remained in semantic package equality and `configureConsumer` published it like task state | Exclude focus from semantic equality；update only retained Host Actions context；remove Controller pre-open package sync；add 100-focus zero-publication regression | affected 545/545 + full 1305/1305 passed；`host-719360…` acceptance pending |
| 2026-08-12 | RAW-160 Codex Branch/public split commit | One Codex state event produced two successive task-package revisions | Private Branch Evidence published before the same callback's public Activity draft | Defer Branch publication and commit the combined draft once；add exact one-revision Kernel regression | core 221、expanded 433、full 1328 passed；current-identity dev reload pending |
