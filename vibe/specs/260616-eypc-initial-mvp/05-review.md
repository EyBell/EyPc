# EyPc Initial MVP Review

Tool: codex

## Review Target

- Requirement: [01-spec.md](01-spec.md#L1).
- Plan: [02-plan.md](02-plan.md#L1).
- Implementation: [src/App.vue](../../../src/App.vue#L1), [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1), [preload/index.js](../../../preload/index.js#L1).

## Checked

- Requirement alignment: uTools entries, ports tab, favorites tab, settings tab, document-driven baseline, and validation scripts are implemented.
- Plan-to-implementation coverage: domain, runtime, platform, UI, tests, and docs exist in the planned directories.
- Risk and compatibility: process kill remains behind preload verification; normal kill uses confirmation, force kill requires selected PID and port match.
- Verification evidence: [04-verify.md](04-verify.md#L1).

## Findings

- P0: None found.
- P1: Fixed before commit.
  - `.gitignore` contained a stray non-ignore line; removed it in [.gitignore](../../../.gitignore#L1).
  - Favorites drag reorder emitted incorrect arguments; corrected in [src/pages/FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L96).
  - Favorites search did not record history; corrected in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L203) and covered by [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L29).
  - Runtime subscription cleanup registered `onUnmounted` inside `onMounted`; moved cleanup to setup scope in [src/App.vue](../../../src/App.vue#L67).
- P2: Remaining polish only.
  - Windows process names currently fall back to `pid-<pid>` in preload scan; richer tasklist enrichment can be added after real Windows validation.

## Not Checked

- Real uTools Developer Tools loading.
- Real process termination on macOS, Windows, or Linux.
- Dynamic uTools feature registration for user-defined port groups.
