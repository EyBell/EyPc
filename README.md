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
