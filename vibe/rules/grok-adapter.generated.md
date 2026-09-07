<!-- generated-from: code-note/adapters/grok.md sha256:63e5d3a24b2bf82d6de0199e8ab98298ab1c89cccf6b8b2122b937d8e306597f -->
<!-- generated; edit the canonical source and republish -->

# Grok Rule Loading Adapter


Tool: grok
Authority: this host's loading baseline and measured capability rows only. Shared policy, session title format and route selection stay in their own owners; this adapter links and never restates them.

## Always Load

| load_id | contract_id | load_type | source | scope |
| --- | --- | --- | --- | --- |
| injected-entry | `grok-rule-loading` | `always-once` | global `~/.grok/rules` and current project `AGENTS.md` | task |

The shared baseline rows (`routing-authority`, `global-baseline`, `project-entry`) live once in [routing §Shared Always-Load Baseline](global-router.generated.md#shared-always-load-baseline) and are never copied here.

This host reads `~/.grok/rules` plus the repository `AGENTS.md`. It does not inherit Claude `CLAUDE.md` loading or Codex `$CODEX_HOME` hooks.

Use the shared [VibeAi](global-core.generated.md) and [short router](global-router.generated.md) baseline once, including its two default guards. Conditional owners load when matched. Actual title changes require this host's measured capability; an unavailable API does not disable the reply or title policy.

## Host Capability Manifest

| capability_id | state | values | default |
| --- | --- | --- | --- |
| instruction-loading | observed | global-rules,project-agents | global-rules |
| guard-delivery | observed | instruction-only | instruction-only |
| session-rename | observed | rename-supported | rename-supported |
| execution-mode | observed | main-only,native-agents | main-only |
| skills | observed | explicit-skill | explicit-skill |
| grok-hooks | observed | session-start,user-prompt-submit,pre-tool-use,post-tool-use,stop | - |
| scheduled-automation | supported | scheduled-task | scheduled-task |
| usage-counters | unavailable | - | - |



Detailed runtime and trust evidence: grok capabilities (central dependency unavailable: `adapters/grok-capabilities.md`). Configuration does not prove fresh-session acceptance; unsupported modes fall back to main-only.
