---
id: eypc-cursor-sqlite-pin-write-is-not-sidebar-pin
status: verified
scope: project
fingerprint: cursor-empty-window-pinnedcomposers-write-verifies__live-sidebar-unmoved__storageservice-memory-not-sqlite
first_seen: 2026-09-04
last_verified: 2026-09-04
review_after: 2027-03-04
evidence:
  - user-corrected
  - eypc-diagnostics pin-result completed
  - workspaceStorage empty-window count-only sqlite
tags:
  - companion
  - cursor
  - claude
  - pin
  - inbound-only
---

# Cursor sqlite 置顶写通不等于侧栏已置顶

## Symptom

插件提示「来源：Cursor 置顶」，诊断 `pin-result` `outcome=completed`、`method=cursor/pinnedComposers`、写后回读一致，但 Cursor 当前窗口 Pinned / Agents 侧栏没有对应变化。磁盘 `empty-window` 键计数与侧栏条数可以分叉（本机核验：磁盘 3、侧栏 2）。

## Wrong Assumption

把 `ItemTable` `cursor/pinnedComposers` 的 sqlite 回读当成 Cursor 侧栏已置顶，并据此提示「已置顶到 Cursor / 点击取消并同步」。

## Verified Root Cause

该键是 VS Code StorageService 的磁盘镜像，按窗口存在。产品写路径固定写 `empty-window`，当前工程窗口用内存值；外部 sqlite 写不能驱动活窗口 UI，下次 flush 还可能冲掉。Cloud Code（Claude App）星标写是另一条磁盘覆盖，用户同日收口为：这两路不要纠结回写，插件自己维护置顶，应用内置顶入站即可。

## Correct Detection Order

1. 看 `pin-result` 是否 `completed`（只证明盘上回读）。
2. 计数-only 看哪个 workspace `state.vscdb` 持有该键（不要转储 composer id）。
3. 对照用户当前窗口侧栏，而不是 EyPc `pinSource=native`。
4. 不要用「侧栏稍后刷新」掩盖「活窗口根本不读这份覆盖」。

## Prevention Rule

Cloud Code / Cursor：**不授予** `capabilities.pin`；插件置顶走 `localPin`；应用内置顶/星标只入站 `providerPin`。不得把 sqlite 或 `isStarred` 写回读成功说成侧栏已同步。Codex / CodexHost 写出站不受本条影响。

## Latest Applicable Implementation

- 策略单点：[preload/companion/provider-manifest.json](../../../preload/companion/provider-manifest.json#L1)（`pin.outbound:false`）与 [provider-registry.cjs](../../../preload/companion/provider-registry.cjs#L1)（拒绝 `setPin` 适配器）
- 库存注释：[preload/cursor/inventory.cjs](../../../preload/cursor/inventory.cjs#L39)
- 条款：[companion-pin-provider-sync spec](../../specs/260903/companion-pin-provider-sync/spec.md#L107)

## Alternative Route

- Status: `verified`（2026-09-04 用户原话：插件自持；Cloud Code / Cursor 置顶操作之后同步到插件）。
- Preconditions: 用户要的是插件列表置顶，不是改 Cursor/Claude 侧栏。
- Steps: 撤销这两路写出站；保留库存入站；本地图钉继续可用。
- Verification: Kernel 对 Claude/Cursor `set-provider-pin` 返回 `unsupported` 且不调适配器；原生 `providerPin` 仍进置顶分组。
- Applicability boundary: EyPc Companion 置顶。不含归档写、不含 Codex pin-bridge。
- Fallback: 若再次授权写出站，必须先有活窗口 UI 证据，不能只用 sqlite 回读。

## Occurrence History

| 日期 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | 提示已置顶到 Cursor，侧栏没有 | sqlite 写+回读当侧栏同步 | 用户收口为插件自持 + 入站 | 撤销 Claude/Cursor `pin` 能力 |
