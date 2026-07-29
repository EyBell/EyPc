---
id: eypc-utools-macos-cross-api-window-title-mismatch
status: candidate
scope: project-pointer
fingerprint: macos-exact-cg-window-reported-title-changed__cgwindowname-compared-to-axtitle__same-source-cg-title-validation
first_seen: 2026-07-29
last_verified: 2026-07-29
review_after: promote after a real uTools preload reload verifies unchanged-target success and real same-source title-change guarding
evidence:
  - preload/index.js
  - public/preload.js
  - tests/platform/eypcPlatform.test.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - macos
  - window-activation
  - project-pointer
---

# macOS 跨 API 标题误判（项目指针）

跨项目权威记录：[utools-macos-cross-api-window-title-mismatch.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-cross-api-window-title-mismatch.md#L1)。

EyPc WJ-18 将标题变化判断限制为同一 PID/CG window ID 的保存/current `kCGWindowName` 比较；`AXTitle` 不再反证已精确映射的 CG 目标。不可读的 CG 标题只形成普通阻断，精确 `_AXUIElementGetWindow` 与 `AXFocusedWindow` 回读仍保留。真实 uTools reload/激活尚待用户验收。
