---
id: eypc-req-claude-raw-198
qualified_source: SPEC-260901-CLAUDE-HOST-THREAD-AUTHORITY::RAW-198
status: proposed
domain: companion-claude
authority: agent-transcribed
source_annotations: "implementation-landed / focused-automated-verified / pending-user-confirmation"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-190
    scope: "把「Host 是额外进程的终态权威」推论到 Claude 侧：会话绑定 Host 线程期间原生 claude 行退场，由 Host 单一发言"
---

# RAW-198 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/claude-host-thread-authority/raw-requirement.md#L26)。该任务标注 `agent-initiated / pending-user-confirmation`，用户从未确认其转述忠实于本意，因此状态为 `proposed`。

由 CodexHost 拉起的 Claude Code 会话以 harness 环境的 `CODEXHOST_THREAD_ID` 建立身份；Host roster 持有该线程期间原生 claude 行退场，不被元数据 upsert 复活，roster 消失后自动回来。
