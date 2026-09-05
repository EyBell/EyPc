# Spec：取消 Claude App 版本白名单准入

spec_id: `SPEC-260905-CLAUDE-NO-VERSION-WHITELIST`
Tool: cursor
Date: 2026-09-05
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L244)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260905-claude-no-version-whitelist`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260905-claude-no-version-whitelist",
  "group_owner": "vibe/specs/260905/claude-no-version-whitelist/spec.md",
  "documents": [
    "vibe/specs/260905/claude-no-version-whitelist/raw-requirement.md",
    "vibe/specs/260905/claude-no-version-whitelist/spec.md",
    "vibe/specs/requirements/claude-raw-211.md",
    "vibe/specs/requirements/claude-raw-013.md",
    "vibe/specs/requirements/claude-raw-032.md",
    "vibe/specs/requirements/invariants-raw-168.md",
    "vibe/specs/requirements/invariants-raw-170.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/rules/README.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/error-memory/claude-unread-decay-blocked-by-version-gate-and-minute-flush.md",
    "vibe/knowledge/error-memory/provider-version-whitelist-must-not-gate-generic-capability.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/claude/app-state.cjs",
    "public/claude/app-state.cjs",
    "preload/claude/archive.cjs",
    "public/claude/archive.cjs",
    "public/runtime-identity.cjs",
    "scripts/validate-utools-runtime.mjs",
    "tests/platform/claudeAppStateBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/runtime/claudeCompanionWatcherE2E.test.ts",
    "tests/platform/companionTaskKernel.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-committed-preload-mirrors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260905/claude-no-version-whitelist",
    "vibe/specs/requirements/claude-raw-211.md",
    "vibe/specs/requirements/claude-raw-013.md",
    "vibe/specs/requirements/claude-raw-032.md",
    "vibe/specs/requirements/invariants-raw-168.md",
    "vibe/specs/requirements/invariants-raw-170.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/source-anchors/catalog.json",
    "vibe/rules/README.md",
    "vibe/knowledge",
    "src/help/guides/codex.md",
    "preload/claude/app-state.cjs",
    "preload/claude/archive.cjs",
    "public/claude",
    "public/runtime-identity.cjs",
    "scripts/validate-utools-runtime.mjs",
    "tests/platform/claudeAppStateBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/runtime/claudeCompanionWatcherE2E.test.ts",
    "tests/platform/companionTaskKernel.test.ts"
  ]
}
```

## Current contract

Claude App 日志热车道按固定无内容行式匹配。App 版本只作诊断。未知版本不得整段熄火。归档资格仍只看状态与写前结构复核。
