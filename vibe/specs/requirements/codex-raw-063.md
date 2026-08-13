---
id: eypc-req-codex-raw-063
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-063
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-visible-six-tab-and-weekly-ring-details / status-grouping-refined-by-RAW-064 / weekly-ring-refined-by-RAW-065 / visible-status-refined-by-RAW-066 / compact-counter-click-refined-by-RAW-067"
---

# RAW-063 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

悬浮卡片的可见导航固定为 `动态 / 已完成 / 已隐藏 / 项目`；`全部`、`待输入`不显示、不可路由。底层 `all` 与 `inputRequired` 投影继续保留给注册提示和紧凑角标，待输入/完成未读的首条直开合同由 RAW-067 收敛；旧持久化/快照/`codex.tab.set` 的 `all/input` 必须规范化到稳定 ID `ongoing`，不得闪现隐藏页。动态页只展示最近 6 小时内 `max(lastTurnStartedAt,lastTurnCompletedAt)` 有活动的非隐藏任务；其当前状态分段由 RAW-064/066 收敛。完成任务在窗口内仍可见，`updatedAt` 不得作为状态或活动时间回退。普通点击标题直达会话，Ctrl/Cmd 标题点击只选择；项目/状态/分钟元信息行只聚焦并高亮，以继承 `Ctrl+T` 项目上下文。四个常显操作维持 `24px / 2px / 102px`。注册提示只显示“最近 N 天的 M 条”。RAW-063 当时移除 Weekly 环的细节已由 RAW-065 取代；内部水球、百分比、角标、展开额度及旧外层持久化兼容继续保留。开发验收仍由用户负责，本轮不改测试也不运行测试、类型、构建、uTools 或真实宿主操作。
