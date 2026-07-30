---
id: eypc-codex-float-bridge-mock-contract-drift
status: verified
scope: project
fingerprint: required-runtime-contract-field__contextually-typed-ui-fixture-omits-required-member__synchronize-complete-mocks-before-validation
first_seen: 2026-07-22
last_verified: 2026-07-30
review_after: 2026-10-30
evidence:
  - src/float-env.d.ts
  - src/platform/eypcPlatform.ts
  - preload/float.js
  - tests/runtime/action.test.ts
  - tests/ui/codexCompanion.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - float-bridge
  - typescript
  - test-fixture
  - interface-contract
  - contextual-typing
---

# Runtime Contract Additions Must Reach Structurally Typed Test Fixtures

## Symptom

A user-run type check found fixtures missing fields newly required by their runtime contracts. A later recurrence produced 69 errors at once: deriving a helper from optional ambient `Window.eypcPlatform` introduced `undefined` into the service type, so valid `windows`, `app` and `files` overrides were rejected and callback parameters lost contextual typing.

## Wrong Assumption

Adding a required runtime-contract member was assumed not to require a corresponding fixture update. The shared helper also assumed an optional ambient bridge property was a safe source for a nested partial override type.

## Verified Root Cause

Production code added required members while contextually typed fixtures retained older object shapes. In the Runtime helper, `Partial<Window['eypcPlatform']>` operated on an optional property and therefore preserved an `EypcPlatformApi | undefined` union instead of describing top-level service overrides. This collapsed contextual typing and amplified one helper defect into repeated `TS2353` and `TS7006` errors. The correct boundary is the exported non-optional API contract, with a mapped partial for each service and explicit neutral values for new required archive fields.

## Evidence

- The required declaration is in [src/float-env.d.ts](../../../src/float-env.d.ts#L29).
- The production bridge exposes the capability in [preload/float.js](../../../preload/float.js#L131).
- The UI fixture now supplies the matching async mock in [tests/ui/codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L167).
- The Runtime helper derives nested overrides from the exported contract in [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L8-L22), and the authoritative service signatures remain in [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L230-L265).
- The same helper supplies the current bridge revision only for ordinary supported-window fixtures that omit it, while preserving explicit stale revisions in [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L114-L130).

## Detection Order

1. Group repeated diagnostics by the shared fixture/helper before editing individual call sites.
2. Compare the helper's source type with the exported non-optional runtime contract; inspect ambient properties for `undefined` unions.
3. Search direct fixture assignments for required fields added to the contract.
4. Model top-level services as mapped nested partials, preserve contextual callback signatures, and add behaviorally neutral values for required data fields.
5. Run typecheck first, then the full owning test file so repaired typing does not merely expose stale behavior assertions.

## Prevention Rule

Whenever a runtime contract changes, update its shared fixture factory and every complete fixture in the same change. Derive override types from the exported non-optional API, not an optional ambient host property; use mapped nested partials so callbacks remain contextually typed. Do not cast a partial fixture as the full contract or make a real member optional solely to bypass drift. Include both typecheck and the owning behavior suite.

## Alternative Route

- Status: `verified`.
- Preconditions: a TypeScript declaration or exported runtime view adds a required member.
- Ordered steps: locate the production contract; repair the shared override type; update complete fixtures with neutral required values; compare signatures; run typecheck; run the owning behavior suite.
- Verification: `pnpm exec vue-tsc --noEmit` and `pnpm exec vitest run tests/runtime/action.test.ts` complete successfully.
- Applicability boundary: structurally typed runtime/UI fixtures and helper factories; truly optional host capabilities retain their explicit optional declaration and fallback behavior.
- Fallback: if a capability can be absent at runtime, model that absence explicitly in the declaration and production fallback rather than relying on an incomplete test fixture.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-063 float image-copy follow-up | User-reported TypeScript interface assignment failure | Required `copyText` was absent from `mountFloat` | Added an async `copyText` mock matching the bridge declaration | candidate; user-owned typecheck remains pending |
| 2026-07-24 | Codex task-hotkey settings follow-up | User-reported typecheck showed incomplete `CodexRuntimeView` snapshots | Required `taskHotkeys` was absent from four settings-page snapshots | Added matching fixtures, then removed the readback contract when the feature caused a uTools host freeze | superseded by removal; see `utools-private-sync-ipc-entry-freeze.md` |
| 2026-07-30 | Runtime action fixture closeout | 69 `TS2353` / `TS7006` errors plus stale behavior assertions | Helper derived overrides from optional ambient bridge type; archive and feature/window fixtures lagged current contracts | Mapped nested partials from `EypcPlatformApi`, completed required archive data, normalized ordinary bridge fixtures, and aligned assertions with current authority | verified; typecheck and Runtime 154/154 passed |
