# EyPc Port Group UI Optimization Tasks

Tool: codex

- [x] Add RED tests for domain, runtime, keybinding, and keyboard event behavior.
- [x] Implement group folder state normalization and pure tree/matching helpers.
- [x] Implement group pane toggle, group/folder drawers, `cr` filter-only apply, `c-cr` focus/multi-select matches, and layered `esc`.
- [x] Update port group UI, group editor folder selector, drag/drop, compact rows, Shift preview, and command hints.
- [x] Add shared shortcut codec and Ez short-chain display for `c-w`, `c-s-f`, `c-cr`, `cr`, `esc`, and arrows.
- [x] Add partitioned local search histories for port-result, port-group, and favorite search.
- [x] Add shared search suggestion UI with keyboard accept/delete and mouse select/delete command paths.
- [x] Fix follow-up regressions for `a-1` expand-focus / collapse-blur, `c-s-f` inside search inputs, no-initial-highlight history selection, `del` / `backspace` result kill mapping, and non-overlapping compact group header.
- [x] Compact port-page UI with right-aligned search hints, two-line group rows, one-line port rows, icon-only group toggle, and `s-esc` app hide command.
- [x] Refine search-history `esc` layering, top-tab hold-`c` shortcut hints, and fixed settings `c-a-s` shortcut.
- [x] Move feature tab shortcuts from `c-num` to `c-s-num` while preserving inner `c-num` command surfaces.
- [x] Fix follow-up shortcut regressions: settings `c-a-s` works from search inputs, search-history candidates move with `s-↑↓` while plain `↑↓` returns to list navigation, and group-panel toggle defaults to configurable `c-w`.
- [x] Run full build and uTools validation.
- [x] Perform browser smoke without destructive process actions.
- [x] Update verification record after final checks.
