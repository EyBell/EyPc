---
schema: computer-use-session/v1
session_id: eypc-native-parity-live-20261120
status: interrupted
recording_fidelity: live-complete
project: eypc
task_ref: ../../../specs/261114/codex-state-sync/status-read-investigation-261116.md
route_id: utools-developer-tools-reconnect
host: codex-desktop-macos
application: uTools
surface: EyPc 浮窗与现有开发项目
started_at: 2026-11-20T13:42:05.835+08:00
ended_at: 2026-11-20T13:42:28.460+08:00
privacy: sanitized
---

# V7 同版浮窗与开发项目核验

## Preflight

1. 13:34 宿主握手已由项目诊断确认。脱敏日志可核对已应用的任务包，缺卡片文案和窗口入口。现有 CLI 未提供定向重载。沿用[开发项目路线](2026-11-19-native-parity-reload.md)。
2. 观察范围为 uTools 的 EyPc 浮窗和已有项目入口。只有当前项目明确指向本检出的 `dist/plugin.json` 且有同轮原生运行对照时，才在项目内重载。Codex 原生审批、中断和清读由用户在受控样本操作。
3. 本页仅记有序操作结论。核对根卡、Side 摘要或可见项目入口，状态验收写回专题。

## Events

| 序号 | 时间 | 方法 | 输入 | 操作前状态 | 结果 | 操作后状态 | 校验 | 决定 | 影响 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-20T13:42:28.460+08:00，回记时间 | `cua.getApp` | uTools | 宿主已握手，当前窗口待核 | 当前窗口属于另一插件 | 原窗口保持 | EyPc 根卡与项目入口不可见 | 结束 UI 观察，继续回读同版诊断 | 只读 | — |

## Closeout

1. 本次窗口内无 EyPc 根卡、Side 摘要及开发项目控件。原生画面与项目内重载结合下一次受控现场取证。
2. `project_route` 沿用现有入口。`project_error` 与 `global_extraction` 均无新增。
