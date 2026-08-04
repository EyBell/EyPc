---
id: eypc-macos-ax-misses-other-spaces
status: verified
scope: project
fingerprint: partial-ax-window-inventory__absence-treated-as-closure__cg-offscreen-treated-as-minimized
first_seen: 2026-07-26
last_verified: 2026-08-04
review_after: 2027-01-28
evidence:
  - preload/index.js
  - preload/windows/macos-space.cjs
  - preload/windows/session-cache.cjs
  - public/preload.js
  - src/platform/eypcPlatform.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
  - tests/platform/eypcPlatform.test.ts
tags:
  - windows
  - macos
  - enumeration
  - activation
  - spaces
---

# macOS AX/CG Window Inventory Gaps Across Spaces

## Symptom

1. 一个 AX 清单只观察到当前 Space，却被当作完整清单替换，导致此前已证明的根/成员突然消失。
2. `kCGWindowIsOnscreen=false` 被错误解释为最小化或关闭。
3. 旧实现从 CG-only 记录制造产品行，随后 AX 无法证明其可操作身份或焦点。

## Wrong Assumption

AX 在任意时刻都能枚举所有 Space；CG onscreen 等于 `AXMinimized`；或者 CG 表面本身足以成为用户可管理窗口。

## Verified Root Cause

AX 可见范围可能受当前 Space、权限和宿主状态影响，因此一次缺席不天然证明关闭。Core Graphics 的 onscreen 只描述当前合成可见性，不能等同于 AX 最小化。反过来，CG 能看到的表面也可能是系统、helper 或不可操作层，不能单独创建产品行。

## Current Prevention Rule

- WJ-22 的 macOS AX 清单固定标记为 `partial`；任何清单缺席只把缓存记录标为 `temporarily-unobserved`。
- CG-only、系统、辅助和无可操作 AX 身份的表面仍不制造产品行；`kCGWindowIsOnscreen` 既不证明最小化，也不证明关闭。
- 清除持久原生引用前必须调用 `probeInstance()`。只有 owner 退出/不匹配，或 CG 与 SkyLight 权威定点查询都成功且确认实例不存在，才能返回 `verified-gone`；权限/API/拓扑不足返回 `indeterminate`。
- 每个 `PID+CGWindowID` 在 preload 会话内缓存自己的 `displayUuid+spaceId`；热路径只刷新托管显示器当前 Space，冷路径只解析目标，切换只作用于目标显示器。最终仍以精确 AX↔CG 根/成员和 `AXFocusedWindow` 回读为准。

## Evidence Boundary

- 当前开发证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 已验证：自动化覆盖 partial/indeterminate/gone、offscreen 非死亡、缓存与显示器隔离；2026-08-04 直接 macOS 原生烟测复现“当前投影缺席但实例 live”，并完成准确 Space/根激活及非目标显示器保持。
- 未验证：实际 uTools 重载后的十个全局槽位视觉路径、全屏 Space 变体和 Windows 宿主。
