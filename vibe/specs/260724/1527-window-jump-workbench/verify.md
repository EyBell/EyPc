# Window Jump Workbench — Verification Record

Tool: codex
Updated: 2026-08-04

## Current Status

`wj22-native-instance-space-cache / implemented / automated-and-macos-native-smoke-verified / utools-reload-and-windows-host-pending`

## Automated evidence

- Focused contracts cover partial projection retention, exact `live/gone/indeterminate`, owner mismatch, presentation-state non-death, session cache, per-display current Space, stale-target eviction, same-app root separation, same-root migration conflict and one-slot recovery.
- Runtime contracts prove only `verified-gone` clears native references; off-Space live and indeterminate states preserve target/slot; Space failures do not trigger inventory rebind; `member-exact` never falls back.
- Package contracts prove all six canonical CJS modules match public/dist, load relatively, stay lazy, expose the stable facade, and degrade only the windows capability while non-window API keys remain identical.
- `pnpm test`: `58/58` files, `767/767` tests passed after complete platform-script extraction.
- `pnpm run typecheck`: passed.
- `pnpm run build`: passed, including typecheck, Vite production build, runtime preparation and `validate:utools`.
- Ten `eypc-window-slot-1…10` feature codes, command labels and `mainHide=true` remain validated; storage keys and persisted target/slot shape are unchanged.

## macOS native smoke evidence

Executed locally through the fully extracted canonical window subsystem on 2026-08-04 without Computer Use, background polling or persistent system changes. All temporarily changed Spaces were restored.

1. AX+CG discovery found two separate Microsoft Edge roots in one PID with different positive CGWindowIDs; both exact probes returned `live`.
2. Exact `root-current` activation for each root returned its requested `darwin:PID:CGWindowID`, and final trace ended with `ax-focused-root-window`.
3. The target display was switched away from the target's Space. `windows.list()` returned `completeness=partial` and omitted the target, while `probeInstance()` still returned `live`; activation restored the target Space and exact root.
4. After warming the target binding, switching its display away exercised the session-cache path and restored only that display.
5. A different display was independently switched to another Space; activating the target left that non-target display on its chosen Space.
6. Sequential activation of the two Edge roots stayed exact. A privacy-safe hash comparison confirmed the target root's current internal surface/title did not change across root activation, matching the Tab-independent contract.
7. Final managed-display readback confirmed every display was restored to its pre-test current Space.

## Regression audit

- The first full-suite run exposed one old test that still treated an empty complete projection as closure. The fixture was corrected to supply an exact `gone` proof; production logic was not weakened.
- The re-review found and removed a remaining WJ-21 projection path that could migrate multiple historical member targets to one root. Single unambiguous migration remains; conflicts stay manual.
- Source preload execution also exposed caller-relative CommonJS resolution. The guarded loader now tries the preload directory and controlled package/dev roots; failure still affects windows only.
- Final modular audit found that the first functional pass still left AX/CG and Win32 operation scripts in the main preload. Those scripts and their list/activate/close/topmost/terminate implementations were then mechanically moved into `macos.cjs` and `win32.cjs`; source guards now fail if the main preload regains any native window implementation, and the full automated/native matrix was repeated afterward.
- Final canonical preload sync, production/uTools build and package validation passed again after code closeout. Repository-wide `git diff --check` and the WJ-22/CodeNote code-link audits also passed after documentation closeout; unrelated dirty-tree files were preserved and excluded from WJ-22 ownership.

## Pending host acceptance

1. Reload `dist/preload.js` in actual uTools and verify all ten global slot entries, `mainHide` success hiding and visible failure diagnostics.
2. Repeat the Display 1/Display 2 matrix through actual assigned slots, including physical-display numbering and optional full-screen Space.
3. Perform real Windows activation, foreground-protection refusal, close and topmost checks.
4. Perform destructive close/terminate checks only with disposable windows and explicit user confirmation.

These pending checks do not invalidate the automated or direct macOS native evidence, but actual uTools visual/global-hotkey acceptance is not claimed complete.
