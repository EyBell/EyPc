# Window Jump Workbench — Normalized Requirement

## Intent

Add an opt-in, keyboard-first EyPc surface that lets a user discover interactive desktop windows, save plugin-local aliases and favorites, and jump to a saved target from an EyPc page or from a stable uTools global-shortcut slot.

## 2026-07-28 User Supplement

- Reproduce the reported `space-unbound-multiwindow` failure locally, research a more capable generic macOS route online, and allow bounded privacy-safe probes plus real host validation.
- Acceptance must prove the selected Chromium window itself becomes focused after a cross-Space slot jump; bringing only the owning application or a sibling window forward is not success.

## Product Decisions

- Support Windows and macOS in the first release. Windows uses top-level desktop-window APIs; macOS uses CoreGraphics inventory with a bounded System Events accessibility fallback.
- The feature is disabled by default. The Tab scans only after an explicit refresh; stable-slot global features use the session live-window cache first and may rescan once on miss. It does not run a background scanner or reload on every Tab enter.
- An alias is EyPc metadata only. The implementation never changes an application window title.
- Ten fixed slot commands, `EyPc 窗口槽 1` through `EyPc 窗口槽 10`, are `mainHide` uTools shortcut targets. Successful jumps do not show the plugin transit window; lost or ambiguous targets open the windows Tab with an exception reminder. Slot labels remain stable when an alias changes, and mappings are separated by platform.
- `mainHide` must remain the host-entry behavior, not a second generic Renderer hide. A slot and a manual workbench activation both use the same bounded recovery: stale native-reference `not-found` triggers one healthy real-time rescan and one retry. Only after a supported/listable/activatable capability and that rescan find no matching window may the outcome be accepted as `target-closed`; every other non-success is a blocking defect.
- Activation diagnostics are session-only Runtime records (at most 50) with an opaque id, time, slot/manual entry, slot number, platform, stage, stable code, level, and sanitized explanation. They never enter `AppState`, plugin storage, native references, raw host logs, or console output. The compact workbench exception panel must expose blocking records as alerts, confirmed closed targets as status, and a clear-this-session action.
- A separate detailed operation trace exists only when the renderer is a development build. It records the user-authorized selected target title plus bounded runtime/native stage+outcome pairs; it never records an application name, PID, handle, native reference, raw host output, or exception text. It stays in Runtime memory only, caps at 50 records, and has an independent clear action. A real installed build must neither request the native trace nor render its module. A read-only environment snapshot (CG/AX target match counts and Space binding status) is captured before each activation attempt and displayed as a trace line in the development sidebar; it is session-only, never persisted, and does not activate, raise, focus, close, or switch any window or Space.
- Window discovery and activation are capability-gated. macOS must explain missing Accessibility/Automation permission and expose a system-settings action; Windows reports a foreground-focus refusal rather than attempting an input or focus-protection bypass.
- “展开并前置” is the common window-open operation: Windows restores a minimized target before one foreground attempt; macOS restores `AXMinimized` where readable, requests the owning process/window foreground state, performs `AXRaise`, and verifies readable state. A readable post-raise `AXFocused=false` is non-authoritative after successful foreground and raise, so it is trace-visible but does not overturn activation. “页面置顶” is a separate Windows-only operation backed by `SetWindowPos(HWND_TOPMOST)` plus the same restore/foreground rules. macOS must state that it cannot force an arbitrary third-party window to remain permanently topmost and must not report a false success.
- On macOS, a Core Graphics window ID is an inventory/session reference, not a System Events `AXWindowNumber`. When the private Accessibility symbol is available, activation must map each owning-process `AXUIElement` through `_AXUIElementGetWindow` and require exactly one element whose returned CG ID equals the selected reference. Normalized title/fresh ordinal remains a compatibility fallback only when exact mapping is unavailable; it must never assume numeric identity without the mapping call, interpolate a user title into shell/JXA source, or select an ambiguous target arbitrarily.
- A CG-backed macOS target resolves its Space afresh from the exact CG window ID. Direct per-window queries and managed-Space reverse lookup are deduplicated against the current display map: a current binding skips switching, one remote binding may switch, and multiple remote bindings block. If the uTools Electron preload returns no bindings, the same revalidation and SkyLight lookup may run in a fresh bounded JXA process; only a unique isolated binding may switch and it must be confirmed. When both routes have no binding, process-frontmost is allowed only when the owning process has exactly one actionable CG window; multi-window processes block without walking or flashing through other desktops.
- Space bindings are session-only. EyPc must not persist a CG window ID, PID/title key, Space ID, or display UUID as a learned activation binding. The Renderer and preload expose the same fixed bridge revision; a stale/missing host bridge blocks activation with a reconnect instruction.
- A slot first validates its last native reference, then requires an application-and-title locator match. Zero matches report an unavailable target; more than one match present a candidate choice. It must never select one arbitrarily.
- A same-PID window with a changed title is a rebind candidate, never an automatic substitute. Selecting the candidate explicitly updates the saved app/title/native reference before future slot activations.
- A local list pin is independent from favorite, OS page topmost, and slot assignment. Pinning a live row creates only the minimum EyPc target metadata needed to retain it; assigning a live row to a stable slot creates non-favorite retention by default; unpinning does not remove a favorite or slot mapping.
- Native discovery admits only actionable application windows. macOS requires a valid CoreGraphics window number backed by a running regular application; Windows requires an existing visible non-cloaked top-level/Alt-Tab-eligible handle and rejects tool/helper/native browser handles that are not the active root/popup surface. Neither platform uses a size threshold.

