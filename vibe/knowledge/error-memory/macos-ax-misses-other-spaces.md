---
id: eypc-macos-ax-misses-other-spaces
status: verified
scope: project
fingerprint: window-list-current-space-only__system-events-ax__miss-other-spaces-displays__cgwindowlist-required
first_seen: 2026-07-26
last_verified: 2026-07-31
review_after: 2027-01-28
evidence:
  - preload/index.js
  - public/preload.js
  - src/platform/eypcPlatform.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
  - tests/runtime/action.test.ts
  - tests/platform/eypcPlatform.test.ts
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
3. A successful refresh intermittently removes windows on other Spaces even though Core Graphics returned them in an earlier inventory.
4. Historical WJ-11–WJ-19 builds also attempted private Space lookup/cache/switch routes; WJ-20 no longer contains that activation path.

## Wrong Assumption

`System Events` `process.windows()` enumerates and can raise every desktop the user can switch to; `kCGWindowIsOnscreen=false` proves minimization; or a private Space cache is required as product identity.

## Verified Root Cause

AX via System Events typically exposes windows on the active Space. Cross-Space/display inventory requires `CGWindowListCopyWindowInfo` with `kCGWindowListOptionAll`. Activation that only talks to System Events therefore fails with host `target/native not-found` while Runtime resolve still succeeds on the CG row.

Core Graphics “onscreen” is visibility on the current composited Space, not an `AXMinimized` equivalent. A normal window on another Space can report `kCGWindowIsOnscreen=false`; converting that to `minimized=true` and filtering minimized macOS rows deletes valid cross-Space content. Likewise, an AX fallback is a partial/current-Space snapshot, so replacing the previous full list with it turns an observation gap into fabricated deletion.

The former session Space-map performance issue is retained only as historical evidence. WJ-20 removes that route instead of treating Space/display binding as window identity.

## Prevention Rule

Prefer CoreGraphics for full-desktop inventory and use System Events only as a current-Space fallback. Never infer minimization from `kCGWindowIsOnscreen`; keep minimized/off-Space rows visible unless Accessibility supplies a real minimize attribute. Tag each list result complete or partial: complete snapshots may evict, partial snapshots must merge into the prior session list and cannot prove closure.

Current EyPc prevention is narrower: use Core Graphics for the broadest legal inventory, classify incomplete AX results as partial, retain proven root/member cache on partial refresh, and never infer minimize/closure from offscreen absence. Activation uses exact CG↔AX root mapping and fails closed when the current host cannot focus that root. Do not use private Space lookup/cache/switch, desktop walking, learned binding, title/ordinal selection or process-frontmost fallback. Cross-project Space records remain historical platform research, not current EyPc implementation authority.

## Alternative Route

- Status: `verified` for inventory/partial-cache prevention; former private Space activation route is superseded by WJ-20.
- Preconditions: macOS host; Screen Recording for broad CG inventory and Accessibility for AX root proof.
- Steps: load CG observations; merge any partial AX snapshot into the prior root cache; activate only through exact root CG↔AX evidence and final focused-root readback; otherwise block visibly.
- Verification: source/contracts cover partial retention and absence of every former Space symbol; real WJ-20 off-Space behavior remains user-owned.
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
| 2026-07-28 | Same AiTools target placed on a non-current Space; Electron binding empty while isolated direct+reverse binding unique; title/ordinal focused a sibling | Isolated JXA Space bridge, then `_AXUIElementGetWindow` unique mapping plus application `AXFocusedWindow` read-back | global slot 2 host-verified; exact target focused |
| 2026-07-29 | User reported repeated global calls still slow and list rows from other Spaces disappearing | Added guarded session-cache read/import, exact cached-route verification, complete/partial list merge, real cached-row state, and removed CG offscreen→minimized inference | source/type/focused tests verified; real host latency/list acceptance pending |
