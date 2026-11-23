---
schema: computer-use-session/v1
session_id: eypc-shortcut-target-visibility-20261123
status: interrupted
recording_fidelity: live-complete
project: eypc
task_ref: ../../../specs/261120/eypc-shortcut-optimization/jump-cache-component.md
route_id: codex-shortcut-target-accessibility
host: codex-desktop-macos
application: Codex Desktop
surface: 对话主内容区
started_at: 2026-11-23T14:15:57+08:00
ended_at: 2026-11-23T14:16:28.481+08:00
privacy: sanitized
---

# 快捷键目标窗口取证

## Preflight

1. 实时状态脚本读取 EyPc 当前包，开窗诊断记录同一应用的派发与前置。现有两条接口都缺 Codex 主内容区的会话身份。应用主进程未暴露 TCP 调试入口，先核原生可访问性是否提供独立身份和会话可见证据。
2. 只观察已运行的 Codex。若能识别主内容区和两个指定测试会话，再用既有配对入口逐笔核对。保留原应用进程和窗口，证据只记录时间与匿名观测结论。

## Events

| 序号 | 时间 | 方法 | 输入 | 操作前状态 | 结果 | 操作后状态 | 校验 | 决定 | 影响 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-23T14:16:28.481+08:00 | `get_app_state` | `com.openai.codex` | Codex 已运行，主内容区待辨认 | 原生能力按安全边界拒绝访问自身 | 窗口保持原状 | 未取得目标会话可见证据 | 结束桌面观察，后续由用户独立确认落点 | 只读 | — |

## Closeout

本次未取得可绑定到操作号的真实首帧，配对为 0/10 组。应用与会话保持原状。`project_route` 保留既有配对入口，`project_error` 和 `global_extraction` 无新增。
