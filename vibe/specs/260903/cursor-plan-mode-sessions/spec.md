# Spec：Cursor Plan 模式会话纳入库存并把阻塞待决展示为待输入

spec_id: `SPEC-260903-CURSOR-PLAN-MODE-SESSIONS`
Tool: claude
Date: 2026-09-03
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending / worktree`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L238)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260903-cursor-plan-mode-sessions`
- Group owner: this `spec.md`
- Excluded unrelated dirty documents: 主检出里并行会话的 Cursor 置顶 / pin-bridge 未提交工作（本任务在 worktree `260903-cursor-plan-mode` 上隔离）、`public/` 构建镜像

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260903-cursor-plan-mode-sessions",
  "group_owner": "vibe/specs/260903/cursor-plan-mode-sessions/spec.md",
  "documents": [
    "vibe/specs/260903/cursor-plan-mode-sessions/raw-requirement.md",
    "vibe/specs/260903/cursor-plan-mode-sessions/spec.md",
    "vibe/specs/260903/cursor-plan-mode-sessions/changes.md",
    "vibe/specs/requirements/shared-raw-205.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/cursor/inventory.cjs",
    "preload/cursor/events.cjs",
    "preload/cursor/scripts.cjs",
    "preload/companion/evidence-adapter-v7.cjs",
    "src/domain/cursorAgent.ts",
    "tests/platform/cursorInventory.test.ts",
    "tests/platform/cursorHooks.test.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/domain/cursorAgent.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-committed-preload-mirrors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260903/cursor-plan-mode-sessions",
    "vibe/specs/requirements/shared-raw-205.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "src/help/guides/codex.md",
    "preload/cursor/inventory.cjs",
    "preload/cursor/events.cjs",
    "preload/cursor/scripts.cjs",
    "preload/companion/evidence-adapter-v7.cjs",
    "public",
    "src/domain/cursorAgent.ts",
    "tests/platform/cursorInventory.test.ts",
    "tests/platform/cursorHooks.test.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/domain/cursorAgent.test.ts"
  ]
}
```

## Requirement Delta

- Change: Cursor 库存白名单 `unifiedMode = agent` → `agent | plan`（`INVENTORY_UNIFIED_MODES`）；库存行新增 `unifiedMode`。
- Add: `hasBlockingPendingActions` 是精确的 `user-input` 交互（V7 `interactionKind`）与渲染域 `waiting-input` 相位，压过开着的 Turn；不再把它当作 `exact:false` / `unknown`。
- Change: 钩子脚本 `composer_mode` 门放行 `plan`；归一器保留 `plan` 作为 mode 值。
- Unchanged: 不发明 `waiting-approval`、深链跳转即现有 opener、归档只看状态、空壳过滤、cloud / subagent 排除。

## Design

- [inventory.cjs](../../../../preload/cursor/inventory.cjs#L19)：`INVENTORY_UNIFIED_MODES = {agent, plan}`，`isInventoryRow` / `isSubagentEvidenceRow` 共用；`projectRow` 输出 `unifiedMode`。
- [events.cjs](../../../../preload/cursor/events.cjs#L63) / [scripts.cjs](../../../../preload/cursor/scripts.cjs#L91)：`plan` 与 `agent` 同待遇，`ask` / `edit` 仍丢弃。
- [evidence-adapter-v7.cjs](../../../../preload/companion/evidence-adapter-v7.cjs#L285)：`blockingDecision` → `interactionKind: 'user-input'`、`interactionSequence: sequence`，`exact` 只看 `kind`；Kernel 现有交互通路把它投影为 待输入 并进入角标与循环。
- [cursorAgent.ts](../../../../src/domain/cursorAgent.ts#L134)：`resolveCursorAgentPhase` 首条 `hasBlockingPendingActions → waiting-input`。
- 跳转：待输入卡片点击 / Enter / 角标 / 快捷键都走既有 `cursor-open`（本地 composer uuid deeplink，Cursor ≥ 3.17.8 已验证）。

## Verification

- 聚焦 vitest：`cursorInventory`（fixture 加 plan 行，两处期望 2 → 3）、`cursorHooks`（+1：plan 归一与 ask/edit 丢弃）、`providerEvidenceAdapterV7`（+1：阻塞待决 → user-input）、`cursorAgent`（阻塞 → waiting-input 且压过 open Turn）、`cursorArchive` / `cursorOpen` / `companionTaskKernel` 回归：7 文件 142 例通过；`typecheck` 通过。
- 真机只读核验：用 worktree 里的 reader 读本机 `state.vscdb`，`ec662980` 已被落座为 `unifiedMode=plan` 行；钩子折叠状态与 V7 观察见 changes.md。
- 宿主真机：worktree 产物尚未装入运行中的插件；纳入后的卡片、待输入角标与一键跳转待合并、重载后由用户验收。
