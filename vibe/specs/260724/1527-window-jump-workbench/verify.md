# Window Jump Workbench — Verification Record

## Current Status

`wj15-exact-ax / AiTools-off-Space-host-verified` — WJ-14 adds an isolated JXA SkyLight route because the same exact target yielded no managed-Space binding inside the uTools Electron preload but one corroborated direct+reverse binding in an independent process. WJ-15 replaces Chromium-unsafe title/CG-ordinal selection with a unique `_AXUIElementGetWindow` mapping and exact `AXFocusedWindow` verification. A real uTools global-slot-2 run switched AiTools from a non-current Space and completed with the selected AX element focused. Production build/runtime validation and focused suites pass; negative cases, other applications, installed-production trace absence, Windows host behavior, close/terminate, and the unrelated full-suite baseline remain open.

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

## B-route SkyLight Space Switch Evidence

- Dependency: `koffi` in `package.json`; [scripts/prepare-utools-runtime.mjs](../../../../scripts/prepare-utools-runtime.mjs#L1) copies it into plugin `node_modules`.
- Preloads remain byte-identical and include `trySwitchMacosSpaceByCGS` wired in `activateWindow` before osascript; AX-fallback refs `pid:ordinal:0` skip the helper.
- Development traces prepend a sanitized `space` step with allowlisted details (`switched` / `ax-fallback` / `no-api` / `empty-spaces` / …). The short “窗口激活被阻断” panel is hidden while the development operation-trace panel is enabled; each trace row exposes a one-line plain-text summary for copy.
- Local Node/`koffi` probe on a live CG window: Space switch returned `ok: true`; AX-fallback ref returned skip. No titles/PIDs/native refs were persisted.
- CodeNote pathway/error memory: [macos-window-activation.md](../../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1) · [utools-macos-ax-activation-misses-other-spaces.md](../../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1).
- Host still reported `activation-not-found` (process ok → target not-found after rescan) before the richer `space` detail UI; pending re-acceptance with the one-line copy.
- 2026-07-27 user acceptance对照（开发追踪）: 同桌面「展开并前置」成功；跨桌面「全局槽 1」两次均 `space=failed:empty-spaces` → `activation-not-found`（`#4`/`#10`），`process=ok` 且 `refresh`/`resolve` 仍命中 CG 行。结论：AX 路径可用；失败点是 `SLSCopySpacesForWindows` 对该 off-Space/off-display CGWindowID 返回空，Space 切换未发生。
- 2026-07-27 WJ-11 repair: mask `0x7fffffff` → `0x7`; when primary lookup is empty, reverse-scan `SLSCopyManagedDisplaySpaces` + `SLSCopyWindowsWithOptionsAndTags` then switch. Preloads byte-identical; `node --check` ok. Host off-Space slot re-acceptance still required.
- 2026-07-27 host retest after mask/reverse-scan: progressed from `empty-spaces` to `space=failed:no-display` (Space ID resolved; `SLSCopyManagedDisplayForSpace` empty). Repair: prefer retained `Display Identifier` from managed-display Spaces map for `SLSManagedDisplaySetCurrentSpace`, keep SkyLight copy as fallback.
- 2026-07-27 host still `no-display` after CFRetain path; user asked for cache / stable window binding. Repair: drop CFDictionary/`SLSCopyManagedDisplayForSpace`; rebuild session `CGWindowNumber → {spaceId,displayUuid}` from managed-display **plist XML** + per-Space window lists on `listWindows` and activate miss; switch with `CFStringCreateWithCString(displayUuid)`.
- 2026-07-27 user: cache must cover every display/desktop, not only each display's current Space; refresh reloads all. Repair: bind from `CGWindowList(OptionAll)` + inventory via `SLSCopySpacesForWindows` against full managed Space map; remove per-Space tags path.
- 2026-07-27 host regression: same-display slot also `space=failed:no-display` → `activation-not-found`. Root cause: uTools `dist/preload.js` was stale and still called `SLSCopyManagedDisplayForSpace` (host empty → `no-display`). Repair: re-prepare dist; parse only each display's `Spaces` id64 (no next-display Current Space leak); same-Space returns `space=skipped:current`; activate miss reverse-scans via `SLSCopyWindowsWithOptionsAndTags` then `CFStringCreateWithCString(displayUuid)`. Local probe: current→`current`, off-Space→`switched`. Host re-acceptance after `pnpm run serve` / uTools reconnect required.
- 2026-07-27 host after reconnect: same visible desktop ok; other desktop on same/other display still `space=failed:empty-spaces` → `activation-not-found`. Diagnosis: per-window `SLSCopySpacesForWindows` misses off-current targets on host; `SLSCopyWindowsWithOptionsAndTags` per managed Space does list them. Repair: rebuild cache primarily by CFDictionary walk of managed displays + tags window lists (off-current included); supplement inventory misses via `SLSCopySpacesForWindows`. Local probe: 25 off-current bindings, same→`current`, off→`switched`. Host re-acceptance pending.
- 2026-07-27 host still `empty-spaces` on hidden desktop after tags-primary cache. Many CG inventory IDs are absent from tags (local: 134/497 overlap); binding miss leaves AX on the wrong Space. Repair: on AX `not-found`, walk every non-current managed Space via `SLSManagedDisplaySetCurrentSpace`, retry AX, restore prior currents on failure (`space=ok:walked`). Host re-acceptance pending after serve/reconnect.
- 2026-07-27 user: pre-cache all desktops; fixed windows must not walk every time. Refresh snapshots every managed Space + tags bindings; successful switch/walk persists `eypc/macos-window-spaces/v1` by CG id and `pid+title` (cap 200). Later activates prefer learned/session cache → direct `switched`/`current`; walk remains last resort only.
- 2026-07-27 continue SIP-safe route: remember bindings only after AX `activated` (not on switch alone); stale cache that yields AX `not-found` is forgotten then walked (skip already-tried Space); settle 80→120ms. Host re-acceptance pending after serve/reconnect.
- 2026-07-27 host re-acceptance: after the `empty-spaces` bounded owning-process Accessibility `frontmost` retry was added, the user confirmed cross-Space “展开并前置” succeeds. This validates that recovery only; closed-target, production-build, and remaining host gates stay pending.
- 2026-07-27 user authorized a development-only trace exception: Runtime now records and displays the selected target title at the beginning of each in-memory trace, including its one-line copy form. Application name, PID, handle, native reference, raw host output, diagnostics, storage, and production builds remain excluded. Source and UI fixture updated; uTools reload/retest remains user-owned.
- 2026-07-27 user trace comparison: `AiTools` remains `target=not-found` after both `space=failed:empty-spaces` attempts and the bounded `space=ok:process-frontmost` fallback, so it never reaches AX restore/foreground/raise. The Rider target initially misses but resolves after the healthy rescan, then completes foreground and `AXRaise`; a readable post-raise `AXFocused=false` produced a false `focus-denied` despite user-observed activation. Repair: trace the process-frontmost fallback explicitly and treat that post-raise focus attribute mismatch as `verify=unavailable:focus-state-mismatch` without overturning activation. AiTools still requires host re-acceptance.
- 2026-07-27 authorized read-only aggregate comparison after those traces: System Events exposed 14 readable AX windows and Core Graphics exposed 542 windows, but neither supplied a title match for either test target at probe time. No titles, application names, PIDs, native references, window actions, desktop switches, or permission changes were emitted. This confirms the probe was no longer concurrent with the successful Rider retry and cannot explain the target-specific divergence by itself.
- 2026-07-27 rejected source candidate: a 250ms post-frontmost AX delay was considered from Rider's timing divergence but removed before acceptance because no replayable preload-environment snapshot verified it. Follow-up requires a read-only snapshot captured inside the authorized uTools preload context, then simulation before any activation-path change.

## WJ-12 Read-only Environment Snapshot Evidence

- User requirement: instead of guessing fixes from live host tests, capture a read-only snapshot of the macOS environment (CG/AX/Space bindings) from within the uTools preload context, without activating windows or modifying system state. Store the snapshot only in current session memory and display it in the trace sidebar for later review.
- Implementation: `MACOS_ENV_SNAPSHOT_SCRIPT` is a read-only JXA script that queries `CGWindowListCopyWindowInfo`, `NSRunningApplication`, and System Events AX for aggregate target/process evidence. `inspectWindowEnvironment(target)` in [preload/index.js](../../../../preload/index.js#L1) adds fresh Space binding count/source/current-state evidence through the same read-only resolver. The result includes bridge revision, identity availability, app/CG target match, owning CG window count, AX target/window count, and sanitized Space state; no raw identity enters Runtime diagnostics.
- Platform bridge: [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1) passes `inspectEnvironment` through to the renderer with an unsupported fallback for browser preview.
- Runtime integration: [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) captures separate `pre-initial` and `pre-retry` snapshots before each native call in a development renderer, retains at most three inside the bounded operation record, and never writes them to `AppState`/storage.
- UI: [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1) labels each phase and renders revision plus aggregate CG/AX/Space evidence in both the trace sidebar and its copyable single line. Existing `.window-operation-trace-env` styling is reused.
- `public/preload.js` mirrors all preload changes (script + function + export).
- Historical WJ-12 evidence: `tests/ui/windowsDiagnostics.test.ts` previously covered snapshot presence/absence and all 14 tests plus `vue-tsc --noEmit` passed at that revision. WJ-13 changed the phase/label contract and did not rerun or modify those tests.
- No activation, close, terminate, title mutation, Space switch, permission change, or external write is performed by the snapshot. No titles, application names, PIDs, native references, or raw host output enter the snapshot; only aggregate match counts and binding status are returned.
- The snapshot will reveal why Rider (CG match > 0, AX match > 0, Space bound) succeeds while AiTools (CG match > 0 but AX match = 0, or Space unbound) fails — providing replayable evidence for targeted simulation before any activation-path change.
- Historical WJ-12 handoff required reconnecting WJ-13 and replaying AiTools/Rider. AiTools is now accepted through WJ-15; Rider and negative-case replay remain residual gates below.

## WJ-13 Exact Space Binding Evidence

- User traces established two different failure shapes: AiTools remained `empty-spaces → process-frontmost → target=not-found`, while Rider reached target/foreground/Raise and then suffered a false focus denial. Read-only aggregate probes found one exact CG target for each, two actionable owner windows for AiTools versus one for Rider, and zero current System Events AX matches for both. This supports “Space switch failed first; multiple browser windows make the process-level fallback nondeterministic,” rather than “multiple windows prevent CG identification.”
- A fresh standalone SkyLight probe resolved a Space for both targets with `0x7` and `0x7fffffff`. Because this observation was outside the logged uTools preload moment, it does not prove which loaded bridge/cache caused `empty-spaces`; WJ-13 therefore adds an explicit revision gate and per-attempt preload-context evidence instead of claiming an OS absence.
- [preload/index.js](../../../../preload/index.js#L1) now validates CG ID + PID/app/title before Space work; fresh resolution unions both direct masks with reverse managed-Space lookup and deduplicates bindings. Current Space skips, one remote Space switches and must confirm within two seconds, and multiple remote Spaces return `space-ambiguous`.
- No binding is no longer an application-wide correctness path: one owner window may use `single-window-frontmost`; more than one returns `space-unbound-multiwindow`. The old all-Space walk is removed. Session cache is observational only, invalidated on native miss, and no learned PID/title/CG/Space binding is persisted. The exact obsolete local cache key is removed once when supported.
- [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) requires bridge revision `wj13-exact-space`, maps native reason codes to stable blocking diagnostics, and no longer activates a sole same-PID window whose title differs. Such rows open the existing candidate surface and update app/title/native reference only after explicit successful selection.
- Current source retains `verify=unavailable:focus-state-mismatch` as success after foreground and Raise. Apple documents [`kAXRaiseAction`](https://developer.apple.com/documentation/applicationservices/kaxraiseaction) as raising within the containing application's allowed ordering, so the readable focus attribute alone is not treated as authoritative failure.
- WJ-13 static closeout passes: `node --check` for canonical/public/dist preload; canonical/public/dist byte equality; TypeScript syntax parsing for the platform and Runtime changes; Vue SFC parsing through the installed pnpm compiler path; exact `wj13-exact-space` presence in both sides; absence of the removed walk/learned-binding symbols; scoped `git diff --check`; and the repository code-link audit. A first top-level `require('@vue/compiler-sfc')` failed because the dependency is not hoisted, then the existing pnpm package path passed without installing anything. No activation, Space switch, permission change, automated test, semantic typecheck, build or browser/uTools validation ran.

## WJ-14 Isolated SkyLight Evidence

- In the failing host context, the selected target had one exact CG match, two owner CG windows, zero current AX-title matches, and zero in-process Space bindings. The same SkyLight functions, dependency version/bytes, architecture, PID, CG reference, and direct query masks resolved one Space outside Electron; this disproved “the OS has no binding” and isolated the failure to host-process context.
- [preload/index.js](../../../../preload/index.js#L1) now keeps the in-process `koffi` route as the first attempt but falls back to a fresh `osascript -l JavaScript` process when it returns no binding. The child revalidates app/PID/CG/title, builds the current managed-display map, unions `SLSCopySpacesForWindows` masks `0x7` and `0x7fffffff` with `SLSCopyWindowsWithOptionsAndTags` reverse evidence, and emits only allowlisted aggregate state.
- The isolated child switches only one remote binding through `SLSManagedDisplaySetCurrentSpace` and polls the display's `Current Space` for at most two seconds. Empty, ambiguous, title-changed, and timeout cases remain blocking. No binding, Space, display, PID, or CG identifier crosses into Runtime diagnostics.
- Aggregate standalone and host evidence both resolved `managed=7`, direct=1, reverse=1, binding=1. The real operation's pre-initial snapshot reported `rev=wj15-exact-ax`, `bridge=isolated-jxa`, `binding=bound`, `source=isolated-direct+reverse`, and `same=false`.
- uTools' [official debugging guide](https://www.u-tools.cn/docs/developer/basic/debug-plugin.html) documents that preload changes do not hot reload. The old bridge remained active while a child float kept the plugin session alive; after a normal plugin exit/re-entry, the actual host capability changed to WJ-14/WJ-15 without restarting or killing uTools.

## WJ-15 Exact AX-to-CG Focus Evidence

- After the confirmed Space switch, System Events exposed four Edge AX windows but zero target-title matches and zero `AXWindowNumber` matches. The prior CG-order fallback could therefore select a sibling Chromium window even though the correct target was now visible.
- A read-only private-AX probe called `_AXUIElementGetWindow` for all four raw AX elements: four IDs resolved, zero calls failed, and exactly one equaled the selected CG ID. The signature is corroborated by AeroSpace's [private API declaration](https://github.com/nikitabobko/AeroSpace/blob/main/Sources/PrivateApi/include/private.h#L23-L26) and its [native focus sequence](https://github.com/nikitabobko/AeroSpace/blob/main/Sources/AppBundle/tree/MacApp.swift#L129-L149).
- [preload/index.js](../../../../preload/index.js#L1) now resolves the exact AX element before System Events title fallback. It unminimizes where readable, sets window main, raises, activates the `NSRunningApplication`, then writes the exact element to application `AXFocusedWindow`/`AXMainWindow` and retries within a bounded 290ms envelope. Success requires reading `AXFocusedWindow` and mapping it back to the requested CG ID; an exact-match focus failure returns `failed` and cannot fall through to a sibling window.
- Chromium reports application `AXFocusedWindow` as not settable, yet the real host accepts the exact AX element and returns it on the following read. This observed behavior is guarded by exact identity plus read-back; it is not generalized to arbitrary attributes or used to bypass Accessibility authorization.
- Real uTools proof: global slot 2, target AiTools, initially non-current Space. The development trace completed `entry/capability/cache → isolated-space-bridge → direct-unique → switch-confirmed → process → ax-cg-id-match → restore skipped → foreground → raise → ax-focused-window → native → visibility`, all successful. Computer Use reported `Window: "AiTools", App: Microsoft Edge`; a separate read-only check confirmed the target Space current, Edge frontmost, and focused AX element equal to the selected CG ID.
- The renderer/runtime allowlists and UI labels now retain `isolated-space-bridge`, `ax-cg-id-match`, and `ax-focused-window`; bridge revision `wj15-exact-ax` blocks stale preload sessions.

## WJ-15 Automated and Build Evidence

- `pnpm run build` passed semantic typecheck, Vite production build, preload/runtime preparation, and `validate:utools`.
- `tests/platform/eypcPlatform.test.ts` plus `tests/ui/windowsDiagnostics.test.ts`: 35/35 passed. The platform suite asserts the private mapping/focus path and canonical/public preload identity.
- Named `tests/runtime/action.test.ts` window-activation-diagnostics group: 11/11 passed, 135 skipped. WJ-13-era fixtures now use the shared bridge revision constant and retain the user-authorized target title while continuing to exclude app identity/native refs.
- Canonical/public/dist preload syntax and byte equality, `validate:utools`, scoped `git diff --check`, and the changed-Markdown code-link audit all pass.
- An incorrectly formed selector also ran the entire current suite once: 507 passed and 76 failed. Most failures were outside Window Jump; the one stale WJ expectation was updated before the focused suites passed. That accidental broad run is not an acceptance gate and does not establish an all-green repository baseline.

## UI Layout Compact (2026-07-27)

- Source delivery (not host-verified): [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1) and window styles in [app.css](../../../../src/styles/app.css#L1) move stable slots to a left collapsible equal-height rail, move activation diagnostics / DEV operation traces to a right collapsible log rail (default collapsed; blocking diagnostics auto-expand), and keep the window list as the primary flex surface under a compact toolbar.
- Empty-slot click opens an anchored picker over current rows and dispatches `windows.slot.assign` with `rowId`; assigned-slot click still focuses; Shift clears; context menu configures.
- Keyboard: existing `windows.list.up/down` and `windows.actions.open` remain; `windows.slot.assign.1`…`.10` bind `Ctrl+1`…`Ctrl+9`/`Ctrl+0` on the Windows tab to assign the focused row. window-search input allowlist includes those chords.
- Action panel: long displayName/path titles ellipsize in-place (`overflow-x: hidden`, `text-overflow: ellipsis`); full identity stays on hover tooltip/`title`. Open-actions grid is list-primary (`1fr` + bounded `min(320px, 42%)` rail) so a long path cannot widen the page or invent a horizontal scrollbar.
- Diagnostics UI contracts (`data-role`, alert/status semantics, sanitization, clear/copy) are preserved inside the log rail (`v-show`). Tests/typecheck/build/uTools/screenshots were not run (`未校验，待用户验收`).

## Host Acceptance State

Accepted on 2026-07-28:

1. Actual host capability/environment revision is `wj15-exact-ax`; the pre-initial snapshot used the isolated JXA bridge and one corroborated remote binding.
2. AiTools/Chromium on a non-current Space activated through global slot 2 with `switch-confirmed → ax-cg-id-match → ax-focused-window`; the selected window, not merely Edge or a sibling, became focused.
3. The operation used neither process-frontmost nor desktop walking, and the temporarily disabled Codex float was restored after validation.

Residual host gates:

1. Repeat on another multi-window Chromium profile/application and on the single-window Rider route.
2. Force/observe unbound multi-window, ambiguous binding, switch timeout, exact-AX-focus failure, title drift/rebind, and truly closed target; each must retain its fail-closed result.
3. Confirm production-installed trace absence and retain Windows normal/minimized/page-topmost plus close/confirm-terminate acceptance.
4. On macOS, permanent page-topmost remains unsupported. Any other unverified outcome must preserve only stable sanitized evidence.

## Authorized Read-only Local Evidence

- The exact current `MACOS_WINDOW_LIST_SCRIPT` completed in 159 ms and returned 22 actionable rows across 14 applications.
- The exact current `MACOS_AX_WINDOW_LIST_SCRIPT` completed in 2432 ms and returned 13 rows across 10 applications.
- Only aggregate status/count/duration was emitted. No window title, application name, PID, native reference, activation, close, termination, permission mutation, or external write was performed.

## Required User-owned Validation

- Unit, production-build, and uTools manifest/runtime gates.
- Silent slot jump / missing-target workbench / manual Tab load (no auto-scan).
- With a nonempty window query, toolbar load/refresh and `Ctrl+R` clear the query and reveal the refreshed complete list; an automatic cache-miss rescan does not clear it.
- macOS: Screen Recording + Accessibility; refresh prefers CG for other Spaces/displays and falls back to AX current-Space list when CG has no titled windows; verify exact AX→CG mapping/focus on additional applications, compatibility title/ordinal ambiguity when private mapping is unavailable, AX close, and confirm-gated force terminate. “页面置顶” must not claim persistent third-party success.
- Windows: EnumWindows across virtual desktops/displays; cloaked shells absent; `WM_CLOSE` then confirm kill.
- Windows: browser/helper/native child handles are absent while each real main browser window remains; pin/unpin and application ordering persist across a plugin reopen.
- `Space` toggles multi-select and advances; Esc clears selection before closing the action panel; right-click / `c-→` opens single vs multi action surface.
- `c-del` / `c-bs` OS-closes selection/focus; failures prompt force terminate.
- Ports/Favorites/MQTT Space advance matches Workbench List Taste; ports right-click on a selected row opens multi drawer.
- Window list `↑↓` with action panel open keeps list ownership and scrolls the focused row.
- Compact titles: list secondary shows application name only; HWND is absent from the row; action-panel titles ellipsize; multi-select subtitle collapses to “A、B 等 N 个”; hover Tooltip restores full displayName/title/app/HWND.

## Verification Boundary

WJ-15 did run the focused suites, typecheck/production build/uTools runtime validator, isolated privacy-safe probes, and two real AiTools off-Space global-slot activations. It did not run Windows host enumeration/activation/topmost, target close/terminate, permission changes, title changes, installed-production trace inspection, or the residual negative cases. The accidental broad test invocation is recorded above as a non-gate failure and must not be presented as a green full suite.
