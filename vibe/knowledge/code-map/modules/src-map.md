# src/ 文件地图

每个文件一行：它实际负责什么。生成文件标「生成，勿手改」。行号指文件头，方便侧栏定位。

## 入口

| 文件 | 含义 |
| --- | --- |
| [main.ts](../../../../src/main.ts#L1) | 主窗 Vue 挂载 |
| [float-main.ts](../../../../src/float-main.ts#L1) | Companion 子窗挂载 |
| [action-main.ts](../../../../src/action-main.ts#L1) | Environment Action 子窗挂载 |
| [App.vue](../../../../src/App.vue#L1) | 壳：slice、路由、快捷键捕获、懒加载页面 |
| [FloatApp.vue](../../../../src/FloatApp.vue#L1) | 悬浮球 / 展开卡，只渲染 Snapshot |
| [ActionApp.vue](../../../../src/ActionApp.vue#L1) | Action Runner UI |

## runtime/

| 文件 | 含义 |
| --- | --- |
| [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L706) | 主运行时：状态、Shell 动作登记、`setTab` 派 `onTabEnter`（约 1 万行，按 register 块读） |
| [codexController.ts](../../../../src/runtime/codexController.ts#L383) | Companion 订阅 / ACK / 额度环境车道，不做第二套相位 |
| [action/actionRuntime.ts](../../../../src/runtime/action/actionRuntime.ts#L56) | dispatch 内核 |
| [action/actionMenu.ts](../../../../src/runtime/action/actionMenu.ts#L1) | 右键 / More 菜单与 Catalog 对齐 |
| [action/types.ts](../../../../src/runtime/action/types.ts#L1) | intent / risk / scope 类型 |
| [command/commandCatalog.ts](../../../../src/runtime/command/commandCatalog.ts#L24) | 命令描述唯一表 |
| [command/layerStack.ts](../../../../src/runtime/command/layerStack.ts#L210) | 模态 / Escape / 层优先级 |
| [command/types.ts](../../../../src/runtime/command/types.ts#L1) | 命令类型 |
| [feature/featureRegistry.ts](../../../../src/runtime/feature/featureRegistry.ts#L18) | 从模块 definition 派生 FEATURES；默认开关/排序转口 `DEFAULT_FEATURE_CONFIGS` |
| [feature/featureModules.ts](../../../../src/runtime/feature/featureModules.ts#L21) | 六个贡献包冻结登记 |
| [feature/featureModule.ts](../../../../src/runtime/feature/featureModule.ts#L69) | 贡献型 FeatureModule ABI |
| [feature/feature-module.md](feature-module.md#L1) | Tab 贡献边界导读（命令/路由/挂页/订阅） |
| [feature/featureRuntimeSlices.ts](../../../../src/runtime/feature/featureRuntimeSlices.ts#L1) | 各 Tab 窄切片选择器 |
| [feature/featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L59) | 遍历模块 routes：uTools code → Tab/Action |
| [keybinding/keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1142) | 绑定、when、冲突、Catalog 构建 |
| [keybinding/keybindingIndex.ts](../../../../src/runtime/keybinding/keybindingIndex.ts#L1) | 当前表面过滤后的快捷键索引 |
| [keyboardEvent.ts](../../../../src/runtime/keyboardEvent.ts#L1) | 输入角色与快捷键事件分类 |
| [navigation/navigationIntent.ts](../../../../src/runtime/navigation/navigationIntent.ts#L1) | 不可变导航意图 |
| [runtimeSlice.ts](../../../../src/runtime/runtimeSlice.ts#L1) | 按 revision 的可启停订阅 |
| [mqttClientModule.ts](../../../../src/runtime/mqttClientModule.ts#L1) | MQTT 客户端会话（Runtime 侧） |
| [shortcutHintTiming.ts](../../../../src/runtime/shortcutHintTiming.ts#L1) | 快捷键提示显示时序 |
| [window/windowInventoryRuntime.ts](../../../../src/runtime/window/windowInventoryRuntime.ts#L1) | 窗口族合并与新鲜度 |
| [window/windowActivationRuntime.ts](../../../../src/runtime/window/windowActivationRuntime.ts#L1) | 激活请求与 Space 失败分类 |

## domain/

| 文件 | 含义 |
| --- | --- |
| [types.ts](../../../../src/domain/types.ts#L1) | 跨功能共享类型 |
| [state.ts](../../../../src/domain/state.ts#L1) | AppState 规范化 / 迁移 |
| [ports.ts](../../../../src/domain/ports.ts#L1) | 端口解析、去重、分组匹配、杀进程复核 |
| [mqtt.ts](../../../../src/domain/mqtt.ts#L1) | MQTT 配置、归档、模板纯函数 |
| [mqttConnectionTree.ts](../../../../src/domain/mqttConnectionTree.ts#L1) | 连接树投影与移动 |
| [mqttExport.ts](../../../../src/domain/mqttExport.ts#L1) | 多记录 JSON 导出 |
| [mqttPayloadPreview.ts](../../../../src/domain/mqttPayloadPreview.ts#L1) | 载荷预览 |
| [favorites.ts](../../../../src/domain/favorites.ts#L1) | 收藏图、树、搜索、元数据删除 |
| [favoriteLaunch.ts](../../../../src/domain/favoriteLaunch.ts#L1) | 运行器、槽、信任、学习 |
| [windows.ts](../../../../src/domain/windows.ts#L1) | 窗口身份、族、槽、目标 |
| [windowTree.ts](../../../../src/domain/windowTree.ts#L1) | 窗口工作台树 |
| [windowRebind.ts](../../../../src/domain/windowRebind.ts#L1) | 会话内手动换绑 |
| [listSelection.ts](../../../../src/domain/listSelection.ts#L1) | 通用列表选择 |
| [recordListSelection.ts](../../../../src/domain/recordListSelection.ts#L1) | 记录列表选择 |
| [shortcuts.ts](../../../../src/domain/shortcuts.ts#L1) | 快捷键 id 规范化 |
| [quickJump.ts](../../../../src/domain/quickJump.ts#L1) | Quick Jump 查询 |
| [quickJumpLayout.ts](../../../../src/domain/quickJumpLayout.ts#L1) | 标记居中投影 |
| [quickJumpHitTest.ts](../../../../src/domain/quickJumpHitTest.ts#L1) | 命中测试 |
| [searchHistory.ts](../../../../src/domain/searchHistory.ts#L1) | 搜索历史 |
| [toolPreview.ts](../../../../src/domain/toolPreview.ts#L1) | Shift 预览偏好 |
| [shortcutHintLayout.ts](../../../../src/domain/shortcutHintLayout.ts#L1) | 提示气泡避让 |
| [floatWindow.ts](../../../../src/domain/floatWindow.ts#L1) | 悬浮窗几何 |
| [codex.ts](../../../../src/domain/codex.ts#L1) | Codex 任务/额度域形状 |
| [codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L1) | Codex 列表/额度呈现 |
| [codexAppearance.ts](../../../../src/domain/codexAppearance.ts#L1) | 水球/展开卡外观 |
| [codexEnvironment.ts](../../../../src/domain/codexEnvironment.ts#L1) | Environment 只读投影 |
| [codexEnvironmentPresentation.ts](../../../../src/domain/codexEnvironmentPresentation.ts#L1) | 运行页文案/密度 |
| [codexActionRunner.ts](../../../../src/domain/codexActionRunner.ts#L1) | Action Runner 目录 |
| [codexNewThread.ts](../../../../src/domain/codexNewThread.ts#L1) | 新会话 composer 冻结快照 |
| [claude.ts](../../../../src/domain/claude.ts#L1) | Claude 额度窗口选取 |
| [claudeCode.ts](../../../../src/domain/claudeCode.ts#L1) | Claude 相位证据优先级 |
| [cursorAgent.ts](../../../../src/domain/cursorAgent.ts#L1) | Cursor 会话域形状 |
| [companionProvider.ts](../../../../src/domain/companionProvider.ts#L1) | Provider id / pin 策略 |
| [companionTaskTopology.ts](../../../../src/domain/companionTaskTopology.ts#L1) | Topology 类型镜像 |
| [companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) | Snapshot → 公开包 |
| [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L1) | 水球/额度条/行标记 |
| [companionAggregate.ts](../../../../src/domain/companionAggregate.ts#L1) | 虚拟项目聚合 |
| [generated/companionContractsV7.ts](../../../../src/domain/generated/companionContractsV7.ts#L1) | 生成：V7 合同 |
| [generated/claudeQuotaVocabulary.ts](../../../../src/domain/generated/claudeQuotaVocabulary.ts#L1) | 生成：额度词汇 |

## platform / pages / ui / help

| 文件 | 含义 |
| --- | --- |
| [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1183) | 宿主桥与浏览器 fallback |
| [processBridge.ts](../../../../src/platform/processBridge.ts#L1) | 扫描/kill 命令计划 |
| [devPortServer.ts](../../../../src/platform/devPortServer.ts#L1) | Vite 开发端口中间件 |
| [pages/PortsPage.vue](../../../../src/pages/PortsPage.vue#L1) | 端口页 |
| [pages/MqttPage.vue](../../../../src/pages/MqttPage.vue#L1) | MQTT 页 |
| [pages/FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L1) | 收藏管理页 |
| [pages/QuickFavoritesPage.vue](../../../../src/pages/QuickFavoritesPage.vue#L1) | 快速收藏 |
| [pages/WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1) | 窗口页 |
| [pages/CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) | Companion 配置/运行 |
| [pages/SettingsPage.vue](../../../../src/pages/SettingsPage.vue#L1) | 设置 |
| [ui/quickJumpRegistry.ts](../../../../src/ui/quickJumpRegistry.ts#L1) | Quick Jump DOM 注册 |
| [ui/commandModifier.ts](../../../../src/ui/commandModifier.ts#L1) | Ctrl/Cmd 双键接受 |
| [ui/contextMenuKeyboard.ts](../../../../src/ui/contextMenuKeyboard.ts#L1) | 右键菜单键盘 |
| [help/guides/index.ts](../../../../src/help/guides/index.ts#L1) | 终端用户说明加载 |
| [help/markdown.ts](../../../../src/help/markdown.ts#L1) | 说明 Markdown 渲染 |

组件目录 `src/components/` 是壳层控件（Tab、确认、树、水球、Tooltip），不拥有业务归约。
