---
id: eypc-comparison-set-mixing-counter-and-timestamp-units
status: verified
scope: project
fingerprint: source-lane-generations__wall-clock-seeded-into-monotonic-counter-lane__single-unit-rule-per-comparison-set
first_seen: 2026-08-13
last_verified: 2026-10-10
review_after: 2027-01-10
evidence:
  - preload/index.js
  - preload/companion/task-kernel.cjs
  - tests/platform/companionTaskKernel.test.ts
tags:
  - companion-task-state
  - phase-ordering
  - evidence-provenance
---

# 同一比较集合内混用计数器与时间戳

## Symptom

某个 provider 的任务状态停止跟随真实变化：原生界面已更新，插件卡片长时间停在旧状态。运行诊断里对应来源的 `accepted` 极少而 `ignored` 极多，并伴随 `stale-lanes` 门禁反复触发。故障不是间歇性的——一旦发生就不再自愈。

## Wrong Assumption

以为是节流、丢事件或竞态，于是去查 watcher、轮询间隔和推送时序。也容易误以为「代数比较」天然安全，因为两侧都是数字且都单调递增。

## Verified Root Cause

`sourceLaneGenerations` 的三条 lane 语义不同：`phase` / `unread` 是 Provider 的单调**计数器**（三位数量级），`membership` 是库存读取的**毫秒时间戳**（1.78e12 量级）。三者被放进同一个比较集合，并通过两条路径互相污染：

1. 直接回退——`phase = activityGeneration || membership`，`unread = unreadGeneration || readAt`；
2. 聚合污染——`sourceGenerations = Math.max(membership, phase, unread)` 取到时间戳，而 lane 缺失时又回退到该聚合。

门禁写作 `generation > currentLanes.phase`。任何一条 lane 一旦持有时间戳，计数器**永远不可能超过它**，该 lane 就此永久失效，之后每一次真实代数都被判为过期。这不是精度问题，是不可恢复的单向失效。真实宿主日志里可直接看到 `currentLanes: {membership: 1786610822803, phase: 319, unread: 319}` 这种同结构混量纲。

## Correct Route

一个比较集合只允许一种量纲。

- 聚合只跨计数器（单点 `companionCounterAggregate`），绝不吸收时间戳。
- 时间戳 lane 只与自身比较，且不参与聚合、不接受计数器回退。
- lane 缺失取 `0` 表示「未观察」，由消费方判空；**绝不用另一条 lane 的值兜底**。
- 未声明的 `membership` 意为「本次不对成员关系作声明」= 继承当前值，而不是 0。把缺席读成「更旧」会让 phase-only 推送静默重塑成员关系。

需要同时表达「第几代」和「何时读到」时，用两个字段并让命名带上单位（`...Generation` 与 `...ObservedAt`），不要让一个数字回答两个问题。

与 [跨时钟时间戳比较](cross-clock-timestamp-comparison.md#L1) 是不同边界：那条是两个**同类**时间戳来自不同时钟导致比较恒假；本条是**异类**量纲混入同一集合导致该 lane 单向永久失效。检测手法可以互相借用，修复路线不可互换。

## Detection Order

1. 先看诊断里的 lane 数值本身：同一结构内出现数量级悬殊的数字即可确诊，无需复现。
2. 再回溯该 lane 的赋值链，重点查 `||` 回退与 `Math.max` 聚合——污染通常发生在这两处而不是比较处。
3. 最后才怀疑时序与丢事件。停滞型症状（永不自愈）指向量纲，间歇型才指向竞态。

## Occurrence History

- 2026-08-13：用户报告 Codex 任务状态不跟随。由真实宿主诊断日志定位，非复现推测。修复后 12 文件 476 项定向矩阵通过，新增 `source lane units` 两条回归锁定「聚合不得灌入 membership」与「未声明 membership 意为不变」。真机确认待用户重载。

## 2026-10-10 Codex 等待解除同类复发

- 触发：接受 canonical 问题回答后，请求已移除，但 Kernel 底层仍 completed。
- 失败路径：初次 canonical 等待没有活动计数，候选使用 observedAt 时间戳作序号；回答后的单调计数不能超过它。旧等待解除还可能复用前一次活动序号。
- 修复：初次可见 canonical 问题使用该实例的单调 observedSequence；接受回答关闭时发布新的同域活动序号。没有修改 Kernel 因果合同。
- 证据：[完整链路核验](../../specs/261010/0937-gpt-input-compat/verify.md#L1)、[桥接回归](../../../tests/platform/codexAppServerBridge.test.ts#L6512)。新增断言必须检查 waiting→running，而非只检查请求消失。

## Alternative Route

- Status: `verified`（当前受测 Codex canonical 等待生命周期）。
- Preconditions: 精确匿名问题实例与稳定单调序号来源。
- Ordered steps: 先比较同一因果集合的量纲；沿回退与聚合定位污染；初次等待与回答关闭均使用单调计数；时间戳仅表达时间；保持真实终态仲裁。
- Verification: 接受回答恢复运行、旧快照不复活、新问题仍等待的桥接回归通过；同轮 completed 防误恢复通过。
- Applicability boundary: 不把源到达顺序认作新 Turn，不覆盖其他未答问题或真实 completed。
- Fallback: 缺少精确证据时保持未决/恢复来源，不制造巨大序号强行压过内核。
