---
schema: computer-use-session/v1
session_id: eypc-native-parity-reload-20261119
status: interrupted
recording_fidelity: reconstructed-partial
project: eypc
task_ref: ../../../specs/261114/codex-state-sync/status-read-investigation-261116.md
route_id: utools-developer-tools-reconnect
host: codex-desktop-macos
application: uTools
surface: EyPc 原开发项目
started_at: 2026-11-19T19:14:08+08:00
ended_at: 2026-11-19T19:18:20+08:00
privacy: sanitized
---

# B04–B06 开发插件验收入口

## Preflight

1. 确认 19:13:40.076 构建能在当前 uTools 加载。以新版 Host、Renderer 及 V7 握手取证。命令行没有插件级重载入口，已可从脱敏诊断读到旧握手。沿用[当日开发工具路线](2026-11-19-stale-side-reload.md)。
2. 仅在当前 EyPc 开发项目与 `dist/plugin.json` 一致时使用该项目重载。保留正在运行的宿主和其他项目。原生交互写入由用户在受控会话完成。状态核对限匿名数据及自然发生的样本。
3. 本页保存有序的操作结论、验证进度和影响。看到可匹配的实际渲染回执后再记录现场通过和时延。

## Events

| 序号 | 时间 | 方法 | 输入 | 操作前状态 | 结果 | 操作后状态 | 校验 | 决定 | 影响 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 时间未单独采集 | `cua.getApp` | uTools | 进程运行，现有日志可见旧握手 | 返回 EyPc 悬浮窗口与标准菜单 | 当前窗口资源来自已安装包 | 当前开发项目的重载控件不可达 | 结束 UI 观察，回核脱敏诊断 | 只读 | |

## Closeout

1. uTools 保持原会话。该窗口对应已安装包，开发者工具项目入口依然未露出。官方启动链接的入口名称是「安装并打开插件应用」，调用可能安装组件。当前现场验收停在既有开发项目重载入口。
2. 源码及构建可从专题追溯。新版握手、原生侧栏与浮窗渲染对照仍待获取。UI 操作的独立时间未采集，日志以本页有序记录为准。[现场与回放](../../../specs/261114/codex-state-sync/status-read-investigation-261116.md#b04-b06-verification)
3. `project_route` 沿用既有路线。`project_error` 与 `global_extraction` 均无新增。
