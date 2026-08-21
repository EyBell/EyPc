---
id: eypc-claude-generic-session-end-must-not-overwrite-completion
status: verified
scope: project
fingerprint: claude-generic-session-end__successful-turn-overwritten-as-stopped__separate-session-lifecycle-from-turn-outcome
first_seen: 2026-08-10
last_verified: 2026-08-15
review_after: 2026-09-15
evidence:
  - preload/claude/app-state.cjs
  - preload/claude/events.cjs
  - preload/claude/code-sessions.cjs
  - preload/index.js
  - src/domain/companionTaskPackage.ts
  - tests/platform/claudeBridge.test.ts
  - tests/platform/claudeAppStateBridge.test.ts
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

The generic App log line `Stopping session` and every Hook `SessionEnd` were treated as explicit stopped Turn outcomes. The Hook reducer did not first prove that it had observed `UserPromptSubmit` for an open Turn, so a cold lifecycle sweep could manufacture stopped across unrelated historical sessions. Either lifecycle route could therefore overwrite a successful Stop/Result or suppress `completedTurns > 0` history. Unread was then applied only as a boolean decoration, so it could not recover a row whose phase had already been demoted.

## Verified Root Cause

Session teardown and Turn outcome are different authorities. The generic teardown line proves that the surrounding session is ending；a Hook SessionEnd additionally proves only lifecycle unless the same reducer already observed an open Turn。Folding either cold lifecycle signal into `stopped` destroyed stronger completion/history evidence before the final package classified unread. The fixed App grammar was also stale at `1.28929.0`, so the installed `1.30096.5` could not provide the more precise App terminal evidence needed to correct the fallback.

## Evidence

- [events.cjs](../../../preload/claude/events.cjs#L1) records every SessionEnd lifecycle time but maps it to stopped/completed only when its own state already had `turnOpen=true`；cold SessionEnd preserves unknown.
- [code-sessions.cjs](../../../preload/claude/code-sessions.cjs#L1) recognizes a lifecycle-only Hook (`session-end` + no `turnStartedAt` + unknown) as non-authoritative，so `completedTurns > 0` history may win without weakening duplicate-session ambiguity.
- [app-state.cjs](../../../preload/claude/app-state.cjs#L1) parses generic teardown as `session-end` and preserves completed/history when there is no live Turn；an observed open Turn without successful outcome becomes stopped，while same-Turn success remains completed。The fixed grammar/version gate now includes `1.30096.5` and still rejects adjacent unlisted versions.
- [preload/index.js](../../../preload/index.js#L1) applies one Claude phase decision at cold preflight, state push, unread delta and inventory mutation. Live running/waiting wins; otherwise native unread promotes history to completed, while unread=false never demotes completed.
- [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) projects the resulting phase and unread into the same card, tab, group and badge revision.
- [claudeBridge.test.ts](../../../tests/platform/claudeBridge.test.ts#L1)、[claudeAppStateBridge.test.ts](../../../tests/platform/claudeAppStateBridge.test.ts#L1) and [companionTaskPackage.test.ts](../../../tests/domain/companionTaskPackage.test.ts#L1) lock normal completion/session-end、cold lifecycle abstention、metadata history recovery、current App `1.30096.5` fixed grammar、adjacent-version rejection、completed-unread and unknown-visibility transitions. The 2026-08-15 impact-selected 7-file boundary passes `340/340` plus syntax/mirror、typecheck and 1871-module production/uTools build；real Host reload remains pending.

## Detection Order

1. Separate the observed event into session lifecycle, Turn outcome, live phase and unread membership.
2. Within one Turn, prefer explicit successful or failed/interrupted outcome over a generic lifecycle tail.
3. Apply live running/waiting before unread; apply native unread only after proving the task is not live.
4. Confirm unread=false changes only the unread dimension. It must not demote completed or synthesize stopped.
5. Verify cards, completed-unread group, completed group and badges from one final package revision.

## Prevention Rule

Never map a generic session teardown directly to a terminal business phase. Provider adapters must emit the narrow event they actually observed, then one provider-level reducer combines lifecycle, explicit Turn outcome, live phase and unread using documented precedence. SessionEnd may close as stopped only when the same source actually observed an open Turn；a cold/lifecycle-only SessionEnd is not phase authority and cannot suppress `completedTurns` history。A successful Turn remains completed through session-end；explicit failed/interrupted remains stopped。Native unread may promote any non-live history to completed-unread；clearing unread keeps completed，and only a newer live Turn reopens running。Do not repair a missing terminal signal with a TTL guess.

## Latest Applicable Implementation

- Claude event folding is owned by [app-state.cjs](../../../preload/claude/app-state.cjs#L1).
- Cross-source phase precedence and sanitized decision reasons are owned by [preload/index.js](../../../preload/index.js#L1).
- All visible consumers receive the atomic projection from [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1).

## Alternative Route

- Status: `verified` through the 2026-08-15 automated boundary；current rebuilt-host acceptance remains pending.
- Preconditions: the Provider can distinguish a generic session lifecycle tail from explicit Stop/Result failure or interruption.
- Ordered steps: parse lifecycle narrowly; fold the current Turn outcome first; apply live-state precedence; apply native unread only to non-live history; publish one final package.
- Verification: successful reply plus generic teardown remains completed；cold Hook/App SessionEnd preserves unknown/history；`completedTurns > 0` beats lifecycle-only Hook；an observed open unsuccessful Turn becomes stopped；unread=true becomes completed-unread；unread=false remains completed；newer Prompt becomes running；`1.30096.5` is accepted and an adjacent unlisted version is rejected.
- Applicability boundary: Claude App/Hook state normalization. It does not change Codex terminal-evidence rules.
- Fallback: when explicit outcome evidence is absent or contradictory, remain unknown/stopped according to the documented Provider rule; never infer completed from teardown alone.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-10 | RAW-155 state unification | Normal completed Claude replies intermittently appeared as 待继续 and completed-unread vanished | Generic `Stopping session` was parsed as stopped before native unread projection | Split `session-end` from Turn outcome, preserve successful completion and apply unread at the unified Provider boundary | verified by focused state/package tests; real uTools transition remains host-pending |
| 2026-08-15 | State-source reconciliation | One lifecycle sweep left historical Claude tasks as 待继续 while the installed App version was outside the fixed grammar gate | Treated cold Hook/App SessionEnd as a failed Turn and let it outrank metadata history | Require observed open Turn before SessionEnd can close phase，ignore lifecycle-only Hook in source selection，and gate App `1.30096.5` | affected 7-file `340/340` plus type/build passed；real uTools lifecycle sweep pending |
| 2026-08-17 | Live Claude 待继续 diagnosis | Same visible 待继续 symptom on a still-running Claude row | Not this SessionEnd path — no SessionEnd on the current Turn | Route to [StopFailure continuing-parent record](claude-stop-failure-must-not-close-continuing-parent-turn.md#L1) | distinct fingerprint; this record unchanged |
