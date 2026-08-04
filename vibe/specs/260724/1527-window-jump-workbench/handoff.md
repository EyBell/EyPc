# Window Jump Workbench — Handoff

Tool: codex
Updated: 2026-08-04

## Delivery State

`wj22-native-instance-space-cache / implemented / 767-tests-type-build-package-post-extraction-macos-native-verified / utools-reload-and-windows-host-pending`

WJ-22 restores exact cross-Space activation without allowing projections to own identity. A saved root remains `PID+CGWindowID/HWND`; current Tab/title and display/Space are mutable state. Current-Space omission preserves the session record, and only an exact native `gone` proof can clear the locator.

## Authorities

- 用户事实：[raw-requirement.md](raw-requirement.md#L1)
- 当前合同：[spec.md](spec.md#L1)
- 执行记录：[tasks.md](tasks.md#L1)
- 验证与剩余门禁：[verify.md](verify.md#L1)
- 领域/平台架构：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)

## Operational focus

- Reload the generated uTools package before acceptance; bridge revision must be `wj22-native-instance-space-cache`.
- Verify assigned slots, not only the workbench button: target display should switch, non-target display should not, and final root CGWindowID/HWND must be exact.
- Same-browser roots require separate targets. Switching a browser Tab must not create or rebind a target.
- “当前桌面未观察到” and “当前无法确认” preserve binding; only “已确认目标窗口已关闭” clears the native locator.
- Candidate confirmation after one slot failure updates that slot only and does not copy old alias/favorite/pin into a new unrelated target.

## Safety

No background polling, persistent Space/liveness cache, title matching, unique-candidate auto-rebind, simulated input or unrelated business change is permitted. Real close/terminate testing remains confirmation-gated.
