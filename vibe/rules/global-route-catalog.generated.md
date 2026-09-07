<!-- generated-from: code-note/routing/catalog.md sha256:bec4f125428a228c3c26f8485c807c2ae292544003d161b1ff7c48c0760e6e39 -->
<!-- generated; edit the canonical source and republish -->

# Rule Routing Details

Conditional machine route catalog and resolver semantics. Loading baseline and guard activation are owned by [the short router](global-router.generated.md).

## Route Catalog

Select one outcome-owning primary by priority. The selected row may add one typed evidence/companion owner; other matched domain primaries become required additives after deduplication.

| priority | route_id | signal_ids | requested_outputs | primary_contract | secondary_contract | secondary_type |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | governance-conflict | governance-conflict,requirement-remove | conflict-decision | `requirement-conflict-removal-archive` | `codex-governance-audit-index` | `evidence-only` |
| 20 | requirement-delta | requirement-change | current-requirement | `requirement-versioning` | `task-documentation` | `additive` |
| 21 | requirements-hub | requirements-hub,requirement-hub | requirements-hub | `requirements-hub` | `requirement-versioning` | `evidence-only` |
| 30 | requirement-lineage | requirement-lineage | lineage-report | `requirement-lineage` | `source-freshness` | `evidence-only` |
| 40 | rollout | rollout,canary | rollout-decision | `rollout` | `verification-selection` | `evidence-only` |
| 41 | runtime | runtime,hook | runtime-diagnosis | `runtime-supervision` | `verified-recovery-index` | `evidence-only` |
| 42 | project-runtime | project-runtime,local-run,service-lifecycle,debug-runtime | runtime-operation | `project-runtime-lifecycle` | `ops-release-observability` | `evidence-only` |
| 50 | orchestration | orchestration,sidecar,cli | execution-plan | `orchestration` | `prompt-before-effort-evaluation` | `evidence-only` |
| 55 | worktree-task | worktree,large-change,dirty-main,parallel-work,task-recovery | execution-plan | `worktree-task-lifecycle` | `task-documentation` | `additive` |
| 60 | verified-recovery | repeated-failure,recovery | recovery-route | `verified-recovery-index` | `memory-error-routing` | `evidence-only` |
| 70 | task-evolution | task-evolution,promotion | evolution-decision | `task-evolution` | `evolution-candidate` | `evidence-only` |
| 80 | rule-task-history | rule-history,rule-task-index | history-report | `rule-task-trace` | - | - |
| 100 | process | process-doc,handoff | process-artifact | `task-documentation` | `dialogue-guided-execution` | `additive` |
| 105 | checkpoint-resume | pause,resume,trigger-phrase | resume-artifact | `checkpoint-resume` | `task-documentation` | `additive` |
| 110 | engineering | code,architecture | engineering-artifact | `engineering-contract` | `verification-selection` | `additive` |
| 115 | feature-map | feature-map,capability-map,feature-inventory | feature-map-artifact | `feature-map` | `verification-selection` | `additive` |
| 120 | testing | test,regression | verification-result | `verification-selection` | `memory-error-routing` | `evidence-only` |
| 130 | ui-design | ui,design | ui-artifact | `ui-method-and-fidelity` | `design-preference` | `additive` |
| 140 | security | security,permission,computer-use | security-decision | `security-contract` | `source-freshness` | `evidence-only` |
| 150 | github | github,issue,pr,review,ci | collaboration-result | `github-collaboration` | `verification-selection` | `additive` |
| 160 | ops | release,deploy,incident,ssh | operations-decision | `ops-release-observability` | `security-contract` | `additive` |
| 170 | db-data | db,sql,data-repair | data-artifact | `db-data-governance` | `security-contract` | `additive` |
| 180 | skill | skill | skill-artifact | `skill-governance` | `source-freshness` | `evidence-only` |
| 190 | lark | lark,feishu | lark-artifact | `lark-routing` | `security-contract` | `additive` |
| 200 | memory | memory,error-memory,computer-use | memory-decision | `memory-error-routing` | - | - |
| 210 | source | source,freshness | evidence-assessment | `source-freshness` | `evaluation-thresholds` | `evidence-only` |

[Contract Registry](global-owners.generated.md#contract-ownership-registry) and owner declarations define normative contracts; one-sided entries fail closed. Templates and evidence are uncounted, and guards never become primaries.

## Deterministic Resolution

1. Select `inspect-report | implement-validate | confirm-first` from the current user request through the communication owner. Domain routing cannot manufacture or upgrade that mode.
2. Reject empty, malformed or unknown signals; otherwise choose the unique lowest-priority primary. Only a rollout/runtime tie uses `requested_outputs`; unresolved input is `confirm-first`.
3. Collect every other matched primary contract as a required additive, then include the selected row's additive secondary. Deduplicate against the primary and cap the set at three; overflow or a typed cycle is `confirm-first` (`additive-overflow`). The capped required set is additionally exposed as a deterministic load order: `required_additive_batches` groups it into batches of at most three by route priority (the flattened `required_additive_contracts` field stays for compatibility), and `load_batches` lists the full baseline / fixed-guards / primary / additive-batches / evidence order. Batching is a representation of the same owner set, never a relaxation of the total cap.
4. Expose one selected `evidence-only` secondary as optional evidence. If another matched domain already requires the same owner, required wins and the optional field is omitted. Evidence never authorizes an action or replaces the primary owner.
5. Let the current host adapter select only an actually supported execution mode. Unsupported or unavailable capability falls back to `main-only` without weakening shared policy; an unadapted observed host starts from `main-only` and is never rejected for lacking an adapter.
6. Apply high-risk action guards after request-mode classification. An `inspect-report` task may still inspect a gated domain, while implementation remains blocked until the owning action gate is satisfied. The machine-visible `read_only_audit_exception` is `true` only when the route is **resolved** with request mode `inspect-report` (unknown signal, ambiguity, overflow, invalid host/mode and contract drift stay `confirm-first` and never grant it); it never authorizes side effects (`side_effects_authorized` stays `false`) and never upgrades implement/confirm modes.

Invalid input, ambiguity, owner drift, adapter drift or an unknown/malformed execution mode is side-effect-free `confirm-first`. A known mode unsupported by the current host is capability fallback to `main-only`, not intent escalation. Payment, approval, credential/permission and DB mutation gates remain stricter than this router.

### Loading Epoch

`kernel_load_epoch` is a deterministic content digest (`sha256:<16 hex>`, algorithm `sha256`) over the kernel loading authority surfaces: this routing authority (including the shared baseline, route catalog and fixed-guard membership), [VibeAi](global-core.generated.md), the [Contract Ownership Registry](global-owners.generated.md#contract-ownership-registry), each adapter's Always Load injection overlay, and the Registry sole-owner file content of every fixed guard listed here (Skills owners outside Vibe_Rules included by repository-relative label; a missing owner still enters the canonical input). Identical content yields the identical epoch; any authority content change — including a guard owner edit — invalidates it. It never includes absolute paths, time, runtime/thread state or host observation values. The loading report and every `route-decision/v1` emit it for same-session continuation deduplication (reload on fresh handoff, project or authority change). An optional `audit_epoch` input disables the read-only audit exception when it is stale, without changing route status, owner or exit code.

## Persistence Boundary

Persist no prompts, commands, transcripts, reasoning, outputs, credentials, personal data, machine paths or private receipts. Route results are bounded decisions, not a task log, capability claim or write grant.
