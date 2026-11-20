---
id: eypc-req-shortcut-management-raw-003
qualified_source: SPEC-261120-EYPC-SHORTCUT-OPTIMIZATION::RAW-003
status: active
domain: companion-shared
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-222
    scope: "列表重排保留仍合格的通用游标，并以当前资格约束派发和迟到回执"
  - kind: refines
    target: eypc-req-shared-raw-188
    scope: "重排保留专用轮次中的有效已访问实例，旧实例或旧轮次回执不能消费当前轮次"
---

# RAW-003 · 重排承接与派发竞态

列表重排后保留仍合格的通用游标及专用已访问实例。选中到派发之间重新核对原目标的资格，派发回执只影响能与其对应的任务实例和轮次。[规范化来源](../261120/eypc-shortcut-optimization/raw-requirement.md#raw-003--重排承接与派发竞态) · [跳转缓存组件](../261120/eypc-shortcut-optimization/jump-cache-component.md#L1)
