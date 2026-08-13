---
id: eypc-utools-mainhide-window-activation-diagnostics
status: candidate
scope: project-pointer
fingerprint: mainHide-slot-route-applies-generic-hide-after-dispatch-or-runtime-hides-before-async-activation__fallback-concealed__failure-undiagnosable
first_seen: 2026-07-27
last_verified: 2026-08-03
review_after: 2026-09-13
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - pointer
---

# `mainHide` 激活诊断（项目指针）

跨项目权威：

- [mainhide-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/mainhide-activation.md#L1)
- [utools-mainhide-activation-diagnostics.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-mainhide-activation-diagnostics.md#L1)

## EyPc 当前差异

- 适用于 Window Jump 槽位 `eypc-window-slot-1` … `eypc-window-slot-10`；任务证据见 [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)。
- `mainHide` 是唯一宿主隐藏入口。Runtime 只在窗口激活成功后保持静默；失败必须打开工作台并展示会话级、脱敏的 blocking 诊断。
- 开发追踪只在 `import.meta.env.DEV === true` 存在，使用有界固定阶段/结果码；真实安装不请求也不渲染追踪模块。应用名、PID、句柄、native ref 和原始宿主输出不得进入追踪。
- WJ-22 仍不采集环境快照。内部 Space 路由只在开发追踪中发布有限 stage/detail 枚举，不包含显示器/Space ID、标题、PID、句柄、命令或原始错误；production 默认不请求追踪。宿主验收看目标显示器切换、非目标显示器保持、根/成员最终焦点、关闭证明和 production trace 缺失。
- RAW-139 将同一通用合同应用到 Codex task 入口：`mainHide` 独占可见性，Renderer 不二次 hide/show；停用后空库存先做 tasks-only preflight，旧卡片 alias 只按同一匿名 task key 重建。任务证据见 [Codex verify](../../specs/260718/1148-codex-quota-float/verify.md#L1)。
- RAW-140 补充成功后的状态所有权：普通 `onPluginOut(false)` 可关闭 Codex 连接，但不得随 Bridge 一起删除刚确认的同一 completion 已读事实；该最小提示由 preload 进程持有，并在新 Turn/明确移除时失效。
