# Interaction And Favorites Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

Link-only route for command targets、focus transfer、keyboard ownership、tooltips、favorites and transient interaction state.

## Current Authorities And Routes

- [Product requirements](../../../specs/PRODUCT_REQUIREMENTS.md#L1)
- [Project architecture](../../ARCHITECTURE.md#L1)
- [Project status](../../../specs/PROJECT_STATUS.md#L1)

## Primary Error Records

- [Command-panel explicit-target precedence](../command-panel-explicit-target-precedence.md#L1)
- [Delegated operation tooltip controls](../delegated-operation-tooltip-controls.md#L1)
- [Dialog focus restore/render race](../dialog-focus-restore-render-race.md#L1)
- [Favorite graph normalization](../favorite-graph-normalization.md#L1)
- [Keyboard dispatch unreachable when focus never lands](../keyboard-dispatch-unreachable-when-focus-never-lands.md#L1)
- [Modified-arrow command conflict](../modified-arrow-handler-command-conflict.md#L1)
- [Operation tooltip needs product attributes](../operation-tooltip-title-only-missing-product-attrs.md#L1)
- [Quick favorites stale target](../quick-favorites-stale-target.md#L1)
- [Sentinel index clamped into a valid position](../sentinel-index-clamped-into-a-valid-position.md#L1)
- [Escape capture over quick jump](../utools-escape-capture-over-quick-jump.md#L1)
- [Window-list focus steal on action-panel open](../window-list-focus-steal-on-actions-open.md#L1)

## Related Error Records

- [Window-family projection overwrites logical targets](../window-family-projection-overwrites-logical-targets.md#L1)
- [Port scan snapshot misses new listeners](../port-scan-snapshot-misses-new-listeners.md#L1)

## Historical Or Migration Sources

- [Legacy File Favorites macOS open/preload/shortcut compound record](../../error-memory.md#file-favorites-macos-open-preload-and-shortcut-hints) and [MQTT draft-history shortcut Host conflict](../../error-memory.md#mqtt-draft-history-shortcut-host-conflict) remain routed historical evidence; their composite wording is not promoted into a new automatic remedy.
- One-off visual symptoms remain in task verification only. A leaf belongs here only when it preserves a reusable interaction-state or keyboard/focus boundary.
