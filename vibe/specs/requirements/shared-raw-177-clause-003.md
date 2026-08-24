---
id: eypc-req-shared-raw-177-clause-003
qualified_source: SPEC-260823-CODEX-TAB-BOUNDARY-OPTIMIZATION::RAW-177#3
status: active
domain: companion-shared
authority: user-stated
parent_requirement: eypc-req-shared-raw-177
supersedes:
  - eypc-req-shared-raw-163-clause-055
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-164-clause-061
    scope: "Deep Link 派发不能建立会话期已读确认；只接受 Codex 原生可见与 applied/read 回执"
  - kind: refines
    target: eypc-req-shared-raw-164-clause-064
    scope: "Turn 绑定已读确认必须来自原生回执，不能由外部打开请求推导"
---

# RAW-177#3 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260823/codex-tab-boundary-optimization/raw-requirement.md#L14)。父条款 [RAW-177](shared-raw-177.md#L1)。

Mirasim/EyPc 到 Codex 的交接必须显式区分 `requested → dispatched → native-confirmed → applied`；当前只有派发证据，未收到原生可见、控制权或 applied/read 回执前不得报告已打开、已读或已接管。
