---
id: eypc-req-codex-raw-106
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-106
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-084-and-RAW-105"
relations:
  - refines-RAW-084-and-RAW-105
scoped_relations:
  - kind: refined-by
    target: eypc-req-shared-raw-222
    scope: "废止全部 stopped 禁入；符合资格的待继续进入第三层，EyPc 暂停仍排除"
---

# RAW-106 · companion-codex

> 待继续与 EyPc 暂停按 [RAW-222](shared-raw-222.md#L1) 分别判断。[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L113)保留旧分类。

明确 `stopped` 任务永远不进入“上一个 Codex 任务”或“下一个 Codex 任务”的候选集合，包括常规序列与 EyPc 本地置顶回退。停止任务仍可在原有列表/项目/隐藏视图中打开；该限定不改变其它状态、置顶、排序、游标或打开路径。
