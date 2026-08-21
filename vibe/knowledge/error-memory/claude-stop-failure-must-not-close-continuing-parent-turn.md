---
id: eypc-claude-stop-failure-must-not-close-continuing-parent-turn
status: verified
scope: project
fingerprint: claude-stop-failure__parent-turn-closed-while-tools-continue__hook-terminal-outranks-app-live
first_seen: 2026-08-17
last_verified: 2026-08-17
review_after: 2026-09-17
evidence:
  - preload/claude/events.cjs
  - preload/claude/code-sessions.cjs
  - preload/claude/app-state.cjs
  - preload/companion/task-kernel.cjs
  - tests/platform/claudeBridge.test.ts
tags:
  - claude-companion
  - stop-failure
  - waiting-to-continue
  - state-precedence
  - provider-boundary
---

# Claude StopFailure Must Not Close A Continuing Parent Turn

## Symptom

A Claude Code task that is still working in the App appears in EyPc as “待继续” (`stopped`) and becomes archiveable. Sibling completed Claude rows in the same project remain correct. The false stop can persist for minutes while tools, permission prompts and a later App `Sending message to session` continue.

## Wrong Assumption

`StopFailure` was treated as an explicit parent-Turn terminal, equivalent to a failed/interrupted App Stop/Result. Same-Turn Hook tail activity after that event was assumed not to be parent work, and a newer Hook timestamp was allowed to outrank App live `running` because the existing source-selection comment only protected App *terminal* from Hook tail.

## Verified Root Cause

Three stacked boundaries produced the live misclassification. 2026-08-17 production-module correlation plus the running Host diagnostic stream reproduced all three on one invoice-match session (`completedTurns=13`, App version `1.30096.5`).

1. [events.cjs](../../../preload/claude/events.cjs#L163-L171) previously mapped every Hook `StopFailure` to `phase=stopped` and `turnOpen=false`. Later `pre-tool` / `post-tool` / `permission-request` could not reopen the parent because they required `turnOpen`. `session-start` is lifecycle-only. RAW-174 restores the parent from later same-Turn prompt/tool/permission via [restoreParentTurnAfterStopFailure](../../../preload/claude/events.cjs#L115-L121).
2. Live evidence on that session: `UserPromptSubmit` opened a Turn; 29 seconds later `StopFailure` fired; then `subagent-stop` + `session-start` and 200+ tool/permission events continued on the same CLI session id. App logs had `Sending message to session` at Turn start and again minutes later, with **no** `[Result|Stop hook] (Turn|Query) (failed|interrupted)` line. All Hook rows were keyed by CLI id (`unique-cli`), so a subagent/inner `StopFailure` is attributed to the parent.
3. [code-sessions.cjs](../../../preload/claude/code-sessions.cjs#L218-L228) previously selected Hook whenever App was non-terminal and `hookAt > appAt`. Tool-tail timestamps kept winning after the false stop. Kernel [reduceClaudeTaskEvidenceV4](../../../preload/companion/task-kernel.cjs#L400-L423) then published provider `stopped` as “待继续” because native unread is false. A one-shot App rebuild additionally converts cold-replay live phases to `unknown` in [app-state.cjs](../../../preload/claude/app-state.cjs#L452-L460); the running Host still published `stopped` / `evidence=hook` at the `StopFailure` instant, so cold neutralization is not required to explain the card. RAW-174 keeps App live-append running over Hook stopped unless Hook proves a newer Prompt.

There was no focused test that named `StopFailure` or that forbade Hook terminal from replacing App live `running`. RAW-174 now owns that matrix in [claudeBridge.test.ts](../../../tests/platform/claudeBridge.test.ts#L1).

This is not the 2026-08-15 SessionEnd/lifecycle-only failure. SessionEnd never fired on the affected Turn.

## Detection Order

1. Separate Hook `StopFailure` from App Stop/Result failed/interrupted and from generic SessionEnd.
2. If App still has a later `Sending message` / live running, or Hook still emits parent-turn tools/permission after `StopFailure`, the parent Turn is not terminal.
3. Source selection: App live running outranks Hook terminal unless Hook proves a strictly newer `UserPromptSubmit`.
4. Same-Turn tool/permission activity after a false `StopFailure` must restore running/waiting, not keep `turnOpen=false`.
5. Confirm the visible card/group from the final Kernel package: “待继续” is `stopped`, not a fifth Tab.

## Prevention Rule

Do not treat Hook `StopFailure` as parent-Turn `stopped` while the same Turn continues. Subagent/inner StopFailure sharing the CLI session id is not parent interruption. App live running must not lose to a newer Hook timestamp whose phase is already closed. Do not repair this with TTL, transcript reads or unread promotion: unread would turn a live task into completed, not running.

## Latest Applicable Implementation

RAW-174. Current owners:

- Hook Turn fold and StopFailure restore: [events.cjs](../../../preload/claude/events.cjs#L115-L214)
- Source selection: [code-sessions.cjs](../../../preload/claude/code-sessions.cjs#L202-L234)
- App cold-replay live abstention: [app-state.cjs](../../../preload/claude/app-state.cjs#L452-L460)
- Visible phase: [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L400-L423)

Related SessionEnd owner remains [claude-generic-session-end-must-not-overwrite-completion](claude-generic-session-end-must-not-overwrite-completion.md#L1).

## Alternative Route

- Status: `verified` through the 2026-08-17 focused Claude Bridge boundary；real uTools reload acceptance remains pending.
- Preconditions: Hook queue distinguishes event class only; App logs keep the current fixed `Sending message` / Stop-hook / Result grammar.
- Ordered steps: keep `StopFailure` as a recorded waterline; restore `turnOpen` from later same-Turn prompt/tool/permission; do not reopen after successful Stop or observed-open SessionEnd; let App live running win over Hook terminal unless Hook `turnStartedAt` is strictly newer.
- Verification: a Turn with `StopFailure` then continuing tools stays running; a later permission request becomes waiting-approval; App live-append running beats later Hook stopped; explicit App failed/interrupted still becomes 待继续; SessionEnd lifecycle-only contract remains unchanged. Focused `claudeBridge` `74/74`.
- Applicability boundary: Claude Hook/App phase projection. Does not change Codex interrupted/Goal rules.
- Fallback: if App and Hook remain contradictory after those rules, keep the last stable nonterminal (`running` / waiting) and mark verifying; never invent `stopped` from Hook `StopFailure` alone while parent activity continues.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-17 | Live Claude 待继续 diagnosis | invoice-match Claude row stayed 待继续 while App tools/permission continued | Hook `StopFailure` closed parent `turnOpen`; newer Hook timestamps beat App live running; Kernel published `stopped` | RAW-174: restore after StopFailure; App live outranks Hook stopped | focused `74/74`; Host reload pending |
