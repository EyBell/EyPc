# EyPc Documentation Rules

Tool: tool-neutral (codex, claude, and any CodeNote-routed agent)

## Tiers

- Project process hub: [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1).
- Task docs: follow CodeNote process date grouping under `vibe/specs/`.
- Durable architecture: [../knowledge/ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1).
- Technical implementation memory: [../knowledge/technical-details.md](../knowledge/technical-details.md#L1).
- Error memory: [../knowledge/error-memory.md](../knowledge/error-memory.md#L1).
- Data notes: [../ai-db/README.md](../ai-db/README.md#L1), with AI-DB storage and naming delegated to [CodeNote DB governance](../../../../../czz/CzzProj/CodeNote/DevelopRef/调试工具/db/governance/README.md#5-workspace-shape-and-naming).
- Reusable uTools plugin development guides and failure usage: [CodeNote uTools module](../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/README.md#L1).
- End-user feature operation guides (settings「说明」): [guide registry and loader](../../src/help/guides/index.ts#L1).

## Process Contract

- `Quick` has no Task file; `Standard` non-requirement uses one `task-card.md`; `Standard requirement` uses `raw-requirement.md + spec.md` with the `Spec owner`; `Controlled` uses the five-file ledger.
- Local `L0/L1` maps to Quick, `L2` defaults to Standard, and `L3/L4` maps to Controlled. File count alone does not promote a task.
- Process owner: [process/rules.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/rules.md#L1).
- Rollout owner: [codex-evolution/rollout/README.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/codex-evolution/rollout/README.md#L1).
- Runtime owner: [codex-evolution/runtime-supervision/README.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/codex-evolution/runtime-supervision/README.md#L1).
- Communication owner: [process/communication-io.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/communication-io.md#L1).

## Feature Help Guides (required)

User-facing operation help is product surface, not optional developer notes. Authority for coverage is [featureRegistry.ts](../../src/runtime/feature/featureRegistry.ts#L1) `FEATURES` plus the matching Markdown imported by [the guide registry](../../src/help/guides/index.ts#L1).

### When a guide is mandatory

- **New feature type / Tab** (`AppTabId`, `FEATURES` entry, default feature config, and usually `plugin.json` feature): add `[id].md` in the same change. The settings「功能开关」row must open a non-empty guide; coverage is asserted by `missingFeatureHelpIds()` / the feature-help unit contract.
- **User-visible behavior change** on an existing feature (workflow, shortcuts defaults, risk/boundary, enablement default, platform capability, uTools entry): update that feature’s `[id].md` in the same change. Do not leave the guide describing superseded behavior.
- **Shared cross-feature keyboard/workbench** changes (Quick Jump, left/right drawers, Escape recovery, edit soul): update [settings.md](../../src/help/guides/settings.md#L1); other guides only adjust cross-references if their local wording becomes wrong.
- **Removed or renamed feature id**: remove or rename the matching guide file and keep `FEATURES` ↔ guides 1:1.

### Writing constraints

- Write for end users: operable steps, defaults, risks/boundaries, and effective default shortcuts (note they may be rebound).
- Do not paste RAW ids, source paths, error-memory, private IPC, or unverified acceptance promises.
- Prefer current page/runtime/Spec behavior over stale storefront blurbs or lagging PRD bullets; if PRD drifts, record the gap in the task process doc—do not silently ship outdated user help.
- Guides are build-time embedded (`?raw`); do not load `vibe/` at runtime.

### Closeout checklist item

Medium/larger feature or interaction tasks must list whether the matching `src/help/guides/{id}.md` was added or updated, or explicitly state why no user-visible guide impact exists.

## Closeout

- Medium and larger tasks update the process hub and task verification record.
- Stable implementation decisions update architecture knowledge.
- Verification records must list commands, results, and unverified gaps.
- Keep project-specific facts in this repository; cross-project principles stay in CodeNote.
- For uTools host/preload/window/HMR/packaging/Esc/`mainHide`/hotkey technical archival: write the durable guide or error record into the CodeNote uTools module. Task folders keep only raw requirement and verify evidence. Local `vibe/knowledge/error-memory/utools-*.md` files remain thin pointers, not second full copies.
