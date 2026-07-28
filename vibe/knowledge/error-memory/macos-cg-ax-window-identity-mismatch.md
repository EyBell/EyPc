---
id: eypc-macos-cg-ax-window-identity-mismatch
status: verified
scope: project-pointer
fingerprint: macos-cgwindowid-treated-as-system-events-axwindownumber__activation-not-found-after-healthy-rescan__title-ordinal-bridge-required
first_seen: 2026-07-27
last_verified: 2026-07-28
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

WJ-15 keeps the `CGWindowID` as a session inventory reference and never reads a System Events `AXWindowNumber`. [preload/index.js](../../../preload/index.js#L1) enumerates the owning application's raw AX elements and calls `_AXUIElementGetWindow`; one element whose returned CG ID equals the selected reference is required. That element is restored, installed as application focused/main window, raised and app-activated. Success requires `AXFocusedWindow` to map back to the same CG ID. Normalized AX title/fresh ordinal remains compatibility fallback only when the private mapping is unavailable; exact-match focus failure cannot fall through to a sibling window.

The isolated-Space plus exact-AX route has real uTools host success for an off-Space multi-window Chromium target. The separate closed-target and negative exact-focus acceptances remain release gates.

WJ-12 adds a read-only `inspectEnvironment` API that captures CG/AX target match counts and Space binding status before each activation attempt, without activating or switching anything. The snapshot is displayed in the development trace sidebar as `环境快照：CG匹配=N · AX匹配=N · Space绑定=...` and is session-only. This provides replayable evidence to explain why some targets (e.g. AiTools) fail activation while others (e.g. Rider) succeed, without guessing from live host tests. Host re-acceptance with the snapshot is pending.

WJ-13's title/ordinal route is retained as historical compatibility behavior. WJ-15 supersedes it whenever `_AXUIElementGetWindow` is available: a read-only probe resolved all four Chromium AX elements, uniquely matched the selected CG ID, and the real slot run verified the same element as `AXFocusedWindow`. See [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1). CodeNote's cross-project record is not rewritten in this task because its owner files are already dirty/untracked.

## Alternative Route

- Status: `verified`
- Preconditions: selected CG-backed macOS target is on the current/confirmed Space and Accessibility is authorized.
- Steps: enumerate raw application AX windows; map each through `_AXUIElementGetWindow`; require one selected-CG match; restore, set application/window main/focused attributes, Raise and activate; read `AXFocusedWindow` and map it back to the selected CG ID.
- Verification: all AX elements resolve IDs without error, exactly one matches, and the real global-slot operation returns `ax-focused-window` while Computer Use reports the selected window.
- Applicability boundary: title/fresh ordinal is fallback only when private mapping is unavailable; an exact mapping that cannot focus never falls through to a sibling.
- Fallback: return blocking `ambiguous`/`failed`/permission state and retain the selected target for visible recovery.
