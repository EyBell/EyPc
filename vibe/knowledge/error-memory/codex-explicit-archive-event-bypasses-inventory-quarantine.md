---
id: eypc-codex-explicit-archive-event-bypasses-inventory-quarantine
status: verified
scope: project
fingerprint: codex-archive-false-local-removal__provider-success-or-single-event-treated-as-persistent-commit__require-two-server-verifications-and-connected-native-ack-before-kernel-removal
first_seen: 2026-07-27
last_verified: 2026-08-10
review_after: 2026-09-10
evidence:
  - preload/index.js
  - preload/companion/task-kernel.cjs
  - src/runtime/codexController.ts
  - tests/platform/codexAppServerBridge.test.ts
  - tests/runtime/codexController.test.ts
  - vibe/specs/260810/1155-install-runtime-diagnostics/spec.md
  - vibe/specs/260810/1155-install-runtime-diagnostics/verify.md
tags:
  - codex-companion
  - archive
  - native-ack
  - postcondition
  - kernel-commit
---

# Explicit Archive Evidence Accelerates Verification; It Does Not Commit Deletion

## Symptom

EyPc could hide a task after `thread/archive` and an immediate unarchived-list change, while Codex App still showed the task after refresh. On failure, the plugin had already cleared local aliases/cache and could not accurately restore the card or shortcut target.

## Wrong Assumption

A successful Provider RPC, one transient list result, or a Desktop message being sent was treated as equivalent to persistent native archive. The older fast-path rule also allowed a mapped `thread/archived` event to bypass ordinary missing-row quarantine and immediately remove the row. Those are useful evidence, but none independently proves the complete native postcondition.

## Verified Root Cause

Archive side effects and local visibility were committed at different authority levels. Provider success published archived membership before Desktop sync/native acknowledgement and before a second server read could expose a transient or contradictory result. Controller then interpreted the Provider result as deletion authority, so real state was destroyed before persistence was established.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) now performs exact preflight, one provider write, server verify-1, Desktop sync, matching native ACK when connected, server verify-2 after at least 300ms, then Kernel commit and task-scoped reconciliation.
- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) owns `commitArchived` and the tombstone that rejects older inventory resurrection.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) retains the card, archive button, alias/cache/receipt and shortcut target until the committed package removes them.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) locks Desktop-sync failure, second-verification contradiction, native-ACK timeout, retry and complete success, including ordered operationId-correlated logs.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) proves a Provider-only Codex `archived` result cannot hide the row without Process Kernel commit.

## Detection Order

1. Separate `provider-write`, server inventory, Desktop bridge delivery, native archive ACK and local Kernel membership in the trace.
2. Confirm the same `operationId`, provider, taskRef and terminalEpoch are present at every stage.
3. When Desktop is connected, require write + verify-1 + sync + matching ACK + verify-2. When Desktop is not running, require write + both server verifications.
4. Inspect the second verification at least 300ms after the first; one immediate list result is not persistence proof.
5. Before Kernel commit, assert that card, button, alias, receipt, cache and shortcut target still exist.
6. After commit, assert that every consumer is removed in one package revision and an older inventory cannot revive the task.

## Prevention Rule

Treat archive events as evidence, never as local deletion authority. `ArchiveResultV3.outcome=archived` means all required native persistence postconditions have been confirmed. Only Kernel `commitArchived` may publish archived membership. Any write/read error, sync failure, ACK timeout or contradictory verification returns failed/indeterminate, retains local state, notifies the user with the short operationId and performs one target-scoped reconciliation. Never repeat the provider write automatically.

## Latest Applicable Implementation

- Confirmation identity is `provider + taskKey + terminalEpoch`; revision, unread, focus and alias churn cannot cancel it.
- The card and button remain visible as “归档中”; failure changes the same card to “归档未确认” and restores retry.
- A connected Desktop requires a matching native ACK within two seconds. Desktop-not-running mode omits only sync/ACK, not the two server reads.
- Each normal/abnormal stage has an explicit info/error diagnostic event; retention uses `archive-local-retained`.
- Claude/Cloud archive behavior is outside this occurrence and remains under its own Provider contract.

## Alternative Route

- Status: `verified` by deterministic bridge and Controller tests; real uTools host acceptance is still a product gate.
- Preconditions: exact Codex task identity, archive capability and a current terminal epoch.
- Ordered steps: keep local state → write once → verify twice → obtain native ACK when connected → Kernel commit → reconcile → remove UI.
- Verification: force sync failure, verify-2 contradiction and ACK timeout; each must retain the row and allow retry. Complete success must remove only after commit and block stale inventory resurrection.
- Fallback: if any native boundary is unavailable or contradictory, retain the task and surface `indeterminate`; never hide optimistically.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-095 explicit archive fast path | External archive stayed visible until generic inventory quarantine expired | Explicit event was reduced to an unqualified inventory refresh | Carried a mapped key for urgent reconciliation | historical precursor; immediate removal portion superseded |
| 2026-08-10 | RAW-159 persistent archive contract | Plugin row disappeared but Codex App refresh still showed the task | Provider success/one list change was published before Desktop sync/native ACK and persistent recheck | Added strict transaction, Kernel commit, failure retention, operationId stages and tombstone | verified automated; real uTools matrix pending |
