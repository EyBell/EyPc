---
id: eypc-window-family-projection-overwrites-logical-targets
status: verified
scope: project
fingerprint: window-family-projection__multiple-logical-targets-converge-on-one-root__slots-and-metadata-merged
first_seen: 2026-08-04
last_verified: 2026-08-04
review_after: 2027-02-04
evidence:
  - src/domain/windowTree.ts
  - src/domain/windowRebind.ts
  - src/runtime/appRuntime.ts
  - tests/domain/windows.test.ts
  - tests/runtime/action.test.ts
tags:
  - windows
  - identity
  - projection
  - slots
---

# Window family projection must not overwrite logical targets

## Symptom

After root/member tree aggregation, two historical browser targets or slots begin activating the same root. Aliases, favorites, pins or slot mappings appear merged even though the user configured separate windows.

## Root cause

A display projection was incorrectly granted ownership of user intent. Because two historical member locators could both map to one family root, reconciliation selected/merged a survivor and rewrote every referring slot.

## Prevention rule

- `WindowTarget` and `WindowSlot` are user-owned logical state; `WindowFamily` is observation/projection only.
- A single historical member target may adopt a proven root only when no second target proposes the same root.
- Multiple targets converging on one root remain unchanged and enter explicit recovery; title, app or candidate count cannot select a survivor.
- Slot-originated recovery activates the exact candidate first, then reuses or creates a target and changes only that slot.
- A new target starts with its own title alias, `favorite=false`, `pinned=false` and no alternate aliases; old metadata is never copied to an unrelated window.

## Verification

Domain tests cover single migration versus same-root conflict. Runtime tests cover two slots sharing an old target, one-slot confirmation, old metadata retention, new-target clean metadata and reuse of exact native identity.
