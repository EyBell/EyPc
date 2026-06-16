# EyPc Initial MVP Spec

Tool: codex

## Goal

Build the first runnable EyPc uTools plugin with port process management and file/folder favorites.

## Requirements

- Provide uTools feature entries for main, ports, favorites, and settings.
- Ports tab scans listening TCP ports, supports contains and `/regex/i` search, multi-select, recent search history, port groups, normal confirmed kill, and direct force kill with PID/port verification.
- Favorites tab supports file, folder, and virtual group nodes with tags, colors, tree view, search with parent-chain preservation, open, reveal, copy path, edit metadata, reorder, and remove from favorites.
- Settings tab supports command search, shortcut editing, restore default, and disable.
- Use Vue 3 + TypeScript + Vite without Element Plus.

## Non-Goals

- No SQLite default storage.
- No production publish.
- No deletion of real files from disk.
- No full dynamic uTools feature management beyond static MVP entries.
