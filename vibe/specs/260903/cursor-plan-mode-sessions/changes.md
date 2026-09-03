# Changes: Cursor Plan 模式会话纳入库存并把阻塞待决展示为待输入

| Path | Core description |
| --- | --- |
| `preload/cursor/inventory.cjs` | `INVENTORY_UNIFIED_MODES = {agent, plan}`；`isInventoryRow` / `isSubagentEvidenceRow` 改用；`projectRow` 输出 `unifiedMode`；导出集合 |
| `preload/cursor/events.cjs` | 归一器保留 `plan` 作为 mode 值（`ask` / `edit` 仍丢弃） |
| `preload/cursor/scripts.cjs` | 钩子脚本 `composer_mode` 门 `''|agent|plan` |
| `preload/companion/evidence-adapter-v7.cjs` | `cursorSessionObservationV7`：`hasBlockingPendingActions` → `interactionKind: 'user-input'`、`interactionSequence`；`exact` 不再因它降级 |
| `src/domain/cursorAgent.ts` | `resolveCursorAgentPhase` 首条：阻塞待决 → `waiting-input`，压过 open Turn；删除 `unknown` 分支 |
| `tests/platform/cursorInventory.test.ts` | fixture 加 `PLAN` 行（`unifiedMode: plan`, `hasBlockingPendingActions: true`, status completed）；两处期望 2 → 3 并断言 plan 行字段 |
| `tests/platform/cursorHooks.test.ts` | +1：plan 归一、open turn；ask / edit 为 null |
| `tests/platform/providerEvidenceAdapterV7.test.ts` | +1：阻塞待决 → `user-input`、`exact: true`，turnOpen 与否分别为 running / completed |
| `tests/domain/cursorAgent.test.ts` | 阻塞 → `waiting-input`（含 hookTurnOpen 同时为真） |
| `vibe/specs/requirements/shared-raw-205.md` + `modules/companion-shared.md` | 登记 |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` / `PROJECT_STATUS.md` / `src/help/guides/codex.md` | 三来源条款补 Plan 模式与阻塞待决；状态枢纽；帮助「接入 Cursor Agent」 |

## 真机只读核验（2026-09-03，worktree reader 读本机库）

用 worktree 的 `createInventoryReader` + `foldQueueEntries` + `cursorSessionObservationV7` 读本机 `state.vscdb` 与钩子队列（17:06）：库存 23 行，其中 plan 行 6 条（改前 0）。目标会话 `ec662980` 此时已被用户从 Plan 切到 Agent 继续执行（`unifiedMode = agent`、`unfinishedRunAt` 17:16、磁盘 `status = aborted`），钩子折叠 `turnOpen = true / phase running / lastEvent pre-tool`，V7 观察 `turn-running / exact`，磁盘 aborted 未压过开着的 Turn。Plan 阶段的落座由 16:5x 的只读查询（`unifiedMode = plan`、`hasBlockingPendingActions = 1`）与新增 fixture 用例覆盖。

## 并行会话与 worktree

主检出正被另一会话修改（Cursor 置顶 / `pin-bridge.cjs` / `task-kernel.cjs` / `index.js` 等 10 文件未提交），本任务在 worktree `260903-cursor-plan-mode`（分支同名，基于 `13d5f74`）上完成；合并回 `main` 时 `preload/cursor/inventory.cjs` 会与对方的 `projectRow(row, subagents, pinnedOrder)` 改动相邻，需要一次人工合并。
