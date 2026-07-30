# Window Jump Workbench — Handoff

## Delivery State

`wj19-native-instance-id / implemented; verification-pending` — native instance identity now owns automatic matching; titles are display/search metadata only. WJ-17 automatic title recovery and WJ-18 title equality are superseded. Status: **实现与既有测试契约已更新；测试、类型、构建、uTools 重载和真实跳转均未执行**.

## Delivered Surface

- Domain/state: `WindowTarget.id` is the logical EyPc target; `lastInstanceId` is the last verified OS instance and `lastKnownTitle` is display-only. Legacy locator migrates to the latter and history is discarded. See [windows.ts](../../../../src/domain/windows.ts#L1) and [state.ts](../../../../src/domain/state.ts#L1).
- Native bridge: Windows verifies actionable HWND + owner/app and returns `win32:PID:HWND`. macOS requires PID + CGWindowID, one raw AX mapping and exact focused-window readback; AX fallback enumeration also drops rows without a CG ID. Title/ordinal activation and close fallback is removed. See [preload/index.js](../../../../preload/index.js#L1), [public/preload.js](../../../../public/preload.js#L1), and [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1).
- Runtime/UI: all identity paths use `instanceId`. After one complete refresh a missing instance exposes every same-app candidate for manual confirmation, including one candidate. Enter confirms, Escape restores the target row, and only successful native activation updates binding. Partial inventories retain binding. The editor title is read-only. See [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) and [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1).
- Verification: existing contracts were updated but not executed. Only read-only source searches, diff inspection and preload byte comparison were used; see [verify.md](verify.md#L1).

## User Validation Focus

Reload the non-hot-reloading preload and confirm `bridge=wj19-native-instance-id`. Bind one browser window, switch its Tab/title and confirm the same target/slot remains valid. Close the original instance: a sole same-app window must still stop for explicit confirmation; Escape must restore the original target row, while Enter plus verified native activation must atomically adopt the candidate. Equal-title sibling instances must never auto-match. Partial refreshes must retain the old binding and cached rows.

Durable historical evidence: [utools-macos-cross-api-window-title-mismatch.md](../../../../vibe/knowledge/error-memory/utools-macos-cross-api-window-title-mismatch.md#L1) and [utools-window-target-auto-rebind-after-restart.md](../../../../vibe/knowledge/error-memory/utools-window-target-auto-rebind-after-restart.md#L1) explain the superseded WJ-18/WJ-17 approaches but are not current matching authority. [macos-cg-ax-window-identity-mismatch.md](../../../../vibe/knowledge/error-memory/macos-cg-ax-window-identity-mismatch.md#L1) remains applicable to exact AX→CG identity; [utools-macos-ax-activation-misses-other-spaces.md](../../../../vibe/knowledge/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1) covers the isolated off-Space bridge; [utools-mainhide-window-activation-diagnostics.md](../../../../vibe/knowledge/error-memory/utools-mainhide-window-activation-diagnostics.md#L1) retains the debug-trace production gate.

## Safety Reminder

Neither the plugin nor this task should attempt to grant macOS accessibility/screen-recording access, alter an application title, or bypass Windows foreground protection. Force terminate runs only after an explicit user confirm.
