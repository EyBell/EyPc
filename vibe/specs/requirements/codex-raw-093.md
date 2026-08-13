---
id: eypc-req-codex-raw-093
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-093
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-056-081-and-092"
relations:
  - refines-RAW-056-081-and-092
---

# RAW-093 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

“计划已完成但等待用户确认/实施”属于明确待输入，必须走 Desktop live 最快路径。当前本机 Desktop 在计划 Turn 完成后把未决 `item/plan/requestImplementation` 放入 `conversationState.requests`，直到用户处理；preload 必须把这个有限精确方法映射为 `waitingOnUserInput`。未决请求本身是强用户等待证据，即使同一 snapshot/patch 中 `threadRuntimeStatus` 已先变为 `idle`，也要临时把该任务投影为 `desktop-live active + waitingOnUserInput`，优先于 latest Turn completed 和普通完成展示窗；请求移除后再按实时 runtime/Turn 证据收敛。已登记任务直接随该 Desktop patch 发布匿名 Activity Delta，不触发 App Server 库存读取；未登记任务仍沿用 RAW-092 shadow→完整库存匿名注册门禁。计划正文、request ID、raw thread ID 与其它请求内容不得跨入 Renderer、日志、存储或文档。测试合同更新但依项目规则不执行测试、typecheck、build、uTools、截图或真实确认操作，最终由用户验收。
