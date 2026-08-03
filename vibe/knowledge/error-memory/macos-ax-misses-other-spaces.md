---
id: eypc-macos-ax-misses-other-spaces
status: verified
scope: project
fingerprint: partial-ax-window-inventory__absence-treated-as-closure__cg-offscreen-treated-as-minimized
first_seen: 2026-07-26
last_verified: 2026-07-31
review_after: 2027-01-28
evidence:
  - preload/index.js
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

- WJ-21 从允许的普通应用 AX 窗口角色出发，要求 `_AXUIElementGetWindow` 返回正 CGWindowID 作为身份佐证，并以 `AXParent`/`AXTopLevelUIElement`/`AXWindow` 证明主子关系。
- CG-only、系统、辅助和无可操作 AX 身份的表面省略；`kCGWindowIsOnscreen` 单独既不证明最小化，也不证明关闭。
- 只有明确标记为完整的家族清单可以替换根/成员；部分清单必须合并并保留既有节点为缓存，不能清除持久绑定或确认 `target-closed`。
- 激活只走精确 AX↔CG 根/成员映射与最终 `AXFocusedWindow` 回读。当前代码不使用私有 Space 查找、缓存、切换、桌面遍历、标题/序号或 process-frontmost 回退。

## Evidence Boundary

- 当前开发证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 已验证：清单完整/部分语义、CG offscreen 非最小化、CG-only 不制造行、退役 Space 符号缺失。
- 未验证：真实 uTools 在多个普通/全屏 Space 上的当前 WJ-21 AX 准入、缓存保留与根/成员激活。
