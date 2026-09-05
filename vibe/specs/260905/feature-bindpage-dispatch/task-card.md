# Task Card

> Standard non-requirement：`bindPage` 事件改成 dispatch-only。AppState 仍整份；产品语义零变更。

Tool: cursor
Date: 2026-09-05
Task: 页面只 `emit('dispatch', actionId, args)`；各包 `pageBind` 的 `on` 只留 `dispatch`。Shell 仍只组装。

## Task Documentation Sync Group

- Group key: `dsg:eypc:260905-feature-bindpage-dispatch`
- Group owner: this `task-card.md`
- Git document prefixes: `vibe/specs/260905/feature-bindpage-dispatch/` · `vibe/knowledge/` · `vibe/specs/PROJECT_STATUS.md`
- Durable document members: `vibe/specs/260905/feature-bindpage-dispatch/task-card.md` · `vibe/knowledge/ARCHITECTURE.md` · `vibe/knowledge/technical-details.md` · `vibe/knowledge/code-map/modules/feature-module.md` · `vibe/knowledge/code-map/modules/src-map.md` · `vibe/specs/PROJECT_STATUS.md`
- Declared code/config dependencies: `src/runtime/feature/featureModule.ts` · `src/runtime/feature/*/pageBind.ts` · `src/pages/` · `src/App.vue`
- Linked current/canonical/rule/memory authorities: `vibe/knowledge/ARCHITECTURE.md` · `vibe/specs/260904/feature-action-extract/task-card.md` · `vibe/specs/260904/feature-contrib-shell/task-card.md`
- Excluded unrelated dirty documents: `vite.config.*` 与本地代理；`public/runtime-identity.cjs`
- Lookup contract: 新任务，无复用 gate。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260905-feature-bindpage-dispatch",
  "group_owner": "vibe/specs/260905/feature-bindpage-dispatch/task-card.md",
  "documents": [
    "vibe/specs/260905/feature-bindpage-dispatch/task-card.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/code-map/modules/feature-module.md",
    "vibe/knowledge/code-map/modules/src-map.md",
    "vibe/specs/PROJECT_STATUS.md"
  ],
  "dependencies": [
    "src/runtime/feature/featureModule.ts",
    "src/runtime/feature/ports/pageBind.ts",
    "src/runtime/feature/mqtt/pageBind.ts",
    "src/runtime/feature/favorites/pageBind.ts",
    "src/runtime/feature/windows/pageBind.ts",
    "src/runtime/feature/settings/pageBind.ts",
    "src/App.vue"
  ],
  "validators": [],
  "git_scope_prefixes": [
    "vibe/knowledge",
    "vibe/specs/260905/feature-bindpage-dispatch",
    "vibe/specs/PROJECT_STATUS.md"
  ]
}
```

## Goal And Scope

- Goal: 加第 7 个 Tab 时不必再往 `pageBind.on` 追加具名 Vue 事件；页面突变仍全部走 Runtime Action dispatch。
- In scope: 把各包尚未 `dispatch` 的页面事件改成 `emit('dispatch', …)`；`FeaturePageBindingV7.on` 只保留 `dispatch`；已入 catalog 的 id 走 `runtime.dispatch`；尚未入 catalog 的高频打字/焦点/草稿仍转发到**现有** Runtime 方法（包内 dispatch 适配器，具名交叉类型，禁止 `Record<string, unknown>` 漏斗）；收紧 `FeaturePageHostV7`；架构与 code-map。
- Out of scope: 拆 AppState；开放 `KeybindingLayerId`；改 `keyboardEvent.ts`；QuickFavorites / Float / Action 升格 FeatureModule；运行时 `registerFeature`；为打字/草稿新增会进设置快捷键表的命令；改用户帮助 md；PRD；重做 commands/routes/`onTabEnter`/`focusSearch`/壳 DOM 对焦。
- Success evidence: 六个 `pageBind.ts` 的 `on` 只含 `dispatch`；页面 `defineEmits` 不再声明 `search` / `focus` / draft 等旁路事件；`vue-tsc --noEmit` 绿；现有默认绑定 / `when` 期望不变。

## Decision

- Documentation level: `standard`
- Execution: `main-only` until a worktree is authorized
- Automation lane: `not-applicable`
- Status: `implementation-landed`

## Explicit non-goals

- Codex 页已经是 `{ dispatch: runtime.dispatch }`，本卡不重做。
- 收藏 `favoriteQuickMode` 换页仍由 `bindFavoritesPage` 选择组件，不是事件旁路。
- 前驱 [feature-action-extract](../260904/feature-action-extract/task-card.md#L62) 已完成；本卡不重做 ActionHost / `onTabEnter` / `focusSearch` / 壳对焦。
- `registerHandler` 需要 Command Catalog：不得为了 dispatch-only 把高频草稿打进设置快捷键表。

## Construction slices

现状：App.vue 仍 `v-on="activePageBinding.on"`。六个 `pageBind.on` 都是 `{ dispatch }`。

1. **ports。** 已接线：`PortsPage` 具名 emit → `dispatch`；`bindPortsPage.on` 只留 `dispatch`。`search` / `groupSearch` / `focus` / `toggle` / 组草稿等未入 catalog 的，包内适配到现有 `setPortSearch` / `focusPort` / `savePortGroupDraft` 等。已有 command id 走 `runtime.dispatch`。`ports.group.save` / `ports.group.edit.cancel` 不走 catalog（前者 `when` 绑编辑层，后者未 `register`）。
2. **mqtt。** 已接线：`MqttPage` 具名 emit → `dispatch`；`bindMqttPage.on` 只留 `dispatch`。`search` 与 `focus-*` / `update-*-draft` 走适配器；已有 mqtt command id 走 catalog。未使用的 `focusMessage` / `updateFavoriteDraft` 旁路已删。
3. **favorites + QuickFavorites。** 已接线：管理页与 Quick 页具名 emit → `dispatch`；`bindFavoritesPage.on` 只留 `dispatch`（Quick / 完整页共用同一适配器）。`search` / `groupSearch` / `focus*` / `toggle*` / `collapse` / pick-review / 草稿走适配器；`favorites.reorder` 由页面直接 `dispatch` 进 catalog。`favorites.save` / `favorites.cancel` 不走 catalog（`when` 绑 `favorites-editor` 层；行内重命名未必有该层）。未使用的 `add` / `remove` 旁路已删。
4. **windows + settings + ABI。** 已接线：`WindowsPage` / `SettingsPage` 具名 emit → `dispatch`；两包 `on` 只留 `dispatch`。窗口搜索/焦点/草稿走适配器；`windows.editor.save` 仍走 catalog；`windows.editor.cancel` 不走 catalog（`when` 绑 `window-editor` 层）。设置路径/配置保存走适配器；`tool.preview.hover.update` 由页面直接 `dispatch` 进 catalog。未使用的 `updateKeybinding` / `resetKeybinding` 旁路已删。`FeaturePageHostV7` 去掉 `Record<string, unknown>`；`FeaturePageBindingV7.on` 只留 `dispatch`。

禁止把 1–4 揉成单 commit。每刀独立可回退。

## ABI sketch

```ts
export type FeaturePageHostV7 = {
  dispatch: (actionId: string, args?: Record<string, unknown>) => unknown
}