## Interaction Contract

- The page is a dense toolbar/list workbench. Pinned targets come first; every remaining saved/live row sorts globally by application name, then display name/title. Favorites and slot-bound targets remain visible when unavailable but do not override application ordering unless pinned. Search covers plugin alias, native title, and application name.
- Stable slots `1–10` live in a left collapsible vertical rail; empty slots open a picker to assign, assigned slots focus the bound target.
- `ArrowUp`/`ArrowDown` change the active row; `Enter` attempts activation; `ArrowRight` opens the right-side action layer; `ArrowLeft` returns to the list; `Tab` and `Shift+Tab` move between list and action controls.
- `Shift+F2` edits the local alias, `F2` opens the complete target editor, `Ctrl+S`/`Enter` saves, `Escape` backs out from editor to actions to selection/search, `Space` toggles multi-selection and advances, and `Ctrl+R` manually loads/refreshes live windows. Favorite and pin are explicit action-panel commands; a pin toggle exposes `aria-pressed` and visible state.
- Text fields retain native editing ownership. Window-list shortcuts apply only outside an ordinary editor except for the named editor commands.

## Non-goals and Safety Boundaries

- No public uTools API is assumed for enumerating or activating another application window.
- macOS exposes a session window reference, not an HWND. Only Windows renders and copies an HWND.
- No real window title modification, hidden background polling, simulated input, accessibility privilege escalation, arbitrary external write, or focus-protection workaround is allowed.
- Saved data is limited to user-created target metadata (including a retained target required by a stable slot) and platform-slot mappings in local plugin state. Live window titles remain transient runtime data.

## Acceptance Scenarios

1. Two browser windows with the same title resolve to a user choice rather than an arbitrary activation.
2. A minimized Windows target is restored before foreground activation is attempted.
3. Closing a saved target produces a safe unavailable result and opens the windows workbench from a global slot hotkey; a later unambiguous match may recover it.
4. Renaming an alias leaves a configured uTools shortcut slot intact.
5. Windows reports focus refusal clearly; macOS reports missing permission, then retries after user approval.
6. Editing a target does not intercept native text editing keys.
7. Entering the windows Tab does not scan until the user manually loads or refreshes.
8. After a manual load, a global slot hotkey with a warm cache activates the OS window without showing the EyPc transit window.
9. A local pin moves the target ahead of unpinned rows without changing its favorite or slot state; unpinned rows remain application-sorted.
10. macOS CoreGraphics results unwrap into real rows instead of an empty successful cache; browser/helper native surfaces that are not actionable application windows remain absent.
11. A stale slot reference that finds a new matching live window after one rescan activates it, refreshes the retained reference, and creates no blocking diagnostic.
12. A truly closed target is reported only after a healthy rescan finds no match; it clears the retained native reference and records `target-closed`. Permission, host invocation, focus, ambiguity, configuration, workbench-show, and post-success silent-hide failures remain blocking and visible.
13. A macOS window that remains in the Core Graphics list but lacks `AXWindowNumber` activates through a unique `_AXUIElementGetWindow` mapping; title/ordinal is used only when that private mapping is unavailable, and duplicate/unknown identity stays blocking.
14. A development run may clear and inspect bounded sanitized operation stages for an activation, while a real installed build renders no operation-trace module and requests no native trace.
15. Windows “页面置顶” restores, makes the real window topmost, and attempts foreground activation; macOS clearly blocks permanent third-party topmost while retaining “展开并前置”. Assigning a live row to a stable slot alone does not make it a favorite.
16. Two Chromium windows on different Spaces activate only through the selected CG window's unique Space and exact AX→CG match. The operation must confirm the application `AXFocusedWindow` maps back to that CG ID; an unbound multi-window process returns `space-unbound-multiwindow` without fronting the other window.
17. An unbound single-window process may use one process-frontmost retry; a successful Raise followed by readable `AXFocused=false` remains successful with an unavailable verification trace.
18. A target bound to several non-current Spaces returns `space-ambiguous`; a requested switch that is not confirmed returns `space-switch-timeout` and never continues to AX activation.
19. A stale preload revision produces `bridge-stale` before native activation. Development traces retain separate pre-initial and pre-retry aggregate snapshots without raw identity data.
20. A saved target whose sole same-PID window has a different title opens an explicit candidate confirmation and updates the locator only after that selection succeeds.
