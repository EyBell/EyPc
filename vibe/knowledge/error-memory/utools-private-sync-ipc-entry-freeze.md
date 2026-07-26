---
id: eypc-utools-private-sync-ipc-entry-freeze
status: verified
scope: project
fingerprint: utools-main-window-stays-loading__renderer-calls-private-sendSync-getAllFeatureHotKey__remove-hotkey-readback-and-keep-redirect-only
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2027-01-24
evidence:
  - user-confirmed
  - preload/index.js
  - src/runtime/codexController.ts
  - src/runtime/appRuntime.ts
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - utools
  - preload
  - synchronous-ipc
  - hotkey
  - startup-freeze
---

# uTools 私有同步 IPC 令插件入口持续加载

## Symptom

浏览器调试页面可打开，但 uTools 运行插件时一直停在加载状态，入口页面和控制台都无法进入。关闭自动结束、重新构建和重启 uTools 均不能恢复。

## Wrong Assumption

把 Electron 渲染进程可调用的私有同步 IPC 当成稳定的 uTools 插件 API，并认为只要包在 `try/catch` 中就能安全读取宿主快捷键。

## Verified Root Cause

快捷键回读经 preload 调用了私有同步通道 `getAllFeatureHotKey`。同步调用发生在插件加载/页面进入链路时，宿主没有返回就会阻塞渲染线程；`try/catch` 只能处理抛错，无法解除同步等待。移除自动回读后，用户确认插件恢复加载。

## Verified Error Consensus

| Question | Project Consensus |
| --- | --- |
| 如何识别 | 浏览器调试页可打开，但 uTools 主入口在 Console 之前持续加载，且重建、重启和关闭自动结束均无效时，优先按宿主入口同步阻塞排查。 |
| 已确认根因 | 私有 `ipcRenderer.sendSync(...)` 快捷键回读会无限等待宿主响应；`try/catch` 不能中断同步等待。 |
| 不应先归因 | 构建缓存、uTools 自动结束策略或普通页面渲染不是本次已验证根因；除非新的直接证据出现，不得用这些方向替代 preload/入口差异核验。 |
| 唯一已验证恢复路线 | 删除入口及全部手动/自动宿主快捷键回读、运行时快照和页面回显，只保留官方 `redirectHotKeySetting` 单向配置跳转。 |
| 复发判定 | 任一 preload/Renderer 重新引入私有同步宿主通道，或把宿主配置读取接回入口、焦点、可见性或刷新链路，都视为违反项目规则 `EYPC-UTOOLS-HOST-001`。 |
| 未来例外 | 仅在新需求明确授权且 uTools 提供公开异步 API 时重新设计；必须由显式用户动作触发、设置超时并保持入口零依赖，不能复用本次同步方案。 |

## Evidence

- 用户确认删除入口回读后 uTools 可重新加载。
- [preload/index.js](../../../preload/index.js#L1) 现只保留官方 `redirectHotKeySetting` 配置跳转，不再暴露快捷键读取 API。
- [codexController.ts](../../../src/runtime/codexController.ts#L1) 不再保存或刷新任务快捷键回读快照。
- [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1) 不再在进入窗口页或完成配置后触发快捷键回读。
- 任务验收与未执行项记录在 [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1)。

## Correct Detection Order

1. 当浏览器页面正常而 uTools 入口卡死时，先比较最近 preload 与入口初始化差异。
2. 搜索 `sendSync`、未公开 IPC 通道和入口阶段的宿主 API 调用；不要先归因于构建缓存或自动结束策略。
3. 临时移除入口调用并由用户在 uTools 中复验，以确认阻塞边界。
4. 若功能只是展示宿主配置，优先删除回读；保留官方配置跳转作为单向操作。
5. 静态搜索确认 preload、运行时快照和页面均没有残余读取入口。

## Prevention Rule

uTools 插件不得通过 `require('electron').ipcRenderer.sendSync(...)` 或等价私有同步方式调用宿主通道，也不得在入口、启动、焦点、可见性或手动刷新事件中回读快捷键。快捷键集成只使用官方 `redirectHotKeySetting` 单向跳转；页面不展示无法由公开 API 安全取得的当前绑定。项目强制规则与本地追溯记录位于 [vibe/rules/README.md](../../rules/README.md#L1)。

## Latest Applicable Implementation

- [preload/index.js](../../../preload/index.js#L1) 与 [public/preload.js](../../../public/preload.js#L1) 已删除私有同步快捷键读取实现和桥 API。
- [eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) 已删除 `ConfiguredHotkeyReadback` 契约。
- [CodexPage.vue](../../../src/pages/CodexPage.vue#L1) 与 [WindowsPage.vue](../../../src/pages/WindowsPage.vue#L1) 仅提供配置跳转，不再显示或刷新宿主绑定。

## Alternative Route

- Status: `verified`
- Preconditions: uTools 插件入口卡死，浏览器调试页正常，最近改动新增宿主快捷键读取或同步 IPC。
- Ordered steps: remove the synchronous read from entry/focus/visibility paths; remove the read bridge and snapshots; keep only `redirectHotKeySetting`; statically search for the private channel; reload the plugin in uTools.
- Verification: user confirmed the plugin loads after the entry read was removed; the completed implementation contains no private hotkey-readback symbol or `getAllFeatureHotKey` reference.
- Applicability boundary: uTools host configuration readback; it does not prohibit documented asynchronous APIs or ordinary local state reads.
- Fallback: if uTools later publishes a supported asynchronous read API, introduce it only behind explicit user action and a bounded timeout, never in the startup path.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex / window shortcut readback | uTools remained loading before console while browser debug page worked | Retried build/restart and relied on private synchronous hotkey IPC | Removed entry read, then removed the entire readback contract while retaining settings redirects | verified by user; full removal statically verified |
