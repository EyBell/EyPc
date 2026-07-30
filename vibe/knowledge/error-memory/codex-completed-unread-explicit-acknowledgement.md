---
id: eypc-codex-completed-unread-explicit-acknowledgement
status: superseded
scope: project
fingerprint: codex-completed-unread-badge-or-global-command-opened-without-the-user-required-local-revision-acknowledgement__shared-command-must-acknowledge-only-the-selected-completion-revision-in-eypc__keep-waiting-input-and-generic-open-open-only__eypc-codex-companion
first_seen: 2026-07-24
last_verified: 2026-07-30
review_after: 2026-10-24
evidence:
  - user-correction
  - static-source-review
  - controlled-requirement-raw-082
  - controlled-requirement-raw-128
tags:
  - codex-companion
  - completed-unread
  - local-receipt
  - global-shortcut
  - interaction-command
---

# Explicit Completed-Unread Acknowledgement (Superseded)

## Current Resolution

RAW-128 supersedes this local-acknowledgement design. Codex Desktop live/persisted read-state is now the sole unread authority. The completed-unread compact/global command resolves the same first counted task and only opens it; EyPc no longer writes a completion-revision acknowledgement or uses one to suppress native unread. The historical sections below are retained only to explain the retired route.

## Symptom

The completed-unread compact counter could open the first task without changing its EyPc status, while the required user command should immediately show that exact completed revision as read. Reusing the same behavior for waiting-input would risk marking a task handled before input actually occurs.

## Wrong Assumption

All first-task entry points can share a generic open-only action, or every task open can be treated as acknowledgement.

## Root Cause

The product has two intentionally different user commands: waiting-input means navigation only, whereas the explicit completed-unread counter/global command means navigation plus a local user acknowledgement. Neither command authorizes a write to Codex Desktop's native unread state. The acknowledgement must therefore be scoped to the selected task's current completion revision in EyPc storage so a newer completion can become unread again.

## Correct Detection Order

1. Resolve candidates from the same complete final projection used by the displayed count, including hidden rows.
2. Apply the established pinned-first, stable display ordering and select only the first candidate.
3. If the command is waiting-input or generic task open, open without changing receipt state.
4. If the command is explicit completed-unread activation, record only the selected task's exact current completion revision in the local receipt, republish the shared projection, then open the task.
5. Confirm that no provider, Desktop IPC or global Codex state write is involved; a later completion revision must no longer match the local acknowledgement.

## Prevention Rule

Do not restore the local completion-revision acknowledgement. Completed-unread command surfaces may share one open-first action, but unread projection must consume only Codex Desktop live/persisted read-state. Legacy acknowledgement fields are ignored migration input and must never suppress native unread.

## Latest Applicable Implementation

[codex.ts](../../../src/domain/codex.ts#L1) ignores legacy completion acknowledgements during receipt normalization and projects native unread directly. [codexController.ts](../../../src/runtime/codexController.ts#L1) resolves and opens the first completed-unread task without a receipt write. [FloatApp.vue](../../../src/FloatApp.vue#L1), [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1), [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) and [plugin.json](../../../public/plugin.json#L1) dispatch the same open-first action. The acceptance boundary is in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Alternative Route

- Status: `superseded` by RAW-128.
- Preconditions: a completed-unread task has a valid completion revision and the user invokes the explicit compact or uTools global command.
- Ordered steps: resolve the same counted first task; persist its local revision acknowledgement; republish all EyPc projections; request the existing open action; keep waiting-input and generic open unchanged.
- Verification: pending user validation in uTools and Codex Desktop with multiple, pinned and hidden completed-unread tasks, then a newer completion revision.
- Applicability boundary: EyPc's local Companion presentation only; it does not change Codex Desktop native unread state.
- Fallback: if no valid completed-unread task/revision exists, show the existing unavailable message and make no receipt change.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex quota/task companion | User clarified completed-unread click/global semantics and exempted waiting-input | Reused generic open-only handling for both statuses | User correction and RAW-082 scope | Added a shared explicit local-revision acknowledgement action; kept waiting-input open-only | candidate pending runtime acceptance |
| 2026-07-30 | RAW-128 global state-chain audit | Native unread true could be hidden by an EyPc-only acknowledgement | Treated a local presentation receipt as an equal unread authority | Domain/Controller regression and full-chain source audit | Removed the write/projection override; completed-unread command is open-only and native read-state is sole authority | superseded; automated matrix verified, real host reload pending |
