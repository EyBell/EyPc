---
id: eypc-codex-float-bridge-mock-contract-drift
status: candidate
scope: project
fingerprint: required-runtime-contract-field__contextually-typed-ui-fixture-omits-required-member__synchronize-complete-mocks-before-validation
first_seen: 2026-07-22
last_verified: 2026-07-24
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

# Required Runtime Contract Additions Must Reach Typed Test Fixtures

## Symptom

A user-run type check found complete UI fixtures missing fields newly required by their runtime contracts. The surviving occurrence is the floating-bridge copy capability; the later task-hotkey readback contract was removed after it caused a uTools host freeze.

## Wrong Assumption

Adding a required runtime-contract member was assumed not to require a corresponding update to every test fixture that constructs the complete object.

## Candidate Root Cause

Production code added a required member while one or more contextually typed test fixtures retained an older object shape. TypeScript correctly rejects the incomplete fixture rather than weakening the production contract.

## Evidence

- The required declaration is in [src/float-env.d.ts](../../../src/float-env.d.ts#L29).
- The production bridge exposes the capability in [preload/float.js](../../../preload/float.js#L131).
- The UI fixture now supplies the matching async mock in [tests/ui/codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L167).
- The active validation status and remaining user-owned typecheck gate are in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L21).

## Detection Order

1. Classify the error as a complete-interface assignment failure rather than a production runtime-path failure.
2. Compare the required runtime type with its production source.
3. Search every direct test assignment or factory for the complete object.
4. Add a behaviorally neutral fixture value with the declared type; do not weaken the production member to optional solely to satisfy a test.
5. Run the user-owned typecheck before promoting this record to `verified`.

## Prevention Rule

Whenever a required runtime-contract field is added, update every complete, contextually typed fixture in the same change and include typecheck in the selected validation scope. Do not cast a partial fixture as the full contract or make a real member optional only to bypass fixture drift.

## Alternative Route

- Status: `candidate`; the corrective fixture exists, but this follow-up did not rerun typecheck.
- Preconditions: a TypeScript declaration or exported runtime view adds a required member.
- Ordered steps: locate the production contract; locate all complete fixtures; add a behaviorally neutral declared value; compare signatures; run the selected typecheck.
- Verification: the user-run typecheck completes without this interface-assignment failure.
- Applicability boundary: complete, contextually typed runtime fixtures only; truly optional host capabilities retain their explicit optional declaration and fallback behavior.
- Fallback: if a capability can be absent at runtime, model that absence explicitly in the declaration and production fallback rather than relying on an incomplete test fixture.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-063 float image-copy follow-up | User-reported TypeScript interface assignment failure | Required `copyText` was absent from `mountFloat` | Added an async `copyText` mock matching the bridge declaration | candidate; user-owned typecheck remains pending |
| 2026-07-24 | Codex task-hotkey settings follow-up | User-reported typecheck showed incomplete `CodexRuntimeView` snapshots | Required `taskHotkeys` was absent from four settings-page snapshots | Added matching fixtures, then removed the readback contract when the feature caused a uTools host freeze | superseded by removal; see `utools-private-sync-ipc-entry-freeze.md` |
