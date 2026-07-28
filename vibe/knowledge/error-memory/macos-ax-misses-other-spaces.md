---
id: eypc-macos-ax-misses-other-spaces
status: candidate
scope: project
fingerprint: window-list-current-space-only__system-events-ax__miss-other-spaces-displays__cgwindowlist-required
first_seen: 2026-07-26
last_verified: 2026-07-28
review_after: 2026-10-27
evidence:
  - preload/index.js
  - public/preload.js
  - src/platform/eypcPlatform.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - windows
  - macos
  - enumeration
  - activation
  - spaces
  - screen-recording
---

# macOS System Events AX Misses Other Spaces

## Symptom

1. Window Jump refresh only shows windows on the current Space/desktop even though other Spaces and displays have real app windows.
2. Or the list shows the window (CG inventory) but「展开并前置」returns `activation-not-found` after a healthy rescan when the target is on another Space/display.

## Wrong Assumption

`System Events` `process.windows()` enumerates and can raise every desktop the user can switch to.

## Verified Root Cause

AX via System Events typically exposes windows on the active Space. Cross-Space/display inventory requires `CGWindowListCopyWindowInfo` with `kCGWindowListOptionAll`. Activation that only talks to System Events therefore fails with host `target/native not-found` while Runtime resolve still succeeds on the CG row.

## Prevention Rule

Prefer CoreGraphics for full-desktop inventory when it returns titled windows; fall back to System Events AX for the current Space when CG is empty/failed. Keep AX for activate/close title resolution, but before AX activate on a CG `pid:0:CGWindowNumber` ref, switch using a refresh-rebuilt session cache of `CGWindowNumber → {spaceId, displayUuid}`. Build that cache primarily by walking `SLSCopyManagedDisplaySpaces` (CFDictionary `Display Identifier` / `Spaces` / `id64`) and listing each Space with `SLSCopyWindowsWithOptionsAndTags` — this includes desktops the display is not currently showing. Do not rely on per-window `SLSCopySpacesForWindows` alone (host often returns empty for off-current targets → `empty-spaces`). Supplement inventory CG refs tags missed via `SLSCopySpacesForWindows`. Same-Space targets skip `SLSManagedDisplaySetCurrentSpace` (`space=skipped:current`). Switch with `CFStringCreateWithCString(displayUuid)` — never `SLSCopyManagedDisplayForSpace` (uTools host often returns empty → `no-display`). After source changes, always re-run `pnpm run serve` / `prepare-utools-runtime` so `dist/preload.js` matches. Never equate a CG window ID with `AXWindowNumber`. Mirror preload changes and ship `koffi` into the plugin `node_modules` from prepare. Cross-project authority: [utools-macos-ax-activation-misses-other-spaces.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1) · [macos-window-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1).

## Alternative Route

- Status: `candidate`
- Preconditions: macOS host; target on another Space/display; Accessibility (+ Screen Recording for full list).
- Steps: load inventory via CG; activate slot/manual; expect Space switch then AXRaise. Without `koffi`/SkyLight, expect current-Space-only activation.
- Verification: user-owned host — from a different Space than the target, invoke slot 1 /「展开并前置」with no `activation-not-found`.
- Applicability boundary: inventory + activation; no permanent macOS topmost.
- Fallback: Accessibility-only hosts remain current-Space for AX; blocking diagnostics stay visible.

## Occurrence History

| Date | Trigger | Recovery | Outcome |
| --- | --- | --- | --- |
| 2026-07-27 | User: same-Space ok; 小米显示器桌面5 → `activation-not-found` (process ok, target not-found) | WJ CGS switch before AX activate | local koffi probe ok; host acceptance pending |
| 2026-07-27 | User acceptance对照: 同桌面手动/槽激活成功；跨桌面「全局槽 1」→ `space=failed:empty-spaces` 两次后 `activation-not-found`（process ok, target/native not-found, refresh/resolve ok） | pending: `SLSCopySpacesForWindows` empty for off-Space/off-display CG id | WJ-11 Space switch not effective on host; AX path itself ok |
| 2026-07-27 | Same gate after mask/`empty-spaces` diagnosis | mask `0x7` + managed-display reverse window scan in `trySwitchMacosSpaceByCGS` | source repaired; host off-Space re-acceptance pending |
| 2026-07-27 | Host: off-Space slot 1 → `space=failed:no-display` (Space resolved) | retain `Display Identifier` from managed Spaces for SetCurrentSpace | source repaired; host still `no-display` |
| 2026-07-27 | User: cache / unique window binding; same-Space AX proves global should work after switch | session `CGWindowNumber→{spaceId,displayUuid}` via plist + inventory warm | source repaired; tags path still current-desktop only |
| 2026-07-27 | User: must load all displays/desktops; refresh reloads | CGWindowList(OptionAll) ∪ inventory → SLSCopySpacesForWindows bind; drop tags | source repaired; host re-acceptance pending |
| 2026-07-27 | User: same-display also `no-display` / activation-not-found | stale `dist/preload.js` still used `SLSCopyManagedDisplayForSpace`; Spaces-only parse + `current` skip + activate reverse-scan; prepare synced dist | source repaired; serve/reconnect + host re-acceptance pending |
| 2026-07-27 | User: visible desktop ok; hidden desktop `empty-spaces` | per-window `SLSCopySpacesForWindows` insufficient on host; rebuild via managed CFDictionary + per-Space tags (off-current) | source repaired; host re-acceptance pending |
| 2026-07-27 | User: still `empty-spaces` after tags cache | many CG inventory IDs absent from tags; AX not-found → walk non-current Spaces + retry AX (`walked`), restore on failure | source repaired; host re-acceptance pending |
| 2026-07-27 | SIP-safe route continue | remember only after AX `activated`; stale binding → forget + walk (skip tried Space); settle 120ms | source repaired; host re-acceptance pending |
| 2026-07-28 | Host: AiTools (2 CG windows) → `space=failed:multiwindow-blocked` twice; env snapshot: CG目标=1, AX目标=0, AX窗口=2, 绑定数=0, 来源=none | `SLSCopySpacesForWindows` returns 0 for all masks; reverse scan also empty. All windows on current Space (AX窗口=CG所属窗口=2) but AX title mismatch (AX目标=0). Fix: (1) `current-space-inferred` — when `ownerCgWindowCount > 1` and `axWindowCount === ownerCgWindowCount`, infer all windows on current Space, skip Space switch, proceed to activation; (2) `cg-ordinal-fallback` — activation script resolves CG ordinal from `CGWindowListCopyWindowInfo` and uses it when AX title doesn't match | source repaired; host re-acceptance pending |
