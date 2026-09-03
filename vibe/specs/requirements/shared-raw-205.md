---
id: eypc-req-shared-raw-205
qualified_source: SPEC-260903-COMPANION-PIN-PROVIDER-SYNC::RAW-205
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-verified-inbound / desktop-repaint-on-focus"
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-185
    scope: "置顶谓词扩为 localPin || providerPin；分组、时间窗豁免、计数与兜底不变式对 Provider 置顶原样成立"
  - kind: refines
    target: eypc-req-shared-raw-189
    scope: "置顶分组顺序：本地置顶按 Alt+↑/↓ 在前，Provider 置顶按 Provider 顺序在后"
---

# RAW-205 · companion-shared

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260903/companion-pin-provider-sync/raw-requirement.md#L1)。

Codex Desktop 原生线程（app-server Pinned 分区）、CodexHost 额外进程（Host `pinned`）、Claude App（`isStarred`）与 Cursor（workspace `cursor/pinnedComposers`）的原生置顶都进入 Kernel 的 `providerPin` 并落到「置顶」分组；EyPc 置顶只对 Codex 原生与 CodexHost 回写（section move / Host CLI，只提交回读核验过的值，失败回退本地置顶），Claude / Cursor 保持只读。这是对 PRD「本地偏好不回写 Provider、原生置顶只读」的明确条款修订。
