---
id: eypc-chromium-placeholder-window-title-noise
status: candidate
scope: project
fingerprint: live-window-list-shows-title-window__chromium-edge-ax-or-hwnd-shell__raw-title-passthrough__eypc-window-jump
first_seen: 2026-07-26
last_verified: 2026-07-26
review_after: 2026-10-26
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

# Chromium Placeholder Titles And Host Shell Windows Must Be Filtered From Jump Lists

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

Filter jumpable live windows in domain (`filterJumpableLiveWindows`) after every list, and keep preload title denylists mirrored. Drop Chromium titles exactly `Window` and Win32 host/IME shells. Do not drop non-Chromium `Window`, title==appName, or AX/HWND pixel size alone — those mass-drop real windows on refresh.

## Alternative Route

- Status: `candidate`
- Preconditions: window jump list refresh on macOS/Windows with Chromium browsers present.
- Steps: apply domain filter + preload title guards (no size); reload uTools; verify list.
- Verification: domain unit contract; user-owned refresh in EyPc.
- Applicability boundary: live enumeration only; persisted favorites/slots with intentional locators remain visible even if live match is missing.
- Fallback: if a real Chromium shell uses title `Window`, user can still open via alias after explicit target create from a non-noise window.

## Occurrence History

| Date | Trigger | Recovery | Outcome |
| --- | --- | --- | --- |
| 2026-07-26 | Size thresholds + title==appName / global `Window` denylist caused refresh “丢失” | Removed size filter; narrowed title filter to Chromium exact `Window` + host/IME shells; prefer AXWindowNumber in macOS `nativeRef` | candidate; user validation pending |
