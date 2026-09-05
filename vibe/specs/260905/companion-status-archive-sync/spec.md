# Spec：状态来源与额外进程归档双向实时

spec_id: `SPEC-260905-COMPANION-STATUS-ARCHIVE-SYNC`
Tool: cursor
Date: 2026-09-05
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-verified-codex-archive-bidirectional / host-loaded / host-verified-claude-code-phase`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L244)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260905-companion-status-archive-sync`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260905-companion-status-archive-sync",
  "group_owner": "vibe/specs/260905/companion-status-archive-sync/spec.md",
  "documents": [
    "vibe/specs/260905/companion-status-archive-sync/raw-requirement.md",
    "vibe/specs/260905/companion-status-archive-sync/spec.md",
    "vibe/specs/260905/companion-status-archive-sync/changes.md",
    "vibe/specs/260901/codexhost-external-completion/raw-requirement.md",
    "vibe/specs/260901/codexhost-external-completion/spec.md",
    "vibe/specs/requirements/codex-raw-199.md",
    "vibe/specs/requirements/codex-raw-209.md",
    "vibe/specs/requirements/claude-raw-210.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/rules/README.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md",
    "vibe/knowledge/error-memory/claude-metadata-activity-is-not-completion-evidence.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/codex/archive-bridge.cjs",
    "public/codex/archive-bridge.cjs",
    "preload/index.js",
    "preload/claude/code-sessions.cjs",
    "public/claude/code-sessions.cjs",
    "tests/platform/codexhostArchive.test.ts",
    "tests/platform/claudeBridge.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-committed-preload-mirrors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260905/companion-status-archive-sync",
    "vibe/specs/260901/codexhost-external-completion",
    "vibe/specs/requirements/codex-raw-199.md",
    "vibe/specs/requirements/codex-raw-209.md",
    "vibe/specs/requirements/claude-raw-210.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/source-anchors/catalog.json",
    "vibe/rules/README.md",
    "vibe/knowledge",
    "src/help/guides/codex.md",
    "preload/codex/archive-bridge.cjs",
    "preload/claude/code-sessions.cjs",
    "public",
    "tests/platform/codexhostArchive.test.ts",
    "tests/platform/claudeBridge.test.ts"
  ]
}
```

## Explicit non-goals

- 不改 CodexHost 仓库；不给 Claude D′ 归档增加 Host 扇出。
- 不把截图里的 Cloud Code 行当成归档通路。
- 不把 F-1-a 归档真机当成 Cloud Code 相位真机。
- 不跑仓库级 `pnpm test` / 真实再归档。

## Design

- [archive-bridge.cjs](../../../../preload/codex/archive-bridge.cjs#L307)：别名或花名册命中即 Host 车道；官方 `protocol-error` 且 Host read 成功则改道；verify-1 后 `notifyThreadArchived`。
- [index.js](../../../../preload/index.js#L8591)：`codexThreadAlias` 粘性钉 `codexhostExternal`。
- [code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L205)：`uniqueLiveHook` 对齐 App `live-append`；`historyConfirmsCompletedTurn` 才允许 history 退休。

## Acceptance

1. 插件归档额外进程：Host 列表无该 id、archived 列表有；Codex APP 侧栏实时收起。
2. Codex APP 归档同一额外进程：Host / 插件行消失或进已归档。
3. 运行中 Host 任务归档仍拒绝。
4. Cloud Code 唯一 live Hook 进行中时，插件不得只因 `completedTurns=1` 显示已完成（聚焦自动化已钉；2026-09-05 重载后用户观测 Claude Code 任务状态已同步）。
