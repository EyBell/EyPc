---
id: eypc-window-jump-spoken-as-inserted-window
status: verified
scope: project
fingerprint: user-says-inserted-window-or-plugin-window-needs-manual-refresh-after-restart__means-window-jump-tab-list-not-codex-float
first_seen: 2026-09-05
last_verified: 2026-09-05
review_after: 2027-03-05
evidence:
  - vibe/specs/260905/window-tab-auto-refresh/raw-requirement.md
  - src/pages/WindowsPage.vue
  - src/runtime/feature/windows/actions.ts
tags:
  - windows
  - routing
  - user-correction
---

# 「插窗口」是窗口跳转 Tab，不是悬浮球

## Symptom

用户说「这个插窗口加载的内容每次重新启动之后还需要手动去刷新」。实现者按 `createBrowserWindow` 悬浮球去改生命周期，真机重载后用户纠正：指的是 **窗口跳转** 功能 Tab。

## Wrong Assumption

EyPc 口语「插窗口」= 独立 BrowserWindow / 悬浮球。

## Verified Root Cause

窗口跳转页有「加载 / 刷新」按钮，会话清单默认不加载；重启后必须手动点一次。用户把这个工作台叫插窗口。悬浮球没有同名按钮。

## Correct Detection Order

1. 有「加载/刷新」和 `Ctrl+R` 的是窗口跳转 Tab。
2. 桌面水球/卡片才是 Codex Float。
3. 不要先改 Float 生命周期。

## Prevention Rule

听到「插窗口」「这个窗口加载的内容」「手动刷新」时，先问或先核窗口跳转 Tab 的 `windowListLoaded` / `windows.refresh`，再考虑 Float。

## Alternative Route

- Status: `verified`
- Preconditions: 用户要求重启后窗口列表自动有内容。
- Ordered steps: `ensureWindowsInventory` 在进 Tab / 插件挂载且功能开启时扫一次。
- Verification: focused action + featureModule tests。
- Applicability boundary: 不覆盖悬浮球。
- Fallback: `Ctrl+R` 仍可立即再扫。
