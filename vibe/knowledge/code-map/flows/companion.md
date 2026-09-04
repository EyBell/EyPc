# 02 Companion Kernel

任务列表、角标、悬浮球读的是同一份 V7 Snapshot。页面不得再做相位归约。

函数级走读（证据链 + 打开收据）：[companion-kernel.md](companion-kernel.md#L1)。

## 证据进 Kernel

```text
preload/codex|claude|cursor 适配器
  → provider-registry.cjs
  → task-topology.cjs（只收成员关系）
  → task-kernel.cjs createCompanionTaskKernel
  → companion-task-snapshot-v7
  → eypcPlatform.companionKernel
  → createCodexController 身份闸门
  → CodexPage / FloatApp / 角标
```

工厂：[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L894)。

公开相位与分组：[finalizeTask](../../../../preload/companion/task-kernel.cjs#L697)。置顶谓词：[taskPinned](../../../../preload/companion/task-kernel.cjs#L609)（`localPin || providerPin`）。

## 打开一条任务

卡片 / Enter / 全局快捷键都发同一 `companion-task-command-v1`：

1. [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L99) 解析 root、串行、single-flight
2. Provider Adapter 执行 open
3. [open-handoff.cjs](../../../../preload/companion/open-handoff.cjs#L9) 把 OS/Deep Link 成功标成 `dispatched`，`confirmsRead=false`
4. 只有后续原生可见/已读证据才能进 `native-confirmed/applied`

Controller 侧身份闸门：[codexController.ts](../../../../src/runtime/codexController.ts#L385)。revision 对不上就当 Kernel 不存在，禁止用旧分类器顶上。

## Float 只渲染

[FloatApp.vue](../../../../src/FloatApp.vue#L1) 消费 [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L1) 投影。不要在 Float 里重算 running / waiting / unread。

水球：[CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)；子窗生命周期：[float-bridge.cjs](../../../../preload/codex/float-bridge.cjs#L1)。持久化悬浮窗在插件重载时可能不换 bundle——这是已知改造点，见 technical-details / error-memory。
