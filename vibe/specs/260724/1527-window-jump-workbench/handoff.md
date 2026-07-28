# Window Jump Workbench — Handoff

## Delivery State

`wj13-source-static-verified / host-validation-pending` — WJ-13 makes the CG-derived Space binding fresh and unique, limits process-frontmost to genuinely single-window owners, removes desktop walking/persisted learned bindings, gates stale preload revisions, and requires explicit rebind after title drift. Permitted static checks pass. Status: **待宿主验收**.

## Delivered Surface

- Domain/state: persistent local aliases/targets with independent favorite/pin, pinned-first/global application comparator, exact title matching, ten platform-separated slots, and shared [listSelection.ts](../../../../src/domain/listSelection.ts#L1) helpers in [windows.ts](../../../../src/domain/windows.ts#L1), [state.ts](../../../../src/domain/state.ts#L1), and [types.ts](../../../../src/domain/types.ts#L1).
- Native bridge: macOS validates CG ID + PID/app/title, resolves both direct Space masks plus reverse managed-Space evidence, switches only one remote binding and confirms it, then performs exact AX-title restore/frontmost/Raise. Missing binding uses a single-window-only fallback; multi-window unbound, multi-Space and timeout cases block with stable reason codes. Full desktop walk and persisted learned bindings are gone. Windows behavior is unchanged. See [preload/index.js](../../../../preload/index.js#L1), [public/preload.js](../../../../public/preload.js#L1), and [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1).
- Runtime/UI: capability revision `wj13-exact-space` blocks stale hosts; native reason codes remain visible; same-PID title drift opens candidate confirmation rather than auto-selecting; development traces render separate first/retry aggregate environment snapshots. Existing list/slot/pin/topmost behavior remains in [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) and [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1).
- Verification: canonical/public/dist preload parse and byte equality, TypeScript/Vue syntax parse, revision/stale-symbol scan, scoped diff whitespace, and code-link audit pass. Earlier WJ targeted suites remain historical. WJ-13 intentionally runs no tests, semantic typecheck, build, browser/uTools or native activation.

## User Validation Focus

Reconnect uTools and first confirm `bridge=wj13-exact-space`. Put two AiTools/Chromium windows on different Spaces and require the selected target to show unique binding → `switch-confirmed` → exact title → foreground/Raise, with neither walk nor process-frontmost. Rider may use the single-window fallback only when binding is genuinely absent, and `focus-state-mismatch` after successful Raise must still be success. An unbound multi-window owner must remain on the current desktop with `space-unbound-multiwindow`; multiple bindings and switch timeout must block. Change a saved title and confirm candidate selection is required before locator update. Then retain the prior closed-target, production-trace absence, Windows topmost and general workbench gates.

Durable prevention: [macos-cgwindowlist-cf-proxy-not-js-array.md](../../../../vibe/knowledge/error-memory/macos-cgwindowlist-cf-proxy-not-js-array.md#L1) records the verified CF proxy failure; [macos-cg-ax-window-identity-mismatch.md](../../../../vibe/knowledge/error-memory/macos-cg-ax-window-identity-mismatch.md#L1) points to the candidate cross-project prevention record for this activation mismatch; [utools-macos-ax-activation-misses-other-spaces.md](../../../../vibe/knowledge/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1) covers the off-Space activate path; [utools-mainhide-window-activation-diagnostics.md](../../../../vibe/knowledge/error-memory/utools-mainhide-window-activation-diagnostics.md#L1) now includes the candidate debug-trace production gate.

## Safety Reminder

Neither the plugin nor this task should attempt to grant macOS accessibility/screen-recording access, alter an application title, or bypass Windows foreground protection. Force terminate runs only after an explicit user confirm.
