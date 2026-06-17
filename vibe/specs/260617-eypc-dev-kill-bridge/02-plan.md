# EyPc Dev Kill Bridge Plan

Tool: codex

## Implementation

- Add failing platform tests for dev kill verification and browser fallback POST behavior.
- Extend [src/platform/devPortServer.ts](../../../src/platform/devPortServer.ts#L1) with `killDevPort()` and POST `/__eypc__/ports/kill`.
- Keep `killDevPort()` dependency-injectable so tests can verify scan-before-kill without invoking the OS.
- Extend [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) fallback `ports.kill` to POST the kill request to the dev API.

## Verification

- Run targeted platform tests first, then full test/typecheck/build/uTools checks.
- Smoke the running dev API with an invalid `pid=0/port=0` request only, so no process can be terminated.
