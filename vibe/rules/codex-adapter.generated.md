<!-- generated-from: code-note/codex-evolution/README.md sha256:e419dee3f56b5a8f00bb05cc3b8829d3593a7d343c758718c1542085211fe3e6 -->
<!-- generated; edit the canonical source and republish -->

# Codex Rule Loading Adapter


Tool: codex
Authority: measured Codex capabilities and loading overlay; shared policy stays in the core.

## Rule Load Contract

### Always Load

| load_id | contract_id | load_type | source | scope |
| --- | --- | --- | --- | --- |
| injected-entry | `codex-rule-loading` | `always-once` | injected global/project AGENTS.md | task |

Use the [shared baseline](global-router.generated.md#shared-always-load-baseline), including its two default guards; reuse unchanged authority.

## Host Capability Manifest

| capability_id | state | values | default |
| --- | --- | --- | --- |
| instruction-loading | configured | global-agents,project-agents | global-agents |
| execution-mode | configured | main-only,native-agents,explicit-cli | main-only |
| file-navigation | observed | native-file-panel-request,markdown-absolute-link | markdown-absolute-link |
| link-jump-form | configured | absolute-path-colon-line | absolute-path-colon-line |
| codex-hooks | observed | session-start,user-prompt-submit,pre-tool-use,post-tool-use,subagent-stop,stop | - |
| guard-delivery | configured | instruction-only | instruction-only |
| session-rename | observed | rename-supported | rename-supported |
| supervisor-daily | supported | manual-dry-run,manual-maintenance,manual-low-risk | manual-dry-run |
| scheduled-automation | observed | heartbeat,project-cron | heartbeat |
| usage-counters | unavailable | - | - |

Use compact baseline owners through instructions; reminder channels and title tools require current-host evidence. Fresh-session acceptance is separate. Detailed evidence, execution modes, evolution and Hook trust live in host capabilities (central dependency unavailable: `codex-evolution/host-capabilities.md`).

## Residual Gate Index

State: current-state (central dependency unavailable: `governance/current-state.json`); acceptance: rollout (central dependency unavailable: `codex-evolution/rollout/README.md`). Hooks fail open; keep existing action gates.
