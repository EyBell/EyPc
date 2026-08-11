---
id: eypc-codex-task-state-version-skew-must-degrade-atomically
status: verified
scope: project
fingerprint: companion-task-version-skew__kernel-or-runtime-identity-missing__legacy-controller-renderer-fallback-diverges__fail-closed-to-reload-required
first_seen: 2026-07-29
last_verified: 2026-08-11
review_after: 2026-09-11
evidence:
  - preload/companion/task-kernel.cjs
  - scripts/utools-runtime-identity.mjs
  - src/platform/eypcPlatform.ts
  - src/runtime/codexController.ts
  - tests/platform/eypcPlatform.test.ts
  - tests/platform/runtimeIdentity.test.ts
  - tests/runtime/codexController.test.ts
  - vibe/specs/260810/1155-install-runtime-diagnostics/verify.md
tags:
  - codex-companion
  - task-state
  - version-skew
  - atomic-projection
  - utools
---

# Task-State Version Skew Must Fail Closed To Reload Required

> RAW-111/113 的“保留旧 Controller 包并降级展示”是历史恢复策略；RAW-160 已取代它。当前运行时只接受 V4 Kernel/package/identity 同构链，缺失或混版统一进入 `reload-required`。

## Symptom

The compact badge and expanded active segment agreed on a stale count while a current-source anonymous read had fewer active tasks. The first semantic-version guard then over-corrected: quota remained visible, but every task card and badge disappeared.

## Wrong Assumption

Structurally valid task snapshots were assumed to carry current semantics. The correction then let both Controller and Float independently clear task state on a mismatch, treating freshness diagnostics as deletion authority.

## Candidate Root Cause

uTools may retain an older preload or main Controller while a child Renderer loads newer code. Shape validation cannot distinguish old and current task semantics. When compatibility decisions are scattered, one layer may trust stale state while another erases usable state, so cards, groups and counts no longer have one owner.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) is the only V4 canonical reducer/package owner.
- [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) converts a claimed loaded identity with a missing/incompatible V4 bridge into `reload-required` and `kernel-missing`.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) has no legacy phase/group/count/cycle/action reconstruction path；it can only apply the Kernel package.
- [runtimeIdentity.test.ts](../../../tests/platform/runtimeIdentity.test.ts#L1)、[eypcPlatform.test.ts](../../../tests/platform/eypcPlatform.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) lock identity mismatch、missing Kernel and no-fallback behavior.
- [verify.md](../../specs/260810/1155-install-runtime-diagnostics/verify.md#L1) records the V4 ownership/static gates and full build identity.

## Detection Order

1. Compare Kernel、package、actions and Runtime Identity versions across canonical preload、installed mirror、Host and Renderer.
2. Require the V4 Kernel bridge and methods whenever Runtime Identity claims the V4 artifact is loaded.
3. Search production Controller/Renderer/Float for phase、group、count、cycle or capability reconstruction and legacy adapter fallback.
4. Confirm cards、dynamic groups、compact counts、ARIA、navigation and actions consume one package revision plus their selector fingerprint.
5. Verify any missing/mixed link becomes `reload-required` without inventing an empty, degraded or legacy task projection.

## Prevention Rule

Carry one end-to-end V4 Runtime Identity and semantic package revision. Kernel exclusively owns canonical state and selectors；Controller、Renderer、Float、Navigation and Actions may only consume the latest package or their named selector cache. If Kernel V4 or Runtime Identity is missing/mismatched, fail closed to `reload-required` and do not normalize or rebuild a legacy task snapshot. Ordinary hide/close/detach may retain the process hot cache, but version skew never authorizes continued legacy execution.

## Latest Applicable Implementation

[task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) publishes `companion-task-package-v4` through `getLatest/subscribe(afterRevision)`. [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) validates bridge/identity compatibility, and [codexController.ts](../../../src/runtime/codexController.ts#L1) applies that package without a local state fallback. Installed artifact identity is generated and validated by [utools-runtime-identity.mjs](../../../scripts/utools-runtime-identity.mjs#L1). The diagnostic-port mismatch remains separately owned by [codex-preload-capability-version-skew.md](codex-preload-capability-version-skew.md#L1).

## Alternative Route

- Status: `verified` for automated/static boundaries；real installed-host reload remains an acceptance gate.
- Preconditions: any process reports a missing/future/mismatched Kernel、package、actions or Runtime Identity version.
- Ordered steps: reject the incompatible bridge/package → expose `reload-required` with a bounded reason → preserve non-task settings/quota only where separately valid → wait for a normal user reload → reconnect to one V4 chain.
- Verification: missing-Kernel and mixed-identity tests fail closed；architecture scans prove Controller/Renderer cannot rebuild canonical phase/group/count/cycle；production build validator proves canonical/public/dist identity convergence.
- Applicability boundary: version/bridge skew. It does not authorize process restart、legacy normalization、identity fabrication or raw task recovery in Renderer.
- Fallback: none inside the old task-state path；a normal reload is the only supported recovery.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-29 | RAW-111 semantic revision | Badge/cards stayed at 5 while current-source anonymous evidence had one active task | Trust a structurally valid snapshot and expect long-lived layers to converge through HMR | Add an end-to-end task semantic revision | source/test contracts reported; real reload acceptance pending |
| 2026-07-29 | RAW-113 atomic package correction | The first version guard left quota but erased every task surface | Clear task data independently in Controller and Float | Preserve usable evidence in one degraded Controller package and remove Renderer-owned projection/timer | source/test contracts reported; real current/degraded transition acceptance pending |
| 2026-08-11 | RAW-160 V4 ownership rework | Legacy Controller fallback could silently diverge from Kernel selectors during a mixed install | Preserve and normalize an old Controller package | Remove production fallback and fail closed to `reload-required` when V4 Kernel/identity is unavailable | focused/full automation and build identity verified; real installed-host reload pending |
