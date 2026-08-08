---
id: eypc-cross-clock-timestamp-comparison
status: verified
scope: project
fingerprint: state-machine-orders-two-timestamps__fields-come-from-different-clocks__file-mtime-vs-in-line-timestamp__comparison-always-false__terminal-rule-never-fires
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - preload/claude/events.cjs
tags:
  - state-machine
  - timestamps
  - domain
  - iron-rule-8
  - test-fixture-blindness
---

# Cross-Clock Timestamp Comparison

> **Current implementation note (2026-08-07).** 下文函数/字段属于已删除的 mixed-desktop lane。跨时钟不可排序的规则仍为 verified；当前 Claude phase 使用 [同源 Hook 事件水位](../../../preload/claude/events.cjs#L1)，不得把旧 mtime/metadata completion heuristic 恢复为兜底。

## Symptom

Claude 桌面端会话的「回合完成」判定在真机上几乎永不触发：一轮对话结束后，卡片继续显示
"进行中"约 30 分钟（直到事件新鲜度天花板到期才翻成 completed-unread），未读角标同步迟到。
单元测试 27 项全绿。

## Wrong Assumption

以为 `lastResultAt`（result 行的时间戳）和 `auditUpdatedAt`（审计文件更新时间）是同一个时间轴上
的两个点，可以直接比大小来表达"这条 result 之后没有更新的内容了"。

## Verified Root Cause

一个观察对象里混进了**三套时钟**：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `lastEventAt` / `lastResultAt` / `lastPermission*At` | 审计行内的 ISO 时间戳 | Claude 桌面端写行时打的 |
| `auditUpdatedAt` | `stat.mtimeMs` | 宿主墙钟，**写完那一行之后**才落 |
| `metadata.lastActivityAt` | App 写的 epoch ms | 且重命名/归档也会重写 |

`lastResultAt >= auditUpdatedAt` 里两边分属不同时钟，而 mtime 恒比它所写那行的行内时间戳晚几毫秒，
所以该条件**恒为 false**，整条完成规则不可达。

同一个混用还污染了完成水位线：`claudeDesktopCompletionRevision` 把 mtime 与元数据心跳一起取 max，
而这两者在**重命名会话**时都会前移 —— 于是用户改个会话名，已读的完成会话就被重新打成未读
（并让手动隐藏的卡片重新冒出来）。

**为什么测试没抓到**：所有状态用例都把 `auditUpdatedAt === lastEventAt === lastResultAt ===
lastActivityAt` 设成同一瞬间——一个真机上不可能出现的值。这**一个** fixture 选择同时放走了上述
两个缺陷。

## Detection Order

1. 状态机里任何两个时间字段比大小 → 先问"这两个字段是同一套时钟吗"。
2. 查字段来源：`stat.mtimeMs` / 行内 `timestamp` / App 自写 epoch —— 三者互不可比。
3. 查该规则对应的测试 fixture：若多个时间字段被设成同一个值，该规则**没有被真正测过**。

## Prevention Rule

- 观察对象的类型定义里**逐字段标注时钟归属**（本仓用 `Clock A / Clock B` 注释），只有同时钟字段
  可以互相排序。
- 跨时钟的问题要在**两个事实同源的那一层**回答。本例的"result 之后还有没有内容"由桥回答
  （`auditTailUnparsed`：尾窗里有没有解析不出来的内容），而不是由域拿两套时钟去猜。
- 分开两个函数：`claudeDesktopActivityAt`（排序/闲置用，宽松、含弱证据）与
  `claudeDesktopCompletionRevision`（读回执水位线，**只认内容证据**）。混用即复发。
- 测试 fixture 必须让各时钟**保持偏移**（本仓 `MTIME_SKEW_MS`），并对"mtime 晚于行时间戳"这件事
  本身下断言。

## 修这条时引入的次生缺陷（同日发现并修复）

把 `claudeDesktopCompletionRevision` 收窄成纯内容证据是对的，但**没有反查还有谁在跟这个值对账**。
`claudeCards` 的隐藏对账用它、而 `hide()` 存的是 `card.revisionAt`（当时含 mtime 偏移），
两者相差几毫秒、严格相等恒不命中 → 「隐」变成**假成功**：返回 `true`、弹「已移入已隐藏区」，
卡片纹丝不动。收窄前两个表达式恰好同值，所以是这次修复引入的。

**追加预防规则**：收窄或改变任何**跨模块共享的水位线/修订号**之前，先 `grep` 它的全部消费方，
逐个确认对账口径。更稳的形态是让消费方直接读卡片上已投影好的字段，而不是各自重算——
Codex 就是这么做的（`revisionAt` 由 `completionRevision` 派生，`codex.ts:1722`），
两条 Claude lane 现已统一为「先投影、再按卡片自己的 `revisionAt` 过滤」。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核发现；改判为同源事实 + fixture 拆开三套时钟后回归测试可红可绿 |
| 2026-08-06 | 追加：修复本身打断了隐藏对账（假成功）。统一为单一 revision 货币，比较改 `>=` 对齐 `codex.ts:1761`，controller harness 的塌缩时钟 fixture 一并修掉 |
