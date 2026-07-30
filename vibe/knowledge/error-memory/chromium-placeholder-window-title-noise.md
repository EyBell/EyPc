---
id: eypc-chromium-placeholder-window-title-noise
status: archived
scope: project
fingerprint: live-window-list-shows-title-window__chromium-edge-ax-or-hwnd-shell__raw-title-passthrough__eypc-window-jump
first_seen: 2026-07-26
last_verified: 2026-07-30
review_after: superseded by WJ-19 native-instance identity
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

# Chromium Placeholder Title Filtering (Historical; Superseded by WJ-19)

> WJ-19 makes title display/search metadata only. This record preserves the earlier symptom and tradeoff, but its title-denylist prevention rule is no longer current authority.

## Symptom

Microsoft Edge (and similar Chromium apps) contribute live rows titled exactly `Window` that are not Mission Control / taskbar document windows. Users see more “实时窗口” than the pages they opened and may try to favorite or bind slots to unusable shells.

## Wrong Assumption

Any non-empty native title from System Events / EnumWindows is a user-facing jump target. Empty-title filtering alone is enough.

## Verified Root Cause

Edge exposes unnamed AX/HWND shells whose title is the placeholder `Window`. Win32 also surfaces IME/`Program Manager`/GDI chrome. EyPc previously passed titles through after only empty-title and tool-window checks.

## Evidence

- User screenshot of two Edge `Window` rows beside real Feishu/Edge document titles.
- Domain filter: [windows.ts](../../../src/domain/windows.ts#L1); Runtime apply: [appRuntime.ts](../../../src/runtime/appRuntime.ts#L1).
- Native size/title guards: [preload/index.js](../../../preload/index.js#L1) mirrored in [public/preload.js](../../../public/preload.js#L1) (title denylist only; size thresholds removed after they dropped real windows).
- Contract: [windows.test.ts](../../../tests/domain/windows.test.ts#L1).

## Correct Detection Order

1. Refresh the windows Tab with Edge open and note any title-only `Window` rows.
2. Confirm real document titles remain and ordinary desktop windows are not mass-dropped.
3. On Windows, confirm IME/`Program Manager` shells stay absent.

## Prevention Rule

Do not use title content to admit, reject, match or recover a native window. Native platform actionability plus required `WindowInstanceId` owns list membership and deduplication; an empty native title falls back to the application name for display. This prevents a browser Tab/title change—including `Window` or an empty title—from invalidating a saved instance. Any future helper-window suppression must use non-title native actionability evidence.

## Alternative Route

- Status: `archived / superseded-by-WJ-19`
- Preconditions: window jump list refresh on macOS/Windows with Chromium browsers present.
- Steps: retain native actionability checks, require stable instance identity, and use application-name display fallback when title is absent.
- Verification: unexecuted WJ-19 domain/platform contracts; user-owned refresh in EyPc.
- Applicability boundary: live enumeration only; persisted favorites/slots with intentional locators remain visible even if live match is missing.
- Fallback: if a real Chromium shell uses title `Window`, user can still open via alias after explicit target create from a non-noise window.

## Occurrence History

| Date | Trigger | Recovery | Outcome |
| --- | --- | --- | --- |
| 2026-07-26/27 | Size thresholds + title==appName / global `Window` denylist caused refresh “丢失”; macOS bridge later treated CG IDs as `AXWindowNumber` | Removed size filter; narrowed title filter to Chromium exact `Window` + host/IME shells; keep CG IDs inventory-only and resolve AX activation by title/ordinal | historical candidate; later superseded |
| 2026-07-30 | WJ-19 requires title-independent lifecycle identity | Removed title-content list filters; native actionability + `WindowInstanceId` are authoritative and empty titles use app-name display fallback | source/contracts updated; runtime acceptance pending |
