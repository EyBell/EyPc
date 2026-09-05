---
id: eypc-cursor-workspace-pin-cache-ignores-wal
status: verified
scope: project
fingerprint: cursor-workspace-pin-cache-keyed-on-main-sqlite-misses-wal-only-unpin
first_seen: 2026-09-05
last_verified: 2026-09-05
review_after: 2027-03-05
evidence:
  - user-corrected
  - workspace ItemTable count-only sqlite
  - focused cursorInventory WAL cache and watch tests
tags:
  - companion
  - cursor
  - pin
  - inbound-only
  - wal
---

# Cursor workspace 置顶缓存只看主库会错过 WAL 取消置顶

## Symptom

Cursor 侧栏已经取消置顶，EyPc 置顶分组仍保留该行。插件本地 `localPins` 不含该 key；各 workspace `cursor/pinnedComposers` 当前列表也不含该 composer。主库 `state.vscdb` 可能很久没改 mtime，取消置顶只出现在 `state.vscdb-wal`。

## Wrong Assumption

把 workspace 置顶缓存和 watcher 签名都键在主 sqlite 文件的 size+mtime 上，并以为递归 `fs.watch` 看到 `-wal` 就一定会重读。

## Verified Root Cause

`readPinnedComposers` 用主库 `dbSignature` 命中缓存就不查 sqlite。`watch().signatureOf()` 只拼全局库+WAL 与各 workspace **主库**，不含 workspace WAL。递归 watch 虽会因 `-wal` 触发 `notify()`，签名不变则直接 return，缓存继续提供旧 pinned ids。既有取消置顶测试改写主库，测不到这条路径。

## Correct Detection Order

1. 计数-only 看当前各 workspace `pinnedComposers` 是否仍含该 id（不要转储 composer id）。
2. 对照主库与 `-wal` 的 mtime/命中：主库未变、WAL 有变，就是本条。
3. 排除 EyPc `localPins` 叠加：本地图钉会在应用取消后仍留在分组里。
4. 不要把 RAW-185「置顶只出现在置顶分组」误当成状态错了。

## Prevention Rule

Cursor workspace 置顶缓存与 watcher 签名必须是主库 **加** WAL（不含 shm）。WAL 变化必须使缓存失效并重读 `pinnedComposers`。不要只对全局 `state.vscdb` 做 WAL StatWatcher。

## Latest Applicable Implementation

- 库存：[preload/cursor/inventory.cjs](../../../preload/cursor/inventory.cjs#L316) `storeSignature`、`signatureOf`、workspace StatWatcher
- 回归：[tests/platform/cursorInventory.test.ts](../../../tests/platform/cursorInventory.test.ts#L1) WAL 冻结主库仍重读 / workspace WAL 通知
- 条款：[companion-pin-provider-sync spec](../../specs/260903/companion-pin-provider-sync/spec.md#L129)

## Alternative Route

- Status: `verified`（2026-09-05 聚焦 `cursorInventory` 通过；同日用户确认 Cursor APP 置顶/取消置顶在插件内展示）
- Preconditions: Cursor 入站置顶；取消置顶可能只落 WAL。
- Steps: 置顶缓存与 watch 签名包含 workspace `-wal`；主库签名冻结时写 WAL 必须重读为空列表。
- Verification: 聚焦 `tests/platform/cursorInventory.test.ts`；2026-09-05 用户在 Cursor APP 置顶/取消置顶后插件分组跟随。
- Applicability boundary: EyPc Cursor workspace `pinnedComposers` 入站。不含 Claude 星标、不含 Codex pin-bridge、不含 shm。
- Fallback: 若签名再变吵，仍不得改回「只看主库」；应收紧 WAL 采样而不是丢掉 WAL。

## Occurrence History

| 日期 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-09-05 | 侧栏已取消，插件仍置顶 | 主库签名缓存 + watch 不含 workspace WAL | 签名含 WAL 并补 StatWatcher | 聚焦测试绿 |
| 2026-09-05 | 用户在 Cursor APP 置顶/取消置顶 | 此前 WAL 入站待真机 | 重载后的 WAL 签名路径 | 插件分组正常展示 |
