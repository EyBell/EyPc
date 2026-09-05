# RAW-212：插窗口失效与重启后自动刷新

Tool: grok · Date: 2026-09-05 · Level: Standard（需求）

spec_id: SPEC-260905-FLOAT-LIFECYCLE-AUTO-REFRESH

## 用户原话

> 为什么这个插窗口加载的内容 每次重新启动之后还需要手动去刷新一下呢 如果失效的话 应该会自动刷新；或者说每次重新启动安装 以及每次关闭之后重新启动 也应该都是自动刷新的

## RAW-212

captured_at: 2026-09-05
state: active
text: >

  为什么这个插窗口加载的内容每次重新启动之后还需要手动去刷新一下呢。如果失效的话应该会自动刷新；或者说每次重新启动安装以及每次关闭之后重新启动也应该都是自动刷新的。

## 规范化需求

1. `createBrowserWindow('float.html')` 得到的持久化插窗口不得在工作台关闭再开、重新接入/安装后继续展示创建时那份 renderer；工作台 `plugin-enter`（`eypc-main` 及可见 Tab 入口）必须受控重建窗口并重推 Snapshot。
2. 身份失效（Float 与主插件 Runtime Identity 不一致）、任务包 `identity-mismatch` / `invalid-payload`、Float 报告的 revision 高于当前 Host Kernel 时，必须自动重建，不得只显示「需要重载」等用户去关开悬浮球。
3. 心跳卡死仍走 60 秒冷却。生命周期/身份重建用 5 秒防抖，避免重建后新窗口立刻再拆。
4. 静默 `mainHide` 入口（槽位、任务循环、快速查看、Action 槽等）不得拆窗口。普通 Esc/`plugin-out(isKill=false)` 仍保留悬浮球位置，但下一次工作台进入会刷新内容。
5. 不自动结束插件后台进程；Host Preload 仍是旧进程时，重建后若身份仍不一致才显示 `reload-required` 并停止任务动作。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L267) Runtime Identity · [#L256](../../PRODUCT_REQUIREMENTS.md#L256) reload-required · [error-memory persistent float](../../../knowledge/error-memory/persistent-float-window-outlives-plugin-reload.md#L1) · [guides/codex.md](../../../../src/help/guides/codex.md#L103) 悬浮窗自恢复

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| refined | PRD「身份不一致必须显示 reload-required」 | Float 先自动重建；重建后仍不一致才横幅 + 停任务 |
| refined | 「重载插件后须手动重开悬浮窗」 | 工作台再进 / 身份失效自动重建；静默快捷键不拆 |
| unchanged | 心跳 6s/60s 冷却 | 卡死恢复与生命周期刷新分开 |
| unchanged | 产品不 kill 插件后台进程 | Preload 未换代时仍可能 `reload-required` |
