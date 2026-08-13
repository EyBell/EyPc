---
id: eypc-req-codex-raw-087
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-087
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-085-and-RAW-086 / refines-RAW-001-and-RAW-071-configuration-navigation"
relations:
  - refines-RAW-001-and-RAW-071-configuration-navigation
supersedes:
  - eypc-req-codex-raw-085
  - eypc-req-codex-raw-086
---

# RAW-087 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

uTools 宿主快捷键回读能力整体删除：preload、平台类型、运行时快照、Codex 页、窗口槽页均不得读取或回显当前绑定，任何入口/焦点/可见性/手动动作都不得调用私有同步 `getAllFeatureHotKey`；前/后任务、待输入、完成未读、悬浮入口和窗口槽继续只通过官方 `redirectHotKeySetting` 单向打开 uTools 配置。Codex 配置页在概览下方提供置顶的 `快捷方式 / 任务 / 水球 / 卡片 / 运行` 五个 Tab，默认显示快捷方式且以双列紧凑排列配置入口；任务内容、外观目标与运行诊断分面显示，不再一次性纵向渲染全部配置。诊断详情、连接降级、外观部位和尺寸说明收进可聚焦 `i` 提示按钮，只保留当前值、状态和可执行控件常显。用户已确认移除入口回读后插件恢复加载；本轮只执行静态差异、私有 IPC 残余搜索、preload 语法/镜像和 Vue SFC 编译，不运行测试、typecheck、build、真实 uTools、截图或 Codex 操作，最终布局仍由用户验收。
