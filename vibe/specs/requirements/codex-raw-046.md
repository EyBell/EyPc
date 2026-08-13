---
id: eypc-req-codex-raw-046
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-046
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / water-display-refined-by-RAW-063-and-RAW-065"
scoped_relations:
  - kind: refined-by
    target: eypc-req-codex-raw-063
    scope: "water-display"
  - kind: refined-by
    target: eypc-req-codex-raw-065
    scope: "water-display"
---

# RAW-046 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

额度与默认模型升级为 V2。EyPc 从本机 `account/rateLimits/read.rateLimitsByLimitId` 分离普通 `codex` 与 `GPT-5.3-Codex-Spark`（当前 `codex_bengalfox`）额度。水球按“普通 5 小时正余额 → 普通周正余额 → 最高正余额 Spark”选择；两个普通窗口均无正余额时才展示 Spark，并在百分比上方显示 `S`。RAW-065 规定只要当前 primary/secondary 存在 Weekly 读数就绘制同池剩余进度环，无 Weekly 时不绘制任何外圈。新会话模型策略固定为 `quota-auto`：任一实际返回的普通窗口为 0 时使用最高可用 Spark；缺失窗口不等于 0；Spark 模型或额度不可用时要求手选。`newThreadPreferredModel` 只影响普通阶段，弹窗临时选择不持久化。
