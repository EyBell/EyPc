---
id: eypc-req-claude-raw-186
qualified_source: SPEC-260828-CLAUDE-BALL-CENTRE-DUAL-WEEKLY::RAW-186
status: active
domain: companion-claude
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-184
    scope: "普通周限额仍是球心基准读数；本条只在账号另有 scoped 周窗口时把它移到并列后位，无 scoped 窗口时逐字回到 RAW-184 的单值渲染"
  - kind: refines
    target: eypc-req-claude-raw-007
    scope: "展开卡额度区仍逐窗口显示全部上游窗口；只规定球心那一个位置并列哪两条读数"
---

# RAW-186 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260828/claude-ball-centre-dual-weekly/raw-requirement.md#L1)。

Claude 拥有水球球心且账号同时上报 scoped 周限额与普通周限额时，球心并列读作 `{scoped}/{plain}`，scoped（优先 Fable）在前，**不带百分号**——两个百分号放不下。scoped 侧在全部 scoped 周窗口里择一，模型名仍是数据而非白名单。并列字号取 `percentSize * .7` 与球体尺寸 `--water-size * .165` 的较小值：上限保证用户把字号调到 32px 时最宽的 `100/100` 仍在圈内，下限保证调小仍被尊重。球心读数改用 `tabular-nums lining-nums`，避免就地刷新时整块中心左右跳动。账号没有 scoped 周窗口、Claude 未接入、仅 Codex 或无读数时，球心逐字回到既有单值渲染。
