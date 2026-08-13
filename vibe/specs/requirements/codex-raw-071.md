---
id: eypc-req-codex-raw-071
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-071
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-051-and-RAW-054-color-validation-and-coupling-only"
---

# RAW-071 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Codex 配置页整体重构为清晰的“水球 / 卡片 / 状态信号”外观工作台。水球底色、液体填充 A/B、Weekly 环进度/轨道、三个角标必须只出现在水球区并附有实时部位示意；卡片表面与文字/图标前景必须只出现在卡片区并有独立预览；充足/提醒/紧张为单独的状态信号区，明确其会影响额度进度与状态显示。所有颜色只要由配置控件提交，即直接保存、直接渲染到对应部位；不再因 HEX/亮度/对比度、联动色域、自动改色或 Controller 二次校验恢复上一次颜色。浏览器原生取色控件仍只产生其自身可表示的颜色值；无效 CSS 外部存量只原样保留，不伪装成已成功渲染。预设仍允许一次应用整套外观，保存主题仍保存完整外观快照。旧卡片配对模态、实时预览事务和其验证断言不再是当前产品合同；该历史保留为 superseded 证据。本轮不新增依赖、API、数据库或外部写入，不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作；交付仍由用户验收。
