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
- Reusable uTools host/preload/window/HMR/packaging/Esc/`mainHide`/hotkey contracts and failure usage are owned by the CodeNote [uTools plugin development module](../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/README.md#L1). EyPc does not maintain a second full technical archive; project tasks keep only raw/verify evidence and thin local pointers.
- EyPc development uses `dist/plugin.json` as the complete plugin directory and `pnpm run serve` before re-connecting development. Child `createBrowserWindow` pages need their own Vite development proxy; details live in the CodeNote module.
- Any uTools host/preload bridge change must statically search for private synchronous IPC, prove the main entry has no synchronous host dependency, and keep [preload/index.js](../../preload/index.js#L1) and [public/preload.js](../../public/preload.js#L1) behaviorally mirrored. Consensus pointer: [utools-private-sync-ipc-entry-freeze.md](../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1).
- Keep domain logic pure and testable under `src/domain/`.
- Put uTools, Node.js, shell, process, and file-system calls behind `src/platform/` or `preload/`.
- All user-visible mutations go through Runtime Action dispatch.
- Reusable failures, user corrections, data incidents, and tool/runtime traps must be routed through [error-memory-capture](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Skills/global/error-memory-capture/SKILL.md#L1). uTools-reusable failures archive into the CodeNote uTools module; other project-specific failures remain in project error memory.
- Medium or larger interaction/UI/configuration work must apply the project [developer-soul.md](../knowledge/developer-soul.md#L1) before changing behavior.
- Edit-like interactions must follow the command soul in [developer-soul.md](../knowledge/developer-soul.md#L1): `F2` full edit, `Shift+F2` rename, `Ctrl+S` save, `Escape` cancel, and editor-local `Tab` cycling.
- Shortcut chords are scoped, not globally unique by default. Before treating a shortcut as conflicting, inspect tab, layer, input role, and `when` ownership in [keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1); the same chord may be reused across mutually exclusive feature tabs or contexts, and UI hints must show the context-local shortcut.
- MQTT connection create shortcuts are focus-scoped in [appRuntime.ts](../../src/runtime/appRuntime.ts#L1): `Ctrl+G` / `Ctrl+N` inherit parent only from explicit row actions or `mqtt-connections` row focus; connection search, blank rail space, and other non-edit MQTT panes create top-level targets while the connection rail is expanded.
- Shortcut hint popovers must render in a top-layer fixed surface, not inside rows, buttons, drawers, or overflow-hidden panels; ordinary shortcut popovers must filter invisible anchors, auto-stagger nearby hints and shift fully inside viewport edges without resizing the source element or being hidden by masks.
- Product operation tips use the shared [OperationTooltipLayer](../../src/components/OperationTooltipLayer.vue#L1). Icon/action controls must set always-on `data-operation-tooltip` and `data-operation-shortcut` (MQTT helpers: `commandTooltip` / `plainTooltip`); do not rely on native `title` alone or on Ctrl-only `data-mqtt-shortcut-hint`. Consensus: [operation-tooltip-title-only-missing-product-attrs.md](../knowledge/error-memory/operation-tooltip-title-only-missing-product-attrs.md#L1).
- Global Quick Jump markers are the explicit placement exception: every marker stays centered on its target's two-dimensional projection, never title/edge/collision/viewport-shifts away from that center, and uses the fixed pointer-transparent top layer plus the compact framed visual defined by the current product requirement.
- Unspecified visual details, rules, typography and component choices inherit the current project authorities and existing component language. Do not repeatedly ask the user to confirm defaults that those authorities already resolve.
- EyPc development verification is impact-based and Agent-executable. Frontend/UI/runtime source changes run relevant focused tests, explicit semantic `pnpm run typecheck`, and the complete non-watch `pnpm run build`; docs/rules/Skill-only changes run their focused link/rule/package checks instead of an unrelated application build. A passing build may prove compile/package integrity but never substitutes for uTools/native-window/visual/interaction acceptance.
- Do not run `pnpm run serve`, `dev`, `preview`, watch mode, uTools, a real app/native host, browser automation, screenshots, real Codex preflight, or real archive/project-removal lifecycle operations unless the current task explicitly authorizes that runtime evidence. Background/headless work may run bounded tests, typecheck and build, but must not launch or keep a runtime process.
- Codex native global state is read-only except for the explicitly confirmed Companion project-removal transaction: the host must reject while Codex Desktop is running, validate a short-lived project alias and source fingerprint against the primary state file, change only the native project registry fields, atomically replace primary plus `.bak`, and verify/rollback. All other Codex flows remain absolutely read-only toward that file.
- Do not delete real files from disk in the favorites feature; removing a favorite only removes plugin metadata.
- Process termination is high risk: normal kill requires confirmation; force kill is allowed only for explicit selected PID + verified port match.
- Every top-level feature in [featureRegistry.ts](../../src/runtime/feature/featureRegistry.ts#L1) must ship a matching end-user operation guide registered by [guides/index.ts](../../src/help/guides/index.ts#L1); new `AppTabId` / feature types and user-visible feature behavior changes must add or update that guide in the same change. Rule detail: [documentation.md](documentation.md#feature-help-guides-required).

## Project Rule Trace

Project-local rules stay outside the central CodeNote Rule Task Index. This table is the EyPc-local trace required for future project work.

| Rule ID | Scope / Source | Durable Authorities | State |
| --- | --- | --- | --- |
| `EYPC-UTOOLS-HOST-001` | project-local backlink; RAW-087 and the 2026-07-24 user-confirmed entry freeze | [CodeNote host-hotkey-redirect](../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/host-hotkey-redirect.md#L1) · [CodeNote error memory](../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-private-sync-ipc-entry-freeze.md#L1) · [RAW-087](../specs/260718/1148-codex-quota-float/raw-requirement.md#L1) · [verification](../specs/260718/1148-codex-quota-float/verify.md#L1) · [local pointer](../knowledge/error-memory/utools-private-sync-ipc-entry-freeze.md#L1) | active; entry recovery user-confirmed, complete no-readback contract statically verified |
| `EYPC-FEATURE-HELP-001` | settings feature「说明」guides; 2026-07-29 settings-feature-help | [documentation.md Feature Help Guides](documentation.md#feature-help-guides-required) · [guides/index.ts](../../src/help/guides/index.ts#L1) · [featureRegistry.ts](../../src/runtime/feature/featureRegistry.ts#L1) · [RAW](../specs/260729/1135-settings-feature-help/raw-requirement.md#L1) | active; coverage required for every `FEATURES` id |
| `EYPC-OPERATION-TIP-001` | shared product Tooltip attrs; 2026-07-30 MQTT hover follow-up | [OperationTooltipLayer.vue](../../src/components/OperationTooltipLayer.vue#L1) · [error memory](../knowledge/error-memory/operation-tooltip-title-only-missing-product-attrs.md#L1) · [1044 verify](../specs/260730/1044-mqtt-tooltip-shortcut-polish/verify.md#L1) | active; always-on `data-operation-*`, not title-only |
| `EYPC-VERIFY-001` | project-local verification policy; user correction 2026-07-31 | [global testing owner](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/testing/rules.md#L1) · [task-skill-reminder](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Skills/global/task-skill-reminder/SKILL.md#L1) · [package scripts](../../package.json#L1) | active; frontend/runtime uses focused tests + semantic typecheck + non-running build; real uTools/native acceptance remains separate |
