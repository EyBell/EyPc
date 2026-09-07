# Spec：Cursor 钩子终态后不得被会话残留 unfinishedRunAt 锁在进行中

spec_id: `SPEC-260906-CURSOR-HOOK-TERMINAL-UNFINISHED`
Tool: cursor
Date: 2026-09-06
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L238)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260906-cursor-hook-terminal-unfinished`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260906-cursor-hook-terminal-unfinished",
  "group_owner": "vibe/specs/260906/cursor-hook-terminal-unfinished/spec.md",
  "documents": [
    "vibe/specs/260906/cursor-hook-terminal-unfinished/raw-requirement.md",
    "vibe/specs/260906/cursor-hook-terminal-unfinished/spec.md",
    "vibe/specs/requirements/shared-raw-214.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/cursor-hook-terminal-beats-stale-unfinished-run.md",
    "vibe/knowledge/error-memory/cursor-disk-completed-stale-hook-turnopen.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/companion/evidence-adapter-v7.cjs",
    "src/domain/cursorAgent.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/domain/cursorAgent.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260906/cursor-hook-terminal-unfinished",
    "vibe/specs/requirements/shared-raw-214.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/cursor-hook-terminal-beats-stale-unfinished-run.md",
    "vibe/knowledge/error-memory/cursor-disk-completed-stale-hook-turnopen.md",
    "src/help/guides/codex.md",
    "preload/companion/evidence-adapter-v7.cjs",
    "src/domain/cursorAgent.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/domain/cursorAgent.test.ts"
  ]
}
```

## Requirement Delta

- Add: 钩子 `phase` 为 `completed`/`stopped` 时，忽略会话残留 `unfinishedRunAt`。
- Unchanged: 活分叉仍使父卡进行中；`aborted` + 开 Turn 仍进行中；磁盘 `completed` 压过陈旧 `turnOpen`。

## Design

[evidence-adapter-v7.cjs](../../../../preload/companion/evidence-adapter-v7.cjs#L272) `cursorSessionObservationV7` 把 `liveCold` 拆成活分叉与会话标记；钩子终态只压制会话标记。域函数 [cursorAgent.ts](../../../../src/domain/cursorAgent.ts#L131) 本就把 `hookPhase` completed/stopped 放在会话 `unfinishedRunAt` 之前。
