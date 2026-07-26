---
id: eypc-macos-ax-misses-other-spaces
status: candidate
scope: project
fingerprint: window-list-current-space-only__system-events-ax__miss-other-spaces-displays__cgwindowlist-required
first_seen: 2026-07-26
last_verified: 2026-07-26
review_after: 2026-10-26
evidence:
  - preload/index.js
  - public/preload.js
  - src/platform/eypcPlatform.ts
tags:
  - windows
  - macos
  - enumeration
  - spaces
  - screen-recording
---

# macOS System Events AX Lists Miss Other Spaces

## Symptom

Window Jump refresh only shows windows on the current Space/desktop even though other Spaces and displays have real app windows.

## Wrong Assumption

`System Events` `process.windows()` enumerates every desktop the user can switch to.

## Verified Root Cause

AX via System Events typically exposes windows on the active Space. Cross-Space/display inventory requires `CGWindowListCopyWindowInfo` with `kCGWindowListOptionAll`, which often needs Screen Recording permission for titles of other apps.

## Prevention Rule

List through CoreGraphics window list for inventory; keep AX for activate/close matched by window number. Surface Screen Recording denial in capability/reason and open both Screen Capture and Accessibility settings. Mirror preload changes in `public/preload.js`.

## Alternative Route

- Status: `candidate`
- Preconditions: macOS host with windows on another Space.
- Steps: grant Screen Recording; refresh Window Jump; confirm off-Space titles appear.
- Verification: user-owned refresh; compare Mission Control vs list.
- Applicability boundary: live enumeration only.
- Fallback: Accessibility-only hosts may still activate known refs but cannot guarantee full inventory.
