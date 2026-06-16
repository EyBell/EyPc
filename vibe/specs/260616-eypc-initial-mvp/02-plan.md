# EyPc Initial MVP Plan

Tool: codex

## Implementation

- Initialize Vue 3 + TypeScript + Vite uTools project.
- Add project documentation routing and process hub.
- Implement pure domain services for ports, favorites, search, keybindings, and state normalization.
- Implement Runtime Action and settings/keybinding layers.
- Implement preload bridge for process scan, kill, file open/reveal/copy, and storage.
- Build compact keyboard-first UI with tab shell, ports page, favorites tree, settings page, confirm layer, and command hints.

## Validation

- Unit tests cover domain parsing/search/projection and runtime dispatch.
- Integration tests cover uTools feature routing.
- Build validation confirms `dist/plugin.json`, `preload.js`, `index.html`, and `logo.svg` exist and are coherent.
