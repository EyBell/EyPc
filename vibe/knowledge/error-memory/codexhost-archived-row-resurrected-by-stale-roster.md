---
id: eypc-codexhost-archived-row-resurrected-by-stale-roster
status: verified
scope: project
fingerprint: codexhost-external-row-persists-after-desktop-archive__stale-roster-republish-beats-tombstone__removal-only-on-full-membership
first_seen: 2026-09-02
last_verified: 2026-09-02
review_after: 2026-12-02
evidence:
  - preload/codex/codexhost-discovery.cjs
  - preload/index.js
  - preload/companion/task-kernel.cjs
  - src/runtime/codexController.ts
  - tests/platform/codexhostDiscovery.test.ts
  - tests/platform/codexAppServerBridge.test.ts
tags:
  - codexhost
  - archive
  - membership
  - stale-cache
---

# CodexHost 额外进程在 Codex 归档后仍留在列表：过期 roster 复活了已归档行

## 症状

在 Codex Desktop 侧栏归档一个 Grok/Pi 等额外进程会话后，EyPc 展开卡里那一行不消失，反而以「待继续 · 刚刚」重新出现；点击它，Codex 弹出「This task is archived · Unarchive and open」。约一到两分钟后才自行消失。

## 错误假设

以为 Host `thread list` 还在返回已归档线程，或 EyPc 的 12 秒列表缓存太长。实测 Host 在归档后 1 秒内就把它从 live 列表剔除（discovery count 6→5），mapping-store `archived: true`。

## 已验证根因

三步叠加（2026-09-02 18:49:22 样本）：

1. Desktop `thread-archived` 到达，EyPc 发出 `archivedKeys` 删除，Kernel 记 tombstone（stopped 0）。
2. 同一时刻已在跑的一次库存扫描用的是**归档前缓存的 Host roster**（空闲 roster 刷新不阻塞扫描），400 ms 后把该行连同更新的 membership revision 一起再发布；Kernel 的 tombstone 规则「更新的 membershipRevision 可复活」被它击穿（stopped 1）。
3. 下一次新鲜 Host 列表已无该 id，但增量扫描对额外进程 id 从不发出删除（官方 membership 对账明确跳过外部 key），Controller 的 inventory-dropout 守卫也只是在 3 秒后「接受删除」而不产生 Kernel 删除；直到下一次完整 membership 发布（`desktop-ipc-connected` / `plugin-enter` 冷预检）行才消失。

## 修复

- `thread-archived` 处理时同步调用 `codexhostForgetThread`，并在 discovery 里给被遗忘 id 一个 30 秒抑制窗：窗内仍带着该 id 的 Host 列表页不得把它重新入座，只有不再列出它的完整列表才释放；窗后再出现视为 unarchive。
- 完整 Host 列表少掉的 id 由 discovery 记为 removed，下一次扫描开头 drain 成 `archivedKeys` 删除；降级（partial）扫描不产生删除。
- 发布前对额外进程行做最后一次过滤：roster 已不含的 id 不进 `sanitizeCodexThreads`。

## 检测顺序

1. 诊断日志看 `task-recovery/codexhost-discovery` 的 count 是否在归档后立刻下降；下降了就不是 Host 问题。
2. 看 `codex-evidence-v7 archivedCount:1` 之后是否紧跟一次 `codexhost-published discovered` 仍含旧数量的发布，以及 `group-counts-changed` 的 stopped 0→1。
3. 看 `inventory-dropout accepted-as-deletion` 之后 stopped 是否仍为 1，直到某次 `codex-inventory-membership` 才归零。

## 预防规则

任何会让一行「消失」的信号（归档、Host 列表剔除）都必须同时清掉扫描端的缓存来源，否则缓存会在 tombstone 之后以更新的 revision 把行送回来；额外进程 id 的删除不能寄希望于官方 membership 对账。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-02 | 已归档额外进程残留行核查 | 用户在 Codex 归档 Grok 会话后 EyPc 仍显示「待继续 · 刚刚」 | 先怀疑 Host 列表与 12 秒缓存 | 定位「归档删除 → 过期 roster 复活 → 增量扫描不删外部 id」三步；遗忘抑制窗 + 列表 removal drain + 发布前过滤 | 4 文件 188/188；host reload pending |
