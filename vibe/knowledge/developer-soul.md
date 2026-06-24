# EyPc Developer Soul

Tool: codex

## Purpose

EyPc is a high-frequency uTools workbench. Its interaction taste follows the global [Developer Soul Rules](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/developer-soul.md#L1), but applies them to local PC operations: dense lists, explicit commands, recoverable focus, and visible risk.

## Product Taste

- Build the usable workbench first. The first screen should be the actual operational surface, not a landing page.
- Keep repeated workflows compact, quiet, and keyboard-first. Prefer scannable rows, stable focus, and direct command surfaces over large cards or explanatory prose.
- Treat a command as the capability owner. Buttons, shortcuts, drawers, and settings rows must dispatch the same action id.
- Put target-specific menus on the target element first. Row/object actions should appear on the row through hover, focus, or context entry; global drawers stay as keyboard/deep-action surfaces instead of always-visible primary menus.
- High-frequency list previews must be command-owned, recoverable, and non-disruptive. Hover or an explicit `c-*` preview command may reveal readonly previews only through runtime state, must never mutate the target or reflow the list, and `Escape` closes the preview before lower-priority recovery steps.
- Do not nest a second editor for fields already present in the active editor. Keep nested data inline in the current draft unless it needs a separate workbench context; otherwise cache source, save boundary, and focus recovery become ambiguous.
- Search, focus, selection, drawer, and Esc recovery are one contract. If a user enters a transient state, they must be able to recover without leaving the plugin.
- Show risk where the action happens. Normal termination requires confirmation; force kill can be direct only when the runtime still verifies PID and port ownership.
- Command editing has fixed semantics: `F2` means full object edit, `Shift+F2` means narrow rename/title edit, `Ctrl+S` and `Ctrl+Enter` save the active editing layer, and `Escape` cancels it.
- `Tab` / `Shift+Tab` inside an editing layer are isolated field-cycle commands. They must not switch app tabs, port panes, drawers, or list focus while the editor is active.

## Port Page Taste

- `Tab` / `Shift+Tab` belong to the port page pane loop; global feature switching stays on `Ctrl+Shift+Num` so inner `Ctrl+Num` command surfaces stay free.
- Search inputs are not passive fields. In the port page they allow list navigation and action shortcuts while preserving normal text entry for unrelated inputs.
- Search-history suggestions must not steal plain list movement; use `Shift+ArrowUp/Down` for history candidates and keep `ArrowUp/Down` on the active list.
- The right drawer is an action surface, not a decorative panel. It displays icon, title, explanation, and the effective shortcut for the current port, selection, or group.
- Drawer visibility and drawer keyboard focus are different states. Multi-select may show the drawer while list focus remains active; `Ctrl+Right` activates the drawer layer.
- `Escape` must recover inward before it ever exits outward: confirm/editor, active drawer, multi-select, search/filter, then initial result focus.
- Port group editing follows the global editing soul: `F2` edits name/rules/color, `Shift+F2` edits name only, `Ctrl+S` and `Ctrl+Enter` persist the group, and `Escape` cancels the draft.

## MQTT Workbench Taste

- Messages, publish templates, and publish history are equal record lists. Each list must support `↑↓` focus movement, direct detail, action drawer, and readonly preview from the same runtime target model.
- `Ctrl+ArrowLeft` is the left detail drawer. `Ctrl+ArrowRight` is the right action drawer. Do not merge detail fields and action menus into the same visual layer.
- Item rows should carry identity and a compact payload signal only. Avoid repeating topic in multiple columns, and push secondary operations into row-local preview/detail/more entry points plus the command drawer.
- Hover, Shift hold, and `Ctrl+I` previews must be non-mutating overlays. They should not reflow rows, steal list focus, or close just because the pointer crosses from the row into the preview.
- MQTT receive/send layout is part of user muscle memory. Stack/split mode and dragged ratios should persist through normalized app state instead of resetting on reload.

## Review Gate

Before accepting an EyPc interaction change, check:

- Is the capability named as a runtime action and visible in settings?
- Can the same behavior be reached by keyboard, button, and drawer without duplicate logic?
- Does every edit-like command respect `F2` full edit, `Shift+F2` rename, `Ctrl+S` save, `Escape` cancel, and isolated `Tab` field cycling?
- Does the UI reveal active pane, focused row, selected row, and destructive risk distinctly?
- Does the implementation preserve the safety invariants in [ARCHITECTURE.md](ARCHITECTURE.md#L1)?
- Is there automated coverage for keybinding resolution, runtime state transitions, and Esc recovery?
