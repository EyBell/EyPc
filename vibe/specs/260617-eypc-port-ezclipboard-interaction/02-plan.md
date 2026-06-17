# EyPc Port EzClipboard Interaction Plan

Tool: codex

## Implementation

- Extend keybinding context with input role and drawer state so port search inputs can allow list shortcuts while other text inputs remain protected.
- Add runtime drawer projection: `portDrawer`, `portDrawerItems`, command shortcut labels, open/active distinction, numbered drawer actions, direct current-row actions, and selection clear.
- Normalize port/group focus after search and fix list movement when the current focused id is filtered out.
- Update [../../../src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L1), [../../../src/components/SelectableList.vue](../../../src/components/SelectableList.vue#L1), and [../../../src/components/CommandHints.vue](../../../src/components/CommandHints.vue#L1) for row buttons, right drawer, and contextual hints.
- Record EyPc-specific developer taste in [../../knowledge/developer-soul.md](../../knowledge/developer-soul.md#L1), route it from project rules, and add a CodeNote mother-rule linkage record.

## Verification

- Use RED/GREEN runtime and keybinding tests before production changes.
- Run `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, and `pnpm run validate:utools`.
- Run project and CodeNote Markdown link audits for new rule/spec records.
- Perform UI smoke by checking rendered source/build artifacts for drawer roles, hints, and action commands; real kill remains manual-only.
