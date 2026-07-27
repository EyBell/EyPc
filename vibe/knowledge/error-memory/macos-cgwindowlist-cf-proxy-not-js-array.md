---
id: eypc-macos-cgwindowlist-cf-proxy-not-js-array
status: verified
scope: project
fingerprint: window-jump-only-saved-targets__cgwindowlist-nonempty-cf-proxy__direct-deepunwrap-not-js-array__cast-ref-before-unwrapping
first_seen: 2026-07-26
last_verified: 2026-07-26
review_after: 2026-10-26
evidence:
  - preload/index.js
  - public/preload.js
  - vibe/specs/260724/1527-window-jump-workbench/tasks.md
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - windows
  - macos
  - coregraphics
  - jxa
  - enumeration
---

# CGWindowList CoreFoundation Proxy Is Not a JavaScript Array

## Symptom

Window Jump loads no live macOS rows and therefore appears to contain only already saved favorites or stable-slot targets. The enumeration path throws no useful error and may report a granted capability.

## Wrong Assumption

Passing the CoreFoundation value returned by `CGWindowListCopyWindowInfo` directly to `ObjC.deepUnwrap` always produces a JavaScript array suitable for `Array.isArray` and `for ... of`.

## Verified Root Cause

In the affected JXA runtime, `CGWindowListCopyWindowInfo` returned a callable Objective-C/CoreFoundation proxy with hundreds of native records. Direct `ObjC.deepUnwrap` preserved a proxy-shaped value, so `Array.isArray` was false and the adapter replaced the complete inventory with `[]`. Casting the reference through `ObjC.castRefToObject` before `ObjC.deepUnwrap` produced a real JavaScript array.

There was no exact native exception text: the failure was a silent type/shape mismatch followed by the adapter's empty-array fallback.

## Correct Detection Order

1. Run the exact embedded JXA inventory read-only and record only aggregate count, distinct-application count, duration, and result status.
2. If the result is empty, inspect the returned value's type, native count, and `Array.isArray` result without logging titles, PIDs, or native references.
3. Cast the CoreFoundation reference with `ObjC.castRefToObject`, then apply `ObjC.deepUnwrap` and re-check the array shape.
4. Filter to live regular applications and valid positive window numbers; exclude the host and parent processes.
5. If CG still fails or has no titled rows, query only foreground application processes through the AX fallback and classify authorization separately.

## Prevention Rule

Every JXA `CGWindowListCopyWindowInfo` adapter must use `ObjC.deepUnwrap(ObjC.castRefToObject(value))`; never treat an empty result after direct unwrap as evidence that the desktop has no windows. A failed or empty CG inventory must enter the bounded AX fallback, not return a final granted empty list. Keep `preload/index.js` and `public/preload.js` byte-identical.

## Latest Implementation

- `preload/index.js`: CG cast/unwrap, regular-application/native-number validation, host exclusion, and foreground-process AX fallback.
- `public/preload.js`: canonical preload mirror.

## Alternative Route

- Status: `verified`
- Preconditions: macOS JXA can invoke CoreGraphics; the operation is read-only and the user has authorized local enumeration.
- Steps: cast the CF reference; deep-unwrap; validate a real array; retain actionable regular-app rows; fall back to `applicationProcesses.whose({ backgroundOnly: false })` only when CG is failed/empty.
- Verification: the exact source scripts completed locally on 2026-07-26; CG returned 22 actionable rows across 14 applications in 159 ms, and AX fallback returned 13 rows across 10 applications in 2432 ms. No title, application name, PID, or native reference was emitted or persisted.
- Applicability boundary: macOS JXA window inventory. Activation, close, termination, permission mutation, and cross-Space completeness were not exercised.
- Fallback: surface the appropriate Screen Recording or Accessibility/Automation requirement when both inventories fail.

## Occurrence History

| Occurrence | Task | Trigger | Failed route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-26 | Window Jump Workbench WJ-07 | User reported only previously saved rows | Direct `deepUnwrap` followed by `Array.isArray` | Aggregate-only exact local enumeration | Cast CF reference before unwrap; bound AX query to foreground processes | Verified read-only enumeration; host UI remains user-validation pending |
