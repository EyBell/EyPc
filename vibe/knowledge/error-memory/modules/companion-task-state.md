# Companion Task State Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

Link-only route for Codex/Claude canonical phase、Turn/Goal causality、root/Side aggregation、unread、inventory membership、projection and publication failures. It does not own product requirements or runtime state.

## Current Authorities And Routes

- [Controlled task-state specification](../../../specs/260810/1155-install-runtime-diagnostics/spec.md#L1)
- [Product requirements](../../../specs/PRODUCT_REQUIREMENTS.md#L1)
- [Architecture](../../ARCHITECTURE.md#L1)
- [Verification](../../../specs/260810/1155-install-runtime-diagnostics/verify.md#L1)

## Primary Error Records

- [App Server state survives exit](../codex-app-server-session-state-survives-exit.md#L1)
- [Completed-unread acknowledgement (superseded)](../codex-completed-unread-explicit-acknowledgement.md#L1)
- [Completion hysteresis (superseded)](../codex-completion-transition-hysteresis.md#L1)
- [Counter and timestamp units in one comparison set](../comparison-set-mixing-counter-and-timestamp-units.md#L1)
- [Cross-process notLoaded is not completion](../codex-cross-process-notloaded-is-not-completion.md#L1)
- [Desktop unread missing-field fallback](../codex-desktop-unread-missing-field-fallback.md#L1)
- [Detection recorded without a repair path](../detection-recorded-without-any-repair-path.md#L1)
- [Explicit archive bypasses inventory quarantine](../codex-explicit-archive-event-bypasses-inventory-quarantine.md#L1)
- [Fixed debounce delays terminal confirmation](../codex-fixed-debounce-delays-terminal-confirmation.md#L1)
- [Inventory dropout is not deletion](../codex-inventory-dropout-is-not-task-deletion.md#L1)
- [Pending user request overrides idle](../codex-pending-user-request-overrides-idle-runtime.md#L1)
- [Provider status display normalization](../codex-provider-status-display-normalization.md#L1)
- [Read state must not replay activity](../codex-read-state-must-not-replay-activity.md#L1)
- [Stale live active ordering history (superseded)](../codex-stale-live-active-needs-completion-order.md#L1)
- [Stale live unread false blocks completion unread](../codex-stale-live-unread-false-blocks-completion-unread.md#L1)
- [Task count/list projection convergence](../codex-task-count-list-projection-divergence.md#L1)
- [Task-state version skew degrades atomically](../codex-task-state-version-skew-must-degrade-atomically.md#L1)
- [Task-switch unfollow preserves live shadow](../codex-task-switch-unfollow-must-not-drop-live-shadow.md#L1)
- [Turn completion is not Goal completion](../codex-turn-completion-is-not-goal-completion.md#L1)
- [Unobserved private patch must not resubscribe](../codex-unobserved-private-patch-must-not-resubscribe.md#L1)
- [Consumer cache and Float applied ACK](../companion-consumer-cache-and-float-applied-ack.md#L1)
- [Local visibility does not need Provider evidence](../companion-local-visibility-must-not-need-provider-evidence.md#L1)
- [Observation generation is not semantic revision](../companion-observation-generation-is-not-semantic-revision.md#L1)
- [Plan lifecycle and interrupted causality](../companion-plan-lifecycle-and-interrupted-causality.md#L1)
- [Independent authorities must not share full refresh](../independent-authorities-coupled-by-full-refresh.md#L1)
- [Watcher callback latency is not publication latency](../watcher-callback-latency-is-not-end-to-end-publication-latency.md#L1)

## Related Error Records

- [Claude new phase must outrank previous cache](../claude-new-phase-must-outrank-previous-cache.md#L1)

## Historical Or Migration Sources

- RAW-142/150/154/159/160/162/163/164 remain evidence only where superseded by the current Controlled task-state specification. Repeated incidents update their owning leaf rather than creating another active fingerprint.
