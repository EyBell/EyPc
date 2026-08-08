---
id: eypc-codex-pending-user-request-overrides-idle-runtime
status: verified
scope: project
fingerprint: codex-desktop-pending-request__plan-confirmation-was-misclassified-after-runtime-became-idle__inspect-finite-unresolved-requests-before-terminal-projection
first_seen: 2026-07-27
last_verified: 2026-08-08
review_after: 2027-02-03
evidence:
  - user-status-correction
  - current-desktop-source-inspection
  - preload-source-fix
  - static-syntax-mirror-and-diff-check
  - current-ownerless-needs-input-host-evidence
  - bounded-rollout-and-owner-loss-regressions
  - completed-plan-rollout-and-live-item-regressions
  - provider-to-domain-real-path-preflight
  - persisted-decision-provenance-regressions
  - relative-domain-module-preflight-loader
  - permission-request-lifecycle-and-private-correlation-regressions
tags:
  - codex-companion
  - desktop-ipc
  - plan-confirmation
  - input-required
  - status-priority
  - owner-loss
  - rollout-recovery
---

# Pending User Requests Override Idle Runtime

## 更新引入（2026-08-07）

本记录继续只主责有限待输入决定的 live/sticky/rollout 证据与生产 Domain 投影。RAW-147 更正了它依赖的 stream 前提：`following=true` 既不是状态快照，也不是要求接收方重报的请求；正向公告回声的根因、修复和宿主验收统一由 [task-switch follow 主记录](codex-task-switch-unfollow-must-not-drop-live-shadow.md#L1) 管理。这里保留该前提用于检测顺序，不再形成第二份协议回声记忆。

## Symptom

A Plan turn can finish generating while still requiring the user to confirm implementation. An ownerless ordinary input can likewise remain native `Needs input` after Desktop stops replaying its request. EyPc may briefly or persistently show either task as completed/ongoing instead of waiting-input, making the most actionable state late.

## Wrong Assumption

The bridge assumed request-derived input flags were relevant only when `threadRuntimeStatus.type` was already `active`. It therefore trusted same-batch `idle` before examining an unresolved user decision.

## Verified Root Cause

The current ChatGPT/Codex Desktop creates unresolved finite requests in `conversationState.requests`, including `item/plan/requestImplementation`, and removes them after the decision. The original projection inspected requests only inside the runtime-active branch and did not recognize the Plan method. RAW-141 found the second ownership failure: after the stream owner disappears, Desktop accepts a new follow but does not replay the current `conversationState` to that follower; App Server list/latest/full Turn omit the pending request and may expose only `notLoaded + interrupted`. For ordinary `request_user_input`, the rollout remains the durable local evidence: an unmatched exact function call means input is pending, while the matching output or a later user message closes it. RAW-142 found a separate Plan boundary: latest Turn may already be `completed` and unread, while the rollout still records an exact completed `Plan` item and no newer `task_started`. That structural pair is durable evidence that planning finished but implementation has not begun; read state is orthogonal. RAW-145 found the cross-layer recurrence: Preload recovered the exact ordinary request but published it as plain `connector`; Domain deliberately rejected connector waiting to prevent historical inventory-hint false positives. The old real-machine preflight duplicated a looser predicate and stopped before production Domain projection, so it falsely certified the Bridge-only repair. While the original owner existed the same request was `desktop-live` and worked; after owner loss it crossed the unmarked persisted fallback and failed again.

## Evidence

- [preload/index.js](../../../preload/index.js#L1) recognizes the exact Plan implementation request, examines unresolved requests regardless of runtime type, and promotes a recognized request to anonymous `active + waitingOnUserInput`.
- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) records the idle-runtime Plan-request contract, zero latest-Turn RPC and plan-content non-disclosure.
- The same Bridge contract records owner loss, sticky ordinary-input/approval/Plan shadows, ordinary-active downgrade, newer-evidence cleanup and safe rollout call/output/user-message parsing.
- [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1) records RAW-093 source verification, privacy and the remaining real-host gate.
- RAW-141 current-host read-only evidence found exactly one unmatched `request_user_input` among current unarchived rollouts and exactly one native `Needs input`; the repaired source projection reports one authoritative active waiting-input without exposing the task identity or content.
- RAW-142 Bridge contracts parse only `task_started` and `item_completed.item.type`, project both persisted and live completed Plan items as anonymous Plan-only waiting, and prove a newer Turn clears the decision. Domain/Controller contracts prove unread true cannot move it into completed-unread.
- RAW-145 current-machine pre-fix evidence produced one plain connector waiting decision but zero production-Domain input tasks. The repaired preflight executes [codex.ts](../../../src/domain/codex.ts#L1): its first post-fix observation reported one `persisted-decision` waiting plus one product input task with zero plain connector waiting; after Provider state removed that decision, the final rerun reported zero and zero.
- RAW-145 focused `192/192`, typecheck, full production build and three-way main preload mirror pass. Exact new Turn/completion contracts clear the persisted provenance, while a plain connector waiting regression remains ongoing.

## Detection Order

1. Prefer a valid, version-matched Desktop live snapshot or patch. A positive follower-state announcement alone is not a snapshot and cannot restore an ownerless request.
2. Inspect the unresolved request list using a finite method allowlist before accepting idle/completed presentation. Correlate repeated full snapshots with a process-random salted hash of a private request identity when available; never publish or persist the raw identity or hash.
3. Map exact `item/plan/requestImplementation` and ordinary input methods to `waitingOnUserInput`; map only command-execution, file-change, permissions `requestApproval` and MCP elicitation to `waitingOnApproval`.
4. While a recognized request exists, publish the known anonymous task immediately as Desktop live active/input. For an unregistered task, retain the private shadow until verified inventory creates its anonymous identity.
5. Across owner/transport loss, retain only an already observed finite input/approval/Plan request shadow for this preload session; ordinary active must drop. Clear the shadow on a new snapshot, exact active/new Turn/completion, newer inventory revision or explicit removal.
6. When no live/sticky request exists, allow interrupted/failed/inProgress inventory with a real rollout under `CODEX_HOME/sessions` to recover an unmatched exact `request_user_input` from a bounded tail. Publish it with explicit `persisted-decision` provenance; matching output or later user input clears it.
7. Separately, for latest Turn `completed` only, allow an exact latest-Turn `item_completed.item.type=Plan` to establish `planImplementationOnly` with the same persisted-decision provenance; a later `task_started` clears it. This decision outranks completed and unread.
8. Run any host preflight through the production Domain and Presentation projections plus the semantic revision gate; resolve every transpiled module's relative imports from that module's own source path. A Bridge/source count or a copied active predicate cannot prove the user-visible bucket or absence of approval double-counting.
9. Never infer input from arbitrary request names, plan text, `resumeState` alone, elapsed time, ordinary connector activity or other rollout content.

## Prevention Rule

For live state machines, an unresolved finite user-decision request outranks an idle runtime or persisted terminal result. Classify exact live requests first; preserve only observed finite requests across soft owner loss; permit bounded allowlisted rollout fallbacks for unmatched exact ordinary input and for an exact Plan item in the latest completed Turn. When multiple same-method requests lack timestamps, keep their first-observation clocks distinct with session-only salted correlation; do not expose or persist request identity. Publish the anonymous business flag plus an explicit finite-decision provenance, retain it across inventory reconstruction, and require exact newer evidence to end the override. Plain connector flags remain non-authoritative. Every real-host check must execute the production Domain/Presentation projections rather than a copied approximation. Unread never participates in the Plan decision.

## Alternative Route

- Status: `verified`; current ownerless ordinary input has real-host read-only Provider→production-Domain evidence and all live/sticky/rollout/provenance branches have automated contracts. Rebuilt uTools UI acceptance remains a product gate, not a failure of this prevention route.
- Preconditions: either an authenticated, version-compatible Desktop shadow exposes a finite unresolved request, an interrupted/failed/inProgress row provides an exact unmatched input call, or a completed row's real rollout contains an exact latest-Turn Plan item.
- Ordered steps: project exact live request first; retain observed finite requests across soft owner loss; otherwise inspect only bounded rollout record metadata for unmatched `request_user_input` or latest-Turn Plan item; publish anonymous input/approval/Plan-only with `persisted-decision`; restore ordinary runtime/Turn projection on output, user continuation or newer Turn evidence.
- Verification: an idle-runtime Plan request immediately enters input; command/file/permissions/MCP approvals enter approval attention; owner loss preserves input/approval/Plan but not ordinary active; unresolved/resolved input and completed-Plan/new-Turn cases project correctly through production Domain; two identical untimestamped approvals retain distinct first-observation times across full-snapshot removal; plain connector waiting remains ongoing; unread true does not create completed-unread; content/raw identity/correlation do not cross the bridge.
- Applicability boundary: this rule does not turn plan text, `resumeState`, unread, arbitrary connector waiting, arbitrary rollout call or arbitrary item into waiting-input. The persisted Plan fallback requires exact structural Plan item plus latest completed Turn and ends at the next Turn boundary.
- Fallback: if neither exact/sticky Desktop authority nor the safe ordinary-input rollout evidence exists, keep the conservative ongoing/terminal rules and wait for verified provider state.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-27 | RAW-093 Plan confirmation input | User clarified that completed Plan awaiting confirmation is waiting-input and must update fastest | Request flags were read only under runtime active, and the Plan method was not recognized | Added exact Plan-request mapping and unresolved-request priority over idle runtime; synchronized source/test/authority contracts | candidate; static source checks pass, real Desktop/uTools transition pending |
| 2026-08-03 | RAW-141 ownerless current input | Native Codex showed one long-lived `Needs input` while EyPc showed ongoing | Assumed refollow would replay current request; dropped every shadow on owner loss and trusted App Server latest Turn, which omitted the request | Kept finite observed request shadows across soft owner loss, preserved Desktop observation across non-kill hiding, and added bounded exact `request_user_input` rollout fallback | verified by unique current-host evidence, focused 170/170, full workspace 737/737 and isolated commit 711/711 plus type/build/runtime gates; rebuilt uTools display pending |
| 2026-08-03 | RAW-142 completed Plan implementation wait | A finished planning Turn appeared as completed-unread although implementation had not started | Required a replayable Desktop request and treated completed Turn as terminal regardless of exact Plan item | Parse exact latest-Turn Plan item from bounded rollout/live item events; project Plan-only waiting until a newer Turn, independent of unread | focused Bridge+Domain 114/114, Controller 2/2 and type/preload checks pass; real uTools pending |
| 2026-08-03 | RAW-145 persisted ordinary input recurrence | Native Codex again showed `Needs input` while EyPc showed ongoing, despite RAW-141 source preflight claiming active | Persisted fallback lost provenance as plain connector at the Domain boundary; the preflight copied a looser active predicate and never ran the production consumer | Added `persisted-decision`, preserved it through inventory/Activity reconstruction, cleared it on exact newer evidence, upgraded to v5 and made preflight execute production Domain | Provider→Domain first converged 1→1, then after decision removal 0→0; focused 192/192, typecheck/full build/mirror pass; installed uTools ASAR reload pending |
| 2026-08-07 | RAW-147 preflight import drift | The production-Domain preflight failed after `codex.ts` gained relative value imports | Evaluated the transpiled root with a `require` anchored at `scripts/`, so `./companionProvider` resolved outside `src/domain` | Added a cached in-memory TypeScript module loader that resolves each relative dependency from its importing source file | Current 30-day production projection returns `ok=true`, v5 and verified completeness; no generated source or private task data persisted |
| 2026-08-08 | RAW-149 permission attention lifecycle | Permission/command/file/MCP approvals were absent from the product attention set; identical untimestamped approvals also needed stable clocks across full-snapshot add/remove without leaking request identity | Recognized only older input/Plan families and matched private observations solely by type/method/time | Added the finite approval allowlist, latest unresolved state time, process-random salted private correlation, Side Chat aggregation and v6 anonymous `waitingSince/statusEnteredAt` boundary | Bridge `84/84` and full affected matrix pass; real Provider→Domain/Presentation v6 preflight is connected/verified, rebuilt uTools approval UI remains host-pending |
