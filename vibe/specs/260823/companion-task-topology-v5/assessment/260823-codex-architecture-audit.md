# Codex Tab Current Requirement And Architecture Audit

> Historical post-V5 audit snapshot。RAW-176 revision 4 later found remaining Renderer/provider cache and Float ACK-recreate ownership defects；current runtime authority and verification are [V6 spec](../spec.md#L1) / [verify](../verify.md#L1)。RAW-177 Source Anchor and native receipt conclusions below remain valid。

Date: 2026-08-23
Assessor: Codex App Root
Type: `audit / re-verification`
Result: `repository-authority-reconciled / source-chain-confirmed / host-not-run`

> Evidence only. Requirement authority remains [spec](../spec.md#L1) and [PRODUCT_REQUIREMENTS](../../../PRODUCT_REQUIREMENTS.md#L180)；verification authority remains [verify](../verify.md#L1).

## Scope

- Codex Tab and Float original requirements、later changes、machine registry and conflict history.
- Current V5 Registry/Topology/Kernel/Command/Bridge/Controller/Main/Float source chain.
- Environment Action relation to Codex feature inventory without treating it as a task reducer.
- Deep Link、session read hint、external Codex Desktop visibility and control-ownership boundaries.
- No Safari、uTools、real plugin、real Host、Provider mutation or private payload inspection.

## Requirement Lineage Result

| Item | Result | Evidence / disposition |
| --- | --- | --- |
| Registered Codex + Shared lineage | reconciled | Current registry has 158 `companion-codex` and 89 `companion-shared` leaves after this audit；lifecycle routes through [module owners](../../../requirements/modules/companion-codex.md#L1) rather than historical task prose alone |
| RAW-167 quick task view | fixed gap | Parent RAW and its source-numbered #1–#3 additions now have qualified identities；search、focus、arrows、Shift preview、number/direct-open and settings routes remain one current contract |
| Environment Action originals | visible but not machine-addressable | 39 numbered clauses have no RAW parent and restart numbering by section；they remain authoritative through [source](../../../260729/1435-codex-environment-actions/raw-requirement.md#L1)、spec and PRD，without invented registry IDs |
| Later V5 change | integrated | RAW-176 owns Registry、exact topology、single Snapshot、single Command and six-part Runtime Identity；older V4 identities are historical only |
| Existing requirement conflicts | none unresolved | Current source Change Reviews already decide Ctrl+F vs F Quick Jump、confirmation row vs popover、V4 vs V5 topology/command and Claude StopFailure behavior；see [conflict register](../../../requirements/conflict-register.md#L1) |

## Current Source Architecture Result

```text
Provider evidence -> source adapters -> Registry/Topology -> V5 Kernel
  -> immutable root Snapshot -> platform identity gate -> Controller -> Main/Float

UI / shortcut intent -> Controller -> CompanionTaskCommandV1
  -> Kernel same-Snapshot target resolution -> Provider Adapter effect
```

| Boundary | First-hand source result |
| --- | --- |
| Registry and topology | One manifest enumerates Codex/Claude/Cursor；relations require exact same-provider/family identity、existing parent、no self/cycle and non-regressive generation |
| Kernel and package | Process-only graph/evidence/reduction publishes only complete `companion-task-package-v5` root Snapshots on semantic change |
| Effects | Controller open/archive/attention/cycle paths submit `CompanionTaskCommandV1`；no active Cursor direct-dispatch or Renderer post-fold path was found |
| Consumers | Main applies monotonic Snapshot revisions and ACKs `main`；Float validates identity/schema、deduplicates revision and ACKs applied without rebuilding task state |
| Failure boundary | Provider exceptions degrade one provider；identity mismatch returns `reload-required`；source/build cannot establish `host-loaded` |
| Compatibility debt | `eypcPlatform` still exposes unused V4 `companionNavigation` and V2 `companionTasks` facade fields；no current `src/` consumer uses them，but they remain a future parallel-path risk |

The durable current code map is synchronized in [ARCHITECTURE](../../../../knowledge/ARCHITECTURE.md#L121).

## Conflict And Gap Disposition

1. `resolved-doc-drift` — Architecture and Project Status mixed present-tense V4/V2 identities with the V5 implementation. Current sections now name V5/V3；retained V4 text is explicitly historical.
2. `resolved-coverage-gap` — RAW-167 existed in the source but was absent from the registry. The qualified parent and three already-numbered additions are now extracted without inventing semantics.
3. `retained-coverage-limit` — 87 B-class numbered requirements and prose sources still lack a safe identity boundary. Registering them requires a separate user naming decision；their product semantics remain in source/spec/PRD and are not discarded.
4. `external-authority-gap` — the repository has no Mirasim contract or native applied acknowledgement. Current Host `opened` / explicitly accepted dispatch can satisfy the existing local handoff/session-hint contract，but it cannot prove an external Codex Desktop window became visible or transferred control. No current authority claims otherwise.
5. `compatibility-debt` — legacy platform facade fields are documented compatibility-only. Removing them is a source change with its own type/test impact and is not folded into this documentation audit.

## Verification

- Source/caller trace: complete and accepted by App Root.
- Requirement validator、changed-link audit and diff check: passed；final evidence is written to [verify](../verify.md#L1), which remains the verification owner.
- Focused current-worktree test: 7 files / 231 tests passed across Topology、Kernel、Navigation、Runtime Identity、Platform、Controller and Codex UI。Typecheck/build were not rerun for the documentation/registry-only delta；the prior V5 build matrix remains historical evidence, not a new run.
- Runtime/Host: not run；`host-loaded`、native visible window and external control ownership remain unproven.

## Document Impact

- `requirement-canonical`: registry README、coverage、conflict register、Companion Codex module and RAW-167 leaves synchronized.
- `product-current`: PRODUCT_REQUIREMENTS current authority routes synchronized without changing user-visible semantics.
- `project-current`: ARCHITECTURE now carries the live code overview；PROJECT_STATUS distinguishes V5 current from V4 historical.
- `task-process`: spec/plan/tasks/verify/handoff/changes and this assessment are synchronized before Root acceptance.
- `user-help`: current Codex guide already matches V5 root-only/identity/Host boundary；no material change required.
