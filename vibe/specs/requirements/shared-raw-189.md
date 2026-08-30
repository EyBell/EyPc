---
id: eypc-req-shared-raw-189
qualified_source: SPEC-260829-COMPANION-PINNED-COLLAPSE-PLAN-INPUT::RAW-189
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-pending / stable-pinned-order / collapsible-pin-header / direct-active-interaction-transition / app-server-running-dominance / structural-plan-consumption / loaded-build-timestamp"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-183
    scope: "置顶公开分组及其零未读兜底使用持久化本地置顶顺序；后台时间、成员 revision 与完成 metadata 不得让已完成已读置顶项跳位，只有显式本地重排可改变"
  - kind: refines
    target: eypc-req-shared-raw-188
    scope: "attention 轮次稳定规则保留；仅 pinned 公开列表/兜底不再采纳 metadata-only latest 排序，而与显式本地置顶顺序保持一致"
  - kind: refines
    target: eypc-req-codex-quick-task-view-raw-167
    scope: "展开时 Alt 数字编号可见任务行；置顶折叠时标题只占一个展开编号，展开后动态重算；Alt+F 仍为 task-only"
  - kind: refines
    target: eypc-req-shared-raw-179-clause-001
    scope: "仍只有当前 interaction 产生 waiting；terminal 上精确当前普通输入、审批、Plan 选择/实施 interaction 均先于 unread；bare request-array disappearance 不是 Plan 关闭证据；更新 default Turn 的结构化文件变更消费旧 artifact，纯补充 Turn 保留；因果更新的 App Server running 忽略较旧 refollow waiting"
  - kind: refines
    target: eypc-req-invariants-raw-178-clause-003
    scope: "Codex 运行页公开当前宿主 artifact 自带的时间、包版本与加载身份；production build 只证明 dist artifact-ready，真实 Host handshake 继续独立证明 host-loaded"
---

# RAW-189 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[规范化记录](../260829/companion-pinned-collapse-plan-input/raw-requirement.md#L1)。

动态「置顶」分组及其零未读兜底严格复用持久化本地置顶顺序，后台 metadata 不再使已完成已读项跳位。置顶分组可在当前 Float 会话内折叠：展开时可见任务行动态编号，折叠时任务隐藏且标题只占一个「展开」编号；展开后立即重算，`Alt+F` 仍只标记任务。已完成任务若有当前精确普通输入、审批或 Plan 选择/实施 interaction，无论已读或未读都直接显示待输入/待确认并保留潜在 unread；关闭后才重新显露真实终态，不发布中间完成帧。bare request-array disappearance 不关闭 Plan 请求，匹配 resolved/cancel/execution-start、新 Turn 或 plain-active runtime 才关闭；因果更新的 App Server running 忽略较旧 Desktop refollow waiting，更新 interaction 仍可重新进入等待。已完成 Plan 后的更新 default Turn 只有出现结构化文件变更才消费旧 artifact；完成后按真实 unread 分组，纯补充 Turn 仍保留 Plan。Task Snapshot/Command 形状不变；Runtime Identity 增量投影当前 Host artifact 的打包时间、包版本与 artifact state，Codex 运行页明确区分 `artifact-ready` 与 `host-loaded`。
