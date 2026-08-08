---
id: eypc-tests-that-cannot-fail
status: verified
scope: project
fingerprint: green-suite-hides-blockers__self-referential-assertion__impossible-fixture__sentinel-scan-instead-of-key-set__fixture-name-skipped-before-reaching-branch
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
  - tests/domain/claudeCode.test.ts
  - tests/platform/claudeBridge.test.ts
tags:
  - testing
  - assertion-quality
  - false-confidence
---

# Tests That Cannot Fail

> **Current implementation note (2026-08-07).** 下文用例名和字段属于已删除的 mixed-desktop suite；测试反证规则仍为 verified。现行 [Code domain tests](../../../tests/domain/claudeCode.test.ts#L1) 与 [bridge tests](../../../tests/platform/claudeBridge.test.ts#L1) 使用固定期望、精确键集、歧义/反例和 ordered-event 回放，旧 suite 不能作为当前通过证据。

## Symptom

Claude 桌面端 provider 报「27 项域测试 + 7 项桥测试 + 36 项 controller 测试全绿」，
而对抗复核在同一批代码里找出 2 个 blocker 和多个 major。测试数量增长被当成了覆盖增长。

## Wrong Assumption

以为绿色套件 + 递增的用例数 = 这些规则被验证过。

## Verified Root Cause

四种"不可能变红"的写法，各自放走了具体缺陷：

1. **自证式断言**——`expect(card.completionRevision).toBe(claudeDesktopCompletionRevision(done))`，
   并把同一函数的返回值当 receipt 喂回去。水位线定义怎么改都不会红。放走了"重命名把已读会话
   重新打成未读"。
2. **不可能的 fixture**——把 `auditUpdatedAt / lastEventAt / lastResultAt / lastActivityAt`
   设成同一瞬间。真机上这三套时钟必然有偏移。这一个选择同时放走了跨时钟比较 blocker 和水位线缺陷。
   参见 [cross-clock-timestamp-comparison](cross-clock-timestamp-comparison.md#L1)。
3. **哨兵扫描冒充键集断言**——`expect(JSON.stringify(result)).not.toContain('MUST NEVER SURVIVE')`
   只覆盖 fixture 里被主动投毒的那 3 个字段；真机元数据有约 40 个顶层键，将来透传
   `accountName` / `permissionMode` 该断言照过。隐私白名单等于没测。
4. **fixture 根本没进被测分支**——`local_broken.json` 不满足 `METADATA_PATTERN`（`r` 非 hex），
   在 `JSON.parse` 之前就被跳过，于是"安静丢弃损坏元数据"这条从未走到 catch。

## Detection Order

对每条测试问三句：

1. 断言的期望值是**字面量**，还是被测代码自己算出来的？后者一律重写。
2. 这个 fixture 在真机上**可能出现吗**？多个本应独立的字段取同一个值是最强信号。
3. 这个 fixture 真的**走到**了我要测的那行吗？（改一次被测代码让它必红，是最便宜的验证。）

## Prevention Rule

- 期望值写字面量；需要函数才能算出的期望值，说明断言的是实现而非契约。
- 独立来源的字段在 fixture 里必须**保持差异**（本仓 `MTIME_SKEW_MS`）。
- 白名单类断言用**精确键集**（`expect(Object.keys(x).sort()).toEqual([...])`），不用哨兵扫描。
- 新增守卫时顺手确认"去掉守卫，这条测试会红吗"。
- 与 [test-double-froze-an-invented-cross-module-contract](test-double-froze-an-invented-cross-module-contract.md#L1)
  同族：那条讲桩冻结了自造契约，本条讲断言冻结了自己。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核；四类写法全部重写后，新回归测试对两个 blocker 可红可绿 |
