# Spec：重载后 Side 子线程恢复提示与库存判活候选

spec_id: `SPEC-260825-CODEX-SIDE-RELOAD-RECOVERY`
Tool: claude
Date: 2026-08-25
Status: `confirmed / focused-automated-verified / host-runtime-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L255)
Root-cause evidence: [codex-running-side-child-invisible-after-reload.md](../../../knowledge/error-memory/codex-running-side-child-invisible-after-reload.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:codex-side-reload-recovery`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:codex-side-reload-recovery",
  "group_owner": "vibe/specs/260825/codex-side-reload-recovery/spec.md",
  "documents": [
    "vibe/specs/260825/codex-side-reload-recovery/raw-requirement.md",
    "vibe/specs/260825/codex-side-reload-recovery/spec.md",
    "vibe/specs/requirements/codex-raw-181.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/codex-running-side-child-invisible-after-reload.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "src/help/guides/codex.md",
    "vibe/specs/PROJECT_STATUS.md"
  ],
  "dependencies": [
    "preload/index.js",
    "preload/codex/side-relation-hints.cjs",
    "public/preload.js",
    "public/codex/side-relation-hints.cjs",
    "scripts/validate-preload-entry-budget.mjs",
    "tests/platform/codexAppServerBridge.test.ts",
    "vibe/specs/source-anchors/catalog.json"
  ],
  "validators": ["scripts/validate-requirements.mjs"],
  "git_scope_prefixes": ["vibe/specs/260825/codex-side-reload-recovery"]
}
```

## Requirement Delta

- Add: bounded persisted Desktop side→parent recovery hints（RAW-181#1/#2/#3）。
- Add: inventory Side row idle/notLoaded + fresh inProgress turn produces a live candidate（RAW-181#4）。
- Change: PRD「topology 只在进程内 / 动态任务状态不持久化」collapses to「恢复提示（仅 ID+时间戳）可持久化；live phase/unread/cycle 仍进程内」。
- Unchanged: 严格法定人数清退（完整库存排除 + 三次精确空读）、Controller/Renderer 不见原始 ID、Deep Link 不产生已读。

## Design

### C1 — 恢复提示（方向 A）

现状：`codexDesktopSideRelations` 是进程内存 Map（[preload/index.js:1304](../../../../preload/index.js#L1304)），重载即空；三条冷恢复通道对 Desktop-only 运行中子线程全部失效（错误记忆 Lane A/B/C）。恢复机器本身健在：`followAll` 会对 `codexAllSideRelations()` 中父任务在库存内的子线程 `sideRecoveryPending.add + followAny`（[L6319-L6327](../../../../preload/index.js#L6319-L6327)）；子线程快照按 hinted parent 归位并在非 active 时触发定向 latest-Turn 校验（[L5713-L5754](../../../../preload/index.js#L5713-L5754)）；`updateInventory` 对父任务不在库存的关系自动清退（[L6665-L6673](../../../../preload/index.js#L6665-L6673)）；`retireMissingDesktopSide` 维持完整库存排除 + 空读清退（[L4924-L4974](../../../../preload/index.js#L4924-L4974)）。

实现：

1. 新模块 [preload/codex/side-relation-hints.cjs](../../../../preload/codex/side-relation-hints.cjs#L1)（fail-open 委托模式，同 `desktop-activity-resolution`）：纯函数 sanitize/序列化提示行（TTL 48h、上限 200、按 observedAt 降序）。模块装载失败时持久化与恢复整体静默停用，回到今日行为。
2. 入口新增存储键 `eypc/codex/desktop-side-relations/v1`，平行 Map `codexDesktopSideRelationObservedAt`，50ms 去抖写（同 interaction tombstone 模式）。
3. 写钩子：`codexRememberDesktopSideRelation` / `codexForgetDesktopSideRelation` / `codexForgetDesktopSideRelationsForParent` 变更后调度持久化；因此 archive、updateInventory 清退、法定人数清退、快照证伪（`recoveryRequested && !sideConversation`）全部自然同步删除。
4. 恢复：lazy-once `codexRestoreDesktopSideRelationHints()`，在 `codexEnsureDesktopBridge()` 与 `scanVerifiedCodexInventory()` 入口调用；只填 `codexDesktopSideRelations`/observedAt，不触发 goal RPC，不直接产生任何活动状态；恢复量 >0 时记 `task-topology` 诊断事件 `side-relation-hints-restored`。

提示子线程若无人再广播（实际已终态）：无 shadow → branch evidence 状态 notLoaded → 不判活（与今日 bridge teardown 保留关系的既有形态一致）；unread 聚合只计正观察（[desktop-activity-aggregation.cjs:80-98](../../../../preload/codex/desktop-activity-aggregation.cjs#L80-L98)），不会虚构未读徽章。

### C2 — 库存 Side 行判活候选

现状：[preload/index.js:7924](../../../../preload/index.js#L7924) `turnLive = connectorStatus === 'active' && turn?.status === 'inProgress'`；idle/notLoaded 行静默降级。主任务行对照（[L9389-L9397](../../../../preload/index.js#L9389-L9397)）：`inventoryInProgress` 不看行状态，但证据序号只在 `inventoryReadSucceeded`（本轮新鲜读）时铸造。

实现：

1. `readCodexThreadTurnStatuses`：缓存 turn 为 inProgress 且行状态非 active 时强制入队新鲜读（矛盾证据不吃缓存）。
2. `codexSyncInventorySideTopology`：`turnLive = turn?.status === 'inProgress' && (connectorStatus === 'active' || turns.readSucceededIds.has(threadId))`。fresh inProgress → `status: 'active'` / `statusAuthority: 'app-server-live'` / `activityEvidence: 'activity-event'` + 活动序号，走 `branchIsLive` 既有 app-server-live 分支（[L8042-L8043](../../../../preload/index.js#L8042-L8043)）。
3. 诊断：`codexRecordSideTopologyDecision` 聚合与 per-parent details 增加 `recoveredLiveCount`（idle/notLoaded 判活数量），沿用既有 fingerprint 去抖。

已知权衡（记录在案）：崩溃残留的 inProgress turn（进程死亡未写终态）在 fresh 读下会判活，直到 Desktop 广播该线程的非 active 快照（desktop-live 权威覆盖 inventory 证据，[L8021](../../../../preload/index.js#L8021)）或 turn 终态落盘。这与「显示进行中却漏报真实运行」相比是预防规则明确选择的一侧；不引入 elapsed-time 推断。

### 熵预算

`preload/index.js` 入口棘轮（[validate-preload-entry-budget.mjs](../../../../scripts/validate-preload-entry-budget.mjs#L27)）三个基线随本轮实测回写——这是该门禁设计内的「可见决定」路径，形状逻辑已外置到新模块以最小化入口增量。

## Verification Impact Trace（provisional）

- Changed behavior: preload Codex 证据层（side relation 持久化/恢复、库存 side 判活、诊断事件）。
- Direct consumers: `codexPrivateBranchEvidence` → V7 evidence adapter → Kernel 聚合 → 卡片相位；Desktop bridge follow/recovery 流。
- Material boundary: `tests/platform/codexAppServerBridge.test.ts`（VM 沙箱跑完整 preload，含 dbStorage/Desktop socket/App Server 假体）。
- Selected checks: 聚焦 `npx vitest run tests/platform/codexAppServerBridge.test.ts`；`pnpm run sync:preloads` + `node scripts/validate-committed-preload-mirrors.mjs`；`node scripts/validate-preload-entry-budget.mjs`；`pnpm run validate:requirements`（含真值快照回写）。
- Not selected: 全库 test/typecheck/build（无升级触发：改动不触及 `src/`、契约 schema、构建入口）；真实 uTools/Desktop 运行时（EYPC-VERIFY-001 opt-in only）。

## Acceptance

见 [raw-requirement.md 验收意图](raw-requirement.md#L60)。真实宿主重载验收（真 Codex Desktop + uTools 重载）由用户执行，本轮不启动运行时。
