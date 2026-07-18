# EyPc Project Rules

Tool: codex

## Read Order

1. [AGENTS.md](../../AGENTS.md#L1)
2. [documentation.md](documentation.md#L1)
3. [developer-soul.md](../knowledge/developer-soul.md#L1)
4. [PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1)
5. [ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1)

## Project Rules

- EyPc is a uTools plugin, not a standalone Electron app.
- Use Vue 3 + TypeScript + Vite for the UI and runtime.
- Keep domain logic pure and testable under `src/domain/`.
- Put uTools, Node.js, shell, process, and file-system calls behind `src/platform/` or `preload/`.
- All user-visible mutations go through Runtime Action dispatch.
- Medium or larger interaction/UI/configuration work must apply the project [developer-soul.md](../knowledge/developer-soul.md#L1) before changing behavior.
- Edit-like interactions must follow the command soul in [developer-soul.md](../knowledge/developer-soul.md#L1): `F2` full edit, `Shift+F2` rename, `Ctrl+S` save, `Escape` cancel, and editor-local `Tab` cycling.
- Shortcut chords are scoped, not globally unique by default. Before treating a shortcut as conflicting, inspect tab, layer, input role, and `when` ownership in [keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1); the same chord may be reused across mutually exclusive feature tabs or contexts, and UI hints must show the context-local shortcut.
- MQTT connection create shortcuts are focus-scoped in [appRuntime.ts](../../src/runtime/appRuntime.ts#L1): `Ctrl+G` / `Ctrl+N` inherit parent only from explicit row actions or `mqtt-connections` row focus; connection search, blank rail space, and other non-edit MQTT panes create top-level targets while the connection rail is expanded.
- Shortcut hint popovers must render in a top-layer fixed surface, not inside rows, buttons, drawers, or overflow-hidden panels; ordinary shortcut popovers must filter invisible anchors, auto-stagger nearby hints and shift fully inside viewport edges without resizing the source element or being hidden by masks.
- Global Quick Jump markers are the explicit placement exception: every marker stays centered on its target's two-dimensional projection, never title/edge/collision/viewport-shifts away from that center, and uses the fixed pointer-transparent top layer plus the compact framed visual defined by the current product requirement.
- Do not delete real files from disk in the favorites feature; removing a favorite only removes plugin metadata.
- Process termination is high risk: normal kill requires confirmation; force kill is allowed only for explicit selected PID + verified port match.
