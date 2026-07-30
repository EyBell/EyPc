---
id: eypc-typescript-number-isfinite-optional-narrowing
status: candidate
scope: project
fingerprint: optional-completion-revision-number-isfinite-does-not-narrow__runtime-validator-used-as-typescript-guard__completed-unread-local-receipt
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2026-10-24
evidence:
  - user-supplied-compiler-diagnostic
  - static-source-review
  - whitespace-diff-check
tags:
  - typescript
  - optional-number
  - completion-revision
  - number-isfinite
  - codex-companion
---

# Number.isFinite Does Not Narrow an Optional Revision

## Symptom

The explicit completed-unread action passed an optional completion revision through `Number.isFinite`, then used it where the local receipt API requires a `number`.

## Wrong Assumption

A runtime finite-number check was assumed to narrow an optional property for later TypeScript expressions.

## Verified Root Cause

`Number.isFinite` returns a boolean but is not a TypeScript type predicate. The property can therefore remain `number | undefined` even after the runtime check succeeds.

## Evidence

- The historical [codexController.ts](../../../src/runtime/codexController.ts#L1) occurrence captured the optional revision once and explicitly verified `typeof completionRevision === 'number'` before applying finite/positive guards. RAW-128 later removed that local-acknowledgement path; the TypeScript narrowing rule remains generally applicable.
- The user-supplied compiler diagnostic and source review identified the optional value passed to the receipt function.

## Detection Order

1. Find an optional numeric property used by a function that requires `number`.
2. Check whether preceding validation is a TypeScript type predicate rather than only a runtime boolean.
3. Capture the value once into a local constant.
4. Guard its primitive type before finite and domain-range checks.
5. Preserve the existing invalid-input fallback without changing local receipt state.

## Prevention Rule

When an optional numeric value must be passed to a strict numeric API, do not rely on `Number.isFinite` for type narrowing. Capture it locally, guard `typeof value === 'number'`, then apply finite and range checks.

## Latest Applicable Implementation

The originating completed-unread acknowledgement implementation was removed by RAW-128. Apply this rule at the next optional-number boundary rather than restoring that retired product path.

## Alternative Route

- Status: `candidate`.
- Preconditions: an optional numeric field crosses from a UI/controller branch into a strict numeric API.
- Ordered steps: capture the field once; reject non-numbers; apply finite and domain checks; pass the narrowed local value; preserve the current fallback.
- Verification: project typecheck and the completed-unread action path remain pending user execution.
- Applicability boundary: optional numeric values in TypeScript; this does not replace validation of an external untyped boundary.
- Fallback: if the value is absent or invalid, return through the established unavailable path without persisting a receipt.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex completed-unread acknowledgement | Compiler diagnostic on an optional completion revision | Used `Number.isFinite` as the only narrowing condition | Captured the revision and added an explicit primitive-type guard before existing finite/positive checks | candidate; typecheck remains user-owned |
| 2026-07-30 | RAW-128 unread-authority cleanup | Local completion acknowledgement was removed | Leaving the implementation pointer as current could revive a retired product route | Marked the occurrence historical while retaining the general TypeScript rule | superseded implementation; generic candidate remains |
