---
id: eypc-windows-actions-close-vs-os-close
status: candidate
scope: project
fingerprint: windows.actions.close__panel-dismiss__vs__windows.close__os-window-close
first_seen: 2026-07-26
last_verified: 2026-07-26
review_after: 2026-10-26
evidence:
  - src/runtime/appRuntime.ts
  - src/runtime/keybinding/keybindingRuntime.ts
  - src/pages/WindowsPage.vue
tags:
  - windows
  - keybinding
  - naming
  - close
---

# `windows.actions.close` Is Not OS Window Close

## Symptom

Binding or dispatching a “close” action dismisses the Window Jump action panel instead of closing the OS window, or the reverse confusion when reading logs/action ids.

## Wrong Assumption

Any action id containing `close` under the windows feature closes the operating-system window.

## Verified Root Cause

EyPc separates UI chrome from OS effects:

- `windows.actions.close` closes the in-plugin action panel.
- `windows.close` / `windows.close.force` perform OS close / force terminate.

## Prevention Rule

Name panel dismissals `*.actions.close` (or `*.drawer.close`). Reserve `windows.close` / `windows.close.force` for OS window lifecycle. Document both in ARCHITECTURE and keybinding allowlists; never alias them.

## Alternative Route

- Status: `candidate`
- Preconditions: action panel open with a focused live window.
- Steps: Esc / panel close vs `Ctrl+Delete` OS close path.
- Verification: panel dismiss leaves OS window; OS close removes or prompts force kill.
- Applicability boundary: Window Jump keybinding and action registry only.
- Fallback: none — keep the two ids distinct.
