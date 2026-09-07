# Spec：状态分组压过置顶泊位；精确 Claude 拓扑撤回残留活子代理

spec_id: `SPEC-260907-STATUS-OVER-PIN-AND-STALE-CLAUDE-CHILD`
Tool: cursor
Date: 2026-09-07
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L250)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260907-status-over-pin-and-stale-claude-child`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260907-status-over-pin-and-stale-claude-child",
  "group_owner": "vibe/specs/260907/status-over-pin-and-stale-claude-child/spec.md",
  "documents": [
    "vibe/specs/260907/status-over-pin-and-stale-claude-child/raw-requirement.md",
    "vibe/specs/260907/status-over-pin-and-stale-claude-child/spec.md",
    "vibe/specs/requirements/shared-raw-215.md",
    "vibe/specs/requirements/shared-raw-216.md",
    "vibe/specs/requirements/shared-raw-185.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/claude-exact-topology-must-retract-absent-children.md",
    "vibe/knowledge/error-memory/pin-group-is-parking-lot-not-live-status.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/code-map/flows/companion-kernel.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/companion/task-kernel.cjs",
    "preload/index.js",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexAppServerBridge.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260907/status-over-pin-and-stale-claude-child",
    "vibe/specs/requirements/shared-raw-215.md",
    "vibe/specs/requirements/shared-raw-216.md",
    "vibe/specs/requirements/shared-raw-185.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/claude-exact-topology-must-retract-absent-children.md",
    "vibe/knowledge/error-memory/pin-group-is-parking-lot-not-live-status.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/code-map/flows/companion-kernel.md",
    "src/help/guides/codex.md",
    "preload/companion/task-kernel.cjs",
    "preload/index.js",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexAppServerBridge.test.ts"
  ]
}
```

## Requirement Delta

- Add: 进行中 / 待输入 / 待继续 / 已完成未读压过置顶泊位；图钉留在行上。
- Add: Claude `topologyComplete` 全家快照撤回缺席子代理。
- Unchanged: 置顶豁免活动时间窗；已完成已读与 unknown 仍停置顶分组；metadata-only 不冒充快照。

## Design

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L670) `derivedDynamicGroup` 先按相位进状态组，置顶分组只收已完成已读与 `unknown`。同文件在精确 `metadata.topologyComplete` 的 family 上撤回本批未出现的私有成员（[#L2050](../../../../preload/companion/task-kernel.cjs#L2050)）。[index.js](../../../../preload/index.js#L11575) 仅在非 metadata-only 且会话 `topologyComplete` 时打该标记。
