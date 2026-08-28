---
id: eypc-req-shared-raw-182
qualified_source: SPEC-260827-COMPANION-CYCLE-RING-ORDER::RAW-182
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-accepted-2026-08-27 / cycle-ring-order-and-badge-reachability"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-155
    scope: "通用循环的 attention → Plan → active → local pin 分层保留为优先级顺序，但不再排他：环是各层按序拼接的并集，并新增 unread 层；层内最近提问时间倒序与 Provider/置顶不覆盖顺序均不变"
  - kind: refines
    target: eypc-req-codex-raw-181
    scope: "cycle 位置维持进程内不变；本条只补充该进程游标的提交口径（任意环内确认打开接管）与出环改锚，以及一次连续 walk 的进程内环冻结窗口"
---

# RAW-182 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260827/companion-cycle-ring-order/raw-requirement.md#L1)。

通用「上一个/下一个任务」循环的层序从排他改为排序：环为 `attention → plan → active → unread → fallback` 各层按序拼接的并集，层内仍按最近提问时间倒序，冷游标首次按键仍落在最紧急任务。已完成未读根任务成为可循环层，其专用入口与 `attentionSeen` 独立未打开进度不变。一次连续 walk 持有它开始时的环 `CYCLE_WALK_HOLD_MS`，期间发布重排不改变正在遍历的环，walk 失效后下一次按键采纳最新环。在途连按按逻辑游标累进：N 次按键前进 N 格并只派发最终尾随目标，推进后回到正在打开的目标时不重复调用 Provider；逻辑游标只在本次 walk 的请求全部落定前有效。进程游标不再为循环按键独占：任意一次落在环内的确认打开都接管它，落在环外的打开不提交；游标仍在 `targets` 却离开环时按旧环次序就近改锚并记录改锚侧，使前后方向分别解析为原后继与原前驱。三个角标统一加 `capabilities.open` 过滤，与环共用同一判据，使「角标里有」等价于「循环能到」。游标、环与冻结窗口全部为进程内状态。
