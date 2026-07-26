---
id: eypc-utools-escape-capture-over-quick-jump
status: candidate
scope: project
fingerprint: utools-esc-exits-plugin__quick-jump-or-transient-layer-open__window-bubble-keydown__missing-capture-preventdefault
first_seen: 2026-07-26
last_verified: 2026-07-26
review_after: 2026-10-26
evidence:
  - src/App.vue
  - src/FloatApp.vue
  - src/runtime/keyboardEvent.ts
  - tests/ui/quickJump.test.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - escape
  - quick-jump
  - keydown-capture
  - host-shortcut
---

# uTools Escape Must Be Owned In Window Capture Over Transient Layers

## Symptom

With `F` Quick Jump open (optionally above a right-click drawer and multi-select), one `Escape` dismisses the whole plugin session instead of popping only the Quick Jump layer. After Quick Jump should close, later Escapes never reach drawer → selection recovery because the host already exited.

## Wrong Assumption

Treating renderer `window` bubble-phase `keydown` plus a late `preventDefault()` as sufficient to cancel uTools' documented Esc-exits-plugin behavior. Also assuming Quick Jump query/overlay layering alone fixes host exit.

## Verified Root Cause

uTools treats Esc as a host exit/back shortcut. A bubble-phase App listener can run after host/document capture work. Transient layers (Quick Jump, drawers, multi-select) must own plain `Escape` on `window` **capture**, call `preventDefault` / `stopPropagation` / `stopImmediatePropagation` **before** mutating UI, and pop exactly one layer per key. Outward exit remains `Shift+Escape` (`app.hide`) or an empty recovery stack that intentionally leaves Esc unhandled.

## Evidence

- Capture registration and early Quick Jump Escape ownership: [App.vue](../../../src/App.vue#L1), [FloatApp.vue](../../../src/FloatApp.vue#L1).
- Shared block helper: [keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1).
- Contract assertions: [quickJump.test.ts](../../../tests/ui/quickJump.test.ts#L1).
- User report on F-layer Esc exiting the plugin while drawer/multi-select should remain recoverable.

## Correct Detection Order

1. Open a drawer and multi-select, then press `F` so markers overlay that stack.
2. Press `Escape` once: only query clear or Quick Jump close; plugin stays visible.
3. Press `Escape` again: close right-click/actions drawer only.
4. Press `Escape` again: clear multi-select only.
5. Confirm `Shift+Escape` still hides via `app.hide`.

## Prevention Rule

For any EyPc transient keyboard layer that must survive uTools Esc, register `window` keydown with `capture: true`, block the event synchronously before UI mutation, and keep one-layer LIFO recovery. Never rely on bubble-only listeners for Esc ownership.

## Alternative Route

- Preconditions: Quick Jump or another Esc-owned layer is open inside the main plugin window.
- Steps: capture-phase `keydown` → `blockHandledShortcutEvent` → pop one layer → return.
- Verification: plugin remains open until the recovery stack is empty or `Shift+Escape` is used.
- Applicability boundary: does not disable host Esc when the stack is intentionally empty; does not add private host IPC.
- Fallback: if a future uTools version ignores renderer preventDefault, document the host gap and keep Shift+Escape as the explicit exit.
- Status: `candidate` until user-owned uTools acceptance of the F-layer Esc path.
