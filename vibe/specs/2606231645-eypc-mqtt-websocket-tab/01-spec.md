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
- 中间订阅栏采用紧凑列表：顶部 `+ 添加订阅`，列表 item 顶部对齐自动排列，显示别名或 topic、未读数和连接级 QoS；[src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L517) 生成订阅行，支持单击订阅筛选、点击空白恢复全部、Space 多选、Enter 应用多选筛选，选中/高亮/左竖线状态必须清晰。
- 订阅别名持久化到连接配置：`subscriptions` 继续保存 topic 字符串，`subscriptionAliases` 保存 topic 到别名的映射；整连接配置页只展示订阅摘要和“管理订阅”入口，实际新增/编辑通过 [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L755) 的独立订阅浮窗完成。
- 订阅浮窗使用专用 runtime draft 和稳定行 `id`，行 key 不得绑定 topic 或输入内容，避免输入每个字符时重建 DOM 导致失焦；保存只更新当前连接的订阅字段。
- MQTT 编辑态采用高优先级输入隔离：订阅浮窗 `mqtt-subscription-editor` 与连接配置 `mqtt-editor` 只允许保存、取消和字段循环快捷键穿透，`c-→`、`c-←`、`c-t`、`c-h`、`c-1/2/3` 等功能命令不得在输入中打开菜单或触发工作台动作。
- 订阅清理语义是删除当前连接配置里的订阅项：单项 `×`、多选清理、清空全部都会同步配置页；连接中删除 topic 时对 MQTT client 执行 best-effort unsubscribe，失败只写日志不阻断 UI。
- 右侧核心区默认上接收、下发送，并可通过 `mqtt.layout.toggle` 切换左右分栏；顶部 `mqtt.receive.filter.all|in|out` 和订阅筛选叠加过滤消息。
- 发送区包含运行时草稿、发送历史和可持久化模板：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L531) 渲染发送编辑器，[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L564) 渲染折叠发送记录，模板可重命名、应用到草稿、直接发送、删除。
- password/token 不写入主状态或归档；可通过 [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) 和 [preload/index.js](../../../preload/index.js#L1) 暂存到本机 local-only storage `eypc/mqtt/secrets-local/v1`，不走 uTools `dbStorage` 数据同步。
- 关闭记录同步后，发送历史和模板只留在当前运行内存，不写独立归档 storage。
