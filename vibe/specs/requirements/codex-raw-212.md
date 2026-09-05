---
id: eypc-req-codex-raw-212
qualified_source: SPEC-260905-FLOAT-LIFECYCLE-AUTO-REFRESH::RAW-212
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-189
    scope: "Float 插窗口在工作台再进、重新接入/安装、身份或任务包失效时自动重建；reload-required 横幅只在重建后仍不一致时出现。心跳卡死冷却与静默 mainHide 不拆窗保持不变"
---

# RAW-212 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260905/float-lifecycle-auto-refresh/raw-requirement.md#L1)。

持久化插窗口在失效、重新启动安装、关闭工作台再进入时自动刷新内容，不再要求用户手动重开悬浮球。
