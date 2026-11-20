---
id: eypc-req-shortcut-management-raw-001
qualified_source: SPEC-261120-EYPC-SHORTCUT-OPTIMIZATION::RAW-001
status: active
domain: companion-shared
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-152
    scope: "通用、专用和精确任务跳转共用进程状态缓存，按键不发起任务盘点；分来源选择与无缓存处理见本专题 RAW-002"
  - kind: refined-by
    target: eypc-req-shortcut-management-raw-002
    scope: "明确可用来源快照独立发布，完全无缓存时结束当次，不等待、不回放"
---

# RAW-001 · 任务状态轮次与统一跳转缓存

任务状态快捷键按当前轮次切换，上一／下一自动承接位置。既有、最新及新入任务均从统一状态缓存定位，按键时无需查询任务库存。[规范化来源](../261120/eypc-shortcut-optimization/raw-requirement.md#raw-001--任务状态轮次与统一跳转缓存) · [组件规格和现状](../261120/eypc-shortcut-optimization/jump-cache-component.md#L1)
