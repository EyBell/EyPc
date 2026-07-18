# Quick Jump 目标中心叠层规范

Tool: codex
Date: 2026-07-18
Status: `integrated`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:quick-jump-center-overlay`
- Group owner: this `spec.md`
- Git document prefixes: `vibe/specs/260718/0947-quick-jump-center-overlay/`, `vibe/rules/`, `vibe/knowledge/`, `vibe/specs/PRODUCT_REQUIREMENTS.md`, `vibe/specs/PROJECT_STATUS.md`.
- Durable document members: this Spec, raw requirement, product requirements, project status, project rules, architecture, technical details and Developer Soul.
- Declared code/config dependencies: `src/domain/quickJumpLayout.ts`, `src/components/QuickJumpLayer.vue`, `src/App.vue`, `src/styles/app.css`, MQTT row markup and focused Quick Jump/UI tests.
- Linked current/rule/memory authorities: [project rules](../../../rules/README.md#L1), [architecture](../../../knowledge/ARCHITECTURE.md#L1), [technical details](../../../knowledge/technical-details.md#L1), [Developer Soul](../../../knowledge/developer-soul.md#L1).
- Excluded unrelated dirty documents: none; worktree was clean at task start.
- Shared-file stage ownership: only this requirement delta's hunks are in scope.

## Requirement Delta

- Modify: replace Quick Jump title/edge/collision candidate placement with exact target-center projection.
- Confirmed facts: every marker uses the target rectangle center; no planar staggering or viewport clamping; the existing compact framed badge remains; fixed top-layer and pointer pass-through remain.
- Pending decisions: none.
- Acceptance criteria: marker and target centers match after open, scroll and resize; single/multi-character widths do not change the center; overlapping/edge markers are not displaced; existing command and editing ownership remain unchanged.

## Prior Task Overlap

- Relationship: `partial-overlap`.
- Document governance: reuse the accepted [Global Quick Jump](../../260626-eypc-global-quick-jump/01-spec.md#L1) and [cross-tab interaction](../../260713/0834-cross-tab-responsive-command-panels/spec.md#L1) histories without rewriting them.
- Execution logic verification: current source still implemented title/edge candidates, collision scoring, viewport clamping and a legacy visual offset; the framed badge and top-layer behavior were already accepted.
- Traceability and decision: `delta-only + new-task`; supersede current placement semantics only.

## Canonical Merge

- Base project version: `2026-07-13.1`.
- Result project version: `2026-07-18.1`.
- Target sections and backlinks: `PRODUCT_REQUIREMENTS.md` Shared Interaction Surfaces and this Spec.
- Merge status / missing target: integrated; canonical target and backlinks synchronized.

## Implementation Sync

- Changed logic: `layoutQuickJumpMarkers` directly projects each target center and retains only badge size calculation; App/overlay no longer resolve title anchors; CSS uses `translate(-50%, -50%)` while preserving the compact framed style.
- Authoritative current document: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1).
- Entry-to-module mapping: App scans targets → QuickJumpLayer reads target rectangles → pure layout returns target centers → fixed top-layer renders framed badges.
- Verification evidence: focused `3` files / `12` cases, full `38` files / `346` cases, typecheck, production build and uTools validation pass. Browser checks at `1180×680`, `760×680` and `420×680` report `0px` maximum center error, framed `18×18px` minimum badges, pointer transparency and unchanged layout/scroll widths.
- Gap / follow-up: real uTools host rendering is not separately claimed; browser runtime covers the changed DOM/CSS path.

## Verification

### Verification Decision

- Route: `live-ui` plus focused/full automated gates.
- Reason: coordinate behavior is pure and testable, while visual center correspondence and non-blocking overlay need real rendering evidence.
- Checked: focused/full tests, typecheck, production build, uTools runtime validation, three browser viewports, diff hygiene and Markdown code-link audit passed.
- Skipped: real uTools host visual smoke was not required for this pure DOM/CSS placement delta. Project AI-rule audit still reports the pre-existing adapter/governance baseline gaps already recorded by the prior accepted task; none points to this change.
- Owner: App Root.
- Residual risk: exact fixed centers may intentionally overlap or be partially clipped at viewport edges.

| Check | Evidence | Result | Remaining Manual Path |
| --- | --- | --- | --- |
| requirement/raw/canonical parity | normalized raw + Spec + canonical readback | pass | none |
| center projection | focused tests + three browser viewports, `0px` maximum error | pass | none |
| command/input ownership | full `38` files / `346` cases | pass | none |
| framed visual and non-blocking layer | CSS regression + browser computed geometry | pass | none |
| build/package | typecheck + Vite production build + uTools validation | pass | none |

## Documentation Impact

- Classification: `requirement-canonical + project-current`.
- Central Rule Task admission: project-local / no central row.
- Parent identity or local parent backlink: this Standard requirement delta.
- `doc_drift`: resolved; project rule, canonical requirement, status, architecture, technical details and Developer Soul now describe target-center projection and the retained framed badge.
- Affected authoritative documents: product requirements, project status/rules, architecture, technical details and Developer Soul.
- Root acceptance gate: accepted; pre-existing project AI-rule adapter findings remain outside this requirement delta.

## Execution Journal

| Event | Trigger / Evidence | State Change | Root Decision |
| --- | --- | --- | --- |
| requirement correction | framed badge retained to prevent letter/content confusion | pure outlined glyph rejected | preserve current compact framed visual |
| execution route | orchestration Skill rejects Luna writes under unrestricted permissions | planned native write unit → main-only | Root owns all writes and verification |
| focused verification correction | source assertion also matched visibility filtering | focused test failed → narrowed assertion → pass | implementation unchanged |
| full and live verification | automated/build/browser evidence complete | reported → verified | accept implementation and canonical merge |

## Efficiency / Token Evidence

- Baseline / observed / delta: planned one mechanical child; actual route main-only due permission contract.
- Confidence / source: verified from orchestration Skill and current permission profile.
- Usage: `usage unavailable`.

## Closeout

- Requirement Manifest / project version: `2026-07-18.1` integrated.
- Canonical merge: complete.
- Verification: focused/full/typecheck/build/uTools/browser/code-link/diff gates passed; project AI-rule audit retains unrelated pre-existing adapter findings.
- Documentation and memory/error routing: canonical/current/architecture/technical/Soul synchronized; no new reusable failure pattern, so error memory remains unchanged.
- Open gate / owner: none for this delta; real-host visual smoke remains an optional environment check.
