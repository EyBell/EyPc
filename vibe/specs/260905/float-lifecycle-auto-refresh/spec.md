# Spec：插窗口失效与重启后自动刷新

spec_id: `SPEC-260905-FLOAT-LIFECYCLE-AUTO-REFRESH`
Tool: grok
Date: 2026-09-05
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L267)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260905-float-lifecycle-auto-refresh`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260905-float-lifecycle-auto-refresh",
  "group_owner": "vibe/specs/260905/float-lifecycle-auto-refresh/spec.md",
  "documents": [
    "vibe/specs/260905/float-lifecycle-auto-refresh/raw-requirement.md",
    "vibe/specs/260905/float-lifecycle-auto-refresh/spec.md",
    "vibe/specs/requirements/codex-raw-212.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/persistent-float-window-outlives-plugin-reload.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/codex/float-bridge.cjs",
    "preload/float.js",
    "preload/index.js",
    "src/FloatApp.vue",
    "src/float-env.d.ts",
    "tests/platform/codexFloatWindowBridge.test.ts",
    "scripts/validate-preload-entry-budget.mjs"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-committed-preload-mirrors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260905/float-lifecycle-auto-refresh",
    "vibe/specs/requirements/codex-raw-212.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/persistent-float-window-outlives-plugin-reload.md",
    "src/help/guides/codex.md",
    "preload/codex/float-bridge.cjs",
    "preload/float.js",
    "preload/index.js",
    "src/FloatApp.vue",
    "src/float-env.d.ts",
    "tests/platform/codexFloatWindowBridge.test.ts",
    "scripts/validate-preload-entry-budget.mjs"
  ]
}
```

## Requirement Delta

- Add: 工作台 `plugin-enter`、主 Renderer 身份变化、Float 身份/载荷失效、Float revision 高于 Host 时自动重建插窗口。
- Clarify: `reload-required` 横幅是重建失败后的停机态，不是用户手动刷新入口。
- Unchanged: 心跳卡死 60 秒冷却；静默 `mainHide` 不拆窗；不自动 kill 插件进程。

## Requirement Change Review

- Scan scope: RAW-212 原话 → PRD Runtime Identity → persistent-float error memory → 用户帮助「构建与实际加载」。
- Conflict classification: `compatible-update`（先重建，仍不一致才横幅）。
- Decision status: `explicit-current-request`。
- Post-sync rescan: `pass` pending validators.

## Prior Task Overlap

- Relationship: `partial-overlap` with [persistent-float-window-outlives-plugin-reload](../../../knowledge/error-memory/persistent-float-window-outlives-plugin-reload.md#L1)（2026-08-28 诊断，产品侧当时未裁决自动重建）。
- Decision: `delta-only` — 诊断顺序保留；用户须手动重开悬浮窗的条款由本条取代。

## Canonical Merge

- Target: PRD Runtime Identity 段；用户帮助「悬浮窗自恢复」「构建与实际加载」。
- Merge status: same-round.

## Implementation Sync

- [float-bridge.cjs](../../../../preload/codex/float-bridge.cjs#L1)：`handlePluginEnter`、主 Renderer 身份钉、生命周期 5 秒冷却、`eypc-float:recreate`、revision 失步重建。Preload 被重跑时关掉标题为 `EyPc Codex` 的残留 BrowserWindow（`getAllWindows` + 进程槽），避免旧窗盖住新窗。
- [index.js](../../../../preload/index.js#L13287)：`onPluginEnter` 转发。
- [float.js](../../../../preload/float.js#L1) / [FloatApp.vue](../../../../src/FloatApp.vue#L1)：握手或 Snapshot 身份失效时 `requestRecreate`。
- 入口棘轮 14402 → 14403。

## Verification

- Focused: `tests/platform/codexFloatWindowBridge.test.ts` + `tests/platform/runtimeIdentity.test.ts` + `tests/ui/codexCompanion.test.ts`。
- 不跑仓库级 `pnpm test`。真机 uTools 重载后确认工作台再进悬浮球内容已换，且槽位快捷键不闪窗。

## Explicit non-goals

- 不改窗口跳转 Tab 的加载策略（本条当时保留「进 Tab 不自动 list」；该条款后由 [RAW-213](../window-tab-auto-refresh/spec.md#L1) 收窄为同会话不重复全扫）。
- 不在每次 Esc/`plugin-out(false)` 当下拆窗。
- 不自动结束插件后台进程。

## Design

- 可见工作台 code（空、`eypc-main`、ports/mqtt/favorites/windows/codex/settings）重建；`*-slot-*`、`*-toggle`、任务循环、quick、archive、Action 槽跳过。
- 主 Renderer `runtimeIdentity.expected.rendererAssetId` 变化视为新构建已挂上主窗，拆掉旧插窗口。
- Float 自洽但与 Host 不一致时由 Renderer `requestRecreate`，Host 5 秒内只重建一次。

## Acceptance

1. 关闭工作台再打开 `eypc-main`：持久化悬浮球销毁并重建，任务包重推。
2. 窗口槽 / 待输入等 `mainHide` 入口：不重建。
3. 主 Renderer 身份变化或 `identity-mismatch`：自动重建，不必关开悬浮球。
4. Float 报告 currentRevision 高于 Host：当失步重建。
5. 心跳卡死路径仍 60 秒冷却。

## Documentation Impact

- PRD、帮助、error-memory、需求登记、PROJECT_STATUS 同轮。

## Execution Journal

- 2026-09-05：实现 + 聚焦测试。

## Closeout

- 聚焦自动化与 production/uTools build 已过。产物 `host-2c8c2fd1b6b80a32e59b / renderer-48f77c913ee48c4fea20`。真机：重载后若旧球还在，结束插件后台或先隐藏桌面悬浮再进。
