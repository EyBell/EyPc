<!-- generated-from: code-note/adapters/claude.md sha256:eee723c4bb16bffe7f42f00d4de67cecf4f36cdb0f42de63fb132e8cdcc3c87f -->
<!-- generated; edit the canonical source and republish -->

# Claude Rule Loading Adapter


Tool: claude
Authority: this host's loading baseline and measured capability rows only. Shared policy, session title format and route selection stay in their own owners; this adapter links and never restates them.

## Always Load

| load_id | contract_id | load_type | source | scope |
| --- | --- | --- | --- | --- |
| injected-entry | `claude-rule-loading` | `always-once` | global `CLAUDE.md` and its declared imports | task |

The shared baseline rows (`routing-authority`, `global-baseline`, `project-entry`) live once in [routing §Shared Always-Load Baseline](global-router.generated.md#shared-always-load-baseline) and are never copied here.

This host reads `CLAUDE.md`, not `AGENTS.md`. A repository that keeps both as equivalent entries satisfies the project-entry row through its own `CLAUDE.md`; a repository with only `AGENTS.md` reaches this host only through an authorized host-side hook, never by assuming automatic discovery.

Use the shared [VibeAi](global-core.generated.md) and [short router](global-router.generated.md) baseline once, including its two default guards. Conditional owners load when matched. Actual title changes require this host's measured capability; an unavailable API does not disable the reply or title policy.

## Host Capability Manifest

| capability_id | state | values | default |
| --- | --- | --- | --- |
| codex-hooks | observed | post-tool-use, pre-tool-use, session-start, stop, subagent-stop, user-prompt-submit | - |
| execution-mode | configured | main-only, native-agents | main-only |
| file-navigation | observed | markdown-absolute-link,reply-file-preview,show-in-files | markdown-absolute-link |
| instruction-loading | observed | global-claude, project-claude | global-claude |
| scheduled-automation | supported | cron, scheduled-task | cron |
| session-rename | observed | rename-supported | rename-supported |
| guard-delivery | configured | instruction-only | instruction-only |
| session-chapters | observed | chapter-marking | chapter-marking |
| usage-counters | unavailable | - | - |



Detailed runtime and trust evidence: claude capabilities (central dependency unavailable: `adapters/claude-capabilities.md`). Configuration does not prove fresh-session acceptance; unsupported modes fall back to main-only.
