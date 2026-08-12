---
id: eypc-companion-local-visibility-must-not-need-provider-evidence
status: verified
scope: project
fingerprint: eypc-owned-hide-restore-gated-behind-provider-evidence__kernel-package-overwrote-persisted-receipt-while-provider-was-down__commit-local-visibility-in-kernel-like-plan-pause
first_seen: 2026-08-12
last_verified: 2026-08-12
review_after: 2026-09-12
evidence:
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - src/domain/companionTaskPackage.ts
  - tests/domain/companionTaskPackage.test.ts
  - src/platform/eypcPlatform.ts
  - src/runtime/codexController.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/runtime/codexController.test.ts
tags:
  - codex-companion
  - local-pin
  - claude-companion
  - visibility
  - local-state
  - provider-availability
  - kernel-authority
---

# EyPc-Owned Visibility Must Commit Without Provider Evidence

## Symptom

- A Codex task shown as “待继续” could not be hidden once Codex was no longer running. The row stayed in place, yet the action reported `已移入 Companion 的已隐藏区；不会修改 Codex 任务`.
- The hide was not lost, only invisible: after Codex ran again and one cold reconciliation succeeded, the same task suddenly disappeared into 已隐藏.
- A hidden Claude session never survived a cold rebuild at all, because the Claude preflight branch reconstructed every row as visible.
- The Plan row control did not reproduce it: `暂` committed locally and worked while the provider was down, which made the failure look like an unrelated hide-only quirk.

## Wrong Assumption

Writing and persisting the EyPc-owned receipt was treated as the mutation. The receipt is only durable input; the visible bucket is derived from the process Kernel package, so a receipt without a matching canonical `hidden` changes nothing a user can see. The second assumption was that a purely local visibility decision may share the Provider-evidence gate used by real Provider actions.

## Verified Root Cause

`isHidden` is projected exclusively from the Kernel task (`task.hidden || task.paused`) in [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1), and [codexController.ts](../../../src/runtime/codexController.ts#L1) re-applies the last complete package on every publication. The only producer that turned a persisted `dismissedActivityRecency` receipt into canonical `hidden` was the host cold preflight in [preload/index.js](../../../preload/index.js#L1), reachable only through `queueCompanionHostReconciliation`, which first requires an `ok` Codex snapshot with `completeness === 'verified'`. With the provider not running that read throws, no draft is committed, and the stale package keeps overwriting the local decision. The Claude branch of the same preflight additionally hard-coded `hidden: false`, so Claude visibility had no durable path at all.

## Evidence

- A focused projection probe showed a locally hidden card returning to `stopped` with `isHidden: false` as soon as `applyCompanionTaskPackageViews` ran against a package reporting `hidden: false`.
- The activity lane was not the culprit: `applyCodexActivityToCompanionKernel` advances only the phase/unread generations, so `acceptMembership` stays false and `hidden` survives live deltas. Only the membership-advancing cold preflight rewrites it.
- The Plan pause lane already had the correct shape — `writePauseReceipt` plus `publishLocalTasks` — which is why pause remained usable offline while ordinary hide did not.
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) locks that `setVisibility` publishes hide/restore with an always-rejecting preflight and never calls it again, and that a stale revision, foreign lease, unknown key or Plan-owned row is rejected.
- [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) reproduces the report end to end: every provider read and the cold preflight fail, and hide/restore still move the row and persist the receipt. With the local commit removed the same test fails.

## Detection Order

1. Name the owner of the user-visible field, not the owner of the persisted input. If a package/projection derives it, a persisted receipt alone can never be the mutation.
2. For every local action, list what must be reachable before it commits. Any Provider read, preflight or freshness gate in that list is a defect unless the action actually mutates the Provider.
3. Compare sibling actions in the same row: if one local control works while the provider is down and another does not, the working one usually shows the intended commit path.
4. Check every draft producer for the field: a builder that hard-codes the default silently deletes the state on the next cold rebuild.
5. Verify with the provider deliberately unavailable, then again after it returns, so a merely deferred effect is not mistaken for a working one.
6. Confirm the durable input and the local commit derive the same value, so the later cold rebuild reproduces the decision instead of contradicting it.

## Prevention Rule

EyPc-owned state that never reaches the Provider — ordinary hide/restore, local pin, collapse, alias — commits in the Kernel immediately and independently of Provider availability, exactly like Plan pause. Route it through a lease-gated local mutation that revalidates identity and revision, publishes one local package, and leaves persistence with the Renderer receipt; every draft producer must then recompute that same flag from that same receipt so the local commit and the cold rebuild agree. Never place a purely local visibility mutation behind `ensureReady`, a verified inventory read or any freshness gate, and never report success for a mutation whose visible outcome depends on a producer that is currently unreachable.

## Latest Applicable Implementation

- `setVisibility` in [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) is the local hide/restore authority: lease-checked, revision-checked, refused for `planReady` rows that own the pause lane, and committed through `publishLocalTasks`.
- `setLocalPin` shares that lease/revision gate and the same local commit, but carries no Plan exclusion: a completed Plan row stays pinnable because a pin only reorders EyPc rows and feeds the fallback cycle tier.
- An EyPc alias is local naming authority: [companionTaskPackage.ts](../../../src/domain/companionTaskPackage.ts#L1) refreshes `originalName` from Provider metadata but no longer overwrites `name`/`displayName` while `alias` is set.
- Project collapse, project alias and project hiding need no equivalent: project cards are not re-projected from the package, so their Renderer values already survive.
- [codexController.ts](../../../src/runtime/codexController.ts#L1) commits that decision before writing the receipt and fails the action when the Kernel rejects it, so the message can no longer claim a hide that did not happen.
- The Claude branch of the cold preflight in [preload/index.js](../../../preload/index.js#L1) now derives `hidden` from the same persisted receipt as Codex, so a hidden Claude row survives a cold rebuild.
- Provider-mutating actions — archive, execute Plan, open — keep their Provider-evidence gates unchanged.

## Alternative Route

- Status: `verified` by focused Kernel and Controller regressions plus typecheck and the uTools production build; real-host behaviour with Codex stopped remains a separate acceptance gate.
- Preconditions: the field is EyPc-owned, the Kernel already holds the task, and a durable Renderer-side receipt exists.
- Ordered steps: identify the projecting owner → add a lease-gated local Kernel mutation → commit locally before persisting → make every draft producer recompute the same flag from the same receipt → assert with the provider unavailable.
- Fallback: if a local field genuinely must not survive without Provider confirmation, disable its control with a stated reason instead of accepting the action and silently discarding it.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-12 | Hide a 待继续 Codex task with Codex stopped | Hide reported success while the row stayed in 待继续; the same hide applied itself later once Codex ran again | Persisted receipt only; canonical `hidden` reachable exclusively through a preflight that requires a verified live Codex read | Added the lease-gated Kernel `setVisibility` local commit, failed the action on rejection, and derived Claude preflight `hidden` from the same receipt | verified by focused Kernel/Controller regressions, typecheck and uTools build; real host with Codex stopped pending |
| 2026-08-12 | Same-family audit of local pin, alias and project collapse | Local pin repeated the identical defect: `pinSource` was stripped by the package even with Codex running, so a pin waited for the next cold reconciliation and never applied while Codex was stopped | Only the cold preflight translated persisted `localPins` into canonical `localPin`; project collapse was unaffected because project cards are not re-projected | Added the lease-gated Kernel `setLocalPin` with no Plan exclusion, and stopped the canonical display name from overwriting an EyPc alias in `name`/`displayName` | verified by focused Kernel/Controller/Domain regressions, typecheck and uTools build; real host pending |
