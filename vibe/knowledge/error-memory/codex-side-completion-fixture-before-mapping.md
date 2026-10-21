---
id: eypc-codex-side-completion-fixture-before-mapping
status: verified
scope: project
fingerprint: codex-side-completion-test__terminal-injected-before-desktop-side-mapping-admission__wrong-family-cancellation-diagnosis__await-topology-before-testing-mapped-member-completion
first_seen: 2026-10-13
last_verified: 2026-10-13
review_after: 2027-01-13
evidence:
  - tests/platform/codexAppServerBridge.test.ts
  - scripts/check-companion-lifecycles.mjs
  - tests/scripts/companionLifecycles.test.ts
  - vibe/specs/261013/1425-codex-side-phase/lifecycle-verify.md
tags:
  - codex-companion
  - test-fixture
  - lifecycle-ordering
---

# Side 完成夹具先于映射接纳导致误判

## Symptom / Wrong Assumption

新增“另一个 Side 仍待输入”组合缺少 completed 成员，误归因为等待分支取消了家族的完成核验，尝试改取消规则仍失败。

## Verified Root Cause

夹具连续推送 Desktop Side 快照后立即注入 App Server 完成，尚未推进受控事件循环，父子映射未接纳；完成没有进入已映射成员通路。运行场景被自动快照核验补足，待输入场景不走这类核验，形成非对称失败。推进映射接纳后再发完成，原 HEAD 源码通过两个场景；所有运行逻辑试改已撤回。不能把该人工竞态当真实日志中 Side 状态错误的原因。

## Detection Order / Prevention Rule

1. 明确核验的是已映射成员完成，还是完成先于发现的独立恢复场景，不混用前提。
2. 检查夹具是否已接纳 Side 快照和父子关系；用受控事件循环推进，不用真实睡眠猜时序。
3. 再注入匹配成员完成，核对实际定向查询和私有成员终态，然后断言 Kernel 相位、根未读、分组与归档保护。
4. 失败时先对照原源码和事件接纳顺序；单个新夹具失败不能证明某条取消通路有错。
5. 保留原断言，错误夹具不能用放宽业务预期修绿；新增两个正确时序场景独立保留。

## Latest Applicable Implementation

- [生产 Bridge 组合回归](../../../tests/platform/codexAppServerBridge.test.ts#L8054)。
- [独立生命周期 gate](../../../scripts/check-companion-lifecycles.mjs#L112)。
- [核验边界](../../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L105)。

## Alternative Route

- Status: verified（受控夹具与 source/packaged 检测）。
- Preconditions: 核验已映射 Side 完成；成员关系、IPC owner 与完成事件均使用合成数据。
- Ordered steps: 接纳快照/关系；推进事件循环；发成员完成及明确 unread；核对仍运行/待输入成员；核对唯一根卡与 unread。
- Verification: 两个 Kernel 组合通过，原 defer 回归保留；独立 gate 补齐运行→全完成与等待优先，并拒绝丢弃终态 Side unread 的坏实现。
- Applicability boundary: 不证明真实现场 Side 因果链已发生；不覆盖完成先于发现的恢复合同。
- Fallback: 缺映射/成员终态现场证据时标为待证，不改运行逻辑填补证据缺口。

## Occurrence History

| Date | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-10-13 | Side 完成后根状态/未读续核 | 夹具未接纳映射即发完成；误诊取消通路 | 修正事件前提、撤回试改，原运行源码通过 | 原执行通路未改；组合回归与自动检测补齐 |
