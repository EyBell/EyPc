---
id: eypc-req-shared-raw-188
qualified_source: SPEC-260829-COMPANION-UNREAD-PIN-FALLBACK::RAW-188
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / exclusive-unread-pin-fallback / stable-attention-round"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-183
    scope: "改写已完成未读专用入口的候选选择并明确 attention 稳定轮次：真实未读非空时置顶不得进入同一序列，真实未读为空时才启用置顶兜底；metadata-only 重排不得移动本轮旧实例，新生命周期实例插队，整轮结束后才采纳最新顺序"
  - kind: refines
    target: eypc-req-shared-raw-185
    scope: "置顶分组成员、任何相位的时间窗豁免、循环可达与列表可见不变；仅专用 attention 入口采用互斥兜底"
---

# RAW-188 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[规范化记录](../260829/companion-unread-pin-fallback/raw-requirement.md#L1)。

「已完成未读」专用入口采用快照级互斥选择：只要当前存在至少一条可打开的真实已完成未读任务，候选序列就只包含真实未读；只有真实未读为零时，置顶分组才成为独占兜底。Kernel 为 `input/completedUnread` 各自维护一轮进程内实例顺序：metadata-only 重排不移动旧实例，新生命周期实例按最新顺序插队，整轮成功派发后才采纳最新公开顺序开始下一轮；失败不推进。候选从置顶切到未读时裁剪全部置顶实例，未读清空后置顶从当前首项重建。命令、Snapshot 字段形状、置顶分组与通用循环均不变。
