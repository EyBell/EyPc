# Window Jump Workbench — Handoff

## Delivery State

`wj18-cg-title-source / static-verified; host-acceptance-pending` — WJ-18 fixes the repeated false “window changed” diagnostic by keeping title validation inside Core Graphics. Exact AX→CG selection and focused-window readback remain unchanged; WJ-17 restart-safe recovery remains intact. Status: **源码/镜像/文档静态校验；真实 preload 重载与同窗激活待验**.

## Delivered Surface

- Domain/state: persistent local aliases/targets with independent favorite/pin, current plus bounded verified titles, pinned-first/global application comparator, ten platform-separated slots, and shared [listSelection.ts](../../../../src/domain/listSelection.ts#L1) helpers in [windows.ts](../../../../src/domain/windows.ts#L1), [state.ts](../../../../src/domain/state.ts#L1), and [types.ts](../../../../src/domain/types.ts#L1). The candidate resolver requires exact app identity, ignores common app-name title suffixes, and auto-selects only one strongly similar, clearly leading result.
- Native bridge: macOS first validates a session binding against the current managed-display map; a unique hit skips full direct/reverse/isolated resolution. WJ-18 then validates the current title only on the same PID/CG-ID Core Graphics record, maps exactly one AX element through `_AXUIElementGetWindow`, and requires `AXFocusedWindow` readback. `AXTitle` cannot generate a false CG-title mismatch. Native miss evicts the hint and preserves one bounded recovery. Cache misses retain WJ-15's exact isolated bridge. No Space/display binding is persisted. Windows behavior is unchanged. See [preload/index.js](../../../../preload/index.js#L1), [public/preload.js](../../../../public/preload.js#L1), and [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1).
- Runtime/UI: capability revision is `wj18-cg-title-source`; the visible diagnostic shape and Runtime logic are unchanged. Complete inventories may still authorize one high-confidence unique WJ-17 replacement; partial/current-Space inventories retain absent cached rows, disable fuzzy learning, and cannot prove closure. See [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) and [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1).
- Verification: WJ-18 static preload syntax/mirror/revision/source-contract and documentation checks pass; tests/typecheck/build/uTools/native activation were not run. WJ-17's 21/21 domain/state and 17/17 Runtime results plus WJ-15 real exact-focus acceptance remain historical evidence; see [verify.md](verify.md#L1).

## User Validation Focus

Reload the non-hot-reloading preload and first confirm `bridge=wj18-cg-title-source`. Retry the unchanged target that previously showed “目标窗口标题或所属应用已变化”: it must activate without rebind or that diagnostic. Then retain WJ-17 validation: restart/recreate one fixed Rider or AiTools target, require one high-confidence unique replacement to activate/persist, and require two similar siblings to stop for explicit choice. Repeated cache hits should still end at `ax-focused-window`; partial/current-Space refreshes must keep off-Space rows as “缓存保留”.

Durable prevention: [utools-macos-cross-api-window-title-mismatch.md](../../../../vibe/knowledge/error-memory/utools-macos-cross-api-window-title-mismatch.md#L1) records WJ-18's same-source title rule; [macos-cg-ax-window-identity-mismatch.md](../../../../vibe/knowledge/error-memory/macos-cg-ax-window-identity-mismatch.md#L1) records exact AX→CG identity; [utools-macos-ax-activation-misses-other-spaces.md](../../../../vibe/knowledge/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1) covers the isolated off-Space bridge; [utools-window-target-auto-rebind-after-restart.md](../../../../vibe/knowledge/error-memory/utools-window-target-auto-rebind-after-restart.md#L1) records safe logical-target recovery; [utools-mainhide-window-activation-diagnostics.md](../../../../vibe/knowledge/error-memory/utools-mainhide-window-activation-diagnostics.md#L1) retains the debug-trace production gate.

## Safety Reminder

Neither the plugin nor this task should attempt to grant macOS accessibility/screen-recording access, alter an application title, or bypass Windows foreground protection. Force terminate runs only after an explicit user confirm.
