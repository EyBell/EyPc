# EyPc MVP Usability Closure Spec

Tool: codex

## Goal

Close the first MVP usability gaps without expanding release gates into real process termination or cross-platform manual validation.

## Requirements

- Ports page exposes one-click group cleanup for configured port groups.
- Group cleanup only targets processes from the latest scanned port list whose ports match the selected group.
- Normal group cleanup opens the confirmation layer; force group cleanup requires an explicit button and still verifies PID/port ownership before kill.
- `Ctrl+1`, `Ctrl+2`, and `Ctrl+3` switch to Ports, Favorites, and Settings when text input is not focused.
- Settings page lists those Tab commands and keeps override/disable behavior.
- Favorites page can choose a host path when uTools/Electron picker is available, and keeps manual path entry when unavailable.
- Favorites page can copy the focused/selected file or folder path through the platform bridge.

## Non-Goals

- No real kill execution in this task.
- No new Electron dependency.
- No Windows/Linux release Gate closure.
- No disk deletion behavior for favorites.

