# Companion Inventory Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

Link-only route for task inventory membership, Turn parsing, missing rows and list/count consistency.

## Current Authorities And Routes

- [Architecture](../../ARCHITECTURE.md#L1)
- [Current requirements](../../../specs/PRODUCT_REQUIREMENTS.md#L1)

## Primary Error Records

- [Nullable Turn start must not abort inventory](../codex-null-turn-start-aborts-inventory.md#L1)
- [Running side child invisible after reload](../codex-running-side-child-invisible-after-reload.md#L1)
- [Subagent thread unlisted, parent shows stopped](../codex-subagent-thread-unlisted-parent-shows-stopped.md#L1)
- [Explicit archive bypasses inventory quarantine](../codex-explicit-archive-event-bypasses-inventory-quarantine.md#L1)
- [Inventory dropout is not deletion](../codex-inventory-dropout-is-not-task-deletion.md#L1)
- [Task count/list projection convergence](../codex-task-count-list-projection-divergence.md#L1)

## Related Error Records

- [Official active empty turns](../codex-native-active-empty-turns-not-nonconversation.md#L1)

## Historical Or Migration Sources

- Inventory links were split from the task-state index after it exceeded 30 Primary records; leaf paths and evidence remain unchanged.
