---
id: eypc-req-codex-raw-037
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-037
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refined-by-RAW-045-RAW-053-and-RAW-063"
relations:
  - refined-by-RAW-045-RAW-053-and-RAW-063
supersedes:
  - eypc-req-codex-raw-029
---

# RAW-037 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

展开卡片顶部直接放任务页签，删除旧顶部样式/隐藏/刷新/设置/关闭按钮；其下为统一搜索、真实额度文字和任务内容。RAW-063 以四个可见页签 `动态 / 已完成 / 已隐藏 / 项目` 覆盖旧六页签约定；底层数组、`all/inputRequired` 兼容投影与最近 Turn 排序仍保留，搜索只过滤当前可见页签且不改源顺序。RAW-053 的显示层置顶分区继续有效。
