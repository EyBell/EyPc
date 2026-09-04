# Spec：Claude / Cursor 行上时钟在 Turn 关闭后仍可读

spec_id: `SPEC-260904-COMPANION-DISPLAY-CLOCK`
Tool: cursor
Date: 2026-09-04
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L238)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260904-companion-display-clock`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260904-companion-display-clock",
  "group_owner": "vibe/specs/260904/companion-display-clock/spec.md",
  "documents": [
    "vibe/specs/260904/companion-display-clock/raw-requirement.md",
    "vibe/specs/260904/companion-display-clock/spec.md",
    "vibe/specs/260904/companion-display-clock/changes.md",
    "vibe/specs/requirements/shared-raw-208.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/companion-display-clock-zero-is-missing.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "src/domain/cursorAgent.ts",
    "src/domain/claudeCode.ts",
    "src/domain/companionTaskPackage.ts",
    "preload/companion/task-kernel.cjs",
    "preload/index.js"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260904/companion-display-clock",
    "vibe/specs/requirements/shared-raw-208.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory",
    "src/help/guides/codex.md",
    "src/domain/cursorAgent.ts",
    "src/domain/claudeCode.ts",
    "src/domain/companionTaskPackage.ts",
    "preload/companion/task-kernel.cjs",
    "preload/index.js",
    "public",
    "tests/domain/cursorAgent.test.ts",
    "tests/domain/claudeCode.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/platform/companionTaskKernel.test.ts"
  ]
}
```

## Explicit non-goals

- 不把 Cursor Cloud Agent 并进 `composerHeaders` 库存。
- 不改相位、未读、置顶入站或 Codex Turn `startedAt` 扫描合同。
- 不把 `updatedAt` 当作 Codex 官方库存的 Turn 时间。

## Design

- [cursorAgent.ts](../../../../src/domain/cursorAgent.ts#L208)：`lastQuestionAt` = `unfinishedRunAt || completedAt || updatedAt`；`lastTurnStartedAt` 仍只来自开着的 Turn。
- [claudeCode.ts](../../../../src/domain/claudeCode.ts#L324)：`lastQuestionAt` = `turnStartedAt || completedAt || updatedAt`。
- [index.js](../../../../preload/index.js#L11560)：Claude / Cursor metadata 用 `companionEvidenceSequenceV7` 收完成/活动时间。
- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1849)：`incoming.lastQuestionAt || previous.lastQuestionAt`。
- [companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L403)：Kernel 与卡都缺时再回退完成水位 / `updatedAt`。

## VerificationImpactTrace

- 变更面：Claude/Cursor 展示时钟、Kernel metadata 覆盖、包层回退
- 直接消费者：Float 行上相对时间、动态排序、置顶已读完成行
- 语义边界：`cursorAgent` / `claudeCode` / `companionTaskPackage` / Kernel；镜像 `public/`
- 不升级：仓库级 `pnpm test` / `verify`；真机 uTools 重载仍待用户
- 候选：聚焦四套件；preload 镜像；需求/错忆校验；产物身份同步

## Verification

- 聚焦：`cursorAgent` 完成态有 `lastQuestionAt`；`claudeCode` 已读完成回退 `lastStopAt`；包层 0 回退完成水位；Kernel 后到 0 保留旧时钟。
- F-1-b：fixture canary 可跑；无匿名 live snapshot 收集器，`live_canary=blocked`。
