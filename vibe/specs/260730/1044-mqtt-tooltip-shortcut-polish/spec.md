# Spec: MQTT 悬浮提示与快捷键可辨识性

Tool: codex
Date: 2026-07-30

## Goal

让 MQTT Tab 的行内图标、快捷操作抽屉与默认快捷键对用户可读、可区分，且抽屉 `kbd` 反映抽屉层真实索引和弦。

## Behavior

1. **图标：** `rename`≠`edit`；消息预览=`Eye`，详情=`Info`；发送选项=`SlidersHorizontal`；分组抽屉新建连接 icon=`add`。
2. **悬浮提示：** 图标按钮走产品层 `data-operation-tooltip` + 常驻 `data-operation-shortcut`（`commandTooltip` / `plainTooltip`），不依赖仅在 Ctrl 提示模式下才写入的 `data-mqtt-shortcut-hint`；原生 `title` 仅作回退并由 `OperationTooltipLayer` 压制。
3. **抽屉 kbd：** 第 1–9 项主显示 `c-N`；可附带抽屉外仍有效的次要和弦；过滤纯 `←`/`→`；无标签时显示「点击」而非「未绑定」。连接删除使用 `mqtt.connection.delete`。
4. **默认绑定：** `mqtt.record.repeatSend` / `mqtt.publish.template.send` → `Ctrl+Shift+Enter`（按 `mqttTargetKind` 互斥）；`mqtt.log.drawer.open` → `Ctrl+Shift+L`；`mqtt.publish.options.open` → `Ctrl+Shift+O`。

## Out of Scope

- 不清空类动作的全局默认键。
- 不改 Ports/Favorites 抽屉显示策略。
- 不代跑测试/构建；验收用户所有。

## Authorities

- UI：[src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)
- Runtime：[src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)、[src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1)
- Help：[src/help/guides/mqtt.md](../../../src/help/guides/mqtt.md#L1)
- Soul：[vibe/knowledge/developer-soul.md](../../knowledge/developer-soul.md#L1)
