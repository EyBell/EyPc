# Window Jump Workbench — Handoff

## Delivery State

`wj15-exact-ax / AiTools-off-Space-host-verified` — WJ-14 isolates SkyLight lookup from the Electron preload when that context returns an empty binding set; WJ-15 maps the selected CG ID to one raw AX element and verifies that exact element becomes `AXFocusedWindow`. Real uTools global slot 2 acceptance passed for AiTools on a non-current Space. Status: **核心故障已打通，残余负向/跨平台门禁待验**.

## Delivered Surface

- Domain/state: persistent local aliases/targets with independent favorite/pin, pinned-first/global application comparator, exact title matching, ten platform-separated slots, and shared [listSelection.ts](../../../../src/domain/listSelection.ts#L1) helpers in [windows.ts](../../../../src/domain/windows.ts#L1), [state.ts](../../../../src/domain/state.ts#L1), and [types.ts](../../../../src/domain/types.ts#L1).
- Native bridge: macOS validates CG ID + PID/app/title, resolves both direct Space masks plus reverse managed-Space evidence, and falls back to the same logic in a fresh JXA process when Electron returns no binding. It switches and confirms only one remote Space. Activation then maps raw AX windows with `_AXUIElementGetWindow`, focuses/raises the exact match, and verifies application `AXFocusedWindow` maps back to the selected CG ID. Missing/ambiguous/timeout/exact-focus failures remain blocking; full desktop walk and learned bindings remain absent. Windows behavior is unchanged. See [preload/index.js](../../../../preload/index.js#L1), [public/preload.js](../../../../public/preload.js#L1), and [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1).
- Runtime/UI: capability revision `wj15-exact-ax` blocks stale hosts; isolated-Space and exact-AX trace details survive both preload and Runtime allowlists; same-PID title drift still requires candidate confirmation. Existing list/slot/pin/topmost behavior remains in [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) and [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1).
- Verification: production build/typecheck/uTools validation pass; focused platform+UI suites are 35/35 and the named Runtime diagnostics group is 11/11. Real slot-2 trace completed through `isolated-space-bridge`, `switch-confirmed`, `ax-cg-id-match`, and `ax-focused-window`; post-check confirmed selected Space/current app/exact AX focus. One accidental broad suite run remains non-green and is not an acceptance gate; see [verify.md](verify.md#L1).

## User Validation Focus

The AiTools off-Space gate is accepted and should not be rerun merely to reconfirm the same route. Next useful coverage is: another Chromium multi-window profile, Rider single-window behavior, unbound/ambiguous/timeout/exact-focus negative cases, title rebind, closed target, production-trace absence, and Windows topmost/close. Every macOS run must first confirm `bridge=wj15-exact-ax`; exact focus success requires `ax-focused-window`, not only process foreground/Raise.

Durable prevention: [macos-cgwindowlist-cf-proxy-not-js-array.md](../../../../vibe/knowledge/error-memory/macos-cgwindowlist-cf-proxy-not-js-array.md#L1) records the verified CF proxy failure; [macos-cg-ax-window-identity-mismatch.md](../../../../vibe/knowledge/error-memory/macos-cg-ax-window-identity-mismatch.md#L1) records the verified exact AX→CG route; [utools-macos-ax-activation-misses-other-spaces.md](../../../../vibe/knowledge/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1) covers the isolated off-Space bridge; [utools-mainhide-window-activation-diagnostics.md](../../../../vibe/knowledge/error-memory/utools-mainhide-window-activation-diagnostics.md#L1) retains the debug-trace production gate. The CodeNote canonical files have pre-existing dirty/untracked content and were intentionally not overwritten in this task.

## Safety Reminder

Neither the plugin nor this task should attempt to grant macOS accessibility/screen-recording access, alter an application title, or bypass Windows foreground protection. Force terminate runs only after an explicit user confirm.
