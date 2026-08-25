# Spec：Codex 配置页静默刷新与运行区整合

spec_id: `SPEC-260825-CODEX-CONFIG-SILENT-INTEGRATION`
Tool: grok
Date: 2026-08-25
Status: `confirmed / focused-automated-verified / host-visual-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L273)
Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:codex-config-silent-integration`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:codex-config-silent-integration",
  "group_owner": "vibe/specs/260825/codex-config-silent-integration/spec.md",
  "documents": [
    "vibe/specs/260825/codex-config-silent-integration/raw-requirement.md",
    "vibe/specs/260825/codex-config-silent-integration/spec.md",
    "vibe/specs/260825/codex-config-silent-integration/design-preference-receipt.md",
    "vibe/specs/260825/codex-config-silent-integration/changes.md",
    "vibe/specs/requirements/codex-raw-180.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/technical-details.md",
    "src/help/guides/codex.md",
    "vibe/specs/PROJECT_STATUS.md"
  ],
  "dependencies": [
    "src/domain/codexEnvironmentPresentation.ts",
    "src/pages/CodexPage.vue",
    "src/styles/codex.css",
    "src/styles/app.css",
    "vibe/specs/source-anchors/catalog.json"
  ],
  "validators": ["scripts/validate-requirements.mjs"],
  "git_scope_prefixes": ["vibe/specs/260825/codex-config-silent-integration"]
}
```

## Requirement Delta

- Add: silent hold of last successful Codex connection copy during automatic reread.
- Change: runtime diagnostic is a wrapping stacked panel; primary title+detail stay visible.
- Change: main-app operation tooltip is opaque; Codex `i` uses that layer.
- Unchanged: five config tabs, host shortcut non-readback, float child-owned hints.

Acceptance: see [raw](raw-requirement.md#L40).

## Requirement Change Review

- Scan scope: RAW-087, RAW-133, product Tooltip, Codex companion taste.
- Visible changes: added silent refresh; changed runtime diagnostic chrome and tooltip opacity.
- Conflict classification: `compatible-update` with scoped refine of RAW-087 (primary diagnostic is status, not instructional copy).
- Decision status: `explicit-current-request`.
- Post-sync rescan: `pass` after registry + PRD write.

## Prior Task Overlap

- Relationship: `partial-overlap` with RAW-087/133 configuration density and live-region.
- Decision: `delta-only`. Reuse five-tab shell; only net delta is silent refresh, stacked diagnostic, opaque complete tips.

## Canonical Merge

- Target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L135) tooltip opacity; [L273](../../PRODUCT_REQUIREMENTS.md#L273) Codex tab silent reread.
- Merge status: synchronized in the same round.

## Implementation Sync

- Domain: `codexConnectionStatusLabel` holds last successful copy while `refreshing`; `buildCodexEnvironmentPresentation` ignores `checking` once `checkedAt > 0` and the snapshot is not legacy-pending; `busy` flags in-flight inspect only.
- Page: runtime diagnostic shows title+detail in flow; live region only when `role=alert`; `i` carries `data-operation-tooltip` + description.
- CSS: stacked diagnostic, wrapping cells, opaque tooltip surface.

## Verification

- Provisional `VerificationImpactTrace`: presentation labels + Codex page chrome + shared tooltip opacity. Direct consumers: Codex config page, presentation tests, companion UI source contracts, operation tooltip CSS. No bundle/entrypoint change.
- Selected: `tests/domain/codexEnvironmentPresentation.test.ts`, `tests/ui/codexCompanion.test.ts`; `pnpm run validate:requirements --write-current-truth` after registry/PRD.
- Skipped: repository-wide test/typecheck/build (no testing-owner escalation); real uTools visual (user-owned, not requested).

## Documentation Impact

- `requirement-canonical + project-current + task-only`
- Help: [codex.md](../../../../src/help/guides/codex.md#L15)
- Soul / architecture synchronized.

## Execution Journal

- 2026-08-25: user screenshot of runtime tab flashing “正在读取” and overlapping tiles; implemented silent hold + stacked diagnostic + opaque tips.

## Efficiency / Token Evidence

- Bounded to Codex config presentation and tooltip surface; no Kernel/preload change.

## Closeout

- Automated focused tests + requirements validation in this round.
- Real-host visual of the runtime tab remains user-owned.
