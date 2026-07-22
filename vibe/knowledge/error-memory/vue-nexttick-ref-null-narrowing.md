---
id: eypc-vue-nexttick-ref-null-narrowing
status: verified
scope: project
fingerprint: vue-nexttick-ref-null-narrowing__optional-chain-does-not-stabilize-ref__repeated-reactive-access-in-async-callback__capture-local-state-and-guard
first_seen: 2026-07-22
last_verified: 2026-07-22
review_after: 2027-01-22
evidence:
  - src/FloatApp.vue
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - vue
  - typescript
  - nexttick
  - nullable-ref
  - typecheck
---

# Vue nextTick Ref Null Narrowing

## Symptom

`vue-tsc --noEmit` reported TS18047 when a `nextTick` callback used optional chaining for one read of a nullable Vue `ref` and then dereferenced the same `.value` again on the next statement.

## Wrong Assumption

The optional-chain read was assumed to prove that the reactive value remained non-null for subsequent expressions in the asynchronous callback.

## Verified Root Cause

A mutable `ref.value` can change between accesses, so TypeScript does not preserve narrowing across repeated property reads. The callback also legitimately permits the composer to close before it runs.

## Evidence

- [FloatApp.vue](../../../src/FloatApp.vue#L1) captures `composer.value` once as local `state`, returns when null, and uses that stable reference for option lookup and index correction.
- [verify.md](../../../vibe/specs/260718/1148-codex-quota-float/verify.md#L1) records the successful project typecheck after the correction.

## Detection Order

1. Locate nullable reactive state used inside `nextTick`, timers, promises or event callbacks.
2. Check for repeated `.value` access after optional chaining or a condition on a previous access.
3. Decide whether the callback may validly run after the layer closes.
4. Capture one local value, guard it once, and use only the local reference inside that synchronous callback body.
5. Run the project typecheck.

## Prevention Rule

Inside asynchronous Vue callbacks, never rely on one `ref.value` access to narrow a later access. Capture the current value into a local constant, return when null, and use the stable local object for the remaining synchronous work.

## Alternative Route

- Status: `verified`.
- Preconditions: a nullable Vue `ref` is read more than once inside one asynchronous callback.
- Ordered steps: capture `.value` once; guard null; derive child values from the local; mutate the local object only while the callback remains synchronous; keep later DOM focus optional.
- Verification: `pnpm run typecheck` exits successfully.
- Applicability boundary: applies to stable work within one callback invocation; it must not be used when the latest reactive value is intentionally required after another await.
- Fallback: if freshness is required, reread `.value` after the await and perform a new explicit null guard.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-058 follow-up typecheck | User supplied two TS18047 errors in the composer project-picker `nextTick` callback | Optional-chain one access, then repeatedly dereference nullable `composer.value` | Captured local `state`, guarded null and reused its options/index | verified; project typecheck passed |
