# Companion Task Topology V5 → V6 — Verification Record

status: `v6-automated-verified-with-known-mqtt-timeout / artifact-ready / documentation-synchronized / host-excluded-by-user`
updated: `2026-08-24`

## 2026-08-24 V6 Corrective Closeout

| Gate | Current result | Scope / boundary |
| --- | --- | --- |
| Focused V6 matrix | passed | `14/14` files、`493/493` tests：public projection、evidence、Topology、Kernel、Actions、Navigation、Float、App Server、Platform、Runtime Identity、Controller、Claude watcher and UI |
| Key-only consumer/action slice | passed | `5/5` files、`359/359` tests after public command migration；subsequent focused/full runs cover neutral `unknown` and unified archive cleanup |
| Default full suite | known exception | `92/93` files、`1448/1449` tests；sole failure is the unrelated MQTT focus-recovery test at [tests/runtime/action.test.ts](../../../../tests/runtime/action.test.ts#L3801) timing out at the unchanged 5000ms threshold after about 5.3s |
| Complete non-Action suite | passed | `92/92` files、`1278/1278` tests |
| Action file with diagnostic timeout | passed | `1/1` file、`171/171` tests with `--testTimeout=20000`；distinguishes a slow existing test from an assertion failure and does not redefine the default gate |
| TypeScript / production build | passed | `vue-tsc --noEmit`；Vite `1873` modules；uTools runtime validation passed；two consecutive builds stabilized at `host-ebb1e6b699892efb8151 / renderer-6e9dbf12ac1479057e23` |
| Canonical/public preload mirrors | passed | `62` committed pairs verified after the RAW-177 handoff pair joined the local batch；syntax checks passed |
| Requirements / source anchors | passed | `302` leaves：`274 active / 22 superseded / 6 proposed / 0 conflicted`；`29` documents、`196` ordered source anchors |
| Error memory | passed | `123` leaves：`88 verified / 24 candidate / 11 superseded`；five unrelated overdue candidate warnings remain non-blocking |
| Document links / whitespace | passed | changed-document local-link audit and `git diff --check` pass after V6 closeout sync |
| Real host gates | not run | no Safari、uTools interactive plugin、real Codex/Claude/Cursor host、native receipt、visible-window or latency canary；automation establishes `artifact-ready`, not `host-loaded` |

### V6 Semantic Evidence

- No product-level debounce exists：the Kernel coalescing default is zero。The former visible delay was the combination of split Provider/Renderer caches、a public projection fallback and Float applied-ACK resend/recreation timing。
- One precise evidence change publishes one complete Snapshot revision；the deterministic test covers 100 alternating running/waiting transitions and the latency gates remain Kernel publish `<50ms` and unified open P95 `<200ms`。
- Supplementary user/new-Turn/thinking evidence changes waiting-input to running immediately without waiting for assistant output。Plan remains independently `ready` until a newer exact cancel、execution-start、archive or removal。
- Plan truth table is completed-unread before native read；read plus existing Plan card becomes waiting-input；read cancel becomes completed；execute becomes running。Generic resolved/completed/default/interrupted does not clear Plan。
- Multi-Agent membership is reduced per member and aggregated once in Kernel；Topology owns membership only。Public `unknown` is alias-free、neutral and non-actionable，so inventory metadata cannot restore an older phase、unread or capability。
- Card click、Enter、badges、attention and previous/next send only canonical key/source through one Command Gateway。Provider-native alias resolution remains private。
- Missing Float applied ACK resends the newest task Snapshot once and records diagnostics；a healthy window is never recreated solely for that miss。
- RAW-177 remains authoritative for open/read：Deep Link or shell `dispatched` stays `confirmsRead=false` and cannot clear Provider unread without a matching native receipt。

## Historical V5 Selected Boundaries

| Gate | Status | Meaning |
| --- | --- | --- |
| Topology/Kernel/Command focused fixtures | passed | topology/kernel/navigation/identity final slice `91/91`; Kernel total `69/69` |
| Cursor/Claude privacy and lifecycle fixtures | passed | hook/inventory queue rejects 正文、summary、transcript；Cursor hot/cold 与 Claude Subagent fixtures passed |
| Controller/Package/UI focused fixtures | passed | controller/Claude `105/105`；UI/platform `178/178`；single-Snapshot consumer assertions passed |
| TypeScript semantic check | passed | `pnpm run typecheck` |
| Vite/uTools artifact build + mirror validation | passed | 1874 modules；`host-d579ac86793a4984743f / renderer-84bc8242ee2a906cf56f`；58 mirror pairs + 3 new files |
| Requirements/error-memory/diff validation | passed | implementation closeout requirements `294`；post-V5 audit requirements `298` leaves；error-memory `123` leaves；`git diff --check` passed |
| Safari/uTools/real plugin/real host | excluded-by-user | never infer host acceptance from automation |

## Full-suite Escalation Decision And Result

The implementation changed the production preload Runtime Identity、Provider manifest、Kernel/Package schema and every task consumer，so the root-contract/unbounded-fan-out trigger required the full suite。

- Exact `pnpm run test`: `92/93` files、`1489/1490` tests；the sole failure is the pre-existing unrelated MQTT focus-recovery case timing out at the suite's default 5000ms。
- `pnpm exec vitest run --exclude tests/runtime/action.test.ts`: `92/92` files、`1319/1319` tests passed。
- The sole MQTT case with `--testTimeout=20000`: `1/1` passed（actual test time about 5.58s）；this proves its assertions pass but does not make the exact default suite green。
- Focused V5 matrices additionally covered topology nesting/invalidity/cycles/reparent/withdrawal/unread、waiting clear/no rebound、operation dedup/serialization/revision revalidation、Provider degradation、subscription replay/ACK、V4 reload-required and child exclusion from count/cycle。

## Acceptance Rule

Automated source/test/build success establishes `implementation-landed / automated-verified` with the explicit known MQTT timeout exception above。The user has excluded Safari、uTools、real-plugin and real-host testing unless separately requested，so this task records `host-excluded-by-user` rather than inventing or waiting for `host-loaded`。

## Historical 2026-08-23 Post-V5 Codex Tab Re-verification

| Check | Result | Boundary |
| --- | --- | --- |
| Requirement lineage and conflict scan | passed | historical snapshot：RAW-167 parent + source-numbered #1–#3 recovered；298 leaves、271 active、21 superseded、6 proposed、0 conflicted；87 no-parent clauses remained outside machine identity at that checkpoint |
| Current source/caller trace | passed | Registry/Topology → V5 Kernel/Snapshot → identity-gated Bridge → Controller/Main/Float；all task effects converge on `CompanionTaskCommandV1`；no active Cursor direct-dispatch or Renderer post-fold caller found |
| Focused current-worktree regression | passed | 7 files / 231 tests：Topology、Kernel、Navigation、Runtime Identity、Platform、Controller、Codex UI |
| Changed-document code-link audit | passed | current architecture、PRD/status、requirements、Controlled docs and assessment all resolve |
| Whitespace/range check | passed | `git diff --check` |
| Runtime/Host | not run | no Safari、uTools、real plugin or real Host；no `host-loaded`、native visible-window or external control-owner claim |

Historical audit disposition: repository requirements had no unresolved semantic conflict。The then-observed 87 no-parent clauses were a registry identity limitation；the current catalog supersedes that count with 102 stable `SA-*` source identities。Mirasim/native applied-control ownership still has no repository contract and is not silently treated as implemented or accepted。
