---
id: eypc-req-codex-raw-130
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-130
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-124-128 / cross-source-live-evidence-order"
relations:
  - refines-RAW-124-128
---

# RAW-130 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户截图确认部分真实进行中的后台任务仍被投影为“已停止”。静态调用链复核确认 RAW-124 只把 `appServerLiveActive` 保存为无因果顺序的布尔值，而 Desktop shadow 的 `activityEvidence='activity-event'` 会长期保留：较早的 `idle + interrupted` activity patch 可在较新的 App Server `active/inProgress` 之后，因 read-state-only patch、Side Chat 聚合或周期 inventory 的 `updateInventory` 重放再次执行，并无条件撤销较新的正向权威；下一轮 inventory 随即重新引入旧 interrupted，满足 stopped 条件。Preload 必须给所有真实 Desktop activity patch 与精确 App Server active/Turn-started 事件分配同一进程内单调 evidence sequence，`app-server-live` 私有库存同时保存其建立水位；Desktop 非 active 只有序号严格晚于该水位时才能撤销，旧 activity patch、initial/refollow snapshot、read-state-only 重放和 inventory 重建均不得撤销。精确 completion、定向 terminal、App Server non-active 仍可直接结束该水位；full inventory 必须保留水位且不得向 Renderer 暴露序号。Bridge 回归合同覆盖“旧 Desktop idle activity event → 新 App Server inProgress → read-state-only 重放 → 连续两轮 inventory 仍 active”，并证明真正后到的 Desktop idle patch 可撤销。双 preload 只同步该局部状态修复；不新增 API、Renderer 判断、持久化、timer、raw identity 或内容字段。依项目门禁只写测试合同，不执行测试、typecheck、build、preload 语法或真实 uTools 状态转换，交付保持 `未校验，待用户验收`。
