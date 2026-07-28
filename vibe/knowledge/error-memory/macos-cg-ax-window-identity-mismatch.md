---
id: eypc-macos-cg-ax-window-identity-mismatch
status: verified
scope: project-pointer
fingerprint: macos-cgwindowid-treated-as-system-events-axwindownumber__activation-not-found-after-healthy-rescan__title-ordinal-bridge-required
first_seen: 2026-07-27
last_verified: 2026-07-27
review_after: retain the separate real closed-target acceptance as a Window Jump release gate
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

WJ-09 keeps the `CGWindowID` as a session inventory reference only. [preload/index.js](../../../preload/index.js#L1) resolves activation by normalized AX title in the owning process, uses the fresh AX ordinal only for equal-title candidates, and passes the transient title through a bounded child environment. Before that AX path, `trySwitchMacosSpaceByCGS` may switch to the Space that owns the CG window via SkyLight/`koffi`. If that binding returns `empty-spaces`, the selected owning process receives one bounded Accessibility `frontmost` retry before the same AX-title resolution is retried. The Runtime continues to treat `activation-not-found` as blocking unless the required healthy rescan finds no matching live window.

The `empty-spaces` recovery has user-confirmed real macOS host success. The separate closed-target acceptance remains a Window Jump release gate.

WJ-12 adds a read-only `inspectEnvironment` API that captures CG/AX target match counts and Space binding status before each activation attempt, without activating or switching anything. The snapshot is displayed in the development trace sidebar as `环境快照：CG匹配=N · AX匹配=N · Space绑定=...` and is session-only. This provides replayable evidence to explain why some targets (e.g. AiTools) fail activation while others (e.g. Rider) succeed, without guessing from live host tests. Host re-acceptance with the snapshot is pending.

WJ-13 addresses two real-host failure modes revealed by the env snapshot: (1) `SLSCopySpacesForWindows` returns 0 bindings for certain multi-window processes even when all windows are on the current Space — when `axWindowCount === ownerCgWindowCount`, the code now infers `current-space-inferred` and proceeds to activation without a Space switch; (2) AX title mismatch (`axTargetMatches=0`) when the CG title differs from the AX title — the activation script now resolves the CG ordinal from `CGWindowListCopyWindowInfo` and uses it as a fallback (`cg-ordinal-fallback`) to identify the correct AX window. Host re-acceptance pending.
