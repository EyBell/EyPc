---
id: eypc-producer-built-before-checking-the-consumer-can-express-it
status: verified
scope: project
fingerprint: built-evidence-producer-end-to-end__consumer-suppressed-that-state-by-contract__feature-ran-green-and-changed-nothing__discovered-only-when-writing-the-first-integration-test
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - vibe/specs/260806/2147-claude-open-in-desktop-app/unread-authority.md
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
  - src/domain/claudeCode.ts
tags:
  - design-sequence
  - contracts
  - verification-evidence
---

# A Producer Built Before Checking the Consumer Could Express It

> **Current implementation note (2026-08-07).** 本记录的设计顺序教训仍为 verified，但“消费侧不产生 Claude 未读”只描述已删除的 mixed-desktop 领域模型。现行 [Claude Code domain](../../../src/domain/claudeCode.ts#L1) 已把原生 unread 作为 completed phase 的正交维度，并通过 [current verification](../../specs/260807/claude-code-companion-authority-reset/verify.md#L1)。不得据本记录恢复旧回执/差分路线或断言当前 UI 无法表达未读。

## Symptom

要给 Claude 桌面端任务补「已读同步」。取证顺利：找到 App 存未读小点的 key，确认它是活的，于是一路建完了生产侧——

- 桥的 `readUnreadSet()`（10 项测试，全绿）
- domain 的归一与「离开集合 = 已读」差分（5 项测试，全绿）
- state 持久化基线、facade 端口、平台类型
- controller 里把差分写成已读回执

全部通过。然后写第一个 controller 集成测试，断言角标从 1 变 0——**结果是 0 变 0**。

当时的消费侧根本不产生未读：已删除的旧 `completedState` 合同让桌面端会话一律落 `completed` + `unreadState: 'unknown'`。回执写下去无人消费，整条链路是空转的。

## Wrong Assumption

**「补上证据来源」被当成了「补上功能」。** 用户的说法（App 里小点没了）自带一个前提——EyPc 这边有个对应的未读要清。这个前提没有被核对，就直接进了实现。

更具体地说：验证了「我能不能产出这个信号」，没验证「产出之后有没有人会因此改变行为」。前者绿灯很容易给人已经在推进的错觉。

## Verified Root Cause

那条合同是几轮前**为了应对当时没有已读来源**而立的：无来源 → 无法证明已读 → 一个清不掉的角标比不显示更糟 → 干脆不产生未读。

所以新来源和旧合同不是叠加关系，是**替换**关系。正确的改法根本不是加一个回执生产者，而是把合同里的权威换掉：App 的集合直接做权威，卡片镜像它。改对之后，先前写的差分逻辑整块删除。

## Cost

一轮反向的实现（差分 + 回执 + 4 项断言错误行为的测试），全部自我推翻重写。所有代价都发生在**第一个跨层测试之前**。

## Rule

**动手写生产者之前，先确认消费者能表达这个结果。** 顺序是反的就会白做：

1. 用户描述里隐含的状态前提，先在代码里核对一遍是否成立——尤其当那个状态是「显示/角标/计数」这类由投影层决定的东西；
2. 先写那个会失败的跨层断言（角标 1 → 0），再往下建生产链。它是最便宜的前提检查，而单元测试全绿完全不能替代它；
3. 遇到既有合同挡路时，读它**为什么**存在。若它的理由正是「缺少你现在拿到的这个东西」，那就是替换而非叠加——继续在它旁边加生产者，只会造出一条空转的链路。

一条链路的每一层都绿，不代表这条链路做了任何事。
