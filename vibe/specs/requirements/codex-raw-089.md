---
id: eypc-req-codex-raw-089
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-089
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-visible-abnormal-and-unknown-states / explicit-stop-refined-by-RAW-091 / refines-RAW-028-056-066-068-070-078-080"
relations:
  - refines-RAW-028-056-066-068-070-078-080
scoped_relations:
  - kind: refined-by
    target: eypc-req-codex-raw-091
    scope: "explicit-stop"
---

# RAW-089 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

不确定或异常状态不得在任务产品界面显示为“不确定/未知/失败/系统错误”，一律归为“进行中”。只有 exact desktop-live active 可继续细分等待输入、等待审批和 active；只有最新 Turn 的明确 `completed` 状态及有效 `startedAt`（可选 `completedAt`）能把任务移出进行中并允许归档。failed、interrupted、systemError、notLoaded、inProgress、连接/权威丢失、Turn 缺失和核验超时在没有 RAW-091 明确停止证据时保持 `ongoing/running/blocked-active`；取消 interrupted 经过 60 秒自动生成完成标记。实时路径使用 Desktop active→non-active 推送立即更新，并在 preload 内对该 raw thread 做单飞、隐私安全、3 秒有界的 `thread/turns/list(limit=1, sortDirection=desc, itemsView=notLoaded)` 核验；成功后随 Activity Delta V2 发送脱敏 latest-Turn 证据，失败才请求完整库存校对。原固定 `2000ms` Activity Delta 防抖删除；`taskRefreshSeconds` 仅是发现新任务、项目变化和漏事件的完整校对周期，当前默认 15 秒，不是实时状态缓存。现有 `completionPresentationDelayMs` 只从真实 active 退出事件起算并仅作用于明确完成后的展示稳定，默认仍为用户已保存的 1500ms。测试合同随实现更新但依项目规则不执行；不运行 typecheck、build、uTools、截图或新的真实状态切换，交付仍由用户验收。
