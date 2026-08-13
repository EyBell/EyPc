---
id: eypc-req-codex-raw-133
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-133
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implemented-unverified / refines-RAW-132 / unified-diagnostics-projection"
relations:
  - refines-RAW-132
---

# RAW-133 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户同意继续优化，并要求全局代码精简、高效、无散乱残留且不得带回旧任务状态错误。五项诊断字段、输入规范化与相等判断只由 Domain 定义；Controller 在既有 source fingerprint/generation 屏障后原子接纳，诊断变化但任务状态未变时只通知一次，未变化轮询与旧代次不得触发重复刷新。运行页固定显示“保护总数 · 周期数”的短摘要，五项明细只在原生信息按钮 hover/focus 时出现；内部计数不进入状态 `aria-live`，避免轮询造成重复播报，同页旧伪按钮一次统一为原生 `button`。父聚合完整优先级表直接调用生产纯解析器，Controller 合同锁定 malformed 归零/截断、diagnostics-only 单通知和 stale generation 零通知；这些合同依项目规则均未执行，因此仍为 `implemented-unverified`。
