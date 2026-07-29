---
id: eypc-codex-task-state-version-skew-must-degrade-atomically
status: candidate
scope: project
fingerprint: codex-task-counts-stale-or-all-task-surfaces-empty__preload-controller-renderer-task-semantics-upgraded-independently__scattered-version-gates-trusted-or-cleared-usable-state__publish-one-controller-owned-package-and-degrade-atomically
first_seen: 2026-07-29
last_verified: 2026-07-29
review_after: 2026-08-29
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
  - task-state
  - version-skew
  - atomic-projection
  - utools
---

# Task-State Version Skew Must Degrade One Atomic Package

## Symptom

The compact badge and expanded active segment agreed on a stale count while a current-source anonymous read had fewer active tasks. The first semantic-version guard then over-corrected: quota remained visible, but every task card and badge disappeared.

## Wrong Assumption

Structurally valid task snapshots were assumed to carry current semantics. The correction then let both Controller and Float independently clear task state on a mismatch, treating freshness diagnostics as deletion authority.

## Candidate Root Cause

uTools may retain an older preload or main Controller while a child Renderer loads newer code. Shape validation cannot distinguish old and current task semantics. When compatibility decisions are scattered, one layer may trust stale state while another erases usable state, so cards, groups and counts no longer have one owner.

## Evidence

- [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1) owns the atomic task-state package and legacy normalization.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) continues inventory/activity lanes and marks compatible evidence degraded instead of clearing it.
- [FloatApp.vue](../../../src/FloatApp.vue#L1) and [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) consume the package without independent task-state filtering or clocks.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) preserves the source diagnosis and pending real reload acceptance.

## Detection Order

1. Compare the task semantic revision across preload capability, platform normalization, Controller package and Renderer snapshot.
2. Distinguish stale-but-usable privacy-safe task evidence from an absent or structurally invalid snapshot.
3. Search for independent revision gates, empty fallback projections, local task filters and Renderer-owned status timers.
4. Confirm cards, dynamic groups, compact counts, ARIA, settings preview and task-cycle candidates share one package instance.
5. Verify a mismatch continues inventory and Activity Delta reads while exposing one degraded diagnostic.

## Prevention Rule

Carry one end-to-end task semantic revision, but keep compatibility and presentation inside one Controller-owned atomic package. Missing or future revisions may mark usable evidence degraded and recommend a normal reload; they must not independently stop task lanes or clear task state in Controller and Renderer. Every task consumer must read the same package, and a one-release legacy snapshot may be normalized only once through the same domain builder.

## Latest Applicable Implementation

[codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1) builds `CodexTaskStatePackageV1`. [codexController.ts](../../../src/runtime/codexController.ts#L1) publishes it to main and floating views while preserving compatible evidence as degraded. Renderer surfaces consume the package without another revision clear, projection or status clock. The additive diagnostic-port mismatch remains separately owned by [codex-preload-capability-version-skew.md](codex-preload-capability-version-skew.md#L1).

## Alternative Route

- Status: `candidate`.
- Preconditions: the task semantic revision is missing or mismatched, but the current preload/Controller snapshot still exposes structurally usable privacy-safe task evidence.
- Ordered steps: continue inventory and Activity Delta lanes; normalize once; build the Controller package; mark it degraded; render the same package everywhere; recommend a normal plugin reload.
- Verification: source and contract review confirm the duplicate empty projections and Renderer clock are removed; focused automated contracts and a real mixed-version/reload transition remain intentionally unexecuted.
- Applicability boundary: semantic skew with usable task evidence. It does not authorize fabricating tasks from raw identities, accepting invalid protocol frames, or suppressing true preload failures.
- Fallback: if no usable task snapshot exists, expose the naturally empty degraded package and re-read after normal reload; never rebuild identity or state heuristically in Renderer.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-29 | RAW-111 semantic revision | Badge/cards stayed at 5 while current-source anonymous evidence had one active task | Trust a structurally valid snapshot and expect long-lived layers to converge through HMR | Add an end-to-end task semantic revision | source/test contracts reported; real reload acceptance pending |
| 2026-07-29 | RAW-113 atomic package correction | The first version guard left quota but erased every task surface | Clear task data independently in Controller and Float | Preserve usable evidence in one degraded Controller package and remove Renderer-owned projection/timer | source/test contracts reported; real current/degraded transition acceptance pending |
