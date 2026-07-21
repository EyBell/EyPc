---
id: eypc-codex-cross-process-notloaded-is-not-completion
status: verified
scope: project
fingerprint: codex-task-state-or-question-time-derived-from-thread-recency__separate-app-server-notloaded-and-metadata-updates-were-treated-as-live-or-completion-evidence__use-exact-thread-active-plus-latest-turn-status-and-startedat__eypc-codex-companion
first_seen: 2026-07-18
last_verified: 2026-07-20
review_after: 2027-01-18
evidence:
  - user-host-observation
  - official-local-protocol-schema
  - official-app-server-turn-pagination
  - regression-test
  - browser-qa
tags:
  - codex-app-server
  - task-status
  - cross-process
  - notloaded
  - conversation-snapshot-v2
---

# Cross-process `notLoaded` And Recency Are Not Task-State Evidence

## Symptom

Codex Companion placed tasks that were still running or waiting for user input into the completed/pending-review area. The compact and expanded views therefore reported misleading task counts and confirmation actions.

## Wrong Assumption

The implementation treated a recent timestamp from a thread reported as `notLoaded` by EyPc's separate App Server as a temporary activity signal that could become completion after a settling delay. It also collapsed all live `activeFlags` into one generic ongoing state.

## Verified Root Cause

Codex App Server runtime status is process-local. `notLoaded` means the thread is not loaded in the connected App Server process; it does not mean the task has stopped. The current protocol reports exact live work as `active`, with independent `waitingOnUserInput` and `waitingOnApproval` flags that may coexist. A recency timestamp is activity evidence, not a completion event.

The first correction removed false completion but stopped at inventory-only `notLoaded`, so a fresh separate App Server projected every visible Desktop-owned task as unknown. Current App Server protocol also exposes status-only `thread/turns/list(itemsView=notLoaded)`: it cannot recover foreign live input/running state, but the latest Turn's `completed`, `failed` or `interrupted` value is usable persisted outcome evidence without loading turn items. Only `completed` forms the completed business bucket; failed/interrupted remain accurate non-completed labels. Latest Turn `startedAt`, not thread recency, is the only safe “last question time”.

## Evidence

- Status projection and count separation: [codex.ts](../../../src/domain/codex.ts#L122).
- Cross-process and active-flag regressions: [codex.test.ts](../../../tests/domain/codex.test.ts#L154).
- Provider allowlist regression: [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1).
- Semantic task groups and accessible labels: [FloatApp.vue](../../../src/FloatApp.vue#L55) and [codexCompanion.test.ts](../../../tests/ui/codexCompanion.test.ts#L128).
- Acceptance record: [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Correct Detection Order

1. Preserve the provider's exact `status.type` and every allowlisted active flag.
2. For exact `active`, project waiting-for-input/approval labels and flag-free running; preserve simultaneous flags. Only this exact thread status is authoritative live and blocks archive.
3. Preserve latest Turn outcomes: completed forms a completion revision; failed/interrupted remain distinct non-completed activity labels; thread `systemError` remains distinct.
4. Treat bare `notLoaded`, missing metadata and timeout as `状态待核验`; never infer active, completion or failure from recency or elapsed time.
5. Request the newest Turn for every valid current row with `limit=1`, descending order and `itemsView=notLoaded`; allowlist only status, `startedAt` and completed `completedAt`.
6. Do not require `completedAt` to be newer than later thread metadata. Metadata can update after a real completion without invalidating that Turn outcome.
7. Derive `lastQuestionAt` only from latest Turn `startedAt`; when absent, sort it after same-bucket rows with an exact question time.
8. Bound enrichment with a worker pool and cache, but do not apply a consumer cap below the current `thread/list(limit=100)` inventory. One failed row degrades only itself.
9. Migrate legacy receipts only as local viewed/hidden watermarks; never manufacture an inventory row or scan archived inventory to recover one.

## Prevention Rule

Never derive live state, terminal state or last-question time from inventory visibility, elapsed time or recency. A provider adapter must distinguish exact thread-active evidence, persisted Turn outcomes and inventory-only metadata. Only a latest completed Turn with valid `completedAt` forms completion; failed/interrupted/systemError/unknown keep their own labels. Exact foreign input/approval/running still requires a shared live authority.

## Latest Applicable Implementation

[preload/index.js](../../../preload/index.js#L1) enriches every valid recent unarchived row with bounded, cached status-only latest-Turn reads and never forwards items/raw IDs. [codex.ts](../../../src/domain/codex.ts#L1) owns V2 buckets, activity labels, viewed/hidden migration and the shared comparator. [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1), [codex.test.ts](../../../tests/domain/codex.test.ts#L1) and [codexController.test.ts](../../../tests/runtime/codexController.test.ts#L1) lock privacy, fallback, sorting, migration and archive capability.

## Alternative Route

- Status: `verified`.
- Preconditions: EyPc uses a separate local App Server and cannot attach to the Codex Desktop App Server's private stdio transport.
- Ordered steps: preserve exact active flags; classify exact active and persisted latest-Turn results independently; keep bare notLoaded/timeout unknown; use latest Turn `startedAt` for question time; enrich all current rows with bounded concurrency/cache; project V2 buckets and accurate labels; migrate only viewed/hidden watermarks.
- Verification: focused `8 / 86`, full `47 / 433`, typecheck, production build and uTools runtime validation pass. Bridge coverage includes all 100 latest-Turn requests, per-row degradation, private item non-forwarding and method-not-found fallback.
- Applicability boundary: the current local Codex App Server adapter. It does not make the separate Server authoritative for foreign live input/approval/running. A future Easy Agent/shared control plane may replace the inventory-only source with an authoritative live task feed while keeping V2 renderer buckets.
- Fallback: when latest-Turn metadata is absent, malformed, unsupported or slow, keep that row `状态待核验` and place missing question time after exact peers; never infer from recency.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18 | Codex quota/task companion | User observed input/running tasks shown under completed task state | Convert cross-process `notLoaded` recency to pending after a delay | Official local protocol schema, sanitized real status probe and UI screenshot | Split exact active flags and unknown activity; remove settling-to-pending; add focused/full/visual gates | verified |
| 2026-07-19 | Codex quota/task companion | User reported that every task became unknown after the semantic correction | Stop after inventory-only `notLoaded`, leaving no persisted terminal recovery path | Official App Server turn-pagination contract, privacy-safe aggregate probe, focused regressions and user feedback | Add bounded `itemsView=notLoaded` latest-turn metadata; repair only current completed evidence; keep interrupted unknown | verified |
| 2026-07-20 | Codex task status and sorting | User required correct active/completed/completed-unread/archive states plus latest-question ordering | Limit enrichment to 30 rows, compare completion against later thread metadata, and use recency as a generic fallback | V2 domain/bridge/UI regressions and full project gates | Enrich all 100 current rows; keep exact latest-Turn outcomes; use only Turn `startedAt` for question ordering; remove archived recovery | verified |
