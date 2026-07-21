---
id: eypc-codex-task-row-action-replacement
status: superseded
scope: project
fingerprint: codex-pending-row-loses-acknowledgement__new-hide-or-archive-controls-replace-existing-action__template-rewrite-without-additive-action-matrix__eypc-codex-companion
first_seen: 2026-07-20
last_verified: 2026-07-20
review_after: 2027-01-20
evidence:
  - src/FloatApp.vue
  - tests/ui/codexCompanion.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - row-actions
  - acknowledgement
  - regression
  - superseded-requirement
---

# Superseded: Additive Task Controls Previously Preserved Acknowledgement

## Supersession

On 2026-07-20 the product requirement explicitly removed per-row and bulk acknowledgement. Hiding a completed-unread revision now serves as EyPc's viewed action, while archive is available for every non-active row. This record remains only as historical evidence that controls must be checked against the current state/action matrix; it must not restore `确认已查看` to the current UI.

## Symptom

After local hide and true archive controls were added, a pending-review row no longer rendered its existing per-row `确认已查看` action even though Runtime and Controller still supported it.

## Wrong Assumption

Rebuilding the row's trailing controls was treated as a replacement layout task instead of an additive capability change. Passing Controller tests were assumed to prove the UI action remained reachable.

## Verified Root Cause

The pending-row template added hide/archive buttons but omitted the acknowledgement button. No UI assertion enumerated the complete required action matrix after the template change.

## Evidence

- The current additive row controls are in [FloatApp.vue](../../../src/FloatApp.vue#L1).
- [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L1) verifies per-row acknowledgement, all-row hide, exact bulk revisions and second-confirmed archive independently.
- Final acceptance is recorded in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Detection Order

1. List the actions required for each task state before changing row markup.
2. Compare the rendered controls with registered Runtime actions, not only Controller methods.
3. Exercise every control from the real row state and assert its exact action ID/revision payload.
4. Confirm newly added destructive/local controls are additive unless the requirement explicitly supersedes an old action.

## Prevention Rule

Any task-row control change must maintain the current state-by-action matrix. The current matrix is open + hide for visible rows, open + restore for hidden rows, and archive for every non-authoritative-active row. Component tests must fail if a current required control disappears or if superseded acknowledgement/Pin/manual-collapse controls return.

## Alternative Route

- Status: `verified` for the historical requirement and `superseded` for current routing.
- Preconditions: a dense row is gaining, moving or conditionally showing controls.
- Ordered steps: record the current action matrix; make the smallest additive template/style change; assert accessible labels and exact dispatched payloads for each state; run focused UI plus Runtime tests.
- Verification: focused Codex UI tests and the full project suite pass with acknowledgement, hide, restore and archive controls present.
- Applicability boundary: historical EyPc Codex Companion revisions before requirement version `2026-07-20.2`. Current work must use the V2 matrix in [spec.md](../../specs/260718/1148-codex-quota-float/spec.md#L1).
- Fallback: if density cannot retain every action, move secondary actions into the existing command surface only after an explicit product decision; do not silently delete them.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-20 | Codex task hide/archive refinement | Pending row control expansion | Replaced trailing controls without checking the existing acknowledgement action | Restored accessible per-row acknowledgement and added complete UI action coverage | verified |
| 2026-07-20 | Codex task status/Tab refactor | User explicitly removed acknowledgement and made hide the viewed action | Treat the historical prevention record as immutable current product authority | Marked this record superseded and replaced the tested matrix with open/hide/restore/non-active archive | superseded |
