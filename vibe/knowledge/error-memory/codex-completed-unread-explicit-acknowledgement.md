---
id: eypc-codex-completed-unread-explicit-acknowledgement
status: candidate
scope: project
fingerprint: codex-completed-unread-badge-or-global-command-opened-without-the-user-required-local-revision-acknowledgement__shared-command-must-acknowledge-only-the-selected-completion-revision-in-eypc__keep-waiting-input-and-generic-open-open-only__eypc-codex-companion
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2026-10-24
evidence:
  - user-correction
  - static-source-review
  - controlled-requirement-raw-082
tags:
  - codex-companion
  - completed-unread
  - local-receipt
  - global-shortcut
  - interaction-command
---

# Explicit Completed-Unread Acknowledgement Must Stay Narrow

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

Use one Runtime action for every explicit completed-unread command surface, and keep that action distinct from generic open and waiting-input open. Projection must consume the local acknowledgement only as an EyPc presentation override for an equal-or-older completion revision; it must never become native unread authority or suppress a newer completion revision.

## Latest Applicable Implementation

[codex.ts](../../../src/domain/codex.ts#L1) persists and projects the local completion-revision acknowledgement. [codexController.ts](../../../src/runtime/codexController.ts#L1) resolves the pinned-first target, republishes the projection and opens it. [FloatApp.vue](../../../src/FloatApp.vue#L1), [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1), [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) and [plugin.json](../../../public/plugin.json#L1) dispatch the same action. The acceptance boundary is in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Alternative Route

- Status: `candidate`.
- Preconditions: a completed-unread task has a valid completion revision and the user invokes the explicit compact or uTools global command.
- Ordered steps: resolve the same counted first task; persist its local revision acknowledgement; republish all EyPc projections; request the existing open action; keep waiting-input and generic open unchanged.
- Verification: pending user validation in uTools and Codex Desktop with multiple, pinned and hidden completed-unread tasks, then a newer completion revision.
- Applicability boundary: EyPc's local Companion presentation only; it does not change Codex Desktop native unread state.
- Fallback: if no valid completed-unread task/revision exists, show the existing unavailable message and make no receipt change.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex quota/task companion | User clarified completed-unread click/global semantics and exempted waiting-input | Reused generic open-only handling for both statuses | User correction and RAW-082 scope | Added a shared explicit local-revision acknowledgement action; kept waiting-input open-only | candidate pending runtime acceptance |
