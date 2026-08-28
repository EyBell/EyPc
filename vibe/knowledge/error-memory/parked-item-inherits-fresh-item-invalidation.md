---
id: eypc-parked-item-inherits-fresh-item-invalidation
status: verified
scope: project
fingerprint: reused-an-existing-attention-queue-for-a-parked-set__progress-key-invalidated-by-lifecycle-timestamps-that-mean-new-instance-for-the-original-set__parked-item-had-no-new-instance-so-any-field-drift-reset-its-visit__walk-jumped-back-and-never-reached-the-tail
first_seen: 2026-08-28
last_verified: 2026-08-28
review_after: 2027-02-28
evidence:
  - preload/companion/task-kernel.cjs
  - tests/platform/companionTaskKernel.test.ts
  - vibe/specs/requirements/shared-raw-183.md
tags:
  - codex-companion
  - local-pin
  - attention-queue
  - visit-progress
---

# 把「暂存项」并进「新鲜项」的队列时，它继承了不该继承的失效规则

## Symptom

用户复核时发现「已完成已读」置顶项的**跳转顺序错乱**：按快捷键连续遍历，会跳回刚看过的那条，队尾的项永远轮不到。用户的判断是「顺序应该是固定的才对」。

## Wrong Assumption

**「把置顶项接进已有的注意力队列，就等于让它可达了。」** 队列的排序、派发、去重都是现成的，接进去后功能确实能用——于是没有再检查这条队列的**进度失效规则**对新接入的这类项是否成立。

## Verified Root Cause

排序本身没有问题：队列与列表渲染用的是同一个比较器（`lastQuestionAt` 降序 → `createdAt` → `key`），而 `lastQuestionAt` 不做成员聚合，对置顶项是稳定的。

错乱的是**遍历进度**。`attentionInstance` 用「生命周期时间戳」作为「这一项我看过了」的身份：

    const enteredAt = Math.max(statusEnteredAt, terminalAt, turnStartedAt, revisionAt)
    return `${kind}:${task.key}:${enteredAt}`

这个规则是为**已完成未读**设计的：新一轮 Turn 完成会抬升这些时间戳，那确实是一个值得再看的新实例。但对一条**置顶的已完成已读**任务，根本不存在「新完成」——它却继承了同一套失效规则。而聚合根的这四个字段全部是 `max(成员)`，子任务一有动静就抬升，于是这条任务的「看过」记录被 `pruneAttentionProgress` 当作失效删除，下一次按键又跳回它。

一句话：**队列复用了，语义没复用对。**

## Evidence Boundary

- 进度键层面的敏感性已用[聚焦测试](../../../tests/platform/companionTaskKernel.test.ts#L1276)复现：修复前红、修复后绿。
- 聚合根四字段为 `max(成员)` 由[源码](../../../preload/companion/task-kernel.cjs#L1446)确认。
- **未端到端复现**「某个成员推进 → 根的字段被抬升」这一条生产触发链：用合成聚合根构造的测试在修复前也是绿的，说明 lane 版本门禁会拦下部分推进。生产触发路径属**代码阅读推断**，不是实测；用户的真实症状与之一致，但不足以称为已证。

## Correct Detection Order

1. 先分清**排序**与**遍历进度**——「顺序错乱」的体感两者都会造成，但修法完全不同。比较器是否确定、输入是否稳定，几行代码就能判定，先排除它。
2. 再看进度/去重键由什么构成，以及**这些输入对新接入的这类项是否还有原来的含义**。
3. 只有确认键的语义成立后，才去怀疑触发端（快捷键、缓存）。

## Prevention Rule

**把一类新对象接进已有队列时，要连它的「进度/去重/失效」规则一起复核，而不只是排序与派发。**

- 问一个具体问题：*对这类新对象，「出现了一个值得再看的新实例」意味着什么？* 若答案是「不存在这种事」（暂存、归档、置顶待查这类**静止**对象），那它的进度身份就必须是**固定**的，不能挂在任何会漂移的字段上。
- 聚合根上凡是 `max(成员)` 的字段，都不能用来表达「这一项本身变了」——它表达的是「这一家子有动静」。
- 静止对象的进度只应由两件事结束：整轮走完后的重置，或它离开队列。

## Latest Applicable Implementation

`attentionInstance` 对**置顶分组**（`dynamicGroup === 'pinned'`，即已完成已读与 `unknown` 两类）返回固定身份 `${kind}:${key}:pinned`；其余保持生命周期锚点，并把 `revisionAt`（纯变更计数、无实例含义）降为三个锚点全为 0 时的兜底，以保证键不为空。

判据读**分组**而非复述相位，是 2026-08-28 复发后的收紧：原实现把成员条件写成 `localPin && completed && !unread`，队列扩大时这份拷贝没跟着扩，泊位规则对新成员静默失效。

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-28 | RAW-183 置顶项遍历进度身份 | 用户复核置顶跳转顺序错乱，队尾永远轮不到 | `attentionInstance` 让「已完成已读的置顶项」继承为「已完成未读」设计的生命周期锚点，而聚合根四字段皆为 `max(成员)` | 对该类项返回固定身份 `${kind}:${key}:pinned` | verified；聚焦测试修复前红、修复后绿 |
| 2026-08-28 | 置顶单环修复（同日复发） | 入口队列扩到 `unknown` 置顶后，同一症状在新成员上重演 | 固定身份的判据写死为 `localPin && completed && !unread`，队列扩大时没跟着扩；`unknown` 置顶落回生命周期锚点 | 判据改读 `dynamicGroup === 'pinned'`，由分组 owner 决定谁是泊位项 | verified；反向红测确认修复前第二次按键重开队首（`['codex-a','codex-a']`），修复后为 `['codex-a','codex-b']` |

## Related

复发的直接原因不是本记录的进度语义，而是成员判据没有 owner——见 [membership-predicate-restated-at-every-consumer](membership-predicate-restated-at-every-consumer.md#L1)。
