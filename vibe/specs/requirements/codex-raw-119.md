---
id: eypc-req-codex-raw-119
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-119
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-112-117-118"
relations:
  - refines-RAW-112-117-118
---

# RAW-119 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户进一步确认完成后三至五分钟仍显示“进行中”，并指出该任务曾被中断。调试必须覆盖同一个 Turn revision 的 `interrupted/failed → active → completed` 恢复序列：恢复运行可能保留原 `startedAt`，且中间 `turn/started`/`inProgress` 可能在任务切换或不同 App Server 会话间漏收。因此精确 `turn/completed` 与任务切换 refollow 后的 latest-Turn 复核，在 `startedAt` 等于已知 terminal revision、最新状态已明确 completed 时必须接受该正向状态变化；不得因缓存仍为 interrupted/failed 而把完成当旧事件。精确同 revision `turn/started(inProgress)` 也可恢复 interrupted/failed，但不能把同 revision completed 回退为 inProgress。terminal-active snapshot 有界佐证若最终得到 completed，必须始终再发布 `targeted-after-exit`，使 Controller 绕过旧 terminal 防闪并立即从 ongoing 原子移入 completed；不得只发一份无 targeted 标记的 idle/completed 后再次被守卫成 inProgress。验证必须实际执行 bridge 的精确通知与 task-switch refollow 合同、Controller 原子包合同以及双 preload 语法/镜像检查；真实 uTools 任务仍不由本轮自动操作。
