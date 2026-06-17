# EyPc Dev Kill Bridge Spec

Tool: codex

## Goal

Fix the localhost dev page gap where port scanning worked through the Vite dev bridge, but process termination returned `uTools preload unavailable`.

## Requirements

- Browser fallback platform must call a dev API for `ports.kill` when uTools preload is unavailable.
- Dev kill API must re-scan current listeners and verify the requested PID still owns the requested port before executing any kill command.
- Normal and force kill must reuse platform-specific kill command candidates from [src/platform/processBridge.ts](../../../src/platform/processBridge.ts#L35).
- Automated verification must not execute a real process kill.

## Root Cause

The preload runtime already exposed real `ports.kill`, but the localhost path only had `/__eypc__/ports/scan` in [src/platform/devPortServer.ts](../../../src/platform/devPortServer.ts#L1), while [src/platform/eypcPlatform.ts](../../../src/platform/eypcPlatform.ts#L1) returned `uTools preload unavailable` for fallback kill.
