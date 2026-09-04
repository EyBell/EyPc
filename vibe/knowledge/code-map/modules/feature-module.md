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

合同：[featureModule.ts](../../../../src/runtime/feature/featureModule.ts#L66) `FeatureModuleV7`。登记表：[featureModules.ts](../../../../src/runtime/feature/featureModules.ts#L21) `FEATURE_MODULES_V7`。产品名派生：[featureRegistry.ts](../../../../src/runtime/feature/featureRegistry.ts#L18) `FEATURES = modules.map(definition)`。

## Shell 只组装

- 命令：[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L139) 拼接 `SHELL_COMMAND_PROFILES` + 六包。`settings.open` 留在 Shell。`tab.select.<id>` 仍由 `visibleFeatures` 生成。
- 路由：[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L59) 遍历各包 `routes`；`eypc-main` / 空 code 仍 restore current。
- 页面：[App.vue](../../../../src/App.vue#L108) 对当前 Tab `bindPage`，[TabShell.vue](../../../../src/components/TabShell.vue#L39) 单一默认 slot。
- 订阅：模块 `shouldSubscribe`。MQTT `connected-only` 读自己的 view；App 不再特判 mqtt 状态。
- 身份：[types.ts](../../../../src/domain/types.ts#L4) `FEATURE_MODULE_IDS` 派生 `AppTabId`。仍是封闭联合，不是开放 `string`。

## 明确还不是什么

- **registry-driven ≠ 热插拔**。没有运行时 `registerFeature`，没有独立 npm 包。
- **动作仍在 AppRuntime**。[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L706) 的 `actions.register` 本轮不迁出。
- 加第 7 个 Tab 还要动 AppState 字段与 Runtime 动作，不能只丢一个文件夹。
- RAW-179#3 字面要求 QuickFavorites / Action / Float 也走 FeatureModule：**未实施 / 非本刀**。Quick 仍由收藏 `bindPage` 内切换页面。
