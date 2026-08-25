# EyPc V7 Global Refactor — Execution Plan

status: `implemented / automated-verified / external-host-gate-pending`
updated: `2026-08-24`

## Execution Topology

| Work Unit | Owner | Surface | Dependencies | Allowed scope | Output contract | Verification owner |
| --- | --- | --- | --- | --- | --- | --- |
| WU-V7-BASE | Root | main | none | task contract, baseline, design/diagnostic receipts | frozen net delta and isolated worktree | Root |
| WU-V7-STATE | Root; Terra read-only evidence | main/native | BASE | Provider evidence, Kernel, package, runtime identity | distinct interaction/artifact lanes and no rebound | Root |
| WU-V7-FEATURE | Root; Terra read-only evidence | main/native | STATE contracts | FeatureModule, RuntimeSlice, Tab lifecycles | feature-scoped views and notifications | Root |
| WU-V7-INTERACTION | Root | main | FEATURE contracts | command, layer, menu, focus, QuickJump | one command/target/escape system | Root |
| WU-V7-PERF | Root | main | FEATURE/INTERACTION | MQTT, diagnostics, binding index, child transport | bounded incremental hot paths | Root |
| WU-V7-UI | Root; Product Design audit | main | interaction contracts | tokens, shared components, all surfaces | adaptive accessible visual system | Root |
| WU-V7-CLOSE | Root | main | all prior | legacy removal, docs, packaging, canary | artifact-ready V7 package and explicit Host gate | Root |

## Implementation Milestones

1. Freeze the current version map, Requirement Change Review, anonymous diagnostics and visual evidence.
2. Add generated V7 evidence contracts; move interaction/artifact reduction into the sole Kernel and eliminate synthetic Plan waiting.
3. Publish one immutable task/presentation snapshot and migrate Main/Float/attention consumers without local phase filters.
4. Introduce RuntimeSlice/FeatureModule and migrate Ports, MQTT, Favorites, Windows, Companion and Settings lifecycle boundaries.
5. Introduce CommandCatalog, LayerStack, KeybindingIndex, FeatureTargetRef, ActionMenuModel, FocusScope and QuickJumpRegistry; migrate all entry surfaces.
6. Replace hot-path global work with domain revisions, incremental MQTT transactions, async bounded diagnostics and cursor-based child IPC.
7. Introduce shared semantic tokens, system theme adapters, adaptive density and contextual primary-action/More components; verify all surfaces against current product soul.
8. Remove compatibility facades only after callers and tests reach zero, synchronize all current authorities, build the plugin, and preserve real Host acceptance as an external gate.

All eight implementation milestones are complete in the isolated V7 worktree. The only remaining gates are explicitly external: real uTools installation/loading, runtime identity readback, 300ms interaction canaries, 30-second no-rebound observation and the authorized system-theme/density/keyboard visual matrix.

## Provisional VerificationImpactTrace

- State milestone: Provider bridge fixtures, Kernel truth table/metamorphic tests, task package, Controller, Float bridge and runtime identity.
- Feature/interaction milestones: focused runtime/action/keybinding/UI tests for each migrated Tab, plus static ownership guards.
- MQTT/diagnostic/IPC milestone: repository migration/transaction tests, hot-path I/O guards and child envelope tests.
- UI milestone: component tests, keyboard/focus matrix and controlled screenshots for changed states; screenshot evidence does not replace interaction checks.
- Packaging boundary: affected semantic typecheck, generated preload mirror validation, production build and uTools package validation.
- Repository-wide suites are reserved for the final cross-feature milestone or a focused failure that proves material transitive impact; they are not copied as a default ladder.

## Release And Rollback

- No V6 point release and no mixed Kernel/Snapshot package.
- V7 storage is additive, idempotent and non-destructive; migration failure leaves the previous namespace intact and blocks activation.
- No push, publish or live install in this implementation authority.
- Final real-Host acceptance requires an exact loaded asset identity, reply/cancel/execute canaries, 30-second no-rebound observation, refollow/reconnect/restart checks and Main/Float applied ACK.
