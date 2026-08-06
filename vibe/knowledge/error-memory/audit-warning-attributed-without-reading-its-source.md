---
id: eypc-audit-warning-attributed-without-reading-its-source
status: verified
scope: project
fingerprint: audit-warning-appeared-after-my-edit__assumed-causation-from-timing__never-read-what-the-check-measures__metric-was-insensitive-to-my-change__wrong-self-attribution-reported-to-user
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - AGENTS.md
  - CLAUDE.md
tags:
  - verification-evidence
  - attribution
  - review-process
  - tooling
---

# An Audit Warning Attributed Without Reading Its Source

## Symptom

改完 `AGENTS.md` 后跑 CodeNote 的 `audit_ai_rules.py`，报：

```
warning: owned global + project AGENTS context is 1759 characters; preferred maximum is 1600
```

因为「我刚改过 `AGENTS.md`」，就向用户报告这条告警是我造成的，并据此去精简文件。

告警与本仓库无关。

## Wrong Assumption

**时序相关当成因果**：告警出现在我的改动之后，且名字里有 `AGENTS`，
于是认定是我的 `AGENTS.md` 撑爆了预算——全程没读这个检查到底在测什么。

## Verified Root Cause

`audit_ai_rules.py:1595-1625` 里，`owned_plus_project` =
`~/.codex/AGENTS.md` 的 owned 部分（4386 字符）+ `project_root/AGENTS.md`，
而 `project_root` 解析到的是 **CodeNote 仓库自身**（其 `AGENTS.md` 595 字符）。
EyPc 的 `AGENTS.md` **根本不参与这个计算**。

反证是现成的：我把 `AGENTS.md` 缩了 298 字节，重跑后数字**纹丝不动，仍是 1759**。
一个对我的改动完全不敏感的指标，不可能由我的改动引起。

同批的 `P0 rule-state manifest drift` 同样先于我的改动存在——由 CodeNote 自身 9 个
未提交文件（error-archive 新增、`communication-io.md` 修改）引起，全是我没碰过的文件。

## Detection Order

1. **先读检查的实现**，确认它测量的输入集合；名字里出现的文件名不代表它就是被测对象。
2. **要基线**：改动前先跑一次。没有基线就无法区分「我引入的」和「本来就在的」。
3. **做敏感度反证**：改动量明显但指标零变化 → 该指标不测量你改的东西，归因立即作废。
4. 跨仓库告警先查**归属**：`git status` 确认自己是否碰过那些文件。

## Prevention Rule

**归因需要证据，和结论一样。** 不能因为「告警出现在我的改动之后」就认领它；
在读懂检查测量什么、并取得改动前基线之前，正确的表述是**「归属待定」**，不是「这是我造成的」。

这与既有的「事实断言必须跑过而非读过」是同一条原则的另一面：那条讲**不能只读代码就下结论**，
这条讲**不能只看时序就认因果**。两者都要求可执行证据。
（同期记录 `superseded-rule-cited-as-authority.md` 覆盖前者，随其所属批次一并归档。）

错误认领的代价不只是浪费一轮精简——它会把**别人仓库的真实问题**记到自己账上，
让真正的 owner 永远看不到该修的东西。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：向用户报告告警系自己造成，读 `audit_ai_rules.py:1595` 后证伪——测的是 `~/.codex/AGENTS.md` + CodeNote 自身 `AGENTS.md`；缩减 298 字节而指标不变构成敏感度反证，两条 audit 结论均改判为先于本次改动存在 |
