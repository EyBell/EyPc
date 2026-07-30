---
id: eypc-utools-macos-cross-api-window-title-mismatch
status: archived
scope: project-pointer
fingerprint: macos-exact-cg-window-reported-title-changed__cgwindowname-compared-to-axtitle__same-source-cg-title-validation
first_seen: 2026-07-29
last_verified: 2026-07-30
review_after: superseded by WJ-19 title-independent identity
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

# macOS 跨 API 标题误判（历史项目指针；WJ-19 已取代）

跨项目权威记录：[utools-macos-cross-api-window-title-mismatch.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-cross-api-window-title-mismatch.md#L1)。

WJ-18 曾将标题变化判断限制为同一 PID/CGWindowID 的 Core Graphics 同源比较。WJ-19 进一步移除全部标题身份门禁：PID/application + CGWindowID、精确 `_AXUIElementGetWindow` 和最终 `AXFocusedWindow` 回读是唯一现行激活身份链；标题仅用于展示、搜索和人工辨认。本文只保留问题来源，不再作为当前预防规则。
