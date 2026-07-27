---
id: eypc-macos-cg-ax-window-identity-mismatch
status: candidate
scope: project-pointer
fingerprint: macos-cgwindowid-treated-as-system-events-axwindownumber__activation-not-found-after-healthy-rescan__title-ordinal-bridge-required
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: promote only after the required real uTools valid-slot and closed-target acceptance runs pass
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

## EyPc 专属差异

WJ-09 keeps the `CGWindowID` as a session inventory reference only. [preload/index.js](../../../preload/index.js#L1) resolves activation by normalized AX title in the owning process, uses the fresh AX ordinal only for equal-title candidates, and passes the transient title through a bounded child environment. The Runtime continues to treat `activation-not-found` as blocking unless the required healthy rescan finds no matching live window.

The source and read-only aggregate/resolution probes are verified; real uTools activation remains the promotion gate.
