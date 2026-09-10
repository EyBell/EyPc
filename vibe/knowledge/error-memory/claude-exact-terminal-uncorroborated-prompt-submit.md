---
id: eypc-claude-exact-terminal-uncorroborated-prompt-submit
status: candidate
scope: project
fingerprint: claude-exact-terminal-beats-later-prompt-submit-only-hook__uncorroborated-newer-turn-must-not-stay-running
first_seen: 2026-09-10
last_verified: 2026-09-10
review_after: 2026-12-10
evidence:
  - user-corrected
  - count-only source fold app exact-terminal stopped plus unique-cli prompt-submit
  - hook turnStartedAt 4000ms newer then idle about 2h
  - focused claudeBridge tests
tags:
  - companion
  - claude
  - phase
  - hook
---

# Claude App 精确终态后未证实的 Hook 提问不得锁在进行中

## Symptom

Claude App 已是 interrupted/stopped，插件根卡仍停在「进行中」数小时。Hook 最后事件只有 `UserPromptSubmit`，没有 Stop，也没有工具/审批。

## Wrong Assumption

`turnStartedAt` 只要严格晚于 App 终态，就证明用户开了新的活 Turn，unique-cli Hook 可以压过 `exact-terminal`。

## Verified Root Cause

`selectProjectedStateSource` 在 App 已有终态时只问 `hook.turnStartedAt > appTerminalAt`。App 日志是秒级，Hook 提问可以新几秒；若这一轮再也没有 tool/Stop，卡片会按 Hook `running` 一直留在进行中。同 Turn 尾巴回归覆盖不了「终态之后 4 秒又提交、然后空窗两小时」这条。

## Correct Detection Order

1. App 是否 `exact-terminal` completed/stopped，Turn 已关。
2. Hook 是否 unique/direct，以及 `lastEvent` 是不是只有 `prompt-submit`。
3. 若只有提问：看空窗是否超过 60 秒；超过则回 App（待继续/已完成）。宽限期内的新提问仍进行中。
4. 若终态之后已有 pre-tool / post-tool / permission / subagent 进度，仍以 Hook 为新活 Turn。
5. 不要用队列裁尾或父任务完成去结束仍有工具事件的子任务。

## Prevention Rule

App 精确终态之后，Hook 只能靠「更晚的父 Turn **且** 终态之后的 live progress」复活。`UserPromptSubmit` 单独证明不了活 Turn；生产 correlate 必须传入 `now`，空窗超过 `HOOK_PROMPT_ONLY_GRACE_MS` 回 App。

## Alternative Route

- Status: `candidate`（聚焦测试已绿，真机重载未做）
- Preconditions: App `exact-terminal`，Hook unique-cli/direct-local。
- Steps: `hookCorroboratesNewerTurn`；open-only 事件看 60s 空窗；其它事件看 progressAt > appTerminalAt。
- Verification: `tests/platform/claudeBridge.test.ts` 新增空窗/宽限/工具进度三例。
- Applicability boundary: Claude Code 本机相位来源选择。不含 Cursor，不含未读。
- Fallback: 未传 `now` 时保持「新提问立即 running」，避免历史时间戳测试误判超期。
