# Spec：Codex 配置页信息密度收紧

spec_id: `SPEC-260901-CODEX-CONFIG-DENSITY`
Tool: grok
Date: 2026-09-01
Status: `confirmed / focused-automated-verified / host-visual-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L282)
Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:codex-config-density`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:codex-config-density",
  "group_owner": "vibe/specs/260901/codex-config-density/spec.md",
  "documents": [
    "vibe/specs/260901/codex-config-density/raw-requirement.md",
    "vibe/specs/260901/codex-config-density/spec.md",
    "vibe/specs/260901/codex-config-density/design-preference-receipt.md",
    "vibe/specs/260901/codex-config-density/changes.md",
    "vibe/specs/requirements/codex-raw-196.md",
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
    "src/styles/codex.css"
  ],
  "validators": ["scripts/validate-requirements.mjs"],
  "git_scope_prefixes": ["vibe/specs/260901/codex-config-density"]
}
```

## Requirement Delta

- Change: runtime diagnostic is a compact status row; ready/checking detail lives behind `i`.
- Change: healthy-noise diagnostic rows hide unless warning/error.
- Change: launch path is one control row; page icons shrink.
- Unchanged: five config tabs, silent reread, host shortcut non-readback, opaque tooltip.

Acceptance: see [raw](raw-requirement.md#L46).

## Requirement Change Review

- Scan scope: RAW-087, RAW-016, RAW-180, Codex companion taste.
- Visible changes: compact chrome; hide healthy diagnostic cards; inline detail only for alerts.
- Conflict classification: `compatible-update` with scoped supersession of RAW-180 title+detail always-visible and ten-card chrome.
- Decision status: `explicit-current-request`.
- Post-sync rescan: `pass` after registry + PRD write.

## Prior Task Overlap

- Relationship: `partial-overlap` with RAW-180 runtime chrome.
- Decision: `delta-only`. Keep silent refresh and opaque tips; only net delta is density.

## Canonical Merge

- Target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L282) Codex tab runtime chrome.
- Merge status: synchronized in the same round.

## Implementation Sync

- Domain: `prominence` on each diagnostic row; `visibleCodexEnvironmentRows` / `shouldInlineCodexEnvironmentDetail` own compact filtering.
- Page: one-line hero, compact diagnostic copy + redetect, chip rows, single launch row, smaller Lucide icons.
- CSS: flex chips, compact padding, 14px `i`.

## Verification

- Provisional `VerificationImpactTrace`: environment presentation + Codex page chrome. Direct consumers: Codex config page, presentation tests, companion UI source contracts. No bundle/entrypoint semantics beyond renderer CSS/Vue.
- Selected: `tests/domain/codexEnvironmentPresentation.test.ts`, `tests/ui/codexCompanion.test.ts`, `tests/ui/designSystemV7.test.ts` (`91/91`); `pnpm run build` (vue-tsc + production) and `validate-requirements --write-current-truth` after registry/PRD.
- Skipped: repository-wide test/typecheck (no testing-owner escalation); real uTools visual (user-owned, not requested). `pnpm run build` is required before identity closeout because `src/` changed.

## Documentation Impact

- `requirement-canonical + project-current + task-only`
- Help: [codex.md](../../../../src/help/guides/codex.md#L15)
- Soul / architecture synchronized.

## Execution Journal

- 2026-09-01: user screenshot of dense runtime tab; compact hero, chips, launch row and alert-only inline detail.

## Closeout

- Automated focused tests + requirements validation in this round.
- Real-host visual of the runtime tab remains user-owned.
