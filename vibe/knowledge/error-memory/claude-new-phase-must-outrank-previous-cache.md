---
id: eypc-claude-new-phase-must-outrank-previous-cache
status: verified
scope: project
fingerprint: claude-phase-cache-merge__new-terminal-overwritten-by-old-running__causal-event-first-atomic-state-reduction
first_seen: 2026-08-11
last_verified: 2026-08-11
review_after: 2026-09-11
evidence:
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - preload/claude/archive.cjs
  - tests/runtime/claudeCompanionController.test.ts
  - tests/domain/companionTaskPackage.test.ts
tags:
  - claude-companion
  - phase-ordering
  - latest-state-cache
  - atomic-state
  - archive-result
---

# New Claude Phase Must Outrank Previous Cache

## Symptom

A Claude task had already ended, but EyPc could continue showing it as running. Watcher or targeted refresh briefly observed the terminal phase, then an older inventory/cache phase restored running. This also made badges and previous/next appear stale.

## Wrong Assumption

The merge treated `previous.phase` as the safe fallback even when the current session carried newer phase evidence, or compared only producer generation despite independent watcher/inventory lanes. Related fields were updated separately, permitting a mixed state.

## Verified Root Cause

Producer generation is not a universal cross-lane clock. The state reducer must compare the causal event/revision of the current session evidence and update phase, phaseRevision, statusEnteredAt, unread and capabilities as one accepted snapshot. A delayed inventory is not allowed to regress a newer watcher/open-refresh event.

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) owns `reduceClaudeTaskEvidenceV4`, including causal phase precedence.
- [preload/index.js](../../../preload/index.js#L1) routes watcher, one-second recovery and open-refresh evidence through that reducer rather than a duplicate Host phase rule.
- A confirmed Claude open records a process-local completion epoch read hint；a delayed replay of the same terminal epoch cannot restore `unread=true`, while a genuinely newer completion epoch can become unread again.
- [claudeCompanionController.test.ts](../../../tests/runtime/claudeCompanionController.test.ts#L1) and [companionTaskPackage.test.ts](../../../tests/domain/companionTaskPackage.test.ts#L1) cover running→terminal, delayed inventory and atomic visible projection.
- [archive.cjs](../../../preload/claude/archive.cjs#L1) reports only EyPc convergence and explicitly leaves native sidebar sync unconfirmed.

## Prevention Rule

Prefer the causally newer current `session.phase`; use previous phase only when the current evidence is absent or older. Never use independent producer generation as the sole cross-lane comparator. Commit phase, phase revision/time, unread and capabilities atomically through the canonical reducer, and publish only when a consumer selector changes. Treat a confirmed-open read hint as scoped to the exact terminal epoch；do not let a delayed replay undo it or let it suppress a later completion.

## Detection Order

1. Identify the event time/revision for watcher, inventory and targeted refresh evidence.
2. Compare current session evidence with the cached phase at the canonical reducer.
3. Check that all phase-dependent capabilities and groups share one package revision.
4. Replay a delayed older inventory and require zero semantic publication.
5. Keep Claude native-sidebar convergence outside phase/archive success.
6. Replay `unread=true` for the same completion after a successful open, then emit a newer completion epoch；the former stays read and the latter becomes unread.

## Latest Applicable Implementation

- Canonical Claude merge: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Watcher/inventory/open-refresh routing: [preload/index.js](../../../preload/index.js#L1).
- EyPc-only archive result: [archive.cjs](../../../preload/claude/archive.cjs#L1).
- Current Claude authority overlay: [Claude Companion spec](../../../vibe/specs/260807/claude-code-companion-authority-reset/spec.md#L1).

## Alternative Route

- Status: `verified` by RAW-160 Claude state regressions.
- Preconditions: the incoming current session carries a bounded causal event/revision or the previous cache is explicitly the only available phase evidence.
- Ordered steps: normalize current/previous evidence → reject older lane generation → compare causal event/revision → atomically accept phase/unread/capabilities → semantic selector compare → publish once or no-op.
- Verification: running→terminal publishes once；a delayed older inventory does not regress phase or publish；a genuinely newer Prompt restores running；archive result never claims native-sidebar ACK.
- Applicability boundary: Claude companion phase merge and package consumption; it does not change the D′ metadata write postcondition.
- Fallback: when causal order is unknowable, preserve the latest accepted stable phase as verifying; do not prefer an arbitrary old running cache.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Claude had ended but EyPc still showed running | Previous phase/cache overrode newer current evidence | Kernel-owned causal merge and atomic projection | affected automation verified; real host pending |
