---
id: eypc-macos-cgwindowlist-cf-proxy-not-js-array
status: verified
scope: project
fingerprint: cgwindowlist-nonempty-cf-proxy__direct-deepunwrap-not-js-array__cast-ref-before-unwrapping
first_seen: 2026-07-26
last_verified: 2026-07-31
review_after: 2027-01-28
evidence:
  - preload/index.js
  - public/preload.js
  - tests/platform/eypcPlatform.test.ts
tags:
  - windows
  - macos
  - coregraphics
  - jxa
  - enumeration
---

# CGWindowList CoreFoundation Proxy Is Not a JavaScript Array

## Failure

JXA 的 `CGWindowListCopyWindowInfo` 返回 CoreFoundation/Objective-C proxy。直接 `ObjC.deepUnwrap` 可能保留 proxy 形状，导致 `Array.isArray` 为 false，并把实际非空的 CG 结果误成空数组。

## Current Prevention Rule

所有当前 CG 查询——无论用于 AX-first 清单的身份佐证还是操作时复验——都先执行：

`ObjC.deepUnwrap(ObjC.castRefToObject(value))`

随后才校验数组与正窗口编号。WJ-21 不允许 CG 记录单独创建产品行：产品准入先来自允许的普通应用 AX 窗口角色，CG 只佐证身份。CG 查询失败或为空时，不得伪造“桌面无窗口”、最小化或关闭结论；该观察不能证明完整清单，且无正 CG 佐证的 AX 表面不进入当前产品行。

- canonical/public preload 必须字节一致。
- 聚合诊断不得记录标题、应用名、PID 或 native reference。
- 旧“CG 主清单失败后用 AX 兜底并仍制造产品行”的表述已被 WJ-21 清退。

## Evidence Boundary

- 2026-07-26 的只读实验验证 cast-before-deepUnwrap 能把非空 proxy 转为真实数组；该实验不验证当前 WJ-21 产品准入。
- 当前源码在 AX-first 清单和操作时 CG 复验中都保留 cast-before-deepUnwrap。
- 真实 uTools 多 Space/权限组合仍由宿主验收。
