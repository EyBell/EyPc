---
id: eypc-dedup-set-wider-than-projected-set
status: verified
scope: project
fingerprint: cross-provider-dedup__suppression-key-set-built-from-all-sources__projection-filters-some-sources__filtered-source-suppresses-peer-and-produces-nothing__row-disappears
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - src/domain/claudeCode.ts
tags:
  - aggregation
  - dedup
  - inventory-stability
  - iron-rule-inventory-dropout
---

# Dedup Set Wider Than The Projected Set

> **Current implementation note (2026-08-07).** 触发本记录的 CLI + desktop 跨 lane 去重已删除。现行 [Code-mode domain](../../../src/domain/claudeCode.ts#L1) 保留 App 的每个本地包装行，歧义只让 phase=`unknown`，不压制或合并行。本记录只在未来真的引入“来源压制替代物”时适用，不能作为恢复去重的依据。

## Symptom

用户在 Claude 桌面端把一个 Cowork 会话归档后，EyPc 里一条**仍在运行的 Claude Code CLI 会话**
整条从卡片列表消失——不是变成已完成、不是被隐藏，是彻底不见。

## Wrong Assumption

以为"去重集"和"卡片集"来自同一批数据，所以可以各自独立构建：去重集用全部桌面会话元数据，
卡片集用投影函数的输出。

## Verified Root Cause

两个集合的**过滤条件不一致**：

- `projectClaudeDesktopTaskCards` 跳过 `isArchived` 的会话（不产卡）。
- `claudeDesktopCliSessionIds` 收全部会话的 `cliSessionId`（**含归档**）。

于是一个归档的桌面会话既压制了它包裹的 CLI 卡，又不产出任何替代卡片，净效果是**删除一行**。
调用方 `codexController` 传的正是全量 metadata，所以真机上一触即发。

这违反项目既有铁律「快照缺失不等于删除」的同一精神：一个来源退出投影，不该连带删掉别人的行。

## Detection Order

1. 有行"消失"而不是变状态 → 查是否存在压制/去重逻辑。
2. 对比"构建压制集的输入"与"构建可见集的输入"：**任何过滤条件差异都是缺陷**。
3. 构造：被过滤来源 + 与之同键的对端行，断言对端行仍在。

## Prevention Rule

**压制权只属于真正产出了替代物的来源。** 去重集必须从"最终产出卡片的那批来源"反推，
而不是从原始输入集合。本仓的修法是在 `claudeDesktopCliSessionIds` 里同样跳过 `isArchived`；
更稳的形态是让合并函数只收一份 observations、自己完成投影+去重，从结构上消灭"两个可以互相
矛盾的入参"。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核发现，补「归档不得删除对端 CLI 卡」回归断言 |
