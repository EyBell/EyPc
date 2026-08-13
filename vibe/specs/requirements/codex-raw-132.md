---
id: eypc-req-codex-raw-132
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-132
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implemented-unverified / refines-RAW-131 / regression-safe-parent-aggregation"
relations:
  - refines-RAW-131
---

# RAW-132 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求继续优化时不得带回此前已经修复的任务状态误判。优化必须保持 RAW-131 的 positive-sequence、冲突快照不合成 idle、active epoch、missing-row 映射、Activity generation 和 stopped 归档门禁不变；父任务聚合收敛为一个纯状态解析器，Side Chat 的终态读取只能关闭对应 child，若 main 或其它 child 仍有 exact live activity，父任务须保持 `active/inProgress` 并延后该分支终态。Preload 新增五个仅会话期匿名计数（开启 live epoch、丢弃旧 Turn 读取、延后分支终态、抑制冲突快照、保留缺行映射），Renderer 只展示计数且继续受同源 generation 屏障保护，不携带任务 ID、正文、路径或时间线内容。Domain 反向模型表、Bridge 双 child 竞争合同和 Controller 旧代次诊断倒灌合同锁定上述行为。依项目规则未执行测试、typecheck、build、preload 语法或真实宿主，当前仍为 `implemented-unverified`。
