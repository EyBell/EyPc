# Window Jump Workbench — Controlled Specification

Tool: codex
Updated: 2026-08-04

## Status

`wj22-native-instance-space-cache / implemented / automated-and-macos-native-smoke-verified / utools-reload-visual-pending`

## Authority

- 用户事实：[raw-requirement.md](raw-requirement.md#L1)
- 产品权威：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
- 架构权威：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)
- 验证记录：[verify.md](verify.md#L1)
- 当前状态：[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)

## WJ-22 Contract

### Native identity and liveness

- [windows.ts](../../../../src/domain/windows.ts#L1) owns identity, families, targets and slots. Exact roots are `darwin:PID:CGWindowID` or `win32:PID:HWND`; member IDs, titles and presentation state never substitute for a root.
- `WindowListResult.completeness` describes only projection authority. Inventory absence transitions a session record to `temporarily-unobserved`; it cannot clear persistence.
- `windows.probeInstance()` returns `live | gone | indeterminate`. Only matching `gone/verified-gone` evidence may enter Runtime's native-reference clear function.
- macOS requires owner/application match plus exact CG or Space evidence for live; owner exit/mismatch or successful CG+SkyLight authoritative absence for gone. Windows requires `IsWindow`, `GetWindowThreadProcessId` and PID owner validation.

### Session Space cache and activation

- [preload/windows/session-cache.cjs](../../../../preload/windows/session-cache.cjs#L1) exclusively owns per-instance liveness, evidence generation, timestamps, Space bindings and per-display current Space for one preload process.
- [macos-space.cjs](../../../../preload/windows/macos-space.cjs#L1) owns direct/reverse SkyLight resolution, managed-display refresh, target-display-only switching and bounded confirmation. Warm activation never calls `windows.list()` or scans all target windows.
- `windows.activate()` prepares the exact target Space, performs `root-current` or `member-exact`, and accepts success only after exact final focus readback. A stale warm binding is evicted for that instance and receives one cold targeted retry.
- Space, display and liveness cache never enter persistent storage; no poller or background native process is allowed.

### Root, member and slot isolation

- Root activation preserves the browser/IDE's current internal Tab/editor state. Real native children remain session-only exact destinations and fail closed.
- [windowTree.ts](../../../../src/domain/windowTree.ts#L1) may project families but cannot merge logical targets or remap slots. A single unambiguous legacy member can adopt its proven root; same-root multi-target convergence remains manual.
- [windowRebind.ts](../../../../src/domain/windowRebind.ts#L1) carries the originating slot. Candidate confirmation activates first, then reuses/creates a precise target and updates only that slot.
- Same-app independent roots, including equal titles, remain separate; title/app/unique-candidate inference is forbidden.

### Module and package boundaries

- [preload/windows/index.cjs](../../../../preload/windows/index.cjs#L1) is the stable window facade; `native-command`, `session-cache`, `macos-space`, `macos` and `win32` own their named responsibilities and perform no top-level native side effects.
- [preload/index.js](../../../../preload/index.js#L1) injects dependencies and mounts the facade. Resolution failure sets only window capabilities unavailable; other platform API keys remain unchanged.
- `preload/` is canonical. The preload sync copies every `windows/*.cjs` file byte-for-byte to `public/windows/` and `dist/windows/`; package validation requires loadability, laziness and isolated degradation.
- [windowInventoryRuntime.ts](../../../../src/runtime/window/windowInventoryRuntime.ts#L1) owns complete/partial session merging; [windowActivationRuntime.ts](../../../../src/runtime/window/windowActivationRuntime.ts#L1) owns request and Space-failure classification. `appRuntime` retains orchestration and existing action/UI contracts.

## Compatibility and safety

- Bridge revision is `wj22-native-instance-space-cache`; an older bridge fails closed.
- Ten slot features, labels, `mainHide`, storage keys and `WindowTarget/WindowSlot` persisted shape are unchanged.
- Windows activation/topmost/close semantics remain unchanged apart from the exact liveness seam.
- No simulated input, permission elevation, title mutation, automatic app launch, foreground-protection bypass, background polling or unrelated business refactor.
- Files, Ports, MQTT, Codex and uTools lifecycle hooks remain outside WJ-22.
