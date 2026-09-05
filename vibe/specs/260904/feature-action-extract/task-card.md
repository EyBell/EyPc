# Task Card

> Standard non-requirement：六工具动作迁出。AppState 仍整份；产品语义零变更。

Tool: cursor
Date: 2026-09-04
Task: 把 `actions.register` 与切 Tab / 搜焦点副作用从 `createAppRuntime` 收到各 Feature 包；Shell 只提供 ActionHost 袋子。

## Task Documentation Sync Group

- Group key: `dsg:eypc:260904-feature-action-extract`
- Group owner: this `task-card.md`
- Git document prefixes: `vibe/specs/260904/feature-action-extract/` · `vibe/knowledge/`
- Durable document members: `vibe/specs/260904/feature-action-extract/task-card.md` · `vibe/knowledge/ARCHITECTURE.md` · `vibe/knowledge/technical-details.md` · `vibe/knowledge/code-map/modules/feature-module.md`
- Declared code/config dependencies: `src/runtime/appRuntime.ts` · `src/runtime/feature/` · `src/App.vue`
- Linked current/canonical/rule/memory authorities: `vibe/knowledge/ARCHITECTURE.md` · `vibe/specs/260904/feature-contrib-shell/task-card.md`
- Excluded unrelated dirty documents: `vite.config.*` 与本地代理
- Lookup contract: 新任务，无复用 gate。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260904-feature-action-extract",
  "group_owner": "vibe/specs/260904/feature-action-extract/task-card.md",
  "documents": [
    "vibe/specs/260904/feature-action-extract/task-card.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/code-map/modules/feature-module.md"
  ],
  "dependencies": [
    "src/runtime/appRuntime.ts",
    "src/runtime/feature/featureModule.ts",
    "src/App.vue"
  ],
  "validators": [],
  "git_scope_prefixes": [
    "vibe/knowledge",
    "vibe/specs/260904/feature-action-extract"
  ]
}
```

## Goal And Scope

- Goal: 加第 7 个 Tab 时不再往 `registerActions()` 巨函数追加；命令 id、when、shortcut、run 行为逐字保持。
- In scope: `FeatureActionHostV7` 袋子；各包 `actions.ts` 接收袋子后 `register` / `registerHandler`；`onTabEnter` 承接 `setTab` 的 mqtt/windows/codex 副作用；后续切片再迁 `focusSearch` 与 App.vue DOM 对焦旁路。
- Out of scope: 拆 AppState / 每模块 store；开放 `KeybindingLayerId`；改 `keyboardEvent.ts` 穷举；QuickFavorites / Float / Action 升格 FeatureModule；运行时 `registerFeature`；改写 `plugin.json` cmds；用户帮助 md；PRD。
- Success evidence: 现有 `tests/runtime/action.test.ts` 与 `tests/runtime/keybinding.test.ts` 命令 id / 默认绑定 / when 期望不变；`vue-tsc --noEmit` 绿。

## Decision

- Documentation level: `standard`
- Execution: `main-only` until a worktree is authorized
- Automation lane: `not-applicable`
- Status: `in-progress / slice-3`

## Explicit non-goals

- 不是热插拔。动作文件仍由 `createAppRuntime` 在构造时调用，闭包仍吃同一份 state。
- 不把 `bindPage` 的事件改成 dispatch-only（那是再下一刀）。
- 前驱壳层任务 [feature-contrib-shell](../feature-contrib-shell/task-card.md#L1) 已完成；本卡不重做 commands/routes/bindPage。

## Construction slices

1. **ActionHost + 按前缀搬家。** 已接线：`FeatureActionHostV7` + 各包 `actions.ts`；Shell 只留全局命令。零语义。
2. **`onTabEnter`。** 已接线：`setTab` 遍历各包可选钩子；mqtt archive / windows refresh / codex `syncActivation` 在对应包；缺省 no-op。`syncActivation` 仍对每次切 Tab 调用（离开 Codex 传 `false`）。
3. **`focusSearch`。** 已接线：全局 `search.focus` 问当前 Tab 的 `focusSearch?(host)`；ports / mqtt / favorites 返回 true；缺省 false 时 Shell 仍回退到端口搜索框（与原 `else` 一致）。
4. **壳旁路。** App.vue ports/windows DOM 对焦 watch 与 CommandHints 文案改为模块可选贡献。可与第 3 刀分开。

禁止把 1–4 揉成单 commit。每刀独立可回退。

## ABI sketch（第 1 刀最小）

```ts
interface FeatureActionHostV7 {
  register: AppRuntimeActions['register']
  registerHandler: AppRuntimeActions['registerHandler']
  // 其余字段按搬家时真实闭包逐项列入，禁止 Record<string, unknown> 漏斗
}

interface FeatureModuleV7 {
  // 现有贡献保留
  registerActions?(host: FeatureActionHostV7): void
  onTabEnter?(tab: AppTabId, options: { refreshWindows?: boolean }, host: FeatureActionHostV7): void
  focusSearch?(host: FeatureActionHostV7): boolean
}
```

`FeatureActionHostV7` 允许随第 1 刀加宽，但每次加字段必须是现有内部函数的具名引用，不能新造行为。

## VerificationImpactTrace

- 变更面：动作登记所有权、切 Tab 副作用、全局搜焦点（第 3 刀）、后续 DOM 对焦
- 直接消费者：`search.focus`、端口抽屉「聚焦搜索」、uTools `focusSearch` 路由（ports 仍派全局命令）
- 选中命令（第 3 刀）：`tests/runtime/featureModule.test.ts`、`tests/runtime/action.test.ts` 中 `search.focus` 端口用例、`pnpm exec vue-tsc --noEmit`
- 不选：整份 `action.test.ts`、MQTT 套件、仓库级 `pnpm test`、`pnpm run serve` / 真 uTools
- 行为闸门：ports 走 `focusPortSearch`；mqtt 全局命令仍固定 `'mqtt'`（与 `mqtt.search.focus` 的 templates/history 分流不同）；favorites 走 `focusFavoriteSearch`；windows/codex/settings 仍回退端口搜索框
