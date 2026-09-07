<!-- generated-from: code-note/routing/README.md sha256:7ff7948d08ddab1bb13298772000364de248ff55a12d85a6450473a93cdfab12 -->
<!-- generated; edit the canonical source and republish -->

# Rule Kernel Router


Hosts: any

## Shared Always-Load Baseline

| load_id | contract_id | load_type | source | scope |
| --- | --- | --- | --- | --- |
| routing-authority | `rule-routing` | `always-once` | this router | task |
| global-baseline | `rule-priority-hot-route` | `always-once` | [VibeAi](global-core.generated.md) | task |
| project-entry | `project-entry-loading` | `always-once` | project entry / `not-applicable` | project or `not-applicable` |

## Host-Agnostic Auto-Load Paradigm

Apply this baseline on every host. Before domain work, read the [catalog](global-route-catalog.generated.md) and its matched owners. Re-evaluate triggers when the task changes; a pointer is not a completed read.

## Fixed Guards

Always read [reply](global-core.generated.md) and [title](global-core.generated.md). Resolve other matched sole_owner paths through the [registry](global-owners.generated.md#contract-ownership-registry).

| contract_id | activation | trigger_ids |
| --- | --- | --- |
| `prior-task-overlap` | context | continuation,repeated-failure,overlap-check |
| `sidecar` | context | orchestration,cross-project |
| `documentation-impact` | context | rule-change,cross-project,document-sync |
| `communication-primary-response` | always-once | - |
| `task-outcome-and-evidence-stop` | context | scope-conflict,acceptance-conflict |
| `stable-developer-taste` | context | architecture,ui,design,performance |
| `intent-note-overlay` | project-marker | intent-note-gate:enabled |
| `session-title` | always-once | - |
| `task-skill-reminder` | context | skill-list-request |

## Guard Delivery

Measured channels emit short baseline carriers. Task semantics select conditional rules; transport context IDs do not replace this decision. In enabled projects, an explicit Intent Note command (`intent-note-command`) or matching active note (`intent-note-active`) requires its owner; enabling alone creates nothing.

## Deterministic Resolution

[Catalog](global-route-catalog.generated.md).

## Persistence Boundary

No prompts/secrets. Report full UTF-8 against the 16 KiB target and core/project against 4 KiB each; separate Skills/Hooks/built-ins. Preserve required semantics before optimizing size; report any excess instead of dropping rules.
