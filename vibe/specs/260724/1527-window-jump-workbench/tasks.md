# Window Jump Workbench — Tasks and Execution Journal

Tool: codex
Updated: 2026-08-04

## Current Work Items

| ID | Work | Status |
| --- | --- | --- |
| WJ-22.0 | Dirty-tree and existing behavior baseline | completed |
| WJ-22.1 | Complete preload platform extraction, lazy facade, native command module and package mirrors | completed |
| WJ-22.2 | Unique instance cache, liveness states and exact probe | completed |
| WJ-22.3 | Verified-gone clear gate and partial inventory retention | completed |
| WJ-22.4 | Per-instance/per-display Space cache and atomic exact activation | completed |
| WJ-22.5 | Root identity, same-browser isolation and current-Tab preservation | completed |
| WJ-22.6 | Non-destructive family migration and per-slot explicit recovery | completed |
| WJ-22.7 | Runtime helper extraction and legacy API compatibility | completed |
| WJ-22.8 | Focused/full/type/build/package verification | automated-verified |
| WJ-22.9 | macOS multi-display/multi-Space native smoke | native-smoke-verified |
| WJ-22.10 | Actual uTools reload/global-hotkey visual acceptance | pending-user-host |
| WJ-22.11 | Windows real-host matrix | pending-host |

## Execution Journal

- 2026-08-04 — Reproduced the regression chain: current-Space AX projection was marked complete, Runtime replaced cache, and rebind cleared a still-live native identity.
- 2026-08-04 — Added WJ-22 modules and bridge revision; all AX/CG/SkyLight and Win32 operation scripts moved out of the main preload, while module loading remains lazy and independently degradable.
- 2026-08-04 — Replaced projection deletion with exact liveness proof, added targeted Space cache/switch, and removed activation-time full refresh from the hot path.
- 2026-08-04 — Stopped family projection from merging targets or slots; slot-originated recovery now changes only that slot, and same-root historical conflicts remain explicit.
- 2026-08-04 — Full Vitest `58/58` files and `767/767` tests pass; typecheck and production/uTools build pass after complete platform extraction. A post-extraction native macOS smoke proves off-Space omission + live probe + exact activation, target-display restore, non-target-display preservation, separate Edge roots, unchanged current internal surface and full display-state restoration.
