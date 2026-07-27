---
id: eypc-codex-archive-revalidation-fail-open
status: verified
scope: project
fingerprint: codex-archive-can-run-on-malformed-or-stale-reread__ui-state-or-not-explicitly-active-was-treated-as-sufficient__require-exact-identity-recency-revision-shape-and-latest-turn-before-mutation__eypc-codex-preload
first_seen: 2026-07-20
last_verified: 2026-07-20
review_after: 2027-01-20
evidence:
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - codex
  - archive
  - fail-closed
  - privacy
  - destructive-action
---

# Codex Archive Revalidation Must Fail Closed

## Symptom

A true archive request could pass preflight when `thread/read` omitted or changed the thread status/identity/recency shape, as long as newest-turn completion still matched. The destructive call would then proceed on incomplete evidence.

## Wrong Assumption

Rejecting only explicitly `active` or `systemError` states was treated as equivalent to proving a terminal-safe state. Missing schema fields were implicitly accepted.

## Verified Root Cause

The preflight used an incomplete denylist and did not prove that reread identity, recency, request revision and newest-Turn evidence still described the exact row shown to the user. The historical non-active expansion demonstrated that “not explicitly active” is insufficient: the operation must validate the evidence class it was asked to archive and cancel on active work, new versions or malformed shapes. RAW-068 first treated interrupted as ongoing; RAW-089 now makes the current product contract simpler and safer—only an exact completed revision is archivable, while every other outcome or missing Turn stays ongoing.

## Evidence

- Fail-closed revalidation and the remaining provider race boundary are in [preload/index.js](../../../preload/index.js#L1).
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) rejects missing status, mismatched identity and missing recency before covering a successful archive.
- The user-visible second confirmation and source acceptance are recorded in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).
- Current RAW-089 code accepts only completed evidence in Controller and Host, and project archive skips every non-completed row; this narrowing has static evidence only and does not alter the record's 2026-07-20 verified fail-closed baseline.

## Detection Order

1. Resolve the opaque alias and verify it is live and mapped to a valid thread ID.
2. Reread the thread without turns and require the exact mapped ID.
3. Require an allowlisted thread status, a valid positive recency equal to the expected inventory revision, and a request revision/evidence class matching the displayed card.
4. Independently read the newest status-only Turn and require the exact completed revision shown by the card. Reject failed, interrupted, inProgress, missing/malformed Turn and every other evidence class.
5. Only then call archive; any missing/malformed/changed field returns a structured failure without mutation. On success, remove the row immediately so stale inventory cannot flash back.

## Prevention Rule

Destructive revalidation must prove the exact current product-archivable row and its completed revision. Never infer safety from a stale UI card, “not explicitly active,” falsy fields or schema-default values. Identity, status, recency, revision, response shape and newest-Turn completed evidence are mandatory; every state projected as ongoing must fail closed before mutation.

## Alternative Route

- Status: `verified` for the 2026-07-20 fail-closed baseline; RAW-089 completed-only narrowing is `reported/unverified`.
- Preconditions: the App Server exposes `thread/read`, status-only newest-Turn read and `thread/archive`; the UI has an exact product-archivable revision, evidence enum and live alias.
- Ordered steps: require second confirmation; validate alias/request; reread identity/status/recency/response shape and latest Turn; require exact completed revision; reject every mismatch/non-completed result; archive; remove only on success; preserve the row on failure.
- Verification: the verified baseline covered malformed status/identity/recency/Turn-shape and active/version-change regressions, immediate Controller removal, privacy assertions, focused `8 / 86`, full `47 / 433`, build and uTools validation. RAW-089 contracts replace the historical unknown/failed success cases but were not executed.
- Applicability boundary: EyPc's local Codex App Server archive adapter. The App Server has no conditional archive primitive, so activity beginning after preflight remains a declared TOCTOU residual.
- Fallback: keep the exact row and ask for refresh/retry; local hide remains available and does not mutate Codex.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-20 | Codex true archive | Final destructive-path review | Denylist accepted malformed reread evidence | Replaced with mandatory identity/status/recency/revision allowlist and negative bridge tests | verified |
| 2026-07-20 | Codex non-active archive expansion | User required archive for completed, failed, interrupted, system-error and unknown rows | Reuse pending-only completedAt preflight or treat unknown as automatically safe | Added evidence enum, cross-process warning, exact thread/latest-Turn reread, active/version cancellation and immediate local removal | verified |
| 2026-07-22 | RAW-068 ongoing archive narrowing | User observed archive availability flashing while interrupted was already presented as ongoing | Retained the historical interrupted terminal route after product-state normalization | Reject interrupted as active work in projection, Controller and Host single/project guards | reported/unverified; static checks only, verified 2026-07-20 baseline retained |
| 2026-07-26 | RAW-089 completed-only archive narrowing | User required all abnormal and unconfirmed states to remain ongoing | Project archive still treated non-active failed/unknown evidence as writable | Restricted single and project Host paths to exact latest-Turn completed evidence | reported/unverified; contracts updated, no destructive runtime action |
