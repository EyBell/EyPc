# EyPc

Tool: codex

EyPc is a uTools plugin for cross-platform PC capability calls. The initial MVP includes:

- Port process scan, search, multi-select, normal terminate, and force kill.
- File/folder favorites with groups, tags, colors, tree view, open, reveal, and remove-from-favorites.
- Feature entries for main, ports, favorites, and settings.
- Command/keybinding runtime inspired by EzClipboard.

## Commands

```bash
pnpm install
pnpm run test
pnpm run typecheck
pnpm run build
pnpm run serve
```

## Runtime

Use [public/plugin.json](public/plugin.json#L1) in uTools Developer Tools during development. The build emits runtime files under `dist/`.

## Window Jump

- A row represents one independent OS root window. Browser tabs, IDE editors and proven native child surfaces stay inside that row; changing their title does not break favorites or slots.
- On macOS, a preload-session cache resolves each exact root to its display/Space. Slot activation switches only the target display, so another display's current Space remains independent.
- Finder/Explorer always appears as an expandable parent with each independent file-manager window beneath it. Press `ArrowRight` to expand/enter a child and `ArrowLeft` to return/collapse.
- Right-click first focuses the row and opens the existing contextual panel. File-manager parents can activate, expand, favorite, list-pin, rename and bind slots, but cannot bulk-close or page-topmost children.
- A missing current-Space inventory row is retained as temporarily unobserved. Only an exact native `gone` probe clears the saved locator; replacement stays explicit and a slot-originated recovery changes that slot only. Titles are recognition hints only.
