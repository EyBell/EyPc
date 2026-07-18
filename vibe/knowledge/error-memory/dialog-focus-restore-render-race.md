---
id: eypc-dialog-focus-restore-render-race
status: verified
scope: project
fingerprint: overlay-focus-falls-to-body__trigger-unmounted-or-target-transition-hidden__single-nexttick-focus__eypc-vue-focus-handoff
first_seen: 2026-07-11
last_verified: 2026-07-13
review_after: 2026-10-13
evidence:
  - src/components/ConfirmLayer.vue
  - src/App.vue
  - src/pages/FavoritesPage.vue
  - src/pages/QuickFavoritesPage.vue
  - src/styles/app.css
  - tests/ui/favoritesBehavior.test.ts
tags:
  - vue
  - accessibility
  - focus-restoration
  - render-timing
  - responsive-side-layer
---

# Overlay Focus Handoff Must Wait For A Stable Visible Target

## Symptom

Confirming “移出收藏” can remove the focused row button; opening the 420px container layer can replace its trigger; switching an already-open Favorites/Quick Favorites panel from left detail to right actions unmounts the focused side while the shared `open` flag remains true. Focus can fall to `body` even though a component test with a permanently rendered target passes.

## Wrong Assumption

One Vue `nextTick` plus an `isConnected` check was treated as sufficient. A comma-separated `querySelectorAll` was also assumed to preserve selector priority, even though it returns matches in DOM order. Together these miss adjacent render phases, CSS visibility transitions and active-pane priority.

## Verified Root Cause

Dialog close and the confirmed Runtime mutation render in adjacent phases. The responsive side layer also used a delayed visibility transition during opening. A fallback query can therefore run before a stable pane is available, calling `focus()` on a `visibility: hidden` element does not establish document focus, and one comma query can select an earlier DOM node from the wrong Runtime pane. Separately, watching only `panel.open` misses side or frozen-target replacement while the panel remains open, so the newly rendered side never receives focus.

## Evidence

- Bounded visible fallback and next-frame retry: [ConfirmLayer.vue](../../../src/components/ConfirmLayer.vue#L1).
- Favorites fallback ordering: [App.vue](../../../src/App.vue#L1).
- Pane focus handoff and immediate-open/delayed-close visibility: [FavoritesPage.vue](../../../src/pages/FavoritesPage.vue#L1), [QuickFavoritesPage.vue](../../../src/pages/QuickFavoritesPage.vue#L1), [app.css](../../../src/styles/app.css#L1).
- Disconnected and delayed-fallback regressions: [favoritesBehavior.test.ts](../../../tests/ui/favoritesBehavior.test.ts#L1).
- Live browser closure: [verify.md](../../specs/260711/1452-file-favorites-workbench/verify.md#L1).

## Correct Detection Order

1. Exercise the real confirmation or responsive-layer path whose action removes its trigger or changes target visibility.
2. Check `document.activeElement` after the confirmed mutation, not only after cancel.
3. When switching sides, verify the watcher observes panel kind/side and frozen target, not only `open`.
4. Verify fallback candidates are rendered and not `display: none` or `visibility: hidden`.
5. If the first render phase still owns `body`, retry only for a bounded number of animation frames.

## Prevention Rule

Focus handoff whose trigger may disappear must use an ordered selector array resolved one selector at a time. Opening transitions must make the destination visible immediately; closing may delay hiding. A side-switch watcher must include open, panel side/kind and frozen target identity. Restoration must ignore hidden candidates, verify that focus actually left `body`, and keep a bounded next-frame retry where adjacent renders remain possible.

## Latest Applicable Implementation

[ConfirmLayer.vue](../../../src/components/ConfirmLayer.vue#L1) owns the generic restore algorithm; [App.vue](../../../src/App.vue#L1) supplies the favorites pane and stable “添加” fallback order; [app.css](../../../src/styles/app.css#L1) makes the narrow side layer visible immediately on open.

## Alternative Route

- Status: `verified`.
- Preconditions: the confirmed action can unmount its trigger or replace the surrounding list.
- Steps: capture the original trigger, resolve each fallback selector in declared order after render, focus the first visible candidate, and retry for at most four animation frames while focus remains on `body`.
- Verification: delayed-fallback component regression, full test/build gates, and 420px real-browser confirmation all pass.
- Applicability boundary: EyPc Vue dialogs, side layers and overlays with a disappearing trigger or visibility transition; persistent visible triggers keep direct restoration.
- Fallback: focus a stable top-level command such as the favorites “添加” button rather than a hidden side layer.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11 | File favorites workbench optimization | Confirm metadata removal at 420px | Single `nextTick` restored to a transient/hidden pane | Component and live-browser checks | Visible ordered fallback plus bounded frame retry | verified |
| 2026-07-11 | File favorites workbench optimization | Open container side layer at 420px | Focus tree while its visibility transition still held `hidden` | Final four-viewport browser replay | Immediate visibility on open; delayed hiding only on close | verified |
| 2026-07-11 | File favorites workbench closeout | Desktop removal fallback priority | Comma query returned containers before the declared items/add targets | Closeout Reviewer and multi-candidate regression | Selector array resolved in declared order | verified |
| 2026-07-13 | Cross-tab responsive command panels | `Ctrl+Left → Ctrl+Right` while Favorites/Quick panel stays open | Watch only the shared `open` boolean | Closeout review plus component/browser focus checks | Watch open + side + target and focus the newly rendered panel | verified |
