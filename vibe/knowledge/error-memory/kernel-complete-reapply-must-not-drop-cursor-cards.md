---
id: eypc-kernel-complete-reapply-must-not-drop-cursor-cards
status: candidate
scope: project
fingerprint: kernel-v4-complete-package-reapply-rebuilds-only-canonical-keys__float-second-apply-drops-cursor-fold__preserve-cursor-after-view-projection
first_seen: 2026-08-21
last_verified: 2026-08-21
review_after: 2026-11-21
evidence:
  - src/domain/companionTaskPackage.ts
  - src/FloatApp.vue
  - tests/domain/companionTaskPackage.test.ts
  - vibe/specs/260818/1335-cursor-companion-feasibility/spec.md
tags:
  - companion-provider
  - cursor-companion
  - kernel-views
  - float
---

# 完整 Kernel package 二次投影不得丢掉 Cursor 卡

## 症状

Cursor 热路径已入队，Controller 已把 Cursor 卡折进 `taskState`，悬浮窗动态列表仍只有 Codex/Claude，没有「归属 Cursor」。

## 错误假设

假设 Float 再跑一次 `applyCompanionTaskPackageViews(snapshot.taskState, companionTaskPackage)` 是幂等的，只会刷新 Kernel 相位，不会改非 Kernel 来源。

## 已验证根因

Kernel V4 的 `tasks` / `views.groups` 只有 Codex/Claude 键。`applyCompanionTaskPackageViews` 在 `complete` 时按这些键重建 `conversations` 与动态分组。Controller 在其后 fold Cursor；Float 对已经 fold 过的 snapshot 再 apply 一次，Cursor 卡被剥掉。

## 检测顺序

1. 队列与 hooks 日志是否仍在增长（排除热通道）。
2. Kernel 诊断 `providers` 是否只有 codex/claude（属合同，不是开关证据）。
3. 对照 Controller fold 与 Float 的第二次 `applyCompanionTaskPackageViews`。
4. 用「源里已有 Cursor 卡 + 完整 Kernel package 只含 Codex」复现二次投影。

## 预防规则

完整 Kernel 投影之后必须按同一套 fold 把源里 `provider==='cursor'` 的卡折回动态分组。Float 不得假设第二次 apply 会保留非 Kernel 卡。回归必须覆盖「二次 apply 仍保留 Cursor running 卡」。

## 替代路线

- 状态：`candidate`（单测已覆盖；宿主重载后目视待做）。
- 前置条件：Cursor 为 Kernel 外独立 Provider，Float 消费完整 V4 package。
- 有序步骤：Kernel 投影 → fold 源 Cursor 卡 → 动态分组/compactCounts 含 Cursor。
- 验证：`pnpm exec vitest run tests/domain/companionTaskPackage.test.ts`。
- 适用边界：Cursor 冷/热卡；不把 Cursor 并进 Kernel V4。
- 回退：若 fold 与 Kernel 计数冲突，只改动态分组，不改 Kernel `sourceGenerations`。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-21 | Cursor companion 悬浮窗无卡 | 用户截图「没有效果」 | Float 二次 apply 只保留 Kernel 键 | apply 结束后同形 fold 源 Cursor 卡 | candidate |
