# Window Jump Workbench — Controlled Specification

## Status

`source-complete / user-validation-pending` — implementation and canonical documentation are complete; automated, browser, and uTools-host validation remain user-owned for this task.

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
| Native-risk boundary | User-owned validation only. The implementation must not kill processes, modify window titles, simulate input, bypass focus protection, or grant macOS permissions. |
| Verification authority | The project rule keeps tests, typecheck, build, uTools runtime, screenshots, and host acceptance user-owned; none will run in this task. |
| Documentation impact | `requirement-canonical` and `project-current`; this controlled document set, product requirements, architecture, status hub, and verification record must move together. |

## Functional Contract

### Domain state

`AppState` persists feature configuration, the search query, user-created target metadata, and ten platform-separated slot records. A target has an EyPc ID, local alias, platform, app identity/name, exact title locator, last native reference, favorite state, and timestamps. Live native windows are never persisted; Runtime keeps a session cache (`liveWindows`, `windowListLoaded`, `windowCacheUpdatedAt`) that survives Tab switches. Favorites and current-platform slot-bound targets remain in the projected list even when unloaded or unavailable. A non-favorite target may remain only when a stable slot still references it.

### Platform bridge

The preload bridge returns a window capability record, a transient list record, activation results, and an optional macOS system-settings launch. Browser/stale-preload fallback is explicitly unsupported and never fabricates windows. Shortcut slots may open the official uTools configuration screen, but the bridge never reads or returns current host bindings.

Windows only invokes fixed PowerShell/User32 code through `execFile`: visible, top-level, titled desktop windows are listed; a validated numeric HWND is optionally restored and passed to `SetForegroundWindow`. macOS only invokes fixed System Events scripts through `osascript`; missing Accessibility/Automation authorization is classified for the UI.

### Runtime and routing

`eypc-windows` opens the enabled page without auto-scanning. `eypc-window-slot-1` … `eypc-window-slot-10` are `mainHide` features that restore the current Tab, dispatch a slot action, and avoid a transit plugin window on success. The action resolves from the session cache first, refreshes at most once on miss, hides uTools only after platform activation reports success, and on failure/ambiguity shows the windows workbench with an explicit reminder. Invalid/ambiguous targets leave the workbench visible and explain the next safe choice.

### UI

The `windows` feature owns a toolbar (search + manual load + cache status), a persistent slot strip, a live status/exception band, `listbox`/`option` row projection, and an accessible right action layer. Visible list order is saved favorites, then slot-bound targets, then unstarred live rows. The active row uses `aria-selected` and the search box uses `aria-activedescendant` without stealing native text handling. `ArrowUp/ArrowDown`, `Enter`, arrows, `Tab`, `F2` variants, save/cancel, favorite, and refresh commands resolve through named runtime/keybinding layers; ordinary editing remains native.

## Out of Scope

- Hardware or browser-specific APIs, private uTools host APIs, app/window-title writes, and automatic global-hotkey registration.
- Background reconciliation, launch/reopen of a closed application, macOS HWND emulation, and focus workaround techniques.

## Rollback

Disable the feature in EyPc settings. Existing local target and slot metadata remains inert; removing the feature code later does not require any external state restoration.
