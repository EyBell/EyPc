# MQTT 三栏 UI、历史收藏与 SQLite 持久化需求

> Superseded: 本文档中的顶部跳转条、底部收藏/历史双列记录区与 `Ctrl+Shift+L` 布局快捷键已被 [../260624-eypc-mqtt-record-mode-consolidation/01-spec.md](../260624-eypc-mqtt-record-mode-consolidation/01-spec.md#L1) 取代。本文仅保留为历史过程记录。

## 目标

- 优化 MQTT 三栏布局，使订阅栏、消息栏和发送区在 760x720 与最大化窗口下都能稳定填满可用高度。
- 将 MQTT 页面文字按钮收敛为 icon-only command button，文字进入 `title` / `aria-label` / tooltip，`c-*` 快捷键只在 Ctrl/Cmd 提示态显示。
- 将消息查看、右键菜单、复制、收藏、再次发送、预览统一纳入 runtime command。
- 新增/编辑 MQTT 连接配置使用右侧抽屉，不替换接收/发送信息展示区；消息预览使用 `c-i` 命令和窗口内可见的 fixed 浮窗。
- 新增 MQTT 连接必须是全新空白草稿，不继承当前连接的名称、Client ID、地址、订阅或发布 topic；编辑连接时订阅在同一配置抽屉内维护，不再从配置抽屉打开订阅二级浮窗。
- 发送区底部收藏/历史按钮上移到标题栏并去重；发送记录区拆为“收藏”和“历史”两个独立列表，共用 [src/components/MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L1)。
- 连接历史、发送记录、接收记录和收藏模板优先写入本机 SQLite；旧 `eypc/mqtt/archive/v1` 只作为迁移来源和降级备份，密码/token 继续只写本地 secrets 缓存。
- 连接栏、订阅栏、发送记录区、workspace stack/split 模式与拖拽比例都持久化到 `mqtt.layoutPrefs`，刷新后不自动还原默认展开状态。
- 历史/收藏列表支持搜索、`↑↓` 高亮、`Space` 多选并自动下移、`Enter` 单条/批量重复发送、`Delete` EzClipboard 式删除锚点恢复、`Esc` 逐层恢复。

## 范围

- 页面与样式：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)、[src/components/MqttPublishRecordList.vue](../../../src/components/MqttPublishRecordList.vue#L1)、[src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1)、[src/styles/app.css](../../../src/styles/app.css#L1)。
- Runtime 与快捷键：[src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)、[src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1)。
- Domain 与类型：[src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L1)、[src/domain/types.ts](../../../src/domain/types.ts#L1)、[src/domain/recordListSelection.ts](../../../src/domain/recordListSelection.ts#L1)。
- 平台与 preload：[src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1)、[preload/index.js](../../../preload/index.js#L1)、[scripts/validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1)。

## 非目标

- 不修改真实连接、订阅和 publish 协议行为。
- 不新增图标依赖。
- 不处理未跟踪文件 `public/preload.cjs`。
- 不把密码/token 写入 SQLite archive，不在迁移时删除旧 dbStorage archive。

## 验收

- `pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts tests/ui/searchShortcutHints.test.ts` 通过。
- `pnpm run typecheck` 通过。
- `pnpm run build` 通过。
- 文档代码链接审计通过。
- 配置抽屉打开时 MQTT 三栏仍渲染；`Ctrl+I` 预览不写归档、不挤压消息行，并在窄窗内保持可见。
- 新建连接配置抽屉没有当前连接缓存数据；编辑连接配置保存后会同步同一抽屉内的订阅 topic 与别名。
- `tests/platform/mqttSqlitePreload.test.ts` 覆盖 SQLite round-trip、旧 archive 迁移和 secrets 不入库。
- `tests/domain/recordListSelection.test.ts` 覆盖 Space 自动下移和 EzClipboard 式删除锚点恢复。
- `tests/ui/mqttPage.test.ts` 覆盖发送区按钮去重、历史/收藏共用组件、搜索、多选文案和快捷键提示。
