# EyPc V7 Global Refactor — Controlled Specification

spec_id: `SPEC-260824-EYPC-V7-GLOBAL-REFACTOR`
spec_revision: `2`
status: `implementation-landed / automated-verified / artifact-ready / integrated / host-unverified`
updated: `2026-08-25`

## Execution Authority

- Control plane: `app-root`
- Sole decision owner: App Root Thread
- Allowed interactive execution surfaces: `main`, `native-thread`
- Automation lane: `not-applicable`
- Surface-to-surface delegation: forbidden
- Main-owned decisions: requirement interpretation, architecture, writes, verification, documentation synchronization and final acceptance

## Prior Task Overlap

- Reuse the accepted V6 Kernel, task-state v8-v11 waiting-clear work, Command Gateway, Float applied ACK and provider registry.
- Preserve RAW-153's instance-level clear barrier and exact unresolved-request allowlist.
- Replace only the remaining semantic conflation where Plan artifact availability or historical `planReady` can synthesize waiting.
- Reuse existing featureRegistry, RuntimeAction, keybinding runtime and Lucide assets as migration foundations; do not introduce a parallel application framework.
- The previously accepted Codex Tab and topology tasks remain historical evidence. This task owns only the new net delta and its current product merge.

## Requirement Change Review

| Delta | Classification | Current decision | Required result |
| --- | --- | --- | --- |
| Interaction and Plan artifact become distinct lanes | `change / supersede-scoped` | `explicit-current-request` | Only a current open interaction creates waiting; artifact-only becomes stopped |
| Historical completed Plan no longer means pending input | `remove / supersede` | `explicit-current-request` | Delete synthetic terminal+read+planReady waiting rules and conflicting tests/help |
| Provider evidence becomes raw and Kernel-owned | `change / consolidate` | `explicit-current-request` | No phase-to-evidence feedback or second public reducer |
| Tabs and runtime notifications become feature scoped | `change / consolidate` | `explicit-current-request` | Pages consume RuntimeSlice and declared FeatureModule lifecycle |
| Commands, shortcuts, menus, layers and targets gain sole owners | `add / consolidate` | `explicit-current-request` | One catalog and one exact target model across surfaces |
| UI tokens, density and themes become project-wide | `change / consolidate` | `explicit-current-request` | Existing product soul is retained except where this request explicitly supersedes action rail/theme details |
| Performance hot paths gain bounded incremental contracts | `change / harden` | `explicit-current-request` | Domain notifications, indexed bindings, incremental MQTT, async diagnostics and bounded child IPC |

## Canonical Semantics

Public projection order is: excluded -> running -> terminal unread -> waiting approval -> waiting input -> artifact-only stopped -> completed read -> unknown. Every task has exactly one public group. Same-revision disagreement is quarantined rather than resolved by arrival order.

Interaction tombstones are private, monotonic and session-safe. Artifact state is independently monotonic across `unknown / available / executing / consumed / cancelled / removed`. Read state is orthogonal to both.

## Contract Revisions

The frozen runtime chain is `task-state-v12 / companion-provider-registry-v1 / companion-task-topology-v2 / companion-task-kernel-v7 / companion-task-snapshot-v7 / companion-task-command-v1 / companion-task-subscribe-v1 / companion-task-ack-v2`. Evidence uses `companion-task-evidence-draft-v7` and complete per-Provider `companion-provider-evidence-batch-v3` transactions. The JSON schema is the single source for generated TS/CJS declarations and runtime validators; an incompatible Host/Renderer chain fails closed as `reload-required`.

## Worktree Contract

```json worktree-task-v1
{
  "schema": "worktree-task/v1",
  "task_id": "260824-eypc-v7-global-refactor",
  "control_plane": "app-root",
  "target_branch": "codex/port-management-redesign",
  "repositories": [
    {
      "repo_id": "eypc",
      "base_sha": "6e1d6e3704e628b4d1fa5c7fa845403f39cbb0ff",
      "worktree_branch": "codex/260824-eypc-v7-global-refactor",
      "task_owner": "vibe/specs/260824/eypc-v7-global-refactor/spec.md",
      "head": "3ca704314b506945745551c740b2f0c53feccb06",
      "upstream": null
    }
  ],
  "commit_mode": "verified-milestone",
  "push_mode": "current-message-only",
  "verification_state": "verified-commit",
  "push_state": "not-authorized",
  "integration_state": "integrated",
  "next_action": "obtain separate authorization for target-branch push and real uTools Host install/interaction/visual acceptance"
}
```

## Documentation Impact

Classification: `requirement-canonical + project-current + task-only`. PRODUCT_REQUIREMENTS, requirement registry/conflict records, PROJECT_STATUS, architecture, technical details, help, runtime identity and affected project error memories are synchronized to V7. Automated acceptance does not establish real Host loading, interaction latency or visual acceptance.
