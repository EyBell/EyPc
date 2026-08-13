---
id: eypc-chromium-placeholder-window-title-noise
status: superseded
scope: project
fingerprint: live-window-list-shows-title-window__title-denylist-used-as-window-admission
first_seen: 2026-07-26
last_verified: 2026-08-13
review_after: 2027-08-13
evidence:
  - src/domain/windows.ts
  - src/runtime/appRuntime.ts
  - preload/index.js
  - public/preload.js
  - tests/domain/windows.test.ts
tags:
  - windows
  - edge
  - chromium
  - enumeration-noise
  - macos
---

# Chromium Placeholder Title Filtering (Historical)

## Historical Failure

Chromium、IME、宿主和 helper 表面曾以空标题、应用名或字面量 `Window` 进入列表。按标题 denylist 或尺寸过滤又会误删真实窗口，并在浏览器 Tab/标题变化后破坏持久目标。

## Current Prevention Rule

标题只用于展示、搜索和人工辨认，不能准入、拒绝、去重、证明关系或恢复身份。WJ-21 由平台原生证据准入：

- Windows 要求可见、非 cloaked、可激活且有有效范围的顶层/owned popup，并以同应用 `GA_ROOTOWNER` 证明关系；过滤控件、no-activate、透明、宿主、系统/helper 表面。
- macOS 要求允许的普通应用 AX 窗口角色、正 CGWindowID 身份佐证和可证明 AX 根关系；CG-only/system/helper 表面省略。
- 无标题的已准入窗口可用应用名作为显示回退；标题为 `Window` 本身既不准入也不拒绝。

- 状态：`superseded-by-WJ-19/WJ-21`；仅保留为逻辑归档与回流门禁。
- 回流门禁：不得恢复标题 denylist、尺寸阈值、标题身份或唯一候选规则。
- 宿主验收：企业微信/Chromium 不出现系统/helper 洪泛，同时真实独立根与已证明子窗保留。
