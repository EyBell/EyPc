---
id: eypc-warm-cycle-entry-forces-inventory-refresh
status: verified
scope: project
fingerprint: complete-companion-cycle-entry__preload-forces-membership-before-kernel__reuse-complete-snapshot
first_seen: 2026-10-26
last_verified: 2026-10-26
review_after: 2027-01-26
evidence:
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/261026/task-cycle-freeze/task-card.md
tags:
  - companion-cycle
  - preload-entry
  - snapshot-reuse
---

# 热态任务循环入口重复强刷库存

## Symptom

Kernel 已有完整快照，固定上一／下一入口仍额外请求 Codex membership 强刷，再触发 Host reconciliation。只测 Kernel 会遗漏这个入口前置动作。

## Wrong Assumption

Kernel 内部不预检就能保证导航不刷新来源；主 Preload 的 `onPluginEnter` 仍在调用 Kernel 前无条件发起刷新。

## Verified Root Cause

实际 Preload VM 回放中，热态固定入口测得 `plugin-enter` membership 强刷从 0 增至 1。仅对已有完整快照的上一／下一跳过该前置动作后，正反两个入口均保持 0；普通主入口仍强刷，冷启动仍完成原 Provider preflight。

## Correct Detection Order

1. 从真实注册的 `onPluginEnter` 回调进入，包含其调用 Kernel 前的所有前置动作。
2. 分别验证完整快照、冷启动和普通主入口，不能用一个热态成功替代全部恢复场景。
3. 核对没有向 Renderer 再转发同一任务意图，没有改变状态或来源权限。

## Prevention Rule

固定上一／下一消费完整不可变快照；冷启动／缺口恢复与普通入口维持已有通路。后台来源监听独立维护成员，不以每次导航附带一次全量刷新作为正确性依赖。

## Latest Applicable Implementation

[入口](../../../preload/index.js#L1)、[真实回调的匿名回放](../../../tests/platform/codexAppServerBridge.test.ts#L1)、[任务](../../specs/261026/task-cycle-freeze/task-card.md#L1)。

## Alternative Route

- Status: verified（离线 VM）；不证明真实宿主卡死根因。
- Preconditions: V7 Kernel 已发布完整快照，入口为固定上一／下一功能码。
- Ordered steps: 识别功能码及快照完整性 → 完整时直接消费 Kernel → 冷／不完整或普通入口继续原恢复。
- Verification: 热态正反入口额外强刷为 0；普通入口及冷 preflight 保留，Renderer 不重复消费。
- Applicability boundary: EyPc V7 入口编排；不删除必要来源监听、冷恢复或独立用户刷新。
- Fallback: 快照不完整仍走已有恢复，不拿部分成员直接跳转。

## Occurrence History

| Date | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-10-26 | 固定全局上一／下一触发链排查 | 入口无条件强刷库存 | 完整快照复用 | 热态用例先红后绿；普通／冷恢复保留 |
