---
id: eypc-req-codex-raw-065
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-065
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-063-weekly-ring-removal / color-validation-superseded-by-RAW-071"
scoped_relations:
  - kind: superseded-by
    target: eypc-req-codex-raw-071
    scope: "color-validation"
---

# RAW-065 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

删除水球表面及宿主按钮交互态的普通装饰圆环，包括 `2px inset`、静态 border、inset outline、装饰 shell、根容器整圆背景、同尺寸外发光与外部圆形 focus outline；键盘焦点改由中央读数的非圆形下划线提示。恢复仅在存在 Weekly 读数时渲染的数据进度环。进度环表示同一额度池的 Weekly 剩余百分比，支持连续圆环与固定 20 段模式，并保留粗细、额度状态/自定义进度色、轨道色与光晕设置；RAW-071 覆盖其旧 `3:1` 颜色校验。不恢复普通轮廓透明度入口，历史 `shellOpacity` 仅作持久化兼容。5 小时 + Weekly、Weekly-only 与含 Weekly 的 Spark 都显示数据环；无 Weekly 时不渲染任何外圈。
