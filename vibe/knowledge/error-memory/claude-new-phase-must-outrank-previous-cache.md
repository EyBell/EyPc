---
id: eypc-claude-new-phase-must-outrank-previous-cache
status: verified
scope: project
fingerprint: claude-phase-cache-merge__new-terminal-overwritten-by-old-running__causal-event-first-atomic-state-reduction
first_seen: 2026-08-11
last_verified: 2026-08-26
review_after: 2026-09-11
evidence:
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - preload/claude/app-state.cjs
  - preload/claude/index.cjs
  - preload/claude/archive.cjs
  - tests/platform/claudeAppStateBridge.test.ts
  - tests/platform/claudeBridge.test.ts
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

RAW-165 adds the unread-side instance of the same error: Claude completion/focus may be live immediately while `epitaxy-unread-v1` reaches LevelDB seconds later. Treating each later LevelDB read as globally newer lets stale true/false overwrite the live edge. The exact completion and `[CCD] LocalSessions.setFocusedSession` stream therefore owns a bounded process-private hot unread revision；LevelDB is the cold/recovery baseline and may acknowledge a hint only after a fresh snapshot catches up.

RAW-166 closes the corresponding known/value split. An exact unread snapshot previously updated `unread` in the Host incremental path without necessarily setting `unreadKnown=true`，and a newly admitted Claude session could inherit the same partial value。That left an exact false value indistinguishable from unknown。The current route admits known/value together for both unread and inventory deltas；an unavailable source abstains and preserves the previous trusted lane。

2026-08-26 的 V7 recurrence 有两条同源缺口：Claude metadata mutation 把 delivery generation 写进 activity/interaction/unread，令真实较小 state generation 永久判旧；同时 `1.37937.0` 的固定 `CycleHealth api_error` 额度耗尽行未被解析，后续 focus 又错误续写 phase revision。前者可保留旧 running，后者可保留旧 completed/running；两者都不是 Renderer 分组问题。

## Evidence

- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) owns `reduceClaudeTaskEvidenceV4`, including causal phase precedence.
- [preload/index.js](../../../preload/index.js#L1) routes watcher, one-second recovery and open-refresh evidence through that reducer rather than a duplicate Host phase rule.
- A confirmed Claude open records a process-local completion epoch read hint；a delayed replay of the same terminal epoch cannot restore `unread=true`, while a genuinely newer completion epoch can become unread again.
- [app-state.cjs](../../../preload/claude/app-state.cjs#L1) folds only live exact completion/focus into bounded hot unread hints；cold replay establishes focus but does not fabricate unread，and same-second order uses monotonic hint revision.
- [index.cjs](../../../preload/claude/index.cjs#L1) merges the LevelDB baseline with newer hot hints and wakes unread subscribers from the shared App watcher even without a state subscriber.
- [claudeCompanionController.test.ts](../../../tests/runtime/claudeCompanionController.test.ts#L1) and [companionTaskPackage.test.ts](../../../tests/domain/companionTaskPackage.test.ts#L1) cover running→terminal, delayed inventory and atomic visible projection.
- [archive.cjs](../../../preload/claude/archive.cjs#L1) reports only EyPc convergence and explicitly leaves native sidebar sync unconfirmed.

## Prevention Rule

Prefer the causally newer current `session.phase`; use previous phase only when the current evidence is absent or older. Never use independent producer generation or persistence read time as the sole cross-lane comparator. Membership mutation must carry indexed metadata only and preserve the activity/interaction/unread/topology waterlines；state correlation runs separately。Commit phase, phase revision/time, unread-known/value and capabilities atomically through the canonical reducer, and publish only when a consumer selector changes. An exact unread snapshot must establish both `unreadKnown=true` and its boolean value；unknown/unavailable must abstain instead of clearing a trusted value。Treat confirmed-open and live completion/focus unread hints as bounded exact edges；do not let delayed LevelDB/replay undo them or let them suppress a later completion. Focus is unread-only and cannot renew phase。A fixed usage-limit error is an explicit interrupted Turn；cold replay may restore that terminal truth but must not fabricate hot unread from historical log lines.

## Detection Order

1. Identify the event time/revision for watcher, inventory and targeted refresh evidence.
2. Compare current session evidence with the cached phase at the canonical reducer.
3. Check that all phase-dependent capabilities and groups share one package revision.
4. Replay a delayed older inventory and require zero semantic publication.
5. Keep Claude native-sidebar convergence outside phase/archive success.
6. Replay `unread=true` for the same completion after a successful open, then emit a newer completion epoch；the former stays read and the latter becomes unread.
7. Delay LevelDB behind live completion/focus，including same-second running→completion；the hot result must publish immediately and remain stable until a fresh persisted snapshot catches up.
8. Feed an exact empty unread set through both an existing task and a newly admitted session；both must become `unreadKnown=true / unread=false` in the same canonical package lane。

## Latest Applicable Implementation

- Canonical Claude merge: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1).
- Watcher/inventory/open-refresh routing: [preload/index.js](../../../preload/index.js#L1).
- EyPc-only archive result: [archive.cjs](../../../preload/claude/archive.cjs#L1).
- Current Claude authority overlay: [Claude Companion spec](../../../vibe/specs/260807/claude-code-companion-authority-reset/spec.md#L1).

## Alternative Route

- Status: `verified` by RAW-160 phase and RAW-165 hot-unread regressions.
- Preconditions: the incoming current session carries a bounded causal event/revision or the previous cache is explicitly the only available phase evidence.
- Ordered steps: normalize current/previous evidence → reject older lane generation → compare causal event/revision → atomically accept phase/unread/capabilities → semantic selector compare → publish once or no-op.
- Verification: running→terminal publishes once；a delayed older inventory does not regress phase；focused/unfocused completion and focus clear publish immediately；delayed LevelDB cannot roll back；a genuinely newer Prompt restores running；archive result never claims native-sidebar ACK.
- Applicability boundary: Claude companion phase merge and package consumption; it does not change the D′ metadata write postcondition.
- Fallback: when causal order is unknowable, preserve the latest accepted stable phase as verifying; do not prefer an arbitrary old running cache.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-11 | RAW-160 | Claude had ended but EyPc still showed running | Previous phase/cache overrode newer current evidence | Kernel-owned causal merge and atomic projection | affected automation verified; real host pending |
| 2026-08-13 | RAW-165 | Completion/focus was observable before Claude persisted unread，so EyPc waited or later regressed | Treated LevelDB snapshot timing as the only unread authority and did not wake unread-only subscribers from App events；a coincidentally matching value from the previous completion could be mistaken for catch-up | Add exact live completion/focus hot overlay，monotonic hint revision，opposite-edge-plus-post-event persisted acknowledgement and shared watcher wake | affected `364/364` matrix passed；real current-host acceptance pending |
| 2026-08-13 | RAW-166 | Exact empty unread snapshot could update the value while leaving Host incremental/new-member evidence semantically unknown；log rotation cold replay could also mint a false hot edge | Treated unread boolean/authority as incidental fields and allowed any same-version rebuild to create hints | Admit `unreadKnown/value` together；unavailable abstains；only verified append creates hot unread | affected `457/457` matrix and production build pass；real current-host acceptance pending |
| 2026-08-26 | V7 Claude state/read correction | 已完成/额度耗尽任务仍显示进行中；快捷打开后的已读消退不稳定 | inventory delivery 污染 state/read waterline；新 App 版本门滞后；usage-limit warn 未进入固定语法；focus 误写 phase time | 独立 mutation/state/unread lanes；加入 `1.37937.0` 与固定 usage-limit interrupted 语法；focus 仅 hot unread；导航诊断显式回执边界 | focused automation + sanitized current-log replay verified；host reload pending |
