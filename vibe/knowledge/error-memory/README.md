# EyPc Structured Error Memory

Tool: codex

Project-specific reusable failure records live here. The legacy [error-memory index](../error-memory.md#L1) remains the project entry point.


Reusable uTools host/preload/window/HMR/packaging/Esc/`mainHide`/hotkey failures are owned by the CodeNote [uTools module error memory](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/README.md#L1). Local `utools-*.md` files below are thin pointers only.

## Verified Project Consensus

| Consensus ID | Scope | Fixed Conclusion | Authority |
| --- | --- | --- | --- |
| `EYPC-UTOOLS-HOST-001` | uTools preload/Renderer host boundary and shortcut configuration | Private synchronous host IPC can block the plugin before Console; shortcut readback stays deleted and configuration remains redirect-only. | [CodeNote error memory](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-private-sync-ipc-entry-freeze.md#L1) · [local pointer](utools-private-sync-ipc-entry-freeze.md#L1) · [project rule](../../rules/README.md#L1) |

## Records

- [chromium-placeholder-window-title-noise.md](chromium-placeholder-window-title-noise.md#L1): candidate rule that Chromium `Window` placeholders and Win32 host/IME shells must be filtered from jumpable live windows (title==appName and non-Chromium `Window` are kept; size thresholds banned).
- [macos-ax-misses-other-spaces.md](macos-ax-misses-other-spaces.md#L1): candidate rule that macOS Window Jump inventory must use `CGWindowList` (Screen Recording) because System Events AX typically misses other Spaces/displays.
- [windows-actions-close-vs-os-close.md](windows-actions-close-vs-os-close.md#L1): candidate rule that `windows.actions.close` dismisses the action panel while `windows.close` / `windows.close.force` close or force-terminate OS windows.
- [window-list-focus-steal-on-actions-open.md](window-list-focus-steal-on-actions-open.md#L1): candidate rule that list `↑↓` and action-panel open must use separate focus-request signals so arrows do not steal keyboard ownership to the first panel button.
- [utools-mainhide-window-activation-diagnostics.md](utools-mainhide-window-activation-diagnostics.md#L1): thin pointer → CodeNote `mainHide` activation diagnostics.
- [utools-escape-capture-over-quick-jump.md](utools-escape-capture-over-quick-jump.md#L1): thin pointer → CodeNote Escape capture over transient layers.
- [quick-favorites-stale-target.md](quick-favorites-stale-target.md#L1): Quick entry must clear management-page transient targets before accepting commands.
- [dialog-focus-restore-render-race.md](dialog-focus-restore-render-race.md#L1): dialog and side-layer focus handoff must survive disappearing triggers, adjacent Vue renders and visibility transitions.
- [command-panel-explicit-target-precedence.md](command-panel-explicit-target-precedence.md#L1): an explicit row/context target must replace an old frozen panel target and invalid explicit IDs must fail.
- [delegated-operation-tooltip-controls.md](delegated-operation-tooltip-controls.md#L1): disabled and nested form controls require captured delegated help with control-local labels.
- [modified-arrow-handler-command-conflict.md](modified-arrow-handler-command-conflict.md#L1): plain row-arrow listeners and row-only panel handlers must not swallow modified left/right command chords.
- [pnpm-store-build-policy-mismatch.md](pnpm-store-build-policy-mismatch.md#L1): dependency addition can fail when the installed pnpm store and declared package-manager line diverge.
- [codex-gui-nvm-launcher-path.md](codex-gui-nvm-launcher-path.md#L1): a GUI-hosted Codex App Server must separate CLI discovery from runtime resolution; POSIX wrappers and Windows npm/Volta shims cannot rely on shell PATH or unsafe shell execution.
- [codex-gui-pac-proxy-timeout.md](codex-gui-pac-proxy-timeout.md#L1): a macOS system-proxy toggle may represent a PAC that the GUI child does not consume; derive only the bounded static loopback subset into the Codex child.
- [codex-task-count-list-projection-divergence.md](codex-task-count-list-projection-divergence.md#L1): task counts, rendered rows and eligible actions must derive from the same final arrays; never hide a bounded source behind a per-group consumer cap.
- [codex-app-server-session-state-survives-exit.md](codex-app-server-session-state-survives-exit.md#L1): normal close and unexpected child exit must share one generation-owned cleanup for aliases, raw-ID caches and background cursors.
- [codex-cross-process-notloaded-is-not-completion.md](codex-cross-process-notloaded-is-not-completion.md#L1): a separate App Server's `notLoaded`/recency never proves state or question time; use exact thread-active plus latest-Turn status/startedAt and degrade only the failed row.
- [codex-desktop-unread-missing-field-fallback.md](codex-desktop-unread-missing-field-fallback.md#L1): candidate rule that an optional Desktop live unread field must not erase confirmed persisted unread; explicit read-state wins and request-name separator normalization remains bound to exact desktop-live active.
- [codex-preload-capability-version-skew.md](codex-preload-capability-version-skew.md#L1): an additive Renderer/preload mismatch must use a neutral desktop compatibility state and let a successful App Server round-trip reconcile readiness atomically.
- [codex-float-bridge-mock-contract-drift.md](codex-float-bridge-mock-contract-drift.md#L1): candidate rule that every required runtime-contract member must be mirrored by its contextually typed test fixtures before typecheck.
- [codex-task-row-action-replacement.md](codex-task-row-action-replacement.md#L1): superseded historical record; current V2 explicitly removes acknowledgement, while the reusable lesson is to verify the current state/action matrix.
- [codex-archive-revalidation-fail-open.md](codex-archive-revalidation-fail-open.md#L1): every product-archivable row requires exact identity/status/recency/revision/shape/latest-Turn evidence; active/inProgress/interrupted fail closed, unknown adds a warning, and malformed or changed rereads never mutate.
- [codex-coupled-color-editor-atomicity.md](codex-coupled-color-editor-atomicity.md#L1): superseded historical record of the paired-card editor; RAW-071 now uses independent water-ball, card and status-signal targets with direct persistence and no color validation/rollback gate.
- [codex-display-label-fallback-precedence.md](codex-display-label-fallback-precedence.md#L1): candidate rule that a valid original name must be normalized before optional alias/display fallbacks, with one primary row label and both values retained for search/detail.
- [codex-selection-state-needs-structural-contrast.md](codex-selection-state-needs-structural-contrast.md#L1): candidate rule that dense-list selection needs a named but non-reflowing mode cue, broad stable selector, preserved status identity, nonmember de-emphasis and deterministic row/button key ownership.
- [codex-control-owned-source-feedback.md](codex-control-owned-source-feedback.md#L1): candidate rule that action source/availability belongs on the stateful control and its focus/hover help, not as duplicate dense-row tail text.
- [codex-water-ring-layer-separation.md](codex-water-ring-layer-separation.md#L1): candidate rule to inventory data-owned, component-decorative and ancestor interaction circles before removing a water-ball ring; preserve the Weekly progress indicator, remove static rim/glow/focus circles and replace accessibility feedback without another ring.
- [codex-water-preview-renderer-divergence.md](codex-water-preview-renderer-divergence.md#L1): candidate rule that configuration previews must reuse the real water component and its existing wave layers rather than rebuilding or simplifying them.
- [codex-water-palette-mode-noop.md](codex-water-palette-mode-noop.md#L1): candidate rule that each named water palette must map to visibly distinct shared-renderer layers rather than collapse to the same A/B treatment.
- [codex-expanded-card-theme-token-divergence.md](codex-expanded-card-theme-token-divergence.md#L1): candidate rule that a complex expanded panel needs its own persisted theme object and shared preview/runtime resolver rather than reusing compact-skin colors.
- [codex-provider-status-display-normalization.md](codex-provider-status-display-normalization.md#L1): candidate rule to normalize provider status and action capability together at the domain card projection, keeping raw evidence only for diagnostics and Host revalidation so equivalent product states cannot flash different actions.
- [codex-completion-transition-hysteresis.md](codex-completion-transition-hysteresis.md#L1): candidate rule to publish completed-read returns to unread/ongoing immediately and stabilize running-to-terminal with one Controller-owned, per-task, interruptible, user-configured presentation hold (default 1500ms) shared by cards, counts and action capability; never use the delay as completion evidence.
- [codex-completed-unread-explicit-acknowledgement.md](codex-completed-unread-explicit-acknowledgement.md#L1): candidate rule that only the explicit completed-unread compact/global command locally acknowledges its exact completion revision; waiting-input and generic open remain navigation-only, and no Codex-native unread state is written.
- [design-preference-index-tag-limit.md](design-preference-index-tag-limit.md#L1): stable preference-index entries must keep tags within the schema limit before the UI preference gate can issue a receipt.
- [utools-dev-float-entry-not-hmr.md](utools-dev-float-entry-not-hmr.md#L1): thin pointer → CodeNote child-window Vite HMR.
- [utools-private-sync-ipc-entry-freeze.md](utools-private-sync-ipc-entry-freeze.md#L1): thin pointer → CodeNote private sync IPC entry freeze / redirect-only.
- [vue-nexttick-ref-null-narrowing.md](vue-nexttick-ref-null-narrowing.md#L1): verified rule to capture and guard nullable Vue refs once inside asynchronous callbacks instead of relying on optional chaining to narrow later accesses.
- [typescript-number-isfinite-optional-narrowing.md](typescript-number-isfinite-optional-narrowing.md#L1): candidate rule that `Number.isFinite` is a runtime check rather than a TypeScript narrowing predicate for optional numeric values.
