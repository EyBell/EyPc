# EyPc Initial MVP Verification

Tool: codex

## Automated Verification

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm run test` | Pass | 7 test files, 17 tests passed. |
| `pnpm run typecheck` | Pass | `vue-tsc --noEmit` exited 0. |
| `pnpm run build` | Pass | Vite built `dist/`, prepared preload, and ran runtime validation. |
| `pnpm run validate:utools` | Pass inside build | `uTools runtime validation passed`. |
| Browser render check | Pass | `http://127.0.0.1:8092/` rendered main tabs and ports page; browser console error log was empty. |
| Code link audit | Pass | `audit_code_links.py` reported `Code link audit: OK`. |

## Coverage

- Port parsing, search, regex fallback, history, group expansion, and PID/port verification are covered by [tests/domain/ports.test.ts](../../../tests/domain/ports.test.ts#L1).
- Favorites tree build, parent-chain search, tag/group filtering, and reorder are covered by [tests/domain/favorites.test.ts](../../../tests/domain/favorites.test.ts#L1).
- State normalization is covered by [tests/domain/state.test.ts](../../../tests/domain/state.test.ts#L1).
- Runtime action dispatch is covered by [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1).
- Keybinding override/disable resolution is covered by [tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1).
- uTools feature routing is covered by [tests/integration/featureRouting.test.ts](../../../tests/integration/featureRouting.test.ts#L1).
- Runtime asset validation script is [scripts/validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1).

## Unverified Gates

- Real uTools Developer Tools loading of [public/plugin.json](../../../public/plugin.json#L1) and `dist/plugin.json` remains manual.
- macOS real process kill was not executed in this session to avoid terminating user processes.
- Windows/Linux real port scan and kill behavior still require physical platform validation before release.
