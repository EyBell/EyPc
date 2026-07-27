# Window Jump Workbench — Verification Record

## Current Status

`source-repaired / host-validation-pending` — WJ-08 removes the duplicate generic/early hide path and adds one-rescan stale-reference recovery/diagnostics. WJ-09 repairs the discovered macOS identity mismatch: Core Graphics IDs are no longer treated as `AXWindowNumber`; the bridge resolves one AX title match and uses a fresh ordinal only for equal-title disambiguation. WJ-10 adds development-only sanitized operation tracing, Windows page topmost, macOS topmost boundary reporting, and non-favorite stable-slot assignment. Existing Windows enumeration, list-pin/order, cache/manual-load/`mainHide`, Workbench List multi-select, and OS-close then confirm-force-terminate remain. Targeted source suites pass; real uTools acceptance is still required before this becomes host-verified.

## WJ-08 Targeted Evidence

- Entry/routing suite passes: 2 files / 11 tests. It covers all slots `1–10` without `hideAfterAction`, preserves Codex hiding behavior, and routes disabled slots through `windows.slot.activate` rather than silently stopping.
- Named Runtime group passes: 7 tests. It covers success without blocking diagnostics, stale-reference rescan recovery for slot and manual action-panel activation, confirmed close after a healthy rescan, blocking capability/permission/focus/host-call/feature-disable/unassigned/workbench-show/silent-hide cases, sanitized host-message handling, the 50-record cap, and the clear action.
- Diagnostics UI suite passes: 3 tests. It covers absent/present panel behavior, blocking `role="alert"`, accepted-close `role="status"`, stable code display, sanitized fields, and `windows.activation.diagnostics.clear` dispatch.
- The diagnostic array is Runtime-only; it is absent from `AppState`/storage and its view never contains title, application name, PID, handle, native reference, or raw host message.
- The full `action.test.ts` aggregate remains excluded from this gate because it exceeds the agreed bounded test scope. No full test, typecheck, build, browser/screenshot, or real uTools host activation was run here.

## Completed Static Evidence

- `public/plugin.json` parses as JSON, contains exactly ten `eypc-window-slot-*` entries, and each slot feature sets `mainHide: true`.
- The runtime-validator source rejects a missing window-jump feature, any missing stable slot label, or a slot without `mainHide`.
- macOS `listWindows` prefers CG titled results and falls back to `MACOS_AX_WINDOW_LIST_SCRIPT` when CG is empty/failed so refresh cannot silently leave only favorites/slots.
- The CG reference is cast before deep-unwrapping; both macOS paths exclude host/background/non-regular application surfaces. Windows requires a live visible non-cloaked root handle and validates extended style plus root-owner/last-active-popup eligibility before exposing an HWND.
- `WindowTarget.pinned` normalizes from local state independently of favorite/slot retention; Runtime sorts pinned rows first and all remaining saved/live rows globally by application. The native pin button exposes visible state and `aria-pressed`; multi-target pin sets every selected row.
- The explicit `windows.refresh` command clears persisted `windowSearch` before requesting inventory; background cache-miss and close/lifecycle refreshes retain it.
- `node --check` passes both preloads, their bytes compare equal, syntax parsing passes nine changed TypeScript files, Vue SFC script/template compilation passes `WindowsPage.vue`, and scoped `git diff --check` passes.
- Source-level regression coverage now includes pin normalization/toggle/pruning, pinned-first application order, macOS cast/AX source contracts, and Windows root-owner native-handle filtering in addition to the existing state/routing/keybinding/action seams. Present but deliberately unexecuted.
- RAW-087 follow-up remains: no private shortcut-read bridge; slot configuration still routes through the official uTools settings redirect.

## WJ-09 macOS Identity Evidence

- User-owned host feedback produced the blocking stable code `activation-not-found` after a manual activation and repeated refresh; because the healthy rescan still found a live match, it correctly did not become accepted `target-closed`.
- A read-only aggregate macOS probe found 477 Core Graphics references while System Events simultaneously exposed 17 processes, 15 windows, and 14 titled windows but zero `AXWindowNumber` values. The old `CGWindowID → AXWindowNumber` comparison could therefore never select a target.
- The repaired JXA bridge uses a normalized AX window title inside the target process and only its fresh ordinal to resolve equal-title candidates. It returns `ambiguous` instead of silently selecting a duplicate. The title is sent in a bounded child environment rather than shell/JXA source, and never enters diagnostics, storage, or logs.
- The generated no-target JXA probe parsed and returned `not-found` without an OS-window action. A separate read-only resolver probe resolved 14/14 titled AX windows; it did not focus, raise, close, terminate, mutate permissions, or disclose title/application/PID/native-reference data.
- `tests/platform/eypcPlatform.test.ts` passes with 15 tests, including the regression guard that the activation script contains no `AXWindowNumber` lookup and the canonical/public preloads remain identical.

## WJ-10 Operation Trace and Topmost Evidence

