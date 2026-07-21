# EyPc Structured Error Memory

Tool: codex

Project-specific reusable failure records live here. The legacy [error-memory index](../error-memory.md#L1) remains the project entry point.

- [favorite-graph-normalization.md](favorite-graph-normalization.md#L1): malformed duplicate/orphan/self/cyclic favorite metadata must be normalized before traversal.
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
- [codex-preload-capability-version-skew.md](codex-preload-capability-version-skew.md#L1): an additive Renderer/preload mismatch must use a neutral desktop compatibility state and let a successful App Server round-trip reconcile readiness atomically.
- [codex-task-row-action-replacement.md](codex-task-row-action-replacement.md#L1): superseded historical record; current V2 explicitly removes acknowledgement, while the reusable lesson is to verify the current state/action matrix.
- [codex-archive-revalidation-fail-open.md](codex-archive-revalidation-fail-open.md#L1): every non-active true archive must require exact identity/status/recency/revision/shape/latest-Turn evidence; unknown adds a warning and malformed or changed rereads fail closed.
