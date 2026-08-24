# Changes：Companion Task Topology V5 → V6 变更清单

> Inventory only. Judgement lives in [tasks](tasks.md#L1), evidence in [verify](verify.md#L1), and current authority in [spec](spec.md#L1). Rows are measured from the two V5 commits plus the current task-owned working-tree delta；unrelated `_to_delete/` is excluded.

## 1. 概览

| 批次 | 提交 | 文件数 | 核心说明 |
| --- | --- | ---: | --- |
| V5 topology/kernel | `aabbbd0` | 21 | 建立 Provider manifest/registry、exact topology、V5 Kernel/package/command contracts and focused tests |
| Three-provider evidence | `765f77c` | 21 | Codex/Claude/Cursor source adapters正式提交 V5 evidence，canonical/public mirrors and provider tests同步 |
| V6 Host/Preload and bridge | `f581946` | 32 | Provider evidence、membership-only Topology、sole Kernel Snapshot、Plan/waiting/ACK、open handoff and bridge tests |
| V6 consumers and command path | `c2e2abd` | 20 | Main/Float/Codex page consume one Snapshot/Command；Provider task cache、alias and Claude sync bypass removed |
| Requirements and source catalog | `18cc3d0` | 22 | RAW-167/176/177、302-leaf registry、29-document/196-anchor catalog and current PRD |
| Stable runtime identity | `2f205b8` | 1 | Final Host/Renderer asset identity after two consecutive stable production builds |
| Current-authority closeout | current docs batch | scoped below | Controlled ledgers、status、architecture、help、rules and error-memory sync；push not requested |

## 2. 交付物清单

### V5 topology/kernel — `aabbbd0`

| 对象 | 类型 | 核心说明 |
| --- | --- | --- |
| `preload/companion/navigation.cjs` · `public/companion/navigation.cjs` | 改动 | V5 Provider-neutral navigation、single concurrency and leading/final-trailing dispatch |
| `preload/companion/provider-manifest.json` · `public/companion/provider-manifest.json` | 新增 | 唯一 Provider ID/order/capability/relation/version manifest |
| `preload/companion/provider-registry.cjs` · `public/companion/provider-registry.cjs` | 新增 | Manifest validation and Host adapter binding registry |
| `preload/companion/task-actions.cjs` · `public/companion/task-actions.cjs` | 改动 | Actions v3 effect implementation and target safety contracts |
| `preload/companion/task-kernel.cjs` · `public/companion/task-kernel.cjs` | 改动 | V5 process-only graph/evidence/root reducer、Snapshot、Command、subscribe/ACK |
| `preload/companion/task-topology.cjs` · `public/companion/task-topology.cjs` | 新增 | Exact relation admission、cycle/reparent/withdrawal and root resolution |
| `scripts/utools-preload-assets.mjs` | 改动 | Registers new managed preload mirror assets |
| `src/domain/companionProvider.ts` | 改动 | Provider registry-aligned public identities and neutral effect contract |
| `src/domain/companionTaskPackage.ts` | 改动 | `companion-task-package-v5` immutable root Snapshot contract |
| `src/domain/companionTaskTopology.ts` | 新增 | Public node/relation/evidence/command TypeScript contracts |
| `tests/domain/companionProvider.test.ts` · `tests/domain/companionTaskPackage.test.ts` | 改动 | Provider/package V5 domain regressions |
| `tests/platform/companionNavigationBridge.test.ts` · `tests/platform/companionTaskKernel.test.ts` · `tests/platform/companionTaskTopology.test.ts` | 新增/改动 | Navigation、Kernel and topology truth tables |

### Three-provider evidence — `765f77c`

| 对象 | 类型 | 核心说明 |
| --- | --- | --- |
| `preload/claude/code-sessions.cjs` · `public/claude/code-sessions.cjs` | 改动 | Claude inventory emits registry-compatible membership/topology evidence |
| `preload/claude/events.cjs` · `public/claude/events.cjs` | 改动 | Allowlisted Subagent lifecycle evidence |
| `preload/claude/index.cjs` · `public/claude/index.cjs` | 改动 | Claude adapter exports V5 evidence lane |
| `preload/claude/scripts.cjs` · `public/claude/scripts.cjs` | 改动 | Script payload contracts align with privacy allowlist |
| `preload/cursor/events.cjs` · `public/cursor/events.cjs` | 改动 | Cursor Hook hot relationship evidence |
| `preload/cursor/index.cjs` · `public/cursor/index.cjs` | 改动 | Cursor adapter exports V5 evidence lane |
| `preload/cursor/inventory.cjs` · `public/cursor/inventory.cjs` | 改动 | Cursor cold inventory and exact relation reconciliation |
| `preload/cursor/scripts.cjs` · `public/cursor/scripts.cjs` | 改动 | Cursor payload shape/privacy contract |
| `preload/index.js` · `public/preload.js` | 改动 | Host Registry binding、three-provider evidence submission、Runtime facade and cold rebuild |
| `tests/platform/claudeBridge.test.ts` · `tests/platform/codexAppServerBridge.test.ts` · `tests/platform/cursorHooks.test.ts` | 改动 | Provider identity、topology、privacy and lifecycle fixtures |

### Consumer/doc closeout — 2026-08-24 local batch scope

| 对象 | 类型 | 核心说明 |
| --- | --- | --- |
| `preload/float.js` · `public/float-preload.js` | 改动 | Float V5 schema/identity/revision validation and applied ACK |
| `public/runtime-identity.cjs` · `scripts/utools-runtime-identity.mjs` · `scripts/utools-runtime-identity.d.mts` · `scripts/validate-utools-runtime.mjs` | 改动 | Six-part Registry/Topology/Snapshot/Command/Subscribe/ACK identity and runtime gates |
| `src/FloatApp.vue` · `src/styles/float.css` | 改动 | Root-only V5 Snapshot rendering、subtask aggregate summary and same-revision apply |
| `src/domain/codex.ts` · `src/env.d.ts` | 改动 | V5-compatible presentation/domain and window bridge typings |
| `src/platform/eypcPlatform.ts` | 改动 | Runtime identity fail-closed and current `companionKernel` bridge；legacy facades retained compatibility-only |
| `src/runtime/codexController.ts` | 改动 | Removes provider-specific direct task effects；attach/subscribe/ACK and one Command Gateway |
| `src/help/guides/codex.md` | 改动 | Current root-only topology、identity/reload and Host acceptance help |
| `vite.config.ts` | 改动 | Test/build fixture wiring for the V5 surface |
| `tests/domain/companionPresentation.test.ts` | 改动 | Root/provider presentation regression |
| `tests/platform/codexFloatWindowBridge.test.ts` · `tests/platform/eypcPlatform.test.ts` · `tests/platform/runtimeIdentity.test.ts` | 改动 | Float bridge、platform exposure and six-part identity tests |
| `tests/runtime/claudeCompanionController.test.ts` · `tests/runtime/claudeCompanionWatcherE2E.test.ts` · `tests/runtime/codexController.test.ts` | 改动 | Controller/provider watcher/Command convergence tests |
| `tests/ui/codexCompanion.test.ts` | 改动 | Root-only UI、subtask summary and action routing tests |
| `vibe/knowledge/error-memory/kernel-complete-reapply-must-not-drop-cursor-cards.md` · `vibe/knowledge/error-memory/new-companion-source-must-register-with-navigation-authority.md` | 改动 | Old split-path failures marked historical under V5 replacement |
| `vibe/knowledge/ARCHITECTURE.md` · `vibe/specs/PRODUCT_REQUIREMENTS.md` · `vibe/specs/PROJECT_STATUS.md` | 改动 | Current V5 architecture、Codex code overview、product authority and status routes |
| `vibe/specs/requirements/shared-raw-176.md` · `vibe/specs/requirements/modules/companion-shared.md` | 新增/改动 | RAW-176 identity and shared-module ownership |
| `vibe/specs/requirements/codex-quick-task-view-raw-167.md` · `vibe/specs/requirements/codex-quick-task-view-raw-167-clause-001.md` · `vibe/specs/requirements/codex-quick-task-view-raw-167-clause-002.md` · `vibe/specs/requirements/codex-quick-task-view-raw-167-clause-003.md` | 新增 | Recover missing RAW-167 parent and three source-numbered additions |
| `vibe/specs/requirements/README.md` · `vibe/specs/requirements/coverage.md` · `vibe/specs/requirements/conflict-register.md` · `vibe/specs/requirements/modules/companion-codex.md` | 改动 | Honest 298-leaf coverage、current conflict/gap disposition and Codex current authorities |
| `vibe/specs/260823/companion-task-topology-v5/raw-requirement.md` · `spec.md` · `plan.md` · `tasks.md` · `verify.md` · `handoff.md` | 新增/改动 | Controlled requirement、design、execution、verification and resume authority |
| `vibe/specs/260823/companion-task-topology-v5/assessment/README.md` · `assessment/260823-codex-architecture-audit.md` · `changes.md` | 新增 | Post-V5 audit evidence、discoverability and measured inventory |

### V6 corrective revision — 2026-08-24 local batch scope

| 对象 | 类型 | 核心说明 |
| --- | --- | --- |
| `preload/companion/provider-manifest.json` · `task-topology.cjs` · `task-kernel.cjs` | 改动 | Topology V2 membership-only；Kernel V6 sole reducer；Snapshot/ACK V6 identities and public/private split |
| `preload/index.js` · `preload/float.js` | 改动 | V6 evidence batches、waiting/Plan exact lifecycle、configuration barrier、key-private aliases、one ACK resend without healthy recreate |
| `public/**` managed preload mirrors | 生成同步 | Canonical preload changes mirrored；runtime identity regenerated only through build/prepare |
| `scripts/utools-runtime-identity.*` · `validate-utools-runtime.mjs` · `utools-preload-assets.mjs` | 改动 | Full V6 revision-chain and packaged asset validation |
| `src/domain/companionTaskTopology.ts` · `companionTaskPackage.ts` · `companionProvider.ts` · `codex.ts` | 改动 | Public V6 evidence/Snapshot types、alias-free key-only port、neutral `unknown` projection and Provider-neutral semantics |
| `src/platform/eypcPlatform.ts` · `src/runtime/appRuntime.ts` · `src/runtime/codexController.ts` | 改动 | Sole `companionKernel` bridge；removed Provider-specific Claude task-sync action；Main consumes shared Snapshot and immediate configuration barrier；verified archive no longer mutates a second Provider-specific Controller cache |
| `src/FloatApp.vue` · `src/pages/CodexPage.vue` · environment typings/styles | 改动 | Shared revision rendering、no Renderer state reducer、V6 bridge typing/presentation |
| domain/platform/runtime/UI tests | 改动 | Plan truth table、supplement→running、multi-Agent aggregate、100 rapid revisions、latency、ACK no-recreate、RAW-177 unread and removed sync action |
| current help/PRD/status/architecture/technical details/RAW-176 Controlled docs | 改动 | V6 authority and exact semantics；V5 retained as historical lineage |
| `companion-consumer-cache-and-float-applied-ack.md` · `companion-plan-lifecycle-and-interrupted-causality.md` | 改动 | Existing fingerprints updated with verified V6 recurrence and route；no duplicate error leaf created |

RAW-177-owned `open-handoff.cjs`、Source Anchor Catalog、conflict edges and removed V4/V2 platform facades are preserved as inputs/boundaries，not claimed as V6-created artifacts。

## 3. 明确没做的（分流，不是遗漏）

| 对象 | 数量 | 核心说明 |
| --- | ---: | --- |
| Safari / uTools / real plugin / real Host | 4 gates | User-excluded；automation cannot establish `host-loaded` or visible native UI |
| B-class registry identities | 87 clauses | No parent RAW and section numbering restarts；new identity creation requires a user naming decision |
| Mirasim → Codex applied/control contract | 1 external boundary | No repository authority or acknowledgement channel；not invented from Deep Link dispatch |
| `_to_delete/` | user-owned tree | Explicitly excluded；no cleanup、delete or archive operation |
| Push | 0 | Not requested；local commits are handled only by the later 2026-08-24 commit-only request |

## 4. 用户可见行为变化

| 位置 | 变化 | 核心说明 |
| --- | --- | --- |
| V5 implementation batches | Provider-specific split task paths → one exact topology、one root Snapshot、one Command | All task surfaces now share the same root identity/state/effect route；Host acceptance remains separate |
| Post-V5 audit delta | no runtime behavior change | Registry and current docs now expose RAW-167、V5/V4 status and code ownership honestly |
| V6 corrective delta | one task-state template + one Snapshot/Command consumer surface | Waiting/Plan/multi-Agent transitions publish from sole Kernel；private aliases stay Host-only；healthy missing ACK cannot crash navigation through recreate |

## 5. 顺手发现但未处理

| 位置 | 现象 | 核心说明 |
| --- | --- | --- |
| `src/platform/eypcPlatform.ts` | Unused legacy bridge fields remain exposed | Compatibility debt, not an active bypass；separate cleanup required |
| External task handoff | No native visible/applied/control ACK | Needs user-defined cross-product contract and evidence source |
| Requirement corpus | 87 numbered + prose requirements remain non-machine-addressable | Semantics stay in source/spec/PRD；identity authoring not inferred |
| Full test suite | One unrelated MQTT default-timeout case | Prior V5 record: assertions pass with 20s threshold；not rerun for docs-only audit |

## 6. 回归数字

| 批次 | 测试 | 构建 | 静态检查 |
| --- | --- | --- | --- |
| V5 implementation | exact full suite `1489/1490`; non-MQTT `1319/1319`; focused V5 passed | typecheck、1874-module build、58 mirror pairs passed | requirements 294、error-memory 123、diff passed at implementation closeout |
| Post-V5 audit | focused V5/Codex `7/7` files、`231/231` passed | not rerun；no build boundary change | requirements `298` passed；changed-document code-link audit passed；`git diff --check` passed |
| V6 corrective revision | focused `14/14`、`493/493`; non-Action `92/92`、`1278/1278`; Action 20s `171/171`; default full `1448/1449` with sole known MQTT timeout | typecheck、1873-module two-build fixed point、uTools validator；`host-ebb1e6b699892efb8151 / renderer-6e9dbf12ac1479057e23` | 62 mirror pairs、302 requirements leaves、29 docs/196 source anchors、123 error-memory leaves、changed links and diff passed；real Host not run |
