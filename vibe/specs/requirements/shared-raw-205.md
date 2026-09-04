---
id: eypc-req-shared-raw-205
qualified_source: SPEC-260903-COMPANION-PIN-PROVIDER-SYNC::RAW-205
status: active
domain: companion-shared
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-verified-inbound / desktop-repaint-on-focus / host-verified-native-and-host-pin / claude-cursor-pin-inbound-only / pin-lane-interface / inbound-realtime-host-pending"
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

Codex Desktop 原生线程（app-server Pinned 分区）、CodexHost 额外进程（Host `pinned`）、Claude App（`isStarred`）与 Cursor（workspace `cursor/pinnedComposers`）的原生置顶都进入 Kernel 的 `providerPin` 并落到「置顶」分组。EyPc 置顶回写只保留 Codex 原生与 CodexHost；Cloud Code（Claude App）与 Cursor 由插件本地维护，应用内置顶仍入站。会话归档状态仍走既有 Claude `isArchived` / Cursor `composerHeaders` 写。2026-09-04 用户收口：Cursor sqlite 写通不等于侧栏已置顶。同日补充（RAW-205#5）：置顶策略由 manifest `pin` 块单点声明并接口化；Codex / CodexHost 入站实时（全局状态镜像变化、Host 记录写入触发重扫）；应用内已置顶的 Claude / Cursor 任务可在 EyPc 叠加本地置顶。