- Official research basis: [Apple `kAXMinimizedAttribute`](https://developer.apple.com/documentation/applicationservices/kaxminimizedattribute?changes=latest_minor), [Apple `kAXRaiseAction`](https://developer.apple.com/documentation/applicationservices/kaxraiseaction), [Apple `kAXFocusedAttribute`](https://developer.apple.com/documentation/applicationservices/kaxfocusedattribute?changes=_7), [Microsoft `ShowWindow`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindow), [Microsoft `SetForegroundWindow`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow), and [Microsoft `SetWindowPos`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos). These define restore/foreground/raise behavior and show that Windows alone supplies the requested persistent `HWND_TOPMOST` z-order; Apple only defines a raise/frontmost action under the containing app’s allowed ordering, not generic permanent third-party topmost.
- `tests/platform/eypcPlatform.test.ts`: 16 passed. It retains canonical/public preload identity, validates the bounded `EYPC_WINDOW_DEBUG_TRACE` bridge contract, `SetWindowPos(HWND_TOPMOST)`, explicit `alwaysOnTop` export/capability, and the macOS no-false-topmost message.
- `tests/runtime/action.test.ts --testNamePattern='window activation diagnostics'`: 11 passed, 133 skipped. The named group covers the existing close-only acceptance contract plus sanitized development trace creation/cap/clear/non-persistence, Windows page-topmost success, unsupported topmost blocking, and live-row stable-slot assignment without an implicit favorite.
- `tests/ui/windowsDiagnostics.test.ts`: 6 passed. It covers the activation panel plus development-trace invisibility in production-style snapshots, trace status semantics/sanitization/clear action, and the distinct Windows page-topmost / EyPc list-pin controls.
- `node --check preload/index.js`, `node --check public/preload.js`, canonical/public byte comparison, and `git diff --check` pass. `pnpm run typecheck` also passes after mapping the diagnostic-only `activate` stage to the trace's `native` stage. No full test, build, browser/screenshot, uTools package validation, or real OS-window action was run.
- The trace is only created when `import.meta.env.DEV === true`; Runtime validates stage/outcome values before rendering. It is not in `AppState` or storage, and a production build neither requests native trace data nor exposes its UI module.

## Required Host Acceptance

1. Clear this session's records, invoke an assigned valid slot, and require target activation with no `blocking` diagnostic.
2. Close the assigned target, invoke its slot, and require one accepted `target-closed` record after a real rescan; no blocking record may accompany it.
3. In a development uTools run, clear “开发窗口操作追踪”, invoke an assigned valid target, and retain only its stable operation/stage/outcome sequence. It must show no blocking result and no title/application/PID/handle/native-reference/raw-host data. In a real installed build, this module must be absent.
4. On Windows, invoke “页面置顶” for a normal non-minimized and a minimized target; require a successful restore/topmost/foreground trace and no blocking diagnostic. On macOS, require the control to remain unavailable and the Runtime result to be `topmost-unsupported` if dispatched.
5. Any other outcome is a failed acceptance. Preserve only its stable code and sanitized explanation/operation-step pairs, then continue repair; do not treat a failed workbench display, permission issue, foreground refusal, host exception, unsupported topmost, or silent-hide failure as acceptable.

## Authorized Read-only Local Evidence

- The exact current `MACOS_WINDOW_LIST_SCRIPT` completed in 159 ms and returned 22 actionable rows across 14 applications.
- The exact current `MACOS_AX_WINDOW_LIST_SCRIPT` completed in 2432 ms and returned 13 rows across 10 applications.
- Only aggregate status/count/duration was emitted. No window title, application name, PID, native reference, activation, close, termination, permission mutation, or external write was performed.

## Required User-owned Validation

- Unit, production-build, and uTools manifest/runtime gates.
- Silent slot jump / missing-target workbench / manual Tab load (no auto-scan).
- With a nonempty window query, toolbar load/refresh and `Ctrl+R` clear the query and reveal the refreshed complete list; an automatic cache-miss rescan does not clear it.
- macOS: Screen Recording + Accessibility; refresh prefers CG for other Spaces/displays and falls back to AX current-Space list when CG has no titled windows; verify a unique AX-title activation succeeds through restore/frontmost/Raise/verification, equal titles remain explicitly disambiguated, close uses AX, and force terminate only after confirm. “页面置顶” must not claim persistent third-party success.
- Windows: EnumWindows across virtual desktops/displays; cloaked shells absent; `WM_CLOSE` then confirm kill.
- Windows: browser/helper/native child handles are absent while each real main browser window remains; pin/unpin and application ordering persist across a plugin reopen.
- `Space` toggles multi-select and advances; Esc clears selection before closing the action panel; right-click / `c-→` opens single vs multi action surface.
- `c-del` / `c-bs` OS-closes selection/focus; failures prompt force terminate.
- Ports/Favorites/MQTT Space advance matches Workbench List Taste; ports right-click on a selected row opens multi drawer.
- Window list `↑↓` with action panel open keeps list ownership and scrolls the focused row.

## Not Run by Task Authority

The WJ-08/WJ-10 named source suites and WJ-09 platform regression test have run as recorded above. No full automated suite, typecheck, build, uTools validation, screenshot/browser check, Windows-host enumeration, or real OS-window activation/topmost/close/terminate has been run for this follow-up. The only native execution remains prior read-only aggregate/resolution macOS probes above.
