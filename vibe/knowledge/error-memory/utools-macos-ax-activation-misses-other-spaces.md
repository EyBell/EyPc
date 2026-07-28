---
id: eypc-utools-macos-ax-activation-misses-other-spaces
status: verified
scope: project-pointer
fingerprint: cg-inventory-finds-window__system-events-ax-target-not-found__activation-not-found-after-healthy-rescan__cgs-space-switch-before-axraise
first_seen: 2026-07-27
last_verified: 2026-07-28
review_after: 2027-01-28
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - macos
  - pointer
---

# macOS 跨 Space 激活（项目指针）

权威正文已迁入 CodeNote：

- [macos-window-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1)
- [utools-macos-ax-activation-misses-other-spaces.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1)

## EyPc 专属差异

- 实现：[preload/index.js](../../../preload/index.js#L1) / [public/preload.js](../../../public/preload.js#L1) 先尝试 preload 内 `koffi`，空绑定时改用隔离 JXA 复跑相同 direct+reverse SkyLight 解析并确认唯一切换；`scripts/prepare-utools-runtime.mjs` 保持运行时镜像与依赖同步。
- 任务证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 用户复现：槽 1、小米显示器、桌面 5；当前桌面可开、跨桌面 `activation-not-found`
- 2026-07-27 验收对照：同桌面成功；跨桌面全局槽 1 稳定 `space=failed:empty-spaces`（非 `no-api`）→ `activation-not-found`
- 2026-07-27 源码修复：mask `0x7` + managed-display 反查；待宿主跨桌面槽复验 `space=ok:switched`
- 2026-07-27 宿主复验进到 `no-display`；再修为优先用 managed `Display Identifier` 调用 `SLSManagedDisplaySetCurrentSpace`
- 2026-07-27 改为会话缓存 `CGWindowNumber→{spaceId,displayUuid}`（plist + 枚举预热）；同桌面 AX 不变，跨桌面先切再 AX
- 2026-07-27 缓存改为全量：`CGWindowList(OptionAll)` + 清单，经 `SLSCopySpacesForWindows` 绑定全部显示器/桌面；刷新整表重建
- 2026-07-27 回归：`dist/preload.js` 未同步仍走 `SLSCopyManagedDisplayForSpace` → 同屏也 `no-display`；已 prepare 同步。源码：Spaces-only 解析、`current` 跳过、激活未命中反查 tags；勿再依赖 `SLSCopyManagedDisplayForSpace`
- 2026-07-27 可见桌面可开、隐藏桌面 `empty-spaces`：缓存改为 managed CFDictionary + 每 Space `SLSCopyWindowsWithOptionsAndTags` 正向绑定（含非当前桌面）；`SLSCopySpacesForWindows` 仅补清单漏项
- 2026-07-27 绑定仍空时：AX `not-found` 后遍历非当前 managed Space 切换并重试 AX（`walked`），失败则恢复原 Current Space
- 2026-07-27 继续 SIP 路线优化：仅 AX 成功后写入学习缓存；切桌面后仍 not-found 则 forget 再 walk（跳过已试 Space）；settle 120ms
- 2026-07-28 WJ-15 真实宿主：AiTools 位于非当前 Space，全局槽 2 通过 `isolated-space-bridge → switch-confirmed → ax-cg-id-match → ax-focused-window` 完成，目标 Space、Edge 前台和精确 AX 焦点均经只读回查确认；Codex 悬浮球已恢复。
- CodeNote 正文当前包含任务外未提交/未跟踪内容，本轮按安全门禁未覆盖；最新 EyPc 证据以 [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1) 为准，待该权威工作树由其 owner 合并。

## Alternative Route

- Status: `verified`
- Preconditions: macOS Screen Recording + Accessibility; selected target has an exact CG reference; private SkyLight/AX symbols are available.
- Steps: revalidate target → in-process direct+reverse Space lookup → on empty result repeat in isolated JXA → switch/confirm one binding → map raw AX elements with `_AXUIElementGetWindow` → focus/Raise exact match → read back exact `AXFocusedWindow`.
- Verification: a non-current-Space multi-window Chromium target completes `switch-confirmed → ax-cg-id-match → ax-focused-window`, and an independent read confirms target Space/current app/exact AX focus.
- Applicability boundary: no desktop walk, learned binding, simulated input, permanent topmost, permission mutation, arbitrary sibling focus, or multi-window process-frontmost.
- Fallback: ambiguity, no binding, switch timeout, unavailable permission, or exact-focus mismatch remains blocking and opens the visible workbench path.
