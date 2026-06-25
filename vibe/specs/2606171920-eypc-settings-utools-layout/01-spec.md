# Settings uTools Layout Spec

## Goal

Refactor the Settings page around the local EzClipboard compact-settings pattern: shortcuts stay in a dense command worktable, and every non-shortcut setting moves into a scoped maintenance tab.

## Requirements

- [SettingsPage.vue](../../../src/pages/SettingsPage.vue#L1) exposes two in-page tabs: `快捷键` and `维护`.
- Shortcut configuration is a compact single-column worktable with a single-line filter strip, scope filter, state filter, resolution preview, and compact per-row actions.
- The old permanent right-side shortcut inspector is removed; command detail is available through row selection, title tooltip, preview strip, and existing modals.
- Layer priority, reservation rules, and storage status live under `维护`.
- `preferSqlite` is read-only display only; no settings schema, runtime persistence, or SQLite enablement changes.

## References

- Local EzClipboard setting layout: `/Users/gdkmjd/work/czz/EzClipboard/src/views/Setting.vue`.
- Local EzClipboard scoped sub-tab pattern: `/Users/gdkmjd/work/czz/EzClipboard/src/cpns/ClipSwitch.vue`.
