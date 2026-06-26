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
- Host-shell transient layers must be owned by runtime state before DOM focus is trusted. Popovers, previews, and editors opened by command should keep their shortcut layer even when the browser active element is stale.
- Global target-jump overlays are command-owned transient layers. They open only from non-editing context, use stable non-trigger markers, activate only the chosen existing target, and close through `Escape` before lower-priority recovery paths.
- Show risk where the action happens. Normal termination requires confirmation; force kill can be direct only when the runtime still verifies PID and port ownership.
- Command editing must be consistent inside each module: `Ctrl+S` and `Ctrl+Enter` save the active editing layer, `Escape` cancels it, and the module spec owns whether `F2` is alias or full edit.
- `Tab` / `Shift+Tab` inside an editing layer are isolated field-cycle commands. They must not switch app tabs, port panes, drawers, or list focus while the editor is active.
- Editing fields own native text editing before workbench commands. Plain `Delete` / `Backspace`, arrows, copy/paste, undo/redo, and `Ctrl` / `Cmd` / `Alt` text-navigation chords must not open drawers/popovers, delete records, or reset the caret unless the exact editor contract documents and tests the exception.
- Design feedback must be extracted as project soul while the task is still active. Record selected style, avoided style, affected surface, and source evidence in this file and the active sync/process doc so the next edit inherits the user's design intent.

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
- Publish draft history is different from publish history. It belongs beside the send editor as a recovery/reuse popover, records overwritten/manual drafts only, and must not duplicate real outgoing message records.
- Publish topic/payload focus must be mutually exclusive with information-list focus; `Space` in publish editing must never keep toggling message selection. Draft-history popover focus owns its own `Space` multi-select.
- MQTT draft-history editing uses `F2` for title/note alias editing and `Shift+F2` for topic/payload detail editing.
- `Ctrl+ArrowLeft` is the left detail drawer. `Ctrl+ArrowRight` is the right action drawer. Do not merge detail fields and action menus into the same visual layer.
- Item rows should carry identity and a compact payload signal only. Avoid repeating topic in multiple columns, and push secondary operations into row-local preview/detail/more entry points plus the command drawer.
- MQTT connection and subscription rails are first-class row lists. They must show active, selected, focused, and hover states distinctly, and row-local buttons, context menus, `Ctrl+ArrowLeft`, and `Ctrl+ArrowRight` must all enter the same runtime target model.
- Workbench-local MQTT popovers should be highest only inside the workbench, not globally highest. Topic filter, publish options, and draft-history popovers must outrank rows, resizers, and panel contents in stack/split layouts, while drawer masks, previews, modals, and shortcut top layers remain above them.
- Hover, Shift hold, and `Ctrl+I` previews must be non-mutating overlays. They should not reflow rows, steal list focus, or close just because the pointer crosses from the row into the preview.
- MQTT receive/send layout is part of user muscle memory. Stack/split mode and dragged ratios should persist through normalized app state instead of resetting on reload.
- MQTT publish topic/payload editing treats `Ctrl+ArrowLeft` / `Ctrl+ArrowRight` as host text navigation. Publish options open by their button or explicit option-layer commands, and transient publish popovers close through `Escape` or outside click without disturbing editor caret state.
- Current MQTT design direction: selected style is compact command-owned workbench behavior with visible focus/selection, row-local actions, deterministic `Tab`, and layer priority owned by runtime state; avoided style is generic decorative panels, hidden row state, off-screen or clipped drawers/popovers, and delayed documentation of corrected design intent.
- MQTT row time is a dense diagnostic signal. Selected style: show readable `HH:MM:SS`, omit the date only for same-day records, include date for older records, and use distinct date/clock chip treatments; avoided style is compressed undifferentiated digits such as `0626 143436` and sub-second noise in dense rows.
- MQTT detail and preview surfaces are diagnostic contexts, so they should always show full date plus seconds, such as `YYYY-MM-DD HH:MM:SS`, while still avoiding millisecond noise unless a future debugging mode explicitly needs it.
- 2026-06-26 MQTT visual-density feedback: selected style is tighter component rhythm, single-row rail items, smaller icon controls, lighter borders, and restrained focus rings for the workbench in [app.css](../../src/styles/app.css#L1); avoided style is loose card spacing, heavy colored outlines, and large gutters that reduce record density. Evidence label: `user-screenshot`, from the request “各组件的间隔缩小, 样式更精简美化一下”.
- 2026-06-26 MQTT config-editor label feedback: short option labels in the connection editor should keep checkbox and text visually attached and wrap only as a whole option; selected style is a separate compact checkbox row group in [MqttPage.vue](../../src/pages/MqttPage.vue#L1), flex-wrap outer alignment, nowrap label styling, and fixed 16px checkbox inputs in [app.css](../../src/styles/app.css#L1), while avoided style is splitting labels like “重连后重订阅” / “本地归档”, inherited full-width checkbox inputs, or `space-between` layouts that pull checkbox and text apart. Evidence label: `user-screenshot`, from the requests “连接到编辑此处, 无需换行吧” and the follow-up screenshots showing over-spread checkbox labels.

## Review Gate

Before accepting an EyPc interaction change, check:

- Is the capability named as a runtime action and visible in settings?
- Can the same behavior be reached by keyboard, button, and drawer without duplicate logic?
- Does every edit-like command respect its module's `F2`/`Shift+F2` contract, `Ctrl+S` save, `Escape` cancel, and isolated `Tab` field cycling?
- Does the UI reveal active pane, focused row, selected row, and destructive risk distinctly?
- Does the implementation preserve the safety invariants in [ARCHITECTURE.md](ARCHITECTURE.md#L1)?
- Is there automated coverage for keybinding resolution, runtime state transitions, and Esc recovery?
