# EyPc Port EzClipboard Interaction Verification

Tool: codex

## Commands

| Check | Result | Evidence |
| --- | --- | --- |
| RED keybinding | Pass | `pnpm exec vitest run tests/runtime/keybinding.test.ts` failed on missing search-input shortcut handling and drawer priority. |
| RED runtime | Pass | `pnpm exec vitest run tests/runtime/action.test.ts` failed on missing focus normalization, Space advance, drawer state, and group-search recovery. |
| RED dedupe/detail refresh | Pass | `pnpm exec vitest run tests/domain/ports.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` failed on duplicate `lsof` rows, missing `dedupePortProcesses`, auto-open multi drawer, and missing `ports.detail.open`. |
| RED search-input drawer shortcut | Pass | `pnpm exec vitest run tests/runtime/keybinding.test.ts` failed because `Ctrl+←/→` were blocked while the port search input was focused. |
| Targeted GREEN | Pass | `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` passed: 2 files, 25 tests. |
| Targeted dual-drawer GREEN | Pass | `pnpm exec vitest run tests/domain/ports.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts` passed: 3 files, 37 tests. |
| Search-input drawer GREEN | Pass | `pnpm exec vitest run tests/runtime/keybinding.test.ts` passed: 1 file, 7 tests. |
| Typecheck during implementation | Pass | `pnpm run typecheck` passed with `vue-tsc --noEmit`. |
| Full tests | Pass | `pnpm run test` passed: 9 files, 54 tests. |
| Typecheck | Pass | `pnpm run typecheck` passed with `vue-tsc --noEmit`. |
| Build | Pass | `pnpm run build` passed; Vite built `dist/`, prepared uTools runtime assets, and ran `validate:utools`. |
| uTools runtime validation | Pass | `pnpm run validate:utools` reported `uTools runtime validation passed`. |
| Static UI smoke | Pass | `rg` found `port-action-drawer`, `port-detail-drawer`, `drawer-overlay-left`, `drawer-overlay-right`, `ports.detail.open`, `ports.drawer.open`, `primary-search`, and updated hints in `src/` and `dist/`. |
| Browser UI smoke | Pass | Playwright opened `http://127.0.0.1:8092`, clicked `扫描`, rendered port rows with inline action buttons, opened the right drawer, and showed action descriptions plus `Enter`, `Ctrl+Enter`, `Ctrl+G`, `Ctrl+R`, `Ctrl+F` shortcut labels. Screenshot: `.playwright-cli/page-2026-06-17T03-46-45-166Z.png`. |
| Browser dual-drawer smoke | Pass | Playwright opened `http://127.0.0.1:8092`, verified default no checkbox/no drawers/no `Space` hint, `↑↓` moved result focus, `Ctrl+←` opened left detail overlay, search `809` excluded `:18789`, `49152` rendered once, `Space` selected without opening the right drawer, `Ctrl+→` opened the right overlay, and `Esc` closed drawer before clearing selection. Screenshot: `/tmp/eypc-dual-drawer-smoke.png`. |
| Project code link audit | Pass | `audit_code_links.py --root /Users/gdkmjd/work/czzWork/EyBell/EyPc vibe/knowledge/developer-soul.md vibe/rules/README.md vibe/knowledge/ARCHITECTURE.md vibe/specs/PROJECT_STATUS.md vibe/specs/260617-eypc-port-ezclipboard-interaction` reported `Code link audit: OK`. |
| CodeNote link audit | Pass | `audit_code_links.py --root /Users/gdkmjd/work/czz/CzzProj/CodeNote AiRef/VibePractice/Vibe_Rules/_eval/2026-06-17-eypc-developer-soul-link.md` reported `Code link audit: OK`. |
| AI rule audit | Pass | `audit_ai_rules.py . --mode project` and `audit_ai_rules.py /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules --mode master` reported `AI rule audit: OK`. |

## Manual Gates

- No real process termination was executed.
- Real kill remains limited to an explicit temporary test process.
- Browser smoke observed the existing `favicon.ico` 404 console error only.
- Windows/Linux real host behavior remains a release gate inherited from the port management redesign.
