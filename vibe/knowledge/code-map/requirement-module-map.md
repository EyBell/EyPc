# 原始需求 ↔ 代码模块

每行是「当前还作数的需求面 → 实现入口」。条款正文与取代关系仍以登记为准；这里只给**代码落点**。行号为本会话实测。

## 怎么用

- 改行为前：先打开登记叶子，确认不是 `superseded` / `proposed`。
- 改代码时：从「实现入口」那一行往下读，不要从页面事件处理函数猜权威。
- MQTT、窗口跳转多数条款尚未入册（见 [coverage.md](../../specs/requirements/coverage.md#L1)），实现以 PRD 对应节 + 任务 spec 为准。

## 全局与工程不变量

| 需求面 | 登记 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| V7 Tab / FeatureModule / RuntimeSlice | [invariants-raw-179-clause-003](../../specs/requirements/invariants-raw-179-clause-003.md#L1) | [featureModules.ts](../../../src/runtime/feature/featureModules.ts#L21) `FEATURE_MODULES_V7` · [feature-module.md](modules/feature-module.md#L1) | [App.vue](../../../src/App.vue#L108) `bindPage` |
| 唯一当前产品真值 | [invariants-raw-178](../../specs/requirements/invariants-raw-178.md#L1) | 文档层，无运行时代码 | [PRODUCT_REQUIREMENTS.md](../../specs/PRODUCT_REQUIREMENTS.md#L1) |
| 来源锚点与需求身份分层 | [invariants-raw-177-clause-001](../../specs/requirements/invariants-raw-177-clause-001.md#L1) | [validate-source-anchors.mjs](../../../scripts/validate-source-anchors.mjs#L1) | 无 |
| 入口行数棘轮 | [invariants-raw-169](../../specs/requirements/invariants-raw-169.md#L1) | [validate-preload-entry-budget.mjs](../../../scripts/validate-preload-entry-budget.mjs#L1) | 无 |
| 用户可见突变只走 Action | PRD Global | [actionRuntime.ts](../../../src/runtime/action/actionRuntime.ts#L119) `dispatch` | 全部按钮 / 快捷键 / 路由 |

## 交互外壳

| 需求面 | 登记 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 统一命令 / 层 / 快捷键 / 目标 | [interaction-raw-179-clause-004](../../specs/requirements/interaction-raw-179-clause-004.md#L1) | [commandCatalog.ts](../../../src/runtime/command/commandCatalog.ts#L24) · [layerStack.ts](../../../src/runtime/command/layerStack.ts#L210) · [keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1142) | 主窗 / Float / Action |
| UI token / 密度 / 无障碍 | [interaction-raw-179-clause-006](../../specs/requirements/interaction-raw-179-clause-006.md#L1) | [design-system-v7.css](../../../src/styles/design-system-v7.css#L1) | 三窗共用 |
| Quick Jump 标记居中 | [quickjump-raw-001](../../specs/requirements/quickjump-raw-001.md#L1) 等 | [quickJumpLayout.ts](../../../src/domain/quickJumpLayout.ts#L1) · [quickJumpRegistry.ts](../../../src/ui/quickJumpRegistry.ts#L1) | [QuickJumpLayer.vue](../../../src/components/QuickJumpLayer.vue#L1) |
| 操作提示层 | PRD Shared Interaction | [OperationTooltipLayer.vue](../../../src/components/OperationTooltipLayer.vue#L1) | 主窗控件 |

## 端口进程

| 需求面 | 权威 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 扫描 / 去重 / 分组 | PRD Ports | [ports.ts](../../../src/domain/ports.ts#L30) `dedupePortProcesses` | [PortsPage.vue](../../../src/pages/PortsPage.vue#L1) |
| 杀进程前复核 PID+端口 | 项目规则 + PRD | [ports.ts](../../../src/domain/ports.ts#L312) `shouldProcessMatchVerifiedPort` | Runtime kill action |
| 跨平台 kill 命令 | 平台桥 | [processBridge.ts](../../../src/platform/processBridge.ts#L27) `buildKillPlan` | 浏览器 dev 走 Vite middleware |

## MQTT

| 需求面 | 权威 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 连接配置规范化 | PRD MQTT + 任务 sync | [mqtt.ts](../../../src/domain/mqtt.ts#L273) `normalizeMqttState` | [MqttPage.vue](../../../src/pages/MqttPage.vue#L1) |
| 连接树 | 同左 | [mqttConnectionTree.ts](../../../src/domain/mqttConnectionTree.ts#L1) | 连接轨 |
| 密钥不进域模型 | PRD MQTT | [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) + preload 加密信封 | 配置抽屉密码框 |
| 归档 / 导出 | 任务 spec | [mqtt.ts](../../../src/domain/mqtt.ts#L479) · [mqttExport.ts](../../../src/domain/mqttExport.ts#L1) | 记录列表 |

## 文件收藏

| 需求面 | 登记 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 收藏是元数据、删除不删盘 | [favorites-raw-001](../../specs/requirements/favorites-raw-001.md#L1) | [favorites.ts](../../../src/domain/favorites.ts#L397) `deleteFavoriteMetadata` | [FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1) |
| 图规范化 / 路径身份 | 同模块 | [favorites.ts](../../../src/domain/favorites.ts#L73) `normalizeFavoriteGraph` · [L60](../../../src/domain/favorites.ts#L60) 身份键 | 树 / 搜索 |
| 运行器 / 十槽 | [favorites-raw-002](../../specs/requirements/favorites-raw-002.md#L1) | [favoriteLaunch.ts](../../../src/domain/favoriteLaunch.ts#L1) | 槽位管理 / Quick |
| 槽位 uTools 入口 | PRD | [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L38) `eypc-favorite-slot-*` | `mainHide` 功能 |

## 窗口跳转

| 需求面 | 权威 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 根窗口身份、子窗口瞬时 | [1527 spec](../../specs/260724/1527-window-jump-workbench/spec.md#L1)（未入册） | [windows.ts](../../../src/domain/windows.ts#L228) `coalesceNativeWindowFamilies` | [WindowsPage.vue](../../../src/pages/WindowsPage.vue#L1) |
| 树投影 | 同左 | [windowTree.ts](../../../src/domain/windowTree.ts#L1) | ARIA tree |
| 激活 / Space | WJ-22 | [windowActivationRuntime.ts](../../../src/runtime/window/windowActivationRuntime.ts#L1) · [preload/windows/index.cjs](../../../preload/windows/index.cjs#L1) | 槽 1–10 |
| 槽路由 | [featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L46) | Runtime `windows.slot.activate` | `mainHide` |

## Companion 共享内核

| 需求面 | 登记 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 七 lane、唯一 Kernel | [shared-raw-179-clause-002](../../specs/requirements/shared-raw-179-clause-002.md#L1) | [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L894) `createCompanionTaskKernel` | 无直接 UI |
| interaction ≠ Plan artifact | [shared-raw-179-clause-001](../../specs/requirements/shared-raw-179-clause-001.md#L1) | 同文件 `finalizeTask` [L697](../../../preload/companion/task-kernel.cjs#L697) | 待输入 / 待继续 |
| 命令网关 | 同模块 | [task-actions.cjs](../../../preload/companion/task-actions.cjs#L99) | 卡片 / 快捷键 / 角标 |
| 打开收据 dispatched≠已读 | [shared-raw-177-clause-003](../../specs/requirements/shared-raw-177-clause-003.md#L1) | [open-handoff.cjs](../../../preload/companion/open-handoff.cjs#L9) | 跳转后未读 |
| 置顶 = local \|\| provider | [shared-raw-205](../../specs/requirements/shared-raw-205.md#L1) | [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L609) `taskPinned` | 置顶分组 |
| 跳转前先启动应用 | [shared-raw-202](../../specs/requirements/shared-raw-202.md#L1) | [open-readiness.cjs](../../../preload/companion/open-readiness.cjs#L1) | 运行页开关 |
| 同一 Turn 精确提问仍待输入 | [shared-raw-207](../../specs/requirements/shared-raw-207.md#L1) | Kernel `applyInteractionProjection` [L1145](../../../preload/companion/task-kernel.cjs#L1145) | 待输入分组 |
| Renderer 只消费 Snapshot | V7 | [codexController.ts](../../../src/runtime/codexController.ts#L383) 身份闸门 [L385](../../../src/runtime/codexController.ts#L385) | [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) · [FloatApp.vue](../../../src/FloatApp.vue#L1) |

## Companion Codex / Claude / Cursor

| 需求面 | 登记模块 | 适配器入口 | 呈现 |
| --- | --- | --- | --- |
| Codex 额度 / 悬浮球 / 配置 | [companion-codex](../../specs/requirements/modules/companion-codex.md#L1) | `preload/codex/*` · [float-bridge.cjs](../../../preload/codex/float-bridge.cjs#L1) | [CodexWaterBall.vue](../../../src/components/CodexWaterBall.vue#L1) |
| Claude 库存 / 相位 / 未读 | [companion-claude](../../specs/requirements/modules/companion-claude.md#L1) | [preload/claude/index.cjs](../../../preload/claude/index.cjs#L1) | 同一 Float / Codex Tab |
| Cursor Plan / 库存 | [shared-raw-206](../../specs/requirements/shared-raw-206.md#L1) | [preload/cursor/inventory.cjs](../../../preload/cursor/inventory.cjs#L1) | 同一 Snapshot |

Provider 清单单点：[provider-manifest.json](../../../preload/companion/provider-manifest.json#L1)。

## 设置与帮助

| 需求面 | 权威 | 实现入口 | 用户可见面 |
| --- | --- | --- | --- |
| 功能开关 + 说明 | EYPC-FEATURE-HELP-001 | [featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L17) · [guides/index.ts](../../../src/help/guides/index.ts#L22) | [SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) |
| 快捷键录制保存 | 命令灵魂 | [SettingsPage.vue](../../../src/pages/SettingsPage.vue#L704) `saveRecord` | 设置「快捷键」 |
