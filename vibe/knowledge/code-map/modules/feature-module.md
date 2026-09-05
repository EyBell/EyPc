# FeatureModule 贡献型壳层

Baseline: 2026-09-04 · 相对当前实现 · 不是第二份 PRD

本页回答：六个顶层 Tab 如何**贡献**壳层，而不是从全局表里被过滤出来。Companion Provider（`provider-manifest.json`）是另一条插件边界，不能用来证明 Tab 已可热插拔。

## 现在是什么

每个 Tab 是一个贡献包：`src/runtime/feature/<id>/`。包内自带产品定义、命令表、uTools 路由、页面接线、订阅谓词。Shell 只组装。

| 文件 | 贡献 |
| --- | --- |
| [module.ts](../../../../src/runtime/feature/ports/module.ts#L1) | 组装 ABI（以 ports 为例） |
| [commands.ts](../../../../src/runtime/feature/ports/commands.ts#L1) | 该 Tab 的快捷键 profile |
| [routes.ts](../../../../src/runtime/feature/ports/routes.ts#L1) | `plugin.json` feature code 归属 |
| [pageBind.ts](../../../../src/runtime/feature/ports/pageBind.ts#L1) | 页面组件 + props/事件，不改成 dispatch-only |
| [actions.ts](../../../../src/runtime/feature/ports/actions.ts#L1) | 该 Tab 前缀的 `register` / `registerHandler`；实现仍闭包同一份 Runtime state。mqtt / windows / Codex 另贡献 `onTabEnter` |

合同：[featureModule.ts](../../../../src/runtime/feature/featureModule.ts#L69) `FeatureModuleV7`。登记表：[featureModules.ts](../../../../src/runtime/feature/featureModules.ts#L21) `FEATURE_MODULES_V7`。产品名派生：[featureRegistry.ts](../../../../src/runtime/feature/featureRegistry.ts#L18) `FEATURES = modules.map(definition)`。

## Shell 只组装

- 命令：[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L140) 拼接 `SHELL_COMMAND_PROFILES` + 六包。`settings.open` 留在 Shell。`tab.select.<id>` 仍由 `visibleFeatures` 生成。
- 动作：[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L8916) 组 [FeatureActionHostV7](../../../../src/runtime/feature/featureActionHost.ts#L4) 袋子后遍历各包 `registerActions`。Shell 只留 `app.hide` / `runtime.logs.*` / `quickJump.*` / `tab.select.*` / `settings.open` / `search.focus` / `confirm.*`。实现仍闭包同一份 state，未拆 AppState。
- 切 Tab：[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L2856) `setTab` 遍历可选 `onTabEnter`；mqtt 加载 archive，windows 在 `refreshWindows: true` 时刷新，Codex 每次切 Tab 调用 `syncActivation(tab === 'codex')`。未实现钩子的包缺省 no-op。
- 路由：[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L59) 遍历各包 `routes`；`eypc-main` / 空 code 仍 restore current。
- 页面：[App.vue](../../../../src/App.vue#L108) 对当前 Tab `bindPage`，[TabShell.vue](../../../../src/components/TabShell.vue#L39) 单一默认 slot。
- 订阅：模块 `shouldSubscribe`。MQTT `connected-only` 读自己的 view；App 不再特判 mqtt 状态。
- 身份：[types.ts](../../../../src/domain/types.ts#L4) `FEATURE_MODULE_IDS` 派生 `AppTabId`。仍是封闭联合，不是开放 `string`。

## 明确还不是什么

- **registry-driven ≠ 热插拔**。没有运行时 `registerFeature`，没有独立 npm 包。
- **动作按包登记，实现仍在 Runtime 闭包**。[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L8916) 的 `registerActions` 只组袋子并调用各包。切 Tab 已迁到 `onTabEnter`。搜焦点与 DOM 对焦旁路见 [feature-action-extract](../../../specs/260904/feature-action-extract/task-card.md#L1) 第 3–4 刀。
- 默认开关/排序单源：[types.ts](../../../../src/domain/types.ts#L13) `DEFAULT_FEATURE_CONFIGS`。
- 加第 7 个 Tab 还要动 AppState 字段与 Runtime 动作，不能只丢一个文件夹。
- RAW-179#3 字面要求 QuickFavorites / Action / Float 也走 FeatureModule：**未实施 / 非本刀**。Quick 仍由收藏 `bindPage` 内切换页面。
