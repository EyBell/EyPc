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

## File Favorites Taste

- File favorites are a compact, keyboard-first metadata workbench, not a decorative card gallery or a full filesystem manager. Selected style is a quiet two-pane hierarchy/list surface with name-path rhythm, restrained Lucide actions, visible focus/selection/path health, and command-owned responsive side layers; avoided style is repeated toolbars/counts, text abbreviations such as `DIR/FILE/开/定/复`, mouse-only actions, hidden failures, and horizontal overflow at 420px. Evidence label: `user-request`, from the 2026-07-11 file favorites workbench implementation request.
- Favorite search, row focus, multi-select, directory selection, drawer targets, editor/review layers, and `Escape` are one deterministic recovery contract. Quick entry must begin from clean transient state and must never inherit a management-page target.
- `Shift+F2` means inline name editing on a favorite tree/list label; `F2` remains the full correction editor for name/path/type metadata. Dialogs trap focus, restore their trigger, and announce operation results without relying on color or toast-only feedback.

## Cross-Page Interaction Taste

- 2026-07-13 shared-surface feedback: selected style is one quiet product Tooltip for every operation, solid but compact Quick Jump hints, and a consistent left-detail/right-action command architecture across tabs. Avoided style is transparent shortcut letters merged into content, hidden or mouse-only operations, and page-specific shortcut behavior that contradicts global muscle memory. Evidence label: `user-request + user-screenshot`.
- Side panels belong to the active Tab, not to the whole window. Selected style docks without covering reachable content on wide windows, becomes exclusive inside the Tab on narrow windows, restores focus on close, and always permits vertical access; avoided style is full-window masks for ordinary details/actions, clipped bottoms, fixed viewport-height guesses, or page-level horizontal scrolling.
- Help must follow the actual control. A checkbox inside an actionable row describes the checkbox, not the row context menu; disabled operations explain why they are unavailable; Quick Jump temporarily owns the visual hint layer so normal Tooltip bubbles do not compete with markers.

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
- 2026-06-27 MQTT connection hierarchy feedback: selected style is an EyTodo-like compact tree in [MqttPage.vue](../../src/pages/MqttPage.vue#L1) with nested groups, stable indentation, visible chevrons, row-local group actions, and clear drag/drop target states; avoided style is a flat connection list, large card grouping, hidden hierarchy state, or drag behavior without visible insertion/inside feedback. Evidence label: `user-request`, from “优化mqtt的连接展示, 允许增加分组, 有层级, 可拖拽, 参照EyTodo项目”.
- 2026-06-27 MQTT connection shortcut feedback: connection-tree features must integrate with the project command model, not stop at visual rows. Selected style is default shortcuts plus visible `c-` hints, global `F` Quick Jump targets, right-click action drawers, `Ctrl+ArrowLeft` detail, `Ctrl+ArrowRight` actions, and edit semantics matching existing group modules (`F2`, `Shift+F2`, `Ctrl+F2`); avoided style is unbound mouse-only group controls, hidden shortcut defaults, stealing `Ctrl+T` from subscriptions, or treating cross-tab shortcut reuse as invalid. Evidence label: `user-request`, from “还要提供合理的快捷键： 默认值，c- 提示，f 触发提示，编辑逻辑，右键菜单，c-←→的快捷操作等所有合理的功能，要和整个项目进行融合匹配”, “c-g not valid”, and “还是要c-g作为组合新增的按钮, 你需要区分不同的功能tab是可以复用快捷键的”.
- 2026-06-28 MQTT connection inline-rename feedback: selected style is `Shift+F2` editing the group name directly inside the tree label with the same save/cancel action layer; avoided style is opening the full group editor overlay for a name-only rename. Evidence label: `user-request`, from “s-f2 no need show-up window just edit in label itself”.
- 2026-06-28 MQTT connection group row density feedback: selected style is a one-line group row visually distinct from normal connection rows, with only three visible actions and the rightmost `Ctrl+ArrowRight` / `c-→` more-action entry; avoided style is a two-line group row or exposing every secondary group command as row buttons. Evidence label: `user-request`, from “分组的样式要进行优化, 区分于普通连接, 并且只需要一行, 右侧普通按钮只展示3个(最右侧为更多选项)” and “还要支持 c-→的更多快捷操作”.
- 2026-06-28 MQTT connection group icon-density feedback: selected style is keeping only the left disclosure control in group rows, using indentation, count, and row treatment for group identity; avoided style is an extra folder/logo glyph next to the disclosure or excessive icon gaps. Evidence label: `user-screenshot`, from “这些logo间隙可以减少, 甚至精简” and “只留最左的”.
- 2026-06-28 MQTT connection create-focus feedback: selected style is `Ctrl+G` / `Ctrl+N` deriving parentage from the current connection-focus scope, not stale selection. Row-focused groups create children, row-focused configs create siblings, connection search/blank rail and other non-edit MQTT panes create root targets while the rail is expanded, and ordinary editors keep native ownership. Evidence label: `user-request`, from the numbered focus matrix for `c-g` and `c-n`.

## Review Gate

Before accepting an EyPc interaction change, check:

- Is the capability named as a runtime action and visible in settings?
- Can the same behavior be reached by keyboard, button, and drawer without duplicate logic?
- Does every edit-like command respect its module's `F2`/`Shift+F2` contract, `Ctrl+S` save, `Escape` cancel, and isolated `Tab` field cycling?
- Does the UI reveal active pane, focused row, selected row, and destructive risk distinctly?
- Does the implementation preserve the safety invariants in [ARCHITECTURE.md](ARCHITECTURE.md#L1)?
- Is there automated coverage for keybinding resolution, runtime state transitions, and Esc recovery?
