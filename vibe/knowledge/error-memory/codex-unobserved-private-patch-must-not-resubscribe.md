---
id: eypc-codex-unobserved-private-patch-must-not-resubscribe
status: candidate
scope: project
fingerprint: codex-completed-task-remains-ongoing__unobserved-private-desktop-patch-returned-failure-and-resubscribed-live-shadow__stream-envelope-continuity-confused-with-projection-field-support__ignore-well-formed-unobserved-roots-while-advancing-revision
first_seen: 2026-07-27
last_verified: 2026-08-28
review_after: 2026-11-28
evidence:
  - preload/index.js
  - public/preload.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/raw-requirement.md
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - patch-stream
  - resubscribe
  - live-shadow
  - completion-latency
---

# Unobserved Private Patches Must Not Resubscribe The Live Shadow

## Symptom

An already completed Codex task could remain displayed as ongoing. During a three-minute local observation, the same live entries repeatedly disappeared and revived while the completed count stayed fixed, so the visible task count and status changed without a corresponding task lifecycle event.

## Wrong Assumption

The bridge treated “this patch path is outside the Companion projection” as equivalent to “this stream frame is invalid”. That confused a deliberately narrow privacy projection with the validity of the complete Desktop conversation stream.

## Candidate Root Cause

Desktop publishes private Turn, tool and body state on the same revisioned stream as runtime, request and read-state fields. `codexApplyDesktopShadowPatch` formerly rejected every unobserved root. Its caller interpreted the rejection as protocol damage, removed the current live shadow and resubscribed. The replacement snapshot could then restore obsolete active evidence while a real idle/completed patch was delayed or lost in the resubscribe window.

## Evidence

- The user corrected a visible false ongoing state for a task already considered complete.
- A three-minute read-only sample kept the bridge connected and the completed count unchanged, but the same active set repeatedly dropped and returned. A short owner check found one stream owner, excluding competing owners as the cause.
- Source tracing linked every unobserved private root rejection to the same resubscribe branch that deletes the current shadow before a replacement snapshot arrives.
- [preload/index.js](../../../preload/index.js#L1) and its [public mirror](../../../public/preload.js#L1) now consume well-formed unobserved roots as revision progress while retaining strict validation for the four observed roots.
- A 30-second current-source bridge canary processed 59 Desktop patches with zero resubscribe and zero replacement snapshot after initial settlement; the active set stayed stable.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) contains a private deep-patch plus active-to-idle contract asserting one targeted latest-Turn read, zero resubscribe and no private body in the delta. The test was updated but not executed under the project validation rule.
- The running uTools Renderer/preload predates this source change. A real visual completion transition remains pending until the plugin is reconnected or reloaded.

## Detection Order

1. Observe the native live set and completed count long enough to distinguish a genuine lifecycle transition from repeated disappearance/revival.
2. Check whether the bridge remains connected and whether more than one owner can publish the same conversation before changing status semantics.
3. Count follow/unfollow or replacement-snapshot activity alongside ordinary patch activity. Repeated resubscribe under one owner indicates stream-continuity failure rather than task deletion.
4. Trace the patch handler result separately for observed state roots and unobserved private roots.
5. Verify that ignored private roots still advance revision; otherwise the next valid state patch will appear to have a gap.
6. After source correction, require zero resubscribe/replacement snapshots during ordinary private patch churn, then perform one real active-to-completed transition after reloading the actual preload.

## Prevention Rule

Keep the Desktop projection finite, but do not use projection membership as protocol validity. A well-formed patch outside `threadRuntimeStatus`, `requests`, `hasUnreadTurn` and `resumeState` must have its content ignored while the stream revision advances and the existing live shadow remains intact. Malformed operations/paths, malformed observed fields, revision gaps, owner changes and incompatible frames still fail closed and may resubscribe. Do not compensate with a longer cache, an active timeout or elapsed-time completion inference.

## Latest Applicable Implementation

- Snapshot projection remains restricted to sanitized runtime, finite request identifiers, unread state and resume metadata.
- Patch envelopes accept only `add`, `replace` and `remove`, a non-empty bounded path, and compatible stream ownership/revision.
- Well-formed unobserved roots return success without storing their values; the caller advances to the supplied revision without rebuilding the subscription.
- The four observed roots retain strict shape, depth, value and array-index checks.
- A real active exit continues through the existing bounded latest-Turn confirmation; explicit completed evidence leaves ongoing, while abnormal or incomplete evidence stays ongoing.

## Alternative Route

- Status: `candidate`; source behavior and a read-only zero-resubscribe canary are complete, but the running uTools preload has not accepted a real completed-task transition.
- Preconditions: one compatible Desktop stream owner and a previously accepted live shadow.
- Ordered steps: ignore the private root value; advance revision; retain the shadow; apply later observed state patches in order; on active exit, perform the existing targeted latest-Turn confirmation.
- Verification: ordinary private patch traffic produces no follow toggle or replacement snapshot; one active-to-idle batch performs one targeted Turn read and publishes completed evidence without raw identity or content.
- Fallback: only malformed observed state, ownership/revision failure or protocol incompatibility may discard the shadow and resubscribe; unresolved transport state remains ongoing.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-094 private-patch continuity | A completed task remained ongoing and the active set flapped without completed-count change | Rejected every unobserved private patch and rebuilt the stream shadow | Ignore well-formed unobserved roots while advancing revision; retain strict observed-root validation | current-source canary stable; real uTools completion transition pending |

| 2026-08-28 | 逾期 candidate 复核 | validate:error-memory 报告复核窗口过期 | 无——本轮为复核而非再尝试 | 未改动实现 | candidate；2026-08-28 复核：读取真机运行诊断日志（2026-08-27T13:42Z→2026-08-28T03:25Z，21387 事件，运行构建 host-8a1420a1a591c710f6fa 即当前 HEAD，零 error 零 warn）。**不能据此结案**：该窗口内 Codex Provider 几乎未被使用（带 provider 字段的事件 claude 42 / cursor 18 / codex 1，末次 cold-preflight 显示 codex 源未启用），且本记录关注的失败路径没有专门日志埋点，事件缺失属无效证据而非无复发证明。状态维持 candidate。待验收项：私有 patch churn 下零重订阅、活跃集合稳定。 |