---
id: eypc-codex-preload-capability-version-skew
status: verified
scope: project
fingerprint: codex-diagnostic-shows-unsupported-beside-connected-server__renderer-adds-inspection-port-before-utools-reloads-preload__unsupported-fallback-survives-successful-snapshot__mixed-version-eypc-codex-host
first_seen: 2026-07-19
last_verified: 2026-07-29
review_after: 2027-01-19
evidence:
  - user-host-screenshot
  - regression-test
  - production-build
  - authorized-read-only-live-debug
  - current-source-anonymous-preflight
tags:
  - codex-companion
  - utools
  - preload
  - version-skew
  - diagnostics
  - lifecycle
---

# Codex Renderer Outruns a Long-Lived uTools Preload

## Symptom

The real Codex configuration Tab showed a red “当前系统暂不支持自动核查” banner and “系统/CLI 不支持” rows while the same panel showed a discovered process, loaded configuration, a connected App Server and live quota.

A later occurrence was more dangerous: the compact ongoing badge and expanded active segment both showed 5, while the current-source anonymous preflight showed only `1 ongoing / 1 active` and several displayed tasks already had completed latest Turns. The badge and cards agreed with each other but consumed an obsolete main-Controller snapshot.

The first semantic-version fix then over-corrected: the real float kept quota but lost every task counter and task status. Controller and Float each treated the same mismatch as authority to replace available task data with an empty projection.

## Wrong Assumption

The Renderer and uTools preload were treated as if they always upgraded atomically. The additive `inspectEnvironment` method was assumed to exist whenever the newer configuration UI loaded, and its fallback was treated as authoritative platform evidence. The later correction assumed semantic safety required every independently reloadable layer to fail closed by clearing task state, instead of preserving one internally coherent state package and marking its freshness degraded.

## Verified Root Cause

uTools can keep an older preload or main Renderer/Controller instance alive while loading a newer Renderer bundle in another child window. In the first occurrence, the legacy host exposed `codex.readSnapshot` but not the later `codex.inspectEnvironment` port, so a no-host fallback contradicted a successful connection. In the task-count occurrence, the older main Controller kept publishing a structurally valid but semantically obsolete stabilized snapshot to a newer floating Renderer. Shape/version parsing alone could not distinguish the two implementations, so an old count remained indefinitely credible. The attempted guard was implemented twice: Controller cleared receipts/holds/baselines and stopped task lanes when the preload revision differed, while Float independently rejected the Controller snapshot. That scattered compatibility decision made the whole task surface disappear and left no single owner able to keep cards, groups and counts coherent.

## Evidence

