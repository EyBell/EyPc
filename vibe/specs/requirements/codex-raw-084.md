---
id: eypc-req-codex-raw-084
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-084
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / extends-RAW-067-task-activation"
---

# RAW-084 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

新增“上一个 Codex 任务”与“下一个 Codex 任务”两个 uTools 全局功能/快捷键。它们共享一个只驻留运行时内存的循环序列：先是完整待输入集合，再是完整已完成未读集合，最后是进行中集合；每个分段均沿用置顶优先、稳定源顺序，按匿名任务 key 去重，待输入不会在后续进行中段重复出现。首次下一项打开序列首项、首次上一项打开末项；后续按方向循环回绕。两个命令只打开目标任务，不确认完成未读、不改变待输入、隐藏、页签或 Codex Desktop 原生状态。配置页提供各自跳转 uTools 系统级快捷键设置的入口；无可打开候选时给出明确提示。本轮不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作，交付仍由用户验收。
