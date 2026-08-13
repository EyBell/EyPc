---
id: eypc-req-codex-raw-108
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-108
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-063-066-069-089-091-092"
relations:
  - refines-RAW-063-066-069-089-091-092
---

# RAW-108 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

角标、动态状态段、任务卡片、水球主摘要和 Codex 设置页水球预览必须从同一份 Controller 已稳定化会话快照经一个无状态 Renderer 展示投影一次派生，不得各自重算原始通信事件。该投影只把最近 6 小时且非隐藏的 `waiting-input` 放入“待输入”，把 `active / waiting-approval / ongoing` 放入“正在进行中”，把 `stopped / completed-unread / completed` 分别放入其互斥状态段；其中 exact desktop-live active 仍决定权威实时活动，保守 `ongoing` 承接 active 退出核验、短暂断连、bridge failed、暂缺权威和旧 terminal 等通信暂态，明确 `stopped` 必须立即离开进行中。紧凑“进行中”数量严格等于未搜索时该投影的“正在进行中”卡片数；搜索只过滤展开列表，不改变紧凑数量。待输入与完成未读数量继续来自完整集合并包含隐藏任务，且不与进行中重复计数。零值隐藏、超过 99 显示 `99+`；提示、按钮 ARIA 与主水球摘要报告相同的三个数量，进行中点击只展开、不切页、不打开任务。Renderer 不增加角标 timer 或第二层 debounce；Preload 的字段白名单/时间排序/3 秒 `[0,300,1000]` 定向 Turn 核验/50ms 结构合并与补读，以及 Controller 的 active-exit 基线、旧 terminal 防闪、单调证据、缺失隔离、可中断完成展示窗、active 恢复取消和 `targeted-after-exit` 强证据直发均保持不变。本条不修改 `completionPresentationDelayMs`、Controller/Preload 协议、Projection V3、动作 ID、存储或迁移；既有测试合同只更新不执行，最终状态保持 `reported / 未校验，待用户验收`。
