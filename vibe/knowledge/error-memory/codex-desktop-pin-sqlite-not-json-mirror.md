---
id: eypc-codex-desktop-pin-sqlite-not-json-mirror
status: candidate
scope: project
fingerprint: codex-desktop-pin-authority-is-sqlite-section-json-mirror-diverges-unwatched
first_seen: 2026-09-05
last_verified: 2026-09-05
review_after: 2026-12-05
evidence:
  - live-count-only sqlite-vs-json
  - code path unread-watcher-on-json-only
  - user-verified-bidirectional-product-2026-09-05
tags:
  - companion
  - codex
  - pin
  - inbound
  - wal
---

# Codex Desktop 置顶权威在 sqlite，JSON 镜像会分叉且插件只看镜像

## Symptom

同一时刻 JSON `pinned-thread-ids` 与 sqlite `threads.thread_section_id = Pinned` 条数可以不一致（计数-only：镜像 2、分区 3、交集 1）。这是磁盘诊断，不是用户可见的双向失败。

## Wrong Assumption

把 JSON/sqlite 计数分叉当成「Codex 入站未实现」，因而要加 sqlite Pinned 分区 watcher。用户 2026-09-05 纠正：Codex 置顶双向已经实现（App→插件、插件→App 都会自动同步），这一轮只要记录，不要再做监视。

## Verified Root Cause

（候选，诊断）权威分区在 `~/.codex/state_5.sqlite`（活写入可在 WAL）。入站 watcher 盯全局 JSON：`readCodexDesktopUnreadIds` 附带 `pinMirrorLine`，变化才 `forceTasksOnly`。产品权威仍是 `thread/list` 的 `section`；写出站已是 `thread/section/move` + `thread/read`。用户已确认该产品路径双向可用。磁盘分叉不等于侧栏与插件不同步。

## Correct Detection Order

1. 先问用户可见路径：App 置顶/取消是否进插件、插件置顶/取消是否进 App。已确认双向则不要当缺陷实现。
2. 计数-only 对比 JSON `pinned-thread-ids` 与 sqlite Pinned 分区，不要转储 thread id。
3. 对照主库 vs `-wal` mtime：WAL 热、JSON 停，只说明镜像可滞后。
4. 不要把 Cursor 的「整库 WAL 签名」照搬过来：Codex sqlite WAL 被会话活动高频改写，按整库签名会打满 membership 重扫。

## Prevention Rule

用户已确认 Codex Desktop 置顶双向满足要求时，**不要**加 `state_5.sqlite` Pinned 分区 watcher。产品入站权威是 `thread/list` `section`，JSON 镜像只作无 `section` 回退与未读同路重扫。只有用户报告 App→插件入站实际不同步时，才把本条候选升为实现门。

## Latest Applicable Implementation

- 镜像信号：[preload/index.js](../../../preload/index.js#L6808) `notePinMirror`；解析 [preload/index.js](../../../preload/index.js#L6821)
- 权威字段：[preload/codex/pin-bridge.cjs](../../../preload/codex/pin-bridge.cjs#L243) `codexThreadNativePinFields`
- 路径：[preload/codex/native-state-paths.cjs](../../../preload/codex/native-state-paths.cjs#L33)
- 核验记录：[spec.md](../../specs/260903/companion-pin-provider-sync/spec.md#L166)

## Alternative Route

- Status: `candidate`（磁盘计数分叉仍可复现；**2026-09-05 用户拒绝作为实现门**：双向已满足，只记录）
- Preconditions: 仅当用户报告 Codex Desktop 置顶/取消**没有**实时进插件。
- Steps: 对 `state_5.sqlite`+WAL 做 StatWatcher；只在 Pinned id 集合变化时 `forceTasksOnly`；保留 JSON 镜像作无 section 回退。
- Verification: 聚焦 bridge 用例（镜像不变、分区集合变 → 恰好一次重扫）；真机 Desktop 置顶/取消 ≤2s 进插件且恢复。
- Applicability boundary: Codex Desktop 原生线程入站。不含 CodexHost Host `pinned`、不含 Claude/Cursor。用户已确认双向可用时本路线不适用。
- Fallback: 当前产品路径：JSON 镜像变化或其他 membership 重扫 + `thread/list` `section`。

## Occurrence History

| 日期 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-09-05 | 按 Claude 同法核 Codex 入站 | 只盯 JSON 镜像，把计数分叉当缺陷 | 计数-only 对照 sqlite 分区 | 候选：镜像 2 / 分区 3 / 交 1 |
| 2026-09-05 | 用户：Codex 已经实现，是让你记录一下 | 把 F-1-a 当成 sqlite watcher 实现任务 | 撤回未完成 watcher；写入核验状态 | 用户确认双向；本条维持 candidate 诊断，Alternative Route 不适用 |
