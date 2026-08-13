---
id: eypc-claude-metadata-activity-is-not-completion-evidence
status: verified
scope: project
fingerprint: claude-state-source-selection__metadata-activity-time-retires-live-append-phase__provenance-gated-history-supersession
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2026-11-13
evidence:
  - preload/claude/code-sessions.cjs
  - preload/claude/app-state.cjs
  - tests/platform/claudeBridge.test.ts
tags:
  - claude-companion
  - phase-ordering
  - evidence-provenance
---

# Claude Metadata Activity Is Not Completion Evidence

## Symptom

用户产出计划后等待批准，EyPc 卡片停在上一个状态完全不变，且状态时间为空。同类现象适用于任何长时间停留的 `waiting-approval` / `waiting-input`：状态被冻结在历史完成态，`statusEnteredAt` 缺失。仅在插件重载后的首次读取起效，因此容易被误当作偶发。

## Wrong Assumption

以为 `waiting-approval` 没有被识别出来，根因在分类逻辑——例如 `ExitPlanMode` 未被列入「阻塞于用户的工具」。实证否定了这条：App 私有日志确实发出 `Emitted tool permission request <id> for ExitPlanMode in session local_<id>`，行型与解析正则完全匹配；Hook 也确实发出 `PermissionRequest`，且该映射自 Claude provider 首次接入即存在。两条通道都正确产出了 `waiting-approval`。

## Verified Root Cause

失败发生在**状态来源选择**，不是分类。`completedEvidenceAt()` 在首次观察一个会话时（`previousBySession` 无该条目，即插件重载后的冷启动）直接返回 `session.lastActivityAt`，把「会话最近有活动」当成「上一个 Turn 完成于此刻」。

`lastActivityAt` 在**同一个尚未结束的 Turn 内**持续推进，且是毫秒精度；而 App 日志时间戳是秒级截断（`YYYY-MM-DD HH:MM:SS`）。因此该水位必然大于待批准证据的时间，`selectProjectedStateSource()` 判定 `appSupersededByHistory` 与 `hookSupersededByHistory` 同时成立，落到 `history` 分支，投影为 `phase: 'completed'`、`waitingApprovalAt: 0`。`statusEnteredAt` 只在 `waiting-*` 与 `completed-unread` 计算，于是整个字段被 `...(statusEnteredAt ? {} : {})` 省略——状态冻结与时间缺失是同一个根因的两个症状。

更糟的是保留路径：`completedTurns` 未增加时会 `return numberOf(previous.completedEvidenceAt)`，把这个冷启动猜测**无限期保留**，直到下一个 Turn 真正完成为止。

## Correct Route

元数据活动时间是「完成」的代理指标，不是完成的证据。它可以退休一个只靠冷重放或推断得到的相位，但不得退休**直接观察到的实时 append**。判别依据用系统已经计算好的 `evidenceProvenance`，而不是时间戳大小：

```js
const liveObserved = (entry) => entry?.evidenceProvenance === 'live-append'
const appSupersededByHistory = livePhase(exactApp) && !liveObserved(exactApp) && historyAt > appAt
```

冷重放的 live 相位已在 `app-state.cjs` 上游被降级为 `unknown`，因此这里不需要第二道时间戳防线；保留时间戳比较只用于没有 provenance 的证据。真正的完成仍由 exact terminal event 关闭分支。

不要改成「把 ExitPlanMode 加进某张工具白名单」——分类本来就是对的，那样只会在没坏的地方加一处硬编码，并留下一组永远绿的回归。

## Detection Order

1. 先确认信号是否真的到达：查 `~/Library/Logs/Claude/main.log` 的 `Emitted tool permission request` 行型，以及 hook 队列 `eypc-claude-events.jsonl` 的事件序列。
2. 再确认分类：两条 lane 各自产出什么 phase。
3. 最后才查来源选择与 `historyAt` 水位——冻结型症状（状态完全不变 + 时间缺失）几乎总是指向这一层，而不是分类层。
4. 冷启动特异性是关键线索：只在插件重载后首次读取出现，说明问题在「无 previous」分支。

## Occurrence History

- 2026-08-13：用户在计划待批准窗口现场发现。先由 App 日志与 hook 队列取证推翻分类假设，再以 `tests/platform/claudeBridge.test.ts` 的 `metadata activity versus a live App append` RED 回归钉死来源选择，修复后 12 文件 472 项定向矩阵全通过。
