---
id: eypc-codex-coupled-color-editor-atomicity
status: superseded
scope: project
fingerprint: codex-card-color-pair__independent-native-color-popups-or-wrong-float-editor__one-sided-validation-cannot-converge__shared-draft-whole-pair-validation-atomic-commit
first_seen: 2026-07-22
last_verified: 2026-07-30
review_after: 2027-01-22
evidence:
  - src/components/CodexCardColorDialog.vue
  - vibe/specs/260718/1148-codex-quota-float/raw-requirement.md
tags:
  - codex-companion
  - coupled-colors
  - atomic-update
  - validation
  - accessibility
---

# Historical: Coupled Color Draft Transaction

## Supersession

`RAW-071` and `RAW-129` make this record archive-only. The current product applies water-ball, expanded-card and status-signal tokens independently and directly. The active path has no color format, contrast, coupled-gamut, automatic adjustment, Controller transient preview or rollback gate. The former preview/cancel/commit Runtime actions have been removed. `CodexCardColorDialog.vue` is unmounted historical compatibility code, not an implementation route.

## Symptom

The requested card surface/foreground pair was first represented as separate native color popups, then as adjacent controls with a modal-only preview; an unrelated water main/sub editor also appeared in the desktop float. These shapes did not provide the two linked selectable boards, constrained partner gamut, in-place alternate color cards or real-companion preview/rollback the user requested.

## Wrong Assumption

Putting two single-color controls or slider groups near each other was treated as equivalent to a paired board editor. A modal sample was treated as equivalent to previewing the actual desktop companion, and the float was mistakenly treated as an editor host instead of a display-only consumer.

## Historical Root Cause

The 2026-07-22 implementation incorrectly treated the then-requested paired editor as two independent popup lifecycles. That historical correction later became obsolete when the user explicitly replaced the paired editor with independently labeled direct tokens.

## Evidence

- [raw-requirement.md](../../specs/260718/1148-codex-quota-float/raw-requirement.md#L1) records the supersession chain from the historical paired editor to RAW-071 direct persistence and RAW-129 residual cleanup.
- [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) is the active appearance workbench and does not mount the historical dialog.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) persists appearance settings directly and has no card-color preview/rollback state.

## Detection Order

1. Resolve the latest superseding RAW/Spec before recalling a historical error record.
2. Confirm whether the current fields are independent tokens or a genuinely coupled transaction.
3. Search active component mounts, Runtime actions and Controller state; historical files alone do not establish a live route.
4. Keep tests aligned with the current persistence contract instead of retaining superseded safety gates.

## Prevention Rule

Do not recall this record as a current Codex appearance rule. For the active workbench, preserve every independently labeled token and render it directly. A historical component, test or error-memory paragraph must not reintroduce validation, automatic adjustment, preview/rollback actions or atomic pair semantics after the owning RAW has superseded them.

## Alternative Route

- Status: `superseded`; no active alternative route.
- Applicability boundary: historical evidence for the 2026-07-22 paired editor only.
- Current route: follow RAW-071/129 direct persistence and the active Codex appearance workbench.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | Codex card paired-color editor | User could still open only one color at a time and the wrong water editor appeared in the float | Independent native color inputs plus immediate one-sided updates | Replaced with one HSL/HEX modal draft, whole-pair/derived validation and atomic Controller persistence; removed the float water editor | verified |
| 2026-07-22 | RAW-054 linked color boards | User clarified that two actual linked boards, constrained partner gamut, real-float preview/rollback and a clickable swatch palette were required | Slider-only modal with modal-only preview | Added two canvas boards, invalid-gamut mask, nearest-lightness coupling, in-place 12-card palette and Controller transient real-float preview/rollback; float remains display-only | verified |
| 2026-07-24 | RAW-071 appearance workbench | User reported the largest water ball reverting and rejected the coupled-card model for the current page | Reusing pair validation, adjustment and transaction semantics for independently visible water/card/status targets | Superseded the active route with three direct color zones and no color validation/rollback gate | superseded |
| 2026-07-30 | RAW-129 residual matrix closeout | Three appearance tests, Runtime preview actions and this record still described the superseded paired-validation route | Treated historical implementation evidence as a current prevention rule | Retired live preview actions, aligned tests with direct persistence and compacted this record to archive-only guidance | superseded / cleaned |
