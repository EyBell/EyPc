---
id: eypc-codex-native-active-empty-turns-not-nonconversation
status: verified
scope: project
fingerprint: official-connector-active__empty-turns-list-was-nonconversation__native-extra-model-missing-from-float
first_seen: 2026-09-08
last_verified: 2026-09-08
review_after: 2027-03-08
evidence:
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260908/codex-native-host-origin/raw-requirement.md
tags:
  - companion
  - codex
  - turns-list
  - extra-model
---

# 官方 connector 仍 active 时，空 turns/list 不是无会话

## Symptom

Codex APP（含在 Codex 内用额外模型跑的对话）侧栏仍是进行中，EyPc 库存却少了这些行。Host 额外进程另有合成 Turn，不会走这条坑。

## Wrong Assumption

`thread/turns/list` 返回空页就等于没有会话，可以标 `nonConversation` 丢掉。把「补真实状态」理解成去修 Codex Host 会合点。

## Verified Root Cause

`readCodexThreadTurnStatuses` 对空 `data` 一律 `nonConversation`。[sanitizeCodexThreads](../../../preload/index.js#L9656) 再要求 `lastTurn.startedAt`，于是官方 `status.type === 'active'` 但还没有 Turn 页的原生行从公开库存消失。Codex++ 额外模型可以处在这种官方活、Turn 页仍空的窗口。Host 行不进官方 turn 读。

## Correct Detection Order

1. 先看官方 connector `status.type`，再看 `turns/list` 是否为空。
2. 原生 `active` + 空页：应有合成 `inProgress`，库存行仍在。
3. idle / 非 active + 空页：仍是无会话。
4. Host 行缺席：查 discovery 车道，不要用这条官方空 Turn 规则去修会合点。

## Prevention Rule

- 原生官方 `active` 且空 `turns/list` 必须发布进行中，不得当无会话丢掉。
- 不要从空闲空页发明 completed/unread。
- 不要为补原生状态去读 `codexhost launch` 的 token/endpoint，也不要新增第四个 Provider。

## Latest Applicable Implementation

- 合成活 Turn：[preload/index.js](../../../preload/index.js#L9439)
- 空页分支：[preload/index.js](../../../preload/index.js#L9612)
- 回归：`keeps a native connector-active row when official turns/list is empty`；既有 idle 空页 `nonConversationCount: 1`。

## Alternative Route

- Status: `verified`（2026-09-08 focused bridge）
- Preconditions: 官方清单行 `status.type === active`，`thread/turns/list` 为空，且不是 Host 额外进程。
- Steps: 用 `recencyAt`/`updatedAt` 合成 `{ status: 'inProgress', startedAt }` 并写入 turn cache。
- Verification: 该行仍在 `threads`，`lastTurnStatus === 'inProgress'`；idle 空页仍被丢弃。
- Applicability boundary: 原生官方 connector。不含 Host 合成 Turn、不含置顶分组。
- Fallback: 行仍缺席时先核对 connector type 与 `nonConversationCount`，不要先改 Host 发现。

## Occurrence History

| Date | Task | Trigger | Failed route | Recovery | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-09-08 | RAW-218 区分 Host / 原生并补空 Turn | 用户要求区分并修改原生缺失状态 | 把空 turns 当无会话，或去修 Host 会合点 | 原生 active 空页合成 inProgress | verified by focused bridge |
