# Changes：Codex Tab Boundary Optimization

status: `integrated / v6-current-automated-verified-with-known-mqtt-timeout`
updated: `2026-08-24`
local implementation/requirement commits: `f581946` · `c2e2abd` · `18cc3d0` · `2f205b8`

## Current Inventory

| Scope | State | Core description |
| --- | --- | --- |
| `vibe/specs/source-anchors/` + source validator | added | deterministic metadata/hash-only identities for every outside-fence ordered source clause |
| RAW-177 registry leaves and module owners | added/updated | C-1～C-3 current authority plus whole/scoped supersession edges |
| `src/platform/eypcPlatform.ts` + Domain | simplified/current | V6 Kernel is the only task facade；V4 navigation / V2 tasks compatibility surfaces remain removed |
| `preload/companion/open-handoff.cjs` | added | monotonic handoff normalization and native receipt boundary |
| navigation/actions/kernel/main preload | updated | dispatch no longer implies opened/read；native unread clear requires explicit receipt |
| V6 Evidence/Topology/Kernel/Snapshot/ACK | later change integrated | Provider submits evidence；Topology owns membership only；Kernel is sole reducer；public unknown is neutral；Float ACK resends once without rebuilding a healthy window |
| Controller/Float/help | updated/current | key-only unified Command；no Provider task watcher/sync action/alias leakage/inventory semantic fallback；pending versus native-confirmed remains distinct |
| PRD/architecture/current status | updated/current | realtime V6 Codex Tab architecture、conflict resolution、RAW-177 boundary and unrun native gate synchronized |
| focused/full tests | updated/current | current `493/493` focused；non-Action `1278/1278`；Action diagnostic `171/171`；default full only known MQTT timeout |

## Preserved Current Worktree

The repository already contained accepted V5 and other user-owned uncommitted changes；a separate same-worktree task later landed the V6 corrective revision. This task owns only C-1～C-3 and this ledger reconciliation，does not claim the V6 write set，and did not clean、reset or reinterpret unrelated paths.

## Explicitly Excluded

- User-owned unrelated dirty changes and `_to_delete/`.
- Editable Mirasim code：none found locally.
- Push、release、deployment、file deletion and real plugin/host/process tests；local commit is separately authorized by the 2026-08-24 batch request.
