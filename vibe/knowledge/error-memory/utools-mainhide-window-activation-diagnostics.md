---
id: eypc-utools-mainhide-window-activation-diagnostics
status: candidate
scope: project-pointer
fingerprint: mainHide-slot-route-applies-generic-hide-after-dispatch-or-runtime-hides-before-async-activation__fallback-concealed__failure-undiagnosable
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: promote only after a real uTools host run has a valid-slot zero-blocking result and a closed-target target-closed-only result
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - pointer
---

# `mainHide` 激活诊断（项目指针）

权威正文已迁入 CodeNote：

- [mainhide-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/mainhide-activation.md#L1)
- [utools-mainhide-activation-diagnostics.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-mainhide-activation-diagnostics.md#L1)

## EyPc 专属差异

- 应用于 Window Jump 槽位 `eypc-window-slot-1` … `eypc-window-slot-10`
- 任务证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- WJ-10 将详细操作追踪限制在 `import.meta.env.DEV === true`：用户授权的选定目标标题与固定阶段/结果码进入 Runtime 内存，真实安装既不请求原生 trace 也不显示追踪模块。应用名、PID、句柄、native reference、原始宿主输出仍不进入追踪；Windows 页面置顶与 macOS 不支持的边界仍走同一 blocking 诊断契约。
- WJ-12 在每次激活尝试前捕获只读环境快照（CG/AX 目标匹配数与 Space 绑定状态），显示在开发追踪侧栏，仅存于当前会话内存。快照不激活、不切换任何窗口或桌面，为 AiTools 与 Rider 的激活差异提供可复现证据。
- 状态仍为 `candidate`，直至真实 uTools 宿主验收：有效槽位零 blocking、已关闭目标仅 `target-closed`、开发追踪无原始数据且真实安装不显示追踪模块、环境快照行在重测中可见
