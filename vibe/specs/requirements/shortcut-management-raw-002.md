---
id: eypc-req-shortcut-management-raw-002
qualified_source: SPEC-261120-EYPC-SHORTCUT-OPTIMIZATION::RAW-002
status: active
domain: companion-shared
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-shortcut-management-raw-001
    scope: "统一缓存按来源发布；任务快捷键立即使用已发布可信候选，无缓存结束本次"
  - kind: refines
    target: eypc-req-codex-raw-152
    scope: "取代全部启用来源共同就绪门槛和冷按键触发盘点；保留进程游标、并发边界及可用缓存复用"
---

# RAW-002 · 按来源发布与无缓存处理

后台按来源发布可信快照。按键直接在已有快照中选取合格目标。完全无可用缓存时，消费并结束此次触发，后台更新不续接，界面无缓存等待或超时提示。[规范化来源](../261120/eypc-shortcut-optimization/raw-requirement.md#raw-002--按来源发布与无缓存处理) · [跳转缓存组件](../261120/eypc-shortcut-optimization/jump-cache-component.md#L1)
