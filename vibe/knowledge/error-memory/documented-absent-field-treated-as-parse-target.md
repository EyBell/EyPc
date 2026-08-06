---
id: eypc-documented-absent-field-treated-as-parse-target
status: verified
scope: project
fingerprint: upstream-documents-field-as-sometimes-absent__extractor-locates-key-then-scans-forward-for-delimiter__null-value-captures-the-next-object__good-cached-reading-overwritten__no-shell-level-test
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - preload/claude/scripts.cjs
  - tests/platform/claudeStatuslineScript.test.ts
  - https://code.claude.com/docs/en/statusline
tags:
  - claude-quota
  - statusline
  - shell
  - awk
  - upstream-contract
---

# A Documented-Absent Field Treated As A Parse Target

## Symptom

Claude 额度显示会周期性地自己变回「尚未读到额度」，没有任何错误，重开 Claude Code 跑一会儿又回来。

## Wrong Assumption

以为 `rate_limits` 在 statusline 载荷里要么存在、要么整个键不存在两种情况；把「键存在」等同于「值是对象」。

## Verified Root Cause

**上游明确文档化了第三种情况**：Claude Code 官方 statusline 文档写着
「the rate-limit fields don't exist for every render — right after a fresh `/clear` you won't see
them until the first API response of the new session」。也就是 `"rate_limits":null` 是**正常运行的
常态**，每次 `/clear` 之后都会出现。

而 awk 提取器的写法是「定位键名 → 取其后**第一个 `{`**」。值为 `null` 时，那个 `{` 就是载荷里
**下一个**对象（通常是 `model`），于是缓存被写成：

```json
{"version":1,"updatedAt":…,"rate_limits":{"id":"claude-opus-5","display_name":"Opus 5"}}
```

下游归一后无窗口 → `status:'idle'` → controller 用这份空快照**直接替换**上一份好读数
（因为它是真值，走不到 `staleClaudeQuota` 的保留分支）。这同时违反了本项目自己写下的
「旧读数标记 stale 而非丢弃」。

**为什么没被测出来**：提取逻辑是 shell + awk，而这一层**一个测试都没有**。JS 侧的单元测试
再多也证明不了它。

## Detection Order

1. 数据「有时候有、有时候没有」→ 先查上游文档**是否明确写了缺失条件**，而不是当成异常。
2. 任何「定位键名后向前扫描分隔符」的提取器：构造 `key: null`、`key: {}`、`key: "str"`、
   `key: 123` 四种值跑一遍。
3. 缓存类写入：构造「本次读不到」的场景，断言**上一份好数据仍在**。

## Prevention Rule

- 提取器必须要求**键紧邻其后的值**符合预期类型（跳过冒号与空白后判定首字符），而不是在整个载荷里
  找下一个分隔符。
- 「读不到」与「读到空」必须走同一条**不触碰缓存**的路径。
- **上游文档里写明的缺失条件属于契约的一部分**，要有对应的用例；接第三方推送字段前先读它的
  缺失/时序说明。
- shell/awk 这类非 JS 层要有**真实执行**的测试（本仓新增 `claudeStatuslineScript.test.ts`，
  用 `/bin/sh` 跑生成出来的脚本），否则该层等于无人看守。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：额度核验时发现；查官方 statusline 文档确认 `/clear` 后缺失是常态，实跑复现覆盖行为并修复，补 shell 层测试 |
