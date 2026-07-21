---
id: eypc-codex-gui-nvm-launcher-path
status: verified
scope: project
fingerprint: codex-app-server-exits-in-gui-host__nvm-js-wrapper-shebang-cannot-resolve-node-from-restricted-path__launch-with-sibling-node-and-sanitized-diagnostic__eypc-utools-codex-provider
first_seen: 2026-07-18
last_verified: 2026-07-18
review_after: 2027-01-18
evidence:
  - user-host-observation
  - regression-test
  - real-app-server-smoke
tags:
  - codex-app-server
  - utools
  - nvm
  - volta
  - windows
  - npm-shim
  - gui-path
  - child-process
---

# Codex App Server Runtime Resolution Fails Under GUI-Restricted PATH

## Symptom

The real uTools Codex page loaded, but its status immediately became `Codex App Server 已退出`; both quota cards remained unavailable. Raw child stderr is intentionally not retained in project memory.

## Wrong Assumption

Finding an absolute `codex` executable was treated as sufficient. The implementation assumed that executing the file would also find every runtime named by its shebang.

## Verified Root Cause

The discovered Codex executable was an NVM-managed JavaScript wrapper using an `env node` shebang. A GUI host can have a restricted PATH that omits the NVM bin directory, so the wrapper file is found but its Node runtime is not; the child exits before App Server initialization.

The same failure class appears on Windows in a different shape: a GUI host may not inherit npm/Volta directories, and an npm `.cmd` shim is not itself a safe no-shell launch plan. Windows discovery must include the official `%LOCALAPPDATA%\\Volta\\bin\\codex.exe` default and configured `VOLTA_HOME`, while command shims require a known Codex JavaScript entry plus verified absolute Node or bundled native binary.

## Evidence

- Controlled discovery and launch-plan implementation: [preload/index.js](../../../preload/index.js#L1).
- Restricted-PATH launch and bounded-diagnostic regressions: [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1).
- Acceptance and real App Server evidence: [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Correct Detection Order

1. Resolve only the controlled Codex candidate paths; do not recursively search Codex Home or user data.
2. Inspect the candidate's resolved file type. For a POSIX JavaScript wrapper, check for its verified sibling Node; for a Windows `.cmd`/`.bat`, accept only the known adjacent Codex JavaScript entry paired with verified Node or a verified bundled native binary.
3. Reproduce with the child PATH reduced so it does not contain the shell/NVM bin directory.
4. If the candidate resolves to a verified JavaScript entry and Node exists, launch that absolute Node with the resolved JavaScript entry. If a Windows shim cannot be resolved, report it as unusable; never direct-spawn it or introduce a shell.
5. Convert startup failures to a bounded diagnostic code without retaining or forwarding raw stderr, command paths or environment values.

## Prevention Rule

GUI-hosted provider bridges must treat executable discovery and runtime discovery as separate contracts. Never rely on terminal shell initialization to make an npm/NVM wrapper work inside uTools, and never equate discovery of a Windows command shim with a verified executable launch plan.

## Latest Applicable Implementation

[preload/index.js](../../../preload/index.js#L1) now builds a deterministic launch plan, covers macOS/Linux wrapper candidates plus Windows npm/Volta/NVM/local/Path candidates, prepends only the selected command directory to the child PATH and exposes a sanitized `runtime-unavailable` result. [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) locks restricted-PATH, default Windows Volta, resolved npm shim and unusable shim cases.

## Alternative Route

- Status: `verified`.
- Preconditions: a controlled Codex candidate resolves to a native executable or a verified JavaScript entry plus absolute Node; the GUI host PATH cannot be trusted.
- Ordered steps: enumerate controlled platform candidates; resolve the candidate and real entry; select verified native or absolute Node/JavaScript launch; start from user home; classify at most a bounded startup sample; return only a stable error code/message on failure.
- Verification: fake bridges assert POSIX absolute launch, default Windows Volta discovery, resolved npm shim, unusable-shim refusal and sanitized failures; a real local App Server quota/config read succeeds with the shell Node path removed; full tests, typecheck, build and uTools validation pass.
- Applicability boundary: EyPc's local Codex provider launch. It does not authorize arbitrary executable paths, shell execution, auth-file reads, raw stderr storage or broader environment capture.
- Fallback: return `runtime-unavailable` and ask the user to verify the local Codex/Node installation; do not fall back to a private quota API.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18 | Codex quota/task companion | Real uTools page reported an exited App Server and empty quota | Spawn the absolute NVM Codex wrapper with the GUI's inherited PATH | Exact wrapper/symlink inspection plus restricted-PATH reproduction | Launch via sibling Node, add bounded diagnostics and replay real/fake/full gates | verified; source fixed, post-build uTools reload remains |
| 2026-07-18 | Codex first-launch readiness | Windows readiness initially covered npm shim but omitted the official default Volta executable and could classify an unusable shim as missing | Treat a found Windows shim as directly spawnable or rely on inherited Path | Independent review plus virtual `path.win32` host without Path | Add default/configured Volta native candidates, require verified shim resolution and expose a safe unusable state | verified in source tests; real Windows uTools host remains |
