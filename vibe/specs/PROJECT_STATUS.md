# EyPc Project Status Hub

Tool: codex

## Purpose

This is the project process hub for EyPc. It tracks the current main line, active task docs, implementation focus, and verification gates.

## Current Snapshot

- Date: 2026-06-17.
- Product: uTools plugin for cross-platform PC capability calls.
- Current main line: MVP usability closure for port groups, Tab shortcuts, and favorite path workflows.
- Current task: Usability closure implemented; verification is recorded in [260616-eypc-usability-closure/04-verify.md](260616-eypc-usability-closure/04-verify.md#L1).
- Architecture source: [../knowledge/ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1).

## Active Process Index

- Initial MVP spec: [260616-eypc-initial-mvp/01-spec.md](260616-eypc-initial-mvp/01-spec.md#L1).
- Initial MVP plan: [260616-eypc-initial-mvp/02-plan.md](260616-eypc-initial-mvp/02-plan.md#L1).
- Initial MVP tasks: [260616-eypc-initial-mvp/03-tasks.md](260616-eypc-initial-mvp/03-tasks.md#L1).
- Initial MVP verification: [260616-eypc-initial-mvp/04-verify.md](260616-eypc-initial-mvp/04-verify.md#L1).
- Initial MVP review: [260616-eypc-initial-mvp/05-review.md](260616-eypc-initial-mvp/05-review.md#L1).
- Usability closure spec: [260616-eypc-usability-closure/01-spec.md](260616-eypc-usability-closure/01-spec.md#L1).
- Usability closure plan: [260616-eypc-usability-closure/02-plan.md](260616-eypc-usability-closure/02-plan.md#L1).
- Usability closure tasks: [260616-eypc-usability-closure/03-tasks.md](260616-eypc-usability-closure/03-tasks.md#L1).
- Usability closure verification: [260616-eypc-usability-closure/04-verify.md](260616-eypc-usability-closure/04-verify.md#L1).
- Usability closure review: [260616-eypc-usability-closure/05-review.md](260616-eypc-usability-closure/05-review.md#L1).

## Verification Gates

- Automated: `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, `pnpm run validate:utools`.
- Manual: real uTools Developer Tools loading, macOS real port scan and normal kill, Windows/Linux real process scan before release.

## Current Implementation Focus

- Domain models: [src/domain/types.ts](../../src/domain/types.ts#L1).
- Port parsing/search/groups: [src/domain/ports.ts](../../src/domain/ports.ts#L1).
- Favorite tree/search/reorder: [src/domain/favorites.ts](../../src/domain/favorites.ts#L1).
- App runtime and action dispatch: [src/runtime/appRuntime.ts](../../src/runtime/appRuntime.ts#L1).
- Keybinding runtime: [src/runtime/keybinding/keybindingRuntime.ts](../../src/runtime/keybinding/keybindingRuntime.ts#L1).
- Platform adapter and preload bridge: [src/platform/eypcPlatform.ts](../../src/platform/eypcPlatform.ts#L1), [preload/index.js](../../preload/index.js#L1).
- UI shell: [src/App.vue](../../src/App.vue#L1), [src/pages/PortsPage.vue](../../src/pages/PortsPage.vue#L1), [src/pages/FavoritesPage.vue](../../src/pages/FavoritesPage.vue#L1), [src/pages/SettingsPage.vue](../../src/pages/SettingsPage.vue#L1).
