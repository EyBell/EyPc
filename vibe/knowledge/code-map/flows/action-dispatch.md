# 01 Action 派发

所有用户可见写入都要进 `dispatch`。页面 `@click` 只许发 action id。

## 1. 注册

[createAppRuntime](../../../../src/runtime/appRuntime.ts#L706) 内部创建 Action Runtime，并在约 [L8881](../../../../src/runtime/appRuntime.ts#L8881) 起批量 `actions.register` / `registerHandler`。标题、默认快捷键、风险来自 [Command Catalog](../../../../src/runtime/command/commandCatalog.ts#L24)；handler 的 `run` 才是副作用。

Catalog 风险只能加严、不能放宽，见 [actionRuntime.ts](../../../../src/runtime/action/actionRuntime.ts#L71) `canonicalDefinition`。

## 2. 一次按键如何变成 action

1. [App.vue](../../../../src/App.vue#L1) 捕获键盘。
2. [resolveKeybinding](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1142) 在当前 `when` 下选胜者。
3. [resolveLayerStackV7](../../../../src/runtime/command/layerStack.ts#L210) 先过滤焦点层，避免 Action 子窗快捷键抢走主窗命令。
4. `runtime.dispatch(commandId, args)`。

## 3. dispatch 本体

[actionRuntime.ts](../../../../src/runtime/action/actionRuntime.ts#L119)：

- 没有定义 → `unavailable`
- `when(context)` 失败 → `rejected`
- `data-write` / `destructive` 先 `captureSnapshot`，成功后再 `commitSnapshot`（给撤销用）
- `run` 抛错会记 `threw` 再抛出

## 4. 读代码时的习惯

先搜 `actions.register({ id: '…'` 或 `registerHandler({ commandId:`，不要从 Vue 方法名反推权威。设置页保存快捷键是一个例外入口：[SettingsPage.vue](../../../../src/pages/SettingsPage.vue#L704) `saveRecord` 写 draft，仍通过 Runtime 提交绑定。
