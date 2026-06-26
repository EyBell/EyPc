# Global Quick Jump Plan

Tool: codex

## Files

- [../../../src/domain/quickJump.ts](../../../src/domain/quickJump.ts#L1)：新增标记生成、筛选和焦点移动领域逻辑。
- [../../../src/domain/quickJumpLayout.ts](../../../src/domain/quickJumpLayout.ts#L1)：新增浮层标记候选点、视口夹取和碰撞避让布局逻辑。
- [../../../src/components/QuickJumpLayer.vue](../../../src/components/QuickJumpLayer.vue#L1)：新增全局目标提示浮层。
- [../../../src/App.vue](../../../src/App.vue#L1)：接入浮层状态、目标扫描、键盘处理和目标激活。
- [../../../src/runtime/keybinding/keybindingRuntime.ts](../../../src/runtime/keybinding/keybindingRuntime.ts#L1)：增加 `quickJump.openForward` / `quickJump.openBackward` 默认快捷键。
- [../../../src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L1)：注册 Quick Jump 设置项，并让运行时把对应命令交给 App 浮层处理。
- [../../../src/runtime/keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1)：补齐 `role="textbox"` 可编辑识别和 MQTT 连接输入角色。
- [../../../src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L1)：给 MQTT 连接/订阅列表补齐可跳转、可聚焦和上下文菜单入口。
- [../../../src/styles/app.css](../../../src/styles/app.css#L1)：新增 Quick Jump 浮层样式和 MQTT 焦点样式。
- [../../../tests/domain/quickJump.test.ts](../../../tests/domain/quickJump.test.ts#L1)、[../../../tests/domain/quickJumpLayout.test.ts](../../../tests/domain/quickJumpLayout.test.ts#L1)、[../../../tests/ui/quickJump.test.ts](../../../tests/ui/quickJump.test.ts#L1)、[../../../tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L1)、[../../../tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L1)：新增/扩展回归覆盖。

## Steps

1. 先写 Quick Jump 领域和接入测试，确认缺失模块、缺失快捷键和编辑区识别会红。
2. 实现领域纯函数，保证标记排除 `f` 且大列表标记前缀无歧义。
3. 在 App 层扫描当前可见目标，过滤编辑、隐藏和禁用元素，打开浮层后由查询状态驱动筛选。
4. 在 keybinding/runtime 中暴露 `F` 与 `Shift+F` 设置项，运行时返回命令 id 让 App 接管浮层。
5. 补齐测试暴露出的 MQTT 连接/订阅焦点命令和 UI 静态入口，避免 Quick Jump 接入后全量测试仍处于未闭合状态。
6. 运行类型检查、单测、构建和 uTools 运行时校验。

## Risks

- `F` 是新全局默认快捷键，必须严格受 `!textInputFocused`、`role="textbox"` 和 DOM 可编辑判断保护。
- DOM 扫描可能纳入过多目标；显式支持 `data-quick-jump-ignore` 作为页面局部排除口。
- 浮层激活真实 DOM 点击，目标自身仍承担业务确认、删除或危险动作保护。
