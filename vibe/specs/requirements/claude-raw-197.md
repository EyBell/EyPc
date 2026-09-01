---
id: eypc-req-claude-raw-197
qualified_source: SPEC-260901-CLAUDE-HOST-THREAD-AUTHORITY::RAW-197
status: proposed
domain: companion-claude
authority: agent-transcribed
source_annotations: "implementation-landed / focused-automated-verified / pending-user-confirmation"
scoped_relations:
  - kind: refines
    target: eypc-req-claude-raw-174-clause-092
    scope: "把「精确 interrupted 进入 stopped」从 Claude App 通道补到 CLI 通道：Esc 中断不触发 Hook，改由转录尾巴作证"
---

# RAW-197 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260901/claude-host-thread-authority/raw-requirement.md#L16)。该任务标注 `agent-initiated / pending-user-confirmation`，用户从未确认其转述忠实于本意，因此状态为 `proposed`。

Claude Code CLI 的 Esc 中断不触发任何 Hook；EyPc 必须从会话转录尾巴的 `[Request interrupted by user]` 识别该轮次已中断，立即进入「待继续」，不等下一次提问。
