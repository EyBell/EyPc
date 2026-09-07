# Spec：悬浮卡片任务行第二行压缩

spec_id: `SPEC-260907-FLOAT-TASK-META-COMPACT`
Tool: cursor
Date: 2026-09-07
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-verified-task-project-name`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L253)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260907-float-task-meta-compact`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260907-float-task-meta-compact",
  "group_owner": "vibe/specs/260907/float-task-meta-compact/spec.md",
  "documents": [
    "vibe/specs/260907/float-task-meta-compact/raw-requirement.md",
    "vibe/specs/260907/float-task-meta-compact/spec.md",
    "vibe/specs/requirements/shared-raw-217.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/code-map/modules/src-map.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/companion-foreign-project-fields-not-published.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md"
  ],
  "dependencies": [
    "src/domain/companionPresentation.ts",
    "src/domain/cursorAgent.ts",
    "src/FloatApp.vue",
    "preload/index.js",
    "preload/cursor/inventory.cjs",
    "tests/domain/companionPresentation.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "tests/platform/cursorInventory.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260907/float-task-meta-compact",
    "vibe/specs/requirements/shared-raw-217.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/code-map/modules/src-map.md",
    "src/help/guides/codex.md",
    "src/domain/companionPresentation.ts",
    "src/domain/cursorAgent.ts",
    "src/FloatApp.vue",
    "preload/index.js",
    "preload/cursor/inventory.cjs",
    "tests/domain/companionPresentation.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "tests/platform/cursorInventory.test.ts",
    "vibe/knowledge/error-memory/companion-foreign-project-fields-not-published.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/specs/source-anchors/catalog.json"
  ]
}
```

## Explicit non-goals

- 不改项目行「归属 Codex / Claude / 共享」全文。
- 不改相位、未读、置顶、打开或拓扑归约。
- 不把额度读数、注册检查的「N 分钟前」改成 `Nm`。
- 不在第二行重排动作槽，也不新增常显状态行。

## Design

[companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L217) 拥有任务行来源缩写、默认 chats 名省略、`sub+N`、压缩时钟与悬停详情拼装。可见标记是 `CC` / `CX` / `CS`，不再带 `∈`。[FloatApp.vue](../../../../src/FloatApp.vue#L3648) 只渲染该投影：彩色缩写药丸 + 其余空格序列；200ms 动作提示层展示完整归属、项目、子任务计数、中文相对时间与绝对时间。

Claude 证据 [companionClaudeEvidenceV7](../../../../preload/index.js#L11520) 把会话 `originCwd`/`cwd` 末段和库存 `projectKey` 写入 Kernel metadata。Cursor 库存 [inventory.cjs](../../../../preload/cursor/inventory.cjs#L258) 读 `workspaceStorage/<id>/workspace.json` 得到文件夹名，再用与 Codex/Claude 相同的 `codex-project` 配方散列。缺这些字段时包层仍会回填 `* Chats`，第二行继续省略。

## VerificationImpactTrace

- Changed behavior: Float 任务行第二行文案；Claude/Cursor 任务公开项目名。
- Direct consumers: `FloatApp.vue` 任务 meta 行；Kernel 公开 `projectName`/`projectKey`。
- Focused evidence: `companionPresentation`、`codexCompanion`、`claudeCode`、`cursorAgent`、`cursorInventory`、`projectIdentity`、`companionTaskKernel` 来源切片。
- Not selected: 全量 `pnpm test`；无相位归约变化。
- Host identity: `src/` + `preload/` 变更，收尾跑 production build + `--write-current-truth`。2026-09-07 用户重载后确认任务项目名可见。
