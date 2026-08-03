---
id: eypc-codex-pending-user-request-overrides-idle-runtime
status: verified
scope: project
fingerprint: codex-desktop-pending-request__plan-confirmation-was-misclassified-after-runtime-became-idle__inspect-finite-unresolved-requests-before-terminal-projection
first_seen: 2026-07-27
last_verified: 2026-08-03
review_after: 2027-02-03
evidence:
  - user-status-correction
  - current-desktop-source-inspection
  - preload-source-fix
  - static-syntax-mirror-and-diff-check
  - current-ownerless-needs-input-host-evidence
  - bounded-rollout-and-owner-loss-regressions
tags:
  - codex-companion
  - desktop-ipc
  - plan-confirmation
  - input-required
  - status-priority
  - owner-loss
  - rollout-recovery
---

# Pending User Requests Override Idle Runtime

## Symptom

A Plan turn can finish generating while still requiring the user to confirm implementation. EyPc may briefly or persistently show that task as completed/ongoing instead of waiting-input, making the most actionable state late.

## Wrong Assumption

The bridge assumed request-derived input flags were relevant only when `threadRuntimeStatus.type` was already `active`. It therefore trusted same-batch `idle` before examining an unresolved user decision.

## Verified Root Cause

The current ChatGPT/Codex Desktop creates unresolved finite requests in `conversationState.requests`, including `item/plan/requestImplementation`, and removes them after the decision. The original projection inspected requests only inside the runtime-active branch and did not recognize the Plan method. RAW-141 found the second ownership failure: after the stream owner disappears, Desktop accepts a new follow but does not replay the current `conversationState` to that follower; App Server list/latest/full Turn omit the pending request and may expose only `notLoaded + interrupted`. For ordinary `request_user_input`, the rollout remains the only durable local evidence: an unmatched exact function call means input is pending, while the matching output or a later user message closes it.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) recognizes the exact Plan implementation request, examines unresolved requests regardless of runtime type, and promotes a recognized request to anonymous `active + waitingOnUserInput`.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) records the idle-runtime Plan-request contract, zero latest-Turn RPC and plan-content non-disclosure.
- The same Bridge contract records owner loss, sticky ordinary-input/approval/Plan shadows, ordinary-active downgrade, newer-evidence cleanup and safe rollout call/output/user-message parsing.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records RAW-093 source verification, privacy and the remaining real-host gate.
- RAW-141 current-host read-only evidence found exactly one unmatched `request_user_input` among current unarchived rollouts and exactly one native `Needs input`; the repaired source projection reports one authoritative active waiting-input without exposing the task identity or content.

## Detection Order

1. Prefer a valid, version-matched Desktop live snapshot or patch. A successful follow acknowledgement alone is not a snapshot and cannot restore an ownerless request.
2. Inspect the unresolved request list using a finite method allowlist before accepting idle/completed presentation.
3. Map exact `item/plan/requestImplementation` to `waitingOnUserInput`; map only the existing finite input/approval request families otherwise.
4. While a recognized request exists, publish the known anonymous task immediately as Desktop live active/input. For an unregistered task, retain the private shadow until verified inventory creates its anonymous identity.
5. Across owner/transport loss, retain only an already observed finite input/approval/Plan request shadow for this preload session; ordinary active must drop. Clear the shadow on a new snapshot, exact active/new Turn/completion, newer inventory revision or explicit removal.
6. When no live/sticky request exists, allow only interrupted/failed/inProgress inventory with a real rollout under `CODEX_HOME/sessions` to recover an unmatched exact `request_user_input` from a bounded tail. Matching output or later user input clears it.
7. Never infer input from arbitrary request names, plan text, `resumeState` alone, elapsed time, ordinary connector activity or rollout content.

## Prevention Rule

For live state machines, an unresolved finite user-decision request outranks an idle runtime or persisted terminal result. Classify exact live requests first; preserve only observed finite requests across soft owner loss; for ordinary `request_user_input` only, permit a bounded allowlisted rollout fallback when live replay is impossible. Publish only the anonymous business flag and require explicit newer evidence to end the override.

## Alternative Route

- Status: `verified`; current ownerless ordinary input has real-host read-only evidence and all live/sticky/rollout branches have automated contracts. Rebuilt-host Plan acceptance remains a product gate, not a failure of this prevention route.
- Preconditions: either an authenticated, version-compatible Desktop shadow already exposes a finite unresolved request, or an interrupted/failed/inProgress inventory row provides a real rollout file below `CODEX_HOME/sessions`.
- Ordered steps: project only exact request type/method; retain observed finite requests across soft owner loss; otherwise inspect only bounded rollout record metadata for unmatched `request_user_input`; publish anonymous input/approval; restore runtime/Turn projection on output, user continuation or newer state evidence.
- Verification: an idle-runtime Plan request immediately enters input without inventory RPC; owner loss preserves input/approval/Plan but not ordinary active; unresolved/resolved rollout cases project correctly; content/raw identity do not cross the bridge; unknown methods do not create input.
- Applicability boundary: this rule does not turn an ordinary completed Plan message, `resumeState`, unread flag, connector activity, arbitrary rollout call or text into waiting-input. Plan has no confirmed durable rollout fallback and depends on exact/sticky Desktop evidence.
- Fallback: if neither exact/sticky Desktop authority nor the safe ordinary-input rollout evidence exists, keep the conservative ongoing/terminal rules and wait for verified provider state.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-093 Plan confirmation input | User clarified that completed Plan awaiting confirmation is waiting-input and must update fastest | Request flags were read only under runtime active, and the Plan method was not recognized | Added exact Plan-request mapping and unresolved-request priority over idle runtime; synchronized source/test/authority contracts | candidate; static source checks pass, real Desktop/uTools transition pending |
| 2026-08-03 | RAW-141 ownerless current input | Native Codex showed one long-lived `Needs input` while EyPc showed ongoing | Assumed refollow would replay current request; dropped every shadow on owner loss and trusted App Server latest Turn, which omitted the request | Kept finite observed request shadows across soft owner loss, preserved Desktop observation across non-kill hiding, and added bounded exact `request_user_input` rollout fallback | verified by unique current-host evidence, focused 170/170, full workspace 737/737 and isolated commit 711/711 plus type/build/runtime gates; rebuilt uTools display pending |
