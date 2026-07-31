---
id: eypc-macos-cg-ax-window-identity-mismatch
status: verified
scope: project-pointer
fingerprint: macos-cgwindowid-treated-as-system-events-axwindownumber__activation-not-found-after-healthy-rescan__exact-private-ax-map-required
first_seen: 2026-07-27
last_verified: 2026-07-31
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

WJ-21 keeps `darwin:PID:CGWindowID` as native identity evidence while the real root remains the stable product target. [preload/index.js](../../../preload/index.js#L1) starts from admitted AX windows, maps them through `_AXUIElementGetWindow`, and uses `AXParent`/`AXTopLevelUIElement`/`AXWindow` to derive root/member relationships. Core Graphics corroborates the AX identity but cannot create a row by itself; CG-only/system/helper/non-actionable surfaces are omitted. The domain creates `WindowFamily { root, children }`; title, ordinal, PID/app, position, size or list order never substitutes for relationship proof.

`root-current` requires the requested PID/application/root CG identity and succeeds only when final `AXFocusedWindow` maps through that root. `member-exact` additionally requires the requested member CG identity and exact final focus; it cannot fall through to the root or a sibling. The previous isolated-Space route remains historical host evidence only: the current bridge has no environment snapshot, Space lookup/cache/switch, title gate or AX ordinal fallback. See [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1) and archived title evidence [utools-macos-cross-api-window-title-mismatch.md](utools-macos-cross-api-window-title-mismatch.md#L1).

## Alternative Route

- Status: `verified`
- Preconditions: selected root/member has an admitted AX role, positive CG ID, matching application identity and Accessibility authorization.
- Steps: enumerate admitted application AX windows; map each through `_AXUIElementGetWindow` plus parent/top-level/window attributes; select only the requested root family or exact member; restore/Raise/activate; map final `AXFocusedWindow` back to the requested root/member CG ID.
- Verification: WJ-21 source/contracts require exact root/member readback; real WJ-21 host execution remains pending.
- Applicability boundary: no actionable fallback exists when root mapping is unavailable; no Space switch is attempted by the current bridge.
- Fallback: return blocking `ambiguous`/`failed`/permission state and retain the selected target for visible recovery.