- Mixed-host adapter and success promotion: [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) and [codexController.ts](../../../src/runtime/codexController.ts#L1).
- Contradiction-free diagnostic projection: [CodexPage.vue](../../../src/pages/CodexPage.vue#L1).
- Mac/Windows, generation and UI regressions: [eypcPlatform.test.ts](../../../tests/platform/eypcPlatform.test.ts#L1), [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) and [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1).
- Acceptance record: [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Correct Detection Order

1. Distinguish a true no-host browser from a desktop host that already exposes the Codex snapshot bridge.
2. If the snapshot bridge is also absent, remain unsupported. If only the additive inspection method is absent, infer no more than the macOS/Windows category from browser host metadata and show a neutral “等待连接验证” state.
3. Treat a successful App Server round-trip as stronger evidence than the missing capability fallback; promote runtime, process, config and connection together and clear the stale error.
4. Keep the no-host browser path unsupported and preserve precise failures from a current preload.
5. Invalidate the snapshot generation whenever the active surface/feature is disabled or the Controller is disposed; a disable/re-enable cycle must start a fresh read instead of accepting the old result.
6. Rebuild and reload the uTools plugin so the canonical preload eventually replaces the compatibility path.
7. For correctness-bearing projections such as task state, carry an explicit semantic revision but keep compatibility state inside one Controller-owned atomic package. A missing/future revision marks the package degraded and recommends reload; it must not stop inventory/activity lanes or independently clear Controller and Renderer state.
8. Verify that cards, status groups, compact counts, settings preview, ARIA and task-cycle eligibility all consume that package. A Renderer may normalize a one-release legacy snapshot once through the same domain builder, but must not own another status filter, revision gate or timer.

## Prevention Rule

Every additive preload port must define a mixed-version behavior separately from the no-host browser fallback. Capability absence is not platform failure, and a successful lower-level round-trip must reconcile every dependent readiness field as one state transition. Async host reads require a generation guard across disable/re-enable and disposal. If old and new implementations can return the same data shape but attach different correctness semantics, add an end-to-end semantic revision, but do not scatter fail-closed clearing across consumers. Publish one atomic state package, preserve it as degraded during skew, and make every presentation surface consume that package; freshness warnings and data deletion are different decisions.

## Latest Applicable Implementation

[eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) still recognizes the legacy diagnostic bridge without prematurely verifying the CLI and maps a missing task-state revision to `legacy`. [codexPresentation.ts](../../../src/domain/codexPresentation.ts#L1) now builds the only atomic task-state package. [codexController.ts](../../../src/runtime/codexController.ts#L1) promotes valid readiness, continues legacy task/activity reads, publishes the same package to main/float views and marks mismatch degraded. [FloatApp.vue](../../../src/FloatApp.vue#L1) renders the package without another revision clear or task-state clock; [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) uses it for settings preview and diagnostics. Quota/config remain independent.

## Alternative Route: Atomic Task-State Degradation

- Status: `candidate`.
- Preconditions: a task-state semantic revision is missing or mismatched, but the existing preload/Controller snapshot still exposes usable privacy-safe task evidence.
- Ordered steps: continue inventory and Activity Delta lanes; build one Controller package containing stabilized conversations, mutually exclusive groups, compact counts, next time boundary and compatibility; mark it degraded; render that same package everywhere; recommend a normal plugin reload.
- Verification: static source and contract review confirm the duplicate empty projections and Renderer clock are removed. Focused automated contracts and a real mixed-version/reload transition remain intentionally unexecuted, so this route is not yet verified.
- Applicability boundary: semantic skew with structurally usable task evidence. It does not authorize fabricating tasks when an older Controller already emitted an empty snapshot, trusting raw/private host data in Renderer, or suppressing true protocol/frame failures inside preload.
- Fallback: if no usable task snapshot exists, show the naturally empty package plus degraded diagnostic and re-read after normal reload; never reconstruct task identity or status heuristically in Renderer.

## Alternative Route

- Status: `verified`.
- Preconditions: a desktop host exposes the existing snapshot bridge, but an additive diagnostic method may be absent because the host preload has not reloaded.
- Ordered steps: classify desktop versus browser; infer only the safe platform enum; keep readiness pending; perform the existing snapshot read; reconcile all readiness fields on success; reject stale generations; rebuild/reload the packaged preload.
- Verification: MacIntel and Win32 legacy-host tests, no-bridge refusal, successful promotion, neutral pre-success UI, contradiction-free connected UI, disable/re-enable invalidation, post-disposal suppression, full tests, typecheck and production/uTools build validation pass.
- Applicability boundary: additive EyPc uTools preload capabilities. It does not authorize private API fallback, raw host inspection, trusting an arbitrary injected bridge or suppressing current-preload errors.
- Fallback: retain the neutral verification state until the active surface can read; on a structured read failure show that failure and keep any previous quota stale.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19 | Codex first-launch diagnostics follow-up | Real uTools screenshot showed unsupported system/CLI beside connected App Server and quota | Reuse the no-host unsupported fallback for an absent additive preload method, then merge only process/config/connection on success | User screenshot plus exact state-path reproduction | Separate legacy desktop fallback, defer readiness, promote successful evidence and add request generations | verified in source/package; refreshed real-host observation remains |
| 2026-07-29 | Codex task badge/status follow-up | Float badge and active cards both stayed at 5 while current-source anonymous preflight was 1 | Trust any structurally valid Controller snapshot and expect long-lived host instances to converge through HMR | User screenshots, authorized read-only float inspection, current thread-status comparison, anonymous preflight and process/file lifetime evidence | Add one task-state semantic revision across preload, adapter, Controller and float; fail closed for task data on either mixed-version edge | source/test contracts updated; normal plugin reload and real transition acceptance pending |
| 2026-07-29 | Codex atomic task-state follow-up | After the version guard, the real float retained quota but every task badge/card disappeared | Let Controller and Float independently clear task state on the same semantic mismatch | User correction, read-only float observation and exact source-path review | Replace both clears with one Controller-owned atomic package; preserve mixed-version data as degraded and remove Renderer status projection/timer | source/test contracts updated; normal reload and real current/degraded transition acceptance pending |
