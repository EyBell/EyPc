# Claude Companion Error Memory Route

## Scope

This link-only module routes EyPc-specific Claude Companion inventory, status, quota, open, bridge and test failures. Current product authority remains the [2026-08-07 reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1); this index is not a requirement manifest, task ledger or runtime state.

## Current Authorities And Routes

- Current decisions, archive ids and implementation boundary: [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)
- Local technical evidence and strict tests: [research](../../../specs/260807/claude-code-companion-authority-reset/research.md#L1)
- Current project state: [PROJECT_STATUS](../../../specs/PROJECT_STATUS.md#L1)
- Current architecture: [ARCHITECTURE](../../ARCHITECTURE.md#L1)

## Primary Error Records

- [Session family/open/state authority conflation](../claude-session-family-open-route-and-state-authority-conflation.md#L1) — verified root cause and replacement route, including stable unread snapshots, same-completion session hints and App OAuth dynamic quota; interactive UI matrix remains an acceptance boundary, not a route choice.
- [Watcher callback latency is not end-to-end publication latency](../watcher-callback-latency-is-not-end-to-end-publication-latency.md#L1) — measure authority event through Controller publish on one monotonic clock; source wake is diagnostic only.
- [Independent authorities coupled by full refresh](../independent-authorities-coupled-by-full-refresh.md#L1) — inventory/state/unread/quota/presence require feature-lifetime independent lanes, source→Controller→Float monotonic revisions and authority-specific failure semantics.
- [Capability gap asserted without reading the shipped App](../capability-gap-asserted-without-reading-the-shipped-app.md#L1) — superseded historical lesson; `resume` exists but is an import route, not the selected exact-open route.
- [Test double froze an invented cross-module contract](../test-double-froze-an-invented-cross-module-contract.md#L1)
- [Sandbox real Claude binary breaks empty-machine fixtures](../sandbox-real-claude-binary-breaks-empty-machine-fixtures.md#L1)
- [Claude readiness gated on an unneeded capability](../claude-readiness-gated-on-unneeded-capability.md#L1)
- [Cross-clock timestamp comparison](../cross-clock-timestamp-comparison.md#L1)
- [Dedup set wider than projected set](../dedup-set-wider-than-projected-set.md#L1)
- [Concat breaks downstream merge-sorted precondition](../concat-breaks-downstream-merge-sorted-precondition.md#L1)
- [Fixed-field projection drops declared data](../fixed-field-projection-drops-declared-data.md#L1)
- [Tri-state collapsed to boolean hides remedy](../tri-state-collapsed-to-boolean-hides-remedy.md#L1)
- [Tests that cannot fail](../tests-that-cannot-fail.md#L1)
- [Producer built before checking the consumer can express it](../producer-built-before-checking-the-consumer-can-express-it.md#L1)
- [Documented absent field treated as parse target](../documented-absent-field-treated-as-parse-target.md#L1)
- [Superseded rule cited as authority](../superseded-rule-cited-as-authority.md#L1)

## Related Error Records

- [uTools macOS native-addon host signature mismatch](../utools-macos-native-addon-host-signature-mismatch.md#L1)
- [New preload module missing from packaging manifest](../new-preload-module-missing-from-packaging-manifest.md#L1)
- [Facade port omitted below a passing module validator](../facade-port-omitted-below-passing-module-validator.md#L1)
- [Content-derived path segment unvalidated](../content-derived-path-segment-unvalidated.md#L1)
- [Guard field no producer ever sets](../guard-field-no-producer-ever-sets.md#L1)

These preload/packaging/path records may also route through the CodeNote uTools module; their owning leaf remains unchanged.

## Historical Or Migration Sources

- [Original Claude provider](../../../specs/260805/1150-claude-companion-provider/spec.md#L1)
- [Desktop provider](../../../specs/260806/1130-claude-desktop-provider/spec.md#L1)
- [Old resume/open verification](../../../specs/260806/2147-claude-open-in-desktop-app/verify.md#L1)
- [Old unread acquisition](../../../specs/260806/2147-claude-open-in-desktop-app/unread-authority.md#L1)
- [N-window quota work](../../../specs/260806/2210-claude-quota-all-windows/spec.md#L1)
