---
id: eypc-pnpm-store-build-policy-mismatch
status: candidate
scope: project
fingerprint: dependency-add-fails-or-creates-placeholder-workspace__pnpm-store-version-and-build-policy-diverge__reuse-current-node-modules-store__eypc-local-tooling
first_seen: 2026-07-11
last_verified: 2026-07-11
review_after: 2026-08-11
evidence:
  - package.json
  - pnpm-lock.yaml
tags:
  - pnpm
  - dependency-install
  - environment
  - build-policy
---

# pnpm Store And Build-Policy Mismatch During Dependency Addition

## Symptom

Adding Vue component-test dependencies encountered a pnpm store/version mismatch, and the newer local pnpm flow generated a placeholder `pnpm-workspace.yaml` build-policy file instead of a reviewed boolean policy.

## Wrong Assumption

The existing `node_modules` store was assumed to be directly writable by the package-manager version declared in `package.json`, and an automatically generated workspace policy was assumed to be a harmless dependency-install artifact.

## Verified Root Cause

The installed dependency store was created by a different pnpm major line than the project declaration. The newer installer also materializes ignored-build policy as a workspace file that requires an explicit project decision.

## Evidence

- Declared package manager and component-test dependencies: [package.json](../../../package.json#L1).
- Resolved dependency graph: [pnpm-lock.yaml](../../../pnpm-lock.yaml#L1).
- Task verification and authorized cleanup closure: [verify.md](../../specs/260711/1452-file-favorites-workbench/verify.md#L1).

## Correct Detection Order

1. Read `packageManager` before adding dependencies.
2. Inspect which pnpm major created the current store.
3. Separate lockfile dependency changes from generated workspace/build-policy changes.
4. Treat an unreviewed placeholder policy as an unintended artifact, not accepted configuration.

## Prevention Rule

Use the project-declared pnpm line for dependency changes in a compatible store; if the environment cannot do so, stop before committing a generated workspace/build policy and request the narrow cleanup or policy decision.

## Latest Applicable Implementation

The dependency versions are pinned through [package.json](../../../package.json#L1) and [pnpm-lock.yaml](../../../pnpm-lock.yaml#L1). No workspace build policy is accepted by this record.

## Alternative Route

- Status: `candidate`.
- Preconditions: a future clean environment can install with the declared pnpm line.
- Steps: reproduce in a disposable compatible store, add only required dependencies, inspect ignored-build output, then run full test/type/build gates.
- Verification: pending a clean-store replay; current build and tests only verify the resulting dependency graph.
- Applicability boundary: local EyPc dependency maintenance; not a global pnpm policy.
- Fallback: leave dependency files unchanged and ask for environment cleanup authority.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11 | File favorites workbench | Add Happy DOM/Test Utils | Reuse mismatched pnpm store and accept generated policy | Dependency diff and build gates | Isolate intended dependency changes; remove the placeholder after explicit user authorization | candidate; artifact removed |
