---
id: eypc-macos-cg-ax-window-identity-mismatch
status: verified
scope: project-pointer
fingerprint: macos-cgwindowid-treated-as-system-events-axwindownumber__activation-not-found-after-healthy-rescan__exact-private-ax-map-required
first_seen: 2026-07-27
last_verified: 2026-08-04
review_after: 2027-01-28
evidence:
  - preload/index.js
  - public/preload.js
  - tests/platform/eypcPlatform.test.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - macos
  - windows
  - activation
  - project-pointer
---

# macOS CG / AX Window Identity Mismatch（项目指针）

权威的跨项目预防记录：

- [utools-macos-cg-ax-window-identity-mismatch.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-cg-ax-window-identity-mismatch.md#L1)
- 跨 Space 激活补充：[utools-macos-ax-activation-misses-other-spaces.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1) · [macos-window-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1)

## EyPc 专属差异

WJ-22 keeps `darwin:PID:CGWindowID` as native identity while the real root remains the stable product target. [macos.cjs](../../../preload/windows/macos.cjs#L1) starts from admitted AX windows and proves root/member relations through `_AXUIElementGetWindow` plus AX parent/top-level/window attributes; [preload/index.js](../../../preload/index.js#L1) only loads and mounts the isolated window module. CG-only/system/helper/non-actionable surfaces remain omitted; title, Tab, Space, display, ordinal, position, size and list order never substitute for identity or relation proof.

`root-current` and `member-exact` retain the same exact final-focus contract. WJ-22 may first use a session-only per-instance Space binding to switch the target display; that binding is routing state, never identity, and failure cannot fall through to another root/member. There is still no environment snapshot, title gate or AX ordinal fallback. See [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1).

## Alternative Route

- Status: `verified`
- Preconditions: selected root/member has an admitted AX role, positive CG ID, matching application identity and Accessibility authorization.
- Steps: enumerate admitted application AX windows; map each through `_AXUIElementGetWindow` plus parent/top-level/window attributes; select only the requested root family or exact member; restore/Raise/activate; map final `AXFocusedWindow` back to the requested root/member CG ID.
- Verification: WJ-22 automated contracts and direct macOS host smoke return the requested root IDs and exact final focus across Space/display switching.
- Applicability boundary: Space switching is allowed only after a unique target binding; ambiguous/unavailable mappings fail closed and preserve the logical target.
- Fallback: return blocking `ambiguous`/`failed`/permission state and retain the selected target for visible recovery.