export interface FeaturePageBindingV7 {
  page: Component
  props: Record<string, unknown>
  on: {
    dispatch: (actionId: string, args?: Record<string, unknown>) => unknown
  }
}
```

包内适配器（仅当该 emit 今日接到的方法没有 catalog id）：

```ts
dispatch: (actionId, args) => {
  // 具名转发到现有闭包，行为逐字保持
  // 未命中则 runtime.dispatch(actionId, args)
}
```

## VerificationImpactTrace

- 变更面：六包页面事件形状、`pageBind.on`、`FeaturePageHostV7`
- 直接消费者：App.vue `v-on`、各 `*Page.vue` / `QuickFavoritesPage.vue`
- 选中命令：`tests/runtime/featureModule.test.ts`、触及 `pageBind` 源码断言的 `tests/ui/mqttPage.test.ts`、`tests/ui/favoritesBehavior.test.ts`、`tests/ui/favoritesContainerWorkbench.test.ts`、`tests/ui/windowsDiagnostics.test.ts`、`tests/ui/settingsLayout.test.ts`、`pnpm exec vue-tsc --noEmit`
- 不选：整份 `action.test.ts`、MQTT 业务套件、仓库级 `pnpm test`、`pnpm run serve` / 真 uTools、production build（本卡规划阶段不跑）
- 行为闸门：搜索/焦点/草稿/扫描/保存的 Runtime 方法与迁出前同一函数；默认快捷键与 `when` 不变；设置命令表不因本卡变长
