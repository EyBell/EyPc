---
id: eypc-req-codex-raw-107
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-107
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-084-task-cycle-global-shortcut"
relations:
  - refines-RAW-084-task-cycle-global-shortcut
---

# RAW-107 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

当 `hideAfterAction=true` 的全局任务循环快捷键（`eypc-codex-task-previous` / `eypc-codex-task-next`）触发时，`applyPluginRoute` 不得调用 `runtime.setTab`。因为应用窗口在动作后立即隐藏，切换页签会触发 `codexController.syncActivation(false)`，进而调用 `options.platform.codex.close()` 清除 preload 中的 `codexThreadActions`，使 `cycleTask` 持有的缓存任务列表中的 `actionAlias` 全部失效，导致打开任务时崩溃。同时，当 `syncActivation` 检测到 `shouldRun()` 返回 `false` 时，必须将 `conversations` 清空为 `emptyConversationSnapshot()`，防止 `cycleTask` 读取已被关闭连接失效的陈旧任务数据。候选为空时 `cycleTask` 显示"当前没有可切换的 Codex 任务"提示，不尝试打开。该修复不改变循环序列、优先级、回退或打开路径，仅确保非活跃状态下不消费已失效的缓存。
