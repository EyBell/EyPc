# MQTT 三栏 UI 与 Command-Soul 优化实施计划

> Superseded: 本计划中的顶部跳转条与底部双列发送记录区已被 [../260624-eypc-mqtt-record-mode-consolidation/02-plan.md](../260624-eypc-mqtt-record-mode-consolidation/02-plan.md#L1) 取代。本文仅保留为历史过程记录。

## 文件

- [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)：新增 MQTT pane、统计、drawer item、预览、收藏草稿和复制/收藏/抽屉命令。
- [src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1)：新增 MQTT pane、drawer、favorite editor、preview 快捷键层。
- [src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1)：识别 MQTT 收藏编辑层和列表区域角色。
- [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1)、[preload/index.js](../../../preload/index.js#L1)：新增 `clipboard.copyText(text)`，保留 `files.copyPath(path)`。
- [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)：重构三栏 UI、icon button、右键抽屉、收藏别名层和 hover/Shift 预览。
- [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)：补充连接配置右侧抽屉、配置内联订阅编辑、`c-i` 预览锚点和 fixed 浮窗定位。
- [src/styles/app.css](../../../src/styles/app.css#L1)：补高度链路、三栏紧凑布局、timeline/bubble、稳定 hover 菜单、配置抽屉和窗口内可见预览层。

## 顺序

1. 先补 RED 测试和任务文档。
2. 实现 runtime state、command、keybinding 和平台复制接口。
3. 实现 Vue 页面结构与事件。
4. 实现 CSS 视觉与高度链路。
5. 补充配置草稿回归：新建为空白，编辑订阅在配置抽屉内保存。
6. 更新项目记忆文档并跑链接审计。
7. 运行目标测试、typecheck、build。

## 风险

- MQTT 页面按钮文本被移入 tooltip 后，静态测试需要改为检查 `aria-label`、`title`、`kbd` badge 和 icon class。
- `Ctrl+C` 复制 payload 只能在非文本输入焦点生效，避免拦截编辑器内系统复制。
- 预览层必须只读且不使用 `v-html`，JSON payload 仅格式化展示。
- 配置编辑和消息预览都属于临时层，打开时不能挤压三栏工作区；预览命令不得触发归档读写或 MQTT 连接行为。
- 配置编辑器已包含订阅字段时，不应再打开订阅二级浮窗；否则会形成缓存来源不清和保存边界不清的问题。
