---
id: eypc-codex-float-bridge-mock-contract-drift
status: candidate
scope: project
fingerprint: codex-float-bridge-typecheck__required-copy-capability-added-to-window-contract__contextually-typed-ui-mock-omits-capability__synchronize-complete-bridge-mocks-before-validation
first_seen: 2026-07-22
last_verified: 2026-07-22
review_after: 2026-08-22
evidence:
  - src/float-env.d.ts
  - preload/float.js
  - tests/ui/codexCompanion.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - float-bridge
  - typescript
  - test-fixture
  - interface-contract
---

# Required Float Bridge Capabilities Must Reach Typed Test Mocks

## Symptom

A user-run type check found that the `mountFloat` test fixture could not be assigned to `Window['eypcFloat']` after a required copy capability was added to the floating bridge.

## Wrong Assumption

Adding a required method to the production bridge declaration was assumed not to require a corresponding update to every test fixture that constructs the complete bridge object.

## Candidate Root Cause

The floating preload exposed `copyText`, and the global declaration made it required, while the contextually typed `mountFloat` fixture initially omitted that property.

## Evidence

- The required declaration is in [src/float-env.d.ts](../../../src/float-env.d.ts#L29).
- The production bridge exposes the capability in [preload/float.js](../../../preload/float.js#L131).
- The UI fixture now supplies the matching async mock in [tests/ui/codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L167).
- The active validation status and remaining user-owned typecheck gate are in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L21).

## Detection Order

1. Classify the error as a complete-interface assignment failure rather than a production copy-path failure.
2. Compare the required `Window['eypcFloat']` declaration with the preload exposure.
3. Search every direct test assignment or factory for `window.eypcFloat`.
4. Add an async mock with the declared return type; do not weaken the production method to optional solely to satisfy a test.
5. Run the user-owned typecheck before promoting this record to `verified`.

## Prevention Rule

Whenever a required floating-bridge method is added, update every complete, contextually typed bridge fixture in the same change and include typecheck in the selected validation scope. Do not cast a partial fixture as the full bridge or make a real capability optional only to bypass fixture drift.

## Alternative Route

- Status: `candidate`; the corrective fixture exists, but this follow-up did not rerun typecheck.
- Preconditions: a TypeScript declaration adds a required `Window['eypcFloat']` method.
- Ordered steps: locate production exposure; locate all full bridge fixtures; add a behaviorally neutral async mock; compare declaration and mock signatures; run the selected typecheck.
- Verification: the user-run typecheck completes without this interface-assignment failure.
- Applicability boundary: complete floating-bridge fixtures only; truly optional host capabilities retain their explicit optional declaration and fallback behavior.
- Fallback: if a capability can be absent at runtime, model that absence explicitly in the declaration and production fallback rather than relying on an incomplete test fixture.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-063 float image-copy follow-up | User-reported TypeScript interface assignment failure | Required `copyText` was absent from `mountFloat` | Added an async `copyText` mock matching the bridge declaration | candidate; user-owned typecheck remains pending |
