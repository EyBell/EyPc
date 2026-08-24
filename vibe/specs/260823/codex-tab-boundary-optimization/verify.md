# Codex Tab Boundary Optimization — Verification Record

status: `global-current-truth-verified / v6-current-automated-verified-with-known-mqtt-timeout / artifact-ready / native-receipt-unavailable`
updated: `2026-08-24`

## Verification Decision

- Selected boundary: requirement parser/registry、platform public surface、handoff contract consumers、V6 Evidence/Topology/Kernel/Snapshot/ACK consumers、production bundle and durable documentation.
- Escalation reconciliation: the original bounded C delta used a 9-file matrix；the later V6 root-contract change required a full-suite run. This record adopts that current-worktree evidence and adds an independent Root rerun of the 14-file focused matrix.
- WU-C6 impact route: only requirement/source/current-document projections and `validate-requirements.mjs` changed；the selected current gates are script syntax、registry/source/truth validation、writer idempotence、document links and diff integrity。Application tests、typecheck and build were not rerun for this docs/validator-only increment；their V6 results below remain earlier accepted implementation evidence.
- Explicitly unrun: real uTools、Safari、plugin host、Codex Desktop and Mirasim process/visibility/control tests.
- Owner: App Root.

## Results

| Gate | Result | Evidence boundary |
| --- | --- | --- |
| Current V6 focused behavior matrix | pass — 14 files / 493 tests | independently rerun after V6 completion；Evidence projection、Topology、Kernel、navigation/actions、App Server、Float、Controller、Claude watcher、platform identity and UI |
| Default full suite | known exception — 92/93 files / 1448/1449 tests | V6 failures `0`；sole failure is the unrelated MQTT focus-recovery test exceeding the unchanged 5000ms threshold at about 5.3s |
| Complete non-Action suite | pass — 92 files / 1278 tests | all non-Action assertions pass |
| Action file diagnostic run | pass — 1 file / 171 tests | `--testTimeout=20000` proves assertions pass；does not redefine the default gate |
| Requirement Registry | pass — 307 leaves / 6 modules / 279 active / 22 superseded / 6 proposed / 0 conflicted | 22 whole + 58 scoped edges；the 5 new active leaves are RAW-178 parent + #1–#4 |
| Source Anchor Catalog | pass — 29 documents / 200 ordered / 98 RAW-parent registered / 102 source-only | metadata and hashes only；fenced raw material excluded；catalog document hashes match every current raw source |
| Global Current Product Truth | pass — exactly 1 owner and 1 bounded truth block | registry、raw sources、catalog、resolved PRD body、architecture and runtime contract SHA-256 digests match；the stale placeholder failed as designed；two writer runs were content-identical |
| Truth Manifest Field Assertions | pass | isolated delimiter-free parser asserted `307 / 279 / 0` registry、`29 / 200 / 98 / 102` source tuple、Kernel V6 and `artifact-ready` |
| Semantic typecheck | pass | affected public/domain/controller/UI types compile |
| Production build | pass — 1873 modules | two consecutive builds stabilized at `host-ebb1e6b699892efb8151 / renderer-6e9dbf12ac1479057e23`；generated artifact ready, not host loaded |
| uTools runtime validation | pass | built package/runtime contract only |
| Canonical/public preload mirrors | pass — 62 committed pairs | canonical/public parity verified after local batch commits |
| Error memory | pass — 123 leaves | 88 verified / 24 candidate / 11 superseded；unrelated overdue-candidate warnings are non-blocking |
| Document code-link audit | pass | current synchronized task/current/requirement/architecture/help/error-memory set resolves；C ledger is synchronized to V6 current authority |
| Diff whitespace check | pass | current worktree diff has no whitespace errors |

## Acceptance Boundary

Automated evidence proves the repository contract and generated artifact only. Deep Link dispatch, shell protocol acceptance, build success and Runtime Identity do not prove that Codex Desktop became visible, Mirasim released control, Codex acquired control, or a task became read. Those stages remain pending until an explicit native receipt API and separately authorized real-host canary exist.

The original `9 files / 406 tests / 1874 modules` result remains historical pre-V6 evidence and is not used as current acceptance. Current acceptance uses the V6 chain and results above.

## Tooling Recovery

Two read-only shell results are discarded：the first inline truth-field assertion and a later line-number lookup each let a Markdown backtick delimiter cross a double-quoted zsh boundary，so shell substitution changed the intended program/search；later independent commands also masked the first failed step at the compound-command exit。The field assertion was rebuilt without executable shell delimiters，and the lookup was split into fixed-string queries；both were rerun in isolation。This verified same-task recurrence is merged into the existing CodeNote [zsh backtick substitution error record](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/memory/error-archive/2026-07-10-zsh-double-quoted-backtick-command-substitution.md#L1)；no product/runtime state changed。

## Documentation Impact

Classification: `requirement-canonical + global-product-current + architecture-current + project-current + task-only`。Requirement registry、coverage/conflict、PRD、architecture、technical details、documentation/rule indexes、user guide、PROJECT_STATUS and this Controlled ledger are in the synchronized set.
