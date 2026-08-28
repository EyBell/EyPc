---
id: eypc-req-shared-raw-187
qualified_source: SPEC-260828-COMPANION-MANUAL-PHASE::RAW-187
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-185
    scope: "状态未知任务的落点不变；本条只增加把该行手动指定为正常状态的能力与其退休语义"
---

# RAW-187 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260828/companion-manual-phase/raw-requirement.md#L1)。

相位为 `unknown` 的任务可由用户手动指定一个正常状态，作为该段未知期间的展示口径。`Cmd/Ctrl+点击`该行状态图标打开状态菜单（两个键都接受，不按系统分支）；普通点击与其余行的多选手势逐字不变。手动值**持久化保留**——这使可持久化的任务侧本地配置由四项扩为五项，是对 PRD L267 的明确条款修订。已有真实证据的行拒绝手动指定，不允许伪造状态。退休用 episode 判据：手动值只在设定时所处的那一段未知内有效，任务离开 `unknown` 再回来即自动失效，不复活旧答案。覆盖落在 Kernel 的单点，使相位、分组、cycle 层级与计数读同一个值；同时新增 `canonicalPhase` 保存证据原值，一切关于证据的判断（首推 unknown 宽限窗）读它而非被用户偏好回答。
