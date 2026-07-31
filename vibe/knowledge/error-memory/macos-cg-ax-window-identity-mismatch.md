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

WJ-20 keeps `darwin:PID:CGWindowID` as native evidence but makes the product identity the proven root family. [preload/index.js](../../../preload/index.js#L1) maps AX elements through `_AXUIElementGetWindow`, prefers `AXTopLevelUIElement` and then `AXWindow` to derive the root CG ID, and returns member/root observations to the Renderer. The single domain coalescer creates root-only `LiveWindow`; missing relation proof stays independent rather than falling through to title, ordinal, PID/app or list position.

Activation requires the requested PID/application/root CG identity, selects only an AX element whose root mapping equals it, and succeeds only when final `AXFocusedWindow` maps through the same root. Exact-root focus failure cannot fall through to a sibling. The previous isolated-Space route remains historical host evidence only: WJ-20 removes environment snapshots, Space lookup/cache/switch, title gates and AX ordinal fallback from the current bridge. See [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1) and archived title evidence [utools-macos-cross-api-window-title-mismatch.md](utools-macos-cross-api-window-title-mismatch.md#L1).

## Alternative Route

- Status: `verified`
- Preconditions: selected root has a positive CG ID, matching application identity and Accessibility authorization.
- Steps: enumerate raw application AX windows; map each through `_AXUIElementGetWindow` plus top-level/window attributes; select only the requested root family; restore/Raise/activate; map final `AXFocusedWindow` back to the requested root CG ID.
- Verification: WJ-20 source/contracts require `ax-cg-id-match → ax-focused-root-window`; real WJ-20 host execution remains pending.
- Applicability boundary: no actionable fallback exists when root mapping is unavailable; no Space switch is attempted by the current bridge.
- Fallback: return blocking `ambiguous`/`failed`/permission state and retain the selected target for visible recovery.
