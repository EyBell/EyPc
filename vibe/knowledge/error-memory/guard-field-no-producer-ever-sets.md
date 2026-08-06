---
id: eypc-guard-field-no-producer-ever-sets
status: verified
scope: project
fingerprint: optional-field-declared-in-observation-type__branch-reads-it__no-producer-writes-it__branch-unreachable__reviewers-read-it-as-a-live-guard
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - src/domain/claudeDesktop.ts
  - src/runtime/codexController.ts
  - tests/domain/claudeDesktop.test.ts
tags:
  - domain
  - dead-code
  - false-guard
  - iron-rule-8
---

# A Guard Field No Producer Ever Sets

## Symptom

`ClaudeDesktopObservation.appRunning` 上挂着一条重要守卫：「App 已退出 + 证据新鲜 = 被打断，
不是完成」。桥全文从不产出该字段，controller 的归一函数也不映射它，所以分支**永远走不到**——
桌面端在一轮对话中途被退出时，卡片照旧在 3 分钟宽限后变成「已完成未读」。

代码读起来像"这条铁律有守卫"，实际没有。

## Wrong Assumption

以为可选字段先声明、"以后桥补上"是无害的占位。

## Verified Root Cause

`appRunning?: boolean` 是设计意图的残留：文件型只读数据源**根本证明不了进程存活**。
字段被写进类型、被分支读取、被测试用假数据喂进去（测试自己构造 `appRunning: false` 从而
"通过"），于是三层都在自证一个真机上不存在的能力。

## Detection Order

1. 任何可选守卫字段：`grep` 生产者。只有类型定义 + 消费点、没有写入点即是本病。
2. 看测试：如果只有测试 fixture 在设置该字段，那测试测的是它自己。
3. 问一句"这个事实在这个数据源上**可观测**吗"——不可观测就不该有字段。

## Prevention Rule

- 不可观测的事实**不建字段**。删掉假守卫、把限制写进注释与验收清单，比留一个看起来安全的
  死分支诚实。
- 若确需占位，回归测试必须断言**当前行为**（本仓改成断言"永远不报 stopped"），这样将来真接上
  liveness 信号时，该测试会红——红在正确的地方。

## Alternative Routes

- 真要 liveness：需要进程枚举或窗口清单能力，成本与权限都不在只读文件桥的范围内。
  记入 P6 待办而非偷偷留字段。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核发现，删除字段与分支，改为显式"永不 stopped"断言 |
