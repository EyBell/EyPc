# MQTT WebSocket 快连 Tab Spec

Tool: codex

## 目标

- 新增默认可见 `MQTT` 顶层功能 Tab，默认功能顺序为第 3 位，面向 MQTT over WebSocket 快速连接、订阅、发布、收发记录归档和历史重发。
- 功能隔离：禁用 Tab 时不加载 MQTT 页面、连接服务或独立归档；进入 MQTT Tab 后再加载归档，执行连接时再动态加载 `mqtt` 依赖。
- 记录隔离：连接配置进入主状态，收发会话和消息写独立本地归档；每个连接配置可关闭本地记录同步。

## 实现范围

- 状态和领域规则在 [src/domain/types.ts](../../../src/domain/types.ts#L1)、[src/domain/state.ts](../../../src/domain/state.ts#L1)、[src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L1)。
- 功能注册、路由、快捷键命令在 [src/runtime/feature/featureRegistry.ts](../../../src/runtime/feature/featureRegistry.ts#L1)、[src/runtime/feature/featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L1)、[src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1)。
- Runtime 状态和 action 统一入口在 [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)。
- 页面懒加载和 UI 在 [src/App.vue](../../../src/App.vue#L1)、[src/components/TabShell.vue](../../../src/components/TabShell.vue#L1)、[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)、[src/styles/app.css](../../../src/styles/app.css#L1)。
- 独立归档 storage 在 [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) 和 [preload/index.js](../../../preload/index.js#L1)。

## 成功标准

- `eypc-mqtt` uTools 入口进入 MQTT Tab；禁用 MQTT 功能时回退设置页功能维护。
- `eypc-main` 和未知入口不再覆盖当前功能区；[src/runtime/feature/featureRouting.ts](../../../src/runtime/feature/featureRouting.ts#L26) 根据当前 tab 恢复上次具体页面，若该功能已禁用则回退设置页功能维护，[src/App.vue](../../../src/App.vue#L57) 传入当前 tab 并避免恢复入口强制清理收藏快开页态。
- 默认快捷键使用短链展示：连接 `c-r`、断开 `c-s-r`、发布 `c-cr`、搜索 `c-f`、侧栏折叠 `c-s-w`、详情/抽屉 `c-←` / `c-→`。
- 配置编辑采用分段 WebSocket endpoint 表单：协议、服务器地址、端口、Path、SSL/TLS，由 Runtime 组装最终 `ws://` / `wss://` URL；端口留空时默认拼接 `8083`。
- 配置编辑支持自动重连、重连间隔、连接超时、keepalive、clean、CONNACK 错误重连、重连后订阅恢复、记录同步开关。
- MQTT UI 重构为三栏工作台：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L211) 渲染左侧连接配置栏、中间订阅栏、右侧收发工作区；[src/styles/app.css](../../../src/styles/app.css#L2432) 负责三栏、折叠和响应式布局，uTools 主窗口宽度仍保持三栏，仅在 [src/styles/app.css](../../../src/styles/app.css#L3064) 的小屏断点退化单列。
- 左侧连接栏只保留连接配置、连接/断开、配置、日志入口；错误日志通过 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L622) 的左侧抽屉展示，支持单条详情、单条清理、当前连接批量清理和全部清理。
- 中间订阅栏展示 topic、QoS、运行时备注和未读数；[src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L502) 生成订阅运行时行，[src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L527) 选择订阅后清空该订阅未读并作为右侧接收区筛选条件。
- 右侧核心区默认上接收、下发送，并可通过 `mqtt.layout.toggle` 切换左右分栏；顶部 `mqtt.receive.filter.all|in|out` 和订阅筛选叠加过滤消息。
- 发送区包含运行时草稿、发送历史和可持久化模板：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L531) 渲染发送编辑器，[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L564) 渲染折叠发送记录，模板可重命名、应用到草稿、直接发送、删除。
- password/token 不写入主状态或归档；可通过 [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) 和 [preload/index.js](../../../preload/index.js#L1) 暂存到本机 local-only storage `eypc/mqtt/secrets-local/v1`，不走 uTools `dbStorage` 数据同步。
- 关闭记录同步后，发送历史和模板只留在当前运行内存，不写独立归档 storage。
