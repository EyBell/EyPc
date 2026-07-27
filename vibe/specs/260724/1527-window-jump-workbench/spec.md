# Window Jump Workbench — Controlled Specification

## Status

`source-repaired / host-validation-pending` — WJ-08/WJ-09 repair visibility and macOS identity failures; WJ-10 adds development-only sanitized operation traces plus an explicit Windows page-topmost operation. Real uTools host acceptance remains pending.

## Scope and Authority

- Normalized requirement: [raw-requirement.md](raw-requirement.md#L1).
- Product requirement authority: [../PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md#L1), to be synchronized in this task.
- Architecture authority: [../../knowledge/ARCHITECTURE.md](../../knowledge/ARCHITECTURE.md#L1), to be synchronized in this task.
- UI preference lookup: task-only, full-ui profile; all global stable categories were matched with no user/project override or conflict. The selected implementation aid is the `build-primitive` accessibility/keyboard pattern guidance; Vue-native semantic markup remains the implementation style.

## Preflight

| Check | Result |
| --- | --- |
| Existing working tree | Retain all unrelated edits, including current preload, manifest, Codex runtime, test, rule, and environment changes. |
| Write authority | User explicitly requested implementation. New source, task docs, product requirement, architecture, and status updates are in scope. |
| External-write authority | None. No publish, deployment, credential, database, or external service mutation is needed. |
| Native-risk boundary | The user requested a research-or-simulation path. This delivery uses official API research and mock/bridge verification only; activation, close, terminate, title mutation, simulated input, focus bypass, permission mutation, and arbitrary live-window manipulation remain user-owned host validation. |
| Verification authority | The user authorized bounded platform-bridge, named runtime-diagnostic, and diagnostics-UI suites. Full aggregate tests, typecheck, build, browser/screenshot, and real uTools host acceptance remain out of this task's completed evidence. |
| Documentation impact | `requirement-canonical` and `project-current`; this controlled document set, product requirements, architecture, status hub, and verification record must move together. |

## Functional Contract

### Domain state

`AppState` persists feature configuration, the search query, user-created target metadata, and ten platform-separated slot records. A target has an EyPc ID, local alias, platform, app identity/name, exact title locator, last native reference, favorite/pinned states, and timestamps. Pin is independent from favorite and slot assignment. Live native windows are never persisted; Runtime keeps a session cache (`liveWindows`, `windowListLoaded`, `windowCacheUpdatedAt`) that survives Tab switches. Favorites, pinned targets, and current-platform slot-bound targets remain in the projected list even when unloaded or unavailable. A target with none of those retention reasons is pruned.

### Platform bridge

The preload bridge returns a window capability record, a transient list record, activation/topmost results, and an optional macOS system-settings launch. Browser/stale-preload fallback is explicitly unsupported and never fabricates windows. Shortcut slots may open the official uTools configuration screen, but the bridge never reads or returns current host bindings.

Windows only invokes fixed PowerShell/User32 code through `execFile`: the handle must still exist, be visible, non-cloaked, titled, non-tool, root-level and the last visible active popup for its root owner (unless explicitly `WS_EX_APPWINDOW`). This keeps actionable Alt-Tab surfaces and rejects helper/native browser handles before a validated numeric HWND is restored with `ShowWindow(SW_RESTORE)` and passed to one `SetForegroundWindow` attempt. The separate Windows “页面置顶” operation uses `SetWindowPos(HWND_TOPMOST)` before that same foreground attempt. macOS unwraps the CoreFoundation array through an Objective-C object bridge, then keeps only layer-zero, positive-alpha, titled windows with a valid native number and a live regular application. The CG window ID remains a session inventory reference: activation resolves the System Events window by normalized title within the owning process, restores `AXMinimized` where readable, requests foreground/focus, performs `AXRaise`, and verifies readable state. The title is passed only through a bounded child environment, never interpolated into shell/JXA source. macOS has no arbitrary third-party permanent-topmost claim. Missing Screen Recording/Accessibility/Automation authorization is classified for the UI. No size threshold is used.

### Runtime and routing

`eypc-windows` opens the enabled page without auto-scanning. `eypc-window-slot-1` … `eypc-window-slot-10` remain `mainHide` features that restore the current Tab and dispatch a slot action, but no slot route schedules a generic post-dispatch hide. Slot/manual “展开并前置” and manual Windows “页面置顶” share the capability/cache/one-healthy-rescan path. A stale `lastNativeRef` `not-found` causes one real-time rescan and one retry; a new match refreshes the cache. Only a successful rescan under supported/listable/activatable capability that finds no match clears the stale reference and emits accepted `target-closed`. Feature disablement, missing assignment, capability/permission/read failure, rescan failure/supersession, ambiguity, focus refusal, host call failure, workbench-show failure, unsupported topmost, topmost failure, and successful-operation silent-hide failure are all blocking diagnostics. A failed global slot explicitly shows the workbench/settings fallback; no foreground-protection bypass, permission grant, raw host error, private host IPC, or shortcut-binding readback is introduced.

When `import.meta.env.DEV === true`, Runtime creates an in-memory `WindowOperationDebugRecord` for each activation/topmost attempt and asks the native bridge for only bounded `{ stage, outcome }` steps. The trace is capped at 50 records, separately clearable, validated again at the Runtime boundary, and absent from `AppState`/storage. A non-development build creates no record, omits the bridge request, and exposes no trace UI.

### UI

The `windows` feature owns a toolbar (search + manual load + cache status), a persistent slot strip, a compact status/exception band, `listbox`/`option` row projection, and an accessible right action layer. It renders session-only activation diagnostics without title, application, PID, handle, native-reference, or raw host-error disclosure: blocking entries use `role="alert"`, accepted `target-closed` uses `role="status"`, stable codes remain visible, and `windows.activation.diagnostics.clear` clears only Runtime memory. In a development build only, a compact `role="status"` operation-trace panel shows time, entry, platform, operation, result, stable code, and sanitized stage/outcome chips; `windows.operation.traces.clear` clears it. The action layer distinguishes “展开并前置”, Windows “页面置顶”, and EyPc-local “列表置顶”; macOS keeps the page-topmost control unavailable with an explicit boundary explanation. Pinned rows come first; all remaining saved/live rows sort globally by application name, display name, title, then stable row ID. Favorite and stable-slot retention remain independent from ordering; assignment creates a non-favorite target unless the target was already explicitly favorited. The active row uses `aria-selected` and the search box uses `aria-activedescendant` without stealing native text handling. An explicit toolbar/`Ctrl+R` load or refresh clears the page search before enumerating so a stale query cannot make a fresh inventory look incomplete; internal cache-miss and lifecycle refreshes preserve the query. `ArrowUp/ArrowDown`, `Enter`, arrows, `Tab`, `F2` variants, save/cancel, selection, favorite, list pin, topmost, and refresh commands resolve through named runtime/keybinding layers; ordinary editing remains native.

## Out of Scope

- Hardware or browser-specific APIs, private uTools host APIs, app/window-title writes, and automatic global-hotkey registration.
- Background reconciliation, launch/reopen of a closed application, macOS HWND emulation/permanent-third-party-topmost, and focus workaround techniques.

## Rollback

Disable the feature in EyPc settings. Existing local target and slot metadata remains inert; removing the feature code later does not require any external state restoration.
