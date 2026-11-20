---
schema: computer-use-session/v1
session_id: eypc-stale-side-reload-20261119
status: interrupted
recording_fidelity: live-complete
project: eypc
task_ref: ../../../specs/261114/codex-state-sync/status-read-investigation-261116.md
route_id: utools-developer-tools-reconnect
host: codex-desktop-macos
application: uTools
surface: EyPc 开发插件
started_at: 2026-11-19T15:48:50+08:00
ended_at: 2026-11-19T15:56:22.424+08:00
privacy: sanitized
---

# 普通 Side 归组修复换包

## Preflight

1. 复用[现有开发工具重接入路线](2026-11-19-owner-queue-reload.md)。日志接口可核验版本与分组。本机项目没有插件级重载 CLI。
2. 只在确认现有 EyPc 开发项目指向 `dist/plugin.json` 且构建通过后重载该插件。以新版握手、自然样本归组和浮窗应用回执验收。
3. 保留现有对话及读态。只留版本和脱敏回执。

## Events

| 序号 | 时间 | 方法 | 输入 | 操作前状态 | 结果 | 操作后状态 | 校验 | 决定 | 影响 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-19T15:49:08.949+08:00 | `get_app_state` | uTools，窗口与菜单摘要 | 旧包运行 | 成功 | EyPc 悬浮窗来自本机安装包 | 找到 uTools 应用菜单 | 检查应用菜单中的启动入口 | 无 | |
| 2 | 2026-11-19T15:49:36.012+08:00 | `click` | uTools 应用菜单，索引 7 | 悬浮窗在运行 | 成功 | 待读回 | 待读回 | 读取菜单项 | 导航 | |
| 3 | 2026-11-19T15:49:51.522+08:00 | `get_app_state` | uTools，应用菜单摘要 | 菜单展开 | 成功 | 可见关于、服务与退出 | 菜单无项目入口 | 关闭菜单 | 无 | |
| 4 | 2026-11-19T15:50:07.366+08:00 | `perform_secondary_action` | uTools 应用菜单，索引 2，`Cancel` | 菜单展开 | 成功 | 待读回 | 待读回 | 确认菜单恢复 | 导航 | |
| 5 | 2026-11-19T15:50:23.886+08:00 | `get_app_state` | uTools，窗口摘要 | 已发出菜单关闭操作 | 成功 | 原悬浮窗在运行，应用菜单已关闭 | 当前窗口无开发项目入口 | 转查宿主注册入口 | 无 | |
| 6 | 2026-11-19T15:52:28.435+08:00 | `supporting-event` | 官方开发者工具页面的打开入口 | 已核实本机安装同版开发者工具 | 系统已接收打开请求 | 待读回 | uTools 开发者工具入口已核 | 读取单个项目 | 导航 | |
| 7 | 2026-11-19T15:52:42.081+08:00 | `get_app_state` | uTools，窗口与项目摘要 | 已发出开发者工具打开请求 | 成功 | 原生入口返回另一悬浮窗 | 尚无 EyPc 项目控件 | 核对开发者工具是否实际打开 | 无 | |
| 8 | 2026-11-19T15:53:22+08:00 | `list-windows` | uTools，后台窗口枚举 | 原生入口无项目控件 | 窗口集合为空 | 无可定向的开发者工具窗口 | 未重载 | 等待本轮构建并核对握手 | 无 | |
| 9 | 2026-11-19T15:55:11+08:00 | `list-windows` | uTools，按已核进程定向 | 后台工具按应用身份找不到窗口 | 窗口集合为空 | 无可定向窗口 | 排除应用标识不匹配 | 尝试打开 uTools 正常入口 | 无 | |
| 10 | 2026-11-19T15:56:10+08:00 | `supporting-event` | 系统打开已运行的 uTools | 应用提供正常打开入口 | 系统接受 | 待读回 | 确认主入口是否可见 | 读回 uTools | 导航 | |
| 11 | 2026-11-19T15:56:22.424+08:00 | `get_app_state` | uTools，主入口摘要 | 系统已打开应用 | 成功 | 返回同一个 EyPc 悬浮窗 | 缺开发项目控件 | 停止重复打开并核对新版握手 | 无 | |

## Closeout

1. uTools 和原悬浮窗正常运行，临时菜单已关闭。当前工具只取得悬浮窗，开发者工具项目的重载控件未出现。
2. 由用户在现有 EyPc 开发项目重载后，按新版握手、目标分组和浮窗应用回执核验。
3. project_route 保留现有路径。project_error 和 global_extraction 均无新增。
