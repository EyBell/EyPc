---
id: eypc-req-invariants-raw-168
qualified_source: SPEC-260810-1155-INSTALL-RUNTIME-DIAGNOSTICS::RAW-168
status: active
domain: engineering-invariants
authority: agent-transcribed
scoped_relations:
  - kind: superseded-by
    target: eypc-req-claude-raw-211
    scope: "SUPPORTED_APP_VERSIONS 作为版本准入名单的单点定义；不得再引入该名单"
---

# RAW-168 · engineering-invariants

> 正文由来源草案保存：[RAW-167 draft](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)。用户于 2026-09-01 确认该草案对原话的转述忠实，五条条款随之转 `active`；`authority` 如实保留 `agent-transcribed`，因为正文仍是转述而非用户逐字原话。

五处重复判断按同一原则收敛：proposal→canonical 接纳判定抽为单一出口；phase 集合抽为命名谓词并被 preload 与 renderer 共用；1 秒漏通知恢复收敛为单一策略常量；coalesce 窗口单点定义。Claude App 版本准入名单不得再引入（RAW-211）。收敛不得改变任何现行外部行为。

## 交付状态

**已交付（2026-08-14）。** 五处重复判断全部收敛，并各配防回归门禁。

| 判断 | 收敛前 | 收敛后 | 门禁 |
| --- | ---: | --- | --- |
| proposal→canonical 接纳 | 4 份 | `recordCompanionProposalOutcome` 单一出口 | — |
| phase 集合 | 词表 3 份 + live 2 份内联 + settled 2 份 + Kernel 自有谓词 + 渲染层 14 处 | [preload/task-phase.cjs](../../../preload/task-phase.cjs#L1) 与 [companionProvider.ts](../../../src/domain/companionProvider.ts#L121) 两侧各一 | 拒绝 preload 内重现内联集合或第二份谓词；钉住两侧成员一致 |
| 1 秒漏通知恢复 | 6 常量 / 5 文件 | [preload/timing-policy.cjs](../../../preload/timing-policy.cjs#L1) | 入口两个字面量由用例钉住同步 |
| App 版本准入名单 | 2 个独立 Set | 已删除；用例拒绝 `SUPPORTED_APP_VERSIONS` 回归 | 拒绝再引入版本准入 Set |
| `DEFAULT_COALESCE_MS` | 2 份 | timing-policy 单点 | 同上 |

## 2026-08-14 收尾：phase 层的真实规模是词表而非集合

原判断说「phase 集合」有 62 处内联。实测收尾时发现真正的重复不止于集合，还包括**词表本身**——`['running','waiting-input','waiting-approval','completed','stopped','unknown']` 在 Kernel 与入口各写一份共三份。集合可以由词表推出，词表却被复述；这是比集合内联更深一层的重复。

`preload/task-phase.cjs` 因此同时拥有词表与四类分组，且**谓词读词表而非复述它**：往 `TASK_PHASES` 加一个值不会对一个消费者已知、对另一个未知。

同轮补上此前未命名的 `isSettledTaskPhase`，并在定义处写明它**不是** `!isLiveTaskPhase`——`unknown` 不是 settled，未被观测的任务不等于已安定的任务。原先两处内联把这层刻意写成了字面量，读者看不出来。

放在 preload 顶层而非某个模块组，与 `timing-policy.cjs` 同理：两个模块组与入口都消费它，它不属于任何一组。

## 2026-08-14 追加：Action 启动结果判定

审计收敛残留时发现第六处同类重复，不在原清单里：`['ok','started','running','stopping']` 在 [preload/index.js](../../../preload/index.js#L1) 与 [codexController.ts](../../../src/runtime/codexController.ts#L1) 各写一份，回答「这次 Action 到底启没启起来」。分歧会让一侧计入而另一侧不计入同一次运行。

渲染层的 `isCodexActionStartAccepted` 落在 [codexEnvironment.ts](../../../src/domain/codexEnvironment.ts#L68)——outcome 联合类型本就在那里。两处都不写成 `outcome !== 'failed'`：`confirm-required` 与 `rejected` 是正常回答，却什么也没启动。

**CJS 与 TS 无法共享模块，因此跨层单点定义的实现形式是「两侧各具名 + 用例钉住成员一致」。** 这是 phase 谓词与本条共用的形状，不是权宜：桥两侧本就是两个运行时。反向红测已验，两条门禁都会拒绝单侧改动。
