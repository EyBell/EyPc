---
id: eypc-req-codex-raw-118
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-118
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-096-110-117"
relations:
  - refines-RAW-096-110-117
---

# RAW-118 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户复验确认最新实现中的“已完成”仍完全不更新，并指出 2026-07-28 基线正常。今天新增的完整 `turn/completed` 快速路径不得用 provider 的 `completedAt` 与本机 `Date.now()` 记录的 `desktopActiveSince` 做跨时钟严格大小比较：provider 时间可能只有秒级，快速 Turn 可在同一秒完成，任务切换后的 active replay 也可能晚于真实完成才被本机观察；这些都不能否定同一已知 `inProgress` Turn 的精确完成通知。完整通知必须先按同一/更新 `startedAt` 与单调 `completedAt` 判新鲜，随后直接发布现有脱敏 `targeted-after-exit`，不等待 latest-Turn reread、完整库存或 Renderer timer。缺少完整 Turn 形状、旧 `startedAt`、同 Turn 非递增完成时间及未知任务仍走既有保守校对；不改变 RAW-112 对普通 snapshot 的佐证规则。测试合同必须覆盖 `completedAt <= desktopActiveSince` 仍即时完成且零额外单任务读取；状态保持 `reported / 未校验，待用户验收`。
