---
id: eypc-typescript-async-closure-release-narrows-to-never
status: verified
scope: project
fingerprint: nullable-release-callback-assigned-only-inside-async-closure__typescript-retains-initial-null__optional-call-narrows-to-never__use-callable-gate-plus-explicit-pending-signal
first_seen: 2026-07-31
last_verified: 2026-07-31
review_after: 2026-10-31
evidence:
  - tests/runtime/codexController.test.ts
tags:
  - typescript
  - vue-tsc
  - test-fixture
  - async
  - deferred-promise
---

# Async Test Release Callbacks Must Be Callable Before Closure Assignment

## Symptom

`pnpm run typecheck` failed in [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1532) with `TS2349: This expression is not callable. Type 'never' has no call signatures` at an optional call to a nullable release callback.

## Wrong Assumption

The fixture assumed that assigning the callback inside a later async Promise executor, waiting one event-loop turn and asserting `not.toBeNull()` would narrow the outer variable for TypeScript.

## Verified Root Cause

TypeScript control-flow analysis cannot prove that a nested async callback executes before the later call. From the containing function's static path, the variable may still be its initial `null`; optional-call property access therefore narrows the unreachable callable branch to `never`. A test assertion changes runtime evidence but is not a TypeScript assertion function.

## Detection Order

1. Inspect the declaration and every assignment of the `never` callable.
2. Check whether all non-null assignments occur only inside a nested or async callback.
3. Separate the runtime “request reached the gate” signal from the release function's callable type.
4. Initialize the release function to a safe no-op, set an explicit pending boolean when the awaited gate is entered, assert that boolean, then invoke the callback normally.
5. Run the same typecheck command that produced the diagnostic; run the owning behavior test separately when its execution is authorized.

## Prevention Rule

Do not model an async test gate as `(() => void) | null` when the only callable assignment happens in a nested callback. Keep the release handle callable from declaration time and use a separate observable signal to prove that the async path reached the gate. Do not use `as`, non-null assertions or optional chaining to suppress the diagnostic.

## Alternative Route

- Status: `verified` for the TypeScript gate.
- Preconditions: a test needs to hold an async result until newer evidence is injected.
- Ordered steps: create a callable no-op release handle; set a pending signal and replace the handle inside the Promise executor; wait until pending; inject the competing event; release; await the held operation.
- Verification: `pnpm run typecheck` completes successfully. The owning Vitest case remains a separate behavioral gate.
- Applicability boundary: local test synchronization helpers; production cancellation and concurrency primitives require their own lifecycle/error contract.
- Fallback: use a reusable synchronously constructed deferred helper when several tests need the same pattern.

## Occurrence History

| Date | Task | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-31 | Codex Controller reverse-generation barrier | User-run `vue-tsc --noEmit` reported TS2349 | Nullable release callback assigned only inside the pending snapshot callback | Callable no-op handle plus explicit `olderSnapshotPending` signal | verified; typecheck passed, behavior test not run |
