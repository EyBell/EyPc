# EyPc Project Rules

Tool: codex

design-preference-gate: accepted

## Read Order

1. [AGENTS.md](../../AGENTS.md#L1)
2. [documentation.md](documentation.md#L1)
3. [developer-soul.md](../knowledge/developer-soul.md#L1)
4. [PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1)
5. [ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1)

## Project Rules

- EyPc is a uTools plugin, not a standalone Electron app.
- Use Vue 3 + TypeScript + Vite for the UI and runtime.
- uTools development uses `dist/plugin.json` as the complete plugin directory; run `pnpm run serve` before re-connecting development, and treat `createBrowserWindow` child pages as separate Vite entries that require their own development proxy for HMR.
- Treat the uTools/Electron host boundary as fail-closed: never call `ipcRenderer.sendSync(...)` or an equivalent private synchronous host channel from preload or Renderer, and never attach host-configuration reads to plugin entry, startup, focus, visibility, or manual-refresh paths. Shortcut integration is configuration-redirect-only through the documented `utools.redirectHotKeySetting`; EyPc must not read or display current host bindings. A future readback requires a new explicit requirement plus a documented asynchronous uTools API, explicit user action, a bounded timeout, and proof that plugin entry remains independent.
- Any uTools host/preload bridge change must statically search for private synchronous IPC, prove the main entry has no synchronous host dependency, and keep [preload/index.js](../../preload/index.js#L1) and [public/preload.js](../../public/preload.js#L1) behaviorally mirrored. The verified failure and recovery route are owned by [utools-private-sync-ipc-entry-freeze.md](../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1).
- Keep domain logic pure and testable under `src/domain/`.
- Put uTools, Node.js, shell, process, and file-system calls behind `src/platform/` or `preload/`.
- All user-visible mutations go through Runtime Action dispatch.
- Reusable failures, user corrections, data incidents, and tool/runtime traps must be routed through [error-memory-capture](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Skills/global/error-memory-capture/SKILL.md#L1) into project error memory before closeout.
- Medium or larger interaction/UI/configuration work must apply the project [developer-soul.md](../knowledge/developer-soul.md#L1) before changing behavior.
- Edit-like interactions must follow the command soul in [developer-soul.md](../knowledge/developer-soul.md#L1): `F2` full edit, `Shift+F2` rename, `Ctrl+S` save, `Escape` cancel, and editor-local `Tab` cycling.
- Shortcut chords are scoped, not globally unique by default. Before treating a shortcut as conflicting, inspect tab, layer, input role, and `when` ownership in [keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1); the same chord may be reused across mutually exclusive feature tabs or contexts, and UI hints must show the context-local shortcut.
- MQTT connection create shortcuts are focus-scoped in [appRuntime.ts](../../src/runtime/appRuntime.ts#L1): `Ctrl+G` / `Ctrl+N` inherit parent only from explicit row actions or `mqtt-connections` row focus; connection search, blank rail space, and other non-edit MQTT panes create top-level targets while the connection rail is expanded.
- Shortcut hint popovers must render in a top-layer fixed surface, not inside rows, buttons, drawers, or overflow-hidden panels; ordinary shortcut popovers must filter invisible anchors, auto-stagger nearby hints and shift fully inside viewport edges without resizing the source element or being hidden by masks.
- Global Quick Jump markers are the explicit placement exception: every marker stays centered on its target's two-dimensional projection, never title/edge/collision/viewport-shifts away from that center, and uses the fixed pointer-transparent top layer plus the compact framed visual defined by the current product requirement.
- Unspecified visual details, rules, typography and component choices inherit the current project authorities and existing component language. Do not repeatedly ask the user to confirm defaults that those authorities already resolve.
- For this project, development acceptance is user-owned. Codex may update implementation and test contracts but must not run tests, typecheck, build, uTools/runtime checks, screenshots, real Codex preflight, or real archive/project-removal lifecycle operations unless the user explicitly overrides this rule in a later request. Delivery remains `未校验，待用户验收` and must not be marked accepted.
- Codex native global state is read-only except for the explicitly confirmed Companion project-removal transaction: the host must reject while Codex Desktop is running, validate a short-lived project alias and source fingerprint against the primary state file, change only the native project registry fields, atomically replace primary plus `.bak`, and verify/rollback. All other Codex flows remain absolutely read-only toward that file.
- Do not delete real files from disk in the favorites feature; removing a favorite only removes plugin metadata.
- Process termination is high risk: normal kill requires confirmation; force kill is allowed only for explicit selected PID + verified port match.

## Project Rule Trace

Project-local rules stay outside the central CodeNote Rule Task Index. This table is the EyPc-local trace required for future project work.

| Rule ID | Scope / Source | Durable Authorities | State |
| --- | --- | --- | --- |
| `EYPC-UTOOLS-HOST-001` | project-local; RAW-087 and the 2026-07-24 user-confirmed entry freeze | [RAW-087](../specs/260718/1148-codex-quota-float/raw-requirement.md#L1) · [verification](../specs/260718/1148-codex-quota-float/verify.md#L1) · [verified error consensus](../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1) | active; entry recovery user-confirmed, complete no-readback contract statically verified |
