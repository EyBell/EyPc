---
id: eypc-modified-arrow-handler-command-conflict
status: verified
scope: project
fingerprint: ctrl-arrow-panel-does-nothing__row-or-panel-local-handler-owns-event__vue-arrow-listener-without-exact-or-row-only-target-check__eypc-command-panels
first_seen: 2026-07-13
last_verified: 2026-07-13
review_after: 2026-10-13
evidence:
  - src/pages/MqttPage.vue
  - src/pages/SettingsPage.vue
  - tests/ui/mqttPage.test.ts
  - tests/ui/settingsContextPanel.test.ts
tags:
  - keyboard
  - event-propagation
  - command-panel
  - vue
---

# Modified Arrow Commands Must Survive Local Row And Panel Handlers

## Symptom

`Ctrl/Cmd+ArrowLeft` and `Ctrl/Cmd+ArrowRight` resolve correctly in Runtime tests but do nothing in the actual page. MQTT connection rows keep focus without opening a panel; Settings opens detail from a command row but cannot switch to actions while focus is inside the detail panel.

## Wrong Assumption

Vue's `.left` / `.right` key modifiers were treated as plain-arrow-only, and a Settings handler was limited to targets whose DOM ancestors still included the originating command row.

## Verified Root Cause

`@keydown.left.prevent.stop` and `.right` also match modified arrows, so the MQTT row stopped the event before global Runtime handling. Settings moved focus into a detached side panel, then its row-ancestry guard rejected the opposite command even though selected command state and the original trigger remained valid.

## Evidence

- Exact plain-arrow ownership and connection row behavior: [MqttPage.vue](../../../src/pages/MqttPage.vue#L1).
- Row/open-panel command switching: [SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1).
- Static modifier regression: [mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L1).
- Component side-switch regression: [settingsContextPanel.test.ts](../../../tests/ui/settingsContextPanel.test.ts#L1).
- Short-height real-browser closure: [verify.md](../../specs/260713/0834-cross-tab-responsive-command-panels/verify.md#L1).

## Correct Detection Order

1. Confirm keybinding/runtime resolution for the modified chord.
2. Replay the chord from the actual focused row and inspect `event.defaultPrevented` / propagation ownership.
3. Repeat after focus moves into the opened panel.
4. Verify plain unmodified arrows still retain their local tree behavior.
5. Close the panel and confirm trigger/list focus restoration.

## Prevention Rule

Local handlers for plain arrows must use `.exact` or an explicit no-modifier guard before `preventDefault` / `stopPropagation`. A cross-side panel handler must accept both its originating row and the currently open panel as valid command surfaces while ordinary editable controls keep native ownership.

## Latest Applicable Implementation

[MqttPage.vue](../../../src/pages/MqttPage.vue#L1) uses exact plain-arrow listeners for connection-tree collapse/expand. [SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) resolves left/right from either a command row or the active Settings context panel.

## Alternative Route

- Status: `verified`.
- Preconditions: the same key combines a local plain-navigation behavior and a global/context modified command.
- Steps: guard local navigation by exact modifier state, let modified events reach the command owner, preserve frozen/selected target state during focus handoff, and test both row-origin and panel-origin switching.
- Verification: focused UI/Runtime regressions, full tests/build and 800/420×480 browser panel replay pass.
- Applicability boundary: EyPc row/tree/panel keyboard surfaces; editors still own native OS text-navigation chords.
- Fallback: if a host intercepts the chord before the page, keep an alternate visible button/context-menu entry and do not claim the shortcut as host-verified.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | Cross-tab responsive command panels | MQTT/Settings short-height real-browser replay | Modifier-agnostic row listener and row-only panel target guard | Browser focus/panel state plus focused regressions | Exact plain arrows and active-panel switching ownership | verified |
