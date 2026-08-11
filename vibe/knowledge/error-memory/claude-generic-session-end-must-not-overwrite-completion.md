---
id: eypc-claude-generic-session-end-must-not-overwrite-completion
status: verified
scope: project
fingerprint: claude-generic-session-end__successful-turn-overwritten-as-stopped__separate-session-lifecycle-from-turn-outcome
first_seen: 2026-08-10
last_verified: 2026-08-10
review_after: 2026-09-10
evidence:
  - preload/claude/app-state.cjs
  - preload/index.js
  - src/domain/companionTaskPackage.ts
  - tests/platform/claudeBridge.test.ts
  - tests/domain/companionTaskPackage.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - claude-companion
  - session-end
  - completed-unread
  - state-precedence
  - provider-boundary
---

# Generic Claude Session End Must Not Overwrite Turn Completion

## Symptom

A normal Claude reply could briefly finish and then appear as “待继续”, or disappear from “已完成未读”. The same task could fail to enter completed-unread even though Claude's native unread set contained it.

## Wrong Assumption

The generic App log line `Stopping session` was treated as an explicit stopped Turn outcome. A session lifecycle event was therefore allowed to overwrite a more specific successful Stop/Result from the same Turn. Unread was then applied only as a boolean decoration, so it could not recover a non-live history row whose phase had already been demoted.

## Verified Root Cause

Session teardown and Turn outcome are different authorities. The generic teardown line proves that the surrounding session is ending; it does not say the Turn failed or was interrupted. Folding both into `stopped` destroyed the stronger completion evidence before the final package classified unread.

## Evidence

- [app-state.cjs](../../../preload/claude/app-state.cjs#L1) parses generic teardown as `session-end` and preserves completed when the current Turn already has a successful Stop/Result. Explicit failed/interrupted evidence and teardown without a successful outcome still close as stopped.
- [preload/index.js](../../../preload/index.js#L1) applies one Claude phase decision at cold preflight, state push, unread delta and inventory mutation. Live running/waiting wins; otherwise native unread promotes history to completed, while unread=false never demotes completed.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) projects the resulting phase and unread into the same card, tab, group and badge revision.
- [claudeBridge.test.ts](../../../tests/platform/claudeBridge.test.ts#L1) and [companionTaskPackage.test.ts](../../../tests/domain/companionTaskPackage.test.ts#L1) lock the normal completion/session-end, completed-unread and unknown-visibility transitions. The current focused boundary passes `303/303` tests.

## Detection Order

1. Separate the observed event into session lifecycle, Turn outcome, live phase and unread membership.
2. Within one Turn, prefer explicit successful or failed/interrupted outcome over a generic lifecycle tail.
3. Apply live running/waiting before unread; apply native unread only after proving the task is not live.
4. Confirm unread=false changes only the unread dimension. It must not demote completed or synthesize stopped.
5. Verify cards, completed-unread group, completed group and badges from one final package revision.

## Prevention Rule

Never map a generic session teardown directly to a terminal business phase. Provider adapters must emit the narrow event they actually observed, then one provider-level reducer combines lifecycle, explicit Turn outcome, live phase and unread using documented precedence. A successful Turn remains completed through session-end; explicit failed/interrupted or a session-end with no successful outcome may become stopped. Native unread may promote any non-live history to completed-unread; clearing unread keeps completed, and only a newer live Turn reopens running.

## Latest Applicable Implementation

- Claude event folding is owned by [app-state.cjs](../../../preload/claude/app-state.cjs#L1).
- Cross-source phase precedence and sanitized decision reasons are owned by [preload/index.js](../../../preload/index.js#L1).
- All visible consumers receive the atomic projection from [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1).

## Alternative Route

- Status: `verified`.
- Preconditions: the Provider can distinguish a generic session lifecycle tail from explicit Stop/Result failure or interruption.
- Ordered steps: parse lifecycle narrowly; fold the current Turn outcome first; apply live-state precedence; apply native unread only to non-live history; publish one final package.
- Verification: successful reply plus generic teardown remains completed; unread=true becomes completed-unread; unread=false remains completed; newer Prompt becomes running; explicit interrupted/failed becomes stopped.
- Applicability boundary: Claude App/Hook state normalization. It does not change Codex terminal-evidence rules.
- Fallback: when explicit outcome evidence is absent or contradictory, remain unknown/stopped according to the documented Provider rule; never infer completed from teardown alone.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-10 | RAW-155 state unification | Normal completed Claude replies intermittently appeared as 待继续 and completed-unread vanished | Generic `Stopping session` was parsed as stopped before native unread projection | Split `session-end` from Turn outcome, preserve successful completion and apply unread at the unified Provider boundary | verified by focused state/package tests; real uTools transition remains host-pending |
