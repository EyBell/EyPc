---
id: eypc-utools-macos-ax-activation-misses-other-spaces
status: superseded
scope: project-pointer
fingerprint: cg-inventory-finds-window__system-events-ax-target-not-found__activation-not-found-after-healthy-rescan__cgs-space-switch-before-axraise
first_seen: 2026-07-27
last_verified: 2026-07-31
review_after: 2027-01-28
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - macos
  - pointer
---

# macOS 跨 Space 激活（历史项目指针）

跨项目历史研究：

- [macos-window-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1)
- [utools-macos-ax-activation-misses-other-spaces.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1)

## EyPc 当前边界

WJ-11–WJ-19 曾探索 SkyLight/managed-Space 查找、缓存、切换、隔离 JXA 和环境快照，并在 WJ-15 对一个 AiTools 目标获得过历史宿主成功。这些证据只能解释旧路线，不能验证当前桥。

WJ-21 已移除上述全部实现。当前 EyPc 只接纳可操作 AX 窗口，使用正 CGWindowID 佐证身份，并通过 AX top-level/window 关系与最终 `AXFocusedWindow` 验证根或精确成员；CG-only 表面不生成产品行。无法完成该链路时明确阻断，不切 Space、不遍历桌面、不按标题或序号回退。

- 当前任务证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 状态：`superseded`
- 回流门禁：源码不得重新出现私有 Space lookup/cache/switch、environment snapshot、desktop walk 或标题/序号身份路径。
