# 功能 Tab 维护配置 Plan

## 修改点

- 状态模型：在 [src/domain/types.ts](../../../src/domain/types.ts#L1) 增加 `FeatureConfig`，在 [src/domain/state.ts](../../../src/domain/state.ts#L1) 补齐默认隐藏收藏、过滤未知 id、锁定 `settings`。
- 功能与路由：让 [src/runtime/feature/featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L1) 按配置生成可见功能；让 [src/runtime/feature/featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1) 对禁用入口回退到维护页。
- Runtime：在 [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) 暴露 `visibleFeatures`，保存 `featureConfigs`，并让 tab 快捷键按当前配置解析。
- UI：让 [src/components/TabShell.vue](../../../src/components/TabShell.vue#L1) 使用 snapshot 的可见功能；在 [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) 增加功能开关维护面板。

## 验证计划

- 单测覆盖状态归一化、禁用入口路由、runtime 保存配置和动态 tab 快捷键。
- UI 静态测试覆盖维护子菜单、功能开关表格和拖拽入口。
- 完整执行项目验证命令并记录结果到 [04-verify.md](04-verify.md#L1)。
