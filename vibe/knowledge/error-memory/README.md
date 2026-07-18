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
