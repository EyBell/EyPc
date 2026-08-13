---
id: eypc-req-codex-raw-091
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-091
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-028-056-066-068-089-and-090"
relations:
  - refines-RAW-028-056-066-068-089-and-090
---

# RAW-091 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

“传输不确定”与“会话已明确停止”必须分开。exact desktop-live `active` 永远优先；最新 Turn 为 `failed` 或 `interrupted`，且同一会话有 exact desktop-live `idle`，或 Codex Desktop 伴随桥明确为 `not-running`（覆盖 GPT/进程崩溃、用户主动停止或关闭 Codex）时，投影为独立 `stopped/stopped/blocked-stopped`，显示“已停止”，不计入进行中、完成或可归档集合。连接失败、协议不兼容、连接中、`notLoaded/systemError/inProgress`、缺少 Turn、缺少会话级 live idle 或其它传输/权威缺失仍按 RAW-089 显示“进行中”；不得把 bridge `failed` 当作 Desktop 已退出。Desktop active→idle 的第一份 delta 若仍携带 active 前的旧 terminal Turn，Controller 先维持进行中，待更新结果或后续完整库存核验后才发布停止，避免突兀闪变。最近 6 小时的停止任务在动态页增加“已停止”分段，项目页和已隐藏页继续可达；不新增第五页签，停止任务不进入紧凑进行中角标或前/后任务循环，固定归档槽保持禁用并明确提示“会话已停止但未完成”。本机只读匿名聚合核验确认旧规则把 2 条 live active 与 2 条 live idle+interrupted 都计为 4 条进行中；按本条投影后，同一 18 条窗口为 14 条已完成、2 条已停止、2 条进行中。测试合同随实现更新但不执行测试、typecheck、build、uTools 或截图；真实插件视觉与主动停止/崩溃路径仍由用户验收。
