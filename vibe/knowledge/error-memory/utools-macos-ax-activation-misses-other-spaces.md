---
id: eypc-utools-macos-ax-activation-misses-other-spaces
status: verified
scope: project-pointer
fingerprint: cg-inventory-finds-window__system-events-ax-target-not-found__activation-not-found-after-healthy-rescan__cgs-space-switch-before-axraise
first_seen: 2026-07-27
last_verified: 2026-08-04
review_after: 2027-01-28
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - macos
  - pointer
---

# macOS 跨 Space 精确激活（WJ-22 项目指针）

跨项目历史研究：

- [macos-window-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1)
- [utools-macos-ax-activation-misses-other-spaces.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1)

## EyPc 当前边界

WJ-21 移除 Space 路线后产生了回归：当前 Space 的 AX 投影被错误当成死亡证据，且槽位无法恢复其他 Space 的精确根。

WJ-22 恢复的是受控、目标级 Space 通路，而不是旧环境快照或全桌面猜测：缓存键为 `PID+CGWindowID`，直接查询与反向查询必须去重，热路径只刷新 `currentByDisplay`，冷路径只解析目标，切换只作用于目标显示器。目标关系和最终焦点仍由 AX↔CG 精确验证；标题、序号、应用前台或唯一候选均不参与。

- 当前任务证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 状态：`verified`（自动化 + 直接 macOS 多显示器/多 Space 原生烟测；实际 uTools 重载仍待验收）
- 回流门禁：不得恢复持久 Space 快照、后台桌面遍历、应用级缓存、标题/序号身份或非目标显示器切换。
