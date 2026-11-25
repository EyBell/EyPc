---
schema: computer-use-session/v1
session_id: eypc-v7-reload-visibility-20261125
status: completed
recording_fidelity: reconstructed-partial
project: eypc
task_ref: ../../../specs/261114/codex-state-sync/delivery.md
route_id: eypc-float-native-pin-visibility
host: codex-desktop-macos
application: org.yuanli.utools
surface: EyPc Main 与 Float
started_at: 2026-11-25T09:02:38+08:00
ended_at: 2026-11-25T09:07:48+08:00
privacy: sanitized
---

# V7 重载后双窗可见核验

## Preflight

1. 用户已重载开发插件。任务状态脚本确认实载 11 月 24 日 18:58 构建的 V7。第 17 包 Main 隐藏、Float 折叠，脚本只读，无法调出窗口。
2. 沿用[原窗口路径](2026-11-24-native-pin-live.md)。操作限于显示 Main 外观预览、展开 Float 和查看任务分组。同包验收以脚本回执为依据。继续按钮只核资格。窗口留在用于核对的页签，只保留脱敏摘要。

## Events

| 序号 | 时间 | 方法 | 输入 | 操作前状态 | 结果 | 操作后状态 | 校验 | 决定 | 影响 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | time-unavailable | `getApp` | `org.yuanli.utools` | Main 隐藏，Float 折叠 | 取得 uTools Float | Float 球面可见 | 可安全定位窗口 | 查主窗入口 | 观察 | — |
| 2 | 09:03:18.722 | `pressKey` | `alt+space` | Float 球面可见 | 唤起键已发送 | 待读取 | 检查主搜索窗 | 读取窗口 | 导航 | — |
| 3 | 09:03:18 | `getAXState` | uTools | 已发唤起键 | 无树变化 | 仍为 Float | Main 入口未出现 | 查看应用菜单 | 观察 | — |
| 4 | 09:03:33.505 | `click` | uTools 应用菜单 | Float 球面可见 | 已点开菜单 | 待读取 | 查主窗入口 | 读取菜单 | 导航 | — |
| 5 | 09:03:33 | `getAXState` | uTools | 应用菜单已打开 | 取得菜单项 | 显示全部不可用 | 应用菜单缺入口 | 收起菜单 | 观察 | — |
| 6 | 09:03:45.897 | `performSecondaryAction` | 应用菜单 `Cancel` | 应用菜单打开 | 已发取消 | 待读取 | 恢复 Float | 读取浮窗 | 导航 | — |
| 7 | 09:03:45 | `getAXStateAndScreenshot` | Float 球面 | 菜单已请求收起 | 定位球面上区 | Float 仍折叠 | 可按既有热区展开 | 展开 Float | 观察 | — |
| 8 | 09:03:56.373 | `click` | Float 球面上区 | Float 折叠 | 已点击 | 待读取 | 请求展开 | 读动态页 | 导航 | — |
| 9 | 09:03:57 | `getAXState` | Float 动态页 | Float 已请求展开 | 两个目标行可定位 | Float 已展开 | 可由脚本收行回执 | 查主窗入口 | 观察 | — |
| 10 | 09:04:43.655 | `getApp` | `com.apple.dock` | Float 展开，Main 隐藏 | `timeoutReached` | 未取得 Dock 状态 | Dock 入口不可核验 | 查插件功能入口 | 无 | — |
| 11 | 09:05:14 | `supporting-event` | uTools 的 EyPc「Codex额度」功能指令 | Main 隐藏 | 已提交功能指令 | 待读取 | 调起搜索窗 | 读取窗口 | 导航 | — |
| 12 | 09:05:19.005 | `getAXState` | uTools 搜索窗 | 已提交功能指令 | 显示外部打开确认 | 已定位搜索窗 | 用普通搜索入口 | 取消外部请求 | 观察 | — |
| 13 | 09:05:30.035 | `pressKey` | `Escape` | 外部确认待取消 | 已发取消 | 待读取 | 切回搜索 | 读取最近使用 | 导航 | — |
| 14 | 09:05:30 | `getAXState` | uTools 搜索窗 | 已发取消 | 出现 Codex额度条目 | 焦点摘要仍带旧提示 | 读取增量中目标入口 | 判断普通搜索状态 | 观察 | — |
| 15 | 09:05:44.606 | `click` | 最近使用里的 EyPc「Codex额度」 | 最近使用已有目标 | 已点功能条目 | 待读取 | 打开 Main | 读取主窗 | 导航 | — |
| 16 | 09:05:45 | `getAXState` | EyPc 主窗 | 已点 Codex额度 | 快捷方式页打开 | 外观页可选 | 入口可用 | 切到外观 | 观察 | — |
| 17 | 09:05:56.878 | `click` | 外观页签 | 快捷方式页选中 | 已点击 | 待读取 | 打开水球预览 | 查看主窗 | 导航 | — |
| 18 | 09:05:57 | `getAXState` | EyPc 外观页 | 已请求切换页签 | 取得水球预览 | 外观已显示 | 可由脚本核主窗角标 | 读取同包回执 | 观察 | — |
| 19 | 09:06:26.524 | `getScreenshot` | uTools 当前窗口 | Main 曾可见，Float 折叠 | 截到 Float | 当前窗口为 Float | 主窗位置已失效 | 查同包回执及窗代 | 观察 | — |
| 20 | 09:07:15 | `supporting-event` | uTools 的 EyPc「Codex额度」功能指令 | Main 自动隐藏 | 已调起主搜索窗 | 待读取 | 重新定位分离入口 | 读搜索窗 | 导航 | — |
| 21 | 09:07:25.054 | `getAXState` | uTools | 主搜索已调起 | 出现外部确认 | 外部请求等待 | 可走最近使用 | 取消外部请求 | 观察 | — |
| 22 | 09:07:25.059 | `pressKey` | `Escape` | 外部请求等待 | 已发取消 | 待读取 | 回到普通搜索 | 查最近使用 | 导航 | — |
| 23 | 09:07:25.464 | `getAXState` | uTools 搜索窗 | 已发取消 | 取得最近使用 | 有 Codex额度 | 入口可用 | 打开主窗 | 观察 | — |
| 24 | 09:07:25.537 | `click` | 最近使用里的 Codex额度 | 搜索窗有目标 | 已点开 | 待读取 | 打开 Main | 读取主窗 | 导航 | — |
| 25 | 09:07:26.682 | `getAXState` | EyPc 主窗 | 已点击功能 | 取得配置分类 | Main 已打开 | 当前页签可核 | 定位插件菜单 | 观察 | — |
| 26 | 09:07:26.748 | `getAXStateAndScreenshot` | EyPc 外观页 | Main 已打开 | 已定位插件图标 | 外观仍选中 | 可调单次分离菜单 | 打开插件菜单 | 观察 | — |
| 27 | 09:07:43.040 | `click` | 插件图标 | 上次取得 Main 外观 | 窗口变化，动作被拦截 | 未执行分离 | 同包双窗待脚本判定 | 结束页面操作 | 无 | — |

## Closeout

Main 外观与 Float 动态页分别打开过。窗口交互在用户要求统一脚本后停止。未保留截图像素或窗口树。回执结论以统一实时脚本取得的包号和窗代为准。

`project_route` 未变。`project_error` 无新增。`global_extraction` 无新增。
