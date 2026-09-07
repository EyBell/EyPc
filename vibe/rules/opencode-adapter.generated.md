<!-- generated-from: code-note/adapters/opencode.md sha256:da532a0210f7adc63364157932121a9463998db9f56491f26b5cdf01d3975c83 -->
<!-- generated; edit the canonical source and republish -->

# Opencode Rule Loading Adapter


Tool: opencode
Authority: OpenCode loading and capability projection only; shared policy and routing stay in VibeAi and the Rule Kernel routing owner.

## Always Load

| load_id | contract_id | load_type | source | scope |
| --- | --- | --- | --- | --- |
| injected-entry | `opencode-rule-loading` | `always-once` | global `instructions`, advertised references and current project `AGENTS.md` | task |

The shared baseline rows (`routing-authority`, `global-baseline`, `project-entry`) live once in [routing §Shared Always-Load Baseline](global-router.generated.md#shared-always-load-baseline) and are never copied here.

Use the shared [VibeAi](global-core.generated.md) and [short router](global-router.generated.md) baseline once, including its two default guards. Conditional owners load when matched. Actual title changes require this host's measured capability; an unavailable API does not disable the reply or title policy.

## Host Capability Manifest

| capability_id | state | values | default |
| --- | --- | --- | --- |
| instruction-loading | observed | global-instructions,project-agents | global-instructions |
| reference-root | observed | codenote | codenote |
| execution-mode | observed | main-only,native-agents | main-only |
| skills | observed | explicit-skill | explicit-skill |
| codex-hooks | not-applicable | - | - |
| guard-delivery | observed | instruction-only | instruction-only |
| scheduled-automation | not-applicable | - | - |
| usage-counters | unavailable | - | - |



Detailed runtime and trust evidence: opencode capabilities (central dependency unavailable: `adapters/opencode-capabilities.md`). Configuration does not prove fresh-session acceptance; unsupported modes fall back to main-only.
