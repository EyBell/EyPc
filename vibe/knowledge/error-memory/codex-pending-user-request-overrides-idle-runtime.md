---
id: eypc-codex-pending-user-request-overrides-idle-runtime
status: candidate
scope: project
fingerprint: codex-desktop-pending-request__plan-confirmation-was-misclassified-after-runtime-became-idle__inspect-finite-unresolved-requests-before-terminal-projection
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: 2026-08-27
evidence:
  - user-status-correction
  - current-desktop-source-inspection
  - preload-source-fix
  - static-syntax-mirror-and-diff-check
tags:
  - codex-companion
  - desktop-ipc
  - plan-confirmation
  - input-required
  - status-priority
---

# Pending User Requests Override Idle Runtime

## Symptom

A Plan turn can finish generating while still requiring the user to confirm implementation. EyPc may briefly or persistently show that task as completed/ongoing instead of waiting-input, making the most actionable state late.

## Wrong Assumption

The bridge assumed request-derived input flags were relevant only when `threadRuntimeStatus.type` was already `active`. It therefore trusted same-batch `idle` before examining an unresolved user decision.

## Verified Root Cause

The current ChatGPT/Codex Desktop creates an unresolved `item/plan/requestImplementation` in `conversationState.requests` when a completed Plan awaits user confirmation, and removes it after the decision. The prior [preload projection](../../../preload/index.js#L1) inspected requests only inside the runtime-active branch and did not recognize this finite method.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) recognizes the exact Plan implementation request, examines unresolved requests regardless of runtime type, and promotes a recognized request to anonymous `active + waitingOnUserInput`.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) records the idle-runtime Plan-request contract, zero latest-Turn RPC and plan-content non-disclosure.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records RAW-093 source verification, privacy and the remaining real-host gate.

## Detection Order

1. Require a valid, version-matched Desktop live snapshot or patch; connector state and task text are not input authority.
2. Inspect the unresolved request list using a finite method allowlist before accepting idle/completed presentation.
3. Map exact `item/plan/requestImplementation` to `waitingOnUserInput`; map only the existing finite input/approval request families otherwise.
4. While a recognized request exists, publish the known anonymous task immediately as Desktop live active/input. For an unregistered task, retain the private shadow until verified inventory creates its anonymous identity.
5. When the request is removed, return to current runtime/Turn evidence and the normal completion/stop guards.
6. Never infer input from arbitrary request names, plan text, `resumeState` alone, elapsed time or connector activity.

## Prevention Rule

For live state machines, an unresolved finite user-decision request outranks an idle runtime or persisted terminal result. Classify the request by exact protocol identity, publish only the anonymous business flag, and let request removal end the override.

## Alternative Route

- Status: `candidate`; current Desktop source and static implementation contracts are verified, while a real Plan completion/confirmation transition is not yet exercised.
- Preconditions: an authenticated, version-compatible Desktop live shadow provides runtime status and unresolved requests.
- Ordered steps: project only request type/method; match the finite allowlist; promote recognized requests to live input/approval; emit a known task directly or await verified anonymous registration; restore runtime/Turn projection on request removal.
- Verification: an idle-runtime Plan request immediately enters input without inventory RPC; plan content/raw identity do not cross the bridge; removing the request removes the override; unknown methods do not create input.
- Applicability boundary: this rule does not turn an ordinary completed Plan message, `resumeState`, unread flag, connector activity or unknown request into waiting-input.
- Fallback: if Desktop live authority is absent or incompatible, keep the existing conservative ongoing/terminal evidence rules and wait for verified provider state.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-093 Plan confirmation input | User clarified that completed Plan awaiting confirmation is waiting-input and must update fastest | Request flags were read only under runtime active, and the Plan method was not recognized | Added exact Plan-request mapping and unresolved-request priority over idle runtime; synchronized source/test/authority contracts | candidate; static source checks pass, real Desktop/uTools transition pending |
