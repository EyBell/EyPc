---
id: eypc-utools-onpluginout-hidden-vs-process-exit
status: candidate
scope: project-pointer
fingerprint: utools-onpluginout-callback-treats-false-as-process-shutdown__background-hide-terminates-action-or-clears-runtime-authority__branch-on-isKill
first_seen: 2026-08-03
last_verified: 2026-08-09
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
- 2026-08-09：RAW-152 证明只修 `onPluginOut(false)` 仍不够；主 Renderer `dispose()` 也不得调用 provider destructive close。通用前后任务的全启用来源 ready、进程游标、75ms 最终目标与跨 Codex/Claude 最大并发 1 现由 [navigation.cjs](../../../preload/companion/navigation.cjs#L1) 独占，热 `onPluginEnter` 只消费一次；真实 uTools 连按崩溃验收仍 pending。
- 2026-08-09 RAW-154 返工：热 `onPluginEnter` 与冷 tasks-only 预检现统一由 [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) 消费，任务 payload 不再保存给后续 Renderer。普通隐藏保留进程包；真实退出、Provider 变化或功能停用清理。这样静默入口不会等 Alt+Tab 挂载页面才补执行，同一 intent 也不会重放；真实宿主仍须重接入并核对四端身份。
- POSIX 使用进程组 SIGTERM；Windows 使用无 `/F` 的 `taskkill /PID … /T`，失败只回退 direct-child SIGTERM。自动化证据见 [verify.md](../../specs/260729/1435-codex-environment-actions/verify.md#L1)，真实 uTools/Windows 仍 pending。
