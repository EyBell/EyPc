---
id: eypc-prose-range-overreaches-the-clauses-it-names
status: verified
scope: project
fingerprint: prose-records-a-supersession-as-a-clause-range__range-includes-a-clause-later-work-actually-depends-on__read-each-clause-and-each-claimed-superseder-before-mapping
first_seen: 2026-08-15
last_verified: 2026-08-15
review_after: 2026-11-15
evidence:
  - vibe/specs/requirements/conflict-register.md
  - vibe/specs/requirements/shared-raw-163-clause-053.md
tags:
  - engineering-contracts
  - requirement-governance
---

# 散文范围比它点名的条款更宽

## Symptom

冲突登记里写着「第 50–53 条 main-first 展示门槛被 RAW-164 取代」。把这个区间机械展开成四条精确边之后，其中一条会把**仍在生效的契约标成已取代**。

第 53 条根本不是展示门槛——它要求分支证据携带 `main/side` 角色与分支级 unread。取代方 RAW-164 的另一条（#57）以及更后面的 RAW-166#77 **都依赖它**，后者还把它细化成三条独立 lane。它是 `refined-by`，不是被取代。

## Wrong Assumption

以为「区间是连续的，所以区间里的每一条都同质」。写下 `50–53` 的人是在**概括一片相邻内容**，不是在逐条判定；相邻只说明它们写在一起，不说明它们同生共死。

更隐蔽的一层：这个区间**读起来完全合理**。四条确实都在同一个 RAW 下、确实都谈父子任务展示、确实都在同一次改动的讨论范围内。错误不会在阅读时暴露，只会在展开成机器可读的边之后，以「某条需求悄悄不再被强制」的形式出现。

## Correct Model

**把范围散文变成精确边时，逐条回到来源读原文，并且同时读被点名的取代方。** 两个方向都要问：

1. 这一条真的属于被取代的那类吗？
2. 取代方有没有哪一条**反而依赖**它？

第二问是关键——依赖关系是最强的反证。一条被后续条款引用、细化或建立其上的需求，不可能同时是被它取代的。

配套的两条：

- **局部取代要停在局部。** 只有一部分被取代的条款保持 `active` 并用带 scope 的关系表达；把整条状态翻成 `superseded` 会让仍生效的部分一起失效。
- **不是所有 scope 都能升级。** 有的 scope 描述的是一条需求的某个**侧面**（`appearance`、`interaction`），不是它的一部分条款——这类关系已经处在最精确形态，强行细化只会造出假精度。

## Related

- [Behavior check cannot prove a derived value unchanged](behavior-check-cannot-prove-derived-value-unchanged.md#L1)
- [Superseded rule cited as authority](superseded-rule-cited-as-authority.md#L1)
