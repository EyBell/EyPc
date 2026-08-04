# Window Jump Workbench — Current Plan

Tool: codex
Updated: 2026-08-04

## WJ-22 Implemented Route

1. Baseline dirty-tree, focused windows, typecheck and package contracts without stash/reset/clean.
2. Add a lazy CommonJS window facade and mechanically move all AX/CG/SkyLight and Win32 list/probe/activate/close/terminate/topmost implementations into their platform modules; keep `preload/index.js` to guarded loading, dependency injection, isolated fallback and API mounting; mirror canonical modules to public/dist.
3. Mark macOS AX inventory `partial`; replace inventory-driven deletion with exact `probeInstance()` and a `verified-gone` clear gate.
4. Restore per-instance direct/reverse Space lookup and per-display current Space, switch only the target display, confirm it, activate the exact root/member and retry one stale target once.
5. Make family reconciliation non-destructive, block multi-target convergence, and make candidate recovery update only the originating slot.
6. Extract pure Runtime inventory/request responsibilities while preserving action IDs, storage and UI contracts.
7. Add liveness, cache, Space isolation, same-root conflict, per-slot recovery, module failure, mirror and non-window guards.
8. Run focused/full tests, typecheck, production/uTools build and real macOS native smoke; then synchronize requirements, architecture, help and error memory.

## Remaining acceptance

- Reload the generated preload in actual uTools and exercise the ten global slot entries visually.
- Repeat the native matrix on Windows and verify real close/topmost behavior.
- User-owned optional checks: full-screen Space and physical display topology variants not present during the recorded smoke.

## Constraints

- Preserve unrelated dirty work and do not format or rename unrelated files.
- No background poller, persistent Space/liveness cache or new native dependency.
- Do not treat a passing projection scan as liveness evidence.
