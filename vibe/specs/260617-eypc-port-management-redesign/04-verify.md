# EyPc Port Management Redesign Verification

Tool: codex

## Commands

| Check | Result | Evidence |
| --- | --- | --- |
| Domain RED | Pass | `pnpm exec vitest run tests/domain/ports.test.ts tests/domain/state.test.ts` failed before implementation on search ordering, missing group regex API, and default group migration. |
| Domain GREEN | Pass | `pnpm exec vitest run tests/domain/ports.test.ts tests/domain/state.test.ts` passed: 2 files, 10 tests. |
| Runtime RED | Pass | `pnpm exec vitest run tests/runtime/action.test.ts` failed before runtime implementation on list shortcuts, pane actions, and group creation. |
| Runtime GREEN | Pass | `pnpm exec vitest run tests/runtime/action.test.ts` passed: 1 file, 10 tests. |
| Full tests | Pass | `pnpm run test` passed: 7 files, 28 tests. |
| Typecheck | Pass | `pnpm run typecheck` passed with `vue-tsc --noEmit`. |
| Build | Pass | `pnpm run build` passed; Vite built `dist/`, prepared uTools runtime assets, and ran `validate:utools`. |
| uTools runtime validation | Pass | `pnpm run validate:utools` reported `uTools runtime validation passed`. |
| Dev server availability | Partial | `pnpm run dev` could not start a new server because strict port `8092` was already in use; `curl -I http://127.0.0.1:8092/` returned 200 against the existing service. |
| Browser smoke | Partial | Headless Chrome opened `http://127.0.0.1:8092/` and found `端口组`, `端口查询`, and `搜索`. Console reported one generic 404 resource message, but Playwright response tracking found no 4xx response. |
| Code link audit | Pass | `audit_code_links.py` reported `Code link audit: OK`. |
| Auto scan regression | Pass | `pnpm exec vitest run tests/runtime/action.test.ts tests/platform/processBridge.test.ts tests/domain/ports.test.ts` passed: 3 files, 20 tests. |
| macOS command smoke | Pass | `lsof -nP -iTCP -sTCP:LISTEN` returned listening TCP rows on this machine. No kill command was executed. |
| Inline search smoke | Pass | Headless Chrome found one `[data-role="primary-search"]`, clicking `聚焦` kept `.search-layer` count at 0, and focus moved to the inline input. Console still reported the existing generic 404 resource message. |
| 8081 parser/filter regression | Pass | [tests/domain/ports.test.ts](../../../tests/domain/ports.test.ts#L1) covers macOS `lsof` IPv6 listener `[::1]:8081` and verifies query `8081` returns that process. |
| GUI PATH scan regression | Pass | [tests/platform/processBridge.test.ts](../../../tests/platform/processBridge.test.ts#L11) verifies absolute scan command candidates for macOS/Linux/Windows GUI hosts. |
| Preload scan smoke | Pass | `node` loaded [public/preload.js](../../../public/preload.js#L1), executed `window.eypcPlatform.ports.scan()`, returned 80 rows, and found `{ port: 8081, command: "node", address: "[::1]:8081" }`. |
| Browser dev bridge smoke | Pass | `curl http://127.0.0.1:8092/__eypc__/ports/scan` returned JSON containing `87822:8081:tcp`; headless Chrome typed `8081` in the inline search and rendered one `.port-row` containing `:8081` and `node`. |
| User GUI confirmation | Pass | 2026-06-17 screenshot confirmed the port page inline query `8081` renders live rows for `:8081 node PID 87822 [::1]:8081` and `:17889 node PID 13511 [::1]:17889`. |

## Coverage

- Search scoring, explicit regex, auto regex, invalid regex fallback, group port/range/regex matching, and PID+port verification are covered by [tests/domain/ports.test.ts](../../../tests/domain/ports.test.ts#L1).
- Built-in group removal and user group preservation are covered by [tests/domain/state.test.ts](../../../tests/domain/state.test.ts#L1).
- Keyboard navigation, multi-select, group filtering, force cleanup, group creation, rename, search, and delete are covered by [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1).
- Automatic scan on search open and first typed query is covered by [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L194).
- macOS/Linux and Windows scan command selection plus GUI absolute-path fallback is covered by [tests/platform/processBridge.test.ts](../../../tests/platform/processBridge.test.ts#L5).
- Two-pane UI and inline search inputs are implemented in [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L29).
- User-facing confirmation covers the real visible failure path reported for inline search result rendering.

## Manual Gates

- Local GUI result rendering is manually confirmed for query `8081`.
- Real macOS process cleanup must use a temporary test process only.
- Windows/Linux real scan and cleanup remain release gates.
- Windows real `netstat -ano -p tcp` output was not executed in this macOS session; coverage is static command-plan and parser tests only.
