---
id: eypc-codex-desktop-unread-missing-field-fallback
status: candidate
scope: project
fingerprint: codex-desktop-live-unread__optional-live-field-was-treated-as-false-and-overwrote-confirmed-persisted-fallback__preserve-persisted-unread-until-explicit-live-read-state
first_seen: 2026-07-24
last_verified: 2026-08-28
review_after: 2026-11-28
evidence:
  - user-observed-state-mismatch
  - preload-source-inspection
  - static-syntax-and-mirror-check
tags:
  - codex-companion
  - desktop-ipc
  - unread-state
  - optional-field
  - input-required
---

# Preserve Confirmed Unread When Live Fields Are Optional

## Symptom

Completed-unread tasks could disappear from that state after a Desktop live snapshot or patch that omitted its unread field. Waiting-input could also be missed when an otherwise known Desktop request name used underscore or other separators.

## Wrong Assumption

An omitted optional live unread field was treated as a definite read/unknown value and overwrote the previously confirmed Codex persisted unread result. Request matching assumed only the observed casing and separator spelling.

## Candidate Root Cause

The bridge stored one mutable unread value without retaining the authority of its persisted fallback. Its live publish path therefore wrote an unavailable value whenever the optional field was absent. Separately, request name checks matched literals before normalizing separators.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) narrows known request identifiers by removing separators. RAW-093 further establishes that an exact unresolved request may promote an idle Desktop live shadow to `active + waitingOnUserInput`; [the dedicated request-priority memory](codex-pending-user-request-overrides-idle-runtime.md#L1) owns that boundary.
- [preload/index.js](../../../preload/index.js#L1686) preserves `desktop-persisted` unread authority as an explicit fallback; [the bridge publish path](../../../preload/index.js#L2110) selects live read-state first and that fallback only when the live field is absent.
- [preload/index.js](../../../preload/index.js#L2297) refreshes the persisted unread baseline without replacing an explicit live value; the initial inventory stores both authority channels.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L36) records the user acceptance matrix for RAW-081.

## Detection Order

1. Confirm the source is an exact, compatible Desktop live shadow before examining request flags or unread fields.
2. Resolve finite pending input/approval requests first; a recognized unresolved request may promote idle runtime to active, while unknown requests do not.
3. Distinguish an explicit live `hasUnreadTurn` value, an explicit live read-state message, and an omitted live field.
4. If the field is omitted, read only the latest successful Codex persisted unread authority; if that source is unavailable, remain unknown.
5. Keep persisted fallback data separate from transient live read-state so an explicit read event cannot rewrite the fallback baseline.
6. Normalize only separators in the existing known request identifiers; do not broaden the accepted semantic classes.
7. Never use connector active, `notLoaded`, recency, elapsed time or ordinary refresh as unread, completion or input evidence.

## Prevention Rule

Optional live fields are not negative values. Preserve the last confirmed fallback with its authority, let explicit live events win, and degrade to unknown only when all authorized sources are absent. Normalize harmless spelling separators only after constraining the known protocol vocabulary and source authority.

## Alternative Route

- Status: `candidate`; static source checks pass, while user Desktop acceptance remains pending.
- Preconditions: a provider supplies optional live fields and a second trusted persisted read source exists.
- Ordered steps: store source-specific unread authority; apply explicit live read-state first; apply snapshot/patch unread only when boolean; otherwise retain persisted fallback; normalize known request identifiers; aggregate Side Chat unread without exporting raw IDs.
- Verification: an omitted live unread field preserves completed-unread, an explicit live read clears it, and underscore/hyphen/camel-case forms of known active input requests all produce waiting-input without connector/recency inference.
- Applicability boundary: this does not make the persisted unread set a source of live input/approval/running state, and it does not turn unknown into completion evidence.
- Fallback: when the persisted source cannot be read, publish unread authority as unknown and retain the existing host-unknown behavior.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | RAW-081 live state fallback | User reported inaccurate waiting-input and completed-unread states | Missing live unread was written as unavailable, and request spelling required exact separators | Retained persisted unread authority, kept explicit live read-state priority, and normalized separators for existing known request names | candidate; static source/mirror checks pass, user Desktop acceptance pending |

| 2026-08-28 | 逾期 candidate 复核 | validate:error-memory 报告复核窗口过期 | 无——本轮为复核而非再尝试 | 未改动实现 | candidate；2026-08-28 复核：读取真机运行诊断日志（2026-08-27T13:42Z→2026-08-28T03:25Z，21387 事件，运行构建 host-8a1420a1a591c710f6fa 即当前 HEAD，零 error 零 warn）。**不能据此结案**：该窗口内 Codex Provider 几乎未被使用（带 provider 字段的事件 claude 42 / cursor 18 / codex 1，末次 cold-preflight 显示 codex 源未启用），且本记录关注的失败路径没有专门日志埋点，事件缺失属无效证据而非无复发证明。状态维持 candidate。待验收项：已完成未读不掉状态、待输入不漏判。 |