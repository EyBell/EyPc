---
id: eypc-req-claude-raw-184
qualified_source: SPEC-260828-CLAUDE-BALL-CENTRE-WEEKLY::RAW-184
status: active
domain: companion-claude
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-007
    scope: "展开卡额度区仍显示全部上游窗口不变；只规定水球球心那一个数字取无 scope 的普通周限额"
---

# RAW-184 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260828/claude-ball-centre-weekly/raw-requirement.md#L1)。

水球球心的 Claude 百分比取**无 scope 的普通周限额**（`weekly_all`），不再取 5 小时窗口——周窗口才是约束一周节奏的那条线，5 小时窗口摆动过快不适合当常驻状态数字。按模型的 scoped 周限额不得冒充普通周限额；账号确实没有普通周窗口时才依次回退 5 小时窗口、其它已上报窗口，只为不让球心空着。球心的归属映射、来源标注与兼容路径（仅 Codex、Claude 未接入、无读数回退 Codex 原样）不变，展开卡额度区仍逐窗口显示全部窗口。
