---
id: eypc-utools-onpluginout-hidden-vs-process-exit
status: candidate
scope: project-pointer
fingerprint: utools-onpluginout-callback-treats-false-as-process-shutdown__background-hide-terminates-action-or-clears-runtime-authority__branch-on-isKill
first_seen: 2026-08-03
last_verified: 2026-08-10
review_after: promote only after real uTools ordinary-hide preserves Actions and companion float across repeated mainHide task shortcuts
evidence:
  - vibe/specs/260729/1435-codex-environment-actions/verify.md
tags:
  - utools
  - lifecycle
  - pointer
---

# `onPluginOut(isKill)` 隐藏与进程退出（项目指针）

跨项目权威：[CodeNote uTools lifecycle record](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-onpluginout-hidden-vs-process-exit.md#L1)。

## EyPc 当前差异

- 普通 `onPluginOut(false)` 保留 Action session、Codex App Server、task/project alias 与 latest-Turn cache；它不再主动请求 server close。replaceable Renderer 的 Controller `dispose()` 也只清本地监听/定时器并 detach Host lease；feature disable 或进程终止才请求 Provider teardown，若撞上 Runner/preflight/run 仍延后到所有权结束。
- `onPluginOut(true)` 才取消 pending restart、完成日志 framing/flush、把 live run 持久化为 interrupted、清空 session/vault/confirmation，再发送非强制终止。
- RAW-143 的自动化合同证明普通隐藏后的旧 task alias 可零库存 RPC 打开、并发 stale alias 只共享一次成功 threads preflight；真实 uTools 体感仍 pending。
- RAW-144 补齐 Renderer 之外的同类门禁：Controller 不能把 active Tab/Float 可见性当任务缓存生命周期。Codex feature 启用期间库存与 Activity 持续增量更新，额度才由 surface 门控；Runner catalog 按项目保留，新增/alias 变化只加载受影响项目。
- 2026-08-06：普通 `mainHide` 不得因主 Renderer 卸载时的 `float.close()` 清掉悬浮球“要显示”意图；`codexFloatPersistent` 只由 `sync({ visible })` / kill 拥有，避免重复全局任务快捷键时球消失再重建。自动化证据见 [codexFloatWindowBridge.test.ts](../../../tests/platform/codexFloatWindowBridge.test.ts#L1)；真实 uTools 视觉仍 pending。
- 2026-08-10：RAW-155 保留进程游标与跨 Provider 并发 1，但移除首键固定等待：第一目标立即派发，仅在其 in-flight 时保留最终 trailing，manual/attention 取消未派发 trailing。普通隐藏继续保留 ready V2 包。
- 2026-08-09 RAW-154 返工：热 `onPluginEnter` 与冷 tasks-only 预检现统一由 [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) 消费，任务 payload 不再保存给后续 Renderer。普通隐藏保留进程包；真实退出、Provider 变化或功能停用清理。这样静默入口不会等 Alt+Tab 挂载页面才补执行，同一 intent 也不会重放；真实宿主仍须重接入并核对四端身份。
- 2026-08-10 RAW-155 Float 生命周期：Float 每 2 秒 heartbeat；Host 只在超过 6 秒失联、60 秒冷却外且 10 秒恢复观察失败时受控重建。匿名 interaction id 在 10 秒空闲、blur、普通隐藏、卸载或真实退出时清理，避免 lost pointer/focus 把卡片或拖动永久锁死。真实宿主自恢复仍 pending。
- POSIX 使用进程组 SIGTERM；Windows 使用无 `/F` 的 `taskkill /PID … /T`，失败只回退 direct-child SIGTERM。自动化证据见 [verify.md](../../specs/260729/1435-codex-environment-actions/verify.md#L1)，真实 uTools/Windows 仍 pending。
