---
id: eypc-favorite-graph-normalization
status: verified
scope: project
fingerprint: favorite-tree-hang-or-loss__duplicate-or-cyclic-parent-graph__direct-recursive-traversal__eypc-favorites-metadata
first_seen: 2026-07-11
last_verified: 2026-07-11
review_after: 2026-10-11
evidence:
  - tests/domain/favorites.test.ts
  - src/domain/favorites.ts
tags:
  - favorites
  - graph-normalization
  - cycle
  - runtime-state
---

# Malformed Favorite Graph Must Normalize Before Traversal

## Symptom

Persisted or imported favorite metadata with duplicate IDs, orphan parents, self references, or parent cycles can recurse forever, omit nodes, or attach a rebuilt duplicate to the wrong source node.

## Wrong Assumption

The previous route assumed stored `id` and `parentId` values were unique and acyclic, so tree construction and ancestor lookup could traverse them directly.

## Verified Root Cause

Favorite metadata is persistent input and may be stale or externally malformed. Duplicate ID rebuilding also changes the meaning of a self reference unless the original self-reference fact is preserved before assigning the replacement ID.

## Evidence

- Normalization and traversal defenses: [favorites.ts](../../../src/domain/favorites.ts#L1).
- Duplicate/self, orphan, and cycle regressions: [favorites.test.ts](../../../tests/domain/favorites.test.ts#L1).
- Task verification: [verify.md](../../specs/260711/1452-file-favorites-workbench/verify.md#L1).

## Correct Detection Order

1. Inspect the raw node list for duplicate IDs and invalid parent references.
2. Rebuild duplicate IDs deterministically while preserving whether each source node referenced itself.
3. Recover orphan, self, and every member of a parent cycle to root.
4. Traverse the normalized graph with independent `visited` and ancestor guards.

## Prevention Rule

Every state-load and tree-build boundary must consume `normalizeFavoriteGraph`; no tree, ancestor, move-validation, or removal traversal may assume the persisted graph is valid.

## Latest Applicable Implementation

[normalizeFavoriteGraph](../../../src/domain/favorites.ts#L1) is the canonical repair boundary; [normalizeAppState](../../../src/domain/state.ts#L1) applies it at state load.

## Alternative Route

- Status: `verified`.
- Preconditions: favorite metadata may come from persisted or migrated state.
- Steps: normalize IDs/parents, root invalid chains, then traverse with visited guards.
- Verification: focused domain regressions and the full project suite pass.
- Applicability boundary: EyPc virtual favorite metadata only; this does not repair or modify real filesystem structure.
- Fallback: keep the affected node at root and preserve its metadata for `F2` correction.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11 | File favorites workbench | RED malformed-graph matrix | Direct recursive tree/ancestor traversal | Domain regressions | Deterministic normalization plus visited guards | verified |
