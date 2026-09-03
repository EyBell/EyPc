---
id: eypc-req-shared-raw-207
qualified_source: SPEC-260903-SAME-TURN-WAITING-INPUT::RAW-207
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-verified-codex-questions / same-turn-running-interaction-waiting"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-189
    scope: "精确当前 interaction 的公开待输入/待确认从仅 terminal 扩展到同一 Turn 仍 running"
  - kind: refines
    target: eypc-req-shared-raw-206
    scope: "Cursor hasBlockingPendingActions 的 user-input 观察必须进入 Kernel interaction 车道"
  - kind: refines
    target: eypc-req-shared-raw-165
    scope: "成员聚合 live 优先级与 attention 合同对齐为 waiting-approval > waiting-input > running"
---

# RAW-207 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260903/same-turn-waiting-input/raw-requirement.md#L1)。

同一 Turn 仍进行中的精确当前提问/审批公开为待输入或待确认，不得留在进行中；成员聚合 waiting 高于 running。Cursor 阻塞待决必须把 interaction kind 送进 Kernel。
