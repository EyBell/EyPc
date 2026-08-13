# Engineering Contracts Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

Link-only route for general data contracts、testing、type narrowing、documentation authority、audit attribution and safe-write failures.

## Current Authorities And Routes

- [Project rules](../../../rules/README.md#L1)
- [Documentation rules](../../../rules/documentation.md#L1)
- [Architecture](../../ARCHITECTURE.md#L1)
- [Project status](../../../specs/PROJECT_STATUS.md#L1)

## Primary Error Records

- [Audit warning attributed without reading its source](../audit-warning-attributed-without-reading-its-source.md#L1)
- [Concat breaks a merge-sorted precondition](../concat-breaks-downstream-merge-sorted-precondition.md#L1)
- [Cross-clock timestamp comparison](../cross-clock-timestamp-comparison.md#L1)
- [Dedup set wider than projected set](../dedup-set-wider-than-projected-set.md#L1)
- [Design-preference index tag limit](../design-preference-index-tag-limit.md#L1)
- [Documented absent field treated as parse target](../documented-absent-field-treated-as-parse-target.md#L1)
- [Flat error index lacks Primary ownership](../error-memory-flat-index-lacks-primary-ownership.md#L1)
- [Fixed-field projection drops declared data](../fixed-field-projection-drops-declared-data.md#L1)
- [Guard field no producer ever sets](../guard-field-no-producer-ever-sets.md#L1)
- [Hook injection mistaken for repository discovery](../hook-injection-mistaken-for-repo-discovery.md#L1)
- [Host environment leaks into test fixture](../host-environment-leak-into-test-fixture.md#L1)
- [One mechanism silently covering another's job](../one-mechanism-silently-covering-anothers-job.md#L1)
- [Producer built before checking the consumer](../producer-built-before-checking-the-consumer-can-express-it.md#L1)
- [Shallow extraction of nested payload](../shallow-pattern-extraction-of-nested-payload.md#L1)
- [Stale-base force write clobbers concurrent edits](../stale-base-force-write-clobbers-concurrent-edit.md#L1)
- [Superseded rule cited as authority](../superseded-rule-cited-as-authority.md#L1)
- [Test double froze an invented contract](../test-double-froze-an-invented-cross-module-contract.md#L1)
- [Tests that cannot fail](../tests-that-cannot-fail.md#L1)
- [Tri-state collapsed to boolean](../tri-state-collapsed-to-boolean-hides-remedy.md#L1)
- [Async closure release narrows to never](../typescript-async-closure-release-narrows-to-never.md#L1)
- [`Number.isFinite` does not narrow optional numbers](../typescript-number-isfinite-optional-narrowing.md#L1)
- [Vue nextTick nullable-ref narrowing](../vue-nexttick-ref-null-narrowing.md#L1)

## Related Error Records

- None.

## Historical Or Migration Sources

- Candidate records stay searchable but are never automatic remedies. Repeated failures update the same fingerprint and Occurrence History; obsolete alternatives become superseded or retired rather than being deleted.
