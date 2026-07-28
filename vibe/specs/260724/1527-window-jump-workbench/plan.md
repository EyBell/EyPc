# Window Jump Workbench — Plan

1. Add persistent target/slot contracts and normalizers without persisting live native windows.
2. Extend the preload/platform bridge with fixed, bounded Windows and macOS adapters plus unsupported-stale fallback.
3. Add the disabled feature, fixed uTools commands, route parsing, runtime resolution, focus-safe activation, and keyboard bindings.
4. Build the dense accessible window list and action/editor layers, reusing EyPc list conventions.
5. Synchronize requirement, architecture, status, task evidence, and code links; record user-owned validation gaps.
6. Repair the verified CoreGraphics bridge regression, add platform-native actionable-window filters, then project one persisted local-pin state over a pinned-first/application-sorted list.
7. WJ-08: remove duplicate `mainHide`/Runtime pre-hiding, route disabled slots into visible Runtime diagnostics, recover stale native references through one healthy rescan, and expose bounded session-only diagnostics in the workbench.
8. WJ-09: replace the invalid macOS CG-window-ID → `AXWindowNumber` activation assumption with title-plus-fresh-ordinal AX resolution, preserving ambiguity blocking and no-title-interpolation boundaries.
9. WJ-10: research platform-native restore/frontmost/topmost contracts; add a development-only sanitized operation trace, make Windows `SetWindowPos(HWND_TOPMOST)` a separate page-topmost action, keep macOS permanent topmost explicitly unsupported, and prevent stable-slot assignment from implicitly favoriting a live row.
10. WJ-11/WJ-12: introduce the CG-derived SkyLight Space switch and a read-only preload-context environment snapshot, then retain their failed host attempts as historical evidence rather than accepted behavior.
11. WJ-13: revalidate exact CG identity; resolve dual-mask direct plus managed-Space reverse evidence afresh; switch/confirm only one remote binding; use process-frontmost only for an unbound one-window owner; block unbound multi-window, multiple binding and timeout cases; remove desktop walking and learned binding persistence.
12. Gate the renderer on bridge revision `wj13-exact-space`, preserve native Space reason codes, capture separate initial/retry aggregate snapshots, and require explicit candidate rebind when a same-PID window title changes.
13. Sync the Controlled/canonical/current documents, prepare all preload mirrors, and run only non-runtime static parse/mirror/revision/stale-symbol/diff checks before user-owned host acceptance.
14. WJ-14: when in-process SkyLight returns no binding inside the uTools Electron preload, run the same identity revalidation and direct+reverse lookup in a fresh JXA process; switch only one binding and confirm it before AX activation.
15. WJ-15: map raw AX windows to CG IDs with `_AXUIElementGetWindow`, focus the exact element through application `AXFocusedWindow` plus main/Raise/activation, and verify the focused AX element maps back to the selected CG ID.
16. Sync the WJ-15 bridge revision, trace vocabulary, project/canonical/memory docs, preload mirrors, focused tests, build/runtime validation, and scoped real global-slot evidence.

## Non-negotiable Execution Constraints

- Preserve unrelated dirty files and changes.
- For WJ-08/WJ-10, run only the user-authorized platform-bridge suite, named `window activation diagnostics` runtime group, and diagnostics UI suite. Do not use the slow aggregate action suite as a gate, and do not run full test, typecheck, build, browser/screenshot, or real uTools-host activation in this implementation evidence.
- Keep all platform calls initiated by an explicit user interaction or uTools feature entry, with bounded process execution and no shell interpolation of user-controlled titles.
- WJ-09 may use a bounded child-environment value for a normalized local title, but never places it in a shell command or JXA source; it must remain absent from diagnostics, storage, and logs.
- WJ-10 native traces may contain only a fixed stage/outcome vocabulary and may be requested only from a development renderer; production UI and native calls omit that path.
- WJ-13 never selects the first of multiple Space/window candidates, never walks all desktops, and never persists CG/PID/title/Space/display bindings. A same-PID title mismatch requires explicit user confirmation.
- WJ-13 does not add, modify, or run automated tests, typecheck, build, browser/UI automation, or live uTools activation; only static checks and user-owned host validation may be claimed.
- WJ-15 supersedes that increment-local restriction because the user explicitly authorized online research, probes, and real host validation. Native actions remain limited to reversible Space selection and exact focus of the already selected target; no close, terminate, permission, title, or simulated-input action is allowed.
